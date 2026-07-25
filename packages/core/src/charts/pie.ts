/**
 * Pie / donut marks. Slices are separated by a 2px surface-colored gap
 * (stroked in surface color). Donut hole = 60% of the outer radius.
 */
import type { PieSlice, Rect, RenderContext } from '../layout';
import { seriesColor, type DataModel } from '../model';
import type { Theme } from '../types';

export const DONUT_INNER_RATIO = 0.6;
export const SLICE_GAP = 2;
export const START_ANGLE = -Math.PI / 2;

/**
 * Compute slice geometry from the first visible series. Non-positive and
 * null values are skipped (they have no angular extent).
 */
export function computeSlices(model: DataModel, plot: Rect, theme: Theme): PieSlice[] {
  const series = model.series.find((s) => s.visible);
  if (!series) return [];
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const r1 = Math.max(4, Math.min(plot.w, plot.h) / 2 - 4);
  const r0 = model.type === 'donut' ? r1 * DONUT_INNER_RATIO : 0;

  const values = series.points.map((p) => (p.y !== null && p.y > 0 ? p.y : 0));
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];

  const slices: PieSlice[] = [];
  let angle = START_ANGLE;
  series.points.forEach((p, pi) => {
    const v = values[pi] ?? 0;
    if (v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    const cat = model.categories?.[pi];
    const label =
      p.label ??
      (typeof p.x === 'string' ? p.x : cat !== undefined ? String(cat instanceof Date ? cat.toDateString() : cat) : String(pi + 1));
    slices.push({
      pi,
      a0: angle,
      a1: angle + sweep,
      cx,
      cy,
      r0,
      r1,
      color: p.color ?? theme.series[slices.length % theme.series.length] ?? seriesColor(series, theme),
      label,
      value: v,
    });
    angle += sweep;
  });
  return slices;
}

export function renderPie(ctx: RenderContext): void {
  const { r, theme, slices, hover } = ctx;
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
