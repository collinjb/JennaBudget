import { useId, type ReactNode } from 'react';
import { isValidISODate, ordinal } from '../lib/dates';
import { MAX_STORED_DATE, MIN_STORED_DATE } from '../storage/storage';
import { Field } from './Field';
import { IconChevronDown, IconWarning } from './Icons';

interface DateInputProps {
  label: ReactNode;
  /** 'YYYY-MM-DD' or '' */
  value: string;
  onChange: (value: string) => void;
  helper?: ReactNode;
  error?: string | null;
  min?: string;
  max?: string;
}

/** A real calendar date the app can store (years 1900–2999). */
export function isUsableDate(v: string): boolean {
  return isValidISODate(v) && v >= MIN_STORED_DATE && v <= MAX_STORED_DATE;
}

/** Native date picker (the iPhone shows its date wheel). Value stays a local 'YYYY-MM-DD' string. */
export function DateInput({
  label,
  value,
  onChange,
  helper,
  error,
  min = MIN_STORED_DATE,
  max = MAX_STORED_DATE,
}: DateInputProps) {
  return (
    <Field label={label} helper={helper} error={error}>
      {({ inputId, describedBy, invalid }) => (
        <div className="field__control field__control--date">
          <input
            id={inputId}
            className="input input--date"
            type="date"
            value={value}
            min={min}
            max={max}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </Field>
  );
}

interface DayPickerProps {
  label: ReactNode;
  value: number;
  onChange: (day: number) => void;
  helper?: ReactNode;
  /** Wording for day 31 (default "31st or last day"). */
  lastDayLabel?: string;
  /** Marks the select invalid and points it at an error shown elsewhere (e.g. under a pair of pickers). */
  invalid?: boolean;
  errorId?: string;
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Day of the month 1..31. 29–31 fall on the last day of shorter months. */
export function DayPicker({
  label,
  value,
  onChange,
  helper,
  lastDayLabel = 'last day of the month',
  invalid,
  errorId,
}: DayPickerProps) {
  return (
    <Field label={label} helper={helper}>
      {({ inputId, describedBy }) => (
        <div className="field__control field__control--select">
          <select
            id={inputId}
            className="input input--select"
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={[invalid ? errorId : undefined, describedBy].filter(Boolean).join(' ') || undefined}
            onChange={(e) => onChange(Number(e.target.value))}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d === 31 ? `${ordinal(d)} (${lastDayLabel})` : `The ${ordinal(d)}`}
              </option>
            ))}
          </select>
          <IconChevronDown size={18} className="field__chev" />
        </div>
      )}
    </Field>
  );
}

/**
 * Problem with a twice-a-month pair of paydays, or null. The same day twice, or days that can land on the same date
 * (29/31 are both the 28th in February) or close together, are rejected.
 */
export function semimonthlyDaysError(days: readonly [number, number]): string | null {
  if (days[0] === days[1]) return 'Please pick two different days.';
  if (Math.abs(days[0] - days[1]) < 7) return 'Please pick days at least a week apart.';
  return null;
}

/** The two paydays for "twice a month", with one shared error under both pickers. */
export function DayPairField({
  days,
  onChange,
  error,
}: {
  days: [number, number];
  onChange: (days: [number, number]) => void;
  error?: string | null;
}) {
  const errorId = useId();
  return (
    <div className={`field-group${error ? ' field--error' : ''}`}>
      <div className="field-row">
        <DayPicker
          label="First payday"
          lastDayLabel="last day"
          value={days[0]}
          invalid={!!error}
          errorId={errorId}
          onChange={(d) => onChange([d, days[1]])}
        />
        <DayPicker
          label="Second payday"
          lastDayLabel="last day"
          value={days[1]}
          invalid={!!error}
          errorId={errorId}
          onChange={(d) => onChange([days[0], d])}
        />
      </div>
      {error && (
        <p className="field__error" id={errorId}>
          <IconWarning size={16} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
