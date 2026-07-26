/**
 * Internal model types + option resolution + model building.
 * Pure (no DOM) so every stage is unit-testable.
 *
 * v0.2: no per-type branching lives here. Option resolution and model
 * building consult the chart-type registry: a `ChartTypeDefinition` declares
 * its pipeline needs (cartesian axes, base mark kind, stacking, ...) and may
 * hook per-type option resolution (legend auto policy, tooltip defaults).
 */
import type {
  A11yOptions,
  Annotation,
  AxisOptions,
  ChartData,
  ChartOptions,
  ChartType,
  DataLabelOptions,
  LegendOptions,
  SeriesKind,
  Theme,
  TooltipPoint,
  ZoomOptions,
} from './types';
import {
  deriveCategories,
  dataValuesOf,
  downsampleNormalized,
  hasRangeData,
  inferXType,
  normalizeSeriesData,
  windowNormalized,
  type Category,
  type NormalizedPoint,
  type XType,
} from './data/normalize';
import { extendYDomainForDecorators, normalizeViewport, type Viewport } from './decorate';
import { computeStacks, stackExtent } from './data/stack';
import { getChartType, valueAxisOf, type ChartTypeDefinition } from './charts/registry';
import { registerBuiltinChartTypes } from './charts';
import type { MarkerShape } from './charts/markers';
import { resolveTableMaxRows } from './a11y';
import { resolveTheme } from './theme';

/**
 * Registry lookup that guarantees the built-in definitions are registered
 * first. The package ships `sideEffects: false`, so registration must be an
 * explicit (idempotent) call rather than an import side effect that a
 * bundler may tree-shake away.
 */
function chartDef(type: ChartOptions['type']): ChartTypeDefinition {
  registerBuiltinChartTypes();
  return getChartType(type);
}

export interface ResolvedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResolvedLegend {
  show: boolean;
  position: 'top' | 'bottom' | 'right';
  interactive: boolean;
  /**
   * v0.3 — true when the CALLER did not set `legend`/`legend.show`, i.e. `show`
   * is a policy decision the pipeline (or a type's `resolveOptions`) made and a
   * later stage may still override. `ChartTypeDefinition.resolveLegend` consults
   * it so a measured layout decision never clobbers an explicit choice.
   */
  auto: boolean;
}

export interface ResolvedTooltip {
  show: boolean;
  shared: boolean;
  format?: (points: TooltipPoint[]) => string;
}

export interface ResolvedAnimation {
  enabled: boolean;
  duration: number;
  easing: 'linear' | 'ease-out' | 'ease-in-out';
}

/** v0.3 — resolved `dataLabels` (behavior lives in the data-label decorator). */
export interface ResolvedDataLabels {
  show: boolean;
  /** Selectivity is mandatory; 'auto' is the default when enabled. */
  select: NonNullable<DataLabelOptions['select']>;
  position: NonNullable<DataLabelOptions['position']>;
  format?: NonNullable<DataLabelOptions['format']>;
}

/** v0.3 — resolved `zoom` (behavior lives in the zoom decorator). */
export interface ResolvedZoom {
  enabled: boolean;
  axis: NonNullable<ZoomOptions['axis']>;
  wheel: boolean;
  drag: boolean;
  pan: boolean;
  minSpan?: number;
}

export interface ResolvedOptions {
  type: ChartType;
  data: ChartData;
  theme: 'light' | 'dark' | 'auto' | Theme;
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  padding: ResolvedPadding;
  xAxis: AxisOptions;
  yAxis: AxisOptions;
  stacked: boolean;
  horizontal: boolean;
  legend: ResolvedLegend;
  tooltip: ResolvedTooltip;
  animation: ResolvedAnimation;
  downsample: { enabled: boolean; threshold: number };
  a11y: Required<Pick<A11yOptions, 'table' | 'keyboard' | 'tableMaxRows'>> &
    Pick<A11yOptions, 'title' | 'description'>;
  // v0.2 per-type option blocks (passed through for the type definitions).
  histogram?: ChartOptions['histogram'];
  heatmap?: ChartOptions['heatmap'];
  gauge?: ChartOptions['gauge'];
  waterfall?: ChartOptions['waterfall'];
  // v0.3 cross-cutting features (consumed by decorators, not by types).
  dataLabels: ResolvedDataLabels;
  annotations: Annotation[];
  zoom: ResolvedZoom;
  // v0.3 per-type option blocks (passed through for the type definitions).
  rangearea?: ChartOptions['rangearea'];
  bullet?: ChartOptions['bullet'];
  calendar?: ChartOptions['calendar'];
  violin?: ChartOptions['violin'];
  radialbar?: ChartOptions['radialbar'];
  rose?: ChartOptions['rose'];
  sankey?: ChartOptions['sankey'];
  gantt?: ChartOptions['gantt'];
  wordcloud?: ChartOptions['wordcloud'];
  network?: ChartOptions['network'];
  choropleth?: ChartOptions['choropleth'];
  parallel?: ChartOptions['parallel'];
}

const DEFAULT_PADDING = 12;

