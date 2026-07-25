/**
 * Composition chart types (v0.3): streamgraph, marimekko, pyramid, calendar.
 *
 * What they have in common is that they COMPOSE a whole out of parts — a
 * wiggle-baselined stack, variable-width 100% columns, two mirrored arms, a
 * year of day cells — so their layout math is the interesting part and lives in
 * exported pure functions next to each definition.
 *
 * `registerCompositionChartTypes()` is idempotent and safe to call in any
 * order relative to `registerBuiltinChartTypes()`: real definitions always
 * replace the "not implemented" placeholders and placeholders never overwrite a
 * real definition. The integrator wires this call into `src/charts/index.ts`;
 * tests call it directly at module top.
 */
import { registerChartType } from '../registry';
import { streamgraphDefinition } from './streamgraph';
import { marimekkoDefinition } from './marimekko';
import { pyramidDefinition } from './pyramid';
import { calendarDefinition } from './calendar';

let registered = false;

export function registerCompositionChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(streamgraphDefinition);
  registerChartType(marimekkoDefinition);
  registerChartType(pyramidDefinition);
  registerChartType(calendarDefinition);
}

export { streamgraphDefinition, marimekkoDefinition, pyramidDefinition, calendarDefinition };

export {
  computeStreamStack,
  insideOutOrder,
  peakIndex,
  seriesTotal,
  wiggleBaseline,
  type StreamBand,
  type StreamStack,
} from './streamgraph';
export {
  computeMarimekkoColumns,
  marimekkoWidthValues,
  type MarimekkoColumn,
  type MarimekkoColumnInput,
  type MarimekkoLayout,
  type MarimekkoSegment,
} from './marimekko';
export {
  computePyramidLayout,
  pyramidMaxMagnitude,
  pyramidTicks,
  type PyramidLayout,
  type PyramidRow,
} from './pyramid';
export {
  calendarDayRange,
  calendarRamp,
  calendarValueExtent,
  cellRectOf,
  columnOf,
  computeCalendarGrid,
  dayAtCell,
  dayFromParts,
  dayIndexOf,
  formatUTCDate,
  monthBoundaryLines,
  monthsInRange,
  rowOf,
  weekdayLabels,
  weekdayOf,
  weekStartDay,
  type CalendarGrid,
  type CalendarSegment,
} from './calendar';
