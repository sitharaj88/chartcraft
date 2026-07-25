/**
 * Circle-pack chart-type definition (v0.3 contract).
 *
 * `TreeNode[]` input, same palette rules as treemap (top-level nodes take the
 * categorical slots IN ORDER, descendants are lightness steps of the parent
 * hue — never a new hue). Enclosing-circle packing: siblings are packed
 * overlap-free with a front-chain algorithm and each parent takes the
 * SMALLEST ENCLOSING CIRCLE of its children (Welzl, seeded shuffle). All of
 * that math is pure and lives in ./pack.ts; it is deterministic by
 * construction — no `Math.random()`.
 *
 * Rendering per the contract: **leaves filled, parent circles hairline-outlined
 * only** (1px, in the parent's own resolved color, so the outline obeys the
 * same palette rules as a fill and nesting stays readable). Leaf labels are
 * drawn only when the whole term fits the chord at the label's height —
 * circles have no good ellipsis story, so an over-long label is dropped
 * instead of truncated (direct labels are selective, not exhaustive).
 *
 * Value maps to AREA (`r = sqrt(value)`), never to radius.
 *
 * Keyboard navigation walks ALL nodes depth-first (parents are drawn marks
 * too); a11y table = indented label + value + share, exactly as icicle.
 */
import type { TooltipPoint } from '../../types';
import type { PointPos, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { ChartTypeDefinition } from '../registry';
import { formatValue } from '../../util';
import { contrastInk } from '../matrix/color-scale';
import {
  countTreeNodes,
  formatShare,
  hierarchyAriaSummary,
  hierarchyTableRows,
  type Hierarchy,
  type HierarchyNode,
} from '../matrix/hierarchy';
import {
  buildHierarchyFor,
  hierarchyLegendPolicy,
  topLevelLegendItems,
} from './shared';
import { computeCirclePack, type Circle } from './pack';

/** Hairline width for parent outlines. */
export const PACK_HAIRLINE = 1;

export interface PackCell {
  node: HierarchyNode;
  circle: Circle;
  /** Leaf label, or null when it does not fit / the node is internal. */
  label: string | null;
  ink: string;
}

export interface CirclePackGeomExtra {
  hierarchy: Hierarchy;
  /** Indexed by `flatIndex` (depth-first over ALL nodes). */
  cells: PackCell[];
  /** MODEL index of the (single) visible series. */
  si: number;
}

/**
 * Horizontal room for a single line of text of height `textH`, centered in a
 * circle of radius `r`: the chord at ±textH/2, less a 2px breathing pad.
 * Returns 0 when the text is taller than the circle.
 */
export function circleLabelWidth(r: number, textH: number): number {
  const half = textH / 2;
  if (r <= half) return 0;
  return Math.max(0, 2 * Math.sqrt(r * r - half * half) - 2);
}

function extraOf(geom: TypeGeom): CirclePackGeomExtra | null {
  return (geom.extra as CirclePackGeomExtra | undefined) ?? null;
}

export const circlepackDefinition: ChartTypeDefinition = {
  id: 'circlepack',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    hierarchyLegendPolicy(resolved, raw);
  },

  layout(ctx): TypeGeom {
    const { h, si } = buildHierarchyFor(ctx);
    const pos: (PointPos | null)[][] = ctx.model.series.map(() => []);
    if (si < 0 || h.total <= 0) {
      return { pos, slices: null, bars: null, extra: { hierarchy: h, cells: [], si } };
    }

    const font = `${ctx.theme.fontSize}px ${ctx.theme.fontFamily}`;
    const circles = computeCirclePack(h, ctx.layout.plot);
    const cells: PackCell[] = h.nodes.map((node, i) => {
      const circle = circles[i] as Circle;
      let label: string | null = null;
      if (node.children.length === 0 && circle.r > 0) {
        const maxW = circleLabelWidth(circle.r, ctx.theme.fontSize);
        if (maxW > 0 && ctx.measure(node.label, font) <= maxW) label = node.label;
      }
      return { node, circle, label, ink: contrastInk(node.color) };
    });

    pos[si] = cells.map((c) => (c.circle.r > 0 ? { x: c.circle.x, y: c.circle.y, y0: c.circle.y } : null));

    return { pos, slices: null, bars: null, extra: { hierarchy: h, cells, si } };
  },

  render(ctx) {
    const { r, theme, hover } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra) return;
    const font = `${theme.fontSize}px ${theme.fontFamily}`;

    // Parents first (outlines sit under their children), then leaves.
    extra.cells.forEach((cell, i) => {
      if (cell.circle.r <= 0 || cell.node.children.length === 0) return;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === i;
      r.circle(cell.circle.x, cell.circle.y, cell.circle.r, {
        stroke: {
          color: hovered ? theme.textPrimary : cell.node.color,
          width: PACK_HAIRLINE,
        },
      });
    });

    extra.cells.forEach((cell, i) => {
      if (cell.circle.r <= 0 || cell.node.children.length > 0) return;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === i;
      const dimmed = hover !== null && hover.si === extra.si && !hovered;
      r.circle(cell.circle.x, cell.circle.y, cell.circle.r, {
        fill: cell.node.color,
        alpha: dimmed ? 0.75 : 1,
        ...(hovered ? { stroke: { color: theme.textPrimary, width: 1 } } : {}),
      });
      if (cell.label) {
        // Ink contrast against the leaf fill, never the mark color.
        r.text(cell.label, cell.circle.x, cell.circle.y, {
          font,
          color: cell.ink,
          align: 'center',
          baseline: 'middle',
        });
      }
    });
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    // Deepest (and, at equal depth, smallest) containing circle wins, so a
    // leaf is always preferred over the parent that encloses it.
    let best = -1;
    let bestDepth = -1;
    let bestR = Infinity;
    extra.cells.forEach((cell, i) => {
      const { circle } = cell;
      if (circle.r <= 0) return;
      const dx = px - circle.x;
      const dy = py - circle.y;
      if (dx * dx + dy * dy > circle.r * circle.r) return;
      if (cell.node.depth > bestDepth || (cell.node.depth === bestDepth && circle.r < bestR)) {
        best = i;
        bestDepth = cell.node.depth;
        bestR = circle.r;
      }
    });
    return best < 0 ? null : { si: extra.si, pi: best };
  },

  legendItems(ctx) {
    return topLevelLegendItems(buildHierarchyFor(ctx).h);
  },

  a11yTable(ctx): A11yTableSpec {
    return { columns: ['Node', 'Value', 'Share'], rows: hierarchyTableRows(buildHierarchyFor(ctx).h) };
  },

  /** Nested nodes, not "points" — see `hierarchyAriaSummary`. */
  a11ySummary(ctx): string | null {
    return hierarchyAriaSummary(buildHierarchyFor(ctx).h);
  },

  keyboardNav(model) {
    // Depth-first over ALL nodes: pi = flatIndex.
    const si = model.series.findIndex((s) => s.visible);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si && si >= 0 ? countTreeNodes(model.series[i]?.points ?? []) : 0),
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const node = extra?.hierarchy.nodes[pos.pi];
    if (!extra || !node) return null;
    const kind = node.children.length > 0 ? 'Group' : 'Circle';
    return `${node.path}: ${formatValue(node.value)} (${formatShare(
      node.value,
      extra.hierarchy.total,
    )}). ${kind} ${pos.pi + 1} of ${extra.hierarchy.nodes.length}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const extra = extraOf(ctx.geom);
    const node = extra?.hierarchy.nodes[hit.pi];
    const series = ctx.model.series[hit.si];
    if (!extra || !node || !series) return [];
    return [
      {
        seriesId: series.id,
        seriesName: series.name,
        color: node.color,
        x: node.path,
        y: node.value,
        formattedX: node.path,
        formattedY: `${formatValue(node.value)} (${formatShare(node.value, extra.hierarchy.total)})`,
      },
    ];
  },
};
