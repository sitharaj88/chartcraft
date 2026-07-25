/**
 * Shared helpers for the v0.3 INTERVAL & COMPARISON chart types
 * (`rangearea`, `bullet`, `dumbbell`, `lollipop`, `slope`).
 *
 * Everything here is pure and unit-tested directly: range extraction from
 * normalized points, the grey lightness ramp used for bullet's nested
 * qualitative ranges (never hues — lightness steps between `theme.gridline`
 * and `theme.axisLine`), band slot geometry for per-series slots inside one
 * category band, and the signed-delta formatter shared by the dumbbell
 * tooltip/table.
 */
import type { Theme } from '../../types';
import { mixHex } from '../matrix/color-scale';
import { formatValue } from '../../util';

/** Surface-colored gap between adjacent slots inside one category band. */
export const SLOT_GAP = 2;

/** Dumbbell endpoint dots: radius 5 = 10px diameter (contract: >= 10px). */
export const DUMBBELL_DOT_RADIUS = 5;

/** Slope endpoint dots: radius 4 = 8px diameter (contract: >= 8px). */
export const SLOPE_DOT_RADIUS = 4;

/** Surface ring around a dot, matching the line-marker spec. */
export const DOT_RING = 2;

// `rangeOf` / `hasRangeData` / `RangePair` moved to `data/normalize.ts` in v0.3:
// the MODEL resolves the `'rangearea'` mark kind from a series' data, so the
// predicate has to live in a leaf module both sides can import. Re-exported
// here because this folder is their historical home.
export { hasRangeData, rangeOf, type RangePair } from '../../data/normalize';

/**
 * `n` grey LIGHTNESS steps for nested qualitative ranges, indexed by range
 * order (ascending, i.e. index 0 = the smallest/innermost range):
 *
 * - index 0        -> `theme.axisLine`  (darkest — the innermost range)
 * - index n - 1    -> `theme.gridline`  (lightest — the outermost range)
 * - in between     -> even RGB mixes of the two
 *
 * Never hues: the ramp lives entirely between two theme chrome greys, so the
 * measure bar (`theme.textPrimary`) keeps a very high contrast relief against
 * every step. A single range uses the lightest step (a plain subtle track).
 */
export function greyRangeSteps(n: number, theme: Theme): string[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  if (n === 1) return [theme.gridline];
  return Array.from({ length: n }, (_, i) => mixHex(theme.axisLine, theme.gridline, i / (n - 1)));
}

/** Width of one of `count` equal slots inside a band, `SLOT_GAP` px apart. */
export function slotWidth(bandwidth: number, count: number): number {
  const k = Math.max(1, Math.floor(count));
  return Math.max(1, (bandwidth - SLOT_GAP * (k - 1)) / k);
}

/**
 * Centers of `count` equal slots inside the band starting at `bandStart`.
 * With `count === 1` the single center is the band center, so single-series
 * charts sit exactly on the pipeline's band centers.
 */
export function slotCenters(bandStart: number, bandwidth: number, count: number): number[] {
  const k = Math.max(1, Math.floor(count));
  const w = slotWidth(bandwidth, k);
  return Array.from({ length: k }, (_, i) => bandStart + i * (w + SLOT_GAP) + w / 2);
}

/** Signed delta for tooltips/tables: `+6`, `-3`, `0`. */
export function formatDelta(d: number): string {
  return d > 0 ? `+${formatValue(d)}` : formatValue(d);
}
