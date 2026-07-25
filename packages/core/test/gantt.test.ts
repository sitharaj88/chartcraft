/**
 * gantt (v0.3): pure schedule math (task parsing/validation, swimlane rows,
 * row heights, humanized durations), the time-axis geometry through the
 * pipeline's TimeScale, and the cross-cutting requirements (legend policy,
 * a11y table, renderer smoke, tooltip, keyboard nav, events).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFlowChartTypes } from '../src/charts/flow';
registerFlowChartTypes();
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
  GANTT_MAX_BAR_HEIGHT,
  MS_DAY,
} from '../src/charts/flow/schedule';
import { lightTheme } from '../src/theme';
import type { ChartData, DataValue } from '../src/types';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

afterEach(cleanupDom);

const d = (day: number, hour = 0): Date => new Date(2024, 0, day, hour);
const ms = (day: number, hour = 0): number => d(day, hour).getTime();

const plan = (points: unknown[], name = 'Plan'): ChartData => ({
  series: [{ name, data: points as DataValue[] }],
});

/** Three ungrouped tasks across Jan 1 → Jan 21 (a 20-day span). */
const tasks3 = [
  { x: 'T1', start: d(1), end: d(11) },
  { x: 'T2', start: d(6), end: d(16) },
  { x: 'T3', start: d(11), end: d(21) },
];

/** Two swimlanes, interleaved in data order. */
const laned = [
  { x: 'A1', start: d(1), end: d(11), group: 'Design' },
  { x: 'A2', start: d(6), end: d(16), group: 'Build' },
  { x: 'A3', start: d(11), end: d(21), group: 'Design' },
  { x: 'A4', start: d(16), end: d(21), group: 'Build' },
];

/** Reconstruct drawn rounded-rect bars from the canvas call log. */
function barRects(el: HTMLElement): { x: number; y: number; w: number }[] {
  const calls = ctxOf(el).__calls;
  const out: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i + 2 < calls.length; i++) {
    if (calls[i]!.method !== 'moveTo' || calls[i + 1]!.method !== 'lineTo' || calls[i + 2]!.method !== 'arcTo') continue;
    const [mx, my] = calls[i]!.args as number[];
    const x = (mx as number) - 4; // moveTo(x + radius, y)
    out.push({ x, y: my as number, w: ((calls[i + 2]!.args as number[])[0] as number) - x });
  }
  return out;
}

describe('gantt task parsing & validation', () => {
  it('reads labels, spans and groups; extra series become swimlanes', () => {
    const parsed = parseGanttTasks([
      { name: 'Phase 1', data: [{ x: 'T1', start: d(1), end: d(3) }] as DataValue[] },
      { name: 'Phase 2', data: [{ label: 'T2', start: ms(2), end: ms(5), group: 'Explicit' }] as DataValue[] },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ label: 'T1', start: ms(1), end: ms(3), group: 'Phase 1', seriesIndex: 0 });
    // An explicit per-point group always wins over the series name.
    expect(parsed[1]).toMatchObject({ label: 'T2', group: 'Explicit', pointIndex: 0 });
    expect(ganttGroups(parsed)).toEqual(['Phase 1', 'Explicit']);
  });

  it('accepts low/high as the span and treats null entries as gaps', () => {
    const parsed = parseGanttTasks([
      { name: 'S', data: [{ x: 'T', low: ms(1), high: ms(2) }, null] as DataValue[] },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ start: ms(1), end: ms(2) });
    expect(parsed[0]!.group).toBeUndefined(); // a single series is not a swimlane
    expect(parseGanttTasks([])).toEqual([]);
  });

  it('rejects end < start, missing bounds and non-object entries — naming the task', () => {
    expect(() => parseGanttTasks([{ name: 'S', data: [{ x: 'Design', start: d(5), end: d(2) }] as DataValue[] }])).toThrow(
      /task 'Design' ends before it starts \(start 2024-01-05, end 2024-01-02\)\. Every task needs end >= start\./,
    );
    expect(() => parseGanttTasks([{ name: 'S', data: [{ x: 'Design', start: d(5) }] as DataValue[] }])).toThrow(
      /task 'Design' \(series 'S', entry 0\) needs both 'start' and 'end'/,
    );
    expect(() => parseGanttTasks([{ name: 'S', data: [5] as DataValue[] }])).toThrow(
      /objects \{ x: label, start, end, group\? \} — series 'S' entry 0 is a bare number/,
    );
  });
});

