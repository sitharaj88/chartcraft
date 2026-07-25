/**
 * Dumbbell / connected-dot plot (v0.3). Per category two values:
 * `{x, low, high}` (or `[x, low, high]` — the registry declares
 * `needs.triple: 'range'`; `lowKey`/`highKey` remap custom object fields).
 *
 * Marks: a hairline connector in `theme.gridline` between two >= 10px dots.
 * The two dots take palette slots 1 and 2 — they encode the two ENDPOINTS,
 * not series identity, which is exactly what the legend keys ("Legend = the
 * two endpoint names"). Endpoint names come from `SeriesOptions.lowKey` /
 * `highKey` when the caller supplied them (they are caller-chosen, meaningful
 * field names such as `lowKey: '2010'`), and default to `Low` / `High`.
 *
 * Several series are supported: each visible series gets its own slot inside
 * the category band (2px apart), so dumbbells never overlap.
 *
 * Geometry lives in `pos`: `y` is the HIGH dot, `y0` the LOW dot, so the
 * connector animates open from its low end.
 */
import type { TooltipPoint } from '../../types';
import type { ChartTypeDefinition, DefinitionContext } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { bandIndexFor } from '../../model';
import { BandScale } from '../../scales/band';
import { formatValue } from '../../util';
import { HIT_RADIUS } from '../../interaction/hittest';
import { DOT_RING, DUMBBELL_DOT_RADIUS, formatDelta, rangeOf, slotCenters, slotWidth } from './shared';

/** Hairline connector width. */
export const DUMBBELL_CONNECTOR_WIDTH = 1;
/** Legend / table names when the caller did not name the endpoints. */
export const DUMBBELL_DEFAULT_LOW_NAME = 'Low';
export const DUMBBELL_DEFAULT_HIGH_NAME = 'High';

export interface DumbbellEndpointNames {
  low: string;
  high: string;
}

/**
 * Endpoint names: `lowKey`/`highKey` of the first visible series when set,
 * else `Low`/`High`. (A dumbbell's legend names its two ENDS, so the names
 * must not depend on which series is being drawn.)
 */
export function dumbbellEndpointNames(ctx: DefinitionContext): DumbbellEndpointNames {
  const si = ctx.model.series.findIndex((s) => s.visible);
  const raw = ctx.opts.data.series[si >= 0 ? si : 0];
  return {
    low: raw?.lowKey ?? DUMBBELL_DEFAULT_LOW_NAME,
    high: raw?.highKey ?? DUMBBELL_DEFAULT_HIGH_NAME,
  };
}

/** Palette slots 1 & 2 carry the two endpoints. */
export function dumbbellEndpointColors(theme: { series: string[] }): [string, string] {
  return [theme.series[0] ?? '#888888', theme.series[1] ?? '#888888'];
}

export interface DumbbellExtra {
  /** Slot width inside a band (hit-testing / dot sizing sanity). */
  slotW: number;
  /** Visible series indices, in model order (slot order). */
  slots: number[];
}

