/**
 * Gridlines: hairline, y-only by default (x opt-in via axis.grid).
 *
 * v0.3: gridlines belong to their axis's CHROME, so an axis whose chrome is
 * switched off in `ChartTypeNeeds.axisChrome` draws no gridlines either
 * (streamgraph keeps the x axis and drops the meaningless value axis).
 */
import type { Layout } from '../layout';
import type { Renderer } from '../render/renderer';
import type { Theme } from '../types';
import type { ResolvedOptions } from '../model';
import type { ResolvedAxisChrome } from '../charts/registry';

const BOTH: ResolvedAxisChrome = { x: true, y: true };

export function drawGrid(
  r: Renderer,
  layout: Layout,
  theme: Theme,
  opts: ResolvedOptions,
  chrome: ResolvedAxisChrome = BOTH,
): void {
  const { plot } = layout;
  const stroke = { color: theme.gridline, width: 1 };
  const yGrid = chrome.y && (opts.yAxis.grid ?? true);
  const xGrid = chrome.x && (opts.xAxis.grid ?? false);
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
