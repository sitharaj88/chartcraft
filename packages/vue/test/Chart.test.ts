/**
 * Integration tests against the real @chartcraft/core: mount, exposed chart,
 * deep-watched updates, legend event bridging, destroy on unmount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, shallowRef, type App, type Component } from 'vue';
import * as api from '../src/index';
import {
  Chart,
  BarChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  SankeyChart,
  ChoroplethChart,
  GanttChart,
  NetworkChart,
  ViolinChart,
  type ChartExposed,
  type ChartOptions,
  type ChartType,
  type DataValue,
  type GeoFeatureCollection,
} from '../src/index';
import { resizeObservers } from './setup';

function makeOptions(): ChartOptions {
  return {
    type: 'line',
    data: {
      categories: ['a', 'b', 'c'],
      series: [
        { name: 'One', data: [1, 2, 3] },
        { name: 'Two', data: [3, 2, 1] },
      ],
    },
    theme: 'light',
    animation: false,
    width: 600,
    height: 400,
  };
}

const apps: App[] = [];
const hosts: HTMLElement[] = [];

function mountChart(component: Component, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const exposed = shallowRef<ChartExposed | null>(null);
  const app = createApp({
    render: () => h(component, { ...props, ref: exposed }),
  });
  app.config.warnHandler = () => undefined; // keep test output clean
  app.mount(host);
  apps.push(app);
  hosts.push(host);
  return { host, app, exposed };
}

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  while (hosts.length) hosts.pop()!.remove();
});

describe('<Chart> (Vue)', () => {
  it('mounts a chart and exposes the instance via template ref', () => {
    const { host, exposed } = mountChart(Chart, { options: makeOptions() });
    expect(host.querySelector('.chartcraft')).not.toBeNull();
    expect(host.querySelector('canvas')).not.toBeNull();
    const chart = exposed.value!.chart;
    expect(chart).not.toBeNull();
    expect(typeof chart!.update).toBe('function');
    expect(chart!.getOptions().type).toBe('line');
  });

  it('deep-watches options and routes changes through chart.update()', async () => {
    const options = reactive(makeOptions());
    const { exposed } = mountChart(Chart, { options });
    const chart = exposed.value!.chart!;
    const spy = vi.spyOn(chart, 'update');

    options.title = 'Hello';
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(chart.getOptions().title).toBe('Hello');

    // Nested mutation is caught by the deep watch too.
    options.data.series[0]!.name = 'Renamed';
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('bridges legendtoggle to @legend-toggle', () => {
    const onLegendToggle = vi.fn();
    const { host } = mountChart(Chart, { options: makeOptions(), onLegendToggle });
    const item = host.querySelector('.chartcraft-legend-item') as HTMLElement;
    expect(item).toBeTruthy();
    item.click();
    expect(onLegendToggle).toHaveBeenCalledTimes(1);
    expect(onLegendToggle.mock.calls[0]![0]).toMatchObject({ visible: false });
  });

  it('destroys the chart on unmount (no leaked observers, DOM removed)', () => {
    const { host, app, exposed } = mountChart(Chart, { options: makeOptions() });
    const destroy = vi.spyOn(exposed.value!.chart!, 'destroy');
    app.unmount();
    apps.pop();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.chartcraft')).toBeNull();
    for (const ro of resizeObservers) {
      expect(ro.targets).toHaveLength(0);
    }
  });
});

describe('per-type aliases (Vue)', () => {
  it('LineChart injects type "line" and exposes the chart', () => {
    const { type: _type, ...typeless } = makeOptions();
    const { exposed } = mountChart(LineChart, { options: typeless });
    expect(exposed.value!.chart!.getOptions().type).toBe('line');
  });

  it('BarChart injects type "bar" and forwards events', () => {
    const { type: _type, ...typeless } = makeOptions();
    const onLegendToggle = vi.fn();
    const { host, exposed } = mountChart(BarChart, { options: typeless, onLegendToggle });
    expect(exposed.value!.chart!.getOptions().type).toBe('bar');
    (host.querySelector('.chartcraft-legend-item') as HTMLElement).click();
    expect(onLegendToggle).toHaveBeenCalledTimes(1);
  });

  it('v0.2 aliases mount with the correct type (HeatmapChart, GaugeChart)', () => {
    const heatmap = mountChart(HeatmapChart, {
      options: {
        data: {
          categories: ['Mon', 'Tue', 'Wed'],
          series: [
            { name: 'Morning', data: [4, 8, 6] },
            { name: 'Afternoon', data: [9, 12, 7] },
          ],
        },
        theme: 'light',
        animation: false,
        width: 600,
        height: 400,
      },
    });
    expect(heatmap.exposed.value!.chart!.getOptions().type).toBe('heatmap');
    expect(heatmap.host.querySelector('.chartcraft')).not.toBeNull();

    const gauge = mountChart(GaugeChart, {
      options: {
        data: { series: [{ name: 'CPU', data: [63] }] },
        gauge: { min: 0, max: 100 },
        theme: 'light',
        animation: false,
        width: 400,
        height: 300,
      },
    });
    expect(gauge.exposed.value!.chart!.getOptions().type).toBe('gauge');
    expect(gauge.exposed.value!.chart!.getOptions().gauge).toMatchObject({ min: 0, max: 100 });
  });

  it('v0.3 aliases mount with the correct type (sankey, choropleth, gantt, network, violin)', () => {
    const box = { theme: 'light' as const, animation: false, width: 600, height: 400 };
    const day = (n: number) => Date.UTC(2026, 0, n);

    const sankey = mountChart(SankeyChart, {
      options: {
        ...box,
        data: {
          series: [
            {
              name: 'Flow',
              data: {
                nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
                links: [{ source: 'a', target: 'b', value: 5 }],
              } as unknown as DataValue,
            } as never,
          ],
        },
      },
    });
    expect(sankey.exposed.value!.chart!.getOptions().type).toBe('sankey');
    expect(sankey.host.querySelector('canvas')).not.toBeNull();

    const geojson: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Alpha' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] },
        },
      ],
    };
    const choropleth = mountChart(ChoroplethChart, {
      options: {
        ...box,
        choropleth: { geojson },
        data: { series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 3 }] }] },
      },
    });
    expect(choropleth.exposed.value!.chart!.getOptions().type).toBe('choropleth');
    expect(choropleth.exposed.value!.chart!.getOptions().choropleth!.featureKey ?? 'name').toBe(
      'name',
    );

    const gantt = mountChart(GanttChart, {
      options: {
        ...box,
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
    expect(gantt.exposed.value!.chart!.getOptions().type).toBe('gantt');
    expect(gantt.exposed.value!.chart!.getOptions().gantt).toMatchObject({ rowHeight: 24 });

    const network = mountChart(NetworkChart, {
      options: {
        ...box,
        network: { fixedSeed: 7 },
        data: {
          series: [
            {
              name: 'Graph',
              data: {
                nodes: [{ id: 'a', label: 'A', group: 'g1' }, { id: 'b', label: 'B', group: 'g2' }],
                links: [{ source: 'a', target: 'b' }],
              } as unknown as DataValue,
            } as never,
          ],
        },
      },
    });
    expect(network.exposed.value!.chart!.getOptions().type).toBe('network');
    expect(network.exposed.value!.chart!.getOptions().network).toMatchObject({ fixedSeed: 7 });

    const violin = mountChart(ViolinChart, {
      options: {
        ...box,
        violin: { showBox: true },
        data: {
          categories: ['A', 'B'],
          series: [
            {
              name: 'Samples',
              data: [
                [1, 2, 2, 3, 4, 4, 5],
                [2, 3, 3, 4, 5, 6, 7],
              ] as unknown as DataValue[],
            },
          ],
        },
      },
    });
    expect(violin.exposed.value!.chart!.getOptions().type).toBe('violin');
    expect(violin.exposed.value!.chart!.getOptions().violin).toMatchObject({ showBox: true });
  });
});

describe('v0.3 alias surface (Vue)', () => {
  const V03_ALIASES: readonly (readonly [string, string])[] = [
    ['RangeareaChart', 'rangearea'],
    ['BulletChart', 'bullet'],
    ['DumbbellChart', 'dumbbell'],
    ['LollipopChart', 'lollipop'],
    ['SlopeChart', 'slope'],
    ['StreamgraphChart', 'streamgraph'],
    ['MarimekkoChart', 'marimekko'],
    ['PyramidChart', 'pyramid'],
    ['CalendarChart', 'calendar'],
    ['RadialbarChart', 'radialbar'],
    ['RoseChart', 'rose'],
    ['ViolinChart', 'violin'],
    ['ParallelChart', 'parallel'],
    ['IcicleChart', 'icicle'],
    ['CirclepackChart', 'circlepack'],
    ['WordcloudChart', 'wordcloud'],
    ['SankeyChart', 'sankey'],
    ['GanttChart', 'gantt'],
    ['ChoroplethChart', 'choropleth'],
    ['NetworkChart', 'network'],
  ];

  it('exports all 20 v0.3 aliases as named components emitting the six events', () => {
    const surface = api as unknown as Record<string, { name?: string; emits?: unknown }>;
    expect(V03_ALIASES).toHaveLength(20);
    for (const [name] of V03_ALIASES) {
      const component = surface[name];
      expect(component, `${name} is not exported`).toBeTruthy();
      expect(component!.name).toBe(name);
      expect(Object.keys(component!.emits as Record<string, unknown>)).toEqual([
        'point-click',
        'point-enter',
        'point-leave',
        'legend-toggle',
        'zoom',
        'annotation-click',
      ]);
    }
  });

  /**
   * `Record<ChartType, …>` makes this exhaustive at COMPILE time: a chart type
   * added to core without a wrapper alias fails `tsc` here.
   */
  it('every ChartType id has an exported alias component', () => {
    const BY_TYPE: Record<ChartType, Component> = {
      line: api.LineChart,
      area: api.AreaChart,
      bar: api.BarChart,
      scatter: api.ScatterChart,
      pie: api.PieChart,
      donut: api.DonutChart,
      bubble: api.BubbleChart,
      sparkline: api.SparklineChart,
      histogram: api.HistogramChart,
      boxplot: api.BoxplotChart,
      candlestick: api.CandlestickChart,
      ohlc: api.OhlcChart,
      waterfall: api.WaterfallChart,
      heatmap: api.HeatmapChart,
      treemap: api.TreemapChart,
      sunburst: api.SunburstChart,
      funnel: api.FunnelChart,
      radar: api.RadarChart,
      gauge: api.GaugeChart,
      rangearea: api.RangeareaChart,
      bullet: api.BulletChart,
      dumbbell: api.DumbbellChart,
      lollipop: api.LollipopChart,
      slope: api.SlopeChart,
      streamgraph: api.StreamgraphChart,
      marimekko: api.MarimekkoChart,
      pyramid: api.PyramidChart,
      calendar: api.CalendarChart,
      radialbar: api.RadialbarChart,
      rose: api.RoseChart,
      violin: api.ViolinChart,
      parallel: api.ParallelChart,
      icicle: api.IcicleChart,
      circlepack: api.CirclepackChart,
      wordcloud: api.WordcloudChart,
      sankey: api.SankeyChart,
      gantt: api.GanttChart,
      choropleth: api.ChoroplethChart,
      network: api.NetworkChart,
    };
    expect(Object.keys(BY_TYPE)).toHaveLength(39);
    for (const [type, component] of Object.entries(BY_TYPE)) {
      expect(component, `no alias exported for type "${type}"`).toBeTruthy();
    }
  });
});

