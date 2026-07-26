/**
 * Wrapper-logic tests against a mocked @chartcraft/core: event bridging for
 * all four handler props, single subscription per event, update payloads,
 * destroy on unmount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Chart, PieChart } from '../src/index';
import type {
  Annotation,
  ChartData,
  ChartOptions,
  ChartProps,
  PointEvent,
} from '../src/index';

interface FakeChart {
  el: HTMLElement;
  options: Record<string, unknown>;
  update: ReturnType<typeof vi.fn>;
  setData: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  getOptions: () => Record<string, unknown>;
  emit: (type: string, ev: unknown) => void;
}

const state = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock('@chartcraft/core', () => ({
  createChart: (el: HTMLElement, options: Record<string, unknown>) => {
    const listeners = new Map<string, Set<(ev: unknown) => void>>();
    const chart = {
      el,
      options: { ...options },
      update: vi.fn((o: Record<string, unknown>) => {
        chart.options = { ...chart.options, ...o };
      }),
      setData: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      getOptions: () => chart.options,
      on: vi.fn((type: string, handler: (ev: unknown) => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(handler);
        return () => set!.delete(handler);
      }),
      off: vi.fn((type: string, handler: (ev: unknown) => void) => {
        listeners.get(type)?.delete(handler);
      }),
      emit: (type: string, ev: unknown) => {
        listeners.get(type)?.forEach((h) => h(ev));
      },
    };
    state.instances.push(chart);
    return chart;
  },
}));

function lastChart(): FakeChart {
  return state.instances[state.instances.length - 1] as FakeChart;
}

const data: ChartData = { series: [{ name: 'One', data: [1, 2, 3] }] };

const pointEvent: PointEvent = {
  seriesId: 'One',
  seriesName: 'One',
  dataIndex: 1,
  x: 1,
  y: 2,
  // core resolves this from the palette; the wrapper only forwards it.
  color: '#3b6ea5',
  clientX: 10,
  clientY: 20,
  native: null,
};

afterEach(() => {
  cleanup();
  state.instances.length = 0;
});

describe('event bridging (mocked core)', () => {
  it('bridges pointclick / pointenter / pointleave / legendtoggle to handler props', () => {
    const onPointClick = vi.fn();
    const onPointEnter = vi.fn();
    const onPointLeave = vi.fn();
    const onLegendToggle = vi.fn();
    render(
      <Chart
        type="line"
        data={data}
        onPointClick={onPointClick}
        onPointEnter={onPointEnter}
        onPointLeave={onPointLeave}
        onLegendToggle={onLegendToggle}
      />,
    );
    const chart = lastChart();

    chart.emit('pointclick', pointEvent);
    chart.emit('pointenter', pointEvent);
    chart.emit('pointleave', pointEvent);
    chart.emit('legendtoggle', { seriesId: 'One', visible: false });

    expect(onPointClick).toHaveBeenCalledWith(pointEvent);
    expect(onPointEnter).toHaveBeenCalledWith(pointEvent);
    expect(onPointLeave).toHaveBeenCalledWith(pointEvent);
    expect(onLegendToggle).toHaveBeenCalledWith({ seriesId: 'One', visible: false });
  });

  it('bridges the v0.3 events zoom / annotationclick to onZoom / onAnnotationClick', () => {
    const onZoom = vi.fn();
    const onAnnotationClick = vi.fn();
    render(<Chart type="line" data={data} onZoom={onZoom} onAnnotationClick={onAnnotationClick} />);
    const chart = lastChart();

    const range = { x: [0, 5] as [number, number] };
    chart.emit('zoom', range);
    chart.emit('zoom', null); // reset
    const annotation: Annotation = { kind: 'line', axis: 'y', value: 2, label: 'Target' };
    chart.emit('annotationclick', { index: 0, annotation });

    expect(onZoom).toHaveBeenNthCalledWith(1, range);
    expect(onZoom).toHaveBeenNthCalledWith(2, null);
    expect(onAnnotationClick).toHaveBeenCalledWith({ index: 0, annotation });
  });

  it('subscribes exactly once per event and never re-subscribes on handler swap', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Chart type="line" data={data} onPointClick={first} />);
    const chart = lastChart();
    expect(chart.on).toHaveBeenCalledTimes(6); // 4 v0.1/v0.2 events + zoom + annotationclick

    rerender(<Chart type="line" data={data} onPointClick={second} />);
    expect(chart.on).toHaveBeenCalledTimes(6);

    chart.emit('pointclick', pointEvent);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('missing handlers are a no-op (no throw on emit)', () => {
    render(<Chart type="line" data={data} />);
    expect(() => lastChart().emit('pointclick', pointEvent)).not.toThrow();
  });

  it('does not call update on initial mount, passes flat options on change', () => {
    const { rerender } = render(<Chart type="line" data={data} title="A" />);
    const chart = lastChart();
    expect(chart.update).not.toHaveBeenCalled();
    expect(chart.options).toMatchObject({ type: 'line', title: 'A' });
    // className/style/handlers must not leak into chart options.
    expect(chart.options).not.toHaveProperty('className');
    expect(chart.options).not.toHaveProperty('onPointClick');

    rerender(<Chart type="line" data={data} title="B" className="x" />);
    expect(chart.update).toHaveBeenCalledTimes(1);
    const payload = chart.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({ type: 'line', title: 'B' });
    expect(payload).not.toHaveProperty('className');
  });

  it('destroys exactly once on unmount and per-type alias injects its type', () => {
    const { unmount } = render(<PieChart data={data} />);
    const chart = lastChart();
    expect(chart.options['type']).toBe('pie');
    unmount();
    expect(chart.destroy).toHaveBeenCalledTimes(1);
  });
});

/**
 * The update effect depends on ChartOptions keys one by one, so a key missing
 * from that list means "changing this prop silently never re-renders" (the bug
 * this suite exists to prevent). Every key gets two distinct values here — a
 * new core option added without wiring fails BOTH `tsc` (the exhaustiveness
 * assertion in src/Chart.tsx) and this test.
 */
