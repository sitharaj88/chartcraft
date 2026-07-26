/**
 * Violin plot (v0.3 contract).
 *
 * Per category the series supplies a RAW `number[]` sample. The definition
 * estimates a Gaussian KDE and mirrors it around the category axis:
 *
 * - Bandwidth: `violin.bandwidth` (a positive number), otherwise `'auto'` =
 *   **Silverman's rule of thumb**  h = 0.9 * min(sd, IQR/1.34) * n^(-1/5)
 *   (Silverman 1986, eq. 3.31) with the sample standard deviation (n-1) and
 *   R-7 quartiles.
 * - Density is evaluated on `VIOLIN_KDE_SAMPLES` points across the sample's
 *   own [min, max] (a trimmed violin: the shape never claims support the data
 *   does not have, and the value axis then matches the box whiskers).
 * - Fill at 0.35 alpha in the series color + a 1px outline.
 * - Optional inner box plot per `violin.showBox` (default true) reusing the
 *   shared R-7 / Tukey helpers (`statistical/stats.ts`) — quartile math is
 *   never reimplemented here.
 * - A11y table = the 5-number summary + n per category.
 *
 * Raw arrays are read from the RAW options data (the generic normalizer folds
 * numeric arrays into tuple shapes), exactly as the boxplot does.
 */
import type { ChartData, TooltipPoint } from '../../types';
import { dataValuesOf } from '../../data/normalize';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { ChartTypeDefinition } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import type { PathCmd } from '../../render/renderer';
import { seriesColor } from '../../model';
import { BandScale } from '../../scales/band';
import { niceValueDomain } from '../../scales';
import { formatValue } from '../../util';
import { hitRadius } from '../../interaction/hittest';
import { quantileR7, summarizeBox, type FiveNumberSummary } from '../statistical/stats';

export const VIOLIN_FILL_ALPHA = 0.35;
export const VIOLIN_OUTLINE_WIDTH = 1;
/** Surface-colored gap between adjacent violins in one band. */
export const VIOLIN_SLOT_GAP = 2;
/** Density samples per violin (both mirrored halves share them). */
export const VIOLIN_KDE_SAMPLES = 64;
/** Inner box width cap (px) and its share of the slot. */
export const VIOLIN_BOX_MAX_WIDTH = 8;
export const VIOLIN_BOX_SLOT_SHARE = 0.35;
/** Median dot radius on the inner box. */
export const VIOLIN_MEDIAN_RADIUS = 2.5;
/** Silverman's constant and IQR divisor. */
export const SILVERMAN_FACTOR = 0.9;
export const SILVERMAN_IQR_DIVISOR = 1.34;

// ---------------------------------------------------------------------------
// Sample extraction (RAW data — any numeric array entry is a raw sample)

