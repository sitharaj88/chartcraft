/**
 * Bullet graph (v0.3). One series of labeled rows, `{x: label, y: value,
 * target?}`, with qualitative ranges from `bullet.ranges` (ascending).
 *
 * Rows are HORIZONTAL: the definition forces `horizontal: true` in its option
 * hook, so the pipeline puts the band (row) scale on y and the value scale on
 * x — row labels come free from the y axis chrome and the caller never has to
 * remember an orientation flag.
 *
 * Marks per row:
 * - qualitative ranges: nested rectangles from the zero baseline out to each
 *   boundary, painted largest-first in GREY LIGHTNESS steps (`greyRangeSteps`,
 *   never hues) so the smaller/darker ranges land on top;
 * - the measure: a thin bar in `theme.textPrimary` at reduced height, centered
 *   in the row (it is the animated mark — it grows from the baseline);
 * - the target: a 2px perpendicular tick in `theme.textPrimary`.
 *
 * Legend is hidden (rows are labeled). Table: label, value, target, ranges.
 */
import type { ChartData, DataValue, TooltipPoint } from '../../types';
import { dataValuesOf } from '../../data/normalize';
import type { ChartTypeDefinition } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { NavContext } from '../../a11y/keyboard';
import type { DataModel } from '../../model';
import type { NormalizedPoint } from '../../data/normalize';
import { bandIndexFor } from '../../model';
import { BandScale } from '../../scales/band';
import { formatValue } from '../../util';
import { HIT_RADIUS } from '../../interaction/hittest';
import { greyRangeSteps } from './shared';

/** Measure bar height as a fraction of the row height ("thin bar"). */
export const BULLET_MEASURE_RATIO = 0.34;
/** Target tick height as a fraction of the row height. */
export const BULLET_TARGET_RATIO = 0.66;
/** Target tick width (contract: a 2px perpendicular tick). */
export const BULLET_TARGET_WIDTH = 2;

export interface BulletRangeRect {
  /** Range boundary this rect encodes. */
  value: number;
  x: number;
  w: number;
  color: string;
}

export interface BulletRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BulletRowGeom {
  /** Range rects in PAINT order: largest (lightest) first. */
  rects: BulletRangeRect[];
  /** Measure bar, or null when the row has no value. */
  measure: BulletRect | null;
  /** Target tick, or null when the row has no target. */
  tick: BulletRect | null;
}

export interface BulletRow extends BulletRowGeom {
  pi: number;
  label: string;
  rowY: number;
  rowH: number;
  value: number | null;
  target: number | null;
  /** Range boundaries, ascending. */
  ranges: number[];
}

/**
 * Row geometry. `ranges` are sorted ascending and drawn NESTED (largest first,
 * each from the zero baseline), `colors[i]` belongs to the i-th ascending
 * range. The measure bar and target tick are both centered in the row.
 */
export function bulletRowGeometry(args: {
  rowY: number;
  rowH: number;
  value: number | null;
  target: number | null;
  ranges: readonly number[];
  xAt: (v: number) => number;
  colors: readonly string[];
}): BulletRowGeom {
  const { rowY, rowH, value, target, xAt, colors } = args;
  const asc = [...args.ranges].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const x0 = xAt(0);

  const rects: BulletRangeRect[] = [];
  for (let i = asc.length - 1; i >= 0; i--) {
    const v = asc[i] as number;
    const x1 = xAt(v);
    rects.push({
      value: v,
      x: Math.min(x0, x1),
      w: Math.abs(x1 - x0),
      color: colors[i] ?? '',
    });
  }

  let measure: BulletRect | null = null;
  if (value !== null && Number.isFinite(value)) {
    const h = rowH * BULLET_MEASURE_RATIO;
    const x1 = xAt(value);
    measure = { x: Math.min(x0, x1), y: rowY + (rowH - h) / 2, w: Math.abs(x1 - x0), h };
  }

  let tick: BulletRect | null = null;
  if (target !== null && Number.isFinite(target)) {
    const h = rowH * BULLET_TARGET_RATIO;
    tick = {
      x: xAt(target) - BULLET_TARGET_WIDTH / 2,
      y: rowY + (rowH - h) / 2,
      w: BULLET_TARGET_WIDTH,
      h,
    };
  }

  return { rects, measure, tick };
}