export const dumbbellDefinition: ChartTypeDefinition = {
  id: 'dumbbell',
  needs: { cartesianAxes: true, xScale: 'band', triple: 'range' },

  resolveOptions(resolved, raw) {
    // The legend is the ONLY key to which dot is which end, so "auto" resolves
    // to SHOWN even for a single series (the heatmap color-scale precedent).
    const explicit =
      typeof raw.legend === 'boolean' ||
      (typeof raw.legend === 'object' && raw.legend !== null && raw.legend.show !== undefined);
    if (!explicit) resolved.legend.show = true;
  },

  layout(ctx): TypeGeom {
    const m = ctx.model;
    const L = ctx.layout;
    const empty: TypeGeom = { pos: m.series.map(() => []), slices: null, bars: null };
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    const ys = L.yScale as ContinuousScale | null;
    if (!band || !ys) return empty;

    const slots: number[] = [];
    m.series.forEach((s, si) => {
      if (s.visible) slots.push(si);
    });
    const k = Math.max(1, slots.length);
    const bw = band.bandwidth();

    const pos: (PointPos | null)[][] = m.series.map((s, si) => {
      if (!s.visible) return [];
      const slot = slots.indexOf(si);
      return s.points.map((p, pi): PointPos | null => {
        const rg = rangeOf(p);
        if (!rg) return null;
        const bandStart = band.scale(bandIndexFor(m, p.xv, pi));
        const x = slotCenters(bandStart, bw, k)[slot] ?? bandStart + bw / 2;
        return { x, y: ys.scale(rg.high), y0: ys.scale(rg.low) };
      });
    });

    const extra: DumbbellExtra = { slotW: slotWidth(bw, k), slots };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme: t, model: m, layout: L, geom, hover } = ctx;
    const [lowColor, highColor] = dumbbellEndpointColors(t);
    const pad = DUMBBELL_DOT_RADIUS + DOT_RING;
    r.clipRect(L.plot.x - pad, L.plot.y - pad, L.plot.w + 2 * pad, L.plot.h + 2 * pad, () => {
      m.series.forEach((s, si) => {
        if (!s.visible) return;
        const pts = geom.pos[si];
        if (!pts) return;
        pts.forEach((p, pi) => {
          if (!p) return;
          const hovered = hover !== null && hover.si === si && hover.pi === pi;
          const alpha = hover && !hovered ? 0.45 : 1;
          // Hairline connector in the gridline color (recessive — the dots
          // carry the encoding).
          r.line(p.x, p.y0, p.x, p.y, { color: t.gridline, width: DUMBBELL_CONNECTOR_WIDTH }, alpha);
          const dotColor = s.points[pi]?.color;
          r.circle(p.x, p.y0, DUMBBELL_DOT_RADIUS, {
            fill: dotColor ?? lowColor,
            stroke: { color: t.surface, width: DOT_RING },
            alpha,
          });
          r.circle(p.x, p.y, DUMBBELL_DOT_RADIUS, {
            fill: dotColor ?? highColor,
            stroke: { color: t.surface, width: DOT_RING },
            alpha,
          });
        });
      });
    });
  },

  hitTest(ctx, px, py): HoverState | null {
    const L = ctx.layout;
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    if (!band) return null;
    if (py < L.plot.y - HIT_RADIUS || py > L.plot.y + L.plot.h + HIT_RADIUS) return null;
    if (px < L.plot.x - HIT_RADIUS || px > L.plot.x + L.plot.w + HIT_RADIUS) return null;
    const bandIdx = band.invertIndex(px);
    if (bandIdx < 0) return null;
    // Nearest dumbbell in that band, preferring one whose low..high span
    // contains the pointer (hit targets larger than the marks).
    let best: HoverState | null = null;
    let bestScore = Infinity;
    ctx.geom.pos.forEach((pts, si) => {
      const s = ctx.model.series[si];
      if (!s || !s.visible) return;
      pts.forEach((p, pi) => {
        if (!p) return;
        if (bandIndexFor(ctx.model, s.points[pi]?.xv ?? null, pi) !== bandIdx) return;
        const lo = Math.min(p.y, p.y0) - DUMBBELL_DOT_RADIUS;
        const hi = Math.max(p.y, p.y0) + DUMBBELL_DOT_RADIUS;
        const inside = py >= lo && py <= hi;
        const score = Math.abs(p.x - px) + (inside ? 0 : 10000);
        if (score < bestScore) {
          bestScore = score;
          best = { si, pi };
        }
      });
    });
    return best;
  },

  legendItems(ctx): LegendItem[] {
    // The two ENDPOINTS, not the series: nothing to toggle here.
    const names = dumbbellEndpointNames(ctx);
    const [lowColor, highColor] = dumbbellEndpointColors(ctx.theme);
    return [
      { id: 'dumbbell-low', name: names.low, color: lowColor, visible: true, toggleable: false },
      { id: 'dumbbell-high', name: names.high, color: highColor, visible: true, toggleable: false },
    ];
  },

  a11yTable(ctx): A11yTableSpec {
    const m = ctx.model;
    const names = dumbbellEndpointNames(ctx);
    const multi = m.series.length > 1;
    const rows: A11yTableSpec['rows'] = [];
    m.series.forEach((s) => {
      s.points.forEach((p, pi) => {
        const cat = m.categories?.[bandIndexFor(m, p.xv, pi)];
        const label = p.label ?? formatValue(cat !== undefined ? cat : (p.x ?? pi));
        const header = multi ? `${label} — ${s.name}` : label;
        const rg = rangeOf(p);
        rows.push({
          header,
          cells: rg
            ? [formatValue(rg.low), formatValue(rg.high), formatDelta(rg.high - rg.low)]
            : ['—', '—', '—'],
        });
      });
    });
    return { columns: ['Category', names.low, names.high, 'Delta'], rows };
  },

  keyboardNav(model): NavContext {
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  announce(ctx, pos): string | null {
    const m = ctx.model;
    const s = m.series[pos.si];
    const p = s?.points[pos.pi];
    const rg = rangeOf(p);
    if (!s || !p) return null;
    const names = dumbbellEndpointNames(ctx);
    const cat = m.categories?.[bandIndexFor(m, p.xv, pos.pi)];
    const label = p.label ?? formatValue(cat !== undefined ? cat : (p.x ?? pos.pi));
    if (!rg) return `${label}: no value. ${s.name}, point ${pos.pi + 1} of ${s.points.length}.`;
    return (
      `${label}: ${names.low} ${formatValue(rg.low)}, ${names.high} ${formatValue(rg.high)}, ` +
      `delta ${formatDelta(rg.high - rg.low)}. ${s.name}, point ${pos.pi + 1} of ${s.points.length}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const rg = rangeOf(ctx.model.series[hit.si]?.points[hit.pi]);
    if (rg) {
      const names = dumbbellEndpointNames(ctx);
      tp.formattedY =
        `${names.low} ${formatValue(rg.low)} · ${names.high} ${formatValue(rg.high)} · ` +
        `delta ${formatDelta(rg.high - rg.low)}`;
    }
    return [tp];
  },
};
