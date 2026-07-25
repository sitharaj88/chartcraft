/**
 * v0.3 feature 2 — trendlines: the three fits on worked data, polyline
 * construction, dashing, the legend entry, and exclusion from the y-domain.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDecorators, registerDecorator, type DecoratorContext } from '../src/index';
import {
  DEFAULT_PERIOD,
  EXP_SAMPLES,
  TREND_DASH,
  TRENDLINE_TYPES,
  exponentialFit,
  linearFit,
  movingAverage,
  registerBuiltinDecorators,
  resolveTrendline,
  trendlinePolyline,
  trendlineScreenPath,
  trendlineSeries,
  type XY,
} from '../src/features';
import { buildModel, resolveOptions } from '../src/model';
import { registerBuiltinChartTypes } from '../src/charts';
import type { ChartOptions } from '../src/index';
import { cleanupDom, ctxOf, mount } from './helpers';
import { resetMediaQueries, setMediaQuery } from './setup';

registerBuiltinChartTypes();
registerBuiltinDecorators();

beforeEach(() => {
  clearDecorators();
  registerBuiltinDecorators();
});

afterEach(() => {
  clearDecorators();
  cleanupDom();
  resetMediaQueries();
});

function capture(): { ctx: DecoratorContext | null } {
  const box: { ctx: DecoratorContext | null } = { ctx: null };
  registerDecorator({ id: 'test:capture', layer: 'over', order: 1000, draw: (c) => (box.ctx = c) });
  return box;
}

/** y = 1.1x + 1.1 is the least-squares fit of this worked set. */
const worked: XY[] = [
  { x: 0, y: 1 },
  { x: 1, y: 3 },
  { x: 2, y: 2 },
  { x: 3, y: 5 },
];

describe('linearFit (least squares)', () => {
  it('fits the worked set exactly', () => {
    const fit = linearFit(worked)!;
    expect(fit.slope).toBeCloseTo(1.1, 12);
    expect(fit.intercept).toBeCloseTo(1.1, 12);
    // r² = 1 - 2.7/8.75
    expect(fit.r2).toBeCloseTo(0.6914285714285714, 12);
    expect(fit.predict(10)).toBeCloseTo(12.1, 10);
  });

  it('is exact on a perfect line (r² = 1)', () => {
    const fit = linearFit([
      { x: 1, y: 5 },
      { x: 2, y: 8 },
      { x: 3, y: 11 },
    ])!;
    expect(fit.slope).toBe(3);
    expect(fit.intercept).toBe(2);
    expect(fit.r2).toBe(1);
  });

  it('returns null for fewer than two points or a vertical set', () => {
    expect(linearFit([])).toBeNull();
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
    expect(
      linearFit([
        { x: 2, y: 1 },
        { x: 2, y: 9 },
      ]),
    ).toBeNull();
  });

  it('ignores non-finite samples', () => {
    const fit = linearFit([...worked, { x: Number.NaN, y: 1000 }])!;
    expect(fit.slope).toBeCloseTo(1.1, 12);
  });
});

describe('movingAverage (centered window)', () => {
  it('averages a centered odd window and clamps at the edges', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
  });

  it('defaults to a period of 7', () => {
    expect(DEFAULT_PERIOD).toBe(7);
    const out = movingAverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // i=0 -> mean(1..4) = 2.5 ; i=4 -> mean(2..8) = 5 (fully centered)
    expect(out[0]).toBe(2.5);
    expect(out[4]).toBe(5);
    expect(out[9]).toBe(8.5);
  });

  it('puts the extra sample on the right for even periods', () => {
    // period 4: window = [i-1, i+2]
    expect(movingAverage([1, 2, 3, 4, 5], 4)).toEqual([2, 2.5, 3.5, 4, 4.5]);
  });

  it('skips nulls and yields null for an all-null window', () => {
    // Windows [0,1] / [0,2] / [1,2] average only the non-null members.
    expect(movingAverage([1, null, 3], 3)).toEqual([1, 2, 3]);
    expect(movingAverage([null, null], 1)).toEqual([null, null]);
  });

  it('preserves length and index', () => {
    expect(movingAverage([1, 2, 3, 4, 5, 6], 7)).toHaveLength(6);
  });
});

