/**
 * Waterfall (v0.2). Single series; values are DELTAS from the running
 * total; points flagged `isTotal: true` are ABSOLUTE totals (bar from the
 * zero baseline, running total resets to the value). Floating bars colored
 * theme.up / theme.down / theme.neutral (totals & zero deltas), hairline
 * connectors between consecutive bars per `waterfall.connectors`
 * (default true).
 *
 * The running-total layout math is the pure `computeWaterfallSteps`.
 */
import type { ChartData, ChartType, DataValue, TooltipPoint, Theme } from '../../types';
import type { ChartTypeDefinition } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { bandIndexFor, seriesColor } from '../../model';
import { BandScale } from '../../scales/band';
import { LinearScale } from '../../scales/linear';
import { formatValue } from '../../util';
import { HIT_RADIUS } from '../../interaction/hittest';

export type WaterfallKind = 'up' | 'down' | 'neutral' | 'total';

export interface WaterfallStep {
  start: number;
  end: number;
  kind: WaterfallKind;
}

export interface WaterfallEntry {
  value: number | null;
  isTotal?: boolean;
}

/**
 * Running-total layout: deltas float from the previous running total;
 * totals are absolute bars from zero and reset the running total. Null
 * values are gaps (running total unchanged).
 */
export function computeWaterfallSteps(entries: readonly WaterfallEntry[]): (WaterfallStep | null)[] {
  let running = 0;
  const out: (WaterfallStep | null)[] = [];
  for (const e of entries) {
    if (e.value === null || e.value === undefined || !Number.isFinite(e.value)) {
      out.push(null);
      continue;
    }
    if (e.isTotal === true) {
      out.push({ start: 0, end: e.value, kind: 'total' });
      running = e.value;
    } else {
      const start = running;
      running += e.value;
      out.push({ start, end: running, kind: e.value > 0 ? 'up' : e.value < 0 ? 'down' : 'neutral' });
    }
  }
  return out;
}

export function stepColor(kind: WaterfallKind, theme: Theme): string {
  return kind === 'up' ? theme.up : kind === 'down' ? theme.down : theme.neutral;
}

function rawEntry(d: DataValue): WaterfallEntry {
  if (typeof d === 'number') return { value: d, isTotal: false };
  if (d === null) return { value: null, isTotal: false };
  if (Array.isArray(d)) {
    const y = d[1];
    return { value: typeof y === 'number' ? y : null, isTotal: false };
  }
  return { value: typeof d.y === 'number' ? d.y : null, isTotal: d.isTotal === true };
}

/** Entries of the first visible series in the raw data. */
export function rawWaterfallEntries(data: ChartData): WaterfallEntry[] {
  const s = data.series.find((x) => x.visible !== false);
  return s ? s.data.map(rawEntry) : [];
}

interface WaterfallExtra {
  steps: (WaterfallStep | null)[];
  barW: number;
  /** Model index of the rendered (first visible) series. */
  si: number;
}

