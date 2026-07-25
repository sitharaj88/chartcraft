/**
 * Sankey graph math — pure, DOM-free, deterministic (no `Math.random`).
 *
 * Pipeline, in the order the stages run:
 *
 *  1. `parseSankeyGraph`  — validate the caller's `{ nodes, links }` payload,
 *     resolve `source`/`target` references (node **id** or 0-based **index**),
 *     accumulate per-node in/out totals and REJECT cycles with a message that
 *     names the offending nodes (a Sankey is a layered DAG; a cycle has no
 *     layering).
 *  2. `assignLayers`      — longest-path layering: `layer(n) = max(layer(pred)) + 1`,
 *     sources at 0. `align` then repositions terminal layers ('left' keeps the
 *     longest path from the sources, 'right' measures back from the sinks,
 *     'justify' (default) pushes nodes with no outgoing links to the last layer).
 *  3. `orderLayers`       — iterative crossing reduction: a fixed number of
 *     alternating forward/backward sweeps that sort each layer by the
 *     VALUE-WEIGHTED barycenter of its neighbours' ranks in the reference
 *     layer, keeping the arrangement with the fewest crossings seen
 *     (`countCrossings`). Fixed iteration count + stable sort + no randomness =
 *     byte-identical layouts across runs.
 *  4. `computeSankeyLayout` — node bars sized ∝ throughput with `nodePadding`
 *     between them, and link ribbons as cubic Béziers whose stacked offsets at
 *     BOTH ends add up to the node heights, so ribbons meet the node edges
 *     exactly.
 */
import type { PathCmd } from '../../render/renderer';
import type { Rect } from '../../layout';

// ---------------------------------------------------------------------------
// Caller-facing input shapes (the contract's `data: { nodes, links }`)

export interface SankeyNodeInput {
  id?: string;
  label?: string;
  color?: string;
}

export interface SankeyLinkInput {
  /** Node id, or a 0-based index into `nodes`. */
  source: string | number;
  /** Node id, or a 0-based index into `nodes`. */
  target: string | number;
  value: number;
}

export interface SankeyGraphInput {
  nodes: readonly SankeyNodeInput[];
  links?: readonly SankeyLinkInput[];
}

export type SankeyAlign = 'left' | 'right' | 'justify';

// ---------------------------------------------------------------------------
// Resolved graph

export interface SankeyNode {
  /** Position in the caller's `nodes` array. */
  index: number;
  id: string;
  label: string;
  /** Explicit per-node color override (palette slot used when absent). */
  color?: string;
  /** Link indices. */
  incoming: number[];
  outgoing: number[];
  inValue: number;
  outValue: number;
  /** Throughput = max(in, out) — what the node bar's height encodes. */
  value: number;
  layer: number;
  /** Rank within the layer (after crossing reduction). */
  order: number;
}

export interface SankeyLink {
  /** Position in the caller's `links` array. */
  index: number;
  /** Node index. */
  source: number;
  /** Node index. */
  target: number;
  value: number;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Node indices per layer, in draw order (index 0 = leftmost layer). */
  layers: number[][];
}

/** Contract defaults + the invariants the contract fixes for sankey. */
export const SANKEY_DEFAULT_NODE_WIDTH = 16;
export const SANKEY_DEFAULT_NODE_PADDING = 8;
/** "2px node gaps" — `nodePadding` is clamped to at least this. */
export const SANKEY_MIN_NODE_GAP = 2;
/** Ribbons at 0.45 alpha, colored by their SOURCE node. */
export const SANKEY_LINK_ALPHA = 0.45;
/** Cubic control-point placement (0.5 = control points on the mid-x). */
export const SANKEY_CURVATURE = 0.5;
/** Fixed, deterministic crossing-reduction sweeps. */
export const SANKEY_ORDER_ITERATIONS = 6;

const ERR = '@chartcraft/core: sankey';

export function isSankeyGraphInput(v: unknown): v is SankeyGraphInput {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const g = v as { nodes?: unknown; links?: unknown };
  return Array.isArray(g.nodes) && (g.links === undefined || Array.isArray(g.links));
}

/** An empty graph — what a sankey with no data lays out. */
export function emptySankeyGraph(): SankeyGraph {
  return { nodes: [], links: [], layers: [] };
}

// ---------------------------------------------------------------------------
// 1. Parse & validate

/**
 * Validate the caller's payload into a resolved graph (layers not yet
 * assigned). Throws — with an actionable message — for an unusable shape,
 * duplicate ids, unknown link endpoints, bad values, self-loops and cycles.
 */
