import { useMemo, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Celebration } from '../components/Celebration';
import { Chip, ChipRow } from '../components/Chip';
import { DateInput, isUsableDate } from '../components/DateInput';
import { EmojiPicker } from '../components/EmojiPicker';
import { EmptyState } from '../components/EmptyState';
import { cleanName, TextField, Toggle } from '../components/Field';
import { IconChevronRight, IconPlus } from '../components/Icons';
import { Money } from '../components/Money';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { PageHeader } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { SegmentedControl } from '../components/Select';
import { addMonthsClamped, compareISO, formatMonth, monthKey } from '../lib/dates';
import { newId } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { GOAL_PRESETS, SPENDING_PRESETS } from '../lib/presets';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Goal, ISODate, SpendingCategory } from '../types';
import { GoalStatusLine, goalProjection } from './goalStatus';
import { useNav } from './nav';
import { useDeleteWithUndo } from './shared';

type SheetState =
  | { kind: 'spending'; item: SpendingCategory | null }
  | { kind: 'goal'; item: Goal | null }
  | { kind: 'add-money'; item: Goal };

export function SavingsScreen() {
  const { data } = useBudget();
  const today = useToday();
  const nav = useNav();
  const [sheet, setSheet] = useState<SheetState | null>(() =>
    nav.intent === 'add-goal'
      ? { kind: 'goal', item: null }
      : nav.intent === 'add-spending' || nav.intent === 'add'
        ? { kind: 'spending', item: null }
        : null,
  );
  const [celebrate, setCelebrate] = useState<string | null>(null);

  const spending = data.spending;
  const goals = data.goals;
  const spendingTotal = useMemo(() => spending.reduce((a, s) => a + s.monthly, 0), [spending]);
  const savingTotal = useMemo(
    () => goals.filter((g) => g.saved < g.target).reduce((a, g) => a + g.monthly, 0),
    [goals],
  );

  return (
    <div className="content stack">
      <PageHeader title="Savings & Fun" subtitle="Money for everyday spending, fun, and the things you're saving up for." />

      {/* Spending money */}
      <div className="section-head">
        <h2 className="section-title">Spending money</h2>
        {spending.length > 0 && (
          <span className="section-head__aside">
            <Money cents={spendingTotal} /> a month
          </span>
        )}
      </div>
      <p className="section-note">Groceries, gas, fun, and other everyday money.</p>
      {spending.length === 0 ? (
        <EmptyState
          compact
          emoji="🛒"
          text="Add money you spend each month, like groceries or fun money."
          buttonLabel="Add spending money"
          onClick={() => setSheet({ kind: 'spending', item: null })}
        />
      ) : (
        <>
          <ul className="list">
            {spending.map((s) => (
              <li key={s.id}>
                <button type="button" className="row" onClick={() => setSheet({ kind: 'spending', item: s })}>
                  <span className="row__icon" aria-hidden="true">
                    {s.emoji}
                  </span>
                  <span className="row__main">
                    <span className="row__title">{s.name}</span>
                    <span className="row__sub">
                      <span className={`badge ${s.kind === 'need' ? 'badge--need' : 'badge--fun'}`}>
                        {s.kind === 'need' ? 'Must-have' : 'Nice-to-have'}
                      </span>
                    </span>
                  </span>
                  <span className="row__end">
                    <span className="row__amount">
                      <Money cents={s.monthly} />
                    </span>
                    <span className="row__amount-sub">a month</span>
                  </span>
                  <IconChevronRight size={18} className="row__chev" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => setSheet({ kind: 'spending', item: null })}
          >
            <IconPlus size={18} /> Add spending money
          </button>
        </>
      )}

      {/* Savings goals */}
      <div className="section-head section-head--spaced">
        <h2 className="section-title">Savings goals</h2>
        {goals.length > 0 && savingTotal > 0 && (
          <span className="section-head__aside">
            Saving <Money cents={savingTotal} /> a month
          </span>
        )}
      </div>
      <p className="section-note">Things you're saving up for, like a trip or a safety net.</p>
      {goals.length === 0 ? (
        <EmptyState
          compact
          emoji="🐷"
          text="Saving up for something? Add a goal and watch it grow."
          buttonLabel="Add a savings goal"
          onClick={() => setSheet({ kind: 'goal', item: null })}
        />
      ) : (
        <>
          <ul className="stack stack--sm">
            {goals.map((g) => {
              const proj = goalProjection(g, today);
              const reached = proj.status === 'reached';
              return (
                <li key={g.id} className={`card goal-card${reached ? ' goal-card--done' : ''}`}>
                  <div className="goal-card__top">
                    <span className="row__icon" aria-hidden="true">
                      {g.emoji}
                    </span>
                    <div className="goal-card__main">
                      <h3 className="goal-card__name">{g.name}</h3>
                      <p className="goal-card__sub">
                        {g.isEmergencyFund && <span className="badge badge--savings">Safety net</span>}
                        {!reached && g.monthly > 0 && (
                          <span>
                            <Money cents={g.monthly} /> a month
                          </span>
                        )}
                        {g.targetDate && !reached && <span>· by {formatShortTarget(g.targetDate)}</span>}
                      </p>
                    </div>
                  </div>
                  <p className="goal-card__amounts">
                    <strong>
                      <Money cents={g.saved} />
                    </strong>{' '}
                    <span className="muted">
                      of <Money cents={g.target} />
                    </span>
                    <span className="goal-card__pct">{proj.percent}%</span>
                  </p>
                  <ProgressBar
                    percent={proj.percent}
                    tone="savings"
                    label={`${g.name} progress`}
                    valueText={`${formatMoney(g.saved)} of ${formatMoney(g.target)}`}
                  />
                  <GoalStatusLine goal={g} projection={proj} />
                  <div className="btn-row">
                    {!reached && (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        aria-label={`Add money to ${g.name}`}
                        onClick={() => setSheet({ kind: 'add-money', item: g })}
                      >
                        <IconPlus size={16} /> Add money
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--gray btn--sm"
                      aria-label={`Edit ${g.name}`}
                      onClick={() => setSheet({ kind: 'goal', item: g })}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => setSheet({ kind: 'goal', item: null })}
          >
            <IconPlus size={18} /> Add a savings goal
          </button>
        </>
      )}

      {sheet?.kind === 'spending' && <SpendingSheet item={sheet.item} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'goal' && <GoalSheet item={sheet.item} today={today} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'add-money' && (
        <AddMoneySheet
          goal={sheet.item}
          onClose={(reached) => {
            setSheet(null);
            if (reached) setCelebrate(sheet.item.name);
          }}
        />
      )}
      {celebrate && (
        <Celebration
          title="You did it!"
          message={`You reached your ${celebrate} goal. 🎉`}
          onDone={() => setCelebrate(null)}
        />
      )}
    </div>
  );
}

function formatShortTarget(d: ISODate): string {
  return formatMonth(monthKey(d), 'short');
}

export function SpendingSheet({ item, onClose }: { item: SpendingCategory | null; onClose: () => void }) {
  const { actions } = useBudget();
  const del = useDeleteWithUndo();
  const [name, setName] = useState(item?.name ?? '');
  const [emoji, setEmoji] = useState(item?.emoji ?? '🛒');
  const [kind, setKind] = useState<SpendingCategory['kind']>(item?.kind ?? 'need');
  const monthly = useMoneyField(item?.monthly ?? null, { required: true });

  const save = () => {
    const cents = monthly.validate();
    if (cents === null) return false;
    actions.upsert('spending', {
      id: item?.id ?? newId(),
      name: cleanName(name, kind === 'fun' ? 'Fun Money' : 'Spending'),
      emoji,
      monthly: cents,
      kind,
    });
    return true;
  };

  return (
    <BottomSheet
      title={item ? 'Edit spending' : 'Add spending money'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={item ? 'Save changes' : 'Add spending money'}
      onDelete={item ? () => del('spending', item.id, item.name) : undefined}
      deleteLabel="Delete this"
      testId="spending-sheet"
    >
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
      <div className="name-row name-row--wrap">
        <EmojiPicker value={emoji} onChange={setEmoji} label="icon" />
        <TextField label="Name" value={name} onChange={setName} placeholder="Like Groceries" />
      </div>
      <MoneyInput label="How much each month?" {...monthly.props} big />
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
    </BottomSheet>
  );
}

export function GoalSheet({ item, today, onClose }: { item: Goal | null; today: ISODate; onClose: () => void }) {
  const { data, actions } = useBudget();
  const del = useDeleteWithUndo();
  const [name, setName] = useState(item?.name ?? '');
  const [emoji, setEmoji] = useState(item?.emoji ?? '🎯');
  const target = useMoneyField(item?.target ?? null, { required: true, allowZero: false });
  const saved = useMoneyField(item?.saved ?? null);
  const monthly = useMoneyField(item?.monthly ?? null);
  const [hasDate, setHasDate] = useState(!!item?.targetDate);
  const [date, setDate] = useState<string>(item?.targetDate ?? addMonthsClamped(today, 12));
  const [dateError, setDateError] = useState<string | null>(null);
  const [isEF, setIsEF] = useState(item?.isEmergencyFund ?? false);
  const otherEF = data.goals.find((g) => g.isEmergencyFund && g.id !== item?.id);

  const save = () => {
    const t = target.validate();
    const s = saved.validate();
    const m = monthly.validate();
    let ok = t !== null && s !== null && m !== null;
    if (hasDate) {
      if (!isUsableDate(date)) {
        setDateError('Please pick a date.');
        ok = false;
      } else if (compareISO(date, today) <= 0 && date !== item?.targetDate) {
        setDateError('Please pick a date in the future.');
        ok = false;
      }
    }
    if (!ok || t === null || s === null || m === null) return false;
    if (isEF && otherEF) actions.upsert('goals', { ...otherEF, isEmergencyFund: false });
    actions.upsert('goals', {
      id: item?.id ?? newId(),
      name: cleanName(name, isEF ? 'Emergency Fund' : 'Savings goal'),
      emoji,
      target: t,
      saved: s,
      monthly: m,
      targetDate: hasDate ? date : null,
      isEmergencyFund: isEF,
    });
    return true;
  };

  return (
    <BottomSheet
      title={item ? 'Edit goal' : 'Add a savings goal'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={item ? 'Save changes' : 'Add goal'}
      onDelete={item ? () => del('goals', item.id, item.name) : undefined}
      deleteLabel="Delete this goal"
      testId="goal-sheet"
    >
      {!item && (
        <ChipRow title="Quick pick (tap one to fill in)">
          {GOAL_PRESETS.map((p) => (
            <Chip
              key={p.name}
              emoji={p.emoji}
              label={p.name}
              selected={name === p.name}
              onClick={() => {
                setName(p.name);
                setEmoji(p.emoji);
                setIsEF(p.isEmergencyFund);
              }}
            />
          ))}
        </ChipRow>
      )}
      <div className="name-row name-row--wrap">
        <EmojiPicker value={emoji} onChange={setEmoji} label="goal icon" />
        <TextField label="Name" value={name} onChange={setName} placeholder="Like Trip to Florida" />
      </div>
      <MoneyInput label="Goal amount" {...target.props} big helper="How much you want to save in total." />
      <div className="field-row field-row--top">
        <MoneyInput label="Saved so far" {...saved.props} />
        <MoneyInput label="Add each month" {...monthly.props} />
      </div>
      <Toggle label="Reach it by a certain date" checked={hasDate} onChange={setHasDate} />
      {hasDate && (
        <DateInput
          label="Target date"
          value={date}
          onChange={(v) => {
            setDate(v);
            setDateError(null);
          }}
          error={dateError}
          helper="We'll tell you how much to save each month to make it."
        />
      )}
      <Toggle
        label="This is my safety net (emergency fund)"
        checked={isEF}
        onChange={setIsEF}
        helper={
          otherEF && isEF
            ? `This will replace ${otherEF.name} as your safety net.`
            : 'Money for surprises, like a car repair. You can have one safety net.'
        }
      />
    </BottomSheet>
  );
}

function AddMoneySheet({ goal, onClose }: { goal: Goal; onClose: (reached: boolean) => void }) {
  const { actions } = useBudget();
  const amount = useMoneyField(null, { required: true, allowZero: false });
  const reached = useRef(false);
  const left = Math.max(0, goal.target - goal.saved);

  const save = () => {
    const cents = amount.validate();
    if (cents === null) return false;
    reached.current = goal.saved < goal.target && goal.saved + cents >= goal.target;
    actions.addToGoal(goal.id, cents);
    return true;
  };

  return (
    <BottomSheet
      title="Add money"
      onClose={() => onClose(reached.current)}
      onSave={save}
      saveLabel="Add"
      bigSaveLabel={`Add to ${goal.name}`}
      testId="add-money-sheet"
    >
      <p className="sheet__intro">
        <span aria-hidden="true">{goal.emoji} </span>
        <strong>{goal.name}</strong>: <Money cents={goal.saved} /> saved of <Money cents={goal.target} />.{' '}
        {left > 0 && (
          <>
            <Money cents={left} /> to go.
          </>
        )}
      </p>
      <MoneyInput label="How much did you put in?" {...amount.props} big />
    </BottomSheet>
  );
}
