import type { ReactNode } from 'react';
import { isValidISODate, ordinal } from '../lib/dates';
import { MAX_STORED_DATE, MIN_STORED_DATE } from '../storage/storage';
import { Field } from './Field';
import { IconChevronDown } from './Icons';

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
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Day of the month 1..31. 29–31 fall on the last day of shorter months. */
export function DayPicker({ label, value, onChange, helper, lastDayLabel = 'last day of the month' }: DayPickerProps) {
  return (
    <Field label={label} helper={helper}>
      {({ inputId, describedBy }) => (
        <div className="field__control field__control--select">
          <select
            id={inputId}
            className="input input--select"
            value={value}
            aria-describedby={describedBy}
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
