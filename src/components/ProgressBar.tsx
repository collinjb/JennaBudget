interface ProgressBarProps {
  /** 0..100 */
  percent: number;
  tone?: 'savings' | 'bills' | 'debt' | 'fun' | 'left' | 'over' | 'warn';
  /** Accessible name, e.g. "Florida Trip progress". */
  label: string;
  /** Spoken value, e.g. "$400 of $1,500". */
  valueText?: string;
  size?: 'sm' | 'md';
  testId?: string;
}

export function ProgressBar({ percent, tone = 'savings', label, valueText, size = 'md', testId }: ProgressBarProps) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className={`progress progress--${size}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-valuetext={valueText}
      data-testid={testId}
    >
      <div className={`progress__fill fill-${tone}`} style={{ width: `${p}%` }} />
    </div>
  );
}
