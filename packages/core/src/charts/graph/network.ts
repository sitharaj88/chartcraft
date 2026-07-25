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
 *     degree descending, so the pipeline's linear walk *is* that order.
 *   * **Table = node, group, degree, value.**
 *
 * v0.3.2 (E-4): the reading order is now **node, then that node's links**, the
 * shape `sankey` already uses, because links were previously unreachable by
 * assistive technology altogether — four nodes and five links produced four
 * table rows and four keyboard stops, so a reader could not tell a tree from a
 * clique. The contract's `network` row is amended to match. One flat index space
 * (`networkReadingOrder`) drives keyboard navigation, `dataIndex`, hit-testing,
 * the tooltip and the a11y table, so no surface can disagree with another.
 *
 * Labels are drawn only on nodes whose diameter admits the MEASURED text;
 * every other node relies on the tooltip.
 */
import type { ChartData, ChartOptions, DataPoint, SeriesOptions, TooltipPoint } from '../../types';
import type { PointPos, Rect, TypeGeom } from '../../layout';
import type { DataModel, ResolvedOptions } from '../../model';
import type { ChartTypeDefinition } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import { formatValue } from '../../util';
import { dataValuesOf } from '../../data/normalize';
import { contrastInk } from '../matrix/color-scale';
import {
  networkLinkLabel,
  networkReadingOrder,
  nodeColor,
  nodeRadii,
  parseNetworkGraph,
  type NetworkEntry,
  type NetworkGraph,
  type NetworkLink,
  type NetworkNode,
} from './graph';
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
/** Pointer reach for a hairline link (px) — a 1px mark needs a real target. */
const LINK_HIT_RADIUS = 5;

/** Squared distance from a point to a segment (link hit-testing). */
function distanceToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

/** Largest node radius for a plot rect (never more than NETWORK_NODE_MAX_R). */
export function networkMaxRadius(plot: Rect): number {
  const fromPlot = Math.min(plot.w, plot.h) / 10;
  return Math.max(NETWORK_NODE_MIN_R + 2, Math.min(NETWORK_NODE_MAX_R, fromPlot));
}

export interface NetworkNodeGeom {
  /** MODEL point index = index in the reading order (`entries`). */
  pi: number;
  /** Index into `graph.nodes` (degree rank). */
  ni: number;
  node: NetworkNode;
  r: number;
  color: string;
  /** Direct label when the circle admits the measured text, else null. */
  label: string | null;
  ink: string;
}

export interface NetworkLinkGeom {
  /** MODEL point index = index in the reading order (`entries`). */
  pi: number;
  source: number;
  target: number;
  link: NetworkLink;
}

