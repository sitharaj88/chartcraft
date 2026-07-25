/**
 * Funnel chart-type definition (v0.2 contract).
 *
 * - One series of ordered stages `{x: stage, y: value}` (first visible
 *   series; extra series are ignored, as with pie).
 * - Horizontal centered segments, widths proportional to value, separated by
 *   2px surface gaps.
 * - Colors are ordinal steps of the sequential ramp, evenly spaced within the
 *   legal span for N stages: light mode starts at step '#86b6ef' (index 3)
 *   and darkens; dark mode starts at step '#184f95' (index 10) and lightens —
 *   every chosen step clears 2:1 contrast on its surface per the contract.
 * - Stage label + value are rendered directly beside each segment in ink
 *   colors; the legend is hidden always (stages are labeled directly).
 * - Keyboard walks the stages; a11y table = stage, value, % of first stage.
 */
import type { PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont } from '../../layout';
import type { DataModel } from '../../model';
import type { ChartTypeDefinition } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import { sequentialPalette } from '../../theme';
import { formatValue, roundFP } from '../../util';

/** Surface-colored gap between adjacent segments. */
export const FUNNEL_GAP = 2;
/** Gap between a segment's right edge and its label. */
export const FUNNEL_LABEL_GAP = 8;
/** Legal sequential-ramp span (start index -> end index) per color scheme. */
export const FUNNEL_LIGHT_SPAN: readonly [number, number] = [3, 12]; // '#86b6ef' -> darkest
export const FUNNEL_DARK_SPAN: readonly [number, number] = [10, 0]; // '#184f95' -> lightest

/**
 * Ordinal ramp step selection: N evenly spaced sequentialPalette indices
 * within the scheme's legal span, starting at the span's start step.
 */
export function funnelColorIndices(n: number, scheme: 'light' | 'dark'): number[] {
  const [start, end] = scheme === 'dark' ? FUNNEL_DARK_SPAN : FUNNEL_LIGHT_SPAN;
  if (n <= 1) return n === 1 ? [start] : [];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, k) => Math.round(start + k * step));
}

export interface FunnelStage {
  pi: number;
  label: string;
  /** Clamped to >= 0 (null/negative render as zero-width). */
  value: number;
  color: string;
}

/** Stage identity (label, value, ramp color) for the first visible series. */
export function computeFunnelStages(model: DataModel, scheme: 'light' | 'dark'): FunnelStage[] {
  const series = model.series.find((s) => s.visible);
  if (!series) return [];
  const indices = funnelColorIndices(series.points.length, scheme);
  return series.points.map((p, pi) => {
    const cat = model.categories?.[pi];
    const label =
      p.label ??
      (typeof p.x === 'string'
        ? p.x
        : cat !== undefined
          ? String(cat instanceof Date ? cat.toDateString() : cat)
          : String(pi + 1));
    return {
      pi,
      label,
      value: p.y !== null && p.y > 0 ? p.y : 0,
      color: p.color ?? sequentialPalette[indices[pi] ?? 0] ?? '#888888',
    };
  });
}

export interface FunnelSegment extends FunnelStage {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vertical center of the segment. */
  cy: number;
  /** Left edge of the label, beside the segment. */
  labelX: number;
}

/**
 * Segment geometry: horizontal centered bars, widths proportional to value
 * relative to the widest stage, `FUNNEL_GAP`px gaps, `gutter`px reserved on
 * the right for labels.
 */
export function computeFunnelSegments(stages: readonly FunnelStage[], plot: Rect, gutter: number): FunnelSegment[] {
  const n = stages.length;
  if (n === 0) return [];
  const availW = Math.max(10, plot.w - gutter);
  const maxV = stages.reduce((m, s) => Math.max(m, s.value), 0);
  const segH = Math.max(1, (plot.h - FUNNEL_GAP * (n - 1)) / n);
  const cx = plot.x + availW / 2;
  return stages.map((s, i) => {
    const w = maxV > 0 ? (s.value / maxV) * availW : 0;
    const y = plot.y + i * (segH + FUNNEL_GAP);
    return {
      ...s,
      x: cx - w / 2,
      y,
      w,
      h: segH,
      cy: y + segH / 2,
      labelX: cx + w / 2 + FUNNEL_LABEL_GAP,
    };
  });
}

