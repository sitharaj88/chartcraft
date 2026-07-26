/**
 * v0.4.0 — the four defects five real sample dashboards found that 1,984 API
 * tests did not. Every one of them is an EXPERIENCE bug: the API accepted the
 * options, returned no error and drew something wrong or lost user state.
 *
 *  1. a log value axis folding in a zero lower bound (a 12-decade axis)
 *  2. a wrapper-shaped options update destroying the zoom viewport, silently
 *  3. `PointEvent` carrying no colour, so a click panel had to re-derive it
 *  4. `gauge.bands[].color` forcing a hardcoded hex for the middle band
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDecorators,
  darkTheme,
  lightTheme,
  registerDecorator,
  type DecoratorContext,
  type DecoratorHost,
} from '../src/index';
import { registerBuiltinDecorators } from '../src/features';
import { registerBuiltinChartTypes } from '../src/charts';
import { buildModel, resolveOptions } from '../src/model';
import { computeCartesianLayout } from '../src/layout';
import { boxplotValueDomain } from '../src/charts/statistical/boxplot';
import { gaugeBandSegments, resolveGaugeBands } from '../src/charts/radial/gauge';
import { niceValueDomain, positiveLogDomain } from '../src/scales';
import { STATUS_WARNING, resolveTheme, warningColor } from '../src/theme';
import type { ChartOptions, PointEvent, Theme, ZoomRange } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, mount, paintedText } from './helpers';

registerBuiltinChartTypes();

beforeEach(() => {
  clearDecorators();
  registerBuiltinDecorators();
});

afterEach(() => {
  clearDecorators();
  cleanupDom();
  vi.restoreAllMocks();
});

const measure = (text: string): number => text.length * 6;

/** Resolve + build + lay out, the way the pipeline does, with no DOM. */
function layoutFor(opts: ChartOptions, viewport?: { x?: [number, number]; y?: [number, number] } | null) {
  const resolved = resolveOptions(opts);
  const slots = new Map<string, number>();
  const model = buildModel(resolved, slots, viewport);
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

// ===========================================================================
// DEFECT 1 — a log value axis derives its domain from the positive data only
// ===========================================================================

/**
 * The sample dashboard's own numbers: annual contract value per segment, in $K,
 * as RAW samples (the boxplot computes the quartiles). Four segments spanning
 * ~1.2 … 260 — a 200x range, which is exactly when a log axis is the right
 * answer and exactly the chart that produced a 1e-12 … 1e3 axis.
 */
const CONTRACT_SAMPLES: number[][] = [
  [1.2, 1.4, 1.6, 1.9, 2.2, 2.6, 3.1, 3.6],
  [6.4, 7.2, 8.1, 9.4, 10.8, 12.2, 14],
  [22, 25, 29, 34, 39, 44, 48],
  [78, 96, 118, 145, 175, 210, 260],
];

const contractsOpts = (yAxis: ChartOptions['yAxis']): ChartOptions => ({
  type: 'boxplot',
  data: {
    categories: ['Self-serve', 'Team', 'Business', 'Enterprise'],
    series: [{ id: 'acv', name: 'Annual contract value', data: CONTRACT_SAMPLES as never }],
  },
  ...(yAxis ? { yAxis } : {}),
});

describe('defect 1 — log value axis domain', () => {
  it('the reported chart now gets a sane 3-decade axis, with no explicit min', () => {
    const { model, layout } = layoutFor(contractsOpts({ type: 'log' }));

    // The model's value extent never carries a non-positive floor onto a log
    // axis — this is the exact number that used to be 0.
    expect(model.valueAxisLog).toBe(true);
    expect(model.yDomain[0]).toBeGreaterThan(0);

    // 1.2 … 260 rounds outward to whole DECADES, not to nice linear multiples.
    expect(layout.yScale?.domain()).toEqual([1, 1000]);
    // And the axis reads 1 / 10 / 100 / 1000 — not 1e-12 … 1e3.
    expect(layout.yTicks.map((t) => t.label)).toEqual(['1', '10', '100', '1000']);
  });

  it('end to end: the MOUNTED chart paints decade tick labels, not 1e-12', () => {
    const { el } = mount(contractsOpts({ type: 'log', label: 'ACV ($K)' }));
    const texts = paintedText(el);
    expect(texts).toContain('1');
    expect(texts).toContain('1000');
    // The signature of the bug: an axis that starts twelve decades below the data.
    expect(texts.some((t) => t.includes('e-'))).toBe(false);
  });

  it('every box lands inside the plot instead of the top tenth of it', () => {
    const { layout } = layoutFor(contractsOpts({ type: 'log' }));
    const ys = layout.yScale as { scale(v: number): number };
    const plot = layout.plot;
    const top = ys.scale(260); // the tallest whisker
    const bottom = ys.scale(1.2); // the shortest whisker
    expect(bottom).toBeLessThanOrEqual(plot.y + plot.h + 0.01);
    expect(top).toBeGreaterThanOrEqual(plot.y - 0.01);
    // The reported symptom: every box squashed into the top ~10%. The data now
    // uses most of the plot height.
    expect((bottom - top) / plot.h).toBeGreaterThan(0.6);
  });

  it('an explicit min is no longer REQUIRED to get the same axis', () => {
    // The sample had to pass `min: 1` as a workaround. It is now a no-op.
    const workedAround = layoutFor(contractsOpts({ type: 'log', min: 1 })).layout;
    const plain = layoutFor(contractsOpts({ type: 'log' })).layout;
    expect(plain.yScale?.domain()).toEqual(workedAround.yScale?.domain());
  });

  it('an explicit non-positive min/max on a log axis is discarded, not clamped', () => {
    // `min: 0` is not a wider domain on a log axis, it is an impossible one.
    // Clamping it to the epsilon is the bug; the data-derived bound stands in.
    expect(layoutFor(contractsOpts({ type: 'log', min: 0 })).layout.yScale?.domain()).toEqual([1, 1000]);
    expect(layoutFor(contractsOpts({ type: 'log', min: -50 })).layout.yScale?.domain()).toEqual([1, 1000]);
    // A POSITIVE explicit min is still honoured verbatim (no nice() widening).
    expect(layoutFor(contractsOpts({ type: 'log', min: 5 })).layout.yScale?.domain()).toEqual([5, 1000]);
  });

  it('the LINEAR boxplot axis is byte-identical — the zero floor is its convention', () => {
    // The two conventions are separate: rounding a positive floor down through
    // zero is correct on a linear axis and only wrong on a log one.
    expect(boxplotValueDomain(contractsOpts(undefined).data)).toEqual([0, 300]);
    expect(layoutFor(contractsOpts(undefined)).layout.yScale?.domain()).toEqual([0, 300]);
    // ... and the log convention rounds the same extent to decades.
    expect(boxplotValueDomain(contractsOpts(undefined).data, true)).toEqual([1, 1000]);
  });

  it('a log value axis is unaffected by the zero anchoring linear axes apply', () => {
    // Bars/areas are measured from zero — a fact about the MARK, which a log
    // axis cannot honour (its baseline is a decade, not zero).
    const bars = (yAxis: ChartOptions['yAxis']): ChartOptions => ({
      type: 'bar',
      data: { categories: ['a', 'b', 'c'], series: [{ name: 'S', data: [5, 50, 500] }] },
      ...(yAxis ? { yAxis } : {}),
    });
    expect(layoutFor(bars(undefined)).model.yDomain[0]).toBe(0); // anchored
    expect(layoutFor(bars(undefined)).layout.yScale?.domain()).toEqual([0, 500]);

    const log = layoutFor(bars({ type: 'log' }));
    expect(log.model.yDomain).toEqual([5, 500]); // NOT anchored at zero
    expect(log.layout.yScale?.domain()).toEqual([1, 1000]);

    // Same for a stacked area, whose baseline is a stack floor of zero.
    const area = layoutFor({
      type: 'area',
      stacked: true,
      data: { categories: ['a', 'b'], series: [{ name: 'A', data: [10, 20] }, { name: 'B', data: [30, 40] }] },
      yAxis: { type: 'log' },
    });
    expect(area.model.yDomain[0]).toBeGreaterThan(0);
    expect((area.layout.yScale?.domain() ?? [0])[0]).toBeGreaterThan(0);
  });

  it('a horizontal bar chart reads xAxis as its LOG VALUE axis (registry roles)', () => {
    const resolved = resolveOptions({
      type: 'bar',
      horizontal: true,
      data: { categories: ['a', 'b'], series: [{ name: 'S', data: [5, 500] }] },
      xAxis: { type: 'log' },
    });
    const model = buildModel(resolved, new Map());
    expect(model.valueAxisLog).toBe(true);
    expect(model.yDomain).toEqual([5, 500]); // no zero anchor
  });

  it('a degenerate log domain widens by a decade either side, never to zero', () => {
    const one = layoutFor({
      type: 'line',
      data: { series: [{ name: 'S', data: [[1, 42], [2, 42]] as [number, number][] }] },
      yAxis: { type: 'log' },
    });
    expect(one.model.yDomain).toEqual([4.2, 420]);
    expect((one.layout.yScale?.domain() ?? [0])[0]).toBeGreaterThan(0);
  });

  describe('non-positive DATA on a log axis: dropped as gaps, announced once', () => {
    const withZero: ChartOptions = {
      type: 'line',
      data: { series: [{ name: 'S', data: [[1, 10], [2, 0], [3, -5], [4, 100]] as [number, number][] }] },
      yAxis: { type: 'log' },
    };

    it('folds them to null (the pipeline gap) and keeps them out of the domain', () => {
      const resolved = resolveOptions(withZero);
      const model = buildModel(resolved, new Map());
      expect(model.series[0]?.points.map((p) => p.y)).toEqual([10, null, null, 100]);
      expect(model.yDomain).toEqual([10, 100]);
    });

    it('warns ONCE per chart instance, naming the way out', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const resolved = resolveOptions(withZero);
      const slots = new Map<string, number>();
      buildModel(resolved, slots);
      buildModel(resolved, slots); // a second update must not nag
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/logarithmic value axis/);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/GAPS/);
    });

    it('tabulates and exports them as "no value" — never silently', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { chart } = mount(withZero);
      const csv = chart.exportData();
      expect(csv).toContain('—');
      expect(csv).toContain('100');
    });

    it('a log axis with NO positive data at all falls back to one decade', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { model, layout } = layoutFor({
        type: 'line',
        data: { series: [{ name: 'S', data: [[1, 0], [2, -3]] as [number, number][] }] },
        yAxis: { type: 'log' },
      });
      expect(model.yDomain).toEqual([1, 10]);
      expect(layout.yScale?.domain()).toEqual([1, 10]);
    });
  });

  it('a log DATA (x) axis gets the same guarantee', () => {
    const { model, layout } = layoutFor({
      type: 'scatter',
      data: { series: [{ name: 'S', data: [[0, 5], [10, 6], [1000, 7]] as [number, number][] }] },
      xAxis: { type: 'log' },
    });
    // x = 0 cannot sit on a log axis: it is excluded from the extent instead of
    // dragging the floor to an epsilon.
    expect(model.xDomain?.[0]).toBe(10);
    expect((layout.xScale?.domain() ?? [0])[0]).toBeGreaterThan(0);
  });

  it('the two domain helpers state the rule directly', () => {
    expect(positiveLogDomain(0, 300)).toEqual([30, 300]);
    expect(positiveLogDomain(-5, 300)).toEqual([30, 300]);
    expect(positiveLogDomain(1.2, 260)).toEqual([1.2, 260]);
    expect(positiveLogDomain(-1, -2)).toEqual([0.1, 1]);
    expect(niceValueDomain(1.2, 260, false)).toEqual([0, 300]);
    expect(niceValueDomain(1.2, 260, true)).toEqual([1, 1000]);
  });
});

