/**
 * Parallel coordinates (v0.3 contract).
 *
 * - One VERTICAL axis per dimension, each **independently scaled** and labeled
 *   at top and bottom with its own extremes — that independence is the whole
 *   point of the form, so no shared value domain and no `nice()` widening: the
 *   top/bottom labels are the true max/min of that dimension.
 * - Dimensions come from `parallel.axes`, else `data.categories`, else the
 *   1-based data index.
 * - Each series is a polyline across the axes at 0.7 alpha, 2px on
 *   hover/focus; other lines dim so the focused one reads.
 * - Axis NAME collisions are resolved deterministically: fit on one row ->
 *   stagger over two rows -> ellipsize to the slot width (see
 *   `parallelLabelLayout`).
 * - Axis BRUSHING (filtering lines by dragging on an axis) belongs to the
 *   cross-cutting zoom feature, not to this module. The seam is
 *   `geom.extra as ParallelFrame` + `parallelAxisAtX()`: a decorator can map a
 *   pointer x to a dimension and a pixel y back to a value with
 *   `parallelYToValue()`, without this type knowing brushing exists.
 */
import type { TooltipPoint } from '../../types';
import type { HoverState, PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont } from '../../layout';
import { seriesColor, type DataModel } from '../../model';
import type { ChartTypeDefinition, DefinitionContext, DefinitionLayoutContext } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import type { PathCmd } from '../../render/renderer';
import { formatValue } from '../../util';
import { hitRadius, nearestPoint } from '../../interaction/hittest';

export const PARALLEL_LINE_ALPHA = 0.7;
export const PARALLEL_LINE_WIDTH = 1;
/** Hover/focus emphasis (contract: "2px on hover/focus"). */
export const PARALLEL_HOVER_WIDTH = 2;
export const PARALLEL_DIM_ALPHA = 0.2;
/** Vertical gap between stacked label rows. */
export const PARALLEL_LABEL_GAP = 4;
/** Horizontal breathing room reserved inside a label slot. */
export const PARALLEL_LABEL_PAD = 4;
/** Vertex marker radius on hover/focus (>= 8px diameter). */
export const PARALLEL_VERTEX_RADIUS = 4;
/** Pointer distance (px) at which a polyline segment is hit. */
export const PARALLEL_SEGMENT_HIT = 6;

// ---------------------------------------------------------------------------
// Dimensions & scaling (pure)

