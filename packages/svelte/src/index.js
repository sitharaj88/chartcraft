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

export { EVENTS, withType } from './options.js';
