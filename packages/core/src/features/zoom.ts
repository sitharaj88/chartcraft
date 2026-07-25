/**
 * Feature 5 — Zoom, pan & brush (`zoom`).
 *
 * ALL interaction lives in `Decorator.attach(host)` (the only sanctioned place
 * for DOM listeners), so `chart.ts` stays interaction-agnostic:
 *
 * - **drag** paints a brush rectangle (surface-tinted fill, hairline edge) and
 *   zooms on release;
 * - **ctrl/⌘+wheel** zooms about the pointer;
 * - **drag pans** once zoomed (`Shift`+drag still brushes);
 * - **double-click** and **Escape** reset;
 * - **`+` / `-`** zoom about the center of the window;
 * - **`Shift`+arrows** pan when zoomed.
 *
 * ARROW-KEY CONFLICT RULE (deliberate, documented in DEVIATIONS.md §33):
 * plain arrow keys ALWAYS belong to the existing keyboard point navigation —
 * accessibility wins. Panning is `Shift`+arrow, and is only claimed when a
 * viewport is active, `pan` is enabled and the arrow's axis is actually
 * zoomable; otherwise the key falls through untouched. `Escape` resets the zoom
 * when zoomed and otherwise falls through to clear datum focus. Claimed keys
 * are intercepted in the CAPTURE phase on the chart root, so the canvas's own
 * keydown handler never sees them and focus cannot move behind a pan.
 *
 * Viewport writes go through `host.setViewport()` (silent); the public `zoom`
 * event is emitted once per completed gesture (a pan emits on release, not on
 * every pointermove).
 */
import type { Decorator, DecoratorContext, DecoratorHost, Viewport } from '../decorate';
import { normalizeViewport } from '../decorate';
import type { ContinuousScale, Rect } from '../layout';
import type { ZoomRange } from '../types';
import { clamp } from '../util';
import { continuousDataScaleOf, pointInRect, valueScaleOf } from './shared';

/** Wheel / keyboard zoom-in factor (span shrinks to 80%). */
export const ZOOM_IN_FACTOR = 0.8;
/** Wheel / keyboard zoom-out factor (span grows to 125%). */
export const ZOOM_OUT_FACTOR = 1.25;
/** Keyboard pan step, as a fraction of the visible span. */
export const KEY_PAN_FRACTION = 0.1;
/** A drag shorter than this (px, along a zoomed axis) is a click, not a zoom. */
export const MIN_BRUSH_PX = 4;
/** Brush fill alpha (surface-tinted wash over the unselected plot). */
export const BRUSH_ALPHA = 0.45;

export type Domain = [number, number];

// ------------------------------------------------------------------ pure math

/** Shift `d` so it lies inside `bounds`; wider-than-bounds collapses to bounds. */
export function clampDomain(d: Domain, bounds: Domain | null): Domain {
  if (!bounds) return d;
  const span = d[1] - d[0];
  const bSpan = bounds[1] - bounds[0];
  if (span >= bSpan) return [bounds[0], bounds[1]];
  let lo = d[0];
  let hi = d[1];
  if (lo < bounds[0]) {
    lo = bounds[0];
    hi = lo + span;
  }
  if (hi > bounds[1]) {
    hi = bounds[1];
    lo = hi - span;
  }
  return [lo, hi];
}

/**
 * Grow a domain to `minSpan` when it is narrower, keeping `anchor` at the same
 * relative position (the window center when no anchor is given).
 */
export function enforceMinSpan(
  d: Domain,
  minSpan: number | undefined,
  anchor?: number,
  bounds?: Domain | null,
): Domain {
  if (minSpan === undefined || !(minSpan > 0)) return d;
  const span = d[1] - d[0];
  if (span >= minSpan) return d;
  const a = anchor ?? (d[0] + d[1]) / 2;
  const t = span === 0 ? 0.5 : clamp((a - d[0]) / span, 0, 1);
  const lo = a - minSpan * t;
  return clampDomain([lo, lo + minSpan], bounds ?? null);
}

/** Zoom about `anchor` (data units). factor < 1 zooms in, > 1 zooms out. */
export function zoomDomain(
  d: Domain,
  anchor: number,
  factor: number,
  o?: { bounds?: Domain | null; minSpan?: number },
): Domain {
  const lo = anchor - (anchor - d[0]) * factor;
  const hi = anchor + (d[1] - anchor) * factor;
  let out: Domain = lo <= hi ? [lo, hi] : [hi, lo];
  out = enforceMinSpan(out, o?.minSpan, anchor, o?.bounds ?? null);
  return clampDomain(out, o?.bounds ?? null);
}

