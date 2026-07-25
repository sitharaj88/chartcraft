import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMatrixChartTypes } from '../src/charts/matrix';
import {
  heatmapColor,
  heatmapExtent,
  heatmapRamp,
  HEATMAP_CELL_GAP,
} from '../src/charts/matrix/heatmap';
import { mixHex, rampColor } from '../src/charts/matrix/color-scale';
import { sequentialPalette } from '../src/theme';
import type { DataModel } from '../src/model';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerMatrixChartTypes();
afterEach(cleanupDom);

const data = {
  categories: ['A', 'B', 'C'],
  series: [
    { name: 'North', data: [1, 2, 3] },
    { name: 'South', data: [2, 3, 4] },
  ],
};

/** Model stub with just what the extent helper reads. */
function modelWith(rows: (number | null)[][]): DataModel {
  return {
    series: rows.map((r, i) => ({
      visible: true,
      points: r.map((y) => ({ y })),
      id: String(i),
    })),
  } as unknown as DataModel;
}

describe('heatmap color scale (exact math)', () => {
  it('rampColor interpolates linearly in ramp index', () => {
    expect(rampColor(['#000000', '#ffffff'], 0.5)).toBe('#808080');
    const ramp = ['#000000', '#404040', '#808080'];
    expect(rampColor(ramp, 0)).toBe('#000000');
    expect(rampColor(ramp, 0.25)).toBe('#202020'); // f = 0.5 within [0, 1]
    expect(rampColor(ramp, 0.5)).toBe('#404040'); // exactly on step 1
    expect(rampColor(ramp, 0.75)).toBe('#606060'); // f = 1.5 within [1, 2]
    expect(rampColor(ramp, 1)).toBe('#808080');
  });

  it('heatmapColor clamps below min / above max to the ramp ends', () => {
    const ramp = ['#000000', '#ffffff'];
    expect(heatmapColor(-10, 0, 10, ramp)).toBe('#000000');
    expect(heatmapColor(999, 0, 10, ramp)).toBe('#ffffff');
    expect(heatmapColor(5, 0, 10, ramp)).toBe('#808080');
  });

  it('mixHex mixes channels linearly with rounding', () => {
    expect(mixHex('#2a78d6', '#fcfcfb', 0.5)).toBe('#93bae9');
    expect(mixHex('#2a78d6', '#fcfcfb', 0)).toBe('#2a78d6');
    expect(mixHex('#2a78d6', '#fcfcfb', 1)).toBe('#fcfcfb');
  });

  it('heatmapExtent defaults to the data extent; heatmap.min/max override; degenerate widens', () => {
    expect(heatmapExtent(modelWith([[1, 5], [3, 9]]))).toEqual([1, 9]);
    expect(heatmapExtent(modelWith([[1, 5]]), { min: 0, max: 10 })).toEqual([0, 10]);
    expect(heatmapExtent(modelWith([[4, 4]]))).toEqual([4, 5]);
    expect(heatmapExtent(modelWith([[null, null]]))).toEqual([0, 1]);
  });

  it('heatmapRamp defaults to the sequential palette', () => {
    expect(heatmapRamp({}, 'light')).toEqual(sequentialPalette);
    expect(heatmapRamp({ heatmap: { ramp: ['#000000', '#ffffff'] } }, 'light')).toEqual(['#000000', '#ffffff']);
  });

  it('REVERSES the default ramp on a dark surface, and never a custom one', () => {
    expect(heatmapRamp({}, 'dark')).toEqual([...sequentialPalette].reverse());
    expect(heatmapRamp({ heatmap: { ramp: ['#000000', '#ffffff'] } }, 'dark')).toEqual(['#000000', '#ffffff']);
  });
});

