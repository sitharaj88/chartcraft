/**
 * v0.3 feature 1 — error bars: interval math, y-domain extension, whisker/cap
 * geometry, draw order (over the marks), the ± a11y columns and the tooltip
 * interval.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearDecorators,
  registerDecorator,
  type DecoratorContext,
} from '../src/index';
import {
  DEFAULT_CAP_WIDTH,
  ERROR_BAR_TYPES,
  darkenColor,
  errorInterval,
  errorBarTableColumns,
  formatInterval,
  registerBuiltinDecorators,
  whiskerGeometry,
  withErrorBarColumns,
  withErrorBarIntervals,
} from '../src/features';
import { buildModel, resolveOptions } from '../src/model';
import { registerBuiltinChartTypes } from '../src/charts';
import type { ChartOptions, TooltipPoint } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, mount, pointerMove } from './helpers';
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

/** Capture the live DecoratorContext of the last painted frame. */
function capture(): { ctx: DecoratorContext | null } {
  const box: { ctx: DecoratorContext | null } = { ctx: null };
  registerDecorator({
    id: 'test:capture',
    layer: 'over',
    order: 1000,
    draw: (c) => {
      box.ctx = c;
    },
  });
  return box;
}

interface Seg {
  i: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Straight segments in the draw log (Renderer#line and path edges). */
function segments(el: HTMLElement): Seg[] {
  const calls = ctxOf(el).__calls;
  const out: Seg[] = [];
  for (let i = 0; i < calls.length - 1; i++) {
    const a = calls[i];
    const b = calls[i + 1];
    if (a?.method !== 'moveTo' || b?.method !== 'lineTo') continue;
    out.push({
      i,
      x1: a.args[0] as number,
      y1: a.args[1] as number,
      x2: b.args[0] as number,
      y2: b.args[1] as number,
    });
  }
  return out;
}

function hasSegment(el: HTMLElement, s: { x1: number; y1: number; x2: number; y2: number }): boolean {
  return segments(el).some(
    (g) =>
      Math.abs(g.x1 - s.x1) < 1e-6 &&
      Math.abs(g.y1 - s.y1) < 1e-6 &&
      Math.abs(g.x2 - s.x2) < 1e-6 &&
      Math.abs(g.y2 - s.y2) < 1e-6,
  );
}

const uniform: ChartOptions = {
  type: 'line',
  data: {
    categories: ['A', 'B', 'C'],
    series: [{ name: 'S', data: [10, 20, 30], errorBars: { value: 5 } }],
  },
};

// ---------------------------------------------------------------- interval math

describe('errorInterval', () => {
  it('uses per-point absolute eLow/eHigh over any uniform option', () => {
    expect(errorInterval(10, { eLow: 7, eHigh: 14 }, { value: 5, percent: 50 })).toEqual({ lo: 7, hi: 14 });
  });

  it('falls a missing absolute side back to the anchor value', () => {
    expect(errorInterval(10, { eHigh: 14 }, {})).toEqual({ lo: 10, hi: 14 });
    expect(errorInterval(10, { eLow: 7 }, {})).toEqual({ lo: 7, hi: 10 });
  });

  it('normalizes reversed absolute bounds', () => {
    expect(errorInterval(10, { eLow: 14, eHigh: 7 }, {})).toEqual({ lo: 7, hi: 14 });
  });

  it('applies a uniform absolute value symmetrically, and value wins over percent', () => {
    expect(errorInterval(20, {}, { value: 5 })).toEqual({ lo: 15, hi: 25 });
    expect(errorInterval(20, {}, { value: 5, percent: 10 })).toEqual({ lo: 15, hi: 25 });
  });

  it('applies percent as a share of |value| (negative anchors included)', () => {
    expect(errorInterval(200, {}, { percent: 10 })).toEqual({ lo: 180, hi: 220 });
    expect(errorInterval(-50, {}, { percent: 20 })).toEqual({ lo: -60, hi: -40 });
  });

  it('returns null for gaps, missing options and non-finite anchors', () => {
    expect(errorInterval(null, { eLow: 1, eHigh: 2 }, {})).toBeNull();
    expect(errorInterval(10, {}, {})).toBeNull();
    expect(errorInterval(Number.NaN, {}, { value: 1 })).toBeNull();
  });

  it('formats an interval as an en-dashed range', () => {
    expect(formatInterval({ lo: 5, hi: 15 })).toBe('5–15');
  });

  it('declares the five supporting chart types', () => {
    expect([...ERROR_BAR_TYPES]).toEqual(['line', 'area', 'bar', 'scatter', 'bubble']);
    expect(DEFAULT_CAP_WIDTH).toBe(6);
  });
});

// ------------------------------------------------------------------- y-domain

describe('y-domain extension (extendYDomain hook)', () => {
  it('widens the value domain to exactly the whisker bounds', () => {
    const model = buildModel(resolveOptions(uniform), new Map());
    // Raw extent is [10, 30]; ±5 whiskers push it to [5, 35].
    expect(model.yDomain).toEqual([5, 35]);
  });

  it('leaves the domain alone when no series declares error bars', () => {
    const plain = buildModel(
      resolveOptions({ type: 'line', data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [10, 20, 30] }] } }),
      new Map(),
    );
    expect(plain.yDomain).toEqual([10, 30]);
  });

