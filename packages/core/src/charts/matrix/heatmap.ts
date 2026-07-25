/**
 * Heatmap chart-type definition (v0.2 contract).
 *
 * Each series is one ROW; its data aligns to `categories` (the COLUMNS).
 * Cell color comes from the sequential `heatmap.ramp` (default:
 * sequentialPalette) scaled over `heatmap.min`/`heatmap.max` (default: the
 * data extent), interpolating linearly in ramp index. Cells are separated
 * by 1px surface gaps. The legend is a horizontal gradient color-scale bar
 * with min/max labels (non-toggleable), mounted through the registry's
 * `legendCustomEl` hook. Keyboard navigation is row-major (Left/Right =
 * column, Up/Down = row); the a11y table IS the matrix (row header + one
 * column per category). Tooltip shows row, column and value.
 */
import type { TooltipPoint } from '../../types';
import type { Rect, TypeGeom, PointPos } from '../../layout';
import { axisTickFont } from '../../layout';
import type { DataModel, ResolvedOptions } from '../../model';
import type { ChartTypeDefinition, DefinitionContext } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import { sequentialPalette } from '../../theme';
import { formatValue } from '../../util';
import { rampColor } from './color-scale';

/** 1px surface-colored gap between adjacent cells (contract). */
export const HEATMAP_CELL_GAP = 1;

export interface HeatmapCell {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  value: number;
}

export interface HeatmapRow {
  /** MODEL series index of this row. */
  si: number;
  name: string;
  /** One entry per column; null = gap (no value). */
  cells: (HeatmapCell | null)[];
}

export interface HeatmapGeomExtra {
  grid: Rect;
  cols: number;
  colLabels: string[];
  rows: HeatmapRow[];
  min: number;
  max: number;
  ramp: string[];
}

/** Resolved ramp (default: the sequential blue palette). */
export function heatmapRamp(opts: Pick<ResolvedOptions, 'heatmap'>): string[] {
  const ramp = opts.heatmap?.ramp;
  return ramp && ramp.length > 0 ? [...ramp] : [...sequentialPalette];
}

/**
 * Color-scale extent: `heatmap.min`/`heatmap.max` override the data extent
 * over visible series. A degenerate extent is widened by +1 so the scale
 * stays defined.
 */
