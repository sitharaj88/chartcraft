/**
 * Map projections (v0.3 choropleth) — pure, zero-dependency, exact-value
 * unit tested. Nothing here touches the DOM, the renderer or the pipeline.
 *
 * CONVENTIONS
 * -----------
 * A projection is a pure function `(lon, lat) => [x, y] | null` mapping
 * degrees to an abstract "unit plane" with **+x east, +y north** (the usual
 * mathematical orientation, the same one d3's raw projections use). `null`
 * means the point is not representable — only `orthographic` produces it, for
 * the far hemisphere.
 *
 * Screen space is a SEPARATE step: `fitExtent()` computes the single
 * scale + translate that makes a feature set's plane bounds fill a plot rect
 * while preserving aspect ratio, and flips y (screen y grows downward).
 * Projections therefore never know about pixels, and the same projected
 * geometry can be re-fitted on resize without re-projecting.
 *
 * ANTIMERIDIAN
 * ------------
 * A ring whose vertices jump across ±180 (Chukotka, Fiji, the Aleutians)
 * would project into a horizontal streak across the whole map. `unwrapRing`
 * removes the discontinuity by making longitudes CONTINUOUS: each vertex is
 * shifted by whole turns of 360° so that no consecutive step exceeds 180°,
 * then the whole ring is shifted back by whole turns so its mean longitude
 * lands inside [-180, 180]. The ring stays a single contiguous shape (it may
 * extend a little past ±180, which is exactly what "crossing" means) instead
 * of tearing. No polygon clipping/splitting is attempted — that would need a
 * spherical boolean, which is out of scope for a projection module.
 */
import type { Rect } from '../../layout';

/** [longitude, latitude] in degrees. */
export type LonLat = readonly [number, number];
/** A point on the abstract projection plane (+x east, +y north). */
export type PlanePoint = [number, number];
/** A screen-space point in CSS pixels. */
export type ScreenPoint = [number, number];
/** A closed ring of lon/lat vertices. */
export type GeoRing = readonly LonLat[];
/** Projection: degrees -> plane, or null when the point is not visible. */
export type ProjectionFn = (lon: number, lat: number) => PlanePoint | null;

export type ProjectionName = 'mercator' | 'equirectangular' | 'albersUsa' | 'orthographic';

const DEG = Math.PI / 180;

/**
 * Latitude where the Mercator y coordinate reaches ±π (the standard web-map
 * cutoff). Beyond it y diverges, so latitudes are clamped here.
 */
export const MERCATOR_MAX_LAT = 85.05112877980659;

function clampLat(lat: number, max = 90): number {
  return lat < -max ? -max : lat > max ? max : lat;
}

/**
 * Spherical Mercator: `x = λ`, `y = asinh(tan φ)` (identical to the classic
 * `ln(tan(π/4 + φ/2))` but exactly 0 at the equator). Conformal; latitudes
 * are clamped to ±85.05112877980659° where |y| = π.
 */
export function mercator(lon: number, lat: number): PlanePoint | null {
  const phi = clampLat(lat, MERCATOR_MAX_LAT) * DEG;
  return [lon * DEG, Math.asinh(Math.tan(phi))];
}

/** Plate carrée: `x = λ`, `y = φ` (radians). */
export function equirectangular(lon: number, lat: number): PlanePoint | null {
  return [lon * DEG, clampLat(lat) * DEG];
}

/**
 * Orthographic (globe) projection centered on `center` (default [0, 0]):
 *
 *   x = cos φ · sin(λ − λ0)
 *   y = cos φ0 · sin φ − sin φ0 · cos φ · cos(λ − λ0)
 *
 * The FAR HEMISPHERE IS CLIPPED: the point is visible only when the cosine
 * of the angular distance from the center,
 * `cos c = sin φ0 · sin φ + cos φ0 · cos φ · cos(λ − λ0)`, is >= 0.
 * Clipped points return `null`.
 */
export function orthographic(lon: number, lat: number, center: LonLat = [0, 0]): PlanePoint | null {
  const lam = (lon - center[0]) * DEG;
  const phi = clampLat(lat) * DEG;
  const phi0 = clampLat(center[1]) * DEG;
  const cosPhi = Math.cos(phi);
  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(lam);
  if (cosC < 0) return null; // far hemisphere
  return [cosPhi * Math.sin(lam), Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(lam)];
}

/**
 * Albers conic equal-area with standard parallels `p1`/`p2` (degrees),
 * measured from the central meridian (pass `lon - λ0`):
 *
 *   n  = (sin p1 + sin p2) / 2
 *   C  = 1 + sin p1 · (2n − sin p1)
 *   ρ0 = √C / n,  ρ = √(C − 2n·sin φ) / n
 *   x  = ρ · sin(nλ),  y = ρ0 − ρ · cos(nλ)
 */
