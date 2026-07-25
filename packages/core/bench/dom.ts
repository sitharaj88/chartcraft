/**
 * Minimal DOM + canvas host for the benchmarks.
 *
 * The bench measures the parts of a frame that are OURS: option ingest, model
 * building, downsampling, scale/layout math, per-type geometry, and the number
 * of draw calls we issue. It deliberately does NOT measure rasterization — there
 * is no GPU here, and a `CanvasRenderingContext2D` stub returns instantly.
 *
 * That boundary is the honest one for this suite: it catches O(n^2) layout, a
 * layout that takes seconds, an ingest that deep-copies a million points, and
 * per-frame allocation — the pathologies a library author controls — and it
 * cannot tell you a frame rate. Read the numbers as "work the library does per
 * mount/update", not as "time to pixels".
 *
 * The context stub is a NO-OP, not a recorder: recording a million draw calls
 * would measure the recorder.
 */
import { JSDOM } from 'jsdom';

export interface BenchDom {
  window: Window & typeof globalThis;
  document: Document;
  /** Draw calls issued since the last `resetDrawCount()`. */
  drawCount(): number;
  resetDrawCount(): void;
  /** A fresh, sized container attached to the document body. */
  container(width?: number, height?: number): HTMLElement;
}

const CTX_METHODS = [
  'setTransform', 'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath',
  'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'rect',
  'fill', 'stroke', 'clip', 'save', 'restore', 'fillText', 'strokeText',
  'translate', 'rotate', 'scale', 'setLineDash', 'drawImage',
];

const CTX_PROPS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline',
  'globalAlpha', 'lineCap', 'lineJoin', 'miterLimit', 'direction',
];

export function setupDom(): BenchDom {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const window = dom.window as unknown as Window & typeof globalThis;
  const document = window.document;

  let draws = 0;

  const makeCtx = (canvas: HTMLCanvasElement): unknown => {
    const ctx: Record<string, unknown> = { canvas };
    for (const m of CTX_METHODS) {
      ctx[m] = () => {
        draws++;
      };
    }
    // A cheap deterministic metric: 6px per character, matching the test stub.
    ctx['measureText'] = (text: string) => {
      draws++;
      return { width: String(text).length * 6 };
    };
    ctx['createLinearGradient'] = () => ({ addColorStop: () => undefined });
    for (const p of CTX_PROPS) ctx[p] = undefined;
    return ctx;
  };

  const contexts = new WeakMap<HTMLCanvasElement, unknown>();
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    value: function getContext(this: HTMLCanvasElement, kind: string) {
      if (kind !== '2d') return null;
      let c = contexts.get(this);
      if (!c) {
        c = makeCtx(this);
        contexts.set(this, c);
      }
      return c;
    },
    configurable: true,
    writable: true,
  });

  // ResizeObserver: present but inert. The bench drives resize() explicitly, and
  // a live observer would inject coalesced rAF renders into the measurement.
  class InertResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (window as unknown as Record<string, unknown>)['ResizeObserver'] = InertResizeObserver;

  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: (media: string) => ({
        matches: false,
        media,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
      configurable: true,
      writable: true,
    });
  }
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true, writable: true });

  // Publish the globals `createChart` needs (it guards on `window`/`document`).
  const g = globalThis as unknown as Record<string, unknown>;
  g['window'] = window;
  g['document'] = document;
  g['HTMLElement'] = window.HTMLElement;
  g['HTMLCanvasElement'] = window.HTMLCanvasElement;
  g['ResizeObserver'] = InertResizeObserver;
  g['devicePixelRatio'] = 1;
  // Animation is disabled in every bench case, but `raf` is still referenced on
  // the hover/resize coalescing paths. Route it to a real timer-free no-op so a
  // scheduled frame can never fire in the middle of a measurement.
  g['requestAnimationFrame'] = (_cb: FrameRequestCallback): number => 0;
  g['cancelAnimationFrame'] = (): void => undefined;

  return {
    window,
    document,
    drawCount: () => draws,
    resetDrawCount: () => {
      draws = 0;
    },
    container(width = 1200, height = 700) {
      const el = document.createElement('div');
      // jsdom reports 0 for clientWidth/clientHeight, so every bench case passes
      // explicit width/height; this is belt and braces.
      Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
      document.body.appendChild(el);
      return el;
    },
  };
}