describe('heatmap rendering', () => {
  it('draws one cell per value with ramp-end colors at the extent', () => {
    const { el } = mount({ type: 'heatmap', data });
    const ctx = ctxOf(el);
    // clear() + 6 cells = 7 fillRect calls (labels use fillText).
    expect(ctx.__calls.filter((c) => c.method === 'fillRect')).toHaveLength(7);
    const fills = ctx.__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain(sequentialPalette[0]); // min value 1
    expect(fills).toContain(sequentialPalette[sequentialPalette.length - 1]); // max value 4
  });

  it('cells are inset by the 1px surface gap and aligned to the grid', () => {
    const { el } = mount({ type: 'heatmap', data });
    // Row labels "North"/"South" measure 30px -> left = 40; grid.x = 12 + 40.
    const first = ctxOf(el).__calls.filter((c) => c.method === 'fillRect')[1];
    expect(first).toBeTruthy();
    const [x, y, w, h] = first!.args as number[];
    expect(x).toBeCloseTo(52 + HEATMAP_CELL_GAP / 2, 5);
    expect(y).toBeCloseTo(12 + HEATMAP_CELL_GAP / 2, 5);
    expect(w).toBeCloseTo(536 / 3 - HEATMAP_CELL_GAP, 5);
    expect(h).toBeCloseTo(356 / 2 - HEATMAP_CELL_GAP, 5);
  });

  it('null values render as gaps (no cell) and are not hoverable', () => {
    const { el, chart } = mount({
      type: 'heatmap',
      data: { categories: ['A', 'B'], series: [{ name: 'Row', data: [1, null] }] },
    });
    // clear + 1 cell only.
    expect(ctxOf(el).__calls.filter((c) => c.method === 'fillRect')).toHaveLength(2);
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    // Center of the (empty) second column: grid spans x 46..588, col 2 of 2.
    pointerMove(el, 460, 180);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('paints row and column labels in muted ink', () => {
    const { el } = mount({ type: 'heatmap', data });
    const texts = paintedText(el);
    for (const t of ['North', 'South', 'A', 'B', 'C']) expect(texts).toContain(t);
    expect(ctxOf(el).__props.some((p) => p.prop === 'fillStyle' && p.value === '#898781')).toBe(true);
  });
});

describe('heatmap legend (gradient color scale)', () => {
  it('mounts a gradient bar with min/max labels instead of legend items', () => {
    const { el } = mount({ type: 'heatmap', data });
    const legend = el.querySelector('.chartcraft-heatmap-legend') as HTMLElement;
    expect(legend).toBeTruthy();
    expect(el.querySelectorAll('.chartcraft-legend-item')).toHaveLength(0);
    const bar = legend.querySelector('.chartcraft-heatmap-legend-bar') as HTMLElement;
    expect(bar.style.background).toContain('linear-gradient');
    expect(legend.querySelector('.chartcraft-heatmap-legend-min')!.textContent).toBe('1');
    expect(legend.querySelector('.chartcraft-heatmap-legend-max')!.textContent).toBe('4');
    // Labels in textMuted — never a mark color.
    expect((legend.querySelector('.chartcraft-heatmap-legend-min') as HTMLElement).style.color).not.toBe('');
  });

  it('shows by default even for a single row and is non-toggleable', () => {
    const { el, chart } = mount({
      type: 'heatmap',
      data: { categories: ['A', 'B'], series: [{ name: 'Solo', data: [1, 2] }] },
    });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
    expect(el.querySelector('.chartcraft-heatmap-legend')).toBeTruthy();
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    (el.querySelector('.chartcraft-heatmap-legend') as HTMLElement).click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('legend: false hides the color scale', () => {
    const { el } = mount({ type: 'heatmap', data, legend: false });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    expect(el.querySelector('.chartcraft-heatmap-legend')).toBeNull();
  });

  it('respects heatmap.min/max in the legend labels', () => {
    const { el } = mount({ type: 'heatmap', data, heatmap: { min: 0, max: 10 } });
    expect(el.querySelector('.chartcraft-heatmap-legend-min')!.textContent).toBe('0');
    expect(el.querySelector('.chartcraft-heatmap-legend-max')!.textContent).toBe('10');
  });
});

describe('heatmap a11y & interaction', () => {
  it('a11y table IS the matrix: row header + one column per category', () => {
    const { el } = mount({ type: 'heatmap', data });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Series', 'A', 'B', 'C']);
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['North', '1', '2', '3'],
      ['South', '2', '3', '4'],
    ]);
  });

  it('keyboard is row-major: Left/Right walk columns, Up/Down walk rows', () => {
    const { el, chart } = mount({ type: 'heatmap', data });
    const enters: { seriesName: string; dataIndex: number }[] = [];
    chart.on('pointenter', (e) => enters.push({ seriesName: e.seriesName, dataIndex: e.dataIndex }));
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ seriesName: 'North', dataIndex: 0 });
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ seriesName: 'North', dataIndex: 1 });
    key(el, 'ArrowDown');
    expect(enters.at(-1)).toEqual({ seriesName: 'South', dataIndex: 1 });
    key(el, 'ArrowUp');
    expect(enters.at(-1)).toEqual({ seriesName: 'North', dataIndex: 1 });
  });

  it('announces column, value, row and matrix position', () => {
    const { el } = mount({ type: 'heatmap', data });
    key(el, 'ArrowRight');
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('A: 1. North, row 1 of 2, column 1 of 3.');
  });

  it('tooltip shows row, column and value for the hovered cell', () => {
    const { el } = mount({ type: 'heatmap', data });
    // Center of cell (row North, column A): grid x 52..588 (3 cols), y 12..368 (2 rows).
    pointerMove(el, 141, 101);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).not.toBe('none');
    expect(tip.innerHTML).toContain('A'); // column
    expect(tip.innerHTML).toContain('North'); // row
    expect(tip.innerHTML).toContain('>1<'); // value
  });

  it('click on a cell emits pointclick with the cell indices', () => {
    const { el, chart } = mount({ type: 'heatmap', data });
    const onClick = vi.fn();
    chart.on('pointclick', onClick);
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 141, clientY: 101, bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0]).toMatchObject({ seriesName: 'North', dataIndex: 0, y: 1 });
  });
});
