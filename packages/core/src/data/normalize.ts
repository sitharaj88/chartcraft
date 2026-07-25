/**
 * Data normalization: folds the three DataValue shapes into one internal
 * point representation. Pure functions — no DOM.
 */
import type { DataValue, TreeNode } from '../types';
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
}

export type Category = string | number | Date;

/** Convert an x value into its numeric form (epoch ms for Dates). */
export function toNumericX(x: number | Date): number {
  return x instanceof Date ? x.getTime() : x;
}

/**
 * Normalize one series' data. `categories` (when present) provides x values
 * for plain-number entries and index lookup for string x values.
 */
export function normalizeSeriesData(
  data: readonly DataValue[],
  categories: readonly Category[] | null,
): NormalizedPoint[] {
  const catIndex = categories ? buildCategoryIndex(categories) : null;
  const out: NormalizedPoint[] = new Array(data.length);

  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? null;
    if (v === null || typeof v === 'number') {
      out[i] = {
        x: categories ? (categories[i] ?? i) : i,
        xv: i,
        y: v ?? null,
      };
    } else if (Array.isArray(v)) {
      const xr = v[0];
      if (v.length >= 5) {
        // [x, o, h, l, c] — y defaults to the close for tables/tooltips/domains.
        const [, o, h, l, c] = v as [number | Date, number, number, number, number];
        out[i] = { x: xr, xv: toNumericX(xr), y: c ?? null, o, h, l, c };
      } else if (v.length === 3) {
        // [x, y, r] bubble triple.
        const [, yr, rr] = v as [number | Date, number, number];
        out[i] = { x: xr, xv: toNumericX(xr), y: yr ?? null, r: rr };
      } else {
        const yr = (v as [number | Date, number | null])[1];
        out[i] = { x: xr, xv: toNumericX(xr), y: yr ?? null };
      }
    } else {
      // Object shape (DataPoint): { x?, y?, label?, color?, ...rich fields }
      const p: NormalizedPoint = { x: null, xv: null, y: v.y ?? v.c ?? null };
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
 */
export function inferXType(args: {
  explicit?: 'linear' | 'time' | 'log' | 'category' | undefined;
  chartType: string;
  hasCategories: boolean;
  sampleXs: readonly (number | Date | string | null)[];
  /** Chart types that declare a band x-axis (registry `needs.xScale: 'band'`). */
  forceCategory?: boolean;
}): XType {
  if (args.explicit) return args.explicit;
  if (args.forceCategory) return 'category';
  if (args.chartType === 'bar') return 'category';
  if (args.hasCategories) return 'category';
  for (const x of args.sampleXs) {
    if (x instanceof Date) return 'time';
    if (typeof x === 'string') return 'category';
  }
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
