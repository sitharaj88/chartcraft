/**
 * @chartcraft/vue — thin Vue 3 wrapper around @chartcraft/core.
 *
 * Responsibilities (and nothing more): lifecycle (create in onMounted, destroy
 * in onBeforeUnmount), deep-watched `options` routed through chart.update()
 * (core diffs), event bridging via emits, and instance exposure (`chart`) for
 * template refs. Pure TS render functions — no SFC, no compile step beyond tsup.
 * SSR-safe: the chart is only created in onMounted, never at module scope.
 */
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
  type PropType,
} from 'vue';
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

/** Options for the per-type convenience components (`type` is injected). */
export type TypedChartOptions = Omit<ChartOptions, 'type'>;

/** Shape exposed to template refs: `chartRef.value.chart` is the ChartInstance (or null before mount). */
export interface ChartExposed {
  chart: ChartInstance | null;
}

const chartEmits = {
  'point-click': (_ev: PointEvent) => true,
  'point-enter': (_ev: PointEvent) => true,
  'point-leave': (_ev: PointEvent) => true,
  'legend-toggle': (_ev: ChartEventMap['legendtoggle']) => true,
};

/**
 * `<Chart :options="opts" @point-click @point-enter @point-leave @legend-toggle />`
 * Template refs reach the instance via the exposed `chart` getter.
 */
export const Chart = defineComponent({
  name: 'Chart',
  props: {
    options: { type: Object as PropType<ChartOptions>, required: true },
  },
  emits: chartEmits,
  setup(props, { emit, expose }) {
    const el = shallowRef<HTMLElement | null>(null);
    const chart = shallowRef<ChartInstance | null>(null);

    onMounted(() => {
      if (!el.value) return;
      const c = createChart(el.value, props.options as ChartOptions);
      c.on('pointclick', (ev) => emit('point-click', ev));
      c.on('pointenter', (ev) => emit('point-enter', ev));
      c.on('pointleave', (ev) => emit('point-leave', ev));
      c.on('legendtoggle', (ev) => emit('legend-toggle', ev));
      chart.value = c;
    });

    watch(
      () => props.options,
      (options) => {
        chart.value?.update(options as ChartOptions);
      },
      { deep: true },
    );

    onBeforeUnmount(() => {
      chart.value?.destroy(); // removes DOM, observers, listeners
      chart.value = null;
    });

    // `chart` unwraps on the exposed proxy: templateRef.chart → ChartInstance | null.
    expose({ chart } satisfies { chart: typeof chart });

    return () => h('div', { ref: el });
  },
});

function typedChart(type: ChartType, name: string) {
  return defineComponent({
    name,
    props: {
      options: { type: Object as PropType<TypedChartOptions>, required: true },
    },
    emits: chartEmits,
    setup(props, { emit, expose }) {
      const inner = shallowRef<ChartExposed | null>(null);
      expose({ chart: computed(() => inner.value?.chart ?? null) });
      return () =>
        h(Chart, {
          ref: inner,
          options: { ...props.options, type } as ChartOptions,
          onPointClick: (ev: PointEvent) => emit('point-click', ev),
          onPointEnter: (ev: PointEvent) => emit('point-enter', ev),
          onPointLeave: (ev: PointEvent) => emit('point-leave', ev),
          onLegendToggle: (ev: ChartEventMap['legendtoggle']) => emit('legend-toggle', ev),
        });
    },
  });
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
