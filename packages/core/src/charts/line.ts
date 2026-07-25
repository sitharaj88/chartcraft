/**
 * Line marks: 2px lines (per-series lineWidth), markers >= 8px diameter with
 * a 2px surface ring. showMarkers 'auto' shows markers when count <= 60.
 *
 * Renders every series whose index is listed in `indices` — the cartesian
 * definition passes the line-kind series in combo z-order.
 */
import type { RenderContext } from '../layout';
import { seriesColor, type NormalizedSeries } from '../model';
import { linePath } from './curves';

export const MARKER_RADIUS = 4; // 8px diameter
export const MARKER_RING = 2; // surface ring width

export function markersVisible(s: NormalizedSeries, pointCount: number): boolean {
  if (s.showMarkers === 'auto') return pointCount <= 60;
  return s.showMarkers;
}

export function renderLineKind(ctx: RenderContext, indices: readonly number[]): void {
  const { r, theme, model, layout, geom, hover } = ctx;
  const pos = geom.pos;
  r.clipRect(layout.plot.x - MARKER_RADIUS - 2, layout.plot.y - MARKER_RADIUS - 2, layout.plot.w + 2 * (MARKER_RADIUS + 2), layout.plot.h + 2 * (MARKER_RADIUS + 2), () => {
    for (const si of indices) {
      const s = model.series[si];
      if (!s || !s.visible) continue;
      const pts = pos[si];
      if (!pts || pts.length === 0) continue;
      const color = seriesColor(s, theme);
      const cmds = linePath(pts, s.curve);
      if (cmds.length > 0) {
        r.path(cmds, { stroke: { color, width: s.lineWidth, join: 'round', cap: 'round' } });
      }
      const withMarkers = markersVisible(s, pts.length);
      if (withMarkers) {
        for (const p of pts) {
          if (!p) continue;
          r.circle(p.x, p.y, MARKER_RADIUS, {
            fill: color,
            stroke: { color: theme.surface, width: MARKER_RING },
          });
        }
      }
      // Hover highlight: enlarged marker at the hovered index (crosshair mode
      // highlights every visible series at that index).
      if (hover && (hover.si === si || ctx.opts.tooltip.shared)) {
        const hp = pts[hover.pi];
        if (hp) {
          r.circle(hp.x, hp.y, MARKER_RADIUS + 1.5, {
            fill: color,
            stroke: { color: theme.surface, width: MARKER_RING },
          });
        }
      }
    }
  });
}