export function resolveOptions(raw: ChartOptions): ResolvedOptions {
  const def = chartDef(raw.type);
  const type = raw.type;

  const padding: ResolvedPadding =
    typeof raw.padding === 'number'
      ? { top: raw.padding, right: raw.padding, bottom: raw.padding, left: raw.padding }
      : {
          top: raw.padding?.top ?? DEFAULT_PADDING,
          right: raw.padding?.right ?? DEFAULT_PADDING,
          bottom: raw.padding?.bottom ?? DEFAULT_PADDING,
          left: raw.padding?.left ?? DEFAULT_PADDING,
        };

  const seriesCount = raw.data?.series?.length ?? 0;
  const legendRaw: LegendOptions = typeof raw.legend === 'boolean' ? { show: raw.legend } : (raw.legend ?? {});
  const legend: ResolvedLegend = {
    // Generic auto policy: shown when series >= 2, hidden for 1. Definitions
    // refine this in their resolveOptions hook (pie keys off slice count,
    // sparkline hides chrome, ...).
    show: legendRaw.show ?? seriesCount >= 2,
    position: legendRaw.position ?? 'top',
    interactive: legendRaw.interactive ?? true,
    auto: legendRaw.show === undefined,
  };

  const tooltipRaw = typeof raw.tooltip === 'boolean' ? { show: raw.tooltip } : (raw.tooltip ?? {});
  const tooltip: ResolvedTooltip = {
    show: tooltipRaw.show ?? true,
    // Shared (crosshair) default is per-type: line/area definitions turn it on.
    shared: tooltipRaw.shared ?? false,
  };
  if (tooltipRaw.format) tooltip.format = tooltipRaw.format;

  const animation: ResolvedAnimation =
    typeof raw.animation === 'boolean'
      ? { enabled: raw.animation, duration: 300, easing: 'ease-out' }
      : {
          enabled: true,
          duration: raw.animation?.duration ?? 300,
          easing: raw.animation?.easing ?? 'ease-out',
        };

  // v0.3 dataLabels: default off; when enabled, selectivity defaults to 'auto'
  // (labels extremes/endpoints only and drops colliding labels).
  const dlRaw: DataLabelOptions = typeof raw.dataLabels === 'boolean' ? { show: raw.dataLabels } : (raw.dataLabels ?? {});
  const dataLabels: ResolvedDataLabels = {
    show: dlRaw.show ?? (raw.dataLabels !== undefined && raw.dataLabels !== false),
    select: dlRaw.select ?? 'auto',
    position: dlRaw.position ?? 'auto',
  };
  if (dlRaw.format) dataLabels.format = dlRaw.format;

  // v0.3 zoom: default off; axis 'x'; wheel/drag/pan on once enabled.
  const zoomRaw: ZoomOptions = typeof raw.zoom === 'boolean' ? { enabled: raw.zoom } : (raw.zoom ?? {});
  const zoom: ResolvedZoom = {
    enabled: zoomRaw.enabled ?? (raw.zoom !== undefined && raw.zoom !== false),
    axis: zoomRaw.axis ?? 'x',
    wheel: zoomRaw.wheel ?? true,
    drag: zoomRaw.drag ?? true,
    pan: zoomRaw.pan ?? true,
  };
  if (zoomRaw.minSpan !== undefined) zoom.minSpan = zoomRaw.minSpan;

  const resolved: ResolvedOptions = {
    type,
    data: raw.data ?? { series: [] },
    theme: raw.theme ?? 'auto',
    padding,
    xAxis: raw.xAxis ?? {},
    yAxis: raw.yAxis ?? {},
    stacked: raw.stacked ?? false,
    horizontal: raw.horizontal ?? false,
    legend,
    tooltip,
    animation,
    downsample: {
      enabled: raw.downsample?.enabled ?? true,
      threshold: raw.downsample?.threshold ?? 5000,
    },
    a11y: {
      table: raw.a11y?.table ?? 'hidden',
      keyboard: raw.a11y?.keyboard ?? true,
      tableMaxRows: resolveTableMaxRows(raw.a11y?.tableMaxRows),
      ...(raw.a11y?.title !== undefined ? { title: raw.a11y.title } : {}),
      ...(raw.a11y?.description !== undefined ? { description: raw.a11y.description } : {}),
    },
    dataLabels,
    annotations: raw.annotations ? [...raw.annotations] : [],
    zoom,
  };
  if (raw.title !== undefined) resolved.title = raw.title;
  if (raw.subtitle !== undefined) resolved.subtitle = raw.subtitle;
  if (raw.width !== undefined) resolved.width = raw.width;
  if (raw.height !== undefined) resolved.height = raw.height;
  if (raw.histogram !== undefined) resolved.histogram = raw.histogram;
  if (raw.heatmap !== undefined) resolved.heatmap = raw.heatmap;
  if (raw.gauge !== undefined) resolved.gauge = raw.gauge;
  if (raw.waterfall !== undefined) resolved.waterfall = raw.waterfall;
  if (raw.rangearea !== undefined) resolved.rangearea = raw.rangearea;
  if (raw.bullet !== undefined) resolved.bullet = raw.bullet;
  if (raw.calendar !== undefined) resolved.calendar = raw.calendar;
  if (raw.violin !== undefined) resolved.violin = raw.violin;
  if (raw.radialbar !== undefined) resolved.radialbar = raw.radialbar;
  if (raw.rose !== undefined) resolved.rose = raw.rose;
  if (raw.sankey !== undefined) resolved.sankey = raw.sankey;
  if (raw.gantt !== undefined) resolved.gantt = raw.gantt;
  if (raw.wordcloud !== undefined) resolved.wordcloud = raw.wordcloud;
  if (raw.network !== undefined) resolved.network = raw.network;
  if (raw.choropleth !== undefined) resolved.choropleth = raw.choropleth;
  if (raw.parallel !== undefined) resolved.parallel = raw.parallel;

  // Per-type option resolution (legend auto policy, tooltip defaults, chrome).
  def.resolveOptions?.(resolved, raw);
  return resolved;
}

