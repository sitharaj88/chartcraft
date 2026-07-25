/** Shared helpers for chart-level tests. */
import { createChart } from '../src/index';
import type { Chart, ChartOptions } from '../src/index';
import { StubPointerEvent, type RecordingContext2D, type StubPointerEventInit } from './setup';

export interface Mounted {
  el: HTMLElement;
  chart: Chart;
}

/** Mount a chart with deterministic defaults (no animation, fixed size). */
export function mount(options: Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>): Mounted {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const chart = createChart(el, {
    animation: false,
    theme: 'light',
    width: 600,
    height: 400,
    ...options,
  } as ChartOptions);
  return { el, chart };
}

export function canvasOf(el: HTMLElement): HTMLCanvasElement {
  const canvas = el.querySelector('canvas');
  if (!canvas) throw new Error('no canvas mounted');
  return canvas;
}

export function ctxOf(el: HTMLElement): RecordingContext2D {
  return canvasOf(el).getContext('2d') as unknown as RecordingContext2D;
}

/** Centers of drawn markers (arc calls with the 4px marker radius). */
export function markerCenters(el: HTMLElement): { x: number; y: number }[] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'arc' && c.args[2] === 4)
    .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
}

/** All strings painted via fillText. */
export function paintedText(el: HTMLElement): string[] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'fillText')
    .map((c) => String(c.args[0]));
}

export function pointerMove(el: HTMLElement, clientX: number, clientY: number): void {
  canvasOf(el).dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }));
}

// ------------------------------------------------------------------- touch

/**
 * Dispatch one synthetic pointer event on the chart's canvas.
 * `pointerType` defaults to `'touch'` — these helpers exist for touch.
 */
export function pointer(
  el: HTMLElement,
  type: string,
  clientX: number,
  clientY: number,
  init: StubPointerEventInit = {},
): StubPointerEvent {
  const ev = new StubPointerEvent(type, {
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
    pointerType: 'touch',
    pointerId: 7,
    ...init,
  });
  canvasOf(el).dispatchEvent(ev);
  return ev;
}

/** Finger down on the chart. */
export function touchStart(el: HTMLElement, x: number, y: number, init: StubPointerEventInit = {}): void {
  pointer(el, 'pointerdown', x, y, init);
}

/** Finger scrubbing while down. */
export function touchMove(el: HTMLElement, x: number, y: number, init: StubPointerEventInit = {}): void {
  pointer(el, 'pointermove', x, y, init);
}

/**
 * Finger lifted. A real browser fires `pointerup` and then `pointerleave` (the
 * pointer ceases to exist), so both are dispatched — the second one is exactly
 * the event that used to kill the tooltip one frame after a tap showed it.
 */
export function touchEnd(el: HTMLElement, x: number, y: number, init: StubPointerEventInit = {}): void {
  pointer(el, 'pointerup', x, y, init);
  pointer(el, 'pointerleave', x, y, init);
}

/** A complete tap: down, up, and the compatibility `click` the UA synthesizes. */
export function tap(el: HTMLElement, x: number, y: number, init: StubPointerEventInit = {}): void {
  touchStart(el, x, y, init);
  touchEnd(el, x, y, init);
  canvasOf(el).dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
}

/** A tap somewhere else on the page (the touch equivalent of "mouse out"). */
export function tapOutside(el: HTMLElement): void {
  const other = el.ownerDocument.body;
  other.dispatchEvent(
    new StubPointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, pointerType: 'touch', pointerId: 9 }),
  );
}

export function tooltipEl(el: HTMLElement): HTMLElement | null {
  return el.ownerDocument.querySelector('.chartcraft-tooltip');
}

export function tooltipVisible(el: HTMLElement): boolean {
  const t = tooltipEl(el);
  return !!t && t.style.display !== 'none';
}

export function key(el: HTMLElement, k: string): void {
  canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

export function cleanupDom(): void {
  document.body.innerHTML = '';
}
