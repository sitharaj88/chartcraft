/**
 * Area marks: translucent fill between line and baseline (or stack bounds),
 * with a 2px line on the upper edge and optional markers, same as line.
 */
import type { RenderContext } from '../layout';
import { seriesColor } from '../model';
import { areaPath, linePath } from './curves';
import { MARKER_RADIUS, MARKER_RING, markersVisible } from './line';

export const AREA_FILL_ALPHA = 0.24;

export function renderArea(ctx: RenderContext): void {
  const { r, theme, model, layout, pos, hover } = ctx;
  r.clipRect(layout.plot.x, layout.plot.y - MARKER_RADIUS - 2, layout.plot.w, layout.plot.h + 2 * (MARKER_RADIUS + 2), () => {
    model.series.forEach((s, si) => {
      if (!s.visible) return;
      const pts = pos[si];
      if (!pts || pts.length === 0) return;
      const color = seriesColor(s, theme);
      const fill = areaPath(pts, s.curve);
      if (fill.length > 0) r.path(fill, { fill: color, alpha: AREA_FILL_ALPHA });
      const stroke = linePath(pts, s.curve);
      if (stroke.length > 0) {
        r.path(stroke, { stroke: { color, width: s.lineWidth, join: 'round', cap: 'round' } });
      }
      if (markersVisible(s, pts.length)) {
        for (const p of pts) {
          if (!p) continue;
          r.circle(p.x, p.y, MARKER_RADIUS, {
            fill: color,
            stroke: { color: theme.surface, width: MARKER_RING },
          });
        }
      }
      if (hover && (hover.si === si || ctx.opts.tooltip.shared)) {
        const hp = pts[hover.pi];
        if (hp) {
          r.circle(hp.x, hp.y, MARKER_RADIUS + 1.5, {
            fill: color,
            stroke: { color: theme.surface, width: MARKER_RING },
          });
        }
      }
    });
  });
}
