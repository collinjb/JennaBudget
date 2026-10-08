import { formatMoney } from '../lib/money';
import type { Cents } from '../types';

interface MoneyProps {
  cents: Cents;
  /** 'auto' (default): cents only when non-zero. 'never': whole dollars. */
  showCents?: 'auto' | 'always' | 'never';
  /** Prefix "≈ " for estimated monthly figures. */
  approx?: boolean;
  className?: string;
  testId?: string;
}

/** A formatted dollar amount. Always integer cents in, `formatMoney` out. */
export function Money({ cents, showCents = 'auto', approx, className, testId }: MoneyProps) {
  return (
    <span className={['money', className].filter(Boolean).join(' ')} data-testid={testId} data-cents={cents}>
      {approx ? '≈ ' : ''}
      {formatMoney(cents, { showCents })}
    </span>
  );
}
