import { afterEach, describe, expect, it } from 'vitest';
import type { PointEvent } from '../src/index';
import { lightTheme } from '../src/index';
import { registerStatisticalChartTypes } from '../src/charts/statistical';
import { computeWaterfallSteps, stepColor } from '../src/charts/statistical/waterfall';
import { isChartTypeRegistered } from '../src/charts/registry';
import { cleanupDom, ctxOf, key, mount } from './helpers';

registerStatisticalChartTypes();

afterEach(cleanupDom);

const data = {
  series: [
    {
      name: 'P&L',
      data: [
        { x: 'Start', y: 100 },
        { x: 'Costs', y: -30 },
        { x: 'Subtotal', y: 70, isTotal: true },
        { x: 'Growth', y: 50 },
        { x: 'End', y: 120, isTotal: true },
      ],
    },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

function moveToCount(el: HTMLElement): number {
  return ctxOf(el).__calls.filter((c) => c.method === 'moveTo').length;
}

describe('waterfall — running-total math (pure)', () => {
  it('floats deltas from the running total; totals are absolute from zero', () => {
    const steps = computeWaterfallSteps([
      { value: 100 },
      { value: -30 },
      { value: 70, isTotal: true },
      { value: 50 },
      { value: 120, isTotal: true },
    ]);
    expect(steps).toEqual([
      { start: 0, end: 100, kind: 'up' },
      { start: 100, end: 70, kind: 'down' },
      { start: 0, end: 70, kind: 'total' },
      { start: 70, end: 120, kind: 'up' },
      { start: 0, end: 120, kind: 'total' },
    ]);
  });

  it('a total resets the running total for subsequent deltas', () => {
    const steps = computeWaterfallSteps([{ value: 10 }, { value: 500, isTotal: true }, { value: 5 }]);
    expect(steps[2]).toEqual({ start: 500, end: 505, kind: 'up' });
  });

  it('zero deltas are neutral; nulls are gaps that keep the running total', () => {
    const steps = computeWaterfallSteps([{ value: 100 }, { value: 0 }, { value: null }, { value: 20 }]);
    expect(steps[1]).toEqual({ start: 100, end: 100, kind: 'neutral' });
    expect(steps[2]).toBeNull();
    expect(steps[3]).toEqual({ start: 100, end: 120, kind: 'up' });
  });

  it('stepColor maps up/down to theme.up/down and totals/neutral to theme.neutral', () => {
    expect(stepColor('up', lightTheme)).toBe(lightTheme.up);
    expect(stepColor('down', lightTheme)).toBe(lightTheme.down);
    expect(stepColor('total', lightTheme)).toBe(lightTheme.neutral);
    expect(stepColor('neutral', lightTheme)).toBe(lightTheme.neutral);
  });
});

describe('waterfall — rendering', () => {
  it('bars are colored theme.up / theme.down / theme.neutral', () => {
    const { el } = mount({ type: 'waterfall', data });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.up)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.down)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === lightTheme.neutral)).toBe(true);
    const rects = ctx.__calls.filter((c) => c.method === 'fillRect' && !(c.args[0] === 0 && c.args[1] === 0));
    expect(rects).toHaveLength(5);
  });

  it('hairline connectors are drawn by default and can be disabled', () => {
    const on = mount({ type: 'waterfall', data });
    const off = mount({ type: 'waterfall', data, waterfall: { connectors: false } });
    // 4 connectors between 5 bars → exactly 4 extra line segments.
    expect(moveToCount(on.el) - moveToCount(off.el)).toBe(4);
  });

  it('the y domain covers the running-total extent (niced), including zero', () => {
    const { chart } = mount({ type: 'waterfall', data });
    const o = chart.getOptions();
    expect(o.yAxis!.min).toBe(0);
    expect(o.yAxis!.max).toBe(120);
  });

  it('registration is idempotent and covers all six statistical types', () => {
    registerStatisticalChartTypes();
    registerStatisticalChartTypes();
    for (const id of ['bubble', 'histogram', 'boxplot', 'candlestick', 'ohlc', 'waterfall'] as const) {
      expect(isChartTypeRegistered(id)).toBe(true);
    }
  });
});

describe('waterfall — legend, a11y, tooltip, keyboard', () => {
  it('legend follows the auto policy (hidden for the single series)', () => {
    const { el } = mount({ type: 'waterfall', data });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('a11y table rows are label, delta, running total', () => {
    const { el } = mount({ type: 'waterfall', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Label', 'Delta', 'Running total']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['Start', '+100', '100'],
      ['Costs', '-30', '70'],
      ['Subtotal', 'Total 70', '70'],
      ['Growth', '+50', '120'],
      ['End', 'Total 120', '120'],
    ]);
  });

  it('tooltip shows the signed delta and the running total', () => {
    const { el } = mount({ type: 'waterfall', data });
    key(el, 'ArrowRight'); // Start
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('+100 (running total 100)');
    key(el, 'ArrowRight'); // Costs
    expect(tip.innerHTML).toContain('-30 (running total 70)');
  });

  it('tooltip labels totals as totals', () => {
    const { el } = mount({ type: 'waterfall', data });
    key(el, 'ArrowRight');
    key(el, 'ArrowRight');
    key(el, 'ArrowRight'); // Subtotal
    expect(tooltipEl().innerHTML).toContain('Total 70');
  });

  it('keyboard navigation announces label, delta and running total', () => {
    const { el, chart } = mount({ type: 'waterfall', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'P&L', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('Start: +100, running total 100');
    key(el, 'End');
    expect(region.textContent).toContain('End: total 120');
  });
});
