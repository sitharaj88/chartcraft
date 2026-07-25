/**
 * Data normalization: folds the three DataValue shapes into one internal
 * point representation. Pure functions — no DOM.
 */
import type { DataValue, GraphData, SeriesData, TreeNode } from '../types';
import { downsampleLTTB } from './downsample';

export interface NormalizedPoint {
  /** Original x value for display (category, Date, number) or null. */
  x: number | Date | string | null;
  /** Numeric x for continuous scales (ms for Dates) or band index; null = unknown. */
  xv: number | null;
  /** y value; null = gap. For o/h/l/c data, y defaults to the close. */
  y: number | null;
  label?: string;
  color?: string;
  // v0.2 rich fields, carried through verbatim (per-type semantics).
  /** bubble size value (maps to marker area) */
  r?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  min?: number;
  q1?: number;
  median?: number;
  q3?: number;
  max?: number;
  outliers?: number[];
  isTotal?: boolean;
  children?: TreeNode[];
  // v0.3 rich fields, carried through verbatim (per-type semantics).
  /** rangearea / bullet range / gantt span: lower bound */
  low?: number | null;
  /** rangearea / bullet range / gantt span: upper bound */
  high?: number | null;
  /** asymmetric error bar lower bound (absolute value) */
  eLow?: number;
  /** asymmetric error bar upper bound (absolute value) */
  eHigh?: number;
  /** bullet target marker */
  target?: number;
  /** gantt task span start (verbatim: number | Date) */
  start?: number | Date;
  /** gantt task span end (verbatim: number | Date) */
  end?: number | Date;
  /** gantt swimlane / network cluster / parallel class */
  group?: string;
  /** wordcloud term weight (alias of y) */
  weight?: number;
  /** network node id / sankey node id */
  id?: string;
}

/**
 * How a three-element tuple `[a, b, c]` is read (registry `needs.triple`):
 * - 'size'  (default, v0.2 behavior): `[x, y, r]` — bubble size channel.
 * - 'range': `[x, low, high]` — rangearea/dumbbell band (y mirrors `low` so
 *   generic gap/domain/hit-test plumbing keeps working; `high` joins the
 *   y-extent through the low/high extent rule in model.ts).
 */
export type TripleMode = 'size' | 'range';

export interface NormalizeOptions {
  /** Default 'size' — v0.2 tuple behavior is byte-identical. */
  triple?: TripleMode;
  /** `SeriesOptions.lowKey`: object-data field read into `low` (default 'low'). */
  lowKey?: string;
  /** `SeriesOptions.highKey`: object-data field read into `high` (default 'high'). */
  highKey?: string;
}

export type Category = string | number | Date;

/** Convert an x value into its numeric form (epoch ms for Dates). */
export function toNumericX(x: number | Date): number {
  return x instanceof Date ? x.getTime() : x;
}

/**
 * A VALUE, or null when it is not a real number.
 *
 * The contract's `DataValue` is `number | null` and defines `null` as "gap".
 * `NaN` and `±Infinity` are IEEE artifacts, not data: they arrive from a failed
 * parse, a divide-by-zero or a JSON round-trip, and every one of them is
 * poison downstream —
 *
 * - `Infinity` in a series silently destroys the value domain (`max` becomes
 *   `Infinity`, so every real datum collapses onto the baseline and the chart
 *   renders a flat line with no error);
 * - `NaN` reaches the renderer as a non-finite coordinate, which Canvas2D
 *   silently *ignores* — the mark vanishes with no gap to show it was there;
 * - a `NaN`-normalized ramp position indexes off the end of a color ramp.
 *
 * Folding them into `null` at the single ingest point means one code path
 * handles "no value" for the whole pipeline: gaps in lines, skipped marks,
 * `—` in the a11y table and in `exportData()`, and an untouched value domain.
 */
