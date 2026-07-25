# Svelte

`@chartcraft/svelte` is a thin wrapper around `@chartcraft/core` for
Svelte 4 and 5: it owns lifecycle (mount/update/destroy), resize
observation, and event bridging. All chart logic lives in core, so Svelte
charts have exact feature parity with every other framework.

## Install

```sh
npm install @chartcraft/core @chartcraft/svelte
```

The wrapper re-exports all core types — import everything from
`@chartcraft/svelte`.

## The `<Chart>` component

The component takes a single `options` prop and dispatches component events
using Svelte 4 `on:` syntax (fully compatible with Svelte 5):

```svelte
<script lang="ts">
  import { Chart } from '@chartcraft/svelte';
  import type { ChartOptions } from '@chartcraft/svelte';

  let options: ChartOptions = {
    type: 'line',
    title: 'Weekly active users',
    data: {
      categories: ['W1', 'W2', 'W3', 'W4'],
      series: [
        { name: 'Web', data: [1200, 1350, 1480, 1620] },
        { name: 'Mobile', data: [2100, 2280, 2190, 2540] },
      ],
    },
  };
</script>

<div style="height: 360px">
  <Chart
    {options}
    on:pointclick={(e) => console.log(e.detail.seriesName, e.detail.y)}
    on:pointenter={(e) => console.log('enter', e.detail.dataIndex)}
    on:pointleave={(e) => console.log('leave', e.detail.dataIndex)}
    on:legendtoggle={(e) => console.log(e.detail.seriesId, e.detail.visible)}
  />
</div>
```

| | |
|---|---|
| `options` | `ChartOptions` — reactive; changes trigger `chart.update` |
| `on:pointclick` | `CustomEvent<PointEvent>` — payload in `e.detail` |
| `on:pointenter` / `on:pointleave` | `CustomEvent<PointEvent>` |
| `on:legendtoggle` | `CustomEvent<{ seriesId: string; visible: boolean }>` |

Lifecycle mapping: `onMount` → `createChart`; reactive `options` change →
`chart.update`; destroy → `chart.destroy`.

Updates follow Svelte reactivity — assignment triggers them:

```ts
// Svelte 4: reassign so the change is seen
options = { ...options, title: 'Updated title' };
options.data.series[0].data = [...options.data.series[0].data, 1710];
options = options;
```

In Svelte 5 runes mode, hold the options in `$state` and mutate naturally:

```svelte
<script lang="ts">
  import { Chart } from '@chartcraft/svelte';
  import type { ChartOptions } from '@chartcraft/svelte';

  const options: ChartOptions = $state({
    type: 'bar',
    data: { categories: ['Q1', 'Q2'], series: [{ name: 'Revenue', data: [12.4, 13.1] }] },
  });

  function bump() {
    options.data.series[0].data = [12.9, 13.5];
  }
</script>
```

## Per-type convenience components

One per chart type — same interface, minus `type` inside `options`:
`LineChart`, `AreaChart`, `BarChart`, `ScatterChart`, `PieChart`,
`DonutChart`, and (v0.2) `BubbleChart`, `SparklineChart`, `HistogramChart`,
`BoxplotChart`, `CandlestickChart`, `OhlcChart`, `WaterfallChart`,
`HeatmapChart`, `TreemapChart`, `SunburstChart`, `FunnelChart`,
`RadarChart`, `GaugeChart`:

```svelte
<DonutChart
  options={{
    title: 'Storage by type',
    data: { series: [{ name: 'Storage', data: [
      { x: 'Documents', y: 120 },
      { x: 'Media', y: 340 },
      { x: 'Backups', y: 210 },
    ] }] },
  }}
/>
```

## Getting the `Chart` instance

The component exposes the underlying core instance as `chart` — bind the
component and read it after mount for the imperative surface (`on`/`off`
beyond bridged events, `setData`, `resize`, `getOptions`):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart } from '@chartcraft/svelte';

  let chartComponent: Chart;

  onMount(() => {
    const chart = chartComponent.chart;   // the core Chart instance
    const off = chart.on('render', ({ reason }) => console.log('rendered:', reason));
    return off; // onMount cleanup — runs on destroy
  });
</script>

<div style="height: 300px">
  <Chart bind:this={chartComponent} {options} />
</div>
```

## SSR (SvelteKit)

The wrapper is SSR-safe: no `window` access at import time; the chart mounts
in `onMount`, which never runs on the server. Use it in SvelteKit pages and
components without `browser` guards — the server renders the empty container
and the chart appears on hydration.

- Server output contains no chart pixels or a11y DOM; HTML-payload chart
  content is the SSR snapshot item on the [roadmap](../roadmap.md).
- Give the container a CSS height that exists before hydration to avoid
  layout shift.