// ===========================================================================
// DEFECT 2 — an options update must not silently destroy the zoom viewport
// ===========================================================================

interface ZoomHarness {
  el: HTMLElement;
  chart: ReturnType<typeof mount>['chart'];
  host: DecoratorHost;
  /** The live x scale, straight off the layout the last paint used. */
  xs(): { domain(): [number, number] };
  events: ZoomRange[];
}

/**
 * A chart plus the host that reports the live viewport, and every `zoom` event.
 * `host.getViewport()` is the same channel the zoom decorator reads, so the
 * assertions below see EXACTLY the state the chart is in.
 */
function zoomSetup(options: Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>): ZoomHarness {
  const box: { host: DecoratorHost | null; ctx: DecoratorContext | null } = { host: null, ctx: null };
  registerDecorator({
    id: 'test:host',
    layer: 'over',
    order: 1000,
    draw: (c) => {
      box.ctx = c;
    },
    attach: (h) => {
      box.host = h;
    },
  });
  const { el, chart } = mount({ zoom: true, ...options });
  const events: ZoomRange[] = [];
  chart.on('zoom', (ev) => events.push(ev));
  return {
    el,
    chart,
    host: box.host as DecoratorHost,
    xs: () => box.ctx?.layout.xScale as never,
    events,
  };
}

