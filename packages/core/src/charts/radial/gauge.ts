/**
 * Gauge chart-type definition (v0.2 contract).
 *
 * - Single value: the first visible series' first point.
 * - 270° arc with the gap at the bottom (start 135°, sweep 270° clockwise).
 * - Track in `theme.gridline`; the value arc fills in `theme.series[0]`
 *   unless `gauge.bands` is given — then the track shows the band colors and
 *   the value arc takes the color of the band the value falls in.
 * - Big center value in `textPrimary` at 3x the base font size (canvas
 *   default numerals are proportional figures); min/max labels in
 *   `textMuted` at the arc ends. The subtitle carries units (pipeline-drawn).
 * - NO legend, ever. Keyboard: a single focusable datum announcing the value
 *   and range; a11y table = one row (name, value, min, max).
 */
import type { PointPos, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont } from '../../layout';
import type { ChartTypeDefinition } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import { formatValue } from '../../util';
import { clamp01, polarToCartesian } from './polar';

/** Arc start: 135° (bottom-left), canvas angle convention. */
export const GAUGE_START_ANGLE = (3 * Math.PI) / 4;
/** 270° sweep, clockwise through the top; the 90° gap sits at the bottom. */
export const GAUGE_SWEEP = (3 * Math.PI) / 2;
export const GAUGE_END_ANGLE = GAUGE_START_ANGLE + GAUGE_SWEEP;
export const GAUGE_DEFAULT_MIN = 0;
export const GAUGE_DEFAULT_MAX = 100;
/** Ring thickness as a fraction of the outer radius (min 8px). */
export const GAUGE_THICKNESS_RATIO = 0.15;

export interface GaugeBand {
  to: number;
  color: string;
}

/** Angle for a value on the arc (clamped into [min, max]). */
export function gaugeValueAngle(value: number, min: number, max: number): number {
  const span = max - min;
  const frac = span > 0 ? clamp01((value - min) / span) : 0;
  return GAUGE_START_ANGLE + frac * GAUGE_SWEEP;
}

export interface GaugeBandSegment {
  from: number;
  to: number;
  a0: number;
  a1: number;
  color: string;
}

/** Band value ranges mapped to arc segments (clamped, in declaration order). */
export function gaugeBandSegments(bands: readonly GaugeBand[], min: number, max: number): GaugeBandSegment[] {
  const out: GaugeBandSegment[] = [];
  let from = min;
  for (const b of bands) {
    const to = Math.min(Math.max(b.to, from), max);
    if (to > from) {
      out.push({
        from,
        to,
        a0: gaugeValueAngle(from, min, max),
        a1: gaugeValueAngle(to, min, max),
        color: b.color,
      });
    }
    from = Math.max(from, to);
    if (from >= max) break;
  }
  return out;
}

/** Color of the band a value falls in (first band with value <= to). */
export function gaugeBandColor(bands: readonly GaugeBand[], value: number, fallback: string): string {
  for (const b of bands) {
    if (value <= b.to) return b.color;
  }
  const last = bands[bands.length - 1];
  return last ? last.color : fallback;
}

export interface GaugeFrame {
  cx: number;
  cy: number;
  r0: number;
  r1: number;
  min: number;
  max: number;
  /** null = no visible series / no data. */
  value: number | null;
  valueAngle: number;
  /** Model index of the series supplying the value (-1 = none). */
  si: number;
}

export function computeGaugeFrame(args: {
  value: number | null;
  min: number;
  max: number;
  plot: { x: number; y: number; w: number; h: number };
  si: number;
}): GaugeFrame {
  const { value, min, max, plot, si } = args;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const r1 = Math.max(12, Math.min(plot.w, plot.h) / 2 - 2);
  const r0 = Math.max(4, r1 - Math.max(8, r1 * GAUGE_THICKNESS_RATIO));
  return {
    cx,
    cy,
    r0,
    r1,
    min,
    max,
    value,
    valueAngle: value === null ? GAUGE_START_ANGLE : gaugeValueAngle(value, min, max),
    si,
  };
}

function gaugeRange(gauge: { min?: number; max?: number } | undefined): { min: number; max: number } {
  return { min: gauge?.min ?? GAUGE_DEFAULT_MIN, max: gauge?.max ?? GAUGE_DEFAULT_MAX };
}

// ---------------------------------------------------------------------------

