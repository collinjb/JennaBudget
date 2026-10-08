import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Chip, ChipRow } from '../components/Chip';
import { announce } from '../components/announce';
import { DateInput, DayPairField, DayPicker, isUsableDate } from '../components/DateInput';
import { semimonthlyDaysError } from '../lib/schedule';
import { TextField, cleanName } from '../components/Field';
import { IconChevronLeft, IconClose } from '../components/Icons';
import { MoneyInput, checkMoney } from '../components/MoneyInput';
import { RateInput } from '../components/RateInput';
import { ChoiceList } from '../components/Select';
import { dateInMonth, isoParts } from '../lib/dates';
import { makeExampleBudget } from '../lib/exampleData';
import { FREQUENCY_LABELS } from '../lib/frequency';
import { newId } from '../lib/ids';
import { parseRate } from '../lib/money';
import { BILL_PRESETS, DEBT_PRESETS, DEBT_TYPE_INFO, GOAL_PRESETS, SPENDING_PRESETS } from '../lib/presets';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type BudgetData,
  type DebtType,
  type IncomeFrequency,
  type SpendingCategory,
} from '../types';
import { useRestoreBackup } from './useRestore';

type Errors = Record<string, string | null>;

interface BillRow {
  key: string;
  name: string;
  emoji: string;
  custom: boolean;
  amount: string;
  dueDay: number;
}

interface DebtRow {
  key: string;
  name: string;
  type: DebtType;
  custom: boolean;
  balance: string;
  rate: string;
  min: string;
  dueDay: number;
}

interface WantRow {
  key: string;
  kind: 'spending' | 'goal';
  name: string;
  emoji: string;
  spendingKind: SpendingCategory['kind'];
  isEF: boolean;
  amount: string;
  /** Goals only: optional monthly amount to put toward it. */
  monthly: string;
}

const FREQ_HINTS: Record<IncomeFrequency, string> = {
  weekly: 'Same day every week',
  biweekly: 'Like every other Friday',
  semimonthly: 'Like the 1st and the 15th',
  monthly: 'Same date every month',
};
const FREQ_CHOICES = (Object.keys(FREQ_HINTS) as IncomeFrequency[]).map((value) => ({
  value,
  label: FREQUENCY_LABELS[value],
  hint: FREQ_HINTS[value],
}));

const STEPS = 4;
/** Taps on Next/Skip/Back right after a step changes are ignored (a double tap must not skip a step). */
const STEP_SETTLE_MS = 350;

let rowCounter = 0;
const rowKey = () => `r${++rowCounter}`;

