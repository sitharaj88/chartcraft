/**
 * v0.3 cross-cutting FEATURES — the six things enterprise buyers ask for
 * before they ask for another chart form. Every one of them is a pipeline-level
 * `Decorator` (src/decorate.ts) registered here; no chart type knows they
 * exist, and `chart.ts` contains no feature-specific code.
 *
 * | id | layer | order | feature |
 * |---|---|---|---|
 * | `chartcraft:annotations-bands` | under | 10 | annotation bands (beneath marks) |
 * | `chartcraft:error-bars`        | over  | 10 | error bars + ± a11y columns + tooltip interval |
 * | `chartcraft:trendlines`        | over  | 20 | trendlines + legend entry |
 * | `chartcraft:annotations-marks` | over  | 30 | lines/points/text + `annotationclick` |
 * | `chartcraft:data-labels`       | over  | 40 | selective, collision-checked labels |
 * | `chartcraft:zoom`              | over  | 90 | brush rectangle (interaction lives in `attach`) |
 *
 * Registration is an explicit, idempotent call (the package ships
 * `sideEffects: false`, so an import side effect could be tree-shaken away) —
 * exactly the pattern the chart-type registry uses. Re-registering an id
 * REPLACES it, so calling this twice is a no-op.
 *
 * Export (`exportImage` / `exportData`) is feature 6 and already lives in the
 * shared layer (`src/export.ts` + `chart.ts`); it needs no decorator.
 */
import { registerDecorator } from '../decorate';
import { errorBarsDecorator } from './error-bars';
import { trendlinesDecorator } from './trendlines';
import { dataLabelsDecorator } from './data-labels';
import { annotationBandsDecorator, annotationMarksDecorator } from './annotations';
import { zoomDecorator } from './zoom';

/** Every built-in feature decorator, in registration order. */
export const builtinDecorators = [
  annotationBandsDecorator,
  errorBarsDecorator,
  trendlinesDecorator,
  annotationMarksDecorator,
  dataLabelsDecorator,
  zoomDecorator,
] as const;

/**
 * Register the built-in cross-cutting feature decorators. Idempotent: each
 * decorator has a stable id, and re-registering an id replaces it.
 */
export function registerBuiltinDecorators(): void {
  for (const d of builtinDecorators) registerDecorator(d);
}

// ---- feature surfaces (pure math + geometry, exported for tests/advanced use)

export {
  errorBarsDecorator,
  errorInterval,
  errorBarSeries,
  errorBarTableColumns,
  withErrorBarColumns,
  withErrorBarIntervals,
  formatInterval,
  whiskerGeometry,
  ERROR_BAR_TYPES,
  ERROR_BAR_KINDS,
  DEFAULT_CAP_WIDTH,
  type ErrorInterval,
  type WhiskerGeom,
} from './error-bars';

export {
  trendlinesDecorator,
  linearFit,
  movingAverage,
  exponentialFit,
  resolveTrendline,
  trendlinePolyline,
  trendlineSeries,
  trendlineScreenPath,
  TRENDLINE_TYPES,
  TRENDLINE_KINDS,
  DEFAULT_PERIOD,
  EXP_SAMPLES,
  TREND_DASH,
  type XY,
  type LinearFit,
  type ExponentialFit,
  type ResolvedTrendline,
} from './trendlines';

export {
  dataLabelsDecorator,
  selectLabelIndices,
  labelRank,
  labelPlacement,
  planDataLabels,
  LABEL_GAP,
  LABEL_PAD,
  type LabelSelect,
  type LabelPlacement,
  type LabelPlan,
} from './data-labels';

export {
  annotationBandsDecorator,
  annotationMarksDecorator,
  annotationGeometry,
  annotationGeometries,
  annotationAxisPx,
  annotationHit,
  annotationAt,
  axisIsScreenX,
  describeAnnotations,
  LINE_HIT,
  POINT_HIT,
  POINT_RADIUS,
  BAND_ALPHA,
  LINE_DASH,
  type AnnotationGeom,
} from './annotations';

export {
  zoomDecorator,
  brushDomain,
  brushRect,
  brushRectFor,
  brushViewport,
  clampDomain,
  domainsOf,
  dropFullAxes,
  enforceMinSpan,
  keyPanViewport,
  panDomain,
  panViewport,
  sameViewport,
  zoomAbout,
  zoomDomain,
  zoomPayload,
  KEY_PAN_FRACTION,
  MIN_BRUSH_PX,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
  BRUSH_ALPHA,
  type Bounds,
  type Domain,
} from './zoom';

export {
  darkenColor,
  parseHexColor,
  drawHaloText,
  textRect,
  rectsOverlap,
  rectInside,
  clampRect,
  distanceToSegment,
  labelFont,
  valueScaleOf,
  dataScaleOf,
  continuousDataScaleOf,
  dataPx,
  valuePx,
  anchorOf,
  anchorValue,
  rawSeriesFor,
} from './shared';
