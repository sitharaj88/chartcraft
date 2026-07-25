/**
 * Deterministic circle packing: the pure math behind `circlepack`.
 *
 * Two stages, both exactly reproducible (the contract bans `Math.random()` in
 * layout, so every pseudo-random step draws from a fixed-seed generator):
 *
 * 1. **Sibling packing** — front-chain placement (Wang et al. / "tangent
 *    circle" packing): the first three circles are placed mutually tangent,
 *    then each remaining circle is placed tangent to the closest pair on the
 *    front chain, walking the chain forward and backward until a
 *    non-intersecting slot is found. The result is overlap-free by
 *    construction, with no relaxation pass and no randomness at all.
 * 2. **Smallest enclosing circle** — Welzl's algorithm in its move-to-front
 *    form, generalized from points to circles (a basis of 1, 2 or 3 circles
 *    determines the enclosure). Welzl's expected-linear behavior depends on a
 *    random insertion order; we supply a SEEDED Fisher-Yates shuffle
 *    (`seededShuffle` + `seededRandom`) so the order — and therefore the
 *    result, down to floating point — is identical on every run.
 *
 * `packSiblings` returns its circles already translated so that their
 * enclosing circle is centered on the ORIGIN, which makes the hierarchy walk
 * in `computeCirclePack` a plain "parent center + scaled offset" recursion.
 */
import type { Rect } from '../../layout';
import type { Hierarchy, HierarchyNode } from '../matrix/hierarchy';
import { seededRandom, seededShuffle } from './shared';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Fixed seed for the Welzl insertion shuffle (determinism, not secrecy). */
export const PACK_SEED = 0x5eed1234;

/**
 * A parent circle is grown 5% beyond the enclosure of its children so its
 * hairline outline never coincides with a child's edge. Growing (never
 * shrinking) keeps children strictly inside, and because siblings are packed
 * with the grown radii the DRAWN circles never overlap either.
 */
export const PARENT_PADDING_RATIO = 0.05;

/** Margin between the outermost circles and the plot edge, in px. */
const PLOT_MARGIN = 2;

const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Smallest enclosing circle (Welzl, seeded)

function enclosesWeak(a: Circle, b: Circle): boolean {
  const dr = a.r - b.r + Math.max(a.r, b.r, 1) * 1e-9;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dr > 0 && dr * dr > dx * dx + dy * dy;
}

function enclosesNot(a: Circle, b: Circle): boolean {
  const dr = a.r - b.r;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dr < 0 || dr * dr < dx * dx + dy * dy;
}

function enclosesWeakAll(a: Circle, basis: readonly Circle[]): boolean {
  for (const b of basis) if (!enclosesWeak(a, b)) return false;
  return true;
}

function basis1(a: Circle): Circle {
  return { x: a.x, y: a.y, r: a.r };
}

/** Enclosure of two circles: the circle spanning their far edges. */
function basis2(a: Circle, b: Circle): Circle {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dr = b.r - a.r;
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < EPS) return a.r >= b.r ? basis1(a) : basis1(b);
  return {
    x: (a.x + b.x + (dx / l) * dr) / 2,
    y: (a.y + b.y + (dy / l) * dr) / 2,
    r: (l + a.r + b.r) / 2,
  };
}

