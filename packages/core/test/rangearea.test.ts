/**
 * rangearea (v0.3): band geometry, `needs.triple: 'range'` normalization,
 * lowKey/highKey, `rangearea.showBounds`, the combo-with-a-line case, legend
 * policy, a11y table, tooltip and keyboard navigation.
 *
 * Layout arithmetic used by the mounted assertions (600x400, no title):
 *   plot.y = 12, plot.h = 354  ->  value range [366, 12]
 *   value ticks 10..50 (2 chars, 6px/char) -> leftW = 12 + 14 = 26
 *   plot.x = 38, plot.w = 550
 *   y(v) = 366 - 8.85 * (v - 10)    (value domain [10, 50])
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartData, PointEvent } from '../src/index';
import { LinearScale, darkTheme, lightTheme } from '../src/index';
import { registerIntervalChartTypes } from '../src/charts/interval';
import {
  RANGE_BAND_ALPHA,
  bandSeriesIndices,
  rangeBandPaths,
  rangeBandPositions,
} from '../src/charts/interval';
import { isChartTypeRegistered } from '../src/charts/registry';
import { cleanupDom, ctxOf, key, mount } from './helpers';

registerIntervalChartTypes();

afterEach(cleanupDom);

/** [x, low, high] triples (needs.triple: 'range'). */
const ci: ChartData = {
  series: [{ name: 'CI', data: [[0, 10, 30], [1, 20, 50], [2, 15, 40]] }],
};

/** A band plus a line of the same color — the forecast/CI combo. */
const combo: ChartData = {
  series: [
    { name: 'CI', color: '#2a78d6', data: [[0, 10, 30], [1, 20, 50]] },
    { name: 'Forecast', type: 'line', color: '#2a78d6', data: [[0, 20], [1, 35]] },
  ],
};

function tooltipEl(): HTMLElement {
  return document.querySelector('.chartcraft-tooltip') as HTMLElement;
}

function moveToCount(el: HTMLElement): number {
  return ctxOf(el).__calls.filter((c) => c.method === 'moveTo').length;
}

type Seg = [string, number, number];

/** Every traced subpath in the draw log (gridlines, band fill, edges, lines). */
function subpaths(el: HTMLElement): Seg[][] {
  const out: Seg[][] = [];
  let cur: Seg[] | null = null;
  for (const c of ctxOf(el).__calls) {
    if (c.method === 'moveTo') {
      cur = [['M', c.args[0] as number, c.args[1] as number]];
      out.push(cur);
    } else if (c.method === 'lineTo' && cur) {
      cur.push(['L', c.args[0] as number, c.args[1] as number]);
    }
  }
  return out;
}

