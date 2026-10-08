import { useState, type ReactNode } from 'react';
import { parseRate, rateToInput } from '../lib/money';
import { Field } from './Field';

interface RateInputProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  helper?: ReactNode;
  error?: string | null;
}

/** Interest rate field ("6.8" or "24.99"), with a % sign inside the box. */
export function RateInput({ label, value, onChange, onBlur, helper, error }: RateInputProps) {
  return (
    <Field label={label} helper={helper} error={error}>
      {({ inputId, describedBy, invalid }) => (
        <div className="field__control field__control--rate">
          <input
            id={inputId}
            className="input input--rate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0"
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          />
          <span className="field__suffix" aria-hidden="true">
            %
          </span>
        </div>
      )}
    </Field>
  );
}

/** State + validation for a rate field. Empty means 0%. Returns basis points or null. */
export function useRateField(initialBps: number | null | undefined) {
  const [value, setValue] = useState(() => (initialBps == null || initialBps === 0 ? '' : rateToInput(initialBps)));
  const [error, setError] = useState<string | null>(null);
  const check = (v: string): { bps: number | null; error: string | null } => {
    if (v.trim() === '') return { bps: 0, error: null };
    const r = parseRate(v);
    return r.ok ? { bps: r.bps, error: null } : { bps: null, error: r.error };
  };
  return {
    value,
    error,
    validate: (): number | null => {
      const r = check(value);
      setError(r.error);
      return r.bps;
    },
    props: {
      value,
      error,
      onChange: (v: string) => {
        setValue(v);
        if (error) setError(null);
      },
      onBlur: () => {
        if (value.trim() === '') return;
        setError(check(value).error);
      },
    },
  };
}
