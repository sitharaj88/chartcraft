/**
 * Boxplot (v0.2). Categories on the x axis (band scale); per category each
 * series supplies either a 5-number object ({min,q1,median,q3,max,outliers?})
 * or a RAW number[] sample, for which the summary is computed (quartiles via
 * linear interpolation / R-7, Tukey 1.5×IQR whiskers/outliers).
 *
 * Raw arrays are read from the RAW series data (the generic normalizer would
 * fold numeric arrays into tuple shapes) — for the boxplot type any numeric
 * array entry means "raw samples".
 *
 * Marks: box q1–q3 (series color), median line (surface ink for contrast),
 * whiskers to min/max with caps, outlier dots >= 8px diameter.
 */
import type { ChartData, ChartType, TooltipPoint } from '../../types';
import { dataValuesOf } from '../../data/normalize';
import type { ChartTypeDefinition } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { bandIndexFor, seriesColor } from '../../model';
import { BandScale } from '../../scales/band';
import { LinearScale } from '../../scales/linear';
import { formatValue } from '../../util';
import { hitRadius } from '../../interaction/hittest';
import { summarizeBox, type FiveNumberSummary } from './stats';

export const BOX_SLOT_GAP = 2;
export const OUTLIER_RADIUS = 4; // 8px diameter
export const OUTLIER_RING = 2;

export interface BoxGeom {
  si: number;
  pi: number;
  x: number;
  w: number;
  /** Pixel positions (canvas y grows downward). */
  q1Px: number;
  q3Px: number;
  medianPx: number;
  minPx: number;
  maxPx: number;
  outliersPx: number[];
}

export interface BoxplotExtra {
  boxes: BoxGeom[];
}

