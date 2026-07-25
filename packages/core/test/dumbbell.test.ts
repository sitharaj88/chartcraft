/**
 * dumbbell (v0.3): slot/dot geometry, the hairline connector, endpoint legend
 * naming (lowKey/highKey), a11y table with the delta column, tooltip, keyboard
 * navigation and hit-testing.
 *
 * Layout arithmetic used by the mounted assertions (600x400, no title):
 *   value ticks 10..50 (2 chars) -> leftW = 26  ->  plot.x = 38, plot.w = 550
 *   value range [366, 12] over domain [10, 50]  ->  y(v) = 366 - 8.85 * (v - 10)
 *   band padding 0.6 / 0.3, n = 2 -> step = 275, bandwidth = 110,
 *   band starts 120.5 / 395.5, centers 175.5 / 450.5
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartData, PointEvent } from '../src/index';
import { lightTheme } from '../src/index';
import { registerIntervalChartTypes } from '../src/charts/interval';
import {
  DUMBBELL_DOT_RADIUS,
  SLOT_GAP,
  formatDelta,
  rangeOf,
  slotCenters,
  slotWidth,
} from '../src/charts/interval';
import { cleanupDom, ctxOf, key, mount } from './helpers';

registerIntervalChartTypes();

afterEach(cleanupDom);

const data: ChartData = {
  categories: ['A', 'B'],
  series: [
    {
      name: 'Change',
      data: [
        { x: 'A', low: 10, high: 30 },
        { x: 'B', low: 20, high: 50 },
      ],
    },
  ],
};

/** Two series over ONE category, so each takes a slot inside the band. */
const twoSeries: ChartData = {
  categories: ['A'],
  series: [
    { name: 'X', data: [{ x: 'A', low: 10, high: 30 }] },
    { name: 'Y', data: [{ x: 'A', low: 20, high: 50 }] },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

function dots(el: HTMLElement): number[][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'arc' && c.args[2] === DUMBBELL_DOT_RADIUS)
    .map((c) => [c.args[0] as number, c.args[1] as number]);
}

/** Straight segments in the draw log (moveTo immediately followed by lineTo). */
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

describe('dumbbell — slot & range math (pure)', () => {
  it('a single slot is the band center; two slots split the band with a 2px gap', () => {
    expect(slotCenters(120.5, 110, 1)).toEqual([175.5]);
    expect(slotWidth(110, 2)).toBe(54);
    expect(slotCenters(120.5, 110, 2)).toEqual([147.5, 203.5]);
    expect(SLOT_GAP).toBe(2);
  });

  it('slot widths never collapse below 1px, however narrow the band', () => {
    expect(slotWidth(4, 8)).toBe(1);
    expect(slotCenters(0, 4, 2)).toEqual([0.5, 3.5]);
  });

  it('rangeOf needs BOTH bounds to be finite numbers', () => {
    expect(rangeOf({ x: 0, xv: 0, y: 1, low: 1, high: 9 })).toEqual({ low: 1, high: 9 });
    expect(rangeOf({ x: 0, xv: 0, y: 1, low: 1 })).toBeNull();
    expect(rangeOf({ x: 0, xv: 0, y: 1, high: 9 })).toBeNull();
    expect(rangeOf({ x: 0, xv: 0, y: 1, low: null, high: 9 })).toBeNull();
    expect(rangeOf({ x: 0, xv: 0, y: 1, low: Number.NaN, high: 9 })).toBeNull();
    expect(rangeOf(null)).toBeNull();
  });

  it('formatDelta signs the gap', () => {
    expect(formatDelta(20)).toBe('+20');
    expect(formatDelta(-3.5)).toBe('-3.5');
    expect(formatDelta(0)).toBe('0');
  });
});

describe('dumbbell — rendering', () => {
  it('places two >= 10px dots per category at the low and high values', () => {
    const { el } = mount({ type: 'dumbbell', data });
    // Low dot first, then the high dot, per category.
    expect(dots(el)).toEqual([
      [175.5, 366], // A low 10
      [175.5, 189], // A high 30
      [450.5, 277.5], // B low 20
      [450.5, 12], // B high 50
    ]);
    expect(DUMBBELL_DOT_RADIUS * 2).toBeGreaterThanOrEqual(10);
  });

  it('connects the dots with a 1px hairline in the gridline color', () => {
    const { el } = mount({ type: 'dumbbell', data });
    expect(segments(el)).toContainEqual([175.5, 366, 175.5, 189]);
    expect(segments(el)).toContainEqual([450.5, 277.5, 450.5, 12]);
    const ctx = ctxOf(el);
    // The connector is drawn between the two dot fills, so a gridline-colored
    // 1px stroke exists inside the mark phase.
    expect(ctx.__props.some((p) => p.prop === 'strokeStyle' && p.value === lightTheme.gridline)).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === 1)).toBe(true);
  });

  it('the two endpoints wear palette slots 1 & 2 (never per-series hues)', () => {
    const { el } = mount({ type: 'dumbbell', data });
    const fills = ctxOf(el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain(lightTheme.series[0]);
    expect(fills).toContain(lightTheme.series[1]);
    expect(fills).not.toContain(lightTheme.series[2]);
  });

  it('several series take their own slot inside the band', () => {
    const { el } = mount({ type: 'dumbbell', data: twoSeries });
    // n = 1 -> step = 550, bandwidth = 220, band start 203; two slots of 109.
    expect(slotCenters(203, 220, 2)).toEqual([257.5, 368.5]);
    expect(dots(el)).toEqual([
      [257.5, 366], // X low 10
      [257.5, 189], // X high 30
      [368.5, 277.5], // Y low 20
      [368.5, 12], // Y high 50
    ]);
  });

  it('a point missing a bound draws nothing for that category', () => {
    const { el } = mount({
      type: 'dumbbell',
      data: {
        categories: ['A', 'B'],
        series: [{ name: 'Change', data: [{ x: 'A', low: 10, high: 30 }, { x: 'B', low: 20 }] }],
      },
    });
    // Only category A has a dumbbell. The lone `low: 20` still joins the value
    // extent, so the domain nices to [10, 30] and A spans the full plot height.
    expect(dots(el)).toEqual([
      [175.5, 366],
      [175.5, 12],
    ]);
  });
});

