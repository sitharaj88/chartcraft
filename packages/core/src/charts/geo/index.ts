/**
 * Geographic chart types: choropleth (+ the projection engine it is built on).
 *
 * `registerGeoChartTypes()` is idempotent and safe to call in any order with
 * the built-in registration (`registerBuiltinChartTypes()`): a real definition
 * always replaces the "not implemented" placeholder for its id, and
 * placeholders never overwrite a real definition. The integrator wires this
 * call into `src/charts/index.ts`; tests call it directly.
 */
import { registerChartType } from '../registry';
import { choroplethDefinition } from './choropleth';

let registered = false;

export function registerGeoChartTypes(): void {
  if (registered) return;
  registered = true;
  registerChartType(choroplethDefinition);
}

export { choroplethDefinition };
export {
  albersUsa,
  albersUsaPane,
  conicEqualArea,
  equirectangular,
  fitBounds,
  fitExtent,
  mercator,
  orthographic,
  planeBounds,
  projectRing,
  projectionByName,
  unwrapRing,
  MERCATOR_MAX_LAT,
  type GeoRing,
  type GeoTransform,
  type LonLat,
  type PlaneBounds,
  type PlanePoint,
  type ProjectionFn,
  type ProjectionName,
  type ScreenPoint,
} from './projections';
export {
  allRings,
  featureKeyOf,
  geometryPolygons,
  parseGeoFeatures,
  type ParsedGeoFeature,
} from './geojson';
export {
  multiPolygonBounds,
  multiPolygonCentroid,
  multiPolygonPath,
  orientPolygon,
  pointInMultiPolygon,
  pointInPolygon,
  reverseRing,
  ringCrossings,
  ringSignedArea2,
  type ScreenBounds,
  type ScreenPolygon,
  type ScreenRing,
} from './polygon';
export {
  choroplethColor,
  choroplethExtent,
  choroplethFeatures,
  choroplethRamp,
  choroplethRows,
  choroplethSeriesIndex,
  matchFeaturesToRows,
  CHOROPLETH_BORDER_WIDTH,
  type ChoroplethGeomExtra,
  type ChoroplethRow,
  type ChoroplethShape,
} from './choropleth';