/** Summary for one raw data entry: 5-number object or raw numeric array. */
export function boxSummaryOf(entry: unknown): FiveNumberSummary | null {
  if (entry === null || entry === undefined) return null;
  if (Array.isArray(entry)) {
    const nums = (entry as unknown[]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return summarizeBox(nums);
  }
  if (typeof entry === 'object') {
    const p = entry as Record<string, unknown>;
    const num = (k: string): number | null => (typeof p[k] === 'number' ? (p[k] as number) : null);
    const min = num('min');
    const q1 = num('q1');
    const median = num('median');
    const q3 = num('q3');
    const max = num('max');
    if (min !== null && q1 !== null && median !== null && q3 !== null && max !== null) {
      const outliers = Array.isArray(p['outliers'])
        ? (p['outliers'] as unknown[]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        : [];
      return { min, q1, median, q3, max, outliers };
    }
  }
  return null;
}

/** Per-series, per-category summaries over a chart's raw data. */
export function boxSummaries(data: ChartData): (FiveNumberSummary | null)[][] {
  return data.series.map((s) => dataValuesOf(s.data).map((entry) => boxSummaryOf(entry)));
}

/**
 * Value domain covering every whisker and outlier of every visible series,
 * `nice()`d. Null when no entry yields a summary (nothing to extend).
 * Pure, so it is unit-testable without mounting a chart.
 */
export function boxplotValueDomain(data: ChartData): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  data.series.forEach((s) => {
    if (s.visible === false) return;
    for (const entry of dataValuesOf(s.data)) {
      const sum = boxSummaryOf(entry);
      if (!sum) continue;
      lo = Math.min(lo, sum.min, ...sum.outliers);
      hi = Math.max(hi, sum.max, ...sum.outliers);
    }
  });
  if (!Number.isFinite(lo)) return null;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const nice = new LinearScale([lo, hi]).nice(5).domain();
  return [nice[0], nice[1]];
}

export const boxplotDefinition: ChartTypeDefinition = {
  id: 'boxplot' as ChartType,
  needs: { cartesianAxes: true, xScale: 'band' },

  /**
   * The value axis must cover every whisker AND every outlier. Those come from
   * the 5-number summaries, which are computed from the RAW series data (the
   * generic normalizer folds a `number[]` sample into a tuple shape), so the
   * generic value extent cannot see them — this is the pipeline's
   * `extendValueDomain` stage, not a rewrite of the caller's `yAxis`.
   */
  extendValueDomain(_model, opts) {
    return boxplotValueDomain(opts.data);
  },

  layout(ctx): TypeGeom {
    const m = ctx.model;
    const L = ctx.layout;
    const empty: TypeGeom = { pos: m.series.map(() => []), slices: null, bars: null };
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    const ys = L.yScale as ContinuousScale | null;
    if (!band || !ys) return empty;

    const visIdx: number[] = [];
    m.series.forEach((s, si) => {
      if (s.visible) visIdx.push(si);
    });
    const k = Math.max(1, visIdx.length);
    const bw = band.bandwidth();
    const slotW = Math.max(1, (bw - BOX_SLOT_GAP * (k - 1)) / k);

    const boxes: BoxGeom[] = [];
    const pos: (PointPos | null)[][] = m.series.map((s, si) => {
      if (!s.visible) return [];
      const slot = visIdx.indexOf(si);
      return s.points.map((p, pi): PointPos | null => {
        const sum = boxSummaryOf(dataValuesOf(ctx.opts.data.series[si]?.data)[pi]);
        if (!sum) return null;
        const bandStart = band.scale(bandIndexFor(m, p.xv, pi));
        const x = bandStart + slot * (slotW + BOX_SLOT_GAP) + slotW / 2;
        boxes.push({
          si,
          pi,
          x,
          w: slotW,
          q1Px: ys.scale(sum.q1),
          q3Px: ys.scale(sum.q3),
          medianPx: ys.scale(sum.median),
          minPx: ys.scale(sum.min),
          maxPx: ys.scale(sum.max),
          outliersPx: sum.outliers.map((o) => ys.scale(o)),
        });
        return { x, y: ys.scale(sum.median), y0: L.baselinePx };
      });
    });
    const extra: BoxplotExtra = { boxes };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme, model: m, layout: L, geom, hover } = ctx;
    const extra = geom.extra as BoxplotExtra | undefined;
    if (!extra) return;
    const pad = OUTLIER_RADIUS + 4;
    r.clipRect(L.plot.x - pad, L.plot.y - pad, L.plot.w + 2 * pad, L.plot.h + 2 * pad, () => {
      for (const b of extra.boxes) {
        const s = m.series[b.si];
        if (!s) continue;
        const color = seriesColor(s, theme);
        const hovered = hover !== null && hover.si === b.si && hover.pi === b.pi;
        const alpha = hover && !hovered ? 0.5 : 1;
        const capW = b.w / 2;
        // Whiskers (max is the top on screen: smaller pixel y).
        r.line(b.x, b.maxPx, b.x, b.q3Px, { color, width: 1 }, alpha);
        r.line(b.x, b.q1Px, b.x, b.minPx, { color, width: 1 }, alpha);
        r.line(b.x - capW / 2, b.maxPx, b.x + capW / 2, b.maxPx, { color, width: 1 }, alpha);
        r.line(b.x - capW / 2, b.minPx, b.x + capW / 2, b.minPx, { color, width: 1 }, alpha);
        // Box q1–q3.
        const top = Math.min(b.q1Px, b.q3Px);
        const h = Math.max(1, Math.abs(b.q1Px - b.q3Px));
        r.rect(b.x - b.w / 2, top, b.w, h, { fill: color, alpha });
        // Median line in surface ink for contrast on the filled box.
        r.line(b.x - b.w / 2, b.medianPx, b.x + b.w / 2, b.medianPx, { color: theme.surface, width: 2 }, alpha);
        // Outlier dots (>= 8px diameter) with a surface ring.
        for (const oy of b.outliersPx) {
          r.circle(b.x, oy, OUTLIER_RADIUS, {
            fill: color,
            stroke: { color: theme.surface, width: OUTLIER_RING },
            alpha,
          });
        }
      }
    });
  },

  hitTest(ctx, px, py): HoverState | null {
    const extra = ctx.geom.extra as BoxplotExtra | undefined;
    const L = ctx.layout;
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    if (!extra || !band) return null;
    if (py < L.plot.y - hitRadius() || py > L.plot.y + L.plot.h + hitRadius()) return null;
    const bandIdx = band.invertIndex(px);
    if (bandIdx < 0) return null;
    let best: HoverState | null = null;
    let bestScore = Infinity;
    for (const b of extra.boxes) {
      const s = ctx.model.series[b.si];
      const p = s?.points[b.pi];
      if (!s || !p) continue;
      if (bandIndexFor(ctx.model, p.xv, b.pi) !== bandIdx) continue;
      const lo = Math.min(b.maxPx, b.minPx, ...b.outliersPx);
      const hi = Math.max(b.maxPx, b.minPx, ...b.outliersPx);
      const inside = py >= lo - 2 && py <= hi + 2;
      const score = Math.abs(b.x - px) + (inside ? 0 : 10000);
      if (score < bestScore) {
        bestScore = score;
        best = { si: b.si, pi: b.pi };
      }
    }
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
    const multi = m.series.length > 1;
    const rows: A11yTableSpec['rows'] = [];
    m.series.forEach((s, si) => {
      s.points.forEach((p, pi) => {
        const sum = boxSummaryOf(dataValuesOf(ctx.opts.data.series[si]?.data)[pi]);
        const cat = m.categories?.[bandIndexFor(m, p.xv, pi)] ?? p.x ?? pi;
        const header = multi ? `${formatValue(cat)} — ${s.name}` : formatValue(cat);
        if (!sum) {
          rows.push({ header, cells: ['—', '—', '—', '—', '—', '—'] });
          return;
        }
        rows.push({
          header,
          cells: [
            formatValue(sum.min),
            formatValue(sum.q1),
            formatValue(sum.median),
            formatValue(sum.q3),
            formatValue(sum.max),
            sum.outliers.length > 0 ? sum.outliers.map((o) => formatValue(o)).join(', ') : '—',
          ],
        });
      });
    });
    return { columns: ['Category', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Outliers'], rows };
  },

  keyboardNav(model): NavContext {
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  announce(ctx, pos): string | null {
    const s = ctx.model.series[pos.si];
    const p = s?.points[pos.pi];
    if (!s || !p) return null;
    const sum = boxSummaryOf(dataValuesOf(ctx.opts.data.series[pos.si]?.data)[pos.pi]);
    if (!sum) return null;
    const cat = ctx.model.categories?.[bandIndexFor(ctx.model, p.xv, pos.pi)] ?? p.x ?? pos.pi;
    return (
      `${formatValue(cat)}: min ${formatValue(sum.min)}, q1 ${formatValue(sum.q1)}, median ${formatValue(sum.median)}, ` +
      `q3 ${formatValue(sum.q3)}, max ${formatValue(sum.max)}. ${s.name}, point ${pos.pi + 1} of ${s.points.length}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    const sum = boxSummaryOf(dataValuesOf(ctx.opts.data.series[hit.si]?.data)[hit.pi]);
    if (!tp || !sum) return tp ? [tp] : [];
    tp.formattedY =
      `min ${formatValue(sum.min)} · q1 ${formatValue(sum.q1)} · median ${formatValue(sum.median)} · ` +
      `q3 ${formatValue(sum.q3)} · max ${formatValue(sum.max)}` +
      (sum.outliers.length > 0 ? ` · outliers ${sum.outliers.map((o) => formatValue(o)).join(', ')}` : '');
    return [tp];
  },
};
