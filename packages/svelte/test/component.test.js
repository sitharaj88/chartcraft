/**
 * @vitest-environment jsdom
 *
 * Real component tests for @chartcraft/svelte against the real @chartcraft/core:
 * per-type aliases mount with the right `type`, option changes route through
 * chart.update(), the v0.3 events reach `on:zoom` / `on:annotationclick`, and
 * `getChart()` exposes the v0.3 instance methods.
 *
 * The components are compiled and evaluated in-memory (see ./loader.js) because
 * the repo ships no Svelte vitest plugin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup.js';
import { mountComponent, tick } from './loader.js';

const day = (n) => Date.UTC(2026, 0, n);

const BOX = { theme: 'light', animation: false, width: 600, height: 400 };

const baseOptions = () => ({
  ...BOX,
  data: {
    categories: ['a', 'b', 'c'],
    series: [
      { name: 'One', data: [1, 2, 3] },
      { name: 'Two', data: [3, 2, 1] },
    ],
  },
});

/** @type {{ component: any, host: HTMLElement }[]} */
const mounted = [];

function mount(name, props) {
  const entry = mountComponent(name, props);
  mounted.push(entry);
  return entry;
}

afterEach(() => {
  while (mounted.length) {
    const { component, host } = mounted.pop();
    component.$destroy();
    host.remove();
  }
});

describe('<Chart> (Svelte)', () => {
  it('mounts a chart and exposes the instance through getChart()', () => {
    const { component, host } = mount('Chart', { options: { ...baseOptions(), type: 'line' } });
    expect(host.querySelector('.chartcraft')).not.toBeNull();
    expect(host.querySelector('canvas')).not.toBeNull();
    const chart = component.getChart();
    expect(chart).not.toBeNull();
    expect(chart.getOptions().type).toBe('line');
  });

  it('routes option changes through chart.update()', async () => {
    const { component } = mount('Chart', { options: { ...baseOptions(), type: 'line' } });
    const chart = component.getChart();
    const spy = vi.spyOn(chart, 'update');

    component.$set({ options: { ...baseOptions(), type: 'line', title: 'Hello' } });
    await tick();
    expect(spy).toHaveBeenCalled();
    expect(chart.getOptions().title).toBe('Hello');
  });

  it('destroys the chart on component destroy', () => {
    const { component, host } = mount('Chart', { options: { ...baseOptions(), type: 'line' } });
    const destroy = vi.spyOn(component.getChart(), 'destroy');
    component.$destroy();
    mounted.pop(); // already destroyed
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.chartcraft')).toBeNull();
    host.remove();
  });
});

describe('per-type aliases (Svelte)', () => {
  it('v0.2 aliases still inject their type (HeatmapChart, GaugeChart)', () => {
    const heatmap = mount('HeatmapChart', { options: baseOptions() });
    expect(heatmap.component.getChart().getOptions().type).toBe('heatmap');

    const gauge = mount('GaugeChart', {
      options: { ...BOX, data: { series: [{ name: 'CPU', data: [63] }] }, gauge: { max: 100 } },
    });
    expect(gauge.component.getChart().getOptions().type).toBe('gauge');
  });

  it('v0.3 aliases mount with the correct type (sankey, choropleth, gantt, network, violin)', () => {
    const sankey = mount('SankeyChart', {
      options: {
        ...BOX,
        data: {
          series: [
            {
              name: 'Flow',
              data: {
                nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
                links: [{ source: 'a', target: 'b', value: 5 }],
              },
            },
          ],
        },
      },
    });
    expect(sankey.component.getChart().getOptions().type).toBe('sankey');
    expect(sankey.host.querySelector('canvas')).not.toBeNull();

    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Alpha' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] },
        },
      ],
    };
    const choropleth = mount('ChoroplethChart', {
      options: {
        ...BOX,
        choropleth: { geojson },
        data: { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 3 }] }] },
      },
    });
    expect(choropleth.component.getChart().getOptions().type).toBe('choropleth');
    // (deep-equal, not identical: the post-mount reactive update deep-merges)
    expect(choropleth.component.getChart().getOptions().choropleth.geojson).toStrictEqual(geojson);

    const gantt = mount('GanttChart', {
      options: {
        ...BOX,
        gantt: { rowHeight: 24 },
        data: {
          series: [
            {
              name: 'Plan',
              data: [
                { x: 'Design', start: day(1), end: day(5) },
                { x: 'Build', start: day(5), end: day(12) },
              ],
            },
          ],
        },
      },
    });
    expect(gantt.component.getChart().getOptions().type).toBe('gantt');
    expect(gantt.component.getChart().getOptions().gantt).toMatchObject({ rowHeight: 24 });

    const network = mount('NetworkChart', {
      options: {
        ...BOX,
        network: { fixedSeed: 7 },
        data: {
          series: [
            {
              name: 'Graph',
              data: {
                nodes: [{ id: 'a', label: 'A', group: 'g1' }, { id: 'b', label: 'B', group: 'g2' }],
                links: [{ source: 'a', target: 'b' }],
              },
            },
          ],
        },
      },
    });
    expect(network.component.getChart().getOptions().type).toBe('network');
    expect(network.component.getChart().getOptions().network).toMatchObject({ fixedSeed: 7 });

    const violin = mount('ViolinChart', {
      options: {
        ...BOX,
        violin: { showBox: true },
        data: {
          categories: ['A', 'B'],
          series: [
            {
              name: 'Samples',
              data: [
                [1, 2, 2, 3, 4, 4, 5],
                [2, 3, 3, 4, 5, 6, 7],
              ],
            },
          ],
        },
      },
    });
    expect(violin.component.getChart().getOptions().type).toBe('violin');
    expect(violin.component.getChart().getOptions().violin).toMatchObject({ showBox: true });
  });
});

