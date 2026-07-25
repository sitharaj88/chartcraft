/**
 * Nightingale rose (polar area) chart-type definition (v0.3 contract).
 *
 * - `categories` are the sectors; every category gets an EQUAL angular slot
 *   (this is what separates a rose from a pie).
 * - **Radius is proportional to sqrt(value)** — the encoding is area-true, so
 *   a value 4x another gets 2x the radius and 4x the area. Radius-linear
 *   encoding is a bug, not a style choice (contract, "Non-negotiables").
 * - 2px surface-colored gaps between sectors (pie's precedent), sector labels
 *   around the perimeter in `theme.textMuted`.
 * - `rose.startAngle` rotates the first sector; default 12 o'clock.
 * - One series (the first visible one, pie/funnel precedent). Legend lists
 *   sectors, non-toggleable, auto-keyed off the sector count.
 */
import type { ChartOptions, Theme, TooltipPoint } from '../../types';
import { dataValuesOf } from '../../data/normalize';
import type { PieSlice, PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont } from '../../layout';
import { seriesColor, type DataModel } from '../../model';
import type { ChartTypeDefinition, DefinitionContext } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import { formatValue, roundFP } from '../../util';
import { polarToCartesian } from '../radial/polar';

/** Surface-colored gap between adjacent sectors. */
export const ROSE_GAP = 2;
/** Gap between the outer radius and a perimeter label. */
export const ROSE_LABEL_GAP = 8;
/** `rose.startAngle` default: 0 degrees = 12 o'clock. */
export const ROSE_DEFAULT_START_ANGLE = 0;

/**
 * Canvas angle for `rose.startAngle`, which is measured in DEGREES CLOCKWISE
 * FROM 12 O'CLOCK (0 = 12 o'clock, 90 = 3 o'clock).
 */
export function roseStartAngle(degrees: number = ROSE_DEFAULT_START_ANGLE): number {
  const deg = Number.isFinite(degrees) ? degrees : ROSE_DEFAULT_START_ANGLE;
  return -Math.PI / 2 + (deg * Math.PI) / 180;
}

/**
 * **Area-true radius**: `rOuter * sqrt(value / maxValue)`.
 *
 * Sector area = 1/2 * sweep * r^2, and every sector has the same sweep, so
 * area is exactly proportional to `value`. Values <= 0 (and a non-positive
 * max) produce radius 0.
 */
export function roseRadius(value: number, maxValue: number, rOuter: number): number {
  if (!(maxValue > 0) || !(value > 0) || !(rOuter > 0)) return 0;
  return rOuter * Math.sqrt(Math.min(1, value / maxValue));
}

/** Equal-angle slot for sector `i` of `n`, from `start` (canvas angles). */
export function roseSectorAngles(i: number, n: number, start: number): [number, number] {
  if (n <= 0) return [start, start];
  const sweep = (Math.PI * 2) / n;
  const a0 = start + i * sweep;
  return [a0, a0 + sweep];
}

export interface RoseSector {
  pi: number;
  label: string;
  /** Clamped to >= 0; null renders as a zero-radius sector. */
  value: number;
  color: string;
}

/**
 * Sector identity (label, value, categorical color) for the first visible
 * series. Zero/null values keep their angular slot (and their legend/table
 * row) with radius 0 — a rose sector is a category, not a share.
 */
export function computeRoseSectors(model: DataModel, theme: Theme): RoseSector[] {
  const series = model.series.find((s) => s.visible);
  if (!series) return [];
  const slots = theme.series;
  const n = Math.max(series.points.length, model.categories?.length ?? 0);
  const out: RoseSector[] = [];
  for (let pi = 0; pi < n; pi++) {
    const p = series.points[pi];
    const cat = model.categories?.[pi];
    const label =
      p?.label ??
      (typeof p?.x === 'string' ? p.x : cat !== undefined ? formatValue(cat) : String(pi + 1));
    out.push({
      pi,
      label,
      value: p && p.y !== null && p.y > 0 ? p.y : 0,
      color: p?.color ?? slots[pi % slots.length] ?? seriesColor(series, theme),
    });
  }
  return out;
}

