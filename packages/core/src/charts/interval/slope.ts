/**
 * Slope chart (v0.3). `categories` = 2+ ordered stages, one point per stage
 * per series. STRAIGHT segments only — no smoothing, ever: a slope chart is
 * read as "which line crossed which", and a curve invents crossings that the
 * data does not contain (a per-series `curve` is deliberately ignored).
 *
 * Endpoint dots are >= 8px. Series are labeled DIRECTLY at both ends in ink
 * colors when the labels fit, and the legend is hidden in that case; when they
 * do not fit the labels are dropped wholesale and the legend appears instead.
 *
 * The fit rule (pure, tested — `planSlopeLabels`): labels are used only when
 * EVERY visible series' name fits horizontally in the gutter outside the first
 * and last stage column AND no two labels at the same end sit closer than one
 * line height. The decision needs both text measurement and the plot rect, so
 * it is taken in `layout()` (which the pipeline always runs before it syncs
 * the legend DOM) and applied to `opts.legend.show` only when the caller left
 * the legend on "auto".
 */
import type { TooltipPoint } from '../../types';
import type { ChartTypeDefinition } from '../registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../../layout';
import type { A11yTableSpec } from '../../a11y';
import type { LegendItem } from '../../components/legend';
import type { NavContext } from '../../a11y/keyboard';
import type { ResolvedOptions } from '../../model';
import type { NormalizedPoint } from '../../data/normalize';
import type { PathCmd } from '../../render/renderer';
import { axisTickFont, formatCategory } from '../../layout';
import { bandIndexFor, seriesColor } from '../../model';
import { BandScale } from '../../scales/band';
import { formatValue } from '../../util';
import { HIT_RADIUS, nearestByX, nearestPoint } from '../../interaction/hittest';
import { linePath } from '../curves';
import { DOT_RING, SLOPE_DOT_RADIUS } from './shared';

/** Gap between a stage column and its direct label. */
export const SLOPE_LABEL_GAP = 8;

/** Straight segments only — a slope chart never smooths. */
export function slopeLinePath(pts: readonly (PointPos | null)[]): PathCmd[] {
  return linePath(pts, 'linear');
}

export interface SlopeLabel {
  si: number;
  text: string;
  x: number;
  y: number;
  /** 'right' = the label ENDS at x (left gutter); 'left' = it starts at x. */
  align: 'left' | 'right';
}

export interface SlopeLabelEntry {
  si: number;
  name: string;
  /** Measured text width in px. */
  width: number;
  /** Pixel y of the first stage's datum, or null when it has none. */
  leftY: number | null;
  /** Pixel y of the last stage's datum, or null when it has none. */
  rightY: number | null;
}

export interface SlopeLabelPlan {
  /** True when direct labels are used (and therefore the legend is hidden). */
  fit: boolean;
  /** Placed labels; empty when `fit` is false. */
  labels: SlopeLabel[];
}

/**
 * Decide whether direct end labels fit, and place them.
 *
 * A plan fits when, for every entry that has an endpoint:
 * - the left label (right-aligned, ending `gap` px before the first column)
 *   stays inside `plotLeft`, and the right label (left-aligned, starting
 *   `gap` px after the last column) stays inside `plotRight`;
 * - no two labels at the same end are vertically closer than `lineHeight`.
 *
 * Otherwise NO labels are drawn (selective labeling means all-or-nothing at
 * this scale: half-labeled ends are worse than a legend).
 */