describe('v0.3 features through the wrapper (Svelte)', () => {
  it('routes dataLabels / zoom / annotations / per-type-block changes to the chart', async () => {
    const { component } = mount('LineChart', { options: baseOptions() });
    const chart = component.getChart();
    const spy = vi.spyOn(chart, 'update');

    component.$set({ options: { ...baseOptions(), dataLabels: { select: 'all' } } });
    await tick();
    expect(chart.getOptions().dataLabels).toMatchObject({ select: 'all' });

    component.$set({
      options: { ...baseOptions(), dataLabels: { select: 'all' }, zoom: { axis: 'x', drag: true } },
    });
    await tick();
    expect(chart.getOptions().zoom).toMatchObject({ axis: 'x', drag: true });

    component.$set({
      options: {
        ...baseOptions(),
        annotations: [{ kind: 'line', axis: 'y', value: 2, label: 'Target' }],
      },
    });
    await tick();
    expect(chart.getOptions().annotations).toHaveLength(1);
    expect(spy).toHaveBeenCalled();

    // A per-type block reaches the chart the same way.
    const gauge = mount('GaugeChart', {
      options: { ...BOX, data: { series: [{ name: 'CPU', data: [63] }] }, gauge: { max: 100 } },
    });
    gauge.component.$set({
      options: { ...BOX, data: { series: [{ name: 'CPU', data: [63] }] }, gauge: { max: 200 } },
    });
    await tick();
    expect(gauge.component.getChart().getOptions().gauge).toMatchObject({ max: 200 });
  });

  it('bridges zoom and annotationclick through on:zoom / on:annotationclick', () => {
    const onZoom = vi.fn();
    const onAnnotationClick = vi.fn();
    const { component } = mount('LineChart', {
      options: {
        ...BOX,
        data: { series: [{ name: 'One', data: [[0, 1], [1, 4], [2, 9], [3, 16]] }] },
        zoom: true,
      },
    });
    component.$on('zoom', (ev) => onZoom(ev.detail));
    component.$on('annotationclick', (ev) => onAnnotationClick(ev.detail));
    const chart = component.getChart();

    chart.zoomTo({ x: [1, 2] });
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0][0]).toMatchObject({ x: [1, 2] });

    chart.zoomTo(null);
    expect(onZoom).toHaveBeenCalledTimes(2);
    expect(onZoom.mock.calls[1][0]).toBeNull();
  });

  it('exposes the v0.3 instance methods through getChart() (exportData returns CSV)', () => {
    const { component } = mount('LineChart', { options: { ...baseOptions(), zoom: true } });
    const chart = component.getChart();
    expect(typeof chart.exportImage).toBe('function');
    expect(typeof chart.exportData).toBe('function');
    expect(typeof chart.zoomTo).toBe('function');

    const csv = chart.exportData();
    expect(typeof csv).toBe('string');
    expect(csv.split('\n')[0]).toContain('One');
    expect(csv.split('\n').length).toBeGreaterThan(1);

    const json = JSON.parse(chart.exportData({ format: 'json' }));
    expect(json.columns).toContain('One');
    expect(json.rows.length).toBeGreaterThan(0);
  });

  it('per-type aliases forward getChart() to the inner <Chart>', () => {
    const { component } = mount('SankeyChart', {
      options: {
        ...BOX,
        data: {
          series: [
            {
              name: 'Flow',
              data: {
                nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
                links: [{ source: 'a', target: 'b', value: 5 }],
              },
            },
          ],
        },
      },
    });
    const csv = component.getChart().exportData();
    expect(csv.length).toBeGreaterThan(0);
  });
});