describe('gantt rows, sizing & duration formatting', () => {
  it('rows follow data order without groups, and group into labelled swimlanes with groups', () => {
    const flat = parseGanttTasks([{ name: 'S', data: tasks3 as DataValue[] }]);
    expect(buildGanttRows(flat).map((r) => `${r.kind}:${r.label}`)).toEqual(['task:T1', 'task:T2', 'task:T3']);

    const lanes = parseGanttTasks([{ name: 'S', data: laned as DataValue[] }]);
    const rows = buildGanttRows(lanes);
    expect(rows.map((r) => `${r.kind}:${r.label}`)).toEqual([
      'group:Design',
      'task:A1',
      'task:A3',
      'group:Build',
      'task:A2',
      'task:A4',
    ]);
    // dataIndex = the ROW-order task index.
    expect(rows.filter((r) => r.kind === 'task').map((r) => (r.kind === 'task' ? r.taskIndex : -1))).toEqual([0, 1, 2, 3]);
    expect(ganttTasksInRowOrder(rows).map((t) => t.label)).toEqual(['A1', 'A3', 'A2', 'A4']);
  });

  it('spans the whole schedule, widens a zero-length one, and fits or honors rowHeight', () => {
    const flat = parseGanttTasks([{ name: 'S', data: tasks3 as DataValue[] }]);
    expect(ganttTimeDomain(flat)).toEqual([ms(1), ms(21)]);
    const point = parseGanttTasks([{ name: 'S', data: [{ x: 'M', start: ms(3), end: ms(3) }] as DataValue[] }]);
    expect(ganttTimeDomain(point)).toEqual([ms(3), ms(3) + MS_DAY]);
    expect(ganttTimeDomain([])).toBeNull();

    expect(resolveGanttRowHeight(6, 354)).toBe(59); // default: fit
    expect(resolveGanttRowHeight(6, 354, 40)).toBe(40); // explicit wins
    expect(ganttBarHeight(36)).toBe(28); // row - 4px padding each side
    expect(ganttBarHeight(118)).toBe(GANTT_MAX_BAR_HEIGHT); // capped
    expect(ganttBarHeight(5)).toBe(2); // never invisible
  });

  it('humanizes durations with the largest unit reached (no calendar units)', () => {
    expect(formatDuration(3 * MS_DAY)).toBe('3d');
    expect(formatDuration(1.5 * MS_DAY)).toBe('1.5d');
    expect(formatDuration(36 * 3600e3)).toBe('1.5d'); // 36h is still days
    expect(formatDuration(0)).toBe('0d'); // milestone
    expect(formatDuration(90 * 60e3)).toBe('1.5h');
    expect(formatDuration(45 * 60e3)).toBe('45m');
    expect(formatDuration(30e3)).toBe('30s');
    expect(formatDuration(7 * MS_DAY)).toBe('7d'); // never '1w'
  });

  it('formats schedule dates as local YYYY-MM-DD, adding the time for short spans', () => {
    expect(formatScheduleDate(ms(5, 9))).toBe('2024-01-05');
    expect(formatScheduleDate(ms(5, 9), 20 * MS_DAY)).toBe('2024-01-05');
    expect(formatScheduleDate(ms(5, 9), MS_DAY)).toBe('2024-01-05 09:00');
  });
});

