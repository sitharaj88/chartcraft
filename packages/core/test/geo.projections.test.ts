/**
 * Geo subsystem unit tests: projection formulas at known reference points,
 * fitExtent, antimeridian unwrapping, GeoJSON parsing rules and screen-space
 * polygon math (ray casting with holes / MultiPolygon, winding, paths).
 */
import { describe, expect, it } from 'vitest';
import {
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
  type LonLat,
} from '../src/charts/geo/projections';
import { allRings, featureKeyOf, geometryPolygons, parseGeoFeatures } from '../src/charts/geo/geojson';
import {
  multiPolygonBounds,
  multiPolygonCentroid,
  multiPolygonPath,
  orientPolygon,
  pointInMultiPolygon,
  pointInPolygon,
  ringCrossings,
  ringSignedArea2,
  type ScreenPolygon,
  type ScreenRing,
} from '../src/charts/geo/polygon';

const DEG = Math.PI / 180;

describe('projections (exact reference points)', () => {
  it('mercator: (0,0) is exactly the origin; y = asinh(tan φ)', () => {
    expect(mercator(0, 0)).toEqual([0, 0]);
    expect(mercator(90, 0)).toEqual([Math.PI / 2, 0]);
    const p45 = mercator(0, 45) as [number, number];
    expect(p45[1]).toBeCloseTo(0.8813735870195429, 12); // ln(1 + √2)
    // Symmetric about the equator.
    const north = (mercator(0, 30) as [number, number])[1];
    const south = (mercator(0, -30) as [number, number])[1];
    expect(north).toBeCloseTo(-south, 12);
  });

  it('mercator: (180, 85) -> [π, 3.1313013…] and latitude clamps at ±85.05112878', () => {
    const p = mercator(180, 85) as [number, number];
    expect(p[0]).toBe(Math.PI);
    expect(p[1]).toBeCloseTo(3.1313013314716454, 9);
    // Beyond the cutoff y saturates at ±π instead of diverging.
    const top = mercator(0, 89.9) as [number, number];
    expect(top[1]).toBeCloseTo(Math.PI, 9);
    expect(top[1]).toBe((mercator(0, MERCATOR_MAX_LAT) as [number, number])[1]);
    expect(Number.isFinite((mercator(0, 90) as [number, number])[1])).toBe(true);
  });

  it('equirectangular: plate carrée is just degrees -> radians', () => {
    expect(equirectangular(0, 0)).toEqual([0, 0]);
    expect(equirectangular(180, 90)).toEqual([Math.PI, Math.PI / 2]);
    expect(equirectangular(-90, -45)).toEqual([-Math.PI / 2, -Math.PI / 4]);
    const p = equirectangular(30, 60) as [number, number];
    expect(p[0]).toBeCloseTo(30 * DEG, 12);
    expect(p[1]).toBeCloseTo(60 * DEG, 12);
  });

  it('orthographic: unit-sphere geometry, and the FAR hemisphere is clipped', () => {
    expect(orthographic(0, 0)).toEqual([0, 0]);
    const east = orthographic(90, 0) as [number, number];
    expect(east[0]).toBeCloseTo(1, 12);
    expect(east[1]).toBeCloseTo(0, 12);
    const north = orthographic(0, 90) as [number, number];
    expect(north[0]).toBeCloseTo(0, 12);
    expect(north[1]).toBeCloseTo(1, 12);
    // 45°E on the equator: x = sin45.
    expect((orthographic(45, 0) as [number, number])[0]).toBeCloseTo(Math.SQRT1_2, 12);
    // Exactly on the horizon is visible; past it is null.
    expect(orthographic(90.0001, 0)).toBeNull();
    expect(orthographic(180, 0)).toBeNull();
    expect(orthographic(-140, 20)).toBeNull();
    // Re-centering moves the visible hemisphere with it.
    expect(orthographic(180, 0, [180, 0])).toEqual([0, 0]);
    expect(orthographic(0, 0, [180, 0])).toBeNull();
  });

  it('albersUsa: lower-48 conic matches the raw conic at 96°W, insets are offset', () => {
    const lower48 = conicEqualArea(29.5, 45.5);
    const kansas = albersUsa(-98, 39) as [number, number];
    const raw = lower48(-98 + 96, 39);
    expect(kansas[0]).toBeCloseTo(raw[0], 12);
    expect(kansas[1]).toBeCloseTo(raw[1], 12);
    // Alaska & Hawaii land in their own panes, below-left of the lower 48.
    expect(albersUsaPane(-98, 39)).toBe('lower48');
    expect(albersUsaPane(-149.9, 61.2)).toBe('alaska');
    expect(albersUsaPane(178, 52)).toBe('alaska'); // western Aleutians
    expect(albersUsaPane(-157.8, 21.3)).toBe('hawaii');
    expect(albersUsaPane(-66, 18.4)).toBe('lower48'); // Puerto Rico: not dropped
    const ak = albersUsa(-149.9, 61.2) as [number, number];
    const hi = albersUsa(-157.8, 21.3) as [number, number];
    expect(ak[1]).toBeLessThan(kansas[1]); // south of (below) the lower 48
    expect(ak[0]).toBeLessThan(kansas[0]); // and to its west (left)
    expect(hi[0]).toBeGreaterThan(ak[0]); // Hawaii sits right of Alaska
    expect(hi[1]).toBeLessThan(kansas[1]);
  });

  it('albersUsa is equal-area conic: the Alaska inset is scaled 0.35', () => {
    const alaska = conicEqualArea(55, 65);
    const a = albersUsa(-150, 60) as [number, number];
    const b = albersUsa(-150, 62) as [number, number];
    const ra = alaska(-150 + 154, 60);
    const rb = alaska(-150 + 154, 62);
    expect(b[1] - a[1]).toBeCloseTo(0.35 * (rb[1] - ra[1]), 12);
  });

  it('projectionByName maps contract names (default mercator)', () => {
    expect(projectionByName('equirectangular')(180, 0)).toEqual([Math.PI, 0]);
    expect(projectionByName('mercator')(0, 0)).toEqual([0, 0]);
    expect(projectionByName()(0, 0)).toEqual([0, 0]);
    expect(projectionByName('albersUsa')(-98, 39)).not.toBeNull();
    expect(projectionByName('orthographic')(180, 0)).toBeNull();
  });
});

