/**
 * GeoJSON reading for the choropleth type. Pure, defensive, zero-dependency —
 * and it never bundles topology: `choropleth.geojson` is ALWAYS supplied by
 * the caller (contract), so this module only walks whatever it is handed.
 *
 * SUPPORTED GEOMETRY (contract: "Project features ... fill from the ramp"):
 *   * `Polygon`      -> one polygon (ring 0 = exterior, rings 1..n = holes)
 *   * `MultiPolygon` -> many polygons, same ring rule
 *   * `GeometryCollection` -> its Polygon/MultiPolygon members, flattened
 *
 * SKIPPED, by documented rule: every zero- or one-dimensional geometry
 * (`Point`, `MultiPoint`, `LineString`, `MultiLineString`) and any feature
 * with a null/unknown geometry. A choropleth colors AREAS; a geometry with no
 * area has no fill to carry a value, so such features are dropped silently
 * rather than half-rendered. `features` entries may be `Feature` objects or
 * bare geometry objects.
 *
 * FEATURE KEY: `choropleth.featureKey` (default 'name') is looked up in
 * `properties[key]`, then on the feature itself (`feature[key]`), then — for
 * the conventional key 'id' — `feature.id`. Values are compared as strings,
 * EXACTLY: no trimming, no case folding, no fuzzy matching.
 */
import type { GeoFeatureCollection } from '../../types';
import type { GeoRing, LonLat } from './projections';

/** One parsed area feature: its key value and its polygon rings. */
export interface ParsedGeoFeature {
  /** Value of `featureKey` for this feature (null when absent). */
  key: string | null;
  /** Per polygon: [exterior, ...holes]; each ring is a list of lon/lat pairs. */
  polygons: GeoRing[][];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumberPair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

/** Read one ring's coordinate array; entries that are not numeric pairs are skipped. */
function readRing(raw: unknown): LonLat[] {
  if (!Array.isArray(raw)) return [];
  const out: LonLat[] = [];
  for (const p of raw) if (isNumberPair(p)) out.push([p[0], p[1]]);
  return out;
}

function readPolygon(raw: unknown): GeoRing[] {
  if (!Array.isArray(raw)) return [];
  const rings: GeoRing[] = [];
  for (const r of raw) {
    const ring = readRing(r);
    // A ring needs 3 distinct vertices to bound an area.
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** Polygons of one geometry object (Polygon / MultiPolygon / GeometryCollection). */
export function geometryPolygons(geometry: unknown): GeoRing[][] {
  if (!isRecord(geometry)) return [];
  const type = geometry['type'];
  if (type === 'Polygon') {
    const p = readPolygon(geometry['coordinates']);
    return p.length > 0 ? [p] : [];
  }
  if (type === 'MultiPolygon') {
    const raw = geometry['coordinates'];
    if (!Array.isArray(raw)) return [];
    const out: GeoRing[][] = [];
    for (const poly of raw) {
      const p = readPolygon(poly);
      if (p.length > 0) out.push(p);
    }
    return out;
  }
  if (type === 'GeometryCollection') {
    const raw = geometry['geometries'];
    if (!Array.isArray(raw)) return [];
    const out: GeoRing[][] = [];
    for (const g of raw) out.push(...geometryPolygons(g));
    return out;
  }
  // Point / MultiPoint / LineString / MultiLineString / unknown: no area.
  return [];
}

/** Exact key lookup for one feature (see the module header). */
export function featureKeyOf(feature: unknown, key: string): string | null {
  if (!isRecord(feature)) return null;
  const props = feature['properties'];
  if (isRecord(props)) {
    const v = props[key];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  }
  const own = feature[key];
  if (typeof own === 'string') return own;
  if (typeof own === 'number' || typeof own === 'boolean') return String(own);
  if (key === 'id') {
    const id = feature['id'];
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return null;
}

/**
 * Parse a caller-supplied FeatureCollection into area features. Accepts a
 * bare array of features, a single Feature, or a single geometry too — a
 * caller-supplied topology is data, not a contract, so nothing throws here:
 * unusable entries simply produce no polygons.
 */
export function parseGeoFeatures(
  geojson: GeoFeatureCollection | unknown,
  featureKey: string,
): ParsedGeoFeature[] {
  const list: unknown[] = Array.isArray(geojson)
    ? geojson
    : isRecord(geojson) && Array.isArray(geojson['features'])
      ? (geojson['features'] as unknown[])
      : geojson === undefined || geojson === null
        ? []
        : [geojson];

  const out: ParsedGeoFeature[] = [];
  for (const f of list) {
    if (!isRecord(f)) continue;
    // Feature -> its geometry; bare geometry -> itself.
    const geometry = 'geometry' in f ? f['geometry'] : f;
    const polygons = geometryPolygons(geometry);
    if (polygons.length === 0) continue; // documented skip rule
    out.push({ key: featureKeyOf(f, featureKey), polygons });
  }
  return out;
}

/** Every ring of every feature, flattened (input for `fitExtent`). */
export function allRings(features: readonly ParsedGeoFeature[]): GeoRing[] {
  const out: GeoRing[] = [];
  for (const f of features) for (const poly of f.polygons) out.push(...poly);
  return out;
}