/** Enclosure of three circles (Apollonius-style solve). */
function basis3(a: Circle, b: Circle, c: Circle): Circle {
  const a2 = a.x - b.x;
  const a3 = a.x - c.x;
  const b2 = a.y - b.y;
  const b3 = a.y - c.y;
  const c2 = b.r - a.r;
  const c3 = c.r - a.r;
  const d1 = a.x * a.x + a.y * a.y - a.r * a.r;
  const d2 = d1 - b.x * b.x - b.y * b.y + b.r * b.r;
  const d3 = d1 - c.x * c.x - c.y * c.y + c.r * c.r;
  const ab = a3 * b2 - a2 * b3;
  if (Math.abs(ab) < EPS) {
    // Collinear centers: fall back to the widest pairwise enclosure.
    const pairs = [basis2(a, b), basis2(a, c), basis2(b, c)];
    return pairs.reduce((best, p) => (p.r > best.r ? p : best), pairs[0] as Circle);
  }
  const xa = (b2 * d3 - b3 * d2) / (ab * 2) - a.x;
  const xb = (b3 * c2 - b2 * c3) / ab;
  const ya = (a3 * d2 - a2 * d3) / (ab * 2) - a.y;
  const yb = (a2 * c3 - a3 * c2) / ab;
  const A = xb * xb + yb * yb - 1;
  const B = 2 * (a.r + xa * xb + ya * yb);
  const C = xa * xa + ya * ya - a.r * a.r;
  const r = -(Math.abs(A) > 1e-6 ? (B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A) : C / B);
  return { x: a.x + xa + xb * r, y: a.y + ya + yb * r, r };
}

function enclosureOf(basis: readonly Circle[]): Circle | null {
  if (basis.length === 1) return basis1(basis[0] as Circle);
  if (basis.length === 2) return basis2(basis[0] as Circle, basis[1] as Circle);
  if (basis.length === 3) return basis3(basis[0] as Circle, basis[1] as Circle, basis[2] as Circle);
  return null;
}

/**
 * Extend the support basis with `p`. Returns null when no valid basis exists
 * (numerically degenerate input) so the caller can fall back instead of
 * throwing — a layout must never crash a chart.
 */
function extendBasis(basis: readonly Circle[], p: Circle): Circle[] | null {
  if (enclosesWeakAll(p, basis)) return [p];

  for (const b of basis) {
    if (enclosesNot(p, b) && enclosesWeakAll(basis2(b, p), basis)) return [b, p];
  }

  for (let i = 0; i < basis.length - 1; i++) {
    for (let j = i + 1; j < basis.length; j++) {
      const bi = basis[i] as Circle;
      const bj = basis[j] as Circle;
      if (
        enclosesNot(basis2(bi, bj), p) &&
        enclosesNot(basis2(bi, p), bj) &&
        enclosesNot(basis2(bj, p), bi) &&
        enclosesWeakAll(basis3(bi, bj, p), basis)
      ) {
        return [bi, bj, p];
      }
    }
  }
  return null;
}

/** Axis-aligned bounding circle — the never-throw fallback for Welzl. */
function boundingCircle(circles: readonly Circle[]): Circle {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of circles) {
    minX = Math.min(minX, c.x - c.r);
    minY = Math.min(minY, c.y - c.r);
    maxX = Math.max(maxX, c.x + c.r);
    maxY = Math.max(maxY, c.y + c.r);
  }
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  let r = 0;
  for (const c of circles) r = Math.max(r, Math.hypot(c.x - x, c.y - y) + c.r);
  return { x, y, r };
}

/**
 * Smallest circle enclosing every input circle (Welzl, move-to-front, seeded
 * insertion order). Returns `{ x: 0, y: 0, r: 0 }` for an empty input.
 */
export function packEnclose(circlesIn: readonly Circle[], seed = PACK_SEED): Circle {
  const circles = seededShuffle(circlesIn, seededRandom(seed));
  const n = circles.length;
  if (n === 0) return { x: 0, y: 0, r: 0 };
  if (n === 1) return basis1(circles[0] as Circle);

  let basis: Circle[] = [];
  let enclosure: Circle | null = null;
  let i = 0;
  // Guard against pathological cycling: the loop is expected-linear, but a
  // numerically degenerate basis must never hang a render.
  const maxSteps = 64 * n * n + 64;
  let steps = 0;
  while (i < n) {
    if (++steps > maxSteps) return boundingCircle(circlesIn);
    const p = circles[i] as Circle;
    if (enclosure && enclosesWeak(enclosure, p)) {
      i++;
      continue;
    }
    const next = extendBasis(basis, p);
    if (next === null) return boundingCircle(circlesIn);
    basis = next;
    const e = enclosureOf(basis);
    if (e === null || !Number.isFinite(e.r)) return boundingCircle(circlesIn);
    enclosure = e;
    i = 0;
  }
  return enclosure ?? boundingCircle(circlesIn);
}

