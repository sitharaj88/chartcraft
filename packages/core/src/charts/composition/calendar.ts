/**
 * Calendar heatmap chart-type definition (v0.3 contract).
 *
 * One series of `{ x: Date, y: value }`. Day cells are laid out in WEEK
 * COLUMNS (7 weekday rows), month boundaries are separated by hairlines,
 * weekday labels sit left of the grid in `textMuted`, month labels above it,
 * and the color comes from `calendar.ramp` (default `sequentialPalette`) over
 * the value extent. The legend is the gradient color-scale bar mounted through
 * the registry's `legendCustomEl` hook (heatmap's precedent).
 *
 * TIMEZONE: every date is interpreted in **UTC**, deliberately and without
 * exception. A calendar cell is a calendar DAY, and a day is only well defined
 * against a fixed zone: with local-time arithmetic the same data would land in
 * different cells (and different months) depending on where the browser is, and
 * DST would make some weeks 6 or 8 cells long. So the day of a datum is
 * `floor(timestamp / 86400000)` and every label uses the UTC getters. Construct
 * dates as `new Date(Date.UTC(y, m, d))` or from `'YYYY-MM-DD'` strings (which
 * the platform parses as UTC midnight). `calendar.start`/`end` follow the same
 * rule; a plain number is read as epoch milliseconds.
 *
 * Pure date math only — no external dependency, no `Intl`.
 */
