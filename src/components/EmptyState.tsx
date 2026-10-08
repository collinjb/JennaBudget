import { IconPlus } from './Icons';

interface EmptyStateProps {
  emoji: string;
  text: string;
  buttonLabel: string;
  onClick: () => void;
  compact?: boolean;
}

/** Friendly empty list: an emoji, one sentence, one big button. */
export function EmptyState({ emoji, text, buttonLabel, onClick, compact }: EmptyStateProps) {
  return (
    <div className={`empty${compact ? ' empty--compact' : ''}`}>
      <div className="empty__emoji" aria-hidden="true">
        {emoji}
      </div>
      <p className="empty__text">{text}</p>
      <button type="button" className="btn btn--primary btn--block" onClick={onClick}>
        <IconPlus size={20} />
        {buttonLabel}
      </button>
    </div>
  );
}
