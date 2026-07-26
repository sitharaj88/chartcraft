/**
 * @chartcraft/angular public surface.
 *
 * Naming note (recorded in /DEVIATIONS.md): core's `Chart` *instance interface*
 * collides with the component names exported here. Components take the `Cc`
 * prefix (`CcChart`, `CcLineChart`, …) matching the `cc-` selector prefix, and
 * the core instance interface is re-exported as `ChartInstance`. Every other
 * core type is re-exported under its original name.
 */
export { ChartBase } from './lib/chart-base';
export type { ChartInstance, TypedChartOptions } from './lib/chart-base';

export { CcChart } from './lib/chart';

export {
  CcLineChart,
  CcAreaChart,
  CcBarChart,
  CcScatterChart,
  CcPieChart,
  CcDonutChart,
  // v0.2 chart types
  CcBubbleChart,
  CcSparklineChart,
  CcHistogramChart,
  CcBoxplotChart,
  CcCandlestickChart,
  CcOhlcChart,
  CcWaterfallChart,
  CcHeatmapChart,
  CcTreemapChart,
  CcSunburstChart,
  CcFunnelChart,
  CcRadarChart,
  CcGaugeChart,
  // v0.3 chart types
  CcRangeareaChart,
  CcBulletChart,
  CcDumbbellChart,
  CcLollipopChart,
  CcSlopeChart,
  CcStreamgraphChart,
  CcMarimekkoChart,
  CcPyramidChart,
  CcCalendarChart,
  CcRadialbarChart,
  CcRoseChart,
  CcViolinChart,
  CcParallelChart,
  CcIcicleChart,
  CcCirclepackChart,
  CcWordcloudChart,
  CcSankeyChart,
  CcGanttChart,
  CcChoroplethChart,
  CcNetworkChart,
} from './lib/typed-charts';

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
