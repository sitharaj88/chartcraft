/**
 * Vitest setup: jsdom has no canvas, ResizeObserver, or matchMedia.
 * We stub all three. The 2D context stub RECORDS method calls and property
 * sets so renderer tests can assert against the draw log.
 */

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface RecordingContext2D {
  __calls: RecordedCall[];
  __props: Array<{ prop: string; value: unknown }>;
  canvas: HTMLCanvasElement;
  [key: string]: unknown;
}

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

export function createRecordingContext(canvas: HTMLCanvasElement): RecordingContext2D {
  const ctx: RecordingContext2D = {
    __calls: [],
    __props: [],
    canvas,
  };
  for (const m of CTX_METHODS) {
    ctx[m] = (...args: unknown[]) => {
      ctx.__calls.push({ method: m, args });
      return undefined;
    };
  }
  // measureText returns a deterministic width (6px per char).
  ctx['measureText'] = (text: string) => {
    ctx.__calls.push({ method: 'measureText', args: [text] });
    return { width: String(text).length * 6 };
  };
  for (const p of CTX_PROPS) {
    let value: unknown;
    Object.defineProperty(ctx, p, {
      get: () => value,
      set: (v: unknown) => {
        value = v;
        ctx.__props.push({ prop: p, value: v });
      },
      configurable: true,
      enumerable: true,
    });
  }
  return ctx;
}

const contexts = new WeakMap<HTMLCanvasElement, RecordingContext2D>();

/** Access the recording context for a canvas (as used by CanvasRenderer). */
export function getRecordingContext(canvas: HTMLCanvasElement): RecordingContext2D | undefined {
  return contexts.get(canvas);
}

// ---- HTMLCanvasElement.getContext stub -----------------------------------
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: function getContext(this: HTMLCanvasElement, kind: string) {
    if (kind !== '2d') return null;
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = createRecordingContext(this);
      contexts.set(this, ctx);
    }
    return ctx;
  },
  configurable: true,
  writable: true,
});

// ---- canvas encoding stubs ------------------------------------------------
// jsdom implements neither toBlob (its callback is NEVER invoked) nor
// toDataURL (returns null) without the native `canvas` package. Both are
// stubbed to behave like a browser so image export is testable; every
// encode is recorded so tests can assert the backing-store size (scale).

export interface EncodedCanvas {
  width: number;
  height: number;
  type: string;
}

export const encodedCanvases: EncodedCanvas[] = [];

/** PNG signature — enough to prove the blob carries image bytes. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function fakeImageBytes(canvas: HTMLCanvasElement) {
  const bytes = new Uint8Array(PNG_MAGIC.length + 4);
  bytes.set(PNG_MAGIC, 0);
  bytes[8] = canvas.width & 0xff;
  bytes[9] = (canvas.width >> 8) & 0xff;
  bytes[10] = canvas.height & 0xff;
  bytes[11] = (canvas.height >> 8) & 0xff;
  return bytes;
}

Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
  value: function toBlob(
    this: HTMLCanvasElement,
    callback: (blob: Blob | null) => void,
    type = 'image/png',
  ) {
    encodedCanvases.push({ width: this.width, height: this.height, type });
    const bytes = fakeImageBytes(this);
    queueMicrotask(() => callback(new Blob([bytes], { type })));
  },
  configurable: true,
  writable: true,
});

Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value: function toDataURL(this: HTMLCanvasElement, type = 'image/png') {
    encodedCanvases.push({ width: this.width, height: this.height, type });
    const bin = String.fromCharCode(...fakeImageBytes(this));
    return `data:${type};base64,${btoa(bin)}`;
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
  /** Test helper: fire the callback. */
  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

(globalThis as Record<string, unknown>)['ResizeObserver'] = StubResizeObserver;

// ---- matchMedia stub ------------------------------------------------------
interface MediaStub {
  matches: Record<string, boolean>;
  listeners: Map<string, Set<() => void>>;
}

const mediaStub: MediaStub = { matches: {}, listeners: new Map() };

export function setMediaQuery(query: string, matches: boolean): void {
  mediaStub.matches[query] = matches;
  const set = mediaStub.listeners.get(query);
  if (set) for (const l of [...set]) l();
}

export function resetMediaQueries(): void {
  mediaStub.matches = {};
  mediaStub.listeners.clear();
}

function matchMediaStub(query: string): MediaQueryList {
  const mql = {
    get matches() {
      return mediaStub.matches[query] ?? false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, handler: () => void) => {
      let set = mediaStub.listeners.get(query);
      if (!set) {
        set = new Set();
        mediaStub.listeners.set(query, set);
      }
      set.add(handler);
    },
    removeEventListener: (_type: string, handler: () => void) => {
      mediaStub.listeners.get(query)?.delete(handler);
    },
    addListener: (handler: () => void) => mql.addEventListener('change', handler),
    removeListener: (handler: () => void) => mql.removeEventListener('change', handler),
    dispatchEvent: () => false,
  };
  return mql as unknown as MediaQueryList;
}

Object.defineProperty(window, 'matchMedia', {
  value: matchMediaStub,
  configurable: true,
  writable: true,
});
