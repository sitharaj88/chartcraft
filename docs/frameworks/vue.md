# Vue

`@chartcraft/vue` is a thin Vue 3 wrapper around `@chartcraft/core`: it owns
lifecycle (mount/update/destroy), resize observation, and event bridging.
All chart logic lives in core, so Vue charts have exact feature parity with
every other framework.

## Install

```sh
npm install @chartcraft/vue
```

**One package, not two.** `@chartcraft/vue` depends on core and re-exports its
whole public surface — every type *and* every value — so `@chartcraft/core` does
not need to be a second direct dependency:

```ts
import {
  LineChart,
  // themes & palette
  lightTheme, darkTheme, categoricalPalette, sequentialPalette, sequentialRampFor,
  // utilities
  LinearScale, TimeScale, BandScale, LogScale, downsampleLTTB,
  // custom decorators
  registerDecorator, unregisterDecorator, decorators, clearDecorators,
  // escape hatch + version
  createChart, version,
} from '@chartcraft/vue';
```

These are named re-exports, never `export *`, so they tree-shake: importing
`lightTheme` from the wrapper is byte-identical to importing it from core and
pulls in neither the chart engine nor any Vue code.

Core's `Chart` *interface* would collide with the `<Chart>` *component*, so the
instance type is re-exported as **`ChartInstance`**. Every other core type keeps
its own name.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and binding it to the matching per-type
component. All four ChartCraft wrappers export it under this same name, so a
spec module is portable between them.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/vue';

export const revenue: ChartSpec = {
  title: 'Revenue',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: 'Product', data: [12.4, 13.1, 14.8, 16.2] }],
  },
};
```
```vue
<BarChart :options="revenue" style="height: 320px" />
```

`ChartSpec` replaces `TypedChartOptions`, which is kept as a **deprecated
alias** so 0.3.0 code keeps compiling; it will be removed in 1.0.

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
| `@zoom` | **v0.3.** payload `{ x?: [number, number]; y?: [number, number] } \| null` (`null` = reset) |
| `@annotation-click` | **v0.3.** payload `{ index: number; annotation: Annotation }` |

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

### Hold options in a `ref` or `computed`

The deep watch has one happy consequence and one trap:

- **Nothing is silently lost.** Mutating a nested field of a `reactive`/`ref`
  options object *is* picked up — unlike the React and Angular wrappers, which
  watch by reference. This is also why the Vue wrapper ships **no development
  warning**: there is no "you mutated it and nothing happened" failure mode to
  warn about.
- **But a new-but-equal reference still costs a redundant `chart.update()`** — and
  with `zoom: { enabled: true }` a redundant update whose data lands on a
  *different* domain discards the user's viewport. An object literal written
  inline in the template is rebuilt on every render, so hold options in a
  `ref`/`reactive`/`computed` — the idiomatic Vue shape anyway — rather than
  rebuilding an equal literal:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { LineChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const range = ref<'7d' | '30d'>('7d');

// One object per real change of input, not one per render.
const options = computed<ChartSpec>(() => ({
  title: 'Weekly active users',
  subtitle: range.value === '7d' ? 'Last 7 days' : 'Last 30 days',
  data: seriesFor(range.value),
  zoom: { enabled: true },
}));
</script>

<template>
  <LineChart :options="options" style="height: 320px" />
</template>
```

::: tip Since 0.4, an update only resets the zoom when it has to
The viewport now survives any update whose **computed domains** are unchanged —
so a theme change, an equivalent re-send, or new values on the same timestamps
all keep the window. See
[Zoom, pan & brush](../features/zoom-pan-brush.md#the-viewport-across-an-update).
:::

## Per-type convenience components

One per chart type — **39 of them**, same interface, minus `type` inside
`options` (their options type is `ChartSpec`):

- **v0.1** `LineChart`, `AreaChart`, `BarChart`, `ScatterChart`, `PieChart`,
  `DonutChart`
- **v0.2** `BubbleChart`, `SparklineChart`, `HistogramChart`, `BoxplotChart`,
  `CandlestickChart`, `OhlcChart`, `WaterfallChart`, `HeatmapChart`,
  `TreemapChart`, `SunburstChart`, `FunnelChart`, `RadarChart`, `GaugeChart`
- **v0.3** `RangeareaChart`, `BulletChart`, `DumbbellChart`, `LollipopChart`,
  `SlopeChart`, `StreamgraphChart`, `MarimekkoChart`, `PyramidChart`,
  `CalendarChart`, `RadialbarChart`, `RoseChart`, `ViolinChart`,
  `ParallelChart`, `IcicleChart`, `CirclepackChart`, `WordcloudChart`,
  `SankeyChart`, `GanttChart`, `ChoroplethChart`, `NetworkChart`

```vue
<script setup lang="ts">
import { BarChart } from '@chartcraft/vue';
import { revenue } from './specs';        // a ChartSpec, stable by construction
</script>

<template>
  <BarChart :options="revenue" style="height: 320px" />
</template>
```

::: tip Known limitation: the per-type components share one options type
All 39 take the same loose `ChartSpec`, so
`<GaugeChart :options="{ sankey: { nodeWidth: 12 } }" />` type-checks even though
it is nonsense. The components buy you the correct `type` string, not a narrowed
options shape. Narrowing was assessed and deliberately deferred: it would break
the shared-`ChartSpec` pattern above, and it is a 1.0-shaped change.
:::

## Getting the `Chart` instance

The component `expose`s the underlying instance as `chart` — reach it
through a template ref for the imperative surface (`on`/`off` beyond bridged
events, `setData`, `resize`, `getOptions`, `zoomTo`). Vue runs child `onMounted`
hooks **before** the parent's, so a parent's `onMounted` can use it directly:

```vue
<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import { LineChart, type ChartExposed } from '@chartcraft/vue';

const hero = shallowRef<ChartExposed | null>(null);
onMounted(() => hero.value!.chart!.zoomTo({ x: [0, 10] })); // never null here
</script>

<template>
  <LineChart ref="hero" :options="options" />
</template>
```

The same thing with a subscription to clean up:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue';
import { Chart, type ChartExposed } from '@chartcraft/vue';

// `ChartExposed` is the shape the component exposes — `InstanceType<typeof Chart>`
// does not carry it, so annotate the ref with `ChartExposed`.
const chartRef = shallowRef<ChartExposed | null>(null);
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
