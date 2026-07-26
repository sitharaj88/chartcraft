/**
 * ChartCard — the card chrome shared by every panel on the board.
 *
 * The visible title is a real <h2> in the document outline, NOT a canvas
 * `title` option: card chrome owns the heading, the chart owns `a11y.title`.
 */

import type { ReactNode } from 'react';

/** Column spans that exist in styles.css (`.card--span-*`). */
export type Span = 3 | 4 | 5 | 7 | 8;

export interface ChartCardProps {
  title: string;
  subtitle: string;
  span: Span;
  /** Taller plot for the hero card. */
  hero?: boolean;
  /** Right-hand slot in the card head — e.g. the Reset zoom button. */
  action?: ReactNode;
  /** Announce content changes (the Inspector card). */
  live?: boolean;
  children: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  span,
  hero = false,
  action,
  live = false,
  children,
}: ChartCardProps) {
  return (
    <article
      className={`card${hero ? ' card--hero' : ''} card--span-${span}`}
      aria-live={live ? 'polite' : undefined}
    >
      <div className="card__head">
        <div>
          <h2 className="card__title">{title}</h2>
          <p className="card__subtitle">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}
