# Vue

`@chartcraft/vue` is a thin Vue 3 wrapper around `@chartcraft/core`: it owns
lifecycle (mount/update/destroy), resize observation, and event bridging.
All chart logic lives in core, so Vue charts have exact feature parity with
every other framework.

## Install

```sh
npm install @chartcraft/core @chartcraft/vue
```

The wrapper re-exports all core types — import everything from
`@chartcraft/vue`.

## The `<Chart>` component

Unlike the React wrapper (which spreads options as props), the Vue component
takes a single `options` object and **deep-watches** it:

```vue
<script setup lang="ts">
import { reactive } from 'vue';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions, PointEvent } from '@chartcraft/vue';

const options = reactive<ChartOptions>({
  type: 'line',
  title: 'Weekly active users',
  data: {
    categories: ['W1', 'W2', 'W3', 'W4'],
    series: [
      { name: 'Web', data: [1200, 1350, 1480, 1620] },
      { name: 'Mobile', data: [2100, 2280, 2190, 2540] },
    ],
  },
});

function onPointClick(ev: PointEvent) {
  console.log(ev.seriesName, ev.x, ev.y);
}
</script>

<template>
  <Chart
    :options="options"
    style="height: 360px"
    @point-click="onPointClick"
    @point-enter="(ev) => console.log('enter', ev.dataIndex)"
    @point-leave="(ev) => console.log('leave', ev.dataIndex)"
    @legend-toggle="({ seriesId, visible }) => console.log(seriesId, visible)"
  />
</template>
```

| | |
|---|---|
| `:options` | `ChartOptions` — deep-watched; any mutation triggers `chart.update` |
| `@point-click` | payload `PointEvent` (bridges core `pointclick`) |
| `@point-enter` | payload `PointEvent` |
| `@point-leave` | payload `PointEvent` |
| `@legend-toggle` | payload `{ seriesId: string; visible: boolean }` |

Lifecycle mapping: `onMounted` → `createChart`; deep watch fires →
`chart.update`; `onUnmounted` → `chart.destroy`.

Because `options` is deep-watched, plain mutation is enough — no replacement
needed:

```ts
options.data.series[0].data.push(1710);
options.title = 'Weekly active users (updated)';
```

For very large `data`, deep-watching has a cost proportional to the data
size; consider `shallowRef` for the data and replacing `options.data`
wholesale, or use the exposed instance (below) and call `setData` directly.

## Per-type convenience components

One per chart type — same interface, minus `type` inside `options`:
`LineChart`, `AreaChart`, `BarChart`, `ScatterChart`, `PieChart`,
`DonutChart`, and (v0.2) `BubbleChart`, `SparklineChart`, `HistogramChart`,
`BoxplotChart`, `CandlestickChart`, `OhlcChart`, `WaterfallChart`,
`HeatmapChart`, `TreemapChart`, `SunburstChart`, `FunnelChart`,
`RadarChart`, `GaugeChart`:

```vue
<template>
  <BarChart :options="{ data: revenue, stacked: true, title: 'Revenue' }" style="height: 320px" />
</template>
```

## Getting the `Chart` instance

The component `expose`s the underlying instance as `chart` — reach it
through a template ref for the imperative surface (`on`/`off` beyond bridged
events, `setData`, `resize`, `getOptions`):

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Chart } from '@chartcraft/vue';

const chartRef = ref<InstanceType<typeof Chart> | null>(null);
let off: (() => void) | undefined;

onMounted(() => {
  const chart = chartRef.value?.chart;   // the core Chart instance
  off = chart?.on('render', ({ reason }) => console.log('rendered:', reason));
});
onUnmounted(() => off?.());
</script>

<template>
  <Chart ref="chartRef" :options="options" style="height: 300px" />
</template>
```

## SSR (Nuxt, …)

The wrapper is SSR-safe: no `window` access at import time; the chart mounts
in `onMounted`, which never runs on the server. Use it in Nuxt without
`<ClientOnly>` — the server renders the empty container and the chart
appears on hydration.

- Server output contains no chart pixels or a11y DOM; HTML-payload chart
  content is the SSR snapshot item on the [roadmap](../roadmap.md).
- Give the container a CSS height that exists before hydration to avoid
  layout shift.