/** Dimension names: `parallel.axes` > `categories` > 1-based index. */
export function parallelDimensionNames(
  axes: readonly string[] | undefined,
  categories: readonly (string | number | Date)[] | null,
  count: number,
): string[] {
  if (axes && axes.length > 0) return [...axes];
  if (categories && categories.length > 0) return categories.map((c) => formatValue(c));
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

/**
 * Independent extent of one dimension. Degenerate (single value or none)
 * widens by 0.5 either side so the axis stays usable.
 */
export function parallelExtent(values: readonly (number | null)[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

/** Axis x: dimension `i` of `n` sits at the center of its equal slot. */
export function parallelAxisX(i: number, n: number, plot: Rect): number {
  if (n <= 0) return plot.x + plot.w / 2;
  return plot.x + ((i + 0.5) * plot.w) / n;
}

/** Value -> pixel y on an independently scaled axis (max at the top). */
export function parallelValueToY(
  value: number,
  min: number,
  max: number,
  axisTop: number,
  axisBottom: number,
): number {
  const span = max - min;
  if (!(span > 0)) return (axisTop + axisBottom) / 2;
  return axisBottom - ((value - min) / span) * (axisBottom - axisTop);
}

/** Pixel y -> value (the inverse; the brushing seam needs it). */
export function parallelYToValue(
  y: number,
  min: number,
  max: number,
  axisTop: number,
  axisBottom: number,
): number {
  const h = axisBottom - axisTop;
  if (!(h > 0)) return min;
  return min + ((axisBottom - y) / h) * (max - min);
}

// ---------------------------------------------------------------------------
// Axis label collision handling (pure)

/** Trim `text` to fit `maxW`, appending an ellipsis when it must shorten. */
export function ellipsize(text: string, maxW: number, measure: (s: string) => number): string {
  if (measure(text) <= maxW) return text;
  const ell = '…';
  if (measure(ell) > maxW) return '';
  let out = '';
  for (const ch of text) {
    if (measure(out + ch + ell) > maxW) break;
    out += ch;
  }
  return out.length > 0 ? out + ell : ell;
}

export interface ParallelLabel {
  text: string;
  /** 0-based label row (staggering uses rows 0 and 1). */
  row: number;
}

export interface ParallelLabelLayout {
  labels: ParallelLabel[];
  /** How many rows the names occupy (1 or 2). */
  rows: number;
  strategy: 'fit' | 'stagger' | 'ellipsize';
}

/**
 * Deterministic collision strategy for the axis NAME row:
 * 1. every name fits its slot -> one row, verbatim;
 * 2. every name fits TWO slots -> stagger onto two rows (even/odd);
 * 3. otherwise -> ellipsize each name to its slot width, one row.
 */
export function parallelLabelLayout(
  names: readonly string[],
  slotW: number,
  measure: (s: string) => number,
): ParallelLabelLayout {
  const avail = Math.max(0, slotW - PARALLEL_LABEL_PAD);
  const widths = names.map((n) => measure(n));
  if (widths.every((w) => w <= avail)) {
    return { labels: names.map((text) => ({ text, row: 0 })), rows: 1, strategy: 'fit' };
  }
  if (names.length > 1 && widths.every((w) => w <= Math.max(0, slotW * 2 - PARALLEL_LABEL_PAD))) {
    return {
      labels: names.map((text, i) => ({ text, row: i % 2 })),
      rows: 2,
      strategy: 'stagger',
    };
  }
  return {
    labels: names.map((text) => ({ text: ellipsize(text, avail, measure), row: 0 })),
    rows: 1,
    strategy: 'ellipsize',
  };
}

// ---------------------------------------------------------------------------
// Frame

export interface ParallelDimension {
  index: number;
  /** Full dimension name (table, tooltip, announcements). */
  name: string;
  /** Painted label (possibly ellipsized). */
  label: string;
  labelRow: number;
  min: number;
  max: number;
  x: number;
}

export interface ParallelFrame {
  dims: ParallelDimension[];
  axisTop: number;
  axisBottom: number;
  /** Horizontal slot width per axis (plot.w / dimension count). */
  slotW: number;
  labelRows: number;
  labelStrategy: ParallelLabelLayout['strategy'];
  /** Baseline y for each name row, and for the max / min value labels. */
  nameRowY: number[];
  maxLabelY: number;
  minLabelY: number;
}

export function computeParallelFrame(args: {
  dims: readonly { name: string; min: number; max: number }[];
  plot: Rect;
  fontSize: number;
  measure(text: string): number;
}): ParallelFrame {
  const { dims, plot, fontSize } = args;
  const n = dims.length;
  const slotW = n > 0 ? plot.w / n : plot.w;
  const layout = parallelLabelLayout(
    dims.map((d) => d.name),
    slotW,
    args.measure,
  );
  const rowH = fontSize + PARALLEL_LABEL_GAP;
  // Top block: one row per name row + one row for the max label.
  const axisTop = plot.y + (layout.rows + 1) * rowH;
  // Bottom block: one row for the min label.
  const axisBottom = plot.y + plot.h - rowH;
  return {
    dims: dims.map((d, i) => ({
      index: i,
      name: d.name,
      label: layout.labels[i]?.text ?? d.name,
      labelRow: layout.labels[i]?.row ?? 0,
      min: d.min,
      max: d.max,
      x: parallelAxisX(i, n, plot),
    })),
    axisTop,
    axisBottom,
    slotW,
    labelRows: layout.rows,
    labelStrategy: layout.strategy,
    nameRowY: Array.from({ length: layout.rows }, (_, r) => plot.y + r * rowH),
    maxLabelY: plot.y + layout.rows * rowH,
    minLabelY: axisBottom + PARALLEL_LABEL_GAP,
  };
}

/**
 * Dimension index whose axis is within `tolerance` px of `px` (-1 for none).
 * Exposed as the axis-brushing seam for the zoom feature.
 */
export function parallelAxisAtX(frame: ParallelFrame, px: number, tolerance = hitRadius() / 2): number {
  let best = -1;
  let bestD = tolerance;
  for (const d of frame.dims) {
    const dist = Math.abs(d.x - px);
    if (dist <= bestD) {
      bestD = dist;
      best = d.index;
    }
  }
  return best;
}

/** Per-dimension extents over the VISIBLE series (independent scaling). */
export function parallelDimensions(
  model: DataModel,
  axes: readonly string[] | undefined,
): { name: string; min: number; max: number }[] {
  const count = model.series.reduce((m, s) => (s.visible ? Math.max(m, s.points.length) : m), 0);
  const dimCount = Math.max(count, axes?.length ?? 0, model.categories?.length ?? 0);
  const names = parallelDimensionNames(axes, model.categories, dimCount);
  return names.map((name, d) => {
    const values = model.series.filter((s) => s.visible).map((s) => s.points[d]?.y ?? null);
    const [min, max] = parallelExtent(values);
    return { name, min, max };
  });
}

function frameFor(ctx: DefinitionContext, measure: (text: string) => number): ParallelFrame {
  return computeParallelFrame({
    dims: parallelDimensions(ctx.model, ctx.opts.parallel?.axes),
    plot: ctx.layout.plot,
    fontSize: ctx.theme.fontSize,
    measure,
  });
}

// ---------------------------------------------------------------------------
// Polyline hit-testing (pure)

/** Squared distance from (px, py) to segment (ax, ay)-(bx, by). */
function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return (px - x) * (px - x) + (py - y) * (py - y);
}

/**
 * Nearest polyline SEGMENT within `maxDist`; the returned `pi` is the segment
 * endpoint closer to the pointer, so hovering a line focuses a real datum.
 */
export function nearestPolyline(
  pos: readonly (readonly (PointPos | null)[])[],
  px: number,
  py: number,
  maxDist = PARALLEL_SEGMENT_HIT,
): HoverState | null {
  let best: HoverState | null = null;
  let bestD = maxDist * maxDist;
  pos.forEach((pts, si) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const d = segDistSq(px, py, a.x, a.y, b.x, b.y);
      if (d <= bestD) {
        bestD = d;
        const da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
        const db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
        best = { si, pi: da <= db ? i : i + 1 };
      }
    }
  });
  return best;
}