const geojson = { type: 'FeatureCollection' as const, features: [] };

const OPTION_CASES: ReadonlyArray<readonly [keyof ChartOptions, unknown, unknown]> = [
  ['type', 'line', 'bar'],
  ['data', data, { series: [{ name: 'Two', data: [4, 5] }] }],
  ['theme', 'light', 'dark'],
  ['title', 'A', 'B'],
  ['subtitle', 'a', 'b'],
  ['width', 300, 400],
  ['height', 200, 240],
  ['padding', 4, { top: 8 }],
  ['xAxis', { label: 'x' }, { label: 'X' }],
  ['yAxis', { label: 'y' }, { label: 'Y' }],
  ['stacked', false, true],
  ['horizontal', false, true],
  ['legend', true, false],
  ['tooltip', true, false],
  ['animation', false, { duration: 100 }],
  ['downsample', { enabled: true }, { enabled: false }],
  ['a11y', { table: 'hidden' }, { table: 'off' }],
  // v0.2 per-type blocks
  ['histogram', { bins: 5 }, { bins: 'auto' }],
  ['heatmap', { min: 0 }, { min: 1 }],
  ['gauge', { max: 100 }, { max: 50 }],
  ['waterfall', { connectors: true }, { connectors: false }],
  // v0.3 cross-cutting features
  ['dataLabels', false, { select: 'all' }],
  ['annotations', [], [{ kind: 'line', axis: 'y', value: 2 }]],
  ['zoom', false, { axis: 'xy' }],
  // v0.3 per-type blocks
  ['rangearea', { showBounds: true }, { showBounds: false }],
  ['bullet', { ranges: [50, 100] }, { ranges: [50, 90] }],
  ['calendar', { weekStart: 0 }, { weekStart: 1 }],
  ['violin', { showBox: true }, { showBox: false }],
  ['radialbar', { innerRadius: 0.3 }, { innerRadius: 0.5 }],
  ['rose', { startAngle: 0 }, { startAngle: 90 }],
  ['sankey', { nodeWidth: 10 }, { nodeWidth: 20 }],
  ['gantt', { rowHeight: 20 }, { rowHeight: 30 }],
  ['wordcloud', { rotate: false }, { rotate: true }],
  ['network', { fixedSeed: 1 }, { fixedSeed: 2 }],
  ['choropleth', { geojson, min: 0 }, { geojson, min: 5 }],
  ['parallel', { axes: ['a', 'b'] }, { axes: ['b', 'a'] }],
];

describe('option prop → chart.update() completeness (mocked core)', () => {
  it('covers every ChartOptions key', () => {
    const keys = OPTION_CASES.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
    // Sanity: the v0.3 additions are present.
    expect(keys).toEqual(
      expect.arrayContaining(['dataLabels', 'annotations', 'zoom', 'sankey', 'choropleth']),
    );
  });

  for (const [key, before, after] of OPTION_CASES) {
    it(`a change to \`${key}\` reaches chart.update()`, () => {
      const props = (value: unknown) =>
        ({ type: 'line', data, [key]: value }) as unknown as ChartProps;

      const { rerender, unmount } = render(<Chart {...props(before)} />);
      const chart = lastChart();
      expect(chart.update).not.toHaveBeenCalled();

      rerender(<Chart {...props(after)} />);
      expect(chart.update, `\`${key}\` change never reached chart.update()`).toHaveBeenCalledTimes(
        1,
      );
      expect(chart.update.mock.calls[0]![0]).toMatchObject({ [key]: after } as never);
      unmount();
    });
  }
});