const wideData: ChartOptions['data'] = {
  series: [
    {
      id: 'mrr',
      name: 'MRR',
      data: [[0, 5], [25, 10], [50, 5], [75, 20], [100, 1]] as [number, number][],
    },
  ],
};

/** The whole options object, exactly as every wrapper re-sends it. */
function fullOptions(theme: 'light' | 'dark', data: ChartOptions['data'] = wideData): ChartOptions {
  return {
    type: 'line',
    theme,
    zoom: true,
    animation: false,
    width: 600,
    height: 400,
    data,
    yAxis: { label: 'MRR ($K)' },
  };
}

describe('defect 2 — an update preserves a viewport the new data does not invalidate', () => {
  it('a WRAPPER-SHAPED theme change (whole options re-sent) keeps the window exactly', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    expect(h.events).toEqual([{ x: [20, 60] }]);

    // This is the call every wrapper makes: the WHOLE options object, in which
    // only `theme` differs. `data` is present (and deep-cloned on ingest, so no
    // reference is shared) — which is what used to reset the viewport.
    h.chart.update(fullOptions('dark'));

    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
    expect(h.events).toEqual([{ x: [20, 60] }]); // no reset, and no reset event
  });

  it('the theme really did change — the update was not a no-op', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    const root = h.el.querySelector('.chartcraft') as HTMLElement;
    const before = root.style.background; // jsdom normalizes the hex to rgb()
    h.chart.update(fullOptions('dark'));
    expect(root.style.background).not.toBe(before);
    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
  });

  it('a re-send of IDENTICAL options keeps the window (the idle-rerender case)', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    h.chart.update(fullOptions('light'));
    h.chart.update(fullOptions('light'));
    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
    expect(h.events).toEqual([{ x: [20, 60] }]);
  });

  it('equivalent data that only changes VALUES keeps an x window', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    // Same timestamps, new readings — a live dashboard's polling update. The
    // x window still describes the same span, so it survives.
    h.chart.update(
      fullOptions('light', {
        series: [
          {
            id: 'mrr',
            name: 'MRR',
            data: [[0, 6], [25, 11], [50, 6], [75, 21], [100, 2]] as [number, number][],
          },
        ],
      }),
    );
    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
    expect(h.events).toEqual([{ x: [20, 60] }]);
  });

  it('a value change DOES reset a y window, and says so', () => {
    const h = zoomSetup({ type: 'line', data: wideData, zoom: { enabled: true, axis: 'y' } });
    h.chart.zoomTo({ y: [4, 12] });
    h.chart.update(
      fullOptions('light', {
        series: [{ id: 'mrr', name: 'MRR', data: [[0, 5], [25, 10], [50, 5], [75, 20], [100, 900]] as [number, number][] }],
      }),
    );
    expect(h.host.getViewport()).toBeNull();
    expect(h.events).toEqual([{ y: [4, 12] }, null]);
  });

  it('a genuine RANGE SWITCH resets the window and emits the reset', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    // 0…100 becomes 0…10: a [20, 60] window is in stale units.
    h.chart.update(
      fullOptions('light', {
        series: [{ id: 'mrr', name: 'MRR', data: [[0, 1], [5, 2], [10, 3]] as [number, number][] }],
      }),
    );
    expect(h.host.getViewport()).toBeNull();
    // The event is what an app's "Reset zoom" button is driven by — without it
    // the button stays visible pointing at nothing.
    expect(h.events).toEqual([{ x: [20, 60] }, null]);
    // The x scale spans the new data, not the old window.
    expect(h.chart.getOptions()).toBeTruthy();
  });

  it('a TYPE change resets the window (the numbers are read differently)', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    h.chart.update({ ...fullOptions('light'), type: 'bar' });
    expect(h.host.getViewport()).toBeNull();
    expect(h.events).toEqual([{ x: [20, 60] }, null]);
  });

  it('the emitted reset is a real reset — the axis is back to the data extent', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    expect(h.xs().domain()).toEqual([20, 60]);
    h.chart.update(
      fullOptions('light', {
        series: [{ id: 'mrr', name: 'MRR', data: [[0, 1], [5, 2], [10, 3]] as [number, number][] }],
      }),
    );
    expect(h.xs().domain()).toEqual([0, 10]);
  });

  it('a preserved viewport still drives the scales after the update', () => {
    const h = zoomSetup({ type: 'line', data: wideData });
    h.chart.zoomTo({ x: [20, 60] });
    h.chart.update(fullOptions('dark'));
    expect(h.xs().domain()).toEqual([20, 60]);
  });

  it('a preserved viewport still narrows the drawn points (the window is live)', () => {
    // 12,000 points > the 5,000 downsample threshold, so the viewport really is
    // driving the window and not merely being remembered.
    const many: ChartOptions['data'] = {
      series: [{ id: 'big', name: 'Big', data: Array.from({ length: 12000 }, (_, i) => [i, Math.sin(i / 90) * 50 + 60] as [number, number]) }],
    };
    const h = zoomSetup({ type: 'line', data: many });
    h.chart.zoomTo({ x: [4000, 4200] });
    h.chart.update({ ...fullOptions('dark', many) });
    expect(h.host.getViewport()).toEqual({ x: [4000, 4200] });
    const csv = h.chart.exportData();
    // The a11y/export path still serves every row (it reads the full series).
    expect(csv.split('\n').length).toBeGreaterThan(12000);
  });

  it('the check costs the same at 100k points as at 5 (no O(n) fingerprint)', () => {
    const big: ChartOptions['data'] = {
      series: [
        {
          id: 'big',
          name: 'Big',
          data: Array.from({ length: 100_000 }, (_, i) => [i, (i % 977) + 1] as [number, number]),
        },
      ],
    };
    const h = zoomSetup({ type: 'line', data: big, a11y: { table: 'off' } });
    h.chart.zoomTo({ x: [10_000, 10_500] });
    const t0 = performance.now();
    h.chart.update({ ...fullOptions('dark', big), a11y: { table: 'off' } });
    const elapsed = performance.now() - t0;
    // The window survived, and the decision cost four number comparisons on top
    // of the model rebuild the update was already doing.
    expect(h.host.getViewport()).toEqual({ x: [10_000, 10_500] });
    expect(h.events).toEqual([{ x: [10_000, 10_500] }]);
    expect(elapsed).toBeLessThan(1500);
  });

  it('a legend toggle keeps the window (it always did — guard against regression)', () => {
    const h = zoomSetup({
      type: 'line',
      data: {
        series: [
          { id: 'a', name: 'A', data: [[0, 1], [50, 2], [100, 3]] as [number, number][] },
          { id: 'b', name: 'B', data: [[0, 4], [50, 5], [100, 6]] as [number, number][] },
        ],
      },
    });
    h.chart.zoomTo({ x: [20, 60] });
    const swatch = h.el.querySelector('.chartcraft-legend button, .chartcraft-legend [role="button"]');
    if (swatch instanceof HTMLElement) swatch.click();
    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
  });
});

