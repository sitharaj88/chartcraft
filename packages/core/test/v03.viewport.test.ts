/**
 * v0.3 zoom plumbing: the layout stage's x/y domain overrides (the viewport)
 * and downsampling that runs against the visible window. No interaction here —
 * pointer/wheel/keyboard zoom belongs to the zoom decorator.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildModel, resolveOptions } from '../src/model';
import { computeCartesianLayout, computePlainLayout } from '../src/layout';
import { normalizeViewport } from '../src/decorate';
import { lightTheme } from '../src/theme';
import type { ChartOptions } from '../src/index';
import { registerBuiltinChartTypes } from '../src/charts';
import { cleanupDom, mount } from './helpers';

registerBuiltinChartTypes();
afterEach(cleanupDom);

const measure = (text: string): number => text.length * 6;

function layoutFor(opts: ChartOptions, viewport?: { x?: [number, number] | null; y?: [number, number] | null } | null) {
  const resolved = resolveOptions(opts);
  const model = buildModel(resolved, new Map(), viewport);
  return {
    model,
    layout: computeCartesianLayout({
      width: 600,
      height: 400,
      topExtra: 0,
      opts: resolved,
      model,
      theme: lightTheme,
      measure,
      axisChrome: { x: true, y: true },
      arrangement: 'value-y',
      viewport,
    }),
  };
}

const lineOpts: ChartOptions = {
  type: 'line',
  data: { series: [{ name: 'S', data: [[0, 0], [25, 10], [50, 5], [75, 20], [100, 1]] as [number, number][] }] },
};

describe('viewport domain overrides', () => {
  it('is null by default and the x scale spans the data extent', () => {
    const { layout } = layoutFor(lineOpts);
    expect(layout.viewport).toBeNull();
    expect(layout.xScale?.domain()).toEqual([0, 100]);
  });

  it('overrides the x domain exactly (no nice() widening)', () => {
    const { layout } = layoutFor(lineOpts, { x: [20, 60] });
    expect(layout.xScale?.domain()).toEqual([20, 60]);
    expect(layout.viewport).toEqual({ x: [20, 60] });
  });

  it('overrides the value domain exactly', () => {
    const { layout } = layoutFor(lineOpts, { y: [2, 8] });
    expect(layout.yScale?.domain()).toEqual([2, 8]);
  });

  it('wins over an explicit axis min/max', () => {
    const opts: ChartOptions = { ...lineOpts, xAxis: { min: 10, max: 90 }, yAxis: { min: -5, max: 40 } };
    const plain = layoutFor(opts);
    expect(plain.layout.xScale?.domain()).toEqual([10, 90]);
    const zoomed = layoutFor(opts, { x: [30, 40], y: [0, 1] });
    expect(zoomed.layout.xScale?.domain()).toEqual([30, 40]);
    expect(zoomed.layout.yScale?.domain()).toEqual([0, 1]);
  });

  it('maps the visible window across the full plot width', () => {
    const { layout } = layoutFor(lineOpts, { x: [20, 60] });
    const x = layout.xScale;
    expect(x?.scale(20)).toBeCloseTo(layout.plot.x, 6);
    expect(x?.scale(60)).toBeCloseTo(layout.plot.x + layout.plot.w, 6);
  });

  it('is ignored by band (category) axes — zoom is continuous-only', () => {
    const bars: ChartOptions = { type: 'bar', data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [1, 2, 3] }] } };
    const plain = layoutFor(bars);
    const zoomed = layoutFor(bars, { x: [0, 1] });
    expect(zoomed.layout.xScale?.range()).toEqual(plain.layout.xScale?.range());
    expect(zoomed.layout.xTicks.map((t) => t.label)).toEqual(plain.layout.xTicks.map((t) => t.label));
  });

  it('falls back to model.viewport when the layout arg is omitted', () => {
    const resolved = resolveOptions(lineOpts);
    const model = buildModel(resolved, new Map(), { x: [10, 20] });
    expect(model.viewport).toEqual({ x: [10, 20] });
    const layout = computeCartesianLayout({
      width: 600, height: 400, topExtra: 0, opts: resolved, model, theme: lightTheme, measure, axisChrome: { x: true, y: true }, arrangement: 'value-y',
    });
    expect(layout.xScale?.domain()).toEqual([10, 20]);
  });

  it('carries the viewport onto plain (non-cartesian) layouts too', () => {
    const l = computePlainLayout({
      width: 300, height: 200, topExtra: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      viewport: { x: [1, 2] },
    });
    expect(l.viewport).toEqual({ x: [1, 2] });
  });

  it('normalizes reversed, degenerate and empty ranges', () => {
    expect(normalizeViewport({ x: [9, 3] })).toEqual({ x: [3, 9] });
    expect(normalizeViewport({ x: [5, 5] })).toBeNull();
    expect(normalizeViewport({ x: [NaN, 3] })).toBeNull();
    expect(normalizeViewport({})).toBeNull();
    expect(normalizeViewport(null)).toBeNull();
    expect(normalizeViewport({ x: [1, 2], y: [4, 3] })).toEqual({ x: [1, 2], y: [3, 4] });
  });
});

describe('downsampling within the viewport', () => {
  /** 4000 points over x 0..3999. */
  const many: ChartOptions = {
    type: 'line',
    downsample: { enabled: true, threshold: 1000 },
    data: {
      series: [
        { name: 'S', data: Array.from({ length: 4000 }, (_, i) => [i, Math.sin(i / 50) * 10] as [number, number]) },
      ],
    },
  };

  it('downsamples the whole series to the threshold when unzoomed', () => {
    const m = buildModel(resolveOptions(many), new Map());
    expect(m.series[0]?.points.length).toBeLessThanOrEqual(1000);
    expect(m.series[0]?.points.length).toBeGreaterThan(500);
    expect(m.series[0]?.points[0]?.xv).toBe(0);
  });

  it('re-runs against the visible window, revealing every point in it', () => {
    const m = buildModel(resolveOptions(many), new Map(), { x: [100, 400] });
    const xs = m.series[0]?.points.map((p) => p.xv) ?? [];
    // 301 in-window points + one padding point each side, all retained verbatim.
    expect(xs).toHaveLength(303);
    expect(xs[0]).toBe(99);
    expect(xs[xs.length - 1]).toBe(401);
    // Full detail: consecutive integers, nothing skipped.
    expect(xs.every((x, i) => x === 99 + i)).toBe(true);
  });

  it('still downsamples when the window itself exceeds the threshold', () => {
    const m = buildModel(resolveOptions(many), new Map(), { x: [0, 2500] });
    const pts = m.series[0]?.points ?? [];
    expect(pts.length).toBeLessThanOrEqual(1000);
    expect(pts[pts.length - 1]?.xv).toBeLessThanOrEqual(2501);
  });

  it('leaves series below the threshold untouched, zoomed or not', () => {
    const small = buildModel(resolveOptions(lineOpts), new Map(), { x: [20, 60] });
    expect(small.series[0]?.points.map((p) => p.xv)).toEqual([0, 25, 50, 75, 100]);
  });

  it('does not window when downsampling is disabled', () => {
    const off: ChartOptions = { ...many, downsample: { enabled: false } };
    const m = buildModel(resolveOptions(off), new Map(), { x: [100, 400] });
    expect(m.series[0]?.points).toHaveLength(4000);
  });
});

