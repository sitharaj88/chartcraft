/**
 * Feature 4 — Annotations (`annotations[]`): reference lines, bands, labeled
 * points and free text.
 *
 * Two decorators share one piece of geometry math:
 *
 * - `chartcraft:annotations-bands` ('under', order 10) paints BANDS beneath the
 *   marks, so a band never hides data;
 * - `chartcraft:annotations-marks` ('over', order 30) paints lines, points and
 *   text above the marks and axis chrome, and owns the `onClick` hook that
 *   emits `annotationclick` (claiming the click so no `pointclick` follows).
 *
 * Everything is clipped to the plot; labels are `theme.textSecondary` over a
 * surface halo. Annotations join the a11y DESCRIPTION (never the data table) —
 * see DEVIATIONS.md §32 for the seam that is missing from the decorator
 * interface and how this module works without it.
 *
 * Axis semantics match the zoom viewport: `axis: 'x'` addresses the DATA x axis
 * and `axis: 'y'` the value axis, whichever screen axis each lands on, so
 * `horizontal: true` charts need no special casing.
 */
import type { Decorator, DecoratorContext } from '../decorate';
import type { Rect } from '../layout';
import type { Annotation, Theme } from '../types';
import type { DataModel } from '../model';
import { formatValue } from '../util';
import {
  clampRect,
  dataScaleOf,
  distanceToSegment,
  drawHaloText,
  isBandScale,
  labelFont,
  pointInRect,
  textRect,
  valueScaleOf,
  type AxesContext,
} from './shared';

/** Click tolerance around a reference line, in px. */
export const LINE_HIT = 4;
/** Click radius for a point annotation, in px. */
export const POINT_HIT = 8;
/** Radius of a point annotation's dot. */
export const POINT_RADIUS = 5;
/** Band fill alpha (drawn under the marks). */
export const BAND_ALPHA = 0.55;
/** Default dash for reference lines — annotations must not read as data. */
export const LINE_DASH: readonly number[] = [5, 4];

// ------------------------------------------------------------------- geometry

/** True when this annotation axis maps onto the screen-x axis. */
export function axisIsScreenX(model: DataModel, axis: 'x' | 'y'): boolean {
  return axis === 'x' ? !model.horizontal : model.horizontal;
}

/** Numeric form of an annotation coordinate (Dates become epoch ms). */
function numeric(v: number | Date | string): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return null;
}

/**
 * Pixel position of an annotation value on one axis, or null when it cannot be
 * placed (unknown category, non-numeric value on a continuous axis, no scale).
 */
export function annotationAxisPx(
  ctx: AxesContext,
  axis: 'x' | 'y',
  value: number | Date | string,
): number | null {
  if (axis === 'y') {
    const n = numeric(value);
    const s = valueScaleOf(ctx);
    return n === null || !s ? null : s.scale(n);
  }
  const s = dataScaleOf(ctx);
  if (!s) return null;
  if (isBandScale(s)) {
    let i: number;
    if (typeof value === 'number') i = value;
    else {
      i = s.indexOf(value);
      if (i < 0) return null;
    }
    if (i < 0 || i >= s.count) return null;
    return s.center(i);
  }
  const n = numeric(value);
  return n === null ? null : s.scale(n);
}

export type AnnotationGeom =
  | { kind: 'line'; index: number; annotation: Annotation; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'band'; index: number; annotation: Annotation; rect: Rect }
  | { kind: 'point'; index: number; annotation: Annotation; cx: number; cy: number }
  | { kind: 'text'; index: number; annotation: Annotation; x: number; y: number };

/**
 * Screen geometry for one annotation, or null when it falls outside the plot
 * (annotations are clipped, never clamped onto the plot edge).
 */
export function annotationGeometry(
  ctx: AxesContext,
  a: Annotation,
  index: number,
): AnnotationGeom | null {
  const plot = ctx.layout.plot;

  if (a.kind === 'line') {
    const px = annotationAxisPx(ctx, a.axis, a.value);
    if (px === null) return null;
    if (axisIsScreenX(ctx.model, a.axis)) {
      if (px < plot.x || px > plot.x + plot.w) return null;
      return { kind: 'line', index, annotation: a, x1: px, y1: plot.y, x2: px, y2: plot.y + plot.h };
    }
    if (px < plot.y || px > plot.y + plot.h) return null;
    return { kind: 'line', index, annotation: a, x1: plot.x, y1: px, x2: plot.x + plot.w, y2: px };
  }

  if (a.kind === 'band') {
    const p0 = annotationAxisPx(ctx, a.axis, a.from);
    const p1 = annotationAxisPx(ctx, a.axis, a.to);
    if (p0 === null || p1 === null) return null;
    const lo = Math.min(p0, p1);
    const hi = Math.max(p0, p1);
    const raw: Rect = axisIsScreenX(ctx.model, a.axis)
      ? { x: lo, y: plot.y, w: hi - lo, h: plot.h }
      : { x: plot.x, y: lo, w: plot.w, h: hi - lo };
    const rect = clampRect(raw, plot);
    return rect ? { kind: 'band', index, annotation: a, rect } : null;
  }

  // point / text: one coordinate on each axis.
  const dataPos = annotationAxisPx(ctx, 'x', a.x);
  const valuePos = annotationAxisPx(ctx, 'y', a.y);
  if (dataPos === null || valuePos === null) return null;
  const cx = ctx.model.horizontal ? valuePos : dataPos;
  const cy = ctx.model.horizontal ? dataPos : valuePos;
  if (!pointInRect(plot, cx, cy)) return null;
  return a.kind === 'point'
    ? { kind: 'point', index, annotation: a, cx, cy }
    : { kind: 'text', index, annotation: a, x: cx, y: cy };
}

