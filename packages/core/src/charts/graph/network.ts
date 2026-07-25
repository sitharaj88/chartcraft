/**
 * Network (node-link) chart-type definition (v0.3 contract).
 *
 * Data: `{ nodes: {id, label, group?, value?}[]; links: {source, target, value?}[] }`
 * (every accepted encoding is normalized by ./graph.ts).
 *
 * Rules this module implements, verbatim from the contract:
 *   * **Deterministic force layout** — seeded, fixed iteration count
 *     (`network.fixedSeed` default 1, `network.iterations` default 300), no
 *     `Math.random()`, no animation loop: simulate, then draw (./force.ts).
 *   * **Node radius ∝ √value** (area-true; `nodeRadii` in ./graph.ts).
 *   * **Node color by `group`**, categorical slots in FIRST-SEEN order.
 *   * **Links hairline at 0.35 alpha.**
 *   * **Keyboard walks nodes by degree** — the normalizer orders nodes by
 *     degree descending, so the pipeline's linear walk *is* that order and
 *     `dataIndex` is the degree rank.
 *   * **Table = node, group, degree, value.**
 *
 * Labels are drawn only on nodes whose diameter admits the MEASURED text;
 * every other node relies on the tooltip.
 */
import type { ChartOptions, SeriesOptions, TooltipPoint } from '../../types';
import type { PointPos, Rect, TypeGeom } from '../../layout';
import type { DataModel, ResolvedOptions } from '../../model';
import type { ChartTypeDefinition } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import { formatValue } from '../../util';
import { contrastInk } from '../matrix/color-scale';
import { nodeColor, nodeRadii, parseNetworkGraph, type NetworkGraph, type NetworkNode } from './graph';
import { fitPositions, simulateForceCached, FORCE_DEFAULTS } from './force';

/** Legibility floor for a node radius (px). */
export const NETWORK_NODE_MIN_R = 4;
/** Hard cap for the largest node radius (px). */
export const NETWORK_NODE_MAX_R = 28;
/** Links are hairline at 0.35 alpha (contract). */
export const NETWORK_LINK_ALPHA = 0.35;
export const NETWORK_LINK_WIDTH = 1;
/** Padding around a node's label inside its circle (px, total). */
const LABEL_PAD = 4;

/** Largest node radius for a plot rect (never more than NETWORK_NODE_MAX_R). */
export function networkMaxRadius(plot: Rect): number {
  const fromPlot = Math.min(plot.w, plot.h) / 10;
  return Math.max(NETWORK_NODE_MIN_R + 2, Math.min(NETWORK_NODE_MAX_R, fromPlot));
}

export interface NetworkNodeGeom {
  /** MODEL point index (= degree rank). */
  pi: number;
  node: NetworkNode;
  r: number;
  color: string;
  /** Direct label when the circle admits the measured text, else null. */
  label: string | null;
  ink: string;
}

export interface NetworkGeomExtra {
  /** MODEL series index carrying the nodes (-1 when none is visible). */
  si: number;
  nodes: NetworkNodeGeom[];
  links: { source: number; target: number }[];
  groups: string[];
  maxR: number;
}

/** Internal shape stashed on the resolved series by `resolveOptions`. */
type SeriesWithGraph = SeriesOptions & { graph?: NetworkGraph };

/**
 * The normalized graph for a resolved-options snapshot: the one stashed by
 * `resolveOptions`, else parsed on the spot (so hand-built contexts in unit
 * tests work too).
 */
export function networkGraphOf(opts: Pick<ResolvedOptions, 'data'>): NetworkGraph | null {
  const s0 = opts.data?.series?.[0] as SeriesWithGraph | undefined;
  if (s0?.graph) return s0.graph;
  return parseNetworkGraph(opts.data);
}

/** Resolved force config from `options.network` (contract defaults). */
export function networkForceConfig(
  graph: NetworkGraph,
  network: ChartOptions['network'],
): Parameters<typeof simulateForceCached>[0] {
  return {
    nodeCount: graph.nodes.length,
    links: graph.links.map((l) => ({ source: l.source, target: l.target })),
    linkDistance: network?.linkDistance ?? FORCE_DEFAULTS.linkDistance,
    charge: network?.charge ?? FORCE_DEFAULTS.charge,
    iterations: network?.iterations ?? FORCE_DEFAULTS.iterations,
    seed: network?.fixedSeed ?? FORCE_DEFAULTS.seed,
  };
}