describe('Chart.zoomTo', () => {
  it('applies the viewport, emits zoom, and resets on null', () => {
    const events: unknown[] = [];
    const { chart } = mount(lineOpts);
    chart.on('zoom', (ev) => events.push(ev));
    chart.zoomTo({ x: [20, 60] });
    chart.zoomTo(null);
    expect(events).toEqual([{ x: [20, 60] }, null]);
  });

  it('emits the normalized (ascending) range', () => {
    const events: unknown[] = [];
    const { chart } = mount(lineOpts);
    chart.on('zoom', (ev) => events.push(ev));
    chart.zoomTo({ x: [60, 20], y: [9, 1] });
    expect(events).toEqual([{ x: [20, 60], y: [1, 9] }]);
  });

  it('emits null for a degenerate range (nothing to zoom into)', () => {
    const events: unknown[] = [];
    const { chart } = mount(lineOpts);
    chart.on('zoom', (ev) => events.push(ev));
    chart.zoomTo({ x: [5, 5] });
    expect(events).toEqual([null]);
  });

  it('re-renders and re-scales the plot to the window', () => {
    const renders: string[] = [];
    const { chart } = mount(lineOpts);
    chart.on('render', (ev) => renders.push(ev.reason));
    chart.zoomTo({ x: [20, 60] });
    expect(renders).toEqual(['update']);
  });

  /**
   * v0.4.0 — ADAPTED. This test used to assert that reset-by-data emits NO
   * `zoom` event ("No zoom event on reset-by-data"), which encoded half of the
   * wrapper defect: an app's Reset-zoom affordance is driven by the `zoom`
   * event, so a silent reset left that button visible pointing at nothing. The
   * reset itself is unchanged — an x extent of 0…100 becoming 0…10 genuinely
   * invalidates a [20, 60] window — but it is now announced.
   */
  it('new data resets an active zoom (stale units) AND emits the reset', () => {
    const events: unknown[] = [];
    const { chart } = mount(lineOpts);
    chart.zoomTo({ x: [20, 60] });
    chart.on('zoom', (ev) => events.push(ev));
    chart.setData({ series: [{ name: 'S', data: [[0, 1], [10, 2]] as [number, number][] }] });
    expect(events).toEqual([null]);
    // And the viewport really is gone: the next zoomTo(null) is a no-op reset.
    chart.zoomTo(null);
    expect(events).toEqual([null, null]);
  });

  it('is a no-op after destroy', () => {
    const events: unknown[] = [];
    const { chart } = mount(lineOpts);
    chart.on('zoom', (ev) => events.push(ev));
    chart.destroy();
    chart.zoomTo({ x: [1, 2] });
    expect(events).toEqual([]);
  });
});