describe('fitExtent / fitBounds', () => {
  const square: LonLat[] = [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ];

  it('fits bounds into the rect, preserves aspect ratio and centers', () => {
    const t = fitExtent([square], equirectangular, { x: 0, y: 0, w: 200, h: 100 });
    // Square plane bounds in a 2:1 rect -> height is the limiting axis.
    expect(t.scale).toBeCloseTo(100 / (20 * DEG), 9);
    const center = t.project(0, 0) as [number, number];
    expect(center[0]).toBeCloseTo(100, 9);
    expect(center[1]).toBeCloseTo(50, 9);
    // North-west corner is the TOP-left in screen space (y is flipped).
    const nw = t.project(-10, 10) as [number, number];
    expect(nw[0]).toBeCloseTo(50, 9);
    expect(nw[1]).toBeCloseTo(0, 9);
    const se = t.project(10, -10) as [number, number];
    expect(se[0]).toBeCloseTo(150, 9);
    expect(se[1]).toBeCloseTo(100, 9);
  });

  it('honors the rect origin and a degenerate (single-point) extent', () => {
    const t = fitExtent([square], equirectangular, { x: 30, y: 20, w: 100, h: 100 });
    const nw = t.project(-10, 10) as [number, number];
    expect(nw[0]).toBeCloseTo(30, 9);
    expect(nw[1]).toBeCloseTo(20, 9);
    const single = fitBounds([1, 1, 1, 1], { x: 0, y: 0, w: 80, h: 40 });
    expect(single.scale).toBe(1);
    expect(single.point([1, 1])).toEqual([40, 20]);
  });

  it('planeBounds ignores null (clipped) and non-finite points', () => {
    expect(planeBounds([[0, 0], null, [2, -3], [Number.NaN, 1]])).toEqual([0, -3, 2, 0]);
    expect(planeBounds([null])).toBeNull();
    expect(planeBounds([])).toBeNull();
  });

  it('projectRing drops points the projection clips (orthographic horizon)', () => {
    const ring: LonLat[] = [
      [0, 0],
      [10, 0],
      [170, 0],
      [10, 10],
    ];
    const t = fitExtent([ring], projectionByName('orthographic'), { x: 0, y: 0, w: 100, h: 100 });
    // The 170°E vertex is on the far hemisphere: 4 vertices in, 3 out.
    expect(projectRing(ring, t)).toHaveLength(3);
  });
});

