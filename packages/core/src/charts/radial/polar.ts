/**
 * Shared polar math for the radial chart types (radar, gauge, funnel).
 * Pure functions — no DOM, unit-tested directly.
 *
 * Canvas-space conventions: y grows downward, angles are radians measured
 * clockwise from the positive x axis (canvas `arc` convention). "12 o'clock"
 * is therefore -PI/2.
 */
import { LinearScale } from '../../scales/linear';
import { roundFP } from '../../util';

export interface PolarPoint {
  x: number;
  y: number;
}

/** Canvas-space polar -> cartesian. */
export function polarToCartesian(cx: number, cy: number, r: number, angle: number): PolarPoint {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** Radar spoke angle: spoke 0 at 12 o'clock, subsequent spokes clockwise. */
export function spokeAngle(i: number, spokeCount: number): number {
  return -Math.PI / 2 + (i / spokeCount) * Math.PI * 2;
}

/**
 * Nice ring values for a polar grid: `count` evenly spaced rings between 0
 * (excluded) and a nice maximum >= maxValue (the outermost ring).
 */
export function ringValues(maxValue: number, count = 4): number[] {
  const hi = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
  const niceMax = new LinearScale([0, hi]).nice(count).domain()[1];
  return Array.from({ length: count }, (_, k) => roundFP((niceMax * (k + 1)) / count));
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