/** Translate a domain by `delta` data units, clamped to bounds. */
export function panDomain(d: Domain, delta: number, bounds?: Domain | null): Domain {
  return clampDomain([d[0] + delta, d[1] + delta], bounds ?? null);
}

/** Invert two pixel positions into an ascending domain (null when degenerate). */
export function brushDomain(
  scale: Pick<ContinuousScale, 'invert'>,
  p0: number,
  p1: number,
  o?: { bounds?: Domain | null; minSpan?: number },
): Domain | null {
  const a = scale.invert(p0);
  const b = scale.invert(p1);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  let d: Domain = a <= b ? [a, b] : [b, a];
  d = enforceMinSpan(d, o?.minSpan, undefined, o?.bounds ?? null);
  return clampDomain(d, o?.bounds ?? null);
}

const EPS = 1e-9;

function sameDomain(a: Domain | null | undefined, b: Domain | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const scale = Math.max(1, Math.abs(a[0]), Math.abs(a[1]));
  return Math.abs(a[0] - b[0]) <= EPS * scale && Math.abs(a[1] - b[1]) <= EPS * scale;
}

export function sameViewport(a: Viewport | null, b: Viewport | null): boolean {
  if (!a || !b) return !a && !b;
  return sameDomain(a.x ?? null, b.x ?? null) && sameDomain(a.y ?? null, b.y ?? null);
}

/**
 * Drop axes that span their full data bounds — a fully zoomed-out axis is not a
 * window. An empty result becomes `null` (a reset).
 */
export function dropFullAxes(vp: Viewport | null, bounds: Bounds): Viewport | null {
  if (!vp) return null;
  const out: Viewport = {};
  if (vp.x && !sameDomain(vp.x, bounds.x)) out.x = vp.x;
  if (vp.y && !sameDomain(vp.y, bounds.y)) out.y = vp.y;
  return out.x || out.y ? out : null;
}

/** The `zoom` event payload for a viewport. */
export function zoomPayload(vp: Viewport | null): ZoomRange {
  if (!vp) return null;
  return { ...(vp.x ? { x: vp.x } : {}), ...(vp.y ? { y: vp.y } : {}) };
}

// ---------------------------------------------------------------- axis mapping

export interface Bounds {
  x: Domain | null;
  y: Domain | null;
}

/** The unzoomed (full) domains of the two continuous axes. */
export function domainsOf(ctx: DecoratorContext): Bounds {
  const xs = continuousDataScaleOf(ctx);
  const ys = valueScaleOf(ctx);
  return {
    x: xs ? ([...xs.domain()] as Domain) : null,
    y: ys ? ([...ys.domain()] as Domain) : null,
  };
}

function zoomsAxis(axis: 'x' | 'y' | 'xy', which: 'x' | 'y'): boolean {
  return axis === 'xy' || axis === which;
}

/** True when the given DATA axis maps onto screen-x for this chart. */
function onScreenX(ctx: DecoratorContext, which: 'x' | 'y'): boolean {
  return which === 'x' ? !ctx.model.horizontal : ctx.model.horizontal;
}

// -------------------------------------------------------------- per-host state

interface DragState {
  mode: 'brush' | 'pan';
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  base: Bounds;
  startViewport: Viewport | null;
}

interface ZoomState {
  host: DecoratorHost;
  bounds: Bounds;
  drag: DragState | null;
  brush: Rect | null;
}

const STATES = new WeakMap<DecoratorHost, ZoomState>();

/** Test seam: the live brush rectangle for a host, or null. */
export function brushRectFor(host: DecoratorHost): Rect | null {
  return STATES.get(host)?.brush ?? null;
}

// ------------------------------------------------------------------- gestures

