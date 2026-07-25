/**
 * Choropleth chart-type definition (v0.3 contract).
 *
 * One series of `{ x: featureName, y: value }`; the topology comes from
 * `choropleth.geojson` and is ALWAYS caller-supplied — nothing geographic is
 * bundled with the library, ever.
 *
 * Pipeline: parse the FeatureCollection (Polygon / MultiPolygon; other
 * geometry types are skipped — see ./geojson.ts) -> project every ring with
 * `choropleth.projection` (default 'mercator') -> `fitExtent` the whole
 * collection into the plot rect, aspect ratio preserved -> fill each feature
 * from the sequential ramp over `choropleth.min`/`max` (default: the data
 * extent) -> hairline `theme.axisLine` borders.
 *
 * MATCHING is EXACT (no trimming, no case folding): the GeoJSON property
 * named by `choropleth.featureKey` (default 'name') is compared as a string
 * against each datum's label (`point.label`, else `point.x`). Consequences,
 * both deliberate:
 *   * a feature with NO datum is filled `theme.gridline` and reported as
 *     "no data" in the a11y table (it is not hoverable — there is no datum to
 *     put in an event or tooltip);
 *   * a DATUM with no feature follows `choropleth.unmatched`: `'warn'` (the
 *     DEFAULT) reports it loudly — a structured `console.warn` plus a sentence
 *     in the accessible description — while still drawing the rest of the map;
 *     `'strict'` throws; `'omit'` is silent. Either way the row keeps its a11y
 *     table entry (and therefore its `exportData()` row), so no datum is lost.
 *
 * Legend = the heatmap's gradient color-scale hook (`legendCustomEl`),
 * non-toggleable. Keyboard walks features in DATA order. A11y table =
 * feature + value. Hit-testing is ray-casting point-in-polygon (even-odd
 * across a polygon's rings, so holes are outside; MultiPolygon-aware).
 */
import type { ChartOptions, TooltipPoint } from '../../types';
import type { PointPos, TypeGeom } from '../../layout';
import type { DataModel, ResolvedOptions } from '../../model';
import type { ChartTypeDefinition, DefinitionContext } from '../registry';
import type { A11yTableSpec } from '../../a11y';
import { resolveSequentialRamp } from '../../theme';
import { formatValue } from '../../util';
import { rampColor } from '../matrix/color-scale';
import { allRings, parseGeoFeatures, type ParsedGeoFeature } from './geojson';
import { fitExtent, projectRing, projectionByName, type ProjectionName } from './projections';
import {
  multiPolygonBounds,
  multiPolygonCentroid,
  multiPolygonPath,
  pointInMultiPolygon,
  type ScreenBounds,
  type ScreenPolygon,
} from './polygon';

/** Hairline border width for feature outlines (contract: hairline). */
export const CHOROPLETH_BORDER_WIDTH = 1;

type ChoroplethOptions = NonNullable<ChartOptions['choropleth']>;

/** One projected, colored feature. */
export interface ChoroplethShape {
  /** Feature key value ('' when the feature has no key property). */
  key: string;
  /** MODEL point index of the matching datum, or null = no data. */
  pi: number | null;
  value: number | null;
  fill: string;
  /** Projected polygons (screen px). */
  polygons: ScreenPolygon[];
  bounds: ScreenBounds | null;
  centroid: [number, number] | null;
}

/** Resolved policy for data rows that match no feature. */
export type ChoroplethUnmatchedPolicy = 'warn' | 'strict' | 'omit';

export interface ChoroplethGeomExtra {
  /** MODEL series index that supplies the values (-1 when none is visible). */
  si: number;
  shapes: ChoroplethShape[];
  /** Shapes with data, indexed by model point index. */
  byPi: (ChoroplethShape | undefined)[];
  /** Keys of features with no datum, in GeoJSON order (a11y "no data"). */
  noData: string[];
  /** Data labels that matched no feature (the `unmatched` diagnostic). */
  unmatchedRows: string[];
  min: number;
  max: number;
  ramp: string[];
  projection: ProjectionName;
}

/** One row of the caller's data: label + value. */
export interface ChoroplethRow {
  pi: number;
  key: string;
  value: number | null;
  /** Per-point color override (`DataPoint.color`), if any. */
  color?: string;
}

// ---------------------------------------------------------------- pure math