describe('antimeridian unwrapping', () => {
  it('makes longitudes continuous instead of streaking across the map', () => {
    const ring: LonLat[] = [
      [170, 0],
      [-170, 0],
      [-175, 10],
      [175, 10],
    ];
    const out = unwrapRing(ring);
    // No step exceeds 180° any more.
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs((out[i] as LonLat)[0] - (out[i - 1] as LonLat)[0])).toBeLessThanOrEqual(180);
    }
    expect(out.map((p) => p[0])).toEqual([170, 190, 185, 175]);
    // Latitudes are untouched.
    expect(out.map((p) => p[1])).toEqual([0, 0, 10, 10]);
  });

  it('leaves ordinary rings untouched and re-centers far-side rings', () => {
    const plain: LonLat[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(unwrapRing(plain)).toEqual(plain);
    // A ring written entirely past +180 comes back into range.
    const shifted: LonLat[] = [
      [350, 0],
      [355, 0],
      [352, 5],
    ];
    expect(unwrapRing(shifted).map((p) => p[0])).toEqual([-10, -5, -8]);
  });
});

describe('GeoJSON parsing rules', () => {
  const polygon = {
    type: 'Feature',
    properties: { name: 'Alpha', iso: 'AL' },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
  };
  const multi = {
    type: 'Feature',
    properties: { name: 'Beta' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[2, 0], [3, 0], [3, 1], [2, 1]]],
        [[[5, 0], [6, 0], [6, 1], [5, 1]]],
      ],
    },
  };
  const line = {
    type: 'Feature',
    properties: { name: 'Gamma' },
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  };

  it('parses Polygon and MultiPolygon and SKIPS non-area geometry', () => {
    const fc = { type: 'FeatureCollection', features: [polygon, multi, line, { type: 'Feature', geometry: null }] };
    const features = parseGeoFeatures(fc, 'name');
    expect(features.map((f) => f.key)).toEqual(['Alpha', 'Beta']);
    expect(features[0]!.polygons).toHaveLength(1);
    expect(features[1]!.polygons).toHaveLength(2);
    expect(allRings(features)).toHaveLength(3); // 1 + 2 exterior rings
  });

  it('reads holes as rings 1..n and drops rings with fewer than 3 vertices', () => {
    const holed = {
      properties: { name: 'Holed' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [10, 0], [10, 10], [0, 10]],
          [[3, 3], [7, 3], [7, 7], [3, 7]],
          [[1, 1], [2, 2]], // degenerate: dropped
        ],
      },
    };
    const [f] = parseGeoFeatures({ type: 'FeatureCollection', features: [holed] }, 'name');
    expect(f!.polygons[0]).toHaveLength(2);
  });

  it('featureKeyOf looks in properties, then the feature, then id', () => {
    expect(featureKeyOf(polygon, 'name')).toBe('Alpha');
    expect(featureKeyOf(polygon, 'iso')).toBe('AL');
    expect(featureKeyOf(polygon, 'missing')).toBeNull();
    expect(featureKeyOf({ id: 42, properties: {} }, 'id')).toBe('42');
    expect(featureKeyOf({ name: 'Top' }, 'name')).toBe('Top');
    expect(featureKeyOf({ properties: { pop: 1000 } }, 'pop')).toBe('1000');
  });

  it('accepts a bare feature array / single geometry and tolerates junk', () => {
    expect(parseGeoFeatures([polygon], 'name')).toHaveLength(1);
    expect(parseGeoFeatures(polygon.geometry, 'name')).toHaveLength(1);
    expect(parseGeoFeatures(undefined, 'name')).toEqual([]);
    expect(parseGeoFeatures({ type: 'FeatureCollection', features: [1, 'x', null] }, 'name')).toEqual([]);
    expect(geometryPolygons({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
  });

  it('flattens GeometryCollection members', () => {
    const gc = {
      properties: { name: 'Mixed' },
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
          { type: 'Point', coordinates: [5, 5] },
        ],
      },
    };
    const [f] = parseGeoFeatures([gc], 'name');
    expect(f!.polygons).toHaveLength(1);
  });
});