/** Geometry for every configured annotation (unplaceable ones are dropped). */
export function annotationGeometries(ctx: AxesContext & { opts: { annotations: Annotation[] } }): AnnotationGeom[] {
  const out: AnnotationGeom[] = [];
  ctx.opts.annotations.forEach((a, i) => {
    const g = annotationGeometry(ctx, a, i);
    if (g) out.push(g);
  });
  return out;
}

// -------------------------------------------------------------------- drawing

function labelColor(theme: Theme): string {
  return theme.textSecondary;
}

function drawLine(ctx: DecoratorContext, g: Extract<AnnotationGeom, { kind: 'line' }>): void {
  const a = g.annotation as Extract<Annotation, { kind: 'line' }>;
  const color = a.color ?? ctx.theme.textSecondary;
  ctx.r.line(g.x1, g.y1, g.x2, g.y2, {
    color,
    width: 1,
    ...(a.dashed === false ? {} : { dash: [...LINE_DASH] }),
  });
  if (!a.label) return;
  const vertical = g.x1 === g.x2;
  const font = labelFont(ctx.theme);
  if (vertical) {
    drawHaloText(ctx.r, a.label, g.x1 + 4, g.y1 + 4, {
      font,
      color: labelColor(ctx.theme),
      surface: ctx.theme.surface,
      fontSize: ctx.theme.fontSize,
      align: 'left',
      baseline: 'top',
    });
  } else {
    drawHaloText(ctx.r, a.label, g.x2 - 4, g.y1 - 4, {
      font,
      color: labelColor(ctx.theme),
      surface: ctx.theme.surface,
      fontSize: ctx.theme.fontSize,
      align: 'right',
      baseline: 'bottom',
    });
  }
}

function drawBand(ctx: DecoratorContext, g: Extract<AnnotationGeom, { kind: 'band' }>): void {
  const a = g.annotation as Extract<Annotation, { kind: 'band' }>;
  ctx.r.rect(g.rect.x, g.rect.y, g.rect.w, g.rect.h, {
    fill: a.color ?? ctx.theme.gridline,
    alpha: BAND_ALPHA,
  });
  if (!a.label) return;
  drawHaloText(ctx.r, a.label, g.rect.x + g.rect.w / 2, g.rect.y + 4, {
    font: labelFont(ctx.theme),
    color: labelColor(ctx.theme),
    surface: ctx.theme.surface,
    fontSize: ctx.theme.fontSize,
    align: 'center',
    baseline: 'top',
  });
}

function drawPoint(ctx: DecoratorContext, g: Extract<AnnotationGeom, { kind: 'point' }>): void {
  const a = g.annotation as Extract<Annotation, { kind: 'point' }>;
  ctx.r.circle(g.cx, g.cy, POINT_RADIUS, {
    fill: a.color ?? ctx.theme.textSecondary,
    stroke: { color: ctx.theme.surface, width: 2 },
  });
  drawHaloText(ctx.r, a.label, g.cx + POINT_RADIUS + 4, g.cy, {
    font: labelFont(ctx.theme),
    color: labelColor(ctx.theme),
    surface: ctx.theme.surface,
    fontSize: ctx.theme.fontSize,
    align: 'left',
    baseline: 'middle',
  });
}

function drawText(ctx: DecoratorContext, g: Extract<AnnotationGeom, { kind: 'text' }>): void {
  const a = g.annotation as Extract<Annotation, { kind: 'text' }>;
  drawHaloText(ctx.r, a.text, g.x, g.y, {
    font: labelFont(ctx.theme),
    color: a.color ?? labelColor(ctx.theme),
    surface: ctx.theme.surface,
    fontSize: ctx.theme.fontSize,
    align: 'center',
    baseline: 'middle',
  });
}

// ------------------------------------------------------------------ hit tests