describe('gantt rendering on the time axis', () => {
  it('positions bars from the pipeline TimeScale, with 4px rounded ends both sides', () => {
    const { el } = mount({ type: 'gantt', data: plan(tasks3) });
    // 576px / 20 days = 28.8px per day, starting at the plot's left edge (12).
    expect(barRects(el)).toEqual([
      { x: 12, y: 57, w: 288 },
      { x: 156, y: 175, w: 288 },
      { x: 300, y: 293, w: 288 },
    ]);
    // Rounded on BOTH ends: 4 corner arcs per bar, radius 4.
    const arcs = ctxOf(el).__calls.filter((c) => c.method === 'arcTo');
    expect(arcs).toHaveLength(12);
    expect(arcs.every((c) => (c.args as number[])[4] === 4)).toBe(true);
    // Direct task labels (marks), then the calendar-aligned time ticks: the
    // time axis chrome is the PIPELINE's now, and the documented overlay order
    // paints axis chrome AFTER the marks.
    expect(paintedText(el)).toEqual(['T1', 'T2', 'T3', 'Jan 1', 'Jan 8', 'Jan 15']);
  });

  it('lays swimlanes out as header row + lane rows at exact row positions', () => {
    const { el } = mount({ type: 'gantt', data: plan(laned) });
    // 6 rows over 354px = 59px each; 28px bars centered => rowY + 15.5.
    expect(barRects(el).map((r) => r.y)).toEqual([86.5, 145.5, 263.5, 322.5]);
    const texts = ctxOf(el).__calls.filter((c) => c.method === 'fillText');
    const headers = texts.filter((c) => c.args[0] === 'Design' || c.args[0] === 'Build');
    // Header rows are drawn at the plot's left edge, centered in their row.
    expect(headers.map((c) => [c.args[0], c.args[1], c.args[2]])).toEqual([
      ['Design', 12, 41.5],
      ['Build', 12, 218.5],
    ]);
    // Lane color = categorical slot in first-seen group order.
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain(lightTheme.series[0]);
    expect(fills).toContain(lightTheme.series[1]);
  });

  it('honors gantt.rowHeight', () => {
    const { el } = mount({ type: 'gantt', data: plan(tasks3), gantt: { rowHeight: 40 } });
    expect(barRects(el).map((r) => r.y)).toEqual([18, 58, 98]);
  });

  it('draws the today marker as a 2px dashed line at its time position, with a label', () => {
    const { el } = mount({ type: 'gantt', data: plan(tasks3), gantt: { today: d(6) } });
    const calls = ctxOf(el).__calls;
    // Jan 6 = 5 days in = 12 + 5 * 28.8 = 156; the line spans the rows area.
    const at156 = calls.filter((c) => c.method === 'moveTo' && (c.args as number[])[0] === 156);
    expect(at156).toHaveLength(1);
    expect(at156[0]!.args).toEqual([156, 12]);
    const i = calls.indexOf(at156[0]!);
    expect(calls[i + 1]!.args).toEqual([156, 366]); // down to the axis line
    expect(calls.some((c) => c.method === 'setLineDash' && JSON.stringify(c.args[0]) === '[4,4]')).toBe(true);
    expect(ctxOf(el).__props.some((p) => p.prop === 'lineWidth' && p.value === 2)).toBe(true);
    expect(paintedText(el)).toContain('Today');
  });

  it('skips a today marker that falls outside the schedule', () => {
    const { el } = mount({ type: 'gantt', data: plan(tasks3), gantt: { today: new Date(2024, 1, 1) } });
    expect(paintedText(el)).not.toContain('Today');
  });

  it('drops labels that do not fit the bar, then to the right, then tooltip-only', () => {
    const long = [
      { x: 'A-very-long-task-name-that-cannot-fit', start: d(1), end: d(2) },
      { x: 'Fits', start: d(1), end: d(21) },
    ];
    const { el } = mount({ type: 'gantt', data: plan(long) });
    const texts = paintedText(el);
    expect(texts).toContain('Fits');
    // 28.8px of bar cannot hold the long name: it moves to the right of the bar.
    expect(texts).toContain('A-very-long-task-name-that-cannot-fit');
    // With no room on either side it is dropped entirely (tooltip only).
    const cramped = mount({ type: 'gantt', data: plan([long[0]!]), width: 90, height: 120 });
    expect(paintedText(cramped.el)).not.toContain('A-very-long-task-name-that-cannot-fit');
  });

  it('renders no bars for an empty schedule', () => {
    const { el } = mount({ type: 'gantt', data: { series: [] } });
    expect(barRects(el)).toEqual([]);
  });
});

