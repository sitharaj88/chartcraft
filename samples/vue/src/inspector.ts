/**
 * Northwind Cloud — the `pointclick` → Inspector plumbing.
 *
 * Pure functions only, so `App.vue` can turn a stored `PointEvent` into a
 * displayable row set inside a `computed`. That matters for the swatch: the
 * palette is theme-dependent, so the colour must be DERIVED rather than
 * captured at click time — otherwise a theme toggle leaves a stale swatch
 * next to a re-coloured series.
 */
import { categoricalPalette } from '@chartcraft/core';
import type { PointEvent, SeriesOptions } from '@chartcraft/core';

import { formatNumber } from './data';
import type { Scheme } from './specs';

/** The four cards whose points feed the inspector. */
export type InspectableId = 'mrr' | 'segments' | 'contracts' | 'tickets';

export interface Selection {
  chartId: InspectableId;
  ev: PointEvent;
}

/** Everything the panel renders, already formatted. */
export interface InspectorEntry {
  seriesName: string;
  swatch: string;
  value: string;
  rows: [term: string, definition: string][];
}

/**
 * `PointEvent` carries no colour, so resolve the series' palette slot the same
 * way the renderer does: explicit `series.color` wins, otherwise the slot at
 * the series' index, wrapping.
 */
export function seriesColor(
  series: readonly SeriesOptions[],
  seriesId: string,
  scheme: Scheme,
): string {
  const index = series.findIndex((s) => (s.id ?? s.name) === seriesId);
  const slots = categoricalPalette[scheme];
  return series[index]?.color ?? slots[(index < 0 ? 0 : index) % slots.length];
}

export function formatX(x: PointEvent['x']): string {
  if (x === null) return '—';
  if (x instanceof Date) {
    return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (typeof x === 'number') return formatNumber(x);
  return x;
}

export function buildEntry(
  ev: PointEvent,
  cardTitle: string,
  series: readonly SeriesOptions[],
  format: (n: number) => string,
  scheme: Scheme,
): InspectorEntry {
  return {
    seriesName: ev.seriesName,
    swatch: seriesColor(series, ev.seriesId, scheme),
    value: ev.y === null ? 'No value' : format(ev.y),
    rows: [
      ['Chart', cardTitle],
      ['Point', formatX(ev.x)],
      ['Index', String(ev.dataIndex)],
      // Keyboard-originated events report clientX/clientY as -1.
      ['Input', ev.clientX === -1 && ev.clientY === -1 ? 'Keyboard' : 'Pointer'],
    ],
  };
}
