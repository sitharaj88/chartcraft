/**
 * v0.3 features — registration surface: idempotent `registerBuiltinDecorators`,
 * layer/order contract, zero effect on charts that configure no feature, and
 * the six features coexisting on one chart (including the export path, which
 * paints through an offscreen renderer with no live DOM host).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDecorators, decorators, registerDecorator, type DecoratorHost } from '../src/index';
import { brushRectFor, registerBuiltinDecorators } from '../src/features';
import { buildModel, resolveOptions } from '../src/model';
import { registerBuiltinChartTypes } from '../src/charts';
import type { Annotation, ChartOptions } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, mount, paintedText } from './helpers';
import { resetMediaQueries } from './setup';

registerBuiltinChartTypes();
registerBuiltinDecorators();

beforeEach(() => {
  clearDecorators();
  registerBuiltinDecorators();
});

afterEach(() => {
  clearDecorators();
  cleanupDom();
  resetMediaQueries();
});

const plain: ChartOptions = {
  type: 'line',
  data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [10, 20, 30] }] },
};

describe('registerBuiltinDecorators', () => {
  it('registers the six feature passes with stable ids, layers and order', () => {
    expect(decorators().map((d) => [d.id, d.layer, d.order ?? 0])).toEqual([
      ['chartcraft:annotations-bands', 'under', 10],
      ['chartcraft:error-bars', 'over', 10],
      ['chartcraft:trendlines', 'over', 20],
      ['chartcraft:annotations-marks', 'over', 30],
      ['chartcraft:data-labels', 'over', 40],
      ['chartcraft:zoom', 'over', 90],
    ]);
  });

  it('is idempotent', () => {
    registerBuiltinDecorators();
    registerBuiltinDecorators();
    expect(decorators()).toHaveLength(6);
    expect(decorators('under')).toHaveLength(1);
    expect(decorators('over')).toHaveLength(5);
  });

  it('sorts the over layer so labels and the brush paint last', () => {
    expect(decorators('over').map((d) => d.id)).toEqual([
      'chartcraft:error-bars',
      'chartcraft:trendlines',
      'chartcraft:annotations-marks',
      'chartcraft:data-labels',
      'chartcraft:zoom',
    ]);
  });
});

describe('charts that configure no feature', () => {
  it('draw byte-identically with and without the decorators registered', () => {
    const withFeatures = mount(plain);
    const a = ctxOf(withFeatures.el).__calls.length;
    clearDecorators();
    const without = mount(plain);
    const b = ctxOf(without.el).__calls.length;
    expect(a).toBe(b);
  });

  it('keep the v0.2 value domain exactly', () => {
    const model = buildModel(resolveOptions(plain), new Map());
    expect(model.yDomain).toEqual([10, 30]);
  });

  it('add no aria-describedby and no extra table columns', () => {
    const { el } = mount({ ...plain, a11y: { table: 'visible' } });
    expect(canvasOf(el).getAttribute('aria-describedby')).toBeNull();
    expect([...el.querySelectorAll('.chartcraft-a11y-table th[scope="col"]')].map((n) => n.textContent)).toEqual([
      'Category',
      'S',
    ]);
  });

  it('opt out on non-cartesian types even when features are configured', () => {
    const annotations: Annotation[] = [{ kind: 'line', axis: 'y', value: 5 }];
    expect(() =>
      mount({
        type: 'pie',
        dataLabels: true,
        annotations,
        zoom: true,
        data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2] }] },
      }),
    ).not.toThrow();
  });
});

describe('all features on one chart', () => {
  const everything: ChartOptions = {
    type: 'line',
    legend: true,
    zoom: true,
    dataLabels: { select: 'last' },
    annotations: [
      { kind: 'band', axis: 'x', from: 0, to: 1, label: 'Ramp' },
      { kind: 'line', axis: 'y', value: 25, label: 'Target' },
    ],
    a11y: { table: 'visible' },
    data: {
      categories: ['A', 'B', 'C'],
      series: [{ name: 'S', data: [10, 20, 30], errorBars: { percent: 10 }, trendline: {} }],
    },
  };

  it('paints every feature and wires their a11y surfaces', () => {
    const { el } = mount(everything);
    const texts = paintedText(el);
    expect(texts).toContain('Ramp');
    expect(texts).toContain('Target');
    expect(texts).toContain('30'); // the 'last' data label
    // Trendline legend entry after the series item.
    expect([...el.querySelectorAll('.chartcraft-legend-item')].map((b) => b.textContent)).toEqual(['S', 'S trend']);
    // Error-bar ± columns in the table.
    expect([...el.querySelectorAll('.chartcraft-a11y-table th[scope="col"]')].map((n) => n.textContent)).toEqual([
      'Category',
      'S',
      'S ± low',
      'S ± high',
    ]);
    // Annotations in the description, never in the table.
    expect(canvasOf(el).getAttribute('aria-describedby')).toBeTruthy();
    expect([...el.querySelectorAll('.chartcraft-a11y-table tbody tr')]).toHaveLength(3);
  });

  it('exports an image without touching the live DOM seams', async () => {
    const { chart, el } = mount(everything);
    const before = canvasOf(el).getAttribute('aria-describedby');
    const blob = await chart.exportImage({ scale: 1 });
    expect(blob.type).toBe('image/png');
    expect(canvasOf(el).getAttribute('aria-describedby')).toBe(before);
    const headers = [...el.querySelectorAll('.chartcraft-a11y-table th[scope="col"]')].map((n) => n.textContent);
    expect(headers).toEqual(['Category', 'S', 'S ± low', 'S ± high']);
  });

  it('exportData mirrors the a11y table EXACTLY, error-bar ± columns included', () => {
    const { el, chart } = mount({ ...everything, a11y: { table: 'visible' } });
    // The contract says exportData "emits exactly the a11y table's contents".
    // Both now come from ONE spec: the type's `a11yTable` stage plus every
    // decorator's `a11yTable` transform (previously the ± columns were appended
    // to the built DOM only, so the CSV/JSON export silently disagreed).
    const domHeaders = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(domHeaders).toEqual(['Category', 'S', 'S ± low', 'S ± high']);
    expect(chart.exportData().split('\n')[0]).toBe('Category,S,S ± low,S ± high');
  });
});

describe('multiple charts', () => {
  it('keep independent zoom state', () => {
    const hosts: DecoratorHost[] = [];
    registerDecorator({
      id: 'test:hosts',
      layer: 'over',
      draw: () => {},
      attach: (h) => {
        hosts.push(h);
      },
    });
    const a = mount({ type: 'line', zoom: true, data: { series: [{ name: 'A', data: [[0, 0], [10, 5]] as [number, number][] }] } });
    const b = mount({ type: 'line', zoom: true, data: { series: [{ name: 'B', data: [[0, 0], [10, 5]] as [number, number][] }] } });
    expect(hosts).toHaveLength(2);
    a.chart.zoomTo({ x: [2, 4] });
    expect(hosts[0]!.getViewport()).toEqual({ x: [2, 4] });
    expect(hosts[1]!.getViewport()).toBeNull();
    expect(brushRectFor(hosts[0]!)).toBeNull();
    expect(brushRectFor(hosts[1]!)).toBeNull();
    b.chart.destroy();
    expect(hosts[0]!.getViewport()).toEqual({ x: [2, 4] });
  });
});