/** Finite numbers of one raw data entry; empty when the entry is not a sample. */
export function violinSampleOf(entry: unknown): number[] {
  if (!Array.isArray(entry)) return [];
  return (entry as unknown[]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/** Per-series, per-category samples over a chart's RAW data. */
export function violinSamples(data: ChartData): number[][][] {
  return data.series.map((s) => dataValuesOf(s.data).map((entry) => violinSampleOf(entry)));
}

/** Value extent over every visible series' samples ([0, 1] when empty). */
export function violinExtent(data: ChartData): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  data.series.forEach((s) => {
    if (s.visible === false) return;
    for (const entry of dataValuesOf(s.data)) {
      for (const v of violinSampleOf(entry)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  });
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  return [lo, hi];
}

// ---------------------------------------------------------------------------
// KDE math (pure)

/** Sample standard deviation (n-1 denominator); 0 for n < 2. */
export function sampleStdDev(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return Math.sqrt(sq / (n - 1));
}

/**
 * Silverman's rule of thumb: `0.9 * min(sd, IQR / 1.34) * n^(-1/5)`.
 * Returns 0 when the sample cannot support a bandwidth (n < 2, or zero spread)
 * — callers then draw the box only.
 */
export function silvermanBandwidth(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const sd = sampleStdDev(sorted);
  const iqr = quantileR7(sorted, 0.75) - quantileR7(sorted, 0.25);
  const a = iqr > 0 ? Math.min(sd, iqr / SILVERMAN_IQR_DIVISOR) : sd;
  if (!(a > 0)) return 0;
  return SILVERMAN_FACTOR * a * Math.pow(n, -1 / 5);
}

/** Resolved bandwidth for one sample: an explicit positive number wins. */
export function violinBandwidth(values: readonly number[], option: number | 'auto' | undefined): number {
  if (typeof option === 'number' && Number.isFinite(option) && option > 0) return option;
  return silvermanBandwidth(values);
}

/** Standard normal density. */
export function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(Math.PI * 2);
}

/** Gaussian KDE at `x`: `(1 / (n*h)) * sum K((x - xi) / h)`. */
export function kdeDensityAt(values: readonly number[], h: number, x: number): number {
  const n = values.length;
  if (n === 0 || !(h > 0)) return 0;
  let sum = 0;
  for (const v of values) sum += gaussianKernel((x - v) / h);
  return sum / (n * h);
}

export interface KdeSample {
  value: number;
  density: number;
}

/**
 * Density curve across the sample's own [min, max], `samples` points
 * inclusive of both ends (ascending). Empty when no curve exists.
 */
export function kdeCurve(values: readonly number[], h: number, samples = VIOLIN_KDE_SAMPLES): KdeSample[] {
  const n = values.length;
  if (n === 0 || !(h > 0) || samples < 2) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(hi > lo)) return [];
  const out: KdeSample[] = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const value = lo + ((hi - lo) * i) / (samples - 1);
    out[i] = { value, density: kdeDensityAt(values, h, value) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry

export interface ViolinShapePoint extends KdeSample {
  /** Pixel y of the value. */
  y: number;
  /** Half-width in px (density normalized by this violin's peak). */
  half: number;
}

export interface ViolinGeom {
  si: number;
  pi: number;
  /** Slot center on the category axis (the mirror line). */
  cx: number;
  slotW: number;
  /** Maximum half-width (peak density). */
  halfW: number;
  n: number;
  bandwidth: number;
  shape: ViolinShapePoint[];
  summary: FiveNumberSummary | null;
  /** Tukey box/whisker pixel positions (null without a summary). */
  boxPx: { q1: number; q3: number; median: number; min: number; max: number } | null;
}

export interface ViolinExtra {
  violins: ViolinGeom[];
  showBox: boolean;
}

/**
 * Mirror a density curve into pixel space: `half` scales the density by the
 * violin's own peak, so every violin peaks at the full slot half-width.
 */
export function violinShape(
  curve: readonly KdeSample[],
  halfW: number,
  toPx: (value: number) => number,
): ViolinShapePoint[] {
  let peak = 0;
  for (const c of curve) if (c.density > peak) peak = c.density;
  if (!(peak > 0)) return [];
  return curve.map((c) => ({ ...c, y: toPx(c.value), half: (c.density / peak) * halfW }));
}

// ---------------------------------------------------------------------------

export const violinDefinition: ChartTypeDefinition = {
  id: 'violin',
  // A violin's `data[i]` is the raw sample for `categories[i]`; the normalized
  // `x` is an artifact of folding a `number[]` into a tuple shape, so bands are
  // addressed POSITIONALLY. Declaring it makes `bandIndexFor` — and therefore
  // the pipeline's tooltip header, tick lookup and a11y plumbing — agree with
  // this module instead of needing a local override.
  needs: { cartesianAxes: true, xScale: 'band', bandIndex: 'position' },

  resolveOptions(_resolved, raw) {
    const bw = raw.violin?.bandwidth;
    if (typeof bw === 'number' && (!Number.isFinite(bw) || bw <= 0)) {
      throw new Error(
        `@chartcraft/core: violin.bandwidth must be a positive number or 'auto'; got ${String(bw)} ` +
          `('auto' = Silverman's rule of thumb).`,
      );
    }
  },

  /**
   * The value axis must cover every raw sample (the KDE is trimmed to them),
   * and samples are read from the RAW data — invisible to the generic value
   * extent. Pipeline stage, so `getOptions().yAxis` stays the caller's.
   */
  extendValueDomain(model, opts) {
    const [lo, hi] = violinExtent(opts.data);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return niceValueDomain(lo, hi, model.valueAxisLog);
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
    const slotW = Math.max(1, (bw - VIOLIN_SLOT_GAP * (k - 1)) / k);
    const bwOption = ctx.opts.violin?.bandwidth ?? 'auto';

    const violins: ViolinGeom[] = [];
    const pos: (PointPos | null)[][] = m.series.map((s, si) => {
      if (!s.visible) return [];
      const slot = visIdx.indexOf(si);
      return s.points.map((p, pi): PointPos | null => {
        const values = violinSampleOf(dataValuesOf(ctx.opts.data.series[si]?.data)[pi]);
        if (values.length === 0) return null;
        // Bands are addressed POSITIONALLY: data[pi] is the sample for
        // categories[pi]. The normalized point's x is meaningless here (the
        // generic normalizer folds a raw number[] into a tuple shape).
        const bandStart = band.scale(pi);
        const cx = bandStart + slot * (slotW + VIOLIN_SLOT_GAP) + slotW / 2;
        const h = violinBandwidth(values, bwOption);
        const summary = summarizeBox(values);
        violins.push({
          si,
          pi,
          cx,
          slotW,
          halfW: slotW / 2,
          n: values.length,
          bandwidth: h,
          shape: violinShape(kdeCurve(values, h), slotW / 2, (v) => ys.scale(v)),
          summary,
          boxPx: summary
            ? {
                q1: ys.scale(summary.q1),
                q3: ys.scale(summary.q3),
                median: ys.scale(summary.median),
                min: ys.scale(summary.min),
                max: ys.scale(summary.max),
              }
            : null,
        });
        return {
          x: cx,
          y: ys.scale(summary ? summary.median : (values[0] as number)),
          y0: L.baselinePx,
        };
      });
    });
    const extra: ViolinExtra = { violins, showBox: ctx.opts.violin?.showBox ?? true };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme: t, model: m, layout: L, geom, hover } = ctx;
    const extra = geom.extra as ViolinExtra | undefined;
    if (!extra) return;
    r.clipRect(L.plot.x - 4, L.plot.y - 4, L.plot.w + 8, L.plot.h + 8, () => {
      for (const v of extra.violins) {
        const s = m.series[v.si];
        if (!s) continue;
        const color = seriesColor(s, t);
        const hovered = hover !== null && hover.si === v.si && hover.pi === v.pi;
        const alpha = hover && !hovered ? 0.5 : 1;

        // Mirrored KDE outline: up the left side, back down the right side.
        if (v.shape.length >= 2) {
          const cmds: PathCmd[] = [];
          v.shape.forEach((p, i) => {
            cmds.push([i === 0 ? 'M' : 'L', v.cx - p.half, p.y]);
          });
          for (let i = v.shape.length - 1; i >= 0; i--) {
            const p = v.shape[i] as ViolinShapePoint;
            cmds.push(['L', v.cx + p.half, p.y]);
          }
          cmds.push(['Z']);
          r.path(cmds, { fill: color, alpha: VIOLIN_FILL_ALPHA * alpha });
          r.path(cmds, { stroke: { color, width: VIOLIN_OUTLINE_WIDTH, join: 'round' }, alpha });
        }

        // Inner box plot (neutral ink, never a series hue) + surface median dot.
        if (extra.showBox && v.boxPx) {
          const boxW = Math.max(2, Math.min(VIOLIN_BOX_MAX_WIDTH, v.slotW * VIOLIN_BOX_SLOT_SHARE));
          r.line(v.cx, v.boxPx.max, v.cx, v.boxPx.min, { color: t.neutral, width: 1 }, alpha);
          const top = Math.min(v.boxPx.q1, v.boxPx.q3);
          const h = Math.max(1, Math.abs(v.boxPx.q1 - v.boxPx.q3));
          r.rect(v.cx - boxW / 2, top, boxW, h, { fill: t.neutral, alpha });
          r.circle(v.cx, v.boxPx.median, VIOLIN_MEDIAN_RADIUS, { fill: t.surface, alpha });
        }
      }
    });
  },

  hitTest(ctx, px, py): HoverState | null {
    const extra = ctx.geom.extra as ViolinExtra | undefined;
    const L = ctx.layout;
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    if (!extra || !band) return null;
    if (py < L.plot.y - hitRadius() || py > L.plot.y + L.plot.h + hitRadius()) return null;
    const bandIdx = band.invertIndex(px);
    if (bandIdx < 0) return null;
    let best: HoverState | null = null;
    let bestDist = Infinity;
    for (const v of extra.violins) {
      const p = ctx.model.series[v.si]?.points[v.pi];
      if (!p) continue;
      if (v.pi !== bandIdx) continue;
      const d = Math.abs(v.cx - px);
      if (d < bestDist) {
        bestDist = d;
        best = { si: v.si, pi: v.pi };
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
        const values = violinSampleOf(dataValuesOf(ctx.opts.data.series[si]?.data)[pi]);
        const cat = m.categories?.[pi] ?? pi;
        const header = multi ? `${formatValue(cat)} — ${s.name}` : formatValue(cat);
        const sum = summarizeBox(values);
        if (!sum) {
          rows.push({ header, cells: ['0', '—', '—', '—', '—', '—'] });
          return;
        }
        rows.push({
          header,
          cells: [
            String(values.length),
            formatValue(sum.min),
            formatValue(sum.q1),
            formatValue(sum.median),
            formatValue(sum.q3),
            formatValue(sum.max),
          ],
        });
      });
    });
    return { columns: ['Category', 'n', 'Min', 'Q1', 'Median', 'Q3', 'Max'], rows };
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
    const values = violinSampleOf(dataValuesOf(ctx.opts.data.series[pos.si]?.data)[pos.pi]);
    const sum = summarizeBox(values);
    if (!sum) return null;
    const cat = ctx.model.categories?.[pos.pi] ?? pos.pi;
    return (
      `${formatValue(cat)}: n ${values.length}, min ${formatValue(sum.min)}, q1 ${formatValue(sum.q1)}, ` +
      `median ${formatValue(sum.median)}, q3 ${formatValue(sum.q3)}, max ${formatValue(sum.max)}. ` +
      `${s.name}, point ${pos.pi + 1} of ${s.points.length}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    // `formattedX` is the pipeline's: `needs.bandIndex: 'position'` makes it
    // resolve the category by point index, so no post-processing is needed.
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const values = violinSampleOf(dataValuesOf(ctx.opts.data.series[hit.si]?.data)[hit.pi]);
    const sum = summarizeBox(values);
    if (!sum) return [tp];
    tp.formattedY =
      `n ${values.length} · min ${formatValue(sum.min)} · q1 ${formatValue(sum.q1)} · ` +
      `median ${formatValue(sum.median)} · q3 ${formatValue(sum.q3)} · max ${formatValue(sum.max)}`;
    return [tp];
  },
};
