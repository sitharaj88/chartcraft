/**
 * Wrapper-logic tests against a mocked @chartcraft/core: bridging of all four
 * events to Vue emits, update payloads, destroy on unmount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { Chart, DonutChart } from '../src/index';
import type { Annotation, ChartOptions, PointEvent } from '../src/index';

interface FakeChart {
  el: HTMLElement;
  options: Record<string, unknown>;
  update: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
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
      off: vi.fn(),
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

const pointEvent: PointEvent = {
  seriesId: 'One',
  seriesName: 'One',
  dataIndex: 0,
  x: 0,
  y: 1,
  clientX: 5,
  clientY: 6,
  native: null,
};

const apps: App[] = [];

function mount(component: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(component as never, props) });
  app.config.warnHandler = () => undefined;
  app.mount(host);
  apps.push(app);
  return { app, host };
}

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  state.instances.length = 0;
  document.body.innerHTML = '';
});

const options: ChartOptions = { type: 'line', data: { series: [{ name: 'One', data: [1] }] } };

describe('event bridging (mocked core, Vue)', () => {
  it('bridges all six core events to kebab-case emits', () => {
    const onPointClick = vi.fn();
    const onPointEnter = vi.fn();
    const onPointLeave = vi.fn();
    const onLegendToggle = vi.fn();
    const onZoom = vi.fn();
    const onAnnotationClick = vi.fn();
    mount(Chart, {
      options,
      onPointClick,
      onPointEnter,
      onPointLeave,
      onLegendToggle,
      onZoom,
      onAnnotationClick,
    });
    const chart = lastChart();
    expect(chart.on).toHaveBeenCalledTimes(6);

    chart.emit('pointclick', pointEvent);
    chart.emit('pointenter', pointEvent);
    chart.emit('pointleave', pointEvent);
    chart.emit('legendtoggle', { seriesId: 'One', visible: false });

    const annotation: Annotation = { kind: 'line', axis: 'y', value: 2, label: 'Target' };
    chart.emit('zoom', { x: [0, 5] });
    chart.emit('zoom', null);
    chart.emit('annotationclick', { index: 0, annotation });

    expect(onPointClick).toHaveBeenCalledWith(pointEvent);
    expect(onPointEnter).toHaveBeenCalledWith(pointEvent);
    expect(onPointLeave).toHaveBeenCalledWith(pointEvent);
    expect(onLegendToggle).toHaveBeenCalledWith({ seriesId: 'One', visible: false });
    expect(onZoom).toHaveBeenNthCalledWith(1, { x: [0, 5] });
    expect(onZoom).toHaveBeenNthCalledWith(2, null);
    expect(onAnnotationClick).toHaveBeenCalledWith({ index: 0, annotation });
  });

  it('does not call update on mount; updates with the watched options object', async () => {
    const live = reactive({ ...options }) as ChartOptions;
    mount(Chart, { options: live });
    const chart = lastChart();
    expect(chart.update).not.toHaveBeenCalled();

    live.title = 'T';
    await nextTick();
    expect(chart.update).toHaveBeenCalledTimes(1);
    expect((chart.update.mock.calls[0]![0] as ChartOptions).title).toBe('T');
  });

  it('per-type aliases forward the v0.3 events (@zoom, @annotation-click) too', () => {
    const onZoom = vi.fn();
    const onAnnotationClick = vi.fn();
    mount(DonutChart, { options: { data: options.data }, onZoom, onAnnotationClick });
    const chart = lastChart();
    const annotation: Annotation = { kind: 'point', x: 'A', y: 1, label: 'Peak' };

    chart.emit('zoom', null);
    chart.emit('annotationclick', { index: 1, annotation });

    expect(onZoom).toHaveBeenCalledWith(null);
    expect(onAnnotationClick).toHaveBeenCalledWith({ index: 1, annotation });
  });

  it('deep-watches the v0.3 option blocks into chart.update()', async () => {
    const live = reactive({
      ...options,
      dataLabels: false,
      zoom: false,
      sankey: { nodeWidth: 10 },
    }) as ChartOptions;
    mount(Chart, { options: live });
    const chart = lastChart();
    expect(chart.update).not.toHaveBeenCalled();

    live.dataLabels = { select: 'all' };
    await nextTick();
    expect(chart.update).toHaveBeenCalledTimes(1);

    live.zoom = { axis: 'xy' };
    await nextTick();
    expect(chart.update).toHaveBeenCalledTimes(2);

    live.annotations = [{ kind: 'line', axis: 'y', value: 3 }];
    await nextTick();
    expect(chart.update).toHaveBeenCalledTimes(3);

    // Nested mutation inside a per-type block is caught by the deep watch.
    live.sankey!.nodeWidth = 24;
    await nextTick();
    expect(chart.update).toHaveBeenCalledTimes(4);
    expect(chart.options).toMatchObject({
      dataLabels: { select: 'all' },
      zoom: { axis: 'xy' },
      sankey: { nodeWidth: 24 },
    });
  });

  it('per-type alias injects its type and forwards events; destroy on unmount', () => {
    const onPointClick = vi.fn();
    const { app } = mount(DonutChart, {
      options: { data: options.data },
      onPointClick,
    });
    const chart = lastChart();
    expect(chart.options['type']).toBe('donut');

    chart.emit('pointclick', pointEvent);
    expect(onPointClick).toHaveBeenCalledWith(pointEvent);

    app.unmount();
    apps.pop();
    expect(chart.destroy).toHaveBeenCalledTimes(1);
  });
});
