/**
 * Path construction for line/area marks: linear, step (after) and monotone
 * (Fritsch–Carlson) interpolation, with null-gap support.
 */
import type { PathCmd } from '../render/renderer';
import type { PointPos } from '../layout';

export type CurveKind = 'linear' | 'monotone' | 'step';

interface XY {
  x: number;
  y: number;
}

/** Split a nullable point array into contiguous non-null runs. */
export function runsOf(pts: readonly (PointPos | null)[]): PointPos[][] {
  const runs: PointPos[][] = [];
  let cur: PointPos[] = [];
  for (const p of pts) {
    if (p === null) {
      if (cur.length > 0) runs.push(cur);
      cur = [];
    } else {
      cur.push(p);
    }
  }
  if (cur.length > 0) runs.push(cur);
  return runs;
}

function segmentCmds(run: readonly XY[], curve: CurveKind, reversed = false): PathCmd[] {
  const pts = reversed ? [...run].reverse() : [...run];
  const first = pts[0];
  if (!first) return [];
  const cmds: PathCmd[] = [];
  if (pts.length === 1) {
    cmds.push(['M', first.x, first.y]);
    return cmds;
  }
  cmds.push(['M', first.x, first.y]);
  if (curve === 'step') {
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1] as XY;
      const p = pts[i] as XY;
      cmds.push(['L', p.x, prev.y], ['L', p.x, p.y]);
    }
    return cmds;
  }
  if (curve === 'monotone') {
    const tangents = monotoneTangents(pts);
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1] as XY;
      const p1 = pts[i] as XY;
      const h = p1.x - p0.x;
      const m0 = tangents[i - 1] ?? 0;
      const m1 = tangents[i] ?? 0;
      cmds.push(['C', p0.x + h / 3, p0.y + (m0 * h) / 3, p1.x - h / 3, p1.y - (m1 * h) / 3, p1.x, p1.y]);
    }
    return cmds;
  }
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as XY;
    cmds.push(['L', p.x, p.y]);
  }
  return cmds;
}

/** Fritsch–Carlson monotone cubic tangents (per point). */
function monotoneTangents(pts: readonly XY[]): number[] {
  const n = pts.length;
  const m: number[] = new Array(n).fill(0);
  if (n < 2) return m;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i] as XY;
    const p1 = pts[i + 1] as XY;
    const h = p1.x - p0.x;
    d.push(h === 0 ? 0 : (p1.y - p0.y) / h);
  }
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const d0 = d[i - 1] ?? 0;
    const d1 = d[i] ?? 0;
    if (d0 * d1 <= 0) {
      m[i] = 0;
    } else {
      const p0 = pts[i - 1] as XY;
      const p1 = pts[i] as XY;
      const p2 = pts[i + 1] as XY;
      const h0 = p1.x - p0.x;
      const h1 = p2.x - p1.x;
      const common = h0 + h1;
      m[i] = (3 * common) / ((common + h1) / d0 + (common + h0) / d1);
    }
  }
  return m;
}

/** Stroke path for a (possibly gapped) series line. */
export function linePath(pts: readonly (PointPos | null)[], curve: CurveKind): PathCmd[] {
  const cmds: PathCmd[] = [];
  for (const run of runsOf(pts)) {
    if (run.length >= 2) cmds.push(...segmentCmds(run, curve));
  }
  return cmds;
}

/**
 * Closed fill path between the series line (p.y) and its lower bound (p.y0).
 * Each non-null run becomes one closed subpath.
 */
export function areaPath(pts: readonly (PointPos | null)[], curve: CurveKind): PathCmd[] {
  const cmds: PathCmd[] = [];
  for (const run of runsOf(pts)) {
    if (run.length < 2) continue;
    const top = segmentCmds(run, curve);
    cmds.push(...top);
    const bottom = run.map((p) => ({ x: p.x, y: p.y0 }));
    const rev = segmentCmds(bottom, curve === 'step' ? 'step' : 'linear', true);
    // Connect: line to bottom start, then follow bottom back, then close.
    const bFirst = rev[0];
    if (bFirst && bFirst[0] === 'M') {
      cmds.push(['L', bFirst[1], bFirst[2]]);
      cmds.push(...rev.slice(1));
    }
    cmds.push(['Z']);
  }
  return cmds;
}
