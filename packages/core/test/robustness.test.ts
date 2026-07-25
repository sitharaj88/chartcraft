/**
 * CROSS-CUTTING ROBUSTNESS SWEEP (quality audit).
 *
 * The per-type suites drive each type with data its own author chose. This file
 * drives all 39 with data nobody chose: an empty series list, all-null values, a
 * single datum, negatives, NaN, ±Infinity, duplicate categories, and every
 * series toggled off. Then it exercises the lifecycle nobody exercises — a
 * rejected `update()`, a type morph across chart families, `destroy()` twice, a
 * resize to nothing, a theme switch mid-animation — and finally pins the
 * determinism the contract makes non-negotiable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHART_TYPE_IDS } from '../src/charts/registry';
import { registerBuiltinChartTypes } from '../src/charts';
import { createChart } from '../src/index';
import type { Chart, ChartOptions, ChartType } from '../src/index';
import { canvasOf, cleanupDom, mount } from './helpers';
import { FIXTURES } from './fixtures.all-types';
import { resizeObservers, setMediaQuery, resetMediaQueries } from './setup';
import { normalizeSeriesData } from '../src/data/normalize';
import { rampColor } from '../src/charts/matrix/color-scale';
import { A11Y_TABLE_MAX_ROWS } from '../src/a11y';
import { buildModel, resolveOptions } from '../src/model';
import { trendlineSeries } from '../src/features/trendlines';
import { errorBarSeries } from '../src/features/error-bars';

registerBuiltinChartTypes();

afterEach(() => {
  resetMediaQueries();
  cleanupDom();
});

// ---------------------------------------------------------------------------
// Degenerate data across every type.

/**
 * Types that DELIBERATELY reject a scenario, with the reason. These are
 * contract-backed guards, not fragility: a chart that cannot express the data is
 * better as a loud error than as a plausible-looking wrong picture. Everything
 * NOT listed here must survive the scenario without throwing.
 */
const DOCUMENTED_REJECTIONS: Partial<Record<ChartType, { scenarios: string[]; because: RegExp }>> = {
  // Contract: "exactly 2 series (e.g. male/female)".
  pyramid: {
    scenarios: ['empty-series', 'empty-data', 'all-null', 'single-datum', 'negative', 'nan', 'infinity', 'zeros', 'duplicate-categories'],
    because: /requires exactly 2 series/,
  },
  // Contract: the whole series IS the graph payload; a value list is not one.
  sankey: {
    scenarios: ['empty-data', 'all-null', 'single-datum', 'negative', 'nan', 'infinity', 'zeros', 'duplicate-categories'],
    because: /expects its graph on the FIRST series/,
  },
  // Contract: `{ x: label, start, end, group? }`; a bare number has no span.
  gantt: {
    scenarios: ['single-datum', 'negative', 'nan', 'infinity', 'zeros', 'duplicate-categories'],
    because: /must be objects/,
  },
  // Area-true / angular encodings cannot express a negative magnitude.
  radar: { scenarios: ['negative', 'infinity'], because: /must be >= 0/ },
  rose: { scenarios: ['negative', 'infinity'], because: /must be >= 0/ },
  radialbar: { scenarios: ['negative', 'infinity'], because: /must be >= 0/ },
  // v0.3.2 (ruling E-9): a value list is not an OHLC series, and these two used
  // to draw nothing and say nothing about it. Same line as gantt — empty and
  // all-null data are still an empty chart, because no data is not wrong data.
  candlestick: {
    scenarios: ['single-datum', 'negative', 'nan', 'infinity', 'zeros', 'duplicate-categories'],
    because: /must be OHLC entries/,
  },
  ohlc: {
    scenarios: ['single-datum', 'negative', 'nan', 'infinity', 'zeros', 'duplicate-categories'],
    because: /must be OHLC entries/,
  },
  // v0.3.2 (ruling E-9): the SAME graph payload sankey demands, so the same
  // diagnostic. This was the sharpest of the three silent cases.
  network: {
    scenarios: ['single-datum', 'negative', 'nan', 'infinity', 'zeros', 'duplicate-categories'],
    because: /expects its graph on the FIRST series/,
  },
};

