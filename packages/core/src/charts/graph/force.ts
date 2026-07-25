/**
 * Deterministic force-directed layout for the `network` chart type (v0.3).
 *
 * NON-NEGOTIABLE (contract): **no `Math.random()` in layout**. Determinism
 * here is structural, not incidental:
 *
 *  1. Initial positions come from a PHYLLOTAXIS SPIRAL (the golden angle),
 *     rotated by an offset drawn from a seeded PRNG (`network.fixedSeed`,
 *     default 1) — the only place the seed is used, and it is a pure function
 *     of the seed.
 *  2. A FIXED iteration count runs to completion (`network.iterations`,
 *     default 300) and then stops. There is no animation loop, no rAF, no
 *     `alphaMin` early exit: simulate, then draw.
 *  3. Every accumulation order is fixed (bodies in index order, quadrants in
 *     NW/NE/SW/SE order, links in input order), so the floating-point result
 *     is bit-identical across runs — `simulateForce` called twice with equal
 *     input returns byte-identical arrays.
 *
 * Forces per tick, in this order (mirrors d3-force's semantics without any of
 * its randomness):
 *   * repulsion — Barnes-Hut many-body, `charge · alpha / dist²`
 *   * springs   — links pull/push toward `linkDistance`, degree-biased
 *   * gravity   — a centering pull toward the origin
 *   * integrate — `v *= velocityDecay; p += v`
 *
 * The simulation runs in ABSTRACT units; `fitPositions` maps the result into
 * the plot rect afterwards. A resize therefore only re-fits the same layout
 * instead of producing a different graph.
 */
import type { Rect } from '../../layout';
import { barnesHutRepulsion, buildQuadtree } from './quadtree';

export interface ForceLink {
  /** Node index. */
  source: number;
  /** Node index. */
  target: number;
}

export interface ForceConfig {
  nodeCount: number;
  links: readonly ForceLink[];
  /** Rest length of a link spring (contract `network.linkDistance`). */
  linkDistance?: number;
  /** Many-body strength (contract `network.charge`); negative repels. */
  charge?: number;
  /** Fixed tick count (contract `network.iterations`). */
  iterations?: number;
  /** PRNG seed (contract `network.fixedSeed`). */
  seed?: number;
  /** Barnes-Hut opening angle (0 = exact pairwise sum). */
  theta?: number;
  /** Centering pull per tick. */
  gravity?: number;
  /** Velocity retained per tick (d3's `1 - velocityDecay`). */
  velocityDecay?: number;
  /** Phyllotaxis spacing for the initial spiral. */
  initialRadius?: number;
}

export interface ForcePositions {
  x: number[];
  y: number[];
}

export const FORCE_DEFAULTS = {
  linkDistance: 40,
  charge: -220,
  iterations: 300,
  seed: 1,
  theta: 0.9,
  gravity: 0.06,
  velocityDecay: 0.6,
  initialRadius: 14,
} as const;

/** Alpha floor: alpha decays geometrically from 1 to this over `iterations`. */
const ALPHA_MIN = 0.001;

/** The golden angle, in radians — the phyllotaxis spiral's angular step. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Deterministic for a
 * given seed and identical on every platform (all arithmetic is uint32 /
 * float64), which is what makes seeded layouts reproducible in tests.
 */
