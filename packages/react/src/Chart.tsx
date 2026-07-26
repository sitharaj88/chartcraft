/**
 * @chartcraft/react — thin React wrapper around @chartcraft/core.
 *
 * Responsibilities (and nothing more): lifecycle (create on mount, destroy on
 * unmount), option updates via chart.update() (core diffs), event bridging,
 * and instance exposure via ref. SSR-safe: the chart is only created inside
 * useEffect, never at module scope or during render.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
} from 'react';
import { createChart } from '@chartcraft/core';
import type {
  Chart as CoreChart,
  ChartEventMap,
  ChartOptions,
  ChartType,
  PointEvent,
} from '@chartcraft/core';
import { trackOptionStability, type OptionStabilityProbe } from './dev';

/** The live chart instance type (core's `Chart` interface, renamed to avoid colliding with the `Chart` component). */
export type ChartInstance = CoreChart;

export interface ChartEventProps {
  onPointClick?: (ev: PointEvent) => void;
  onPointEnter?: (ev: PointEvent) => void;
  onPointLeave?: (ev: PointEvent) => void;
  onLegendToggle?: (ev: ChartEventMap['legendtoggle']) => void;
  // v0.3
  /** zoom/pan/brush committed (or reset — the payload is `null`). */
  onZoom?: (ev: ChartEventMap['zoom']) => void;
  onAnnotationClick?: (ev: ChartEventMap['annotationclick']) => void;
}

/**
 * Every `ChartOptions` key, in contract order.
 *
 * The update effect below depends on these keys one by one (a stable-length
 * dependency list, so React is happy) instead of on the options object, which
 * is a fresh object on every render. The `_optionKeysAreExhaustive` assertion
 * makes a forgotten key a COMPILE error rather than the silent
 * "changing this prop never re-renders" bug: adding a field to core's
 * `ChartOptions` without listing it here fails `tsc`.
 */
const OPTION_KEYS = [
  'type',
  'data',
  'theme',
  'title',
  'subtitle',
  'width',
  'height',
  'padding',
  'xAxis',
  'yAxis',
  'stacked',
  'horizontal',
  'legend',
  'tooltip',
  'animation',
  'downsample',
  'a11y',
  // v0.2 per-type blocks
  'histogram',
  'heatmap',
  'gauge',
  'waterfall',
  // v0.3 cross-cutting features
  'dataLabels',
  'annotations',
  'zoom',
  // v0.3 per-type blocks
  'rangearea',
  'bullet',
  'calendar',
  'violin',
  'radialbar',
  'rose',
  'sankey',
  'gantt',
  'wordcloud',
  'network',
  'choropleth',
  'parallel',
] as const satisfies readonly (keyof ChartOptions)[];

/** Any `ChartOptions` key missing from `OPTION_KEYS` (must be `never`). */
type UnlistedOptionKey = Exclude<keyof ChartOptions, (typeof OPTION_KEYS)[number]>;
const _optionKeysAreExhaustive: UnlistedOptionKey extends never ? true : UnlistedOptionKey = true;
void _optionKeysAreExhaustive;

/** All ChartOptions as flat props, plus className/style and event handlers. */
export interface ChartProps extends ChartOptions, ChartEventProps {
  className?: string;
  style?: CSSProperties;
}

/** Convenience-component props: same as ChartProps minus `type`. */
export type TypedChartProps = Omit<ChartProps, 'type'>;

/**
 * A chart's options with no `type` — the shape for holding chart configuration
 * in its own module (`specs.ts`) and spreading it into the matching per-type
 * component. Identical in every ChartCraft wrapper (`@chartcraft/react`,
 * `@chartcraft/vue`, `@chartcraft/svelte`, `@chartcraft/angular`).
 *
 * ```ts
 * // specs.ts
 * import type { ChartSpec } from '@chartcraft/react';
 * export const revenue: ChartSpec = { title: 'Revenue', data: { ... } };
 * // App.tsx
 * <BarChart {...revenue} />
 * ```
 *
 * Note this is options-shaped, not props-shaped: it carries no `className`,
 * `style` or event handlers. Use {@link TypedChartProps} for the full prop set
 * of a per-type component.
 */
export type ChartSpec = Omit<ChartOptions, 'type'>;

