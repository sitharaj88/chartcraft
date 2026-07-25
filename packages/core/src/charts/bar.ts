/**
 * Bar marks (grouped / stacked / horizontal).
 * Visual spec: 4px rounded corners on the data end only (baseline corners
 * square); 2px surface-colored gap between adjacent and stacked bars.
 */
import type { RenderContext } from '../layout';
import { seriesColor } from '../model';

export const BAR_RADIUS = 4;
export const BAR_GAP = 2;

export function renderBar(ctx: RenderContext): void {
  const { r, theme, model, layout, pos, hover } = ctx;
  const band = layout.band;
  if (!band) return;
  const barW = band.barW;
  const horizontal = model.horizontal;

  // For stacked bars, find the outermost visible segment per (index, sign) —
  // only that segment gets the rounded data-end corners.
  const outerPos = new Map<number, number>();
  const outerNeg = new Map<number, number>();
  if (model.stacked) {
    model.series.forEach((s, si) => {
      if (!s.visible) return;
      s.points.forEach((p, pi) => {
        if (p.y === null) return;
        if (p.y >= 0) outerPos.set(pi, si);
        else outerNeg.set(pi, si);
      });
    });
  }

  model.series.forEach((s, si) => {
    if (!s.visible) return;
    const pts = pos[si];
    if (!pts) return;
    const color = seriesColor(s, theme);
    pts.forEach((p, pi) => {
      if (!p) return;
      const point = s.points[pi];
      const value = model.stacked ? (s.y1?.[pi] ?? null) : (point?.y ?? null);
      if (value === null) return;
      const positive = model.stacked ? ((point?.y ?? 0) >= 0) : value >= 0;
      // Stacked segments not touching the baseline leave a 2px gap toward it.
      const attached = !model.stacked || (s.y0?.[pi] ?? 0) === 0;
      const isOuter = !model.stacked || (positive ? outerPos.get(pi) : outerNeg.get(pi)) === si;
      const radius = isOuter ? BAR_RADIUS : 0;
      const alpha = hover ? (hover.si === si && hover.pi === pi ? 1 : 0.45) : 1;
      const fillColor = point?.color ?? color;

      if (!horizontal) {
        let top = Math.min(p.y, p.y0);
        let bottom = Math.max(p.y, p.y0);
        if (!attached) {
          if (positive) bottom -= BAR_GAP;
          else top += BAR_GAP;
        }
        const h = Math.max(0, bottom - top);
        if (h <= 0) return;
        const radii: [number, number, number, number] = positive
          ? [radius, radius, 0, 0]
          : [0, 0, radius, radius];
        r.rect(p.x - barW / 2, top, barW, h, { fill: fillColor, radii, alpha });
      } else {
        let left = Math.min(p.x, p.y0);
        let right = Math.max(p.x, p.y0);
        if (!attached) {
          if (positive) left += BAR_GAP;
          else right -= BAR_GAP;
        }
        const w = Math.max(0, right - left);
        if (w <= 0) return;
        const radii: [number, number, number, number] = positive
          ? [0, radius, radius, 0]
          : [radius, 0, 0, radius];
        r.rect(left, p.y - barW / 2, w, barW, { fill: fillColor, radii, alpha });
      }
    });
  });
}
