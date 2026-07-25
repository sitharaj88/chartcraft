/**
 * Marimekko (mosaic) chart-type definition (v0.3 contract).
 *
 * Variable-width 100%-stacked columns: a column's WIDTH encodes its share of
 * the grand total, a segment's HEIGHT its share within that column. Both
 * dimensions travel with every readout — a marimekko is unreadable without
 * them — so the tooltip and the a11y table each carry the column's width share
 * AND the segment's within-column share alongside the absolute value.
 *
 * WIDTH MECHANISM (one, explicit, documented): the width measure comes from
 * `r` on the FIRST series' points, index-aligned to the columns. The contract
 * offers `data[i].r` or a `widths` parallel; `r` wins because it is already a
 * declared `DataPoint` field carried losslessly through normalization, so no
 * new option or parallel array is needed. When the first series supplies no
 * usable `r` (the common case) each column's width falls back to its own
 * total, which is the contract's "column width ∝ column total".
 *
 * Gaps: 2px in BOTH directions, subtracted from the available space rather
 * than insetting the marks, so widths and heights still sum exactly to the
 * plot rect.
 */
import type { TooltipPoint } from '../../types';
import type { HoverState, PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { NavContext } from '../../a11y/keyboard';
import type { LegendItem } from '../../components/legend';
import type { DataModel } from '../../model';
import { bandIndexFor, seriesColor } from '../../model';
import { formatValue } from '../../util';
import type {
  ChartTypeDefinition,
  DefinitionContext,
  DefinitionLayoutContext,
  GeomContext,
  TooltipExtractContext,
} from '../registry';
import {
  COMPOSITION_GAP,
  columnLabels,
  extraOf,
  formatShare,
  insetRect,
  magnitude,
} from './shared';

/** Percentage guides drawn beside the columns (labels only — no gridlines). */
export const MARIMEKKO_PERCENT_TICKS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

// ---------------------------------------------------------------------------
// Pure layout math

export interface MarimekkoCellInput {
  /** MODEL series index. */
  si: number;
  /** Point index within that series (what `dataIndex` reports). */
  pi: number;
  value: number;
}

export interface MarimekkoColumnInput {
  label: string;
  /** Width measure (`r` of the first series, else the column total). */
  widthValue: number;
  /** Candidate segments, in series order (first series at the BOTTOM). */
  cells: readonly MarimekkoCellInput[];
}

export interface MarimekkoSegment extends MarimekkoCellInput {
  /** Share of the column total, 0..1. */
  share: number;
  y: number;
  h: number;
}

export interface MarimekkoColumn {
  index: number;
  label: string;
  widthValue: number;
  /** Share of the summed width measure, 0..1. */
  widthShare: number;
  total: number;
  x: number;
  w: number;
  segments: MarimekkoSegment[];
}

export interface MarimekkoLayout {
  columns: MarimekkoColumn[];
  /** Sum of the width measures. */
  widthTotal: number;
  rect: Rect;
  gap: number;
}

/**
 * Lay columns across `rect`: width ∝ width measure, height ∝ within-column
 * share, `gap` px between adjacent columns and between stacked segments.
 * Segments stack from the BOTTOM in series order (matching bar stacking).
 */
export function computeMarimekkoColumns(
  cols: readonly MarimekkoColumnInput[],
  rect: Rect,
  gap: number = COMPOSITION_GAP,
): MarimekkoLayout {
  const n = cols.length;
  const empty: MarimekkoLayout = { columns: [], widthTotal: 0, rect, gap };
  if (n === 0) return empty;

  let widthTotal = 0;
  for (const c of cols) widthTotal += magnitude(c.widthValue);
  const equal = widthTotal <= 0;
  if (equal) widthTotal = n;

  const availW = Math.max(0, rect.w - gap * (n - 1));
  let cursorX = rect.x;
  const columns: MarimekkoColumn[] = [];

  cols.forEach((col, index) => {
    const widthValue = equal ? 1 : magnitude(col.widthValue);
    const widthShare = widthTotal === 0 ? 0 : widthValue / widthTotal;
    const w = availW * widthShare;

    const active = col.cells.filter((c) => magnitude(c.value) > 0);
    let total = 0;
    for (const c of active) total += magnitude(c.value);
    const availH = Math.max(0, rect.h - gap * Math.max(0, active.length - 1));

    const segments: MarimekkoSegment[] = [];
    let cursorY = rect.y + rect.h;
    active.forEach((c) => {
      const share = total === 0 ? 0 : magnitude(c.value) / total;
      const h = availH * share;
      cursorY -= h;
      segments.push({ si: c.si, pi: c.pi, value: magnitude(c.value), share, y: cursorY, h });
      cursorY -= gap;
    });

    columns.push({
      index,
      label: col.label,
      widthValue,
      widthShare,
      total,
      x: cursorX,
      w,
      segments,
    });
    cursorX += w + gap;
  });

  return { columns, widthTotal, rect, gap };
}

// ---------------------------------------------------------------------------
// Definition

export interface MarimekkoGeomExtra {
  grid: Rect;
  layout: MarimekkoLayout;
  /** Where the column widths came from (documented, and asserted in tests). */
  widthSource: 'r' | 'total';
  /** Column index per (si, pi) so tooltips/hit results can find their column. */
  columnOf: Record<string, number>;
}

const cellKey = (si: number, pi: number): string => `${si}:${pi}`;

/**
 * Column width measures: `r` on the first series' points when EVERY column has
 * a positive one, else the per-column totals of visible series.
 */
export function marimekkoWidthValues(
  model: DataModel,
  columnCount: number,
  columnTotals: readonly number[],
): { values: number[]; source: 'r' | 'total' } {
  const first = model.series[0];
  if (first && columnCount > 0) {
    const rs: number[] = new Array(columnCount).fill(0);
    let ok = true;
    for (let c = 0; c < columnCount; c++) {
      // `r` is index-aligned to the columns on the first series.
      const r = first.points[c]?.r;
      if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) {
        ok = false;
        break;
      }
      rs[c] = r;
    }
    if (ok) return { values: rs, source: 'r' };
  }
  return { values: [...columnTotals], source: 'total' };
}

