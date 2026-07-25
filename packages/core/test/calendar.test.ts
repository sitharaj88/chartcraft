/**
 * Calendar (v0.3): UTC day cells in week columns, hairline month boundaries,
 * gradient scale legend, chronological keyboard walk.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompositionChartTypes } from '../src/charts/composition';
import {
  CALENDAR_CELL_GAP,
  CALENDAR_ROWS,
  MS_PER_DAY,
  calendarDayRange,
  calendarRamp,
  calendarValueExtent,
  cellRectOf,
  columnOf,
  computeCalendarGrid,
  dayAtCell,
  dayFromParts,
  dayIndexOf,
  formatUTCDate,
  monthBoundaryLines,
  monthsInRange,
  rowOf,
  weekStartDay,
  weekdayLabels,
  weekdayOf,
} from '../src/charts/composition/calendar';
import { sequentialPalette } from '../src/theme';
import type { DataModel } from '../src/model';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerCompositionChartTypes();
afterEach(cleanupDom);

const JAN1 = dayFromParts(2024, 0, 1); // a Monday
const JAN31 = dayFromParts(2024, 0, 31);
const FEB1 = dayFromParts(2024, 1, 1); // a Thursday
const FEB29 = dayFromParts(2024, 1, 29);

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m, d));

const data = (): { series: { name: string; data: { x: Date; y: number }[] }[] } => ({
  series: [
    {
      name: 'Visits',
      data: [
        { x: utc(2024, 0, 1), y: 5 },
        { x: utc(2024, 0, 15), y: 10 },
        { x: utc(2024, 0, 31), y: 1 },
      ],
    },
  ],
});

/** Mounted grid rect for 600x400: plot minus weekday labels and month labels. */
const GRID = { x: 38, y: 30, w: 550, h: 358 };

function modelWith(points: { x?: Date; y?: number | null }[]): DataModel {
  return {
    series: [
      {
        visible: true,
        id: 's',
        points: points.map((p) => ({
          x: p.x ?? null,
          xv: p.x ? p.x.getTime() : null,
          y: p.y ?? null,
        })),
      },
    ],
  } as unknown as DataModel;
}

function fillRects(el: HTMLElement): number[][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'fillRect')
    .map((c) => c.args as number[]);
}

