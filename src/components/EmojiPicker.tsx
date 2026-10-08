import { useId, useState } from 'react';
import { EMOJI_CHOICES } from '../lib/presets';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  /** What the emoji is for, used in the button's accessible name. */
  label?: string;
}

/** A big emoji button that opens a grid of choices right below it (no hover, no popover). */
export function EmojiPicker({ value, onChange, label = 'icon' }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const gridId = useId();
  const choices = EMOJI_CHOICES.includes(value) || !value ? EMOJI_CHOICES : [value, ...EMOJI_CHOICES];
  return (
    <div className="emoji-picker">
      <button
        type="button"
        className="emoji-picker__button"
        aria-expanded={open}
        aria-controls={gridId}
        aria-label={`Change ${label}, now ${value || 'none'}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="emoji-picker__current" aria-hidden="true">
          {value || '🙂'}
        </span>
        <span className="emoji-picker__hint" aria-hidden="true">
          {open ? 'Done' : 'Icon'}
        </span>
      </button>
      {open && (
        <div className="emoji-picker__grid" id={gridId} role="group" aria-label={`Choose an ${label}`}>
          {choices.map((e) => (
            <button
              key={e}
              type="button"
              className={`emoji-picker__choice${e === value ? ' is-selected' : ''}`}
              aria-pressed={e === value}
              aria-label={e}
              onClick={() => {
                onChange(e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