describe('v0.3 features through the wrapper (Vue)', () => {
  it('routes dataLabels / zoom / annotations changes through chart.update()', async () => {
    const options = reactive(makeOptions());
    const { exposed } = mountChart(Chart, { options });
    const chart = exposed.value!.chart!;
    const spy = vi.spyOn(chart, 'update');

    options.dataLabels = { select: 'all' };
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(chart.getOptions().dataLabels).toMatchObject({ select: 'all' });

    options.zoom = { axis: 'x', drag: true };
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(chart.getOptions().zoom).toMatchObject({ axis: 'x', drag: true });

    options.annotations = [{ kind: 'line', axis: 'y', value: 2, label: 'Target' }];
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(3);
    expect(chart.getOptions().annotations).toHaveLength(1);
  });

  it('exposes the v0.3 instance methods through the template ref (exportData returns CSV)', () => {
    const { exposed } = mountChart(Chart, { options: { ...makeOptions(), zoom: true } });
    const chart = exposed.value!.chart!;
    expect(typeof chart.exportImage).toBe('function');
    expect(typeof chart.exportData).toBe('function');
    expect(typeof chart.zoomTo).toBe('function');

    const csv = chart.exportData();
    expect(typeof csv).toBe('string');
    expect(csv.split('\n')[0]).toContain('One');
    expect(csv.split('\n').length).toBeGreaterThan(1);

    const json = JSON.parse(chart.exportData({ format: 'json' })) as {
      columns: string[];
      rows: Record<string, string>[];
    };
    expect(json.columns).toContain('One');
    expect(json.rows.length).toBeGreaterThan(0);
  });

  it('bridges the zoom event to @zoom (via zoomTo through the template ref)', () => {
    const onZoom = vi.fn();
    const { exposed } = mountChart(Chart, {
      options: {
        ...makeOptions(),
        data: { series: [{ name: 'One', data: [[0, 1], [1, 4], [2, 9], [3, 16]] }] },
        zoom: true,
      },
      onZoom,
    });
    const chart = exposed.value!.chart!;

    chart.zoomTo({ x: [1, 2] });
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]![0]).toMatchObject({ x: [1, 2] });

    chart.zoomTo(null);
    expect(onZoom).toHaveBeenCalledTimes(2);
    expect(onZoom.mock.calls[1]![0]).toBeNull();
  });
});
