<!--
  <FunnelChart {options} on:pointclick on:pointenter on:pointleave on:legendtoggle
    on:zoom on:annotationclick on:ready />
  Same as <Chart> minus `type` (injected as 'funnel').
  Svelte-5 callback props (`onpointclick={…}`, `onready={…}`) work here too.
-->
<script>
  import Chart from './Chart.svelte';
  import { withType } from './options.js';

  /** ChartOptions without `type`. */
  export let options;
  let className = '';
  export { className as class };

  /* Svelte-5-style callback props, forwarded verbatim to <Chart>. */
  /** @type {((ev: any) => void) | undefined} */
  export let onpointclick = undefined;
  /** @type {((ev: any) => void) | undefined} */
  export let onpointenter = undefined;
  /** @type {((ev: any) => void) | undefined} */
  export let onpointleave = undefined;
  /** @type {((ev: any) => void) | undefined} */
  export let onlegendtoggle = undefined;
  /** @type {((ev: any) => void) | undefined} */
  export let onzoom = undefined;
  /** @type {((ev: any) => void) | undefined} */
  export let onannotationclick = undefined;
  /** @type {((chart: any) => void) | undefined} */
  export let onready = undefined;

  let inner;

  /**
   * Returns the live core Chart instance (null before mount / after destroy).
   * Prefer `on:ready` / `onready` in setup code — see <Chart>.
   */
  export function getChart() {
    return inner ? inner.getChart() : null;
  }
</script>

<Chart
  bind:this={inner}
  options={withType(options, 'funnel')}
  class={className}
  {onpointclick}
  {onpointenter}
  {onpointleave}
  {onlegendtoggle}
  {onzoom}
  {onannotationclick}
  {onready}
  on:pointclick
  on:pointenter
  on:pointleave
  on:legendtoggle
  on:zoom
  on:annotationclick
  on:ready
/>