describe('rangearea — band layout math (pure)', () => {
  it('rangeBandPositions puts the HIGH edge in y and the LOW edge in y0', () => {
    const ys = new LinearScale([0, 10], [100, 0]);
    const pos = rangeBandPositions(
      [
        { x: 0, xv: 0, y: 2, low: 2, high: 8 },
        { x: 1, xv: 1, y: 4, low: 4, high: 5 },
      ],
      (pi) => pi * 100,
      ys,
    );
    expect(pos).toEqual([
      { x: 0, y: 20, y0: 80 },
      { x: 100, y: 50, y0: 60 },
    ]);
  });

  it('a point missing either bound is a gap, and so is a point without an x', () => {
    const ys = new LinearScale([0, 10], [100, 0]);
    const pos = rangeBandPositions(
      [
        { x: 0, xv: 0, y: 2, low: 2 },
        { x: 1, xv: 1, y: 3, high: 9 },
        { x: 2, xv: 2, y: 1, low: 1, high: 9 },
      ],
      (pi) => (pi === 2 ? null : pi),
      ys,
    );
    expect(pos).toEqual([null, null, null]);
  });

  it('rangeBandPaths closes the band high-edge-forward then low-edge-back', () => {
    const paths = rangeBandPaths([
      { x: 0, y: 20, y0: 80 },
      { x: 100, y: 10, y0: 60 },
    ]);
    expect(paths.fill).toEqual([
      ['M', 0, 20],
      ['L', 100, 10],
      ['L', 100, 60],
      ['L', 0, 80],
      ['Z'],
    ]);
    expect(paths.upper).toEqual([
      ['M', 0, 20],
      ['L', 100, 10],
    ]);
    expect(paths.lower).toEqual([
      ['M', 0, 80],
      ['L', 100, 60],
    ]);
  });

  it('rangeBandPaths splits at gaps into independent closed subpaths', () => {
    const paths = rangeBandPaths([
      { x: 0, y: 20, y0: 80 },
      { x: 10, y: 25, y0: 75 },
      null,
      { x: 30, y: 30, y0: 70 },
      { x: 40, y: 35, y0: 65 },
    ]);
    expect(paths.fill.filter((c) => c[0] === 'Z')).toHaveLength(2);
    expect(paths.fill.filter((c) => c[0] === 'M')).toHaveLength(2);
    expect(paths.upper).toEqual([
      ['M', 0, 20],
      ['L', 10, 25],
      ['M', 30, 30],
      ['L', 40, 35],
    ]);
  });

  it('bandSeriesIndices picks exactly the visible series carrying low/high', () => {
    expect(
      bandSeriesIndices([
        { visible: true, points: [{ x: 0, xv: 0, y: 1, low: 1, high: 2 }] },
        { visible: true, points: [{ x: 0, xv: 0, y: 1 }] },
        { visible: false, points: [{ x: 0, xv: 0, y: 1, low: 1, high: 2 }] },
      ]),
    ).toEqual([0]);
  });
});

describe('rangearea — rendering', () => {
  it('the band is filled at 0.18 alpha and traced high-edge-forward', () => {
    const { el } = mount({ type: 'rangearea', data: ci });
    const ctx = ctxOf(el);
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === RANGE_BAND_ALPHA)).toBe(true);
    // y(30) = 189, y(50) = 12, y(40) = 100.5, then back along y(15), y(20), y(10).
    expect(subpaths(el)).toContainEqual([
      ['M', 38, 189],
      ['L', 313, 12],
      ['L', 588, 100.5],
      ['L', 588, 321.75],
      ['L', 313, 277.5],
      ['L', 38, 366],
    ]);
    // ...and the two hairline edges as their own polylines.
    expect(subpaths(el)).toContainEqual([
      ['M', 38, 189],
      ['L', 313, 12],
      ['L', 588, 100.5],
    ]);
    expect(subpaths(el)).toContainEqual([
      ['M', 38, 366],
      ['L', 313, 277.5],
      ['L', 588, 321.75],
    ]);
  });

  it('showBounds draws two hairline edges by default and none when off', () => {
    const on = mount({ type: 'rangearea', data: ci });
    const off = mount({ type: 'rangearea', data: ci, rangearea: { showBounds: false } });
    // The band fill is one subpath; each edge polyline adds one more moveTo.
    expect(moveToCount(on.el) - moveToCount(off.el)).toBe(2);
  });

  it('combos with a line series of the same color on ONE shared y-axis', () => {
    const { el } = mount({ type: 'rangearea', data: combo });
    const ctx = ctxOf(el);
    // The band: y(30) = 189 at x(0) = 38, y(50) = 12 at x(1) = 588.
    expect(subpaths(el)).toContainEqual([
      ['M', 38, 189],
      ['L', 588, 12],
      ['L', 588, 277.5],
      ['L', 38, 366],
    ]);
    // The line: y(20) = 277.5 -> y(35) = 144.75, with 8px markers (radius 4).
    expect(subpaths(el)).toContainEqual([
      ['M', 38, 277.5],
      ['L', 588, 144.75],
    ]);
    const markers = ctx.__calls
      .filter((c) => c.method === 'arc' && c.args[2] === 4)
      .map((c) => [c.args[0], c.args[1]]);
    expect(markers).toEqual([
      [38, 277.5],
      [588, 144.75],
    ]);
    // Both marks wear the caller's color, so the band reads as the line's CI.
    expect(ctx.__props.filter((p) => p.prop === 'fillStyle' && p.value === '#2a78d6').length).toBeGreaterThan(1);
  });

  it('lowKey / highKey remap custom object fields into the band', () => {
    const { el } = mount({
      type: 'rangearea',
      data: {
        series: [
          {
            name: 'P10-P90',
            lowKey: 'p10',
            highKey: 'p90',
            data: [
              { x: 0, p10: 10, p90: 30 },
              { x: 1, p10: 20, p90: 50 },
            ] as unknown as ChartData['series'][0]['data'],
          },
        ],
      },
    });
    expect(subpaths(el)).toContainEqual([
      ['M', 38, 189],
      ['L', 588, 12],
      ['L', 588, 277.5],
      ['L', 38, 366],
    ]);
  });

  it('the band follows the theme palette (dark scheme uses the dark slots)', () => {
    const dark = mount({ type: 'rangearea', data: ci, theme: 'dark' });
    const fills = ctxOf(dark.el).__props.filter((p) => p.prop === 'fillStyle').map((p) => p.value);
    expect(fills).toContain(darkTheme.series[0]);
    expect(fills).toContain(darkTheme.surface);
    expect(fills).not.toContain(lightTheme.series[0]);
  });

  it('registration is idempotent and covers all five interval types', () => {
    registerIntervalChartTypes();
    registerIntervalChartTypes();
    for (const id of ['rangearea', 'bullet', 'dumbbell', 'lollipop', 'slope'] as const) {
      expect(isChartTypeRegistered(id)).toBe(true);
    }
  });
});

