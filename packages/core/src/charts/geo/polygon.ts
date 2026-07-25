/**
 * Screen-space polygon geometry for choropleth hit-testing and drawing.
 * Pure functions on projected rings — exact-value unit tested.
 *
 * HIT TESTING is ray casting with the EVEN-ODD rule applied across ALL rings
 * of one polygon at once, which is exactly what makes holes work: a point
 * inside the exterior ring but also inside a hole crosses an even number of
 * edges and is therefore reported outside. A MultiPolygon is inside when ANY
 * of its polygons is.
 *
 * DRAWING uses the canvas NONZERO winding rule (the Renderer exposes
 * `path(cmds, opts)`, and the canvas default fill rule is nonzero), so holes
 * must wind OPPOSITE to their exterior. GeoJSON (RFC 7946) asks for CCW
 * exteriors / CW holes but real-world files routinely violate it, so
 * `orientPolygon` normalizes the winding itself instead of trusting the data.
 */
import type { ScreenPoint } from './projections';
import type { PathCmd } from '../../render/renderer';

/** A projected ring in screen pixels. */
export type ScreenRing = readonly ScreenPoint[];
/** A projected polygon: [exterior, ...holes]. */
export type ScreenPolygon = readonly ScreenRing[];
/** Screen bounds `[x0, y0, x1, y1]`. */
export type ScreenBounds = [number, number, number, number];

/**
 * Twice the signed area of a ring (the shoelace sum). Positive = counter-
 * clockwise in a y-UP frame, i.e. clockwise on screen where y grows downward.
 * The sign is all that matters here: it is compared, never displayed.
 */
export function ringSignedArea2(ring: ScreenRing): number {
  const n = ring.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i] as ScreenPoint;
    const b = ring[(i + 1) % n] as ScreenPoint;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

/** Reverse a ring (vertex order flipped, winding inverted). */
export function reverseRing(ring: ScreenRing): ScreenPoint[] {
  return [...ring].reverse();
}

/**
 * Normalize a polygon's winding for nonzero-rule filling: the exterior ring
 * (index 0) is forced to POSITIVE signed area and every hole to negative, so
 * holes always cancel their exterior regardless of the source file's winding.
 * Degenerate rings (zero area) are passed through untouched.
 */
export function orientPolygon(polygon: ScreenPolygon): ScreenPoint[][] {
  return polygon.map((ring, i) => {
    const a = ringSignedArea2(ring);
    if (a === 0) return [...ring];
    const wantPositive = i === 0;
    return (a > 0) === wantPositive ? [...ring] : reverseRing(ring);
  });
}

/**
 * Ray-casting crossing count for one ring: does a horizontal ray from
 * (x, y) cross an odd number of this ring's edges? Vertices are handled with
 * the standard half-open rule (`(y1 > y) !== (y2 > y)`), so a point level
 * with a shared vertex is counted exactly once.
 */
export function ringCrossings(ring: ScreenRing, x: number, y: number): number {
  const n = ring.length;
  if (n < 3) return 0;
  let crossings = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i] as ScreenPoint;
    const b = ring[j] as ScreenPoint;
    if (a[1] > y !== b[1] > y) {
      const t = (y - a[1]) / (b[1] - a[1]);
      if (x < a[0] + t * (b[0] - a[0])) crossings++;
    }
  }
  return crossings;
}

/**
 * Even-odd point-in-polygon over a polygon's rings (holes included, see the
 * module header).
 */
export function pointInPolygon(polygon: ScreenPolygon, x: number, y: number): boolean {
  let crossings = 0;
  for (const ring of polygon) crossings += ringCrossings(ring, x, y);
  return (crossings & 1) === 1;
}

/** Inside ANY polygon of a MultiPolygon (holes respected per polygon). */
export function pointInMultiPolygon(polygons: readonly ScreenPolygon[], x: number, y: number): boolean {
  for (const p of polygons) if (pointInPolygon(p, x, y)) return true;
  return false;
}

/** Screen bounds over every ring of every polygon (null when empty). */
export function multiPolygonBounds(polygons: readonly ScreenPolygon[]): ScreenBounds | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const p of ring) {
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[1] > y1) y1 = p[1];
      }
    }
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/**
 * Area-weighted centroid over the EXTERIOR rings of a MultiPolygon (the
 * label/tooltip/keyboard anchor). Falls back to the bounds center when every
 * ring is degenerate.
 */
export function multiPolygonCentroid(polygons: readonly ScreenPolygon[]): ScreenPoint | null {
  let cx = 0;
  let cy = 0;
  let areaSum = 0;
  for (const poly of polygons) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    let a2 = 0;
    let rx = 0;
    let ry = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i] as ScreenPoint;
      const q = ring[(i + 1) % ring.length] as ScreenPoint;
      const cross = p[0] * q[1] - q[0] * p[1];
      a2 += cross;
      rx += (p[0] + q[0]) * cross;
      ry += (p[1] + q[1]) * cross;
    }
    if (a2 === 0) continue;
    const w = Math.abs(a2 / 2);
    cx += (rx / (3 * a2)) * w;
    cy += (ry / (3 * a2)) * w;
    areaSum += w;
  }
  if (areaSum > 0) return [cx / areaSum, cy / areaSum];
  const b = multiPolygonBounds(polygons);
  return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

/**
 * Renderer path commands for a MultiPolygon: one `M`/`L…`/`Z` subpath per
 * ring, winding-normalized so holes punch through under the nonzero rule.
 * Composed from the primitives the Renderer already has (`path`) — no
 * renderer change required.
 */
export function multiPolygonPath(polygons: readonly ScreenPolygon[]): PathCmd[] {
  const cmds: PathCmd[] = [];
  for (const poly of polygons) {
    for (const ring of orientPolygon(poly)) {
      if (ring.length < 3) continue;
      const first = ring[0] as ScreenPoint;
      cmds.push(['M', first[0], first[1]]);
      for (let i = 1; i < ring.length; i++) {
        const p = ring[i] as ScreenPoint;
        cmds.push(['L', p[0], p[1]]);
      }
      cmds.push(['Z']);
    }
  }
  return cmds;
}
