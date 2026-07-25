/**
 * Integration tests against the real @chartcraft/core: mount, ref exposure,
 * update on prop change, legend event bridging, handler swapping, destroy.
 */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach } from 'vitest';
import * as api from '../src/index';
import {
  Chart,
  BarChart,
  LineChart,
  HeatmapChart,
  GaugeChart,
  SankeyChart,
  ChoroplethChart,
  GanttChart,
  NetworkChart,
  ViolinChart,
  type ChartInstance,
} from '../src/index';
import type { ChartData, ChartType, DataValue, GeoFeatureCollection } from '../src/index';
import { resizeObservers } from './setup';

const data: ChartData = {
  categories: ['a', 'b', 'c'],
  series: [
    { name: 'One', data: [1, 2, 3] },
    { name: 'Two', data: [3, 2, 1] },
  ],
};

const base = {
  data,
  theme: 'light' as const,
  animation: false,
  width: 600,
  height: 400,
};

afterEach(() => {
  cleanup();
});

describe('<Chart>', () => {
  it('mounts a chart into the rendered container (className/style applied)', () => {
    const { container } = render(
      <Chart type="line" {...base} className="my-chart" style={{ width: 600 }} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('my-chart');
    expect(wrapper.style.width).toBe('600px');
    expect(wrapper.querySelector('.chartcraft')).not.toBeNull();
    expect(wrapper.querySelector('canvas')).not.toBeNull();
  });

  it('exposes the ChartInstance via ref', () => {
    const ref = createRef<ChartInstance>();
    render(<Chart ref={ref} type="line" {...base} />);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current!.update).toBe('function');
    expect(typeof ref.current!.destroy).toBe('function');
    expect(ref.current!.getOptions().type).toBe('line');
    expect(ref.current!.el).toBeInstanceOf(HTMLElement);
  });

  it('routes prop changes through chart.update()', () => {
    const ref = createRef<ChartInstance>();
    const { rerender } = render(<Chart ref={ref} type="line" {...base} />);
    const spy = vi.spyOn(ref.current!, 'update');

    rerender(<Chart ref={ref} type="line" {...base} title="Hello" />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toMatchObject({ title: 'Hello' });
    expect(ref.current!.getOptions().title).toBe('Hello');

    // Unchanged props (same references) do not trigger another update.
    rerender(<Chart ref={ref} type="line" {...base} title="Hello" />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('bridges legendtoggle and supports swapping handlers without re-subscribing', () => {
    const ref = createRef<ChartInstance>();
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(
      <Chart ref={ref} type="line" {...base} onLegendToggle={first} />,
    );
    const onSpy = vi.spyOn(ref.current!, 'on');

    const item = container.querySelectorAll('.chartcraft-legend-item')[0] as HTMLElement;
    expect(item).toBeTruthy();
    fireEvent.click(item);
    expect(first).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0]![0]).toMatchObject({ visible: false });
    expect(typeof first.mock.calls[0]![0].seriesId).toBe('string');

    // Swap the handler: no new subscriptions, new handler receives the event.
    rerender(<Chart ref={ref} type="line" {...base} onLegendToggle={second} />);
    const itemAfter = container.querySelectorAll('.chartcraft-legend-item')[0] as HTMLElement;
    fireEvent.click(itemAfter);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0]![0]).toMatchObject({ visible: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(onSpy).not.toHaveBeenCalled();
  });

  it('destroys the chart on unmount (no leaked observers, DOM removed)', () => {
    const ref = createRef<ChartInstance>();
    const { container, unmount } = render(<Chart ref={ref} type="line" {...base} />);
    const destroy = vi.spyOn(ref.current!, 'destroy');
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.chartcraft')).toBeNull();
    for (const ro of resizeObservers) {
      expect(ro.targets).toHaveLength(0);
    }
  });
});

describe('per-type aliases', () => {
  it('LineChart sets type "line"', () => {
    const ref = createRef<ChartInstance>();
    render(<LineChart ref={ref} {...base} />);
    expect(ref.current!.getOptions().type).toBe('line');
  });

  it('BarChart sets type "bar" and forwards the ref', () => {
    const ref = createRef<ChartInstance>();
    render(<BarChart ref={ref} {...base} />);
    expect(ref.current!.getOptions().type).toBe('bar');
  });

  it('v0.2 aliases mount with the correct type (HeatmapChart, GaugeChart)', () => {
    const heatmapRef = createRef<ChartInstance>();
    const { container: heatmapHost } = render(
      <HeatmapChart
        ref={heatmapRef}
        data={{
          categories: ['Mon', 'Tue', 'Wed'],
          series: [
            { name: 'Morning', data: [4, 8, 6] },
            { name: 'Afternoon', data: [9, 12, 7] },
          ],
        }}
        theme="light"
        animation={false}
        width={600}
        height={400}
      />,
    );
    expect(heatmapRef.current!.getOptions().type).toBe('heatmap');
    expect(heatmapHost.querySelector('.chartcraft')).not.toBeNull();

    const gaugeRef = createRef<ChartInstance>();
    render(
      <GaugeChart
        ref={gaugeRef}
        data={{ series: [{ name: 'CPU', data: [63] }] }}
        gauge={{ min: 0, max: 100 }}
        theme="light"
        animation={false}
        width={400}
        height={300}
      />,
    );
    expect(gaugeRef.current!.getOptions().type).toBe('gauge');
    expect(gaugeRef.current!.getOptions().gauge).toMatchObject({ min: 0, max: 100 });
  });

  it('v0.3 aliases mount with the correct type (sankey, choropleth, gantt, network, violin)', () => {
    const box = { theme: 'light' as const, animation: false, width: 600, height: 400 };
    const day = (n: number) => Date.UTC(2026, 0, n);

    const sankeyRef = createRef<ChartInstance>();
    const { container: sankeyHost } = render(
      <SankeyChart
        ref={sankeyRef}
        {...box}
        data={{
          series: [
            {
              name: 'Flow',
              data: {
                nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
                links: [{ source: 'a', target: 'b', value: 5 }],
              } as unknown as DataValue,
            } as never,
          ],
        }}
      />,
    );
    expect(sankeyRef.current!.getOptions().type).toBe('sankey');
    expect(sankeyHost.querySelector('canvas')).not.toBeNull();

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
    const choroplethRef = createRef<ChartInstance>();
    render(
      <ChoroplethChart
        ref={choroplethRef}
        {...box}
        choropleth={{ geojson }}
        data={{ series: [{ name: 'Pop', data: [{ x: 'Alpha', y: 3 }] }] }}
      />,
    );
    expect(choroplethRef.current!.getOptions().type).toBe('choropleth');
    expect(choroplethRef.current!.getOptions().choropleth!.geojson).toBe(geojson);

    const ganttRef = createRef<ChartInstance>();
    render(
      <GanttChart
        ref={ganttRef}
        {...box}
        gantt={{ rowHeight: 24 }}
        data={{
          series: [
            {
              name: 'Plan',
              data: [
                { x: 'Design', start: day(1), end: day(5) },
                { x: 'Build', start: day(5), end: day(12) },
              ],
            },
          ],
        }}
      />,
    );
    expect(ganttRef.current!.getOptions().type).toBe('gantt');
    expect(ganttRef.current!.getOptions().gantt).toMatchObject({ rowHeight: 24 });

    const networkRef = createRef<ChartInstance>();
    render(
      <NetworkChart
        ref={networkRef}
        {...box}
        network={{ fixedSeed: 7 }}
        data={{
          series: [
            {
              name: 'Graph',
              data: {
                nodes: [{ id: 'a', label: 'A', group: 'g1' }, { id: 'b', label: 'B', group: 'g2' }],
                links: [{ source: 'a', target: 'b' }],
              } as unknown as DataValue,
            } as never,
          ],
        }}
      />,
    );
    expect(networkRef.current!.getOptions().type).toBe('network');
    expect(networkRef.current!.getOptions().network).toMatchObject({ fixedSeed: 7 });

    const violinRef = createRef<ChartInstance>();
    render(
      <ViolinChart
        ref={violinRef}
        {...box}
        violin={{ showBox: true }}
        data={{
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
        }}
      />,
    );
    expect(violinRef.current!.getOptions().type).toBe('violin');
    expect(violinRef.current!.getOptions().violin).toMatchObject({ showBox: true });
  });
});

describe('v0.3 alias surface', () => {
  const V03_ALIASES = [
    'RangeareaChart',
    'BulletChart',
    'DumbbellChart',
    'LollipopChart',
    'SlopeChart',
    'StreamgraphChart',
    'MarimekkoChart',
    'PyramidChart',
    'CalendarChart',
    'RadialbarChart',
    'RoseChart',
    'ViolinChart',
    'ParallelChart',
    'IcicleChart',
    'CirclepackChart',
    'WordcloudChart',
    'SankeyChart',
    'GanttChart',
    'ChoroplethChart',
    'NetworkChart',
  ];

  it('exports all 20 v0.3 aliases with matching displayNames', () => {
    const surface = api as unknown as Record<string, { displayName?: string }>;
    expect(V03_ALIASES).toHaveLength(20);
    for (const name of V03_ALIASES) {
      expect(surface[name], `${name} is not exported`).toBeTruthy();
      expect(surface[name]!.displayName).toBe(name);
    }
  });

  /**
   * `Record<ChartType, …>` makes this exhaustive at COMPILE time: a chart type
   * added to core without a wrapper alias fails `tsc` here.
   */
  it('every ChartType id has an exported alias component', () => {
    const BY_TYPE: Record<ChartType, { displayName?: string }> = {
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

describe('v0.3 features through the wrapper', () => {
  it('routes dataLabels / zoom / per-type-block changes through chart.update()', () => {
    const ref = createRef<ChartInstance>();
    const { rerender } = render(<Chart ref={ref} type="line" {...base} />);
    const spy = vi.spyOn(ref.current!, 'update');

    rerender(<Chart ref={ref} type="line" {...base} dataLabels={{ select: 'all' }} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ref.current!.getOptions().dataLabels).toMatchObject({ select: 'all' });

    rerender(
      <Chart
        ref={ref}
        type="line"
        {...base}
        dataLabels={{ select: 'all' }}
        zoom={{ axis: 'x', drag: true }}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(ref.current!.getOptions().zoom).toMatchObject({ axis: 'x', drag: true });

    rerender(
      <Chart
        ref={ref}
        type="line"
        {...base}
        dataLabels={{ select: 'all' }}
        zoom={{ axis: 'x', drag: true }}
        annotations={[{ kind: 'line', axis: 'y', value: 2, label: 'Target' }]}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(3);
    expect(ref.current!.getOptions().annotations).toHaveLength(1);

    // A per-type block on the live type (gauge here) reaches the chart too.
    const gaugeRef = createRef<ChartInstance>();
    const { rerender: rerenderGauge } = render(
      <Chart
        ref={gaugeRef}
        type="gauge"
        {...base}
        data={{ series: [{ name: 'CPU', data: [63] }] }}
        gauge={{ min: 0, max: 100 }}
      />,
    );
    const gaugeSpy = vi.spyOn(gaugeRef.current!, 'update');
    rerenderGauge(
      <Chart
        ref={gaugeRef}
        type="gauge"
        {...base}
        data={{ series: [{ name: 'CPU', data: [63] }] }}
        gauge={{ min: 0, max: 200 }}
      />,
    );
    expect(gaugeSpy).toHaveBeenCalledTimes(1);
    expect(gaugeRef.current!.getOptions().gauge).toMatchObject({ max: 200 });
  });

  it('exposes the v0.3 instance methods through the ref (exportData returns CSV)', () => {
    const ref = createRef<ChartInstance>();
    render(<Chart ref={ref} type="line" {...base} zoom />);
    const chart = ref.current!;
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

  it('bridges the zoom event to onZoom (via zoomTo through the ref)', () => {
    const ref = createRef<ChartInstance>();
    const onZoom = vi.fn();
    render(
      <Chart
        ref={ref}
        type="line"
        {...base}
        data={{ series: [{ name: 'One', data: [[0, 1], [1, 4], [2, 9], [3, 16]] }] }}
        zoom
        onZoom={onZoom}
      />,
    );
    ref.current!.zoomTo({ x: [1, 2] });
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]![0]).toMatchObject({ x: [1, 2] });

    ref.current!.zoomTo(null); // reset
    expect(onZoom).toHaveBeenCalledTimes(2);
    expect(onZoom.mock.calls[1]![0]).toBeNull();
  });
});
