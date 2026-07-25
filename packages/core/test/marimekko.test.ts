/**
 * Marimekko (v0.3): variable-width 100%-stacked columns, 2px gaps in both
 * directions, and BOTH share dimensions in every readout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompositionChartTypes } from '../src/charts/composition';
import {
  computeMarimekkoColumns,
  marimekkoWidthValues,
  MARIMEKKO_PERCENT_TICKS,
  type MarimekkoColumnInput,
} from '../src/charts/composition/marimekko';
import type { DataModel } from '../src/model';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerCompositionChartTypes();
afterEach(cleanupDom);

/** Two columns, widths 3:1, with a 1:3 and a 1:1 internal split. */
const data = (): {
  categories: string[];
  series: { name: string; data: ({ x: string; y: number; r?: number } | number)[] }[];
} => ({
  categories: ['Q1', 'Q2'],
  series: [
    { name: 'Alpha', data: [{ x: 'Q1', y: 1, r: 3 }, { x: 'Q2', y: 2, r: 1 }] },
    { name: 'Beta', data: [{ x: 'Q1', y: 3 }, { x: 'Q2', y: 2 }] },
  ],
});

/** Grid rect for a 600x400 mount: plot inset by the %-labels and column labels. */
const GRID = { x: 44, y: 12, w: 544, h: 358 };

const RECT = { x: 0, y: 0, w: 100, h: 100 };
const cols: MarimekkoColumnInput[] = [
  { label: 'wide', widthValue: 3, cells: [{ si: 0, pi: 0, value: 1 }, { si: 1, pi: 0, value: 3 }] },
  { label: 'narrow', widthValue: 1, cells: [{ si: 0, pi: 1, value: 2 }, { si: 1, pi: 1, value: 2 }] },
];

function fillRects(el: HTMLElement): number[][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'fillRect')
    .map((c) => c.args as number[]);
}

function modelWith(series: { visible?: boolean; points: { y?: number | null; r?: number }[] }[]): DataModel {
  return {
    series: series.map((s, i) => ({ visible: s.visible ?? true, points: s.points, id: String(i) })),
  } as unknown as DataModel;
}

describe('marimekko layout math (exact)', () => {
  it('column widths are proportional and sum with the gaps to the rect width', () => {
    const L = computeMarimekkoColumns(cols, RECT, 2);
    const [wide, narrow] = L.columns as [NonNullable<typeof L.columns[0]>, NonNullable<typeof L.columns[1]>];
    expect(L.widthTotal).toBe(4);
    expect(wide.widthShare).toBe(0.75);
    expect(narrow.widthShare).toBe(0.25);
    // availW = 100 - 2 = 98 -> 73.5 / 24.5
    expect(wide.w).toBe(73.5);
    expect(narrow.w).toBe(24.5);
    expect(wide.x).toBe(0);
    expect(narrow.x).toBe(75.5);
    expect(wide.w + narrow.w + 2).toBe(RECT.w);
    expect(narrow.x + narrow.w).toBe(RECT.x + RECT.w);
  });

  it('segment heights are within-column shares and sum with the gaps to the rect height', () => {
    const L = computeMarimekkoColumns(cols, RECT, 2);
    const wide = L.columns[0]!;
    expect(wide.total).toBe(4);
    expect(wide.segments.map((s) => s.share)).toEqual([0.25, 0.75]);
    // availH = 100 - 2 = 98 -> 24.5 / 73.5, first series at the BOTTOM.
    expect(wide.segments.map((s) => s.h)).toEqual([24.5, 73.5]);
    expect(wide.segments.map((s) => s.y)).toEqual([75.5, 0]);
    expect(wide.segments[0]!.y + wide.segments[0]!.h).toBe(RECT.y + RECT.h);
    expect(wide.segments.reduce((a, s) => a + s.h, 0) + 2).toBe(RECT.h);
    // Shares always sum to exactly 1 within a column.
    expect(L.columns[1]!.segments.reduce((a, s) => a + s.share, 0)).toBe(1);
  });

  it('a single segment fills the column height (no phantom gap)', () => {
    const L = computeMarimekkoColumns(
      [{ label: 'solo', widthValue: 1, cells: [{ si: 0, pi: 0, value: 5 }] }],
      RECT,
      2,
    );
    const seg = L.columns[0]!.segments[0]!;
    expect(seg.h).toBe(100);
    expect(seg.y).toBe(0);
    expect(L.columns[0]!.w).toBe(100);
  });

  it('null / non-positive values drop out of the stack entirely', () => {
    const L = computeMarimekkoColumns(
      [{ label: 'c', widthValue: 1, cells: [{ si: 0, pi: 0, value: 0 }, { si: 1, pi: 0, value: 4 }] }],
      RECT,
      2,
    );
    expect(L.columns[0]!.segments).toHaveLength(1);
    expect(L.columns[0]!.segments[0]!.si).toBe(1);
    expect(L.columns[0]!.segments[0]!.h).toBe(100);
  });

  it('columns fall back to equal widths when no width measure is usable', () => {
    const L = computeMarimekkoColumns(
      [
        { label: 'a', widthValue: 0, cells: [{ si: 0, pi: 0, value: 1 }] },
        { label: 'b', widthValue: 0, cells: [{ si: 0, pi: 1, value: 1 }] },
      ],
      RECT,
      2,
    );
    expect(L.columns.map((c) => c.w)).toEqual([49, 49]);
    expect(L.columns.map((c) => c.widthShare)).toEqual([0.5, 0.5]);
  });

  it('empty input is a no-op', () => {
    const L = computeMarimekkoColumns([], RECT, 2);
    expect(L.columns).toEqual([]);
    expect(L.widthTotal).toBe(0);
  });

  it('width measures come from `r` on the FIRST series, else the column totals', () => {
    const withR = modelWith([{ points: [{ r: 3 }, { r: 1 }] }, { points: [{}, {}] }]);
    expect(marimekkoWidthValues(withR, 2, [4, 4])).toEqual({ values: [3, 1], source: 'r' });
    // A partial / non-positive `r` is not a width measure — fall back to totals.
    const partial = modelWith([{ points: [{ r: 3 }, {}] }]);
    expect(marimekkoWidthValues(partial, 2, [4, 6])).toEqual({ values: [4, 6], source: 'total' });
    const zero = modelWith([{ points: [{ r: 0 }, { r: 2 }] }]);
    expect(marimekkoWidthValues(zero, 2, [1, 2])).toEqual({ values: [1, 2], source: 'total' });
  });
});