const SCENARIOS: { name: string; series: unknown }[] = [
  { name: 'empty-series', series: [] },
  { name: 'empty-data', series: [{ name: 'S', data: [] }] },
  { name: 'all-null', series: [{ name: 'S', data: [null, null, null] }] },
  { name: 'single-datum', series: [{ name: 'S', data: [5] }] },
  { name: 'negative', series: [{ name: 'S', data: [-3, -7, -1] }] },
  { name: 'nan', series: [{ name: 'S', data: [Number.NaN, 2, Number.NaN] }] },
  { name: 'infinity', series: [{ name: 'S', data: [Number.POSITIVE_INFINITY, 2, Number.NEGATIVE_INFINITY] }] },
  { name: 'zeros', series: [{ name: 'S', data: [0, 0, 0] }] },
];

/**
 * Types that USED to render an empty chart rather than throwing when the data
 * shape was wrong for them (audit finding C-5). Ruling E-9 made all three loud;
 * they are listed here so the sweep and the test below cannot disagree about
 * which types the ruling covered.
 */
const LOUD_ON_WRONG_SHAPE = new Set<ChartType>(['candlestick', 'ohlc', 'network']);

function rejects(type: ChartType, scenario: string): RegExp | null {
  const entry = DOCUMENTED_REJECTIONS[type];
  return entry && entry.scenarios.includes(scenario) ? entry.because : null;
}

describe('degenerate data: every type either survives or rejects it on purpose', () => {
  for (const sc of SCENARIOS) {
    for (const type of CHART_TYPE_IDS) {
      it(`${type} / ${sc.name}`, () => {
        const base = FIXTURES[type] as Record<string, unknown>;
        const options = {
          ...base,
          type,
          data: { ...(base['data'] as object), series: sc.series },
        } as ChartOptions;

        const expected = rejects(type, sc.name);
        if (expected) {
          expect(() => mount(options)).toThrow(expected);
          return;
        }

        const { el, chart } = mount(options);
        // It painted, it can be tabulated, exported, re-themed and torn down.
        expect(canvasOf(el).getAttribute('aria-label')).toBeTruthy();
        const csv = chart.exportData({ format: 'csv' });
        // No IEEE artifact ever reaches a user-visible surface.
        expect(csv).not.toMatch(/NaN|Infinity/);
        expect(canvasOf(el).getAttribute('aria-label')).not.toMatch(/NaN|Infinity/);
        chart.update({ theme: 'dark' });
        expect(() => chart.destroy()).not.toThrow();
      });
    }
  }

  it('duplicate categories do not collapse or crash any type', () => {
    for (const type of CHART_TYPE_IDS) {
      const base = FIXTURES[type] as Record<string, unknown>;
      const options = {
        ...base,
        type,
        data: { categories: ['A', 'A', 'A'], series: [{ name: 'S', data: [1, 2, 3] }] },
      } as ChartOptions;
      const expected = rejects(type, 'duplicate-categories');
      if (expected) {
        expect(() => mount(options), type).toThrow(expected);
      } else {
        const { el, chart } = mount(options);
        expect(canvasOf(el).getAttribute('aria-label'), type).toBeTruthy();
        // Data points survive a duplicate LABEL: the category index maps every
        // duplicate to the first slot, which is a labelling decision, not a data
        // one.
        const rows = chart.exportData({ format: 'csv' }).split('\n').length - 1;
        expect(rows, type).toBeGreaterThan(0);
        chart.destroy();
      }
      cleanupDom();
    }
  });

  /**
   * FIXED by ruling E-9. This test used to pin the OPPOSITE: given data of the
   * wrong SHAPE these three rendered an entirely empty chart — no marks, no
   * table rows, a header-only CSV — and said nothing, while their direct peers
   * threw a diagnostic for the same mistake. A blank chart with no error is the
   * worst failure mode available: it reads as "no data" and sends the developer
   * hunting in the wrong place.
   *
   * They now throw, naming the shape they expect, exactly as `gantt` and
   * `sankey` do — and the error must remain ACTIONABLE, not merely present.
   */
  it('these types throw a shape diagnostic where they used to render empty in silence', () => {
    const mustSay: Record<string, RegExp[]> = {
      candlestick: [/candlestick/, /\[x, open, high, low, close\]/, /\{ x, o, h, l, c \}/, /'S'/],
      ohlc: [/ohlc/, /\[x, open, high, low, close\]/, /'S'/],
      network: [/network/, /nodes/, /links/, /source/, /target/],
    };
    for (const type of LOUD_ON_WRONG_SHAPE) {
      let message = '';
      try {
        mount({ type, data: { series: [{ name: 'S', data: [1, 2, 3] }] } } as ChartOptions);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message, type).toContain('@chartcraft/core');
      for (const re of mustSay[type] as RegExp[]) expect(message, type).toMatch(re);
      cleanupDom();
    }
  });

  it('...but EMPTY data is still an empty chart on all three (no data is not wrong data)', () => {
    for (const type of LOUD_ON_WRONG_SHAPE) {
      for (const series of [[], [{ name: 'S', data: [] }], [{ name: 'S', data: [null, null] }]]) {
        const { el, chart } = mount({ type, data: { series } } as ChartOptions);
        expect(canvasOf(el).getAttribute('aria-label'), type).toBeTruthy();
        chart.destroy();
        cleanupDom();
      }
    }
  });

  it('toggling every series off via the legend leaves each type mounted and exportable', () => {
    for (const type of CHART_TYPE_IDS) {
      const { el, chart } = mount({ type, ...FIXTURES[type], legend: { show: true } } as ChartOptions);
      for (const item of [...el.querySelectorAll('.chartcraft-legend-item')] as HTMLElement[]) item.click();
      expect(() => chart.exportData(), type).not.toThrow();
      expect(canvasOf(el).getAttribute('aria-label'), type).toBeTruthy();
      chart.destroy();
      cleanupDom();
    }
  });
});

