/**
 * Lollipop (v0.3). "Like bar": the same band/slot layout, the same category
 * axis, the same full-column hit target, the same legend/table/keyboard
 * behavior — the mark is a 1px stem from the baseline plus a >= 10px terminal
 * dot instead of a filled bar. `horizontal: true` is honored (rows instead of
 * columns), exactly as on `bar`.
 *
 * Stacking is UNSUPPORTED per the contract, so `stacked: true` throws a clear
 * error from the option hook (and `needs.stacking` is false, so no stack math
 * ever runs).
 *
 * Layout comes from the shared cartesian engine verbatim (`pos[si][pi]` = slot
 * center + value pixel, `geom.bars.barW` = slot width); only `render` differs.
 */
import type { ChartTypeDefinition } from '../registry';
import type { PointPos, RenderContext } from '../../layout';
import { seriesColor } from '../../model';
import { makeCartesianDefinition } from '../cartesian';
import { DOT_RING } from './shared';

/** Stem width (contract: a 1px stem). */
export const LOLLIPOP_STEM_WIDTH = 1;
/** Terminal dot: never smaller than 10px in DIAMETER (the contract's floor). */
export const LOLLIPOP_MIN_DOT_RADIUS = 5;
/** ...and never larger than 18px in diameter, so wide bands grow no blobs. */
export const LOLLIPOP_MAX_DOT_RADIUS = 9;

/** Error thrown for `stacked: true` (unsupported per the v0.3 contract). */
export const LOLLIPOP_STACKED_ERROR =
  "@chartcraft/core: chart type 'lollipop' does not support stacking — " +
  '`stacked: true` is unsupported for lollipop in the v0.3 contract ' +
  '(a stem from a floating baseline cannot be read). Use type: \'bar\' for stacked columns.';

/** Terminal dot radius from the slot width, clamped to [5, 9] px. */
export function lollipopDotRadius(slotW: number): number {
  if (!Number.isFinite(slotW)) return LOLLIPOP_MIN_DOT_RADIUS;
  return Math.max(LOLLIPOP_MIN_DOT_RADIUS, Math.min(LOLLIPOP_MAX_DOT_RADIUS, slotW / 2));
}

export interface LollipopMark {
  /** Stem start (on the baseline). */
  x1: number;
  y1: number;
  /** Stem end (at the value). */
  x2: number;
  y2: number;
  /** Terminal dot center + radius. */
  cx: number;
  cy: number;
  r: number;
}

/**
 * Stem + terminal dot for one datum. Vertical charts stem along y from the
 * baseline `p.y0` to the value `p.y`; horizontal charts stem along x from
 * `p.y0` to `p.x` at the row center `p.y` (the shared cartesian convention).
 */
export function lollipopMark(p: PointPos, slotW: number, horizontal: boolean): LollipopMark {
  const r = lollipopDotRadius(slotW);
  return horizontal
    ? { x1: p.y0, y1: p.y, x2: p.x, y2: p.y, cx: p.x, cy: p.y, r }
    : { x1: p.x, y1: p.y0, x2: p.x, y2: p.y, cx: p.x, cy: p.y, r };
}

const base = makeCartesianDefinition({
  id: 'lollipop',
  baseKind: 'bar',
  bandX: true,
  horizontal: true,
  // One mark language: no per-series `type` overrides on a lollipop root.
  combo: false,
  resolveOptions(resolved) {
    if (resolved.stacked) throw new Error(LOLLIPOP_STACKED_ERROR);
  },
});

export const lollipopDefinition: ChartTypeDefinition = {
  ...base,
  needs: { ...base.needs, stacking: false },

  render(ctx: RenderContext): void {
    const { r, theme: t, model: m, layout: L, geom, hover } = ctx;
    const slotW = geom.bars?.barW ?? 0;
    const pad = LOLLIPOP_MAX_DOT_RADIUS + DOT_RING;
    r.clipRect(L.plot.x - pad, L.plot.y - pad, L.plot.w + 2 * pad, L.plot.h + 2 * pad, () => {
      m.series.forEach((s, si) => {
        if (!s.visible) return;
        const pts = geom.pos[si];
        if (!pts) return;
        const color = seriesColor(s, t);
        pts.forEach((p, pi) => {
          if (!p) return;
          const mark = lollipopMark(p, slotW, m.horizontal);
          const fill = s.points[pi]?.color ?? color;
          const alpha = hover ? (hover.si === si && hover.pi === pi ? 1 : 0.45) : 1;
          r.line(mark.x1, mark.y1, mark.x2, mark.y2, { color: fill, width: LOLLIPOP_STEM_WIDTH }, alpha);
          r.circle(mark.cx, mark.cy, mark.r, {
            fill,
            stroke: { color: t.surface, width: DOT_RING },
            alpha,
          });
        });
      });
    });
  },
};