export const gaugeDefinition: ChartTypeDefinition = {
  id: 'gauge',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    // No legend, ever (a gauge shows a single labeled value).
    resolved.legend.show = false;
    const { min, max } = gaugeRange(raw.gauge);
    if (!(max > min)) {
      throw new Error(
        `@chartcraft/core: gauge requires max > min; got min ${min}, max ${max} ` +
          `(defaults are 0..100 — set gauge: { min, max } to change the range).`,
      );
    }
  },

  layout(ctx): TypeGeom {
    const { model: m, layout: L } = ctx;
    const { min, max } = gaugeRange(ctx.opts.gauge);
    const si = m.series.findIndex((s) => s.visible && s.points.length > 0);
    const value = si >= 0 ? (m.series[si]?.points[0]?.y ?? null) : null;
    const frame = computeGaugeFrame({ value, min, max, plot: L.plot, si });
    // Anchor datum at the tip of the value arc (keyboard tooltip anchor).
    const pos: (PointPos | null)[][] = m.series.map((_, i) => {
      if (i !== si || value === null) return [];
      const tip = polarToCartesian(frame.cx, frame.cy, (frame.r0 + frame.r1) / 2, frame.valueAngle);
      return [{ x: tip.x, y: tip.y, y0: tip.y }];
    });
    // Gauge arcs live in `extra`: they have no generic interpolation.
    return { pos, slices: null, bars: null, extra: frame };
  },

  render(ctx: RenderContext) {
    const { r, theme: t, opts } = ctx;
    const f = ctx.geom.extra as GaugeFrame | undefined;
    if (!f) return;
    const bands = opts.gauge?.bands ?? [];

    // Track: band colors when bands are configured, else gridline.
    if (bands.length > 0) {
      const segments = gaugeBandSegments(bands, f.min, f.max);
      for (const seg of segments) {
        r.sector(f.cx, f.cy, f.r0, f.r1, seg.a0, seg.a1, { fill: seg.color, alpha: 0.35 });
      }
      const lastA = segments[segments.length - 1]?.a1 ?? GAUGE_START_ANGLE;
      if (lastA < GAUGE_END_ANGLE - 1e-9) {
        r.sector(f.cx, f.cy, f.r0, f.r1, lastA, GAUGE_END_ANGLE, { fill: t.gridline });
      }
    } else {
      r.sector(f.cx, f.cy, f.r0, f.r1, GAUGE_START_ANGLE, GAUGE_END_ANGLE, { fill: t.gridline });
    }

    // Value arc.
    if (f.value !== null && f.valueAngle > GAUGE_START_ANGLE) {
      const color = bands.length > 0 ? gaugeBandColor(bands, f.value, t.series[0] ?? '#888888') : (t.series[0] ?? '#888888');
      r.sector(f.cx, f.cy, f.r0, f.r1, GAUGE_START_ANGLE, f.valueAngle, { fill: color });
    }

    // Big center value, textPrimary, 3x base size (proportional figures —
    // the canvas default; tabular-nums is never requested here).
    r.text(f.value === null ? '—' : formatValue(f.value), f.cx, f.cy, {
      font: `600 ${t.fontSize * 3}px ${t.fontFamily}`,
      color: t.textPrimary,
      align: 'center',
      baseline: 'middle',
    });

    // Min / max labels in textMuted at the arc ends (inside the bottom gap).
    const font = axisTickFont(t);
    const rl = (f.r0 + f.r1) / 2;
    const pMin = polarToCartesian(f.cx, f.cy, rl, GAUGE_START_ANGLE);
    const pMax = polarToCartesian(f.cx, f.cy, rl, GAUGE_END_ANGLE);
    r.text(formatValue(f.min), pMin.x, pMin.y + 8, { font, color: t.textMuted, align: 'center', baseline: 'top' });
    r.text(formatValue(f.max), pMax.x, pMax.y + 8, { font, color: t.textMuted, align: 'center', baseline: 'top' });
  },

  hitTest(ctx, px, py) {
    const f = ctx.geom.extra as GaugeFrame | undefined;
    if (!f || f.si < 0 || f.value === null) return null;
    const dx = px - f.cx;
    const dy = py - f.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < f.r0 - 12 || dist > f.r1 + 12) return null;
    let a = Math.atan2(dy, dx);
    while (a < GAUGE_START_ANGLE) a += Math.PI * 2;
    if (a > GAUGE_END_ANGLE) return null;
    return { si: f.si, pi: 0 };
  },

  legendItems() {
    return []; // no legend, ever
  },

  a11yTable(ctx): A11yTableSpec {
    const m = ctx.model;
    const { min, max } = gaugeRange(ctx.opts.gauge);
    const s = m.series.find((sr) => sr.visible && sr.points.length > 0) ?? m.series[0];
    const value = s?.points[0]?.y ?? null;
    return {
      columns: ['Name', 'Value', 'Min', 'Max'],
      rows: [
        {
          header: s?.name ?? '—',
          cells: [value === null ? '—' : formatValue(value), formatValue(min), formatValue(max)],
        },
      ],
    };
  },

  /**
   * A gauge is ONE number. "1 series and 1 point" is the least useful thing an
   * accessible name could say about it — the name carries the reading.
   */
  a11ySummary(ctx): string | null {
    const m = ctx.model;
    const { min, max } = gaugeRange(ctx.opts.gauge);
    const s = m.series.find((sr) => sr.visible && sr.points.length > 0) ?? m.series[0];
    const value = s?.points[0]?.y ?? null;
    if (value === null) return `${s?.name ?? 'value'} has no value, range ${formatValue(min)} to ${formatValue(max)}`;
    const pct = max > min ? ` (${Math.round(((value - min) / (max - min)) * 100)}% of the range)` : '';
    return `${s?.name ?? 'value'} is ${formatValue(value)} of ${formatValue(min)} to ${formatValue(max)}${pct}`;
  },

  keyboardNav(model) {
    // A single focusable datum: the value.
    const si = model.series.findIndex((s) => s.visible && s.points.length > 0);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si ? 1 : 0),
    };
  },

  announce(ctx) {
    const f = ctx.geom.extra as GaugeFrame | undefined;
    const s = f && f.si >= 0 ? ctx.model.series[f.si] : undefined;
    if (!f || !s) return null;
    const v = f.value === null ? 'no value' : formatValue(f.value);
    return `${s.name}: ${v}. Range ${formatValue(f.min)} to ${formatValue(f.max)}.`;
  },

  tooltipPoints(ctx, hit) {
    const tp = ctx.pointFor(hit.si, 0);
    if (!tp) return [];
    // A gauge has no meaningful x — the header shows the series name.
    tp.formattedX = tp.seriesName;
    return [tp];
  },
};
