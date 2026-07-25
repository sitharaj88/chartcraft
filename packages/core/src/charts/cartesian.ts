/**
 * Shared cartesian chart-type engine.
 *
 * `makeCartesianDefinition` builds a full ChartTypeDefinition for any chart
 * whose marks are line/bar/area/scatter kinds against pipeline-built x/y
 * scales. The four v0.1 cartesian roots are defined here; `sparkline` reuses
 * the factory with a chrome-free config (see ./sparkline.ts for the
 * one-module-per-type pattern).
 *
 * COMBO: every series carries a resolved mark `kind` (its per-series `type`
 * override or the root type's base kind). Marks render in fixed z-order —
 * areas < bars < lines < scatter — on ONE shared y-axis; stacking applies
 * within same-kind groups only (bar stacks with bar, area with area).
 */
import type { ChartOptions, ChartType, SeriesKind, TooltipPoint } from '../types';
import type {
  ChartTypeDefinition,
  DefinitionContext,
  DefinitionLayoutContext,
  GeomContext,
  TooltipExtractContext,
} from './registry';
import type { ContinuousScale, HoverState, PointPos, RenderContext, TypeGeom } from '../layout';
import type { ResolvedOptions } from '../model';
import { bandIndexFor, seriesColor } from '../model';
import { BandScale } from '../scales/band';
import { formatValue } from '../util';
import { HIT_RADIUS, indicesAtX, nearestByX, nearestPoint } from '../interaction/hittest';
import type { A11yTableSpec } from '../a11y';
import type { LegendItem } from '../components/legend';
import type { NavContext } from '../a11y/keyboard';
import { renderAreaKind } from './area';
import { renderBarKind, BAR_GAP } from './bar';
import { renderLineKind } from './line';
import { renderScatterKind } from './scatter';

/** Paint order for mixed-kind (combo) charts: areas < bars < lines < scatter. */
export const KIND_Z_ORDER: readonly SeriesKind[] = ['area', 'bar', 'line', 'scatter'];

export interface CartesianConfig {
  id: ChartType;
  /** Mark kind for series without a per-series `type` override. */
  baseKind: SeriesKind;
  /** Allow per-series `type` overrides (combo). Default true. */
  combo?: boolean;
  /** Force a category (band) x-axis (bar). */
  bandX?: boolean;
  /** Honor `horizontal: true` (bar). */
  horizontal?: boolean;
  /**
   * Crosshair-capable: `tooltip.shared` defaults to true, shared hovers use
   * nearest-by-x and a dashed crosshair is drawn (line/area/sparkline).
   */
  sharedTooltip?: boolean;
  /** Chrome-free preset (sparkline): no axis chrome drawn by the pipeline. */
  chromeFree?: boolean;
  /** Extra per-type option resolution, applied after the factory's own. */
  resolveOptions?(resolved: ResolvedOptions, raw: ChartOptions): void;
}

/** Indices of visible series of one kind, in model order. */
function kindIndices(ctx: { model: DefinitionContext['model'] }, kind: SeriesKind): number[] {
  const out: number[] = [];
  ctx.model.series.forEach((s, si) => {
    if (s.visible && s.kind === kind) out.push(si);
  });
  return out;
}

