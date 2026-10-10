import { useEffect, useId, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Chip, ChipRow } from '../components/Chip';
import { EmojiPicker } from '../components/EmojiPicker';
import { cleanName, TextField } from '../components/Field';
import { IconChevronRight, IconPlus } from '../components/Icons';
import { Money } from '../components/Money';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { SegmentedControl } from '../components/Select';
import { formatDate, formatMonth, monthKey } from '../lib/dates';
import { newId } from '../lib/ids';
import { centsToInput, formatMoney, MAX_MONEY_CENTS } from '../lib/money';
import { SPENDING_PRESETS } from '../lib/presets';
import { categorySpend, monthlyFromWeekly, periodBudget, weeklyFromMonthly } from '../lib/spending';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { ISODate, SpendEntry, SpendingCategory } from '../types';
import { LogSpendingSheet } from './LogSpendingSheet';
import { useDeleteWithUndo } from './shared';
import { entryDay, periodWord, SpendStatus } from './spendingParts';

type SpendLogPeriod = SpendingCategory['period'];

/** The biggest weekly amount whose monthly equivalent (× 52 ÷ 12) the app can still store. */
const MAX_WEEKLY = Math.floor((MAX_MONEY_CENTS * 12) / 52);

/** Value for the amount field ("0" for $0, so an untouched field still validates). */
function amountText(cents: number): string {
  return cents === 0 ? '0' : centsToInput(cents);
}

/**
 * One spending category. A new one opens straight on the form. An existing one opens on its details: this week's or
 * month's status, "Log spending", the purchases logged so far (tap one to change or delete it), and an Edit button
 * that turns the same sheet into the form (name, icon, week or month, amount, must-have or nice-to-have).
 */
export function SpendingSheet({ item, onClose }: { item: SpendingCategory | null; onClose: () => void }) {
  const { data, actions } = useBudget();
  const today = useToday();
  const del = useDeleteWithUndo();
  const [editing, setEditing] = useState(!item);
  const [sub, setSub] = useState<{ kind: 'log' } | { kind: 'entry'; entry: SpendEntry } | null>(null);
  // Edit form
  const [name, setName] = useState(item?.name ?? '');
  const [emoji, setEmoji] = useState(item?.emoji ?? '🛒');
  const [kind, setKind] = useState<SpendingCategory['kind']>(item?.kind ?? 'need');
  const [period, setPeriod] = useState<SpendLogPeriod>(item?.period ?? 'month');
  const amount = useMoneyField(item ? periodBudget(item) : null, {
    required: true,
    max: period === 'week' ? MAX_WEEKLY : undefined,
  });
  const [startText] = useState(amount.value);
  const formTop = useRef<HTMLDivElement>(null);
  const focusForm = useRef(false);

  // Details → form: start the form at the top and move focus to the sheet (the Edit button is gone).
  useEffect(() => {
    if (!editing || !focusForm.current) return;
    focusForm.current = false;
    const top = formTop.current;
    const body = top?.closest<HTMLElement>('.sheet__body');
    if (body) body.scrollTop = 0;
    top?.closest<HTMLElement>('.sheet')?.focus({ preventScroll: true });
  }, [editing]);

  /** Week ⇄ Month keeps the same budget: $25 a week becomes $108.33 a month and back again. */
  const changePeriod = (next: SpendLogPeriod) => {
    if (next === period) return;
    const cents = amount.value.trim() === '' ? null : amount.peek();
    if (cents !== null) amount.setValue(amountText(next === 'week' ? weeklyFromMonthly(cents) : monthlyFromWeekly(cents)));
    setPeriod(next);
  };

  const save = () => {
    const cents = amount.validate();
    if (cents === null) return false;
    // Untouched amount and same period: keep the stored monthly amount exactly (a weekly round-trip could move a cent).
    const unchanged = !!item && period === item.period && amount.value === startText;
    const monthly = unchanged && item ? item.monthly : period === 'week' ? monthlyFromWeekly(cents) : cents;
    actions.upsert('spending', {
      id: item?.id ?? newId(),
      name: cleanName(name, kind === 'fun' ? 'Fun Money' : 'Spending'),
      emoji,
      monthly,
      kind,
      period,
    });
    return true;
  };

  // The category as it is now (logging doesn't change it, but keep the details live anyway).
  const live = item ? (data.spending.find((s) => s.id === item.id) ?? item) : null;
  const typed = amount.peek();

  return (
    <>
      <BottomSheet
        title={editing ? (item ? 'Edit spending' : 'Add spending money') : (live?.name ?? '')}
        onClose={onClose}
        onSave={editing ? save : undefined}
        bigSaveLabel={item ? 'Save changes' : 'Add spending money'}
        cancelLabel={editing ? 'Cancel' : 'Close'}
        onDelete={editing && item ? () => del('spending', item.id, item.name) : undefined}
        deleteLabel="Delete this"
        testId={editing ? 'spending-sheet' : 'spending-detail-sheet'}
      >
        {!editing && live ? (
          <SpendingDetails
            category={live}
            log={data.spendLog}
            today={today}
            onLog={() => setSub({ kind: 'log' })}
            onEntry={(entry) => setSub({ kind: 'entry', entry })}
            onEdit={() => {
              focusForm.current = true;
              setEditing(true);
            }}
          />
        ) : (
          <>
            {!item && (
              <ChipRow title="Quick pick (tap one to fill in)">
                {SPENDING_PRESETS.map((p) => (
                  <Chip
                    key={p.name}
                    emoji={p.emoji}
                    label={p.name}
                    selected={name === p.name}
                    onClick={() => {
                      setName(p.name);
                      setEmoji(p.emoji);
                      setKind(p.kind);
                    }}
                  />
                ))}
              </ChipRow>
            )}
            <div className="name-row name-row--wrap" ref={formTop}>
              <EmojiPicker value={emoji} onChange={setEmoji} label="icon" />
              <TextField label="Name" value={name} onChange={setName} placeholder="Like Groceries" />
            </div>
            <SegmentedControl
              label="Budget by"
              value={period}
              onChange={changePeriod}
              options={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
              helper={
                period === 'week'
                  ? 'A fresh amount every week, starting on Sunday.'
                  : 'A fresh amount on the 1st of every month.'
              }
            />
            <MoneyInput
              label={period === 'week' ? 'How much each week?' : 'How much each month?'}
              {...amount.props}
              big
              helper={
                period === 'week' && typed !== null && typed > 0
                  ? `Your budget counts this as ${formatMoney(monthlyFromWeekly(typed))} a month.`
                  : undefined
              }
            />
            <SegmentedControl
              label="Is this a must-have?"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'need', label: 'Must-have' },
                { value: 'fun', label: 'Nice-to-have' },
              ]}
              helper={
                kind === 'need'
                  ? 'Things you need, like groceries and gas. The Smart Plan never changes these.'
                  : 'Extras, like eating out or fun money. The Smart Plan may suggest a different amount.'
              }
            />
          </>
        )}
      </BottomSheet>
      {sub?.kind === 'log' && live && <LogSpendingSheet categoryId={live.id} onClose={() => setSub(null)} />}
      {sub?.kind === 'entry' && <LogSpendingSheet entry={sub.entry} onClose={() => setSub(null)} />}
    </>
  );
}

