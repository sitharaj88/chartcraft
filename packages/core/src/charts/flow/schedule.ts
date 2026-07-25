/**
 * Gantt schedule math — pure, DOM-free.
 *
 * Input (contract): "one series per swimlane or `group` per point;
 * `{x: label, start, end, group?}`". Both spellings of a span are accepted —
 * `start`/`end` (Date or epoch ms) and the generic range fields `low`/`high`
 * (the `DataPoint` docs list "gantt span" for both) — and every task is
 * validated: a task needs both bounds and `end >= start`.
 *
 * Rows are TASKS in data order; when any task carries a `group` (or the caller
 * supplied more than one series, whose names then act as swimlanes) the rows
 * are grouped into swimlanes, each preceded by a group header row.
 */
import type { DataPoint, DataValue, SeriesOptions } from '../../types';

export const MS_SECOND = 1000;
export const MS_MINUTE = 60 * MS_SECOND;
export const MS_HOUR = 60 * MS_MINUTE;
export const MS_DAY = 24 * MS_HOUR;

/** Vertical padding between a row's edge and its bar. */
export const GANTT_ROW_PAD = 4;
/** Bars never grow past this, however tall the row is. */
export const GANTT_MAX_BAR_HEIGHT = 28;
/** Milestones (zero-length tasks) still get a visible sliver. */
export const GANTT_MIN_BAR_WIDTH = 2;
/** 4px rounded ends on BOTH sides (contract). */
export const GANTT_BAR_RADIUS = 4;

const ERR = '@chartcraft/core: gantt';

export interface GanttTask {
  label: string;
  /** Swimlane, or undefined when this chart has no groups. */
  group?: string;
  /** Epoch ms. */
  start: number;
  /** Epoch ms (>= start). */
  end: number;
  /** Explicit per-point color override. */
  color?: string;
  /** Index of the input series the task came from. */
  seriesIndex: number;
  /** Index within that input series. */
  pointIndex: number;
}

