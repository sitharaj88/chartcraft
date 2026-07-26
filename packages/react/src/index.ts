/**
 * @chartcraft/react public surface.
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

export type {
  ChartInstance,
  ChartProps,
  TypedChartProps,
  ChartEventProps,
  /** Options-shaped spec type, spelled the same in all four wrappers. */
  ChartSpec,
} from './Chart';

/*
 * ---------------------------------------------------------------------------
 * Core's runtime values, re-exported so `@chartcraft/react` is the only import
 * an app needs (`@chartcraft/core` stays an implementation detail, not a second
 * direct dependency).
 *
 * These are NAMED re-exports, never `export * from '@chartcraft/core'`: named
 * re-exports let a bundler drop the ones a consumer does not mention, and core
 * declares `sideEffects: false`, so nothing here is pulled in by merely
 * importing a component. Importing `<LineChart>` does not bring in
 * `downsampleLTTB` or the scale classes; importing `lightTheme` does not bring
 * in `createChart` or React.
 * ---------------------------------------------------------------------------
 */

/** The imperative escape hatch — create a chart without a React component. */
export { createChart, version } from '@chartcraft/core';

// Themes & palette.
export {
  lightTheme,
  darkTheme,
  categoricalPalette,
  sequentialPalette,
  sequentialRampFor,
} from '@chartcraft/core';

// Scale + data utilities (advanced: custom axes, pre-downsampling).
export { LinearScale, TimeScale, BandScale, LogScale, downsampleLTTB } from '@chartcraft/core';

// Decoration/overlay plumbing (advanced: custom decorators).
export {
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