/** The brush rectangle for the current drag (full extent on unzoomed axes). */
export function brushRect(ctx: DecoratorContext, drag: DragState): Rect {
  const plot = ctx.plot;
  const axis = ctx.opts.zoom.axis;
  const screenX = (zoomsAxis(axis, 'x') && onScreenX(ctx, 'x')) || (zoomsAxis(axis, 'y') && onScreenX(ctx, 'y'));
  const screenY = (zoomsAxis(axis, 'x') && !onScreenX(ctx, 'x')) || (zoomsAxis(axis, 'y') && !onScreenX(ctx, 'y'));
  const cx0 = clamp(Math.min(drag.startX, drag.curX), plot.x, plot.x + plot.w);
  const cx1 = clamp(Math.max(drag.startX, drag.curX), plot.x, plot.x + plot.w);
  const cy0 = clamp(Math.min(drag.startY, drag.curY), plot.y, plot.y + plot.h);
  const cy1 = clamp(Math.max(drag.startY, drag.curY), plot.y, plot.y + plot.h);
  return {
    x: screenX ? cx0 : plot.x,
    y: screenY ? cy0 : plot.y,
    w: screenX ? cx1 - cx0 : plot.w,
    h: screenY ? cy1 - cy0 : plot.h,
  };
}

/** The viewport a completed brush gesture asks for (null = nothing zoomable). */
export function brushViewport(ctx: DecoratorContext, drag: DragState, bounds: Bounds): Viewport | null {
  const z = ctx.opts.zoom;
  const plot = ctx.plot;
  const vp: Viewport = {};

  const axisPixels = (which: 'x' | 'y'): [number, number] =>
    onScreenX(ctx, which)
      ? [clamp(drag.startX, plot.x, plot.x + plot.w), clamp(drag.curX, plot.x, plot.x + plot.w)]
      : [clamp(drag.startY, plot.y, plot.y + plot.h), clamp(drag.curY, plot.y, plot.y + plot.h)];

  if (zoomsAxis(z.axis, 'x')) {
    const s = continuousDataScaleOf(ctx);
    const [p0, p1] = axisPixels('x');
    if (s && Math.abs(p1 - p0) >= MIN_BRUSH_PX) {
      const d = brushDomain(s, p0, p1, { bounds: bounds.x, ...(z.minSpan !== undefined ? { minSpan: z.minSpan } : {}) });
      if (d) vp.x = d;
    }
  }
  if (zoomsAxis(z.axis, 'y')) {
    const s = valueScaleOf(ctx);
    const [p0, p1] = axisPixels('y');
    if (s && Math.abs(p1 - p0) >= MIN_BRUSH_PX) {
      const d = brushDomain(s, p0, p1, { bounds: bounds.y });
      if (d) vp.y = d;
    }
  }
  return dropFullAxes(normalizeViewport(vp), bounds);
}

/** Zoom about a pointer position (px/py) or, when omitted, the window center. */
export function zoomAbout(
  ctx: DecoratorContext,
  bounds: Bounds,
  factor: number,
  at: { px: number; py: number } | null,
): Viewport | null {
  const z = ctx.opts.zoom;
  const vp: Viewport = {};
  if (zoomsAxis(z.axis, 'x')) {
    const s = continuousDataScaleOf(ctx);
    if (s) {
      const dom = [...s.domain()] as Domain;
      const anchor = at ? s.invert(onScreenX(ctx, 'x') ? at.px : at.py) : (dom[0] + dom[1]) / 2;
      vp.x = zoomDomain(dom, anchor, factor, {
        bounds: bounds.x,
        ...(z.minSpan !== undefined ? { minSpan: z.minSpan } : {}),
      });
    }
  }
  if (zoomsAxis(z.axis, 'y')) {
    const s = valueScaleOf(ctx);
    if (s) {
      const dom = [...s.domain()] as Domain;
      const anchor = at ? s.invert(onScreenX(ctx, 'y') ? at.px : at.py) : (dom[0] + dom[1]) / 2;
      vp.y = zoomDomain(dom, anchor, factor, { bounds: bounds.y });
    }
  }
  return dropFullAxes(normalizeViewport(vp), bounds);
}