function computeGeom(ctx: DefinitionLayoutContext): TypeGeom {
  const { model: m, layout: L } = ctx;
  const horizontal = m.horizontal;
  const valueScale = (horizontal ? L.xScale : L.yScale) as ContinuousScale | null;
  const alongScale = horizontal ? L.yScale : L.xScale;
  const bandScale = alongScale instanceof BandScale ? alongScale : null;
  const xCont = bandScale === null ? (alongScale as ContinuousScale | null) : null;
  if (!valueScale) return { pos: m.series.map(() => []), slices: null, bars: null };

  // ---- Bar slot geometry (band or linear x). Bars are laid out first.
  const barIdx = kindIndices(ctx, 'bar');
  let bars: TypeGeom['bars'] = null;
  let offsets: number[] = [];
  const slotOf = new Map<number, number>();
  let groupW = 0;
  if (barIdx.length > 0) {
    const stackedBars = barIdx.some((si) => m.series[si]?.y1 !== undefined);
    const slots = stackedBars ? 1 : barIdx.length;
    if (bandScale) {
      groupW = bandScale.bandwidth();
    } else if (xCont) {
      // Linear/time x: group width from the smallest pixel gap between bar
      // x positions (bars centered on their x value).
      const xs = new Set<number>();
      for (const si of barIdx) {
        for (const p of m.series[si]?.points ?? []) {
          if (p.xv !== null) xs.add(xCont.scale(p.xv));
        }
      }
      const sorted = [...xs].sort((a, b) => a - b);
      let minGap = Infinity;
      for (let i = 1; i < sorted.length; i++) minGap = Math.min(minGap, (sorted[i] as number) - (sorted[i - 1] as number));
      groupW = Number.isFinite(minGap) ? minGap * 0.7 : L.plot.w * 0.5;
      groupW = Math.max(2, Math.min(groupW, L.plot.w));
    }
    const slotW = Math.max(1, (groupW - BAR_GAP * (slots - 1)) / slots);
    offsets = [];
    for (let k = 0; k < slots; k++) offsets.push(k * (slotW + BAR_GAP));
    let slot = 0;
    for (const si of barIdx) slotOf.set(si, stackedBars ? 0 : slot++);
    bars = { barW: slotW };
  }

  // ---- Per-datum positions.
  const pos: (PointPos | null)[][] = m.series.map((s, si) => {
    if (!s.visible) return [];

    if (s.kind === 'bar' && bars) {
      const slot = slotOf.get(si) ?? 0;
      const barW = bars.barW;
      return s.points.map((p, pi): PointPos | null => {
        const yTop = s.y1 ? (s.y1[pi] ?? null) : p.y;
        if (yTop === null) return null;
        const yBottom = s.y0 ? (s.y0[pi] ?? 0) : 0;
        let groupStart: number;
        if (bandScale) {
          groupStart = bandScale.scale(bandIndexFor(m, p.xv, pi));
        } else if (xCont) {
          if (p.xv === null) return null;
          groupStart = xCont.scale(p.xv) - groupW / 2;
        } else {
          return null;
        }
        const center = groupStart + (offsets[slot] ?? 0) + barW / 2;
        const endPx = valueScale.scale(yTop);
        const basePx = s.y1 ? valueScale.scale(yBottom ?? 0) : L.baselinePx;
        return horizontal ? { x: endPx, y: center, y0: basePx } : { x: center, y: endPx, y0: basePx };
      });
    }

    // line / area / scatter marks (vertical only; horizontal forces bar kind).
    return s.points.map((p, pi): PointPos | null => {
      const yVal = s.y1 ? (s.y1[pi] ?? null) : p.y;
      if (yVal === null) return null;
      let x: number;
      if (bandScale) {
        x = bandScale.center(bandIndexFor(m, p.xv, pi));
      } else if (xCont) {
        if (p.xv === null) return null;
        x = xCont.scale(p.xv);
      } else {
        return null;
      }
      const y = valueScale.scale(yVal);
      const y0 = s.y0 ? valueScale.scale(s.y0[pi] ?? 0) : L.baselinePx;
      return { x, y, y0 };
    });
  });

  return { pos, slices: null, bars };
}

/** Full-column band hit (bar spec) restricted to bar-kind series. */
function barHit(ctx: GeomContext, px: number, py: number): HoverState | null {
  const { model: m, layout: L, geom } = ctx;
  const alongScale = m.horizontal ? L.yScale : L.xScale;

  if (alongScale instanceof BandScale) {
    const along = m.horizontal ? py : px;
    const cross = m.horizontal ? px : py;
    const inPlot = m.horizontal
      ? px >= L.plot.x - HIT_RADIUS && px <= L.plot.x + L.plot.w + HIT_RADIUS
      : py >= L.plot.y - HIT_RADIUS && py <= L.plot.y + L.plot.h + HIT_RADIUS;
    if (!inPlot) return null;
    const bandIdx = alongScale.invertIndex(along);
    if (bandIdx < 0) return null;
    // Choose the bar (at this band index) nearest the pointer, preferring
    // bars whose value extent contains the pointer's cross coordinate.
    let best: HoverState | null = null;
    let bestD = Infinity;
    geom.pos.forEach((pts, si) => {
      const s = m.series[si];
      if (!s || s.kind !== 'bar') return;
      for (let pi = 0; pi < pts.length; pi++) {
        const p = pts[pi];
        if (!p) continue;
        if (bandIndexFor(m, s.points[pi]?.xv ?? null, pi) !== bandIdx) continue;
        const center = m.horizontal ? p.y : p.x;
        const valueLo = Math.min(m.horizontal ? p.x : p.y, p.y0);
        const valueHi = Math.max(m.horizontal ? p.x : p.y, p.y0);
        const dAlong = Math.abs(center - along);
        const inside = cross >= valueLo - 2 && cross <= valueHi + 2;
        const d = dAlong + (inside ? 0 : 10000);
        if (d < bestD) {
          bestD = d;
          best = { si, pi };
        }
      }
    });
    return best;
  }

  // Linear/time x: nearest bar center by x within the bar width.
  const masked = m.series.map((s, si) => (s.visible && s.kind === 'bar' ? (geom.pos[si] ?? []) : []));
  const barW = geom.bars?.barW ?? 0;
  return nearestByX(masked, px, Math.max(HIT_RADIUS, barW));
}

