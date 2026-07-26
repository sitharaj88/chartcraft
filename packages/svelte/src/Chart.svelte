<!--
  @chartcraft/svelte — thin Svelte wrapper around @chartcraft/core.

  Usage (Svelte 4 component events):
    <Chart {options} on:pointclick on:pointenter on:pointleave on:legendtoggle
           on:zoom on:annotationclick on:ready />

  Usage (Svelte 5 callback props — same events, no deprecated directive):
    <Chart {options} onpointclick={handle} onready={setup} />

  Both forms are always active, so a Svelte 5 app can drop `on:` entirely while
  Svelte 4 apps keep working unchanged. Callback props receive the payload
  directly; `on:` handlers receive a CustomEvent whose `detail` is the payload.

  Instance access: `on:ready` / `onready` (fires as soon as it exists, and is
  reliable from a parent's own setup code), or `bind:this={component}` then
  `component.getChart()`. SSR-safe: the chart is created in onMount only.
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

  /*
   * Svelte-5-style callback props. Optional and additive: passing one is
   * equivalent to the matching `on:` directive, and both fire if both are used.
   * Declared explicitly (rather than via `$props()`) so the package keeps
   * working on Svelte 4 — and so a Svelte 5/6 app never needs `on:` at all.
   */
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
  /**
   * Called once with the live core Chart instance, as soon as it exists.
   * The reliable way to reach the instance from setup code: unlike
   * `bind:this` + `getChart()`, it cannot fire before the chart is created.
   * @type {((chart: any) => void) | undefined}
   */
  export let onready = undefined;

  const dispatch = createEventDispatcher();

  let el;
  let chart = null;

  // Latest callback props, keyed by core event name. Read at dispatch time, so
  // swapping a handler never needs a re-subscribe.
  let callbacks = {};
  $: callbacks = {
    pointclick: onpointclick,
    pointenter: onpointenter,
    pointleave: onpointleave,
    legendtoggle: onlegendtoggle,
    zoom: onzoom,
    annotationclick: onannotationclick,
  };

  /**
   * Returns the live core Chart instance (null before mount / after destroy).
   *
   * Note the ordering trap this shares with every `bind:this` accessor: a
   * parent that calls it from its own `onMount` may still see `null`. Use
   * `on:ready` / `onready` for setup code.
   */
  export function getChart() {
    return chart;
  }

  onMount(() => {
    chart = createChart(el, options);
    for (const type of EVENTS) {
      chart.on(type, (ev) => {
        dispatch(type, ev);
        const callback = callbacks[type];
        if (callback) callback(ev);
      });
    }
    dispatch('ready', chart);
    if (onready) onready(chart);
  });

  // Reactive updates: any change to `options` routes through chart.update()
  // (core deep-merges and diffs). The single extra call triggered right after
  // mount (when `chart` is first assigned) is a diffed no-op by contract.
  //
  // Note this reacts to `options` by REFERENCE: mutating the same object in
  // place is invisible. Always assign a new object.
  $: if (chart) chart.update(options);

  onDestroy(() => {
    if (chart) {
      chart.destroy(); // removes DOM, observers, listeners
      chart = null;
    }
  });
</script>

<div bind:this={el} class={className}></div>