// ---------------------------------------------------------------------------

export interface NormalizedSeries {
  id: string;
  name: string;
  /** Stable palette slot (first-seen identity). */
  paletteIndex: number;
  colorOverride?: string;
  visible: boolean;
  curve: 'linear' | 'monotone' | 'step';
  lineWidth: number;
  showMarkers: boolean | 'auto';
  /**
   * Resolved mark kind on cartesian charts: the per-series `type` override
   * (combo) or the root type's base kind. null for non-cartesian types.
   */
  kind: SeriesKind | null;
  /** bubble: min/max marker diameter px (value maps to area). */
  sizeRange?: [number, number];
  /**
   * The points that are DRAWN: downsampled and/or narrowed to the zoom window
   * when either applies. Everything on the render path reads this.
   */
  points: NormalizedPoint[];
  /**
   * Every point the caller supplied — set ONLY when `points` is a lossy view of
   * it (downsampling and/or a zoom window dropped rows), and captured before
   * either is applied, so it is both un-downsampled and un-windowed.
   *
   * The accessible data table and `exportData()` read this. LTTB selects the
   * points that best preserve a line's visible SHAPE; it has no notion of which
   * rows matter semantically. Serving its output as "the data" means a
   * screen-reader user is handed a visual approximation — 5,000 of 60,000 rows —
   * with no way to tell anything was dropped, while a sighted user can zoom in
   * and recover every point. An export that silently truncates is the same bug
   * wearing a different hat.
   *
   * Retaining the array costs one reference: these points already exist at this
   * moment in `buildModel`, and the alternative (rebuilding a second,
   * full-fidelity model) pays for a whole extra normalize pass.
   */
  sourcePoints?: NormalizedPoint[];
  /** Stack bounds (set only when this series stacks), aligned with points. */
  y0?: (number | null)[];
  y1?: (number | null)[];
}

export interface DataModel {
  type: ChartType;
  series: NormalizedSeries[];
  categories: Category[] | null;
  xType: XType;
  /** Stacking requested & supported (per-series y0/y1 are authoritative). */
  stacked: boolean;
  horizontal: boolean;
  /** Raw x extent over visible series (continuous x only). */
  xDomain: [number, number] | null;
  /** Raw y extent over visible series (before nice/overrides). */
  yDomain: [number, number];
  /**
   * v0.3 — `yDomain` must be used VERBATIM as the value-axis domain (no
   * `nice()` widening). Set by a definition's `extendValueDomain` returning
   * `{ exact: true }`; an explicit axis `min`/`max` still wins.
   */
  valueDomainExact: boolean;
  /**
   * v0.4.0 — the axis that carries VALUES for this type is logarithmic
   * (`yAxis.type: 'log'`, or `xAxis.type` on a horizontal arrangement).
   *
   * Every stage that widens the value domain has to know, because the two axis
   * kinds round in incompatible directions: a linear axis anchors bars/areas at
   * zero and rounds a floor outward THROUGH zero, and a log axis has no zero at
   * all. Resolved once here (from the registry's `valueAxisOf`, not from a
   * `horizontal` guess) so `valueExtentOf`, `applyDomainExtensions` and every
   * type's `extendValueDomain` agree on the answer.
   */
  valueAxisLog: boolean;
  /**
   * v0.3 — a datum's category band is its POINT INDEX, never its `x`
   * (`ChartTypeNeeds.bandIndex: 'position'`). `bandIndexFor` obeys it.
   */
  bandByPosition: boolean;
  /** Longest series length. */
  maxLen: number;
  /**
   * v0.3 — active zoom viewport (continuous domain overrides), or null.
   * Retained on the model so layout, decorators and definitions can read the
   * visible window. Set it through `Chart.zoomTo` / `DecoratorHost`.
   */
  viewport: Viewport | null;
}

export function seriesColor(s: NormalizedSeries, theme: Theme): string {
  if (s.colorOverride) return s.colorOverride;
  const slots = theme.series;
  return slots[s.paletteIndex % slots.length] ?? '#888888';
}

// ------------------------------------------------- composite encoding (9+)

