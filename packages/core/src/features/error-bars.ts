/**
 * Feature 1 — Error bars (`SeriesOptions.errorBars`).
 *
 * A pipeline-level `Decorator` on the 'over' layer: 1px whiskers with
 * `capWidth` caps (default 6px) drawn ABOVE the marks, on line/area/bar/
 * scatter/bubble. Per-point absolute bounds (`eLow`/`eHigh`) win; otherwise the
 * uniform `value` (absolute) or `percent` (of the datum) applies.
 *
 * The interval participates in three places, all through one piece of math
 * (`errorInterval`):
 *
 * - the **value domain**, via the `extendYDomain` decorator hook, so whiskers
 *   are never clipped by the axis;
 * - the **a11y table**, which gains `± low` / `± high` columns per series;
 * - the **tooltip**, whose value reads `10 (8–12)`.
 *
 * All three go through pipeline seams, so nothing here touches DOM or wraps the
 * caller's formatter: `Decorator.extendYDomain`, `Decorator.a11yTable` (applied
 * once, between the type's `a11yTable` stage and BOTH the table DOM and
 * `exportData()`, so the two can never disagree) and
 * `Decorator.tooltipPoints`. The transformations themselves are the pure,
 * separately tested `withErrorBarColumns` / `withErrorBarIntervals`.
 */
import type { A11yTableSpec } from '../a11y';
import type { Decorator, DecoratorContext } from '../decorate';
import type { DataModel, NormalizedSeries, ResolvedOptions } from '../model';
import type { ChartType, ErrorBarOptions, SeriesKind, TooltipPoint } from '../types';
import type { NormalizedPoint } from '../data/normalize';
import { seriesColor } from '../model';
import { formatValue } from '../util';
import {
  anchorOf,
  anchorValue,
  darkenColor,
  decoratesSeries,
  rawSeriesFor,
  valueOnScreenY,
  valueScaleOf,
} from './shared';

/**
 * Chart ROOTS error bars decorate (contract: line/area/bar/scatter/bubble).
 *
 * Retained as the public, documented surface. Gating now happens per SERIES via
 * `ERROR_BAR_KINDS` + `decoratesSeries`, so a `line` series inside a `bar` root
 * gets its whiskers — see `errorBarSeries`.
 */
export const ERROR_BAR_TYPES: readonly ChartType[] = ['line', 'area', 'bar', 'scatter', 'bubble'];

/** Resolved per-series mark kinds error bars decorate. */
export const ERROR_BAR_KINDS: readonly SeriesKind[] = ['line', 'area', 'bar', 'scatter'];

/** Default cap width in px. */
export const DEFAULT_CAP_WIDTH = 6;

export interface ErrorInterval {
  lo: number;
  hi: number;
}

/**
 * The interval for one datum, in DATA units.
 *
 * Precedence (contract): per-point absolute `eLow`/`eHigh` win; a missing side
 * falls back to the anchor value. Otherwise a uniform `value` (absolute delta)
 * wins over `percent` (a percentage of |value|). Returns null when the datum is
 * a gap or the options describe no interval.
 */
export function errorInterval(
  anchor: number | null,
  point: Pick<NormalizedPoint, 'eLow' | 'eHigh'>,
  o: ErrorBarOptions,
): ErrorInterval | null {
  if (anchor === null || !Number.isFinite(anchor)) return null;
  const absLow = typeof point.eLow === 'number' && Number.isFinite(point.eLow);
  const absHigh = typeof point.eHigh === 'number' && Number.isFinite(point.eHigh);
  if (absLow || absHigh) {
    const lo = absLow ? (point.eLow as number) : anchor;
    const hi = absHigh ? (point.eHigh as number) : anchor;
    return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
  }
  let delta: number | null = null;
  if (typeof o.value === 'number' && Number.isFinite(o.value)) delta = Math.abs(o.value);
  else if (typeof o.percent === 'number' && Number.isFinite(o.percent)) {
    delta = Math.abs(anchor) * (Math.abs(o.percent) / 100);
  }
  if (delta === null) return null;
  return { lo: anchor - delta, hi: anchor + delta };
}

