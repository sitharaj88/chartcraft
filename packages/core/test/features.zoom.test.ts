/**
 * v0.3 feature 5 — zoom, pan & brush: the pure window math, the brush gesture,
 * pointer-anchored wheel zoom, pan clamping, minSpan, reset paths, event
 * payloads, the arrow-key conflict rule and downsampling inside the viewport.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LinearScale,
  clearDecorators,
  registerDecorator,
  type DecoratorContext,
  type DecoratorHost,
} from '../src/index';
import {
  KEY_PAN_FRACTION,
  MIN_BRUSH_PX,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
  brushDomain,
  brushRectFor,
  clampDomain,
  dropFullAxes,
  enforceMinSpan,
  panDomain,
  registerBuiltinDecorators,
  sameViewport,
  zoomDomain,
  zoomPayload,
} from '../src/features';
import { registerBuiltinChartTypes } from '../src/charts';
import type { ChartOptions, PointEvent, ZoomRange } from '../src/index';
import { canvasOf, cleanupDom, ctxOf, mount } from './helpers';
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

// --------------------------------------------------------------------- harness

interface Harness {
  el: HTMLElement;
  chart: ReturnType<typeof mount>['chart'];
  host: DecoratorHost;
  ctx(): DecoratorContext;
  xs(): { scale(v: number): number; invert(px: number): number; domain(): [number, number] };
  ys(): { scale(v: number): number; invert(px: number): number; domain(): [number, number] };
  events: ZoomRange[];
}

const data100: ChartOptions['data'] = {
  series: [
    {
      name: 'S',
      data: [
        [0, 0],
        [25, 10],
        [50, 5],
        [75, 20],
        [100, 1],
      ] as [number, number][],
    },
  ],
};

function setup(options: Partial<ChartOptions> = {}): Harness {
  const box: { ctx: DecoratorContext | null; host: DecoratorHost | null } = { ctx: null, host: null };
  registerDecorator({
    id: 'test:capture',
    layer: 'over',
    order: 1000,
    draw: (c) => (box.ctx = c),
    attach: (h) => {
      box.host = h;
    },
  });
  const { el, chart } = mount({ type: 'line', zoom: true, data: data100, ...options } as ChartOptions);
  const events: ZoomRange[] = [];
  chart.on('zoom', (ev) => events.push(ev));
  return {
    el,
    chart,
    host: box.host as unknown as DecoratorHost,
    ctx: () => box.ctx as unknown as DecoratorContext,
    xs: () => box.ctx?.layout.xScale as never,
    ys: () => box.ctx?.layout.yScale as never,
    events,
  };
}

function down(el: HTMLElement, x: number, y: number, init: MouseEventInit = {}): void {
  canvasOf(el).dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, ...init }));
}
function move(el: HTMLElement, x: number, y: number, init: MouseEventInit = {}): void {
  canvasOf(el).dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true, ...init }));
}
function up(el: HTMLElement, x: number, y: number): void {
  canvasOf(el).dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
}
function wheel(el: HTMLElement, x: number, y: number, deltaY: number, init: WheelEventInit = {}): void {
  canvasOf(el).dispatchEvent(
    new WheelEvent('wheel', { clientX: x, clientY: y, deltaY, bubbles: true, cancelable: true, ...init }),
  );
}
function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

// ------------------------------------------------------------------- pure math

describe('window math', () => {
  it('clampDomain shifts a window inside its bounds', () => {
    expect(clampDomain([-10, 10], [0, 100])).toEqual([0, 20]);
    expect(clampDomain([95, 115], [0, 100])).toEqual([80, 100]);
    expect(clampDomain([10, 20], [0, 100])).toEqual([10, 20]);
  });

  it('clampDomain collapses a window wider than its bounds', () => {
    expect(clampDomain([-50, 200], [0, 100])).toEqual([0, 100]);
  });

  it('enforceMinSpan grows a narrow window about the anchor', () => {
    expect(enforceMinSpan([49, 51], 10, 50)).toEqual([45, 55]);
    // Anchor at the window start keeps it at the start.
    expect(enforceMinSpan([49, 51], 10, 49)).toEqual([49, 59]);
    // Wide enough already: untouched.
    expect(enforceMinSpan([0, 50], 10, 25)).toEqual([0, 50]);
    expect(enforceMinSpan([0, 1], undefined)).toEqual([0, 1]);
  });

  it('enforceMinSpan stays inside bounds', () => {
    expect(enforceMinSpan([98, 99], 10, 98.5, [0, 100])).toEqual([90, 100]);
  });

  it('zoomDomain zooms about an anchor by the documented factors', () => {
    expect(ZOOM_IN_FACTOR).toBe(0.8);
    expect(ZOOM_OUT_FACTOR).toBe(1.25);
    expect(zoomDomain([0, 100], 25, ZOOM_IN_FACTOR)).toEqual([5, 85]);
    expect(zoomDomain([0, 100], 50, ZOOM_IN_FACTOR)).toEqual([10, 90]);
    expect(zoomDomain([10, 90], 50, ZOOM_OUT_FACTOR)).toEqual([0, 100]);
  });

  it('zoomDomain honors bounds and minSpan', () => {
    expect(zoomDomain([0, 100], 50, ZOOM_OUT_FACTOR, { bounds: [0, 100] })).toEqual([0, 100]);
    expect(zoomDomain([0, 100], 50, 0.01, { minSpan: 10 })).toEqual([45, 55]);
  });

  it('panDomain translates and clamps', () => {
    expect(panDomain([10, 20], 5)).toEqual([15, 25]);
    expect(panDomain([10, 20], 500, [0, 100])).toEqual([90, 100]);
    expect(panDomain([10, 20], -500, [0, 100])).toEqual([0, 10]);
  });

  it('brushDomain inverts a pixel range in either drag direction', () => {
    const s = new LinearScale([0, 100], [0, 500]);
    expect(brushDomain(s, 100, 200)).toEqual([20, 40]);
    expect(brushDomain(s, 200, 100)).toEqual([20, 40]);
    expect(brushDomain(s, 100, 100)).toBeNull();
    // [20, 22] is narrower than minSpan 20, so it grows about its center (21).
    expect(brushDomain(s, 100, 110, { minSpan: 20 })).toEqual([11, 31]);
  });

  it('dropFullAxes turns a fully zoomed-out axis into a reset', () => {
    const bounds = { x: [0, 100] as [number, number], y: [0, 20] as [number, number] };
    expect(dropFullAxes({ x: [0, 100] }, bounds)).toBeNull();
    expect(dropFullAxes({ x: [10, 90] }, bounds)).toEqual({ x: [10, 90] });
    expect(dropFullAxes({ x: [0, 100], y: [5, 10] }, bounds)).toEqual({ y: [5, 10] });
    expect(dropFullAxes(null, bounds)).toBeNull();
  });

  it('compares viewports and builds event payloads', () => {
    expect(sameViewport(null, null)).toBe(true);
    expect(sameViewport({ x: [0, 1] }, null)).toBe(false);
    expect(sameViewport({ x: [0, 1] }, { x: [0, 1] })).toBe(true);
    expect(sameViewport({ x: [0, 1] }, { x: [0, 1], y: [2, 3] })).toBe(false);
    expect(zoomPayload(null)).toBeNull();
    expect(zoomPayload({ x: [1, 2] })).toEqual({ x: [1, 2] });
  });
});

// ---------------------------------------------------------------------- brush

describe('brush', () => {
  it('paints a surface-tinted rectangle with a hairline edge during the drag', () => {
    const h = setup();
    const plot = h.ctx().plot;
    down(h.el, plot.x + 100, plot.y + 50);
    move(h.el, plot.x + 250, plot.y + 150);
    // axis: 'x' (default) -> the brush spans the full plot height.
    expect(brushRectFor(h.host)).toEqual({ x: plot.x + 100, y: plot.y, w: 150, h: plot.h });
    h.chart.resize(); // force a synchronous repaint
    const calls = ctxOf(h.el).__calls;
    expect(
      calls.some(
        (c) =>
          c.method === 'fillRect' &&
          c.args[0] === plot.x + 100 &&
          c.args[1] === plot.y &&
          c.args[2] === 150 &&
          c.args[3] === plot.h,
      ),
    ).toBe(true);
    expect(calls.some((c) => c.method === 'strokeRect' && c.args[2] === 150)).toBe(true);
  });

  it('zooms to the brushed window on release and emits one zoom event', () => {
    const h = setup();
    const plot = h.ctx().plot;
    const xs = h.xs();
    const expected: [number, number] = [xs.invert(plot.x + 100), xs.invert(plot.x + 250)];
    down(h.el, plot.x + 100, plot.y + 10);
    move(h.el, plot.x + 250, plot.y + 200);
    up(h.el, plot.x + 250, plot.y + 200);
    expect(h.host.getViewport()).toEqual({ x: expected });
    expect(h.events).toEqual([{ x: expected }]);
    // The window now spans the whole plot width, exactly.
    expect(h.xs().domain()).toEqual(expected);
    expect(h.xs().scale(expected[0])).toBeCloseTo(plot.x, 6);
    expect(brushRectFor(h.host)).toBeNull();
  });

  it('treats a drag shorter than the minimum as a click, not a zoom', () => {
    const h = setup();
    const plot = h.ctx().plot;
    down(h.el, plot.x + 100, plot.y + 10);
    move(h.el, plot.x + 100 + (MIN_BRUSH_PX - 1), plot.y + 20);
    up(h.el, plot.x + 100 + (MIN_BRUSH_PX - 1), plot.y + 20);
    expect(h.host.getViewport()).toBeNull();
    expect(h.events).toEqual([]);
  });

  it('enforces minSpan on the brushed window', () => {
    const h = setup({ zoom: { minSpan: 30 } });
    const plot = h.ctx().plot;
    const xs = h.xs();
    const center = (xs.invert(plot.x + 100) + xs.invert(plot.x + 110)) / 2;
    down(h.el, plot.x + 100, plot.y + 10);
    move(h.el, plot.x + 110, plot.y + 20);
    up(h.el, plot.x + 110, plot.y + 20);
    const vp = h.host.getViewport()!;
    expect(vp.x![1] - vp.x![0]).toBeCloseTo(30, 9);
    expect((vp.x![0] + vp.x![1]) / 2).toBeCloseTo(center, 9);
  });

  it('brushes the value axis only when axis is "y"', () => {
    const h = setup({ zoom: { axis: 'y' } });
    const plot = h.ctx().plot;
    const ys = h.ys();
    const expected: [number, number] = [ys.invert(plot.y + 150), ys.invert(plot.y + 50)];
    down(h.el, plot.x + 100, plot.y + 50);
    move(h.el, plot.x + 200, plot.y + 150);
    expect(brushRectFor(h.host)).toEqual({ x: plot.x, y: plot.y + 50, w: plot.w, h: 100 });
    up(h.el, plot.x + 200, plot.y + 150);
    expect(h.host.getViewport()).toEqual({ y: expected });
  });

  it('does nothing when drag is disabled', () => {
    const h = setup({ zoom: { drag: false } });
    const plot = h.ctx().plot;
    down(h.el, plot.x + 100, plot.y + 10);
    move(h.el, plot.x + 250, plot.y + 200);
    expect(brushRectFor(h.host)).toBeNull();
    up(h.el, plot.x + 250, plot.y + 200);
    expect(h.host.getViewport()).toBeNull();
  });

  it('ignores gestures that start outside the plot', () => {
    const h = setup();
    down(h.el, 1, 1);
    move(h.el, 200, 200);
    up(h.el, 200, 200);
    expect(h.host.getViewport()).toBeNull();
  });
});

// ----------------------------------------------------------------------- wheel

describe('ctrl/⌘+wheel zoom', () => {
  it('zooms about the pointer, keeping the anchored value under the cursor', () => {
    const h = setup();
    const plot = h.ctx().plot;
    const px = plot.x + 200;
    const anchor = h.xs().invert(px);
    const expected = zoomDomain([0, 100], anchor, ZOOM_IN_FACTOR, { bounds: [0, 100] });
    wheel(h.el, px, plot.y + 100, -100, { ctrlKey: true });
    expect(h.host.getViewport()!.x![0]).toBeCloseTo(expected[0], 9);
    expect(h.host.getViewport()!.x![1]).toBeCloseTo(expected[1], 9);
    // Anchoring: the same data value still sits under the pointer.
    expect(h.xs().scale(anchor)).toBeCloseTo(px, 6);
    expect(h.events).toHaveLength(1);
  });

  it('zooms out and resets once the window reaches the data bounds', () => {
    const h = setup();
    const plot = h.ctx().plot;
    wheel(h.el, plot.x + 200, plot.y + 100, -100, { metaKey: true });
    expect(h.host.getViewport()).not.toBeNull();
    wheel(h.el, plot.x + 200, plot.y + 100, 100, { metaKey: true });
    wheel(h.el, plot.x + 200, plot.y + 100, 100, { metaKey: true });
    expect(h.host.getViewport()).toBeNull();
    expect(h.events[h.events.length - 1]).toBeNull();
  });

  it('ignores a plain wheel (no ctrl/meta) and a disabled wheel option', () => {
    const h = setup();
    const plot = h.ctx().plot;
    wheel(h.el, plot.x + 200, plot.y + 100, -100);
    expect(h.host.getViewport()).toBeNull();

    const off = setup({ zoom: { wheel: false } });
    wheel(off.el, off.ctx().plot.x + 200, off.ctx().plot.y + 100, -100, { ctrlKey: true });
    expect(off.host.getViewport()).toBeNull();
  });
});

// ------------------------------------------------------------------------- pan

describe('pan', () => {
  it('drag pans once zoomed and emits one zoom event on release', () => {
    const h = setup();
    h.chart.zoomTo({ x: [20, 40] });
    h.events.length = 0;
    const plot = h.ctx().plot;
    const perPx = 20 / plot.w;
    down(h.el, plot.x + 200, plot.y + 100);
    move(h.el, plot.x + 150, plot.y + 100);
    // Dragging left moves the window right by exactly 50px worth of data.
    const vp = h.host.getViewport()!;
    expect(vp.x![0]).toBeCloseTo(20 + 50 * perPx, 9);
    expect(vp.x![1]).toBeCloseTo(40 + 50 * perPx, 9);
    expect(h.events).toEqual([]); // silent during the drag
    up(h.el, plot.x + 150, plot.y + 100);
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toEqual({ x: vp.x });
  });

  it('clamps a pan to the data bounds', () => {
    const h = setup();
    h.chart.zoomTo({ x: [20, 40] });
    const plot = h.ctx().plot;
    down(h.el, plot.x + 200, plot.y + 100);
    move(h.el, plot.x + 200 - 5000, plot.y + 100);
    up(h.el, plot.x + 200 - 5000, plot.y + 100);
    expect(h.host.getViewport()).toEqual({ x: [80, 100] });
  });

  it('Shift+drag brushes instead of panning while zoomed', () => {
    const h = setup();
    h.chart.zoomTo({ x: [0, 50] });
    const plot = h.ctx().plot;
    down(h.el, plot.x + 100, plot.y + 100, { shiftKey: true });
    move(h.el, plot.x + 200, plot.y + 100, { shiftKey: true });
    expect(brushRectFor(h.host)).not.toBeNull();
    up(h.el, plot.x + 200, plot.y + 100);
    const vp = h.host.getViewport()!;
    expect(vp.x![0]).toBeGreaterThan(0);
    expect(vp.x![1]).toBeLessThan(50);
  });

  it('does not pan when pan is disabled', () => {
    const h = setup({ zoom: { pan: false, drag: false } });
    h.chart.zoomTo({ x: [20, 40] });
    const plot = h.ctx().plot;
    down(h.el, plot.x + 200, plot.y + 100);
    move(h.el, plot.x + 100, plot.y + 100);
    up(h.el, plot.x + 100, plot.y + 100);
    expect(h.host.getViewport()).toEqual({ x: [20, 40] });
  });
});

// -------------------------------------------------------------------- resets

describe('resets', () => {
  it('double-click resets a zoomed chart and emits null', () => {
    const h = setup();
    h.chart.zoomTo({ x: [20, 40] });
    h.events.length = 0;
    canvasOf(h.el).dispatchEvent(new MouseEvent('dblclick', { clientX: 100, clientY: 100, bubbles: true }));
    expect(h.host.getViewport()).toBeNull();
    expect(h.events).toEqual([null]);
  });

  it('double-click on an unzoomed chart emits nothing', () => {
    const h = setup();
    canvasOf(h.el).dispatchEvent(new MouseEvent('dblclick', { clientX: 100, clientY: 100, bubbles: true }));
    expect(h.events).toEqual([]);
  });

  it('Escape resets a zoomed chart', () => {
    const h = setup();
    h.chart.zoomTo({ x: [20, 40] });
    h.events.length = 0;
    press(h.el, 'Escape');
    expect(h.host.getViewport()).toBeNull();
    expect(h.events).toEqual([null]);
  });

  it('Escape falls through to datum focus clearing when unzoomed', () => {
    const h = setup();
    const leaves: PointEvent[] = [];
    h.chart.on('pointleave', (ev) => leaves.push(ev));
    press(h.el, 'ArrowRight');
    press(h.el, 'Escape');
    expect(leaves).toHaveLength(1);
    expect(h.events).toEqual([]);
  });
});

// ------------------------------------------------------------------- keyboard

describe('keyboard', () => {
  it('+ and - zoom about the center of the window', () => {
    const h = setup();
    press(h.el, '+');
    expect(h.host.getViewport()).toEqual({ x: [10, 90] });
    press(h.el, '-');
    expect(h.host.getViewport()).toBeNull();
    expect(h.events).toEqual([{ x: [10, 90] }, null]);
  });

  it('accepts = and _ as the unshifted aliases', () => {
    const h = setup();
    press(h.el, '=');
    expect(h.host.getViewport()).toEqual({ x: [10, 90] });
    press(h.el, '_');
    expect(h.host.getViewport()).toBeNull();
  });

  it('plain arrows keep navigating points, never pan (a11y wins)', () => {
    const h = setup();
    h.chart.zoomTo({ x: [20, 60] });
    h.events.length = 0;
    const enters: PointEvent[] = [];
    h.chart.on('pointenter', (ev) => enters.push(ev));
    press(h.el, 'ArrowRight');
    expect(enters).toHaveLength(1);
    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
    expect(h.events).toEqual([]);
  });

  it('Shift+arrow pans when zoomed, without moving the datum focus', () => {
    const h = setup();
    h.chart.zoomTo({ x: [20, 60] });
    h.events.length = 0;
    const enters: PointEvent[] = [];
    h.chart.on('pointenter', (ev) => enters.push(ev));
    press(h.el, 'ArrowRight', { shiftKey: true });
    // One step = 10% of the visible span (40 units) = 4.
    expect(h.host.getViewport()).toEqual({ x: [24, 64] });
    expect(KEY_PAN_FRACTION).toBe(0.1);
    expect(enters).toEqual([]);
    press(h.el, 'ArrowLeft', { shiftKey: true });
    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
  });

  it('Shift+arrow does nothing when unzoomed or on an axis that is not zoomable', () => {
    const h = setup();
    press(h.el, 'ArrowRight', { shiftKey: true });
    expect(h.host.getViewport()).toBeNull();

    h.chart.zoomTo({ x: [20, 60] });
    h.events.length = 0;
    // axis defaults to 'x', so the vertical arrows are not claimed.
    press(h.el, 'ArrowUp', { shiftKey: true });
    expect(h.host.getViewport()).toEqual({ x: [20, 60] });
    expect(h.events).toEqual([]);
  });

  it('pans the value axis with Shift+Up/Down when axis is "xy"', () => {
    const h = setup({ zoom: { axis: 'xy' } });
    h.chart.zoomTo({ y: [5, 15] });
    h.events.length = 0;
    press(h.el, 'ArrowUp', { shiftKey: true });
    expect(h.host.getViewport()).toEqual({ y: [6, 16] });
  });
});

// ------------------------------------------------------- downsampling & window

describe('downsampling inside the viewport', () => {
  const many: ChartOptions = {
    type: 'line',
    zoom: true,
    data: {
      series: [
        {
          name: 'S',
          data: Array.from({ length: 100_000 }, (_, i) => [i, Math.sin(i / 1000) * 10] as [number, number]),
        },
      ],
    },
  };

  it('reveals real detail inside a brushed window at 100k points', () => {
    const h = setup(many);
    // Unzoomed: LTTB has reduced the series to the 5000-point threshold.
    const before = h.ctx().model.series[0]!.points.length;
    expect(before).toBeLessThanOrEqual(5000);
    expect(before).toBeGreaterThan(2000);

    const plot = h.ctx().plot;
    down(h.el, plot.x + 100, plot.y + 10);
    move(h.el, plot.x + 110, plot.y + 200);
    up(h.el, plot.x + 110, plot.y + 200);

    const vp = h.host.getViewport()!;
    const lo = Math.ceil(vp.x![0]);
    const hi = Math.floor(vp.x![1]);
    const pts = h.ctx().model.series[0]!.points;
    // Every in-window point, plus one padding point on each side, verbatim.
    expect(pts).toHaveLength(hi - lo + 3);
    expect(pts[0]!.xv).toBe(lo - 1);
    expect(pts[pts.length - 1]!.xv).toBe(hi + 1);
    expect(pts.every((p, i) => p.xv === lo - 1 + i)).toBe(true);
  });

  it('re-downsamples when the window is still above the threshold', () => {
    const h = setup(many);
    h.chart.zoomTo({ x: [0, 60_000] });
    const pts = h.ctx().model.series[0]!.points;
    expect(pts.length).toBeLessThanOrEqual(5000);
    expect(pts[pts.length - 1]!.xv).toBeLessThanOrEqual(60_001);
  });
});

// ------------------------------------------------------ lifecycle & a11y notes

describe('lifecycle', () => {
  it('removes every listener on destroy', () => {
    const h = setup();
    const plot = h.ctx().plot;
    const canvas = canvasOf(h.el);
    h.chart.destroy();
    h.events.length = 0;
    expect(() => {
      canvas.dispatchEvent(
        new WheelEvent('wheel', { clientX: plot.x + 200, clientY: plot.y + 100, deltaY: -100, ctrlKey: true, bubbles: true }),
      );
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: plot.x + 100, clientY: plot.y + 100, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: plot.x + 200, clientY: plot.y + 100, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: plot.x + 200, clientY: plot.y + 100, bubbles: true }));
    }).not.toThrow();
    expect(h.events).toEqual([]);
    expect(brushRectFor(h.host)).toBeNull();
  });

  it('does nothing at all when zoom is not enabled', () => {
    const h = setup({ zoom: false });
    const plot = h.ctx().plot;
    down(h.el, plot.x + 100, plot.y + 100);
    move(h.el, plot.x + 250, plot.y + 100);
    up(h.el, plot.x + 250, plot.y + 100);
    wheel(h.el, plot.x + 200, plot.y + 100, -100, { ctrlKey: true });
    press(h.el, '+');
    expect(h.host.getViewport()).toBeNull();
    expect(h.events).toEqual([]);
  });

  it('applies a zoom immediately under prefers-reduced-motion', () => {
    setMediaQuery('(prefers-reduced-motion: reduce)', true);
    const h = setup({ animation: true });
    const plot = h.ctx().plot;
    wheel(h.el, plot.x + 200, plot.y + 100, -100, { ctrlKey: true });
    // No transition: the viewport and the scales are already at their target.
    expect(h.host.getViewport()).not.toBeNull();
    expect(h.xs().domain()).toEqual(h.host.getViewport()!.x);
  });
});