export function Onboarding() {
  const { data, actions } = useBudget();
  const today = useToday();
  const restore = useRestoreBackup();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});

  // Step 1
  const [pay, setPay] = useState('');
  const [freq, setFreq] = useState<IncomeFrequency>('biweekly');
  const [payDate, setPayDate] = useState<string>(today);
  const [days, setDays] = useState<[number, number]>([1, 15]);
  // Step 2-4
  const [bills, setBills] = useState<BillRow[]>([]);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [wants, setWants] = useState<WantRow[]>([]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (step > 0) headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Double-tap guard: for a moment after a step change the step buttons are "busy" (aria-disabled, taps ignored).
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  const goStep = (n: number) => {
    setStep(n);
    setSettling(true);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setSettling(false), STEP_SETTLE_MS);
  };

  const setErr = (k: string, v: string | null) => setErrors((e) => ({ ...e, [k]: v }));

  // ---------- validation per step ----------
  const validate = (s: number): boolean => {
    const next: Errors = {};
    if (s === 1) {
      if (pay.trim() === '') next.pay = 'Please enter your take-home pay, or tap Skip.';
      else {
        const r = checkMoney(pay, { required: true, allowZero: false });
        if (r.error) next.pay = r.error;
      }
      if (freq !== 'semimonthly' && !isUsableDate(payDate)) next.payDate = 'Please pick your next payday.';
      if (freq === 'semimonthly') next.days = semimonthlyDaysError(days);
    }
    if (s === 2) {
      for (const b of bills) {
        // Same rule as the bill form: a bill needs an amount above $0.
        const r = checkMoney(b.amount, { required: true, allowZero: false });
        if (r.error) next[`bill-${b.key}`] = r.error;
      }
    }
    if (s === 3) {
      for (const d of debts) {
        const b = checkMoney(d.balance, { required: true });
        if (b.error) next[`debt-bal-${d.key}`] = b.error;
        const m = checkMoney(d.min, { required: true });
        if (m.error) next[`debt-min-${d.key}`] = m.error;
        if (d.rate.trim() !== '') {
          const r = parseRate(d.rate);
          if (!r.ok) next[`debt-rate-${d.key}`] = r.error;
        }
      }
    }
    if (s === 4) {
      for (const w of wants) {
        const r = checkMoney(w.amount, { required: true, allowZero: w.kind === 'spending' });
        if (r.error) next[`want-${w.key}`] = r.error;
        if (w.kind === 'goal') {
          const m = checkMoney(w.monthly);
          if (m.error) next[`want-m-${w.key}`] = m.error;
        }
      }
    }
    setErrors(next);
    const problems = Object.values(next).filter(Boolean).length;
    if (problems > 0) {
      // Focus the first problem (its message is read with it) and say once that something needs a fix.
      window.setTimeout(() => {
        const el = scrollRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        el?.focus();
        el?.closest('.field, .field-group')?.scrollIntoView({ block: 'center' });
        announce(problems > 1 ? `${problems} fields need a fix.` : 'Please check the highlighted field.');
      }, 0);
    }
    return problems === 0;
  };

  // ---------- finish ----------
  const finish = (opts: { skipIncome?: boolean; skipBills?: boolean; skipDebts?: boolean; skipWants?: boolean } = {}) => {
    const { year, month } = isoParts(today);
    const out: BudgetData = {
      schemaVersion: SCHEMA_VERSION,
      incomes: [],
      bills: [],
      debts: [],
      spending: [],
      goals: [],
      settings: { ...DEFAULT_SETTINGS, theme: data.settings.theme, onboarded: true },
    };
    const payCents = checkMoney(pay, { required: true, allowZero: false }).cents;
    if (!opts.skipIncome && payCents) {
      const sorted: [number, number] = days[0] < days[1] ? [days[0], days[1]] : [days[1], days[0]];
      out.incomes.push({
        id: newId(),
        name: 'Paycheck',
        amount: payCents,
        frequency: freq,
        payDate: isUsableDate(payDate) ? payDate : today,
        semimonthlyDays: sorted,
      });
    }
    if (!opts.skipBills) {
      for (const b of bills) {
        const c = checkMoney(b.amount, { required: true, allowZero: false }).cents;
        if (c === null) continue;
        out.bills.push({
          id: newId(),
          name: cleanName(b.name, 'Bill'),
          emoji: b.emoji,
          amount: c,
          frequency: 'monthly',
          dueDay: b.dueDay,
          dueDate: dateInMonth(year, month, b.dueDay),
          paidMonth: null,
        });
      }
    }
    if (!opts.skipDebts) {
      for (const d of debts) {
        const bal = checkMoney(d.balance, { required: true }).cents;
        const min = checkMoney(d.min, { required: true }).cents;
        const r = d.rate.trim() === '' ? { ok: true as const, bps: 0 } : parseRate(d.rate);
        if (bal === null || min === null || !r.ok) continue;
        out.debts.push({
          id: newId(),
          name: cleanName(d.name, DEBT_TYPE_INFO[d.type].label),
          type: d.type,
          balance: bal,
          rateBps: r.bps,
          minPayment: min,
          dueDay: d.dueDay,
        });
      }
    }
    if (!opts.skipWants) {
      for (const w of wants) {
        const c = checkMoney(w.amount, { required: true, allowZero: w.kind === 'spending' }).cents;
        if (c === null) continue;
        if (w.kind === 'spending') {
          out.spending.push({ id: newId(), name: cleanName(w.name, 'Spending'), emoji: w.emoji, monthly: c, kind: w.spendingKind });
        } else {
          out.goals.push({
            id: newId(),
            name: cleanName(w.name, 'Savings goal'),
            emoji: w.emoji,
            target: c,
            saved: 0,
            monthly: checkMoney(w.monthly).cents ?? 0,
            targetDate: null,
            isEmergencyFund: w.isEF && !out.goals.some((g) => g.isEmergencyFund),
          });
        }
      }
    }
    actions.replaceAll(out);
  };

  const next = () => {
    if (settling || !validate(step)) return;
    if (step === STEPS) finish();
    else goStep(step + 1);
  };

  const skip = () => {
    if (settling) return;
    setErrors({});
    if (step === 1) setPay('');
    if (step === 2) setBills([]);
    if (step === 3) setDebts([]);
    if (step === 4) {
      finish({ skipWants: true });
      return;
    }
    goStep(step + 1);
  };

  const backStep = () => {
    if (!settling) goStep(step - 1);
  };

  const lookAround = () => {
    const example = makeExampleBudget(today);
    actions.replaceAll({ ...example, settings: { ...example.settings, theme: data.settings.theme } });
  };

  // ---------- rows ----------
  const toggleBill = (name: string, emoji: string) => {
    const existing = bills.find((b) => !b.custom && b.name === name);
    if (existing) setBills(bills.filter((b) => b !== existing));
    else setBills([...bills, { key: rowKey(), name, emoji, custom: false, amount: '', dueDay: 1 }]);
  };
  const toggleDebt = (name: string, type: DebtType) => {
    const existing = debts.find((d) => !d.custom && d.name === name);
    if (existing) setDebts(debts.filter((d) => d !== existing));
    else setDebts([...debts, { key: rowKey(), name, type, custom: false, balance: '', rate: '', min: '', dueDay: 1 }]);
  };
  const toggleWant = (w: Omit<WantRow, 'key' | 'amount' | 'monthly'>) => {
    const existing = wants.find((x) => x.name === w.name && x.kind === w.kind);
    if (existing) setWants(wants.filter((x) => x !== existing));
    else setWants([...wants, { ...w, key: rowKey(), amount: '', monthly: '' }]);
  };

  if (step === 0) {
    return (
      <main className="app onb onb--welcome">
        <div className="onb__scroll" ref={scrollRef}>
          <div className="onb__welcome">
            {/* The same icon as on the home screen, so the app feels like one thing. */}
            <img
              className="onb__logo"
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              width={104}
              height={104}
              decoding="async"
            />
            <h1 className="onb__title onb__title--center">Welcome to Budget</h1>
            <p className="onb__lead onb__lead--center">
              See where your money goes and how much is left, all in one simple place. Everything stays on your phone.
            </p>
            <ul className="onb__perks" role="list">
              <li>
                <span aria-hidden="true">💵</span> Add your pay
              </li>
              <li>
                <span aria-hidden="true">🧾</span> List your bills
              </li>
              <li>
                <span aria-hidden="true">✨</span> See what's left over
              </li>
            </ul>
          </div>
        </div>
        <div className="onb__footer">
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => goStep(1)}>
            Let's get started
          </button>
          <button type="button" className="btn btn--plain btn--block" onClick={lookAround}>
            Just let me look around with example numbers
          </button>
          <button type="button" className="btn btn--plain btn--block onb__restore" onClick={restore.pick}>
            I have a backup file
          </button>
          {restore.input}
        </div>
      </main>
    );
  }

  const titles: Record<number, string> = {
    1: 'How much do you take home, and how often?',
    2: 'What bills do you pay every month?',
    3: 'Do you have any debt?',
    4: 'What do you want money for?',
  };
  const leads: Record<number, string> = {
    1: 'Just one paycheck is fine. You can add more later.',
    2: 'Tap the ones you have, then fill in the amounts. You can add more later.',
    3: 'Things like student loans, credit cards, or a car loan.',
    4: 'Pick a few. Spending money is for each month. Goals are things you save up for.',
  };

  return (
    <main className="app onb">
      <div className="onb__top">
        <button type="button" className="back-btn" onClick={backStep} aria-disabled={settling || undefined}>
          <IconChevronLeft size={22} />
          <span>Back</span>
        </button>
        <div className="onb__dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={`onb__dot${i + 1 === step ? ' is-current' : i + 1 < step ? ' is-done' : ''}`} />
          ))}
        </div>
        <button type="button" className="onb__skip" onClick={skip} aria-disabled={settling || undefined}>
          Skip
        </button>
      </div>

      <div className="onb__scroll" ref={scrollRef}>
        <div className="onb__body">
          <p className="onb__step">
            Step {step} of {STEPS}
          </p>
          <h1 className="onb__title" tabIndex={-1} ref={headingRef}>
            {titles[step]}
          </h1>
          <p className="onb__lead">{leads[step]}</p>

          {step === 1 && (
            <div className="form">
              <MoneyInput
                label="Take-home pay (one paycheck)"
                value={pay}
                onChange={(v) => {
                  setPay(v);
                  setErr('pay', null);
                }}
                error={errors.pay}
                big
                helper="What actually hits your bank account, after taxes"
              />
              <ChoiceList label="How often do you get paid?" value={freq} options={FREQ_CHOICES} onChange={setFreq} />
              {freq === 'semimonthly' ? (
                <DayPairField
                  days={days}
                  error={errors.days}
                  onChange={(d) => {
                    setDays(d);
                    setErr('days', null);
                  }}
                />
              ) : (
                <DateInput
                  label="When is your next payday?"
                  value={payDate}
                  onChange={(v) => {
                    setPayDate(v);
                    setErr('payDate', null);
                  }}
                  error={errors.payDate}
                  helper={freq === 'monthly' ? 'You get paid on this day every month.' : 'Any upcoming payday works.'}
                />
              )}
            </div>
          )}

          {step === 2 && (
            <div className="form">
              <ChipRow label="Common bills">
                {BILL_PRESETS.map((p) => (
                  <Chip
                    key={p.name}
                    emoji={p.emoji}
                    label={p.name}
                    selected={bills.some((b) => !b.custom && b.name === p.name)}
                    onClick={() => toggleBill(p.name, p.emoji)}
                  />
                ))}
                <Chip
                  label="Something else"
                  adds
                  onClick={() =>
                    setBills([...bills, { key: rowKey(), name: '', emoji: '🧾', custom: true, amount: '', dueDay: 1 }])
                  }
                />
              </ChipRow>
              {bills.map((b) => (
                <RowCard key={b.key} legend={b.custom ? b.name || 'New bill' : b.name}>
                  <RowHead
                    emoji={b.emoji}
                    name={b.custom ? null : b.name}
                    onRemove={() => setBills(bills.filter((x) => x.key !== b.key))}
                    removeLabel={`Remove ${b.name || 'this bill'}`}
                  />
                  {b.custom && (
                    <TextField
                      label="Bill name"
                      value={b.name}
                      onChange={(v) => setBills(bills.map((x) => (x.key === b.key ? { ...x, name: v } : x)))}
                      placeholder="Like Water"
                    />
                  )}
                  <div className="field-row field-row--top">
                    <MoneyInput
                      label="Amount"
                      value={b.amount}
                      onChange={(v) => {
                        setBills(bills.map((x) => (x.key === b.key ? { ...x, amount: v } : x)));
                        setErr(`bill-${b.key}`, null);
                      }}
                      error={errors[`bill-${b.key}`]}
                    />
                    <DayPicker
                      label="Due on"
                      lastDayLabel="last day"
                      value={b.dueDay}
                      onChange={(d) => setBills(bills.map((x) => (x.key === b.key ? { ...x, dueDay: d } : x)))}
                    />
                  </div>
                </RowCard>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="form">
              <ChipRow label="Common debts">
                {DEBT_PRESETS.map((p) => (
                  <Chip
                    key={p.name}
                    emoji={DEBT_TYPE_INFO[p.type].emoji}
                    label={p.name}
                    selected={debts.some((d) => !d.custom && d.name === p.name)}
                    onClick={() => toggleDebt(p.name, p.type)}
                  />
                ))}
                <Chip
                  label="Something else"
                  adds
                  onClick={() =>
                    setDebts([
                      ...debts,
                      { key: rowKey(), name: '', type: 'other', custom: true, balance: '', rate: '', min: '', dueDay: 1 },
                    ])
                  }
                />
              </ChipRow>
              {debts.length === 0 && (
                <button
                  type="button"
                  className="btn btn--secondary btn--block btn--lg"
                  aria-disabled={settling || undefined}
                  onClick={() => {
                    if (settling) return;
                    setDebts([]);
                    setErrors({});
                    goStep(4);
                  }}
                >
                  No debt<span aria-hidden="true"> 🎉</span>
                </button>
              )}
              {debts.map((d) => (
                <RowCard key={d.key} legend={d.custom ? d.name || 'New debt' : d.name}>
                  <RowHead
                    emoji={DEBT_TYPE_INFO[d.type].emoji}
                    name={d.custom ? null : d.name}
                    onRemove={() => setDebts(debts.filter((x) => x.key !== d.key))}
                    removeLabel={`Remove ${d.name || 'this debt'}`}
                  />
                  {d.custom && (
                    <TextField
                      label="What is it?"
                      value={d.name}
                      onChange={(v) => setDebts(debts.map((x) => (x.key === d.key ? { ...x, name: v } : x)))}
                      placeholder="Like Hospital bill"
                    />
                  )}
                  <MoneyInput
                    label="How much do you owe?"
                    value={d.balance}
                    onChange={(v) => {
                      setDebts(debts.map((x) => (x.key === d.key ? { ...x, balance: v } : x)));
                      setErr(`debt-bal-${d.key}`, null);
                    }}
                    error={errors[`debt-bal-${d.key}`]}
                  />
                  <div className="field-row field-row--top">
                    <RateInput
                      label="Interest rate"
                      value={d.rate}
                      onChange={(v) => {
                        setDebts(debts.map((x) => (x.key === d.key ? { ...x, rate: v } : x)));
                        setErr(`debt-rate-${d.key}`, null);
                      }}
                      error={errors[`debt-rate-${d.key}`]}
                      helper="The APR % on your statement"
                    />
                    <MoneyInput
                      label="Minimum payment"
                      value={d.min}
                      onChange={(v) => {
                        setDebts(debts.map((x) => (x.key === d.key ? { ...x, min: v } : x)));
                        setErr(`debt-min-${d.key}`, null);
                      }}
                      error={errors[`debt-min-${d.key}`]}
                      helper="Each month"
                    />
                  </div>
                  <DayPicker
                    label="Payment due on"
                    value={d.dueDay}
                    onChange={(n) => setDebts(debts.map((x) => (x.key === d.key ? { ...x, dueDay: n } : x)))}
                  />
                </RowCard>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="form">
              <ChipRow label="Spending money and goals">
                {SPENDING_PRESETS.map((p) => (
                  <Chip
                    key={p.name}
                    emoji={p.emoji}
                    label={p.name}
                    selected={wants.some((w) => w.kind === 'spending' && w.name === p.name)}
                    onClick={() =>
                      toggleWant({ kind: 'spending', name: p.name, emoji: p.emoji, spendingKind: p.kind, isEF: false })
                    }
                  />
                ))}
                {GOAL_PRESETS.map((p) => (
                  <Chip
                    key={p.name}
                    emoji={p.emoji}
                    label={p.name}
                    selected={wants.some((w) => w.kind === 'goal' && w.name === p.name)}
                    onClick={() =>
                      toggleWant({ kind: 'goal', name: p.name, emoji: p.emoji, spendingKind: 'fun', isEF: p.isEmergencyFund })
                    }
                  />
                ))}
              </ChipRow>
              {wants.map((w) => (
                <RowCard key={w.key} legend={w.name}>
                  <RowHead
                    emoji={w.emoji}
                    name={w.name}
                    tag={w.kind === 'goal' ? 'Savings goal' : w.spendingKind === 'need' ? 'Must-have' : 'Nice-to-have'}
                    onRemove={() => setWants(wants.filter((x) => x.key !== w.key))}
                    removeLabel={`Remove ${w.name}`}
                  />
                  <MoneyInput
                    label={w.kind === 'goal' ? 'How much do you want to save?' : 'How much each month?'}
                    value={w.amount}
                    onChange={(v) => {
                      setWants(wants.map((x) => (x.key === w.key ? { ...x, amount: v } : x)));
                      setErr(`want-${w.key}`, null);
                    }}
                    error={errors[`want-${w.key}`]}
                  />
                  {w.kind === 'goal' && (
                    <MoneyInput
                      label="How much can you put in each month?"
                      value={w.monthly}
                      onChange={(v) => {
                        setWants(wants.map((x) => (x.key === w.key ? { ...x, monthly: v } : x)));
                        setErr(`want-m-${w.key}`, null);
                      }}
                      error={errors[`want-m-${w.key}`]}
                      helper="Optional. Not sure? Leave it blank and the Smart Plan will suggest an amount."
                    />
                  )}
                </RowCard>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="onb__footer">
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          onClick={next}
          aria-disabled={settling || undefined}
        >
          {step === STEPS ? 'Finish' : 'Next'}
        </button>
      </div>
    </main>
  );
}

/**
 * One item's card (a bill, debt, or goal). A fieldset named after the item, so "Amount" and "Due on" are heard as
 * "Rent, Amount" rather than a list of identical labels.
 */
function RowCard({ legend, children }: { legend: string; children: ReactNode }) {
  const id = useId();
  return (
    <fieldset className="onb-row card" aria-labelledby={id}>
      <legend className="sr-only" id={id}>
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function RowHead({
  emoji,
  name,
  tag,
  onRemove,
  removeLabel,
}: {
  emoji: string;
  name: string | null;
  tag?: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="onb-row__head">
      <span className="row__icon" aria-hidden="true">
        {emoji}
      </span>
      <span className="onb-row__name">
        <span className="ellipsis">{name ?? 'New item'}</span>
        {tag && <span className="badge onb-row__tag">{tag}</span>}
      </span>
      <button type="button" className="onb-row__remove" aria-label={removeLabel} onClick={onRemove}>
        <IconClose size={18} />
      </button>
    </div>
  );
}