/** Assign a forwarded ref (object or callback form). */
function setRef(ref: ForwardedRef<ChartInstance>, value: ChartInstance | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function ChartImpl(props: ChartProps, ref: ForwardedRef<ChartInstance>): ReactElement {
  const {
    className,
    style,
    onPointClick,
    onPointEnter,
    onPointLeave,
    onLegendToggle,
    onZoom,
    onAnnotationClick,
    ...options
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  // Latest-value refs so the mount effect can subscribe once while handlers
  // and options stay swappable without re-subscribing or re-creating.
  const handlersRef = useRef<ChartEventProps>({});
  handlersRef.current = {
    onPointClick,
    onPointEnter,
    onPointLeave,
    onLegendToggle,
    onZoom,
    onAnnotationClick,
  };
  const optionsRef = useRef<ChartOptions>(options);
  optionsRef.current = options;

  // Mount / unmount — runs only in the browser (SSR-safe).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const chart = createChart(container, optionsRef.current);
    chart.on('pointclick', (ev) => handlersRef.current.onPointClick?.(ev));
    chart.on('pointenter', (ev) => handlersRef.current.onPointEnter?.(ev));
    chart.on('pointleave', (ev) => handlersRef.current.onPointLeave?.(ev));
    chart.on('legendtoggle', (ev) => handlersRef.current.onLegendToggle?.(ev));
    chart.on('zoom', (ev) => handlersRef.current.onZoom?.(ev));
    chart.on('annotationclick', (ev) => handlersRef.current.onAnnotationClick?.(ev));
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      chart.destroy(); // removes DOM, observers, listeners
    };
  }, []);

  /*
   * Expose the core Chart instance through the forwarded ref.
   *
   * Declared AFTER the mount effect on purpose: effects within a component run
   * in declaration order, and React flushes ALL child effects before a parent's,
   * so by the time a parent's own mount `useEffect` runs, `ref.current` is
   * already the instance. The previous `useImperativeHandle(ref, …, [instance])`
   * could not manage that — it is a layout effect keyed on component *state*, so
   * the ref stayed `null` until the extra render caused by `setInstance` had
   * committed, i.e. one render too late for a parent's setup code.
   */
  useEffect(() => {
    setRef(ref, chartRef.current);
    return () => setRef(ref, null);
  }, [ref]);

  // Option updates → chart.update() (core deep-merges and diffs). The
  // dependency list is one entry per ChartOptions key (see OPTION_KEYS): a
  // fixed-length array, exhaustive by construction.
  const firstUpdate = useRef(true);
  const stabilityProbe = useRef<OptionStabilityProbe | null>(null);
  useEffect(() => {
    // Development-only: catch the "fresh object literal on every render" trap
    // that this identity-based diff makes so easy to fall into. The guard is a
    // literal NODE_ENV check, so a production bundle folds it away and drops
    // ./dev entirely — see src/dev.ts.
    if (process.env.NODE_ENV !== 'production') {
      stabilityProbe.current = trackOptionStability(stabilityProbe.current, optionsRef.current);
    }
    if (firstUpdate.current) {
      firstUpdate.current = false;
      return;
    }
    chartRef.current?.update(optionsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, OPTION_KEYS.map((key) => options[key]));

  return <div ref={containerRef} className={className} style={style} />;
}

/**
 * `<Chart>` — the ChartCraft React component. Accepts all ChartOptions as flat
 * props plus className/style/event handlers; `ref` exposes the ChartInstance.
 */
export const Chart = forwardRef<ChartInstance, ChartProps>(ChartImpl);
Chart.displayName = 'Chart';

function typedChart(type: ChartType, displayName: string) {
  const Typed = forwardRef<ChartInstance, TypedChartProps>((props, ref) => (
    <Chart ref={ref} {...props} type={type} />
  ));
  Typed.displayName = displayName;
  return Typed;
}

export const LineChart = typedChart('line', 'LineChart');
export const AreaChart = typedChart('area', 'AreaChart');
export const BarChart = typedChart('bar', 'BarChart');
export const ScatterChart = typedChart('scatter', 'ScatterChart');
export const PieChart = typedChart('pie', 'PieChart');
export const DonutChart = typedChart('donut', 'DonutChart');
// v0.2 chart types
export const BubbleChart = typedChart('bubble', 'BubbleChart');
export const SparklineChart = typedChart('sparkline', 'SparklineChart');
export const HistogramChart = typedChart('histogram', 'HistogramChart');
export const BoxplotChart = typedChart('boxplot', 'BoxplotChart');
export const CandlestickChart = typedChart('candlestick', 'CandlestickChart');
export const OhlcChart = typedChart('ohlc', 'OhlcChart');
export const WaterfallChart = typedChart('waterfall', 'WaterfallChart');
export const HeatmapChart = typedChart('heatmap', 'HeatmapChart');
export const TreemapChart = typedChart('treemap', 'TreemapChart');
export const SunburstChart = typedChart('sunburst', 'SunburstChart');
export const FunnelChart = typedChart('funnel', 'FunnelChart');
export const RadarChart = typedChart('radar', 'RadarChart');
export const GaugeChart = typedChart('gauge', 'GaugeChart');
// v0.3 chart types
export const RangeareaChart = typedChart('rangearea', 'RangeareaChart');
export const BulletChart = typedChart('bullet', 'BulletChart');
export const DumbbellChart = typedChart('dumbbell', 'DumbbellChart');
export const LollipopChart = typedChart('lollipop', 'LollipopChart');
export const SlopeChart = typedChart('slope', 'SlopeChart');
export const StreamgraphChart = typedChart('streamgraph', 'StreamgraphChart');
export const MarimekkoChart = typedChart('marimekko', 'MarimekkoChart');
export const PyramidChart = typedChart('pyramid', 'PyramidChart');
export const CalendarChart = typedChart('calendar', 'CalendarChart');
export const RadialbarChart = typedChart('radialbar', 'RadialbarChart');
export const RoseChart = typedChart('rose', 'RoseChart');
export const ViolinChart = typedChart('violin', 'ViolinChart');
export const ParallelChart = typedChart('parallel', 'ParallelChart');
export const IcicleChart = typedChart('icicle', 'IcicleChart');
export const CirclepackChart = typedChart('circlepack', 'CirclepackChart');
export const WordcloudChart = typedChart('wordcloud', 'WordcloudChart');
export const SankeyChart = typedChart('sankey', 'SankeyChart');
export const GanttChart = typedChart('gantt', 'GanttChart');
export const ChoroplethChart = typedChart('choropleth', 'ChoroplethChart');
export const NetworkChart = typedChart('network', 'NetworkChart');