// ---------------------------------------------------------------------------
// Sibling packing (front chain)

interface ChainNode {
  c: Circle;
  prev: ChainNode;
  next: ChainNode;
}

/** Place `c` tangent to both `a` and `b` (outer tangency, deterministic side). */
function placeTangent(b: Circle, a: Circle, c: Circle): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0) {
    c.x = a.x + c.r;
    c.y = a.y;
    return;
  }
  const ra = (a.r + c.r) * (a.r + c.r);
  const rb = (b.r + c.r) * (b.r + c.r);
  if (ra > rb) {
    const x = (d2 + rb - ra) / (2 * d2);
    const y = Math.sqrt(Math.max(0, rb / d2 - x * x));
    c.x = b.x - x * dx - y * dy;
    c.y = b.y - x * dy + y * dx;
  } else {
    const x = (d2 + ra - rb) / (2 * d2);
    const y = Math.sqrt(Math.max(0, ra / d2 - x * x));
    c.x = a.x + x * dx - y * dy;
    c.y = a.y + x * dy + y * dx;
  }
}

/** True when two circles overlap by more than a hair. */
export function circlesIntersect(a: Circle, b: Circle): boolean {
  const dr = a.r + b.r - 1e-6;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dr > 0 && dr * dr > dx * dx + dy * dy;
}

/** Distance of the tangency midpoint of a chain pair from the origin. */
function chainScore(node: ChainNode): number {
  const a = node.c;
  const b = node.next.c;
  const ab = a.r + b.r;
  if (ab === 0) return 0;
  const dx = (a.x * b.r + b.x * a.r) / ab;
  const dy = (a.y * b.r + b.y * a.r) / ab;
  return dx * dx + dy * dy;
}

export interface SiblingPacking {
  /** Positions in INPUT order, centered on the enclosing circle. */
  circles: Circle[];
  /** Radius of the enclosing circle (centered at the origin). */
  radius: number;
}

/**
 * Pack circles of the given radii so that none overlap, then translate the
 * whole arrangement so its enclosing circle is centered at the origin.
 *
 * Zero/negative radii are excluded from the packing and returned at the origin
 * with `r = 0` — they are invisible marks and must not perturb the tangency
 * chain.
 */
export function packSiblings(radiiIn: readonly number[], seed = PACK_SEED): SiblingPacking {
  const circles: Circle[] = radiiIn.map((r) => ({ x: 0, y: 0, r: Number.isFinite(r) && r > 0 ? r : 0 }));
  const active = circles.filter((c) => c.r > 0);
  const n = active.length;
  if (n === 0) return { circles, radius: 0 };

  const first = active[0] as Circle;
  if (n === 1) {
    first.x = 0;
    first.y = 0;
    return { circles, radius: first.r };
  }

  const second = active[1] as Circle;
  first.x = -second.r;
  first.y = 0;
  second.x = first.r;
  second.y = 0;

  if (n > 2) {
    const third = active[2] as Circle;
    placeTangent(second, first, third);

    // Front chain over the first three circles.
    const na = { c: first } as ChainNode;
    const nb = { c: second } as ChainNode;
    const nc = { c: third } as ChainNode;
    // Ring order a -> b -> c -> a.
    na.next = nb;
    na.prev = nc;
    nb.next = nc;
    nb.prev = na;
    nc.next = na;
    nc.prev = nb;

    let a = na;
    let b = nb;

    for (let i = 3; i < n; i++) {
      const candidate = active[i] as Circle;
      placeTangent(a.c, b.c, candidate);
      const c: ChainNode = { c: candidate } as ChainNode;

      // Walk the chain outward from the (a, b) pair looking for the closest
      // intersecting circle; when one is found it becomes the new pair
      // endpoint and the candidate is retried (i is not advanced).
      let j = b.next;
      let k = a.prev;
      let sj = b.c.r;
      let sk = a.c.r;
      let collided = false;
      do {
        if (sj <= sk) {
          if (circlesIntersect(j.c, candidate)) {
            b = j;
            a.next = b;
            b.prev = a;
            collided = true;
            break;
          }
          sj += j.c.r;
          j = j.next;
        } else {
          if (circlesIntersect(k.c, candidate)) {
            a = k;
            a.next = b;
            b.prev = a;
            collided = true;
            break;
          }
          sk += k.c.r;
          k = k.prev;
        }
      } while (j !== k.next);

      if (collided) {
        i--;
        continue;
      }

      // Insert the candidate between a and b.
      c.prev = a;
      c.next = b;
      a.next = c;
      b.prev = c;

      // The next candidate is placed against the chain pair closest to the
      // centroid, which is what keeps the packing compact.
      b = c;
      let bestScore = chainScore(a);
      let cursor = c;
      while ((cursor = cursor.next) !== b) {
        const s = chainScore(cursor);
        if (s < bestScore) {
          a = cursor;
          bestScore = s;
        }
      }
      b = a.next;
    }
  }

  const enclosing = packEnclose(active, seed);
  for (const c of active) {
    c.x -= enclosing.x;
    c.y -= enclosing.y;
  }
  return { circles, radius: enclosing.r };
}