// ---------------------------------------------------------------------------

export const parallelDefinition: ChartTypeDefinition = {
  id: 'parallel',
  needs: { cartesianAxes: false },

  layout(ctx: DefinitionLayoutContext): TypeGeom {
    const font = axisTickFont(ctx.theme);
    const frame = frameFor(ctx, (text) => ctx.measure(text, font));
    const pos: (PointPos | null)[][] = ctx.model.series.map((s) => {
      if (!s.visible) return [];
      return frame.dims.map((d): PointPos | null => {
        const y = s.points[d.index]?.y ?? null;
        if (y === null) return null;
        return {
          x: d.x,
          y: parallelValueToY(y, d.min, d.max, frame.axisTop, frame.axisBottom),
          // Entering vertices rise from the axis foot.
          y0: frame.axisBottom,
        };
      });
    });
    return { pos, slices: null, bars: null, extra: frame };
  },

  render(ctx: RenderContext): void {
    const { r, theme: t, model: m, geom, hover } = ctx;
    const frame = geom.extra as ParallelFrame | undefined;
    if (!frame || frame.dims.length === 0) return;
    m.series.forEach((s, si) => {
      if (!s.visible) return;
      const pts = geom.pos[si];
      if (!pts) return;
      const color = seriesColor(s, t);
      const focused = hover !== null && hover.si === si;
      const alpha = hover === null ? PARALLEL_LINE_ALPHA : focused ? 1 : PARALLEL_DIM_ALPHA;
      const width = focused ? PARALLEL_HOVER_WIDTH : PARALLEL_LINE_WIDTH;
      // Null values break the polyline (a gap, never an invented value).
      const cmds: PathCmd[] = [];
      let started = false;
      for (const p of pts) {
        if (!p) {
          started = false;
          continue;
        }
        cmds.push([started ? 'L' : 'M', p.x, p.y]);
        started = true;
      }
      if (cmds.length > 0) r.path(cmds, { stroke: { color, width, join: 'round' }, alpha });
    });

    // Vertex marker on hover/focus only (>= 8px diameter, 2px surface ring).
    if (hover) {
      const p = geom.pos[hover.si]?.[hover.pi];
      const s = m.series[hover.si];
      if (p && s) {
        r.circle(p.x, p.y, PARALLEL_VERTEX_RADIUS, {
          fill: seriesColor(s, t),
          stroke: { color: t.surface, width: 2 },
        });
      }
    }
  },

  /** Axis lines under the marks; names + per-axis extremes over them. */
  decorations(ctx: RenderContext, layer): void {
    const { r, theme: t, geom } = ctx;
    const frame = geom.extra as ParallelFrame | undefined;
    if (!frame) return;
    if (layer === 'under') {
      for (const d of frame.dims) {
        r.line(d.x, frame.axisTop, d.x, frame.axisBottom, { color: t.axisLine, width: 1 });
      }
      return;
    }
    const font = axisTickFont(t);
    for (const d of frame.dims) {
      const nameY = frame.nameRowY[d.labelRow] ?? frame.nameRowY[0] ?? frame.axisTop;
      r.text(d.label, d.x, nameY, {
        font,
        color: t.textSecondary,
        align: 'center',
        baseline: 'top',
      });
      // Each axis is labeled with ITS OWN max (top) and min (bottom).
      r.text(formatValue(d.max), d.x, frame.maxLabelY, {
        font,
        color: t.textMuted,
        align: 'center',
        baseline: 'top',
      });
      r.text(formatValue(d.min), d.x, frame.minLabelY, {
        font,
        color: t.textMuted,
        align: 'center',
        baseline: 'top',
      });
    }
  },

  hitTest(ctx, px, py): HoverState | null {
    const vertex = nearestPoint(ctx.geom.pos, px, py);
    if (vertex) return { si: vertex.si, pi: vertex.pi };
    return nearestPolyline(ctx.geom.pos, px, py);
  },

  legendItems(ctx): LegendItem[] {
    return ctx.model.series.map((s) => ({
      id: s.id,
      name: s.name,
      color: seriesColor(s, ctx.theme),
      visible: s.visible,
      toggleable: true,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const dims = parallelDimensions(ctx.model, ctx.opts.parallel?.axes);
    return {
      columns: ['Series', ...dims.map((d) => d.name)],
      rows: ctx.model.series.map((s) => ({
        header: s.name,
        cells: dims.map((_d, i) => {
          const y = s.points[i]?.y ?? null;
          return y === null ? '—' : formatValue(y);
        }),
      })),
    };
  },

  keyboardNav(model): NavContext {
    // Left/Right walk the dimensions of one series, Up/Down switch series.
    const cap = model.categories?.length ?? Number.POSITIVE_INFINITY;
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => Math.min(model.series[si]?.points.length ?? 0, cap),
    };
  },

  announce(ctx, pos): string | null {
    const frame = ctx.geom.extra as ParallelFrame | undefined;
    const dim = frame?.dims[pos.pi];
    const s = ctx.model.series[pos.si];
    if (!frame || !dim || !s) return null;
    const y = s.points[pos.pi]?.y ?? null;
    return (
      `${dim.name}: ${y === null ? 'no value' : formatValue(y)} ` +
      `(axis ${formatValue(dim.min)} to ${formatValue(dim.max)}). ` +
      `${s.name}, dimension ${pos.pi + 1} of ${frame.dims.length}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const frame = ctx.geom.extra as ParallelFrame | undefined;
    const dim = frame?.dims[hit.pi];
    if (dim) tp.formattedX = dim.name;
    return [tp];
  },
};