export function mulberry32(seed: number): () => number {
  let a = (Math.trunc(seed) || 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic initial layout: a phyllotaxis spiral (`radius·√i` at
 * `i·goldenAngle`), rotated by a seeded offset. Even spacing with no
 * coincident points — the ideal seed for a force simulation, and the reason no
 * random jitter is needed.
 */
export function phyllotaxisPositions(
  n: number,
  seed: number = FORCE_DEFAULTS.seed,
  radius: number = FORCE_DEFAULTS.initialRadius,
): ForcePositions {
  const rng = mulberry32(seed);
  const phase = rng() * 2 * Math.PI;
  const x: number[] = new Array(n);
  const y: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt(i + 0.5);
    const a = i * GOLDEN_ANGLE + phase;
    x[i] = r * Math.cos(a);
    y[i] = r * Math.sin(a);
  }
  return { x, y };
}

/** Degree per node (parallel links count twice; self-links are ignored). */
export function linkDegrees(nodeCount: number, links: readonly ForceLink[]): number[] {
  const deg = new Array<number>(nodeCount).fill(0);
  for (const l of links) {
    if (l.source === l.target) continue;
    if (l.source >= 0 && l.source < nodeCount) deg[l.source] = (deg[l.source] as number) + 1;
    if (l.target >= 0 && l.target < nodeCount) deg[l.target] = (deg[l.target] as number) + 1;
  }
  return deg;
}

/**
 * Run the fixed-iteration simulation. Pure: same input -> byte-identical
 * output (no `Math.random`, no time, no DOM).
 */
export function simulateForce(cfg: ForceConfig): ForcePositions {
  const n = Math.max(0, Math.trunc(cfg.nodeCount));
  const iterations = Math.max(0, Math.min(5000, Math.trunc(cfg.iterations ?? FORCE_DEFAULTS.iterations)));
  const linkDistance = cfg.linkDistance ?? FORCE_DEFAULTS.linkDistance;
  const charge = cfg.charge ?? FORCE_DEFAULTS.charge;
  const theta = cfg.theta ?? FORCE_DEFAULTS.theta;
  const gravity = cfg.gravity ?? FORCE_DEFAULTS.gravity;
  const decay = cfg.velocityDecay ?? FORCE_DEFAULTS.velocityDecay;
  const seed = cfg.seed ?? FORCE_DEFAULTS.seed;

  const { x, y } = phyllotaxisPositions(n, seed, cfg.initialRadius ?? FORCE_DEFAULTS.initialRadius);
  if (n === 0) return { x, y };
  if (n === 1) return { x: [0], y: [0] };

  const vx = new Array<number>(n).fill(0);
  const vy = new Array<number>(n).fill(0);

  // Valid, non-self links only (a self-link has no geometry).
  const links: ForceLink[] = [];
  for (const l of cfg.links) {
    if (l.source === l.target) continue;
    if (l.source < 0 || l.source >= n || l.target < 0 || l.target >= n) continue;
    links.push({ source: l.source, target: l.target });
  }
  const deg = linkDegrees(n, links);
  // d3-force's link defaults: strength 1/min(deg), bias by relative degree.
  const strengths = links.map((l) => 1 / Math.min(deg[l.source] as number, deg[l.target] as number));
  const biases = links.map((l) => {
    const ds = deg[l.source] as number;
    const dt = deg[l.target] as number;
    return ds + dt === 0 ? 0.5 : ds / (ds + dt);
  });

  // Geometric alpha decay from 1 to ALPHA_MIN over exactly `iterations` ticks.
  const alphaDecay = iterations > 0 ? 1 - Math.pow(ALPHA_MIN, 1 / iterations) : 1;
  let alpha = 1;

  for (let tick = 0; tick < iterations; tick++) {
    alpha += (0 - alpha) * alphaDecay;

    // ---- repulsion (Barnes-Hut, bodies visited in index order)
    const tree = buildQuadtree(x, y);
    const k = charge * alpha;
    for (let i = 0; i < n; i++) {
      const [dvx, dvy] = barnesHutRepulsion(tree, i, x[i] as number, y[i] as number, k, theta);
      vx[i] = (vx[i] as number) + dvx;
      vy[i] = (vy[i] as number) + dvy;
    }

    // ---- link springs (links in input order)
    for (let i = 0; i < links.length; i++) {
      const l = links[i] as ForceLink;
      const s = l.source;
      const t = l.target;
      let dx = (x[t] as number) + (vx[t] as number) - (x[s] as number) - (vx[s] as number);
      let dy = (y[t] as number) + (vy[t] as number) - (y[s] as number) - (vy[s] as number);
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) {
        // Deterministic separation for coincident endpoints (never random).
        dx = 1e-6 * ((i % 7) + 1);
        dy = 1e-6 * ((i % 5) + 1);
        dist = Math.sqrt(dx * dx + dy * dy);
      }
      const f = ((dist - linkDistance) / dist) * alpha * (strengths[i] as number);
      const fx = dx * f;
      const fy = dy * f;
      const b = biases[i] as number;
      vx[t] = (vx[t] as number) - fx * b;
      vy[t] = (vy[t] as number) - fy * b;
      vx[s] = (vx[s] as number) + fx * (1 - b);
      vy[s] = (vy[s] as number) + fy * (1 - b);
    }

    // ---- centering gravity + integration
    for (let i = 0; i < n; i++) {
      vx[i] = (vx[i] as number) - (x[i] as number) * gravity * alpha;
      vy[i] = (vy[i] as number) - (y[i] as number) * gravity * alpha;
      vx[i] = (vx[i] as number) * decay;
      vy[i] = (vy[i] as number) * decay;
      x[i] = (x[i] as number) + (vx[i] as number);
      y[i] = (y[i] as number) + (vy[i] as number);
    }
  }

  // Recenter on the origin so the fit step is a pure scale about the middle.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i] as number;
    sy += y[i] as number;
  }
  const mx = sx / n;
  const my = sy / n;
  for (let i = 0; i < n; i++) {
    x[i] = (x[i] as number) - mx;
    y[i] = (y[i] as number) - my;
  }
  return { x, y };
}

