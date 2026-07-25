/**
 * Barnes-Hut quadtree for the network force layout. Pure, allocation-light and
 * fully DETERMINISTIC: bodies are inserted in index order, subdivision is a
 * fixed geometric split of a square root cell, and the traversal visits
 * quadrants in a fixed order — so the same input produces bit-identical
 * accumulated forces every run (no `Math.random()`, anywhere).
 *
 * Repulsion is O(n log n): a subtree whose extent subtends less than `theta`
 * from the target body is replaced by its center of mass. `theta = 0` disables
 * the approximation entirely, which turns the traversal into the exact O(n²)
 * pairwise sum — that equivalence is what the unit tests assert.
 */

/** Quadrant order is fixed: 0 = NW, 1 = NE, 2 = SW, 3 = SE. */
export interface QuadTreeNode {
  /** Square cell bounds. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Center of mass of every body in this subtree. */
  cx: number;
  cy: number;
  /** Total weight (body count when weights are 1). */
  weight: number;
  /**
   * Body index when this leaf holds exactly ONE body; -1 for internal nodes
   * and for aggregate leaves (coincident bodies past the depth cap).
   */
  index: number;
  children: (QuadTreeNode | null)[] | null;
}

/** Depth cap: coincident (or near-coincident) bodies aggregate into one leaf. */
export const MAX_QUAD_DEPTH = 28;

function makeNode(x0: number, y0: number, x1: number, y1: number): QuadTreeNode {
  return { x0, y0, x1, y1, cx: 0, cy: 0, weight: 0, index: -1, children: null };
}

function quadrantOf(node: QuadTreeNode, x: number, y: number): number {
  const mx = (node.x0 + node.x1) / 2;
  const my = (node.y0 + node.y1) / 2;
  return (y >= my ? 2 : 0) + (x >= mx ? 1 : 0);
}

function childBounds(node: QuadTreeNode, q: number): [number, number, number, number] {
  const mx = (node.x0 + node.x1) / 2;
  const my = (node.y0 + node.y1) / 2;
  const east = (q & 1) === 1;
  const south = q >= 2;
  return [east ? mx : node.x0, south ? my : node.y0, east ? node.x1 : mx, south ? node.y1 : my];
}

function insert(root: QuadTreeNode, index: number, x: number, y: number, w: number): void {
  let node = root;
  for (let depth = 0; ; depth++) {
    // Fold the body into this subtree's center of mass on the way down.
    const total = node.weight + w;
    node.cx = total === 0 ? x : (node.cx * node.weight + x * w) / total;
    node.cy = total === 0 ? y : (node.cy * node.weight + y * w) / total;
    node.weight = total;

    if (node.children === null) {
      if (node.index === -1 && total === w) {
        // Empty leaf: this body owns it.
        node.index = index;
        return;
      }
      if (depth >= MAX_QUAD_DEPTH) {
        // Aggregate leaf (coincident bodies): mass folded above, identity lost.
        node.index = -1;
        return;
      }
      // Occupied leaf: subdivide and push the resident body down one level.
      const resident = node.index;
      const rx = node.cx;
      const ry = node.cy;
      node.index = -1;
      node.children = [null, null, null, null];
      if (resident >= 0) {
        // The resident's own coordinates: recover them before this body was
        // folded in (weight arithmetic above is exact for a single body).
        const rw = node.weight - w;
        const ox = rw === 0 ? rx : (rx * node.weight - x * w) / rw;
        const oy = rw === 0 ? ry : (ry * node.weight - y * w) / rw;
        const q = quadrantOf(node, ox, oy);
        const [bx0, by0, bx1, by1] = childBounds(node, q);
        const child = makeNode(bx0, by0, bx1, by1);
        child.index = resident;
        child.cx = ox;
        child.cy = oy;
        child.weight = rw;
        node.children[q] = child;
      }
    }
    const q = quadrantOf(node, x, y);
    let child = node.children[q] ?? null;
    if (!child) {
      const [bx0, by0, bx1, by1] = childBounds(node, q);
      child = makeNode(bx0, by0, bx1, by1);
      node.children[q] = child;
    }
    node = child;
  }
}

/**
 * Build a quadtree over `xs`/`ys` (optionally weighted). The root cell is the
 * SQUARE containing every body, so cell extents shrink uniformly and the
 * Barnes-Hut size/distance test stays isotropic.
 */
export function buildQuadtree(
  xs: readonly number[],
  ys: readonly number[],
  weights?: readonly number[],
): QuadTreeNode | null {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (!Number.isFinite(x0)) return null;
  const size = Math.max(x1 - x0, y1 - y0) || 1;
  const root = makeNode(x0, y0, x0 + size, y0 + size);
  for (let i = 0; i < n; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    insert(root, i, x, y, weights?.[i] ?? 1);
  }
  return root;
}

/**
 * Deterministic replacement for d3's random "jiggle": coincident bodies are
 * separated by a tiny offset derived from the body INDEX, so the simulation
 * never depends on `Math.random()` yet never divides by zero.
 */
export function deterministicOffset(index: number): [number, number] {
  return [1e-6 * ((index % 7) + 1), 1e-6 * ((index % 5) + 1)];
}

/**
 * Barnes-Hut repulsion on body `index` at (x, y): returns the velocity delta
 * `[dvx, dvy]` for `k = charge * alpha` (negative charge repels, matching
 * d3-force's `strength * alpha / distanceSquared` accumulation).
 *
 * `theta` is the size/distance opening criterion (0 = exact pairwise sum).
 */
export function barnesHutRepulsion(
  tree: QuadTreeNode | null,
  index: number,
  x: number,
  y: number,
  k: number,
  theta = 0.9,
): [number, number] {
  let vx = 0;
  let vy = 0;
  if (!tree || k === 0) return [vx, vy];
  const theta2 = theta * theta;

  const visit = (node: QuadTreeNode): void => {
    if (node.weight === 0) return;
    let dx = node.cx - x;
    let dy = node.cy - y;
    let l = dx * dx + dy * dy;
    const size = node.x1 - node.x0;

    if (node.children === null) {
      if (node.index === index) return; // self
      if (l === 0) {
        const [ox, oy] = deterministicOffset(index);
        dx = ox;
        dy = oy;
        l = dx * dx + dy * dy;
      }
      const w = (k * node.weight) / l;
      vx += dx * w;
      vy += dy * w;
      return;
    }
    // Internal node: approximate when it subtends less than theta.
    if (size * size < theta2 * l) {
      const w = (k * node.weight) / l;
      vx += dx * w;
      vy += dy * w;
      return;
    }
    for (const child of node.children) if (child) visit(child);
  };

  visit(tree);
  return [vx, vy];
}

/** Exact O(n²) pairwise repulsion — the reference the quadtree approximates. */
export function pairwiseRepulsion(
  xs: readonly number[],
  ys: readonly number[],
  index: number,
  k: number,
  weights?: readonly number[],
): [number, number] {
  let vx = 0;
  let vy = 0;
  const x = xs[index] as number;
  const y = ys[index] as number;
  for (let j = 0; j < xs.length; j++) {
    if (j === index) continue;
    let dx = (xs[j] as number) - x;
    let dy = (ys[j] as number) - y;
    let l = dx * dx + dy * dy;
    if (l === 0) {
      const [ox, oy] = deterministicOffset(index);
      dx = ox;
      dy = oy;
      l = dx * dx + dy * dy;
    }
    const w = (k * (weights?.[j] ?? 1)) / l;
    vx += dx * w;
    vy += dy * w;
  }
  return [vx, vy];
}