/**
 * How many times a series' palette slot has wrapped past the end of the
 * validated hue order: 0 for the first 8 series, 1 for series 9-16, and so on.
 *
 * The 8-slot order is a colorblind-safety mechanism (adjacent-pair CVD ΔE ≥ 8),
 * and there is no 9th safe hue to generate — a generated one would be an
 * unvalidated color, which is the thing the palette rules exist to prevent. So
 * the hue order is REUSED and a second, non-color channel separates the repeat.
 *
 * The alternative — silently folding series 9+ into an "Other" bucket — is not
 * available to a library: it would destroy data the caller explicitly asked us
 * to draw. Folding is the right ANSWER, but it is the caller's to make, so the
 * pipeline recommends it once (see `warnPaletteOverflow`) and keeps drawing
 * every series in the meantime.
 */
export function seriesCycle(s: NormalizedSeries, theme: Theme): number {
  if (s.colorOverride) return 0;
  const n = theme.series.length;
  return n > 0 ? Math.floor(s.paletteIndex / n) : 0;
}

/**
 * Dash patterns for the composite encoding, indexed by `seriesCycle`.
 * Cycle 0 (the validated 8) is always solid — nothing about the first eight
 * series changes. Patterns are chosen to stay distinguishable at 2px stroke
 * width: a long dash, a fine dot, and a dash-dot.
 */
export const SERIES_DASH_CYCLE: readonly (readonly number[])[] = [
  [], // cycle 0 — solid
  [7, 4],
  [1.5, 3],
  [10, 3, 2, 3],
];

/** Marker shapes for the composite encoding, indexed by `seriesCycle`. */
export const SERIES_MARKER_CYCLE: readonly MarkerShape[] = ['circle', 'square', 'triangle', 'diamond'];

/**
 * Dash pattern for a series' line-family marks, or `undefined` for a solid
 * stroke. Undefined for every series inside the validated 8 slots, so no v0.2
 * or v0.3 chart changes appearance.
 */
export function seriesDash(s: NormalizedSeries, theme: Theme): number[] | undefined {
  const c = seriesCycle(s, theme);
  if (c === 0) return undefined;
  const pattern = SERIES_DASH_CYCLE[c % SERIES_DASH_CYCLE.length] ?? [];
  return pattern.length > 0 ? [...pattern] : undefined;
}

/** Marker shape for a series (circle for every series inside the 8 slots). */
export function seriesMarker(s: NormalizedSeries, theme: Theme): MarkerShape {
  const c = seriesCycle(s, theme);
  return SERIES_MARKER_CYCLE[c % SERIES_MARKER_CYCLE.length] ?? 'circle';
}

/**
 * ONE warning per chart instance when the series count outruns the validated
 * palette. Keyed on the instance's own `paletteSlots` map, which `buildModel`
 * already threads through for exactly this kind of per-chart identity.
 */
const overflowWarned = new WeakSet<Map<string, number>>();

function warnPaletteOverflow(
  opts: ResolvedOptions,
  paletteSlots: Map<string, number>,
  slotCount: number,
  seriesCount: number,
): void {
  if (overflowWarned.has(paletteSlots)) return;
  overflowWarned.add(paletteSlots);
  const named = opts.title ? `"${opts.title}" (${opts.type})` : `${opts.type}`;
  // eslint-disable-next-line no-console
  console.warn(
    `@chartcraft/core: ${named} chart has ${seriesCount} series but the validated palette has ` +
      `${slotCount} colorblind-safe slots. Series ${slotCount + 1}+ reuse the hue order and are ` +
      `separated by a dash pattern and marker shape instead of a new color. That is a fallback, ` +
      `not a design: fold the tail into an "Other" series or split the chart into small multiples.`,
  );
}

/**
 * ONE warning per chart instance when a log value axis had to drop data.
 * Keyed on the instance's `paletteSlots` map, exactly as `overflowWarned` is.
 */
const logDropWarned = new WeakSet<Map<string, number>>();

/**
 * THE LOG-AXIS DATA RULE (v0.4.0).
 *
 * `log10(v)` is undefined for `v <= 0`: a zero or negative value has no
 * position on a log axis, at any zoom, under any domain. So the value is
 * dropped — folded to `null`, which is already the pipeline's single
 * representation of "no value here" (`data/normalize.ts#value` folds `NaN` and
 * `±Infinity` the same way, for the same reason: one code path for gaps in
 * lines, skipped marks, `—` in the a11y table and in `exportData()`, and an
 * untouched value domain).
 *
 * DROP, NOT THROW. The library throws for STRUCTURAL impossibilities — pyramid
 * demands two series, sankey rejects a cycle — because there is no chart to
 * draw at all. A single non-positive datum is not that: the other 999 points
 * are perfectly plottable, and a live dashboard that switches a linear axis to
 * log must not go blank because one row is zero. It is announced ONCE per chart
 * instead, with the two ways out named.
 *
 * Returns the number of values dropped (0 when there were none, which is the
 * overwhelmingly common case and allocates nothing).
 */