// ---------------------------------------------------------------------------
// Hierarchy packing

/**
 * Absolute circle per node, indexed by `flatIndex`.
 *
 * Bottom-up: a leaf's intrinsic radius is `sqrt(value)` — value maps to AREA,
 * never to radius (the contract's area-true rule); an internal node packs its
 * children and takes their enclosing radius (grown by
 * `PARENT_PADDING_RATIO`). The whole arrangement is then scaled by ONE factor
 * so the roots' enclosure fits the plot, and walked top-down: a child's
 * absolute center is its parent's center plus its scaled offset. A single
 * uniform scale is what makes the packing's two guarantees survive into
 * screen space — siblings never overlap and every child stays inside its
 * parent.
 */
export function computeCirclePack(h: Hierarchy, plot: Rect, seed = PACK_SEED): Circle[] {
  const out: Circle[] = new Array(h.nodes.length).fill({ x: 0, y: 0, r: 0 });
  if (h.nodes.length === 0) return out;

  /** Offset relative to the parent's center + intrinsic radius, by flatIndex. */
  const relative: Circle[] = new Array(h.nodes.length).fill({ x: 0, y: 0, r: 0 });

  const intrinsic = (node: HierarchyNode): number => {
    if (node.children.length === 0) {
      return node.value > 0 ? Math.sqrt(node.value) : 0;
    }
    const radii = node.children.map(intrinsic);
    const { circles, radius } = packSiblings(radii, seed);
    node.children.forEach((child, i) => {
      const c = circles[i] as Circle;
      relative[child.flatIndex] = { x: c.x, y: c.y, r: radii[i] as number };
    });
    return radius * (1 + PARENT_PADDING_RATIO);
  };

  const rootRadii = h.roots.map(intrinsic);
  const { circles: rootCircles, radius } = packSiblings(rootRadii, seed);
  if (radius <= 0) return out;

  const target = Math.max(1, Math.min(plot.w, plot.h) / 2 - PLOT_MARGIN);
  const k = target / radius;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;

  const place = (node: HierarchyNode, x: number, y: number, r: number): void => {
    out[node.flatIndex] = { x, y, r };
    for (const child of node.children) {
      const rel = relative[child.flatIndex] as Circle;
      place(child, x + rel.x * k, y + rel.y * k, rel.r * k);
    }
  };

  h.roots.forEach((root, i) => {
    const c = rootCircles[i] as Circle;
    place(root, cx + c.x * k, cy + c.y * k, (rootRadii[i] as number) * k);
  });

  return out;
}
