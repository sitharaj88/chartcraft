/** Shared helpers for chart-level tests. */
import { createChart } from '../src/index';
import type { Chart, ChartOptions } from '../src/index';
import type { RecordingContext2D } from './setup';

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

export function key(el: HTMLElement, k: string): void {
  canvasOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

export function cleanupDom(): void {
  document.body.innerHTML = '';
}
