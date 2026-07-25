/**
 * Vitest setup for @chartcraft/vue tests.
 * jsdom lacks canvas 2D, ResizeObserver, and matchMedia — stub all three
 * (same approach as packages/core/test/setup.ts, minus the draw log detail).
 */

const CTX_METHODS = [
  'setTransform', 'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath',
  'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'rect',
  'fill', 'stroke', 'clip', 'save', 'restore', 'fillText', 'strokeText',
  'translate', 'rotate', 'scale', 'setLineDash', 'createLinearGradient', 'drawImage',
];

const CTX_PROPS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline',
  'globalAlpha', 'lineCap', 'lineJoin', 'miterLimit', 'direction',
];

function createStubContext(canvas: HTMLCanvasElement): Record<string, unknown> {
  const ctx: Record<string, unknown> = { canvas };
  for (const m of CTX_METHODS) ctx[m] = () => undefined;
  ctx['measureText'] = (text: string) => ({ width: String(text).length * 6 });
  for (const p of CTX_PROPS) ctx[p] = undefined;
  return ctx;
}

const contexts = new WeakMap<HTMLCanvasElement, Record<string, unknown>>();

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: function getContext(this: HTMLCanvasElement, kind: string) {
    if (kind !== '2d') return null;
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = createStubContext(this);
      contexts.set(this, ctx);
    }
    return ctx;
  },
  configurable: true,
  writable: true,
});

// ---- ResizeObserver stub --------------------------------------------------
export const resizeObservers: StubResizeObserver[] = [];

export class StubResizeObserver {
  targets: Element[] = [];
  constructor(public callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  unobserve(target: Element): void {
    this.targets = this.targets.filter((t) => t !== target);
  }
  disconnect(): void {
    this.targets = [];
  }
}

(globalThis as Record<string, unknown>)['ResizeObserver'] = StubResizeObserver;

// ---- matchMedia stub ------------------------------------------------------
function matchMediaStub(query: string): MediaQueryList {
  const mql = {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
  return mql as unknown as MediaQueryList;
}

Object.defineProperty(window, 'matchMedia', {
  value: matchMediaStub,
  configurable: true,
  writable: true,
});