function buildColumns(model: DataModel, columnCount: number): {
  cols: MarimekkoColumnInput[];
  source: 'r' | 'total';
} {
  const labels = columnLabels(model, columnCount);
  const cells: MarimekkoCellInput[][] = Array.from({ length: columnCount }, () => []);
  const totals = new Array<number>(columnCount).fill(0);

  model.series.forEach((s, si) => {
    if (!s.visible) return;
    s.points.forEach((p, pi) => {
      const c = bandIndexFor(model, p.xv, pi);
      if (c < 0 || c >= columnCount) return;
      const v = magnitude(p.y);
      cells[c]?.push({ si, pi, value: v });
      totals[c] = (totals[c] ?? 0) + v;
    });
  });

  const { values, source } = marimekkoWidthValues(model, columnCount, totals);
  const cols: MarimekkoColumnInput[] = [];
  for (let c = 0; c < columnCount; c++) {
    cols.push({
      label: labels[c] ?? String(c + 1),
      widthValue: values[c] ?? 0,
      cells: cells[c] ?? [],
    });
  }
  return { cols, source };
}

export const marimekkoDefinition: ChartTypeDefinition = {
  id: 'marimekko',
  // Own geometry: column widths are data-driven, so no band scale applies.
  // `xScale: 'band'` still declares the x DATA as categorical, which gives the
  // model derived categories and category-aware formatting for free.
  needs: { cartesianAxes: false, xScale: 'band' },

  layout(ctx: DefinitionLayoutContext): TypeGeom {
    const { model, theme } = ctx;
    const font = axisTickFont(theme);
    const columnCount = Math.max(model.categories?.length ?? 0, model.maxLen);

    // Left: percentage labels. Bottom: column labels.
    const left = columnCount > 0 ? Math.ceil(ctx.measure('100%', font)) + 8 : 0;
    const bottom = columnCount > 0 ? theme.fontSize + 6 : 0;
    const grid = insetRect(ctx.layout.plot, { left, bottom });

    const { cols, source } = buildColumns(model, columnCount);
    const layout = computeMarimekkoColumns(cols, grid);

    const pos: (PointPos | null)[][] = model.series.map((s) => (s.visible ? new Array(s.points.length).fill(null) : []));
    const columnOf: Record<string, number> = {};
    for (const col of layout.columns) {
      for (const seg of col.segments) {
        const row = pos[seg.si];
        if (row) row[seg.pi] = { x: col.x + col.w / 2, y: seg.y + seg.h / 2, y0: seg.y + seg.h };
        columnOf[cellKey(seg.si, seg.pi)] = col.index;
      }
    }

    const extra: MarimekkoGeomExtra = { grid, layout, widthSource: source, columnOf };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme, model, geom, hover } = ctx;
    const extra = extraOf<MarimekkoGeomExtra>(geom);
    if (!extra) return;
    const font = axisTickFont(theme);
    const { grid } = extra;

    // Segments (uninterpolated `extra` geometry — cells have no generic
    // interpolation, exactly like heatmap cells).
    for (const col of extra.layout.columns) {
      if (col.w <= 0) continue;
      for (const seg of col.segments) {
        if (seg.h <= 0) continue;
        const s = model.series[seg.si];
        if (!s) continue;
        const alpha = hover ? (hover.si === seg.si && hover.pi === seg.pi ? 1 : 0.55) : 1;
        r.rect(col.x, seg.y, col.w, seg.h, {
          fill: s.points[seg.pi]?.color ?? seriesColor(s, theme),
          alpha,
        });
      }
    }

    // Percentage labels beside the stack (ink, muted — axis-label treatment).
    for (const t of MARIMEKKO_PERCENT_TICKS) {
      r.text(`${Math.round(t * 100)}%`, grid.x - 6, grid.y + (1 - t) * grid.h, {
        font,
        color: theme.textMuted,
        align: 'right',
        baseline: 'middle',
      });
    }

    // Column labels, drawn only where they fit (direct labels are selective).
    for (const col of extra.layout.columns) {
      if (col.w <= 0) continue;
      if (r.measure(col.label, font) > col.w) continue;
      r.text(col.label, col.x + col.w / 2, grid.y + grid.h + 4, {
        font,
        color: theme.textMuted,
        align: 'center',
        baseline: 'top',
      });
    }
  },

  hitTest(ctx: GeomContext, px, py): HoverState | null {
    const extra = extraOf<MarimekkoGeomExtra>(ctx.geom);
    if (!extra) return null;
    for (const col of extra.layout.columns) {
      if (px < col.x || px > col.x + col.w) continue;
      for (const seg of col.segments) {
        if (py >= seg.y && py <= seg.y + seg.h) return { si: seg.si, pi: seg.pi };
      }
      return null;
    }
    return null;
  },

  legendItems(ctx: DefinitionContext): LegendItem[] {
    return ctx.model.series.map((s) => ({
      id: s.id,
      name: s.name,
      color: seriesColor(s, ctx.theme),
      visible: s.visible,
      toggleable: true,
    }));
  },

  a11yTable(ctx: DefinitionContext): A11yTableSpec {
    const { model } = ctx;
    // Recompute geometry in a unit rect (pixel-free) so the table never depends
    // on a rendered frame; only the two SHARES matter here.
    const columnCount = Math.max(model.categories?.length ?? 0, model.maxLen);
    const { cols } = buildColumns(model, columnCount);
    const value = computeMarimekkoColumns(cols, { x: 0, y: 0, w: 1, h: 1 }, 0);

    const rows: A11yTableSpec['rows'] = value.columns.map((col) => {
      const cells: string[] = [formatShare(col.widthShare)];
      model.series.forEach((_s, si) => {
        const seg = col.segments.find((sg) => sg.si === si);
        cells.push(seg ? `${formatValue(seg.value)} (${formatShare(seg.share)})` : '—');
      });
      return { header: col.label, cells };
    });

    // BOTH dimensions: the width share column plus per-segment "value (share)".
    return { columns: ['Column', 'Width share', ...model.series.map((s) => s.name)], rows };
  },

  keyboardNav(model): NavContext {
    // Left/Right walk columns (pi), Up/Down walk series (si).
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  announce(ctx, pos): string | null {
    const extra = extraOf<MarimekkoGeomExtra>(ctx.geom);
    const s = ctx.model.series[pos.si];
    if (!extra || !s) return null;
    const colIndex = extra.columnOf[cellKey(pos.si, pos.pi)];
    const col = colIndex === undefined ? undefined : extra.layout.columns[colIndex];
    const seg = col?.segments.find((sg) => sg.si === pos.si && sg.pi === pos.pi);
    if (!col || !seg) return null;
    return (
      `${col.label}: ${formatValue(seg.value)}, ${formatShare(seg.share)} of the column. ` +
      `${s.name}. Column ${formatShare(col.widthShare)} of total width, ` +
      `${col.index + 1} of ${extra.layout.columns.length}.`
    );
  },

  tooltipPoints(ctx: TooltipExtractContext, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const extra = extraOf<MarimekkoGeomExtra>(ctx.geom);
    const colIndex = extra?.columnOf[cellKey(hit.si, hit.pi)];
    const col = extra && colIndex !== undefined ? extra.layout.columns[colIndex] : undefined;
    const seg = col?.segments.find((sg) => sg.si === hit.si && sg.pi === hit.pi);
    if (col && seg) {
      // BOTH dimensions in the tooltip.
      tp.formattedX = `${col.label} — ${formatShare(col.widthShare)} of total width`;
      tp.formattedY = `${formatValue(seg.value)} (${formatShare(seg.share)} of column)`;
    }
    return [tp];
  },
};