export interface RoseFrame {
  cx: number;
  cy: number;
  /** Radius of the largest (max-value) sector. */
  rOuter: number;
  startAngle: number;
  maxValue: number;
  /** Model index of the series supplying the sectors (-1 = none). */
  si: number;
  sectors: (RoseSector & { a0: number; a1: number; r: number })[];
}

export function computeRoseFrame(args: {
  sectors: readonly RoseSector[];
  plot: Rect;
  startAngle: number;
  fontSize: number;
  si: number;
}): RoseFrame {
  const { sectors, plot, startAngle, fontSize, si } = args;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const rOuter = Math.max(10, Math.min(plot.w, plot.h) / 2 - (fontSize + ROSE_LABEL_GAP));
  const maxValue = sectors.reduce((m, s) => Math.max(m, s.value), 0);
  const n = sectors.length;
  return {
    cx,
    cy,
    rOuter,
    startAngle,
    maxValue,
    si,
    sectors: sectors.map((s, i) => {
      const [a0, a1] = roseSectorAngles(i, n, startAngle);
      return { ...s, a0, a1, r: roseRadius(s.value, maxValue, rOuter) };
    }),
  };
}

/** Slices for the pipeline (animated sweep + generic slice plumbing). */
export function computeRoseSlices(frame: RoseFrame): PieSlice[] {
  return frame.sectors.map((s) => ({
    pi: s.pi,
    a0: s.a0,
    a1: s.a1,
    cx: frame.cx,
    cy: frame.cy,
    r0: 0,
    r1: s.r,
    color: s.color,
    label: s.label,
    value: s.value,
  }));
}

// ---------------------------------------------------------------------------
// Validation (raw options — fail fast before any DOM work).

function validateRoseOptions(raw: ChartOptions): void {
  const start = raw.rose?.startAngle;
  if (start !== undefined && !Number.isFinite(start)) {
    throw new Error(
      `@chartcraft/core: rose.startAngle must be a finite number of degrees clockwise from ` +
        `12 o'clock; got ${String(start)}.`,
    );
  }
  for (const s of raw.data?.series ?? []) {
    dataValuesOf(s.data).forEach((v, i) => {
      const y = typeof v === 'number' ? v : Array.isArray(v) ? v[1] : v && typeof v === 'object' ? v.y : null;
      if (typeof y === 'number' && y < 0) {
        throw new Error(
          `@chartcraft/core: rose values must be >= 0; series "${s.name}" has ${y} at index ${i}. ` +
            `A rose encodes magnitude as sector AREA (radius ∝ √value) and cannot show negatives.`,
        );
      }
    });
  }
}

function frameFor(ctx: DefinitionContext): RoseFrame {
  const si = ctx.model.series.findIndex((s) => s.visible);
  return computeRoseFrame({
    sectors: computeRoseSectors(ctx.model, ctx.theme),
    plot: ctx.layout.plot,
    startAngle: roseStartAngle(ctx.opts.rose?.startAngle),
    fontSize: ctx.theme.fontSize,
    si,
  });
}

// ---------------------------------------------------------------------------

