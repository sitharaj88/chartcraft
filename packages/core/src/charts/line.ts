/**
 * Line marks: 2px lines (per-series lineWidth), markers >= 8px diameter with
 * a 2px surface ring. showMarkers 'auto' shows markers when count <= 60.
 *
 * Renders every series whose index is listed in `indices` — the cartesian
 * definition passes the line-kind series in combo z-order.
 */
import type { RenderContext } from '../layout';
import { seriesColor, seriesDash, seriesMarker, type NormalizedSeries } from '../model';
import { drawMarker } from './markers';
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
      // Composite encoding: series past the validated 8 palette slots reuse a
      // hue, so the dash pattern and marker shape carry their identity instead.
      // Both are no-ops (solid, circle) for every series inside the 8.
      const dash = seriesDash(s, theme);
      const shape = seriesMarker(s, theme);
      const cmds = linePath(pts, s.curve);
      if (cmds.length > 0) {
        r.path(cmds, {
          stroke: { color, width: s.lineWidth, join: 'round', cap: 'round', ...(dash ? { dash } : {}) },
        });
      }
      const withMarkers = markersVisible(s, pts.length);
      if (withMarkers) {
        for (const p of pts) {
          if (!p) continue;
          drawMarker(r, shape, p.x, p.y, MARKER_RADIUS, {
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
          drawMarker(r, shape, hp.x, hp.y, MARKER_RADIUS + 1.5, {
            fill: color,
            stroke: { color: theme.surface, width: MARKER_RING },
          });
        }
      }
    }
  });
}
