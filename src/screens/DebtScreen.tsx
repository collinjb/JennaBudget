import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Card } from '../components/Card';
import { Celebration } from '../components/Celebration';
import { LineChart } from '../components/Charts';
import { Chip, ChipRow } from '../components/Chip';
import { DayPicker } from '../components/DateInput';
import { EmptyState } from '../components/EmptyState';
import { cleanName, TextField } from '../components/Field';
import { IconWarning } from '../components/Icons';
import { Money } from '../components/Money';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { PageHeader } from '../components/PageHeader';
import { RateInput, useRateField } from '../components/RateInput';
import { SegmentedControl, Select } from '../components/Select';
import { useToast } from '../components/Toast';
import { formatDuration, formatMonth, monthKey, ordinal } from '../lib/dates';
import { compareExtra, interestWarnings, simulatePayoff } from '../lib/debt';
import { newId } from '../lib/ids';
import { formatMoney, formatRate } from '../lib/money';
import { DEBT_PRESETS, DEBT_TYPE_INFO } from '../lib/presets';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Debt, DebtType, PayoffMethod } from '../types';
import { useNav } from './nav';
import { useDeleteWithUndo } from './shared';

const SLIDER_MAX_DOLLARS = 1000;

export const METHOD_INFO: Record<PayoffMethod, { label: string; text: string }> = {
  avalanche: {
    label: 'Save the most money',
    text: 'Pays off the highest interest rate first. You pay the least interest overall.',
  },
  snowball: {
    label: 'Quick wins',
    text: 'Pays off the smallest balance first. You knock out whole debts sooner, which feels great.',
  },
};

type SheetState = { kind: 'edit'; debt: Debt | null } | { kind: 'balance'; debt: Debt };

