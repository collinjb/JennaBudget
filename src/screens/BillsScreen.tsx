import { useMemo, useState } from 'react';
import { BigNumber } from '../components/BigNumber';
import { BottomSheet } from '../components/BottomSheet';
import { Card } from '../components/Card';
import { Checkbox } from '../components/Checkbox';
import { Chip, ChipRow } from '../components/Chip';
import { DateInput, DayPicker, isUsableDate } from '../components/DateInput';
import { EmojiPicker } from '../components/EmojiPicker';
import { EmptyState } from '../components/EmptyState';
import { cleanName, TextField } from '../components/Field';
import { Money } from '../components/Money';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { PageHeader } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { Select } from '../components/Select';
import { addDays, dateInMonth, formatDate, formatMonth, isoParts, monthKey } from '../lib/dates';
import { billMonthly, FREQUENCY_SUFFIX, isApproxMonthly, toMonthly } from '../lib/frequency';
import { newId } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { BILL_PRESETS } from '../lib/presets';
import { billDueDates } from '../lib/schedule';
import { billsForMonth, type BillMonthStatus } from '../lib/summary';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Bill, BillFrequency, ISODate } from '../types';
import { useNav } from './nav';
import { freqText, frequencyOptions, plural, useDeleteWithUndo } from './shared';

export const BILL_FREQUENCIES: BillFrequency[] = ['monthly', 'weekly', 'biweekly', 'quarterly', 'yearly'];
export const BILL_FREQ_OPTIONS = frequencyOptions(BILL_FREQUENCIES);

