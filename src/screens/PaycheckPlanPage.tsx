import { useMemo } from 'react';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { IconInfo } from '../components/Icons';
import { Money } from '../components/Money';
import { PageHeader } from '../components/PageHeader';
import { formatDate, monthKey } from '../lib/dates';
import { paycheckPlan } from '../lib/schedule';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import { useNav } from './nav';
import { extraPaycheckHeadsUp } from './shared';

export function PaycheckPlanPage() {
  const { data } = useBudget();
  const today = useToday();
  const nav = useNav();
  const month = monthKey(today);
  const windows = useMemo(() => paycheckPlan(data, today, 4), [data, today]);

  const headsUp = useMemo(() => extraPaycheckHeadsUp(data.incomes, month), [data.incomes, month]);

  return (
    <div className="content stack">
      <PageHeader
        onBack={nav.back}
        title="Paycheck Plan"
        subtitle="What each paycheck needs to cover before the next one comes."
      />

      {windows.length === 0 ? (
        <EmptyState
          emoji="📅"
          text="Add your paycheck to see what each payday needs to cover."
          buttonLabel="Add your paycheck"
          onClick={() => nav.goTab('income', 'add')}
        />
      ) : (
        <>
          {headsUp && (
            <p className="notice notice--info">
              <IconInfo size={18} />
              <span>
                <strong>{headsUp}</strong>
              </span>
            </p>
          )}

          <ol className="stack">
            {windows.map((w, idx) => (
              <li key={w.payday.date}>
                <Card className="window-card" data-testid={`paycheck-window-${idx}`}>
                  <div className="window-card__head">
                    <div>
                      <p className="window-card__kicker">{idx === 0 ? 'Next payday' : `Payday ${idx + 1}`}</p>
                      <h2 className="window-card__date">{formatDate(w.payday.date, 'weekday')}</h2>
                    </div>
                    <Money cents={w.payday.amount} className="window-card__amt" />
                  </div>
                  {w.payday.sources.length > 1 && (
                    <p className="muted small window-card__sources">
                      {w.payday.sources.map((s, i) => (
                        <span key={s.incomeId}>
                          {i > 0 && ' + '}
                          {s.name} <Money cents={s.amount} />
                        </span>
                      ))}
                    </p>
                  )}

                  <h3 className="window-card__sub">
                    Due before {formatDate(w.end, 'short')}
                    <span className="sr-only"> (the next payday)</span>
                  </h3>
                  {w.items.length === 0 ? (
                    <p className="muted small">Nothing is due. This whole paycheck is free for savings and spending.</p>
                  ) : (
                    <ul className="mini-list">
                      {w.items.map((it) => (
                        <li
                          key={`${it.kind}-${it.id}-${it.date}`}
                          className={`mini-list__row${it.paid ? ' mini-list__row--paid' : ''}`}
                        >
                          <span className="mini-list__date">{formatDate(it.date, 'short')}</span>
                          <span className="mini-list__name ellipsis">
                            <span aria-hidden="true">{it.emoji} </span>
                            {it.name}
                            {it.paid && <span className="badge badge--paid mini-list__badge">Paid ✓</span>}
                          </span>
                          <Money cents={it.amount} className="mini-list__amt" />
                        </li>
                      ))}
                    </ul>
                  )}

                  <dl className="window-card__totals">
                    <div>
                      <dt>Total due</dt>
                      <dd>
                        <Money cents={w.total} />
                      </dd>
                    </div>
                    <div className={w.shortBy > 0 ? 'is-short' : 'is-left'}>
                      <dt>Left from this paycheck</dt>
                      <dd className={w.shortBy > 0 ? 'tone-over' : 'tone-left'}>
                        <Money cents={w.left} />
                      </dd>
                    </div>
                  </dl>
                  {w.shortBy > 0 && (
                    <p className="notice notice--over">
                      <span>
                        ⚠️ This paycheck is short by <Money cents={w.shortBy} />. Set aside{' '}
                        <Money cents={w.shortBy} /> from the paycheck before.
                      </span>
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ol>
          <p className="footnote">
            Only bills and minimum debt payments are listed. Savings and fun money come out of what's left.
          </p>
        </>
      )}
    </div>
  );
}

