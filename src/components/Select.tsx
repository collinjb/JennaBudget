import { useId, type CSSProperties, type ReactNode } from 'react';
import { Field } from './Field';
import { IconCheck, IconChevronDown } from './Icons';

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** ChoiceList only: a decorative icon in front of the label (hidden from screen readers). */
  emoji?: string;
}

interface SelectProps<T extends string> {
  label: ReactNode;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  helper?: ReactNode;
  /** Decorative mark shown before the chosen option (e.g. its emoji); hidden from screen readers. */
  decoration?: ReactNode;
}

/** Native select (iPhone shows its picker wheel), styled like the other fields. */
export function Select<T extends string>({ label, value, options, onChange, helper, decoration }: SelectProps<T>) {
  return (
    <Field label={label} helper={helper}>
      {({ inputId, describedBy }) => (
        <div className="field__control field__control--select">
          {decoration && (
            <span className="field__prefix field__prefix--deco" aria-hidden="true">
              {decoration}
            </span>
          )}
          <select
            id={inputId}
            className="input input--select"
            value={value}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value as T)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <IconChevronDown size={18} className="field__chev" />
        </div>
      )}
    </Field>
  );
}

interface SegmentedProps<T extends string> {
  label: ReactNode;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  helper?: ReactNode;
}

/** iOS segmented control built from real radio buttons (arrow keys work, VoiceOver reads "1 of 3"). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  helper,
}: SegmentedProps<T>) {
  const id = useId();
  const helpId = helper ? `${id}-help` : undefined;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <fieldset className="seg-field" aria-describedby={helpId}>
      <legend className={hideLabel ? 'sr-only' : 'field__label'}>{label}</legend>
      <div className="seg" style={{ '--seg-count': options.length, '--seg-index': index } as CSSProperties}>
        <span className="seg__thumb" aria-hidden="true" />
        {options.map((o) => (
          <label key={o.value} className="seg__opt">
            <input
              type="radio"
              className="seg__input"
              name={id}
              value={o.value}
              checked={o.value === value}
              aria-describedby={helpId}
              onChange={() => onChange(o.value)}
            />
            <span className="seg__text">{o.label}</span>
          </label>
        ))}
      </div>
      {helper && (
        <p className="field__helper" id={helpId}>
          {helper}
        </p>
      )}
    </fieldset>
  );
}

interface ChoiceListProps<T extends string> {
  label: ReactNode;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}

/** Big, friendly vertical list of choices (one per row, with a check on the selected one). */
export function ChoiceList<T extends string>({ label, value, options, onChange, hideLabel }: ChoiceListProps<T>) {
  const id = useId();
  return (
    <fieldset className="choices">
      <legend className={hideLabel ? 'sr-only' : 'field__label'}>{label}</legend>
      <div className="choices__list">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label key={o.value} className={`choice${checked ? ' choice--on' : ''}`}>
              <input
                type="radio"
                className="choice__input"
                name={id}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
              />
              {o.emoji && (
                <span className="choice__emoji" aria-hidden="true">
                  {o.emoji}
                </span>
              )}
              <span className="choice__text">
                <span className="choice__label">{o.label}</span>
                {o.hint && <span className="choice__hint">{o.hint}</span>}
              </span>
              <span className="choice__check" aria-hidden="true">
                {checked && <IconCheck size={18} />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
