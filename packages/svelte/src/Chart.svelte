<!--
  @chartcraft/svelte — thin Svelte wrapper around @chartcraft/core.

  Usage:
    <Chart {options} on:pointclick on:pointenter on:pointleave on:legendtoggle
           on:zoom on:annotationclick />

  Instance access: either `bind:this={component}` then `component.getChart()`,
  or listen for events. SSR-safe: the chart is created in onMount only.
  Svelte 4 syntax, compatible with Svelte 5 in compatibility mode.
-->
<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { createChart } from '@chartcraft/core';
  import { EVENTS } from './options.js';

  /** Full ChartOptions (required). */
  export let options;
  /** Optional class for the container div (`class` is reserved, hence the alias export). */
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher();

  let el;
  let chart = null;

  /** Returns the live core Chart instance (null before mount / after destroy). */
  export function getChart() {
    return chart;
  }

  onMount(() => {
    chart = createChart(el, options);
    for (const type of EVENTS) {
      chart.on(type, (ev) => dispatch(type, ev));
    }
  });

  // Reactive updates: any change to `options` routes through chart.update()
  // (core deep-merges and diffs). The single extra call triggered right after
  // mount (when `chart` is first assigned) is a diffed no-op by contract.
  $: if (chart) chart.update(options);

  onDestroy(() => {
    if (chart) {
      chart.destroy(); // removes DOM, observers, listeners
      chart = null;
    }
  });
</script>

<div bind:this={el} class={className}></div>
