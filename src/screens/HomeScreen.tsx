import { useMemo } from 'react';
import { Card } from '../components/Card';
import { StackedBar, type Tone } from '../components/Charts';
import { useConfirm } from '../components/ConfirmDialog';
import { IconArrowRight, IconChevronRight, IconGear, IconInfo, IconSparkle, IconWarning } from '../components/Icons';
import { Money } from '../components/Money';
import { PageHeader } from '../components/PageHeader';
import { ProgressBar } from '../components/ProgressBar';
import { formatDate, formatDuration, formatMonth, monthKey } from '../lib/dates';
import { interestWarnings } from '../lib/debt';
import { projectGoal } from '../lib/goals';
import { ceilDollars, formatMoney } from '../lib/money';
import { paycheckPlan, type PaycheckWindow } from '../lib/schedule';
import { buildSmartPlan } from '../lib/smartPlan';
import { homeBreakdown, monthlySummary, type BreakdownKey } from '../lib/summary';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import { DEFAULT_SETTINGS, emptyBudget } from '../types';
import { GoalStatusLine } from './goalStatus';
import { useNav } from './nav';
import { InterestWarningNotice, ShortByNotice } from './notices';

const PARTS: { key: BreakdownKey; label: string; tone: Tone }[] = [
  { key: 'bills', label: 'Bills', tone: 'bills' },
  { key: 'debt', label: 'Debt', tone: 'debt' },
  { key: 'savings', label: 'Savings', tone: 'savings' },
  { key: 'spending', label: 'Spending & Fun', tone: 'fun' },
  { key: 'leftOver', label: 'Left over', tone: 'left' },
];

