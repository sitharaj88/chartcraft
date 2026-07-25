/**
 * @chartcraft/core public surface — mirrors docs/api-contract.md exactly.
 * SSR-safe: importing this module never touches window/document;
 * createChart itself requires a DOM.
 */
export { createChart, version } from './chart';

// Themes & palette
export { lightTheme, darkTheme, categoricalPalette, sequentialPalette } from './theme';

// Utilities (exported for advanced users & wrappers)
export { LinearScale, TimeScale, BandScale, LogScale } from './scales';
export { downsampleLTTB } from './data/downsample';

// Every public type is exported.
export type {
  Chart,
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
} from './types';