export function makeCartesianDefinition(cfg: CartesianConfig): ChartTypeDefinition {
  const shared = (opts: ResolvedOptions): boolean => (cfg.sharedTooltip ?? false) && opts.tooltip.shared;

  return {
    id: cfg.id,
    needs: {
      cartesianAxes: true,
      axisChrome: !cfg.chromeFree,
      xScale: cfg.bandX ? 'band' : 'auto',
      baseKind: cfg.baseKind,
      combo: cfg.combo ?? true,
      stacking: true,
      horizontal: cfg.horizontal ?? false,
      downsample: true,
    },

    resolveOptions(resolved, raw) {
      if (cfg.sharedTooltip) {
        const rawShared =
          typeof raw.tooltip === 'object' && raw.tooltip !== null ? raw.tooltip.shared : undefined;
        if (rawShared === undefined) resolved.tooltip.shared = true;
      }
      cfg.resolveOptions?.(resolved, raw);
    },

    layout(ctx) {
      return computeGeom(ctx);
    },

    render(ctx: RenderContext) {
      const { r, theme: t, opts: o, layout: L } = ctx;
      // Crosshair for shared tooltips (under the marks).
      if (cfg.sharedTooltip && ctx.hover && o.tooltip.shared) {
        const hp = ctx.geom.pos[ctx.hover.si]?.[ctx.hover.pi];
        if (hp) {
          r.line(hp.x, L.plot.y, hp.x, L.plot.y + L.plot.h, { color: t.axisLine, width: 1, dash: [4, 4] });
        }
      }
      // Combo z-order: areas < bars < lines < scatter.
      for (const kind of KIND_Z_ORDER) {
        const idx = kindIndices(ctx, kind);
        if (idx.length === 0) continue;
        if (kind === 'area') renderAreaKind(ctx, idx);
        else if (kind === 'bar') renderBarKind(ctx, idx);
        else if (kind === 'line') renderLineKind(ctx, idx);
        else renderScatterKind(ctx, idx);
      }
    },

    hitTest(ctx, px, py) {
      if (shared(ctx.opts)) return nearestByX(ctx.geom.pos, px);
      // Marker-like kinds first (nearest within 24px), then bar columns.
      const masked = ctx.model.series.map((s, si) =>
        s.visible && s.kind !== 'bar' ? (ctx.geom.pos[si] ?? []) : [],
      );
      const hit = nearestPoint(masked, px, py);
      if (hit) return { si: hit.si, pi: hit.pi };
      return barHit(ctx, px, py);
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
      const o = ctx.opts;
      const xHead =
        o.xAxis.label ?? (m.xType === 'category' ? 'Category' : m.xType === 'time' ? 'Time' : 'X');
      const rows: A11yTableSpec['rows'] = [];
      for (let i = 0; i < m.maxLen; i++) {
        const cat = m.categories?.[i];
        const xVal = cat !== undefined ? cat : (m.series[0]?.points[i]?.x ?? i);
        rows.push({
          header: formatValue(xVal),
          cells: m.series.map((s) => {
            const y = s.points[i]?.y ?? null;
            return y === null ? '—' : formatValue(y);
          }),
        });
      }
      return { columns: [xHead, ...m.series.map((s) => s.name)], rows };
    },

    keyboardNav(model): NavContext {
      return {
        seriesCount: model.series.length,
        isVisible: (si) => model.series[si]?.visible ?? false,
        pointCount: (si) => model.series[si]?.points.length ?? 0,
      };
    },

    tooltipPoints(ctx: TooltipExtractContext, hit): TooltipPoint[] {
      if (shared(ctx.opts)) {
        const anchor = ctx.geom.pos[hit.si]?.[hit.pi];
        if (!anchor) return [];
        const idxs = indicesAtX(ctx.geom.pos, anchor.x);
        const points: TooltipPoint[] = [];
        ctx.model.series.forEach((s, si) => {
          if (!s.visible) return;
          const pi = idxs[si];
          if (pi === null || pi === undefined) return;
          const tp = ctx.pointFor(si, pi);
          if (tp) points.push(tp);
        });
        return points;
      }
      const tp = ctx.pointFor(hit.si, hit.pi);
      return tp ? [tp] : [];
    },
  };
}

// ---------------------------------------------------------------------------
// The four v0.1 cartesian roots as registered definitions.

export const lineDefinition = makeCartesianDefinition({
  id: 'line',
  baseKind: 'line',
  sharedTooltip: true,
});

export const areaDefinition = makeCartesianDefinition({
  id: 'area',
  baseKind: 'area',
  sharedTooltip: true,
});

export const barDefinition = makeCartesianDefinition({
  id: 'bar',
  baseKind: 'bar',
  bandX: true,
  horizontal: true,
});

export const scatterDefinition = makeCartesianDefinition({
  id: 'scatter',
  baseKind: 'scatter',
});