interface FunnelExtra {
  segments: FunnelSegment[];
  si: number;
}

// ---------------------------------------------------------------------------

export const funnelDefinition: ChartTypeDefinition = {
  id: 'funnel',
  needs: { cartesianAxes: false },

  resolveOptions(resolved) {
    // Legend hidden always — stages are labeled directly on the chart.
    resolved.legend.show = false;
  },

  layout(ctx): TypeGeom {
    const { model: m, theme: t, layout: L } = ctx;
    const si = m.series.findIndex((s) => s.visible);
    const stages = computeFunnelStages(m, t.colorScheme);
    const font = axisTickFont(t);
    let maxLabelW = 0;
    for (const s of stages) {
      const w = ctx.measure(s.label, font) + FUNNEL_LABEL_GAP + ctx.measure(formatValue(s.value), font);
      maxLabelW = Math.max(maxLabelW, w);
    }
    const gutter = Math.min(L.plot.w * 0.45, maxLabelW > 0 ? maxLabelW + FUNNEL_LABEL_GAP : 0);
    const segments = computeFunnelSegments(stages, L.plot, gutter);
    const pos: (PointPos | null)[][] = m.series.map((_, i) => {
      if (i !== si) return [];
      return segments.map((seg): PointPos => ({ x: seg.x + seg.w / 2, y: seg.cy, y0: seg.cy }));
    });
    const extra: FunnelExtra = { segments, si };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx: RenderContext) {
    const { r, theme: t, hover } = ctx;
    const extra = ctx.geom.extra as FunnelExtra | undefined;
    if (!extra) return;
    const font = axisTickFont(t);
    for (const seg of extra.segments) {
      const hovered = hover !== null && hover.pi === seg.pi;
      const alpha = hover && !hovered ? 0.55 : 1;
      if (seg.w > 0 && seg.h > 0) {
        r.rect(seg.x, seg.y, seg.w, seg.h, { fill: seg.color, alpha });
      }
      // Stage label + value beside the segment, ink colors (never mark color).
      r.text(seg.label, seg.labelX, seg.cy, { font, color: t.textPrimary, baseline: 'middle' });
      r.text(formatValue(seg.value), seg.labelX + r.measure(seg.label, font) + FUNNEL_LABEL_GAP, seg.cy, {
        font,
        color: t.textSecondary,
        baseline: 'middle',
      });
    }
  },

  hitTest(ctx, px, py) {
    const extra = ctx.geom.extra as FunnelExtra | undefined;
    if (!extra || extra.si < 0) return null;
    for (const seg of extra.segments) {
      if (py < seg.y || py > seg.y + seg.h) continue;
      // Narrow segments keep a generous (>= 24px wide) hit target.
      const cx = seg.x + seg.w / 2;
      const half = Math.max(seg.w / 2 + 2, 12);
      if (px >= cx - half && px <= cx + half) return { si: extra.si, pi: seg.pi };
    }
    return null;
  },

  legendItems() {
    return []; // hidden always — stages carry direct labels
  },

  a11yTable(ctx): A11yTableSpec {
    const stages = computeFunnelStages(ctx.model, ctx.theme.colorScheme);
    const first = stages[0]?.value ?? 0;
    return {
      columns: ['Stage', 'Value', '% of first stage'],
      rows: stages.map((s) => ({
        header: s.label,
        cells: [
          formatValue(s.value),
          first > 0 ? `${roundFP(Math.round((s.value / first) * 1000) / 10)}%` : '—',
        ],
      })),
    };
  },

  keyboardNav(model) {
    // Arrow keys walk the stages of the (single) funnel series.
    const si = model.series.findIndex((s) => s.visible);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  tooltipPoints(ctx, hit) {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const extra = ctx.geom.extra as FunnelExtra | undefined;
    const seg = extra?.segments.find((s) => s.pi === hit.pi);
    if (seg) {
      tp.formattedX = seg.label;
      tp.color = seg.color;
    }
    return [tp];
  },
};