/** "A fresh $25 starts Sunday (Oct 11)." / "A fresh $350 starts November 1." */
function resetText(budget: number, period: SpendLogPeriod, end: ISODate, daysLeft: number): string {
  const fresh = `A fresh ${formatMoney(budget)} starts`;
  if (daysLeft <= 1) return `${fresh} tomorrow.`;
  return period === 'week'
    ? `${fresh} Sunday (${formatDate(end, 'short')}).`
    : `${fresh} ${formatMonth(monthKey(end), 'month')} 1.`;
}

function SpendingDetails({
  category: c,
  log,
  today,
  onLog,
  onEntry,
  onEdit,
}: {
  category: SpendingCategory;
  log: SpendEntry[];
  today: ISODate;
  onLog: () => void;
  onEntry: (entry: SpendEntry) => void;
  onEdit: () => void;
}) {
  const spend = categorySpend(c, log, today);
  const w = periodWord(c.period);
  const listTitleId = useId();
  return (
    <>
      <p className="sheet__intro spend-detail__intro">
        <span aria-hidden="true">{c.emoji} </span>
        <span>
          <Money cents={spend.budget} /> a {w}
        </span>
        <span className={`badge ${c.kind === 'need' ? 'badge--need' : 'badge--fun'}`}>
          {c.kind === 'need' ? 'Must-have' : 'Nice-to-have'}
        </span>
      </p>
      <div className="spend-box">
        <SpendStatus name={c.name} period={c.period} spend={spend} testId="spend-detail-status" />
        <p className="spend-box__meta">
          {spend.spent > 0 && !spend.over ? `${formatMoney(spend.spent)} spent so far. ` : ''}
          {resetText(spend.budget, c.period, spend.range.end, spend.range.daysLeft)}
        </p>
      </div>
      <button type="button" className="btn btn--primary btn--block" onClick={onLog}>
        <IconPlus size={20} /> Log spending
      </button>
      <section className="spend-entries" aria-labelledby={listTitleId}>
        <h3 className="spend-entries__title" id={listTitleId}>
          This {w}'s spending
        </h3>
        {spend.entries.length === 0 ? (
          <p className="muted small">Nothing logged this {w} yet.</p>
        ) : (
          <ul className="spend-entries__list" role="list">
            {spend.entries.map((e) => {
              const day = entryDay(e.date, today);
              const what = e.note || 'Purchase';
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="spend-entry"
                    data-testid={`spend-entry-${e.id}`}
                    aria-label={`${what}, ${formatMoney(e.amount)}, ${day}. Edit`}
                    onClick={() => onEntry(e)}
                  >
                    <span className="spend-entry__main">
                      <span className="spend-entry__what">{what}</span>
                      <span className="spend-entry__day">{day}</span>
                    </span>
                    <Money cents={e.amount} className="spend-entry__amt" />
                    <IconChevronRight size={18} className="row__chev" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="muted small spend-detail__note">
        Spending inside this budget doesn't change your Left over. It's already planned for.
      </p>
      <button type="button" className="btn btn--gray btn--block" aria-label={`Edit ${c.name}`} onClick={onEdit}>
        Edit
      </button>
    </>
  );
}
