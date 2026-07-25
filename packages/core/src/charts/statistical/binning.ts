/**
 * Histogram binning. Pure, DOM-free.
 *
 * 'auto' = Freedman–Diaconis, with the raw FD width snapped UP to a "nice"
 * 1/2/5×10^k width and the first edge aligned to a multiple of that width.
 * That way the pipeline's nice-tick generator lands ticks exactly on bin
 * edges (see the histogram definition, which sets the x tick count to the
 * bin count). The bin count is clamped to 5..60 by walking the nice-width
 * ladder up/down. Explicit numeric `bins` splits the raw data extent into
 * exactly that many equal bins.
 */
import { roundFP } from '../../util';
import { quantileR7 } from './stats';

export const AUTO_BIN_MIN = 5;
export const AUTO_BIN_MAX = 60;

/** Freedman–Diaconis bin width: 2·IQR·n^(-1/3). 0 when degenerate. */
export function freedmanDiaconisWidth(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n < 2) return 0;
  const iqr = quantileR7(sorted, 0.75) - quantileR7(sorted, 0.25);
  return (2 * iqr) / Math.cbrt(n);
}

/** Decompose a positive width into nice mantissa f ∈ {1,2,5} and exponent k, f·10^k >= raw. */
function niceCeil(raw: number): [number, number] {
  const k = Math.floor(Math.log10(raw));
  const f = raw / Math.pow(10, k);
  if (f <= 1 + 1e-9) return [1, k];
  if (f <= 2 + 1e-9) return [2, k];
  if (f <= 5 + 1e-9) return [5, k];
  return [1, k + 1];
}

function niceUp(f: number, k: number): [number, number] {
  return f === 1 ? [2, k] : f === 2 ? [5, k] : [1, k + 1];
}

function niceDown(f: number, k: number): [number, number] {
  return f === 1 ? [5, k - 1] : f === 2 ? [1, k] : [2, k];
}

function uniformEdges(lo: number, hi: number, n: number): number[] {
  const edges: number[] = [];
  for (let i = 0; i <= n; i++) edges.push(roundFP(lo + ((hi - lo) * i) / n));
  return edges;
}

/** Auto (Freedman–Diaconis) bin edges with nice widths, clamped 5..60 bins. */
export function autoBinEdges(values: readonly number[]): number[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const lo = v[0] as number;
  const hi = v[v.length - 1] as number;
  if (lo === hi) return uniformEdges(lo - 0.5, hi + 0.5, AUTO_BIN_MIN);

  let raw = freedmanDiaconisWidth(v);
  if (!(raw > 0)) {
    // Degenerate IQR: fall back to a Sturges-flavored count over the span.
    const k = Math.min(AUTO_BIN_MAX, Math.max(AUTO_BIN_MIN, Math.ceil(Math.log2(v.length) + 1)));
    raw = (hi - lo) / k;
  }

  let [f, k] = niceCeil(raw);
  const measure = (width: number): { start: number; count: number } => {
    const start = Math.floor(lo / width) * width;
    const count = Math.max(1, Math.ceil((hi - start) / width - 1e-9));
    return { start, count };
  };

  let width = f * Math.pow(10, k);
  let m = measure(width);
  let guard = 0;
  while (m.count < AUTO_BIN_MIN && guard++ < 80) {
    [f, k] = niceDown(f, k);
    width = f * Math.pow(10, k);
    m = measure(width);
  }
  while (m.count > AUTO_BIN_MAX && guard++ < 80) {
    [f, k] = niceUp(f, k);
    width = f * Math.pow(10, k);
    m = measure(width);
  }

  const edges: number[] = [];
  for (let i = 0; i <= m.count; i++) edges.push(roundFP(m.start + i * width));
  return edges;
}

/** Bin edges for `bins: number | 'auto'`. Explicit n spans the raw extent. */
export function binEdges(values: readonly number[], bins: number | 'auto'): number[] {
  if (bins === 'auto') return autoBinEdges(values);
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return [];
  const n = Math.max(1, Math.floor(bins));
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (lo === hi) {
    lo -= 0.5;
    hi += 0.5;
  }
  return uniformEdges(lo, hi, n);
}

/**
 * Per-bin sample counts against uniform-width `edges`. Bins are
 * left-inclusive; the last bin includes its right edge.
 */
export function binCounts(values: readonly number[], edges: readonly number[]): number[] {
  const n = edges.length - 1;
  if (n < 1) return [];
  const e0 = edges[0] as number;
  const eN = edges[n] as number;
  const width = (eN - e0) / n;
  const counts = new Array<number>(n).fill(0);
  if (!(width > 0)) return counts;
  const eps = Math.abs(eN - e0) * 1e-9;
  for (const v of values) {
    if (!Number.isFinite(v) || v < e0 - eps || v > eN + eps) continue;
    const bi = Math.max(0, Math.min(n - 1, Math.floor((v - e0) / width)));
    counts[bi] = (counts[bi] as number) + 1;
  }
  return counts;
}
