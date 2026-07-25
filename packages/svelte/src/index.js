/**
 * @chartcraft/svelte public surface.
 *
 * Components ship as source .svelte files (standard for Svelte libraries);
 * consumers compile them with their own Svelte toolchain via the "svelte"
 * export condition. This entry is plain JS so it needs no build step.
 * Types live in ./index.d.ts.
 */
export { default as Chart } from './Chart.svelte';
export { default as LineChart } from './LineChart.svelte';
export { default as AreaChart } from './AreaChart.svelte';
export { default as BarChart } from './BarChart.svelte';
export { default as ScatterChart } from './ScatterChart.svelte';
export { default as PieChart } from './PieChart.svelte';
export { default as DonutChart } from './DonutChart.svelte';

// v0.2 chart types
export { default as BubbleChart } from './BubbleChart.svelte';
export { default as SparklineChart } from './SparklineChart.svelte';
export { default as HistogramChart } from './HistogramChart.svelte';
export { default as BoxplotChart } from './BoxplotChart.svelte';
export { default as CandlestickChart } from './CandlestickChart.svelte';
export { default as OhlcChart } from './OhlcChart.svelte';
export { default as WaterfallChart } from './WaterfallChart.svelte';
export { default as HeatmapChart } from './HeatmapChart.svelte';
export { default as TreemapChart } from './TreemapChart.svelte';
export { default as SunburstChart } from './SunburstChart.svelte';
export { default as FunnelChart } from './FunnelChart.svelte';
export { default as RadarChart } from './RadarChart.svelte';
export { default as GaugeChart } from './GaugeChart.svelte';

// v0.3 chart types
export { default as RangeareaChart } from './RangeareaChart.svelte';
export { default as BulletChart } from './BulletChart.svelte';
export { default as DumbbellChart } from './DumbbellChart.svelte';
export { default as LollipopChart } from './LollipopChart.svelte';
export { default as SlopeChart } from './SlopeChart.svelte';
export { default as StreamgraphChart } from './StreamgraphChart.svelte';
export { default as MarimekkoChart } from './MarimekkoChart.svelte';
export { default as PyramidChart } from './PyramidChart.svelte';
export { default as CalendarChart } from './CalendarChart.svelte';
export { default as RadialbarChart } from './RadialbarChart.svelte';
export { default as RoseChart } from './RoseChart.svelte';
export { default as ViolinChart } from './ViolinChart.svelte';
export { default as ParallelChart } from './ParallelChart.svelte';
export { default as IcicleChart } from './IcicleChart.svelte';
export { default as CirclepackChart } from './CirclepackChart.svelte';
export { default as WordcloudChart } from './WordcloudChart.svelte';
export { default as SankeyChart } from './SankeyChart.svelte';
export { default as GanttChart } from './GanttChart.svelte';
export { default as ChoroplethChart } from './ChoroplethChart.svelte';
export { default as NetworkChart } from './NetworkChart.svelte';

export { EVENTS, withType } from './options.js';
