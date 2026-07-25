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
  AxisOptions,
  ChartData,
  ChartOptions,
  ChartType,
  LegendOptions,
  SeriesKind,
  Theme,
  TooltipPoint,
} from './types';
import {
  deriveCategories,
  downsampleNormalized,
  inferXType,
  normalizeSeriesData,
  type Category,
  type NormalizedPoint,
  type XType,
} from './data/normalize';
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
  };
  if (raw.title !== undefined) resolved.title = raw.title;
  if (raw.subtitle !== undefined) resolved.subtitle = raw.subtitle;
  if (raw.width !== undefined) resolved.width = raw.width;
  if (raw.height !== undefined) resolved.height = raw.height;
  if (raw.histogram !== undefined) resolved.histogram = raw.histogram;
  if (raw.heatmap !== undefined) resolved.heatmap = raw.heatmap;
  if (raw.gauge !== undefined) resolved.gauge = raw.gauge;
  if (raw.waterfall !== undefined) resolved.waterfall = raw.waterfall;

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
  /** Longest series length. */
  maxLen: number;
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
export function buildModel(opts: ResolvedOptions, paletteSlots: Map<string, number>): DataModel {
  const type = opts.type;
  const needs = chartDef(type).needs;
  const stacked = opts.stacked && (needs.stacking ?? false);
  const horizontal = opts.horizontal && (needs.horizontal ?? false);

  const rawCategories = opts.data.categories ?? null;

  // First pass: normalize points against provided categories.
  let seriesPoints = opts.data.series.map((s) => normalizeSeriesData(s.data, rawCategories));

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
    const kind: SeriesKind | null =
      baseKind === null ? null : horizontal ? baseKind : ((needs.combo && s.type) || baseKind);
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

  // Downsample (line/scatter kinds and unstacked areas, continuous x, above threshold).
  const continuousX = xType === 'linear' || xType === 'time' || xType === 'log';
  if ((needs.downsample ?? false) && opts.downsample.enabled && continuousX) {
    for (const s of series) {
      const eligible =
        s.kind !== null &&
        DOWNSAMPLE_KINDS.includes(s.kind) &&
        !(stacked && STACKING_KINDS.includes(s.kind));
      if (eligible && s.points.length > opts.downsample.threshold) {
        s.points = downsampleNormalized(s.points, opts.downsample.threshold);
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

  // Value domain: stacked group extents + raw extents of unstacked series.
  let min = Infinity;
  let max = -Infinity;
  for (const s of visible) {
    if (s.y1) continue; // covered by its stack extent
    for (const p of s.points) {
      if (p.y === null) continue;
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
  }
  for (const [lo, hi] of stackExtents) {
    if (lo < min) min = lo;
    if (hi > max) max = hi;
  }
  if (!Number.isFinite(min)) {
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

  return {
    type,
    series,
    categories,
    xType,
    stacked,
    horizontal,
    xDomain,
    yDomain,
    maxLen,
  };
}

/**
 * Band index for a datum: integer x values within the category range address
 * bands directly; otherwise the point index is used.
 */
export function bandIndexFor(model: DataModel, xv: number | null, pi: number): number {
  const n = model.categories?.length ?? 0;
  if (xv !== null && Number.isInteger(xv) && xv >= 0 && (n === 0 || xv < n)) return xv;
  return pi;
}
