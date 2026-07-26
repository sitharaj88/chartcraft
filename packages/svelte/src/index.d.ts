/**
 * Hand-written types for @chartcraft/svelte (the components ship as source
 * .svelte files, so there is no generated dts).
 *
 * Naming note (recorded in /DEVIATIONS.md): core's `Chart` *instance interface*
 * collides with the `Chart` *component* exported here. The component wins the
 * `Chart` name; the core instance interface is re-exported as `ChartInstance`.
 * Every other core type is re-exported under its original name.
 */
import { SvelteComponent } from 'svelte';
import type { Chart as CoreChart, ChartEventMap, ChartOptions, ChartType, PointEvent } from '@chartcraft/core';

/** The live chart instance type (core's `Chart` interface, renamed to avoid colliding with the `Chart` component). */
export type ChartInstance = CoreChart;

/**
 * A chart's options with no `type` — the shape for holding chart configuration
 * in its own module (`specs.ts`) and passing it to the matching per-type
 * component. Identical in every ChartCraft wrapper (`@chartcraft/react`,
 * `@chartcraft/vue`, `@chartcraft/svelte`, `@chartcraft/angular`).
 *
 * ```ts
 * // specs.ts
 * import type { ChartSpec } from '@chartcraft/svelte';
 * export const revenue: ChartSpec = { title: 'Revenue', data: { ... } };
 * ```
 * ```svelte
 * <BarChart options={revenue} />
 * ```
 */
export type ChartSpec = Omit<ChartOptions, 'type'>;

/*
 * ---------------------------------------------------------------------------
 * Core's runtime values, re-exported so `@chartcraft/svelte` is the only import
 * an app needs. Named re-exports only (never `export *`), so a bundler can drop
 * the ones a consumer does not mention. See src/index.js.
 * ---------------------------------------------------------------------------
 */
export {
  createChart,
  version,
  lightTheme,
  darkTheme,
  categoricalPalette,
  sequentialPalette,
  sequentialRampFor,
  LinearScale,
  TimeScale,
  BandScale,
  LogScale,
  downsampleLTTB,
  registerDecorator,
  unregisterDecorator,
  decorators,
  clearDecorators,
} from '@chartcraft/core';

// Re-export all public core types (core's `Chart` is available as `ChartInstance` above).
export type {
  ChartOptions,
  ChartType,
  ChartData,
  SeriesOptions,
  SeriesKind,
  SeriesData,
  DataValue,
  DataPoint,
  TreeNode,
  GraphData,
  GraphNodeInput,
  GraphLinkInput,
  SampleList,
  AxisOptions,
  LegendOptions,
  TooltipOptions,
  TooltipPoint,
  AnimationOptions,
  A11yOptions,
  ChartEventMap,
  PointEvent,
  Theme,
  // v0.3 feature options & payloads
  DataLabelOptions,
  Annotation,
  ZoomOptions,
  ZoomRange,
  ErrorBarOptions,
  TrendlineOptions,
  GeoFeatureCollection,
  // v0.3 decoration/overlay plumbing (advanced: custom decorators)
  Decorator,
  DecoratorContext,
  DecoratorHost,
  DecorationLayer,
  Viewport,
} from '@chartcraft/core';

/**
 * Svelte-5-style callback props. Every bridged event is available as a plain
 * prop as well as an `on:` directive, so a Svelte 5 (and, later, Svelte 6) app
 * never needs the deprecated directive. Callback props receive the payload
 * directly; `on:` handlers receive a `CustomEvent` whose `detail` is the payload.
 */
export interface ChartCallbackProps {
  onpointclick?: (ev: PointEvent) => void;
  onpointenter?: (ev: PointEvent) => void;
  onpointleave?: (ev: PointEvent) => void;
  onlegendtoggle?: (ev: ChartEventMap['legendtoggle']) => void;
  onzoom?: (ev: ChartEventMap['zoom']) => void;
  onannotationclick?: (ev: ChartEventMap['annotationclick']) => void;
  /**
   * Called once with the live instance, as soon as it exists. Prefer this (or
   * `on:ready`) over `bind:this` + `getChart()` for setup code: `bind:this`
   * lands before the child's `onMount`, so `getChart()` can still return `null`
   * when called from a parent's own `onMount`.
   */
  onready?: (chart: ChartInstance) => void;
}

