/**
 * Streamgraph chart-type definition (v0.3 contract).
 *
 * Stacked areas on a wiggle-minimizing baseline: the classic Byron &
 * Wattenberg construction, implemented here as two PURE functions —
 * `insideOutOrder` (series ordering) and `wiggleBaseline` (the g0 offset).
 *
 * Two consequences the contract calls out, and this module guarantees:
 *
 * 1. **The baseline is meaningless, so the y axis carries no information.**
 *    Declared as `needs.axisChrome: { x: true, y: false }` — the pipeline then
 *    draws no value tick labels, no value axis line and no y gridlines (and
 *    reserves no left margin for them) while keeping the x axis intact. Every
 *    value is available in the tooltip and the a11y table instead.
 * 2. **Series order is COMPUTED, not the input order.** The picture depends on
 *    it — inside-out ordering puts early-peaking series at the middle of the
 *    stack. Colour is bound to series IDENTITY (the model's palette slot,
 *    assigned by first-seen id) and NEVER to stacking rank, so re-ordering the
 *    stack never re-colours a series.
 *
 * Columns are point INDICES (index-aligned stacking, exactly like the
 * pipeline's `computeStacks`), and nulls contribute 0 thickness — a stacked
 * baseline is undefined otherwise.
 */
import type { TooltipPoint } from '../../types';
import type {
  ContinuousScale,
  HoverState,
  Layout,
  PointPos,
  RenderContext,
  TypeGeom,
} from '../../layout';
import type { PathCmd } from '../../render/renderer';
import type { A11yTableSpec } from '../../a11y';
import type { NavContext } from '../../a11y/keyboard';
import type { LegendItem } from '../../components/legend';
import type { DataModel } from '../../model';
import { bandIndexFor, seriesColor } from '../../model';
import { BandScale } from '../../scales/band';
import { formatValue } from '../../util';
import type {
  ChartTypeDefinition,
  DefinitionContext,
  DefinitionLayoutContext,
  GeomContext,
  TooltipExtractContext,
} from '../registry';
import { extraOf, finite, linearMap, visibleIndices } from './shared';

/** Opacity of a band that is not the hovered one (bar-mark precedent). */
export const STREAM_DIM_ALPHA = 0.55;

// ---------------------------------------------------------------------------
// Pure layout math (Byron & Wattenberg)

/** Index of the largest value (first one wins); 0 for an empty series. */
export function peakIndex(values: readonly (number | null | undefined)[]): number {
  let best = -Infinity;
  let idx = 0;
  for (let i = 0; i < values.length; i++) {
    const v = finite(values[i]);
    if (v > best) {
      best = v;
      idx = i;
    }
  }
  return idx;
}

/** Sum of a series' values (nulls count as 0). */
export function seriesTotal(values: readonly (number | null | undefined)[]): number {
  let acc = 0;
  for (const v of values) acc += finite(v);
  return acc;
}

/**
 * "Inside-out" series ordering (Byron & Wattenberg): sort series by the
 * position of their peak, then greedily add each to whichever side of the
 * stack is currently smaller, so large early-peaking series end up in the
 * middle. Returns MODEL-relative indices bottom-to-top.
 *
 * Ties on peak position break by input index, so the ordering is fully
 * deterministic (never relies on sort stability).
 */
export function insideOutOrder(values: readonly (readonly (number | null)[])[]): number[] {
  const sums = values.map(seriesTotal);
  const peaks = values.map(peakIndex);
  const appearance = values
    .map((_, i) => i)
    .sort((a, b) => (peaks[a] ?? 0) - (peaks[b] ?? 0) || a - b);

  let top = 0;
  let bottom = 0;
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (const j of appearance) {
    if (top < bottom) {
      top += sums[j] ?? 0;
      tops.push(j);
    } else {
      bottom += sums[j] ?? 0;
      bottoms.push(j);
    }
  }
  return [...bottoms.reverse(), ...tops];
}

