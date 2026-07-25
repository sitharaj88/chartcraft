/**
 * Sparkline: a chrome-free line preset (v0.2 contract).
 *
 * - No axes, grid, legend or title; minimal padding (2px unless the caller
 *   sets `padding` explicitly); fills its container (inline heights ~24-48px).
 * - Tooltip defaults OFF but an explicit `tooltip: true` (or
 *   `tooltip.show: true`) is honored.
 * - Keyboard navigation and the accessible data table remain fully on.
 *
 * This module is the worked example of the one-module-per-type pattern: it
 * reuses the shared cartesian engine with a chrome-free config and is
 * registered with a single registerChartType() call in ./index.ts.
 */
import { makeCartesianDefinition } from './cartesian';

export const sparklineDefinition = makeCartesianDefinition({
  id: 'sparkline',
  baseKind: 'line',
  combo: false,
  sharedTooltip: true,
  chromeFree: true,
  resolveOptions(resolved, raw) {
    // Minimal padding unless explicitly set.
    if (raw.padding === undefined) {
      resolved.padding = { top: 2, right: 2, bottom: 2, left: 2 };
    }
    // Chrome-free: never render title/subtitle (use a11y.title for AT labels).
    delete resolved.title;
    delete resolved.subtitle;
    // Legend off by default (explicit legend: true is honored).
    const rawLegendShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawLegendShow === undefined) resolved.legend.show = false;
    // Tooltip off by default (explicit tooltip: true is honored).
    const rawTooltipShow = typeof raw.tooltip === 'boolean' ? raw.tooltip : raw.tooltip?.show;
    if (rawTooltipShow === undefined) resolved.tooltip.show = false;
  },
});