export const waterfallDefinition: ChartTypeDefinition = {
  id: 'waterfall' as ChartType,
  needs: { cartesianAxes: true, xScale: 'band', baseKind: 'bar', combo: false },

  resolveOptions(resolved, raw) {
    const steps = computeWaterfallSteps(rawWaterfallEntries(resolved.data));
    let lo = 0;
    let hi = 0;
    for (const st of steps) {
      if (!st) continue;
      lo = Math.min(lo, st.start, st.end);
      hi = Math.max(hi, st.start, st.end);
    }
    if (lo === hi) hi = lo + 1;
    const nice = new LinearScale([lo, hi]).nice(5).domain();
    const rawY = typeof raw.yAxis === 'object' && raw.yAxis !== null ? raw.yAxis : {};
    resolved.yAxis = { ...resolved.yAxis };
    if (typeof rawY.min !== 'number') resolved.yAxis.min = nice[0];
    if (typeof rawY.max !== 'number') resolved.yAxis.max = nice[1];
  },

  layout(ctx): TypeGeom {
    const m = ctx.model;
    const L = ctx.layout;
    const empty: TypeGeom = { pos: m.series.map(() => []), slices: null, bars: null };
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    const ys = L.yScale as ContinuousScale | null;
    const si = m.series.findIndex((s) => s.visible);
    if (!band || !ys || si < 0) return empty;

    const s = m.series[si];
    if (!s) return empty;
    const steps = computeWaterfallSteps(s.points.map((p) => ({ value: p.y, isTotal: p.isTotal === true })));
    const barW = band.bandwidth();

    const pos: (PointPos | null)[][] = m.series.map((ser, i) => {
      if (i !== si) return [];
      return ser.points.map((p, pi): PointPos | null => {
        const st = steps[pi];
        if (!st) return null;
        return {
          x: band.center(bandIndexFor(m, p.xv, pi)),
          y: ys.scale(st.end),
          y0: ys.scale(st.start),
        };
      });
    });
    const extra: WaterfallExtra = { steps, barW, si };
    return { pos, slices: null, bars: { barW }, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme, layout: L, geom, hover, opts } = ctx;
    const extra = geom.extra as WaterfallExtra | undefined;
    if (!extra) return;
    const pts = geom.pos[extra.si];
    if (!pts) return;
    const w = extra.barW;
    const connectors = opts.waterfall?.connectors ?? true;

    r.clipRect(L.plot.x, L.plot.y - 2, L.plot.w, L.plot.h + 4, () => {
      pts.forEach((p, pi) => {
        const st = extra.steps[pi];
        if (!p || !st) return;
        const top = Math.min(p.y, p.y0);
        const h = Math.max(1, Math.abs(p.y - p.y0));
        const hovered = hover !== null && hover.si === extra.si && hover.pi === pi;
        const alpha = hover && !hovered ? 0.5 : 1;
        r.rect(p.x - w / 2, top, w, h, { fill: stepColor(st.kind, theme), alpha });
      });

      if (connectors) {
        // Hairline connector: horizontal at the previous bar's END level,
        // from its right edge to the next bar's left edge.
        let prev: { x: number; y: number } | null = null;
        pts.forEach((p, pi) => {
          const st = extra.steps[pi];
          if (!p || !st) return;
          if (prev) {
            r.line(prev.x + w / 2, prev.y, p.x - w / 2, prev.y, { color: theme.axisLine, width: 1 });
          }
          prev = { x: p.x, y: p.y };
        });
      }
    });
  },

  hitTest(ctx, px, py): HoverState | null {
    const extra = ctx.geom.extra as WaterfallExtra | undefined;
    const L = ctx.layout;
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    if (!extra || !band) return null;
    if (py < L.plot.y - HIT_RADIUS || py > L.plot.y + L.plot.h + HIT_RADIUS) return null;
    if (px < L.plot.x - HIT_RADIUS || px > L.plot.x + L.plot.w + HIT_RADIUS) return null;
    const pi = band.invertIndex(px);
    if (pi < 0) return null;
    const p = ctx.geom.pos[extra.si]?.[pi];
    return p ? { si: extra.si, pi } : null;
  },

  legendItems(ctx): LegendItem[] {
    return ctx.model.series.map((s) => ({
      id: s.id,
      name: s.name,
      color: seriesColor(s, ctx.theme),
      visible: s.visible,
      toggleable: true,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const m = ctx.model;
    const si = m.series.findIndex((s) => s.visible);
    const s = si >= 0 ? m.series[si] : undefined;
    const rows: A11yTableSpec['rows'] = [];
    if (s) {
      const steps = computeWaterfallSteps(s.points.map((p) => ({ value: p.y, isTotal: p.isTotal === true })));
      s.points.forEach((p, pi) => {
        const st = steps[pi];
        const cat = m.categories?.[bandIndexFor(m, p.xv, pi)];
        const label = p.label ?? (cat !== undefined ? formatValue(cat) : formatValue(p.x ?? pi));
        if (!st) {
          rows.push({ header: label, cells: ['—', '—'] });
          return;
        }
        const delta =
          st.kind === 'total'
            ? `Total ${formatValue(st.end)}`
            : `${st.end - st.start > 0 ? '+' : ''}${formatValue(st.end - st.start)}`;
        rows.push({ header: label, cells: [delta, formatValue(st.end)] });
      });
    }
    return { columns: ['Label', 'Delta', 'Running total'], rows };
  },

  keyboardNav(model): NavContext {
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  announce(ctx, pos): string | null {
    const extra = ctx.geom.extra as WaterfallExtra | undefined;
    const s = ctx.model.series[pos.si];
    const p = s?.points[pos.pi];
    if (!s || !p) return null;
    const st = extra?.steps[pos.pi];
    const cat = ctx.model.categories?.[bandIndexFor(ctx.model, p.xv, pos.pi)];
    const label = p.label ?? (cat !== undefined ? formatValue(cat) : formatValue(p.x ?? pos.pi));
    if (!st) return `${label}: no value. Point ${pos.pi + 1} of ${s.points.length}.`;
    if (st.kind === 'total') {
      return `${label}: total ${formatValue(st.end)}. Point ${pos.pi + 1} of ${s.points.length}.`;
    }
    const d = st.end - st.start;
    return `${label}: ${d > 0 ? '+' : ''}${formatValue(d)}, running total ${formatValue(st.end)}. Point ${
      pos.pi + 1
    } of ${s.points.length}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const extra = ctx.geom.extra as WaterfallExtra | undefined;
    const st = extra?.steps[hit.pi];
    if (st) {
      tp.color = stepColor(st.kind, ctx.theme);
      if (st.kind === 'total') {
        tp.formattedY = `Total ${formatValue(st.end)}`;
      } else {
        const d = st.end - st.start;
        tp.formattedY = `${d > 0 ? '+' : ''}${formatValue(d)} (running total ${formatValue(st.end)})`;
      }
    }
    return [tp];
  },
};