function dropNonPositiveForLog(seriesPoints: NormalizedPoint[][]): number {
  let dropped = 0;
  for (const pts of seriesPoints) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      const badY = p.y !== null && p.y !== undefined && p.y <= 0;
      const badLow = typeof p.low === 'number' && p.low <= 0;
      const badHigh = typeof p.high === 'number' && p.high <= 0;
      if (!badY && !badLow && !badHigh) continue;
      if (badY) dropped++;
      if (badLow) dropped++;
      if (badHigh) dropped++;
      pts[i] = {
        ...p,
        ...(badY ? { y: null } : {}),
        ...(badLow ? { low: null } : {}),
        ...(badHigh ? { high: null } : {}),
      };
    }
  }
  return dropped;
}

function warnLogDrop(
  opts: ResolvedOptions,
  paletteSlots: Map<string, number>,
  dropped: number,
): void {
  if (logDropWarned.has(paletteSlots)) return;
  logDropWarned.add(paletteSlots);
  const named = opts.title ? `"${opts.title}" (${opts.type})` : `${opts.type}`;
  // eslint-disable-next-line no-console
  console.warn(
    `@chartcraft/core: ${named} has a logarithmic value axis and ${dropped} ` +
      `value${dropped === 1 ? '' : 's'} at or below zero. A log scale has no position for them ` +
      `(log10 of a non-positive number is undefined), so they are drawn as GAPS and excluded ` +
      `from the axis domain. Use a linear axis, or shift the data into positive territory, if ` +
      `those values matter.`,
  );
}

/** Kinds whose value axis is anchored at zero. */
const ZERO_ANCHORED: readonly SeriesKind[] = ['bar', 'area'];
/** Kinds eligible for LTTB downsampling. */
const DOWNSAMPLE_KINDS: readonly SeriesKind[] = ['line', 'area', 'scatter'];
/** Kinds that stack (within their own kind group only). */
const STACKING_KINDS: readonly SeriesKind[] = ['bar', 'area'];

/**
 * Build the retained data model from resolved options.
 * `paletteSlots` maps series identity -> palette slot; new identities are
 * assigned the next free slot so colors follow identity across updates.
 */
