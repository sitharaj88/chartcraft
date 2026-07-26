/**
 * @chartcraft/core public surface — mirrors docs/api-contract.md exactly.
 * SSR-safe: importing this module never touches window/document;
 * createChart itself requires a DOM.
 */
export { createChart, version } from './chart';

// Themes & palette
export { lightTheme, darkTheme, categoricalPalette, sequentialPalette, sequentialRampFor } from './theme';

// Utilities (exported for advanced users & wrappers)
export { LinearScale, TimeScale, BandScale, LogScale } from './scales';
export { downsampleLTTB } from './data/downsample';

// v0.3 decoration/overlay plumbing (cross-cutting features register here;
// no chart type ever knows about them). See src/charts/AUTHORING.md.
export {
  registerDecorator,
  unregisterDecorator,
  decorators,
  clearDecorators,
} from './decorate';
export type {
  Decorator,
  DecoratorContext,
  DecoratorHost,
  DecorationLayer,
  Viewport,
} from './decorate';

// Every public type is exported.
export type {
  Chart,
  ChartOptions,
  ChartType,
  ChartData,
  SeriesOptions,
  /** The union behind `SeriesOptions.type` (the combo mark override). */
  SeriesKind,
  SeriesData,
  DataValue,
  DataPoint,
  TreeNode,
  /**
   * The raw per-category sample list behind `boxplot`/`violin` data. A named
   * member of the `DataValue` union, exported for the same reason the graph
   * payload types are: a consumer writing `const acv: SampleList[] = …` should
   * not have to spell out `number[]` and hope it still matches ours.
   */
  SampleList,
  // Graph payload for `sankey` / `network` (the contract's `{ nodes, links }`).
  GraphData,
  GraphNodeInput,
  GraphLinkInput,
  AxisOptions,
  LegendOptions,
  TooltipOptions,
  TooltipPoint,
  AnimationOptions,
  A11yOptions,
  ChartEventMap,
  PointEvent,
  Theme,
  // v0.3
  ErrorBarOptions,
  TrendlineOptions,
  DataLabelOptions,
  Annotation,
  ZoomOptions,
  ZoomRange,
  GeoFeatureCollection,
} from './types';
