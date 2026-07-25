/**
 * Wrapper-logic tests against a mocked @chartcraft/core: bridging of all four
 * events to Vue emits, update payloads, destroy on unmount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { Chart, DonutChart } from '../src/index';
import type { ChartOptions, PointEvent } from '../src/index';

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
  it('bridges all four core events to kebab-case emits', () => {
    const onPointClick = vi.fn();
    const onPointEnter = vi.fn();
    const onPointLeave = vi.fn();
    const onLegendToggle = vi.fn();
    mount(Chart, { options, onPointClick, onPointEnter, onPointLeave, onLegendToggle });
    const chart = lastChart();
    expect(chart.on).toHaveBeenCalledTimes(4);

    chart.emit('pointclick', pointEvent);
    chart.emit('pointenter', pointEvent);
    chart.emit('pointleave', pointEvent);
    chart.emit('legendtoggle', { seriesId: 'One', visible: false });

    expect(onPointClick).toHaveBeenCalledWith(pointEvent);
    expect(onPointEnter).toHaveBeenCalledWith(pointEvent);
    expect(onPointLeave).toHaveBeenCalledWith(pointEvent);
    expect(onLegendToggle).toHaveBeenCalledWith({ seriesId: 'One', visible: false });
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
