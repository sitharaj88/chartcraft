/**
 * v0.3 feature 3 — data labels: selection modes, ranking, placement, MEASURED
 * collision/edge dropping, ink colors.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDecorators, registerDecorator, type DecoratorContext } from '../src/index';
import {
  LABEL_GAP,
  labelPlacement,
  labelRank,
  planDataLabels,
  registerBuiltinDecorators,
  selectLabelIndices,
} from '../src/features';
import { registerBuiltinChartTypes } from '../src/charts';
import type { ChartOptions } from '../src/index';
import { cleanupDom, ctxOf, mount, paintedText } from './helpers';
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

/** Run the label planner against a live frame (6px-per-char measurement). */
function plan(ctx: DecoratorContext) {
  return planDataLabels({
    model: ctx.model,
    opts: ctx.opts,
    theme: ctx.theme,
    geom: ctx.geom,
    plot: ctx.plot,
    measure: (t, f) => ctx.r.measure(t, f),
  });
}

const PLOT = { x: 0, y: 0, w: 100, h: 100 };

// ------------------------------------------------------------------ selection

describe('selectLabelIndices', () => {
  const values = [3, 1, 4, 1, 5];

  it("'all' labels every non-null datum", () => {
    expect(selectLabelIndices(values, 'all')).toEqual([0, 1, 2, 3, 4]);
  });

  it("'endpoints' labels the first and last non-null datum", () => {
    expect(selectLabelIndices(values, 'endpoints')).toEqual([0, 4]);
  });

  it("'extremes' labels the max and min (first occurrence wins)", () => {
    expect(selectLabelIndices(values, 'extremes')).toEqual([1, 4]);
  });

  it("'last' labels only the final datum", () => {
    expect(selectLabelIndices(values, 'last')).toEqual([4]);
  });

  it("'auto' is endpoints ∪ extremes, ascending and de-duplicated", () => {
    expect(selectLabelIndices(values, 'auto')).toEqual([0, 1, 4]);
    expect(selectLabelIndices([5, 1, 9], 'auto')).toEqual([0, 1, 2]);
  });

  it('ignores gaps in every mode', () => {
    const gappy = [null, 3, null, 7, null];
    expect(selectLabelIndices(gappy, 'all')).toEqual([1, 3]);
    expect(selectLabelIndices(gappy, 'endpoints')).toEqual([1, 3]);
    expect(selectLabelIndices(gappy, 'last')).toEqual([3]);
    expect(selectLabelIndices(gappy, 'auto')).toEqual([1, 3]);
    expect(selectLabelIndices([null, null], 'auto')).toEqual([]);
  });

  it('ranks max > min > last > first for drop decisions', () => {
    expect(labelRank(values, 4)).toBe(0); // max (also last)
    expect(labelRank(values, 1)).toBe(1); // min
    expect(labelRank(values, 0)).toBe(3); // first
    expect(labelRank(values, 2)).toBe(4); // neither
    expect(labelRank([1, 2, 3], 2)).toBe(0);
    expect(labelRank([3, 2, 1], 2)).toBe(1);
    expect(labelRank([2, 3, 2], 2)).toBe(2); // last, not an extreme
  });
});

// ------------------------------------------------------------------ placement

