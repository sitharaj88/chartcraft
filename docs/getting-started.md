# Getting started

This guide takes you from install to a live, updating chart in vanilla
TypeScript, React, Vue, and Svelte.

## Install

```sh
npm install @chartcraft/core            # always required
npm install @chartcraft/react           # if you use React 18+
npm install @chartcraft/vue             # if you use Vue 3
npm install @chartcraft/svelte          # if you use Svelte 4 or 5
```

`@chartcraft/core` has zero runtime dependencies and ships ESM, CJS, and
TypeScript declarations. The wrappers re-export all core types, so you rarely
need to import from core directly in framework code.

## Your first chart (vanilla)

A chart needs a container element with a size. By default the chart fills the
container and stays responsive via `ResizeObserver`.

```html
<div id="chart" style="width: 640px; height: 360px;"></div>
```

```ts
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'bar',
  title: 'Revenue by quarter',
  subtitle: 'FY2025, USD millions',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
    ],
  },
});
```

That's a complete chart: axes are inferred from the data (`category` x,
`linear` y), the legend appears automatically because there are two series,
tooltips and keyboard navigation are on by default, and the theme follows the
user's `prefers-color-scheme` (`theme: 'auto'`).

`createChart(container, options)` returns a [`Chart`](api/core.md#the-chart-instance)
instance — keep a reference to it; it is how you update, listen, and clean up.

Here is a live ChartCraft chart, rendered by this site with the same options
API (more on the [examples pages](examples/index.md)):

<ClientOnly>
  <DemoLine />
</ClientOnly>

## Your first chart (React)

The React wrapper spreads `ChartOptions` as props and adds `className`,
`style`, and event props. Per-type components (`LineChart`, `AreaChart`,
`BarChart`, `ScatterChart`, `PieChart`, `DonutChart`) take the same props
minus `type`.

```tsx
import { BarChart } from '@chartcraft/react';

export function RevenueChart() {
  return (
    <BarChart
      title="Revenue by quarter"
      subtitle="FY2025, USD millions"
      data={{
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [
          { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
          { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
        ],
      }}
      style={{ height: 360 }}
    />
  );
}
```

Prop changes call `chart.update(...)` (a diffed re-render, not a rebuild), and
unmounting calls `chart.destroy()` for you. See the
[React guide](frameworks/react.md).

## Your first chart (Vue)

The Vue wrapper takes a single `options` object and deep-watches it.

```vue
<script setup lang="ts">
import { reactive } from 'vue';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';

const options = reactive<ChartOptions>({
  type: 'bar',
  title: 'Revenue by quarter',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
    ],
  },
});
</script>

<template>
  <Chart :options="options" style="height: 360px" @point-click="(ev) => console.log(ev.seriesName)" />
</template>
```

Mutating `options` (it is deep-watched) triggers `chart.update`. See the
[Vue guide](frameworks/vue.md).

## Your first chart (Svelte)

```svelte
<script lang="ts">
  import { Chart } from '@chartcraft/svelte';
  import type { ChartOptions } from '@chartcraft/svelte';

  let options: ChartOptions = {
    type: 'bar',
    title: 'Revenue by quarter',
    data: {
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
        { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
      ],
    },
  };
</script>

<div style="height: 360px">
  <Chart {options} on:pointclick={(e) => console.log(e.detail.seriesName)} />
</div>
```

Reassigning `options` triggers an update. See the
[Svelte guide](frameworks/svelte.md).

## Updating data

Charts are updated, not recreated. `chart.update(partial)` deep-merges the
partial into the current options, diffs, and re-runs only the affected
pipeline stages — with animation interpolating between the old and new state.

```ts
// Replace the data (setData is shorthand for update({ data }))
chart.setData({
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { name: 'Product', data: [12.9, 13.5, 15.1, 17.0] },
    { name: 'Services', data: [6.3, 6.6, 7.2, 8.1] },
  ],
});

// Or update anything else — theme, axes, title…
chart.update({ theme: 'dark', yAxis: { label: 'USD (millions)' } });
```

Two rules of thumb:

- **Keep series identity stable across updates.** A series is identified by
  `id` (defaulting to `name`). A series that keeps its identity keeps its
  color and animates smoothly; renaming without an `id` makes it a *new*
  series. See [Data model](concepts/data-model.md#stable-series-identity).
- **Prefer `update` over destroy-and-recreate.** Recreating tears down the
  DOM, observers, and accessibility state and replays the entry animation.
  See [Performance](performance.md#update-vs-recreate).

## Listening to events

`chart.on` returns an unsubscribe function — the idiomatic cleanup pattern:

```ts
const off = chart.on('pointclick', (ev) => {
  console.log(`${ev.seriesName} @ ${String(ev.x)}: ${ev.y}`);
});

// later
off();
```

All events and payloads are listed in
[Interactions](concepts/interactions.md) and the
[API reference](api/core.md#events).

## Destroying

When the chart's host leaves the page, destroy it. This removes the canvas
and the parallel accessibility DOM, disconnects the `ResizeObserver`, and
removes all listeners:

```ts
chart.destroy();
```

The framework wrappers do this automatically on unmount — only vanilla users
call `destroy()` by hand.

## Where next

- [Data model](concepts/data-model.md) — the three data shapes and when to use each
- [Theming](concepts/theming.md) — light/dark/auto and custom themes
- [Accessibility](accessibility.md) — what you get for free and what you should still do
- [API reference](api/core.md) — every option, type, and default
