import { useId, type ReactNode } from 'react';
import { IconCheck, IconPlus } from './Icons';

interface ChipProps {
  label: string;
  emoji?: string;
  onClick: () => void;
  /** Shows a check (and aria-pressed) when the chip is "on". */
  selected?: boolean;
  /** Show a small "+" when the chip adds something. */
  adds?: boolean;
}

/** Pill-shaped quick-pick button, at least 44px tall. */
export function Chip({ label, emoji, onClick, selected, adds }: ChipProps) {
  return (
    <button
      type="button"
      className={`chip${selected ? ' chip--on' : ''}`}
      onClick={onClick}
      aria-pressed={selected === undefined ? undefined : selected}
    >
      {emoji && (
        <span className="chip__emoji" aria-hidden="true">
          {emoji}
        </span>
      )}
      <span className="chip__label">{label}</span>
      {selected ? <IconCheck size={16} /> : adds ? <IconPlus size={14} className="chip__plus" /> : null}
    </button>
  );
}

/** A wrapping row of chips. `title` shows a small visible heading (and names the group). */
export function ChipRow({ children, label, title }: { children: ReactNode; label?: string; title?: string }) {
  const id = useId();
  return (
    <div className="chip-group">
      {title && (
        <p className="field__label" id={id}>
          {title}
        </p>
      )}
      <div className="chip-row" role="group" aria-label={title ? undefined : label} aria-labelledby={title ? id : undefined}>
        {children}
      </div>
    </div>
  );
}