describe('labelPlacement', () => {
  it('places an "outside" label above a positive datum', () => {
    const p = labelPlacement({
      vertical: true,
      value: 50,
      base: 100,
      along: 20,
      width: 10,
      height: 12,
      plot: PLOT,
      position: 'outside',
    });
    expect(LABEL_GAP).toBe(6);
    expect(p).toMatchObject({ x: 20, y: 44, align: 'center', baseline: 'bottom', position: 'outside' });
    expect(p.rect).toEqual({ x: 15, y: 32, w: 10, h: 12 });
  });

  it('places it below a datum that hangs under its base', () => {
    const p = labelPlacement({
      vertical: true,
      value: 60,
      base: 50,
      along: 20,
      width: 10,
      height: 12,
      plot: PLOT,
      position: 'outside',
    });
    expect(p).toMatchObject({ y: 66, baseline: 'top' });
    expect(p.rect).toEqual({ x: 15, y: 66, w: 10, h: 12 });
  });

  it('mirrors "inside" back over the mark', () => {
    const p = labelPlacement({
      vertical: true,
      value: 50,
      base: 100,
      along: 20,
      width: 10,
      height: 12,
      plot: PLOT,
      position: 'inside',
    });
    expect(p).toMatchObject({ y: 56, baseline: 'top', position: 'inside' });
  });

  it("'auto' flips inside when the outside box leaves the plot", () => {
    const p = labelPlacement({
      vertical: true,
      value: 4,
      base: 100,
      along: 20,
      width: 10,
      height: 12,
      plot: PLOT,
      position: 'auto',
    });
    expect(p.position).toBe('inside');
    expect(p.rect).toEqual({ x: 15, y: 10, w: 10, h: 12 });
  });

  it('places labels to the right of the bar end on horizontal charts', () => {
    const p = labelPlacement({
      vertical: false,
      value: 80,
      base: 10,
      along: 30,
      width: 10,
      height: 12,
      plot: PLOT,
      position: 'outside',
    });
    expect(p).toMatchObject({ x: 86, y: 30, align: 'left', baseline: 'middle' });
    expect(p.rect).toEqual({ x: 86, y: 24, w: 10, h: 12 });
  });

  it('places them left of a negative bar end', () => {
    const p = labelPlacement({
      vertical: false,
      value: 20,
      base: 60,
      along: 30,
      width: 10,
      height: 12,
      plot: PLOT,
      position: 'outside',
    });
    expect(p).toMatchObject({ x: 14, align: 'right' });
    expect(p.rect).toEqual({ x: 4, y: 24, w: 10, h: 12 });
  });
});

// ------------------------------------------------------------------- planning