export function parseSankeyGraph(input: unknown): SankeyGraph {
  if (!isSankeyGraphInput(input)) {
    throw new Error(
      `${ERR} expects its graph on the FIRST series as ` +
        `data: { nodes: { id, label?, color? }[]; links: { source, target, value }[] } ` +
        `— 'source'/'target' reference node ids (or 0-based node indices).`,
    );
  }

  const nodes: SankeyNode[] = [];
  const byId = new Map<string, number>();
  input.nodes.forEach((n, i) => {
    const id = n?.id ?? n?.label;
    if (typeof id !== 'string' || id === '') {
      throw new Error(`${ERR} node ${i} needs a string 'id' (or a 'label' to use as its id).`);
    }
    if (byId.has(id)) {
      throw new Error(`${ERR} node ids must be unique, but '${id}' appears twice (nodes ${byId.get(id)} and ${i}).`);
    }
    byId.set(id, i);
    const node: SankeyNode = {
      index: i,
      id,
      label: n?.label ?? id,
      incoming: [],
      outgoing: [],
      inValue: 0,
      outValue: 0,
      value: 0,
      layer: 0,
      order: 0,
    };
    if (n?.color !== undefined) node.color = n.color;
    nodes.push(node);
  });

  const known = (): string => (nodes.length > 0 ? nodes.map((n) => `'${n.id}'`).join(', ') : '(none)');
  const resolve = (ref: string | number, li: number, side: 'source' | 'target'): number => {
    if (typeof ref === 'number') {
      if (!Number.isInteger(ref) || ref < 0 || ref >= nodes.length) {
        throw new Error(
          `${ERR} link ${li} ${side} index ${ref} is out of range — there ` +
            `${nodes.length === 1 ? 'is 1 node' : `are ${nodes.length} nodes`} (valid indices 0..${nodes.length - 1}).`,
        );
      }
      return ref;
    }
    const idx = byId.get(ref);
    if (idx === undefined) {
      throw new Error(`${ERR} link ${li} ${side} '${ref}' is not a declared node. Known node ids: ${known()}.`);
    }
    return idx;
  };

  const links: SankeyLink[] = [];
  (input.links ?? []).forEach((l, i) => {
    if (l === null || typeof l !== 'object') {
      throw new Error(`${ERR} link ${i} must be an object { source, target, value }.`);
    }
    const source = resolve(l.source, i, 'source');
    const target = resolve(l.target, i, 'target');
    const value = l.value;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(
        `${ERR} link ${i} ('${nodes[source]?.id}' → '${nodes[target]?.id}') needs a finite value >= 0, got ${String(value)}.`,
      );
    }
    if (source === target) {
      throw new Error(
        `${ERR} requires a directed ACYCLIC graph, but link ${i} is a self-loop on ` +
          `'${nodes[source]?.id}'. Remove it.`,
      );
    }
    const link: SankeyLink = { index: i, source, target, value };
    links.push(link);
    const s = nodes[source];
    const t = nodes[target];
    if (s) {
      s.outgoing.push(i);
      s.outValue += value;
    }
    if (t) {
      t.incoming.push(i);
      t.inValue += value;
    }
  });

  for (const n of nodes) n.value = Math.max(n.inValue, n.outValue);

  const cycle = findCycle(nodes, links);
  if (cycle) {
    const path = cycle.map((i) => nodes[i]?.label ?? String(i)).join(' → ');
    const last = cycle[cycle.length - 2];
    const first = cycle[cycle.length - 1];
    throw new Error(
      `${ERR} requires a directed ACYCLIC graph, but these links form a cycle: ${path}. ` +
        `Remove or reverse one of them (e.g. '${nodes[last ?? 0]?.label}' → '${nodes[first ?? 0]?.label}').`,
    );
  }

  return { nodes, links, layers: [] };
}

/**
 * Iterative DFS cycle finder. Returns the cycle as node indices, closing back
 * on its first node (`[a, b, c, a]`), or null for a DAG.
 */