describe('marimekko rendering', () => {
  it('draws one rect per segment at exact variable-width positions', () => {
    const { el } = mount({ type: 'marimekko', data: data() });
    const rects = fillRects(el);
    // clear() + 4 segments.
    expect(rects).toHaveLength(5);
    // Column Q1: width 3/4 of (544 - 2) = 406.5, at x 44.
    // Alpha = 1/4 of (358 - 2) = 89 tall, sitting on the grid floor.
    expect(rects[1]).toEqual([44, GRID.y + GRID.h - 89, 406.5, 89]);
    // Beta = 267 tall, 2px above Alpha, reaching the grid top exactly.
    expect(rects[2]).toEqual([44, GRID.y, 406.5, 267]);
    // Column Q2: width 1/4 -> 135.5, at x 44 + 406.5 + 2.
    expect(rects[3]).toEqual([452.5, GRID.y + GRID.h - 178, 135.5, 178]);
    expect(rects[4]).toEqual([452.5, GRID.y, 135.5, 178]);
  });

  it('uses column totals for the widths when no `r` is supplied', () => {
    const { el } = mount({
      type: 'marimekko',
      data: { categories: ['Q1', 'Q2'], series: [{ name: 'Alpha', data: [1, 3] }] },
    });
    const rects = fillRects(el);
    // Totals 1 and 3 -> 25% / 75% of (544 - 2).
    expect(rects[1]![2]).toBe(135.5);
    expect(rects[2]![2]).toBe(406.5);
  });

  it('labels the percentage scale and the columns in muted ink', () => {
    const { el } = mount({ type: 'marimekko', data: data() });
    const texts = paintedText(el);
    for (const t of ['0%', '25%', '50%', '75%', '100%', 'Q1', 'Q2']) expect(texts).toContain(t);
    expect(MARIMEKKO_PERCENT_TICKS).toHaveLength(5);
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#898781')).toBe(true);
  });
});

describe('marimekko legend, a11y & interaction', () => {
  it('legend lists the series and toggles them', () => {
    const { el, chart } = mount({ type: 'marimekko', data: data() });
    const items = [...el.querySelectorAll('.chartcraft-legend-item')] as HTMLButtonElement[];
    expect(items.map((i) => i.textContent)).toEqual(['Alpha', 'Beta']);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[0]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'Alpha', visible: false });
    // Beta alone now fills each column.
    expect(fillRects(el).filter((r) => r[3] === 358)).toHaveLength(2);
  });

  it('a11y table carries BOTH dimensions: width share + value with column share', () => {
    const { el, chart } = mount({ type: 'marimekko', data: data() });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Column',
      'Width share',
      'Alpha',
      'Beta',
    ]);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['Q1', '75%', '1 (25%)', '3 (75%)'],
      ['Q2', '25%', '2 (50%)', '2 (50%)'],
    ]);
    // exportData() is exactly the table.
    expect(chart.exportData()).toBe(
      'Column,Width share,Alpha,Beta\nQ1,75%,1 (25%),3 (75%)\nQ2,25%,2 (50%),2 (50%)',
    );
  });

  it('tooltip carries the column width share AND the within-column share', () => {
    const { el } = mount({ type: 'marimekko', data: data() });
    // Inside column Q1 (x 44..450.5), inside Alpha (y 281..370).
    pointerMove(el, 200, 300);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Q1 — 75% of total width');
    expect(tip.innerHTML).toContain('1 (25% of column)');
  });

  it('hit testing finds the segment under the pointer and misses the gaps', () => {
    const { el, chart } = mount({ type: 'marimekko', data: data() });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    pointerMove(el, 200, 300); // Alpha in Q1
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ seriesName: 'Alpha', dataIndex: 0 }));
    pointerMove(el, 200, 100); // Beta in Q1
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ seriesName: 'Beta', dataIndex: 0 }));
    pointerMove(el, 500, 100); // Beta in Q2
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ seriesName: 'Beta', dataIndex: 1 }));
    // The 2px inter-column gutter is not a mark.
    pointerMove(el, 451.5, 100);
    expect(onEnter).toHaveBeenCalledTimes(3);
  });

  it('keyboard walks columns then series, announcing both shares', () => {
    const { el, chart } = mount({ type: 'marimekko', data: data() });
    const enters: { seriesName: string; dataIndex: number }[] = [];
    chart.on('pointenter', (e) => enters.push({ seriesName: e.seriesName, dataIndex: e.dataIndex }));
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ seriesName: 'Alpha', dataIndex: 0 });
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ seriesName: 'Alpha', dataIndex: 1 });
    key(el, 'ArrowDown');
    expect(enters.at(-1)).toEqual({ seriesName: 'Beta', dataIndex: 1 });
    expect((el.querySelector('.chartcraft-announcer') as HTMLElement).textContent).toBe(
      'Q2: 2, 50% of the column. Beta. Column 25% of total width, 2 of 2.',
    );
  });
});
