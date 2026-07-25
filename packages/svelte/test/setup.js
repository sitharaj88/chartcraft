/**
 * jsdom stubs for the Svelte component tests: canvas 2D, ResizeObserver,
 * matchMedia and the canvas encode paths `exportImage` uses (same approach as
 * packages/react/test/setup.ts). Imported explicitly by the component suite —
 * the rest of the Svelte suite runs in the `node` environment, where there is
 * no `window` to patch.
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

const contexts = new WeakMap();

function createStubContext(canvas) {
  const ctx = { canvas };
  for (const m of CTX_METHODS) ctx[m] = () => undefined;
  ctx.measureText = (text) => ({ width: String(text).length * 6 });
  for (const p of CTX_PROPS) ctx[p] = undefined;
  return ctx;
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: function getContext(kind) {
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

/** @type {{ targets: Element[], callback: unknown }[]} */
export const resizeObservers = [];

class StubResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    resizeObservers.push(this);
  }
  observe(target) {
    this.targets.push(target);
  }
  unobserve(target) {
    this.targets = this.targets.filter((t) => t !== target);
  }
  disconnect() {
    this.targets = [];
  }
}

globalThis.ResizeObserver = StubResizeObserver;

Object.defineProperty(window, 'matchMedia', {
  value: (query) => ({
    matches: false,
    media: query,
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