export function DebtScreen() {
  const { data, actions } = useBudget();
  const today = useToday();
  const nav = useNav();
  const toast = useToast();
  const month = monthKey(today);
  const [sheet, setSheet] = useState<SheetState | null>(() =>
    nav.intent === 'add' ? { kind: 'edit', debt: null } : null,
  );
  const [celebrate, setCelebrate] = useState<string | null>(null);

  const debts = data.debts;
  const active = useMemo(() => debts.filter((d) => d.balance > 0), [debts]);
  const method = data.settings.payoffMethod;
  const planned = data.settings.extraDebtPayment;
  // null = not moved yet: shows exactly what the budget pays now.
  const [touchedDollars, setSliderDollars] = useState<number | null>(null);
  const sliderDollars = touchedDollars ?? Math.round(planned / 1000) * 10;
  const slider = touchedDollars === null ? planned : touchedDollars * 100;
  const sliderMax = Math.max(SLIDER_MAX_DOLLARS, Math.ceil(planned / 1000) * 10);

  const base = useMemo(
    () => (active.length ? simulatePayoff(active, { method, extra: planned, startMonth: month }) : null),
    [active, method, planned, month],
  );
  const cmp = useMemo(
    () => (active.length ? compareExtra(active, method, planned, slider, month) : null),
    [active, method, planned, slider, month],
  );
  const warnings = useMemo(() => interestWarnings(active), [active]);
  const totalDebt = useMemo(() => debts.reduce((a, d) => a + d.balance, 0), [debts]);
  const sliderId = useId();

  const applyExtra = () => {
    const prev = planned;
    actions.updateSettings({ extraDebtPayment: slider });
    setSliderDollars(null);
    toast.show({
      message: slider > 0 ? `Paying ${formatMoney(slider)} extra each month` : 'Extra payment removed',
      actionLabel: 'Undo',
      onAction: () => {
        actions.updateSettings({ extraDebtPayment: prev });
        setSliderDollars(null);
      },
    });
  };

  return (
    <div className="content stack">
      <PageHeader
        title="Debt"
        subtitle="What you owe, and when you'll be free of it."
        onAdd={debts.length > 0 ? () => setSheet({ kind: 'edit', debt: null }) : undefined}
        addLabel="Add a debt"
      />

      {debts.length === 0 ? (
        <EmptyState
          emoji="🎉"
          text="No debt? Wonderful! If you do owe money, add it to see your debt-free date."
          buttonLabel="Add a debt"
          onClick={() => setSheet({ kind: 'edit', debt: null })}
        />
      ) : (
        <>
          {/* Summary */}
          <Card className="debt-summary">
            {active.length === 0 ? (
              <>
                <p className="bignum__label">Debt-free</p>
                <p className="debt-summary__date tone-savings" data-testid="debt-free-date">
                  You're debt-free! 🎉
                </p>
              </>
            ) : base && base.months !== null && base.debtFreeMonth ? (
              <>
                <p className="bignum__label">Debt-free by</p>
                <p className="debt-summary__date" data-testid="debt-free-date">
                  {formatMonth(base.debtFreeMonth)}
                </p>
                <p className="muted small">That's {formatDuration(base.months)} from now, at this pace.</p>
              </>
            ) : (
              <>
                <p className="bignum__label">Time until you're debt-free</p>
                <p className="debt-summary__date tone-over" data-testid="debt-free-date">
                  More than 50 years
                </p>
                <p className="muted small">
                  At this pace your debt won't be paid off. Paying a little extra each month can change that.
                </p>
              </>
            )}
            <dl className="stat-grid">
              <div className="stat">
                <dt>Total debt</dt>
                <dd>
                  <Money cents={totalDebt} testId="debt-total" />
                </dd>
              </div>
              {base && base.months !== null && (
                <div className="stat">
                  <dt>Total interest at this pace</dt>
                  <dd>
                    <Money cents={base.totalInterest} />
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {warnings.map((w) => (
            <p key={w.debtId} className="notice notice--warn" role="note">
              <IconWarning size={18} />
              <span>
                <strong>{w.name}:</strong> Your <Money cents={w.minPayment} /> payment doesn't cover the{' '}
                <Money cents={w.monthlyInterest} /> of interest each month, so this balance will keep growing.
                {base && base.months !== null && ' Your plan still pays it off later, once extra money goes to it.'}
              </span>
            </p>
          ))}

          {/* Debts */}
          <h2 className="section-title">Your debts</h2>
          <ul className="stack stack--sm">
            {debts.map((d) => {
              const info = DEBT_TYPE_INFO[d.type];
              const paidOff = d.balance === 0;
              return (
                <li key={d.id} className="card debt-card">
                  <div className="debt-card__top">
                    <span className="row__icon" aria-hidden="true">
                      {info.emoji}
                    </span>
                    <div className="debt-card__main">
                      <h3 className="debt-card__name">{d.name}</h3>
                      {d.name.trim().toLowerCase() !== info.label.toLowerCase() && (
                        <p className="debt-card__type">{info.label}</p>
                      )}
                    </div>
                    <div className="debt-card__bal">
                      {paidOff ? (
                        <span className="badge badge--paid">Paid off 🎉</span>
                      ) : (
                        <>
                          <Money cents={d.balance} className="debt-card__amount" />
                          <span className="row__amount-sub">left to pay</span>
                        </>
                      )}
                    </div>
                  </div>
                  {!paidOff && (
                    <p className="debt-card__facts">
                      <span>{formatRate(d.rateBps)} interest</span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        <Money cents={d.minPayment} /> minimum
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>due the {ordinal(d.dueDay)}</span>
                    </p>
                  )}
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      aria-label={`Update balance for ${d.name}`}
                      onClick={() => setSheet({ kind: 'balance', debt: d })}
                    >
                      Update balance
                    </button>
                    <button
                      type="button"
                      className="btn btn--gray btn--sm"
                      aria-label={`Edit ${d.name}`}
                      onClick={() => setSheet({ kind: 'edit', debt: d })}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {active.length > 0 && cmp && base && (
            <>
              {/* What if I paid extra? */}
              <Card title="Pay it off faster" className="extra-card">
                <label htmlFor={sliderId} className="extra-card__q">
                  What if I paid <strong className="extra-card__val">{formatMoney(slider)}</strong> extra each month?
                </label>
                <input
                  id={sliderId}
                  className="slider"
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={10}
                  value={sliderDollars}
                  aria-valuetext={`${formatMoney(slider)} extra each month`}
                  onChange={(e) => setSliderDollars(Number(e.target.value))}
                  style={{ '--fill': `${(sliderDollars / sliderMax) * 100}%` } as CSSProperties}
                />
                <div className="slider__ends" aria-hidden="true">
                  <span>$0</span>
                  <span>{formatMoney(sliderMax * 100)}</span>
                </div>
                <p className="extra-card__result" aria-live="polite">
                  <ExtraResult planned={planned} slider={slider} cmp={cmp} />
                </p>
                {slider !== planned && (
                  <button type="button" className="btn btn--primary btn--block" onClick={applyExtra}>
                    {slider > 0 ? `Add ${formatMoney(slider)} extra to my budget` : 'Stop paying extra'}
                  </button>
                )}
                <p className="muted small extra-card__note">
                  {planned > 0 ? (
                    <>
                      Your budget pays <Money cents={planned} /> extra now. Extra payments come out of your Left Over.
                    </>
                  ) : (
                    'Extra payments come out of your Left Over money.'
                  )}
                </p>
              </Card>

              {/* Which debt first? */}
              <Card title="Which debt first?">
                <SegmentedControl
                  label="Payoff method"
                  hideLabel
                  value={method}
                  onChange={(m) => actions.updateSettings({ payoffMethod: m })}
                  options={[
                    { value: 'avalanche', label: METHOD_INFO.avalanche.label },
                    { value: 'snowball', label: METHOD_INFO.snowball.label },
                  ]}
                  helper={METHOD_INFO[method].text}
                />
                {/* Listed in the order they finish (a small debt can finish early on its minimum alone). */}
                <h3 className="order-title">When each debt is paid off</h3>
                <ol className="order-list">
                  {base.perDebt.map((p, i) => {
                    const d = active.find((x) => x.id === p.id);
                    return (
                      <li key={p.id} className="order-row">
                        <span className="order-row__n" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className="order-row__name ellipsis">
                          <span aria-hidden="true">{d ? DEBT_TYPE_INFO[d.type].emoji : '📄'} </span>
                          {p.name}
                        </span>
                        <span className="order-row__when">
                          {p.payoffMonth ? `Paid off ${formatMonth(p.payoffMonth, 'short')}` : 'Not in 50 years'}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Card>

              {/* Chart (only when it actually comes down: 50 years of a growing balance is just a scary number) */}
              <Card title="Your debt over time">
                {base.months === null ? (
                  <p className="muted small">
                    At this pace your debt grows instead of shrinking, so there's no payoff line to show yet. Try the
                    &ldquo;Pay it off faster&rdquo; slider above to see what a little extra each month does.
                  </p>
                ) : (
                  <LineChart
                    values={base.timeline}
                    tone="debt"
                    formatTop={(max) => formatMoney(max, { showCents: 'never' })}
                    startLabel="Now"
                    endLabel={base.debtFreeMonth ? formatMonth(base.debtFreeMonth, 'short') : '50+ years'}
                    ariaLabel={
                      base.debtFreeMonth
                        ? `Your total debt goes from ${formatMoney(totalDebt, { showCents: 'never' })} now down to $0 in ${formatMonth(base.debtFreeMonth)}.`
                        : `Your total debt of ${formatMoney(totalDebt, { showCents: 'never' })} doesn't reach $0 within 50 years at this pace.`
                    }
                  />
                )}
              </Card>
            </>
          )}
        </>
      )}

      {sheet?.kind === 'edit' && <DebtSheet debt={sheet.debt} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'balance' && (
        <BalanceSheet
          debt={sheet.debt}
          onClose={(paidOff) => {
            setSheet(null);
            if (paidOff) setCelebrate(sheet.debt.name);
          }}
        />
      )}
      {celebrate && (
        <Celebration title="Paid off!" message={`You paid off ${celebrate}. 🎉`} onDone={() => setCelebrate(null)} />
      )}
    </div>
  );
}

function ExtraResult({
  planned,
  slider,
  cmp,
}: {
  planned: number;
  slider: number;
  cmp: ReturnType<typeof compareExtra>;
}) {
  if (slider === planned) return <>Slide to see how paying extra changes your debt-free date.</>;
  const { base, withExtra, monthsSooner, interestSaved } = cmp;
  if (slider > planned) {
    if (base.months === null && withExtra.months !== null && withExtra.debtFreeMonth) {
      return (
        <>
          You'd be debt-free by <strong>{formatMonth(withExtra.debtFreeMonth)}</strong> instead of never.
        </>
      );
    }
    if (withExtra.months === null) return <>That's still not enough to pay it off. Try a bigger amount.</>;
    if (monthsSooner && monthsSooner > 0) {
      return (
        <>
          You'd be debt-free <strong>{monthsSooner === 1 ? '1 month' : `${monthsSooner} months`} sooner</strong>
          {interestSaved > 0 ? (
            <>
              {' '}
              and save <strong>{formatMoney(interestSaved)}</strong> in interest.
            </>
          ) : (
            '.'
          )}
        </>
      );
    }
    if (interestSaved > 0) {
      return (
        <>
          You'd save <strong>{formatMoney(interestSaved)}</strong> in interest.
        </>
      );
    }
    return <>That doesn't change your debt-free month yet. Try a bigger amount.</>;
  }
  // Less than planned
  const extraInterest = Math.max(0, withExtra.totalInterest - base.totalInterest);
  if (withExtra.months === null) return <>Without it, your debt wouldn't be paid off within 50 years.</>;
  const later = base.months !== null ? withExtra.months - base.months : 0;
  return (
    <>
      You'd be debt-free{' '}
      <strong>{later <= 0 ? 'at the same time' : later === 1 ? '1 month later' : `${later} months later`}</strong>
      {extraInterest > 0 && (
        <>
          {' '}
          and pay <strong>{formatMoney(extraInterest)}</strong> more in interest
        </>
      )}
      .
    </>
  );
}

const DEBT_TYPE_OPTIONS = (Object.keys(DEBT_TYPE_INFO) as DebtType[]).map((t) => ({
  value: t,
  label: `${DEBT_TYPE_INFO[t].emoji}  ${DEBT_TYPE_INFO[t].label}`,
}));

export function DebtSheet({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const { actions } = useBudget();
  const del = useDeleteWithUndo();
  const [name, setName] = useState(debt?.name ?? '');
  const [type, setType] = useState<DebtType>(debt?.type ?? 'credit');
  const balance = useMoneyField(debt?.balance ?? null, { required: true });
  const rate = useRateField(debt?.rateBps ?? null);
  const minPay = useMoneyField(debt?.minPayment ?? null, { required: true });
  const [dueDay, setDueDay] = useState(debt?.dueDay ?? 1);

  const save = () => {
    const b = balance.validate();
    const r = rate.validate();
    const m = minPay.validate();
    if (b === null || r === null || m === null) return false;
    actions.upsert('debts', {
      id: debt?.id ?? newId(),
      name: cleanName(name, DEBT_TYPE_INFO[type].label),
      type,
      balance: b,
      rateBps: r,
      minPayment: m,
      dueDay,
    });
    return true;
  };

  return (
    <BottomSheet
      title={debt ? 'Edit debt' : 'Add a debt'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={debt ? 'Save changes' : 'Add debt'}
      onDelete={debt ? () => del('debts', debt.id, debt.name) : undefined}
      deleteLabel="Delete this debt"
      testId="debt-sheet"
    >
      {!debt && (
        <ChipRow title="Quick pick (tap one to fill in)">
          {DEBT_PRESETS.map((p) => (
            <Chip
              key={p.name}
              emoji={DEBT_TYPE_INFO[p.type].emoji}
              label={p.name}
              selected={name === p.name}
              onClick={() => {
                setName(p.name);
                setType(p.type);
              }}
            />
          ))}
        </ChipRow>
      )}
      <TextField label="Name" value={name} onChange={setName} placeholder="Like Visa card" />
      <Select label="What kind?" value={type} options={DEBT_TYPE_OPTIONS} onChange={setType} />
      <MoneyInput label="How much do you owe now?" {...balance.props} big helper="The current balance on your statement." />
      <RateInput label="Interest rate" {...rate.props} helper="The APR % on your statement. Use 0 if there's no interest." />
      <MoneyInput label="Minimum monthly payment" {...minPay.props} />
      <DayPicker label="Payment due on" value={dueDay} onChange={setDueDay} />
    </BottomSheet>
  );
}

function BalanceSheet({ debt, onClose }: { debt: Debt; onClose: (paidOff: boolean) => void }) {
  const { actions } = useBudget();
  const balance = useMoneyField(debt.balance, { required: true });
  const paidOff = useRef(false);
  const save = () => {
    const b = balance.validate();
    if (b === null) return false;
    paidOff.current = debt.balance > 0 && b === 0;
    actions.upsert('debts', { ...debt, balance: b });
    return true;
  };
  return (
    <BottomSheet
      title="Update balance"
      onClose={() => onClose(paidOff.current)}
      onSave={save}
      bigSaveLabel="Update balance"
      testId="balance-sheet"
    >
      <p className="sheet__intro">
        Check your latest statement for <strong>{debt.name}</strong> and enter what you owe now.
      </p>
      <MoneyInput label="Current balance" {...balance.props} big />
    </BottomSheet>
  );
}