  it('uses per-point bounds and ignores hidden series', () => {
    const model = buildModel(
      resolveOptions({
        type: 'scatter',
        data: {
          series: [
            { name: 'S', data: [{ x: 1, y: 10, eLow: 2, eHigh: 40 }, { x: 2, y: 20 }], errorBars: {} },
            { name: 'H', visible: false, data: [{ x: 1, y: 10, eLow: -100, eHigh: 100 }], errorBars: {} },
          ],
        },
      }),
      new Map(),
    );
    expect(model.yDomain).toEqual([2, 40]);
  });

  it('does not extend the domain on unsupported chart types', () => {
    const model = buildModel(
      resolveOptions({
        type: 'pie',
        data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 30], errorBars: { value: 100 } }] },
      }),
      new Map(),
    );
    expect(model.yDomain).toEqual([10, 30]);
  });
});

// ------------------------------------------------------------------- geometry

describe('whisker geometry', () => {
  it('draws a 1px stem with 6px caps centered on the mark', () => {
    const box = capture();
    const { el } = mount(uniform);
    const ctx = box.ctx as unknown as DecoratorContext;
    const vs = ctx.layout.yScale as { scale(v: number): number };
    const bars = whiskerGeometry(ctx);
    expect(bars).toHaveLength(3);

    const first = bars[0]!;
    const markX = ctx.geom.pos[0]?.[0]?.x as number;
    expect(first.interval).toEqual({ lo: 5, hi: 15 });
    expect(first.x1).toBe(markX);
    expect(first.x2).toBe(markX);
    expect(first.y1).toBe(vs.scale(5));
    expect(first.y2).toBe(vs.scale(15));
    // Caps: 6px wide (default), centered, at each bound.
    expect(first.caps[0]).toEqual({ x1: markX - 3, y1: vs.scale(5), x2: markX + 3, y2: vs.scale(5) });
    expect(first.caps[1]).toEqual({ x1: markX - 3, y1: vs.scale(15), x2: markX + 3, y2: vs.scale(15) });
    // ... and they reach the canvas.
    expect(hasSegment(el, { x1: markX, y1: vs.scale(5), x2: markX, y2: vs.scale(15) })).toBe(true);
    expect(hasSegment(el, { x1: markX - 3, y1: vs.scale(15), x2: markX + 3, y2: vs.scale(15) })).toBe(true);
  });

  it('honors an explicit capWidth', () => {
    const box = capture();
    mount({
      type: 'scatter',
      data: { series: [{ name: 'S', data: [[1, 10]] as [number, number][], errorBars: { value: 2, capWidth: 10 } }] },
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    const g = whiskerGeometry(ctx)[0]!;
    expect(g.caps[0]!.x2 - g.caps[0]!.x1).toBe(10);
  });

  it('defaults the color to the series color darkened, and honors an override', () => {
    const box = capture();
    mount(uniform);
    const ctx = box.ctx as unknown as DecoratorContext;
    expect(darkenColor('#2a78d6', 0.3)).toBe('#1d5496');
    expect(whiskerGeometry(ctx)[0]!.color).toBe('#1d5496');

    clearDecorators();
    registerBuiltinDecorators();
    const box2 = capture();
    mount({
      ...uniform,
      data: {
        categories: ['A', 'B', 'C'],
        series: [{ name: 'S', data: [10, 20, 30], errorBars: { value: 5, color: '#123456' } }],
      },
    });
    expect(whiskerGeometry(box2.ctx as unknown as DecoratorContext)[0]!.color).toBe('#123456');
  });

  it('transposes to horizontal stems with vertical caps on horizontal bars', () => {
    const box = capture();
    mount({
      type: 'bar',
      horizontal: true,
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 20], errorBars: { value: 5 } }] },
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    const vs = ctx.layout.xScale as { scale(v: number): number };
    const g = whiskerGeometry(ctx)[0]!;
    const markY = ctx.geom.pos[0]?.[0]?.y as number;
    expect(g.y1).toBe(markY);
    expect(g.y2).toBe(markY);
    expect(g.x1).toBe(vs.scale(5));
    expect(g.x2).toBe(vs.scale(15));
    expect(g.caps[0]).toEqual({ x1: vs.scale(5), y1: markY - 3, x2: vs.scale(5), y2: markY + 3 });
  });

  it('skips gaps and points without an interval', () => {
    const box = capture();
    mount({
      type: 'line',
      data: {
        categories: ['A', 'B', 'C'],
        series: [{ name: 'S', data: [{ y: 10, eLow: 8, eHigh: 12 }, { y: null }, { y: 30 }], errorBars: {} }],
      },
    });
    const bars = whiskerGeometry(box.ctx as unknown as DecoratorContext);
    expect(bars.map((b) => b.pi)).toEqual([0]);
  });

  it('draws the whiskers OVER the marks', () => {
    const box = capture();
    const { el } = mount(uniform);
    const ctx = box.ctx as unknown as DecoratorContext;
    const vs = ctx.layout.yScale as { scale(v: number): number };
    const markX = ctx.geom.pos[0]?.[0]?.x as number;
    const calls = ctxOf(el).__calls;
    // The line mark's markers are 4px arcs; the whisker stem comes after them.
    const lastMarker = calls.reduce((acc, c, i) => (c.method === 'arc' && c.args[2] === 4 ? i : acc), -1);
    expect(lastMarker).toBeGreaterThanOrEqual(0);
    const stem = segments(el).find(
      (g) => Math.abs(g.x1 - markX) < 1e-6 && Math.abs(g.y1 - vs.scale(5)) < 1e-6,
    );
    expect(stem).toBeDefined();
    expect(stem!.i).toBeGreaterThan(lastMarker);
    // The darkened whisker color is only ever set by the error-bar decorator.
    expect(ctxOf(el).__props.some((p) => p.prop === 'strokeStyle' && p.value === '#1d5496')).toBe(true);
  });
});

