import { useState, type ReactNode, type Ref } from 'react';
import { centsToInput, MONEY_ERRORS, parseMoney } from '../lib/money';
import type { Cents } from '../types';
import { Field } from './Field';

interface MoneyInputProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  helper?: ReactNode;
  error?: string | null;
  placeholder?: string;
  hideLabel?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Text after the field, e.g. "/mo". */
  suffix?: string;
  big?: boolean;
  className?: string;
}

/**
 * Money field: type="text" + inputmode="decimal" (iPhone shows the number pad with a decimal point).
 * Accepts "$1,234.56", "1234.5" or "1234". Parsing happens in `useMoneyField` with lib `parseMoney`.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  onBlur,
  helper,
  error,
  placeholder = '0',
  hideLabel,
  inputRef,
  suffix,
  big,
  className,
}: MoneyInputProps) {
  return (
    <Field label={label} helper={helper} error={error} hideLabel={hideLabel} className={className}>
      {({ inputId, describedBy, invalid }) => (
        <div className={`field__control field__control--money${big ? ' field__control--big' : ''}`}>
          <span className="field__prefix" aria-hidden="true">
            $
          </span>
          <input
            ref={inputRef}
            id={inputId}
            className="input input--money"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={placeholder}
            value={value}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          />
          {suffix && (
            <span className="field__suffix" aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

export interface MoneyFieldOptions {
  /** Empty is an error (otherwise empty means $0). */
  required?: boolean;
  /** $0 is allowed (default true). */
  allowZero?: boolean;
  max?: Cents;
}

/**
 * State + validation for one money field. Errors show on blur (when something was typed) and on Save.
 * `validate()` returns cents, or null after showing an inline error.
 */
export function useMoneyField(initial: Cents | null | undefined, opts: MoneyFieldOptions = {}) {
  const [value, setValue] = useState(() => (initial == null ? '' : centsToInput(initial)));
  const [error, setError] = useState<string | null>(null);

  const check = (v: string) => checkMoney(v, opts);

  return {
    value,
    error,
    setValue: (v: string) => {
      setValue(v);
      if (error) setError(null);
    },
    setError,
    /** Current parsed value without showing errors (null when invalid/empty-required). */
    peek: (): Cents | null => check(value).cents,
    validate: (): Cents | null => {
      const r = check(value);
      setError(r.error);
      return r.cents;
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

/** One-shot check of a money string (for lists of rows where a hook per field doesn't fit). */
export function checkMoney(value: string, opts: MoneyFieldOptions = {}): { cents: Cents | null; error: string | null } {
  if (value.trim() === '') {
    return opts.required ? { cents: null, error: MONEY_ERRORS.empty } : { cents: 0, error: null };
  }
  const r = parseMoney(value, { allowZero: opts.allowZero ?? true, max: opts.max });
  return r.ok ? { cents: r.cents, error: null } : { cents: null, error: r.error };
}
