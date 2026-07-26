# @chartcraft/svelte

Svelte wrapper for [ChartCraft](https://sitharaj88.github.io/chartcraft/) —
a thin lifecycle/event bridge around
[`@chartcraft/core`](https://www.npmjs.com/package/@chartcraft/core), at
full feature parity with the vanilla API. Svelte 4 and 5. Ships source
`.svelte` components, as is standard for Svelte libraries — no build step.

```sh
npm install @chartcraft/svelte
```

```svelte
<script>
  import { LineChart } from '@chartcraft/svelte';

  const options = {
    title: 'Weekly active users',
    data: {
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      series: [{ name: 'WAU', data: [12000, 14200, 15800, 21000, 31000] }],
    },
  };
</script>

<LineChart {options} style="height: 320px" />
```

One component per chart type (`LineChart`, `BarChart`, `SankeyChart`,
`ChoroplethChart`, …, 39 in total), plus `<Chart options={{ type: '...' }}>`
for the generic form.

**Full guide:** <https://sitharaj88.github.io/chartcraft/frameworks/svelte>

---

## Events: `on:` directives or callback props

Every bridged event is available both ways. Svelte 4 component events:

```svelte
<LineChart {options} on:pointclick={(e) => select(e.detail)} on:zoom={(e) => (window = e.detail)} />
```

…and the modern callback-prop form, which needs no deprecated directive and is
therefore safe for Svelte 5 today and Svelte 6 (where `on:` is slated for
removal):

```svelte
<LineChart {options} onpointclick={select} onzoom={(w) => (window = w)} />
```

`onpointclick`, `onpointenter`, `onpointleave`, `onlegendtoggle`, `onzoom`,
`onannotationclick`, `onready`. A callback prop receives the payload directly; an
`on:` handler receives a `CustomEvent` whose `detail` is the payload. Both fire
if both are used.

## Reaching the instance: `onready`

```svelte
<LineChart {options} onready={(chart) => (hero = chart)} />
<!-- or, equivalently -->
<LineChart {options} on:ready={(e) => (hero = e.detail)} />
```

`getChart()` via `bind:this` still works, but it has an ordering trap: `bind:this`
lands before the child's own `onMount`, so `getChart()` can return `null` when
called from a parent's `onMount`. `onready`/`on:ready` fire the moment the
instance exists and are reliable from setup code.

## One package, not two

`@chartcraft/svelte` re-exports core's runtime values as well as its types, so
`@chartcraft/core` does not need to be a direct dependency:

```js
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
} from '@chartcraft/svelte';
```

These are named re-exports, so they tree-shake: importing `lightTheme` alone
pulls in neither the chart engine nor any component.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and passing it to the matching per-type
component. Every ChartCraft wrapper exports it under this same name.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/svelte';
export const revenue: ChartSpec = {
  title: 'Revenue',
  data: { categories: ['Q1', 'Q2'], series: [{ name: 'ARR', data: [12.4, 13.1] }] },
};
```
```svelte
<BarChart options={revenue} />
```

`TypedChartProps` remains the *props* type of a per-type component (`options`,
`class`, and the callback props); `ChartSpec` is options only.

## How updates reach the chart

`options` is watched by **reference**: assign a new object to update the chart,
because mutating the same object in place is invisible to Svelte's reactive
statement. The flip side is that a new-but-equal object still costs a full
`chart.update()`, and with `zoom: { enabled: true }` that discards the user's
viewport — so derive `options` from state (`$:` / a store) rather than rebuilding
an equal literal on unrelated changes.

> There is no development-time warning for this, unlike the React and Angular
> wrappers: this package ships uncompiled `.svelte` sources with no build step,
> so there is no point at which a dev-only check could be stripped out of a
> production bundle.

## Known limitation

The per-type components share one loose options type: `TypedChartProps.options`
is `ChartSpec` for all 39 of them, so `<GaugeChart options={{ sankey: { … } }} />`
type-checks. The components buy you the correct `type` string, not a narrowed
options shape.

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