export function HomeScreen() {
  const { data, actions } = useBudget();
  const today = useToday();
  const nav = useNav();
  const confirm = useConfirm();
  const month = monthKey(today);

  const summary = useMemo(() => monthlySummary(data), [data]);
  const hb = useMemo(() => homeBreakdown(summary), [summary]);
  const windows = useMemo(() => paycheckPlan(data, today, 1), [data, today]);
  const plan = useMemo(() => buildSmartPlan(data, today), [data, today]);
  const activeDebts = useMemo(() => data.debts.filter((d) => d.balance > 0), [data.debts]);
  // The Smart Plan already simulated the payoff at the current pace ("before"); reuse it instead of running it again.
  const payoff =
    activeDebts.length > 0 ? { months: plan.impact.monthsBefore, debtFreeMonth: plan.impact.debtFreeBefore } : null;
  const warnings = useMemo(() => interestWarnings(activeDebts), [activeDebts]);
  const goalRows = useMemo(() => data.goals.map((g) => ({ g, proj: projectGoal(g, today) })), [data.goals, today]);

  const hasIncome = data.incomes.length > 0;
  /** Set up a paycheck but no bills yet: nudge toward bills before anything else. */
  const needsBills = hasIncome && data.bills.length === 0;
  const over = hb.over;
  const partCents = (k: BreakdownKey) => hb.parts.find((p) => p.key === k)?.cents ?? 0;

  const startOwn = async () => {
    const ok = await confirm({
      title: 'Start your own budget?',
      message: 'This clears the example numbers so you can enter yours. It only takes a minute.',
      confirmLabel: 'Start',
    });
    if (!ok) return;
    actions.replaceAll({ ...emptyBudget(), settings: { ...DEFAULT_SETTINGS, theme: data.settings.theme } });
  };

  return (
    <div className="content stack home">
      <PageHeader
        title={
          <>
            <span className="sr-only">Home: </span>
            {formatMonth(month, 'month')}
          </>
        }
        subtitle="Here's your month at a glance."
        right={
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => nav.openPage('settings')}>
            <IconGear size={24} />
          </button>
        }
      />

      {data.settings.isExample && (
        <div className="banner" role="note">
          <div className="banner__row">
            <IconInfo size={22} className="banner__icon" />
            <p className="banner__text">
              <strong>You're looking at example numbers</strong>
              Play around. Nothing here is real.
            </p>
          </div>
          <button type="button" className="btn btn--primary btn--sm btn--block" onClick={startOwn}>
            Start my own budget
          </button>
        </div>
      )}

      {/* 1. The big number. One live region that stays put, so a flip between "left" and "over" is announced. */}
      <section className={`card hero ${over ? 'hero--over' : 'hero--left'}`} aria-labelledby="hero-label">
        <div className="bignum bignum--xl hero__live" aria-live="polite" aria-atomic="true">
          <p className={`bignum__label${over ? ' hero__label--over' : ''}`} id="hero-label">
            {over && <IconWarning size={20} />}
            <span>Left over this month</span>
          </p>
          {over ? (
            <p className="hero__over">
              {/* "$1,998 over" never splits across lines; "You're" wraps first on small phones. */}
              <span data-testid="left-over" data-cents={hb.leftOver}>
                You're{' '}
                <span className="hero__amount">{formatMoney(-hb.leftOver, { showCents: 'never' })} over</span>
              </span>
            </p>
          ) : (
            <p className="bignum__value tone-left" data-testid="left-over" data-cents={hb.leftOver}>
              {formatMoney(hb.leftOver, { showCents: 'never' })}
            </p>
          )}
        </div>
        {!hasIncome ? (
          <>
            <p className="hero__note">Add your take-home pay to see what's left after everything.</p>
            <button type="button" className="btn btn--primary btn--block" onClick={() => nav.goTab('income', 'add')}>
              Add your paycheck
            </button>
          </>
        ) : over ? (
          <>
            <p className="hero__note">
              Your bills, debt payments, savings, and spending add up to more than you take home this month.
            </p>
            <button type="button" className="link-btn hero__fix" onClick={() => nav.openPage('smartplan')}>
              Here's how to fix it <IconArrowRight size={18} />
            </button>
          </>
        ) : (
          <p className="hero__note">
            {hb.leftOver === 0
              ? 'Every dollar has a job. Nice!'
              : 'After bills, debt, savings, and spending. Yours to keep or use.'}
          </p>
        )}
      </section>

      {/* Getting started: a paycheck but no bills yet, so the big number is just the paycheck. */}
      {needsBills && (
        <Card className="next-step" title="Next: add your bills">
          <p className="muted small">
            Rent, phone, insurance, streaming… Add what you pay, and the number above shows what's really left.
          </p>
          <button type="button" className="btn btn--primary btn--block" onClick={() => nav.goTab('bills', 'add')}>
            Add your bills
          </button>
        </Card>
      )}

      {/* 2. Where your money goes */}
      {hasIncome && (
        <Card title="Where your money goes" className="breakdown">
          <StackedBar
            segments={PARTS.filter((p) => p.key !== 'leftOver' || !over).map((p) => ({
              key: p.key,
              value: partCents(p.key),
              tone: p.tone,
            }))}
          />
          <ul className="legend" role="list">
            {PARTS.map((p) => {
              if (p.key === 'leftOver' && over) {
                return (
                  <li key={p.key} className="legend__row">
                    <span className="legend__dot fill-over" aria-hidden="true" />
                    <span className="legend__label">Over budget</span>
                    <span className="legend__value tone-over" data-testid="breakdown-leftOver" data-cents={hb.leftOver}>
                      {formatMoney(hb.leftOver, { showCents: 'never' })}
                    </span>
                  </li>
                );
              }
              const cents = p.key === 'leftOver' ? hb.leftOver : partCents(p.key);
              return (
                <li key={p.key} className="legend__row">
                  <span className={`legend__dot fill-${p.tone}`} aria-hidden="true" />
                  <span className="legend__label">{p.label}</span>
                  <span className="legend__value" data-testid={`breakdown-${p.key}`} data-cents={cents}>
                    {formatMoney(cents, { showCents: 'never' })}
                  </span>
                </li>
              );
            })}
            <li className="legend__row legend__row--total">
              <span className="legend__label">Take-home pay</span>
              <span className="legend__value" data-testid="breakdown-income" data-cents={hb.income}>
                {formatMoney(hb.income, { showCents: 'never' })}
              </span>
            </li>
          </ul>
        </Card>
      )}

      {/* 3. Next paycheck */}
      {hasIncome && windows.length > 0 ? (
        <NextPaycheckCard paycheckWindow={windows[0]} onOpen={() => nav.openPage('paycheck')} />
      ) : null}

      {/* 4. Debt-free date */}
      {payoff && (
        <Card
          title="Debt-free date"
          className="debtfree-card"
          action={{ label: 'See your debt plan', onClick: () => nav.goTab('debt') }}
        >
          {payoff.months !== null && payoff.debtFreeMonth ? (
            <p className="home-line">
              At this pace you'll be debt-free in{' '}
              <strong className="tone-debt" data-testid="debt-free-date">
                {formatMonth(payoff.debtFreeMonth)}
              </strong>{' '}
              <span className="muted">({formatDuration(payoff.months)})</span>.
            </p>
          ) : (
            <p className="home-line">
              <strong className="tone-over" data-testid="debt-free-date">
                At this pace your debt won't be paid off
              </strong>{' '}
              <span className="muted">(not within 50 years).</span>
            </p>
          )}
          {warnings.length > 0 && (
            <div className="home-warn stack stack--sm">
              {warnings.map((w) => (
                <InterestWarningNotice key={w.debtId} warning={w} paysOffLater={payoff.months !== null} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 5. Smart Plan */}
      {hasIncome && (
        <Card
          className={`plan-card${!plan.feasible ? ' plan-card--short' : plan.hasSuggestions ? ' plan-card--new' : ''}`}
          data-testid="plan-card"
        >
          {!plan.feasible ? (
            <>
              <div className="plan-card__head">
                <span className="plan-card__icon plan-card__icon--warn" aria-hidden="true">
                  <IconWarning size={22} />
                </span>
                <h2 className="card__title">Your bills are more than your income</h2>
              </div>
              <p className="muted small">
                Even before savings and fun, your bills, minimum debt payments, and must-have spending cost about{' '}
                <strong>
                  {/* Round up so a shortfall of a few cents never reads "$0 more". */}
                  <Money cents={ceilDollars(plan.shortfall)} showCents="never" /> more
                </strong>{' '}
                than you take home each month. Let's look at what could help.
              </p>
              <button type="button" className="btn btn--primary btn--block" onClick={() => nav.openPage('smartplan')}>
                See what could help
              </button>
            </>
          ) : plan.hasSuggestions ? (
            <>
              <div className="plan-card__head">
                <span className="plan-card__icon" aria-hidden="true">
                  <IconSparkle size={22} />
                </span>
                <h2 className="card__title">We found a better way to split your money</h2>
              </div>
              <p className="muted small">
                {plan.changes.length === 1 ? '1 suggested change' : `${plan.changes.length} suggested changes`}, each
                with a short reason why. Nothing changes unless you say so.
              </p>
              {needsBills ? (
                // Adding bills is the one main thing to do right now; the plan is a quieter link until then.
                <button type="button" className="card__action" onClick={() => nav.openPage('smartplan')}>
                  <span>See the Smart Plan</span>
                  <IconChevronRight size={18} />
                </button>
              ) : (
                <button type="button" className="btn btn--primary btn--block" onClick={() => nav.openPage('smartplan')}>
                  See the Smart Plan
                </button>
              )}
            </>
          ) : (
            <>
              <div className="plan-card__head">
                <span className="plan-card__icon plan-card__icon--good" aria-hidden="true">
                  ✓
                </span>
                <h2 className="card__title">Your plan looks great</h2>
              </div>
              <p className="muted small">The Smart Plan doesn't have any changes to suggest right now.</p>
              <button type="button" className="card__action" onClick={() => nav.openPage('smartplan')}>
                <span>See why</span>
                <IconChevronRight size={18} />
              </button>
            </>
          )}
        </Card>
      )}

      {/* 6. Savings goals */}
      {goalRows.length > 0 && (
        <Card title="Savings goals" action={{ label: 'See all savings', onClick: () => nav.goTab('savings') }}>
          <ul className="home-goals" role="list">
            {goalRows.map(({ g, proj }) => {
              return (
                <li key={g.id} className="home-goal">
                  <div className="home-goal__top">
                    <span className="home-goal__name ellipsis">
                      <span aria-hidden="true">{g.emoji} </span>
                      {g.name}
                    </span>
                    <span className="home-goal__amt">
                      <Money cents={g.saved} showCents="never" /> <span className="muted">of</span>{' '}
                      <Money cents={g.target} showCents="never" />
                    </span>
                  </div>
                  <ProgressBar
                    percent={proj.percent}
                    tone="savings"
                    size="sm"
                    label={`${g.name} progress`}
                    valueText={`${formatMoney(g.saved)} of ${formatMoney(g.target)}`}
                  />
                  <GoalStatusLine goal={g} projection={proj} compact />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {!hasIncome && (
        <p className="footnote">Tip: start with Money In, then add your bills. The big number fills in as you go.</p>
      )}
    </div>
  );
}

function NextPaycheckCard({ paycheckWindow: w, onOpen }: { paycheckWindow: PaycheckWindow; onOpen: () => void }) {
  const shown = w.items.slice(0, 4);
  const more = w.items.length - shown.length;
  return (
    <Card
      title="Next payday"
      className="payday-card"
      data-testid="next-paycheck"
      action={{ label: 'See your paycheck plan', onClick: onOpen }}
    >
      <p className="payday-card__date">
        <strong>{formatDate(w.payday.date, 'weekday')}</strong>
        <span className="muted"> · </span>
        <Money cents={w.payday.amount} className="payday-card__amt" />
      </p>
      {w.items.length > 0 ? (
        <>
          <p className="muted small payday-card__due">Due before the next payday ({formatDate(w.end, 'short')}):</p>
          <ul className="mini-list" role="list">
            {shown.map((it) => (
              <li key={`${it.kind}-${it.id}-${it.date}`} className="mini-list__row">
                <span className="mini-list__name ellipsis">
                  <span aria-hidden="true">{it.emoji} </span>
                  {it.name}
                </span>
                <Money cents={it.amount} className="mini-list__amt" />
              </li>
            ))}
            {more > 0 && <li className="mini-list__more muted small">+ {more} more</li>}
          </ul>
        </>
      ) : (
        <p className="muted small payday-card__due">Nothing is due before the next payday.</p>
      )}
      {w.shortBy > 0 ? (
        <ShortByNotice shortBy={w.shortBy} className="payday-card__result" />
      ) : (
        <p className="payday-card__left">
          <strong className="tone-left">
            <Money cents={w.left} /> left
          </strong>{' '}
          from this paycheck.
        </p>
      )}
    </Card>
  );
}
