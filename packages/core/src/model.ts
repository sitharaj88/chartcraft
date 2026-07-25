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
import { getChartType, type ChartTypeDefinition } from './charts/registry';
import { registerBuiltinChartTypes } from './charts';

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
  a11y: Required<Pick<A11yOptions, 'table' | 'keyboard'>> & Pick<A11yOptions, 'title' | 'description'>;
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
  points: NormalizedPoint[];
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

  const sampleXs = seriesPoints.flatMap((pts) => pts.slice(0, 10).map((p) => p.x));
  const xType = inferXType({
    explicit: needs.cartesianAxes ? opts.xAxis.type : undefined,
    chartType: type,
    hasCategories: categories !== null,
    sampleXs,
    forceCategory: needs.xScale === 'band',
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
      const source = window ? windowNormalized(s.points, window[0], window[1]) : s.points;
      s.points = source.length > threshold ? downsampleNormalized(source, threshold) : source;
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

  // Value domain: stacked group extents + raw extents of unstacked series.
  let min = Infinity;
  let max = -Infinity;
  for (const s of visible) {
    if (s.y1) continue; // covered by its stack extent
    for (const p of s.points) {
      // v0.3: range bounds are values too (rangearea band, dumbbell endpoints,
      // bullet range). They are only ever set when the caller supplied them.
      if (typeof p.low === 'number') {
        if (p.low < min) min = p.low;
        if (p.low > max) max = p.low;
      }
      if (typeof p.high === 'number') {
        if (p.high < min) min = p.high;
        if (p.high > max) max = p.high;
      }
      if (p.y === null) continue;
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
  }
  for (const [lo, hi] of stackExtents) {
    if (lo < min) min = lo;
    if (hi > max) max = hi;
  }
  // Non-finite extents mean "no usable values" — either nothing was visible
  // (min/max never moved off ±Infinity) or a stacking/extension stage produced
  // an infinity. `normalizeSeriesData` already folds non-finite DATA to null, so
  // this is the belt to that braces: an infinite value domain makes every scale
  // return NaN, which paints nothing and reports nothing.
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  // Bars and areas are anchored at zero.
  if (visible.some((s) => s.kind !== null && ZERO_ANCHORED.includes(s.kind))) {
    if (min > 0) min = 0;
    if (max < 0) max = 0;
  }
  if (min === max) {
    // Degenerate: widen so scales/ticks stay sane.
    min = min > 0 ? 0 : min - 1;
    max = max <= 0 ? (max < 0 ? 0 : 1) : max + (max - min);
    if (min === max) max = min + 1;
  }
  const yDomain: [number, number] = [min, max];

  // Continuous x extent.
  let xDomain: [number, number] | null = null;
  if (continuousX) {
    let xMin = Infinity;
    let xMax = -Infinity;
    for (const s of visible) {
      for (const p of s.points) {
        if (p.xv === null) continue;
        if (p.xv < xMin) xMin = p.xv;
        if (p.xv > xMax) xMax = p.xv;
      }
    }
    if (!Number.isFinite(xMin)) {
      xMin = 0;
      xMax = 1;
    }
    if (xMin === xMax) xMax = xMin + 1;
    xDomain = [xMin, xMax];
  }

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
    bandByPosition: needs.bandIndex === 'position',
    maxLen,
    viewport,
  };

  // v0.3: the TYPE may widen the value domain first (`extendValueDomain` — the
  // definition-side counterpart of `Decorator.extendYDomain`): a bullet's
  // qualitative ranges/target, a boxplot's whiskers and outliers read from RAW
  // number[] samples, a waterfall's running totals. Union only, never narrows.
  const typeExt = def.extendValueDomain?.(model, opts) ?? null;
  if (typeExt) {
    const ext = Array.isArray(typeExt) ? { domain: typeExt } : typeExt;
    const [a, b] = ext.domain;
    let [lo, hi] = model.yDomain;
    if (Number.isFinite(a) && a < lo) lo = a;
    if (Number.isFinite(b) && b > hi) hi = b;
    model.yDomain = [lo, hi];
    if (ext.exact === true) model.valueDomainExact = true;
  }

  // Then pipeline-level decorators may widen it further (error bars are
  // "included in the y-domain"). With no decorator registered this is a no-op.
  const before = model.yDomain;
  const extended = extendYDomainForDecorators(before, model, opts);
  if (extended[0] !== before[0] || extended[1] !== before[1]) model.yDomain = extended;

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
