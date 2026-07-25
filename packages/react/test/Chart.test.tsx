/**
 * Integration tests against the real @chartcraft/core: mount, ref exposure,
 * update on prop change, legend event bridging, handler swapping, destroy.
 */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach } from 'vitest';
import { Chart, BarChart, LineChart, type ChartInstance } from '../src/index';
import type { ChartData } from '../src/index';
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
});