/**
 * Resolved ramp: the caller's `choropleth.ramp` verbatim, else the default
 * sequential blue palette ORIENTED for the theme's surface (as for heatmap) — a
 * near-zero feature may recede toward the surface, the highest-value one never
 * does. See `theme#sequentialRampFor`.
 */
export function choroplethRamp(
  opts: Pick<ResolvedOptions, 'choropleth'>,
  scheme: 'light' | 'dark',
): string[] {
  return resolveSequentialRamp(opts.choropleth?.ramp, scheme);
}

/**
 * Color-scale extent: `choropleth.min`/`max` override the data extent over
 * visible series. A degenerate extent widens by +1 so the scale stays defined
 * (same rule as heatmap).
 */
export function choroplethExtent(model: DataModel, choropleth?: { min?: number; max?: number }): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of model.series) {
    if (!s.visible) continue;
    for (const p of s.points) {
      if (p.y === null) continue;
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (choropleth?.min !== undefined) lo = choropleth.min;
  if (choropleth?.max !== undefined) hi = choropleth.max;
  if (lo === hi) hi = lo + 1;
  return [lo, hi];
}

/** Fill color for a value against the extent. */
export function choroplethColor(value: number, min: number, max: number, ramp: readonly string[]): string {
  return rampColor(ramp, (value - min) / (max - min));
}

/** The series that supplies values: the first visible one (contract: one series). */
export function choroplethSeriesIndex(model: DataModel): number {
  return model.series.findIndex((s) => s.visible);
}

/** Data rows (label + value) of the value-carrying series, in DATA order. */
export function choroplethRows(model: DataModel): { si: number; rows: ChoroplethRow[] } {
  const si = choroplethSeriesIndex(model);
  if (si < 0) return { si, rows: [] };
  const points = model.series[si]?.points ?? [];
  const rows: ChoroplethRow[] = points.map((p, pi) => {
    const label = p.label ?? (p.x === null ? '' : p.x);
    const row: ChoroplethRow = {
      pi,
      key: label instanceof Date ? label.toISOString() : String(label),
      value: p.y,
    };
    if (p.color !== undefined) row.color = p.color;
    return row;
  });
  return { si, rows };
}

/**
 * Match features to data rows by EXACT key equality. A row may match several
 * features (a country split into separate island features shares one datum);
 * a feature matches at most one row (the first with that key).
 * Returns the per-feature row (null = no data) and the keys of rows that
 * matched nothing.
 */
export function matchFeaturesToRows(
  features: readonly ParsedGeoFeature[],
  rows: readonly ChoroplethRow[],
): { perFeature: (ChoroplethRow | null)[]; unmatchedRows: string[] } {
  const byKey = new Map<string, ChoroplethRow>();
  for (const r of rows) if (!byKey.has(r.key)) byKey.set(r.key, r);
  const used = new Set<string>();
  const perFeature = features.map((f) => {
    if (f.key === null) return null;
    const row = byKey.get(f.key);
    if (!row) return null;
    used.add(row.key);
    return row;
  });
  const unmatchedRows: string[] = [];
  for (const r of rows) {
    if (!used.has(r.key) && !unmatchedRows.includes(r.key)) unmatchedRows.push(r.key);
  }
  return { perFeature, unmatchedRows };
}

// -------------------------------------------------------- parsing (cached)

/**
 * Parsed features, memoized on the caller's `geojson` OBJECT IDENTITY (plus
 * the key used). Layout, the a11y table and the legend all need the feature
 * list; a world topology is megabytes of coordinates, so it is walked once
 * per (collection, featureKey) pair instead of once per stage.
 */
const parseCache = new WeakMap<object, { featureKey: string; features: ParsedGeoFeature[] }>();

export function choroplethFeatures(choropleth: ChoroplethOptions | undefined): ParsedGeoFeature[] {
  const geojson = choropleth?.geojson as unknown;
  if (!geojson || typeof geojson !== 'object') return [];
  const featureKey = choropleth?.featureKey ?? 'name';
  const hit = parseCache.get(geojson as object);
  if (hit && hit.featureKey === featureKey) return hit.features;
  const features = parseGeoFeatures(geojson, featureKey);
  parseCache.set(geojson as object, { featureKey, features });
  return features;
}

/** The contract makes `choropleth.geojson` REQUIRED; fail loudly and usefully. */
function requireGeojson(opts: ResolvedOptions): ChoroplethOptions {
  const c = opts.choropleth;
  if (!c || !c.geojson) {
    throw new Error(
      '@chartcraft/core: choropleth requires options.choropleth.geojson — GeoJSON topology is ' +
        'caller-supplied and never bundled with the library. Pass a FeatureCollection whose ' +
        `features carry the '${c?.featureKey ?? 'name'}' property matched against your data labels.`,
    );
  }
  return c;
}

/** Resolved `choropleth.unmatched` policy (default: the loud, non-fatal one). */
export function choroplethUnmatchedPolicy(
  choropleth: { unmatched?: ChoroplethUnmatchedPolicy } | undefined,
): ChoroplethUnmatchedPolicy {
  const p = choropleth?.unmatched;
  return p === 'strict' || p === 'omit' ? p : 'warn';
}

/**
 * The one diagnostic message, shared by the throw and the warning so the two
 * modes say exactly the same thing (and a test can assert one string).
 */
export function unmatchedRowsMessage(
  unmatched: readonly string[],
  featureKey: string,
  featureCount: number,
): string {
  const shown = unmatched.slice(0, 5).map((k) => `'${k}'`).join(', ');
  const more = unmatched.length > 5 ? ` (+${unmatched.length - 5} more)` : '';
  return (
    `@chartcraft/core: choropleth data has ${unmatched.length} row(s) with no matching feature: ` +
    `${shown}${more}. Matching is EXACT against the GeoJSON property '${featureKey}' over ` +
    `${featureCount} feature(s) — check spelling/casing, or set choropleth.featureKey to the ` +
    `property your labels use.`
  );
}

/** Accessible-description sentence for unmatched rows (null when there are none). */
export function describeUnmatchedRows(unmatched: readonly string[]): string | null {
  if (unmatched.length === 0) return null;
  const shown = unmatched.slice(0, 5).join(', ');
  const more = unmatched.length > 5 ? `, and ${unmatched.length - 5} more` : '';
  return (
    `${unmatched.length} data ${unmatched.length === 1 ? 'row' : 'rows'} could not be placed on the ` +
    `map: ${shown}${more}. ${unmatched.length === 1 ? 'Its value is' : 'Their values are'} in the ` +
    `data table but not shaded.`
  );
}

/**
 * Signatures already warned about, so a resize or a hover repaint does not
 * re-warn for the same mismatch. Bounded, because a long-lived page that keeps
 * feeding new bad data should not grow this set without limit.
 */
const WARNED = new Set<string>();
const WARNED_LIMIT = 64;

function warnUnmatchedOnce(unmatched: readonly string[], featureKey: string, featureCount: number): void {
  const message = unmatchedRowsMessage(unmatched, featureKey, featureCount);
  if (WARNED.has(message)) return;
  if (WARNED.size >= WARNED_LIMIT) WARNED.clear();
  WARNED.add(message);
  // Loud, but not fatal: the map still draws, and the a11y description says so.
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(message, { unmatched: [...unmatched], featureKey, featureCount });
  }
}