// ----------------------------------------------------------------- a11y table

describe('a11y table ± columns', () => {
  it('appends "± low" / "± high" columns per error-barred series', () => {
    const model = buildModel(resolveOptions(uniform), new Map());
    const cols = errorBarTableColumns(model, resolveOptions(uniform));
    expect(cols.map((c) => c.header)).toEqual(['S ± low', 'S ± high']);
    expect(cols[0]!.cells).toEqual(['5', '15', '25']);
    expect(cols[1]!.cells).toEqual(['15', '25', '35']);
  });

  it('extends an existing table spec without touching its rows', () => {
    const opts = resolveOptions(uniform);
    const model = buildModel(opts, new Map());
    const spec = withErrorBarColumns(
      { columns: ['Category', 'S'], rows: [{ header: 'A', cells: ['10'] }, { header: 'B', cells: ['20'] }, { header: 'C', cells: ['30'] }] },
      model,
      opts,
    );
    expect(spec.columns).toEqual(['Category', 'S', 'S ± low', 'S ± high']);
    expect(spec.rows[1]).toEqual({ header: 'B', cells: ['20', '15', '25'] });
  });

  it('shows the ± columns in the mounted table DOM', () => {
    const { el } = mount({ ...uniform, a11y: { table: 'visible' } });
    const heads = [...el.querySelectorAll('.chartcraft-a11y-table th[scope="col"]')].map((n) => n.textContent);
    expect(heads).toEqual(['Category', 'S', 'S ± low', 'S ± high']);
    const firstRow = [...(el.querySelectorAll('.chartcraft-a11y-table tbody tr')[0]?.querySelectorAll('td') ?? [])].map(
      (n) => n.textContent,
    );
    expect(firstRow).toEqual(['10', '5', '15']);
  });

  it('appends the columns exactly once per rebuilt table', () => {
    const { el, chart } = mount({ ...uniform, a11y: { table: 'visible' } });
    chart.update({ title: 'repaint' });
    pointerMove(el, 0, 0);
    const heads = [...el.querySelectorAll('.chartcraft-a11y-table th[scope="col"]')].map((n) => n.textContent);
    expect(heads).toEqual(['Category', 'S', 'S ± low', 'S ± high']);
  });

  it('leaves the table untouched when no series has error bars', () => {
    const { el } = mount({
      type: 'line',
      a11y: { table: 'visible' },
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2] }] },
    });
    const heads = [...el.querySelectorAll('.chartcraft-a11y-table th[scope="col"]')].map((n) => n.textContent);
    expect(heads).toEqual(['Category', 'S']);
  });
});

