/**
 * Axis rendering: axis line, tick labels in textMuted, optional axis titles
 * in textSecondary. No chart junk — no tick marks, hairline axis line only.
 */
import type { Layout } from '../layout';
import type { Renderer } from '../render/renderer';
import type { Theme } from '../types';
import type { ResolvedOptions } from '../model';

export function tickFont(theme: Theme): string {
  return `${theme.fontSize}px ${theme.fontFamily}`;
}

export function drawAxes(r: Renderer, layout: Layout, theme: Theme, opts: ResolvedOptions): void {
  const { plot } = layout;
  const font = tickFont(theme);
  const axisStroke = { color: theme.axisLine, width: 1 };

  // Axis lines: bottom (x) and left (y).
  r.line(plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, axisStroke);
  r.line(plot.x, plot.y, plot.x, plot.y + plot.h, axisStroke);

  // X tick labels below the plot.
  for (const t of layout.xTicks) {
    r.text(t.label, t.pos, plot.y + plot.h + 6, {
      font,
      color: theme.textMuted,
      align: 'center',
      baseline: 'top',
    });
  }

  // Y tick labels left of the plot.
  for (const t of layout.yTicks) {
    r.text(t.label, plot.x - 8, t.pos, {
      font,
      color: theme.textMuted,
      align: 'right',
      baseline: 'middle',
    });
  }

  // Axis titles.
  const labelFont = `${theme.fontSize}px ${theme.fontFamily}`;
  if (opts.xAxis.label) {
    r.text(opts.xAxis.label, plot.x + plot.w / 2, layout.height - 4, {
      font: labelFont,
      color: theme.textSecondary,
      align: 'center',
      baseline: 'bottom',
    });
  }
  if (opts.yAxis.label) {
    r.text(opts.yAxis.label, 12, plot.y + plot.h / 2, {
      font: labelFont,
      color: theme.textSecondary,
      align: 'center',
      baseline: 'middle',
      rotate: -Math.PI / 2,
    });
  }
}