export function planSlopeLabels(args: {
  entries: readonly SlopeLabelEntry[];
  plotLeft: number;
  plotRight: number;
  firstX: number;
  lastX: number;
  lineHeight: number;
  gap?: number;
}): SlopeLabelPlan {
  const gap = args.gap ?? SLOPE_LABEL_GAP;
  const live = args.entries.filter((e) => e.leftY !== null || e.rightY !== null);
  if (live.length === 0) return { fit: false, labels: [] };

  const leftX = args.firstX - gap;
  const rightX = args.lastX + gap;

  for (const e of live) {
    if (e.leftY !== null && leftX - e.width < args.plotLeft) return { fit: false, labels: [] };
    if (e.rightY !== null && rightX + e.width > args.plotRight) return { fit: false, labels: [] };
  }

  const collides = (ys: readonly number[]): boolean => {
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] as number) - (sorted[i - 1] as number) < args.lineHeight) return true;
    }
    return false;
  };
  const leftYs = live.filter((e) => e.leftY !== null).map((e) => e.leftY as number);
  const rightYs = live.filter((e) => e.rightY !== null).map((e) => e.rightY as number);
  if (collides(leftYs) || collides(rightYs)) return { fit: false, labels: [] };

  const labels: SlopeLabel[] = [];
  for (const e of live) {
    if (e.leftY !== null) labels.push({ si: e.si, text: e.name, x: leftX, y: e.leftY, align: 'right' });
    if (e.rightY !== null) labels.push({ si: e.si, text: e.name, x: rightX, y: e.rightY, align: 'left' });
  }
  return { fit: true, labels };
}

interface SlopeExtra {
  labels: SlopeLabel[];
  labelsFit: boolean;
}

/** Stage names for the a11y table / tooltips. */
function stageNames(ctx: { model: { categories: (string | number | Date)[] | null }; opts: ResolvedOptions }): string[] {
  return (ctx.model.categories ?? []).map((c) => formatCategory(c, ctx.opts.xAxis));
}

/** The datum a series places at stage `i` (band index), if any. */
function pointAtStage(
  points: readonly NormalizedPoint[],
  bandIndex: (xv: number | null, pi: number) => number,
  i: number,
): NormalizedPoint | undefined {
  for (let pi = 0; pi < points.length; pi++) {
    const p = points[pi];
    if (p && bandIndex(p.xv, pi) === i) return p;
  }
  return undefined;
}