/** value/target/low/high read out of one RAW `DataValue` (option resolution). */
export interface BulletRawEntry {
  value: number | null;
  target: number | null;
  low: number | null;
  high: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Raw-data reader used by `resolveOptions` (which runs BEFORE the model
 * exists) so the value axis can cover every value, target and range bound.
 */
export function bulletRawEntry(d: DataValue): BulletRawEntry {
  if (typeof d === 'number') return { value: d, target: null, low: null, high: null };
  if (d === null || d === undefined) return { value: null, target: null, low: null, high: null };
  if (Array.isArray(d)) {
    return { value: num(d[1]), target: null, low: null, high: null };
  }
  return { value: num(d.y), target: num(d.target), low: num(d.low), high: num(d.high) };
}

/** Raw entries of the first visible series (bullet renders one series). */
export function bulletRawEntries(data: ChartData): BulletRawEntry[] {
  const s = data.series.find((x) => x.visible !== false);
  return s ? dataValuesOf(s.data).map(bulletRawEntry) : [];
}

/** Upper end of the value axis: 0, every value/target and every range bound. */
export function bulletValueMax(data: ChartData, bullet: { ranges?: number[]; target?: number } | undefined): number {
  let hi = 0;
  for (const v of bullet?.ranges ?? []) {
    if (Number.isFinite(v)) hi = Math.max(hi, v);
  }
  const globalTarget = num(bullet?.target);
  if (globalTarget !== null) hi = Math.max(hi, globalTarget);
  for (const e of bulletRawEntries(data)) {
    for (const v of [e.value, e.target, e.low, e.high]) {
      if (v !== null) hi = Math.max(hi, v);
    }
  }
  return hi > 0 ? hi : 1;
}

interface BulletExtra {
  rows: BulletRow[];
  /** Model index of the rendered (first visible) series. */
  si: number;
}

function rowLabel(m: DataModel, p: NormalizedPoint, pi: number): string {
  if (p.label !== undefined) return p.label;
  const cat = m.categories?.[bandIndexFor(m, p.xv, pi)];
  return formatValue(cat !== undefined ? cat : (p.x ?? pi));
}

export const bulletDefinition: ChartTypeDefinition = {
  id: 'bullet',
  needs: { cartesianAxes: true, xScale: 'band', baseKind: 'bar', combo: false, horizontal: true },

  resolveOptions(resolved) {
    // Rows are labeled directly by the band axis — the legend adds nothing.
    resolved.legend.show = false;
    // Rows are horizontal, always (the contract's only bullet orientation).
    resolved.horizontal = true;
  },

  /**
   * The value axis must span EXACTLY 0 .. the outermost of every value, target
   * and qualitative-range boundary, with no `nice()` widening — a bullet graph
   * whose widest grey band stops short of the row end reads as a data range
   * rather than as the scale.
   *
   * Range boundaries and targets live in `bullet.ranges` / the raw data, which
   * the generic value extent cannot see, so this is exactly what the pipeline's
   * `extendValueDomain` stage is for. (Before v0.3 this was written into
   * `resolved.xAxis.min/max` from `resolveOptions`, which put a computed domain
   * into the caller's axis options and into `getOptions()`.)
   */
  extendValueDomain(_model, opts) {
    return { domain: [0, bulletValueMax(opts.data, opts.bullet)] as [number, number], exact: true };
  },

  layout(ctx): TypeGeom {
    const m = ctx.model;
    const L = ctx.layout;
    const empty: TypeGeom = { pos: m.series.map(() => []), slices: null, bars: null };
    const band = L.yScale instanceof BandScale ? L.yScale : null;
    const xs = L.xScale as ContinuousScale | null;
    const si = m.series.findIndex((s) => s.visible);
    if (!band || !xs || si < 0) return empty;
    const s = m.series[si];
    if (!s) return empty;

    const globalRanges = ctx.opts.bullet?.ranges ?? [];
    const globalTarget = num(ctx.opts.bullet?.target);
    const rowH = band.bandwidth();
    const xAt = (v: number): number => xs.scale(v);
    const rows: BulletRow[] = [];

    const pos: (PointPos | null)[][] = m.series.map((ser, i) => {
      if (i !== si) return [];
      return ser.points.map((p, pi): PointPos | null => {
        const rowY = band.scale(bandIndexFor(m, p.xv, pi));
        // A per-row range pair (`low`/`high` on the datum) overrides the
        // chart-wide `bullet.ranges` for that row.
        const perRow = typeof p.low === 'number' && typeof p.high === 'number' ? [p.low, p.high] : null;
        const ranges = (perRow ?? globalRanges).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
        const target = num(p.target) ?? globalTarget;
        const geom = bulletRowGeometry({
          rowY,
          rowH,
          value: p.y,
          target,
          ranges,
          xAt,
          colors: greyRangeSteps(ranges.length, ctx.theme),
        });
        rows.push({ pi, label: rowLabel(m, p, pi), rowY, rowH, value: p.y, target, ranges, ...geom });
        if (p.y === null) return null;
        return { x: xAt(p.y), y: rowY + rowH / 2, y0: xAt(0) };
      });
    });

    const extra: BulletExtra = { rows, si };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme: t, layout: L, geom, hover } = ctx;
    const extra = geom.extra as BulletExtra | undefined;
    if (!extra) return;
    const pts = geom.pos[extra.si] ?? [];
    const byPi = new Map(extra.rows.map((row) => [row.pi, row] as const));

    r.clipRect(L.plot.x - 1, L.plot.y - 1, L.plot.w + 2, L.plot.h + 2, () => {
      // 1. Qualitative ranges, nested (largest first) grey lightness steps.
      for (const row of extra.rows) {
        for (const rect of row.rects) {
          if (rect.w <= 0 || row.rowH <= 0) continue;
          r.rect(rect.x, row.rowY, rect.w, row.rowH, { fill: rect.color });
        }
      }
      // 2. The measure, from the ANIMATED position (grows from the baseline).
      pts.forEach((p, pi) => {
        const row = byPi.get(pi);
        if (!p || !row) return;
        const h = row.rowH * BULLET_MEASURE_RATIO;
        const y = row.rowY + (row.rowH - h) / 2;
        const left = Math.min(p.x, p.y0);
        const w = Math.abs(p.x - p.y0);
        const hovered = hover !== null && hover.si === extra.si && hover.pi === pi;
        const alpha = hover && !hovered ? 0.5 : 1;
        r.rect(left, y, Math.max(1, w), h, { fill: t.textPrimary, alpha });
      });
      // 3. The target tick, on top of everything (a 2px perpendicular mark).
      for (const row of extra.rows) {
        if (!row.tick) continue;
        r.rect(row.tick.x, row.tick.y, row.tick.w, row.tick.h, { fill: t.textPrimary });
      }
    });
  },

