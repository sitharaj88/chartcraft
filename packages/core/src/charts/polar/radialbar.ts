/**
 * Radial bar chart-type definition (v0.3 contract).
 *
 * Concentric arcs from `radialbar.innerRadius` (0..1 of the outer radius,
 * default 0.3) outward. One TRACK per (category x visible series) pair in
 * category-major order, so the common single-series shape ("`categories` +
 * one value each") yields exactly one track per category, and the multi-series
 * shape ("or series") groups a track per series inside each category.
 *
 * - Track band: an optional full-circle ring at `theme.gridline` per
 *   `radialbar.track` (default true), with the value arc drawn on top.
 * - Value arcs start at 12 o'clock and sweep clockwise by
 *   `value / maxValue` of a full turn (`radialbar.maxValue` defaults to the
 *   data max). Arc thickness and inter-track gaps are COMPUTED to fit the
 *   available band, so any number of tracks (1..n) fills [rInner, rOuter]
 *   exactly and never overlaps.
 * - Colors: one visible series -> categorical slot per category (the arcs are
 *   the categories); several visible series -> the series' palette slot, so
 *   color keeps meaning series identity.
 * - Direct labels sit at the arc STARTS (just inside 12 o'clock) in ink
 *   colors, and are SELECTIVE: when radial spacing is tighter than a line of
 *   text, only every `labelStride`-th track is labeled.
 *
 * All geometry is pure and exported for unit tests.
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
import { clamp01, polarToCartesian } from '../radial/polar';

/** Arcs start at 12 o'clock (canvas angles: -PI/2) and sweep clockwise. */
export const RADIALBAR_START_ANGLE = -Math.PI / 2;
/** `radialbar.innerRadius` default: 30% of the outer radius. */
export const RADIALBAR_DEFAULT_INNER_RADIUS = 0.3;
/** Desired gap between adjacent tracks; shrinks when tracks must fit. */
export const RADIALBAR_TRACK_GAP = 4;
/** Arc thickness never drops below this while a gap can still be given up. */
export const RADIALBAR_MIN_THICKNESS = 2;
/** Padding between the outermost arc and the plot edge. */
export const RADIALBAR_EDGE_PAD = 2;
/** Gap between a track's label and its arc start. */
export const RADIALBAR_LABEL_GAP = 6;

// ---------------------------------------------------------------------------
// Band fitting (pure)

export interface RadialBand {
  rInner: number;
  rOuter: number;
}

export interface RadialBandFit {
  /** Radial thickness of every arc (identical for all tracks). */
  thickness: number;
  /** Radial gap between adjacent tracks (0 when the band is too tight). */
  gap: number;
  /** Bands from the OUTERMOST (index 0) inward. */
  bands: RadialBand[];
}

/**
 * Fit `n` concentric tracks into the radial band [r0, r1].
 *
 * The gap is the desired one, reduced (down to 0) only as far as needed to
 * keep every arc at least `RADIALBAR_MIN_THICKNESS` thick; the thickness then
 * absorbs the remainder, so `n * thickness + (n - 1) * gap === r1 - r0`
 * exactly: the tracks always fill the band and can never overlap.
 */
export function radialBarBands(
  n: number,
  r0: number,
  r1: number,
  desiredGap = RADIALBAR_TRACK_GAP,
): RadialBandFit {
  if (n <= 0) return { thickness: 0, gap: 0, bands: [] };
  const total = Math.max(0, r1 - r0);
  let gap = 0;
  if (n > 1) {
    // Largest gap that still leaves MIN thickness for every track.
    const maxGap = (total - n * RADIALBAR_MIN_THICKNESS) / (n - 1);
    gap = Math.max(0, Math.min(desiredGap, maxGap));
  }
  const thickness = (total - gap * (n - 1)) / n;
  const bands: RadialBand[] = [];
  for (let i = 0; i < n; i++) {
    const rOuter = r1 - i * (thickness + gap);
    bands.push({ rInner: rOuter - thickness, rOuter });
  }
  return { thickness, gap, bands };
}

/**
 * Label selectivity: 1 = label every track, k = label every k-th track when
 * the radial spacing is tighter than one line of text.
 */
export function radialBarLabelStride(spacing: number, fontSize: number): number {
  const need = fontSize + 2;
  if (!(spacing > 0)) return 1;
  if (spacing >= need) return 1;
  return Math.max(1, Math.ceil(need / spacing));
}

