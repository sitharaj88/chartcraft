/**
 * Feature 3 — Data labels (`dataLabels`).
 *
 * `select` modes: 'auto' (default when enabled) | 'all' | 'extremes' |
 * 'endpoints' | 'last'. `'auto'` labels endpoints and extremes only and then
 * **measures** every candidate, dropping any label that would collide with an
 * already-kept label or fall outside the plot — real collision detection, not a
 * heuristic. Labels wear INK colors (`theme.textPrimary`), never series colors;
 * the mark carries the color.
 *
 * The whole selection + measurement + placement pass is the pure function
 * `planDataLabels`; `draw` only paints its result.
 */
import type { Decorator } from '../decorate';
import type { Rect, TypeGeom } from '../layout';
import type { DataModel, ResolvedOptions } from '../model';
import type { Theme, TooltipPoint } from '../types';
import { seriesColor } from '../model';
import { formatValue } from '../util';
import {
  anchorOf,
  anchorValue,
  labelFont,
  rectInside,
  rectsOverlap,
  textRect,
  valueOnScreenY,
  type TextAlign,
  type TextBaseline,
} from './shared';

/** Gap in px between a mark and its label. */
export const LABEL_GAP = 6;
/** Minimum clear space between two kept labels. */
export const LABEL_PAD = 2;

export type LabelSelect = NonNullable<ResolvedOptions['dataLabels']['select']>;

/**
 * Candidate indices for one series, ascending.
 *
 * - 'all' → every non-null datum
 * - 'endpoints' → first + last non-null
 * - 'extremes' → argmax + argmin (first occurrence wins)
 * - 'last' → last non-null
 * - 'auto' → endpoints ∪ extremes (then collision-filtered by the planner)
 */
export function selectLabelIndices(
  values: readonly (number | null)[],
  mode: LabelSelect,
): number[] {
  const idx: number[] = [];
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) idx.push(i);
  });
  if (idx.length === 0) return [];
  if (mode === 'all') return idx;
  const first = idx[0] as number;
  const last = idx[idx.length - 1] as number;
  if (mode === 'last') return [last];
  if (mode === 'endpoints') return first === last ? [first] : [first, last];

  let maxI = first;
  let minI = first;
  for (const i of idx) {
    const v = values[i] as number;
    if (v > (values[maxI] as number)) maxI = i;
    if (v < (values[minI] as number)) minI = i;
  }
  const picked = mode === 'extremes' ? [maxI, minI] : [first, last, maxI, minI];
  return [...new Set(picked)].sort((a, b) => a - b);
}

/**
 * Drop priority within 'auto': the extremes carry the most information, then
 * the last datum, then the first. Lower rank = kept first when labels collide.
 */
export function labelRank(values: readonly (number | null)[], i: number): number {
  const idx: number[] = [];
  values.forEach((v, k) => {
    if (v !== null && Number.isFinite(v)) idx.push(k);
  });
  if (idx.length === 0) return 4;
  let maxI = idx[0] as number;
  let minI = idx[0] as number;
  for (const k of idx) {
    const v = values[k] as number;
    if (v > (values[maxI] as number)) maxI = k;
    if (v < (values[minI] as number)) minI = k;
  }
  if (i === maxI) return 0;
  if (i === minI) return 1;
  if (i === idx[idx.length - 1]) return 2;
  if (i === idx[0]) return 3;
  return 4;
}

export interface LabelPlacement {
  x: number;
  y: number;
  align: TextAlign;
  baseline: TextBaseline;
  rect: Rect;
  position: 'outside' | 'inside';
}

/**
 * Where one label sits. 'outside' is beyond the mark's data end (above a
 * positive bar / point, below a negative one; right / left on horizontal
 * charts); 'inside' mirrors it back over the mark. 'auto' prefers outside and
 * falls back to inside when the outside box leaves the plot.
 */