export interface ChartProps extends ChartCallbackProps {
  options: ChartOptions;
  class?: string;
}

export interface TypedChartProps extends ChartCallbackProps {
  options: ChartSpec;
  class?: string;
}

export interface ChartEvents {
  pointclick: CustomEvent<PointEvent>;
  pointenter: CustomEvent<PointEvent>;
  pointleave: CustomEvent<PointEvent>;
  legendtoggle: CustomEvent<ChartEventMap['legendtoggle']>;
  // v0.3
  zoom: CustomEvent<ChartEventMap['zoom']>;
  annotationclick: CustomEvent<ChartEventMap['annotationclick']>;
  // v0.3.1 — lifecycle, not a core event
  ready: CustomEvent<ChartInstance>;
}

/**
 * `<Chart {options} on:pointclick on:pointenter on:pointleave on:legendtoggle
 *   on:zoom on:annotationclick on:ready />`
 *
 * or, without any deprecated directive:
 * `<Chart {options} onpointclick={handle} onready={setup} />`
 *
 * Instance access: `on:ready` / `onready` (reliable from setup code), or
 * `bind:this={component}` then `component.getChart()`.
 */
export class Chart extends SvelteComponent<ChartProps, ChartEvents, Record<string, never>> {
  getChart(): ChartInstance | null;
}

declare class TypedChart extends SvelteComponent<TypedChartProps, ChartEvents, Record<string, never>> {
  getChart(): ChartInstance | null;
}

export class LineChart extends TypedChart {}
export class AreaChart extends TypedChart {}
export class BarChart extends TypedChart {}
export class ScatterChart extends TypedChart {}
export class PieChart extends TypedChart {}
export class DonutChart extends TypedChart {}
// v0.2 chart types
export class BubbleChart extends TypedChart {}
export class SparklineChart extends TypedChart {}
export class HistogramChart extends TypedChart {}
export class BoxplotChart extends TypedChart {}
export class CandlestickChart extends TypedChart {}
export class OhlcChart extends TypedChart {}
export class WaterfallChart extends TypedChart {}
export class HeatmapChart extends TypedChart {}
export class TreemapChart extends TypedChart {}
export class SunburstChart extends TypedChart {}
export class FunnelChart extends TypedChart {}
export class RadarChart extends TypedChart {}
export class GaugeChart extends TypedChart {}
// v0.3 chart types
export class RangeareaChart extends TypedChart {}
export class BulletChart extends TypedChart {}
export class DumbbellChart extends TypedChart {}
export class LollipopChart extends TypedChart {}
export class SlopeChart extends TypedChart {}
export class StreamgraphChart extends TypedChart {}
export class MarimekkoChart extends TypedChart {}
export class PyramidChart extends TypedChart {}
export class CalendarChart extends TypedChart {}
export class RadialbarChart extends TypedChart {}
export class RoseChart extends TypedChart {}
export class ViolinChart extends TypedChart {}
export class ParallelChart extends TypedChart {}
export class IcicleChart extends TypedChart {}
export class CirclepackChart extends TypedChart {}
export class WordcloudChart extends TypedChart {}
export class SankeyChart extends TypedChart {}
export class GanttChart extends TypedChart {}
export class ChoroplethChart extends TypedChart {}
export class NetworkChart extends TypedChart {}

/** Core event names bridged by every component. */
export const EVENTS: readonly [
  'pointclick',
  'pointenter',
  'pointleave',
  'legendtoggle',
  'zoom',
  'annotationclick',
];

/** Merge a fixed chart type into type-less options (never mutates the input). */
export function withType(options: Omit<ChartOptions, 'type'>, type: ChartType): ChartOptions;