/**
 * The wiggle-minimizing baseline g0 (Byron & Wattenberg's "wiggle" offset),
 * for series already in stacking order (bottom first).
 *
 * g0[0] = 0 and, for every later column j,
 *
 *   g0[j] = g0[j-1] - (sum_i f_i[j] * (df_i[j]/2 + sum_{k<i} df_k[j])) / sum_i f_i[j]
 *
 * with df_i[j] = f_i[j] - f_i[j-1]. That is exactly the least-squares
 * minimizer of the total slope of the stacked layers.
 */
export function wiggleBaseline(ordered: readonly (readonly (number | null)[])[]): number[] {
  const n = ordered.length;
  let m = 0;
  for (const s of ordered) m = Math.max(m, s.length);
  const baseline = new Array<number>(m).fill(0);
  if (n === 0 || m === 0) return baseline;

  const at = (i: number, j: number): number => finite(ordered[i]?.[j]);

  let y = 0;
  for (let j = 1; j < m; j++) {
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const vij = at(i, j);
      let s3 = (vij - at(i, j - 1)) / 2;
      for (let k = 0; k < i; k++) s3 += at(k, j) - at(k, j - 1);
      s1 += vij;
      s2 += s3 * vij;
    }
    baseline[j - 1] = y;
    if (s1 !== 0) y -= s2 / s1;
  }
  baseline[m - 1] = y;
  return baseline;
}

/** One stacked band: value bounds per column, bottom-to-top by `rank`. */
export interface StreamBand {
  /** Index into the input matrix (the caller maps it to a model series). */
  index: number;
  /** Position in the computed stacking order (0 = bottom). */
  rank: number;
  lo: number[];
  hi: number[];
}

export interface StreamStack {
  /** Computed stacking order (input indices, bottom-to-top). */
  order: number[];
  /** The wiggle baseline, per column. */
  baseline: number[];
  bands: StreamBand[];
  /** Stack total per column. */
  totals: number[];
  /** Value extent actually occupied by the stream, [min, max]. */
  extent: [number, number];
  columns: number;
}

/**
 * Full stream geometry in VALUE space: inside-out order + wiggle baseline +
 * per-band bounds + the occupied extent. Pixels are a separate, trivial step.
 */