/** The viewport for a pan expressed in pixels (from the drag's start window). */
export function panViewport(
  ctx: DecoratorContext,
  drag: DragState,
  bounds: Bounds,
  dxPx: number,
  dyPx: number,
): Viewport | null {
  const z = ctx.opts.zoom;
  const plot = ctx.plot;
  const vp: Viewport = {};
  if (zoomsAxis(z.axis, 'x') && drag.base.x) {
    const along = onScreenX(ctx, 'x') ? dxPx : dyPx;
    const span = drag.base.x[1] - drag.base.x[0];
    const perPx = span / (onScreenX(ctx, 'x') ? plot.w : plot.h);
    // Screen-x: content follows the pointer (drag right -> window moves left).
    // Screen-y: the value axis is inverted, so the sign flips.
    const delta = onScreenX(ctx, 'x') ? -along * perPx : along * perPx;
    vp.x = panDomain(drag.base.x, delta, bounds.x);
  }
  if (zoomsAxis(z.axis, 'y') && drag.base.y) {
    const along = onScreenX(ctx, 'y') ? dxPx : dyPx;
    const span = drag.base.y[1] - drag.base.y[0];
    const perPx = span / (onScreenX(ctx, 'y') ? plot.w : plot.h);
    const delta = onScreenX(ctx, 'y') ? -along * perPx : along * perPx;
    vp.y = panDomain(drag.base.y, delta, bounds.y);
  }
  return normalizeViewport(vp);
}

/** Keyboard pan: one step of `KEY_PAN_FRACTION` along one axis. */
export function keyPanViewport(
  ctx: DecoratorContext,
  bounds: Bounds,
  which: 'x' | 'y',
  dir: -1 | 1,
): Viewport | null {
  const cur = ctx.viewport;
  const vp: Viewport = { ...(cur?.x ? { x: cur.x } : {}), ...(cur?.y ? { y: cur.y } : {}) };
  const s = which === 'x' ? continuousDataScaleOf(ctx) : valueScaleOf(ctx);
  if (!s) return normalizeViewport(vp);
  const dom = [...s.domain()] as Domain;
  const step = (dom[1] - dom[0]) * KEY_PAN_FRACTION * dir;
  const next = panDomain(dom, step, which === 'x' ? bounds.x : bounds.y);
  if (which === 'x') vp.x = next;
  else vp.y = next;
  return normalizeViewport(vp);
}

// ------------------------------------------------------------------- lifecycle

function canvasPoint(canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }): { px: number; py: number } {
  const rect = canvas.getBoundingClientRect();
  return { px: e.clientX - rect.left, py: e.clientY - rect.top };
}

/** Set the viewport and emit `zoom` when it actually changed. Returns true when it did. */
function setAndEmit(st: ZoomState, vp: Viewport | null): boolean {
  const norm = normalizeViewport(vp);
  if (sameViewport(st.host.getViewport(), norm)) return false;
  st.host.setViewport(norm);
  st.host.emit('zoom', zoomPayload(norm));
  return true;
}

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;

