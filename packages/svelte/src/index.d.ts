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

// Re-export all public core types (core's `Chart` is available as `ChartInstance` above).
export type {
  ChartOptions,
  ChartType,
  ChartData,
  SeriesOptions,
  DataValue,
  DataPoint,
  TreeNode,
  AxisOptions,
  LegendOptions,
  TooltipOptions,
  TooltipPoint,
  AnimationOptions,
  A11yOptions,
  ChartEventMap,
  PointEvent,
  Theme,
} from '@chartcraft/core';

export interface ChartProps {
  options: ChartOptions;
  class?: string;
}

export interface TypedChartProps {
  options: Omit<ChartOptions, 'type'>;
  class?: string;
}

export interface ChartEvents {
  pointclick: CustomEvent<PointEvent>;
  pointenter: CustomEvent<PointEvent>;
  pointleave: CustomEvent<PointEvent>;
  legendtoggle: CustomEvent<ChartEventMap['legendtoggle']>;
}

/**
 * `<Chart {options} on:pointclick on:pointenter on:pointleave on:legendtoggle />`
 * Instance access: `bind:this={component}` then `component.getChart()`.
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

/** Core event names bridged by every component. */
export const EVENTS: readonly ['pointclick', 'pointenter', 'pointleave', 'legendtoggle'];

/** Merge a fixed chart type into type-less options (never mutates the input). */
export function withType(options: Omit<ChartOptions, 'type'>, type: ChartType): ChartOptions;