export function buildModel(
  opts: ResolvedOptions,
  paletteSlots: Map<string, number>,
  viewportIn?: Viewport | null,
): DataModel {
  const type = opts.type;
  const def = chartDef(type);
  const needs = def.needs;
  const stacked = opts.stacked && (needs.stacking ?? false);
  const horizontal = opts.horizontal && (needs.horizontal ?? false);
  const viewport = normalizeViewport(viewportIn);
  // Which axis carries VALUES is the registry's answer, never a `horizontal`
  // guess (`valueAxisOf`), so a horizontal bar chart's `xAxis: { type: 'log' }`
  // is recognized as a log VALUE axis and a vertical one's is not.
  const valueAxisLog =
    (needs.cartesianAxes ?? false) && valueAxisOf(needs, opts, horizontal).type === 'log';

  const rawCategories = opts.data.categories ?? null;

  // First pass: normalize points against provided categories. `needs.triple`
  // selects the 3-tuple reading ('size' = [x,y,r], 'range' = [x,low,high]);
  // lowKey/highKey remap custom object-data field names into low/high.
  let seriesPoints = opts.data.series.map((s) =>
    normalizeSeriesData(dataValuesOf(s.data), rawCategories, {
      triple: needs.triple ?? 'size',
      ...(s.lowKey !== undefined ? { lowKey: s.lowKey } : {}),
      ...(s.highKey !== undefined ? { highKey: s.highKey } : {}),
    }),
  );

  // Derive categories from string x values when none were provided.
  let categories: Category[] | null = rawCategories ? [...rawCategories] : null;
  if (!categories) {
    const derived = deriveCategories(seriesPoints);
    if (derived) {
      categories = derived;
      // Re-map string x values to their derived category index.
      const idx = new Map(derived.map((c, i) => [String(c), i] as const));
      seriesPoints = seriesPoints.map((pts) =>
        pts.map((p) => (typeof p.x === 'string' ? { ...p, xv: idx.get(p.x) ?? p.xv } : p)),
      );
    }
  }

  // A log value axis cannot plot a value <= 0 — those become gaps (and say so
  // once). Runs BEFORE the value extent, so a dropped value never reaches it.
  if (valueAxisLog) {
    const dropped = dropNonPositiveForLog(seriesPoints);
    if (dropped > 0) warnLogDrop(opts, paletteSlots, dropped);
  }

  const sampleXs = seriesPoints.flatMap((pts) => pts.slice(0, 10).map((p) => p.x));
  const xType = inferXType({
    explicit: needs.cartesianAxes ? opts.xAxis.type : undefined,
    chartType: type,
    hasCategories: categories !== null,
    sampleXs,
    forceCategory: needs.xScale === 'band',
    forceTime: needs.xScale === 'time',
  });

  // Category axis: ensure categories exist (index-based fallback).
  if (xType === 'category' && !categories) {
    const maxLen = seriesPoints.reduce((m, p) => Math.max(m, p.length), 0);
    categories = Array.from({ length: maxLen }, (_, i) => i);
  }

  const baseKind = needs.baseKind ?? null;
  const series: NormalizedSeries[] = opts.data.series.map((s, i) => {
    const id = s.id ?? s.name;
    let slot = paletteSlots.get(id);
    if (slot === undefined) {
      slot = paletteSlots.size;
      paletteSlots.set(id, slot);
    }
    // Combo: per-series override on cartesian roots. Horizontal charts render
    // every series as the base kind (mixed marks are vertical-only).
    let kind: SeriesKind | null =
      baseKind === null ? null : horizontal ? baseKind : ((needs.combo && s.type) || baseKind);
    // v0.3 `needs.rangeFromData`: on a range root, a series whose data carries a
    // full low/high pair IS a band. An explicit per-series `type` still wins.
    if (kind !== null && needs.rangeFromData === true && !s.type && hasRangeData(seriesPoints[i] ?? [])) {
      kind = 'rangearea';
    }
    const ns: NormalizedSeries = {
      id,
      name: s.name,
      paletteIndex: slot,
      visible: s.visible ?? true,
      curve: s.curve ?? 'linear',
      lineWidth: s.lineWidth ?? 2,
      showMarkers: s.showMarkers ?? 'auto',
      kind,
      points: seriesPoints[i] ?? [],
    };
    if (s.color !== undefined) ns.colorOverride = s.color;
    if (s.sizeRange !== undefined) ns.sizeRange = s.sizeRange;
    return ns;
  });

  // Past the validated palette the hue order REPEATS, with a dash pattern and
  // marker shape carrying the difference. Say so once — a caller who did not
  // realize they crossed the line should hear it, and a caller who did should
  // not be nagged on every frame. The highest slot in use is computed first so
  // the theme is only resolved when an overflow is even possible: `buildModel`
  // runs on every update and every zoom gesture, and it has no theme of its own.
  if (!overflowWarned.has(paletteSlots)) {
    let maxSlot = -1;
    for (const s of series) {
      if (!s.colorOverride && s.paletteIndex > maxSlot) maxSlot = s.paletteIndex;
    }
    if (maxSlot >= 1) {
      const slotCount = resolveTheme(opts.theme).series.length;
      if (slotCount > 0 && maxSlot >= slotCount) {
        warnPaletteOverflow(opts, paletteSlots, slotCount, series.length);
      }
    }
  }

  // Downsample (line/scatter kinds and unstacked areas, continuous x, above
  // threshold). v0.3: when a zoom VIEWPORT is set, downsampling runs against
  // the visible window instead of the whole series — so zooming into 1M points
  // reveals real detail. The window is only applied to series that would
  // otherwise be downsampled; below the threshold nothing is touched, which
  // keeps every v0.2 path byte-identical.
  const continuousX = xType === 'linear' || xType === 'time' || xType === 'log';
  const window = continuousX ? (viewport?.x ?? null) : null;
  if ((needs.downsample ?? false) && opts.downsample.enabled && continuousX) {
    const threshold = opts.downsample.threshold;
    for (const s of series) {
      const eligible =
        s.kind !== null &&
        DOWNSAMPLE_KINDS.includes(s.kind) &&
        !(stacked && STACKING_KINDS.includes(s.kind));
      if (!eligible || s.points.length <= threshold) continue;
      // Retain the full, un-windowed series BEFORE either lossy step, so the
      // accessible table and `exportData()` can serve every row the caller gave
      // us (see `NormalizedSeries.sourcePoints`).
      const all = s.points;
      const source = window ? windowNormalized(all, window[0], window[1]) : all;
      const drawn = source.length > threshold ? downsampleNormalized(source, threshold) : source;
      if (drawn !== all) {
        s.sourcePoints = all;
        s.points = drawn;
      }
    }
  }

  const visible = series.filter((s) => s.visible);

  // Stacking (visible series only, in array order) — same-kind groups only:
  // bar stacks with bar, area stacks with area; lines/scatter never stack.
  const stackExtents: [number, number][] = [];
  if (stacked) {
    for (const kind of STACKING_KINDS) {
      const group = visible.filter((s) => s.kind === kind);
      if (group.length === 0) continue;
      const stacks = computeStacks(group.map((s) => s.points));
      group.forEach((s, i) => {
        const st = stacks[i];
        if (st) {
          s.y0 = st.y0;
          s.y1 = st.y1;
        }
      });
      stackExtents.push(stackExtent(stacks));
    }
  }

  const yDomain = valueExtentOf(visible, stackExtents, valueAxisLog);
  const xDomain = continuousX ? continuousXExtentOf(visible, xType === 'log') : null;
  const maxLen = series.reduce((m, s) => Math.max(m, s.points.length), 0);

  const model: DataModel = {
    type,
    series,
    categories,
    xType,
    stacked,
    horizontal,
    xDomain,
    yDomain,
    valueDomainExact: false,
    valueAxisLog,
    bandByPosition: needs.bandIndex === 'position',
    maxLen,
    viewport,
  };

  applyDomainExtensions(model, opts, def);
  return model;
}

// ---------------------------------------------------------------- domain math
//
// Extracted from `buildModel` so the incremental re-window path (`rewindowModel`)
// computes the SAME domains by the same code. A zoom that widened its y-axis by
// a rounding rule the full build did not apply would be a bug nobody could see.