export function BillsScreen() {
  const { data, actions } = useBudget();
  const today = useToday();
  const nav = useNav();
  const month = monthKey(today);
  const [sheet, setSheet] = useState<{ bill: Bill | null } | null>(() => (nav.intent === 'add' ? { bill: null } : null));

  const bm = useMemo(() => billsForMonth(data, month), [data, month]);
  const total = useMemo(() => data.bills.reduce((a, b) => a + billMonthly(b), 0), [data.bills]);
  const anyApprox = data.bills.some((b) => isApproxMonthly(b.frequency));
  const due = bm.items.filter((i) => i.dueThisMonth);
  const notDue = bm.items.filter((i) => !i.dueThisMonth);

  const progressText =
    bm.dueCount === 0
      ? 'No bills are due this month.'
      : bm.paidCount === bm.dueCount
        ? `All ${plural(bm.dueCount, 'bill')} paid this month`
        : `${bm.paidCount} of ${plural(bm.dueCount, 'bill')} paid · ${formatMoney(bm.leftToPay)} to go`;

  return (
    <div className="content stack">
      <PageHeader
        title="Bills"
        subtitle="Things you have to pay, like rent and your phone."
        onAdd={data.bills.length > 0 ? () => setSheet({ bill: null }) : undefined}
        addLabel="Add a bill"
      />

      {data.bills.length === 0 ? (
        <EmptyState
          emoji="🧾"
          text="Add the bills you pay, like rent, your phone, and streaming."
          buttonLabel="Add your first bill"
          onClick={() => setSheet({ bill: null })}
        />
      ) : (
        <>
          <Card className="total-card">
            <BigNumber label="Bills each month" tone="plain" size="lg">
              <Money cents={total} approx={anyApprox} testId="bills-total" />
            </BigNumber>
            <div className="bills-progress">
              <p className="bills-progress__text" data-testid="bills-progress">
                {progressText}
                {bm.dueCount > 0 && bm.paidCount === bm.dueCount && <span aria-hidden="true"> 🎉</span>}
              </p>
              {bm.dueCount > 0 && (
                <ProgressBar
                  percent={(bm.paidCount / bm.dueCount) * 100}
                  tone="savings"
                  label="Bills paid this month"
                  valueText={`${bm.paidCount} of ${bm.dueCount} paid`}
                />
              )}
            </div>
          </Card>

          {due.length > 0 && (
            <>
              <div className="section-head">
                <h2 className="section-title">Due in {formatMonth(month, 'month')}</h2>
                <span className="section-head__aside">Check off when paid</span>
              </div>
              <ul className="list" role="list">
                {due.map((s) => (
                  <BillRow
                    key={s.bill.id}
                    s={s}
                    today={today}
                    onEdit={() => setSheet({ bill: s.bill })}
                    onPaid={(paid) => actions.setBillPaid(s.bill.id, paid ? month : null)}
                  />
                ))}
              </ul>
            </>
          )}

          {notDue.length > 0 && (
            <>
              <h2 className="section-title">Not due this month</h2>
              <ul className="list" role="list">
                {notDue.map((s) => (
                  <BillRow key={s.bill.id} s={s} today={today} onEdit={() => setSheet({ bill: s.bill })} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {sheet && <BillSheet bill={sheet.bill} today={today} onClose={() => setSheet(null)} />}
    </div>
  );
}

function BillRow({
  s,
  today,
  onEdit,
  onPaid,
}: {
  s: BillMonthStatus;
  today: ISODate;
  onEdit: () => void;
  onPaid?: (paid: boolean) => void;
}) {
  const b = s.bill;
  const monthly = b.frequency === 'monthly';
  const monthlyCents = billMonthly(b);
  let when: string;
  if (s.dueThisMonth) {
    const first = s.dueDates[0];
    when = `Due ${formatDate(first, 'short')}${s.dueDates.length > 1 ? ` + ${s.dueDates.length - 1} more` : ''}`;
  } else {
    const next = billDueDates(b, today, addDays(today, 400))[0];
    when = next ? `Next due ${formatDate(next, 'short')}` : 'Not due this month';
  }
  return (
    <li>
      <div className={`row row--split${s.paid ? ' row--done' : ''}`}>
        <button
          type="button"
          className="row__tap"
          onClick={onEdit}
          aria-label={`${b.name}, ${formatMoney(b.amount)}, ${when}${
            monthly ? '' : `, ${freqText(b.frequency)}, about ${formatMoney(monthlyCents)} a month`
          }. Edit`}
        >
          <span className="row__icon" aria-hidden="true">
            {b.emoji}
          </span>
          <span className="row__main">
            <span className="row__title">{b.name}</span>
            <span className="row__sub">
              {s.paid ? <span className="badge badge--paid">Paid ✓</span> : when}
            </span>
          </span>
          <span className="row__end">
            <span className="row__amount">
              <Money cents={b.amount} />
              {!monthly && <span className="row__freq">{FREQUENCY_SUFFIX[b.frequency]}</span>}
            </span>
            {!monthly && (
              <span className="row__amount-sub">
                <Money cents={monthlyCents} approx />
                {FREQUENCY_SUFFIX.monthly}
              </span>
            )}
          </span>
        </button>
        {onPaid && (
          <Checkbox checked={s.paid} onChange={onPaid} label={`${b.name} paid`} caption={s.paid ? 'Paid' : 'Paid?'} />
        )}
      </div>
    </li>
  );
}

export function BillSheet({ bill, today, onClose }: { bill: Bill | null; today: ISODate; onClose: () => void }) {
  const { actions } = useBudget();
  const del = useDeleteWithUndo();
  const [name, setName] = useState(bill?.name ?? '');
  const [emoji, setEmoji] = useState(bill?.emoji ?? '🧾');
  const amount = useMoneyField(bill?.amount ?? null, { required: true, allowZero: false });
  const [freq, setFreq] = useState<BillFrequency>(bill?.frequency ?? 'monthly');
  const [dueDay, setDueDay] = useState<number>(bill?.dueDay ?? isoParts(today).day);
  const [dueDate, setDueDate] = useState<string>(bill?.dueDate ?? today);
  const [dateError, setDateError] = useState<string | null>(null);

  const peek = amount.peek();
  const monthlyHint =
    freq !== 'monthly' && peek !== null && peek > 0
      ? `${formatMoney(peek)}${FREQUENCY_SUFFIX[freq]} ≈ ${formatMoney(toMonthly(peek, freq))}${FREQUENCY_SUFFIX.monthly}`
      : undefined;

  const save = () => {
    const cents = amount.validate();
    let ok = cents !== null;
    if (freq !== 'monthly' && !isUsableDate(dueDate)) {
      setDateError('Please pick the next due date.');
      ok = false;
    }
    if (!ok || cents === null) return false;
    const { year, month } = isoParts(today);
    const item: Bill = {
      id: bill?.id ?? newId(),
      name: cleanName(name, 'Bill'),
      emoji,
      amount: cents,
      frequency: freq,
      dueDay: freq === 'monthly' ? dueDay : isoParts(dueDate).day,
      dueDate: freq === 'monthly' ? dateInMonth(year, month, dueDay) : dueDate,
      paidMonth: bill?.paidMonth ?? null,
    };
    actions.upsert('bills', item);
    return true;
  };

  return (
    <BottomSheet
      title={bill ? 'Edit bill' : 'Add a bill'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={bill ? 'Save changes' : 'Add bill'}
      onDelete={bill ? () => del('bills', bill.id, bill.name) : undefined}
      deleteLabel="Delete this bill"
      testId="bill-sheet"
    >
      {!bill && (
        <ChipRow title="Quick pick (tap one to fill in)">
          {BILL_PRESETS.map((p) => (
            <Chip
              key={p.name}
              emoji={p.emoji}
              label={p.name}
              selected={name === p.name}
              onClick={() => {
                setName(p.name);
                setEmoji(p.emoji);
              }}
            />
          ))}
        </ChipRow>
      )}
      <div className="name-row name-row--wrap">
        <EmojiPicker value={emoji} onChange={setEmoji} label="bill icon" />
        <TextField label="Name" value={name} onChange={setName} placeholder="Like Rent" />
      </div>
      <MoneyInput label="Amount" {...amount.props} big helper={monthlyHint} />
      <Select label="How often?" value={freq} options={BILL_FREQ_OPTIONS} onChange={setFreq} />
      {freq === 'monthly' ? (
        <DayPicker
          label="Due on"
          value={dueDay}
          onChange={setDueDay}
          helper="If a month is shorter, it's due on the last day."
        />
      ) : (
        <DateInput
          label="Next due date"
          value={dueDate}
          onChange={(v) => {
            setDueDate(v);
            setDateError(null);
          }}
          error={dateError}
          helper={
            freq === 'weekly'
              ? 'It repeats every week from this date.'
              : freq === 'biweekly'
                ? 'It repeats every 2 weeks from this date.'
                : freq === 'quarterly'
                  ? 'It repeats every 3 months from this date.'
                  : 'It repeats every year on this date.'
          }
        />
      )}
    </BottomSheet>
  );
}
