/**
 * Streamgraph (v0.3): inside-out ordering + wiggle baseline (Byron &
 * Wattenberg), suppressed value axis, identity-bound colors.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompositionChartTypes } from '../src/charts/composition';
import {
  computeStreamStack,
  insideOutOrder,
  peakIndex,
  seriesTotal,
  wiggleBaseline,
} from '../src/charts/composition/streamgraph';
import { lightTheme } from '../src/theme';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerCompositionChartTypes();
afterEach(cleanupDom);

/** The worked example used throughout: A peaks in the middle, B at the end. */
const A = [1, 2, 1];
const B = [1, 1, 3];
/** Fresh options each time — legend toggling mutates the series it is given. */
const data = (): { categories: string[]; series: { name: string; data: (number | null)[] }[] } => ({
  categories: ['A', 'B', 'C'],
  series: [
    { name: 'Alpha', data: [...A] },
    { name: 'Beta', data: [...B] },
  ],
});

/**
 * Plot rect for a 600x400 mount of `data`. The type declares
 * `axisChrome: { x: true, y: false }`, so the pipeline reserves NO left margin
 * for value labels it is not going to draw: x = padding.left = 12.
 */
const PLOT = { x: 12, y: 12, w: 576, h: 354 };
/** Band centers for 3 categories with non-bar padding (0.6 inner / 0.3 outer). */
const CENTERS = [108, 300, 492];

function moveTos(el: HTMLElement): { x: number; y: number }[] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'moveTo')
    .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
}

function fillStyles(el: HTMLElement): string[] {
  return ctxOf(el)
    .__props.filter((p) => p.prop === 'fillStyle')
    .map((p) => String(p.value));
}

describe('streamgraph layout math (Byron & Wattenberg, exact)', () => {
  it('peakIndex/seriesTotal read the shape of a series', () => {
    expect(peakIndex(A)).toBe(1);
    expect(peakIndex(B)).toBe(2);
    expect(peakIndex([5, 5, 1])).toBe(0); // first maximum wins
    expect(peakIndex([])).toBe(0);
    expect(peakIndex([null, 3, null])).toBe(1);
    expect(seriesTotal(A)).toBe(4);
    expect(seriesTotal([1, null, 2])).toBe(3);
  });

  it('insideOutOrder sorts by peak, then fills the smaller side of the stack', () => {
    // Peaks at 1 and 2 -> appearance [0, 1]; first goes to the bottom.
    expect(insideOutOrder([A, B])).toEqual([0, 1]);
    // Early-peaking series first -> it takes the BOTTOM, so order flips.
    expect(insideOutOrder([[1, 1, 5], [4, 1, 1]])).toEqual([1, 0]);
    // Ties on peak position break by input index (never sort-stability luck).
    expect(insideOutOrder([[1, 0], [1, 0], [1, 0]])).toEqual([2, 0, 1]);
    expect(insideOutOrder([])).toEqual([]);
  });

  it('wiggleBaseline is the exact least-squares slope minimizer', () => {
    // g0[0] = 0; g0[1] = -2/3; g0[2] = -2/3 + 1/8 = -13/24.
    const g = wiggleBaseline([A, B]);
    expect(g).toHaveLength(3);
    expect(g[0]).toBe(0);
    expect(g[1]).toBeCloseTo(-2 / 3, 12);
    expect(g[2]).toBeCloseTo(-13 / 24, 12);
  });

  it('a flat stack has nothing to minimize (baseline stays at zero)', () => {
    expect(wiggleBaseline([[2, 2, 2], [3, 3, 3]])).toEqual([0, 0, 0]);
    expect(wiggleBaseline([[4]])).toEqual([0]);
    expect(wiggleBaseline([])).toEqual([]);
  });

  it('a single series is offset by half its own slope', () => {
    // g0[1] = -(1/2)/1 * ... = -0.5; g0[2] = -0.5 - (-0.5/1) = 0.
    expect(wiggleBaseline([A])).toEqual([0, -0.5, 0]);
  });

  it('computeStreamStack stacks bands on the baseline and reports the extent', () => {
    const stack = computeStreamStack([A, B]);
    expect(stack.order).toEqual([0, 1]);
    expect(stack.columns).toBe(3);
    expect(stack.totals).toEqual([2, 3, 4]);

    const bottom = stack.bands[0]!;
    const top = stack.bands[1]!;
    expect(bottom.index).toBe(0);
    expect(bottom.rank).toBe(0);
    expect(bottom.lo[0]).toBe(0);
    expect(bottom.hi[0]).toBe(1);
    expect(bottom.lo[1]).toBeCloseTo(-2 / 3, 12);
    expect(bottom.hi[1]).toBeCloseTo(4 / 3, 12);
    // The top band's upper bound is baseline + column total, exactly.
    expect(top.hi[2]).toBeCloseTo(-13 / 24 + 4, 12);
    expect(top.lo[2]).toBeCloseTo(-13 / 24 + 1, 12);

    // Extent = [min baseline, max (baseline + total)].
    expect(stack.extent[0]).toBeCloseTo(-2 / 3, 12);
    expect(stack.extent[1]).toBeCloseTo(-13 / 24 + 4, 12);
  });

  it('nulls contribute zero thickness (a baseline is undefined otherwise)', () => {
    const stack = computeStreamStack([[1, null, 1]]);
    expect(stack.totals).toEqual([1, 0, 1]);
    const band = stack.bands[0]!;
    expect(band.hi[1]! - band.lo[1]!).toBe(0);
  });

  it('a degenerate (all-zero) stack still yields a usable extent', () => {
    const stack = computeStreamStack([[0, 0]]);
    expect(stack.extent).toEqual([0, 1]);
  });
});

