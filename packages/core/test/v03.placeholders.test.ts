/**
 * v0.3 registry: all 39 ids are declared and every one now carries a real
 * definition. The throwing "not implemented" placeholder MECHANISM is still
 * covered here (swap-and-restore) because it is what lets a future contract
 * id land before its module does.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { registerBuiltinChartTypes } from '../src/charts';
registerBuiltinChartTypes();
import {
  CHART_TYPE_IDS,
  V02_CHART_TYPE_IDS,
  V03_CHART_TYPE_IDS,
  createNotImplementedPlaceholder,
  getChartType,
  isChartTypeRegistered,
  registerChartType,
  registeredChartTypes,
} from '../src/charts/registry';
import { createChart } from '../src/index';
import { cleanupDom } from './helpers';

afterEach(cleanupDom);

const data = { categories: ['A', 'B', 'C'], series: [{ name: 'One', data: [1, 2, 3] }] };

describe('v0.3 chart-type ids', () => {
  it('declares 19 v0.2 ids + 20 v0.3 ids = 39, with no overlap', () => {
    expect(V02_CHART_TYPE_IDS).toHaveLength(19);
    expect(V03_CHART_TYPE_IDS).toHaveLength(20);
    expect(CHART_TYPE_IDS).toHaveLength(39);
    expect(new Set(CHART_TYPE_IDS).size).toBe(39);
    for (const id of V03_CHART_TYPE_IDS) expect(V02_CHART_TYPE_IDS).not.toContain(id);
  });

  it('declares exactly the 20 v0.3 contract ids', () => {
    expect([...V03_CHART_TYPE_IDS].sort()).toEqual(
      [
        'bullet', 'calendar', 'choropleth', 'circlepack', 'dumbbell', 'gantt', 'icicle',
        'lollipop', 'marimekko', 'network', 'parallel', 'pyramid', 'radialbar', 'rangearea',
        'rose', 'sankey', 'slope', 'streamgraph', 'violin', 'wordcloud',
      ].sort(),
    );
  });

  it('all 20 v0.3 ids are registered with real definitions (no placeholders left)', () => {
    for (const id of V03_CHART_TYPE_IDS) {
      expect(isChartTypeRegistered(id)).toBe(true);
      expect(getChartType(id).id).toBe(id);
      expect(registeredChartTypes()).toContain(id);
    }
  });

  it('every v0.2 id still resolves to a real definition (nothing regressed)', () => {
    for (const id of V02_CHART_TYPE_IDS) {
      expect(isChartTypeRegistered(id)).toBe(true);
      expect(getChartType(id).id).toBe(id);
    }
  });
});

describe('the not-implemented placeholder mechanism', () => {
  // Kept alive for the next contract id that is declared before it is built:
  // swap a real definition for a placeholder, assert the guidance, restore.
  it.each([...V03_CHART_TYPE_IDS])('%s can be swapped for a guided placeholder and restored', (id) => {
    const real = getChartType(id);
    try {
      registerChartType(createNotImplementedPlaceholder(id));
      expect(isChartTypeRegistered(id)).toBe(false);
      expect(() => getChartType(id)).toThrow(
        new RegExp(`chart type '${id}' is declared in the v0.3 contract but is not implemented yet`),
      );
      expect(() => getChartType(id)).toThrow(new RegExp(`src/charts/${id}\\.ts`));
      expect(() => getChartType(id)).toThrow(/registerChartType\(\)/);
      expect(() => getChartType(id)).toThrow(/AUTHORING\.md/);

      const el = document.createElement('div');
      document.body.appendChild(el);
      expect(() => createChart(el, { type: id, data })).toThrow(/not implemented yet/);
    } finally {
      registerChartType(real);
    }
    expect(isChartTypeRegistered(id)).toBe(true);
  });
});