describe('exponentialFit (log-linear)', () => {
  const exp: XY[] = [
    { x: 0, y: 2 },
    { x: 1, y: 2 * Math.E ** 0.5 },
    { x: 2, y: 2 * Math.E },
  ];

  it('recovers a and b from y = 2·e^(0.5x)', () => {
    const fit = exponentialFit(exp)!;
    expect(fit.a).toBeCloseTo(2, 12);
    expect(fit.b).toBeCloseTo(0.5, 12);
    expect(fit.predict(4)).toBeCloseTo(2 * Math.E ** 2, 10);
  });

  it('drops non-positive y values (ln is undefined there)', () => {
    const fit = exponentialFit([{ x: -1, y: 0 }, { x: -2, y: -5 }, ...exp])!;
    expect(fit.a).toBeCloseTo(2, 12);
    expect(fit.b).toBeCloseTo(0.5, 12);
  });

  it('returns null with fewer than two positive samples', () => {
    expect(exponentialFit([{ x: 0, y: 1 }, { x: 1, y: 0 }])).toBeNull();
  });
});

describe('trendlinePolyline', () => {
  it("'linear' returns just the two fitted endpoints", () => {
    const poly = trendlinePolyline(worked, resolveTrendline({}, 'S'));
    expect(poly).toHaveLength(2);
    expect(poly[0]!.x).toBe(0);
    expect(poly[0]!.y).toBeCloseTo(1.1, 12);
    expect(poly[1]!.x).toBe(3);
    expect(poly[1]!.y).toBeCloseTo(4.4, 12);
  });

  it("'movingAverage' keeps one entry per input index, gaps included", () => {
    const pts: (XY | null)[] = [{ x: 0, y: 1 }, null, { x: 2, y: 3 }, { x: 3, y: 5 }];
    const poly = trendlinePolyline(pts, resolveTrendline({ type: 'movingAverage', period: 3 }, 'S'));
    expect(poly).toHaveLength(4);
    expect(poly[1]).toBeNull();
    expect(poly[0]).toEqual({ x: 0, y: 1 });
    expect(poly[2]).toEqual({ x: 2, y: 4 });
  });

  it("'exponential' samples the curve across the x extent", () => {
    const poly = trendlinePolyline(
      [
        { x: 0, y: 2 },
        { x: 2, y: 2 * Math.E },
      ],
      resolveTrendline({ type: 'exponential' }, 'S'),
    ) as XY[];
    expect(poly).toHaveLength(EXP_SAMPLES);
    expect(poly[0]!.x).toBe(0);
    expect(poly[EXP_SAMPLES - 1]!.x).toBe(2);
    expect(poly[0]!.y).toBeCloseTo(2, 10);
    expect(poly[EXP_SAMPLES - 1]!.y).toBeCloseTo(2 * Math.E, 10);
  });

  it('returns nothing when the series cannot be fitted', () => {
    expect(trendlinePolyline([], resolveTrendline({}, 'S'))).toEqual([]);
    expect(trendlinePolyline([{ x: 1, y: 1 }], resolveTrendline({}, 'S'))).toEqual([]);
  });

  it('resolves defaults: linear, period 7, dashed, "<series> trend"', () => {
    expect(resolveTrendline({}, 'Sales')).toEqual({
      type: 'linear',
      period: 7,
      dashed: true,
      label: 'Sales trend',
    });
    expect(resolveTrendline({ label: false }, 'Sales').label).toBe(false);
    expect([...TRENDLINE_TYPES]).toEqual(['line', 'scatter', 'bubble']);
  });
});

// ------------------------------------------------------------------ decorator

const trendOpts: ChartOptions = {
  type: 'line',
  data: {
    categories: ['A', 'B', 'C'],
    series: [{ name: 'S', data: [10, 1, 1], trendline: {} }],
  },
};