describe('streamgraph rendering (exact pixels)', () => {
  it('draws one filled ribbon per band, bottom-to-top, at exact bounds', () => {
    const { el } = mount({ type: 'streamgraph', data: data() });
    // 2 ribbons + the bottom (x) axis line = 3 moveTo calls. There is no left
    // axis line: per-axis chrome switches the whole value axis off.
    const moves = moveTos(el);
    expect(moves).toHaveLength(3);

    // toPx(v) = 366 - (v + 2/3) * (354 / 4.125)
    const toPx = (v: number): number => PLOT.y + PLOT.h - ((v + 2 / 3) / 4.125) * PLOT.h;
    // Bottom band (Alpha) starts at column 0's top edge, value 1.
    expect(moves[0]!.x).toBeCloseTo(CENTERS[0]!, 4);
    expect(moves[0]!.y).toBeCloseTo(toPx(1), 4);
    expect(moves[0]!.y).toBeCloseTo(222.969697, 4);
    // Top band (Beta) starts at value 2 in column 0.
    expect(moves[1]!.y).toBeCloseTo(toPx(2), 4);
    expect(moves[1]!.y).toBeCloseTo(137.151515, 4);

    // The stream exactly fills the plot: the lowest baseline touches the
    // bottom edge and the tallest column touches the top edge.
    const lines = ctxOf(el).__calls.filter((c) => c.method === 'lineTo');
    const ys = lines.map((c) => c.args[1] as number);
    expect(Math.min(...ys)).toBeCloseTo(PLOT.y, 4);
    expect(Math.max(...ys)).toBeCloseTo(PLOT.y + PLOT.h, 4);
  });

  it('suppresses the value axis entirely: no y tick labels, no y gridlines', () => {
    const { el } = mount({ type: 'streamgraph', data: data() });
    // The only painted text is the x (category) axis.
    expect(paintedText(el)).toEqual(['A', 'B', 'C']);
    // ONE axis line — the x axis. `axisChrome: { y: false }` removes the value
    // axis line, its tick labels and its gridlines together.
    const strokes = ctxOf(el).__props.filter((p) => p.prop === 'strokeStyle').map((p) => p.value);
    expect(strokes).toEqual([lightTheme.axisLine]);
    expect(strokes).not.toContain(lightTheme.gridline);
  });

  it('color follows series IDENTITY, never stacking rank', () => {
    // Computed order is [1, 0]: Beta is drawn at the BOTTOM, first.
    const flipped = {
      categories: ['A', 'B', 'C'],
      series: [
        { name: 'Alpha', data: [1, 1, 5] },
        { name: 'Beta', data: [4, 1, 1] },
      ],
    };
    const { el } = mount({ type: 'streamgraph', data: flipped });
    const fills = fillStyles(el);
    expect(fills[0]).toBe(lightTheme.surface); // clear()
    // First ribbon painted is Beta (rank 0) but keeps slot 2 (its identity).
    expect(fills[1]).toBe(lightTheme.series[1]);
    expect(fills[2]).toBe(lightTheme.series[0]);
    // ...and the legend still lists them in input order with input colors.
    const swatches = [...el.querySelectorAll('.chartcraft-legend-swatch')] as HTMLElement[];
    expect(swatches.map((s) => s.style.background)).toEqual(['rgb(42, 120, 214)', 'rgb(235, 104, 52)']);
  });
});