// ---------------------------------------------------------------------------
// Non-finite values (the fix).

describe('non-finite values are folded to "no value" at ingest', () => {
  it('normalizeSeriesData maps NaN and ±Infinity to null for y, low and high', () => {
    const pts = normalizeSeriesData(
      [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        3,
        { y: Number.NaN },
        { low: Number.NaN, high: Number.POSITIVE_INFINITY },
        { low: 1, high: 2 },
      ],
      null,
    );
    expect(pts.map((p) => p.y)).toEqual([null, null, null, 3, null, null, 1]);
    expect(pts[5]!.low).toBeNull();
    expect(pts[5]!.high).toBeNull();
    expect(pts[6]!.low).toBe(1);
  });

  it('an Infinity no longer destroys the value domain (it used to collapse every mark)', () => {
    const { chart } = mount({
      type: 'line',
      data: { categories: ['a', 'b', 'c'], series: [{ name: 'S', data: [1, Number.POSITIVE_INFINITY, 3] }] },
    } as ChartOptions);
    // yDomain used to become [1, Infinity]; every finite point then scaled to
    // NaN or the baseline and the chart silently rendered a flat line.
    const csv = chart.exportData({ format: 'csv' });
    expect(csv).not.toContain('Infinity');
    expect(csv).toContain('—'); // the bad datum reads as a gap, like null
    expect(csv).toContain('3');
  });

  it('a NaN never reaches the canvas as a non-finite coordinate', () => {
    const { el } = mount({
      type: 'line',
      data: { categories: ['a', 'b', 'c'], series: [{ name: 'S', data: [1, Number.NaN, 3] }] },
    } as ChartOptions);
    const calls = (canvasOf(el).getContext('2d') as unknown as { __calls: { args: unknown[] }[] }).__calls;
    const nonFinite = calls.filter((c) => c.args.some((a) => typeof a === 'number' && !Number.isFinite(a)));
    expect(nonFinite).toEqual([]);
  });

  it('heatmap and calendar no longer throw on a NaN value', () => {
    // Was: "Cannot read properties of undefined (reading 'trim')" —
    // `(NaN - min) / (max - min)` is NaN, which passed the `t < 0 ? … : t > 1`
    // clamp untouched and indexed `ramp[NaN]` → undefined → parseHex(undefined).
    expect(() =>
      mount({
        type: 'heatmap',
        data: { categories: ['c1', 'c2'], series: [{ name: 'r1', data: [Number.NaN, 2] }] },
      } as ChartOptions),
    ).not.toThrow();
    cleanupDom();
    expect(() =>
      mount({
        type: 'calendar',
        data: { series: [{ name: 'S', data: [{ x: new Date(Date.UTC(2026, 0, 1)), y: Number.NaN }] }] },
      } as ChartOptions),
    ).not.toThrow();
  });

  it('rampColor degrades on a non-finite position instead of throwing', () => {
    const ramp = ['#cde2fb', '#3987e5', '#0d366b'];
    expect(rampColor(ramp, Number.NaN)).toBe('#cde2fb');
    expect(rampColor(ramp, Number.POSITIVE_INFINITY)).toBe('#cde2fb');
    expect(rampColor(ramp, 0)).toBe('#cde2fb');
    expect(rampColor(ramp, 1)).toBe('#0d366b');
  });
});

