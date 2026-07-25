/**
 * Population-pyramid chart-type definition (v0.3 contract).
 *
 * EXACTLY two series over shared categories, drawn as mirrored horizontal bars
 * around a centered category axis. Any other series count is a hard error —
 * a pyramid with one or three arms is not a pyramid.
 *
 * The classic bug this module refuses to ship: negative tick labels. The left
 * arm is not "negative values", it is the same magnitude scale pointing the
 * other way, so BOTH arms are labeled with ABSOLUTE magnitudes and every value
 * is read as a magnitude (`Math.abs`).
 *
 * Axis option mapping (the pipeline builds no axes for this type):
 * - `yAxis.ticks.format` formats the CATEGORY labels (the vertical axis),
 * - `xAxis.ticks.format` formats the MAGNITUDE labels (the horizontal axis)
 *   and the tooltip value.
 */
import type { TooltipPoint } from '../../types';
import type { HoverState, PointPos, Rect, RenderContext, TypeGeom } from '../../layout';
import { axisTickFont, formatCategory } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { NavContext } from '../../a11y/keyboard';
import type { LegendItem } from '../../components/legend';
import type { DataModel, ResolvedOptions } from '../../model';
import { seriesColor } from '../../model';
import { niceTicks } from '../../scales/linear';
import { formatNumber } from '../../util';
import { BAR_RADIUS } from '../bar';
import type {
  ChartTypeDefinition,
  DefinitionContext,
  DefinitionLayoutContext,
  GeomContext,
  TooltipExtractContext,
} from '../registry';
import { valueAxisOf } from '../registry';
import { COMPOSITION_GAP, extraOf, insetRect } from './shared';

/** Minimum half-width of the centered category gutter, in px. */
export const PYRAMID_MIN_GUTTER = 24;
/** Number of magnitude ticks requested per arm. */
export const PYRAMID_TICK_COUNT = 4;

// ---------------------------------------------------------------------------
// Pure layout math

export interface PyramidArm {
  /** Pixel x of the bar's data end. */
  end: number;
  /** Pixel x of the bar's base (the inner edge of the gutter). */
  base: number;
  /** Left edge of the bar rect. */
  x: number;
  /** Bar width in px (always >= 0). */
  w: number;
}

export interface PyramidRow {
  index: number;
  label: string;
  /** Row center on the category axis. */
  cy: number;
  /** Bar height (row height minus the 2px gap). */
  h: number;
  left: PyramidArm;
  right: PyramidArm;
}

export interface PyramidLayout {
  rows: PyramidRow[];
  /** Center of the category gutter. */
  center: number;
  /** Half the gutter width. */
  gutterHalf: number;
  /** Pixel length available to each arm. */
  armWidth: number;
  /** Magnitude that fills an arm. */
  maxMagnitude: number;
  rect: Rect;
}

export interface PyramidInput {
  rect: Rect;
  labels: readonly string[];
  /** Left-arm magnitudes (series A), index-aligned to `labels`. */
  left: readonly (number | null)[];
  /** Right-arm magnitudes (series B). */
  right: readonly (number | null)[];
  /** Full gutter width reserved for the centered category labels. */
  gutter: number;
  /** Overrides the computed max magnitude (both arms share one scale). */
  maxMagnitude?: number;
  gap?: number;
}

const mag = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.abs(v) : 0;

/** Largest magnitude across both arms (0 when there is no data). */
export function pyramidMaxMagnitude(
  left: readonly (number | null)[],
  right: readonly (number | null)[],
): number {
  let m = 0;
  for (const v of left) m = Math.max(m, mag(v));
  for (const v of right) m = Math.max(m, mag(v));
  return m;
}

/**
 * Mirrored row geometry. The two arms share ONE magnitude scale, so equal
 * magnitudes always produce equal-length bars and the picture is symmetric by
 * construction: `center - left.x === right.x + right.w - center` whenever the
 * magnitudes match.
 */