  hitTest(ctx, px, py): HoverState | null {
    const extra = ctx.geom.extra as BulletExtra | undefined;
    const L = ctx.layout;
    const band = L.yScale instanceof BandScale ? L.yScale : null;
    if (!extra || !band) return null;
    if (px < L.plot.x - HIT_RADIUS || px > L.plot.x + L.plot.w + HIT_RADIUS) return null;
    if (py < L.plot.y - HIT_RADIUS || py > L.plot.y + L.plot.h + HIT_RADIUS) return null;
    const pi = band.invertIndex(py);
    if (pi < 0) return null;
    return extra.rows.some((row) => row.pi === pi) ? { si: extra.si, pi } : null;
  },

  legendItems() {
    return []; // hidden always — rows carry their labels on the band axis
  },

  a11yTable(ctx): A11yTableSpec {
    const m = ctx.model;
    const globalRanges = ctx.opts.bullet?.ranges ?? [];
    const globalTarget = num(ctx.opts.bullet?.target);
    const si = m.series.findIndex((s) => s.visible);
    const s = si >= 0 ? m.series[si] : undefined;
    const rows: A11yTableSpec['rows'] = (s?.points ?? []).map((p, pi) => {
      const perRow = typeof p.low === 'number' && typeof p.high === 'number' ? [p.low, p.high] : null;
      const ranges = (perRow ?? globalRanges).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      const target = num(p.target) ?? globalTarget;
      return {
        header: rowLabel(m, p, pi),
        cells: [
          p.y === null ? '—' : formatValue(p.y),
          target === null ? '—' : formatValue(target),
          ranges.length > 0 ? ranges.map((v) => formatValue(v)).join(', ') : '—',
        ],
      };
    });
    return { columns: ['Label', 'Value', 'Target', 'Ranges'], rows };
  },

  keyboardNav(model): NavContext {
    // Arrow keys walk the rows of the (single) bullet series.
    const si = model.series.findIndex((s) => s.visible);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos): string | null {
    const extra = ctx.geom.extra as BulletExtra | undefined;
    const s = ctx.model.series[pos.si];
    const row = extra?.rows.find((x) => x.pi === pos.pi);
    if (!s || !row) return null;
    const value = row.value === null ? 'no value' : formatValue(row.value);
    const target = row.target === null ? '' : `, target ${formatValue(row.target)}`;
    return `${row.label}: ${value}${target}. Row ${pos.pi + 1} of ${s.points.length}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const extra = ctx.geom.extra as BulletExtra | undefined;
    const row = extra?.rows.find((x) => x.pi === hit.pi);
    if (row) {
      tp.formattedX = row.label;
      tp.color = ctx.theme.textPrimary;
      const parts = [row.value === null ? '—' : formatValue(row.value)];
      if (row.target !== null) parts.push(`target ${formatValue(row.target)}`);
      if (row.ranges.length > 0) parts.push(`ranges ${row.ranges.map((v) => formatValue(v)).join(', ')}`);
      tp.formattedY = parts.join(' · ');
    }
    return [tp];
  },
};
