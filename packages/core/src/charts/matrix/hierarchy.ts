/**
 * Hierarchy helpers shared by treemap & sunburst (TreeNode input).
 *
 * Coloring rules (contract "Dataviz rules"): top-level nodes take the
 * categorical palette slots IN ORDER; descendants take lightness steps of
 * the parent hue by interpolating the parent color toward the theme surface
 * color — never new palette slots — with the step reversed rather than allowed
 * to fade into the surface (`childColor`). Values: a parent's value is the sum of
 * its children (an explicit `value` on a parent with children is ignored,
 * per the contract).
 *
 * Flattening is depth-first (parent before children, siblings in input
 * order): `flatIndex` walks every node, `leafIndex` walks leaves only.
 * These orders back keyboard navigation and the a11y table.
 */
import type { Theme, TreeNode } from '../../types';
import type { DataModel } from '../../model';
import { contrastInk, contrastRatio, mixHex } from './color-scale';
import { formatValue } from '../../util';

/** Max mix fraction toward the surface for the last sibling of a brood. */
export const CHILD_MIX_MAX = 0.5;
/**
 * Contrast floor every hierarchy fill must clear against the theme surface.
 *
 * These cells are large area fills separated by 2px SURFACE-COLOURED gaps: as a
 * fill approaches the surface, the gap stops reading as a boundary and the cell
 * stops existing as a shape. 2:1 is the contract's ordinal-ramp floor, and it is
 * the right one here — every cell carries a direct label or a tooltip, so the
 * relief the palette rules ask for is present.
 */
export const CHILD_MIN_CONTRAST = 2;
/** Path segments are joined "A / B" per the contract's tooltip examples. */
export const PATH_SEPARATOR = ' / ';

/**
 * Fill for a child node: a lightness step of the parent hue, CLAMPED so it can
 * never fade into the surface (quality audit E-2).
 *
 * The step is computed exactly as before — mix the parent colour toward the
 * surface by `t` — and used verbatim whenever it clears `CHILD_MIN_CONTRAST`.
 * That is every step of every hue except the ones that were the defect, so no
 * hierarchy chart that was legible changes at all.
 *
 * When the step WOULD fall below the floor, the direction flips: the child mixes
 * AWAY from the surface by the same `t` instead. Slot 4 (`#eda100`) measures
 * 2.11:1 on the light surface, so it has essentially no headroom to lighten —
 * globally lowering `CHILD_MIX_MAX` to buy it that headroom would dull every
 * other hue to fix one, and would still leave slot 4 with steps too small to
 * see. Flipping keeps the full step size, so DEPTH STAYS LEGIBLE: a yellow
 * hierarchy alternates lighter/darker by depth instead of dissolving into the
 * page. The next depth starts from a colour with headroom again, so the
 * direction alternates naturally rather than sticking.
 *
 * The trailing loop is the guarantee, not the mechanism: a custom theme whose
 * slot already sits below the floor (or an explicit node colour used as a
 * parent) is walked further toward the pole until the floor is met.
 */
export function childColor(parentColor: string, surface: string, t: number): string {
  const toward = mixHex(parentColor, surface, t);
  if (contrastRatio(toward, surface) >= CHILD_MIN_CONTRAST) return toward;
  // `contrastInk` IS the away pole: near-black for a light surface, white for a
  // dark one. Mixing toward it can only move luminance away from the surface.
  const pole = contrastInk(surface);
  let away = mixHex(parentColor, pole, t);
  for (let k = 1; k <= 8 && contrastRatio(away, surface) < CHILD_MIN_CONTRAST; k++) {
    away = mixHex(parentColor, pole, Math.min(1, t + k * 0.125));
  }
  return away;
}

export interface HierarchyNode {
  label: string;
  /** Own value for leaves; sum of children for internal nodes. Never < 0. */
  value: number;
  /** 0 = top-level. */
  depth: number;
  /** Index of the top-level ancestor (palette slot). */
  topIndex: number;
  parent: HierarchyNode | null;
  children: HierarchyNode[];
  /** Resolved fill color (palette slot or lightness step of parent hue). */
  color: string;
  /** "A / B / C". */
  path: string;
  /** Depth-first index over ALL nodes. */
  flatIndex: number;
  /** Depth-first index over leaves; -1 for internal nodes. */
  leafIndex: number;
}

export interface Hierarchy {
  roots: HierarchyNode[];
  /** All nodes in depth-first order (indexable by flatIndex). */
  nodes: HierarchyNode[];
  /** Leaves in depth-first order (indexable by leafIndex). */
  leaves: HierarchyNode[];
  /** Grand total = sum of root values. */
  total: number;
  /** Deepest depth present (0 when only top-level nodes exist). */
  maxDepth: number;
}

/** A node's value: sum of children when present, else its own value (>= 0). */
export function nodeValue(n: TreeNode): number {
  if (n.children && n.children.length > 0) {
    return n.children.reduce((acc, c) => acc + nodeValue(c), 0);
  }
  return typeof n.value === 'number' && Number.isFinite(n.value) && n.value > 0 ? n.value : 0;
}