describe('gantt legend, a11y, interaction', () => {
  it('legend is hidden by default and lists swimlanes (non-toggleable) when asked', () => {
    const { el } = mount({ type: 'gantt', data: plan(laned) });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');

    const shown = mount({ type: 'gantt', data: plan(laned), legend: true });
    const items = [...shown.el.querySelectorAll<HTMLButtonElement>('.chartcraft-legend-item')];
    expect(items.map((i) => i.querySelector('.chartcraft-legend-label')!.textContent)).toEqual(['Design', 'Build']);
    expect(items.every((i) => i.disabled)).toBe(true);
  });

  it('a11y table = task, group, start, end, duration in row order', () => {
    const { el, chart } = mount({ type: 'gantt', data: plan(laned) });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Task',
      'Group',
      'Start',
      'End',
      'Duration',
    ]);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['A1', 'Design', '2024-01-01', '2024-01-11', '10d'],
      ['A3', 'Design', '2024-01-11', '2024-01-21', '10d'],
      ['A2', 'Build', '2024-01-06', '2024-01-16', '10d'],
      ['A4', 'Build', '2024-01-16', '2024-01-21', '5d'],
    ]);
    expect(chart.exportData().split('\n')[1]).toBe('A1,Design,2024-01-01,2024-01-11,10d');
    // Ungrouped schedules print an em dash for the group.
    const flat = mount({ type: 'gantt', data: plan(tasks3) });
    const first = flat.el.querySelector('.chartcraft-a11y-table tbody tr') as HTMLTableRowElement;
    expect([...first.children].map((c) => c.textContent)).toEqual(['T1', '—', '2024-01-01', '2024-01-11', '10d']);
  });

  it('hit-tests the full row band and fires point events with the row-order index', () => {
    const { el, chart } = mount({ type: 'gantt', data: plan(tasks3) });
    const onEnter = vi.fn();
    const onClick = vi.fn();
    chart.on('pointenter', onEnter);
    chart.on('pointclick', onClick);

    pointerMove(el, 100, 20); // row 0 (rows are 118px tall), left of the bar's y
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ seriesName: 'Plan', dataIndex: 0 });
    pointerMove(el, 400, 200); // row 1, inside T2's bar
    expect(onEnter.mock.calls[1]![0]).toMatchObject({ dataIndex: 1 });
    pointerMove(el, 560, 20); // row 0 but far right of T1's bar: no hit
    expect((document.querySelector('.chartcraft-tooltip') as HTMLElement).style.display).toBe('none');

    key(el, 'ArrowRight');
    key(el, 'Enter');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0]).toMatchObject({ dataIndex: 0, clientX: -1 });
  });

  it('tooltip shows the span and duration; the swimlane names the row', () => {
    const { el } = mount({ type: 'gantt', data: plan(laned) });
    pointerMove(el, 100, 90); // A1, first lane row
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).not.toBe('none');
    expect(tip.innerHTML).toContain('>A1<');
    expect(tip.innerHTML).toContain('2024-01-01 → 2024-01-11 · 10d');
    expect(tip.innerHTML).toContain('Design');
  });

  it('keyboard walks tasks in row order with span announcements', () => {
    const { el } = mount({ type: 'gantt', data: plan(laned) });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A1 (Design): 2024-01-01 to 2024-01-11, 10d. Task 1 of 4.');
    key(el, 'ArrowRight');
    expect(region.textContent).toBe('A3 (Design): 2024-01-11 to 2024-01-21, 10d. Task 2 of 4.');
    key(el, 'End');
    expect(region.textContent).toBe('A4 (Build): 2024-01-16 to 2024-01-21, 5d. Task 4 of 4.');
    key(el, 'Escape');
    expect(region.textContent).toBe('');
  });

  it('fails fast on an invalid schedule at createChart time', () => {
    expect(() => mount({ type: 'gantt', data: plan([{ x: 'Bad', start: d(5), end: d(2) }]) })).toThrow(
      /ends before it starts/,
    );
  });
});
