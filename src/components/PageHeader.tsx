import type { ReactNode } from 'react';
import { IconChevronLeft, IconPlus } from './Icons';

interface PageHeaderProps {
  title: ReactNode;
  /** The one-line explanation under the title. */
  subtitle?: ReactNode;
  /** Shows "‹ Back" above the title (full-screen pages). */
  onBack?: () => void;
  backLabel?: string;
  /** Right-side content of the title row (e.g. gear button). */
  right?: ReactNode;
  /** Shortcut for a "+ Add" pill on the right. */
  onAdd?: () => void;
  addLabel?: string;
}

/** Big bold title (iOS "large title") + one-line explanation. */
export function PageHeader({ title, subtitle, onBack, backLabel = 'Back', right, onAdd, addLabel = 'Add' }: PageHeaderProps) {
  return (
    <header className="page-header">
      {onBack && (
        <div className="page-header__nav">
          <button type="button" className="back-btn" onClick={() => onBack()}>
            <IconChevronLeft size={22} />
            <span>{backLabel}</span>
          </button>
        </div>
      )}
      <div className="page-header__row">
        {/* tabIndex -1: focus moves here when a page opens, or when the thing that had focus is gone. */}
        <h1 className="page-header__title" tabIndex={-1}>
          {title}
        </h1>
        {right}
        {onAdd && (
          <button type="button" className="add-pill" onClick={onAdd} aria-label={addLabel}>
            <IconPlus size={18} />
            <span aria-hidden="true">Add</span>
          </button>
        )}
      </div>
      {subtitle && <p className="page-header__sub">{subtitle}</p>}
    </header>
  );
}
