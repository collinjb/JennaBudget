import type { HTMLAttributes, ReactNode } from 'react';
import { IconChevronRight } from './Icons';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  children: ReactNode;
  /** Optional heading shown at the top of the card (h2 by default). */
  title?: ReactNode;
  headingLevel?: 2 | 3;
  /** Right side of the heading row (e.g. a total). */
  aside?: ReactNode;
  tone?: 'default' | 'warn' | 'over' | 'info' | 'good';
  /**
   * Makes the whole card tappable through one real button (a "stretched" button at the bottom of the card),
   * so screen readers still read the card content normally.
   */
  action?: { label: string; onClick: () => void; testId?: string };
  flush?: boolean;
}

export function Card({
  children,
  title,
  headingLevel = 2,
  aside,
  tone = 'default',
  action,
  flush,
  className,
  ...rest
}: CardProps) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const cls = ['card', `card--${tone}`, action ? 'card--tap' : '', flush ? 'card--flush' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <section className={cls} {...rest}>
      {(title || aside) && (
        <div className="card__head">
          {title && <H className="card__title">{title}</H>}
          {aside && <div className="card__aside">{aside}</div>}
        </div>
      )}
      {children}
      {action && (
        <button type="button" className="card__action" onClick={action.onClick} data-testid={action.testId}>
          <span>{action.label}</span>
          <IconChevronRight size={18} />
        </button>
      )}
    </section>
  );
}