describe('dumbbell — legend, a11y, tooltip, keyboard', () => {
  it('legend names the two ENDPOINTS, is shown for a single series, and is not toggleable', () => {
    const { el } = mount({ type: 'dumbbell', data });
    const legend = el.querySelector('.chartcraft-legend') as HTMLElement;
    expect(legend.style.display).not.toBe('none');
    const items = [...legend.querySelectorAll('.chartcraft-legend-item')] as HTMLButtonElement[];
    expect(items.map((i) => i.textContent)).toEqual(['Low', 'High']);
    expect(items.map((i) => i.disabled)).toEqual([true, true]);
    expect(items.map((i) => i.getAttribute('aria-pressed'))).toEqual([null, null]);
  });

  it('lowKey / highKey name the endpoints in the legend AND the table', () => {
    const { el } = mount({
      type: 'dumbbell',
      data: {
        categories: ['A'],
        series: [
          {
            name: 'Spread',
            lowKey: '2010',
            highKey: '2020',
            data: [{ x: 'A', 2010: 10, 2020: 30 }] as unknown as ChartData['series'][0]['data'],
          },
        ],
      },
    });
    const items = [...el.querySelectorAll('.chartcraft-legend-item')].map((i) => i.textContent);
    expect(items).toEqual(['2010', '2020']);
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Category', '2010', '2020', 'Delta']);
  });

  it('an explicit legend: false is honored', () => {
    const { el } = mount({ type: 'dumbbell', data, legend: false });
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });

  it('a11y table is category / low / high / delta', () => {
    const { el, chart } = mount({ type: 'dumbbell', data });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Category', 'Low', 'High', 'Delta']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['A', '10', '30', '+20'],
      ['B', '20', '50', '+30'],
    ]);
    expect(chart.exportData()).toBe('Category,Low,High,Delta\nA,10,30,+20\nB,20,50,+30');
  });

  it('a multi-series table qualifies each row with the series name', () => {
    const { el } = mount({ type: 'dumbbell', data: twoSeries });
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['A — X', '10', '30', '+20'],
      ['A — Y', '20', '50', '+30'],
    ]);
  });

  it('tooltip lists both endpoints and the delta', () => {
    const { el } = mount({ type: 'dumbbell', data });
    key(el, 'ArrowRight');
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('Low 10 · High 30 · delta +20');
    key(el, 'ArrowRight');
    expect(tip.innerHTML).toContain('Low 20 · High 50 · delta +30');
  });

  it('keyboard navigation announces both endpoints and the delta', () => {
    const { el, chart } = mount({ type: 'dumbbell', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'Change', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('A: Low 10, High 30, delta +20. Change, point 1 of 2.');
    key(el, 'End');
    expect(region.textContent).toBe('B: Low 20, High 50, delta +30. Change, point 2 of 2.');
  });

  it('hit-testing claims the whole category band, dots or not', () => {
    const { el, chart } = mount({ type: 'dumbbell', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    // Far from both dots of category B, but inside its band.
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 470, clientY: 340, bubbles: true }));
    expect(enters[0]).toMatchObject({ seriesName: 'Change', dataIndex: 1 });
  });
});
