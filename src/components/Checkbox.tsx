import { useId } from 'react';
import { IconCheck } from './Icons';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Full accessible label, e.g. "Rent paid". */
  label: string;
  /** Short visible caption under the circle, e.g. "Paid". */
  caption?: string;
  testId?: string;
}

/** Big round checkbox (like Reminders) with a 44pt+ target. A real checkbox underneath. */
export function Checkbox({ checked, onChange, label, caption, testId }: CheckboxProps) {
  const id = useId();
  return (
    <label className={`check${checked ? ' check--on' : ''}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="check__input"
        checked={checked}
        aria-label={label}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="check__box" aria-hidden="true">
        <IconCheck size={18} />
      </span>
      {caption && (
        <span className="check__caption" aria-hidden="true">
          {caption}
        </span>
      )}
    </label>
  );
}