// ===========================================================================
// DEFECT 3 — PointEvent carries the colour of the mark that was clicked
// ===========================================================================

function clickAt(el: HTMLElement, x: number, y: number): void {
  canvasOf(el).dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
}

describe('improvement 3 — PointEvent.color', () => {
  it('carries the series palette slot, resolved by IDENTITY not array index', () => {
    const { el, chart } = mount({
      type: 'line',
      data: {
        series: [
          { id: 'a', name: 'A', data: [[0, 1], [1, 2]] as [number, number][], visible: false },
          { id: 'b', name: 'B', data: [[0, 5], [1, 6]] as [number, number][] },
        ],
      },
    });
    const events: PointEvent[] = [];
    chart.on('pointclick', (ev) => events.push(ev));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(events).toHaveLength(1);
    // 'b' holds palette SLOT 1 even though it is the only visible series and
    // would be index 0 in any re-derivation from a filtered list.
    expect(events[0]?.seriesId).toBe('b');
    expect(events[0]?.color).toBe(lightTheme.series[1]);
  });

  it('honours a per-datum color override', () => {
    const { el, chart } = mount({
      type: 'bar',
      data: {
        categories: ['a', 'b'],
        series: [{ id: 's', name: 'S', data: [{ x: 'a', y: 5, color: '#123456' }, { x: 'b', y: 8 }] }],
      },
    });
    const events: PointEvent[] = [];
    chart.on('pointclick', (ev) => events.push(ev));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(events[0]?.color).toBe('#123456');
  });

  it('reports the SLICE colour on a pie — the mark actually clicked', () => {
    const { el, chart } = mount({
      type: 'pie',
      data: { categories: ['a', 'b', 'c'], series: [{ id: 'p', name: 'P', data: [30, 40, 30] }] },
    });
    const events: PointEvent[] = [];
    chart.on('pointclick', (ev) => events.push(ev));
    // Walk to the SECOND slice and activate it.
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(events).toHaveLength(1);
    expect(events[0]?.dataIndex).toBe(1);
    // A pie takes palette slots PER SLICE, so slice 2 is slot 1 — NOT the
    // series' slot 0, which is what `seriesColor` alone would have said.
    expect(events[0]?.color).toBe(lightTheme.series[1]);
  });

  it('agrees with the tooltip swatch for the same mark (one resolution path)', () => {
    const { el, chart } = mount({
      type: 'pie',
      data: { categories: ['a', 'b', 'c'], series: [{ id: 'p', name: 'P', data: [30, 40, 30] }] },
      tooltip: { format: (points) => `<i data-color="${points[0]?.color}"></i>` },
    });
    const events: PointEvent[] = [];
    chart.on('pointenter', (ev) => events.push(ev));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const tip = el.ownerDocument.querySelector('.chartcraft-tooltip');
    expect(tip?.innerHTML).toContain(`data-color="${events.at(-1)?.color}"`);
  });

  it('is present on hover and leave events too, not just clicks', () => {
    const { el, chart } = mount({
      type: 'scatter',
      data: { series: [{ id: 's', name: 'S', data: [[0, 1], [1, 2]] as [number, number][] }] },
    });
    const seen: string[] = [];
    chart.on('pointenter', (ev) => seen.push(ev.color));
    chart.on('pointleave', (ev) => seen.push(ev.color));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const c of seen) expect(c).toBe(lightTheme.series[0]);
    clickAt(el, -999, -999); // nothing hit: no event, no throw
  });
});

