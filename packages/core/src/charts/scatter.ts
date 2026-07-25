/**
 * Scatter marks: >= 8px diameter circles with a 2px surface ring.
 */
import type { RenderContext } from '../layout';
import { seriesColor } from '../model';
import { MARKER_RADIUS, MARKER_RING } from './line';

export function renderScatter(ctx: RenderContext): void {
  const { r, theme, model, layout, pos, hover } = ctx;
  const pad = MARKER_RADIUS + 4;
  r.clipRect(layout.plot.x - pad, layout.plot.y - pad, layout.plot.w + 2 * pad, layout.plot.h + 2 * pad, () => {
    model.series.forEach((s, si) => {
      if (!s.visible) return;
      const pts = pos[si];
      if (!pts) return;
      const color = seriesColor(s, theme);
      pts.forEach((p, pi) => {
        if (!p) return;
        const hovered = hover !== null && hover.si === si && hover.pi === pi;
        const alpha = hover && !hovered ? 0.55 : 1;
        r.circle(p.x, p.y, hovered ? MARKER_RADIUS + 2 : MARKER_RADIUS, {
          fill: s.points[pi]?.color ?? color,
          stroke: { color: theme.surface, width: MARKER_RING },
          alpha,
        });
      });
    });
  });
}
