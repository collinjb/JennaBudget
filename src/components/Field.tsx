import { useId, type ReactNode, type Ref } from 'react';
import { IconWarning } from './Icons';

export interface FieldIds {
  inputId: string;
  describedBy: string | undefined;
  invalid: boolean;
}

interface FieldProps {
  label: ReactNode;
  helper?: ReactNode;
  error?: string | null;
  /** Visually hide the label (it is still read by screen readers). */
  hideLabel?: boolean;
  className?: string;
  children: (ids: FieldIds) => ReactNode;
  id?: string;
}

/** Label + control + helper text + inline error. Every input in the app goes through this. */
export function Field({ label, helper, error, hideLabel, className, children, id }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? `f${autoId}`;
  const helperId = `${inputId}-help`;
  const errorId = `${inputId}-err`;
  const describedBy = [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['field', error ? 'field--error' : '', className ?? ''].filter(Boolean).join(' ')}>
      <label className={hideLabel ? 'sr-only' : 'field__label'} htmlFor={inputId}>
        {label}
      </label>
      {children({ inputId, describedBy, invalid: !!error })}
      {error && (
        <p className="field__error" id={errorId} role="alert">
          <IconWarning size={16} />
          <span>{error}</span>
        </p>
      )}
      {helper && (
        <p className="field__helper" id={helperId}>
          {helper}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: ReactNode;
  error?: string | null;
  maxLength?: number;
  hideLabel?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  autoCapitalize?: 'words' | 'sentences' | 'none';
  className?: string;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  error,
  maxLength = 40,
  hideLabel,
  inputRef,
  autoCapitalize = 'words',
  className,
}: TextFieldProps) {
  return (
    <Field label={label} helper={helper} error={error} hideLabel={hideLabel} className={className}>
      {({ inputId, describedBy, invalid }) => (
        <div className="field__control">
          <input
            ref={inputRef}
            id={inputId}
            className="input"
            type="text"
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            autoComplete="off"
            autoCapitalize={autoCapitalize}
            enterKeyHint="next"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </Field>
  );
}

interface ToggleProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helper?: ReactNode;
}

/** iOS-style switch backed by a real checkbox (role="switch"). */
export function Toggle({ label, checked, onChange, helper }: ToggleProps) {
  const id = useId();
  return (
    <div className="toggle-row">
      <label className="toggle" htmlFor={id}>
        <span className="toggle__label">{label}</span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="toggle__input"
          checked={checked}
          aria-describedby={helper ? `${id}-help` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle__track" aria-hidden="true">
          <span className="toggle__thumb" />
        </span>
      </label>
      {helper && (
        <p className="field__helper" id={`${id}-help`}>
          {helper}
        </p>
      )}
    </div>
  );
}

/** Trim a name; fall back to a default when blank. Max 40 characters. */
export function cleanName(value: string, fallback: string): string {
  const v = value.trim().replace(/\s+/g, ' ').slice(0, 40);
  return v || fallback;
}