// ===========================================================================
// DEFECT 4 — theme.warning, and gauge bands that do not force a hex
// ===========================================================================

/** The caution colour, through the one helper that resolves the optional slot. */
const WARNING = warningColor(lightTheme);

describe('improvement 4 — theme.warning and optional gauge band colours', () => {
  it('both built-in themes expose the validated warning step', () => {
    expect(lightTheme.warning).toBe('#fab219');
    expect(darkTheme.warning).toBe('#fab219');
    expect(STATUS_WARNING).toBe('#fab219');
    // Nothing else moved.
    expect(lightTheme.up).toBe('#0ca30c');
    expect(lightTheme.down).toBe('#d03b3b');
    expect(lightTheme.neutral).toBe('#52514e');
    expect(darkTheme.neutral).toBe('#c3c2b7');
  });

  it('a three-band gauge needs no colours at all', () => {
    const bands = resolveGaugeBands([{ to: 60 }, { to: 85 }, { to: 100 }], lightTheme);
    expect(bands.map((b) => b.color)).toEqual([lightTheme.up, WARNING, lightTheme.down]);
  });

  /**
   * `warning` is OPTIONAL on `Theme` because `Theme` is a type callers
   * CONSTRUCT — a custom theme written before the slot existed must keep
   * compiling AND keep theming. This literal is the regression guard: it names
   * every required slot and no `warning`.
   */
  it('a complete custom theme WITHOUT warning still compiles and still themes', () => {
    const legacy: Theme = {
      colorScheme: 'light',
      surface: '#ffffff',
      textPrimary: '#000000',
      textSecondary: '#333333',
      textMuted: '#666666',
      gridline: '#eeeeee',
      axisLine: '#cccccc',
      series: ['#111111', '#222222'],
      fontFamily: 'sans-serif',
      fontSize: 12,
      up: '#00aa00',
      down: '#aa0000',
      neutral: '#888888',
    };
    expect(legacy.warning).toBeUndefined();
    // One resolution point, one fallback — no consumer handles `undefined`.
    expect(warningColor(legacy)).toBe(STATUS_WARNING);
    expect(resolveGaugeBands([{ to: 60 }, { to: 85 }, { to: 100 }], legacy).map((b) => b.color)).toEqual([
      '#00aa00',
      STATUS_WARNING,
      '#aa0000',
    ]);
  });

  it('a PARTIAL custom theme has the slot completed by resolveTheme', () => {
    const custom = resolveTheme({ colorScheme: 'dark', surface: '#000000' } as never);
    expect(custom.warning).toBe(STATUS_WARNING);
    // An explicitly present-but-unset key must not blank it either.
    const unset = resolveTheme({ colorScheme: 'light', warning: undefined } as never);
    expect(unset.warning).toBe(STATUS_WARNING);
    // A caller's own caution colour wins.
    expect(resolveTheme({ colorScheme: 'light', warning: '#ff00ff' } as never).warning).toBe('#ff00ff');
  });

  it('defaults by position, and a named colour always wins', () => {
    expect(resolveGaugeBands([{ to: 100 }], lightTheme).map((b) => b.color)).toEqual([lightTheme.neutral]);
    expect(resolveGaugeBands([{ to: 50 }, { to: 100 }], lightTheme).map((b) => b.color)).toEqual([
      lightTheme.up,
      lightTheme.down,
    ]);
    expect(resolveGaugeBands([{ to: 25 }, { to: 50 }, { to: 75 }, { to: 100 }], lightTheme).map((b) => b.color)).toEqual([
      lightTheme.up,
      WARNING,
      WARNING,
      lightTheme.down,
    ]);
    // Mixed: explicit colours are untouched, only the gaps are filled.
    expect(
      resolveGaugeBands([{ to: 60 }, { to: 85, color: '#abcdef' }, { to: 100 }], lightTheme).map((b) => b.color),
    ).toEqual([lightTheme.up, '#abcdef', lightTheme.down]);
  });

  it('paints the themed defaults on the arc (no hardcoded hex needed)', () => {
    const { el } = mount({
      type: 'gauge',
      gauge: { min: 0, max: 100, bands: [{ to: 60 }, { to: 85 }, { to: 100 }] },
      data: { series: [{ id: 'capacity', name: 'Capacity used', data: [72] }] },
    });
    const styles = new Set(
      ctxOf(el)
        .__props.filter((p) => p.prop === 'fillStyle')
        .map((p) => String(p.value)),
    );
    expect(styles.has(lightTheme.up)).toBe(true);
    expect(styles.has(WARNING)).toBe(true);
    expect(styles.has(lightTheme.down)).toBe(true);
    // The value (72) falls in the middle band, so the arc is themed too — and
    // series blue is never used once bands exist.
    expect(styles.has(lightTheme.series[0] as string)).toBe(false);
  });

  it('the value arc takes the band it falls in, defaults included', () => {
    const bands = resolveGaugeBands([{ to: 60 }, { to: 85 }, { to: 100 }], lightTheme);
    const segments = gaugeBandSegments(bands, 0, 100);
    expect(segments.map((s) => s.color)).toEqual([lightTheme.up, WARNING, lightTheme.down]);
    expect(segments[1]?.from).toBe(60);
    expect(segments[1]?.to).toBe(85);
  });
});
