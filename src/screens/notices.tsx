import { IconCheck, IconWarning } from '../components/Icons';
import { Money } from '../components/Money';
import { formatDate } from '../lib/dates';
import type { InterestWarning } from '../lib/debt';
import type { PayDay, PaycheckWindow, PlanItem } from '../lib/schedule';
import { ceilDollars } from '../lib/money';
import type { Cents, ISODate } from '../types';

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

/** "Owens Paycheck" / "Owens Paycheck + Collin Games": which incomes pay on a payday. */
export function paydayNames(p: PayDay): string {
  return p.sources.map((s) => s.name).join(' + ');
}

/** "Fri, Oct 30 (Collin Games)": a payday named by date and by which paycheck it is. */
export function paydayLabel(p: PayDay): string {
  return `${formatDate(p.date, 'weekday')} (${paydayNames(p)})`;
}

/** "Car Loan on Nov 5" / "Car Loan on Nov 5 and Phone on Nov 6" (at most two named, then "and more"). */
export function itemsText(items: PlanItem[]): string {
  const named = items.slice(0, 2).map((it) => `${it.name} on ${formatDate(it.date, 'short')}`);
  if (items.length > 2) named.push('more');
  return named.join(named.length > 2 ? ', ' : ' and ').replace(', more', ', and more');
}

/**
 * "⚠️ This paycheck is short by $100. It's covered by $100 kept from your Fri, Oct 23 paycheck." — or, when no earlier
 * paycheck covers it, "Keep $100 from money you already have." (Home and Paycheck Plan)
 */
export function ShortByNotice({
  shortBy,
  coveredBy,
  className,
}: {
  shortBy: Cents;
  coveredBy?: ISODate | null;
  className?: string;
}) {
  return (
    <p className={['notice', coveredBy ? 'notice--info' : 'notice--over', className].filter(Boolean).join(' ')}>
      <span>
        <span aria-hidden="true">{coveredBy ? 'ℹ️ ' : '⚠️ '}</span>
        This paycheck is short by{' '}
        <strong>
          <Money cents={shortBy} />
        </strong>
        .{' '}
        {coveredBy ? (
          <>It's covered by money kept from your {formatDate(coveredBy, 'weekday')} paycheck.</>
        ) : (
          <>
            Keep <Money cents={shortBy} /> from money you already have.
          </>
        )}
      </span>
    </p>
  );
}

/**
 * What's safe to move to savings or spend from a paycheck, after the bills before the next payday and any money kept
 * for a later bill the next paycheck can't cover (like a car payment on the 5th). (Home and Paycheck Plan)
 */
export function SafeToSave({ paycheckWindow: w, className }: { paycheckWindow: PaycheckWindow; className?: string }) {
  return (
    <div className={['safe-to-save', className].filter(Boolean).join(' ')} data-testid="safe-to-save">
      {w.holdForLater > 0 && (
        <p className="safe-to-save__keep">
          Keep{' '}
          <strong>
            <Money cents={w.holdForLater} />
          </strong>{' '}
          of it for {itemsText(w.holdFor)}, since{' '}
          {w.holdForPayday ? (
            <>
              your {formatDate(w.holdForPayday.date, 'weekday')} payday ({paydayNames(w.holdForPayday)},{' '}
              <Money cents={w.holdForPayday.amount} />) can't cover it.
            </>
          ) : (
            <>your next paycheck can't cover it.</>
          )}
        </p>
      )}
      <p className="safe-to-save__amount">
        <IconCheck size={16} />
        <span>
          Safe to save or spend:{' '}
          <strong>
            <Money cents={w.safeToSave} />
          </strong>
        </span>
      </p>
    </div>
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