/**
 * Map abstract simulation coordinates into `rect`, preserving aspect ratio and
 * leaving `pad` px free on every side (room for node radii). A degenerate
 * span (one node, or a perfectly collinear layout on one axis) keeps scale
 * finite and centers the result.
 */
export function fitPositions(pos: ForcePositions, rect: Rect, pad: number): ForcePositions {
  const n = Math.min(pos.x.length, pos.y.length);
  if (n === 0) return { x: [], y: [] };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const px = pos.x[i] as number;
    const py = pos.y[i] as number;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  if (!Number.isFinite(x0)) return { x: new Array<number>(n).fill(rect.x + rect.w / 2), y: new Array<number>(n).fill(rect.y + rect.h / 2) };

  const availW = Math.max(1, rect.w - 2 * pad);
  const availH = Math.max(1, rect.h - 2 * pad);
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const sx = spanX > 0 ? availW / spanX : Infinity;
  const sy = spanY > 0 ? availH / spanY : Infinity;
  const scale = Number.isFinite(Math.min(sx, sy)) ? Math.min(sx, sy) : 1;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;

  const x: number[] = new Array(n);
  const y: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = cx + ((pos.x[i] as number) - midX) * scale;
    y[i] = cy + ((pos.y[i] as number) - midY) * scale;
  }
  return { x, y };
}

// ---------------------------------------------------------------- memoization
//
// `layout()` re-runs on every resize/update; the simulation is a pure function
// of its config, so results are memoized under a structural key. Bounded (LRU
// by insertion order) so a long-lived page cannot leak.

const SIM_CACHE_LIMIT = 16;
const simCache = new Map<string, ForcePositions>();

/** Structural cache key for a simulation config (order-sensitive, like the sim). */
export function forceCacheKey(cfg: ForceConfig): string {
  const links = cfg.links.map((l) => `${l.source}-${l.target}`).join(',');
  return [
    cfg.nodeCount,
    cfg.linkDistance ?? FORCE_DEFAULTS.linkDistance,
    cfg.charge ?? FORCE_DEFAULTS.charge,
    cfg.iterations ?? FORCE_DEFAULTS.iterations,
    cfg.seed ?? FORCE_DEFAULTS.seed,
    cfg.theta ?? FORCE_DEFAULTS.theta,
    cfg.gravity ?? FORCE_DEFAULTS.gravity,
    cfg.velocityDecay ?? FORCE_DEFAULTS.velocityDecay,
    cfg.initialRadius ?? FORCE_DEFAULTS.initialRadius,
    links,
  ].join('|');
}

/** `simulateForce` with memoization (identical results, just not recomputed). */
export function simulateForceCached(cfg: ForceConfig): ForcePositions {
  const key = forceCacheKey(cfg);
  const hit = simCache.get(key);
  if (hit) return { x: [...hit.x], y: [...hit.y] };
  const out = simulateForce(cfg);
  if (simCache.size >= SIM_CACHE_LIMIT) {
    const oldest = simCache.keys().next();
    if (!oldest.done) simCache.delete(oldest.value);
  }
  simCache.set(key, { x: [...out.x], y: [...out.y] });
  return out;
}

/** Clear the memo cache (tests). */
export function clearForceCache(): void {
  simCache.clear();
}
