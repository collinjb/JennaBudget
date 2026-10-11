import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { IconCheck, IconWarning } from '../components/Icons';
import { Money } from '../components/Money';
import { rightNow } from '../lib/cash';
import { formatDate } from '../lib/dates';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Account } from '../types';
import { useNav } from './nav';
import { AccountBalanceSheet, AccountSheet } from './NetWorthPage';
import { itemsText, paydayLabel } from './notices';

/**
 * "Right now": the money in checking, what it has to cover before paychecks catch up (bills due before the next
 * payday, plus anything the upcoming paychecks can't cover, like an early-month car payment), and what's safe to save
 * or spend today. Uses the checking account(s) from Net worth; one tap updates the balance.
 */
export function RightNowCard() {
  const { data } = useBudget();
  const today = useToday();
  const nav = useNav();
  const now = useMemo(() => rightNow(data, today), [data, today]);
  const [sheet, setSheet] = useState<{ kind: 'add' } | { kind: 'update'; account: Account } | null>(null);

  const update = () => {
    if (!now) return;
    if (now.accounts.length === 1) setSheet({ kind: 'update', account: now.accounts[0] });
    else nav.openPage('networth');
  };

  return (
    <>
      {now ? (
        <Card title="Right now" className="right-now" data-testid="right-now">
          <div className="right-now__checking">
            <p className="right-now__label">
              In checking
              <span className="muted small right-now__when">
                {now.updatedAt === today
                  ? ' · updated today'
                  : now.updatedAt
                    ? ` · as of ${formatDate(now.updatedAt, 'short')}`
                    : ''}
              </span>
            </p>
            <p className="right-now__amount" data-testid="right-now-checking" data-cents={now.checking}>
              <Money cents={now.checking} />
            </p>
            <button type="button" className="btn btn--secondary btn--sm right-now__update" onClick={update}>
              Update
            </button>
          </div>

          {now.dueItems.length > 0 && (
            <p className="right-now__line">
              <span>
                Bills before your next paycheck
                {now.nextPayday ? <> ({paydayLabel(now.nextPayday)})</> : null}: {itemsText(now.dueItems)}
              </span>
              <Money cents={now.dueBeforeNext} className="right-now__line-amt" />
            </p>
          )}
          {now.keepForLater > 0 && (
            <p className="right-now__line">
              <span>Keep for bills your upcoming paychecks can't cover</span>
              <Money cents={now.keepForLater} className="right-now__line-amt" />
            </p>
          )}

          {now.shortNow > 0 ? (
            <p className="notice notice--over" data-testid="right-now-short">
              <IconWarning size={18} />
              <span>
                Your checking is{' '}
                <strong>
                  <Money cents={now.shortNow} /> short
                </strong>{' '}
                of what's due before your paychecks catch up.
              </span>
            </p>
          ) : (
            <p className="safe-to-save__amount" data-testid="right-now-safe" data-cents={now.safeNow}>
              <IconCheck size={16} />
              <span>
                Safe to save or spend right now:{' '}
                <strong>
                  <Money cents={now.safeNow} />
                </strong>
              </span>
            </p>
          )}
          {now.updatedAt !== today && (
            <p className="muted small right-now__stale">Update your checking balance for today's number.</p>
          )}
        </Card>
      ) : (
        <Card title="Right now" className="right-now right-now--empty" data-testid="right-now">
          <p className="muted small">
            Add what's in your checking account, and we'll show what's safe to save or spend today after the bills due
            before your next paycheck.
          </p>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setSheet({ kind: 'add' })}>
            Add my checking balance
          </button>
        </Card>
      )}

      {sheet?.kind === 'add' && (
        <AccountSheet account={null} today={today} defaultType="checking" onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'update' && (
        <AccountBalanceSheet account={sheet.account} today={today} onClose={() => setSheet(null)} />
      )}
    </>
  );
}