import type { ChartOptions, TooltipPoint } from '../../types';
import type { HoverState, PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { NavContext } from '../../a11y/keyboard';
import type { LegendItem } from '../../components/legend';
import type { DataModel, ResolvedOptions } from '../../model';
import { sequentialPalette } from '../../theme';
import { formatValue } from '../../util';
import { rampColor } from '../matrix/color-scale';
import type {
  ChartTypeDefinition,
  DefinitionContext,
  DefinitionLayoutContext,
  GeomContext,
  TooltipExtractContext,
} from '../registry';
import { HAIRLINE, extraOf, insetRect } from './shared';

/** Milliseconds in a day (UTC days are always exactly this long). */
export const MS_PER_DAY = 86400000;
/** 1px surface gap between day cells (heatmap cell precedent). */
export const CALENDAR_CELL_GAP = 1;
/** Weekday rows in a calendar column. */
export const CALENDAR_ROWS = 7;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ---------------------------------------------------------------------------
// Pure UTC date math

/** UTC day index (days since 1970-01-01) of a Date or epoch-ms value. */
export function dayIndexOf(t: Date | number): number {
  const ms = t instanceof Date ? t.getTime() : t;
  return Math.floor(ms / MS_PER_DAY);
}

/** UTC midnight Date for a day index. */
export function dateOfDay(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

/** Day index from UTC calendar parts. */
export function dayFromParts(year: number, month: number, date: number): number {
  return Math.floor(Date.UTC(year, month, date) / MS_PER_DAY);
}

/** Day of week in UTC, 0 = Sunday (1970-01-01 was a Thursday). */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

/** Grid row of a day for a given week start (0 = Sunday, 1 = Monday). */
export function rowOf(day: number, weekStart: 0 | 1): number {
  return (weekdayOf(day) - weekStart + 7) % 7;
}

/** Day index that begins the (weekStart-aligned) week containing `day`. */
export function weekStartDay(day: number, weekStart: 0 | 1): number {
  return day - rowOf(day, weekStart);
}

/** Day index of the 1st of `day`'s month (UTC). */
export function monthStartDay(day: number): number {
  const d = dateOfDay(day);
  return dayFromParts(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Day index of the 1st of the month AFTER `day`'s month (UTC). */
export function nextMonthStartDay(day: number): number {
  const d = dateOfDay(day);
  return dayFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export interface CalendarMonth {
  /** First day of this month that falls inside the range. */
  firstDay: number;
  /** Day index of the 1st of the month (may precede the range). */
  monthStart: number;
  year: number;
  month: number;
  label: string;
}

/** Months intersecting `[startDay, endDay]`, in order. */
export function monthsInRange(startDay: number, endDay: number): CalendarMonth[] {
  const out: CalendarMonth[] = [];
  if (endDay < startDay) return out;
  let cur = startDay;
  // Hard bound: a range cannot contain more months than it contains days.
  let guard = endDay - startDay + 2;
  while (cur <= endDay && guard-- > 0) {
    const d = dateOfDay(cur);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    out.push({
      firstDay: cur,
      monthStart: monthStartDay(cur),
      year,
      month,
      label: MONTH_NAMES[month] ?? String(month + 1),
    });
    cur = nextMonthStartDay(cur);
  }
  return out;
}

export interface CalendarGrid {
  startDay: number;
  endDay: number;
  weekStart: 0 | 1;
  /** Day index of the first column's week start. */
  columnZeroDay: number;
  weeks: number;
  cellW: number;
  cellH: number;
  rect: Rect;
}

/** Week-column grid over `[startDay, endDay]` inside `rect`. */
export function computeCalendarGrid(
  startDay: number,
  endDay: number,
  weekStart: 0 | 1,
  rect: Rect,
): CalendarGrid {
  const end = Math.max(startDay, endDay);
  const columnZeroDay = weekStartDay(startDay, weekStart);
  const weeks = Math.floor((end - columnZeroDay) / 7) + 1;
  return {
    startDay,
    endDay: end,
    weekStart,
    columnZeroDay,
    weeks,
    cellW: rect.w / weeks,
    cellH: rect.h / CALENDAR_ROWS,
    rect,
  };
}

/** Week column of a day. */
export function columnOf(grid: CalendarGrid, day: number): number {
  return Math.floor((day - grid.columnZeroDay) / 7);
}

/** Day index at a (column, row) grid cell. */
export function dayAtCell(grid: CalendarGrid, column: number, row: number): number {
  return grid.columnZeroDay + column * 7 + row;
}

/** Cell rect of a day, inset by `gap` (returns null for days outside range). */
export function cellRectOf(grid: CalendarGrid, day: number, gap = CALENDAR_CELL_GAP): Rect | null {
  if (day < grid.startDay || day > grid.endDay) return null;
  const c = columnOf(grid, day);
  const r = rowOf(day, grid.weekStart);
  return {
    x: grid.rect.x + c * grid.cellW + gap / 2,
    y: grid.rect.y + r * grid.cellH + gap / 2,
    w: Math.max(0, grid.cellW - gap),
    h: Math.max(0, grid.cellH - gap),
  };
}

export interface CalendarSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Hairline segments separating consecutive months. In a column-major (week
 * column, weekday row) grid the divider between month M and month M+1 whose
 * first day sits at (column c, row r) is:
 *
 * - r === 0: one vertical line down the left edge of column c;
 * - r > 0: a horizontal line across column c at the top of row r, plus a
 *   vertical line down the RIGHT edge of column c for rows 0..r-1 (those cells
 *   still belong to month M while the same rows of column c+1 belong to M+1).
 */
export function monthBoundaryLines(grid: CalendarGrid): CalendarSegment[] {
  const out: CalendarSegment[] = [];
  const months = monthsInRange(grid.startDay, grid.endDay);
  const { rect, cellW, cellH } = grid;
  // The range start is not a boundary — skip the first month.
  for (let i = 1; i < months.length; i++) {
    const day = months[i]?.firstDay;
    if (day === undefined) continue;
    const c = columnOf(grid, day);
    const r = rowOf(day, grid.weekStart);
    const xLeft = rect.x + c * cellW;
    const xRight = xLeft + cellW;
    if (r === 0) {
      out.push({ x1: xLeft, y1: rect.y, x2: xLeft, y2: rect.y + CALENDAR_ROWS * cellH });
      continue;
    }
    const yCut = rect.y + r * cellH;
    out.push({ x1: xLeft, y1: yCut, x2: xRight, y2: yCut });
    out.push({ x1: xRight, y1: rect.y, x2: xRight, y2: yCut });
  }
  return out;
}

/** Weekday row labels for a week start (row 0 first). */
export function weekdayLabels(weekStart: 0 | 1): string[] {
  const out: string[] = [];
  for (let r = 0; r < CALENDAR_ROWS; r++) out.push(WEEKDAY_NAMES[(r + weekStart) % 7] as string);
  return out;
}

/** UTC date label, e.g. `15 Jan 2024`. */
export function formatUTCDate(day: number): string {
  const d = dateOfDay(day);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()] ?? ''} ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Options & color

type CalendarOptions = NonNullable<ChartOptions['calendar']>;

export function calendarWeekStart(opts: Pick<ResolvedOptions, 'calendar'>): 0 | 1 {
  return opts.calendar?.weekStart === 1 ? 1 : 0;
}

/** Resolved ramp (default: the sequential blue palette). */
export function calendarRamp(opts: Pick<ResolvedOptions, 'calendar'>): string[] {
  const ramp = opts.calendar?.ramp;
  return ramp && ramp.length > 0 ? [...ramp] : [...sequentialPalette];
}

/** Value extent over the visible series; a degenerate extent is widened by 1. */
export function calendarValueExtent(model: DataModel): [number, number] {
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
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) return [lo, lo + 1];
  return [lo, hi];
}

/**
 * Day range: `calendar.start`/`end` when given, else the data extent. An empty
 * series falls back to a single day (the epoch) so the grid stays defined.
 */
export function calendarDayRange(
  model: DataModel,
  calendar?: CalendarOptions,
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of model.series) {
    if (!s.visible) continue;
    for (const p of s.points) {
      if (p.xv === null) continue;
      const d = dayIndexOf(p.xv);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
  }
  if (calendar?.start !== undefined) lo = dayIndexOf(calendar.start);
  if (calendar?.end !== undefined) hi = dayIndexOf(calendar.end);
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi) || hi < lo) hi = lo;
  return [lo, hi];
}

// ---------------------------------------------------------------------------
// Definition

export interface CalendarCell {
  day: number;
  /** Point index in the series, or -1 for a day with no datum. */
  pi: number;
  value: number | null;
  rect: Rect;
  color: string;
}

export interface CalendarGeomExtra {
  grid: CalendarGrid;
  cells: CalendarCell[];
  boundaries: CalendarSegment[];
  months: CalendarMonth[];
  weekdays: string[];
  min: number;
  max: number;
  ramp: string[];
  /** MODEL series index the calendar renders (the first one). */
  si: number;
  /** day index -> point index, for hit-testing. */
  dayToPoint: Record<string, number>;
}

/** The rendered series: the first one (the contract's "one series"). */
function calendarSeriesIndex(model: DataModel): number {
  const i = model.series.findIndex((s) => s.visible);
  return i < 0 ? 0 : i;
}

export const calendarDefinition: ChartTypeDefinition = {
  id: 'calendar',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    // The gradient color scale is the value key for every cell — legend "auto"
    // shows it unless the caller explicitly opted out (heatmap's policy).
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawShow === undefined) resolved.legend.show = true;
  },

  layout(ctx: DefinitionLayoutContext): TypeGeom {
    const { model, theme, opts } = ctx;
    const font = axisTickFont(theme);
    const weekStart = calendarWeekStart(opts);
    const weekdays = weekdayLabels(weekStart);
    const [startDay, endDay] = calendarDayRange(model, opts.calendar);

    let labelW = 0;
    for (const w of weekdays) labelW = Math.max(labelW, ctx.measure(w, font));
    const rect = insetRect(ctx.layout.plot, {
      left: Math.ceil(labelW) + 8,
      top: theme.fontSize + 6, // month labels above the grid
    });

    const grid = computeCalendarGrid(startDay, endDay, weekStart, rect);
    const [min, max] = calendarValueExtent(model);
    const ramp = calendarRamp(opts);
    const si = calendarSeriesIndex(model);
    const series = model.series[si];

    // day -> point index (last datum wins for duplicate days).
    const dayToPoint: Record<string, number> = {};
    if (series?.visible) {
      series.points.forEach((p, pi) => {
        if (p.xv === null) return;
        dayToPoint[String(dayIndexOf(p.xv))] = pi;
      });
    }

    const cells: CalendarCell[] = [];
    for (let day = startDay; day <= endDay; day++) {
      const r = cellRectOf(grid, day);
      if (!r) continue;
      const pi = dayToPoint[String(day)];
      const value = pi === undefined ? null : (series?.points[pi]?.y ?? null);
      const explicit = pi === undefined ? undefined : series?.points[pi]?.color;
      cells.push({
        day,
        pi: pi ?? -1,
        value,
        rect: r,
        // Days with no datum read as "no value", never as a ramp step.
        color: value === null ? theme.gridline : (explicit ?? rampColor(ramp, (value - min) / (max - min))),
      });
    }

    const pos: (PointPos | null)[][] = model.series.map((s, i) =>
      i === si && s.visible ? (new Array(s.points.length).fill(null) as (PointPos | null)[]) : [],
    );
    const row = pos[si];
    if (row) {
      for (const cell of cells) {
        if (cell.pi < 0 || cell.pi >= row.length) continue;
        const cy = cell.rect.y + cell.rect.h / 2;
        row[cell.pi] = { x: cell.rect.x + cell.rect.w / 2, y: cy, y0: cy };
      }
    }

    const extra: CalendarGeomExtra = {
      grid,
      cells,
      boundaries: monthBoundaryLines(grid),
      months: monthsInRange(startDay, endDay),
      weekdays,
      min,
      max,
      ramp,
      si,
      dayToPoint,
    };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext): void {
    const { r, theme, geom, hover } = ctx;
    const extra = extraOf<CalendarGeomExtra>(geom);
    if (!extra) return;
    for (const cell of extra.cells) {
      if (cell.rect.w <= 0 || cell.rect.h <= 0) continue;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === cell.pi && cell.pi >= 0;
      r.rect(cell.rect.x, cell.rect.y, cell.rect.w, cell.rect.h, {
        fill: cell.color,
        ...(hovered ? { stroke: { color: theme.textPrimary, width: 1 } } : {}),
      });
    }
  },

  /** Month hairlines under the cells; weekday & month labels over the marks. */
  decorations(ctx: RenderContext, layer): void {
    const { r, theme, geom } = ctx;
    const extra = extraOf<CalendarGeomExtra>(geom);
    if (!extra) return;
    const { grid } = extra;
    const font = axisTickFont(theme);

    if (layer === 'under') return;

    // Month boundaries: hairlines, drawn over the cells so they read as cuts.
    for (const seg of extra.boundaries) {
      r.line(seg.x1, seg.y1, seg.x2, seg.y2, { color: theme.axisLine, width: HAIRLINE });
    }

    // Weekday labels (textMuted, per the contract), strided when rows are tight.
    const stride = grid.cellH >= theme.fontSize + 2 ? 1 : 2;
    extra.weekdays.forEach((label, row) => {
      if (row % stride !== 0) return;
      r.text(label, grid.rect.x - 6, grid.rect.y + (row + 0.5) * grid.cellH, {
        font,
        color: theme.textMuted,
        align: 'right',
        baseline: 'middle',
      });
    });

    // Month labels above the grid, at the column their month begins in.
    let lastRight = -Infinity;
    for (const m of extra.months) {
      const c = columnOf(grid, m.firstDay);
      const x = grid.rect.x + c * grid.cellW;
      if (x < lastRight) continue; // selective: never collide
      r.text(m.label, x, grid.rect.y - 4, {
        font,
        color: theme.textSecondary,
        align: 'left',
        baseline: 'bottom',
      });
      lastRight = x + r.measure(m.label, font) + 6;
    }
  },

  hitTest(ctx: GeomContext, px, py): HoverState | null {
    const extra = extraOf<CalendarGeomExtra>(ctx.geom);
    if (!extra) return null;
    const { grid } = extra;
    const { rect } = grid;
    if (px < rect.x || px >= rect.x + rect.w || py < rect.y || py >= rect.y + rect.h) return null;
    const c = Math.min(grid.weeks - 1, Math.floor((px - rect.x) / grid.cellW));
    const row = Math.min(CALENDAR_ROWS - 1, Math.floor((py - rect.y) / grid.cellH));
    const day = dayAtCell(grid, c, row);
    const pi = extra.dayToPoint[String(day)];
    // Empty days are not hoverable (there is nothing to report).
    if (pi === undefined) return null;
    return { si: extra.si, pi };
  },

  legendItems(): LegendItem[] {
    // The color scale is a custom element; nothing is toggleable.
    return [];
  },

  /** Horizontal gradient color-scale bar with min/max labels in textMuted. */
  legendCustomEl(ctx: DefinitionContext, doc: Document): HTMLElement | null {
    const { theme, model, opts } = ctx;
    const [min, max] = calendarValueExtent(model);
    const ramp = calendarRamp(opts);

    const wrap = doc.createElement('div');
    wrap.className = 'chartcraft-calendar-legend';
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
    bar.className = 'chartcraft-calendar-legend-bar';
    const bs = bar.style;
    bs.display = 'inline-block';
    bs.width = '120px';
    bs.height = '10px';
    bs.borderRadius = '3px';
    bs.background = `linear-gradient(90deg, ${ramp.join(', ')})`;
    bs.flexShrink = '0';

    wrap.append(
      mkLabel(formatValue(min), 'chartcraft-calendar-legend-min'),
      bar,
      mkLabel(formatValue(max), 'chartcraft-calendar-legend-max'),
    );
    return wrap;
  },

  a11yTable(ctx: DefinitionContext): A11yTableSpec {
    const { model, opts } = ctx;
    const si = calendarSeriesIndex(model);
    const series = model.series[si];
    const fmt = opts.yAxis.ticks?.format;
    const rows: A11yTableSpec['rows'] = [];
    for (const p of series?.points ?? []) {
      const day = p.xv === null ? null : dayIndexOf(p.xv);
      rows.push({
        header: day === null ? '—' : formatUTCDate(day),
        cells: [p.y === null ? '—' : fmt ? fmt(p.y) : formatValue(p.y)],
      });
    }
    return { columns: ['Date', series?.name ?? 'Value'], rows };
  },

  /**
   * A calendar draws a cell for EVERY day in its range but only the days that
   * carry a datum are navigable or tabulated, so the accessible name is the one
   * place a reader learns how sparse the year actually is (see QUALITY-AUDIT.md:
   * the no-value cells having no keyboard/table equivalent is a reported gap).
   */
  a11ySummary(ctx): string | null {
    const { model } = ctx;
    const series = model.series[calendarSeriesIndex(model)];
    const days = series?.points.length ?? 0;
    const grid = extraOf<CalendarGeomExtra>(ctx.geom)?.grid;
    if (!grid) return null;
    const span = grid.endDay - grid.startDay + 1;
    const [min, max] = calendarValueExtent(model);
    return (
      `${formatUTCDate(grid.startDay)} to ${formatUTCDate(grid.endDay)} ` +
      `(${span} ${span === 1 ? 'day' : 'days'}), ${days} with data, ` +
      `values from ${formatValue(min)} to ${formatValue(max)}`
    );
  },

  keyboardNav(model): NavContext {
    // Days walk chronologically with Left/Right (data order — a calendar's
    // natural reading order). Only the rendered series participates.
    const si = calendarSeriesIndex(model);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si && (model.series[i]?.visible ?? false),
      pointCount: (i) => (i === si ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos): string | null {
    const s = ctx.model.series[pos.si];
    const p = s?.points[pos.pi];
    if (!s || !p) return null;
    const day = p.xv === null ? null : dayIndexOf(p.xv);
    const value = p.y === null ? 'no value' : formatValue(p.y);
    return `${day === null ? 'unknown date' : formatUTCDate(day)}: ${value}. ${s.name}, day ${
      pos.pi + 1
    } of ${s.points.length}.`;
  },

  tooltipPoints(ctx: TooltipExtractContext, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const p = ctx.model.series[hit.si]?.points[hit.pi];
    if (p && p.xv !== null) tp.formattedX = formatUTCDate(dayIndexOf(p.xv));
    const extra = extraOf<CalendarGeomExtra>(ctx.geom);
    const cell = extra?.cells.find((c) => c.pi === hit.pi);
    if (cell && cell.value !== null) tp.color = cell.color;
    return [tp];
  },
};