// -------------------------------------------------------------------- tooltip

describe('tooltip interval', () => {
  const points: TooltipPoint[] = [
    { seriesId: 'S', seriesName: 'S', color: '#000', x: 'A', y: 10, formattedX: 'A', formattedY: '10' },
  ];

  it('appends the interval to the formatted value', () => {
    const opts = resolveOptions(uniform);
    const model = buildModel(opts, new Map());
    expect(withErrorBarIntervals(points, model, opts)[0]!.formattedY).toBe('10 (5–15)');
  });

  it('passes series without error bars through untouched', () => {
    const plain: ChartOptions = { type: 'line', data: { categories: ['A'], series: [{ name: 'S', data: [10] }] } };
    const opts = resolveOptions(plain);
    const model = buildModel(opts, new Map());
    expect(withErrorBarIntervals(points, model, opts)[0]!.formattedY).toBe('10');
  });

  it('shows the interval in the live tooltip', () => {
    const box = capture();
    const { el } = mount(uniform);
    const ctx = box.ctx as unknown as DecoratorContext;
    const p = ctx.geom.pos[0]?.[1] as { x: number; y: number };
    pointerMove(el, p.x, p.y);
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).toBe('block');
    expect(tip.innerHTML).toContain('20 (15–25)');
  });
});

// -------------------------------------------------------------- reduced motion

describe('reduced motion', () => {
  it('draws whiskers on the first frame with animation on and reduced motion set', () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const box = capture();
    const { el } = mount({ ...uniform, animation: true });
    const ctx = box.ctx as unknown as DecoratorContext;
    const vs = ctx.layout.yScale as { scale(v: number): number };
    const bars = whiskerGeometry(ctx);
    expect(bars).toHaveLength(3);
    // No animation: the very first frame already carries final whisker geometry.
    expect(bars[0]!.y1).toBe(vs.scale(5));
    expect(canvasOf(el).getAttribute('role')).toBe('img');
  });
});
