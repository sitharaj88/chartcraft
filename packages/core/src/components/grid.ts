/**
 * Gridlines: hairline, y-only by default (x opt-in via axis.grid).
 */
import type { Layout } from '../layout';
import type { Renderer } from '../render/renderer';
import type { Theme } from '../types';
import type { ResolvedOptions } from '../model';

export function drawGrid(r: Renderer, layout: Layout, theme: Theme, opts: ResolvedOptions): void {
  const { plot } = layout;
  const stroke = { color: theme.gridline, width: 1 };
  const yGrid = opts.yAxis.grid ?? true;
  const xGrid = opts.xAxis.grid ?? false;
  if (yGrid) {
    for (const t of layout.yTicks) {
      r.line(plot.x, t.pos, plot.x + plot.w, t.pos, stroke);
    }
  }
  if (xGrid) {
    for (const t of layout.xTicks) {
      r.line(t.pos, plot.y, t.pos, plot.y + plot.h, stroke);
    }
  }
}
