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
  useImperativeHandle,
  useRef,
  useState,
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

/** The live chart instance type (core's `Chart` interface, renamed to avoid colliding with the `Chart` component). */
export type ChartInstance = CoreChart;

export interface ChartEventProps {
  onPointClick?: (ev: PointEvent) => void;
  onPointEnter?: (ev: PointEvent) => void;
  onPointLeave?: (ev: PointEvent) => void;
  onLegendToggle?: (ev: ChartEventMap['legendtoggle']) => void;
}

/** All ChartOptions as flat props, plus className/style and event handlers. */
export interface ChartProps extends ChartOptions, ChartEventProps {
  className?: string;
  style?: CSSProperties;
}

/** Convenience-component props: same as ChartProps minus `type`. */
export type TypedChartProps = Omit<ChartProps, 'type'>;

function ChartImpl(props: ChartProps, ref: ForwardedRef<ChartInstance>): ReactElement {
  const { className, style, onPointClick, onPointEnter, onPointLeave, onLegendToggle, ...options } =
    props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const [instance, setInstance] = useState<ChartInstance | null>(null);

  // Latest-value refs so the mount effect can subscribe once while handlers
  // and options stay swappable without re-subscribing or re-creating.
  const handlersRef = useRef<ChartEventProps>({});
  handlersRef.current = { onPointClick, onPointEnter, onPointLeave, onLegendToggle };
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
    chartRef.current = chart;
    setInstance(chart);
    return () => {
      chartRef.current = null;
      setInstance(null);
      chart.destroy(); // removes DOM, observers, listeners
    };
  }, []);

  // Expose the core Chart instance through the ref.
  useImperativeHandle(ref, () => instance as ChartInstance, [instance]);

  // Option updates → chart.update() (core deep-merges and diffs).
  const firstUpdate = useRef(true);
  useEffect(() => {
    if (firstUpdate.current) {
      firstUpdate.current = false;
      return;
    }
    chartRef.current?.update(optionsRef.current);
  }, [
    options.type,
    options.data,
    options.theme,
    options.title,
    options.subtitle,
    options.width,
    options.height,
    options.padding,
    options.xAxis,
    options.yAxis,
    options.stacked,
    options.horizontal,
    options.legend,
    options.tooltip,
    options.animation,
    options.downsample,
    options.a11y,
  ]);

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
