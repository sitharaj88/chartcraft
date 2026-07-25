/**
 * Internal model types + option resolution + model building.
 * Pure (no DOM) so every stage is unit-testable.
 */
import type {
  A11yOptions,
  AxisOptions,
  ChartData,
  ChartOptions,
  ChartType,
  LegendOptions,
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
}

const DEFAULT_PADDING = 12;

export function resolveOptions(raw: ChartOptions): ResolvedOptions {
  const type = raw.type;
  const isLineArea = type === 'line' || type === 'area';

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
    show: legendRaw.show ?? seriesCount >= 2, // auto: shown when series >= 2
    position: legendRaw.position ?? 'top',
    interactive: legendRaw.interactive ?? true,
  };

  const tooltipRaw = typeof raw.tooltip === 'boolean' ? { show: raw.tooltip } : (raw.tooltip ?? {});
  const tooltip: ResolvedTooltip = {
    show: tooltipRaw.show ?? true,
    shared: tooltipRaw.shared ?? isLineArea,
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
  points: NormalizedPoint[];
  /** Stack bounds (stacked charts only), aligned with points. */
  y0?: (number | null)[];
  y1?: (number | null)[];
}

export interface DataModel {
  type: ChartType;
  series: NormalizedSeries[];
  categories: Category[] | null;
  xType: XType;
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

/**
 * Build the retained data model from resolved options.
 * `paletteSlots` maps series identity -> palette slot; new identities are
 * assigned the next free slot so colors follow identity across updates.
 */
export function buildModel(opts: ResolvedOptions, paletteSlots: Map<string, number>): DataModel {
  const type = opts.type;
  const isCartesian = type !== 'pie' && type !== 'donut';
  const stacked = opts.stacked && (type === 'bar' || type === 'area');

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
    explicit: isCartesian ? opts.xAxis.type : undefined,
    chartType: type,
    hasCategories: categories !== null,
    sampleXs,
  });

  // Category axis: ensure categories exist (index-based fallback).
  if (xType === 'category' && !categories) {
    const maxLen = seriesPoints.reduce((m, p) => Math.max(m, p.length), 0);
    categories = Array.from({ length: maxLen }, (_, i) => i);
  }

  const series: NormalizedSeries[] = opts.data.series.map((s, i) => {
    const id = s.id ?? s.name;
    let slot = paletteSlots.get(id);
    if (slot === undefined) {
      slot = paletteSlots.size;
      paletteSlots.set(id, slot);
    }
    const ns: NormalizedSeries = {
      id,
      name: s.name,
      paletteIndex: slot,
      visible: s.visible ?? true,
      curve: s.curve ?? 'linear',
      lineWidth: s.lineWidth ?? 2,
      showMarkers: s.showMarkers ?? 'auto',
      points: seriesPoints[i] ?? [],
    };
    if (s.color !== undefined) ns.colorOverride = s.color;
    return ns;
  });

  // Downsample (line/area/scatter, continuous x, above threshold).
  const canDownsample =
    opts.downsample.enabled &&
    (type === 'line' || type === 'area' || type === 'scatter') &&
    (xType === 'linear' || xType === 'time' || xType === 'log') &&
    !stacked;
  if (canDownsample) {
    for (const s of series) {
      if (s.points.length > opts.downsample.threshold) {
        s.points = downsampleNormalized(s.points, opts.downsample.threshold);
      }
    }
  }

  const visible = series.filter((s) => s.visible);

  // Stacking (visible series only, in array order).
  let yDomain: [number, number];
  if (stacked) {
    const stacks = computeStacks(visible.map((s) => s.points));
    visible.forEach((s, i) => {
      const st = stacks[i];
      if (st) {
        s.y0 = st.y0;
        s.y1 = st.y1;
      }
    });
    yDomain = stackExtent(stacks);
  } else {
    let min = Infinity;
    let max = -Infinity;
    for (const s of visible) {
      for (const p of s.points) {
        if (p.y === null) continue;
        if (p.y < min) min = p.y;
        if (p.y > max) max = p.y;
      }
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }
    // Bars and areas are anchored at zero.
    if (type === 'bar' || type === 'area') {
      if (min > 0) min = 0;
      if (max < 0) max = 0;
    }
    if (min === max) {
      // Degenerate: widen so scales/ticks stay sane.
      min = min > 0 ? 0 : min - 1;
      max = max <= 0 ? (max < 0 ? 0 : 1) : max + (max - min);
      if (min === max) max = min + 1;
    }
    yDomain = [min, max];
  }

  // Continuous x extent.
  let xDomain: [number, number] | null = null;
  if (xType === 'linear' || xType === 'time' || xType === 'log') {
    let min = Infinity;
    let max = -Infinity;
    for (const s of visible) {
      for (const p of s.points) {
        if (p.xv === null) continue;
        if (p.xv < min) min = p.xv;
        if (p.xv > max) max = p.xv;
      }
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }
    if (min === max) max = min + 1;
    xDomain = [min, max];
  }

  const maxLen = series.reduce((m, s) => Math.max(m, s.points.length), 0);

  return {
    type,
    series,
    categories,
    xType,
    stacked,
    horizontal: opts.horizontal && type === 'bar',
    xDomain,
    yDomain,
    maxLen,
  };
}
