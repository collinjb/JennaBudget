import { useMemo, type ReactNode } from 'react';
import { Card } from '../components/Card';
import { useConfirm } from '../components/ConfirmDialog';
import { IconArrowRight, IconChevronDown, IconSparkle, IconWarning } from '../components/Icons';
import { Money } from '../components/Money';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { formatMonth, monthKey } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { applySmartPlan, buildSmartPlan, type PlanLine, type SmartPlan } from '../lib/smartPlan';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Goal } from '../types';
import { useNav } from './nav';
import { GOALS_SHORT_TITLE, GoalsShortText } from './notices';
import { plural } from './shared';

export function SmartPlanPage() {
  const { data, actions } = useBudget();
  const today = useToday();
  const nav = useNav();
  const confirm = useConfirm();
  const toast = useToast();
  const plan = useMemo(() => buildSmartPlan(data, today), [data, today]);

  const use = async () => {
    const ok = await confirm({
      title: 'Use this plan?',
      message: `We'll update ${plural(plan.changes.length, 'amount')} in your budget. You can undo it right after.`,
      confirmLabel: 'Use this plan',
    });
    if (!ok) return;
    const previous = data;
    actions.replaceAll(applySmartPlan(data, plan));
    toast.show({
      message: 'Smart Plan applied',
      actionLabel: 'Undo',
      onAction: () => actions.replaceAll(previous),
      dismissOnChange: true,
    });
    // The card that opened this page has changed, so focus goes to the Home title.
    nav.back({ focusTitle: true });
  };

  const unchanged = plan.lines.filter((l) => !plan.changes.includes(l));

  return (
    <div className="content stack">
      <PageHeader
        onBack={() => nav.back()}
        title="Smart Plan"
        subtitle="A suggested way to split your money, with the reason for each change."
      />

      {data.incomes.length === 0 ? (
        <Card>
          <p>Add your take-home pay first, and the Smart Plan will suggest how to split it.</p>
          <button type="button" className="btn btn--primary btn--block plan-cta" onClick={() => nav.goTab('income', 'add')}>
            Add your paycheck
          </button>
        </Card>
      ) : !plan.feasible ? (
        <Infeasible plan={plan} onIncome={() => nav.goTab('income')} onBills={() => nav.goTab('bills')} />
      ) : (
        <>
          {plan.goalsShortfall > 0 ? (
            <>
              <Card tone="over" className="plan-intro" data-testid="plan-goals-short">
                <div className="plan-card__head">
                  <span className="plan-card__icon plan-card__icon--warn" aria-hidden="true">
                    <IconWarning size={22} />
                  </span>
                  <h2 className="card__title">{GOALS_SHORT_TITLE}</h2>
                </div>
                <GoalsShortText shortfall={plan.goalsShortfall} className="small" />
                <button
                  type="button"
                  className="btn btn--primary btn--block plan-cta"
                  onClick={() => nav.goTab('savings')}
                >
                  Go to Savings &amp; Fun
                </button>
              </Card>
              <DatedGoals plan={plan} />
            </>
          ) : plan.hasSuggestions ? (
            <Card tone="info" className="plan-intro">
              <div className="plan-card__head">
                <span className="plan-card__icon" aria-hidden="true">
                  <IconSparkle size={22} />
                </span>
                <h2 className="card__title">We found a better way to split your money</h2>
              </div>
              <p className="small">
                Bills and minimum debt payments are covered first. Here's what we'd change, and why.
              </p>
            </Card>
          ) : (
            <Card tone="good" className="plan-intro">
              <div className="plan-card__head">
                <span className="plan-card__icon plan-card__icon--good" aria-hidden="true">
                  ✓
                </span>
                <h2 className="card__title">Your plan looks great</h2>
              </div>
              <p className="small">
                {plan.changes.length > 0
                  ? 'Only a few dollars could move. The small tweaks below are optional.'
                  : "There's nothing to change right now. Here's why your money is set up well."}
              </p>
            </Card>
          )}

          {plan.changes.length > 0 && (
            <section aria-labelledby="changes-title" className="stack stack--sm">
              <h2 className="section-title" id="changes-title">
                {plan.hasSuggestions ? 'Suggested changes' : 'Small tweaks (optional)'}
              </h2>
              <ul className="list plan-lines" role="list">
                {plan.changes.map((l) => (
                  <PlanLineRow key={`${l.kind}-${l.id ?? l.name}`} line={l} />
                ))}
              </ul>
            </section>
          )}

          {plan.hasSuggestions && <Impact plan={plan} goals={data.goals} />}

          {plan.hasSuggestions ? (
            <>
              <button type="button" className="btn btn--primary btn--block btn--lg" onClick={use}>
                Use this plan
              </button>
              {unchanged.length > 0 && (
                <details className="card explain explain--card">
                  <summary>
                    What stays the same ({unchanged.length}) <IconChevronDown size={18} />
                  </summary>
                  <ul className="plan-same" role="list">
                    {unchanged.map((l) => (
                      <li key={`${l.kind}-${l.id ?? l.name}`}>
                        <p className="plan-same__top">
                          <span className="ellipsis">
                            <span aria-hidden="true">{l.emoji} </span>
                            {l.name}
                          </span>
                          <Money cents={l.to} />
                        </p>
                        <p className="plan-line__why">{l.why}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <>
              {plan.changes.length > 0 && (
                <button type="button" className="btn btn--secondary btn--block" onClick={use}>
                  Use these small tweaks
                </button>
              )}
              {/* Only lines that really stay the same; tweaked ones are listed above with their before → after. */}
              {unchanged.length > 0 && (
                <ul className="list plan-lines" role="list">
                  {unchanged.map((l) => (
                    <PlanLineRow key={`${l.kind}-${l.id ?? l.name}`} line={l} same />
                  ))}
                </ul>
              )}
            </>
          )}

          {plan.goalsShortfall === 0 && <DatedGoals plan={plan} />}
        </>
      )}

      <p className="footnote">These are general budgeting guidelines, not professional financial advice.</p>
    </div>
  );
}

/** Goals with a target date: their amounts are worked out automatically and come out first, so the plan lists them
 * (not adjustable here). */
function DatedGoals({ plan }: { plan: SmartPlan }) {
  if (plan.datedGoals.length === 0) return null;
  return (
    <section aria-labelledby="dated-title" className="stack stack--sm" data-testid="plan-dated-goals">
      <div>
        <h2 className="section-title" id="dated-title">
          Set automatically (goals with a date)
        </h2>
        <p className="section-sub">These come out first so you hit your dates.</p>
      </div>
      <ul className="list plan-lines" role="list">
        {plan.datedGoals.map((g) => (
          <li key={g.id} className="plan-line">
            <div className="plan-line__top">
              <span className="row__icon" aria-hidden="true">
                {g.emoji}
              </span>
              <div className="plan-line__main">
                <p className="plan-line__name">
                  <span className="ellipsis">{g.name}</span>
                </p>
                <p className="plan-dated__amounts">
                  <strong>
                    <Money cents={g.thisMonth} />
                  </strong>{' '}
                  <span className="muted">this month · by {formatMonth(monthKey(g.targetDate))}</span>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanLineRow({ line: l, same }: { line: PlanLine; same?: boolean }) {
  const isNew = l.kind === 'newGoal' || l.kind === 'newSpending';
  const up = l.to > l.from;
  return (
    <li className="plan-line">
      <div className="plan-line__top">
        <span className="row__icon" aria-hidden="true">
          {l.emoji}
        </span>
        <div className="plan-line__main">
          <p className="plan-line__name">
            <span className="ellipsis">{l.name}</span>
            {isNew && <span className="badge badge--new">New</span>}
          </p>
          <p className="plan-line__amounts">
            {same ? (
              <span>
                <Money cents={l.to} /> a month
              </span>
            ) : (
              <>
                <span className="plan-line__from">
                  <span className="sr-only">From </span>
                  <Money cents={l.from} />
                </span>
                <IconArrowRight size={16} className="plan-line__arrow" />
                <span className="sr-only"> to </span>
                <strong className={up ? 'tone-left' : 'tone-plain'}>
                  <Money cents={l.to} />
                </strong>
                <span className="muted"> a month</span>
              </>
            )}
          </p>
        </div>
      </div>
      <p className="plan-line__why">
        <strong>Why? </strong>
        {l.why}
      </p>
    </li>
  );
}

function Impact({ plan, goals }: { plan: SmartPlan; goals: Goal[] }) {
  const i = plan.impact;
  const items: ReactNode[] = [];
  if (i.monthsAfter !== null && i.debtFreeAfter && (i.monthsBefore === null || i.monthsAfter < i.monthsBefore)) {
    items.push(
      <>
        You'd be debt-free by <strong>{formatMonth(i.debtFreeAfter)}</strong> instead of{' '}
        <strong>{i.monthsBefore !== null && i.debtFreeBefore ? formatMonth(i.debtFreeBefore) : 'never'}</strong>.
      </>,
    );
  }
  const saved = i.interestBefore - i.interestAfter;
  // Interest "before" covers 50 years when the debt never gets paid off, so only compare real payoffs.
  if (saved > 0 && i.monthsBefore !== null && i.monthsAfter !== null) {
    items.push(
      <>
        You'd pay <strong>{formatMoney(saved)}</strong> less in interest.
      </>,
    );
  }
  for (const g of i.goals) {
    if (!g.after && g.before) {
      items.push(
        <>
          Saving for <strong>{g.name}</strong> would pause for now, so the money can go where it's needed more.
        </>,
      );
      continue;
    }
    if (!g.after || g.after === g.before) continue;
    if (g.before !== null && g.after > g.before) {
      const deadline = goals.find((x) => x.id === g.id)?.targetDate;
      // Slower than now (money moved to something more urgent): say so plainly, and whether it's still on time.
      const onTime = deadline ? g.after <= monthKey(deadline) : false;
      items.push(
        onTime ? (
          <>
            You'd still reach <strong>{g.name}</strong> by <strong>{formatMonth(g.after)}</strong>, in time for its
            target date.
          </>
        ) : (
          <>
            <strong>{g.name}</strong> would take a bit longer: <strong>{formatMonth(g.after)}</strong> instead of{' '}
            {formatMonth(g.before)}.
          </>
        ),
      );
      continue;
    }
    items.push(
      <>
        You'd reach <strong>{g.name}</strong> by <strong>{formatMonth(g.after)}</strong>
        {g.before ? <> instead of {formatMonth(g.before)}</> : null}.
      </>,
    );
  }
  const leftText = (cents: number) =>
    cents < 0 ? (
      <>
        <Money cents={-cents} /> over
      </>
    ) : (
      <Money cents={cents} />
    );
  items.push(
    <>
      Left over each month: {leftText(plan.leftOverBefore)} → <strong>{leftText(plan.leftOverAfter)}</strong>
      {plan.leftOverAfter > 0 ? ', a small cushion for surprises.' : '.'}
    </>,
  );
  return (
    <Card title="With this plan" className="impact-card">
      <ul className="impact-list" role="list">
        {items.map((node, idx) => (
          <li key={idx}>
            <span className="impact-list__dot" aria-hidden="true" />
            <span>{node}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Infeasible({ plan, onIncome, onBills }: { plan: SmartPlan; onIncome: () => void; onBills: () => void }) {
  return (
    <>
      <Card tone="over">
        <div className="plan-card__head">
          <span className="plan-card__icon plan-card__icon--warn" aria-hidden="true">
            <IconWarning size={22} />
          </span>
          <h2 className="card__title">Your bills are more than your income</h2>
        </div>
        <p className="small">
          Even before savings and fun, your bills, minimum debt payments, and must-have spending add up to{' '}
          <strong>
            <Money cents={plan.shortfall} /> more
          </strong>{' '}
          than you take home each month. That's a tough spot, and you're not alone. Here's where a change would help most.
        </p>
      </Card>
      {plan.levers.length > 0 && (
        <section aria-labelledby="levers-title" className="stack stack--sm">
          <h2 className="section-title" id="levers-title">
            Biggest things to look at
          </h2>
          <ul className="list plan-lines" role="list">
            {plan.levers.map((lv, i) => (
              <li key={`${i}-${lv.name}`} className="plan-line">
                <div className="plan-line__top">
                  <span className="row__icon" aria-hidden="true">
                    {lv.emoji}
                  </span>
                  <div className="plan-line__main">
                    <p className="plan-line__name">
                      <span className="ellipsis">{lv.name}</span>
                    </p>
                    <p className="plan-line__amounts">
                      <Money cents={lv.monthly} /> <span className="muted">a month</span>
                    </p>
                  </div>
                </div>
                <p className="plan-line__why">{lv.tip}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Card title="Other ways to close the gap">
        <ul className="impact-list" role="list">
          <li>
            <span className="impact-list__dot" aria-hidden="true" />
            <span>Extra income, like a side gig or more hours, counts right away.</span>
          </li>
          <li>
            <span className="impact-list__dot" aria-hidden="true" />
            <span>Call your lenders: many can lower a minimum payment for a while.</span>
          </li>
        </ul>
        <div className="btn-row plan-cta">
          <button type="button" className="btn btn--secondary btn--sm" onClick={onIncome}>
            Check Money In
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onBills}>
            Check Bills
          </button>
        </div>
      </Card>
    </>
  );
}
