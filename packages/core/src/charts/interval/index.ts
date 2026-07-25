/**
 * Interval & comparison chart types (v0.3): `rangearea`, `bullet`,
 * `dumbbell`, `lollipop`, `slope`.
 *
 * `registerIntervalChartTypes()` is idempotent and replaces the registry's
 * "not implemented" placeholders for these five ids (`registerChartType`
 * replaces a placeholder silently, and `registerPlaceholders()` never
 * overwrites a real definition, so calling this before OR after the built-in
 * registration is safe). The integrator wires it into the built-ins; until
 * then callers — and every test in this group — invoke it directly at module
 * top, before creating charts.
 */
import { registerChartType } from '../registry';
import { rangeareaDefinition } from './rangearea';
import { bulletDefinition } from './bullet';
import { dumbbellDefinition } from './dumbbell';
import { lollipopDefinition } from './lollipop';
import { slopeDefinition } from './slope';

let registered = false;

/** Register the five interval/comparison chart-type definitions (idempotent). */
export function registerIntervalChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(rangeareaDefinition);
  registerChartType(bulletDefinition);
  registerChartType(dumbbellDefinition);
  registerChartType(lollipopDefinition);
  registerChartType(slopeDefinition);
}

// Definitions (for the integrator) and the pure helpers (unit-tested directly).
export { rangeareaDefinition, bulletDefinition, dumbbellDefinition, lollipopDefinition, slopeDefinition };

export {
  SLOT_GAP,
  DUMBBELL_DOT_RADIUS,
  SLOPE_DOT_RADIUS,
  DOT_RING,
  rangeOf,
  hasRangeData,
  greyRangeSteps,
  slotWidth,
  slotCenters,
  formatDelta,
  type RangePair,
} from './shared';

export {
  RANGE_BAND_ALPHA,
  RANGE_EDGE_WIDTH,
  rangeBandPaths,
  rangeBandPositions,
  bandSeriesIndices,
  type RangeBandPaths,
} from './rangearea';

export {
  BULLET_MEASURE_RATIO,
  BULLET_TARGET_RATIO,
  BULLET_TARGET_WIDTH,
  bulletRowGeometry,
  bulletRawEntry,
  bulletRawEntries,
  bulletValueMax,
  type BulletRow,
  type BulletRowGeom,
  type BulletRangeRect,
  type BulletRect,
  type BulletRawEntry,
} from './bullet';

export {
  DUMBBELL_CONNECTOR_WIDTH,
  DUMBBELL_DEFAULT_LOW_NAME,
  DUMBBELL_DEFAULT_HIGH_NAME,
  dumbbellEndpointNames,
  dumbbellEndpointColors,
  type DumbbellEndpointNames,
} from './dumbbell';

export {
  LOLLIPOP_STEM_WIDTH,
  LOLLIPOP_MIN_DOT_RADIUS,
  LOLLIPOP_MAX_DOT_RADIUS,
  LOLLIPOP_STACKED_ERROR,
  lollipopDotRadius,
  lollipopMark,
  type LollipopMark,
} from './lollipop';

export {
  SLOPE_LABEL_GAP,
  slopeLinePath,
  planSlopeLabels,
  type SlopeLabel,
  type SlopeLabelEntry,
  type SlopeLabelPlan,
} from './slope';
