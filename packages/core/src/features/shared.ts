/**
 * Shared helpers for the v0.3 cross-cutting FEATURES (error bars, trendlines,
 * data labels, annotations, zoom/pan/brush).
 *
 * Every feature in this directory is a pipeline-level `Decorator`
 * (src/decorate.ts) — a chart type never knows they exist. This module holds
 * the geometry / color / text / hit-test math they share, so no feature forks
 * per-type code.
 *
 * Axis vocabulary (identical to the zoom viewport's): the **value axis** is the
 * continuous axis carrying `y` (screen-y normally, screen-x on horizontal bar
 * charts) and the **data axis** is the one carrying `x` (screen-x normally,
 * screen-y when horizontal). Features therefore work unchanged on
 * `horizontal: true` charts.
 */
import type { AnyScale, ContinuousScale, Layout, PointPos, Rect } from '../layout';
import type { DataModel, NormalizedSeries, ResolvedOptions } from '../model';
import type { Renderer } from '../render/renderer';
import type { ChartType, SeriesKind, SeriesOptions, Theme } from '../types';
import { bandIndexFor } from '../model';
import { BandScale } from '../scales/band';

/** The minimum a feature needs to map data values onto pixels. */
export interface AxesContext {
  model: DataModel;
  layout: Layout;
}

// ---------------------------------------------------------------- scales/axes

export function isBandScale(s: AnyScale | null): s is BandScale {
  return s instanceof BandScale;
}

/** The continuous value ('y' data) scale, or null when there isn't one. */
export function valueScaleOf(ctx: AxesContext): ContinuousScale | null {
  const s = ctx.model.horizontal ? ctx.layout.xScale : ctx.layout.yScale;
  return s && !isBandScale(s) ? s : null;
}

/** The data-x scale (band OR continuous), or null. */
export function dataScaleOf(ctx: AxesContext): AnyScale | null {
  return ctx.model.horizontal ? ctx.layout.yScale : ctx.layout.xScale;
}

/** The continuous data-x scale, or null when x is a band (category) axis. */
export function continuousDataScaleOf(ctx: AxesContext): ContinuousScale | null {
  const s = dataScaleOf(ctx);
  return s && !isBandScale(s) ? s : null;
}

/** True when the value axis runs along screen-y (i.e. not a horizontal chart). */
export function valueOnScreenY(model: DataModel): boolean {
  return !model.horizontal;
}

/** Pixel position of a data-x value (band centers for category axes). */
export function dataPx(ctx: AxesContext, xv: number | null, pi: number): number | null {
  const s = dataScaleOf(ctx);
  if (!s) return null;
  if (isBandScale(s)) return s.center(bandIndexFor(ctx.model, xv, pi));
  if (xv === null || !Number.isFinite(xv)) return null;
  return s.scale(xv);
}

/** Pixel position of a value-axis value. */
export function valuePx(ctx: AxesContext, v: number): number | null {
  const s = valueScaleOf(ctx);
  if (!s || !Number.isFinite(v)) return null;
  return s.scale(v);
}

/** Split a mark position into (along data axis, along value axis) pixels. */
export function anchorOf(model: DataModel, p: PointPos): { along: number; value: number; base: number } {
  return valueOnScreenY(model)
    ? { along: p.x, value: p.y, base: p.y0 }
    : { along: p.y, value: p.x, base: p.y0 };
}

// ------------------------------------------------------------------ rectangles

export function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.w + pad &&
    b.x - pad < a.x + a.w + pad &&
    a.y - pad < b.y + b.h + pad &&
    b.y - pad < a.y + a.h + pad
  );
}

