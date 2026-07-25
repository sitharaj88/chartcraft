/**
 * Pure hit-testing helpers. Hit targets are larger than the marks:
 * nearest point within 24px for line/scatter, full column band for bar.
 */
import type { HoverState, PieSlice, PointPos } from '../layout';

export const HIT_RADIUS = 24;

export interface HitResult extends HoverState {
  dist: number;
}

/** Nearest datum by euclidean distance within maxDist. */
export function nearestPoint(
  pos: readonly (readonly (PointPos | null)[])[],
  px: number,
  py: number,
  maxDist = HIT_RADIUS,
): HitResult | null {
  let best: HitResult | null = null;
  const maxSq = maxDist * maxDist;
  pos.forEach((pts, si) => {
    pts.forEach((p, pi) => {
      if (!p) return;
      const dx = p.x - px;
      const dy = p.y - py;
      const d = dx * dx + dy * dy;
      if (d <= maxSq && (best === null || d < best.dist)) {
        best = { si, pi, dist: d };
      }
    });
  });
  if (best !== null) (best as HitResult).dist = Math.sqrt((best as HitResult).dist);
  return best;
}

/**
 * Shared (crosshair) hit: nearest datum by x distance only, within maxDist.
 * Returns the anchor {si, pi}; callers gather other series at the same x.
 */
export function nearestByX(
  pos: readonly (readonly (PointPos | null)[])[],
  px: number,
  maxDist = HIT_RADIUS,
): HitResult | null {
  let best: HitResult | null = null;
  pos.forEach((pts, si) => {
    pts.forEach((p, pi) => {
      if (!p) return;
      const d = Math.abs(p.x - px);
      if (d <= maxDist && (best === null || d < best.dist)) {
        best = { si, pi, dist: d };
      }
    });
  });
  return best;
}

/** For shared tooltips: per-series point index whose x matches anchorX. */
export function indicesAtX(
  pos: readonly (readonly (PointPos | null)[])[],
  anchorX: number,
  tolerance = 0.5,
): (number | null)[] {
  return pos.map((pts) => {
    let found: number | null = null;
    let bestD = tolerance + 1e-6;
    pts.forEach((p, pi) => {
      if (!p) return;
      const d = Math.abs(p.x - anchorX);
      if (d <= bestD) {
        bestD = d;
        found = pi;
      }
    });
    return found;
  });
}

/** Pie/donut slice under the pointer, or null. */
export function sliceAt(slices: readonly PieSlice[], px: number, py: number): PieSlice | null {
  for (const s of slices) {
    const dx = px - s.cx;
    const dy = py - s.cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < s.r0 || r > s.r1) continue;
    let angle = Math.atan2(dy, dx);
    // Normalize into [a0, a0 + 2pi).
    while (angle < s.a0) angle += Math.PI * 2;
    while (angle >= s.a0 + Math.PI * 2) angle -= Math.PI * 2;
    if (angle >= s.a0 && angle <= s.a1) return s;
  }
  return null;
}