describe('streamgraph legend, a11y & interaction', () => {
  it('legend lists the series, toggleable, auto-shown from two series', () => {
    const { el, chart } = mount({ type: 'streamgraph', data: data() });
    const items = [...el.querySelectorAll('.chartcraft-legend-item')] as HTMLButtonElement[];
    expect(items.map((i) => i.textContent)).toEqual(['Alpha', 'Beta']);
    expect(items.every((i) => !i.disabled)).toBe(true);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[1]!.click();
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'Beta', visible: false });
    // One band left; the surviving series keeps its own color.
    expect(fillStyles(el).filter((f) => f === lightTheme.series[0])).not.toHaveLength(0);
  });

  it('hides the legend for a single series (generic auto policy)', () => {
    const { el } = mount({
      type: 'streamgraph',
      data: { categories: ['A', 'B'], series: [{ name: 'Solo', data: [1, 2] }] },
    });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('a11y table carries every value plus the stack total', () => {
    const { el } = mount({ type: 'streamgraph', data: data() });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Category',
      'Alpha',
      'Beta',
      'Total',
    ]);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['A', '1', '1', '2'],
      ['B', '2', '1', '3'],
      ['C', '1', '3', '4'],
    ]);
    // exportData() mirrors the table exactly.
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('keyboard walks points then series, and the tooltip carries the value', () => {
    const { el, chart } = mount({ type: 'streamgraph', data: data() });
    const enters: { seriesName: string; dataIndex: number }[] = [];
    chart.on('pointenter', (e) => enters.push({ seriesName: e.seriesName, dataIndex: e.dataIndex }));
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ seriesName: 'Alpha', dataIndex: 0 });
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ seriesName: 'Alpha', dataIndex: 1 });
    key(el, 'ArrowDown');
    expect(enters.at(-1)).toEqual({ seriesName: 'Beta', dataIndex: 1 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Beta');
    expect(tip.innerHTML).toContain('1 of 3'); // value + column total
  });

  it('hovering a ribbon reports the band under the pointer', () => {
    const { el, chart } = mount({ type: 'streamgraph', data: data() });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    // Column 1 (x = 316): Alpha spans y 194.36..366, Beta 108.55..194.36.
    pointerMove(el, 316, 300);
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ seriesName: 'Alpha', dataIndex: 1 }));
    pointerMove(el, 316, 150);
    expect(onEnter).toHaveBeenLastCalledWith(expect.objectContaining({ seriesName: 'Beta', dataIndex: 1 }));
    // Well above the stream: nothing is hit.
    pointerMove(el, 316, 20);
    expect(onEnter).toHaveBeenCalledTimes(2);
  });
});