function value(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Normalize one series' data. `categories` (when present) provides x values
 * for plain-number entries and index lookup for string x values.
 */
export function normalizeSeriesData(
  data: readonly DataValue[],
  categories: readonly Category[] | null,
  options?: NormalizeOptions,
): NormalizedPoint[] {
  const triple: TripleMode = options?.triple ?? 'size';
  // Only non-default key names need remapping ('low'/'high' land natively).
  const lowKey = options?.lowKey && options.lowKey !== 'low' ? options.lowKey : null;
  const highKey = options?.highKey && options.highKey !== 'high' ? options.highKey : null;
  const catIndex = categories ? buildCategoryIndex(categories) : null;
  const out: NormalizedPoint[] = new Array(data.length);

  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? null;
    if (v === null || typeof v === 'number') {
      out[i] = {
        x: categories ? (categories[i] ?? i) : i,
        xv: i,
        y: value(v),
      };
    } else if (Array.isArray(v)) {
      const xr = v[0];
      if (v.length >= 5) {
        // [x, o, h, l, c] — y defaults to the close for tables/tooltips/domains.
        const [, o, h, l, c] = v as [number | Date, number, number, number, number];
        out[i] = { x: xr, xv: toNumericX(xr), y: value(c), o, h, l, c };
      } else if (v.length === 3) {
        const [, br, cr] = v as [number | Date, number, number];
        out[i] =
          triple === 'range'
            ? // [x, low, high] range pair — y mirrors low.
              { x: xr, xv: toNumericX(xr), y: value(br), low: value(br), high: value(cr) }
            : // [x, y, r] bubble triple.
              { x: xr, xv: toNumericX(xr), y: value(br), r: cr };
      } else {
        const yr = (v as [number | Date, number | null])[1];
        out[i] = { x: xr, xv: toNumericX(xr), y: value(yr) };
      }
    } else {
      // Object shape (DataPoint): { x?, y?, label?, color?, ...rich fields }
      // y falls back to the close (ohlc), then `weight` (contract: an alias of
      // y), then `low` (a range's representative value) so the generic
      // gap/domain/navigation plumbing works for every shape.
      const p: NormalizedPoint = { x: null, xv: null, y: value(v.y ?? v.c ?? v.weight ?? v.low) };
      if (v.label !== undefined) p.label = v.label;
      if (v.color !== undefined) p.color = v.color;
      if (v.r !== undefined) p.r = v.r;
      if (v.o !== undefined) p.o = v.o;
      if (v.h !== undefined) p.h = v.h;
      if (v.l !== undefined) p.l = v.l;
      if (v.c !== undefined) p.c = v.c;
      if (v.min !== undefined) p.min = v.min;
      if (v.q1 !== undefined) p.q1 = v.q1;
      if (v.median !== undefined) p.median = v.median;
      if (v.q3 !== undefined) p.q3 = v.q3;
      if (v.max !== undefined) p.max = v.max;
      if (v.outliers !== undefined) p.outliers = v.outliers;
      if (v.isTotal !== undefined) p.isTotal = v.isTotal;
      if (v.children !== undefined) p.children = v.children;
      // v0.3 fields — carried through verbatim, losslessly. `low`/`high` are
      // VALUES (they join the value domain and drive band geometry), so they go
      // through the same non-finite fold as `y`.
      if (v.low !== undefined) p.low = value(v.low);
      if (v.high !== undefined) p.high = value(v.high);
      if (v.eLow !== undefined) p.eLow = v.eLow;
      if (v.eHigh !== undefined) p.eHigh = v.eHigh;
      if (v.target !== undefined) p.target = v.target;
      if (v.start !== undefined) p.start = v.start;
      if (v.end !== undefined) p.end = v.end;
      if (v.group !== undefined) p.group = v.group;
      if (v.weight !== undefined) p.weight = v.weight;
      if (v.id !== undefined) p.id = v.id;
      // Custom range field names (SeriesOptions.lowKey / highKey).
      if (lowKey || highKey) {
        const bag = v as unknown as Record<string, unknown>;
        if (lowKey) {
          const lv = bag[lowKey];
          if (typeof lv === 'number' || lv === null) p.low = value(lv);
        }
        if (highKey) {
          const hv = bag[highKey];
          if (typeof hv === 'number' || hv === null) p.high = value(hv);
        }
        if (p.y === null && typeof p.low === 'number') p.y = p.low;
      }
      const x = v.x;
      if (x === undefined) {
        p.x = categories ? (categories[i] ?? i) : i;
        p.xv = i;
      } else if (typeof x === 'string') {
        p.x = x;
        p.xv = catIndex ? (catIndex.get(x) ?? i) : i;
      } else {
        p.x = x;
        p.xv = toNumericX(x);
      }
      out[i] = p;
    }
  }
  return out;
}

function buildCategoryIndex(categories: readonly Category[]): Map<string, number> {
  const m = new Map<string, number>();
  categories.forEach((c, i) => {
    const k = String(c instanceof Date ? c.getTime() : c);
    if (!m.has(k)) m.set(k, i);
  });
  return m;
}

export type XType = 'linear' | 'time' | 'category' | 'log';

/**
 * Infer the x-axis type from data when not explicitly configured.
 *
 * Precedence, highest first:
 *   1. the CALLER's `xAxis.type` — always wins;
 *   2. a declared BAND axis (`needs.xScale: 'band'`) and the `bar` special case;
 *   3. genuinely categorical data — supplied `categories`, or string `x` values;
 *   4. what the data looks like (a `Date` sample -> time);
 *   5. a declared TIME axis (`needs.xScale: 'time'`, v0.3.2 / E-5) — so a bare
 *      number on a candlestick, an ohlc or a gantt is epoch milliseconds BY
 *      DECLARATION rather than by sniffing its magnitude;
 *   6. linear.
 *
 * The declaration deliberately sits BELOW the category checks: string x values
 * and caller-supplied categories put the rest of the pipeline on a band scale
 * (`bandIndexFor`, tick lookup, the a11y table all address bands by index), and
 * a declaration must not contradict a placement everything else is already
 * using. A type that declares time and receives categories gets categories.
 */
