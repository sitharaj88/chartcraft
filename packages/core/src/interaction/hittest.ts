/**
 * Pure hit-testing helpers. Hit targets are larger than the marks:
 * nearest point within 24px for line/scatter, full column band for bar.
 *
 * TOUCH (v0.3.3) — 24px is a MOUSE number. A cursor is one pixel wide and the
 * user can see exactly where it is; a fingertip covers roughly 44px of screen
 * and its contact point is hidden underneath the finger. Every hit target
 * therefore has two sizes, and the pipeline picks between them PER EVENT (see
 * `chart.ts#hitTest`) rather than per device: a hybrid laptop with a
 * touchscreen must keep mouse precision for the mouse and get finger-sized
 * targets for the finger, in the same session, on the same chart.
 *
 * The size is ambient (`hitRadius()`) rather than a parameter because it is a
 * property of the GESTURE, not of the chart type: threading it through all 39
 * `hitTest` stages would make every type responsible for a policy none of them
 * gets an opinion about. `chart.ts` sets it for exactly the duration of one
 * `hitTest` call via `withHitRadius`, so there is no window in which a stale
 * value can be observed (the DOM is single-threaded and hit-testing never
 * awaits).
 */
import type { HoverState, PieSlice, PointPos } from '../layout';

/** Hit radius for a PRECISE pointer (mouse, trackpad, stylus). */
export const HIT_RADIUS = 24;

/**
 * Hit radius for a COARSE pointer (finger). 44px is the WCAG 2.1 "Target Size"
 * / platform HIG minimum touch target, measured as the diameter of the average
 * adult fingertip contact patch.
 */
export const COARSE_HIT_RADIUS = 44;

let activeHitRadius: number = HIT_RADIUS;

/** The hit radius in force for the hit-test currently running. */
export function hitRadius(): number {
  return activeHitRadius;
}

/** Run `fn` with `r` as the ambient hit radius, restoring it afterwards. */
export function withHitRadius<T>(r: number, fn: () => T): T {
  const prev = activeHitRadius;
  activeHitRadius = r;
  try {
    return fn();
  } finally {
    activeHitRadius = prev;
  }
}

/**
 * Device-level "the primary pointer is coarse".
 *
 * Used ONLY for decisions that must be made before any event exists — sizing
 * the legend's tap targets when the legend is built. Per-event `pointerType` is
 * strictly better wherever an event is in hand and is what hit-testing uses.
 */
export function coarsePointerMedia(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export interface HitResult extends HoverState {
  dist: number;
}

/** Nearest datum by euclidean distance within maxDist. */
export function nearestPoint(
  pos: readonly (readonly (PointPos | null)[])[],
  px: number,
  py: number,
  maxDist = hitRadius(),
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
  maxDist = hitRadius(),
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