// ---------------------------------------------------------------------------
// Lifecycle.

describe('update() is all-or-nothing', () => {
  it('a rejected update leaves the chart exactly as it was, and still usable', () => {
    const { el, chart } = mount({ type: 'line', title: 'Before', ...FIXTURES.line } as ChartOptions);
    const labelBefore = canvasOf(el).getAttribute('aria-label');

    // pyramid rejects a 1-series payload. Before the fix, `this.raw` had already
    // been overwritten when the throw fired, so EVERY later call re-resolved the
    // poisoned options and threw again — the chart was bricked, `destroy()`
    // included.
    expect(() => chart.update({ type: 'pyramid', data: { series: [{ name: 'only', data: [1, 2] }] } })).toThrow(
      /requires exactly 2 series/,
    );

    expect(chart.getOptions().type).toBe('line');
    expect(chart.getOptions().title).toBe('Before');
    expect(canvasOf(el).getAttribute('aria-label')).toBe(labelBefore);
    // Still fully alive.
    expect(() => chart.update({ title: 'After' })).not.toThrow();
    expect(chart.getOptions().title).toBe('After');
    expect(() => chart.exportData()).not.toThrow();
    expect(() => chart.resize()).not.toThrow();
    expect(() => chart.destroy()).not.toThrow();
  });

  it('a payload rejected by the LAYOUT stage is also rolled back', () => {
    const { chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    // gantt rejects bare numbers when its layout parses the task spans.
    expect(() => chart.update({ type: 'gantt', data: { series: [{ name: 'S', data: [1, 2, 3] }] } })).toThrow();
    expect(chart.getOptions().type).toBe('line');
    expect(() => chart.update({ subtitle: 'still fine' })).not.toThrow();
    chart.destroy();
  });
});

describe('type morphing across chart families', () => {
  it('update({ type }) walks line -> sankey -> choropleth -> network -> pie -> heatmap -> wordcloud -> gauge -> bar', () => {
    const chain: ChartType[] = [
      'line', 'sankey', 'choropleth', 'network', 'pie', 'heatmap', 'wordcloud', 'gauge', 'bar',
    ];
    const { el, chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    for (const type of chain) {
      chart.update({ type, ...FIXTURES[type] } as Partial<ChartOptions>);
      expect(chart.getOptions().type, type).toBe(type);
      expect(canvasOf(el).getAttribute('aria-label'), type).toContain(type === 'ohlc' ? 'OHLC' : type[0]!.toUpperCase() + type.slice(1));
      expect(chart.exportData().length, type).toBeGreaterThan(0);
    }
    chart.destroy();
  });
});

describe('destroy() releases everything it took', () => {
  it('removes the root, the body-mounted tooltip, the announcer and the ResizeObserver', () => {
    const roBefore = resizeObservers.length;
    const charts: Chart[] = [];
    for (let i = 0; i < 5; i++) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      charts.push(createChart(el, { theme: 'light', width: 300, height: 200, animation: false, type: 'line', ...FIXTURES.line } as ChartOptions));
    }
    // The tooltip lives in document.body, not in the container — the one node a
    // naive teardown leaks.
    expect(document.querySelectorAll('.chartcraft-tooltip')).toHaveLength(5);
    expect(resizeObservers.slice(roBefore).filter((r) => r.targets.length > 0)).toHaveLength(5);

    for (const c of charts) c.destroy();

    expect(document.querySelectorAll('.chartcraft-tooltip')).toHaveLength(0);
    expect(document.querySelectorAll('.chartcraft-announcer')).toHaveLength(0);
    expect(document.querySelectorAll('.chartcraft')).toHaveLength(0);
    expect(resizeObservers.slice(roBefore).filter((r) => r.targets.length > 0)).toHaveLength(0);
  });

  it('emits destroy once, then ignores a second destroy and every later call', () => {
    const { chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    const onDestroy = vi.fn();
    chart.on('destroy', onDestroy);
    chart.destroy();
    chart.destroy();
    chart.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    // Post-destroy calls are no-ops, not throws.
    expect(() => chart.update({ title: 'x' })).not.toThrow();
    expect(() => chart.setData({ series: [] })).not.toThrow();
    expect(() => chart.resize()).not.toThrow();
    expect(() => chart.zoomTo({ x: [0, 1] })).not.toThrow();
    expect(() => chart.zoomTo(null)).not.toThrow();
  });

  it('a ResizeObserver notification after destroy does nothing', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const chart = createChart(el, { theme: 'light', width: 300, height: 200, type: 'line', ...FIXTURES.line } as ChartOptions);
    chart.destroy();
    expect(() => {
      for (const ro of resizeObservers) ro.trigger();
    }).not.toThrow();
  });

  it('exportImage on a destroyed chart rejects with a clear error', async () => {
    const { chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    chart.destroy();
    await expect(chart.exportImage()).rejects.toThrow(/destroyed chart/);
  });
});

describe('hostile geometry and timing', () => {
  it('resize to 0x0 keeps every type mounted and painting', () => {
    for (const type of CHART_TYPE_IDS) {
      const { el, chart } = mount({ type, ...FIXTURES[type] } as ChartOptions);
      expect(() => chart.update({ width: 0, height: 0 }), type).not.toThrow();
      expect(() => chart.resize(), type).not.toThrow();
      // The layout floors at 40x40 rather than dividing by a zero extent.
      expect(canvasOf(el).getAttribute('aria-label'), type).toBeTruthy();
      chart.destroy();
      cleanupDom();
    }
  });

  it('a theme switch mid-animation, a resize storm and a data swap do not throw', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const chart = createChart(el, {
      type: 'line',
      theme: 'light',
      width: 600,
      height: 400,
      animation: { duration: 400 },
      ...FIXTURES.line,
    } as ChartOptions);
    expect(() => {
      chart.setData({ categories: ['a', 'b', 'c'], series: [{ name: 'S', data: [9, 1, 5] }] });
      chart.update({ theme: 'dark' });
      chart.update({ theme: 'light' });
      chart.update({ theme: 'auto' });
      for (const ro of resizeObservers) ro.trigger();
      chart.setData({ categories: ['a'], series: [{ name: 'S', data: [1] }] });
    }).not.toThrow();
    chart.destroy();
  });

  it('prefers-reduced-motion flipping on mid-life is honored by the next render', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const chart = createChart(el, {
      type: 'bar',
      theme: 'light',
      width: 600,
      height: 400,
      animation: { duration: 10_000 },
      ...FIXTURES.bar,
    } as ChartOptions);
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const before = (canvasOf(el).getContext('2d') as unknown as { __calls: unknown[] }).__calls.length;
    chart.setData({ categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [9, 8, 7] }] });
    const after = (canvasOf(el).getContext('2d') as unknown as { __calls: unknown[] }).__calls.length;
    // The final frame is painted synchronously, not interpolated over 10s.
    expect(after).toBeGreaterThan(before);
    chart.destroy();
  });
});