/** True when `inner` lies fully inside `outer`. */
export function rectInside(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function pointInRect(r: Rect, px: number, py: number, pad = 0): boolean {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

/** Clamp a rect to `bounds`; returns null when the two do not intersect. */
export function clampRect(r: Rect, bounds: Rect): Rect | null {
  const x0 = Math.max(r.x, bounds.x);
  const y0 = Math.max(r.y, bounds.y);
  const x1 = Math.min(r.x + r.w, bounds.x + bounds.w);
  const y1 = Math.min(r.y + r.h, bounds.y + bounds.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Distance from (px, py) to the segment (x1,y1)-(x2,y2). */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ----------------------------------------------------------------------- text

export type TextAlign = 'left' | 'center' | 'right';
export type TextBaseline = 'top' | 'middle' | 'bottom';

/** The box a piece of text occupies, given its anchor, align and baseline. */
export function textRect(
  width: number,
  height: number,
  x: number,
  y: number,
  align: TextAlign = 'left',
  baseline: TextBaseline = 'middle',
): Rect {
  const rx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const ry = baseline === 'middle' ? y - height / 2 : baseline === 'bottom' ? y - height : y;
  return { x: rx, y: ry, w: width, h: height };
}

export function labelFont(theme: Theme): string {
  return `${theme.fontSize}px ${theme.fontFamily}`;
}

/** Halo padding around annotation labels (surface-filled, for legibility). */
export const HALO_PAD = 3;

/**
 * Draw text over a surface-colored halo so it stays legible on top of grid,
 * bands and marks. The halo is a rounded surface rect at 0.85 alpha.
 */
export function drawHaloText(
  r: Renderer,
  text: string,
  x: number,
  y: number,
  o: {
    font: string;
    color: string;
    surface: string;
    fontSize: number;
    align?: TextAlign;
    baseline?: TextBaseline;
  },
): Rect {
  const w = r.measure(text, o.font);
  const box = textRect(w, o.fontSize, x, y, o.align ?? 'left', o.baseline ?? 'middle');
  r.rect(box.x - HALO_PAD, box.y - HALO_PAD, box.w + HALO_PAD * 2, box.h + HALO_PAD * 2, {
    fill: o.surface,
    alpha: 0.85,
    radii: [3, 3, 3, 3],
  });
  r.text(text, x, y, {
    font: o.font,
    color: o.color,
    align: o.align ?? 'left',
    baseline: o.baseline ?? 'middle',
  });
  return box;
}

// ---------------------------------------------------------------------- colors

/** Parse `#rgb` / `#rrggbb` into [r, g, b]; null for anything else. */
export function parseHexColor(color: string): [number, number, number] | null {
  const s = color.trim();
  if (s[0] !== '#') return null;
  const hex = s.slice(1);
  if (hex.length === 3) {
    const r = hex[0];
    const g = hex[1];
    const b = hex[2];
    if (r === undefined || g === undefined || b === undefined) return null;
    const v = [r + r, g + g, b + b].map((h) => Number.parseInt(h, 16));
    return v.some((n) => Number.isNaN(n)) ? null : [v[0] as number, v[1] as number, v[2] as number];
  }
  if (hex.length === 6) {
    const v = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((h) => Number.parseInt(h, 16));
    return v.some((n) => Number.isNaN(n)) ? null : [v[0] as number, v[1] as number, v[2] as number];
  }
  return null;
}

function hex2(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return n.toString(16).padStart(2, '0');
}

/**
 * Darken a hex color toward black by `amount` (0..1). Returns null when the
 * input is not a hex color (callers then fall back to an ink color).
 */
export function darkenColor(color: string, amount = 0.3): string | null {
  const rgb = parseHexColor(color);
  if (!rgb) return null;
  const k = 1 - Math.max(0, Math.min(1, amount));
  return `#${hex2(rgb[0] * k)}${hex2(rgb[1] * k)}${hex2(rgb[2] * k)}`;
}

// ------------------------------------------------------------- raw series link

/**
 * The RAW `SeriesOptions` a normalized series came from (matched on identity),
 * so a feature can read `errorBars` / `trendline` — which are series-level
 * options the model deliberately does not carry.
 */
export function rawSeriesFor(opts: ResolvedOptions, s: NormalizedSeries): SeriesOptions | undefined {
  return opts.data.series.find((raw) => (raw.id ?? raw.name) === s.id);
}

/**
 * Cartesian roots on which a per-series decoration is meaningful.
 *
 * These are exactly the roots where `SeriesOptions.type` (the combo override) is
 * honored, plus `bubble` (a scatter root with a size channel). A decoration is
 * then gated on the series' RESOLVED mark kind, not on the root type — see
 * `decoratesSeries`.
 */
export const DECORATABLE_ROOTS: readonly ChartType[] = ['line', 'area', 'bar', 'scatter', 'bubble'];

/**
 * Does this decoration apply to this series?
 *
 * Gating used to read the ROOT chart type, which made combo charts silently drop
 * decorations: a `trendline` on a `type: 'line'` series inside a `type: 'bar'`
 * root was ignored, with no error and no warning, because the ROOT was `'bar'`.
 * A silent no-op is the worst failure mode a feature can have.
 *
 * The resolved per-series `kind` is the right question — it is how combo works
 * everywhere else in the pipeline (z-order, stacking groups, downsample
 * eligibility) — bounded by `DECORATABLE_ROOTS` so a root whose base kind
 * coincides but whose semantics do not (`streamgraph` is `'area'` over a
 * meaningless baseline; `lollipop` and `waterfall` are `'bar'`) stays excluded.
 */
export function decoratesSeries(
  model: DataModel,
  s: NormalizedSeries,
  kinds: readonly SeriesKind[],
): boolean {
  if (!DECORATABLE_ROOTS.includes(model.type)) return false;
  return s.kind !== null && kinds.includes(s.kind);
}

/** The value a mark is anchored at (the stack top when stacked). */
export function anchorValue(s: NormalizedSeries, pi: number): number | null {
  if (s.y1) return s.y1[pi] ?? null;
  return s.points[pi]?.y ?? null;
}

// ------------------------------------------------------------- host resolution
//
// v0.3: `DecoratorContext.host` carries the live chart's `DecoratorHost`
// directly (and is **null** when the pass paints through an offscreen renderer,
// which is what keeps `exportImage()` from reaching live DOM). The
// `WeakMap<Renderer, DecoratorHost>` this module used to keep — populated from
// `attach`, read back in `draw` — is gone; `ctx.host` is the seam.