/**
 * The value extent over the visible series: stacked-group extents plus the raw
 * extents of every unstacked series, then the zero anchor and the degenerate
 * widening.
 *
 * `log` (v0.4.0) switches the two conventions that assume a linear axis. Both
 * of them manufacture a NON-POSITIVE floor out of positive data, and a log
 * scale can only clamp such a floor to an epsilon — twelve empty decades:
 *
 *  - the zero anchor. Bars and areas are measured from zero, which is a fact
 *    about the MARK, but a log axis has no zero to anchor to (the bottom of a
 *    log plot is not zero, it is whatever decade the domain starts at), so on
 *    one the anchor simply does not apply.
 *  - the degenerate widening, which pulls a single-value domain down to zero.
 *    On a log axis it widens by a DECADE either side instead.
 *  - a STACK's floor, which is zero by definition. A stacked series' own
 *    cumulative TOPS are read instead, so the domain covers the marks that are
 *    actually drawn rather than a baseline the axis cannot show.
 */
function valueExtentOf(
  visible: readonly NormalizedSeries[],
  stackExtents: readonly [number, number][],
  log = false,
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  /** Fold one value into the extent; on a log axis, only if it is plottable. */
  const take = (v: number): void => {
    if (log && !(v > 0)) return;
    if (v < min) min = v;
    if (v > max) max = v;
  };
  for (const s of visible) {
    if (s.y1) {
      // Normally covered by its stack extent — but that extent's floor is 0,
      // which a log axis cannot carry, so read the cumulative tops directly.
      if (log) for (const v of s.y1) if (typeof v === 'number') take(v);
      continue;
    }
    for (const p of s.points) {
      // v0.3: range bounds are values too (rangearea band, dumbbell endpoints,
      // bullet range). They are only ever set when the caller supplied them.
      if (typeof p.low === 'number') take(p.low);
      if (typeof p.high === 'number') take(p.high);
      if (p.y === null) continue;
      take(p.y);
    }
  }
  for (const [lo, hi] of stackExtents) {
    take(lo);
    take(hi);
  }
  // Non-finite extents mean "no usable values" — either nothing was visible
  // (min/max never moved off ±Infinity) or a stacking/extension stage produced
  // an infinity. `normalizeSeriesData` already folds non-finite DATA to null, so
  // this is the belt to that braces: an infinite value domain makes every scale
  // return NaN, which paints nothing and reports nothing.
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    // A log axis has no usable [0, 1]: one decade is its empty-state domain.
    min = log ? 1 : 0;
    max = log ? 10 : 1;
  }
  // Bars and areas are anchored at zero — on a LINEAR axis only (see above).
  if (!log && visible.some((s) => s.kind !== null && ZERO_ANCHORED.includes(s.kind))) {
    if (min > 0) min = 0;
    if (max < 0) max = 0;
  }
  if (min === max) {
    if (log) {
      // Degenerate on a log axis: a decade either side of the single value.
      const v = min > 0 ? min : 1;
      min = v / 10;
      max = v * 10;
    } else {
      // Degenerate: widen so scales/ticks stay sane.
      min = min > 0 ? 0 : min - 1;
      max = max <= 0 ? (max < 0 ? 0 : 1) : max + (max - min);
      if (min === max) max = min + 1;
    }
  }
  return [min, max];
}

/**
 * The continuous x extent over the visible series' DRAWN points.
 *
 * `log` (v0.4.0) excludes non-positive x POSITIONS, for the same reason the
 * value extent excludes non-positive values: a log x axis whose floor is 0 or
 * negative is clamped to an epsilon and becomes a decade ruler of empty space.
 * No extra pass — the exclusion rides the loop that was already reading `xv`.
 */
