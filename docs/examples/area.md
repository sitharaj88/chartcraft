# Area

A stacked area chart shows how a total is composed over time — series stack
with `stacked: true`, and the y-extent is computed on the stacked totals.

<ClientOnly>
  <DemoAreaStacked />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'area',
  stacked: true,
  title: 'Site traffic by channel',
  subtitle: 'Sessions per month, thousands',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [
      { id: 'organic', name: 'Organic search', data: [86, 92, 101, 110, 118, 131] },
      { id: 'direct', name: 'Direct', data: [54, 55, 58, 61, 66, 68] },
      { id: 'referral', name: 'Referral', data: [22, 25, 24, 29, 31, 36] },
      { id: 'social', name: 'Social', data: [14, 17, 21, 19, 24, 28] },
    ],
  },
  yAxis: { label: 'Sessions (thousands)' },
  a11y: {
    description:
      'Total monthly sessions grew from 176 to 263 thousand between January and June, with organic search contributing about half throughout.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { AreaChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  stacked: true,
  title: 'Site traffic by channel',
  subtitle: 'Sessions per month, thousands',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [
      { id: 'organic', name: 'Organic search', data: [86, 92, 101, 110, 118, 131] },
      { id: 'direct', name: 'Direct', data: [54, 55, 58, 61, 66, 68] },
      { id: 'referral', name: 'Referral', data: [22, 25, 24, 29, 31, 36] },
      { id: 'social', name: 'Social', data: [14, 17, 21, 19, 24, 28] },
    ],
  },
  yAxis: { label: 'Sessions (thousands)' },
  a11y: {
    description:
      'Total monthly sessions grew from 176 to 263 thousand between January and June, with organic search contributing about half throughout.',
  },
};
</script>

<template>
  <AreaChart :options="options" style="height: 340px" />
</template>
```

:::

Series colors are the theme's palette slots, assigned by first-seen identity —
never set per-series colors just to "make it look right", and never re-sort
the palette ([why](../concepts/theming.md#why-the-order-must-not-change)).
Toggling a series in the legend rescales the stack without repainting the
remaining series.