/** True when (px, py) hits this annotation's geometry. */
export function annotationHit(
  ctx: DecoratorContext,
  g: AnnotationGeom,
  px: number,
  py: number,
): boolean {
  switch (g.kind) {
    case 'line':
      return distanceToSegment(px, py, g.x1, g.y1, g.x2, g.y2) <= LINE_HIT;
    case 'band':
      return pointInRect(g.rect, px, py);
    case 'point':
      return Math.hypot(px - g.cx, py - g.cy) <= POINT_HIT;
    case 'text': {
      const a = g.annotation as Extract<Annotation, { kind: 'text' }>;
      const font = labelFont(ctx.theme);
      const box = textRect(ctx.r.measure(a.text, font), ctx.theme.fontSize, g.x, g.y, 'center', 'middle');
      return pointInRect(box, px, py, 2);
    }
  }
}

/**
 * Topmost annotation under the pointer: marks (line/point/text) beat bands,
 * later entries beat earlier ones (they paint on top).
 */
export function annotationAt(ctx: DecoratorContext, px: number, py: number): AnnotationGeom | null {
  const geoms = annotationGeometries(ctx);
  const marks = geoms.filter((g) => g.kind !== 'band');
  for (let i = marks.length - 1; i >= 0; i--) {
    const g = marks[i];
    if (g && annotationHit(ctx, g, px, py)) return g;
  }
  const bands = geoms.filter((g) => g.kind === 'band');
  for (let i = bands.length - 1; i >= 0; i--) {
    const g = bands[i];
    if (g && annotationHit(ctx, g, px, py)) return g;
  }
  return null;
}

// ------------------------------------------------------------- a11y description

/** Sentence describing the configured annotations (for the a11y description). */
export function describeAnnotations(annotations: readonly Annotation[]): string {
  if (annotations.length === 0) return '';
  const parts = annotations.map((a) => {
    switch (a.kind) {
      case 'line':
        return `reference line at ${a.axis} ${formatValue(a.value)}${a.label ? ` labeled ${a.label}` : ''}`;
      case 'band':
        return `band on ${a.axis} from ${formatValue(a.from)} to ${formatValue(a.to)}${a.label ? ` labeled ${a.label}` : ''}`;
      case 'point':
        return `point at ${formatValue(a.x)}, ${formatValue(a.y)} labeled ${a.label}`;
      case 'text':
        return `text "${a.text}" at ${formatValue(a.x)}, ${formatValue(a.y)}`;
    }
  });
  const n = annotations.length;
  return `${n} ${n === 1 ? 'annotation' : 'annotations'}: ${parts.join('; ')}.`;
}

// ----------------------------------------------------------------- decorators

function applies(ctx: DecoratorContext): boolean {
  return ctx.opts.annotations.length > 0 && ctx.def.needs.cartesianAxes;
}

/** Bands: beneath the marks. */
export const annotationBandsDecorator: Decorator = {
  id: 'chartcraft:annotations-bands',
  layer: 'under',
  order: 10,
  appliesTo: applies,
  draw(ctx) {
    const plot = ctx.plot;
    const bands = annotationGeometries(ctx).filter(
      (g): g is Extract<AnnotationGeom, { kind: 'band' }> => g.kind === 'band',
    );
    if (bands.length === 0) return;
    ctx.r.clipRect(plot.x, plot.y, plot.w, plot.h, () => {
      for (const g of bands) drawBand(ctx, g);
    });
  },
};

/** Lines, points and text: above the marks. Owns the click + a11y description. */
export const annotationMarksDecorator: Decorator = {
  id: 'chartcraft:annotations-marks',
  layer: 'over',
  order: 30,
  appliesTo: applies,

  draw(ctx) {
    const plot = ctx.plot;
    const geoms = annotationGeometries(ctx).filter((g) => g.kind !== 'band');
    if (geoms.length > 0) {
      ctx.r.clipRect(plot.x, plot.y, plot.w, plot.h, () => {
        for (const g of geoms) {
          if (g.kind === 'line') drawLine(ctx, g);
          else if (g.kind === 'point') drawPoint(ctx, g);
          else if (g.kind === 'text') drawText(ctx, g);
        }
      });
    }
  },

  /**
   * "Annotations are included in the a11y description" — through the pipeline's
   * `a11yDescription` seam, which concatenates `a11y.description`, the chart
   * type's own description and every decorator's into the ONE node the canvas
   * points at. No private hidden node, no extra `aria-describedby` token, and
   * the caller's own description is never clobbered.
   */
  a11yDescription(ctx) {
    return describeAnnotations(ctx.opts.annotations) || null;
  },

  onClick(ctx, px, py) {
    const g = annotationAt(ctx, px, py);
    if (!g) return false;
    ctx.emit('annotationclick', { index: g.index, annotation: g.annotation });
    return true;
  },

};
