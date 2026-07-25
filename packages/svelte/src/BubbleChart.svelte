<!--
  <BubbleChart {options} on:pointclick on:pointenter on:pointleave on:legendtoggle
    on:zoom on:annotationclick />
  Same as <Chart> minus `type` (injected as 'bubble').
-->
<script>
  import Chart from './Chart.svelte';
  import { withType } from './options.js';

  /** ChartOptions without `type`. */
  export let options;
  let className = '';
  export { className as class };

  let inner;

  /** Returns the live core Chart instance (null before mount / after destroy). */
  export function getChart() {
    return inner ? inner.getChart() : null;
  }
</script>

<Chart
  bind:this={inner}
  options={withType(options, 'bubble')}
  class={className}
  on:pointclick
  on:pointenter
  on:pointleave
  on:legendtoggle
  on:zoom
  on:annotationclick
/>
