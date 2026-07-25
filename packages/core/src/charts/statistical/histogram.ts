/**
 * Histogram (v0.2): series data are RAW SAMPLES (number[]); the definition
 * bins them (`histogram.bins`, 'auto' = Freedman–Diaconis clamped 5..60) and
 * renders count bars at full bin width with a 1px hairline gap. Multi-series
 * overlays draw at alpha 0.7. The x axis is linear over the bin edges; the
 * explicit x/y extents are installed via the resolveOptions hook so the
 * pipeline-owned scales cover bins and counts (not raw sample indices).
 *
 * Bins are the unit of interaction: keyboard navigation walks bins, the
 * tooltip and the a11y table show "lo – hi" ranges and counts, and
 * `dataIndex` in events is the bin index.
 */
import type { ChartData, ChartType, DataValue, TooltipPoint } from '../../types';
import { dataValuesOf } from '../../data/normalize';
import type { ChartTypeDefinition } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { seriesColor, type DataModel } from '../../model';
import { LinearScale } from '../../scales/linear';
import { formatValue } from '../../util';
import { HIT_RADIUS } from '../../interaction/hittest';
import { binCounts, binEdges } from './binning';

export const HISTOGRAM_OVERLAY_ALPHA = 0.7;
export const HISTOGRAM_BAR_GAP = 1; // hairline gap between adjacent bars
/** Bin-edge ticks are requested up to this many bins (labels stay legible). */
export const HISTOGRAM_EDGE_TICK_MAX = 12;

export interface HistogramExtra {
  edges: number[];
  edgePx: number[];
  /** Per model-series bin counts (empty for hidden series). */
  counts: number[][];
}

/** Raw sample values of one series' data (numbers and {y} objects). */
export function rawSampleValues(data: readonly DataValue[] | undefined): number[] {
  const out: number[] = [];
  if (!data) return out;
  for (const d of data) {
    if (typeof d === 'number' && Number.isFinite(d)) out.push(d);
    else if (d !== null && !Array.isArray(d) && typeof d === 'object' && typeof d.y === 'number' && Number.isFinite(d.y))
      out.push(d.y);
  }
  return out;
}

/**
 * Shared binning over a chart's data: edges from the combined visible
 * samples (so overlaid series stay comparable), counts per series.
 */
export function histogramBinData(
  data: ChartData,
  bins: number | 'auto',
): { edges: number[]; countsBySeries: number[][] } {
  const perSeries = data.series.map((s) => ({
    visible: s.visible !== false,
    values: rawSampleValues(dataValuesOf(s.data)),
  }));
  const combined: number[] = [];
  // Element-wise, NOT `push(...s.values)`: a spread becomes an argument list,
  // which V8 caps near 125k entries, and a histogram's input is raw samples —
  // unbounded, caller-supplied. See the same fix in `charts/curves.ts`.
  for (const s of perSeries) {
    if (!s.visible) continue;
    for (let i = 0; i < s.values.length; i++) combined.push(s.values[i] as number);
  }
  const edges = binEdges(combined, bins);
  const countsBySeries = perSeries.map((s) => (s.visible && edges.length >= 2 ? binCounts(s.values, edges) : []));
  return { edges, countsBySeries };
}

/** Bin count per model, for keyboard geometry (layout populates it). */
const binCountByModel = new WeakMap<DataModel, number>();