export function findCycle(nodes: readonly SankeyNode[], links: readonly SankeyLink[]): number[] | null {
  const state = new Uint8Array(nodes.length); // 0 = new, 1 = on stack, 2 = done
  const stack: { u: number; ei: number }[] = [];
  const path: number[] = [];
  for (let s = 0; s < nodes.length; s++) {
    if (state[s] !== 0) continue;
    state[s] = 1;
    path.push(s);
    stack.push({ u: s, ei: 0 });
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as { u: number; ei: number };
      const outs = nodes[top.u]?.outgoing ?? [];
      if (top.ei < outs.length) {
        const li = outs[top.ei] as number;
        top.ei += 1;
        const v = links[li]?.target;
        if (v === undefined) continue;
        if (state[v] === 1) {
          const from = path.indexOf(v);
          return [...path.slice(from), v];
        }
        if (state[v] === 0) {
          state[v] = 1;
          path.push(v);
          stack.push({ u: v, ei: 0 });
        }
      } else {
        state[top.u] = 2;
        stack.pop();
        path.pop();
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Layering

/** Kahn topological order, deterministic (ready nodes emitted by index). */
function topoOrder(graph: SankeyGraph): number[] {
  const indeg = graph.nodes.map((n) => n.incoming.length);
  const ready: number[] = [];
  indeg.forEach((d, i) => {
    if (d === 0) ready.push(i);
  });
  const out: number[] = [];
  while (ready.length > 0) {
    // Smallest index first keeps the order stable for equal-depth nodes.
    ready.sort((a, b) => a - b);
    const u = ready.shift() as number;
    out.push(u);
    for (const li of graph.nodes[u]?.outgoing ?? []) {
      const v = graph.links[li]?.target;
      if (v === undefined) continue;
      indeg[v] = (indeg[v] ?? 1) - 1;
      if (indeg[v] === 0) ready.push(v);
    }
  }
  return out;
}

/**
 * Longest-path layering + `align`. Mutates `node.layer` / `node.order` and
 * returns the layers (node indices per layer, initially ordered by node index).
 */
export function assignLayers(graph: SankeyGraph, align: SankeyAlign = 'justify'): number[][] {
  const n = graph.nodes.length;
  if (n === 0) return [];
  const order = topoOrder(graph);
  const depth = new Array<number>(n).fill(0);
  for (const u of order) {
    for (const li of graph.nodes[u]?.outgoing ?? []) {
      const v = graph.links[li]?.target;
      if (v === undefined) continue;
      depth[v] = Math.max(depth[v] ?? 0, (depth[u] ?? 0) + 1);
    }
  }
  const height = new Array<number>(n).fill(0);
  for (let k = order.length - 1; k >= 0; k--) {
    const u = order[k] as number;
    for (const li of graph.nodes[u]?.outgoing ?? []) {
      const v = graph.links[li]?.target;
      if (v === undefined) continue;
      height[u] = Math.max(height[u] ?? 0, (height[v] ?? 0) + 1);
    }
  }
  const maxLayer = depth.reduce((m, d) => Math.max(m, d), 0);

  graph.nodes.forEach((node, i) => {
    const d = depth[i] ?? 0;
    if (align === 'left') node.layer = d;
    else if (align === 'right') node.layer = maxLayer - (height[i] ?? 0);
    // 'justify': terminal nodes (no outgoing links) sit in the LAST layer.
    else node.layer = node.outgoing.length === 0 ? maxLayer : d;
  });

  const layers: number[][] = Array.from({ length: maxLayer + 1 }, () => []);
  graph.nodes.forEach((node, i) => (layers[node.layer] as number[]).push(i));
  applyOrder(graph, layers);
  return layers;
}

function applyOrder(graph: SankeyGraph, layers: readonly (readonly number[])[]): void {
  layers.forEach((layer) =>
    layer.forEach((ni, k) => {
      const node = graph.nodes[ni];
      if (node) node.order = k;
    }),
  );
}

// ---------------------------------------------------------------------------
// 3. Crossing reduction

/**
 * Link crossings between links that share the same layer GAP (same source
 * layer and same target layer): two links cross when their endpoint ranks are
 * inverted. O(links²) — Sankey link counts are small, and an exact count keeps
 * the reduction testable.
 */
export function countCrossings(graph: SankeyGraph, layers: readonly (readonly number[])[]): number {
  const rank = new Map<number, number>();
  layers.forEach((layer) => layer.forEach((ni, k) => rank.set(ni, k)));
  const L = graph.links;
  let crossings = 0;
  for (let i = 0; i < L.length; i++) {
    const a = L[i] as SankeyLink;
    const aSL = graph.nodes[a.source]?.layer;
    const aTL = graph.nodes[a.target]?.layer;
    for (let j = i + 1; j < L.length; j++) {
      const b = L[j] as SankeyLink;
      if (graph.nodes[b.source]?.layer !== aSL || graph.nodes[b.target]?.layer !== aTL) continue;
      const ds = (rank.get(a.source) ?? 0) - (rank.get(b.source) ?? 0);
      const dt = (rank.get(a.target) ?? 0) - (rank.get(b.target) ?? 0);
      if (ds * dt < 0) crossings += 1;
    }
  }
  return crossings;
}

/**
 * Value-weighted barycenter of each node in `layer`, measured against the
 * ranks in the reference layer. Nodes with no neighbour there keep their
 * current rank (so they hold position instead of drifting to 0).
 */
export function layerBarycenters(
  graph: SankeyGraph,
  layer: readonly number[],
  rank: ReadonlyMap<number, number>,
  from: 'incoming' | 'outgoing',
): number[] {
  return layer.map((ni, k) => {
    const node = graph.nodes[ni];
    if (!node) return k;
    let wsum = 0;
    let vsum = 0;
    for (const li of from === 'incoming' ? node.incoming : node.outgoing) {
      const link = graph.links[li];
      if (!link) continue;
      const other = from === 'incoming' ? link.source : link.target;
      const r = rank.get(other);
      if (r === undefined) continue;
      const w = link.value > 0 ? link.value : 1e-9;
      wsum += w * r;
      vsum += w;
    }
    return vsum > 0 ? wsum / vsum : k;
  });
}

/**
 * Iterative crossing reduction (median/barycenter heuristic) with a FIXED
 * number of alternating sweeps. Deterministic: stable sort, no randomness, and
 * the best-crossing arrangement wins (ties keep the earlier one).
 */
export function orderLayers(
  graph: SankeyGraph,
  layersIn: readonly (readonly number[])[],
  iterations = SANKEY_ORDER_ITERATIONS,
): number[][] {
  let layers: number[][] = layersIn.map((l) => [...l]);
  let best = layers.map((l) => [...l]);
  let bestCrossings = countCrossings(graph, layers);
  if (layers.length < 2) {
    applyOrder(graph, best);
    return best;
  }

  for (let it = 0; it < iterations; it++) {
    const forward = it % 2 === 0;
    const idx = forward
      ? Array.from({ length: layers.length - 1 }, (_, i) => i + 1) // 1..last
      : Array.from({ length: layers.length - 1 }, (_, i) => layers.length - 2 - i); // last-1..0
    for (const li of idx) {
      const ref = layers[forward ? li - 1 : li + 1];
      const layer = layers[li];
      if (!ref || !layer) continue;
      const rank = new Map<number, number>();
      ref.forEach((ni, k) => rank.set(ni, k));
      const bary = layerBarycenters(graph, layer, rank, forward ? 'incoming' : 'outgoing');
      const withKey = layer.map((ni, k) => ({ ni, key: bary[k] ?? k, k }));
      // Stable: Array.prototype.sort is stable, and ties fall back to the
      // previous rank explicitly so the result never depends on engine details.
      withKey.sort((a, b) => a.key - b.key || a.k - b.k);
      layers[li] = withKey.map((e) => e.ni);
    }
    const crossings = countCrossings(graph, layers);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      best = layers.map((l) => [...l]);
    }
  }
  applyOrder(graph, best);
  return best;
}

/** Parse + layer + order in one call (what the chart type uses). */
export function buildSankeyGraph(input: unknown, align: SankeyAlign = 'justify'): SankeyGraph {
  const graph = parseSankeyGraph(input);
  const layers = assignLayers(graph, align);
  graph.layers = orderLayers(graph, layers);
  return graph;
}

// ---------------------------------------------------------------------------
// 4. Geometry

export interface SankeyNodeBox {
  node: SankeyNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SankeyRibbon {
  link: SankeyLink;
  /** Right edge of the source node bar. */
  x0: number;
  /** Left edge of the target node bar. */
  x1: number;
  /** Top/bottom at the source end (y0b - y0a = the link's thickness). */
  y0a: number;
  y0b: number;
  /** Top/bottom at the target end. */
  y1a: number;
  y1b: number;
  path: PathCmd[];
}

export interface SankeyLayoutOptions {
  nodeWidth?: number;
  nodePadding?: number;
}

export interface SankeyLayout {
  /** Indexed by node index. */
  boxes: SankeyNodeBox[];
  /** Indexed by link index. */
  ribbons: SankeyRibbon[];
  /** Pixels per unit of value (node height = value * ky). */
  ky: number;
  nodeWidth: number;
  nodePadding: number;
}

/** Resolve the sankey geometry options (contract defaults + the 2px gap floor). */
export function resolveSankeyGeometry(opts: SankeyLayoutOptions | undefined): {
  nodeWidth: number;
  nodePadding: number;
} {
  const nodeWidth = Math.max(1, opts?.nodeWidth ?? SANKEY_DEFAULT_NODE_WIDTH);
  const nodePadding = Math.max(SANKEY_MIN_NODE_GAP, opts?.nodePadding ?? SANKEY_DEFAULT_NODE_PADDING);
  return { nodeWidth, nodePadding };
}

/**
 * The value → pixel factor: the largest scale at which EVERY layer's bars plus
 * their `nodePadding` gaps still fit the plot height.
 */
export function sankeyValueScale(
  graph: SankeyGraph,
  height: number,
  nodePadding: number,
): number {
  let ky = Infinity;
  for (const layer of graph.layers) {
    let sum = 0;
    for (const ni of layer) sum += graph.nodes[ni]?.value ?? 0;
    if (sum <= 0) continue;
    const avail = Math.max(0, height - nodePadding * Math.max(0, layer.length - 1));
    ky = Math.min(ky, avail / sum);
  }
  return Number.isFinite(ky) ? ky : 0;
}

/** Cubic x(t) for our control points (both on the mid-x). */
function ribbonXAt(x0: number, x1: number, t: number): number {
  const m = SANKEY_CURVATURE;
  // Control points at x0 + (x1-x0)*m and x1 - (x1-x0)*m.
  const c0 = x0 + (x1 - x0) * m;
  const c1 = x1 - (x1 - x0) * m;
  const u = 1 - t;
  return u * u * u * x0 + 3 * u * u * t * c0 + 3 * u * t * t * c1 + t * t * t * x1;
}

/** Cubic y(t) for our control points (flat at both ends). */
function ribbonYAtT(ya: number, yb: number, t: number): number {
  const u = 1 - t;
  // Control points share the endpoint y values: y0, y0, y1, y1.
  return (u * u * u + 3 * u * u * t) * ya + (3 * u * t * t + t * t * t) * yb;
}

/** The curve parameter `t` at pixel x (monotonic cubic; bisection). */
export function ribbonTAtX(x0: number, x1: number, px: number): number {
  if (x1 === x0) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ribbonXAt(x0, x1, mid) < px) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Top/bottom edge of a ribbon at pixel x, or null when x is outside it. */
export function ribbonEdgesAtX(rb: SankeyRibbon, px: number): { top: number; bottom: number } | null {
  const lo = Math.min(rb.x0, rb.x1);
  const hi = Math.max(rb.x0, rb.x1);
  if (px < lo || px > hi) return null;
  const t = ribbonTAtX(rb.x0, rb.x1, px);
  return {
    top: ribbonYAtT(rb.y0a, rb.y1a, t),
    bottom: ribbonYAtT(rb.y0b, rb.y1b, t),
  };
}

function ribbonPath(rb: Omit<SankeyRibbon, 'path'>): PathCmd[] {
  const { x0, x1, y0a, y0b, y1a, y1b } = rb;
  const c0 = x0 + (x1 - x0) * SANKEY_CURVATURE;
  const c1 = x1 - (x1 - x0) * SANKEY_CURVATURE;
  return [
    ['M', x0, y0a],
    ['C', c0, y0a, c1, y1a, x1, y1a],
    ['L', x1, y1b],
    ['C', c1, y1b, c0, y0b, x0, y0b],
    ['Z'],
  ];
}

/**
 * Full sankey geometry inside `rect`.
 *
 * Node bars: one column per layer, evenly spaced from the left edge of `rect`
 * to its right edge; within a layer bars stack top-down in rank order with
 * `nodePadding` gaps and the stack is centered vertically.
 *
 * Ribbons: at each node the links are stacked in the order of the OTHER
 * endpoint's vertical position, from the top of the node bar down — so the
 * offsets at both ends sum to the node height for a balanced node and ribbons
 * meet the node edges exactly.
 */
export function computeSankeyLayout(
  graph: SankeyGraph,
  rect: Rect,
  options?: SankeyLayoutOptions,
): SankeyLayout {
  const { nodeWidth, nodePadding } = resolveSankeyGeometry(options);
  const ky = sankeyValueScale(graph, rect.h, nodePadding);
  const nLayers = graph.layers.length;
  const boxes: SankeyNodeBox[] = [];

  const stepX = nLayers > 1 ? (rect.w - nodeWidth) / (nLayers - 1) : 0;
  graph.layers.forEach((layer, li) => {
    const x = nLayers > 1 ? rect.x + stepX * li : rect.x + (rect.w - nodeWidth) / 2;
    let total = nodePadding * Math.max(0, layer.length - 1);
    for (const ni of layer) total += (graph.nodes[ni]?.value ?? 0) * ky;
    let y = rect.y + (rect.h - total) / 2;
    for (const ni of layer) {
      const node = graph.nodes[ni];
      if (!node) continue;
      const h = node.value * ky;
      boxes[ni] = { node, x, y, w: nodeWidth, h };
      y += h + nodePadding;
    }
  });

  // Ribbon endpoints: stack per node, ordered by the other end's position.
  const yOf = (ni: number): number => boxes[ni]?.y ?? 0;
  const outCursor = new Map<number, number>();
  const ribbons: SankeyRibbon[] = [];

  const sortedLinks = [...graph.links].sort((a, b) => {
    const sa = graph.nodes[a.source];
    const sb = graph.nodes[b.source];
    return (
      (sa?.layer ?? 0) - (sb?.layer ?? 0) ||
      (sa?.order ?? 0) - (sb?.order ?? 0) ||
      yOf(a.target) - yOf(b.target) ||
      a.index - b.index
    );
  });

  // Incoming order is independent of the outgoing pass, so pre-sort per target.
  const incomingOrder = new Map<number, number[]>();
  for (const node of graph.nodes) {
    const list = [...node.incoming].sort((a, b) => {
      const la = graph.links[a];
      const lb = graph.links[b];
      if (!la || !lb) return 0;
      return yOf(la.source) - yOf(lb.source) || la.index - lb.index;
    });
    incomingOrder.set(node.index, list);
  }
  const inOffset = new Map<number, number>();
  for (const [ni, list] of incomingOrder) {
    let cursor = yOf(ni);
    for (const li of list) {
      inOffset.set(li, cursor);
      cursor += (graph.links[li]?.value ?? 0) * ky;
    }
  }

  for (const link of sortedLinks) {
    const src = boxes[link.source];
    const tgt = boxes[link.target];
    if (!src || !tgt) continue;
    const thickness = link.value * ky;
    const y0a = outCursor.get(link.source) ?? src.y;
    outCursor.set(link.source, y0a + thickness);
    const y1a = inOffset.get(link.index) ?? tgt.y;
    const base = {
      link,
      x0: src.x + src.w,
      x1: tgt.x,
      y0a,
      y0b: y0a + thickness,
      y1a,
      y1b: y1a + thickness,
    };
    ribbons[link.index] = { ...base, path: ribbonPath(base) };
  }

  return { boxes, ribbons, ky, nodeWidth, nodePadding };
}

// ---------------------------------------------------------------------------
// Reading order (keyboard navigation, palette slots, table rows, events)

export type SankeyEntry =
  | { kind: 'node'; node: SankeyNode }
  | { kind: 'link'; link: SankeyLink; source: SankeyNode; target: SankeyNode };

/**
 * The type's natural reading order: every node in layer-then-rank sequence,
 * each immediately followed by ITS OUTGOING LINKS (ordered by the target's
 * position). Every node and every link appears exactly once, so
 * `nodes.length + links.length` entries address every mark — this single
 * sequence drives keyboard navigation, `dataIndex`, hit-test indices, the a11y
 * table rows and the node palette slots.
 */
export function sankeyReadingOrder(graph: SankeyGraph): SankeyEntry[] {
  const out: SankeyEntry[] = [];
  const pos = (ni: number): number => {
    const n = graph.nodes[ni];
    return n ? n.layer * 1e6 + n.order : 0;
  };
  for (const layer of graph.layers) {
    for (const ni of layer) {
      const node = graph.nodes[ni];
      if (!node) continue;
      out.push({ kind: 'node', node });
      const links = [...node.outgoing].sort((a, b) => {
        const la = graph.links[a];
        const lb = graph.links[b];
        if (!la || !lb) return 0;
        return pos(la.target) - pos(lb.target) || la.index - lb.index;
      });
      for (const li of links) {
        const link = graph.links[li];
        const source = link ? graph.nodes[link.source] : undefined;
        const target = link ? graph.nodes[link.target] : undefined;
        if (link && source && target) out.push({ kind: 'link', link, source, target });
      }
    }
  }
  return out;
}

/** Node indices in layer-then-rank sequence (palette slot order). */
export function sankeyNodeSequence(graph: SankeyGraph): number[] {
  return graph.layers.flat();
}