export function computeStreamStack(values: readonly (readonly (number | null)[])[]): StreamStack {
  let columns = 0;
  for (const s of values) columns = Math.max(columns, s.length);
  const order = insideOutOrder(values);
  const ordered = order.map((i) => values[i] ?? []);
  const baseline = wiggleBaseline(ordered);

  const totals = new Array<number>(columns).fill(0);
  const bands: StreamBand[] = [];
  const running = baseline.slice();
  ordered.forEach((series, rank) => {
    const lo: number[] = new Array(columns);
    const hi: number[] = new Array(columns);
    for (let j = 0; j < columns; j++) {
      const v = finite(series[j]);
      const base = running[j] ?? 0;
      lo[j] = base;
      hi[j] = base + v;
      running[j] = base + v;
      totals[j] = (totals[j] ?? 0) + v;
    }
    bands.push({ index: order[rank] ?? rank, rank, lo, hi });
  });

  let min = 0;
  let max = 0;
  if (columns > 0) {
    min = Infinity;
    max = -Infinity;
    for (let j = 0; j < columns; j++) {
      const lo = baseline[j] ?? 0;
      const hi = lo + (totals[j] ?? 0);
      if (lo < min) min = lo;
      if (hi > max) max = hi;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) max = min + 1;

  return { order, baseline, bands, totals, extent: [min, max], columns };
}

// ---------------------------------------------------------------------------
// Definition

export interface StreamGeomExtra {
  /** Bands bottom-to-top; `index` is the MODEL series index. */
  bands: StreamBand[];
  totals: number[];
  columns: number;
  extent: [number, number];
  /** Pixel x per column. */
  columnX: number[];
}

/** Column x positions (band centers or continuous scale positions). */
function columnPositions(model: DataModel, layout: Layout, columns: number): number[] {
  const band = layout.xScale instanceof BandScale ? layout.xScale : null;
  const cont = band === null ? (layout.xScale as ContinuousScale | null) : null;
  const vis = visibleIndices(model);
  const out: number[] = new Array(columns);
  for (let j = 0; j < columns; j++) {
    if (band) {
      let idx = j;
      for (const si of vis) {
        const p = model.series[si]?.points[j];
        if (p) {
          idx = bandIndexFor(model, p.xv, j);
          break;
        }
      }
      out[j] = band.center(idx);
      continue;
    }
    if (cont) {
      let xv: number | null = null;
      for (const si of vis) {
        const v = model.series[si]?.points[j]?.xv;
        if (v !== null && v !== undefined) {
          xv = v;
          break;
        }
      }
      out[j] = cont.scale(xv ?? j);
      continue;
    }
    out[j] = layout.plot.x + ((j + 0.5) / Math.max(1, columns)) * layout.plot.w;
  }
  return out;
}

function valueMatrix(model: DataModel, indices: readonly number[], columns: number): (number | null)[][] {
  return indices.map((si) => {
    const pts = model.series[si]?.points ?? [];
    const row: (number | null)[] = new Array(columns).fill(null);
    for (let j = 0; j < columns; j++) row[j] = pts[j]?.y ?? null;
    return row;
  });
}

function bandFor(extra: StreamGeomExtra | null, si: number): StreamBand | null {
  return extra?.bands.find((b) => b.index === si) ?? null;
}

export const streamgraphDefinition: ChartTypeDefinition = {
  id: 'streamgraph',
  needs: {
    cartesianAxes: true,
    // The x axis is real (time or category); the VALUE axis is not — a wiggle
    // baseline carries no information, so the contract suppresses its ticks and
    // labels. Per-axis chrome says exactly that.
    axisChrome: { x: true, y: false },
    xScale: 'auto',
    baseKind: 'area',
    // Not a combo root, and stacking is OURS (wiggle), never the pipeline's.
    combo: false,
    stacking: false,
    // LTTB picks different indices per series, which would break the
    // index-aligned stack — a streamgraph is never downsampled.
    downsample: false,
  },

  layout(ctx: DefinitionLayoutContext): TypeGeom {
    const { model, layout: L } = ctx;
    const indices = visibleIndices(model);
    let columns = 0;
    for (const si of indices) columns = Math.max(columns, model.series[si]?.points.length ?? 0);

    const stack = computeStreamStack(valueMatrix(model, indices, columns));
    const columnX = columnPositions(model, L, columns);

    // Own value mapping: the pipeline's y domain is a zero-anchored stack
    // extent, but the stream lives on the wiggle baseline, so the occupied
    // extent is what has to fill the plot.
    const toPx = linearMap(stack.extent[0], stack.extent[1], L.plot.y + L.plot.h, L.plot.y);

    const bands: StreamBand[] = stack.bands.map((b) => ({
      ...b,
      index: indices[b.index] ?? b.index,
    }));

    const pos: (PointPos | null)[][] = model.series.map(() => []);
    for (const b of bands) {
      const s = model.series[b.index];
      if (!s) continue;
      const row: (PointPos | null)[] = [];
      for (let j = 0; j < s.points.length; j++) {
        const x = columnX[j];
        if (x === undefined) {
          row.push(null);
          continue;
        }
        row.push({ x, y: toPx(b.hi[j] ?? 0), y0: toPx(b.lo[j] ?? 0) });
      }
      pos[b.index] = row;
    }

    const extra: StreamGeomExtra = {
      bands,
      totals: stack.totals,
      columns,
      extent: stack.extent,
      columnX,
    };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme, model, geom, hover, layout: L } = ctx;
    const extra = extraOf<StreamGeomExtra>(geom);
    if (!extra) return;

    r.clipRect(L.plot.x, L.plot.y, L.plot.w, L.plot.h, () => {
      // Bottom-to-top, so a stream reads as one stacked ribbon.
      for (const b of extra.bands) {
        const s = model.series[b.index];
        const pts = geom.pos[b.index];
        if (!s || !s.visible || !pts || pts.length === 0) continue;
        const defined = pts.filter((p): p is PointPos => p !== null);
        if (defined.length === 0) continue;

        const cmds: PathCmd[] = [];
        defined.forEach((p, i) => cmds.push(i === 0 ? ['M', p.x, p.y] : ['L', p.x, p.y]));
        for (let i = defined.length - 1; i >= 0; i--) {
          const p = defined[i] as PointPos;
          cmds.push(['L', p.x, p.y0]);
        }
        cmds.push(['Z']);

        const alpha = hover ? (hover.si === b.index ? 1 : STREAM_DIM_ALPHA) : 1;
        r.path(cmds, { fill: seriesColor(s, theme), alpha });
      }
    });
  },

  hitTest(ctx: GeomContext, px, py): HoverState | null {
    const extra = extraOf<StreamGeomExtra>(ctx.geom);
    if (!extra || extra.columns === 0) return null;

    // Nearest column by x, then the band whose value extent contains py.
    let col = -1;
    let bestD = Infinity;
    extra.columnX.forEach((x, j) => {
      const d = Math.abs(x - px);
      if (d < bestD) {
        bestD = d;
        col = j;
      }
    });
    if (col < 0) return null;

    let fallback: HoverState | null = null;
    let fallbackD = Infinity;
    for (const b of extra.bands) {
      const p = ctx.geom.pos[b.index]?.[col];
      if (!p) continue;
      const top = Math.min(p.y, p.y0);
      const bottom = Math.max(p.y, p.y0);
      if (py >= top - 1 && py <= bottom + 1) return { si: b.index, pi: col };
      const d = py < top ? top - py : py - bottom;
      if (d < fallbackD) {
        fallbackD = d;
        fallback = { si: b.index, pi: col };
      }
    }
    // Within a few px of the ribbon edge still counts (hit targets > marks).
    return fallbackD <= 6 ? fallback : null;
  },

  legendItems(ctx: DefinitionContext): LegendItem[] {
    // Series identity, in INPUT order — the legend must not shuffle when the
    // computed stacking order does.
    return ctx.model.series.map((s) => ({
      id: s.id,
      name: s.name,
      color: seriesColor(s, ctx.theme),
      visible: s.visible,
      toggleable: true,
    }));
  },

  a11yTable(ctx: DefinitionContext): A11yTableSpec {
    const { model: m, opts: o } = ctx;
    const xHead = o.xAxis.label ?? (m.xType === 'category' ? 'Category' : m.xType === 'time' ? 'Time' : 'X');
    const rows: A11yTableSpec['rows'] = [];
    for (let i = 0; i < m.maxLen; i++) {
      const cat = m.categories?.[i];
      const xVal = cat !== undefined ? cat : (m.series[0]?.points[i]?.x ?? i);
      let total = 0;
      const cells = m.series.map((s) => {
        const y = s.points[i]?.y ?? null;
        if (y !== null && s.visible) total += y;
        return y === null ? '—' : formatValue(y);
      });
      rows.push({ header: formatValue(xVal), cells: [...cells, formatValue(total)] });
    }
    // The stack total is the only vertically readable quantity, so it earns a
    // column (the baseline itself carries no meaning).
    return { columns: [xHead, ...m.series.map((s) => s.name), 'Total'], rows };
  },

  keyboardNav(model): NavContext {
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  tooltipPoints(ctx: TooltipExtractContext, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const extra = extraOf<StreamGeomExtra>(ctx.geom);
    const total = extra?.totals[hit.pi];
    if (total !== undefined && total > 0 && tp.y !== null) {
      // Values live in the tooltip because the axis cannot show them.
      tp.formattedY = `${tp.formattedY} of ${formatValue(total)}`;
    }
    return [tp];
  },
};

/** Exposed for tests: the band (bottom-to-top) belonging to a model series. */
export function streamBandFor(geom: TypeGeom, si: number): StreamBand | null {
  return bandFor(extraOf<StreamGeomExtra>(geom), si);
}