describe('screen polygon math (hit testing, winding, paths)', () => {
  const outer: ScreenRing = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const hole: ScreenRing = [
    [3, 3],
    [7, 3],
    [7, 7],
    [3, 7],
  ];
  const withHole: ScreenPolygon = [outer, hole];

  it('ray casting: inside, outside, and EVEN-ODD holes are outside', () => {
    expect(pointInPolygon([outer], 5, 5)).toBe(true);
    expect(pointInPolygon([outer], 11, 5)).toBe(false); // outside right
    expect(pointInPolygon([outer], -1, 5)).toBe(false);
    // The hole punches a real gap.
    expect(pointInPolygon(withHole, 5, 5)).toBe(false);
    expect(pointInPolygon(withHole, 1, 5)).toBe(true);
    expect(pointInPolygon(withHole, 8, 8)).toBe(true);
    // On the hole edge / on a vertex row: still deterministic (half-open rule).
    expect(ringCrossings(outer, 5, 5)).toBe(1);
    expect(ringCrossings(hole, 5, 5)).toBe(1);
    expect(ringCrossings(outer, 5, 20)).toBe(0);
  });

  it('MultiPolygon: inside ANY polygon, holes respected per polygon', () => {
    const island: ScreenPolygon = [
      [
        [20, 0],
        [30, 0],
        [30, 10],
        [20, 10],
      ],
    ];
    const polys = [withHole, island];
    expect(pointInMultiPolygon(polys, 25, 5)).toBe(true);
    expect(pointInMultiPolygon(polys, 1, 1)).toBe(true);
    expect(pointInMultiPolygon(polys, 5, 5)).toBe(false); // in the hole
    expect(pointInMultiPolygon(polys, 15, 5)).toBe(false); // between polygons
  });

  it('signed area sign flips with winding; orientPolygon opposes holes', () => {
    expect(ringSignedArea2(outer)).toBe(200); // 2 x area of a 10x10 square
    expect(ringSignedArea2([...outer].reverse())).toBe(-200);
    const oriented = orientPolygon([[...outer].reverse(), hole]);
    expect(ringSignedArea2(oriented[0] as ScreenRing)).toBeGreaterThan(0);
    expect(ringSignedArea2(oriented[1] as ScreenRing)).toBeLessThan(0);
    // Already-correct winding is preserved verbatim.
    expect(orientPolygon(withHole)[0]).toEqual([...outer]);
  });

  it('bounds and area-weighted centroid', () => {
    expect(multiPolygonBounds([withHole])).toEqual([0, 0, 10, 10]);
    expect(multiPolygonCentroid([withHole])).toEqual([5, 5]);
    const twin: ScreenPolygon = [
      [
        [20, 0],
        [30, 0],
        [30, 10],
        [20, 10],
      ],
    ];
    // Two equal squares -> centroid midway between their centers.
    expect(multiPolygonCentroid([[outer], twin])).toEqual([15, 5]);
    expect(multiPolygonBounds([])).toBeNull();
  });

  it('multiPolygonPath emits one M/L…/Z subpath per ring, winding-normalized', () => {
    const cmds = multiPolygonPath([withHole]);
    expect(cmds.filter((c) => c[0] === 'M')).toHaveLength(2);
    expect(cmds.filter((c) => c[0] === 'Z')).toHaveLength(2);
    expect(cmds[0]).toEqual(['M', 0, 0]);
    expect(cmds).toHaveLength(2 * 4 + 2); // 8 vertices + 2 closes
    // The hole subpath winds opposite the exterior.
    const holeStart = cmds.findIndex((c, i) => i > 0 && c[0] === 'M');
    expect(cmds[holeStart]).toEqual(['M', 3, 7]);
  });
});
