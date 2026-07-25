/**
 * Shared statistical math for the statistical chart types. Pure, DOM-free.
 *
 * Quartiles use linear interpolation between order statistics — method R-7
 * (the default of R, NumPy and spreadsheet QUARTILE), as the contract's
 * boxplot spec requires.
 */

/** R-7 quantile (linear interpolation) of an ASCENDING-sorted sample. */
export function quantileR7(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0] as number;
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (h - lo) * (b - a);
}

export interface FiveNumberSummary {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
}

/**
 * Tukey box summary of a raw sample: quartiles via R-7; whiskers reach the
 * most extreme samples within 1.5×IQR of the box; samples beyond the fences
 * are outliers. Returns null for an empty/non-finite sample.
 */
export function summarizeBox(values: readonly number[]): FiveNumberSummary | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const q1 = quantileR7(v, 0.25);
  const median = quantileR7(v, 0.5);
  const q3 = quantileR7(v, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const inliers = v.filter((x) => x >= loFence && x <= hiFence);
  const outliers = v.filter((x) => x < loFence || x > hiFence);
  const min = inliers.length > 0 ? (inliers[0] as number) : (v[0] as number);
  const max = inliers.length > 0 ? (inliers[inliers.length - 1] as number) : (v[v.length - 1] as number);
  return { min, q1, median, q3, max, outliers };
}
