/**
 * The `'rangearea'` MARK KIND: a filled low→high band with hairline edges.
 *
 * This is a peer of `bar.ts` / `line.ts` / `area.ts` / `scatter.ts` — one
 * module per mark kind, consumed by the shared cartesian engine
 * (`cartesian.ts`). Making the band a real `SeriesKind` is what lets
 * `SeriesOptions.type: 'rangearea'` be a legal per-series combo override on any
 * cartesian root, and lets the `rangearea` root reuse the engine's kind
 * dispatch and z-order instead of re-implementing them.
 *
 * Geometry convention: a band lives in `PointPos` with `y` = the HIGH edge and
 * `y0` = the LOW edge, so the pipeline's generic animation opens the band from
 * its low edge with no extra code.
 */
import type { ContinuousScale, PointPos, RenderContext } from '../layout';
import type { NormalizedPoint } from '../data/normalize';
import type { PathCmd } from '../render/renderer';
import { rangeOf } from '../data/normalize';
import { seriesColor } from '../model';
import { areaPath, linePath } from './curves';

/** Band fill alpha for a range band (contract: 0.18). */
export const RANGE_BAND_ALPHA = 0.18;

/** Hairline width of the band's low/high edges. */
export const RANGE_EDGE_WIDTH = 1;

export interface RangeBandPaths {
  /** Closed fill between the high and low edges (per non-null run). */
  fill: PathCmd[];
  /** High-edge polyline. */
  upper: PathCmd[];
  /** Low-edge polyline. */
  lower: PathCmd[];
}

/**
 * Band fill + hairline edge paths from positions whose `y` is the high edge
 * and `y0` the low edge. Straight segments only (a band's bounds must read
 * true; smoothing would invent coverage the data does not have).
 */
export function rangeBandPaths(pts: readonly (PointPos | null)[]): RangeBandPaths {
  const lower = pts.map((p) => (p ? { x: p.x, y: p.y0, y0: p.y0 } : null));
  return {
    fill: areaPath(pts, 'linear'),
    upper: linePath(pts, 'linear'),
    lower: linePath(lower, 'linear'),
  };
}

/**
 * Positions for a band series: `y` = high edge px, `y0` = low edge px.
 * `xAt(pi)` supplies the datum's x pixel (band center or continuous scale);
 * a point without both bounds, or without an x, is a gap (`null`).
 */
export function rangeBandPositions(
  points: readonly NormalizedPoint[],
  xAt: (pi: number) => number | null,
  yScale: ContinuousScale,
): (PointPos | null)[] {
  return points.map((p, pi) => {
    const rg = rangeOf(p);
    if (!rg) return null;
    const x = xAt(pi);
    if (x === null) return null;
    return { x, y: yScale.scale(rg.high), y0: yScale.scale(rg.low) };
  });
}

/**
 * Paint the band marks of the given model series indices. Bands are the
 * recessive layer of a combo chart, so `KIND_Z_ORDER` puts them first.
 */
export function renderRangeBandKind(ctx: RenderContext, indices: readonly number[]): void {
  const { r, theme: t, model: m, layout: L, geom, opts } = ctx;
  const showBounds = opts.rangearea?.showBounds ?? true;
  r.clipRect(L.plot.x, L.plot.y - 1, L.plot.w, L.plot.h + 2, () => {
    for (const si of indices) {
      const s = m.series[si];
      const pts = geom.pos[si];
      if (!s || !s.visible || !pts || pts.length === 0) continue;
      const color = seriesColor(s, t);
      const { fill, upper, lower } = rangeBandPaths(pts);
      if (fill.length > 0) r.path(fill, { fill: color, alpha: RANGE_BAND_ALPHA });
      if (showBounds) {
        if (upper.length > 0) r.path(upper, { stroke: { color, width: RANGE_EDGE_WIDTH } });
        if (lower.length > 0) r.path(lower, { stroke: { color, width: RANGE_EDGE_WIDTH } });
      }
    }
  });
}
