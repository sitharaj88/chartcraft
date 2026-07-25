/**
 * Pie / donut chart-type definitions. Slices are separated by a 2px
 * surface-colored gap (stroked in surface color). Donut hole = 60% of the
 * outer radius. The legend lists slices (non-toggleable) so slice identity
 * never rides on color alone; legend "auto" keys off the slice count.
 */
import type { ChartType, TooltipPoint } from '../types';
import { dataValuesOf } from '../data/normalize';
import type { PieSlice, Rect, RenderContext, TypeGeom } from '../layout';
import { seriesColor, type DataModel } from '../model';
import type { Theme } from '../types';
import type { ChartTypeDefinition, TooltipExtractContext } from './registry';
import type { A11yTableSpec } from '../a11y';
import { sliceAt } from '../interaction/hittest';
import { formatValue } from '../util';

export const DONUT_INNER_RATIO = 0.6;
export const SLICE_GAP = 2;
export const START_ANGLE = -Math.PI / 2;

export interface SliceMeta {
  pi: number;
  label: string;
  color: string;
  value: number;
}

/**
 * Identity of each slice — label, color, value — independent of geometry.
 * Non-positive and null values are skipped (they have no angular extent).
 * The legend consumes this directly so slice identity is never color-alone.
 */
export function computeSliceMeta(model: DataModel, theme: Theme): SliceMeta[] {
  const series = model.series.find((s) => s.visible);
  if (!series) return [];
  const values = series.points.map((p) => (p.y !== null && p.y > 0 ? p.y : 0));
  if (values.reduce((a, b) => a + b, 0) <= 0) return [];

  const metas: SliceMeta[] = [];
  series.points.forEach((p, pi) => {
    const v = values[pi] ?? 0;
    if (v <= 0) return;
    const cat = model.categories?.[pi];
    const label =
      p.label ??
      (typeof p.x === 'string' ? p.x : cat !== undefined ? String(cat instanceof Date ? cat.toDateString() : cat) : String(pi + 1));
    metas.push({
      pi,
      label,
      color: p.color ?? theme.series[metas.length % theme.series.length] ?? seriesColor(series, theme),
      value: v,
    });
  });
  return metas;
}

export function computeSlices(model: DataModel, plot: Rect, theme: Theme): PieSlice[] {
  const metas = computeSliceMeta(model, theme);
  if (metas.length === 0) return [];
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const r1 = Math.max(4, Math.min(plot.w, plot.h) / 2 - 4);
  const r0 = model.type === 'donut' ? r1 * DONUT_INNER_RATIO : 0;
  const total = metas.reduce((a, m) => a + m.value, 0);

  let angle = START_ANGLE;
  return metas.map((m) => {
    const sweep = (m.value / total) * Math.PI * 2;
    const slice: PieSlice = {
      pi: m.pi,
      a0: angle,
      a1: angle + sweep,
      cx,
      cy,
      r0,
      r1,
      color: m.color,
      label: m.label,
      value: m.value,
    };
    angle += sweep;
    return slice;
  });
}

export function renderPie(ctx: RenderContext): void {
  const { r, theme, geom, hover } = ctx;
  const slices = geom.slices;
  if (!slices) return;
  for (const s of slices) {
    const hovered = hover !== null && hover.pi === s.pi;
    const alpha = hover && !hovered ? 0.55 : 1;
    r.sector(s.cx, s.cy, s.r0, hovered ? s.r1 + 3 : s.r1, s.a0, s.a1, {
      fill: s.color,
      stroke: { color: theme.surface, width: SLICE_GAP },
      alpha,
    });
  }
}

// ---------------------------------------------------------------------------
// Definition (shared by pie & donut; the hole ratio keys off model.type).

function makePieDefinition(id: ChartType): ChartTypeDefinition {
  return {
    id,
    needs: { cartesianAxes: false },

    resolveOptions(resolved, raw) {
      // Legend "auto" keys off the slice count (positive slices only).
      const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
      if (rawShow === undefined) {
        const sliceCount = dataValuesOf(raw.data?.series?.[0]?.data).filter((d) => {
          const y =
            typeof d === 'number' ? d : Array.isArray(d) ? d[1] : d && typeof d === 'object' ? d.y : null;
          return typeof y === 'number' && y > 0;
        }).length;
        resolved.legend.show = sliceCount >= 2;
      }
    },

    layout(ctx): TypeGeom {
      return {
        pos: ctx.model.series.map(() => []),
        slices: computeSlices(ctx.model, ctx.layout.plot, ctx.theme),
        bars: null,
      };
    },

    render(ctx) {
      renderPie(ctx);
    },

    hitTest(ctx, px, py) {
      const slices = ctx.geom.slices;
      if (!slices) return null;
      const slice = sliceAt(slices, px, py);
      if (!slice) return null;
      const si = ctx.model.series.findIndex((s) => s.visible);
      return si < 0 ? null : { si, pi: slice.pi };
    },

    legendItems(ctx) {
      // Slices, non-toggleable — slice identity never rides on color alone.
      return computeSliceMeta(ctx.model, ctx.theme).map((sl) => ({
        id: `slice:${sl.pi}`,
        name: sl.label,
        color: sl.color,
        visible: true,
        toggleable: false,
      }));
    },

    a11yTable(ctx): A11yTableSpec {
      const m = ctx.model;
      const series = m.series.find((s) => s.visible) ?? m.series[0];
      const rows: A11yTableSpec['rows'] = [];
      series?.points.forEach((p, pi) => {
        rows.push({
          header: p.label ?? (typeof p.x === 'string' ? p.x : formatValue(m.categories?.[pi] ?? pi)),
          cells: [p.y === null ? '—' : formatValue(p.y)],
        });
      });
      return { columns: ['Slice', 'Value'], rows };
    },

    keyboardNav(model) {
      return {
        seriesCount: model.series.length,
        isVisible: (si) => model.series[si]?.visible ?? false,
        pointCount: (si) => model.series[si]?.points.length ?? 0,
      };
    },

    /**
     * A pie slice is identified by its LABEL and understood by its SHARE, and
     * the pipeline default announcement can supply neither: it reads `x`, which
     * is `null` for the `{ label, y }` data shape the contract admits (so the
     * default announced the point INDEX — "0: 62") and it never computes the
     * share, which is the entire reason a reader is looking at a pie.
     */
    announce(ctx, pos) {
      const metas = computeSliceMeta(ctx.model, ctx.theme);
      const total = metas.reduce((a, m) => a + m.value, 0);
      const idx = metas.findIndex((m) => m.pi === pos.pi);
      const meta = metas[idx];
      if (!meta) {
        // A non-positive / null datum: focusable, never drawn. Say so.
        const p = ctx.model.series[pos.si]?.points[pos.pi];
        const label = p?.label ?? (typeof p?.x === 'string' ? p.x : `Slice ${pos.pi + 1}`);
        return `${label}: no value, not shown.`;
      }
      const share = total > 0 ? ` (${((meta.value / total) * 100).toFixed(1)}%)` : '';
      return `${meta.label}: ${formatValue(meta.value)}${share}. Slice ${idx + 1} of ${metas.length}.`;
    },

    tooltipPoints(ctx: TooltipExtractContext, hit): TooltipPoint[] {
      const tp = ctx.pointFor(hit.si, hit.pi);
      if (!tp) return [];
      const slice = ctx.geom.slices?.find((sl) => sl.pi === hit.pi);
      if (slice) {
        tp.color = slice.color;
        tp.formattedX = slice.label;
      }
      return [tp];
    },
  };
}

export const pieDefinition = makePieDefinition('pie');
export const donutDefinition = makePieDefinition('donut');