export function labelPlacement(args: {
  vertical: boolean;
  /** Value-axis pixel of the datum. */
  value: number;
  /** Value-axis pixel of the datum's base (baseline or stack bound). */
  base: number;
  /** Data-axis pixel of the datum. */
  along: number;
  width: number;
  height: number;
  plot: Rect;
  position: 'outside' | 'inside' | 'auto';
  gap?: number;
}): LabelPlacement {
  const gap = args.gap ?? LABEL_GAP;
  const make = (side: 'outside' | 'inside'): LabelPlacement => {
    if (args.vertical) {
      // Screen y grows downward: a positive datum sits ABOVE its base.
      const upward = args.value <= args.base;
      const above = side === 'outside' ? upward : !upward;
      const y = above ? args.value - gap : args.value + gap;
      const baseline: TextBaseline = above ? 'bottom' : 'top';
      return {
        x: args.along,
        y,
        align: 'center',
        baseline,
        rect: textRect(args.width, args.height, args.along, y, 'center', baseline),
        position: side,
      };
    }
    const rightward = args.value >= args.base;
    const right = side === 'outside' ? rightward : !rightward;
    const x = right ? args.value + gap : args.value - gap;
    const align: TextAlign = right ? 'left' : 'right';
    return {
      x,
      y: args.along,
      align,
      baseline: 'middle',
      rect: textRect(args.width, args.height, x, args.along, align, 'middle'),
      position: side,
    };
  };
  if (args.position === 'inside') return make('inside');
  const outside = make('outside');
  if (args.position === 'outside') return outside;
  return rectInside(args.plot, outside.rect) ? outside : make('inside');
}

export interface LabelPlan extends LabelPlacement {
  si: number;
  pi: number;
  text: string;
  rank: number;
}

export interface PlanArgs {
  model: DataModel;
  opts: ResolvedOptions;
  theme: Theme;
  geom: TypeGeom;
  plot: Rect;
  measure(text: string, font: string): number;
}

/**
 * The full label pass: select, format, measure, place, and (in 'auto') drop
 * every label that collides with a kept label or leaves the plot.
 */
export function planDataLabels(args: PlanArgs): LabelPlan[] {
  const { model, opts, theme, geom, plot } = args;
  const dl = opts.dataLabels;
  if (!dl.show) return [];
  const font = labelFont(theme);
  const height = theme.fontSize;
  const vertical = valueOnScreenY(model);
  const candidates: LabelPlan[] = [];

  model.series.forEach((s, si) => {
    if (!s.visible) return;
    const positions = geom.pos[si] ?? [];
    if (positions.length === 0) return;
    const values = s.points.map((_p, pi) => anchorValue(s, pi));
    const indices = selectLabelIndices(values, dl.select);
    for (const pi of indices) {
      const p = positions[pi];
      const point = s.points[pi];
      if (!p || !point) continue;
      const raw = values[pi];
      if (raw === null || raw === undefined) continue;
      const text = labelText(dl, {
        seriesId: s.id,
        seriesName: s.name,
        color: seriesColor(s, theme),
        x: point.x,
        y: point.y,
        formattedX: formatValue(point.x),
        formattedY: formatValue(raw),
      });
      if (text === '') continue;
      const { along, value, base } = anchorOf(model, p);
      const placement = labelPlacement({
        vertical,
        value,
        base,
        along,
        width: args.measure(text, font),
        height,
        plot,
        position: dl.position,
      });
      candidates.push({ ...placement, si, pi, text, rank: labelRank(values, pi) });
    }
  });

  if (dl.select !== 'auto') return candidates;

  // 'auto': measured collision resolution. Highest-information labels win.
  const ordered = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.rank - b.c.rank || a.i - b.i);
  const kept: LabelPlan[] = [];
  for (const { c } of ordered) {
    if (!rectInside(plot, c.rect)) continue;
    if (kept.some((k) => rectsOverlap(k.rect, c.rect, LABEL_PAD))) continue;
    kept.push(c);
  }
  return candidates.filter((c) => kept.includes(c));
}

function labelText(dl: ResolvedOptions['dataLabels'], point: TooltipPoint): string {
  return dl.format ? dl.format(point) : point.formattedY;
}

export const dataLabelsDecorator: Decorator = {
  id: 'chartcraft:data-labels',
  layer: 'over',
  order: 40,

  appliesTo(ctx) {
    return ctx.opts.dataLabels.show && ctx.def.needs.cartesianAxes && ctx.geom.pos.length > 0;
  },

  draw(ctx) {
    const font = labelFont(ctx.theme);
    const plan = planDataLabels({
      model: ctx.model,
      opts: ctx.opts,
      theme: ctx.theme,
      geom: ctx.geom,
      plot: ctx.plot,
      measure: (text, f) => ctx.r.measure(text, f),
    });
    for (const l of plan) {
      // Ink colors, never the series color.
      ctx.r.text(l.text, l.x, l.y, {
        font,
        color: ctx.theme.textPrimary,
        align: l.align,
        baseline: l.baseline,
      });
    }
  },
};