export function computePyramidLayout(input: PyramidInput): PyramidLayout {
  const { rect, labels } = input;
  const gap = input.gap ?? COMPOSITION_GAP;
  const center = rect.x + rect.w / 2;
  const gutterHalf = Math.max(0, Math.min(input.gutter, rect.w) / 2);
  const armWidth = Math.max(0, rect.w / 2 - gutterHalf);
  const maxMagnitude = input.maxMagnitude ?? pyramidMaxMagnitude(input.left, input.right);

  const n = labels.length;
  const rowH = n > 0 ? rect.h / n : rect.h;
  const barH = Math.max(1, rowH - gap);
  const scale = (v: number | null): number =>
    maxMagnitude > 0 ? (mag(v) / maxMagnitude) * armWidth : 0;

  const leftBase = center - gutterHalf;
  const rightBase = center + gutterHalf;

  const rows: PyramidRow[] = [];
  for (let i = 0; i < n; i++) {
    const cy = rect.y + (i + 0.5) * rowH;
    const lLen = scale(input.left[i] ?? null);
    const rLen = scale(input.right[i] ?? null);
    rows.push({
      index: i,
      label: labels[i] ?? String(i + 1),
      cy,
      h: barH,
      left: { end: leftBase - lLen, base: leftBase, x: leftBase - lLen, w: lLen },
      right: { end: rightBase + rLen, base: rightBase, x: rightBase, w: rLen },
    });
  }

  return { rows, center, gutterHalf, armWidth, maxMagnitude, rect };
}

/** Magnitude ticks for both arms — always non-negative, 0 first. */
export function pyramidTicks(maxMagnitude: number, count = PYRAMID_TICK_COUNT): number[] {
  if (!(maxMagnitude > 0)) return [0];
  const ticks = niceTicks(0, maxMagnitude, count).filter((t) => t >= 0);
  return ticks.length > 0 ? ticks : [0];
}

// ---------------------------------------------------------------------------
// Definition

export interface PyramidGeomExtra {
  grid: Rect;
  layout: PyramidLayout;
  ticks: number[];
  /** Formatted magnitude tick labels (never negative). */
  tickLabels: string[];
  /** MODEL series index of the left arm, then the right arm. */
  arms: [number, number];
}

/**
 * Magnitude formatter. The axis whose `ticks.format` formats VALUES is the
 * pipeline's answer, not a local convention: the definition declares
 * `needs.axes: 'value-x'` and `valueAxisOf` resolves it to `xAxis` — the same
 * lookup `ChartImpl#formatYValue` now uses, so the tooltip and these labels
 * agree without any tooltip post-processing.
 */
function magnitudeFormat(opts: ResolvedOptions): (v: number) => string {
  const fmt = valueAxisOf(pyramidDefinition.needs, opts, false).ticks?.format;
  return fmt ? (v: number) => fmt(v) : formatNumber;
}

function categoryLabels(model: DataModel, opts: ResolvedOptions, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const cat = model.categories?.[i];
    out.push(cat !== undefined ? formatCategory(cat, opts.yAxis) : String(i + 1));
  }
  return out;
}

function valuesOf(model: DataModel, si: number, count: number): (number | null)[] {
  const s = model.series[si];
  const out: (number | null)[] = new Array(count).fill(null);
  if (!s || !s.visible) return out;
  for (let i = 0; i < count; i++) out[i] = s.points[i]?.y ?? null;
  return out;
}