/** Series that declare error bars on a supporting chart type, with options. */
export function errorBarSeries(
  model: DataModel,
  opts: ResolvedOptions,
): { si: number; s: NormalizedSeries; o: ErrorBarOptions }[] {
  const out: { si: number; s: NormalizedSeries; o: ErrorBarOptions }[] = [];
  model.series.forEach((s, si) => {
    if (!s.visible) return;
    if (!decoratesSeries(model, s, ERROR_BAR_KINDS)) return;
    const o = rawSeriesFor(opts, s)?.errorBars;
    if (o) out.push({ si, s, o });
  });
  return out;
}

// ------------------------------------------------------------------- geometry

/** One whisker: the stem plus its two caps, in canvas pixels. */
export interface WhiskerGeom {
  si: number;
  pi: number;
  /** Stem endpoints. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Cap segments (low bound first, then high bound). */
  caps: [{ x1: number; y1: number; x2: number; y2: number }, { x1: number; y1: number; x2: number; y2: number }];
  color: string;
  interval: ErrorInterval;
}

/**
 * Pure whisker geometry for every error-barred datum of the current frame.
 * Vertical charts get vertical stems with horizontal caps; horizontal bar
 * charts get the transpose.
 */
export function whiskerGeometry(ctx: DecoratorContext): WhiskerGeom[] {
  const vs = valueScaleOf(ctx);
  if (!vs) return [];
  const vertical = valueOnScreenY(ctx.model);
  const out: WhiskerGeom[] = [];
  for (const { si, s, o } of errorBarSeries(ctx.model, ctx.opts)) {
    const cap = Math.max(0, o.capWidth ?? DEFAULT_CAP_WIDTH);
    const half = cap / 2;
    const base = seriesColor(s, ctx.theme);
    const color = o.color ?? darkenColor(base, 0.3) ?? ctx.theme.textSecondary;
    const positions = ctx.geom.pos[si] ?? [];
    for (let pi = 0; pi < s.points.length; pi++) {
      const p = positions[pi];
      const point = s.points[pi];
      if (!p || !point) continue;
      const interval = errorInterval(anchorValue(s, pi), point, o);
      if (!interval) continue;
      const along = anchorOf(ctx.model, p).along;
      const loPx = vs.scale(interval.lo);
      const hiPx = vs.scale(interval.hi);
      out.push(
        vertical
          ? {
              si,
              pi,
              x1: along,
              y1: loPx,
              x2: along,
              y2: hiPx,
              caps: [
                { x1: along - half, y1: loPx, x2: along + half, y2: loPx },
                { x1: along - half, y1: hiPx, x2: along + half, y2: hiPx },
              ],
              color,
              interval,
            }
          : {
              si,
              pi,
              x1: loPx,
              y1: along,
              x2: hiPx,
              y2: along,
              caps: [
                { x1: loPx, y1: along - half, x2: loPx, y2: along + half },
                { x1: hiPx, y1: along - half, x2: hiPx, y2: along + half },
              ],
              color,
              interval,
            },
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------- a11y table

/** Extra a11y-table columns contributed by error bars (appended, in series order). */
export function errorBarTableColumns(
  model: DataModel,
  opts: ResolvedOptions,
): { header: string; cells: string[] }[] {
  const rows = model.maxLen;
  return errorBarSeries(model, opts).flatMap(({ s, o }) => {
    const lo: string[] = [];
    const hi: string[] = [];
    for (let i = 0; i < rows; i++) {
      const point = s.points[i];
      const iv = point ? errorInterval(anchorValue(s, i), point, o) : null;
      lo.push(iv ? formatValue(iv.lo) : '—');
      hi.push(iv ? formatValue(iv.hi) : '—');
    }
    return [
      { header: `${s.name} ± low`, cells: lo },
      { header: `${s.name} ± high`, cells: hi },
    ];
  });
}

/** The a11y table spec with the ± columns appended. */
export function withErrorBarColumns(
  spec: A11yTableSpec,
  model: DataModel,
  opts: ResolvedOptions,
): A11yTableSpec {
  const extra = errorBarTableColumns(model, opts);
  if (extra.length === 0) return spec;
  return {
    columns: [...spec.columns, ...extra.map((c) => c.header)],
    rows: spec.rows.map((row, i) => ({
      header: row.header,
      cells: [...row.cells, ...extra.map((c) => c.cells[i] ?? '—')],
    })),
  };
}

// ------------------------------------------------------------------- tooltip

/** Format one interval the way the tooltip shows it: `8–12`. */
export function formatInterval(iv: ErrorInterval): string {
  return `${formatValue(iv.lo)}–${formatValue(iv.hi)}`;
}

/**
 * Tooltip points with the error interval appended to `formattedY`, e.g.
 * `10 (8–12)`. Points whose series has no error bars pass through untouched.
 */
export function withErrorBarIntervals(
  points: readonly TooltipPoint[],
  model: DataModel,
  opts: ResolvedOptions,
): TooltipPoint[] {
  const bySeries = new Map(errorBarSeries(model, opts).map((e) => [e.s.id, e]));
  if (bySeries.size === 0) return [...points];
  return points.map((tp) => {
    const entry = bySeries.get(tp.seriesId);
    if (!entry) return tp;
    const pi = entry.s.points.findIndex((p) => p.x === tp.x && p.y === tp.y);
    if (pi < 0) return tp;
    const point = entry.s.points[pi];
    if (!point) return tp;
    const iv = errorInterval(anchorValue(entry.s, pi), point, entry.o);
    if (!iv) return tp;
    return { ...tp, formattedY: `${tp.formattedY} (${formatInterval(iv)})` };
  });
}

// ----------------------------------------------------------------- decorator

export const errorBarsDecorator: Decorator = {
  id: 'chartcraft:error-bars',
  layer: 'over',
  order: 10,

  appliesTo(ctx) {
    return errorBarSeries(ctx.model, ctx.opts).length > 0;
  },

  /**
   * Whiskers join the value domain (contract: "Included in the y-domain").
   * Called while the model is built, before any scale exists.
   */
  extendYDomain(model, opts) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const { s, o } of errorBarSeries(model, opts)) {
      for (let pi = 0; pi < s.points.length; pi++) {
        const point = s.points[pi];
        if (!point) continue;
        const iv = errorInterval(anchorValue(s, pi), point, o);
        if (!iv) continue;
        if (iv.lo < lo) lo = iv.lo;
        if (iv.hi > hi) hi = iv.hi;
      }
    }
    return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
  },

  /**
   * The contract says error bars make "the a11y table gain ± columns". ONE
   * transform, applied by the pipeline to the spec that feeds both the table
   * DOM and `exportData()` — so the CSV/JSON export carries the ± columns too.
   */
  a11yTable(ctx, spec) {
    return withErrorBarColumns(spec, ctx.model, ctx.opts);
  },

  /** "The tooltip shows the interval": `10 (8–12)`, before the caller's format. */
  tooltipPoints(ctx, _hit, points) {
    return withErrorBarIntervals(points, ctx.model, ctx.opts);
  },

  draw(ctx) {
    const plot = ctx.plot;
    const bars = whiskerGeometry(ctx);
    if (bars.length === 0) return;
    ctx.r.clipRect(plot.x, plot.y, plot.w, plot.h, () => {
      for (const b of bars) {
        const stroke = { color: b.color, width: 1, cap: 'butt' as const };
        ctx.r.line(b.x1, b.y1, b.x2, b.y2, stroke);
        for (const c of b.caps) {
          if (c.x1 === c.x2 && c.y1 === c.y2) continue;
          ctx.r.line(c.x1, c.y1, c.x2, c.y2, stroke);
        }
      }
    });
  },
};
