/**
 * Graph data reading for the `network` chart type.
 *
 * The contract's data shape is
 * `{ nodes: {id, label, group?, value?}[]; links: {source, target, value?}[] }`,
 * but `SeriesOptions.data` is typed `DataValue[]` (and `types.ts` must not be
 * edited), so this module accepts every reasonable encoding of that shape and
 * normalizes it once:
 *
 *   1. `series[0].data = { nodes, links }`            (the contract shape verbatim)
 *   2. `series[0].data = [{ nodes, links }]`          (the same object wrapped)
 *   3. `series[0].data = nodes` **plus** links from `series[0].links`,
 *      `data.links`, or a `{ links }` entry alongside the nodes
 *   4. `data = { series: [...], nodes, links }`       (graph on ChartData)
 *
 * v0.3: `SeriesOptions.data` is `SeriesData = DataValue[] | GraphData`, so form
 * 1 — the contract shape verbatim — typechecks with no cast.
 *
 * Normalization also decides the two orders the whole type depends on:
 *   * **nodes are ordered by DEGREE, descending** (ties keep input order), so
 *     the pipeline's linear keyboard walk *is* the contract's "keyboard walks
 *     nodes by degree" and `dataIndex` is the degree rank;
 *   * **groups take categorical slots in FIRST-SEEN order** over the CALLER's
 *     original node order — never by frequency, never re-sorted.
 */
import type { ChartData } from '../../types';

/** A node after normalization. */
export interface NetworkNode {
  id: string;
  label: string;
  /** '' when the node declares no group. */
  group: string;
  /** null when no value was supplied (all-null = uniform radii). */
  value: number | null;
  /** Explicit per-node color override, if any. */
  color?: string;
  /** Incident link count (parallel links count twice; self-links ignored). */
  degree: number;
  /** Index in the CALLER's node order (drives first-seen group slots). */
  ord: number;
}

/** A link after normalization: endpoints are indices into `nodes`. */
export interface NetworkLink {
  source: number;
  target: number;
  value: number | null;
}

export interface NetworkGraph {
  /** Degree-descending (ties keep input order). */
  nodes: NetworkNode[];
  links: NetworkLink[];
  /** Distinct non-empty groups in first-seen (caller) order. */
  groups: string[];
}

interface RawNode {
  id?: unknown;
  label?: unknown;
  group?: unknown;
  value?: unknown;
  y?: unknown;
  color?: unknown;
}

