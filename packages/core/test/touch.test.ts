/**
 * v0.3.3 — TOUCH interaction.
 *
 * The bug this file guards: on a real phone, and in DevTools device emulation,
 * no chart of any type responded to a finger. Three independent causes —
 * `touch-action` was never set (so the UA cancelled the gesture), there was no
 * `pointerdown` handler (so a tap, which produces no `pointermove`, set no
 * hover), and there was no `pointercancel` handler (so a cancelled gesture left
 * stale state).
 *
 * Every test here dispatches events with a real `pointerType`. The mouse path
 * is asserted to be UNCHANGED at the bottom of the file; the other 1,942 tests
 * are the rest of that guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canvasOf,
  cleanupDom,
  markerCenters,
  mount,
  pointer,
  pointerMove,
  tap,
  tapOutside,
  touchEnd,
  touchMove,
  touchStart,
  tooltipEl,
  tooltipVisible,
} from './helpers';
import { StubPointerEvent, capturedBy, resetMediaQueries, setMediaQuery } from './setup';
import { registerBuiltinChartTypes } from '../src/charts';
import { registerBuiltinDecorators } from '../src/features';
import { COARSE_HIT_RADIUS, HIT_RADIUS } from '../src/interaction/hittest';
import type { ChartOptions, PointEvent, ZoomRange } from '../src/index';

registerBuiltinChartTypes();
registerBuiltinDecorators();

afterEach(() => {
  cleanupDom();
  resetMediaQueries();
});

const data = {
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'North', data: [10, 20, 30] },
    { name: 'South', data: [5, 15, 25] },
  ],
};

// --------------------------------------------------------------- tap to inspect

describe('tap to inspect', () => {
  it('a tap sets hover, emits pointenter and shows the tooltip at the touch point', () => {
    const { el, chart } = mount({ type: 'line', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const m = markerCenters(el)[0]!;

    tap(el, m.x, m.y);

    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ seriesName: 'North', x: 'Q1', y: 10 });
    expect(tooltipVisible(el)).toBe(true);
    expect(tooltipEl(el)!.innerHTML).toContain('Q1');
  });

  it('a pen tap inspects too', () => {
    const { el, chart } = mount({ type: 'line', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const m = markerCenters(el)[0]!;
    tap(el, m.x, m.y, { pointerType: 'pen' });
    expect(enters).toHaveLength(1);
    expect(tooltipVisible(el)).toBe(true);
  });

  it('a tap still emits pointclick (the compatibility click is unaffected)', () => {
    const { el, chart } = mount({ type: 'line', data });
    const clicks = vi.fn();
    chart.on('pointclick', clicks);
    const m = markerCenters(el)[1]!;
    tap(el, m.x, m.y);
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('the tooltip is placed ABOVE the contact point, where the finger is not', () => {
    const { el } = mount({ type: 'line', data });
    const m = markerCenters(el)[0]!;
    tap(el, m.x, m.y);
    const top = parseFloat(tooltipEl(el)!.style.top);
    // Above the touch (mouse places it 12px BELOW the cursor).
    expect(top).toBeLessThan(m.y);
  });

  it('a tap that hits nothing shows nothing', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const enters = vi.fn();
    chart.on('pointenter', enters);
    tap(el, 5, 5);
    expect(enters).not.toHaveBeenCalled();
    expect(tooltipVisible(el)).toBe(false);
  });

  it('a second finger does not steal the inspection', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const [a, b] = markerCenters(el);
    touchStart(el, a!.x, a!.y, { pointerId: 1 });
    // A different pointer id, on another datum: ignored while the first is down.
    touchMove(el, b!.x, b!.y, { pointerId: 2 });
    expect(enters).toHaveLength(1);
    expect(enters[0]!.x).toBe('Q1');
  });
});

// -------------------------------------------------------------------- scrubbing

describe('drag to scrub', () => {
  it('moving the finger while it is down tracks the tooltip along the line', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const centers = markerCenters(el);
    const a = centers[0]!;
    const b = centers[1]!;

    touchStart(el, a.x, a.y);
    expect(tooltipEl(el)!.innerHTML).toContain('Q1');

    touchMove(el, b.x, b.y);
    expect(tooltipEl(el)!.innerHTML).toContain('Q2');
    expect(enters.map((e) => e.x)).toEqual(['Q1', 'Q2']);
  });

  it('captures the pointer so the gesture is not lost off-canvas', () => {
    const { el } = mount({ type: 'line', data });
    const m = markerCenters(el)[0]!;
    touchStart(el, m.x, m.y, { pointerId: 42 });
    expect(capturedBy(canvasOf(el))).toContain(42);
    touchEnd(el, m.x, m.y, { pointerId: 42 });
    expect(capturedBy(canvasOf(el))).not.toContain(42);
  });
});

// ------------------------------------------------------------------- dismissal

describe('dismissal', () => {
  it('the tooltip SURVIVES the finger lifting (pointerleave fires immediately on touch)', () => {
    const { el } = mount({ type: 'line', data });
    const m = markerCenters(el)[0]!;
    touchStart(el, m.x, m.y);
    touchEnd(el, m.x, m.y); // dispatches pointerup AND pointerleave
    expect(tooltipVisible(el)).toBe(true);
  });

  it('a tap outside the chart dismisses it and emits pointleave', () => {
    const { el, chart } = mount({ type: 'line', data });
    const leaves: PointEvent[] = [];
    chart.on('pointleave', (e) => leaves.push(e));
    const m = markerCenters(el)[0]!;
    tap(el, m.x, m.y);
    expect(tooltipVisible(el)).toBe(true);

    tapOutside(el);
    expect(tooltipVisible(el)).toBe(false);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.seriesName).toBe('North');
  });

  it('a scroll dismisses it', () => {
    const { el } = mount({ type: 'line', data });
    const m = markerCenters(el)[0]!;
    tap(el, m.x, m.y);
    document.dispatchEvent(new Event('scroll'));
    expect(tooltipVisible(el)).toBe(false);
  });

  it('the next tap INSIDE the chart replaces the inspection rather than dismissing it', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const centers = markerCenters(el);
    tap(el, centers[0]!.x, centers[0]!.y);
    tap(el, centers[1]!.x, centers[1]!.y);
    expect(tooltipVisible(el)).toBe(true);
    expect(enters.map((e) => e.x)).toEqual(['Q1', 'Q2']);
  });

  it('pointercancel clears hover and tooltip state', () => {
    const { el, chart } = mount({ type: 'line', data });
    const leaves: PointEvent[] = [];
    chart.on('pointleave', (e) => leaves.push(e));
    const m = markerCenters(el)[0]!;
    touchStart(el, m.x, m.y);
    expect(tooltipVisible(el)).toBe(true);

    pointer(el, 'pointercancel', m.x, m.y);
    expect(tooltipVisible(el)).toBe(false);
    expect(leaves).toHaveLength(1);
    // And the dismissal listeners were dropped with it: a later outside tap is
    // a no-op rather than a second pointleave.
    tapOutside(el);
    expect(leaves).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ touch-action

describe('touch-action policy', () => {
  it('defaults to pan-y so the page can still be scrolled over a chart', () => {
    const { el } = mount({ type: 'line', data });
    expect(canvasOf(el).style.touchAction).toBe('pan-y');
  });

  it('stays pan-y for x-axis zoom (a horizontal brush and a vertical scroll coexist)', () => {
    const { el } = mount({ type: 'line', data, zoom: true });
    expect(canvasOf(el).style.touchAction).toBe('pan-y');
  });

  it('escalates to none when zoom needs the vertical axis', () => {
    const { el } = mount({ type: 'line', data, zoom: { enabled: true, axis: 'y' } });
    expect(canvasOf(el).style.touchAction).toBe('none');
    const xy = mount({ type: 'line', data, zoom: { enabled: true, axis: 'xy' } });
    expect(canvasOf(xy.el).style.touchAction).toBe('none');
  });

  it('does not escalate when the vertical axis has no drag gesture', () => {
    const { el } = mount({
      type: 'line',
      data,
      zoom: { enabled: true, axis: 'xy', drag: false, pan: false },
    });
    expect(canvasOf(el).style.touchAction).toBe('pan-y');
  });

  it('recomputes when options change', () => {
    const { el, chart } = mount({ type: 'line', data });
    expect(canvasOf(el).style.touchAction).toBe('pan-y');
    chart.update({ zoom: { enabled: true, axis: 'xy' } });
    expect(canvasOf(el).style.touchAction).toBe('none');
    chart.update({ zoom: { enabled: false } });
    expect(canvasOf(el).style.touchAction).toBe('pan-y');
  });

  it('locks both axes only WHILE a brush drag is in progress', () => {
    const numeric: ChartOptions['data'] = {
      series: [{ name: 'S', data: [[0, 0], [25, 10], [50, 5], [75, 20], [100, 1]] as [number, number][] }],
    };
    const { el } = mount({ type: 'line', data: numeric, zoom: true });
    const canvas = canvasOf(el);
    expect(canvas.style.touchAction).toBe('pan-y');

    touchStart(el, 200, 200);
    expect(canvas.style.touchAction).toBe('none');
    touchMove(el, 320, 210);
    expect(canvas.style.touchAction).toBe('none');
    touchEnd(el, 320, 210);
    expect(canvas.style.touchAction).toBe('pan-y');
  });
});

// ------------------------------------------------------------------ zoom gestures

describe('zoom gestures under touch', () => {
  const numeric: ChartOptions['data'] = {
    series: [{ name: 'S', data: [[0, 0], [25, 10], [50, 5], [75, 20], [100, 1]] as [number, number][] }],
  };

  it('a finger brush zooms', () => {
    const { el, chart } = mount({ type: 'line', data: numeric, zoom: true });
    const events: ZoomRange[] = [];
    chart.on('zoom', (e) => events.push(e));

    touchStart(el, 200, 200);
    touchMove(el, 350, 220);
    touchEnd(el, 350, 220);

    expect(events).toHaveLength(1);
    expect(events[0]!.x).toBeDefined();
  });

  it('a finger pans once zoomed', () => {
    const { el, chart } = mount({ type: 'line', data: numeric, zoom: true });
    chart.zoomTo({ x: [20, 60] });
    const events: ZoomRange[] = [];
    chart.on('zoom', (e) => events.push(e));

    touchStart(el, 300, 200);
    touchMove(el, 200, 200);
    touchEnd(el, 200, 200);

    expect(events).toHaveLength(1);
    // Dragging left moves the window to higher x values.
    expect(events[0]!.x![0]).toBeGreaterThan(20);
  });

  it('a cancelled brush does NOT zoom', () => {
    const { el, chart } = mount({ type: 'line', data: numeric, zoom: true });
    const events: ZoomRange[] = [];
    chart.on('zoom', (e) => events.push(e));

    touchStart(el, 200, 200);
    touchMove(el, 350, 220);
    document.dispatchEvent(new StubPointerEvent('pointercancel', { pointerType: 'touch', pointerId: 7, bubbles: true }));

    expect(events).toHaveLength(0);
    expect(canvasOf(el).style.touchAction).toBe('pan-y');
  });
});

// -------------------------------------------------------------- coarse hit target

describe('coarse hit targets', () => {
  it('a fingertip gets a 44px radius where a cursor gets 24px', () => {
    expect(HIT_RADIUS).toBe(24);
    expect(COARSE_HIT_RADIUS).toBe(44);

    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const m = markerCenters(el)[0]!;
    // 34px away: outside the mouse target, inside the finger target.
    const off = 34;

    pointerMove(el, m.x, m.y - off);
    expect(enters).toHaveLength(0);

    touchStart(el, m.x, m.y - off);
    expect(enters).toHaveLength(1);
  });

  it('a stylus keeps mouse precision (pen is a FINE pointer)', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    const m = markerCenters(el)[0]!;
    touchStart(el, m.x, m.y - 34, { pointerType: 'pen' });
    expect(enters).toHaveLength(0);
    touchStart(el, m.x, m.y, { pointerType: 'pen' });
    expect(enters).toHaveLength(1);
  });

  it('a click carries no pointerType, so the device media query decides', () => {
    setMediaQuery('(pointer: coarse)', true);
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const clicks: PointEvent[] = [];
    chart.on('pointclick', (e) => clicks.push(e));
    const m = markerCenters(el)[0]!;
    canvasOf(el).dispatchEvent(new MouseEvent('click', { clientX: m.x, clientY: m.y - 34, bubbles: true }));
    expect(clicks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------- legend

describe('legend tap targets', () => {
  beforeEach(() => resetMediaQueries());

  it('grow to 44px on a coarse pointer and stay compact on a fine one', () => {
    const fine = mount({ type: 'line', data });
    const fineItem = fine.el.querySelector<HTMLElement>('.chartcraft-legend-item')!;
    expect(fineItem.style.minHeight).toBe('');
    expect(fineItem.style.padding).toBe('2px 4px');
    // `touch-action: manipulation` removes the double-tap zoom delay for both.
    expect(fineItem.style.touchAction).toBe('manipulation');
    cleanupDom();

    setMediaQuery('(pointer: coarse)', true);
    const coarse = mount({ type: 'line', data });
    const coarseItem = coarse.el.querySelector<HTMLElement>('.chartcraft-legend-item')!;
    expect(coarseItem.style.minHeight).toBe('44px');
  });

  it('a legend tap still toggles the series', () => {
    setMediaQuery('(pointer: coarse)', true);
    const { el, chart } = mount({ type: 'line', data });
    const toggles = vi.fn();
    chart.on('legendtoggle', toggles);
    const item = el.querySelector<HTMLElement>('.chartcraft-legend-item')!;
    item.dispatchEvent(new StubPointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggles).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------------- teardown

describe('destroy', () => {
  it('removes every listener it added, including the document-level ones', () => {
    type Pair = [string, unknown];
    const docAdded: Pair[] = [];
    const docRemoved: Pair[] = [];
    const canvasAdded: Pair[] = [];
    const canvasRemoved: Pair[] = [];

    const docAdd = vi.spyOn(document, 'addEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');
    const canvasAdd = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
    const canvasRemove = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener');
    docAdd.mockImplementation(function (this: Document, ...a: unknown[]) {
      docAdded.push([a[0] as string, a[1]]);
      return Document.prototype.addEventListener.apply(this, a as never);
    } as never);
    docRemove.mockImplementation(function (this: Document, ...a: unknown[]) {
      docRemoved.push([a[0] as string, a[1]]);
      return Document.prototype.removeEventListener.apply(this, a as never);
    } as never);
    canvasAdd.mockImplementation(function (this: HTMLCanvasElement, ...a: unknown[]) {
      canvasAdded.push([a[0] as string, a[1]]);
      return HTMLElement.prototype.addEventListener.apply(this, a as never);
    } as never);
    canvasRemove.mockImplementation(function (this: HTMLCanvasElement, ...a: unknown[]) {
      canvasRemoved.push([a[0] as string, a[1]]);
      return HTMLElement.prototype.removeEventListener.apply(this, a as never);
    } as never);

    try {
      const { el, chart } = mount({ type: 'line', data, zoom: true });
      const m = markerCenters(el)[0]!;
      // Arm the document-level touch dismissal.
      tap(el, m.x, m.y);
      expect(docAdded.some(([t]) => t === 'pointerdown')).toBe(true);
      expect(docAdded.some(([t]) => t === 'scroll')).toBe(true);

      chart.destroy();

      const unmatched = (added: Pair[], removed: Pair[]): Pair[] =>
        added.filter(([t, fn]) => !removed.some(([rt, rfn]) => rt === t && rfn === fn));
      expect(unmatched(docAdded, docRemoved)).toEqual([]);
      expect(unmatched(canvasAdded, canvasRemoved)).toEqual([]);
    } finally {
      docAdd.mockRestore();
      docRemove.mockRestore();
      canvasAdd.mockRestore();
      canvasRemove.mockRestore();
    }
  });

  it('a touch after destroy is inert', () => {
    const { el, chart } = mount({ type: 'line', data });
    const m = markerCenters(el)[0]!;
    tap(el, m.x, m.y);
    chart.destroy();
    expect(() => tapOutside(el)).not.toThrow();
    expect(() => document.dispatchEvent(new Event('scroll'))).not.toThrow();
  });
});

// ------------------------------------------------------------- mouse regression

describe('mouse behavior is unchanged', () => {
  it('a mouse pointerdown does nothing on its own', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const enters = vi.fn();
    chart.on('pointenter', enters);
    const m = markerCenters(el)[0]!;
    pointer(el, 'pointerdown', m.x, m.y, { pointerType: 'mouse' });
    expect(enters).not.toHaveBeenCalled();
    expect(tooltipVisible(el)).toBe(false);
  });

  it('a mouse pointerleave still hides the tooltip immediately', () => {
    const { el, chart } = mount({ type: 'line', data, tooltip: { shared: false } });
    const leaves: PointEvent[] = [];
    chart.on('pointleave', (e) => leaves.push(e));
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    expect(tooltipVisible(el)).toBe(true);

    pointer(el, 'pointerleave', m.x, m.y, { pointerType: 'mouse' });
    expect(tooltipVisible(el)).toBe(false);
    expect(leaves).toHaveLength(1);
  });

  it('blur still clears hover (it carries no pointerType and must not go sticky)', () => {
    const { el } = mount({ type: 'line', data, tooltip: { shared: false } });
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    canvasOf(el).dispatchEvent(new FocusEvent('blur'));
    expect(tooltipVisible(el)).toBe(false);
  });

  it('the mouse tooltip is still placed BELOW the cursor', () => {
    const { el } = mount({ type: 'line', data });
    const m = markerCenters(el)[0]!;
    pointerMove(el, m.x, m.y);
    expect(parseFloat(tooltipEl(el)!.style.top)).toBeGreaterThan(m.y);
  });
});