export interface NetworkGeomExtra {
  /** MODEL series index carrying the marks (-1 when none is visible). */
  si: number;
  /** Reading order: node, then that node's outgoing links (v0.3.2, E-4). */
  entries: NetworkEntry[];
  nodes: NetworkNodeGeom[];
  links: NetworkLinkGeom[];
  /** Reading-order index, by node index. */
  entryOfNode: number[];
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

/**
 * Wrong-shape data is an ERROR, not an empty chart (quality audit E-9).
 *
 * `network` was the sharpest case in the audit: it takes the SAME
 * `{ nodes, links }` payload as `sankey`, located by the same parser, and only
 * sankey complained. A value list produced no marks, no table rows, a
 * header-only CSV and no diagnostic at all — which reads as "no data" and sends
 * the developer looking anywhere but at the payload.
 *
 * Empty series and empty/all-null data are still an empty chart: no data is not
 * wrong data, and that is the same line `gantt` draws.
 */
function assertGraphShape(data: ChartData | undefined): void {
  const hasValues = (data?.series ?? []).some((s) =>
    dataValuesOf(s.data).some((d) => d !== null && d !== undefined),
  );
  if (!hasValues) return;
  throw new Error(
    `@chartcraft/core: network expects its graph on the FIRST series as ` +
      `data: { nodes: { id, label?, group?, value? }[]; links: { source, target, value? }[] } ` +
      `— 'source'/'target' reference node ids (or 0-based node indices). ` +
      `Nodes may also be the series data with the links alongside as \`series[0].links\`.`,
  );
}

export const networkDefinition: ChartTypeDefinition = {
  id: 'network',
  needs: { cartesianAxes: false },

  /**
   * Normalize the graph ONCE, before the model is built:
   *   * the reading order (node, then that node's links) becomes the first
   *     series' data, so the shared pipeline gives every MARK — node *and* link
   *     — an event identity, a tooltip, keyboard focus and an a11y row with no
   *     per-type branching in chart.ts (v0.3.2, E-4);
   *   * the normalized graph rides along on the series for the later stages;
   *   * legend "auto" keys off the GROUP count (the legend lists groups, not
   *     series — a single node-link series would otherwise hide it).
   */
  resolveOptions(resolved, raw) {
    const graph = parseNetworkGraph(raw.data);
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawShow === undefined) resolved.legend.show = (graph?.groups.length ?? 0) >= 2;
    if (!graph) {
      assertGraphShape(raw.data);
      return;
    }

    const s0 = raw.data?.series?.[0];
    const marks: DataPoint[] = networkReadingOrder(graph).map((e) =>
      e.kind === 'node'
        ? {
            id: e.node.id,
            label: e.node.label,
            y: e.node.value,
            ...(e.node.group !== '' ? { group: e.node.group } : {}),
            ...(e.node.color !== undefined ? { color: e.node.color } : {}),
          }
        : { label: networkLinkLabel(e.source, e.target), y: e.link.value },
    );
    const series: SeriesWithGraph = {
      ...(s0 ?? { name: 'Network', data: [] }),
      name: s0?.name ?? 'Network',
      data: marks,
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
    const entries = networkReadingOrder(graph);
    const empty: NetworkGeomExtra = {
      si,
      entries,
      nodes: [],
      links: [],
      entryOfNode: [],
      groups: [],
      maxR: 0,
    };
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

    // Reading-order index per node, so every later stage addresses ONE index
    // space (`pos`, `dataIndex`, hit-test, keyboard, table) — sankey's rule.
    const entryOfNode: number[] = [];
    entries.forEach((e, i) => {
      if (e.kind === 'node') entryOfNode[e.index] = i;
    });

    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const nodes: NetworkNodeGeom[] = graph.nodes.map((node, i) => {
      const r = radii[i] as number;
      const color = nodeColor(node, graph.groups, theme.series);
      // Direct labels are selective: only when the MEASURED text fits.
      const fits =
        2 * r >= theme.fontSize + LABEL_PAD && ctx.measure(node.label, font) + LABEL_PAD <= 2 * r;
      return {
        pi: entryOfNode[i] ?? i,
        ni: i,
        node,
        r,
        color,
        label: fits ? node.label : null,
        ink: contrastInk(color),
      };
    });

    const nodeAt = (ni: number): PointPos | null => {
      const x = fitted.x[ni];
      const y = fitted.y[ni];
      return x === undefined || y === undefined ? null : { x, y, y0: y };
    };

    const links: NetworkLinkGeom[] = [];
    pos[si] = entries.map((e, i) => {
      if (e.kind === 'node') return nodeAt(e.index);
      links.push({ pi: i, source: e.link.source, target: e.link.target, link: e.link });
      // A link's position is its midpoint — where a tooltip for the edge belongs.
      const a = nodeAt(e.link.source);
      const b = nodeAt(e.link.target);
      if (!a || !b) return null;
      const my = (a.y + b.y) / 2;
      return { x: (a.x + b.x) / 2, y: my, y0: my };
    });

    const extra: NetworkGeomExtra = {
      si,
      entries,
      nodes,
      links,
      entryOfNode,
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

    // Links first, hairline at 0.35 alpha, under every node. Endpoints are read
    // through `entryOfNode` because `pos` is indexed by READING ORDER, not by
    // node index — and it must stay so: the animator interpolates that array.
    for (const link of extra.links) {
      const a = positions[extra.entryOfNode[link.source] ?? -1];
      const b = positions[extra.entryOfNode[link.target] ?? -1];
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
    if (best) return { si: extra.si, pi: best.pi };
    // Nodes win; a link is only hit when no node is under the pointer, so a
    // hairline crossing a circle never steals that circle's hover (sankey's
    // "bars before ribbons" rule). Pointer and keyboard reach the same marks.
    for (const l of extra.links) {
      const a = positions[extra.entryOfNode[l.source] ?? -1];
      const b = positions[extra.entryOfNode[l.target] ?? -1];
      if (!a || !b) continue;
      const d2 = distanceToSegmentSq(px, py, a.x, a.y, b.x, b.y);
      if (d2 > LINK_HIT_RADIUS * LINK_HIT_RADIUS) continue;
      if (!best || d2 < best.d2) best = { pi: l.pi, d2 };
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

  /**
   * Nodes AND links, in reading order (v0.3.2, E-4). Links are indented under
   * their source node — the convention treemap set and sankey already follows —
   * so the nesting survives a flat table and a flat CSV alike.
   */
  a11yTable(ctx): A11yTableSpec {
    const graph = networkGraphOf(ctx.opts);
    const rows: A11yTableSpec['rows'] = networkReadingOrder(graph).map((e) =>
      e.kind === 'node'
        ? {
            header: e.node.label,
            cells: [
              e.node.group === '' ? '—' : e.node.group,
              String(e.node.degree),
              '—',
              '—',
              formatValue(e.node.value),
            ],
          }
        : {
            header: `  ${networkLinkLabel(e.source, e.target)}`,
            cells: ['—', '—', e.source.label, e.target.label, formatValue(e.link.value)],
          },
    );
    return { columns: ['Node / link', 'Group', 'Degree', 'Source', 'Target', 'Value'], rows };
  },

  /** A graph is nodes, links and groups — not "1 series and 4 points". */
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
    // One flat sequence: each node (degree-descending), then that node's links.
    const si = seriesIndex(model);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si && si >= 0 ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const entry = extra?.entries[pos.pi];
    if (!extra || !entry) return null;
    const nodeCount = extra.entries.filter((e) => e.kind === 'node').length;
    if (entry.kind === 'node') {
      const group = entry.node.group === '' ? '' : `${entry.node.group}, `;
      const value = entry.node.value === null ? 'no value' : formatValue(entry.node.value);
      return `${entry.node.label}: ${value}. ${group}degree ${entry.node.degree}, node ${
        entry.index + 1
      } of ${nodeCount}.`;
    }
    // A link states BOTH endpoints and its position among its source's links —
    // the two facts a reader needs to reconstruct the graph's structure.
    const siblings = extra.entries.filter(
      (e) => e.kind === 'link' && e.link.source === entry.link.source,
    ).length;
    const k =
      extra.entries
        .filter((e) => e.kind === 'link' && e.link.source === entry.link.source)
        .findIndex((e) => e.kind === 'link' && e.index === entry.index) + 1;
    const value = entry.link.value === null ? 'no value' : formatValue(entry.link.value);
    return (
      `${entry.source.label} to ${entry.target.label}: ${value}. ` +
      `Link ${k} of ${siblings} from ${entry.source.label}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const base = ctx.pointFor(hit.si, hit.pi);
    const extra = extraOf(ctx.geom);
    const entry = extra?.entries[hit.pi];
    if (!base || !extra || !entry) return base ? [base] : [];
    if (entry.kind === 'link') {
      const label = networkLinkLabel(entry.source, entry.target);
      const color = extra.nodes[entry.link.source]?.color ?? base.color;
      return [
        {
          ...base,
          seriesName: 'Link',
          color,
          formattedX: label,
          formattedY: entry.link.value === null ? '—' : formatValue(entry.link.value),
        },
      ];
    }
    const n = extra.nodes[entry.index];
    if (!n) return [base];
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