export const histogramDefinition: ChartTypeDefinition = {
  id: 'histogram' as ChartType,
  needs: { cartesianAxes: true, xScale: 'auto' },

  resolveOptions(resolved, raw) {
    const { edges, countsBySeries } = histogramBinData(resolved.data, resolved.histogram?.bins ?? 'auto');
    if (edges.length < 2) return;
    let maxCount = 1;
    for (const counts of countsBySeries) for (const c of counts) if (c > maxCount) maxCount = c;

    const rawX = typeof raw.xAxis === 'object' && raw.xAxis !== null ? raw.xAxis : {};
    resolved.xAxis = { ...resolved.xAxis };
    if (typeof rawX.min !== 'number') resolved.xAxis.min = edges[0] as number;
    if (typeof rawX.max !== 'number') resolved.xAxis.max = edges[edges.length - 1] as number;
    const binCount = edges.length - 1;
    if (rawX.ticks?.count === undefined && binCount <= HISTOGRAM_EDGE_TICK_MAX) {
      resolved.xAxis.ticks = { ...resolved.xAxis.ticks, count: binCount };
    }

    const rawY = typeof raw.yAxis === 'object' && raw.yAxis !== null ? raw.yAxis : {};
    resolved.yAxis = { ...resolved.yAxis };
    if (typeof rawY.min !== 'number') resolved.yAxis.min = 0;
    if (typeof rawY.max !== 'number') resolved.yAxis.max = new LinearScale([0, maxCount]).nice(5).domain()[1];
  },

  layout(ctx): TypeGeom {
    const m = ctx.model;
    const L = ctx.layout;
    const empty: TypeGeom = { pos: m.series.map(() => []), slices: null, bars: null };
    const xs = L.xScale as ContinuousScale | null;
    const ys = L.yScale as ContinuousScale | null;
    const { edges, countsBySeries } = histogramBinData(ctx.opts.data, ctx.opts.histogram?.bins ?? 'auto');
    binCountByModel.set(m, Math.max(0, edges.length - 1));
    if (!xs || !ys || edges.length < 2 || typeof xs.scale !== 'function') return empty;

    const edgePx = edges.map((e) => xs.scale(e));
    const pos: (PointPos | null)[][] = m.series.map((s, si) => {
      if (!s.visible) return [];
      const counts = countsBySeries[si] ?? [];
      return counts.map((c, bi): PointPos => ({
        x: ((edgePx[bi] as number) + (edgePx[bi + 1] as number)) / 2,
        y: ys.scale(c),
        y0: L.baselinePx,
      }));
    });
    const extra: HistogramExtra = { edges, edgePx, counts: countsBySeries };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme, model: m, layout: L, geom, hover } = ctx;
    const extra = geom.extra as HistogramExtra | undefined;
    if (!extra || extra.edgePx.length < 2) return;
    const visCount = m.series.filter((s) => s.visible).length;
    const baseAlpha = visCount > 1 ? HISTOGRAM_OVERLAY_ALPHA : 1;
    r.clipRect(L.plot.x, L.plot.y, L.plot.w, L.plot.h, () => {
      m.series.forEach((s, si) => {
        if (!s.visible) return;
        const pts = geom.pos[si];
        if (!pts) return;
        const color = seriesColor(s, theme);
        pts.forEach((p, bi) => {
          if (!p) return;
          const count = extra.counts[si]?.[bi] ?? 0;
          if (count <= 0) return;
          const x0 = (extra.edgePx[bi] as number) + HISTOGRAM_BAR_GAP / 2;
          const x1 = (extra.edgePx[bi + 1] as number) - HISTOGRAM_BAR_GAP / 2;
          const top = Math.min(p.y, p.y0);
          const h = Math.abs(p.y0 - p.y);
          if (h <= 0 || x1 <= x0) return;
          const hovered = hover !== null && hover.si === si && hover.pi === bi;
          const alpha = hover ? (hovered ? Math.min(1, baseAlpha + 0.2) : baseAlpha * 0.5) : baseAlpha;
          r.rect(x0, top, x1 - x0, h, { fill: color, alpha });
        });
      });
    });
  },

  hitTest(ctx, px, py): HoverState | null {
    const extra = ctx.geom.extra as HistogramExtra | undefined;
    const L = ctx.layout;
    if (!extra || extra.edgePx.length < 2) return null;
    if (px < L.plot.x - HIT_RADIUS || px > L.plot.x + L.plot.w + HIT_RADIUS) return null;
    if (py < L.plot.y - HIT_RADIUS || py > L.plot.y + L.plot.h + HIT_RADIUS) return null;
    const n = extra.edgePx.length - 1;
    const e0 = extra.edgePx[0] as number;
    const eN = extra.edgePx[n] as number;
    const w = (eN - e0) / n;
    if (!(w > 0)) return null;
    const bi = Math.max(0, Math.min(n - 1, Math.floor((px - e0) / w)));
    let best: HoverState | null = null;
    let bestScore = Infinity;
    ctx.model.series.forEach((s, si) => {
      if (!s.visible) return;
      const p = ctx.geom.pos[si]?.[bi];
      if (!p) return;
      if ((extra.counts[si]?.[bi] ?? 0) <= 0) return;
      const inside = py >= Math.min(p.y, p.y0) - 2 && py <= Math.max(p.y, p.y0) + 2;
      const score = Math.abs(p.y - py) + (inside ? 0 : 10000);
      if (score < bestScore) {
        bestScore = score;
        best = { si, pi: bi };
      }
    });
    return best;
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
    const { edges, countsBySeries } = histogramBinData(ctx.opts.data, ctx.opts.histogram?.bins ?? 'auto');
    const rows: A11yTableSpec['rows'] = [];
    for (let bi = 0; bi < edges.length - 1; bi++) {
      rows.push({
        header: `${formatValue(edges[bi] as number)} – ${formatValue(edges[bi + 1] as number)}`,
        cells: m.series.map((s, si) => {
          const counts = countsBySeries[si];
          return counts && counts.length > 0 ? String(counts[bi] ?? 0) : '—';
        }),
      });
    }
    return { columns: ['Bin', ...m.series.map((s) => s.name)], rows };
  },

  keyboardNav(model): NavContext {
    const bins = binCountByModel.get(model) ?? 0;
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: () => bins,
    };
  },

  announce(ctx, pos): string | null {
    const extra = ctx.geom.extra as HistogramExtra | undefined;
    const s = ctx.model.series[pos.si];
    if (!extra || !s) return null;
    const lo = extra.edges[pos.pi];
    const hi = extra.edges[pos.pi + 1];
    if (lo === undefined || hi === undefined) return null;
    const count = extra.counts[pos.si]?.[pos.pi] ?? 0;
    const bins = extra.edges.length - 1;
    return `${formatValue(lo)} – ${formatValue(hi)}: ${count} ${count === 1 ? 'sample' : 'samples'}. ${s.name}, bin ${
      pos.pi + 1
    } of ${bins}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const extra = ctx.geom.extra as HistogramExtra | undefined;
    const s = ctx.model.series[hit.si];
    if (!extra || !s) return [];
    const lo = extra.edges[hit.pi];
    const hi = extra.edges[hit.pi + 1];
    if (lo === undefined || hi === undefined) return [];
    const count = extra.counts[hit.si]?.[hit.pi] ?? 0;
    return [
      {
        seriesId: s.id,
        seriesName: s.name,
        color: seriesColor(s, ctx.theme),
        x: null,
        y: count,
        formattedX: `${formatValue(lo)} – ${formatValue(hi)}`,
        formattedY: `${count} ${count === 1 ? 'sample' : 'samples'}`,
      },
    ];
  },
};