export function conicEqualArea(p1: number, p2: number): (lon: number, lat: number) => PlanePoint {
  const s1 = Math.sin(p1 * DEG);
  const n = (s1 + Math.sin(p2 * DEG)) / 2;
  const c = 1 + s1 * (2 * n - s1);
  const r0 = Math.sqrt(c) / n;
  return (lon, lat) => {
    const x = lon * DEG * n;
    const r = Math.sqrt(c - 2 * n * Math.sin(clampLat(lat) * DEG)) / n;
    return [r * Math.sin(x), r0 - r * Math.cos(x)];
  };
}

// ---- albersUsa: composite (lower 48 + Alaska & Hawaii insets) -------------
//
// Faithful to d3.geoAlbersUsa's ARRANGEMENT, expressed entirely on the plane
// so `fitExtent` still owns scale/translate:
//   * lower 48 — conic 29.5°/45.5°, central meridian 96°W (the reference frame)
//   * Alaska   — conic 55°/65°, central meridian 154°W, 0.35× scale, placed
//                (-0.307, -0.201) plane units from the lower-48 center
//   * Hawaii   — conic 8°/18°, central meridian 157°W, 1× scale, placed
//                (-0.205, -0.212) plane units from the lower-48 center
// (d3 expresses those two offsets in screen units as `[x - 0.307k, y + 0.201k]`
// and `[x - 0.205k, y + 0.212k]`; the y sign flips here because the plane is
// north-positive.)

const LOWER48 = conicEqualArea(29.5, 45.5);
const ALASKA = conicEqualArea(55, 65);
const HAWAII = conicEqualArea(8, 18);

/** Reference points: d3's `center()` for each sub-projection. */
const LOWER48_CENTER = LOWER48(-0.6, 38.7);
const ALASKA_CENTER = ALASKA(-2, 58.5);
const HAWAII_CENTER = HAWAII(-3, 19.9);
const ALASKA_SCALE = 0.35;
const ALASKA_OFFSET: PlanePoint = [-0.307, -0.201];
const HAWAII_OFFSET: PlanePoint = [-0.205, -0.212];

/**
 * Which composite pane a coordinate belongs to. Longitude/latitude boxes
 * (documented approximation of d3's per-pane clip extents, which test the
 * PROJECTED point instead): Alaska = lat >= 50 and lon <= -129 (or the
 * western Aleutians past +172), Hawaii = lat <= 30 and lon <= -140.
 * Everything else — including Puerto Rico and any non-US feature — goes
 * through the lower-48 conic rather than being dropped, so an unexpected
 * topology degrades to a plain Albers map instead of vanishing.
 */
export function albersUsaPane(lon: number, lat: number): 'lower48' | 'alaska' | 'hawaii' {
  if (lat >= 50 && (lon <= -129 || lon >= 172)) return 'alaska';
  if (lat <= 30 && lon <= -140) return 'hawaii';
  return 'lower48';
}

/** Composite Albers USA (lower 48 + Alaska & Hawaii insets). */
export function albersUsa(lon: number, lat: number): PlanePoint | null {
  const pane = albersUsaPane(lon, lat);
  if (pane === 'lower48') return LOWER48(lon + 96, lat);
  if (pane === 'alaska') {
    // Western Aleutians arrive as +172..180; continue them past -180.
    const l = lon >= 172 ? lon - 360 : lon;
    const p = ALASKA(l + 154, lat);
    return [
      LOWER48_CENTER[0] + ALASKA_OFFSET[0] + ALASKA_SCALE * (p[0] - ALASKA_CENTER[0]),
      LOWER48_CENTER[1] + ALASKA_OFFSET[1] + ALASKA_SCALE * (p[1] - ALASKA_CENTER[1]),
    ];
  }
  const p = HAWAII(lon + 157, lat);
  return [
    LOWER48_CENTER[0] + HAWAII_OFFSET[0] + (p[0] - HAWAII_CENTER[0]),
    LOWER48_CENTER[1] + HAWAII_OFFSET[1] + (p[1] - HAWAII_CENTER[1]),
  ];
}

/** Resolve a contract projection name to its pure function (default mercator). */
export function projectionByName(name?: ProjectionName): ProjectionFn {
  switch (name) {
    case 'equirectangular':
      return equirectangular;
    case 'albersUsa':
      return albersUsa;
    case 'orthographic':
      return (lon, lat) => orthographic(lon, lat);
    case 'mercator':
    default:
      return mercator;
  }
}

