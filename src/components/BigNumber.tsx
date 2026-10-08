import type { ReactNode } from 'react';

interface BigNumberProps {
  /** Small label above the number. */
  label?: ReactNode;
  /** The big value (already formatted). */
  children: ReactNode;
  /** Meaning color of the number. */
  tone?: 'left' | 'over' | 'bills' | 'debt' | 'savings' | 'fun' | 'plain';
  /** Small line below the number. */
  caption?: ReactNode;
  size?: 'xl' | 'lg' | 'md';
  testId?: string;
  cents?: number;
}

/** A big, bold number with a label. */
export function BigNumber({ label, children, tone = 'plain', caption, size = 'lg', testId, cents }: BigNumberProps) {
  return (
    <div className={`bignum bignum--${size}`}>
      {label && <p className="bignum__label">{label}</p>}
      <p className={`bignum__value tone-${tone}`} data-testid={testId} data-cents={cents}>
        {children}
      </p>
      {caption && <p className="bignum__caption">{caption}</p>}
    </div>
  );
}