export function inferXType(args: {
  explicit?: 'linear' | 'time' | 'log' | 'category' | undefined;
  chartType: string;
  hasCategories: boolean;
  sampleXs: readonly (number | Date | string | null)[];
  /** Chart types that declare a band x-axis (registry `needs.xScale: 'band'`). */
  forceCategory?: boolean;
  /** Chart types that declare a time x-axis (registry `needs.xScale: 'time'`). */
  forceTime?: boolean;
}): XType {
  if (args.explicit) return args.explicit;
  if (args.forceCategory) return 'category';
  if (args.chartType === 'bar') return 'category';
  if (args.hasCategories) return 'category';
  for (const x of args.sampleXs) {
    if (x instanceof Date) return 'time';
    if (typeof x === 'string') return 'category';
  }
  if (args.forceTime) return 'time';
  return 'linear';
}

/** Derive categories from string x values when none were provided. */
export function deriveCategories(seriesPoints: readonly NormalizedPoint[][]): Category[] | null {
  const cats: Category[] = [];
  const seen = new Set<string>();
  let sawString = false;
  for (const pts of seriesPoints) {
    for (const p of pts) {
      if (typeof p.x === 'string') {
        sawString = true;
        if (!seen.has(p.x)) {
          seen.add(p.x);
          cats.push(p.x);
        }
      }
    }
  }
  return sawString ? cats : null;
}

/**
 * Slice a normalized series down to the x-window `[lo, hi]` (a zoom viewport),
 * padded by one point on each side so lines/areas still exit the plot edges.
 * Points with an unknown `xv` (gap markers) inside the retained index range
 * are kept. Returns an empty array when nothing falls inside the window.
 */
export function windowNormalized(
  points: readonly NormalizedPoint[],
  lo: number,
  hi: number,
): NormalizedPoint[] {
  let first = -1;
  let last = -1;
  for (let i = 0; i < points.length; i++) {
    const xv = points[i]?.xv;
    if (xv === null || xv === undefined) continue;
    if (xv >= lo && xv <= hi) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return [];
  const from = Math.max(0, first - 1);
  const to = Math.min(points.length, last + 2);
  return points.slice(from, to);
}

/**
 * Downsample a normalized series with LTTB while preserving null gaps:
 * each contiguous non-null run is downsampled proportionally.
 */
export function downsampleNormalized(points: NormalizedPoint[], threshold: number): NormalizedPoint[] {
  if (points.length <= threshold) return points;

  interface Run {
    start: number;
    end: number; // exclusive
  }
  const runs: Run[] = [];
  let runStart = -1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const valid = p !== undefined && p.y !== null && p.xv !== null;
    if (valid && runStart < 0) runStart = i;
    if (!valid && runStart >= 0) {
      runs.push({ start: runStart, end: i });
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push({ start: runStart, end: points.length });
  if (runs.length === 0) return points.slice(0, threshold);

  const totalValid = runs.reduce((acc, r) => acc + (r.end - r.start), 0);
  const gapBudget = runs.length - 1; // one null marker between runs
  const budget = Math.max(runs.length * 2, threshold - gapBudget);

  const out: NormalizedPoint[] = [];
  runs.forEach((run, ri) => {
    const len = run.end - run.start;
    const share = Math.max(2, Math.round((len / totalValid) * budget));
    const seg = points.slice(run.start, run.end) as (NormalizedPoint & { xv: number; y: number })[];
    const idx = seg.map((p, i) => ({ x: p.xv, y: p.y, i }));
    const picked = downsampleLTTB(idx, Math.min(share, len));
    for (const s of picked) out.push(seg[s.i] as NormalizedPoint);
    if (ri < runs.length - 1) out.push({ x: null, xv: null, y: null });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Range (low/high) helpers
//
// They live here — next to `NormalizedPoint`, in a leaf module — because BOTH
// the model (which resolves the `'rangearea'` mark kind from the data) and the
// band mark itself need them, and a chart-type module cannot be imported from
// `model.ts` without closing an ESM cycle.

/** A resolved `[low, high]` pair (both bounds finite). */
export interface RangePair {
  low: number;
  high: number;
}

/**
 * A point's low/high pair, but only when BOTH bounds are finite numbers — a
 * half-open range has no band/dumbbell geometry, so it reads as a gap.
 */
export function rangeOf(p: NormalizedPoint | null | undefined): RangePair | null {
  if (!p) return null;
  const { low, high } = p;
  if (typeof low !== 'number' || typeof high !== 'number') return null;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { low, high };
}

/** True when at least one point of the series carries a full low/high pair. */
export function hasRangeData(points: readonly NormalizedPoint[]): boolean {
  for (const p of points) {
    if (rangeOf(p)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SeriesData narrowing
//
// `SeriesOptions.data` admits either a list of `DataValue`s or — for the two
// GRAPH types, whose whole series IS the graph — a `GraphData` payload. Every
// list-shaped reader goes through `dataValuesOf`, which is the ONE place that
// narrowing happens, so no per-type module needs a cast and no caller does
// either.

/** True when a series carries a `{ nodes, links }` graph payload. */
export function isGraphData(data: SeriesData | undefined): data is GraphData {
  return !!data && !Array.isArray(data) && typeof data === 'object' && 'nodes' in data;
}

/** A series' value list — empty for a graph payload (it has no data values). */
export function dataValuesOf(data: SeriesData | undefined): DataValue[] {
  return Array.isArray(data) ? data : [];
}
