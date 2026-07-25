/**
 * Statistical & financial chart types (v0.2): bubble, histogram, boxplot,
 * candlestick, ohlc, waterfall.
 *
 * `registerStatisticalChartTypes()` is idempotent and replaces the
 * "not implemented" placeholders in the registry. The integrator wires it
 * into the built-in registration; tests call it directly at module top
 * before creating charts.
 */
import { registerChartType } from '../registry';
import { bubbleDefinition } from './bubble';
import { histogramDefinition } from './histogram';
import { boxplotDefinition } from './boxplot';
import { candlestickDefinition } from './candlestick';
import { ohlcDefinition } from './ohlc';
import { waterfallDefinition } from './waterfall';

let registered = false;

/** Register the six statistical/financial chart-type definitions (idempotent). */
export function registerStatisticalChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(bubbleDefinition);
  registerChartType(histogramDefinition);
  registerChartType(boxplotDefinition);
  registerChartType(candlestickDefinition);
  registerChartType(ohlcDefinition);
  registerChartType(waterfallDefinition);
}

// Definitions (for the integrator) and pure helpers (unit-tested directly).
export { bubbleDefinition, bubbleDiameter, bubbleRDomain, DEFAULT_SIZE_RANGE } from './bubble';
export {
  histogramDefinition,
  histogramBinData,
  rawSampleValues,
  HISTOGRAM_OVERLAY_ALPHA,
  HISTOGRAM_BAR_GAP,
} from './histogram';
export { autoBinEdges, binCounts, binEdges, freedmanDiaconisWidth, AUTO_BIN_MIN, AUTO_BIN_MAX } from './binning';
export { boxplotDefinition, boxSummaryOf, boxSummaries, OUTLIER_RADIUS } from './boxplot';
export { quantileR7, summarizeBox, type FiveNumberSummary } from './stats';
export { candlestickDefinition } from './candlestick';
export { ohlcDefinition } from './ohlc';
export {
  makeFinancialDefinition,
  candleColor,
  computeSlotWidth,
  ohlcExtent,
  CANDLE_MIN_WIDTH,
  CANDLE_MAX_WIDTH,
} from './financial';
export {
  waterfallDefinition,
  computeWaterfallSteps,
  stepColor,
  rawWaterfallEntries,
  type WaterfallStep,
  type WaterfallKind,
  type WaterfallEntry,
} from './waterfall';