describe('trendline decorator', () => {
  it('is EXCLUDED from the y-domain (the fit never rescales the data)', () => {
    const model = buildModel(resolveOptions(trendOpts), new Map());
    // Least squares over (0,10) (1,1) (2,1) is y = 8.5 - 4.5x, i.e. -0.5 at x=2.
    expect(model.yDomain).toEqual([1, 10]);
  });

  it('positions the fit against the pipeline scales and lets the plot clip it', () => {
    const box = capture();
    mount(trendOpts);
    const ctx = box.ctx as unknown as DecoratorContext;
    const band = ctx.layout.xScale as { center(i: number): number };
    const vs = ctx.layout.yScale as { scale(v: number): number };
    const path = trendlineScreenPath(ctx, 0) as { x: number; y: number }[];
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual({ x: band.center(0), y: vs.scale(8.5) });
    expect(path[1]!.x).toBe(band.center(2));
    expect(path[1]!.y).toBeCloseTo(vs.scale(-0.5), 10);
    // -0.5 is below the axis: the trendline is clipped, not accommodated.
    expect(path[1]!.y).toBeGreaterThan(ctx.plot.y + ctx.plot.h);
  });

  it('is dashed by default and solid on request', () => {
    const { el } = mount(trendOpts);
    const dashes = ctxOf(el)
      .__calls.filter((c) => c.method === 'setLineDash')
      .map((c) => JSON.stringify(c.args[0]));
    expect(dashes).toContain(JSON.stringify([...TREND_DASH]));

    clearDecorators();
    registerBuiltinDecorators();
    const solid = mount({
      type: 'line',
      data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [10, 1, 1], trendline: { dashed: false } }] },
    });
    const solidDashes = ctxOf(solid.el)
      .__calls.filter((c) => c.method === 'setLineDash')
      .map((c) => JSON.stringify(c.args[0]));
    expect(solidDashes).not.toContain(JSON.stringify([...TREND_DASH]));
  });

  it('adds a non-toggleable legend entry after the type items', () => {
    const { el } = mount({ ...trendOpts, legend: true });
    const items = [...el.querySelectorAll('.chartcraft-legend-item')];
    expect(items.map((b) => b.textContent)).toEqual(['S', 'S trend']);
    expect((items[1] as HTMLButtonElement).disabled).toBe(true);
    expect(items[1]!.getAttribute('aria-label')).toBe('S trend');
  });

  it('honors a custom label and omits the entry for label: false', () => {
    const custom = mount({
      type: 'line',
      legend: true,
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2], trendline: { label: 'Fit' } }] },
    });
    expect([...custom.el.querySelectorAll('.chartcraft-legend-item')].map((b) => b.textContent)).toEqual(['S', 'Fit']);

    clearDecorators();
    registerBuiltinDecorators();
    const none = mount({
      type: 'line',
      legend: true,
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2], trendline: { label: false } }] },
    });
    expect([...none.el.querySelectorAll('.chartcraft-legend-item')].map((b) => b.textContent)).toEqual(['S']);
  });

  it('ignores series without a trendline and unsupported chart types', () => {
    const barOpts: ChartOptions = {
      type: 'bar',
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2], trendline: {} }] },
    };
    const model = buildModel(resolveOptions(barOpts), new Map());
    expect(trendlineSeries(model, resolveOptions(barOpts))).toEqual([]);
  });

  it('skips hidden series', () => {
    const opts: ChartOptions = {
      type: 'line',
      data: { categories: ['A', 'B'], series: [{ name: 'S', visible: false, data: [1, 2], trendline: {} }] },
    };
    expect(trendlineSeries(buildModel(resolveOptions(opts), new Map()), resolveOptions(opts))).toEqual([]);
  });

  it('draws a movingAverage trendline with one screen point per datum', () => {
    const box = capture();
    mount({
      type: 'line',
      data: {
        categories: ['A', 'B', 'C', 'D'],
        series: [{ name: 'S', data: [1, 5, 3, 9], trendline: { type: 'movingAverage', period: 3 } }],
      },
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    const vs = ctx.layout.yScale as { scale(v: number): number };
    const path = trendlineScreenPath(ctx, 0) as { x: number; y: number }[];
    expect(path).toHaveLength(4);
    // Centered 3-window: [3, 3, 17/3, 6]
    expect(path[0]!.y).toBe(vs.scale(3));
    expect(path[3]!.y).toBe(vs.scale(6));
  });

  it('still draws under prefers-reduced-motion', () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const box = capture();
    mount({ ...trendOpts, animation: true });
    const ctx = box.ctx as unknown as DecoratorContext;
    expect(trendlineScreenPath(ctx, 0)).toHaveLength(2);
  });
});
