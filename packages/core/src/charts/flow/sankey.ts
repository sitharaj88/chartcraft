/**
 * Sankey chart-type definition (v0.3 contract).
 *
 * Data lives on the FIRST series as
 * `{ nodes: { id, label?, color? }[]; links: { source, target, value }[] }`;
 * `source`/`target` reference node **ids** or 0-based node **indices**. All the
 * layout math is pure and lives in ./graph.ts (longest-path layering,
 * deterministic iterative crossing reduction, throughput-proportional node
 * sizing, cubic ribbon geometry with exact stacked offsets at both ends).
 *
 * Rendering per the contract: node bars take the categorical palette slots in
 * layer-then-rank order (an explicit node `color` wins), 2px minimum node gaps,
 * links drawn as cubic Bézier ribbons at 0.45 alpha colored by their SOURCE
 * node. Node labels are drawn directly beside their bar when they fit
 * (measured, ellipsized, ink-colored) — so the legend defaults to hidden.
 *
 * ONE reading order (`sankeyReadingOrder`) drives everything: each node
 * followed by its outgoing links. That single index space is the keyboard
 * order, `dataIndex`, the hit-test index, the a11y table row order and the
 * palette slot order.
 */
import type { ChartData, DataPoint, TooltipPoint } from '../../types';
import type { HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { ResolvedOptions } from '../../model';
import type { ChartTypeDefinition, DefinitionContext } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { formatValue } from '../../util';
import { formatShare } from '../matrix/hierarchy';
import { fitText, firstVisibleSeries, hideLegendByDefault, singleSeriesData } from './shared';
import {
  buildSankeyGraph,
  computeSankeyLayout,
  emptySankeyGraph,
  isSankeyGraphInput,
  ribbonEdgesAtX,
  sankeyNodeSequence,
  sankeyReadingOrder,
  SANKEY_LINK_ALPHA,
  type SankeyAlign,
  type SankeyEntry,
  type SankeyGraph,
  type SankeyLayout,
} from './graph';

/** Gap between a node bar and its direct label. */
export const SANKEY_LABEL_PAD = 6;
/** Alpha for ribbons that are not part of the hovered/focused mark. */
export const SANKEY_DIM_ALPHA = 0.18;
/** Alpha for the hovered/focused ribbon (and a hovered node's ribbons). */
export const SANKEY_HILITE_ALPHA = 0.7;

/**
 * The parsed graph, keyed by the synthetic point array that `resolveOptions`
 * puts on the resolved options. Every later stage (layout, legend, a11y table,
 * tooltips) recovers the graph from `ctx.opts` without re-validating.
 */
const GRAPH_CACHE = new WeakMap<object, SankeyGraph>();

function alignOf(opts: { sankey?: { align?: SankeyAlign } }): SankeyAlign {
  return opts.sankey?.align ?? 'justify';
}

/** Recover (or lazily parse) the graph for a resolved options object. */
export function sankeyGraphOf(opts: Pick<ResolvedOptions, 'data' | 'sankey'>): SankeyGraph {
  const raw = opts.data.series[0]?.data as unknown;
  if (raw === null || typeof raw !== 'object') return emptySankeyGraph();
  const cached = GRAPH_CACHE.get(raw as object);
  if (cached) return cached;
  // Direct-definition use (no resolveOptions pass): parse the payload in place.
  if (isSankeyGraphInput(raw)) {
    const graph = buildSankeyGraph(raw, alignOf(opts));
    GRAPH_CACHE.set(raw as object, graph);
    return graph;
  }
  return emptySankeyGraph();
}

/** Node fill colors by node index: categorical slots in reading order. */
export function sankeyNodeColors(graph: SankeyGraph, theme: { series: string[] }): string[] {
  const colors: string[] = [];
  sankeyNodeSequence(graph).forEach((ni, slot) => {
    const node = graph.nodes[ni];
    if (!node) return;
    colors[ni] = node.color ?? theme.series[slot % theme.series.length] ?? '#888888';
  });
  return colors;
}

export interface SankeyNodeLabel {
  text: string;
  x: number;
  y: number;
  align: 'left' | 'right';
}

export interface SankeyGeomExtra {
  graph: SankeyGraph;
  geometry: SankeyLayout;
  /** Reading order: node, then that node's outgoing links. */
  entries: SankeyEntry[];
  /** Node fill colors, by node index. */
  colors: string[];
  /** Direct labels, by node index (absent when the label does not fit). */
  labels: (SankeyNodeLabel | null)[];
  /** entry index, by node index. */
  entryOfNode: number[];
  /** entry index, by link index. */
  entryOfLink: number[];
  /** MODEL series index the marks belong to (-1 when hidden/absent). */
  si: number;
}

function extraOf(geom: TypeGeom): SankeyGeomExtra | null {
  return (geom.extra as SankeyGeomExtra | undefined) ?? null;
}

/** Synthetic marks-in-reading-order data for the pipeline (see ./shared.ts). */
export function sankeySyntheticData(data: ChartData, graph: SankeyGraph): ChartData {
  const points: DataPoint[] = sankeyReadingOrder(graph).map((e) =>
    e.kind === 'node'
      ? { x: e.node.label, y: e.node.value, label: e.node.label, id: e.node.id }
      : {
          x: `${e.source.label} → ${e.target.label}`,
          y: e.link.value,
          label: `${e.source.label} → ${e.target.label}`,
        },
  );
  return singleSeriesData(data, 'Flow', points);
}

function entryLabel(e: SankeyEntry): string {
  return e.kind === 'node' ? e.node.label : `${e.source.label} → ${e.target.label}`;
}

export const sankeyDefinition: ChartTypeDefinition = {
  id: 'sankey',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    if (resolved.data.series.length > 0) {
      const graph = buildSankeyGraph(resolved.data.series[0]?.data, alignOf(resolved));
      const data = sankeySyntheticData(resolved.data, graph);
      const key = data.series[0]?.data as unknown as object;
      GRAPH_CACHE.set(key, graph);
      resolved.data = data;
    }
    // Node bars are labelled directly, so the legend is hidden unless asked for.
    hideLegendByDefault(resolved, raw);
  },

  layout(ctx): TypeGeom {
    const graph = sankeyGraphOf(ctx.opts);
    const si = firstVisibleSeries(ctx.model);
    const pos: (PointPos | null)[][] = ctx.model.series.map(() => []);
    const entries = sankeyReadingOrder(graph);
    const empty: SankeyGeomExtra = {
      graph,
      geometry: { boxes: [], ribbons: [], ky: 0, nodeWidth: 0, nodePadding: 0 },
      entries,
      colors: [],
      labels: [],
      entryOfNode: [],
      entryOfLink: [],
      si,
    };
    if (si < 0 || graph.nodes.length === 0) return { pos, slices: null, bars: null, extra: empty };

    const geometry = computeSankeyLayout(graph, ctx.layout.plot, ctx.opts.sankey);
    const colors = sankeyNodeColors(graph, ctx.theme);
    const entryOfNode: number[] = [];
    const entryOfLink: number[] = [];
    entries.forEach((e, i) => {
      if (e.kind === 'node') entryOfNode[e.node.index] = i;
      else entryOfLink[e.link.index] = i;
    });

    // Direct node labels: outside the bar, inside the gap to the next layer
    // (last layer labels to the left). Measured; dropped when nothing fits.
    const font = `${ctx.theme.fontSize}px ${ctx.theme.fontFamily}`;
    const nLayers = graph.layers.length;
    const step =
      nLayers > 1 ? (ctx.layout.plot.w - geometry.nodeWidth) / (nLayers - 1) : ctx.layout.plot.w - geometry.nodeWidth;
    const room = Math.max(0, step - geometry.nodeWidth - SANKEY_LABEL_PAD * 2);
    const labels: (SankeyNodeLabel | null)[] = [];
    for (const box of geometry.boxes) {
      if (!box) continue;
      const last = box.node.layer === nLayers - 1;
      const text = fitText(box.node.label, room, (t) => ctx.measure(t, font));
      labels[box.node.index] = text
        ? {
            text,
            x: last ? box.x - SANKEY_LABEL_PAD : box.x + box.w + SANKEY_LABEL_PAD,
            y: box.y + box.h / 2,
            align: last ? 'right' : 'left',
          }
        : null;
    }

    pos[si] = entries.map((e) => {
      if (e.kind === 'node') {
        const box = geometry.boxes[e.node.index];
        if (!box) return null;
        const cy = box.y + box.h / 2;
        return { x: box.x + box.w / 2, y: cy, y0: cy };
      }
      const rb = geometry.ribbons[e.link.index];
      if (!rb) return null;
      const cy = (rb.y0a + rb.y0b + rb.y1a + rb.y1b) / 4;
      return { x: (rb.x0 + rb.x1) / 2, y: cy, y0: cy };
    });

    return {
      pos,
      slices: null,
      bars: null,
      extra: { graph, geometry, entries, colors, labels, entryOfNode, entryOfLink, si },
    };
  },

  render(ctx: RenderContext) {
    const { r, theme, hover } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return;
    const { geometry, colors } = extra;

    // What is focused? (a node highlights its incident ribbons)
    const hovered = hover && hover.si === extra.si ? extra.entries[hover.pi] : undefined;
    const hoveredNode = hovered?.kind === 'node' ? hovered.node.index : null;
    const hoveredLink = hovered?.kind === 'link' ? hovered.link.index : null;

    // Ribbons first (0.45 alpha, colored by the SOURCE node), then bars.
    for (const rb of geometry.ribbons) {
      if (!rb) continue;
      const incident =
        hoveredLink === rb.link.index ||
        (hoveredNode !== null && (rb.link.source === hoveredNode || rb.link.target === hoveredNode));
      const alpha = hovered === undefined ? SANKEY_LINK_ALPHA : incident ? SANKEY_HILITE_ALPHA : SANKEY_DIM_ALPHA;
      r.path(rb.path, { fill: colors[rb.link.source] ?? theme.series[0] ?? '#888888', alpha });
    }

    for (const box of geometry.boxes) {
      if (!box || box.h <= 0) continue;
      const isHovered = hoveredNode === box.node.index;
      r.rect(box.x, box.y, box.w, box.h, {
        fill: colors[box.node.index] ?? theme.series[0] ?? '#888888',
        ...(isHovered ? { stroke: { color: theme.textPrimary, width: 1 } } : {}),
      });
    }

    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    for (const label of extra.labels) {
      if (!label) continue;
      r.text(label.text, label.x, label.y, {
        font,
        // Ink colors, never the mark color.
        color: theme.textPrimary,
        align: label.align,
        baseline: 'middle',
      });
    }
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    const { geometry } = extra;
    // Node bars win over ribbons (they are the smaller, more precise target).
    for (const box of geometry.boxes) {
      if (!box || box.h <= 0) continue;
      if (px >= box.x - 2 && px <= box.x + box.w + 2 && py >= box.y && py <= box.y + box.h) {
        const pi = extra.entryOfNode[box.node.index];
        if (pi !== undefined) return { si: extra.si, pi };
      }
    }
    for (const rb of geometry.ribbons) {
      if (!rb) continue;
      const edges = ribbonEdgesAtX(rb, px);
      if (!edges) continue;
      if (py >= edges.top && py <= edges.bottom) {
        const pi = extra.entryOfLink[rb.link.index];
        if (pi !== undefined) return { si: extra.si, pi };
      }
    }
    return null;
  },

  legendItems(ctx: DefinitionContext): LegendItem[] {
    const graph = sankeyGraphOf(ctx.opts);
    const colors = sankeyNodeColors(graph, ctx.theme);
    // Nodes, in reading order, non-toggleable (identity never rides on color).
    return sankeyNodeSequence(graph).map((ni) => {
      const node = graph.nodes[ni];
      return {
        id: `node:${node?.id ?? ni}`,
        name: node?.label ?? String(ni),
        color: colors[ni] ?? ctx.theme.series[0] ?? '#888888',
        visible: true,
        toggleable: false,
      };
    });
  },

  a11yTable(ctx): A11yTableSpec {
    const graph = sankeyGraphOf(ctx.opts);
    const rows: A11yTableSpec['rows'] = sankeyReadingOrder(graph).map((e) =>
      e.kind === 'node'
        ? { header: e.node.label, cells: ['—', '—', formatValue(e.node.value)] }
        : {
            // Links are indented under their source node (treemap convention).
            header: `  ${e.source.label} → ${e.target.label}`,
            cells: [e.source.label, e.target.label, formatValue(e.link.value)],
          },
    );
    return { columns: ['Node / link', 'Source', 'Target', 'Value'], rows };
  },

  /** A flow diagram is nodes, links and a total, not "1 series and 5 points". */
  a11ySummary(ctx): string | null {
    const graph = sankeyGraphOf(ctx.opts);
    if (!graph) return null;
    const nodes = graph.nodes.length;
    const links = graph.links.length;
    const layers = graph.layers.length;
    const total = graph.links.reduce((a, l) => a + (Number.isFinite(l.value) ? l.value : 0), 0);
    return (
      `${nodes} ${nodes === 1 ? 'node' : 'nodes'} in ${layers} ${layers === 1 ? 'stage' : 'stages'}, ` +
      `${links} ${links === 1 ? 'link' : 'links'}, total flow ${formatValue(total)}`
    );
  },

  keyboardNav(model): NavContext {
    // One flat sequence: each node, then that node's links.
    const si = model.series.findIndex((s) => s.visible);
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
    const nodeCount = extra.graph.nodes.length;
    if (entry.kind === 'node') {
      const rank = extra.graph.layers.flat().indexOf(entry.node.index) + 1;
      return (
        `${entry.node.label}: ${formatValue(entry.node.inValue)} in, ${formatValue(entry.node.outValue)} out. ` +
        `Node ${rank} of ${nodeCount}, layer ${entry.node.layer + 1} of ${extra.graph.layers.length}.`
      );
    }
    const share = formatShare(entry.link.value, entry.source.outValue);
    const siblings = entry.source.outgoing.length;
    const k = entry.source.outgoing.indexOf(entry.link.index) + 1;
    return (
      `${entry.source.label} to ${entry.target.label}: ${formatValue(entry.link.value)}, ${share} of ` +
      `${entry.source.label}. Link ${k} of ${siblings}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const extra = extraOf(ctx.geom);
    const entry = extra?.entries[hit.pi];
    const series = ctx.model.series[hit.si];
    if (!extra || !entry || !series) return [];
    const label = entryLabel(entry);
    if (entry.kind === 'node') {
      return [
        {
          seriesId: series.id,
          seriesName: series.name,
          color: extra.colors[entry.node.index] ?? ctx.theme.series[0] ?? '#888888',
          x: label,
          y: entry.node.value,
          formattedX: label,
          formattedY: `${formatValue(entry.node.inValue)} in · ${formatValue(entry.node.outValue)} out`,
        },
      ];
    }
    return [
      {
        seriesId: series.id,
        seriesName: series.name,
        color: extra.colors[entry.link.source] ?? ctx.theme.series[0] ?? '#888888',
        x: label,
        y: entry.link.value,
        formattedX: label,
        formattedY: `${formatValue(entry.link.value)} (${formatShare(entry.link.value, entry.source.outValue)} of ${
          entry.source.label
        })`,
      },
    ];
  },
};
