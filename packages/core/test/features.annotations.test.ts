/**
 * v0.3 feature 4 — annotations: the four kinds, geometry + clipping, band-under
 * / marks-over ordering, halo labels, click hit-testing (`annotationclick`) and
 * inclusion in the a11y description (but never the data table).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearDecorators, registerDecorator, type DecoratorContext } from '../src/index';
import {
  BAND_ALPHA,
  LINE_HIT,
  POINT_RADIUS,
  annotationAt,
  annotationAxisPx,
  annotationGeometries,
  annotationGeometry,
  annotationHit,
  axisIsScreenX,
  describeAnnotations,
  registerBuiltinDecorators,
} from '../src/features';
import { registerBuiltinChartTypes } from '../src/charts';
import type { Annotation, ChartOptions, PointEvent } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, mount, paintedText } from './helpers';
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

const series = [{ name: 'S', data: [[0, 0], [10, 10], [20, 5]] as [number, number][] }];

const all: Annotation[] = [
  { kind: 'line', axis: 'y', value: 5, label: 'Target' },
  { kind: 'band', axis: 'x', from: 5, to: 15, label: 'Peak' },
  { kind: 'point', x: 10, y: 10, label: 'Max' },
  { kind: 'text', x: 0, y: 0, text: 'start' },
];

function mountWith(annotations: Annotation[], extra: Partial<ChartOptions> = {}) {
  const box = capture();
  const m = mount({ type: 'line', data: { series }, annotations, ...extra } as ChartOptions);
  return { ...m, ctx: box.ctx as unknown as DecoratorContext };
}

function scales(ctx: DecoratorContext) {
  return {
    x: ctx.layout.xScale as { scale(v: number): number },
    y: ctx.layout.yScale as { scale(v: number): number },
  };
}

// ------------------------------------------------------------------- geometry

describe('annotation geometry', () => {
  it('maps a value-axis line across the full plot width', () => {
    const { ctx } = mountWith([all[0] as Annotation]);
    const s = scales(ctx);
    const g = annotationGeometry(ctx, all[0] as Annotation, 0);
    expect(g).toEqual({
      kind: 'line',
      index: 0,
      annotation: all[0],
      x1: ctx.plot.x,
      y1: s.y.scale(5),
      x2: ctx.plot.x + ctx.plot.w,
      y2: s.y.scale(5),
    });
  });

  it('maps a data-axis line down the full plot height', () => {
    const a: Annotation = { kind: 'line', axis: 'x', value: 10 };
    const { ctx } = mountWith([a]);
    const s = scales(ctx);
    expect(annotationGeometry(ctx, a, 0)).toMatchObject({
      x1: s.x.scale(10),
      y1: ctx.plot.y,
      x2: s.x.scale(10),
      y2: ctx.plot.y + ctx.plot.h,
    });
  });

  it('clips (drops) a line outside the visible domain', () => {
    const a: Annotation = { kind: 'line', axis: 'x', value: 999 };
    const { ctx } = mountWith([a]);
    expect(annotationGeometry(ctx, a, 0)).toBeNull();
    expect(annotationGeometry(ctx, { kind: 'line', axis: 'y', value: -50 }, 0)).toBeNull();
  });

  it('maps a data-axis band to a full-height rect', () => {
    const { ctx } = mountWith([all[1] as Annotation]);
    const s = scales(ctx);
    expect(annotationGeometry(ctx, all[1] as Annotation, 1)).toMatchObject({
      kind: 'band',
      rect: { x: s.x.scale(5), y: ctx.plot.y, w: s.x.scale(15) - s.x.scale(5), h: ctx.plot.h },
    });
  });

  it('maps a value-axis band to a full-width rect', () => {
    const a: Annotation = { kind: 'band', axis: 'y', from: 2, to: 4 };
    const { ctx } = mountWith([a]);
    const s = scales(ctx);
    expect(annotationGeometry(ctx, a, 0)).toMatchObject({
      rect: { x: ctx.plot.x, y: s.y.scale(4), w: ctx.plot.w, h: s.y.scale(2) - s.y.scale(4) },
    });
  });

  it('CLAMPS a band that only partly overlaps the plot, and drops one that misses', () => {
    const partial: Annotation = { kind: 'band', axis: 'x', from: -100, to: 5 };
    const { ctx } = mountWith([partial]);
    const s = scales(ctx);
    expect(annotationGeometry(ctx, partial, 0)).toMatchObject({
      rect: { x: ctx.plot.x, y: ctx.plot.y, w: s.x.scale(5) - ctx.plot.x, h: ctx.plot.h },
    });
    expect(annotationGeometry(ctx, { kind: 'band', axis: 'x', from: 100, to: 200 }, 0)).toBeNull();
  });

  it('places point and text annotations on both axes and clips out-of-plot ones', () => {
    const { ctx } = mountWith(all);
    const s = scales(ctx);
    expect(annotationGeometry(ctx, all[2] as Annotation, 2)).toMatchObject({
      kind: 'point',
      cx: s.x.scale(10),
      cy: s.y.scale(10),
    });
    expect(annotationGeometry(ctx, all[3] as Annotation, 3)).toMatchObject({
      kind: 'text',
      x: ctx.plot.x,
      y: ctx.plot.y + ctx.plot.h,
    });
    expect(annotationGeometry(ctx, { kind: 'point', x: 999, y: 1, label: 'off' }, 0)).toBeNull();
    expect(annotationGeometry(ctx, { kind: 'text', x: 1, y: 999, text: 'off' }, 0)).toBeNull();
  });

  it('addresses band (category) axes by category value or index', () => {
    const box = capture();
    mount({
      type: 'bar',
      data: { categories: ['A', 'B', 'C'], series: [{ name: 'S', data: [1, 2, 3] }] },
      annotations: [{ kind: 'point', x: 'B', y: 2, label: 'mid' }],
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    const band = ctx.layout.xScale as { center(i: number): number };
    expect(annotationAxisPx(ctx, 'x', 'B')).toBe(band.center(1));
    expect(annotationAxisPx(ctx, 'x', 1)).toBe(band.center(1));
    expect(annotationAxisPx(ctx, 'x', 'Zzz')).toBeNull();
    expect(annotationAxisPx(ctx, 'x', 99)).toBeNull();
  });

  it('keeps axis semantics on horizontal charts (x = data axis, y = value axis)', () => {
    const box = capture();
    mount({
      type: 'bar',
      horizontal: true,
      data: { categories: ['A', 'B'], series: [{ name: 'S', data: [10, 20] }] },
      annotations: [{ kind: 'line', axis: 'y', value: 15 }],
    });
    const ctx = box.ctx as unknown as DecoratorContext;
    const vs = ctx.layout.xScale as { scale(v: number): number };
    expect(axisIsScreenX(ctx.model, 'y')).toBe(true);
    expect(annotationGeometry(ctx, { kind: 'line', axis: 'y', value: 15 }, 0)).toMatchObject({
      x1: vs.scale(15),
      y1: ctx.plot.y,
      x2: vs.scale(15),
      y2: ctx.plot.y + ctx.plot.h,
    });
  });

  it('collects every placeable annotation in order', () => {
    const { ctx } = mountWith([...all, { kind: 'line', axis: 'x', value: 999 }]);
    expect(annotationGeometries(ctx).map((g) => [g.index, g.kind])).toEqual([
      [0, 'line'],
      [1, 'band'],
      [2, 'point'],
      [3, 'text'],
    ]);
  });
});

// -------------------------------------------------------------------- drawing

describe('annotation drawing', () => {
  it('paints bands UNDER the marks and lines/points/text OVER them', () => {
    const { el, ctx } = mountWith(all);
    const s = scales(ctx);
    const calls = ctxOf(el).__calls;
    const bandX = s.x.scale(5);
    const bandFill = calls.findIndex((c) => c.method === 'fillRect' && Math.abs((c.args[0] as number) - bandX) < 1e-6);
    const firstMarker = calls.findIndex((c) => c.method === 'arc' && c.args[2] === 4);
    const annotationDot = calls.findIndex((c) => c.method === 'arc' && c.args[2] === POINT_RADIUS);
    expect(bandFill).toBeGreaterThanOrEqual(0);
    expect(firstMarker).toBeGreaterThan(bandFill);
    expect(annotationDot).toBeGreaterThan(firstMarker);
  });

  it('paints band fills at the documented alpha', () => {
    const { el } = mountWith([all[1] as Annotation]);
    expect(ctxOf(el).__props.some((p) => p.prop === 'globalAlpha' && p.value === BAND_ALPHA)).toBe(true);
  });

  it('labels in textSecondary over a surface halo', () => {
    const { el } = mountWith(all);
    const texts = paintedText(el);
    expect(texts).toContain('Target');
    expect(texts).toContain('Peak');
    expect(texts).toContain('Max');
    expect(texts).toContain('start');
    const props = ctxOf(el).__props;
    expect(props.some((p) => p.prop === 'fillStyle' && p.value === '#fcfcfb')).toBe(true); // halo
    expect(props.some((p) => p.prop === 'fillStyle' && p.value === '#52514e')).toBe(true); // label ink
  });

  it('still draws under prefers-reduced-motion', () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const { el } = mountWith(all, { animation: true });
    expect(paintedText(el)).toContain('Target');
  });
});

// ------------------------------------------------------------------- clicking

describe('annotationclick', () => {
  const clickable: Annotation[] = [
    { kind: 'line', axis: 'y', value: 5, label: 'Target' },
    { kind: 'band', axis: 'x', from: 5, to: 15, label: 'Peak' },
  ];

  function click(el: HTMLElement, x: number, y: number): void {
    canvasOf(el).dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
  }

  it('emits {index, annotation} for a reference line and consumes the click', () => {
    const { el, chart, ctx } = mountWith(clickable);
    const s = scales(ctx);
    const seen: unknown[] = [];
    const points: PointEvent[] = [];
    chart.on('annotationclick', (ev) => seen.push(ev));
    chart.on('pointclick', (ev) => points.push(ev));
    click(el, ctx.plot.x + 30, s.y.scale(5));
    expect(seen).toEqual([{ index: 0, annotation: clickable[0] }]);
    expect(points).toEqual([]);
  });

  it('emits for a band interior', () => {
    const { el, chart, ctx } = mountWith(clickable);
    const s = scales(ctx);
    const seen: { index: number }[] = [];
    chart.on('annotationclick', (ev) => seen.push(ev));
    click(el, s.x.scale(6), ctx.plot.y + 20);
    expect(seen).toEqual([{ index: 1, annotation: clickable[1] }]);
  });

  it('prefers marks over bands where they overlap', () => {
    const { el, chart, ctx } = mountWith(clickable);
    const s = scales(ctx);
    const seen: { index: number }[] = [];
    chart.on('annotationclick', (ev) => seen.push(ev));
    click(el, s.x.scale(10), s.y.scale(5));
    expect(seen.map((e) => e.index)).toEqual([0]);
  });

  it('leaves datum clicks alone when no annotation is hit', () => {
    const { el, chart, ctx } = mountWith(clickable);
    const seen: unknown[] = [];
    const points: PointEvent[] = [];
    chart.on('annotationclick', (ev) => seen.push(ev));
    chart.on('pointclick', (ev) => points.push(ev));
    const first = ctx.geom.pos[0]?.[0] as { x: number; y: number };
    click(el, first.x, first.y);
    expect(seen).toEqual([]);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ dataIndex: 0, x: 0, y: 0 });
  });

  it('hit-tests within the documented tolerances', () => {
    const { ctx } = mountWith(all);
    const s = scales(ctx);
    const line = annotationGeometry(ctx, all[0] as Annotation, 0)!;
    expect(annotationHit(ctx, line, ctx.plot.x + 10, s.y.scale(5) + LINE_HIT)).toBe(true);
    expect(annotationHit(ctx, line, ctx.plot.x + 10, s.y.scale(5) + LINE_HIT + 1)).toBe(false);
    const point = annotationGeometry(ctx, all[2] as Annotation, 2)!;
    expect(annotationHit(ctx, point, s.x.scale(10) + 8, s.y.scale(10))).toBe(true);
    expect(annotationHit(ctx, point, s.x.scale(10) + 9, s.y.scale(10))).toBe(false);
    const text = annotationGeometry(ctx, all[3] as Annotation, 3)!;
    // 'start' is 5 chars = 30px wide, centered on the anchor.
    expect(annotationHit(ctx, text, ctx.plot.x + 14, ctx.plot.y + ctx.plot.h)).toBe(true);
    expect(annotationHit(ctx, text, ctx.plot.x + 40, ctx.plot.y + ctx.plot.h)).toBe(false);
    expect(annotationAt(ctx, 0, 0)).toBeNull();
  });
});

// ------------------------------------------------------------- a11y integration

describe('a11y', () => {
  it('describes the annotations deterministically', () => {
    expect(describeAnnotations(all)).toBe(
      '4 annotations: reference line at y 5 labeled Target; ' +
        'band on x from 5 to 15 labeled Peak; point at 10, 10 labeled Max; ' +
        'text "start" at 0, 0.',
    );
    expect(describeAnnotations([])).toBe('');
    expect(describeAnnotations([{ kind: 'line', axis: 'x', value: 3 }])).toBe(
      '1 annotation: reference line at x 3.',
    );
  });

  it('adds the description to the canvas via aria-describedby', () => {
    const { el } = mountWith(all);
    const canvas = canvasOf(el);
    const ids = (canvas.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids).toHaveLength(1);
    const desc = el.querySelector(`#${ids[0]}`) as HTMLElement;
    expect(desc.textContent).toBe(describeAnnotations(all));
    expect(desc.style.clipPath).toBe('inset(50%)');
  });

  it('keeps a caller-supplied description as well', () => {
    const { el } = mountWith(all, { a11y: { description: 'Quarterly revenue.' } });
    const ids = (canvasOf(el).getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    // ONE node, ONE token: the pipeline's `a11yDescription` seam concatenates
    // the caller's text and every decorator's, instead of each feature adding
    // its own hidden node and its own aria-describedby token.
    expect(ids).toHaveLength(1);
    const text = el.querySelector(`#${ids[0]}`)?.textContent ?? '';
    expect(text).toBe(`Quarterly revenue. ${describeAnnotations(all)}`);
  });

  it('does NOT add annotations to the data table', () => {
    const { el } = mountWith(all, { a11y: { table: 'visible' } });
    const rows = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')];
    expect(rows).toHaveLength(3);
    const cells = rows.flatMap((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent));
    expect(cells).not.toContain('Target');
    expect(cells).not.toContain('Peak');
  });

  it('removes the description when annotations go away', () => {
    const { el, chart } = mountWith(all);
    const canvas = canvasOf(el);
    const id = canvas.getAttribute('aria-describedby');
    expect(id).not.toBeNull();
    expect(el.querySelector(`#${id}`)?.textContent).toBe(describeAnnotations(all));
    chart.update({ annotations: [] });
    // Nothing left to describe: the shared node and the attribute both go.
    expect(canvas.getAttribute('aria-describedby')).toBeNull();
    expect(el.querySelector(`#${id}`)).toBeNull();
  });
});