// ---------------------------------------------------------------------------
// Determinism (contract non-negotiable: "No Math.random() in layout").

describe('determinism: stochastic layouts are byte-identical', () => {
  /** Every draw call, as a string — the strongest available "same pixels" proxy. */
  function drawLog(el: HTMLElement): string {
    const ctx = canvasOf(el).getContext('2d') as unknown as {
      __calls: { method: string; args: unknown[] }[];
      __props: { prop: string; value: unknown }[];
    };
    return JSON.stringify({ calls: ctx.__calls, props: ctx.__props });
  }

  const STOCHASTIC: { type: ChartType; options: () => ChartOptions }[] = [
    {
      type: 'wordcloud',
      options: () =>
        ({
          type: 'wordcloud',
          data: {
            series: [
              {
                name: 'terms',
                data: Array.from({ length: 60 }, (_, i) => ({ x: `term-${i}`, y: 60 - i })),
              },
            ],
          },
        }) as ChartOptions,
    },
    {
      type: 'circlepack',
      options: () =>
        ({
          type: 'circlepack',
          data: {
            series: [
              {
                name: 'tree',
                data: Array.from({ length: 6 }, (_, g) => ({
                  label: `g${g}`,
                  children: Array.from({ length: 8 }, (_, i) => ({ label: `n${g}-${i}`, value: ((i * 7 + g) % 13) + 1 })),
                })),
              },
            ] as never,
          },
        }) as ChartOptions,
    },
    {
      type: 'sankey',
      options: () =>
        ({
          type: 'sankey',
          data: {
            series: [
              {
                name: 'flow',
                data: {
                  nodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })),
                  links: Array.from({ length: 18 }, (_, i) => ({
                    source: `n${i % 6}`,
                    target: `n${6 + (i % 6)}`,
                    value: ((i * 5) % 9) + 1,
                  })),
                },
              },
            ],
          },
        }) as ChartOptions,
    },
    {
      type: 'network',
      options: () =>
        ({
          type: 'network',
          data: {
            series: [
              {
                name: 'graph',
                data: {
                  nodes: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, group: `g${i % 4}`, value: (i % 7) + 1 })),
                  links: Array.from({ length: 50 }, (_, i) => ({ source: `n${i % 30}`, target: `n${(i * 7 + 3) % 30}` })),
                },
              },
            ],
          },
        }) as ChartOptions,
    },
  ];

  for (const { type, options } of STOCHASTIC) {
    it(`${type}: two SEPARATE chart instances produce an identical draw log`, () => {
      const a = mount(options());
      const logA = drawLog(a.el);
      const b = mount(options());
      const logB = drawLog(b.el);
      expect(logA).toBe(logB);
      expect(logA.length).toBeGreaterThan(100); // it actually drew something
      a.chart.destroy();
      b.chart.destroy();
    });

    it(`${type}: re-rendering the SAME instance reproduces the same frame`, () => {
      const { el, chart } = mount(options());
      const ctx = canvasOf(el).getContext('2d') as unknown as { __calls: { method: string; args: unknown[] }[] };
      // Compare the SECOND and THIRD frames, not the first and second: the mount
      // frame carries one extra `setTransform` from the initial
      // `renderer.resize(w, h, dpr)`, which only runs when the backing-store size
      // changes. Frames 2 and 3 go down an identical path.
      chart.resize();
      const start2 = ctx.__calls.length;
      chart.resize();
      const start3 = ctx.__calls.length;
      chart.resize();
      const frame2 = ctx.__calls.slice(start2, start3);
      const frame3 = ctx.__calls.slice(start3);
      // A seeded layout cannot drift on redraw: same calls, same order, same args.
      expect(frame2.length).toBeGreaterThan(0);
      expect(frame3.length).toBe(frame2.length);
      expect(JSON.stringify(frame3)).toBe(JSON.stringify(frame2));
      chart.destroy();
    });
  }

  it('Math.random is never called during layout or paint of any type', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      for (const type of CHART_TYPE_IDS) {
        const { chart } = mount({ type, ...FIXTURES[type] } as ChartOptions);
        chart.resize();
        chart.update({ theme: 'dark' });
        chart.destroy();
        cleanupDom();
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Data fidelity of the accessible surfaces (quality audit).

describe('the a11y table and exportData carry the FULL data, never a render sample', () => {
  const N = 60_000;
  const big = () =>
    ({
      type: 'line',
      data: {
        series: [
          { name: 'S', data: Array.from({ length: N }, (_, i) => [i, Math.sin(i / 500) * 100] as [number, number]) },
        ],
      },
    }) as ChartOptions;

  it('exportData returns every row at 60k points, with downsampling ON', () => {
    const { chart } = mount(big());
    // Was 5,000 — the LTTB threshold. LTTB picks the points that preserve a
    // line's visible SHAPE; it has no notion of which rows matter semantically,
    // so handing its output to an export (or to a screen reader) silently
    // substitutes a visual approximation for the data.
    expect(chart.exportData({ format: 'csv' }).split('\n').length - 1).toBe(N);
    const json = JSON.parse(chart.exportData({ format: 'json' })) as { rows: unknown[] };
    expect(json.rows).toHaveLength(N);
    chart.destroy();
  });

  it('a zoom viewport does not narrow the export either', () => {
    const { chart } = mount({ ...big(), zoom: true } as ChartOptions);
    chart.zoomTo({ x: [1000, 1100] });
    // Was 103 rows: the visible window, not the data.
    expect(chart.exportData({ format: 'csv' }).split('\n').length - 1).toBe(N);
    chart.destroy();
  });

  it('the DOM table is bounded, but says so — in the caption and in the description', () => {
    const { el, chart } = mount(big());
    expect(el.querySelectorAll('.chartcraft-a11y-table tbody tr')).toHaveLength(A11Y_TABLE_MAX_ROWS);
    // Materializing one <tr> per datum costs ~115us/row: at 100k that is an
    // 11.5-second synchronous stall on mount, and at 1M it exhausts the heap. So
    // the DOM table is capped and the truncation is STATED in both places a
    // reader could look, naming exportData() as the complete source.
    const caption = el.querySelector('.chartcraft-a11y-table caption')?.textContent ?? '';
    expect(caption).toContain(`first ${A11Y_TABLE_MAX_ROWS.toLocaleString()}`);
    expect(caption).toContain(N.toLocaleString());
    expect(caption).toContain('exportData()');
    const descId = canvasOf(el).getAttribute('aria-describedby');
    const desc = el.querySelector(`#${descId}`)?.textContent ?? '';
    expect(desc).toContain('exportData()');
    expect(desc).toContain(N.toLocaleString());
    chart.destroy();
  });

  it('the description states that the plot draws only a visual sample', () => {
    const { el, chart } = mount(big());
    const descId = canvasOf(el).getAttribute('aria-describedby');
    const desc = el.querySelector(`#${descId}`)?.textContent ?? '';
    expect(desc).toMatch(/draws 5,000 of 60,000 data points/);
    expect(desc).toContain('visual sample');
    chart.destroy();
  });

  it('small data pays nothing: the render model IS the a11y model', () => {
    const { el, chart } = mount({ type: 'line', ...FIXTURES.line } as ChartOptions);
    // Nothing was dropped, so there is no note and no second ingest pass.
    expect(canvasOf(el).getAttribute('aria-describedby')).toBeNull();
    expect(chart.exportData({ format: 'csv' }).split('\n').length - 1).toBe(3);
    chart.destroy();
  });
});

describe('a line/area path survives more points than a spread can carry', () => {
  it('300k points with downsampling OFF does not blow the call stack', () => {
    // `cmds.push(...segmentCmds(run))` built an ARGUMENT LIST one entry per
    // point; V8 caps that near 125k, so `downsample: { enabled: false }` — a
    // documented option, on a library advertising 1M points — threw
    // "RangeError: Maximum call stack size exceeded".
    const data = Array.from({ length: 300_000 }, (_, i) => [i, i % 977] as [number, number]);
    expect(() =>
      mount({
        type: 'line',
        downsample: { enabled: false },
        // The table is the other cost at this size and is not what this asserts.
        a11y: { table: 'off' },
        data: { series: [{ name: 'S', data }] },
      } as ChartOptions),
    ).not.toThrow();
  });

  it('a histogram with 300k raw samples does not blow the call stack', () => {
    const samples = Array.from({ length: 300_000 }, (_, i) => (i * 7919) % 1000);
    expect(() =>
      mount({
        type: 'histogram',
        a11y: { table: 'off' },
        data: { series: [{ name: 'S', data: samples }] },
      } as ChartOptions),
    ).not.toThrow();
  });
});

describe('decorations gate on the resolved per-series mark kind, not the root type', () => {
  it('a trendline on a line series inside a BAR root is drawn, not silently dropped', () => {
    const options = {
      type: 'bar',
      data: {
        categories: ['a', 'b', 'c', 'd'],
        series: [
          { name: 'Bars', data: [3, 5, 4, 6] },
          { name: 'Trend', type: 'line', data: [2, 4, 5, 7], trendline: { type: 'linear' } },
        ],
      },
    } as ChartOptions;
    const opts = resolveOptions(options);
    const model = buildModel(opts, new Map());
    // Was []: gating asked the ROOT type ('bar'), which is not in
    // TRENDLINE_TYPES, so the series' own `type: 'line'` was ignored — a silent
    // no-op, the worst failure mode a feature can have.
    expect(trendlineSeries(model, opts).map((e) => e.s.name)).toEqual(['Trend']);
    // And it earns its legend entry, so it can never read as observed data.
    const { el } = mount({ ...options, legend: { show: true } } as ChartOptions);
    const names = [...el.querySelectorAll('.chartcraft-legend-item')].map((n) => n.textContent ?? '');
    expect(names.some((n) => n.includes('trend'))).toBe(true);
  });

  it('error bars on a line series inside a BAR root are drawn', () => {
    const options = {
      type: 'bar',
      data: {
        categories: ['a', 'b'],
        series: [
          { name: 'Bars', data: [3, 5] },
          { name: 'Line', type: 'line', data: [2, 4], errorBars: { value: 1 } },
        ],
      },
    } as ChartOptions;
    const opts = resolveOptions(options);
    const model = buildModel(opts, new Map());
    expect(errorBarSeries(model, opts).map((e) => e.s.name)).toEqual(['Line']);
  });

  it('a root whose base kind coincides but whose semantics do not stays excluded', () => {
    // streamgraph is `baseKind: 'area'` over a deliberately meaningless
    // baseline; lollipop and waterfall are `'bar'`. Kind-based gating must not
    // silently start decorating them.
    for (const type of ['streamgraph', 'lollipop', 'waterfall'] as const) {
      const options = {
        type,
        data: {
          categories: ['a', 'b', 'c'],
          series: [{ name: 'S', data: [1, 2, 3], errorBars: { value: 1 }, trendline: {} }],
        },
      } as ChartOptions;
      const opts = resolveOptions(options);
      const model = buildModel(opts, new Map());
      expect(errorBarSeries(model, opts), type).toEqual([]);
      expect(trendlineSeries(model, opts), type).toEqual([]);
    }
  });

  it('the plain single-type roots keep working exactly as before', () => {
    for (const type of ['line', 'scatter', 'bubble'] as const) {
      const options = {
        type,
        data: {
          series: [
            {
              name: 'S',
              data: [
                [1, 2],
                [2, 4],
                [3, 5],
              ],
              trendline: { type: 'linear' },
            },
          ],
        },
      } as ChartOptions;
      const opts = resolveOptions(options);
      expect(trendlineSeries(buildModel(opts, new Map()), opts), type).toHaveLength(1);
    }
  });
});

describe('buildModel retains the pre-lossy series for the accessible surfaces', () => {
  const series = (n: number) => [
    { name: 'S', data: Array.from({ length: n }, (_, i) => [i, i % 97] as [number, number]) },
  ];

  it('sets sourcePoints only when downsampling actually drops rows', () => {
    const under = buildModel(resolveOptions({ type: 'line', downsample: { threshold: 5000 }, data: { series: series(100) } } as ChartOptions), new Map());
    // Below the threshold nothing is dropped, so nothing is retained — the
    // common case must not pay for a second array reference or a copy.
    expect(under.series[0]!.sourcePoints).toBeUndefined();
    expect(under.series[0]!.points).toHaveLength(100);

    const over = buildModel(resolveOptions({ type: 'line', downsample: { threshold: 5000 }, data: { series: series(60_000) } } as ChartOptions), new Map());
    expect(over.series[0]!.points.length).toBeLessThanOrEqual(5000);
    expect(over.series[0]!.sourcePoints).toHaveLength(60_000);
  });

  it('sourcePoints is captured before the ZOOM WINDOW as well as before LTTB', () => {
    const opts = resolveOptions({ type: 'line', downsample: { threshold: 5000 }, data: { series: series(60_000) } } as ChartOptions);
    const zoomed = buildModel(opts, new Map(), { x: [1000, 1100] });
    // The drawn points are the window; the retained ones are the whole series.
    expect(zoomed.series[0]!.points.length).toBeLessThan(500);
    expect(zoomed.series[0]!.sourcePoints).toHaveLength(60_000);
  });

  it('disabling downsampling leaves points whole and retains nothing', () => {
    const model = buildModel(resolveOptions({ type: 'line', downsample: { enabled: false }, data: { series: series(60_000) } } as ChartOptions), new Map());
    expect(model.series[0]!.points).toHaveLength(60_000);
    expect(model.series[0]!.sourcePoints).toBeUndefined();
  });
});