function toMs(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/** `YYYY-MM-DD` (local), plus ` HH:MM` for spans under two days. */
export function formatScheduleDate(ms: number, spanMs = 0): string {
  const d = new Date(ms);
  const p2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
  const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  if (spanMs > 0 && spanMs < 2 * MS_DAY) return `${date} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return date;
}

/**
 * Humanized duration. UNIT RULE: the largest unit that the duration reaches —
 * days (>= 1 day, and for a zero-length milestone), hours (>= 1 hour),
 * minutes (>= 1 minute), else seconds — with at most two decimals and trailing
 * zeros trimmed. Weeks/months/years are deliberately NOT used: their length is
 * calendar-dependent, so "1mo" would not be a duration.
 */
export function formatDuration(ms: number): string {
  const d = Math.max(0, ms);
  const [unit, suffix] =
    d >= MS_DAY || d === 0
      ? ([MS_DAY, 'd'] as const)
      : d >= MS_HOUR
        ? ([MS_HOUR, 'h'] as const)
        : d >= MS_MINUTE
          ? ([MS_MINUTE, 'm'] as const)
          : ([MS_SECOND, 's'] as const);
  const v = Math.round((d / unit) * 100) / 100;
  return `${v}${suffix}`;
}

/**
 * Validate and flatten the caller's series into tasks in data order.
 * Throws — naming the task — for a missing bound or `end < start`.
 */
export function parseGanttTasks(series: readonly SeriesOptions[]): GanttTask[] {
  const multi = series.length > 1;
  const tasks: GanttTask[] = [];
  series.forEach((s, si) => {
    const data: readonly DataValue[] = Array.isArray(s.data) ? s.data : [];
    data.forEach((raw, pi) => {
      if (raw === null || raw === undefined) return; // a gap, not a task
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(
          `${ERR} data must be objects { x: label, start, end, group? } — series '${s.name}' entry ${pi} is ` +
            `${typeof raw === 'number' ? 'a bare number' : 'not an object'}.`,
        );
      }
      const p = raw as DataPoint;
      const label = typeof p.x === 'string' ? p.x : (p.label ?? `Task ${tasks.length + 1}`);
      const start = toMs(p.start ?? p.low);
      const end = toMs(p.end ?? p.high);
      if (start === null || end === null) {
        throw new Error(
          `${ERR} task '${label}' (series '${s.name}', entry ${pi}) needs both 'start' and 'end' ` +
            `(a Date or epoch ms).`,
        );
      }
      if (end < start) {
        throw new Error(
          `${ERR} task '${label}' ends before it starts (start ${formatScheduleDate(start)}, ` +
            `end ${formatScheduleDate(end)}). Every task needs end >= start.`,
        );
      }
      const task: GanttTask = { label, start, end, seriesIndex: si, pointIndex: pi };
      const group = p.group ?? (multi ? s.name : undefined);
      if (group !== undefined) task.group = group;
      if (p.color !== undefined) task.color = p.color;
      tasks.push(task);
    });
  });
  return tasks;
}

/** Swimlane names in first-seen order (empty when the chart has no groups). */
export function ganttGroups(tasks: readonly GanttTask[]): string[] {
  const out: string[] = [];
  for (const t of tasks) {
    if (t.group !== undefined && !out.includes(t.group)) out.push(t.group);
  }
  return out;
}

export type GanttRow =
  | { kind: 'group'; label: string; group: string }
  | { kind: 'task'; label: string; task: GanttTask; taskIndex: number };

/**
 * Rows top-to-bottom: ungrouped charts keep data order; grouped charts emit a
 * header row per swimlane (first-seen order) followed by that lane's tasks.
 * `taskIndex` is the ROW-ORDER task index — the type's `dataIndex`.
 */
export function buildGanttRows(tasks: readonly GanttTask[]): GanttRow[] {
  const groups = ganttGroups(tasks);
  const rows: GanttRow[] = [];
  if (groups.length === 0) {
    tasks.forEach((task, i) => rows.push({ kind: 'task', label: task.label, task, taskIndex: i }));
    return rows;
  }
  let taskIndex = 0;
  const ungrouped = tasks.filter((t) => t.group === undefined);
  for (const group of groups) {
    rows.push({ kind: 'group', label: group, group });
    for (const task of tasks) {
      if (task.group !== group) continue;
      rows.push({ kind: 'task', label: task.label, task, taskIndex: taskIndex++ });
    }
  }
  if (ungrouped.length > 0) {
    rows.push({ kind: 'group', label: 'Other', group: 'Other' });
    for (const task of ungrouped) {
      rows.push({ kind: 'task', label: task.label, task, taskIndex: taskIndex++ });
    }
  }
  return rows;
}

/** Tasks in ROW order (what `dataIndex` / keyboard navigation address). */
export function ganttTasksInRowOrder(rows: readonly GanttRow[]): GanttTask[] {
  const out: GanttTask[] = [];
  for (const row of rows) if (row.kind === 'task') out.push(row.task);
  return out;
}

/** The time extent every task fits inside (null when there are no tasks). */
export function ganttTimeDomain(tasks: readonly GanttTask[]): [number, number] | null {
  if (tasks.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of tasks) {
    if (t.start < lo) lo = t.start;
    if (t.end > hi) hi = t.end;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  // A zero-width domain has no scale: widen by a day so single-instant
  // schedules still render (and the time ticks stay calendar-aligned).
  return lo === hi ? [lo, lo + MS_DAY] : [lo, hi];
}

/** `gantt.rowHeight` honored; default = fit every row into `availH`. */
export function resolveGanttRowHeight(rowCount: number, availH: number, explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return Math.max(1, explicit);
  if (rowCount <= 0) return Math.max(1, availH);
  return Math.max(1, availH / rowCount);
}

/** Bar height inside a row: row minus 4px padding each side, capped at 28px. */
export function ganttBarHeight(rowHeight: number): number {
  return Math.max(2, Math.min(GANTT_MAX_BAR_HEIGHT, rowHeight - GANTT_ROW_PAD * 2));
}
