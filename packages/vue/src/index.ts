/**
 * @chartcraft/vue public surface.
 *
 * Naming note (recorded in /DEVIATIONS.md): core's `Chart` *instance interface*
 * collides with the `Chart` *component* exported here. The component wins the
 * `Chart` name; the core instance interface is re-exported as `ChartInstance`.
 * Every other core type is re-exported under its original name.
 */
export {
  Chart,
  LineChart,
  AreaChart,
  BarChart,
  ScatterChart,
  PieChart,
  DonutChart,
  // v0.2 chart types
  BubbleChart,
  SparklineChart,
  HistogramChart,
  BoxplotChart,
  CandlestickChart,
  OhlcChart,
  WaterfallChart,
  HeatmapChart,
  TreemapChart,
  SunburstChart,
  FunnelChart,
  RadarChart,
  GaugeChart,
} from './Chart';

export type { ChartInstance, ChartExposed, TypedChartOptions } from './Chart';

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
