/**
 * Treemap chart-type definition (v0.2 contract).
 *
 * One series, `data: TreeNode[]`. Squarified layout (Bruls et al.) — the
 * pure `squarify()` lives in ./squarify.ts. Top-level nodes take the
 * categorical palette slots in order; descendants take lightness steps of
 * the parent hue (mix toward surface — never new palette slots). Leaves
 * tile their parent recursively with 2px surface gaps. Cells that fit get a
 * direct label in a contrasting ink (ellipsized; skipped when too small).
 * Legend = top-level nodes, non-toggleable. Keyboard navigation walks
 * LEAVES depth-first. A11y table = indented label + value + share.
 * Tooltip = path ("A / B") + value.
 */
import type { TooltipPoint } from '../../types';
import type { Rect, TypeGeom, PointPos } from '../../layout';
import type { ChartTypeDefinition, DefinitionContext } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import { formatValue } from '../../util';
import { squarify } from './squarify';
import { contrastInk } from './color-scale';
import {
  buildHierarchy,
  countTreeLeaves,
  hierarchyTableRows,
  treeRoots,
  formatShare,
  type Hierarchy,
  type HierarchyNode,
} from './hierarchy';

/** 2px surface gap between cells (contract) — each cell insets by 1px. */
export const TREEMAP_CELL_GAP = 2;
const LABEL_PAD = 4;

export interface TreemapCell {
  node: HierarchyNode;
  /** Inset cell rect (gap already applied). */
  rect: Rect;
  /** Direct label (already ellipsized) or null when the cell is too small. */
  label: string | null;
  ink: string;
}

export interface TreemapGeomExtra {
  hierarchy: Hierarchy;
  /** Indexed by leafIndex. */
  cells: TreemapCell[];
  /** MODEL index of the (single) visible series. */
  si: number;
}

/**
 * Recursive squarified layout: leaf rects (indexed by leafIndex) tiling
 * `rect`; every internal node's children subdivide its own rect.
 */
export function computeTreemapLeafRects(h: Hierarchy, rect: Rect): Rect[] {
  const out: Rect[] = new Array(h.leaves.length).fill(null as unknown as Rect);
  const place = (nodes: readonly HierarchyNode[], r: Rect): void => {
    const rects = squarify(nodes.map((n) => n.value), r);
    nodes.forEach((n, i) => {
      const nr = rects[i] as Rect;
      if (n.children.length > 0) place(n.children, nr);
      else out[n.leafIndex] = nr;
    });
  };
  place(h.roots, rect);
  return out;
}

/** Ellipsize `text` to fit `maxW` (measured); null when nothing fits. */
export function fitLabel(text: string, maxW: number, measure: (t: string) => number): string | null {
  if (maxW <= 0) return null;
  if (measure(text) <= maxW) return text;
  for (let n = text.length - 1; n >= 1; n--) {
    const t = `${text.slice(0, n).trimEnd()}…`;
    if (measure(t) <= maxW) return t;
  }
  return null;
}

function insetRect(r: Rect, by: number): Rect {
  return {
    x: r.x + by,
    y: r.y + by,
    w: Math.max(0, r.w - by * 2),
    h: Math.max(0, r.h - by * 2),
  };
}

function extraOf(geom: TypeGeom): TreemapGeomExtra | null {
  return (geom.extra as TreemapGeomExtra | undefined) ?? null;
}

function legendFromRoots(h: Hierarchy): LegendItem[] {
  // Top-level nodes, non-toggleable (identity never rides on color alone).
  return h.roots.map((n, i) => ({
    id: `node:${i}`,
    name: n.label,
    color: n.color,
    visible: true,
    toggleable: false,
  }));
}

/** Shared legend-auto policy for hierarchies: keys off top-level node count. */
export function hierarchyResolveOptions(
  resolved: { legend: { show: boolean } },
  raw: { legend?: boolean | { show?: boolean }; data?: { series?: { data?: readonly unknown[] }[] } },
): void {
  const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
  if (rawShow !== undefined) return;
  const topCount = (raw.data?.series?.[0]?.data ?? []).filter((d) => d !== null && d !== undefined).length;
  resolved.legend.show = topCount >= 2;
}

/** Build the hierarchy for a pipeline context (raw data + model + theme). */
export function buildFor(ctx: Pick<DefinitionContext, 'model' | 'opts' | 'theme'>): {
  h: Hierarchy;
  si: number;
} {
  const { roots, si } = treeRoots(ctx.model, ctx.opts.data.series.map((s) => s.data));
  return { h: buildHierarchy(roots, ctx.theme), si };
}

export const treemapDefinition: ChartTypeDefinition = {
  id: 'treemap',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    hierarchyResolveOptions(resolved, raw);
  },

  layout(ctx): TypeGeom {
    const { h, si } = buildFor(ctx);
    const pos: (PointPos | null)[][] = ctx.model.series.map(() => []);
    if (si < 0 || h.total <= 0) {
      return { pos, slices: null, bars: null, extra: { hierarchy: h, cells: [], si } };
    }

    const font = `${ctx.theme.fontSize}px ${ctx.theme.fontFamily}`;
    const rects = computeTreemapLeafRects(h, ctx.layout.plot);
    const cells: TreemapCell[] = h.leaves.map((node, li) => {
      const raw = rects[li] as Rect;
      const rect = insetRect(raw, TREEMAP_CELL_GAP / 2);
      let label: string | null = null;
      if (rect.h >= ctx.theme.fontSize + LABEL_PAD * 2 && rect.w >= LABEL_PAD * 2 + 8) {
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

    extra.cells.forEach((cell, li) => {
      const { rect } = cell;
      if (rect.w <= 0 || rect.h <= 0) return;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === li;
      const dimmed = hover !== null && hover.si === extra.si && !hovered;
      r.rect(rect.x, rect.y, rect.w, rect.h, {
        fill: cell.node.color,
        alpha: dimmed ? 0.75 : 1,
        ...(hovered ? { stroke: { color: theme.textPrimary, width: 1 } } : {}),
      });
      if (cell.label) {
        r.text(cell.label, rect.x + LABEL_PAD, rect.y + LABEL_PAD, {
          font,
          color: cell.ink,
          baseline: 'top',
        });
      }
    });
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    for (let li = 0; li < extra.cells.length; li++) {
      const { rect } = extra.cells[li] as TreemapCell;
      if (rect.w <= 0 || rect.h <= 0) continue;
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
        return { si: extra.si, pi: li };
      }
    }
    return null;
  },

  legendItems(ctx) {
    return legendFromRoots(buildFor(ctx).h);
  },

  a11yTable(ctx): A11yTableSpec {
    // Indented label + value + share, depth-first (contract).
    return { columns: ['Node', 'Value', 'Share'], rows: hierarchyTableRows(buildFor(ctx).h) };
  },

  keyboardNav(model) {
    // Leaf-level, depth-first: pi indexes the flattened leaf order.
    const si = model.series.findIndex((s) => s.visible);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si && si >= 0 ? countTreeLeaves(model.series[i]?.points ?? []) : 0),
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const node = extra?.hierarchy.leaves[pos.pi];
    if (!extra || !node) return null;
    return `${node.path}: ${formatValue(node.value)} (${formatShare(node.value, extra.hierarchy.total)}). Cell ${
      pos.pi + 1
    } of ${extra.hierarchy.leaves.length}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const extra = extraOf(ctx.geom);
    const node = extra?.hierarchy.leaves[hit.pi];
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
        formattedY: formatValue(node.value),
      },
    ];
  },
};