// ---------------------------------------------------------------------------
// Frame (pure)

/** One arc: identity (si/pi), value, color and label — geometry excluded. */
export interface RadialBarTrackInput {
  si: number;
  pi: number;
  label: string;
  value: number;
  color: string;
}

export interface RadialBarTrack extends RadialBarTrackInput {
  /** 0 = outermost. */
  index: number;
  rInner: number;
  rOuter: number;
  rMid: number;
  /** Start angle (12 o'clock). */
  a0: number;
  /** End angle of the VALUE arc. */
  a1: number;
  /** End angle of the full-circle track (a0 + 2PI). */
  aFull: number;
  /** Whether this track carries a direct label (selectivity). */
  labelled: boolean;
}

export interface RadialBarFrame {
  cx: number;
  cy: number;
  /** Outer radius of the outermost track. */
  rOuter: number;
  /** Inner radius of the innermost track (= innerRadius * rOuter). */
  rInner: number;
  thickness: number;
  gap: number;
  maxValue: number;
  labelStride: number;
  tracks: RadialBarTrack[];
}

export function computeRadialBarFrame(args: {
  tracks: readonly RadialBarTrackInput[];
  plot: Rect;
  /** 0..1 fraction of the outer radius. */
  innerRadius: number;
  maxValue: number;
  fontSize: number;
  gap?: number;
}): RadialBarFrame {
  const { tracks, plot, innerRadius, maxValue, fontSize } = args;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const rOuter = Math.max(10, Math.min(plot.w, plot.h) / 2 - RADIALBAR_EDGE_PAD);
  const rInner = clamp01(innerRadius) * rOuter;
  const fit = radialBarBands(tracks.length, rInner, rOuter, args.gap ?? RADIALBAR_TRACK_GAP);
  const stride = radialBarLabelStride(fit.thickness + fit.gap, fontSize);
  const max = maxValue > 0 ? maxValue : 1;
  return {
    cx,
    cy,
    rOuter,
    rInner,
    thickness: fit.thickness,
    gap: fit.gap,
    maxValue: max,
    labelStride: stride,
    tracks: tracks.map((t, i) => {
      const band = fit.bands[i] as RadialBand;
      const sweep = clamp01(t.value / max) * Math.PI * 2;
      return {
        ...t,
        index: i,
        rInner: band.rInner,
        rOuter: band.rOuter,
        rMid: (band.rInner + band.rOuter) / 2,
        a0: RADIALBAR_START_ANGLE,
        a1: RADIALBAR_START_ANGLE + sweep,
        aFull: RADIALBAR_START_ANGLE + Math.PI * 2,
        labelled: i % stride === 0,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Track identity from the model

/** Category label for a datum (point label > string x > category > index). */
function categoryLabel(model: DataModel, pi: number, point: { label?: string; x: unknown }): string {
  if (point.label !== undefined) return point.label;
  if (typeof point.x === 'string') return point.x;
  const cat = model.categories?.[pi];
  return cat !== undefined ? formatValue(cat) : String(pi + 1);
}

/**
 * Tracks in draw order (outermost first), category-major: for each category,
 * one track per visible series. Colors are categorical slots by category when
 * a single series is visible, and the series slot otherwise.
 */
export function computeRadialBarTracks(model: DataModel, theme: Theme): RadialBarTrackInput[] {
  const visible: number[] = [];
  model.series.forEach((s, si) => {
    if (s.visible) visible.push(si);
  });
  if (visible.length === 0) return [];
  const single = visible.length === 1;
  const catCount = model.series.reduce(
    (m, s, si) => (visible.includes(si) ? Math.max(m, s.points.length) : m),
    model.categories?.length ?? 0,
  );
  const out: RadialBarTrackInput[] = [];
  for (let pi = 0; pi < catCount; pi++) {
    for (const si of visible) {
      const s = model.series[si];
      const p = s?.points[pi];
      if (!s || !p) continue;
      const cat = categoryLabel(model, pi, p);
      const slots = theme.series;
      const color =
        p.color ?? (single ? (slots[pi % slots.length] ?? '#888888') : seriesColor(s, theme));
      out.push({
        si,
        pi,
        label: single ? cat : `${cat} · ${s.name}`,
        value: p.y === null ? 0 : Math.max(0, p.y),
        color,
      });
    }
  }
  return out;
}

/** Data max over visible series (0 when there is nothing positive). */
export function radialBarDataMax(model: DataModel): number {
  let max = 0;
  for (const s of model.series) {
    if (!s.visible) continue;
    for (const p of s.points) if (p.y !== null && p.y > max) max = p.y;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Validation (raw options — createChart fails fast before any DOM work).

function validateRadialBarOptions(raw: ChartOptions): void {
  const inner = raw.radialbar?.innerRadius;
  if (inner !== undefined && (!Number.isFinite(inner) || inner < 0 || inner >= 1)) {
    throw new Error(
      `@chartcraft/core: radialbar.innerRadius must be a fraction of the outer radius in [0, 1); ` +
        `got ${String(inner)} (default ${RADIALBAR_DEFAULT_INNER_RADIUS}).`,
    );
  }
  const max = raw.radialbar?.maxValue;
  if (max !== undefined && (!Number.isFinite(max) || max <= 0)) {
    throw new Error(
      `@chartcraft/core: radialbar.maxValue must be a positive number; got ${String(max)} ` +
        `(omit it to use the data max).`,
    );
  }
  for (const s of raw.data?.series ?? []) {
    dataValuesOf(s.data).forEach((v, i) => {
      const y = typeof v === 'number' ? v : Array.isArray(v) ? v[1] : v && typeof v === 'object' ? v.y : null;
      if (typeof y === 'number' && y < 0) {
        throw new Error(
          `@chartcraft/core: radialbar values must be >= 0; series "${s.name}" has ${y} at index ${i}. ` +
            `An arc encodes magnitude as angular sweep and cannot show negatives.`,
        );
      }
    });
  }
}

function innerRadiusOf(opts: { radialbar?: ChartOptions['radialbar'] }): number {
  const v = opts.radialbar?.innerRadius;
  return typeof v === 'number' ? clamp01(v) : RADIALBAR_DEFAULT_INNER_RADIUS;
}

function trackVisible(opts: { radialbar?: ChartOptions['radialbar'] }): boolean {
  return opts.radialbar?.track ?? true;
}

/** Frame for a definition context (layout, table, legend, tooltip all agree). */
function frameFor(ctx: DefinitionContext): RadialBarFrame {
  const tracks = computeRadialBarTracks(ctx.model, ctx.theme);
  return computeRadialBarFrame({
    tracks,
    plot: ctx.layout.plot,
    innerRadius: innerRadiusOf(ctx.opts),
    maxValue: ctx.opts.radialbar?.maxValue ?? radialBarDataMax(ctx.model),
    fontSize: ctx.theme.fontSize,
  });
}

// ---------------------------------------------------------------------------

export const radialbarDefinition: ChartTypeDefinition = {
  id: 'radialbar',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    validateRadialBarOptions(raw);
    // Legend "auto": with a single series the arcs ARE the categories, so the
    // policy keys off the arc count (pie's precedent); with several series the
    // generic series >= 2 policy already applies.
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    const seriesCount = (raw.data?.series ?? []).filter((s) => s.visible !== false).length;
    if (rawShow === undefined && seriesCount === 1) {
      const arcs = dataValuesOf(raw.data?.series?.find((s) => s.visible !== false)?.data).length;
      resolved.legend.show = arcs >= 2;
    }
  },

  layout(ctx): TypeGeom {
    const frame = frameFor(ctx);
    // Value arcs are emitted as `slices` so the pipeline's sweep animation
    // (entering slices sweep from the start angle, which IS 12 o'clock here)
    // applies; `extra` carries the authoritative geometry.
    const slices: PieSlice[] = frame.tracks.map((t) => ({
      pi: t.pi,
      a0: t.a0,
      a1: t.a1,
      cx: frame.cx,
      cy: frame.cy,
      r0: t.rInner,
      r1: t.rOuter,
      color: t.color,
      label: t.label,
      value: t.value,
    }));
    const pos: (PointPos | null)[][] = ctx.model.series.map((s, si) => {
      if (!s.visible) return [];
      return s.points.map((_p, pi): PointPos | null => {
        const t = frame.tracks.find((tr) => tr.si === si && tr.pi === pi);
        if (!t) return null;
        // Anchor at the arc's end tip (keyboard tooltip anchor).
        const tip = polarToCartesian(frame.cx, frame.cy, t.rMid, t.a1);
        return { x: tip.x, y: tip.y, y0: tip.y };
      });
    });
    return { pos, slices, bars: null, extra: frame };
  },

  render(ctx: RenderContext): void {
    const { r, theme: t, geom, hover, opts } = ctx;
    const frame = geom.extra as RadialBarFrame | undefined;
    if (!frame || frame.tracks.length === 0) return;
    const showTrack = trackVisible(opts);
    const slices = geom.slices;

    frame.tracks.forEach((track, i) => {
      // Full-circle track at gridline color (recessive), under the value arc.
      if (showTrack) {
        r.sector(frame.cx, frame.cy, track.rInner, track.rOuter, track.a0, track.aFull, {
          fill: t.gridline,
        });
      }
      // Angles come from the (animation-interpolated) slice when present.
      const sl = slices?.[i];
      const a0 = sl ? sl.a0 : track.a0;
      const a1 = sl ? sl.a1 : track.a1;
      if (a1 <= a0) return;
      const hovered = hover !== null && hover.si === track.si && hover.pi === track.pi;
      const alpha = hover && !hovered ? 0.55 : 1;
      r.sector(frame.cx, frame.cy, track.rInner, track.rOuter, a0, a1, {
        fill: track.color,
        alpha,
      });
    });
  },

  /** Direct labels at the arc starts (ink colors) — marks stay in `render`. */
  decorations(ctx: RenderContext, layer): void {
    if (layer !== 'over') return;
    const { r, theme: t, geom } = ctx;
    const frame = geom.extra as RadialBarFrame | undefined;
    if (!frame) return;
    const font = axisTickFont(t);
    for (const track of frame.tracks) {
      if (!track.labelled) continue;
      const start = polarToCartesian(frame.cx, frame.cy, track.rMid, track.a0);
      r.text(track.label, start.x - RADIALBAR_LABEL_GAP, start.y, {
        font,
        color: t.textPrimary,
        align: 'right',
        baseline: 'middle',
      });
    }
  },

  hitTest(ctx, px, py) {
    const frame = ctx.geom.extra as RadialBarFrame | undefined;
    if (!frame || frame.tracks.length === 0) return null;
    const dx = px - frame.cx;
    const dy = py - frame.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // The whole ring is the hit target (larger than the arc mark itself).
    const pad = Math.max(2, frame.gap / 2);
    for (const track of frame.tracks) {
      if (dist >= track.rInner - pad && dist <= track.rOuter + pad) {
        return { si: track.si, pi: track.pi };
      }
    }
    return null;
  },

  legendItems(ctx): LegendItem[] {
    const visible = ctx.model.series.filter((s) => s.visible);
    if (visible.length === 1) {
      // Arcs are the categories: non-toggleable identity entries (pie policy).
      return computeRadialBarTracks(ctx.model, ctx.theme).map((t) => ({
        id: `track:${t.pi}`,
        name: t.label,
        color: t.color,
        visible: true,
        toggleable: false,
      }));
    }
    return ctx.model.series.map((s) => ({
      id: s.id,
      name: s.name,
      color: seriesColor(s, ctx.theme),
      visible: s.visible,
      toggleable: true,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const frame = frameFor(ctx);
    return {
      columns: ['Category', 'Value', '% of max'],
      rows: frame.tracks.map((t) => ({
        header: t.label,
        cells: [
          formatValue(t.value),
          `${roundFP(Math.round((t.value / frame.maxValue) * 1000) / 10)}%`,
        ],
      })),
    };
  },

  keyboardNav(model): NavContext {
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  announce(ctx, pos): string | null {
    const frame = ctx.geom.extra as RadialBarFrame | undefined;
    const track = frame?.tracks.find((t) => t.si === pos.si && t.pi === pos.pi);
    const s = ctx.model.series[pos.si];
    if (!frame || !track || !s) return null;
    const pct = roundFP(Math.round((track.value / frame.maxValue) * 1000) / 10);
    return (
      `${track.label}: ${formatValue(track.value)} (${pct}% of ${formatValue(frame.maxValue)}). ` +
      `${s.name}, arc ${track.index + 1} of ${frame.tracks.length}.`
    );
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const frame = ctx.geom.extra as RadialBarFrame | undefined;
    const track = frame?.tracks.find((t) => t.si === hit.si && t.pi === hit.pi);
    if (frame && track) {
      tp.formattedX = track.label;
      tp.color = track.color;
      const pct = roundFP(Math.round((track.value / frame.maxValue) * 1000) / 10);
      tp.formattedY = `${formatValue(track.value)} · ${pct}% of ${formatValue(frame.maxValue)}`;
    }
    return [tp];
  },
};