function extraOf(geom: TypeGeom): NetworkGeomExtra | null {
  return (geom.extra as NetworkGeomExtra | undefined) ?? null;
}

function seriesIndex(model: DataModel): number {
  return model.series.findIndex((s) => s.visible);
}

export const networkDefinition: ChartTypeDefinition = {
  id: 'network',
  needs: { cartesianAxes: false },

  /**
   * Normalize the graph ONCE, before the model is built:
   *   * nodes become the first series' data (degree-descending) so the shared
   *     pipeline gives every node an event identity, a tooltip, keyboard focus
   *     and an a11y row with no per-type branching in chart.ts;
   *   * the normalized graph rides along on the series for the later stages;
   *   * legend "auto" keys off the GROUP count (the legend lists groups, not
   *     series — a single node-link series would otherwise hide it).
   */
  resolveOptions(resolved, raw) {
    const graph = parseNetworkGraph(raw.data);
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawShow === undefined) resolved.legend.show = (graph?.groups.length ?? 0) >= 2;
    if (!graph) return;

    const s0 = raw.data?.series?.[0];
    const nodeData = graph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      y: n.value,
      ...(n.group !== '' ? { group: n.group } : {}),
      ...(n.color !== undefined ? { color: n.color } : {}),
    }));
    const series: SeriesWithGraph = {
      ...(s0 ?? { name: 'Network', data: [] }),
      name: s0?.name ?? 'Network',
      data: nodeData,
      graph,
    };
    // Only the first series carries the graph (contract: one node-link set).
    resolved.data = { ...resolved.data, series: [series] };
  },

  layout(ctx): TypeGeom {
    const { model, theme, opts } = ctx;
    const plot = ctx.layout.plot;
    const graph = networkGraphOf(opts);
    const si = seriesIndex(model);
    const pos: (PointPos | null)[][] = model.series.map(() => []);
    const empty: NetworkGeomExtra = { si, nodes: [], links: [], groups: [], maxR: 0 };
    if (!graph || graph.nodes.length === 0 || si < 0) {
      return { pos, slices: null, bars: null, extra: empty };
    }

    // Radii first: they set the padding the layout must fit inside.
    const maxR = networkMaxRadius(plot);
    const radii = nodeRadii(graph.nodes.map((n) => n.value), NETWORK_NODE_MIN_R, maxR);
    const biggest = radii.reduce((m, r) => Math.max(m, r), 0);

    // Deterministic simulation in abstract units, then fitted to the plot.
    const sim = simulateForceCached(networkForceConfig(graph, opts.network));
    const fitted = fitPositions(sim, plot, biggest + 2);

    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const nodes: NetworkNodeGeom[] = graph.nodes.map((node, i) => {
      const r = radii[i] as number;
      const color = nodeColor(node, graph.groups, theme.series);
      // Direct labels are selective: only when the MEASURED text fits.
      const fits =
        2 * r >= theme.fontSize + LABEL_PAD && ctx.measure(node.label, font) + LABEL_PAD <= 2 * r;
      return { pi: i, node, r, color, label: fits ? node.label : null, ink: contrastInk(color) };
    });

    pos[si] = nodes.map((_, i) => {
      const x = fitted.x[i];
      const y = fitted.y[i];
      return x === undefined || y === undefined ? null : { x, y, y0: y };
    });

    const extra: NetworkGeomExtra = {
      si,
      nodes,
      links: graph.links.map((l) => ({ source: l.source, target: l.target })),
      groups: [...graph.groups],
      maxR: biggest,
    };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx) {
    const { r, theme, hover, geom } = ctx;
    const extra = extraOf(geom);
    if (!extra || extra.si < 0) return;
    const positions = geom.pos[extra.si] ?? [];
    const font = `${theme.fontSize}px ${theme.fontFamily}`;

    // Links first, hairline at 0.35 alpha, under every node.
    for (const link of extra.links) {
      const a = positions[link.source];
      const b = positions[link.target];
      if (!a || !b) continue;
      r.line(a.x, a.y, b.x, b.y, { color: theme.textMuted, width: NETWORK_LINK_WIDTH }, NETWORK_LINK_ALPHA);
    }

    // Nodes: surface ring keeps overlapping circles readable.
    for (const n of extra.nodes) {
      const p = positions[n.pi];
      if (!p) continue;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === n.pi;
      r.circle(p.x, p.y, n.r, {
        fill: n.color,
        stroke: hovered ? { color: theme.textPrimary, width: 1.5 } : { color: theme.surface, width: 1 },
      });
    }

    // Direct labels (ink chosen for contrast against the node fill).
    for (const n of extra.nodes) {
      if (!n.label) continue;
      const p = positions[n.pi];
      if (!p) continue;
      r.text(n.label, p.x, p.y, { font, color: n.ink, align: 'center', baseline: 'middle' });
    }
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    const positions = ctx.geom.pos[extra.si] ?? [];
    let best: { pi: number; d2: number } | null = null;
    for (const n of extra.nodes) {
      const p = positions[n.pi];
      if (!p) continue;
      const dx = px - p.x;
      const dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      // Hit targets are larger than the marks (contract).
      const reach = n.r + 6;
      if (d2 > reach * reach) continue;
      if (!best || d2 < best.d2) best = { pi: n.pi, d2 };
    }
    return best ? { si: extra.si, pi: best.pi } : null;
  },

  legendItems(ctx): LegendItem[] {
    // Groups, non-toggleable: a group is a color key, not a series.
    const graph = networkGraphOf(ctx.opts);
    if (!graph) return [];
    const slots = ctx.theme.series;
    return graph.groups.map((g, i) => ({
      id: `group:${g}`,
      name: g,
      color: slots[i % slots.length] ?? '#888888',
      visible: true,
      toggleable: false,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const graph = networkGraphOf(ctx.opts);
    const rows = (graph?.nodes ?? []).map((n) => ({
      header: n.label,
      cells: [n.group === '' ? '—' : n.group, String(n.degree), formatValue(n.value)],
    }));
    return { columns: ['Node', 'Group', 'Degree', 'Value'], rows };
  },

  /**
   * A graph is nodes, links and groups. This clause is also the ONLY place the
   * link COUNT is exposed to assistive tech: per the contract, network's data
   * table is `node, group, degree, value` and its keyboard walk visits nodes
   * only, so a reader who never hears the edge count cannot tell a tree from a
   * clique. (Making the individual links navigable the way sankey does would
   * exceed the contract's spec for this type — see QUALITY-AUDIT.md.)
   */
  a11ySummary(ctx): string | null {
    const graph = networkGraphOf(ctx.opts);
    if (!graph) return null;
    const nodes = graph.nodes.length;
    const links = graph.links.length;
    const groups = graph.groups.length;
    const parts = [
      `${nodes} ${nodes === 1 ? 'node' : 'nodes'}`,
      `${links} ${links === 1 ? 'link' : 'links'}`,
    ];
    if (groups > 1) parts.push(`${groups} groups`);
    return `${parts.join(', ')} (force-directed, deterministic layout)`;
  },

  keyboardNav(model) {
    // Nodes are stored degree-descending, so the linear walk IS degree order.
    const si = seriesIndex(model);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si && si >= 0 ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const n = extra?.nodes[pos.pi];
    if (!extra || !n) return null;
    const group = n.node.group === '' ? '' : `${n.node.group}, `;
    const value = n.node.value === null ? 'no value' : formatValue(n.node.value);
    return `${n.node.label}: ${value}. ${group}degree ${n.node.degree}, node ${pos.pi + 1} of ${
      extra.nodes.length
    }.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const base = ctx.pointFor(hit.si, hit.pi);
    const extra = extraOf(ctx.geom);
    const n = extra?.nodes[hit.pi];
    if (!base || !n) return base ? [base] : [];
    const label = n.node.label;
    const mk = (name: string, value: string): TooltipPoint => ({
      ...base,
      seriesName: name,
      color: n.color,
      formattedX: label,
      formattedY: value,
    });
    const points: TooltipPoint[] = [mk('Value', n.node.value === null ? '—' : formatValue(n.node.value))];
    if (n.node.group !== '') points.push(mk('Group', n.node.group));
    points.push(mk('Degree', String(n.node.degree)));
    return points;
  },
};
