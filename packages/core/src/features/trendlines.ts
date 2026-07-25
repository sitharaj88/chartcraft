/**
 * Feature 2 — Trendlines (`SeriesOptions.trendline`).
 *
 * Pure, tested math (`linearFit`, `movingAverage`, `exponentialFit`) plus a
 * pipeline-level `Decorator` on the 'over' layer. Trendlines are:
 *
 * - **dashed by default** (`dashed: true`) so they can never read as data;
 * - **legend-labeled** through the `legendItems` decorator hook
 *   (`"<series> trend"` by default, `label: false` opts out);
 * - **excluded from the value domain** — there is deliberately no
 *   `extendYDomain` hook here, and drawing is clipped to the plot, so a steep
 *   fit can never rescale the observed data.
 */
import type { Decorator, DecoratorContext } from '../decorate';
import type { DataModel, NormalizedSeries, ResolvedOptions } from '../model';
import type { LegendItem } from '../components/legend';
import type { ChartType, SeriesKind, TrendlineOptions } from '../types';
import { seriesColor } from '../model';
import { dataPx, decoratesSeries, rawSeriesFor, valuePx } from './shared';

/**
 * Chart ROOTS trendlines decorate (contract: line/scatter/bubble).
 *
 * Retained as the public, documented surface. Gating now happens per SERIES via
 * `TRENDLINE_KINDS` + `decoratesSeries`, so a `line` series inside a `bar` root
 * gets its trendline — see `trendlineSeries`.
 */
export const TRENDLINE_TYPES: readonly ChartType[] = ['line', 'scatter', 'bubble'];

/** Resolved per-series mark kinds a trendline decorates. */
export const TRENDLINE_KINDS: readonly SeriesKind[] = ['line', 'scatter'];

/** Default `movingAverage` window. */
export const DEFAULT_PERIOD = 7;
/** Samples used to draw a fitted exponential curve. */
export const EXP_SAMPLES = 64;
/** Default dash pattern — a trendline must never read as observed data. */
export const TREND_DASH: readonly number[] = [6, 4];

export interface XY {
  x: number;
  y: number;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  /** r² (coefficient of determination), 0 when y has no variance. */
  r2: number;
  predict(x: number): number;
}

/**
 * Ordinary least-squares fit `y = slope*x + intercept`.
 * Needs >= 2 points with distinct x; returns null otherwise.
 */
export function linearFit(points: readonly XY[]): LinearFit | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sxy += p.x * p.y;
    sxx += p.x * p.x;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of pts) {
    ssTot += (p.y - mean) ** 2;
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
  }
  return {
    slope,
    intercept,
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
    predict: (x: number) => slope * x + intercept,
  };
}

/**
 * Centered moving average over `values`, preserving length and index.
 *
 * The window for index `i` is `[i - half, i - half + period - 1]` with
 * `half = floor((period - 1) / 2)` — exactly centered for odd periods, one
 * extra sample on the right for even periods. Windows are CLAMPED at the edges
 * (a partial average, so the line spans the whole series); `null` values are
 * skipped, and an all-null window yields `null`.
 */
export function movingAverage(
  values: readonly (number | null)[],
  period = DEFAULT_PERIOD,
): (number | null)[] {
  const p = Math.max(1, Math.floor(period));
  const half = Math.floor((p - 1) / 2);
  const n = values.length;
  const out: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(n - 1, i - half + p - 1);
    let sum = 0;
    let count = 0;
    for (let k = from; k <= to; k++) {
      const v = values[k];
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      sum += v;
      count++;
    }
    out[i] = count === 0 ? null : sum / count;
  }
  return out;
}

export interface ExponentialFit {
  /** `y = a * e^(b*x)` */
  a: number;
  b: number;
  predict(x: number): number;
}

/**
 * Exponential fit `y = a·e^(b·x)` via a least-squares fit of `ln y` on x
 * (log-linear). Non-positive y values cannot be logged and are dropped;
 * fewer than 2 usable points returns null.
 */
export function exponentialFit(points: readonly XY[]): ExponentialFit | null {
  const logged = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.y > 0)
    .map((p) => ({ x: p.x, y: Math.log(p.y) }));
  const fit = linearFit(logged);
  if (!fit) return null;
  const a = Math.exp(fit.intercept);
  const b = fit.slope;
  return { a, b, predict: (x: number) => a * Math.exp(b * x) };
}

/** Resolved trendline options (defaults applied). */
export interface ResolvedTrendline {
  type: NonNullable<TrendlineOptions['type']>;
  period: number;
  dashed: boolean;
  color?: string;
  label: string | false;
}

export function resolveTrendline(o: TrendlineOptions, seriesName: string): ResolvedTrendline {
  const r: ResolvedTrendline = {
    type: o.type ?? 'linear',
    period: o.period ?? DEFAULT_PERIOD,
    dashed: o.dashed ?? true,
    label: o.label === false ? false : (o.label ?? `${seriesName} trend`),
  };
  if (o.color !== undefined) r.color = o.color;
  return r;
}

