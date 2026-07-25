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

export { EVENTS, withType } from './options.js';
