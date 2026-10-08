import { useMemo, useState } from 'react';
import { BigNumber } from '../components/BigNumber';
import { BottomSheet } from '../components/BottomSheet';
import { Card } from '../components/Card';
import { DateInput, DayPicker, isUsableDate } from '../components/DateInput';
import { EmptyState } from '../components/EmptyState';
import { cleanName, TextField } from '../components/Field';
import { IconChevronDown, IconChevronRight, IconInfo } from '../components/Icons';
import { Money } from '../components/Money';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { PageHeader } from '../components/PageHeader';
import { Select, type Option } from '../components/Select';
import { formatDate, monthKey } from '../lib/dates';
import { incomeMonthly, isApproxMonthly } from '../lib/frequency';
import { newId } from '../lib/ids';
import { nextPaydays } from '../lib/schedule';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Income, IncomeFrequency, ISODate } from '../types';
import { useNav } from './nav';
import { extraPaycheckHeadsUp, freqText, useDeleteWithUndo } from './shared';

export const INCOME_FREQ_OPTIONS: Option<IncomeFrequency>[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Every month' },
];

export function MoneyInScreen() {
  const { data } = useBudget();
  const today = useToday();
  const nav = useNav();
  const [sheet, setSheet] = useState<{ income: Income | null } | null>(() =>
    nav.intent === 'add' ? { income: null } : null,
  );
  const month = monthKey(today);
  const incomes = data.incomes;

  const total = useMemo(() => incomes.reduce((a, i) => a + incomeMonthly(i), 0), [incomes]);
  const anyApprox = incomes.some((i) => isApproxMonthly(i.frequency));

  const headsUp = useMemo(() => extraPaycheckHeadsUp(incomes, month), [incomes, month]);

  return (
    <div className="content stack">
      <PageHeader
        title="Money In"
        subtitle="The money you take home from work and side gigs."
        onAdd={incomes.length > 0 ? () => setSheet({ income: null }) : undefined}
        addLabel="Add income"
      />

      {incomes.length === 0 ? (
        <EmptyState
          emoji="💵"
          text="Add your paycheck so we can show what's left after your bills."
          buttonLabel="Add your paycheck"
          onClick={() => setSheet({ income: null })}
        />
      ) : (
        <>
          <Card className="total-card">
            <BigNumber label="You take home about" tone="plain" size="lg" caption="a month, after taxes">
              <Money cents={total} approx={anyApprox} testId="income-total" />
            </BigNumber>
            <details className="explain">
              <summary>
                How we calculate this <IconChevronDown size={18} />
              </summary>
              <div className="explain__body">
                <p>
                  Months aren't exactly 4 weeks long, so we spread a whole year of paychecks evenly over 12 months.
                  That's why some numbers have a "≈".
                </p>
                <ul>
                  <li>
                    <span>Every week</span>
                    <span>× 52 ÷ 12</span>
                  </li>
                  <li>
                    <span>Every 2 weeks</span>
                    <span>× 26 ÷ 12</span>
                  </li>
                  <li>
                    <span>Twice a month</span>
                    <span>× 2</span>
                  </li>
                  <li>
                    <span>Every month</span>
                    <span>× 1</span>
                  </li>
                  <li>
                    <span>Every 3 months</span>
                    <span>÷ 3</span>
                  </li>
                  <li>
                    <span>Once a year</span>
                    <span>÷ 12</span>
                  </li>
                </ul>
              </div>
            </details>
          </Card>

          {headsUp && (
            <p className="notice notice--info">
              <IconInfo size={18} />
              <span>
                <strong>{headsUp}</strong> Your budget counts on the usual amount, so the extra one is a nice bonus for
                a goal or debt.
              </span>
            </p>
          )}

          <h2 className="section-title">Your paychecks</h2>
          <ul className="list">
            {incomes.map((i) => {
              const next = nextPaydays([i], today, 1)[0];
              return (
                <li key={i.id}>
                  <button type="button" className="row" onClick={() => setSheet({ income: i })}>
                    <span className="row__icon" aria-hidden="true">
                      💵
                    </span>
                    <span className="row__main">
                      <span className="row__line">
                        <span className="row__title">{i.name}</span>
                        <span className="row__amount">
                          <Money cents={incomeMonthly(i)} approx={isApproxMonthly(i.frequency)} />
                        </span>
                      </span>
                      <span className="row__line row__sub">
                        <span>
                          <Money cents={i.amount} /> {freqText(i.frequency)}
                        </span>
                        <span className="row__amount-sub">a month</span>
                      </span>
                      {next && <span className="row__sub">Next payday: {formatDate(next.date, 'weekday')}</span>}
                    </span>
                    <IconChevronRight size={18} className="row__chev" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sheet && <IncomeSheet income={sheet.income} today={today} onClose={() => setSheet(null)} />}
    </div>
  );
}

export function IncomeSheet({ income, today, onClose }: { income: Income | null; today: ISODate; onClose: () => void }) {
  const { actions } = useBudget();
  const del = useDeleteWithUndo();
  const [name, setName] = useState(income?.name ?? '');
  const amount = useMoneyField(income?.amount ?? null, { required: true, allowZero: false });
  const [freq, setFreq] = useState<IncomeFrequency>(income?.frequency ?? 'biweekly');
  const [payDate, setPayDate] = useState<string>(income?.payDate ?? today);
  const [dateError, setDateError] = useState<string | null>(null);
  const [days, setDays] = useState<[number, number]>(income?.semimonthlyDays ?? [1, 15]);
  const [daysError, setDaysError] = useState<string | null>(null);

  const save = () => {
    const cents = amount.validate();
    let ok = cents !== null;
    if (freq !== 'semimonthly' && !isUsableDate(payDate)) {
      setDateError('Please pick a payday.');
      ok = false;
    }
    if (freq === 'semimonthly' && days[0] === days[1]) {
      setDaysError('Please pick two different days.');
      ok = false;
    }
    if (!ok || cents === null) return false;
    const sorted: [number, number] = days[0] < days[1] ? [days[0], days[1]] : [days[1], days[0]];
    actions.upsert('incomes', {
      id: income?.id ?? newId(),
      name: cleanName(name, 'Paycheck'),
      amount: cents,
      frequency: freq,
      payDate: isUsableDate(payDate) ? payDate : today,
      semimonthlyDays: sorted,
    });
    return true;
  };

  return (
    <BottomSheet
      title={income ? 'Edit paycheck' : 'Add a paycheck'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={income ? 'Save changes' : 'Add paycheck'}
      onDelete={income ? () => del('incomes', income.id, income.name) : undefined}
      deleteLabel="Delete this paycheck"
      testId="income-sheet"
    >
      <TextField label="Name" value={name} onChange={setName} placeholder="Paycheck" helper="Like “Paycheck” or “Side gig”." />
      <MoneyInput
        label="Take-home amount"
        {...amount.props}
        big
        helper="What actually hits your bank account, after taxes"
      />
      <Select label="How often?" value={freq} options={INCOME_FREQ_OPTIONS} onChange={setFreq} />
      {freq === 'semimonthly' ? (
        <div className="field-row">
          <DayPicker
            label="First payday"
            lastDayLabel="last day"
            value={days[0]}
            onChange={(d) => {
              setDays([d, days[1]]);
              setDaysError(null);
            }}
          />
          <DayPicker
            label="Second payday"
            lastDayLabel="last day"
            value={days[1]}
            onChange={(d) => {
              setDays([days[0], d]);
              setDaysError(null);
            }}
          />
        </div>
      ) : (
        <DateInput
          label="Next payday"
          value={payDate}
          onChange={(v) => {
            setPayDate(v);
            setDateError(null);
          }}
          error={dateError}
          helper={freq === 'monthly' ? 'You get paid on this day every month.' : 'Any upcoming payday works.'}
        />
      )}
      {daysError && (
        <p className="field__error" role="alert">
          {daysError}
        </p>
      )}
    </BottomSheet>
  );
}