/** Build the flattened, colored hierarchy from TreeNode roots. */
export function buildHierarchy(rootsIn: readonly TreeNode[], theme: Theme): Hierarchy {
  const nodes: HierarchyNode[] = [];
  const leaves: HierarchyNode[] = [];
  let maxDepth = 0;

  const walk = (
    n: TreeNode,
    parent: HierarchyNode | null,
    depth: number,
    siblingIndex: number,
    siblingCount: number,
    topIndex: number,
  ): HierarchyNode => {
    const paletteColor =
      parent === null
        ? (theme.series[topIndex % theme.series.length] ?? '#888888')
        : childColor(parent.color, theme.surface, ((siblingIndex + 1) / (siblingCount + 1)) * CHILD_MIX_MAX);
    const node: HierarchyNode = {
      label: n.label,
      value: nodeValue(n),
      depth,
      topIndex,
      parent,
      children: [],
      color: n.color ?? paletteColor,
      path: parent === null ? n.label : parent.path + PATH_SEPARATOR + n.label,
      flatIndex: nodes.length,
      leafIndex: -1,
    };
    nodes.push(node);
    if (depth > maxDepth) maxDepth = depth;
    const kids = n.children ?? [];
    if (kids.length > 0) {
      node.children = kids.map((c, j) => walk(c, node, depth + 1, j, kids.length, topIndex));
    } else {
      node.leafIndex = leaves.length;
      leaves.push(node);
    }
    return node;
  };

  const roots = rootsIn.map((r, i) => walk(r, null, 0, i, rootsIn.length, i));
  const total = roots.reduce((acc, r) => acc + r.value, 0);
  return { roots, nodes, leaves, total, maxDepth };
}

/**
 * Extract TreeNode roots for the first visible series.
 *
 * Values must come from the RAW options data: the generic normalizer maps
 * object data through `DataPoint.y`, so a `TreeNode.value` on a top-level
 * node is not carried into the model. `rawData` is
 * `opts.data.series[si].data`; `model` supplies visibility and category
 * labels (tolerated fallback for plain-number data).
 */
export function treeRoots(model: DataModel, rawSeriesData: readonly (readonly unknown[])[]): {
  roots: TreeNode[];
  si: number;
} {
  const si = model.series.findIndex((s) => s.visible);
  if (si < 0) return { roots: [], si: -1 };
  const raw = rawSeriesData[si] ?? [];
  const roots: TreeNode[] = [];
  raw.forEach((d, i) => {
    if (d === null || d === undefined) return;
    if (typeof d === 'number') {
      // Tolerated flat shape: numbers against categories.
      const cat = model.categories?.[i];
      roots.push({ label: cat !== undefined ? formatValue(cat) : String(i + 1), value: d });
      return;
    }
    if (typeof d === 'object' && !Array.isArray(d)) {
      const o = d as { label?: string; value?: number; y?: number | null; x?: unknown; color?: string; children?: TreeNode[] };
      const label =
        o.label ?? (typeof o.x === 'string' ? o.x : model.categories?.[i] !== undefined ? formatValue(model.categories[i] ?? null) : String(i + 1));
      const node: TreeNode = { label };
      const value = o.value ?? (typeof o.y === 'number' ? o.y : undefined);
      if (value !== undefined) node.value = value;
      if (o.color !== undefined) node.color = o.color;
      if (o.children !== undefined) node.children = o.children;
      roots.push(node);
    }
  });
  return { roots, si };
}

/** Structural leaf count (depth-first) from normalized points' `children`. */
export function countTreeLeaves(points: readonly { children?: TreeNode[] }[]): number {
  const countIn = (nodes: readonly TreeNode[]): number =>
    nodes.reduce((acc, n) => acc + (n.children && n.children.length > 0 ? countIn(n.children) : 1), 0);
  return points.reduce((acc, p) => acc + (p.children && p.children.length > 0 ? countIn(p.children) : 1), 0);
}

/** Structural total node count (all depths) from normalized points. */
export function countTreeNodes(points: readonly { children?: TreeNode[] }[]): number {
  const countIn = (nodes: readonly TreeNode[]): number =>
    nodes.reduce((acc, n) => acc + 1 + (n.children ? countIn(n.children) : 0), 0);
  return points.reduce((acc, p) => acc + 1 + (p.children ? countIn(p.children) : 0), 0);
}

/** Share of the grand total, formatted "12.5%". */
export function formatShare(value: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (value / total) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded}%`;
}

/** A11y table rows: indented label + value + share, depth-first. */
export function hierarchyTableRows(h: Hierarchy): { header: string; cells: string[] }[] {
  return h.nodes.map((n) => ({
    header: `${'  '.repeat(n.depth)}${n.label}`,
    cells: [formatValue(n.value), formatShare(n.value, h.total)],
  }));
}

/**
 * Accessible-name clause for the four hierarchy types (treemap, sunburst,
 * icicle, circle-packing), which all build the same `Hierarchy`.
 *
 * A hierarchy's marks are NESTED NODES, so the generic "N series and M points"
 * clause described the wrong thing at the wrong depth: it reported the
 * top-level count while the chart drew every leaf and the data table listed
 * every node. Depth and total are what a reader needs before deciding whether
 * to walk a 400-row indented table.
 */
export function hierarchyAriaSummary(h: Hierarchy): string | null {
  if (h.nodes.length === 0) return 'no data';
  const roots = h.roots.length;
  const leaves = h.leaves.length;
  const depth = h.maxDepth + 1;
  return (
    `${roots} top-level ${roots === 1 ? 'group' : 'groups'}, ${leaves} ${leaves === 1 ? 'leaf' : 'leaves'}, ` +
    `${depth} ${depth === 1 ? 'level' : 'levels'} deep, total ${formatValue(h.total)}`
  );
}