describe('calendar UTC date math (exact)', () => {
  it('day indices are UTC days since the epoch', () => {
    expect(MS_PER_DAY).toBe(86400000);
    expect(dayIndexOf(new Date(0))).toBe(0);
    expect(dayFromParts(1970, 0, 1)).toBe(0);
    expect(JAN1).toBe(19723);
    expect(JAN31 - JAN1).toBe(30);
    expect(FEB1 - JAN1).toBe(31);
    expect(FEB29 - FEB1).toBe(28); // 2024 is a leap year
    // An ISO date string parses as UTC midnight and lands on the same day.
    expect(dayIndexOf(new Date('2024-01-01'))).toBe(JAN1);
    expect(dayIndexOf(Date.UTC(2024, 0, 1))).toBe(JAN1);
  });

  it('weekdays are anchored on 1970-01-01 = Thursday', () => {
    expect(weekdayOf(0)).toBe(4);
    expect(weekdayOf(JAN1)).toBe(1); // 2024-01-01 was a Monday
    expect(weekdayOf(FEB1)).toBe(4); // 2024-02-01 was a Thursday
    expect(weekdayOf(-1)).toBe(3); // 1969-12-31 was a Wednesday
  });

  it('rows and week starts follow the weekStart option', () => {
    expect(rowOf(JAN1, 0)).toBe(1);
    expect(rowOf(JAN1, 1)).toBe(0);
    expect(weekStartDay(JAN1, 0)).toBe(JAN1 - 1);
    expect(weekStartDay(JAN1, 1)).toBe(JAN1);
    expect(weekdayLabels(0)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(weekdayLabels(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('formats dates in UTC regardless of the host timezone', () => {
    expect(formatUTCDate(JAN1)).toBe('1 Jan 2024');
    expect(formatUTCDate(FEB29)).toBe('29 Feb 2024');
    expect(formatUTCDate(0)).toBe('1 Jan 1970');
  });

  it('lists the months a range touches', () => {
    const months = monthsInRange(JAN1, FEB29);
    expect(months.map((m) => m.label)).toEqual(['Jan', 'Feb']);
    expect(months[0]!.firstDay).toBe(JAN1);
    expect(months[1]!.firstDay).toBe(FEB1);
    // A partial first month reports the range start, not the 1st.
    const partial = monthsInRange(JAN1 + 10, JAN31);
    expect(partial).toHaveLength(1);
    expect(partial[0]!.firstDay).toBe(JAN1 + 10);
    expect(partial[0]!.monthStart).toBe(JAN1);
    expect(monthsInRange(JAN31, JAN1)).toEqual([]);
  });
});

describe('calendar grid math (exact)', () => {
  const rect = { x: 0, y: 0, w: 90, h: 70 };

  it('counts week columns from the week containing the first day', () => {
    const g = computeCalendarGrid(JAN1, JAN31, 0, rect);
    expect(g.columnZeroDay).toBe(JAN1 - 1);
    expect(g.weeks).toBe(5);
    expect(g.cellW).toBe(18);
    expect(g.cellH).toBe(10);
    expect(CALENDAR_ROWS).toBe(7);
    // Monday-start January 2024 also spans 5 columns, but from Jan 1 itself.
    const mon = computeCalendarGrid(JAN1, JAN31, 1, rect);
    expect(mon.columnZeroDay).toBe(JAN1);
    expect(mon.weeks).toBe(5);
  });

  it('places day cells at exact (week column, weekday row) rects', () => {
    const g = computeCalendarGrid(JAN1, FEB29, 0, rect); // 9 columns -> cellW 10
    expect(g.weeks).toBe(9);
    expect(g.cellW).toBe(10);
    expect(columnOf(g, JAN1)).toBe(0);
    expect(columnOf(g, FEB1)).toBe(4);
    expect(dayAtCell(g, 4, 4)).toBe(FEB1);
    // Jan 1: column 0, row 1, inset by half the 1px gap.
    expect(cellRectOf(g, JAN1)).toEqual({ x: 0.5, y: 10.5, w: 9, h: 9 });
    // Feb 1: column 4, row 4.
    expect(cellRectOf(g, FEB1)).toEqual({ x: 40.5, y: 40.5, w: 9, h: 9 });
    expect(CALENDAR_CELL_GAP).toBe(1);
    // Days outside the range have no cell.
    expect(cellRectOf(g, JAN1 - 1)).toBeNull();
    expect(cellRectOf(g, FEB29 + 1)).toBeNull();
  });

  it('separates months with a hairline staircase', () => {
    const g = computeCalendarGrid(JAN1, FEB29, 0, rect);
    // Feb 1 sits at column 4, row 4 -> a horizontal cut plus a vertical edge.
    expect(monthBoundaryLines(g)).toEqual([
      { x1: 40, y1: 40, x2: 50, y2: 40 },
      { x1: 50, y1: 0, x2: 50, y2: 40 },
    ]);
  });

  it('a month starting on the week-start day needs only one vertical cut', () => {
    const aug1 = dayFromParts(2024, 7, 1);
    const sep1 = dayFromParts(2024, 8, 1); // a Sunday
    expect(weekdayOf(sep1)).toBe(0);
    const g = computeCalendarGrid(aug1, dayFromParts(2024, 8, 30), 0, rect);
    expect(columnOf(g, sep1)).toBe(5);
    expect(monthBoundaryLines(g)).toEqual([
      { x1: 5 * g.cellW, y1: 0, x2: 5 * g.cellW, y2: 70 },
    ]);
  });

  it('a single-month range has no boundaries at all', () => {
    const g = computeCalendarGrid(JAN1, JAN31, 0, rect);
    expect(monthBoundaryLines(g)).toEqual([]);
  });
});

describe('calendar color & range resolution', () => {
  it('defaults the ramp to the sequential palette', () => {
    expect(calendarRamp({})).toEqual(sequentialPalette);
    expect(calendarRamp({ calendar: { ramp: ['#000000', '#ffffff'] } })).toEqual(['#000000', '#ffffff']);
  });

  it('takes the value extent from the data, widening a degenerate one', () => {
    expect(calendarValueExtent(modelWith([{ y: 1 }, { y: 9 }]))).toEqual([1, 9]);
    expect(calendarValueExtent(modelWith([{ y: 4 }, { y: 4 }]))).toEqual([4, 5]);
    expect(calendarValueExtent(modelWith([{ y: null }]))).toEqual([0, 1]);
  });

  it('takes the day range from the data unless start/end are given', () => {
    const m = modelWith([{ x: utc(2024, 0, 10), y: 1 }, { x: utc(2024, 0, 20), y: 2 }]);
    expect(calendarDayRange(m)).toEqual([JAN1 + 9, JAN1 + 19]);
    expect(calendarDayRange(m, { start: utc(2024, 0, 1), end: utc(2024, 0, 31) })).toEqual([JAN1, JAN31]);
    // A plain number is epoch milliseconds.
    expect(calendarDayRange(m, { start: Date.UTC(2024, 0, 1) })).toEqual([JAN1, JAN1 + 19]);
    // An empty series still resolves to a usable single day.
    expect(calendarDayRange(modelWith([]))).toEqual([0, 0]);
  });
});

describe('calendar rendering', () => {
  it('draws every day in range, colored days from the ramp and gaps in gridline', () => {
    const { el } = mount({ type: 'calendar', data: data() });
    const rects = fillRects(el);
    // clear() + 31 days of January.
    expect(rects).toHaveLength(32);
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain(sequentialPalette[0]); // min value 1
    expect(fills).toContain(sequentialPalette[sequentialPalette.length - 1]); // max value 10
    expect(fills).toContain('#e1e0d9'); // theme.gridline: days with no datum
  });

  it('positions the first day at its exact week-column / weekday cell', () => {
    const { el } = mount({ type: 'calendar', data: data() });
    const [x, y, w, h] = fillRects(el)[1] as number[];
    const cellW = GRID.w / 5;
    const cellH = GRID.h / CALENDAR_ROWS;
    // 2024-01-01 is a Monday: column 0, row 1 with a Sunday week start.
    expect(x).toBeCloseTo(GRID.x + 0.5, 6);
    expect(y).toBeCloseTo(GRID.y + cellH + 0.5, 6);
    expect(w).toBeCloseTo(cellW - 1, 6);
    expect(h).toBeCloseTo(cellH - 1, 6);
  });

  it('weekStart: 1 moves Monday to the top row', () => {
    const { el } = mount({ type: 'calendar', data: data(), calendar: { weekStart: 1 } });
    const [, y] = fillRects(el)[1] as number[];
    expect(y).toBeCloseTo(GRID.y + 0.5, 6);
    // Row 0 is Monday now, and the month label still sits above the grid.
    expect(paintedText(el)[0]).toBe('Mon');
    expect(paintedText(el)).toContain('Jan');
  });

  it('labels weekdays and months, and hairlines the month boundary', () => {
    const { el } = mount({
      type: 'calendar',
      data: data(),
      calendar: { start: utc(2024, 0, 1), end: utc(2024, 1, 29) },
    });
    const texts = paintedText(el);
    for (const t of ['Sun', 'Mon', 'Sat', 'Jan', 'Feb']) expect(texts).toContain(t);
    // Two hairline segments for the single Jan/Feb boundary.
    const boundary = ctxOf(el)
      .__props.filter((p) => p.prop === 'strokeStyle')
      .filter((p) => p.value === '#c3c2b7');
    expect(boundary).toHaveLength(2);
    // Feb 29 exists (leap year): 31 + 29 cells.
    expect(fillRects(el)).toHaveLength(1 + 60);
  });
});

describe('calendar legend, a11y & interaction', () => {
  it('legend is a gradient color scale, shown by default for one series', () => {
    const { el, chart } = mount({ type: 'calendar', data: data() });
    const legend = el.querySelector('.chartcraft-calendar-legend') as HTMLElement;
    expect(legend).toBeTruthy();
    expect(el.querySelectorAll('.chartcraft-legend-item')).toHaveLength(0);
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
    expect((legend.querySelector('.chartcraft-calendar-legend-bar') as HTMLElement).style.background).toContain(
      'linear-gradient',
    );
    expect(legend.querySelector('.chartcraft-calendar-legend-min')!.textContent).toBe('1');
    expect(legend.querySelector('.chartcraft-calendar-legend-max')!.textContent).toBe('10');
    // Non-toggleable: clicking the scale is not a series toggle.
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    legend.click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('legend: false hides the color scale', () => {
    const { el } = mount({ type: 'calendar', data: data(), legend: false });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    expect(el.querySelector('.chartcraft-calendar-legend')).toBeNull();
  });

  it('a11y table is date + value, in UTC', () => {
    const { el, chart } = mount({ type: 'calendar', data: data() });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Date', 'Visits']);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['1 Jan 2024', '5'],
      ['15 Jan 2024', '10'],
      ['31 Jan 2024', '1'],
    ]);
    expect(chart.exportData()).toBe('Date,Visits\n1 Jan 2024,5\n15 Jan 2024,10\n31 Jan 2024,1');
  });

  it('keyboard walks the days chronologically and announces the date', () => {
    const { el, chart } = mount({ type: 'calendar', data: data() });
    const enters: { dataIndex: number; y: number | null }[] = [];
    chart.on('pointenter', (e) => enters.push({ dataIndex: e.dataIndex, y: e.y }));
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ dataIndex: 0, y: 5 });
    expect((el.querySelector('.chartcraft-announcer') as HTMLElement).textContent).toBe(
      '1 Jan 2024: 5. Visits, day 1 of 3.',
    );
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ dataIndex: 1, y: 10 });
    key(el, 'End');
    expect(enters.at(-1)).toEqual({ dataIndex: 2, y: 1 });
    // Tooltip carries the UTC date and the value.
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.innerHTML).toContain('31 Jan 2024');
    expect(tip.innerHTML).toContain('>1<');
  });

  it('hovering a day with data reports it; empty days are inert', () => {
    const { el, chart } = mount({ type: 'calendar', data: data() });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    const cellW = GRID.w / 5;
    const cellH = GRID.h / CALENDAR_ROWS;
    // 2024-01-01: column 0, row 1.
    pointerMove(el, GRID.x + cellW / 2, GRID.y + cellH * 1.5);
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ dataIndex: 0, y: 5 }));
    // 2024-01-02 (column 0, row 2) has no datum.
    pointerMove(el, GRID.x + cellW / 2, GRID.y + cellH * 2.5);
    expect(onEnter).toHaveBeenCalledTimes(1);
    // Outside the grid entirely.
    pointerMove(el, 5, 5);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('honors an explicit calendar.ramp for the cells and the legend', () => {
    const { el } = mount({ type: 'calendar', data: data(), calendar: { ramp: ['#000000', '#ffffff'] } });
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain('#000000'); // value 1 -> ramp start
    expect(fills).toContain('#ffffff'); // value 10 -> ramp end
    expect(
      (el.querySelector('.chartcraft-calendar-legend-bar') as HTMLElement).style.background,
    ).toContain('#000000');
  });
});
