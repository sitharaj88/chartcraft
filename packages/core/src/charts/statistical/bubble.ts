/**
 * Bubble chart (v0.2): scatter + size channel.
 *
 * Reuses the shared cartesian engine for scales, option policy, legend and
 * keyboard geometry, and replaces the mark stages so the `r` value maps to
 * marker AREA (never radius) via the per-series `sizeRange` min/max DIAMETER
 * (default [8, 40] px). Tooltip and announcements carry x, y and r.
 */
import type { TooltipPoint } from '../../types';
import type { ChartTypeDefinition, GeomContext, TooltipExtractContext } from '../registry';
import type { HoverState, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import { a11yRowBudget } from '../../a11y';
import { seriesColor, type DataModel } from '../../model';
import { makeCartesianDefinition } from '../cartesian';
import { HIT_RADIUS } from '../../interaction/hittest';
import { clamp, formatValue } from '../../util';

export const DEFAULT_SIZE_RANGE: readonly [number, number] = [8, 40];
export const BUBBLE_RING = 2; // surface ring width, same as scatter markers

export interface BubbleExtra {
  /** Marker radius (px) per model series/point; null = gap. */
  radii: (number | null)[][];
}

/** Extent of the r values over visible series, or null when none present. */
export function bubbleRDomain(model: DataModel): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of model.series) {
    if (!s.visible) continue;
    for (const p of s.points) {
      if (typeof p.r === 'number' && Number.isFinite(p.r)) {
        if (p.r < lo) lo = p.r;
        if (p.r > hi) hi = p.r;
      }
    }
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}

/**
 * Marker DIAMETER for an r value: the value maps linearly to marker AREA
 * between the areas of the sizeRange min/max diameters. Missing r values get
 * the minimum diameter; a degenerate domain maps to the midpoint area.
 */
export function bubbleDiameter(
  value: number | undefined,
  domain: [number, number] | null,
  sizeRange: readonly [number, number] = DEFAULT_SIZE_RANGE,
): number {
  const dMin = sizeRange[0];
  const dMax = sizeRange[1];
  if (value === undefined || value === null || !Number.isFinite(value) || !domain) return dMin;
  const aMin = Math.PI * (dMin / 2) ** 2;
  const aMax = Math.PI * (dMax / 2) ** 2;
  const [lo, hi] = domain;
  const t = hi > lo ? clamp((value - lo) / (hi - lo), 0, 1) : 0.5;
  const area = aMin + t * (aMax - aMin);
  return 2 * Math.sqrt(area / Math.PI);
}

const base = makeCartesianDefinition({ id: 'bubble', baseKind: 'scatter', combo: false });

function extraOf(ctx: GeomContext): BubbleExtra | null {
  const e = ctx.geom.extra as BubbleExtra | undefined;
  return e && Array.isArray(e.radii) ? e : null;
}

export const bubbleDefinition: ChartTypeDefinition = {
  ...base,

  layout(ctx): TypeGeom {
    const g = base.layout(ctx);
    const domain = bubbleRDomain(ctx.model);
    const radii = ctx.model.series.map((s, si) => {
      if (!s.visible) return [];
      return s.points.map((p, pi): number | null => {
        if (!g.pos[si]?.[pi]) return null;
        return bubbleDiameter(p.r, domain, s.sizeRange ?? DEFAULT_SIZE_RANGE) / 2;
      });
    });
    const extra: BubbleExtra = { radii };
    return { ...g, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme, model, layout: L, geom, hover } = ctx;
    const extra = geom.extra as BubbleExtra | undefined;
    if (!extra) return;
    let maxRad = 4;
    for (const row of extra.radii) for (const v of row) if (v !== null && v > maxRad) maxRad = v;
    const pad = maxRad + 4;
    r.clipRect(L.plot.x - pad, L.plot.y - pad, L.plot.w + 2 * pad, L.plot.h + 2 * pad, () => {
      model.series.forEach((s, si) => {
        if (!s.visible) return;
        const pts = geom.pos[si];
        if (!pts) return;
        const color = seriesColor(s, theme);
        pts.forEach((p, pi) => {
          if (!p) return;
          const rad = extra.radii[si]?.[pi];
          if (rad === null || rad === undefined) return;
          const hovered = hover !== null && hover.si === si && hover.pi === pi;
          const alpha = hover && !hovered ? 0.55 : 1;
          r.circle(p.x, p.y, hovered ? rad + 2 : rad, {
            fill: s.points[pi]?.color ?? color,
            stroke: { color: theme.surface, width: BUBBLE_RING },
            alpha,
          });
        });
      });
    });
  },

  hitTest(ctx, px, py): HoverState | null {
    const extra = extraOf(ctx);
    let best: HoverState | null = null;
    let bestScore = Infinity;
    ctx.model.series.forEach((s, si) => {
      if (!s.visible) return;
      const pts = ctx.geom.pos[si];
      if (!pts) return;
      pts.forEach((p, pi) => {
        if (!p) return;
        const rad = extra?.radii[si]?.[pi] ?? 4;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d > Math.max(HIT_RADIUS, rad + 2)) return;
        const score = d - rad; // nearest bubble EDGE wins for overlaps
        if (score < bestScore) {
          bestScore = score;
          best = { si, pi };
        }
      });
    });
    return best;
  },

  /** Honours `limit` (v0.3.2, E-8): one row per DATUM, so it can be huge. */
  a11yTable(ctx, tableOpts): A11yTableSpec {
    const m = ctx.model;
    const xHead = ctx.opts.xAxis.label ?? (m.xType === 'time' ? 'Time' : 'X');
    const columns = [xHead];
    for (const s of m.series) columns.push(s.name, `${s.name} r`);
    const rows: A11yTableSpec['rows'] = [];
    const built = Math.min(m.maxLen, a11yRowBudget(tableOpts));
    for (let i = 0; i < built; i++) {
      const xVal = m.series[0]?.points[i]?.x ?? i;
      const cells: string[] = [];
      for (const s of m.series) {
        const p = s.points[i];
        cells.push(p && p.y !== null ? formatValue(p.y) : '—');
        cells.push(p && typeof p.r === 'number' ? formatValue(p.r) : '—');
      }
      rows.push({ header: formatValue(xVal), cells });
    }
    return { columns, rows, total: m.maxLen };
  },

  announce(ctx, pos): string | null {
    const s = ctx.model.series[pos.si];
    const p = s?.points[pos.pi];
    if (!s || !p) return null;
    const rPart = typeof p.r === 'number' ? `, r ${formatValue(p.r)}` : '';
    return `${formatValue(p.x)}: ${p.y === null ? 'no value' : formatValue(p.y)}${rPart}. ${s.name}, point ${
      pos.pi + 1
    } of ${s.points.length}.`;
  },

  tooltipPoints(ctx: TooltipExtractContext, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const p = ctx.model.series[hit.si]?.points[hit.pi];
    if (p && typeof p.r === 'number') {
      tp.formattedY = `${tp.formattedY} · r ${formatValue(p.r)}`;
    }
    return [tp];
  },
};
