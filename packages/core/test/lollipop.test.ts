/**
 * lollipop (v0.3): stem + terminal dot geometry (vertical and horizontal),
 * per-series slots, the unsupported-stacking error, legend policy, a11y table,
 * tooltip and keyboard navigation.
 *
 * Layout arithmetic used by the mounted assertions (600x400, no title):
 *   vertical   — value ticks 0..10 (max '10' = 12px) -> leftW = 26,
 *                plot.x = 38, plot.w = 550, value range [366, 12] over [0, 10]
 *                -> y(v) = 366 - 35.4 v ; band (bar padding) step = 550 / 3.05
 *   horizontal — category ticks 'A'/'B'/'C' (6px)    -> leftW = 20,
 *                plot.x = 32, plot.w = 556 -> x(v) = 32 + 55.6 v ;
 *                band range [12, 366], step = 354 / 3.05
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartData, PointEvent } from '../src/index';
import { lightTheme } from '../src/index';
import { registerIntervalChartTypes } from '../src/charts/interval';
import {
  LOLLIPOP_MAX_DOT_RADIUS,
  LOLLIPOP_MIN_DOT_RADIUS,
  LOLLIPOP_STACKED_ERROR,
  LOLLIPOP_STEM_WIDTH,
  lollipopDotRadius,
  lollipopMark,
} from '../src/charts/interval';
import { getChartType } from '../src/charts/registry';
import { cleanupDom, ctxOf, key, mount } from './helpers';

registerIntervalChartTypes();

afterEach(cleanupDom);

const data: ChartData = { categories: ['A', 'B', 'C'], series: [{ name: 'V', data: [10, 4, 6] }] };

const two: ChartData = {
  categories: ['A'],
  series: [
    { name: 'V', data: [10] },
    { name: 'W', data: [6] },
  ],
};

const V_STEP = 550 / 3.05;
const V_BW = V_STEP * 0.75;
const vCenter = (i: number): number => 38 + V_STEP * 0.15 + i * V_STEP + V_BW / 2;

const H_STEP = 354 / 3.05;
const H_BW = H_STEP * 0.75;
const hCenter = (i: number): number => 12 + H_STEP * 0.15 + i * H_STEP + H_BW / 2;

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

function circles(el: HTMLElement): number[][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'arc')
    .map((c) => [c.args[0] as number, c.args[1] as number, c.args[2] as number]);
}

function segments(el: HTMLElement): number[][] {
  const calls = ctxOf(el).__calls;
  const out: number[][] = [];
  for (let i = 0; i < calls.length - 1; i++) {
    const a = calls[i]!;
    const b = calls[i + 1]!;
    if (a.method === 'moveTo' && b.method === 'lineTo') {
      out.push([a.args[0] as number, a.args[1] as number, b.args[0] as number, b.args[1] as number]);
    }
  }
  return out;
}

describe('lollipop — mark geometry (pure)', () => {
  it('the terminal dot is >= 10px and clamped to the slot width', () => {
    expect(LOLLIPOP_MIN_DOT_RADIUS * 2).toBe(10);
    expect(lollipopDotRadius(8)).toBe(LOLLIPOP_MIN_DOT_RADIUS); // 4 -> clamped up
    expect(lollipopDotRadius(14)).toBe(7);
    expect(lollipopDotRadius(200)).toBe(LOLLIPOP_MAX_DOT_RADIUS);
    expect(lollipopDotRadius(Number.NaN)).toBe(LOLLIPOP_MIN_DOT_RADIUS);
  });

  it('a vertical mark stems along y from the baseline to the value', () => {
    expect(lollipopMark({ x: 100, y: 50, y0: 300 }, 30, false)).toEqual({
      x1: 100,
      y1: 300,
      x2: 100,
      y2: 50,
      cx: 100,
      cy: 50,
      r: 9,
    });
    expect(LOLLIPOP_STEM_WIDTH).toBe(1);
  });

  it('a horizontal mark stems along x at the row center', () => {
    expect(lollipopMark({ x: 400, y: 80, y0: 32 }, 12, true)).toEqual({
      x1: 32,
      y1: 80,
      x2: 400,
      y2: 80,
      cx: 400,
      cy: 80,
      r: 6,
    });
  });

  it('a negative value stems downward from the baseline (no special casing)', () => {
    const m = lollipopMark({ x: 100, y: 320, y0: 200 }, 20, false);
    expect(m).toMatchObject({ x1: 100, y1: 200, x2: 100, y2: 320, cy: 320 });
  });
});

describe('lollipop — rendering', () => {
  it('draws one 1px stem + one terminal dot per datum at the band centers', () => {
    const { el } = mount({ type: 'lollipop', data });
    expect(circles(el)).toEqual([
      [vCenter(0), 12, LOLLIPOP_MAX_DOT_RADIUS], // 10
      [vCenter(1), 224.4, LOLLIPOP_MAX_DOT_RADIUS], // 4
      [vCenter(2), 153.6, LOLLIPOP_MAX_DOT_RADIUS], // 6
    ]);
    expect(segments(el)).toContainEqual([vCenter(0), 366, vCenter(0), 12]);
    expect(segments(el)).toContainEqual([vCenter(1), 366, vCenter(1), 224.4]);
    expect(segments(el)).toContainEqual([vCenter(2), 366, vCenter(2), 153.6]);
    expect(ctxOf(el).__props.some((p) => p.prop === 'lineWidth' && p.value === LOLLIPOP_STEM_WIDTH)).toBe(true);
  });

  it('honors horizontal: true (rows, stems along x from the value baseline)', () => {
    const { el } = mount({ type: 'lollipop', data, horizontal: true });
    expect(circles(el)).toEqual([
      [588, hCenter(0), LOLLIPOP_MAX_DOT_RADIUS], // x(10) = 32 + 556
      [254.4, hCenter(1), LOLLIPOP_MAX_DOT_RADIUS], // x(4) = 32 + 222.4
      [32 + (6 / 10) * 556, hCenter(2), LOLLIPOP_MAX_DOT_RADIUS], // x(6)
    ]);
    expect(segments(el)).toContainEqual([32, hCenter(0), 588, hCenter(0)]);
  });

  it('groups several series into slots, exactly like bar', () => {
    const { el } = mount({ type: 'lollipop', data: two });
    // n = 1 with bar padding: step = 550 / 1.05, bandwidth = 0.75 * step.
    const step = 550 / 1.05;
    const bw = step * 0.75;
    const slotW = (bw - 2) / 2;
    const start = 38 + step * 0.15;
    const r = lollipopDotRadius(slotW);
    expect(circles(el)).toEqual([
      [start + slotW / 2, 12, r],
      [start + slotW + 2 + slotW / 2, 153.6, r],
    ]);
  });

  it('marks wear the series color and a per-datum color override wins', () => {
    const { el } = mount({
      type: 'lollipop',
      data: { categories: ['A', 'B'], series: [{ name: 'V', data: [{ y: 10 }, { y: 6, color: '#123456' }] }] },
    });
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain(lightTheme.series[0]);
    expect(fills).toContain('#123456');
  });
});

describe('lollipop — stacking is unsupported', () => {
  it('stacked: true throws a clear, actionable error', () => {
    expect(() => mount({ type: 'lollipop', data, stacked: true })).toThrow(LOLLIPOP_STACKED_ERROR);
    expect(() => mount({ type: 'lollipop', data, stacked: true })).toThrow(/does not support stacking/);
    expect(() => mount({ type: 'lollipop', data, stacked: true })).toThrow(/type: 'bar'/);
  });

  it('the definition declares stacking off, so no stack math can ever run', () => {
    expect(getChartType('lollipop').needs.stacking).toBe(false);
    expect(getChartType('lollipop').needs.xScale).toBe('band');
  });

  it('stacked: false is fine, and update({ stacked: true }) still throws', () => {
    const { chart } = mount({ type: 'lollipop', data, stacked: false });
    expect(chart.getOptions().stacked).toBe(false);
    expect(() => chart.update({ stacked: true })).toThrow(/does not support stacking/);
  });
});

describe('lollipop — legend, a11y, tooltip, keyboard', () => {
  it('legend follows the bar auto policy and toggles series', () => {
    const one = mount({ type: 'lollipop', data });
    expect((one.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const many = mount({ type: 'lollipop', data: two });
    const items = [...many.el.querySelectorAll('.chartcraft-legend-item')] as HTMLButtonElement[];
    expect(items.map((i) => i.textContent)).toEqual(['V', 'W']);
    expect(circles(many.el)).toHaveLength(2);
    items[1]!.click();
    // One more dot painted on the toggle frame: only 'V' remains.
    expect(circles(many.el)).toHaveLength(3);
  });

  it('a11y table is category rows x series columns', () => {
    const { el, chart } = mount({ type: 'lollipop', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Category', 'V']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['A', '10'],
      ['B', '4'],
      ['C', '6'],
    ]);
    expect(chart.exportData()).toBe('Category,V\nA,10\nB,4\nC,6');
  });

  it('tooltip shows the category and the value', () => {
    const { el } = mount({ type: 'lollipop', data });
    key(el, 'ArrowRight');
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('A');
    expect(tip.innerHTML).toContain('10');
  });

  it('keyboard navigation walks the categories', () => {
    const { el, chart } = mount({ type: 'lollipop', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'V', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('A: 10. V, point 1 of 3.');
    key(el, 'End');
    expect(region.textContent).toBe('C: 6. V, point 3 of 3.');
  });

  it('hit-testing claims the full column band (bar spec)', () => {
    const { el, chart } = mount({ type: 'lollipop', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    // Column B, well above its dot at y = 224.4.
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: vCenter(1), clientY: 40, bubbles: true }));
    expect(enters[0]).toMatchObject({ dataIndex: 1 });
  });
});
