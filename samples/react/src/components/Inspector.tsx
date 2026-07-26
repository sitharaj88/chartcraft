/**
 * Inspector — the visible destination for `pointclick`.
 *
 * In React the panel is a pure function of the current selection: no imperative
 * re-render, no DOM bookkeeping. `null` renders the empty state.
 */

import { Fragment } from 'react';
import { categoricalPalette } from '@chartcraft/core';
import type { PointEvent } from '@chartcraft/react';

import { formatNumber } from '../data';
import { INSPECTABLE } from '../specs';
import type { DashboardSpecs, InspectableId, Scheme } from '../specs';

export interface Selection {
  chartId: InspectableId;
  ev: PointEvent;
}

export interface InspectorProps {
  selection: Selection | null;
  specs: DashboardSpecs;
  scheme: Scheme;
}

/** PointEvent carries no colour, so resolve the series' palette slot. */
function seriesColor(
  specs: DashboardSpecs,
  chartId: InspectableId,
  seriesId: string,
  scheme: Scheme,
): string {
  const series = specs[chartId].data.series ?? [];
  const index = series.findIndex((s) => (s.id ?? s.name) === seriesId);
  const slots = categoricalPalette[scheme];
  return series[index]?.color ?? slots[(index < 0 ? 0 : index) % slots.length];
}

function formatX(x: PointEvent['x']): string {
  if (x === null) return '—';
  if (x instanceof Date) {
    return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (typeof x === 'number') return formatNumber(x);
  return x;
}

export function Inspector({ selection, specs, scheme }: InspectorProps) {
  if (!selection) {
    return (
      <div className="inspector">
        <p className="inspector__empty">
          Click a point on any chart — the recurring-revenue line, the segment bars or the
          contract-value boxes — to inspect it here.
        </p>
        <p className="inspector__hint">
          Keyboard: Tab to a chart, walk it with the arrow keys, then press Enter.
        </p>
      </div>
    );
  }

  const { chartId, ev } = selection;
  const { title: cardTitle, format } = INSPECTABLE[chartId];

  const rows: [string, string][] = [
    ['Chart', cardTitle],
    ['Point', formatX(ev.x)],
    ['Index', String(ev.dataIndex)],
    // Keyboard-originated events report clientX/clientY as -1.
    ['Input', ev.clientX === -1 && ev.clientY === -1 ? 'Keyboard' : 'Pointer'],
  ];

  return (
    <div className="inspector">
      <span className="inspector__series">
        <span
          className="inspector__swatch"
          style={{ background: seriesColor(specs, chartId, ev.seriesId, scheme) }}
        />
        {ev.seriesName}
      </span>

      <p className="inspector__value">{ev.y === null ? 'No value' : format(ev.y)}</p>

      <dl className="inspector__list">
        {/* A keyed Fragment, not a wrapper element: `.inspector__list` is a
            two-column grid, so dt/dd must stay DIRECT children of the <dl>. */}
        {rows.map(([term, def]) => (
          <Fragment key={term}>
            <dt>{term}</dt>
            <dd>{def}</dd>
          </Fragment>
        ))}
      </dl>

      <p className="inspector__hint">Updated on every point click.</p>
    </div>
  );
}