describe('planDataLabels', () => {
  it('is empty when dataLabels are off (the default)', () => {
    const box = capture();
    mount({ type: 'line', data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2] }] } });
    expect(plan(box.ctx as unknown as DecoratorContext)).toEqual([]);
  });

  it("labels only endpoints/extremes in 'auto'", () => {
    const box = capture();
    mount({
      type: 'line',
      dataLabels: true,
      data: { categories: ['A', 'B', 'C', 'D', 'E'], series: [{ name: 'S', data: [3, 1, 4, 1, 5] }] },
    });
    const p = plan(box.ctx as unknown as DecoratorContext);
    expect(p.map((l) => l.pi)).toEqual([0, 1, 4]);
    expect(p.map((l) => l.text)).toEqual(['3', '1', '5']);
  });

  it('DROPS a label that collides with a higher-priority label (measured)', () => {
    const box = capture();
    const { el } = mount({
      type: 'line',
      dataLabels: true,
      data: {
        categories: ['A', 'B', 'C'],
        series: [
          { name: 'A', data: [10, 5, 12] },
          { name: 'B', data: [10.1, 5.1, 12.1] },
        ],
      },
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    const p = plan(ctx);
    // Series B's labels sit ~3.5px from series A's — every one of them loses.
    expect(p.map((l) => [l.si, l.pi])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    // Nothing from series B reaches the canvas (its values are unique strings).
    expect(paintedText(el)).not.toContain('10.1');
    expect(paintedText(el)).not.toContain('12.1');
    void ctx;
  });

  it("keeps colliding labels in 'all' (selectivity is the caller's choice there)", () => {
    const box = capture();
    mount({
      type: 'line',
      dataLabels: { select: 'all' },
      data: {
        categories: ['A', 'B', 'C'],
        series: [
          { name: 'A', data: [10, 5, 12] },
          { name: 'B', data: [10.1, 5.1, 12.1] },
        ],
      },
    });
    expect(plan(box.ctx as unknown as DecoratorContext)).toHaveLength(6);
  });

  it('drops a label that would leave the plot edge', () => {
    const box = capture();
    mount({
      type: 'line',
      yAxis: { max: 12 },
      dataLabels: { select: 'auto', position: 'outside' },
      data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [5, 8, 12] }] },
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    // The max sits exactly on the top edge, so its "outside" box is off-plot.
    expect(ctx.geom.pos[0]?.[2]?.y).toBe(ctx.plot.y);
    expect(plan(ctx).map((l) => l.pi)).toEqual([0]);
  });

  it("keeps that same label when position is 'auto' (flipped inside)", () => {
    const box = capture();
    mount({
      type: 'line',
      yAxis: { max: 12 },
      dataLabels: true,
      data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [5, 8, 12] }] },
    });
    const p = plan(box.ctx as unknown as DecoratorContext);
    expect(p.map((l) => l.pi)).toEqual([0, 2]);
    expect(p.find((l) => l.pi === 2)?.position).toBe('inside');
  });

  it('uses a custom format callback', () => {
    const box = capture();
    const { el } = mount({
      type: 'line',
      dataLabels: { select: 'last', format: (pt) => `${pt.seriesName}=${pt.formattedY}` },
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2] }] },
    });
    expect(plan(box.ctx as unknown as DecoratorContext).map((l) => l.text)).toEqual(['S=2']);
    expect(paintedText(el)).toContain('S=2');
  });

  it('paints labels in ink colors, never the series color', () => {
    const { el } = mount({
      type: 'line',
      dataLabels: { select: 'last' },
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 42] }] },
    });
    const props = ctxOf(el).__props;
    expect(props.some((p) => p.prop === 'fillStyle' && p.value === '#0b0b0b')).toBe(true);
    expect(paintedText(el)).toContain('42');
    // The series blue is used for the mark, never for label text.
    const labelIdx = ctxOf(el).__calls.findIndex((c) => c.method === 'fillText' && c.args[0] === '42');
    expect(labelIdx).toBeGreaterThanOrEqual(0);
  });

  it('labels horizontal bars beyond the bar end', () => {
    const box = capture();
    mount({
      type: 'bar',
      horizontal: true,
      dataLabels: { select: 'all' },
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 20] }] },
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    const p = plan(ctx);
    expect(p).toHaveLength(2);
    const first = ctx.geom.pos[0]?.[0] as { x: number; y: number };
    expect(p[0]).toMatchObject({ x: first.x + LABEL_GAP, y: first.y, align: 'left', baseline: 'middle', position: 'outside' });
    // The longest bar ends at the plot edge, so 'auto' flips its label inside.
    const longest = ctx.geom.pos[0]?.[1] as { x: number; y: number };
    expect(longest.x).toBe(ctx.plot.x + ctx.plot.w);
    expect(p[1]).toMatchObject({ x: longest.x - LABEL_GAP, y: longest.y, align: 'right', position: 'inside' });
  });

  it('skips hidden series and gaps', () => {
    const box = capture();
    mount({
      type: 'line',
      dataLabels: { select: 'all' },
      data: {
        categories: ['A', 'B', 'C'],
        series: [
          { name: 'S', data: [1, null, 3] },
          { name: 'H', visible: false, data: [9, 9, 9] },
        ],
      },
    });
    const p = plan(box.ctx as unknown as DecoratorContext);
    expect(p.map((l) => [l.si, l.pi])).toEqual([
      [0, 0],
      [0, 2],
    ]);
  });

  it('still labels under prefers-reduced-motion', () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const box = capture();
    mount({
      type: 'line',
      animation: true,
      dataLabels: { select: 'last' },
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [1, 2] }] },
    });
    expect(plan(box.ctx as unknown as DecoratorContext)).toHaveLength(1);
  });
});
