/**
 * Integration tests against the real @chartcraft/core: mount, exposed chart,
 * deep-watched updates, legend event bridging, destroy on unmount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, shallowRef, type App, type Component } from 'vue';
import {
  Chart,
  BarChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  type ChartExposed,
  type ChartOptions,
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
});