export function heatmapExtent(
  model: DataModel,
  heatmap?: { min?: number; max?: number },
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of model.series) {
    if (!s.visible) continue;
    for (const p of s.points) {
      if (p.y === null) continue;
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (heatmap?.min !== undefined) lo = heatmap.min;
  if (heatmap?.max !== undefined) hi = heatmap.max;
  if (lo === hi) hi = lo + 1;
  return [lo, hi];
}

/** Cell color for a value against min/max, interpolating within the ramp. */
export function heatmapColor(value: number, min: number, max: number, ramp: readonly string[]): string {
  return rampColor(ramp, (value - min) / (max - min));
}

function columnLabels(model: DataModel, cols: number): string[] {
  const out: string[] = [];
  for (let c = 0; c < cols; c++) {
    const cat = model.categories?.[c];
    out.push(cat !== undefined ? formatValue(cat) : String(c + 1));
  }
  return out;
}

function extraOf(geom: TypeGeom): HeatmapGeomExtra | null {
  return (geom.extra as HeatmapGeomExtra | undefined) ?? null;
}

export const heatmapDefinition: ChartTypeDefinition = {
  id: 'heatmap',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    // The gradient color scale is the value key for every cell — legend
    // "auto" shows it whenever the caller did not explicitly opt out.
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawShow === undefined) resolved.legend.show = true;
  },

  layout(ctx): TypeGeom {
    const { model, theme, opts } = ctx;
    const plot = ctx.layout.plot;
    const font = axisTickFont(theme);

    const visible = model.series.filter((s) => s.visible);
    const cols = Math.max(model.categories?.length ?? 0, model.maxLen);
    const colLabels = columnLabels(model, cols);

    // Row labels on the left, column labels below the grid.
    let labelW = 0;
    for (const s of visible) labelW = Math.max(labelW, ctx.measure(s.name, font));
    const left = visible.length > 0 ? Math.ceil(labelW) + 10 : 0;
    const bottom = cols > 0 ? theme.fontSize + 8 : 0;

    const grid: Rect = {
      x: plot.x + left,
      y: plot.y,
      w: Math.max(1, plot.w - left),
      h: Math.max(1, plot.h - bottom),
    };

    const [min, max] = heatmapExtent(model, opts.heatmap);
    const ramp = heatmapRamp(opts);

    const rowCount = visible.length;
    const cw = cols > 0 ? grid.w / cols : grid.w;
    const ch = rowCount > 0 ? grid.h / rowCount : grid.h;
    const g = HEATMAP_CELL_GAP;

    const rows: HeatmapRow[] = [];
    const pos: (PointPos | null)[][] = model.series.map(() => []);

    let r = 0;
    model.series.forEach((s, si) => {
      if (!s.visible) return;
      const cells: (HeatmapCell | null)[] = [];
      const rowPos: (PointPos | null)[] = [];
      for (let c = 0; c < cols; c++) {
        const p = s.points[c];
        const v = p?.y ?? null;
        if (v === null) {
          cells.push(null);
          rowPos.push(null);
          continue;
        }
        cells.push({
          x: grid.x + c * cw + g / 2,
          y: grid.y + r * ch + g / 2,
          w: Math.max(0, cw - g),
          h: Math.max(0, ch - g),
          color: p?.color ?? heatmapColor(v, min, max, ramp),
          value: v,
        });
        const cx = grid.x + (c + 0.5) * cw;
        const cy = grid.y + (r + 0.5) * ch;
        rowPos.push({ x: cx, y: cy, y0: cy });
      }
      rows.push({ si, name: s.name, cells });
      pos[si] = rowPos.slice(0, s.points.length);
      r += 1;
    });

    const extra: HeatmapGeomExtra = { grid, cols, colLabels, rows, min, max, ramp };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx) {
    const { r, theme, hover } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra) return;
    const font = axisTickFont(theme);

    // Cells (uninterpolated `extra` geometry; 1px surface gaps by inset).
    for (const row of extra.rows) {
      row.cells.forEach((cell, c) => {
        if (!cell || cell.w <= 0 || cell.h <= 0) return;
        const hovered = hover !== null && hover.si === row.si && hover.pi === c;
        r.rect(cell.x, cell.y, cell.w, cell.h, {
          fill: cell.color,
          ...(hovered ? { stroke: { color: theme.textPrimary, width: 1 } } : {}),
        });
      });
    }

    // Row labels (ink, muted — same treatment as axis tick labels).
    for (let i = 0; i < extra.rows.length; i++) {
      const row = extra.rows[i] as HeatmapRow;
      const cy = extra.grid.y + ((i + 0.5) * extra.grid.h) / extra.rows.length;
      r.text(row.name, extra.grid.x - 6, cy, {
        font,
        color: theme.textMuted,
        align: 'right',
        baseline: 'middle',
      });
    }

    // Column labels, strided so they never collide.
    if (extra.cols > 0) {
      const maxLabels = Math.max(1, Math.floor(extra.grid.w / 56));
      const stride = Math.max(1, Math.ceil(extra.cols / maxLabels));
      const cw = extra.grid.w / extra.cols;
      extra.colLabels.forEach((label, c) => {
        if (c % stride !== 0) return;
        r.text(label, extra.grid.x + (c + 0.5) * cw, extra.grid.y + extra.grid.h + 4, {
          font,
          color: theme.textMuted,
          align: 'center',
          baseline: 'top',
        });
      });
    }
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.rows.length === 0 || extra.cols === 0) return null;
    const { grid } = extra;
    if (px < grid.x || px >= grid.x + grid.w || py < grid.y || py >= grid.y + grid.h) return null;
    const c = Math.min(extra.cols - 1, Math.floor(((px - grid.x) / grid.w) * extra.cols));
    const rIdx = Math.min(extra.rows.length - 1, Math.floor(((py - grid.y) / grid.h) * extra.rows.length));
    const row = extra.rows[rIdx];
    if (!row || !row.cells[c]) return null; // gaps are not hoverable
    return { si: row.si, pi: c };
  },

  legendItems() {
    // The color-scale legend is a custom element (legendCustomEl); there
    // are no per-item entries and nothing is toggleable.
    return [];
  },

  /**
   * Horizontal gradient color-scale bar with min/max labels in textMuted.
   * Mounted by the pipeline in the legend's place (legend.show applies).
   */
  legendCustomEl(ctx: DefinitionContext, doc: Document): HTMLElement | null {
    const { theme, model, opts } = ctx;
    const [min, max] = heatmapExtent(model, opts.heatmap);
    const ramp = heatmapRamp(opts);

    const wrap = doc.createElement('div');
    wrap.className = 'chartcraft-heatmap-legend';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `Color scale from ${formatValue(min)} to ${formatValue(max)}`);
    const ws = wrap.style;
    ws.display = 'inline-flex';
    ws.alignItems = 'center';
    ws.gap = '6px';
    ws.font = `${theme.fontSize}px ${theme.fontFamily}`;

    const mkLabel = (text: string, cls: string): HTMLElement => {
      const el = doc.createElement('span');
      el.className = cls;
      el.textContent = text;
      el.style.color = theme.textMuted;
      return el;
    };

    const bar = doc.createElement('span');
    bar.className = 'chartcraft-heatmap-legend-bar';
    const bs = bar.style;
    bs.display = 'inline-block';
    bs.width = '120px';
    bs.height = '10px';
    bs.borderRadius = '3px';
    bs.background = `linear-gradient(90deg, ${ramp.join(', ')})`;
    bs.flexShrink = '0';

    wrap.append(
      mkLabel(formatValue(min), 'chartcraft-heatmap-legend-min'),
      bar,
      mkLabel(formatValue(max), 'chartcraft-heatmap-legend-max'),
    );
    return wrap;
  },

  a11yTable(ctx): A11yTableSpec {
    const { model } = ctx;
    const cols = Math.max(model.categories?.length ?? 0, model.maxLen);
    const labels = columnLabels(model, cols);
    const rows: A11yTableSpec['rows'] = [];
    for (const s of model.series) {
      if (!s.visible) continue;
      const cells: string[] = [];
      for (let c = 0; c < cols; c++) {
        const y = s.points[c]?.y ?? null;
        cells.push(y === null ? '—' : formatValue(y));
      }
      rows.push({ header: s.name, cells });
    }
    return { columns: ['Series', ...labels], rows };
  },

  /** A heat map has ROWS x COLUMNS of cells, not "points". */
  a11ySummary(ctx): string | null {
    const { model } = ctx;
    const rows = model.series.filter((s) => s.visible).length;
    const cols = Math.max(model.categories?.length ?? 0, model.maxLen);
    if (rows === 0 || cols === 0) return 'no data';
    const [min, max] = heatmapExtent(ctx.model, ctx.opts.heatmap);
    return (
      `${rows} ${rows === 1 ? 'row' : 'rows'} x ${cols} ${cols === 1 ? 'column' : 'columns'} ` +
      `(${rows * cols} cells), color scale from ${formatValue(min)} to ${formatValue(max)}`
    );
  },

  keyboardNav(model) {
    // Row-major: Left/Right walk columns (pi), Up/Down walk rows (si).
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const s = ctx.model.series[pos.si];
    if (!extra || !s) return null;
    const rowIdx = extra.rows.findIndex((row) => row.si === pos.si);
    const label = extra.colLabels[pos.pi] ?? String(pos.pi + 1);
    const y = s.points[pos.pi]?.y ?? null;
    const value = y === null ? 'no value' : formatValue(y);
    return `${label}: ${value}. ${s.name}, row ${rowIdx + 1} of ${extra.rows.length}, column ${
      pos.pi + 1
    } of ${extra.cols}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const extra = extraOf(ctx.geom);
    if (extra) {
      const label = extra.colLabels[hit.pi];
      if (label !== undefined) tp.formattedX = label;
      const row = extra.rows.find((rw) => rw.si === hit.si);
      const cell = row?.cells[hit.pi];
      if (cell) tp.color = cell.color;
    }
    return [tp];
  },
};
