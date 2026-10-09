import { IconWarning } from '../components/Icons';
import { Money } from '../components/Money';
import type { InterestWarning } from '../lib/debt';
import { ceilDollars } from '../lib/money';
import type { Cents } from '../types';

/**
 * "This debt never gets paid off on its own", worded for the actual cause (Home and Debt).
 * `paysOffLater`: the whole plan still clears it (once other debts are gone, their payments roll over to it).
 */
export function InterestWarningNotice({ warning: w, paysOffLater }: { warning: InterestWarning; paysOffLater: boolean }) {
  return (
    <p className="notice notice--warn" role="note">
      <IconWarning size={18} />
      <span>
        <strong>{w.name}:</strong>{' '}
        {w.kind === 'no-payment' ? (
          <>There's no monthly payment set, so this balance never gets paid down.</>
        ) : w.kind === 'flat' ? (
          <>
            Your <Money cents={w.minPayment} /> payment only covers the interest, so this balance won't go down.
          </>
        ) : (
          <>
            Your <Money cents={w.minPayment} /> payment doesn't cover the <Money cents={w.monthlyInterest} /> of
            interest each month, so this balance will keep growing.
          </>
        )}
        {paysOffLater && ' Your plan still pays it off later, once extra money goes to it.'}
      </span>
    </p>
  );
}

/** "⚠️ This paycheck is short by $210. Set aside $210 from the paycheck before." (Home and Paycheck Plan) */
export function ShortByNotice({ shortBy, className }: { shortBy: Cents; className?: string }) {
  return (
    <p className={['notice notice--over', className].filter(Boolean).join(' ')}>
      <span>
        <span aria-hidden="true">⚠️ </span>
        This paycheck is short by{' '}
        <strong>
          <Money cents={shortBy} />
        </strong>
        . Set aside <Money cents={shortBy} /> from the paycheck before.
      </span>
    </p>
  );
}

/** Heading for "the savings goals with dates don't fit" (Home plan card and Smart Plan). */
export const GOALS_SHORT_TITLE = 'Your savings goals need more than you have';

/**
 * "Your savings goals with dates need $X more each month than you have after bills. Pushing a date back or lowering a
 * goal would help." (rounded up, so a few cents never read "$0 more").
 */
export function GoalsShortText({ shortfall, className }: { shortfall: Cents; className?: string }) {
  return (
    <p className={className} data-testid="goals-shortfall">
      Your savings goals with dates need{' '}
      <strong>
        <Money cents={ceilDollars(shortfall)} showCents="never" /> more
      </strong>{' '}
      each month than you have after bills. Pushing a date back or lowering a goal would help.
    </p>
  );
}