export const slopeDefinition: ChartTypeDefinition = {
  id: 'slope',
  needs: { cartesianAxes: true, xScale: 'band' },

  resolveOptions(resolved) {
    // Optimistic default: direct labels carry the series names, so no legend.
    // The `resolveLegend` stage flips it back on when the labels do not fit —
    // `legend.auto` records that the caller left the decision to us.
    if (resolved.legend.auto) resolved.legend.show = false;
  },

  layout(ctx): TypeGeom {
    const m = ctx.model;
    const L = ctx.layout;
    const t = ctx.theme;
    const empty: TypeGeom = { pos: m.series.map(() => []), slices: null, bars: null };
    const band = L.xScale instanceof BandScale ? L.xScale : null;
    const ys = L.yScale as ContinuousScale | null;
    if (!band || !ys) return empty;

    const pos: (PointPos | null)[][] = m.series.map((s) => {
      if (!s.visible) return [];
      return s.points.map((p, pi): PointPos | null => {
        if (p.y === null) return null;
        return { x: band.center(bandIndexFor(m, p.xv, pi)), y: ys.scale(p.y), y0: L.baselinePx };
      });
    });

    const stages = Math.max(1, band.count);
    const firstX = band.center(0);
    const lastX = band.center(stages - 1);
    const font = axisTickFont(t);
    const entries: SlopeLabelEntry[] = [];
    m.series.forEach((s, si) => {
      if (!s.visible) return;
      const pts = pos[si] ?? [];
      const last = Math.min(pts.length, stages) - 1;
      entries.push({
        si,
        name: s.name,
        width: ctx.measure(s.name, font),
        leftY: pts[0]?.y ?? null,
        rightY: last >= 0 ? (pts[last]?.y ?? null) : null,
      });
    });

    const plan = planSlopeLabels({
      entries,
      plotLeft: L.plot.x,
      plotRight: L.plot.x + L.plot.w,
      firstX,
      lastX,
      lineHeight: t.fontSize + 2,
    });

    const extra: SlopeExtra = { labels: plan.labels, labelsFit: plan.fit };
    return { pos, slices: null, bars: null, extra };
  },

  /**
   * Legend policy: hidden while the direct end labels do the naming (contract:
   * "no legend when labels fit"). The decision needs the MEASURED plan, so it
   * lives in the pipeline's `resolveLegend` stage — which runs after `layout()`
   * and before the legend DOM is built — and never touches an explicit choice.
   */
  resolveLegend(ctx): boolean | null {
    if (!ctx.opts.legend.auto) return null;
    const extra = ctx.geom.extra as SlopeExtra | undefined;
    if (!extra) return null;
    return !extra.labelsFit;
  },

  render(ctx: RenderContext): void {
    const { r, theme: t, model: m, layout: L, geom, hover } = ctx;
    const pad = SLOPE_DOT_RADIUS + DOT_RING;
    r.clipRect(L.plot.x - pad, L.plot.y - pad, L.plot.w + 2 * pad, L.plot.h + 2 * pad, () => {
      m.series.forEach((s, si) => {
        if (!s.visible) return;
        const pts = geom.pos[si];
        if (!pts || pts.length === 0) return;
        const color = seriesColor(s, t);
        const alpha = hover !== null && hover.si !== si ? 0.35 : 1;
        const cmds = slopeLinePath(pts);
        if (cmds.length > 0) {
          r.path(cmds, { stroke: { color, width: s.lineWidth, join: 'round', cap: 'round' }, alpha });
        }
        for (const p of pts) {
          if (!p) continue;
          r.circle(p.x, p.y, SLOPE_DOT_RADIUS, {
            fill: color,
            stroke: { color: t.surface, width: DOT_RING },
            alpha,
          });
        }
        if (hover !== null && hover.si === si) {
          const hp = pts[hover.pi];
          if (hp) {
            r.circle(hp.x, hp.y, SLOPE_DOT_RADIUS + 1.5, {
              fill: color,
              stroke: { color: t.surface, width: DOT_RING },
            });
          }
        }
      });
    });
  },

  /** Direct series labels at both ends — a type-local overlay, drawn on top. */
  decorations(ctx: RenderContext, layer): void {
    if (layer !== 'over') return;
    const extra = ctx.geom.extra as SlopeExtra | undefined;
    if (!extra || !extra.labelsFit) return;
    const font = axisTickFont(ctx.theme);
    for (const l of extra.labels) {
      // Ink colors, never the mark color (contract's dataviz rules).
      ctx.r.text(l.text, l.x, l.y, {
        font,
        color: ctx.theme.textPrimary,
        align: l.align,
        baseline: 'middle',
      });
    }
  },

  hitTest(ctx, px, py): HoverState | null {
    const L = ctx.layout;
    if (py < L.plot.y - HIT_RADIUS || py > L.plot.y + L.plot.h + HIT_RADIUS) return null;
    const masked = ctx.model.series.map((s, si) => (s.visible ? (ctx.geom.pos[si] ?? []) : []));
    const near = nearestPoint(masked, px, py);
    if (near) return { si: near.si, pi: near.pi };
    const byX = nearestByX(masked, px);
    return byX ? { si: byX.si, pi: byX.pi } : null;
  },

  legendItems(ctx): LegendItem[] {
    return ctx.model.series.map((s) => ({
      id: s.id,
      name: s.name,
      color: seriesColor(s, ctx.theme),
      visible: s.visible,
      toggleable: true,
    }));
  },

  a11yTable(ctx): A11yTableSpec {
    const m = ctx.model;
    const stages = stageNames(ctx);
    const bandIndex = (xv: number | null, pi: number): number => bandIndexFor(m, xv, pi);
    return {
      columns: ['Series', ...stages],
      rows: m.series.map((s) => ({
        header: s.name,
        cells: stages.map((_, i) => {
          const p = pointAtStage(s.points, bandIndex, i);
          return p && p.y !== null ? formatValue(p.y) : '—';
        }),
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

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const s = ctx.model.series[hit.si];
    const p = s?.points[hit.pi];
    if (s && p) {
      // Change since the previous stage — the whole point of a slope chart.
      const prev = s.points[hit.pi - 1];
      if (prev && prev.y !== null && p.y !== null) {
        const d = p.y - prev.y;
        tp.formattedY = `${formatValue(p.y)} (${d > 0 ? '+' : ''}${formatValue(d)})`;
      }
    }
    return [tp];
  },
};
