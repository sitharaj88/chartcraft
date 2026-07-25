/**
 * Sunburst chart-type definition (v0.2 contract).
 *
 * Radial treemap over the same TreeNode input and coloring rules as the
 * treemap: depth = ring (top-level nodes on the innermost ring, deeper
 * levels outward), angular extent proportional to value within the parent,
 * 2px surface gaps between sectors, donut hole in the middle showing the
 * root total in textPrimary. Legend = top-level nodes, non-toggleable.
 * Keyboard navigation walks ALL nodes depth-first (every node is a visible
 * arc). A11y table = indented label + value + share. Tooltip = path,
 * value, share.
 */
import type { TooltipPoint } from '../../types';
import type { PieSlice, Rect, TypeGeom, PointPos } from '../../layout';
import type { ChartTypeDefinition } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import { sliceAt } from '../../interaction/hittest';
import { formatValue } from '../../util';
import {
  countTreeNodes,
  formatShare,
  hierarchyTableRows,
  type Hierarchy,
  type HierarchyNode,
} from './hierarchy';
import { buildFor, hierarchyResolveOptions } from './treemap';

/** 2px surface gap between sectors (contract). */
export const SUNBURST_GAP = 2;
/**
 * 12 o'clock start, matching pie's START_ANGLE. Defined locally (same
 * value) — importing it from ../pie would create an ESM cycle
 * (matrix -> pie -> model -> charts/index -> pie) when the matrix module
 * is the first one loaded.
 */
export const SUNBURST_START_ANGLE = -Math.PI / 2;
/** Donut hole radius as a fraction of the outer radius. */
export const SUNBURST_HOLE_RATIO = 0.25;

export interface SunburstGeomExtra {
  hierarchy: Hierarchy;
  /** MODEL index of the (single) visible series. */
  si: number;
  cx: number;
  cy: number;
  holeR: number;
}

/**
 * Pure angular/radial layout. Returns one PieSlice per node, in depth-first
 * order (`slice.pi` = the node's flatIndex, which equals its array index).
 * Top-level nodes split the full circle from START_ANGLE in proportion to
 * value/total; children split their parent's span in proportion to value
 * within the parent. Ring: r0 = hole + depth * ringW.
 */
export function computeSunburstSlices(h: Hierarchy, plot: Rect): PieSlice[] {
  const out: PieSlice[] = [];
  if (h.total <= 0) return out;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.max(4, Math.min(plot.w, plot.h) / 2 - 4);
  const holeR = R * SUNBURST_HOLE_RATIO;
  const ringW = (R - holeR) / (h.maxDepth + 1);

  const walk = (node: HierarchyNode, a0: number, a1: number): void => {
    out.push({
      pi: node.flatIndex,
      a0,
      a1,
      cx,
      cy,
      r0: holeR + node.depth * ringW,
      r1: holeR + (node.depth + 1) * ringW,
      color: node.color,
      label: node.label,
      value: node.value,
    });
    if (node.children.length > 0 && node.value > 0) {
      let a = a0;
      for (const c of node.children) {
        const sweep = ((a1 - a0) * c.value) / node.value;
        walk(c, a, a + sweep);
        a += sweep;
      }
    }
  };

  let a = SUNBURST_START_ANGLE;
  for (const root of h.roots) {
    const sweep = (Math.PI * 2 * root.value) / h.total;
    walk(root, a, a + sweep);
    a += sweep;
  }
  return out;
}

function extraOf(geom: TypeGeom): SunburstGeomExtra | null {
  return (geom.extra as SunburstGeomExtra | undefined) ?? null;
}

export const sunburstDefinition: ChartTypeDefinition = {
  id: 'sunburst',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    hierarchyResolveOptions(resolved, raw);
  },

  layout(ctx): TypeGeom {
    const { h, si } = buildFor(ctx);
    const pos: (PointPos | null)[][] = ctx.model.series.map(() => []);
    const plot = ctx.layout.plot;
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    const holeR = Math.max(4, Math.min(plot.w, plot.h) / 2 - 4) * SUNBURST_HOLE_RATIO;
    const extra: SunburstGeomExtra = { hierarchy: h, si, cx, cy, holeR };
    if (si < 0 || h.total <= 0) return { pos, slices: [], bars: null, extra };

    const slices = computeSunburstSlices(h, plot);
    // Keyboard/tooltip anchors at arc centroids, indexed by flatIndex.
    pos[si] = slices.map((s) => {
      if (s.a1 - s.a0 <= 0) return null;
      const mid = (s.a0 + s.a1) / 2;
      const rm = (s.r0 + s.r1) / 2;
      return { x: s.cx + Math.cos(mid) * rm, y: s.cy + Math.sin(mid) * rm, y0: s.cy };
    });
    return { pos, slices, bars: null, extra };
  },

  render(ctx) {
    const { r, theme, geom, hover } = ctx;
    const extra = extraOf(geom);
    const slices = geom.slices;
    if (!extra || !slices) return;

    for (const s of slices) {
      if (s.a1 - s.a0 <= 1e-9) continue;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === s.pi;
      const dimmed = hover !== null && hover.si === extra.si && !hovered;
      r.sector(s.cx, s.cy, s.r0, s.r1, s.a0, s.a1, {
        fill: s.color,
        stroke: { color: theme.surface, width: SUNBURST_GAP },
        alpha: dimmed ? 0.7 : 1,
      });
    }

    // Donut hole: root total in textPrimary.
    r.text(formatValue(extra.hierarchy.total), extra.cx, extra.cy, {
      font: `600 ${theme.fontSize + 2}px ${theme.fontFamily}`,
      color: theme.textPrimary,
      align: 'center',
      baseline: 'middle',
    });
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    const slices = ctx.geom.slices;
    if (!extra || extra.si < 0 || !slices) return null;
    const hit = sliceAt(
      slices.filter((s) => s.a1 - s.a0 > 1e-9),
      px,
      py,
    );
    return hit ? { si: extra.si, pi: hit.pi } : null;
  },

  legendItems(ctx) {
    // Top-level nodes, non-toggleable (same rule as treemap).
    return buildFor(ctx).h.roots.map((n, i) => ({
      id: `node:${i}`,
      name: n.label,
      color: n.color,
      visible: true,
      toggleable: false,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    return { columns: ['Node', 'Value', 'Share'], rows: hierarchyTableRows(buildFor(ctx).h) };
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
    return `${node.path}: ${formatValue(node.value)} (${formatShare(node.value, extra.hierarchy.total)}). Node ${
      pos.pi + 1
    } of ${extra.hierarchy.nodes.length}.`;
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
