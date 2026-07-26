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
export type {
  ChartInstance,
  /** Options-shaped spec type, spelled the same in all four wrappers. */
  ChartSpec,
  /** @deprecated Since 0.3.1 — use `ChartSpec`. */
  TypedChartOptions,
} from './lib/chart-base';

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

/*
 * ---------------------------------------------------------------------------
 * Core's runtime values, re-exported so `@chartcraft/angular` is the only import
 * an app needs (`@chartcraft/core` stays an implementation detail, not a second
 * direct dependency).
 *
 * These are NAMED re-exports, never `export * from '@chartcraft/core'`: named
 * re-exports let a bundler drop the ones a consumer does not mention, and core
 * declares `sideEffects: false`, so nothing here is pulled in by merely
 * importing a component. Importing `CcLineChart` does not bring in
 * `downsampleLTTB` or the scale classes; importing `lightTheme` does not bring
 * in `createChart` or the components.
 * ---------------------------------------------------------------------------
 */

/** The imperative escape hatch — create a chart without an Angular component. */
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