describe('rangearea — legend, a11y, tooltip, keyboard', () => {
  it('legend follows the generic auto policy (hidden for one series, shown for two)', () => {
    const one = mount({ type: 'rangearea', data: ci });
    expect((one.el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const two = mount({ type: 'rangearea', data: combo });
    const legend = two.el.querySelector('.chartcraft-legend') as HTMLElement;
    expect(legend.style.display).not.toBe('none');
    const items = [...legend.querySelectorAll('.chartcraft-legend-item')];
    expect(items.map((i) => i.textContent)).toEqual(['CI', 'Forecast']);
    expect(items.every((i) => i.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('a11y table of a lone band series has Low/High columns', () => {
    const { el } = mount({ type: 'rangearea', data: ci });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['X', 'Low', 'High']);
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['0', '10', '30'],
      ['1', '20', '50'],
      ['2', '15', '40'],
    ]);
  });

  it('a11y table of a combo prefixes the bounds with the band series name', () => {
    const { el, chart } = mount({ type: 'rangearea', data: combo });
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['X', 'CI low', 'CI high', 'Forecast']);
    // exportData() mirrors the table exactly.
    expect(chart.exportData()).toBe('X,CI low,CI high,Forecast\n0,10,30,20\n1,20,50,35');
  });

  it('tooltip lists both bounds', () => {
    const { el } = mount({ type: 'rangearea', data: ci });
    key(el, 'ArrowRight');
    const tip = tooltipEl();
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('low 10 · high 30');
    key(el, 'ArrowRight');
    expect(tip.innerHTML).toContain('low 20 · high 50');
  });

  it('keyboard navigation walks the band and announces both bounds', () => {
    const { el, chart } = mount({ type: 'rangearea', data: ci });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight');
    expect(enters[0]).toMatchObject({ seriesName: 'CI', dataIndex: 0, clientX: -1 });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('0: low 10, high 30. CI, point 1 of 3.');
    key(el, 'End');
    expect(region.textContent).toBe('2: low 15, high 40. CI, point 3 of 3.');
  });

  it('hit-testing claims the pointer anywhere inside the band', () => {
    const { el, chart } = mount({ type: 'rangearea', data: ci });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    // Mid-band at x(1) = 313: between y(50) = 12 and y(20) = 277.5.
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 313, clientY: 150, bubbles: true }));
    expect(enters[0]).toMatchObject({ seriesId: 'CI', dataIndex: 1 });
  });
});
