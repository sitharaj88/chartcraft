# @chartcraft/vue

Vue 3 wrapper for [ChartCraft](https://sitharaj88.github.io/chartcraft/) —
a thin lifecycle/event bridge around
[`@chartcraft/core`](https://www.npmjs.com/package/@chartcraft/core), at
full feature parity with the vanilla API.

```sh
npm install @chartcraft/vue
```

```vue
<script setup lang="ts">
import { LineChart } from '@chartcraft/vue';

const options = {
  title: 'Weekly active users',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    series: [{ name: 'WAU', data: [12000, 14200, 15800, 21000, 31000] }],
  },
};
</script>

<template>
  <LineChart :options="options" style="height: 320px" />
</template>
```

One component per chart type (`LineChart`, `BarChart`, `SankeyChart`,
`ChoroplethChart`, …, 39 in total), plus `<Chart :options="{ type: '...' }">`
for the generic form. `expose({ chart })` reaches the underlying
`ChartInstance` for `exportImage()`, `exportData()`, `zoomTo()`, and friends.

**Full guide:** <https://sitharaj88.github.io/chartcraft/frameworks/vue>

---

## One package, not two

`@chartcraft/vue` re-exports core's runtime values as well as its types, so
`@chartcraft/core` does not need to be a direct dependency:

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

These are named re-exports, so they tree-shake: importing `lightTheme` alone
pulls in neither the chart engine nor any Vue code.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and binding it to the matching per-type
component. Every ChartCraft wrapper exports it under this same name.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/vue';
export const revenue: ChartSpec = {
  title: 'Revenue',
  data: { categories: ['Q1', 'Q2'], series: [{ name: 'ARR', data: [12.4, 13.1] }] },
};
```
```vue
<BarChart :options="revenue" style="height: 320px" />
```

`TypedChartOptions` is a deprecated alias of `ChartSpec`, kept so 0.3.0 code
keeps compiling. It will be removed in 1.0.

## How updates reach the chart

`options` is **deep-watched**, and the whole object is handed to
`chart.update()` (core deep-merges and diffs). Two consequences:

- Mutating a nested field of a `reactive`/`ref` options object *is* picked up —
  unlike the React and Angular wrappers, nothing is silently lost.
- But a new-but-equal `options` reference (an object literal written inline in
  the template) still triggers a redundant `update()`, and with
  `zoom: { enabled: true }` that discards the user's viewport. Hold options in a
  `ref`/`reactive`/`computed` — which is the idiomatic Vue shape anyway — rather
  than rebuilding a literal in the template.

## Reaching the instance

A template ref's `chart` is set in the component's own `onMounted`, and Vue runs
child `onMounted` hooks before the parent's, so a parent's `onMounted` can use it
directly:

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

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
