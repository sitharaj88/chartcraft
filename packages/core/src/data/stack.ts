/**
 * Stacking math for bar/area charts. Positive and negative values stack in
 * opposite directions (diverging stacks). Null values produce null stack
 * entries (gaps) and contribute nothing.
 */
import type { NormalizedPoint } from './normalize';

export interface StackedSeries {
  points: readonly NormalizedPoint[];
  /** Lower bound of each stacked segment (null = gap). */
  y0: (number | null)[];
  /** Upper bound of each stacked segment (null = gap). */
  y1: (number | null)[];
}

/**
 * Compute y0/y1 stack bounds for the given series (visible series only should
 * be passed in). Series are stacked in array order, index-aligned.
 */
export function computeStacks(seriesPoints: readonly (readonly NormalizedPoint[])[]): StackedSeries[] {
  const maxLen = seriesPoints.reduce((m, s) => Math.max(m, s.length), 0);
  const posSum = new Float64Array(maxLen);
  const negSum = new Float64Array(maxLen);

  return seriesPoints.map((points) => {
    const y0: (number | null)[] = new Array(points.length);
    const y1: (number | null)[] = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const y = points[i]?.y ?? null;
      if (y === null) {
        y0[i] = null;
        y1[i] = null;
        continue;
      }
      if (y >= 0) {
        y0[i] = posSum[i] ?? 0;
        y1[i] = (posSum[i] ?? 0) + y;
        posSum[i] = y1[i] as number;
      } else {
        y0[i] = negSum[i] ?? 0;
        y1[i] = (negSum[i] ?? 0) + y;
        negSum[i] = y1[i] as number;
      }
    }
    return { points, y0, y1 };
  });
}

/** Min/max over stacked bounds (for the value-axis domain). */
export function stackExtent(stacks: readonly StackedSeries[]): [number, number] {
  let min = 0;
  let max = 0;
  for (const s of stacks) {
    for (let i = 0; i < s.y1.length; i++) {
      const hi = s.y1[i];
      const lo = s.y0[i];
      if (hi !== null && hi !== undefined) {
        if (hi > max) max = hi;
        if (hi < min) min = hi;
      }
      if (lo !== null && lo !== undefined) {
        if (lo > max) max = lo;
        if (lo < min) min = lo;
      }
    }
  }
  return [min, max];
}
