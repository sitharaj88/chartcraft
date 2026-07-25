/**
 * Wrapper-logic tests against a mocked @chartcraft/core: event bridging for
 * all four handler props, single subscription per event, update payloads,
 * destroy on unmount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Chart, PieChart } from '../src/index';
import type { ChartData, PointEvent } from '../src/index';

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

  it('subscribes exactly once per event and never re-subscribes on handler swap', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Chart type="line" data={data} onPointClick={first} />);
    const chart = lastChart();
    expect(chart.on).toHaveBeenCalledTimes(4);

    rerender(<Chart type="line" data={data} onPointClick={second} />);
    expect(chart.on).toHaveBeenCalledTimes(4);

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
