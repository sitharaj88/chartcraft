import { afterEach, describe, expect, it } from 'vitest';
import { registerBuiltinChartTypes } from '../src/charts';
registerBuiltinChartTypes(); // populate the registry (the pipeline does this lazily too)
import {
  CHART_TYPE_IDS,
  createNotImplementedPlaceholder,
  getChartType,
  isChartTypeRegistered,
  registerChartType,
  registeredChartTypes,
  type ChartTypeDefinition,
} from '../src/charts/registry';
import { createChart } from '../src/index';
import type { ChartType } from '../src/index';
import { cleanupDom, ctxOf, mount } from './helpers';

afterEach(cleanupDom);

const data = {
  categories: ['A', 'B', 'C'],
  series: [{ name: 'One', data: [1, 2, 3] }],
};

const V01_TYPES: ChartType[] = ['line', 'area', 'bar', 'scatter', 'pie', 'donut'];
const V02_TYPES: ChartType[] = [
  'bubble', 'histogram', 'boxplot', 'candlestick', 'ohlc', 'waterfall',
  'heatmap', 'treemap', 'sunburst', 'funnel', 'radar', 'gauge',
];

describe('chart-type registry', () => {
  it('declares all 39 contract ids (19 from v0.1/v0.2 + 20 from v0.3)', () => {
    expect(CHART_TYPE_IDS).toHaveLength(39);
    for (const id of [...V01_TYPES, 'sparkline', ...V02_TYPES]) {
      expect(CHART_TYPE_IDS).toContain(id);
    }
  });

  it('all six v0.1 types plus sparkline are registered with matching ids', () => {
    for (const id of [...V01_TYPES, 'sparkline'] as ChartType[]) {
      expect(isChartTypeRegistered(id)).toBe(true);
      expect(getChartType(id).id).toBe(id);
    }
    expect(registeredChartTypes()).toEqual(expect.arrayContaining([...V01_TYPES, 'sparkline']));
  });

  it('every v0.2 contract id is registered with a real definition', () => {
    for (const id of V02_TYPES) {
      expect(isChartTypeRegistered(id)).toBe(true);
      expect(getChartType(id).id).toBe(id);
    }
  });

  it('placeholder ids throw the helpful "not implemented" error (mechanism kept for future types)', () => {
    const real = getChartType('heatmap');
    try {
      registerChartType(createNotImplementedPlaceholder('heatmap'));
      expect(() => getChartType('heatmap')).toThrow(/not implemented yet/);
      expect(() => getChartType('heatmap')).toThrow(/registerChartType/);
      expect(() => getChartType('heatmap')).toThrow(/AUTHORING/);
      const el = document.createElement('div');
      document.body.appendChild(el);
      expect(() => createChart(el, { type: 'heatmap', data })).toThrow(/'heatmap' is declared in the v0.2 contract/);
    } finally {
      registerChartType(real);
    }
    expect(isChartTypeRegistered('heatmap')).toBe(true);
  });

  it('unknown ids throw an "unknown chart type" error (and cannot be registered)', () => {
    // 'sankey' became a real contract id in v0.3 — use an id no contract declares.
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(() => createChart(el, { type: 'quantumplot' as ChartType, data })).toThrow(
      /unknown chart type 'quantumplot'/,
    );
    expect(() =>
      registerChartType({ id: 'quantumplot' } as unknown as ChartTypeDefinition),
    ).toThrow(/cannot register unknown chart type/);
  });

  it('a custom definition replaces a registered one and the pipeline dispatches through it', () => {
    const realRadar = getChartType('radar');
    const calls: string[] = [];
    const fakeRadar: ChartTypeDefinition = {
      id: 'radar',
      needs: { cartesianAxes: false },
      layout: () => {
        calls.push('layout');
        return { pos: [[]], slices: null, bars: null };
      },
      render: () => {
        calls.push('render');
      },
      hitTest: () => null,
      legendItems: () => {
        calls.push('legend');
        return [];
      },
      a11yTable: () => {
        calls.push('table');
        return { columns: ['Spoke', 'Value'], rows: [{ header: 'A', cells: ['1'] }] };
      },
      keyboardNav: () => ({ seriesCount: 0, isVisible: () => false, pointCount: () => 0 }),
      tooltipPoints: () => [],
    };
    try {
      registerChartType(fakeRadar);
      expect(isChartTypeRegistered('radar')).toBe(true);
      const { el } = mount({ type: 'radar', data });
      expect(calls).toContain('layout');
      expect(calls).toContain('render');
      expect(calls).toContain('legend');
      expect(calls).toContain('table');
      // The a11y table content came from the definition.
      const headers = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
      expect(headers).toEqual(['Spoke', 'Value']);
    } finally {
      registerChartType(realRadar);
    }
    expect(isChartTypeRegistered('radar')).toBe(true);
  });

  it('every implemented type mounts and paints through registry dispatch', () => {
    const pieData = { series: [{ name: 'Share', data: [{ x: 'A', y: 3 }, { x: 'B', y: 1 }] }] };
    for (const type of [...V01_TYPES, 'sparkline'] as ChartType[]) {
      const d = type === 'pie' || type === 'donut' ? pieData : data;
      const { el, chart } = mount({ type, data: d });
      expect(ctxOf(el).__calls.length).toBeGreaterThan(0);
      chart.destroy();
    }
  });

  it('placeholder definitions throw from every pipeline entry point', () => {
    const ph = createNotImplementedPlaceholder('funnel');
    expect(() => ph.layout({} as never)).toThrow(/funnel/);
    expect(() => ph.render({} as never)).toThrow(/not implemented/);
    expect(() => ph.legendItems({} as never)).toThrow(/not implemented/);
    expect(() => ph.a11yTable({} as never)).toThrow(/not implemented/);
  });
});