function attachZoom(host: DecoratorHost): () => void {
  const st: ZoomState = { host, bounds: domainsOf(host.context()), drag: null, brush: null };
  STATES.set(host, st);

  const canvas = host.canvas;
  const root = host.root;
  const doc = canvas.ownerDocument;

  const enabled = (): boolean => host.context().opts.zoom.enabled;

  const onPointerDown = (e: Event): void => {
    const me = e as PointerEvent;
    if (!enabled()) return;
    const ctx = host.context();
    const z = ctx.opts.zoom;
    const { px, py } = canvasPoint(canvas, me);
    if (!pointInRect(ctx.plot, px, py)) return;
    const zoomed = host.getViewport() !== null;
    const brushable = z.drag;
    const pannable = zoomed && z.pan;
    // Once zoomed, a plain drag pans and Shift+drag brushes.
    const mode: 'brush' | 'pan' | null =
      pannable && !me.shiftKey ? 'pan' : brushable ? 'brush' : pannable ? 'pan' : null;
    if (!mode) return;
    st.drag = {
      mode,
      startX: px,
      startY: py,
      curX: px,
      curY: py,
      base: domainsOf(ctx),
      startViewport: host.getViewport(),
    };
    if (mode === 'brush') {
      st.brush = brushRect(ctx, st.drag);
      host.requestRender();
    }
  };

  const onPointerMove = (e: Event): void => {
    if (!st.drag) return;
    const me = e as PointerEvent;
    const ctx = host.context();
    const { px, py } = canvasPoint(canvas, me);
    st.drag.curX = px;
    st.drag.curY = py;
    if (st.drag.mode === 'brush') {
      st.brush = brushRect(ctx, st.drag);
      host.requestRender();
    } else {
      const vp = panViewport(ctx, st.drag, st.bounds, px - st.drag.startX, py - st.drag.startY);
      // Silent: a pan emits one `zoom` on release, not one per pointermove.
      if (!sameViewport(host.getViewport(), vp)) host.setViewport(vp);
    }
    // Suppress hover/tooltip while a gesture is in progress.
    e.stopPropagation();
  };

  const onPointerUp = (): void => {
    const drag = st.drag;
    if (!drag) return;
    st.drag = null;
    const ctx = host.context();
    if (drag.mode === 'brush') {
      st.brush = null;
      host.requestRender();
      const vp = brushViewport(ctx, drag, st.bounds);
      if (vp) setAndEmit(st, vp);
      return;
    }
    const now = host.getViewport();
    if (!sameViewport(drag.startViewport, now)) host.emit('zoom', zoomPayload(now));
  };

  const onWheel = (e: Event): void => {
    const we = e as WheelEvent;
    if (!enabled()) return;
    const ctx = host.context();
    if (!ctx.opts.zoom.wheel) return;
    if (!we.ctrlKey && !we.metaKey) return;
    const { px, py } = canvasPoint(canvas, we);
    if (!pointInRect(ctx.plot, px, py)) return;
    we.preventDefault();
    const factor = we.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
    setAndEmit(st, zoomAbout(ctx, st.bounds, factor, { px, py }));
  };

  const onDblClick = (e: Event): void => {
    if (!enabled()) return;
    if (host.getViewport() === null) return;
    e.preventDefault();
    setAndEmit(st, null);
  };

  const onKeyDown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (!enabled()) return;
    const ctx = host.context();
    const z = ctx.opts.zoom;
    const zoomed = host.getViewport() !== null;
    const claim = (): void => {
      ke.preventDefault();
      ke.stopPropagation();
    };
    if (ke.key === '+' || ke.key === '=') {
      claim();
      setAndEmit(st, zoomAbout(ctx, st.bounds, ZOOM_IN_FACTOR, null));
      return;
    }
    if (ke.key === '-' || ke.key === '_') {
      claim();
      setAndEmit(st, zoomAbout(ctx, st.bounds, ZOOM_OUT_FACTOR, null));
      return;
    }
    if (ke.key === 'Escape') {
      // Zoomed: reset (and claim). Unzoomed: fall through to focus clearing.
      if (!zoomed) return;
      claim();
      setAndEmit(st, null);
      return;
    }
    if (!(ARROWS as readonly string[]).includes(ke.key)) return;
    // Plain arrows are point navigation, always. Panning is Shift+arrow.
    if (!ke.shiftKey || !zoomed || !z.pan) return;
    const horizontalKey = ke.key === 'ArrowLeft' || ke.key === 'ArrowRight';
    // Which DATA axis does this arrow address on this chart's orientation?
    const which: 'x' | 'y' = horizontalKey
      ? ctx.model.horizontal
        ? 'y'
        : 'x'
      : ctx.model.horizontal
        ? 'x'
        : 'y';
    if (!zoomsAxis(z.axis, which)) return;
    const dir: -1 | 1 = ke.key === 'ArrowRight' || ke.key === 'ArrowUp' ? 1 : -1;
    claim();
    setAndEmit(st, keyPanViewport(ctx, st.bounds, which, dir));
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove, true);
  doc.addEventListener('pointerup', onPointerUp);
  doc.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDblClick);
  root.addEventListener('keydown', onKeyDown, true);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerUp);
    doc.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDblClick);
    root.removeEventListener('keydown', onKeyDown, true);
    STATES.delete(host);
  };
}

export const zoomDecorator: Decorator = {
  id: 'chartcraft:zoom',
  layer: 'over',
  order: 90,

  appliesTo(ctx) {
    return ctx.opts.zoom.enabled;
  },

  draw(ctx) {
    // `ctx.host` is null on the offscreen export renderer — a brush
    // rectangle is live interaction state and never belongs in an export.
    const host = ctx.host;
    if (!host) return;
    const st = STATES.get(host);
    if (!st) return;
    // Refresh the full-extent bounds whenever the chart is unzoomed.
    if (ctx.viewport === null) st.bounds = domainsOf(ctx);
    const b = st.brush;
    if (!b || b.w <= 0 || b.h <= 0) return;
    ctx.r.rect(b.x, b.y, b.w, b.h, {
      fill: ctx.theme.surface,
      alpha: BRUSH_ALPHA,
      stroke: { color: ctx.theme.axisLine, width: 1 },
    });
  },

  attach(host) {
    return attachZoom(host);
  },
};
