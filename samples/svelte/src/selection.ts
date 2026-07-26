/**
 * The Inspector's model — the visible destination for `pointclick`.
 *
 * A `PointEvent` carries no colour and no card context, so the handler in
 * App.svelte packages the event with the series list it came from (to resolve
 * the palette slot) and the card's own title/formatter.
 */

import type { PointEvent, SeriesOptions } from '@chartcraft/svelte';

import { formatNumber } from './data';
import type { ChartSpecs } from './specs';

/** Cards whose points feed the inspector. */
export type InspectableKey = Extract<
  keyof ChartSpecs,
  'mrr' | 'segments' | 'contracts' | 'tickets'
>;

export interface Selection {
  cardTitle: string;
  ev: PointEvent;
  format: (n: number) => string;
  /** The source chart's series, so the swatch can resolve its palette slot. */
  series: SeriesOptions[];
}

const usd = (n: number): string => `$${formatNumber(Math.round(n))}`;
const usdK = (n: number): string => `$${formatNumber(Math.round(n))}K`;

export const INSPECTABLE: Record<
  InspectableKey,
  { title: string; format: (n: number) => string }
> = {
  mrr: { title: 'Recurring revenue', format: usd },
  segments: { title: 'Revenue by segment', format: usdK },
  contracts: { title: 'Contract value', format: usdK },
  tickets: { title: 'Support load', format: (n) => `${formatNumber(n)} tickets` },
};

export function formatX(x: PointEvent['x']): string {
  if (x === null) return '—';
  if (x instanceof Date) {
    return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (typeof x === 'number') return formatNumber(x);
  return x;
}