// ---- antimeridian --------------------------------------------------------

/**
 * Make a ring's longitudes continuous across the antimeridian (see the module
 * header). Returns the ring unchanged (same array contents) when no step
 * exceeds 180°.
 */
export function unwrapRing(ring: GeoRing): LonLat[] {
  const out: LonLat[] = [];
  let prev: number | null = null;
  let turns = 0;
  let sum = 0;
  for (const p of ring) {
    const lat = p[1];
    let lon = p[0];
    if (prev !== null) {
      const d = lon + turns * 360 - prev;
      if (d > 180) turns -= Math.round(d / 360);
      else if (d < -180) turns -= Math.round(d / 360);
    }
    lon += turns * 360;
    prev = lon;
    sum += lon;
    out.push([lon, lat]);
  }
  if (out.length === 0) return out;
  // Shift the whole ring back by whole turns so its mean longitude is sane.
  const mean = sum / out.length;
  const shift = mean > 180 ? -360 * Math.round(mean / 360) : mean < -180 ? -360 * Math.round(mean / 360) : 0;
  if (shift === 0) return out;
  return out.map(([lon, lat]) => [lon + shift, lat] as LonLat);
}

// ---- fitExtent -----------------------------------------------------------

/** Plane-space bounds `[x0, y0, x1, y1]`. */
export type PlaneBounds = [number, number, number, number];

/**
 * The single affine transform from projection plane to screen pixels:
 * `sx = tx + scale·x`, `sy = ty − scale·y` (y flipped for screen space).
 */
export interface GeoTransform {
  scale: number;
  tx: number;
  ty: number;
  /** Plane -> screen. */
  point(p: PlanePoint): ScreenPoint;
  /** Degrees -> screen (null when the projection clips the point). */
  project(lon: number, lat: number): ScreenPoint | null;
}

/** Plane bounds of already-projected rings (`null` points are ignored). */
export function planeBounds(points: readonly (PlanePoint | null)[]): PlaneBounds | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (!p) continue;
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/**
 * Compute the scale + translate that makes `bounds` fill `rect` while
 * PRESERVING ASPECT RATIO (the smaller of the two axis scales wins) and
 * centering the result in the rect. Degenerate spans fall back to scale 1
 * (a single point lands in the middle of the rect).
 */
export function fitBounds(bounds: PlaneBounds | null, rect: Rect): GeoTransform {
  const [x0, y0, x1, y1] = bounds ?? [0, 0, 0, 0];
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const sx = spanX > 0 ? rect.w / spanX : Infinity;
  const sy = spanY > 0 ? rect.h / spanY : Infinity;
  const scale = Number.isFinite(Math.min(sx, sy)) ? Math.min(sx, sy) : 1;
  const tx = rect.x + (rect.w - scale * spanX) / 2 - scale * x0;
  const ty = rect.y + (rect.h - scale * spanY) / 2 + scale * y1;
  return makeTransform(scale, tx, ty, () => null);
}

function makeTransform(scale: number, tx: number, ty: number, proj: ProjectionFn): GeoTransform {
  return {
    scale,
    tx,
    ty,
    point: (p) => [tx + scale * p[0], ty - scale * p[1]],
    project: (lon, lat) => {
      const p = proj(lon, lat);
      return p ? [tx + scale * p[0], ty - scale * p[1]] : null;
    },
  };
}

/**
 * `fitExtent`-style helper: project every vertex of `rings` (each ring is
 * unwrapped across the antimeridian first) and return the transform that
 * makes their bounds fill `rect`, aspect ratio preserved.
 */
export function fitExtent(rings: readonly GeoRing[], proj: ProjectionFn, rect: Rect): GeoTransform {
  const projected: (PlanePoint | null)[] = [];
  for (const ring of rings) {
    for (const [lon, lat] of unwrapRing(ring)) projected.push(proj(lon, lat));
  }
  const t = fitBounds(planeBounds(projected), rect);
  return makeTransform(t.scale, t.tx, t.ty, proj);
}

/**
 * Project one ring to screen space through a transform. Points the projection
 * clips (orthographic far hemisphere) are DROPPED, so a ring straddling the
 * horizon is truncated to its visible vertices — no horizon arc is
 * interpolated (documented limitation).
 */
export function projectRing(ring: GeoRing, t: GeoTransform): ScreenPoint[] {
  const out: ScreenPoint[] = [];
  for (const [lon, lat] of unwrapRing(ring)) {
    const p = t.project(lon, lat);
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push(p);
  }
  return out;
}