interface RawLink {
  source?: unknown;
  target?: unknown;
  value?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Everything the parser can pull nodes/links out of. */
interface RawGraph {
  nodes: unknown[];
  links: unknown[];
}

function graphFromRecord(rec: Record<string, unknown>): RawGraph | null {
  const nodes = rec['nodes'];
  if (!Array.isArray(nodes)) return null;
  const links = rec['links'];
  return { nodes, links: Array.isArray(links) ? links : [] };
}

/** Locate the raw `{ nodes, links }` payload among the accepted encodings. */
function findRawGraph(data: ChartData | undefined): RawGraph | null {
  if (!data) return null;
  const dataRec = data as unknown as Record<string, unknown>;

  const series = Array.isArray(data.series) ? data.series : [];
  const s0 = series[0] as unknown;
  if (isRecord(s0)) {
    // (1) the contract shape verbatim: series[0].data IS the graph object.
    const sd = s0['data'];
    if (isRecord(sd)) {
      const g = graphFromRecord(sd);
      if (g) return g;
    }
    if (Array.isArray(sd)) {
      // (2) the graph object wrapped in a one-element array.
      for (const entry of sd) {
        if (!isRecord(entry)) continue;
        const g = graphFromRecord(entry);
        if (g) return g;
      }
      // (3) nodes as the series data; links alongside.
      const nodeLike = sd.filter((e) => isRecord(e));
      if (nodeLike.length > 0) {
        const sLinks = s0['links'];
        const dLinks = dataRec['links'];
        const links = Array.isArray(sLinks) ? sLinks : Array.isArray(dLinks) ? dLinks : [];
        return { nodes: nodeLike, links };
      }
    }
  }

  // (4) graph directly on ChartData.
  const g = graphFromRecord(dataRec);
  if (g) return g;
  return null;
}

function linkEndpointError(ref: unknown, ids: readonly string[]): Error {
  const known = ids.slice(0, 8).map((i) => `'${i}'`).join(', ');
  const more = ids.length > 8 ? `, +${ids.length - 8} more` : '';
  return new Error(
    `@chartcraft/core: network link references unknown node '${String(ref)}'. ` +
      `Links address nodes by their \`id\` (or by 0-based node index). Known ids: ${known}${more}.`,
  );
}

/**
 * Parse + normalize a network graph. Returns null when the data carries no
 * node list at all (an empty chart, not an error). Throws when a link points
 * at a node that does not exist — a silently dropped edge is a wrong picture.
 */
export function parseNetworkGraph(data: ChartData | undefined): NetworkGraph | null {
  const raw = findRawGraph(data);
  if (!raw) return null;

  // ---- nodes (caller order; duplicate ids: first wins)
  const nodes: NetworkNode[] = [];
  const indexById = new Map<string, number>();
  raw.nodes.forEach((entry) => {
    if (!isRecord(entry)) return;
    const n = entry as RawNode;
    const ord = nodes.length;
    const id = asString(n.id) ?? asString(n.label) ?? String(ord);
    if (indexById.has(id)) return;
    const label = asString(n.label) ?? id;
    const group = asString(n.group) ?? '';
    const value = asNumber(n.value) ?? asNumber(n.y);
    const color = asString(n.color);
    const node: NetworkNode = { id, label, group, value, degree: 0, ord };
    if (color !== null) node.color = color;
    indexById.set(id, ord);
    nodes.push(node);
  });
  if (nodes.length === 0) return { nodes: [], links: [], groups: [] };

  const ids = nodes.map((n) => n.id);
  const resolve = (ref: unknown): number => {
    const key = asString(ref);
    if (key !== null) {
      const byId = indexById.get(key);
      if (byId !== undefined) return byId;
    }
    // Numeric fallback: a 0-based node index (documented).
    if (typeof ref === 'number' && Number.isInteger(ref) && ref >= 0 && ref < nodes.length) return ref;
    throw linkEndpointError(ref, ids);
  };

  // ---- links (caller order), degrees counted on the caller ordering
  const rawLinks: NetworkLink[] = [];
  for (const entry of raw.links) {
    if (!isRecord(entry)) continue;
    const l = entry as RawLink;
    if (l.source === undefined || l.target === undefined) continue;
    const source = resolve(l.source);
    const target = resolve(l.target);
    rawLinks.push({ source, target, value: asNumber(l.value) });
    if (source !== target) {
      const s = nodes[source] as NetworkNode;
      const t = nodes[target] as NetworkNode;
      s.degree += 1;
      t.degree += 1;
    }
  }

  // ---- groups: first-seen in CALLER order, never by count
  const groups: string[] = [];
  for (const n of nodes) {
    if (n.group !== '' && !groups.includes(n.group)) groups.push(n.group);
  }

  // ---- degree-descending node order (stable: ties keep caller order)
  const ordered = [...nodes].sort((a, b) => (b.degree - a.degree) || (a.ord - b.ord));
  const newIndex = new Map<string, number>();
  ordered.forEach((n, i) => newIndex.set(n.id, i));
  const links = rawLinks.map((l) => ({
    source: newIndex.get((nodes[l.source] as NetworkNode).id) as number,
    target: newIndex.get((nodes[l.target] as NetworkNode).id) as number,
    value: l.value,
  }));

  return { nodes: ordered, links, groups };
}

/** Palette slot color for a node: explicit color, else its group's slot. */
export function nodeColor(node: NetworkNode, groups: readonly string[], slots: readonly string[]): string {
  if (node.color) return node.color;
  if (slots.length === 0) return '#888888';
  const gi = node.group === '' ? 0 : Math.max(0, groups.indexOf(node.group));
  return slots[gi % slots.length] as string;
}

/**
 * Node radii, AREA-TRUE: `r = rMax·√(v / vMax)` — area ∝ value exactly (a
 * radius-linear encoding is a bug, not a style choice). `rMin` is a legibility
 * FLOOR for near-zero values and for graphs with no values at all (every node
 * then takes `rMax`... see below), so proportionality holds for every value
 * whose scaled radius clears the floor.
 *
 * With no values supplied anywhere, all nodes take `rMin + (rMax - rMin) / 2`
 * — one uniform, mid-sized dot, because "no value" must not read as "big".
 */
export function nodeRadii(
  values: readonly (number | null)[],
  rMin: number,
  rMax: number,
): number[] {
  let vMax = 0;
  let any = false;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    any = true;
    if (v > vMax) vMax = v;
  }
  if (!any || vMax <= 0) return values.map(() => rMin + (rMax - rMin) / 2);
  const k = rMax / Math.sqrt(vMax);
  return values.map((v) => {
    const value = v === null || !Number.isFinite(v) || v <= 0 ? 0 : v;
    return Math.max(rMin, k * Math.sqrt(value));
  });
}
