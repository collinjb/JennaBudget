import { useMemo, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Celebration } from '../components/Celebration';
import { Chip, ChipRow } from '../components/Chip';
import { DateInput, isUsableDate } from '../components/DateInput';
import { EmojiPicker } from '../components/EmojiPicker';
import { EmptyState } from '../components/EmptyState';
import { cleanName, TextField, Toggle } from '../components/Field';
import { IconCheck, IconChevronRight, IconPlus } from '../components/Icons';
import { Money } from '../components/Money';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { PageHeader } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { addMonthsClamped, compareISO, formatMonth, monthKey } from '../lib/dates';
import { projectGoal, type GoalProjection } from '../lib/goals';
import { newId } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { GOAL_PRESETS } from '../lib/presets';
import { categorySpend, periodBudget, type CategorySpend } from '../lib/spending';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Goal, ISODate, SpendingCategory } from '../types';
import { GoalMonthLine, GoalStatusLine } from './goalStatus';
import { LogSpendingSheet } from './LogSpendingSheet';
import { useNav } from './nav';
import { useDeleteWithUndo } from './shared';
import { SpendingSheet } from './SpendingSheet';
import { periodWord, SpendStatus } from './spendingParts';

type SheetState =
  | { kind: 'spending'; item: SpendingCategory | null }
  | { kind: 'log'; categoryId: string | null }
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
  // This week's or month's spending for each category (what's left after the purchases logged so far).
  const spends = useMemo(
    () => new Map(spending.map((s) => [s.id, categorySpend(s, data.spendLog, today)])),
    [spending, data.spendLog, today],
  );
  const projections = useMemo(() => new Map(goals.map((g) => [g.id, projectGoal(g, today)])), [goals, today]);
  // What the goals set aside this month (automatic amounts for goals with a date): the same number Home uses.
  const savingTotal = useMemo(
    () => goals.reduce((a, g) => a + (projections.get(g.id)?.thisMonth ?? 0), 0),
    [goals, projections],
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
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => setSheet({ kind: 'log', categoryId: null })}
          >
            <IconPlus size={20} /> Log spending
          </button>
          <ul className="list" role="list">
            {spending.map((s) => (
              <SpendingRow
                key={s.id}
                category={s}
                spend={spends.get(s.id) ?? categorySpend(s, data.spendLog, today)}
                onOpen={() => setSheet({ kind: 'spending', item: s })}
                onLog={() => setSheet({ kind: 'log', categoryId: s.id })}
              />
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
            Saving <Money cents={savingTotal} /> this month
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
          <ul className="stack stack--sm" role="list">
            {goals.map((g) => {
              const proj = projections.get(g.id) ?? projectGoal(g, today);
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
                        {proj.auto && g.targetDate ? (
                          <span>Target date: {formatShortTarget(g.targetDate)}</span>
                        ) : (
                          !reached &&
                          g.monthly > 0 && (
                            <span>
                              <Money cents={g.monthly} /> a month
                            </span>
                          )
                        )}
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
                  <GoalMonthLine goal={g} projection={proj} />
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
      {sheet?.kind === 'log' && <LogSpendingSheet categoryId={sheet.categoryId} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'goal' && <GoalSheet item={sheet.item} today={today} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'add-money' && (
        <AddMoneySheet
          goal={sheet.item}
          today={today}
          onClose={(reached) => {
            setSheet(null);
            if (reached) setCelebrate(sheet.item.name);
          }}
        />
      )}
      {celebrate && (
        <Celebration
          title="You did it!"
          message={
            <>
              You reached your {celebrate} goal.<span aria-hidden="true"> 🎉</span>
            </>
          }
          onDone={() => setCelebrate(null)}
        />
      )}
    </div>
  );
}

/**
 * One spending category: the row opens its details (the whole row is tappable), and shows this week's or month's
 * status with a small bar and a "Log" shortcut that starts the log sheet on this category.
 */
function SpendingRow({
  category: s,
  spend,
  onOpen,
  onLog,
}: {
  category: SpendingCategory;
  spend: CategorySpend;
  onOpen: () => void;
  onLog: () => void;
}) {
  return (
    <li className="spend-item">
      <button type="button" className="row spend-item__tap" onClick={onOpen}>
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
            <Money cents={periodBudget(s)} />
          </span>
          <span className="row__amount-sub">a {periodWord(s.period)}</span>
        </span>
        <IconChevronRight size={18} className="row__chev" />
      </button>
      <div className="spend-item__status">
        <SpendStatus name={s.name} period={s.period} spend={spend} testId={`spend-status-${s.id}`} />
        <button
          type="button"
          className="btn btn--secondary btn--sm spend-item__log"
          aria-label={`Log spending for ${s.name}`}
          onClick={onLog}
        >
          <IconPlus size={16} /> Log
        </button>
      </div>
    </li>
  );
}

function formatShortTarget(d: ISODate): string {
  return formatMonth(monthKey(d), 'short');
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

  // With a target date the monthly amount is automatic: preview it live from what's typed so far.
  const draftTarget = target.peek();
  const draftSaved = saved.peek();
  const datePreviewable = hasDate && isUsableDate(date) && compareISO(date, today) >= 0;
  const preview =
    datePreviewable && draftTarget !== null && draftTarget > 0 && draftSaved !== null
      ? projectGoal(
          {
            id: item?.id ?? 'draft',
            name,
            emoji,
            target: draftTarget,
            saved: draftSaved,
            monthly: 0,
            targetDate: date,
            isEmergencyFund: isEF,
            monthDeposit: item?.monthDeposit ?? null,
          },
          today,
        )
      : null;

  const save = () => {
    const t = target.validate();
    const s = saved.validate();
    // With a date the monthly field is hidden (the amount is automatic); keep whatever it held so it comes back if
    // the date is removed later.
    const m = hasDate ? (monthly.peek() ?? item?.monthly ?? 0) : monthly.validate();
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
      monthDeposit: item?.monthDeposit ?? null,
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
        {!hasDate && <MoneyInput label="Add each month" {...monthly.props} />}
      </div>
      <Toggle
        label="Reach it by a certain date"
        checked={hasDate}
        onChange={setHasDate}
        helper={hasDate ? undefined : 'Want it to catch up automatically if you miss a month? Add a target date.'}
      />
      {hasDate && (
        <>
          <DateInput
            label="Target date"
            value={date}
            onChange={(v) => {
              setDate(v);
              setDateError(null);
            }}
            error={dateError}
            helper={preview ? undefined : "Pick a date, and we'll work out how much to set aside each month."}
          />
          {preview && <AutoAmountNote preview={preview} />}
        </>
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

/** Goal sheet, with a target date: the amount set aside automatically, worked out live from the fields. */
function AutoAmountNote({ preview }: { preview: GoalProjection }) {
  if (preview.status === 'reached') {
    return (
      <p className="notice notice--good" data-testid="goal-auto-amount">
        <IconCheck size={18} />
        <span>You've already saved enough for this goal.</span>
      </p>
    );
  }
  return (
    <div className="notice notice--good auto-note" data-testid="goal-auto-amount">
      <IconCheck size={18} />
      <span>
        {preview.monthsLeft === 0 ? (
          <>
            We'll set aside{' '}
            <strong>
              <Money cents={preview.thisMonth} />
            </strong>{' '}
            this month to make it.
          </>
        ) : (
          <>
            We'll set aside about{' '}
            <strong>
              <Money cents={preview.thisMonth} /> a month
            </strong>
            .
          </>
        )}
        <span className="auto-note__more">
          If a month comes up short, the next months go up a little so you still make it.
        </span>
      </span>
    </div>
  );
}

function AddMoneySheet({ goal, today, onClose }: { goal: Goal; today: ISODate; onClose: (reached: boolean) => void }) {
  const { actions } = useBudget();
  const left = Math.max(0, goal.target - goal.saved);
  // Start with what this month still needs (never more than what's left to reach the goal).
  const [proj] = useState(() => projectGoal(goal, today));
  const suggested = Math.min(proj.thisMonthToGo, left);
  const amount = useMoneyField(suggested > 0 ? suggested : null, { required: true, allowZero: false });
  const reached = useRef(false);

  const save = () => {
    const cents = amount.validate();
    if (cents === null) return false;
    reached.current = goal.saved < goal.target && goal.saved + cents >= goal.target;
    actions.addToGoal(goal.id, cents, monthKey(today));
    return true;
  };

  let helper: string | undefined;
  if (proj.thisMonth > 0 && proj.status !== 'reached') {
    const month = formatMoney(proj.thisMonth);
    if (suggested > 0) {
      if (suggested < proj.thisMonthToGo) helper = "That's all it takes to reach this goal.";
      else if (suggested === proj.thisMonth) helper = `That's this month's ${month}.`;
      else helper = `That's what's left of this month's ${month}.`;
    } else {
      helper = proj.auto
        ? `This month's ${month} is already saved. Anything extra makes the next months a little smaller.`
        : `This month's ${month} is already saved. Anything extra gets you there sooner.`;
    }
  }

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
      <MoneyInput label="How much did you put in?" {...amount.props} big helper={helper} />
    </BottomSheet>
  );
}
