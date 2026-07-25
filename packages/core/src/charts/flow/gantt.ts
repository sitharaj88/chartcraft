/**
 * Gantt chart-type definition (v0.3 contract).
 *
 * Horizontal task bars on a TIME x-axis: rows are tasks (optionally grouped
 * into swimlanes by `group`, each lane preceded by a header row in
 * `textSecondary`), bars have 4px rounded ends on both sides, and
 * `gantt.today` draws a 2px dashed marker with a label.
 *
 * Both the x SCALE and its CHROME are the pipeline's. The definition declares
 * `needs.axes: 'rows'` — the v0.3 arrangement that pairs the band (category)
 * axis on screen-y with the continuous DATA axis on screen-x — plus
 * `axisChrome: { x: true, y: false }`. `computeCartesianLayout` then builds a
 * real `TimeScale` (calendar-aligned ticks) over the schedule's extent, which
 * `resolveOptions` pins with `xAxis.type: 'time'` + `xAxis.min/max`, reserves
 * the bottom strip for its labels, and draws the time axis line, its tick
 * labels, its title and the time gridlines. This module draws only what is
 * genuinely its own: the swimlane header rows, the bars and the today marker.
 *
 * All schedule math is pure and lives in ./schedule.ts.
 */
import type { DataPoint, TooltipPoint } from '../../types';
import type { PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import type { ChartTypeDefinition, DefinitionContext } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import type { DecorationLayer } from '../../decorate';
import { TimeScale } from '../../scales/time';
import { LinearScale } from '../../scales/linear';
import { HIT_RADIUS } from '../../interaction/hittest';
import { contrastInk } from '../matrix/color-scale';
import { fitText, firstVisibleSeries, hideLegendByDefault, singleSeriesData } from './shared';
import {
  buildGanttRows,
  formatDuration,
  formatScheduleDate,
  ganttBarHeight,
  ganttGroups,
  ganttTasksInRowOrder,
  ganttTimeDomain,
  parseGanttTasks,
  resolveGanttRowHeight,
  GANTT_BAR_RADIUS,
  GANTT_MIN_BAR_WIDTH,
  type GanttRow,
  type GanttTask,
} from './schedule';

/** Padding between a bar edge and its direct label. */
export const GANTT_LABEL_PAD = 4;
/** Dashed "today" marker: 2px wide (contract). */
export const GANTT_TODAY_WIDTH = 2;
export const GANTT_TODAY_DASH: number[] = [4, 4];
export const GANTT_TODAY_LABEL = 'Today';

export interface GanttBarLabel {
  text: string;
  x: number;
  y: number;
  color: string;
  /** true when the label sits inside the bar (contrasting ink). */
  inside: boolean;
}

export interface GanttBar {
  task: GanttTask;
  /** Row-order task index = `dataIndex`. */
  taskIndex: number;
  x: number;
  w: number;
  y: number;
  h: number;
  /** The full row band (the hit target). */
  rowY: number;
  rowH: number;
  color: string;
  label: GanttBarLabel | null;
}

export interface GanttGeomExtra {
  rows: GanttRow[];
  /** Rows area (the plot minus the bottom axis strip). */
  rowsRect: Rect;
  rowHeight: number;
  barHeight: number;
  /** Indexed by row-order task index. */
  bars: GanttBar[];
  headers: { label: string; x: number; y: number }[];
  ticks: { pos: number; label: string }[];
  /** Baseline y of the time axis. */
  axisY: number;
  today: { x: number; label: string } | null;
  groups: string[];
  spanMs: number;
  si: number;
}

function extraOf(geom: TypeGeom): GanttGeomExtra | null {
  return (geom.extra as GanttGeomExtra | undefined) ?? null;
}

function taskToPoint(task: GanttTask): DataPoint {
  const p: DataPoint = {
    // x = the start instant: it is what the TIME axis (and events) address.
    x: new Date(task.start),
    label: task.label,
    start: task.start,
    end: task.end,
    // The contract lists low/high as a "gantt span" too: carrying them makes
    // the span part of the generic value extent and gives `y` a value (the
    // normalizer falls y back to `low`).
    low: task.start,
    high: task.end,
  };
  if (task.group !== undefined) p.group = task.group;
  if (task.color !== undefined) p.color = task.color;
  return p;
}

/** Bar fill: explicit point color, else the swimlane's categorical slot. */
export function ganttTaskColor(
  task: GanttTask,
  groups: readonly string[],
  theme: { series: string[] },
): string {
  if (task.color !== undefined) return task.color;
  const slot = task.group === undefined ? 0 : Math.max(0, groups.indexOf(task.group));
  return theme.series[slot % theme.series.length] ?? '#888888';
}

export const ganttDefinition: ChartTypeDefinition = {
  id: 'gantt',
  // Task rows on screen-y, a continuous TIME axis on screen-x, and only the
  // time axis wears chrome (a list of rows has nothing to tick).
  needs: { cartesianAxes: true, axes: 'rows', axisChrome: { x: true, y: false }, xScale: 'auto' },

  resolveOptions(resolved, raw) {
    const tasks = parseGanttTasks(resolved.data.series);
    if (resolved.data.series.length > 0) {
      const ordered = ganttTasksInRowOrder(buildGanttRows(tasks));
      resolved.data = singleSeriesData(resolved.data, 'Tasks', ordered.map(taskToPoint));
    }
    // Pin a TIME axis spanning every task (starts alone would clip the bars).
    const domain = ganttTimeDomain(tasks);
    const xAxis = { ...resolved.xAxis, type: 'time' as const };
    if (domain) {
      if (typeof xAxis.min !== 'number') xAxis.min = domain[0];
      if (typeof xAxis.max !== 'number') xAxis.max = domain[1];
    }
    // A gantt's useful grid runs along the TIME axis — the opposite of the
    // generic "grid on y, not on x" default, because the cross axis is a list
    // of rows. Now that the pipeline owns the grid, say so in the options.
    if (xAxis.grid === undefined) xAxis.grid = true;
    resolved.xAxis = xAxis;
    // Task bars are labelled directly / listed in the table: no legend unless
    // the caller asks (then it lists the swimlanes).
    hideLegendByDefault(resolved, raw);
  },

  layout(ctx): TypeGeom {
    const { opts, theme, model, layout: L } = ctx;
    const si = firstVisibleSeries(model);
    const pos: (PointPos | null)[][] = model.series.map(() => []);
    const tasks = si < 0 ? [] : parseGanttTasks(opts.data.series);
    const rows = buildGanttRows(tasks);
    const ordered = ganttTasksInRowOrder(rows);
    const groups = ganttGroups(tasks);

    // The pipeline already reserved the bottom axis strip (per-axis chrome), so
    // the plot rect IS the rows area and its bottom edge IS the time axis line.
    const rowsRect: Rect = { x: L.plot.x, y: L.plot.y, w: L.plot.w, h: L.plot.h };
    const axisY = rowsRect.y + rowsRect.h;
    const rowHeight = resolveGanttRowHeight(rows.length, rowsRect.h, opts.gantt?.rowHeight);
    const barHeight = ganttBarHeight(rowHeight);

    const scale = L.xScale instanceof TimeScale || L.xScale instanceof LinearScale ? L.xScale : null;
    const domain = scale ? scale.domain() : [0, 1];
    const spanMs = Math.abs((domain[1] ?? 1) - (domain[0] ?? 0));
    const toPx = (ms: number): number => (scale ? scale.scale(ms) : rowsRect.x);

    const font = `${theme.fontSize}px ${theme.fontFamily}`;
    const measure = (t: string): number => ctx.measure(t, font);

    const bars: GanttBar[] = [];
    const headers: { label: string; x: number; y: number }[] = [];
    rows.forEach((row, ri) => {
      const rowY = rowsRect.y + ri * rowHeight;
      if (row.kind === 'group') {
        headers.push({ label: row.label, x: rowsRect.x, y: rowY + rowHeight / 2 });
        return;
      }
      const x0 = toPx(row.task.start);
      const x1 = toPx(row.task.end);
      const x = Math.min(x0, x1);
      const w = Math.max(GANTT_MIN_BAR_WIDTH, Math.abs(x1 - x0));
      const y = rowY + (rowHeight - barHeight) / 2;
      const color = ganttTaskColor(row.task, groups, theme);

      // Direct label: inside the bar when the WHOLE label fits (an ellipsized
      // "A…" inside a narrow bar tells the reader nothing), else just right of
      // the bar, else tooltip-only. Measured — never guessed.
      let label: GanttBarLabel | null = null;
      const fitsInside = barHeight >= theme.fontSize && measure(row.task.label) <= w - GANTT_LABEL_PAD * 2;
      if (fitsInside) {
        label = {
          text: row.task.label,
          x: x + GANTT_LABEL_PAD,
          y: y + barHeight / 2,
          color: contrastInk(color),
          inside: true,
        };
      } else {
        const room = rowsRect.x + rowsRect.w - (x + w) - GANTT_LABEL_PAD;
        const outer = fitText(row.task.label, room, measure);
        if (outer) {
          label = {
            text: outer,
            x: x + w + GANTT_LABEL_PAD,
            y: y + barHeight / 2,
            color: theme.textSecondary,
            inside: false,
          };
        }
      }
      bars[row.taskIndex] = {
        task: row.task,
        taskIndex: row.taskIndex,
        x,
        w,
        y,
        h: barHeight,
        rowY,
        rowH: rowHeight,
        color,
        label,
      };
    });

    // Calendar-aware time ticks: the PIPELINE computed them (same TimeScale,
    // same nice() calendar alignment, same `xAxis.ticks.format`). Retained on
    // `extra` because the today marker and the announcements read them.
    const ticks = L.xTicks.map((t) => ({ pos: t.pos, label: t.label }));

    // "today" marker — only when it falls inside the schedule's extent.
    const todayRaw = opts.gantt?.today;
    const todayMs = todayRaw instanceof Date ? todayRaw.getTime() : typeof todayRaw === 'number' ? todayRaw : null;
    const lo = Math.min(domain[0] ?? 0, domain[1] ?? 0);
    const hi = Math.max(domain[0] ?? 0, domain[1] ?? 0);
    const today =
      todayMs !== null && Number.isFinite(todayMs) && todayMs >= lo && todayMs <= hi
        ? { x: toPx(todayMs), label: GANTT_TODAY_LABEL }
        : null;

    if (si >= 0) {
      pos[si] = ordered.map((_, i) => {
        const bar = bars[i];
        if (!bar) return null;
        const cy = bar.y + bar.h / 2;
        return { x: bar.x + bar.w / 2, y: cy, y0: cy };
      });
    }

    return {
      pos,
      slices: null,
      bars: null,
      extra: {
        rows,
        rowsRect,
        rowHeight,
        barHeight,
        bars,
        headers,
        ticks,
        axisY,
        today,
        groups,
        spanMs,
        si,
      } satisfies GanttGeomExtra,
    };
  },

  render(ctx: RenderContext) {
    const { r, theme, hover } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return;
    const font = `${theme.fontSize}px ${theme.fontFamily}`;

    for (const bar of extra.bars) {
      if (!bar) continue;
      const hovered = hover !== null && hover.si === extra.si && hover.pi === bar.taskIndex;
      // 4px rounded ends on BOTH sides (contract).
      r.rect(bar.x, bar.y, bar.w, bar.h, {
        fill: bar.color,
        radii: [GANTT_BAR_RADIUS, GANTT_BAR_RADIUS, GANTT_BAR_RADIUS, GANTT_BAR_RADIUS],
        ...(hovered ? { stroke: { color: theme.textPrimary, width: 1 } } : {}),
      });
      if (bar.label) {
        r.text(bar.label.text, bar.label.x, bar.label.y, {
          font,
          // Ink colors only: contrasting ink inside, textSecondary outside.
          color: bar.label.color,
          baseline: 'middle',
        });
      }
    }
  },

  decorations(ctx: RenderContext, layer: DecorationLayer) {
    const { r, theme } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra) return;
    const font = `${theme.fontSize}px ${theme.fontFamily}`;

    if (layer === 'under') {
      // Swimlane header rows — the only cross-axis labelling a gantt has, and
      // the one thing the pipeline's band axis cannot draw (a lane header is
      // not a tick: it labels a group of rows, in `textSecondary`).
      for (const h of extra.headers) {
        r.text(h.label, h.x, h.y, { font, color: theme.textSecondary, baseline: 'middle' });
      }
      return;
    }

    // 'over': the today marker sits above the bars (a reference mark).
    if (!extra.today) return;
    r.line(extra.today.x, extra.rowsRect.y, extra.today.x, extra.axisY, {
      color: theme.textSecondary,
      width: GANTT_TODAY_WIDTH,
      dash: GANTT_TODAY_DASH,
    });
    r.text(extra.today.label, extra.today.x, extra.rowsRect.y + 2, {
      font,
      color: theme.textSecondary,
      align: 'center',
      baseline: 'top',
    });
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    for (const bar of extra.bars) {
      if (!bar) continue;
      if (py < bar.rowY || py > bar.rowY + bar.rowH) continue;
      // Full row band vertically; the bar plus a generous margin horizontally.
      if (px >= bar.x - HIT_RADIUS && px <= bar.x + bar.w + HIT_RADIUS) {
        return { si: extra.si, pi: bar.taskIndex };
      }
    }
    return null;
  },

  legendItems(ctx: DefinitionContext): LegendItem[] {
    const tasks = parseGanttTasks(ctx.opts.data.series);
    const groups = ganttGroups(tasks);
    // Swimlanes, non-toggleable (a lane is not a series).
    return groups.map((group, i) => ({
      id: `group:${group}`,
      name: group,
      color: ctx.theme.series[i % ctx.theme.series.length] ?? '#888888',
      visible: true,
      toggleable: false,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const tasks = parseGanttTasks(ctx.opts.data.series);
    const ordered = ganttTasksInRowOrder(buildGanttRows(tasks));
    const domain = ganttTimeDomain(tasks);
    const span = domain ? domain[1] - domain[0] : 0;
    return {
      columns: ['Task', 'Group', 'Start', 'End', 'Duration'],
      rows: ordered.map((t) => ({
        header: t.label,
        cells: [
          t.group ?? '—',
          formatScheduleDate(t.start, span),
          formatScheduleDate(t.end, span),
          formatDuration(t.end - t.start),
        ],
      })),
    };
  },

  /**
   * A schedule is TASKS over a DATE SPAN. There is no value axis (`axes: 'rows'`)
   * so the generic range clause is suppressed; without a summary the accessible
   * name would be reduced to a bare count.
   */
  a11ySummary(ctx): string | null {
    const tasks = parseGanttTasks(ctx.opts.data.series);
    if (tasks.length === 0) return 'no tasks';
    const domain = ganttTimeDomain(tasks);
    const parts = [`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`];
    const groups = new Set(tasks.map((t) => t.group).filter((g) => g !== undefined));
    if (groups.size > 0) parts.push(`${groups.size} ${groups.size === 1 ? 'swimlane' : 'swimlanes'}`);
    if (domain) {
      const span = domain[1] - domain[0];
      parts.push(
        `${formatScheduleDate(domain[0], span)} to ${formatScheduleDate(domain[1], span)} ` +
          `(${formatDuration(span)})`,
      );
    }
    return parts.join(', ');
  },

  keyboardNav(model): NavContext {
    // Tasks in ROW order (the synthetic series is built in that order).
    const si = model.series.findIndex((s) => s.visible);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si && si >= 0 ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const bar = extra?.bars[pos.pi];
    if (!extra || !bar) return null;
    const total = extra.bars.filter((b) => b !== undefined).length;
    const lane = bar.task.group === undefined ? '' : ` (${bar.task.group})`;
    return (
      `${bar.task.label}${lane}: ${formatScheduleDate(bar.task.start, extra.spanMs)} to ` +
      `${formatScheduleDate(bar.task.end, extra.spanMs)}, ${formatDuration(bar.task.end - bar.task.start)}. ` +
      `Task ${pos.pi + 1} of ${total}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const extra = extraOf(ctx.geom);
    const bar = extra?.bars[hit.pi];
    const series = ctx.model.series[hit.si];
    if (!extra || !bar || !series) return [];
    const { task } = bar;
    return [
      {
        seriesId: series.id,
        seriesName: task.group ?? series.name,
        color: bar.color,
        x: task.label,
        y: task.end - task.start,
        formattedX: task.label,
        formattedY:
          `${formatScheduleDate(task.start, extra.spanMs)} → ${formatScheduleDate(task.end, extra.spanMs)} · ` +
          `${formatDuration(task.end - task.start)}`,
      },
    ];
  },
};