export const pyramidDefinition: ChartTypeDefinition = {
  id: 'pyramid',
  // Own geometry: the category axis is CENTERED, which no pipeline-built
  // cartesian layout expresses. `xScale: 'band'` still declares categorical x
  // data so the model provides categories (and an index fallback).
  // `axes: 'value-x'` declares the MIRRORED arrangement: the category axis is
  // vertical (`yAxis` formats it) and the magnitude axis horizontal (`xAxis`
  // formats values). The pipeline reads it through `valueAxisOf` /
  // `categoryAxisOf`, so tooltips need no per-type compensation.
  needs: { cartesianAxes: false, xScale: 'band', axes: 'value-x' },

  resolveOptions(resolved) {
    const n = resolved.data.series.length;
    if (n !== 2) {
      throw new Error(
        `@chartcraft/core: chart type 'pyramid' requires exactly 2 series (got ${n}). ` +
          `A pyramid mirrors two series (e.g. male/female) around a shared category ` +
          `axis — use 'bar' with horizontal: true for any other series count.`,
      );
    }
  },

  layout(ctx: DefinitionLayoutContext): TypeGeom {
    const { model, theme, opts } = ctx;
    const font = axisTickFont(theme);
    const count = Math.max(model.categories?.length ?? 0, model.maxLen);
    const labels = categoryLabels(model, opts, count);

    const left = valuesOf(model, 0, count);
    const right = valuesOf(model, 1, count);
    const maxMagnitude = pyramidMaxMagnitude(left, right);
    const ticks = pyramidTicks(maxMagnitude);
    const fmt = magnitudeFormat(opts);
    const tickLabels = ticks.map((t) => fmt(t));

    // Bottom margin for the magnitude labels; the gutter is measured from the
    // widest category label so labels never collide with the bars.
    const bottom = theme.fontSize + 8;
    const grid = insetRect(ctx.layout.plot, { bottom });

    let labelW = 0;
    for (const l of labels) labelW = Math.max(labelW, ctx.measure(l, font));
    const gutter = Math.max(PYRAMID_MIN_GUTTER, Math.ceil(labelW) + 12);

    const layout = computePyramidLayout({ rect: grid, labels, left, right, gutter, maxMagnitude });

    // Hidden series contribute no marks (legend toggling keeps working).
    const pos: (PointPos | null)[][] = model.series.map((s) =>
      s.visible ? (new Array(s.points.length).fill(null) as (PointPos | null)[]) : [],
    );
    const arms: [number, number] = [0, 1];
    for (const row of layout.rows) {
      const l = pos[arms[0]];
      const rgt = pos[arms[1]];
      if (l && row.index < l.length) l[row.index] = { x: row.left.end, y: row.cy, y0: row.left.base };
      if (rgt && row.index < rgt.length) {
        rgt[row.index] = { x: row.right.end, y: row.cy, y0: row.right.base };
      }
    }

    const extra: PyramidGeomExtra = { grid, layout, ticks, tickLabels, arms };
    return { pos, slices: null, bars: null, extra };
  },

  /** Magnitude gridlines under the bars; labels above the axis chrome. */
  decorations(ctx: RenderContext, layer): void {
    const { r, theme, geom } = ctx;
    const extra = extraOf<PyramidGeomExtra>(geom);
    if (!extra) return;
    const { layout: L, grid } = extra;
    const font = axisTickFont(theme);
    const stroke = { color: theme.gridline, width: 1 };

    if (layer === 'under') {
      for (const t of extra.ticks) {
        const d = L.maxMagnitude > 0 ? (t / L.maxMagnitude) * L.armWidth : 0;
        for (const x of [L.center - L.gutterHalf - d, L.center + L.gutterHalf + d]) {
          r.line(x, grid.y, x, grid.y + grid.h, stroke);
        }
      }
      return;
    }

    // Magnitude labels — ABSOLUTE on both arms (no negative tick labels).
    extra.ticks.forEach((t, i) => {
      const label = extra.tickLabels[i] ?? '';
      const d = L.maxMagnitude > 0 ? (t / L.maxMagnitude) * L.armWidth : 0;
      for (const x of [L.center - L.gutterHalf - d, L.center + L.gutterHalf + d]) {
        r.text(label, x, grid.y + grid.h + 6, {
          font,
          color: theme.textMuted,
          align: 'center',
          baseline: 'top',
        });
      }
    });

    // Centered category axis.
    for (const row of L.rows) {
      r.text(row.label, L.center, row.cy, {
        font,
        color: theme.textMuted,
        align: 'center',
        baseline: 'middle',
      });
    }
  },

  render(ctx: RenderContext): void {
    const { r, theme, model, geom, hover } = ctx;
    const extra = extraOf<PyramidGeomExtra>(geom);
    if (!extra) return;
    const barH = extra.layout.rows[0]?.h ?? 0;

    extra.arms.forEach((si, armIdx) => {
      const s = model.series[si];
      const pts = geom.pos[si];
      if (!s || !s.visible || !pts) return;
      const color = seriesColor(s, theme);
      pts.forEach((p, pi) => {
        if (!p) return;
        const w = Math.abs(p.x - p.y0);
        if (w <= 0) return;
        const x = Math.min(p.x, p.y0);
        const alpha = hover ? (hover.si === si && hover.pi === pi ? 1 : 0.55) : 1;
        // 4px rounded corners on the DATA end only (the gutter side is square).
        const radii: [number, number, number, number] =
          armIdx === 0
            ? [BAR_RADIUS, 0, 0, BAR_RADIUS]
            : [0, BAR_RADIUS, BAR_RADIUS, 0];
        r.rect(x, p.y - barH / 2, w, barH, {
          fill: s.points[pi]?.color ?? color,
          radii,
          alpha,
        });
      });
    });
  },

  hitTest(ctx: GeomContext, px, py): HoverState | null {
    const extra = extraOf<PyramidGeomExtra>(ctx.geom);
    if (!extra) return null;
    const { layout: L, grid } = extra;
    if (py < grid.y || py > grid.y + grid.h) return null;
    if (px < grid.x || px > grid.x + grid.w) return null;
    const rowH = L.rows.length > 0 ? grid.h / L.rows.length : grid.h;
    const idx = Math.min(L.rows.length - 1, Math.max(0, Math.floor((py - grid.y) / rowH)));
    if (idx < 0 || L.rows.length === 0) return null;
    // Full row band per arm (the bar spec's "full column band", mirrored).
    const si = px < L.center ? extra.arms[0] : extra.arms[1];
    if (!(ctx.model.series[si]?.visible ?? false)) return null;
    if (!ctx.geom.pos[si]?.[idx]) return null;
    return { si, pi: idx };
  },

  legendItems(ctx: DefinitionContext): LegendItem[] {
    // The legend IS the two arms.
    return ctx.model.series.map((s) => ({
      id: s.id,
      name: s.name,
      color: seriesColor(s, ctx.theme),
      visible: s.visible,
      toggleable: true,
    }));
  },

  a11yTable(ctx: DefinitionContext): A11yTableSpec {
    const { model, opts } = ctx;
    const count = Math.max(model.categories?.length ?? 0, model.maxLen);
    const labels = categoryLabels(model, opts, count);
    const fmt = magnitudeFormat(opts);
    const catHead = opts.yAxis.label ?? 'Category';
    const rows: A11yTableSpec['rows'] = [];
    for (let i = 0; i < count; i++) {
      rows.push({
        header: labels[i] ?? String(i + 1),
        cells: model.series.map((s) => {
          const y = s.points[i]?.y ?? null;
          return y === null ? '—' : fmt(Math.abs(y));
        }),
      });
    }
    return { columns: [catHead, ...model.series.map((s) => s.name)], rows };
  },

  keyboardNav(model): NavContext {
    // Left/Right walk categories, Up/Down swap arms.
    return {
      seriesCount: model.series.length,
      isVisible: (si) => model.series[si]?.visible ?? false,
      pointCount: (si) => model.series[si]?.points.length ?? 0,
    };
  },

  announce(ctx, pos): string | null {
    const extra = extraOf<PyramidGeomExtra>(ctx.geom);
    const s = ctx.model.series[pos.si];
    if (!extra || !s) return null;
    const row = extra.layout.rows[pos.pi];
    const y = s.points[pos.pi]?.y ?? null;
    const fmt = magnitudeFormat(ctx.opts);
    const value = y === null ? 'no value' : fmt(Math.abs(y));
    const side = pos.si === extra.arms[0] ? 'left' : 'right';
    return `${row?.label ?? pos.pi + 1}: ${value}. ${s.name}, ${side} arm, ${
      pos.pi + 1
    } of ${extra.layout.rows.length}.`;
  },

  tooltipPoints(ctx: TooltipExtractContext, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    // `formattedX` (the category, via `yAxis`) and the magnitude formatter (via
    // `xAxis`) are both the pipeline's now — `needs.axes: 'value-x'` told it
    // which axis is which. All that remains is the type's OWN rule: a pyramid
    // reads every value as a MAGNITUDE, so a negative arm never prints a
    // negative number.
    if (tp.y !== null && tp.y < 0) tp.formattedY = magnitudeFormat(ctx.opts)(Math.abs(tp.y));
    return [tp];
  },
};
