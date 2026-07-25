/**
 * Icicle chart-type definition (v0.3 contract).
 *
 * `TreeNode[]` input, exactly as treemap. Rectangular partition:
 *
 * - **depth = row**, roots in the TOP row, each level a full-height band of
 *   `plot.h / (maxDepth + 1)`;
 * - **width proportional to value within the parent**: roots split `plot.w` by
 *   `value / total`, a node's children split ITS width by `value / node.value`
 *   (a parent's value is the sum of its children, so children exactly fill
 *   their parent's span — no rounding drift);
 * - the same palette rules as treemap: top-level nodes take the categorical
 *   slots IN ORDER, descendants are lightness steps of the parent hue
 *   (`../matrix/hierarchy` owns both rules);
 * - 2px surface gaps (every cell insets by 1px on each side);
 * - direct labels in contrast ink, MEASURED and ellipsized, skipped entirely
 *   when the cell is too small (selective, never exhaustive);
 * - keyboard navigation walks ALL nodes depth-first (every node is a drawn
 *   cell, unlike treemap where only leaves are);
 * - a11y table = indented label + value + share.
 */
import type { TooltipPoint } from '../../types';
import type { PointPos, Rect, TypeGeom } from '../../layout';
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
  HIERARCHY_GAP,
  LABEL_PAD,
  buildHierarchyFor,
  fitLabel,
  hierarchyLegendPolicy,
  insetRect,
  rectContains,
  topLevelLegendItems,
} from './shared';

/** 2px surface gap between cells (contract). */
export const ICICLE_CELL_GAP = HIERARCHY_GAP;

export interface IcicleCell {
  node: HierarchyNode;
  /** Inset cell rect (gap already applied). */
  rect: Rect;
  /** Direct label (already ellipsized) or null when the cell is too small. */
  label: string | null;
  ink: string;
}

export interface IcicleGeomExtra {
  hierarchy: Hierarchy;
  /** Indexed by `flatIndex` (depth-first over ALL nodes). */
  cells: IcicleCell[];
  /** MODEL index of the (single) visible series. */
  si: number;
}

const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Pure partition layout: one rect per node, indexed by `flatIndex`.
 *
 * Row height is uniform (`plot.h / (maxDepth + 1)`) so depth reads as a row;
 * widths are exactly proportional to value within the parent. Nodes under a
 * zero-valued parent collapse to zero width (never NaN).
 */
export function computeIcicleRects(h: Hierarchy, plot: Rect): Rect[] {
  const out: Rect[] = new Array(h.nodes.length).fill(ZERO_RECT);
  if (h.nodes.length === 0) return out;
  const rows = h.maxDepth + 1;
  const rowH = plot.h / rows;

  const walk = (node: HierarchyNode, x: number, w: number): void => {
    out[node.flatIndex] = { x, y: plot.y + node.depth * rowH, w, h: rowH };
    if (node.children.length === 0) return;
    const denom = node.value;
    let cx = x;
    for (const child of node.children) {
      const cw = denom > 0 ? (w * child.value) / denom : 0;
      walk(child, cx, cw);
      cx += cw;
    }
  };

  let x = plot.x;
  for (const root of h.roots) {
    const w = h.total > 0 ? (plot.w * root.value) / h.total : 0;
    walk(root, x, w);
    x += w;
  }
  return out;
}

function extraOf(geom: TypeGeom): IcicleGeomExtra | null {
  return (geom.extra as IcicleGeomExtra | undefined) ?? null;
}

export const icicleDefinition: ChartTypeDefinition = {
  id: 'icicle',
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
    const rects = computeIcicleRects(h, ctx.layout.plot);
    const cells: IcicleCell[] = h.nodes.map((node, i) => {
      const rect = insetRect(rects[i] as Rect, ICICLE_CELL_GAP / 2);
      let label: string | null = null;
      // Selective labeling: only cells that can hold a line of type at all.
      if (rect.h >= ctx.theme.fontSize + 2 && rect.w >= LABEL_PAD * 2 + 8) {
        label = fitLabel(node.label, rect.w - LABEL_PAD * 2, (t) => ctx.measure(t, font));
      }
      return { node, rect, label, ink: contrastInk(node.color) };
    });

    pos[si] = cells.map((c) =>
      c.rect.w > 0 && c.rect.h > 0
        ? { x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2, y0: c.rect.y + c.rect.h / 2 }
        : null,
    );

    return { pos, slices: null, bars: null, extra: { hierarchy: h, cells, si } };
  },

  render(ctx) {
    const { r, theme, hover } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra) return;
    const font = `${theme.fontSize}px ${theme.fontFamily}`;

    extra.cells.forEach((cell, i) => {
      const { rect } = cell;
      if (rect.w <= 0 || rect.h <= 0) return;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === i;
      const dimmed = hover !== null && hover.si === extra.si && !hovered;
      r.rect(rect.x, rect.y, rect.w, rect.h, {
        fill: cell.node.color,
        alpha: dimmed ? 0.75 : 1,
        ...(hovered ? { stroke: { color: theme.textPrimary, width: 1 } } : {}),
      });
      if (cell.label) {
        // Ink contrast against the cell, never the mark color.
        r.text(cell.label, rect.x + LABEL_PAD, rect.y + rect.h / 2, {
          font,
          color: cell.ink,
          baseline: 'middle',
        });
      }
    });
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    // Rows are disjoint by depth, so at most one cell contains the pointer.
    for (let i = 0; i < extra.cells.length; i++) {
      const cell = extra.cells[i] as IcicleCell;
      if (rectContains(cell.rect, px, py)) return { si: extra.si, pi: i };
    }
    return null;
  },

  legendItems(ctx) {
    return topLevelLegendItems(buildHierarchyFor(ctx).h);
  },

  a11yTable(ctx): A11yTableSpec {
    // Indented label + value + share, depth-first (contract).
    return { columns: ['Node', 'Value', 'Share'], rows: hierarchyTableRows(buildHierarchyFor(ctx).h) };
  },

  /** Nested nodes, not "points" — see `hierarchyAriaSummary`. */
  a11ySummary(ctx): string | null {
    return hierarchyAriaSummary(buildHierarchyFor(ctx).h);
  },

  keyboardNav(model) {
    // Depth-first over ALL nodes: pi = flatIndex (every node is a cell).
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
    return `${node.path}: ${formatValue(node.value)} (${formatShare(node.value, extra.hierarchy.total)}). Row ${
      node.depth + 1
    }, node ${pos.pi + 1} of ${extra.hierarchy.nodes.length}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const extra = extraOf(ctx.geom);
    const node = extra?.hierarchy.nodes[hit.pi];
    const series = ctx.model.series[hit.si];
    if (!extra || !node || !series) return [];
    // Built manually: nested nodes have no backing normalized point.
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
