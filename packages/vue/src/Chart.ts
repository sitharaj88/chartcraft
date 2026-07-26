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

/**
 * A chart's options with no `type` — the shape for holding chart configuration
 * in its own module (`specs.ts`) and binding it to the matching per-type
 * component. Identical in every ChartCraft wrapper (`@chartcraft/react`,
 * `@chartcraft/vue`, `@chartcraft/svelte`, `@chartcraft/angular`).
 *
 * ```ts
 * // specs.ts
 * import type { ChartSpec } from '@chartcraft/vue';
 * export const revenue: ChartSpec = { title: 'Revenue', data: { ... } };
 * ```
 * ```vue
 * <BarChart :options="revenue" />
 * ```
 */
export type ChartSpec = Omit<ChartOptions, 'type'>;

/**
 * @deprecated Since 0.3.1 — use {@link ChartSpec}, which is the same type under
 * the name every ChartCraft wrapper now shares. Kept as an alias so 0.3.0 code
 * keeps compiling; it will be removed in 1.0.
 */
export type TypedChartOptions = ChartSpec;

/** Shape exposed to template refs: `chartRef.value.chart` is the ChartInstance (or null before mount). */
export interface ChartExposed {
  chart: ChartInstance | null;
}

const chartEmits = {
  'point-click': (_ev: PointEvent) => true,
  'point-enter': (_ev: PointEvent) => true,
  'point-leave': (_ev: PointEvent) => true,
  'legend-toggle': (_ev: ChartEventMap['legendtoggle']) => true,
  // v0.3
  zoom: (_ev: ChartEventMap['zoom']) => true,
  'annotation-click': (_ev: ChartEventMap['annotationclick']) => true,
};

/**
 * `<Chart :options="opts" @point-click @point-enter @point-leave @legend-toggle
 *   @zoom @annotation-click />`
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
      c.on('zoom', (ev) => emit('zoom', ev));
      c.on('annotationclick', (ev) => emit('annotation-click', ev));
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
      options: { type: Object as PropType<ChartSpec>, required: true },
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
          onZoom: (ev: ChartEventMap['zoom']) => emit('zoom', ev),
          onAnnotationClick: (ev: ChartEventMap['annotationclick']) => emit('annotation-click', ev),
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