/** Test seam: forget which diagnostics have already been warned about. */
export function resetChoroplethWarnings(): void {
  WARNED.clear();
}

function extraOf(geom: TypeGeom): ChoroplethGeomExtra | null {
  return (geom.extra as ChoroplethGeomExtra | undefined) ?? null;
}

// -------------------------------------------------------------- definition

export const choroplethDefinition: ChartTypeDefinition = {
  id: 'choropleth',
  needs: { cartesianAxes: false },

  resolveOptions(resolved, raw) {
    // The gradient color scale is the only key to what fills mean, so legend
    // "auto" resolves to SHOWN even for a single series (as for heatmap).
    const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
    if (rawShow === undefined) resolved.legend.show = true;
  },

  layout(ctx): TypeGeom {
    const { model, theme, opts } = ctx;
    const plot = ctx.layout.plot;
    const choropleth = requireGeojson(opts);
    const featureKey = choropleth.featureKey ?? 'name';
    const projection = (choropleth.projection ?? 'mercator') as ProjectionName;

    const features = choroplethFeatures(choropleth);
    const { si, rows } = choroplethRows(model);
    const { perFeature, unmatchedRows } = matchFeaturesToRows(features, rows);
    if (unmatchedRows.length > 0) {
      const policy = choroplethUnmatchedPolicy(choropleth);
      if (policy === 'strict') {
        throw new Error(unmatchedRowsMessage(unmatchedRows, featureKey, features.length));
      }
      if (policy === 'warn') warnUnmatchedOnce(unmatchedRows, featureKey, features.length);
    }

    const [min, max] = choroplethExtent(model, choropleth);
    const ramp = choroplethRamp(opts, theme.colorScheme);
    const transform = fitExtent(allRings(features), projectionByName(projection), plot);

    const pos: (PointPos | null)[][] = model.series.map(() => []);
    if (si >= 0) pos[si] = (model.series[si]?.points ?? []).map(() => null);

    const shapes: ChoroplethShape[] = [];
    const byPi: (ChoroplethShape | undefined)[] = [];
    const noData: string[] = [];

    features.forEach((f, fi) => {
      const polygons: ScreenPolygon[] = [];
      for (const poly of f.polygons) {
        const rings = poly.map((ring) => projectRing(ring, transform)).filter((r) => r.length >= 3);
        if (rings.length > 0) polygons.push(rings);
      }
      if (polygons.length === 0) return; // entirely clipped (orthographic far side)
      const row = perFeature[fi] ?? null;
      const value = row?.value ?? null;
      const fill =
        row?.color ?? (value === null ? theme.gridline : choroplethColor(value, min, max, ramp));
      const shape: ChoroplethShape = {
        key: f.key ?? '',
        pi: row ? row.pi : null,
        value,
        fill,
        polygons,
        bounds: multiPolygonBounds(polygons),
        centroid: multiPolygonCentroid(polygons),
      };
      shapes.push(shape);
      if (row) {
        // First feature for a datum owns the keyboard/tooltip anchor.
        if (byPi[row.pi] === undefined) {
          byPi[row.pi] = shape;
          const c = shape.centroid;
          if (c && si >= 0) {
            const arr = pos[si];
            if (arr) arr[row.pi] = { x: c[0], y: c[1], y0: c[1] };
          }
        }
      } else {
        noData.push(shape.key);
      }
    });

    const extra: ChoroplethGeomExtra = {
      si,
      shapes,
      byPi,
      noData,
      unmatchedRows: choroplethUnmatchedPolicy(choropleth) === 'omit' ? [] : unmatchedRows,
      min,
      max,
      ramp,
      projection,
    };
    return { pos, slices: null, bars: null, extra };
  },

  render(ctx) {
    const { r, theme, hover } = ctx;
    const extra = extraOf(ctx.geom);
    if (!extra) return;
    const plot = ctx.layout.plot;
    const border = { color: theme.axisLine, width: CHOROPLETH_BORDER_WIDTH };

    // Clip so hairline borders never bleed into the padding/legend area.
    r.clipRect(plot.x, plot.y, plot.w, plot.h, () => {
      let hovered: ChoroplethShape | null = null;
      for (const shape of extra.shapes) {
        const cmds = multiPolygonPath(shape.polygons);
        if (cmds.length === 0) continue;
        if (hover && shape.pi !== null && hover.si === extra.si && hover.pi === shape.pi) {
          hovered = shape;
        }
        r.path(cmds, { fill: shape.fill, stroke: border });
      }
      // Hover outline last so it is never overdrawn by a neighbour's border.
      if (hovered) {
        r.path(multiPolygonPath(hovered.polygons), {
          stroke: { color: theme.textPrimary, width: 1.5 },
        });
      }
    });
  },

  hitTest(ctx, px, py) {
    const extra = extraOf(ctx.geom);
    if (!extra || extra.si < 0) return null;
    for (const shape of extra.shapes) {
      if (shape.pi === null) continue; // no datum -> nothing to report
      const b = shape.bounds;
      if (b && (px < b[0] || px > b[2] || py < b[1] || py > b[3])) continue;
      if (pointInMultiPolygon(shape.polygons, px, py)) return { si: extra.si, pi: shape.pi };
    }
    return null;
  },

  legendItems() {
    // The color scale is a custom element (legendCustomEl); no items, and
    // nothing is toggleable.
    return [];
  },

  /** Horizontal gradient color-scale bar with min/max labels (heatmap hook). */
  legendCustomEl(ctx: DefinitionContext, doc: Document): HTMLElement | null {
    const { theme, model, opts } = ctx;
    const [min, max] = choroplethExtent(model, opts.choropleth);
    const ramp = choroplethRamp(opts, theme.colorScheme);

    const wrap = doc.createElement('div');
    wrap.className = 'chartcraft-choropleth-legend';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `Color scale from ${formatValue(min)} to ${formatValue(max)}`);
    const ws = wrap.style;
    ws.display = 'inline-flex';
    ws.alignItems = 'center';
    ws.gap = '6px';
    ws.font = `${theme.fontSize}px ${theme.fontFamily}`;

    const mkLabel = (text: string, cls: string): HTMLElement => {
      const el = doc.createElement('span');
      el.className = cls;
      el.textContent = text;
      el.style.color = theme.textMuted;
      return el;
    };

    const bar = doc.createElement('span');
    bar.className = 'chartcraft-choropleth-legend-bar';
    const bs = bar.style;
    bs.display = 'inline-block';
    bs.width = '120px';
    bs.height = '10px';
    bs.borderRadius = '3px';
    bs.background = `linear-gradient(90deg, ${ramp.join(', ')})`;
    bs.flexShrink = '0';

    wrap.append(
      mkLabel(formatValue(min), 'chartcraft-choropleth-legend-min'),
      bar,
      mkLabel(formatValue(max), 'chartcraft-choropleth-legend-max'),
    );
    return wrap;
  },

  /**
   * Unmatched data rows are reported to screen-reader users too: the visual
   * "this region is missing" cue does not exist for them, and the table alone
   * cannot say which rows failed to place. `'omit'` says nothing, by definition.
   */
  a11yDescription(ctx): string | null {
    return describeUnmatchedRows(extraOf(ctx.geom)?.unmatchedRows ?? []);
  },

  a11yTable(ctx): A11yTableSpec {
    // Feature + value in DATA order (the keyboard order and `dataIndex`
    // order), then the features that carry no datum so a screen-reader user
    // learns which regions are unfilled — the visual "no data" grey has no
    // other accessible equivalent.
    const { rows } = choroplethRows(ctx.model);
    const features = choroplethFeatures(ctx.opts.choropleth);
    const { perFeature } = matchFeaturesToRows(features, rows);
    const out: A11yTableSpec['rows'] = rows.map((r) => ({
      header: r.key,
      cells: [formatValue(r.value)],
    }));
    features.forEach((f, fi) => {
      if (perFeature[fi]) return;
      out.push({ header: f.key ?? '—', cells: ['no data'] });
    });
    return { columns: ['Feature', 'Value'], rows: out };
  },

  /**
   * A map is FEATURES, and the two numbers a reader needs first are how many of
   * them carry data and what the color scale spans.
   */
  a11ySummary(ctx): string | null {
    const { rows } = choroplethRows(ctx.model);
    const features = choroplethFeatures(ctx.opts.choropleth);
    const { perFeature } = matchFeaturesToRows(features, rows);
    const shaded = perFeature.filter(Boolean).length;
    const [min, max] = choroplethExtent(ctx.model, ctx.opts.choropleth);
    return (
      `${features.length} map ${features.length === 1 ? 'feature' : 'features'}, ` +
      `${shaded} shaded from data, color scale from ${formatValue(min)} to ${formatValue(max)}`
    );
  },

  keyboardNav(model) {
    // Features in DATA order (contract): pi indexes the data rows.
    const si = choroplethSeriesIndex(model);
    return {
      seriesCount: model.series.length,
      isVisible: (i) => i === si,
      pointCount: (i) => (i === si && si >= 0 ? (model.series[i]?.points.length ?? 0) : 0),
    };
  },

  announce(ctx, pos) {
    const extra = extraOf(ctx.geom);
    const s = ctx.model.series[pos.si];
    if (!extra || !s) return null;
    const total = s.points.length;
    const shape = extra.byPi[pos.pi];
    const { rows } = choroplethRows(ctx.model);
    const row = rows[pos.pi];
    const name = shape?.key || row?.key || '—';
    const value = row?.value ?? null;
    return `${name}: ${value === null ? 'no value' : formatValue(value)}. Feature ${pos.pi + 1} of ${total}.`;
  },

  tooltipPoints(ctx, hit): TooltipPoint[] {
    const tp = ctx.pointFor(hit.si, hit.pi);
    if (!tp) return [];
    const extra = extraOf(ctx.geom);
    const shape = extra?.byPi[hit.pi];
    if (shape) {
      tp.formattedX = shape.key;
      tp.color = shape.fill;
    }
    return [tp];
  },
};