export const roseDefinition: ChartTypeDefinition = {
  id: 'rose',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    validateRoseOptions(raw);
    // Legend "auto" keys off the sector count (pie's slice policy).
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawShow === undefined) {
      const first = raw.data?.series?.find((s) => s.visible !== false);
      resolved.legend.show = dataValuesOf(first?.data).length >= 2;
    }
  },

  layout(ctx): TypeGeom {
    const frame = frameFor(ctx);
    const pos: (PointPos | null)[][] = ctx.model.series.map((s, si) => {
      if (si !== frame.si || !s.visible) return [];
      return s.points.map((_p, pi): PointPos | null => {
        const sec = frame.sectors[pi];
        if (!sec) return null;
        // Anchor at the mid-angle, mid-radius point of the sector.
        const mid = polarToCartesian(frame.cx, frame.cy, sec.r / 2, (sec.a0 + sec.a1) / 2);
        return { x: mid.x, y: mid.y, y0: frame.cy };
      });
    });
    return { pos, slices: computeRoseSlices(frame), bars: null, extra: frame };
  },

  render(ctx: RenderContext): void {
    const { r, theme: t, geom, hover } = ctx;
    const frame = geom.extra as RoseFrame | undefined;
    if (!frame) return;
    const slices = geom.slices ?? [];
    slices.forEach((sl, i) => {
      if (sl.r1 <= 0) return;
      const sec = frame.sectors[i];
      const hovered = hover !== null && hover.pi === sl.pi;
      const alpha = hover && !hovered ? 0.55 : 1;
      r.sector(sl.cx, sl.cy, 0, hovered ? sl.r1 + 3 : sl.r1, sl.a0, sl.a1, {
        fill: sec?.color ?? sl.color,
        // 2px surface gap between adjacent sectors.
        stroke: { color: t.surface, width: ROSE_GAP },
        alpha,
      });
    });
  },

  /** Sector labels around the perimeter — marks stay in `render`. */
  decorations(ctx: RenderContext, layer): void {
    if (layer !== 'over') return;
    const { r, theme: t, geom } = ctx;
    const frame = geom.extra as RoseFrame | undefined;
    if (!frame) return;
    const font = axisTickFont(t);
    for (const sec of frame.sectors) {
      const a = (sec.a0 + sec.a1) / 2;
      const p = polarToCartesian(frame.cx, frame.cy, frame.rOuter + ROSE_LABEL_GAP, a);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      r.text(sec.label, p.x, p.y, {
        font,
        color: t.textMuted,
        align: Math.abs(cos) < 0.35 ? 'center' : cos > 0 ? 'left' : 'right',
        baseline: Math.abs(sin) < 0.35 ? 'middle' : sin > 0 ? 'top' : 'bottom',
      });
    }
  },

  hitTest(ctx, px, py) {
    const frame = ctx.geom.extra as RoseFrame | undefined;
    if (!frame || frame.si < 0) return null;
    const dx = px - frame.cx;
    const dy = py - frame.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);
    while (angle < frame.startAngle) angle += Math.PI * 2;
    while (angle >= frame.startAngle + Math.PI * 2) angle -= Math.PI * 2;
    for (const sec of frame.sectors) {
      if (angle < sec.a0 || angle > sec.a1) continue;
      // Hit target is a little larger than the mark (never smaller).
      return dist <= sec.r + 2 ? { si: frame.si, pi: sec.pi } : null;
    }
    return null;
  },

  legendItems(ctx): LegendItem[] {
    // Sectors, non-toggleable — sector identity never rides on color alone.
    return computeRoseSectors(ctx.model, ctx.theme).map((s) => ({
      id: `sector:${s.pi}`,
      name: s.label,
      color: s.color,
      visible: true,
      toggleable: false,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const frame = frameFor(ctx);
    const total = frame.sectors.reduce((a, s) => a + s.value, 0);
    return {
      columns: ['Sector', 'Value', '% of total'],
      rows: frame.sectors.map((s) => ({
        header: s.label,
        cells: [
          formatValue(s.value),
          total > 0 ? `${roundFP(Math.round((s.value / total) * 1000) / 10)}%` : '—',
        ],
      })),
    };
  },

  keyboardNav(model): NavContext {
    // Arrow keys walk the sectors of the (single) rose series, clockwise.
    const si = model.series.findIndex((s) => s.visible);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos): string | null {
    const frame = ctx.geom.extra as RoseFrame | undefined;
    const sec = frame?.sectors.find((s) => s.pi === pos.pi);
    if (!frame || !sec) return null;
    return `${sec.label}: ${formatValue(sec.value)}. Sector ${pos.pi + 1} of ${frame.sectors.length}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const frame = ctx.geom.extra as RoseFrame | undefined;
    const sec = frame?.sectors.find((s) => s.pi === hit.pi);
    if (sec) {
      tp.formattedX = sec.label;
      tp.color = sec.color;
      tp.formattedY = formatValue(sec.value);
    }
    return [tp];
  },
};
