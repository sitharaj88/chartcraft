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
  // v0.3 chart types
  RangeareaChart,
  BulletChart,
  DumbbellChart,
  LollipopChart,
  SlopeChart,
  StreamgraphChart,
  MarimekkoChart,
  PyramidChart,
  CalendarChart,
  RadialbarChart,
  RoseChart,
  ViolinChart,
  ParallelChart,
  IcicleChart,
  CirclepackChart,
  WordcloudChart,
  SankeyChart,
  GanttChart,
  ChoroplethChart,
  NetworkChart,
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