/**
 * The trendline as a polyline in DATA units (x in the same units as the
 * points' `xv`), with `null` marking a break. Returns an empty array when the
 * series cannot be fitted.
 *
 * - `'linear'` → the two endpoints of the fitted line over [xmin, xmax];
 * - `'movingAverage'` → one value per input index (gaps preserved);
 * - `'exponential'` → `EXP_SAMPLES` samples of `a·e^(b·x)` across [xmin, xmax].
 */
export function trendlinePolyline(
  points: readonly (XY | null)[],
  o: ResolvedTrendline,
): (XY | null)[] {
  const valid = points.filter((p): p is XY => p !== null && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return [];
  const xs = valid.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);

  if (o.type === 'movingAverage') {
    const ma = movingAverage(
      points.map((p) => (p ? p.y : null)),
      o.period,
    );
    return points.map((p, i) => {
      const y = ma[i];
      return p && y !== null && y !== undefined ? { x: p.x, y } : null;
    });
  }

  if (o.type === 'exponential') {
    const fit = exponentialFit(valid);
    if (!fit) return [];
    if (xMin === xMax) return [{ x: xMin, y: fit.predict(xMin) }];
    const out: XY[] = [];
    for (let i = 0; i < EXP_SAMPLES; i++) {
      const x = xMin + ((xMax - xMin) * i) / (EXP_SAMPLES - 1);
      out.push({ x, y: fit.predict(x) });
    }
    return out;
  }

  const fit = linearFit(valid);
  if (!fit) return [];
  return [
    { x: xMin, y: fit.predict(xMin) },
    { x: xMax, y: fit.predict(xMax) },
  ];
}

// ----------------------------------------------------------------- decorator

/** Series that declare a trendline on a supporting chart type. */
export function trendlineSeries(
  model: DataModel,
  opts: ResolvedOptions,
): { si: number; s: NormalizedSeries; o: ResolvedTrendline }[] {
  const out: { si: number; s: NormalizedSeries; o: ResolvedTrendline }[] = [];
  model.series.forEach((s, si) => {
    if (!s.visible) return;
    if (!decoratesSeries(model, s, TRENDLINE_KINDS)) return;
    const raw = rawSeriesFor(opts, s)?.trendline;
    if (raw) out.push({ si, s, o: resolveTrendline(raw, s.name) });
  });
  return out;
}

/** Screen-space polyline for one series' trendline (null = break). */
export function trendlineScreenPath(
  ctx: DecoratorContext,
  si: number,
): ({ x: number; y: number } | null)[] {
  const entry = trendlineSeries(ctx.model, ctx.opts).find((e) => e.si === si);
  if (!entry) return [];
  const data: (XY | null)[] = entry.s.points.map((p) =>
    p.xv === null || p.y === null ? null : { x: p.xv, y: p.y },
  );
  const poly = trendlinePolyline(data, entry.o);
  return poly.map((pt, i) => {
    if (!pt) return null;
    // Band (category) x: data x is the band index, so `dataPx` returns centers.
    const px = dataPx(ctx, pt.x, i);
    const py = valuePx(ctx, pt.y);
    return px === null || py === null ? null : { x: px, y: py };
  });
}

export const trendlinesDecorator: Decorator = {
  id: 'chartcraft:trendlines',
  layer: 'over',
  order: 20,

  appliesTo(ctx) {
    return trendlineSeries(ctx.model, ctx.opts).length > 0;
  },

  draw(ctx) {
    const plot = ctx.plot;
    const entries = trendlineSeries(ctx.model, ctx.opts);
    if (entries.length === 0) return;
    ctx.r.clipRect(plot.x, plot.y, plot.w, plot.h, () => {
      for (const { si, s, o } of entries) {
        const path = trendlineScreenPath(ctx, si);
        const stroke = {
          color: o.color ?? seriesColor(s, ctx.theme),
          width: 2,
          ...(o.dashed ? { dash: [...TREND_DASH] } : {}),
          cap: 'butt' as const,
        };
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1];
          const b = path[i];
          if (!a || !b) continue;
          ctx.r.line(a.x, a.y, b.x, b.y, stroke);
        }
      }
    });
  },

  /** A trendline is always legend-labeled (never toggleable — it is not data). */
  legendItems(ctx): LegendItem[] {
    return trendlineSeries(ctx.model, ctx.opts)
      .filter((e) => e.o.label !== false)
      .map(({ s, o }) => ({
        id: `${s.id}-trend`,
        name: o.label as string,
        color: o.color ?? seriesColor(s, ctx.theme),
        visible: true,
        toggleable: false,
      }));
  },
};