function continuousXExtentOf(visible: readonly NormalizedSeries[], log = false): [number, number] {
  let xMin = Infinity;
  let xMax = -Infinity;
  for (const s of visible) {
    for (const p of s.points) {
      if (p.xv === null) continue;
      if (log && p.xv <= 0) continue;
      if (p.xv < xMin) xMin = p.xv;
      if (p.xv > xMax) xMax = p.xv;
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = log ? 1 : 0;
    xMax = log ? 10 : 1;
  }
  if (xMin === xMax) xMax = log ? xMin * 10 : xMin + 1;
  return [xMin, xMax];
}

/**
 * The two value-domain extension stages, applied in order and in place.
 *
 * v0.3: the TYPE may widen the value domain first (`extendValueDomain` — the
 * definition-side counterpart of `Decorator.extendYDomain`): a bullet's
 * qualitative ranges/target, a boxplot's whiskers and outliers read from RAW
 * number[] samples, a waterfall's running totals. Union only, never narrows.
 * Then pipeline-level decorators may widen it further (error bars are "included
 * in the y-domain"). With no decorator registered the second stage is a no-op.
 */
function applyDomainExtensions(model: DataModel, opts: ResolvedOptions, def: ChartTypeDefinition): void {
  // v0.4.0 — on a log value axis a non-positive bound is not a wider domain, it
  // is an UNREPRESENTABLE one, so it is discarded rather than unioned in. Both
  // extension stages are guarded, because both can produce one out of positive
  // data: a type's own `nice()` rounding a floor down through zero (boxplot,
  // violin, candlestick), a waterfall's always-zero baseline, an error bar whose
  // interval reaches below zero.
  const usable = (v: number): boolean => Number.isFinite(v) && (!model.valueAxisLog || v > 0);

  const typeExt = def.extendValueDomain?.(model, opts) ?? null;
  if (typeExt) {
    const ext = Array.isArray(typeExt) ? { domain: typeExt } : typeExt;
    const [a, b] = ext.domain;
    let [lo, hi] = model.yDomain;
    if (usable(a) && a < lo) lo = a;
    if (usable(b) && b > hi) hi = b;
    model.yDomain = [lo, hi];
    if (ext.exact === true) model.valueDomainExact = true;
  }

  const before = model.yDomain;
  const extended = extendYDomainForDecorators(before, model, opts);
  const lo = usable(extended[0]) ? extended[0] : before[0];
  const hi = usable(extended[1]) ? extended[1] : before[1];
  if (lo !== before[0] || hi !== before[1]) model.yDomain = [lo, hi];
}

/**
 * Re-window an EXISTING model for a new zoom viewport, without re-ingesting the
 * caller's data (quality audit E-7).
 *
 * `zoomTo` used to re-run `buildModel` over the whole series, so every wheel
 * gesture paid for a full normalize pass: 202 ms per gesture at 1M points on the
 * audit's host, which drops frames badly on a chart whose headline number is
 * exactly that. Nothing about a viewport change invalidates NORMALIZATION — the
 * points, their identities, the palette slots, the categories and the x-type are
 * all the same objects. Only which points are DRAWN moves, and the full set is
 * already retained on `NormalizedSeries.sourcePoints` (audit fix A-1).
 *
 * So this re-slices from the retained points and recomputes the domains through
 * the same helpers `buildModel` uses. It returns `null` — "fall back to a full
 * build" — for the cases where re-windowing is not obviously equivalent:
 *
 *   * a STACKED model, whose `y0`/`y1` are index-aligned to the points a stack
 *     pass produced (windowing one member would desynchronize the stack);
 *   * a non-continuous x axis, where `Layout.viewport` is informational only
 *     (deviation 22) — nothing to re-slice.
 *
 * The caller keeps the returned model as the new base: `sourcePoints` always
 * carries the FULL series, so successive gestures never compound a narrowing.
 */
export function rewindowModel(
  base: DataModel,
  opts: ResolvedOptions,
  viewportIn: Viewport | null,
): DataModel | null {
  if (base.stacked) return null;
  const def = chartDef(base.type);
  const needs = def.needs;
  const viewport = normalizeViewport(viewportIn);
  const continuousX = base.xType === 'linear' || base.xType === 'time' || base.xType === 'log';
  if (!continuousX) return null;

  const window = viewport?.x ?? null;
  const downsampling = (needs.downsample ?? false) && opts.downsample.enabled;
  const threshold = opts.downsample.threshold;

  const series = base.series.map((s) => {
    const all = s.sourcePoints ?? s.points;
    const eligible =
      downsampling &&
      s.kind !== null &&
      DOWNSAMPLE_KINDS.includes(s.kind) &&
      all.length > threshold;
    if (!eligible) {
      if (s.points === all && s.sourcePoints === undefined) return s;
      const { sourcePoints: _drop, ...rest } = s;
      return { ...rest, points: all } as NormalizedSeries;
    }
    const source = window ? windowNormalized(all, window[0], window[1]) : all;
    const drawn = source.length > threshold ? downsampleNormalized(source, threshold) : source;
    if (drawn === all) {
      const { sourcePoints: _drop, ...rest } = s;
      return { ...rest, points: all } as NormalizedSeries;
    }
    return { ...s, points: drawn, sourcePoints: all };
  });

  const visible = series.filter((s) => s.visible);
  const model: DataModel = {
    ...base,
    series,
    yDomain: valueExtentOf(visible, [], base.valueAxisLog),
    xDomain: continuousXExtentOf(visible, base.xType === 'log'),
    valueDomainExact: false,
    maxLen: series.reduce((m, s) => Math.max(m, s.points.length), 0),
    viewport,
  };
  applyDomainExtensions(model, opts, def);
  return model;
}

/**
 * Band index for a datum: integer x values within the category range address
 * bands directly; otherwise the point index is used.
 *
 * v0.3: a type may declare `needs.bandIndex: 'position'` (violin), which makes
 * the point index authoritative — its normalized `x` is an artifact of folding
 * a raw `number[]` sample into a tuple shape and means nothing.
 */
export function bandIndexFor(model: DataModel, xv: number | null, pi: number): number {
  if (model.bandByPosition) return pi;
  const n = model.categories?.length ?? 0;
  if (xv !== null && Number.isInteger(xv) && xv >= 0 && (n === 0 || xv < n)) return xv;
  return pi;
}
