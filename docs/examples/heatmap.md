# Heatmap

A matrix of magnitudes: each series is one **row**, its `number[]` aligned to
`categories` (the columns), each cell colored from a sequential ramp scaled
over `heatmap.min..max` (default: the data extent). Use a heatmap for
two-categorical-dimensions × one-magnitude data — schedules, correlation
grids, calendar activity. Don't use it when exact values must be read
precisely (color steps are approximate — the value lives in the tooltip and
the data table) or when one dimension has only 2–3 members (grouped bars
compare better).

<ClientOnly>
  <DemoHeatmap />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'heatmap',
  title: 'Support tickets by weekday and time',
  subtitle: 'Average tickets opened per 4-hour block, last quarter',
  // heatmap: { ramp, min, max } — default ramp is the sequentialPalette,
  // min/max default to the data extent.
  data: {
    categories: ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'],
    series: [
      { id: 'mon', name: 'Mon', data: [4, 9, 38, 46, 27, 11] },
      { id: 'tue', name: 'Tue', data: [3, 8, 41, 44, 25, 10] },
      { id: 'wed', name: 'Wed', data: [4, 10, 43, 47, 28, 12] },
      { id: 'thu', name: 'Thu', data: [3, 9, 39, 42, 26, 11] },
      { id: 'fri', name: 'Fri', data: [5, 8, 34, 31, 18, 9] },
      { id: 'sat', name: 'Sat', data: [6, 5, 12, 15, 13, 8] },
      { id: 'sun', name: 'Sun', data: [5, 4, 9, 12, 11, 7] },
    ],
  },
  a11y: {
    description:
      'Ticket volume peaks on weekday business hours — roughly 40 per block between 08:00 and 16:00 Monday to Thursday — and drops to single digits overnight and on weekends.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { HeatmapChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Support tickets by weekday and time',
  subtitle: 'Average tickets opened per 4-hour block, last quarter',
  data: {
    categories: ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'],
    series: [
      { id: 'mon', name: 'Mon', data: [4, 9, 38, 46, 27, 11] },
      { id: 'tue', name: 'Tue', data: [3, 8, 41, 44, 25, 10] },
      { id: 'wed', name: 'Wed', data: [4, 10, 43, 47, 28, 12] },
      { id: 'thu', name: 'Thu', data: [3, 9, 39, 42, 26, 11] },
      { id: 'fri', name: 'Fri', data: [5, 8, 34, 31, 18, 9] },
      { id: 'sat', name: 'Sat', data: [6, 5, 12, 15, 13, 8] },
      { id: 'sun', name: 'Sun', data: [5, 4, 9, 12, 11, 7] },
    ],
  },
  a11y: {
    description:
      'Ticket volume peaks on weekday business hours — roughly 40 per block between 08:00 and 16:00 Monday to Thursday — and drops to single digits overnight and on weekends.',
  },
};
</script>

<template>
  <HeatmapChart :options="options" style="height: 380px" />
</template>
```

:::

::: tip Heatmap specifics
The legend is a horizontal **gradient color-scale bar** with min/max labels —
the only key to what cell colors mean — so it shows even for a single row
(explicit `legend: false` still hides it). Cells separate with 1px surface
gaps; keyboard navigation walks cells row-major, and the exact value is
always in the tooltip and a11y table. Pin `heatmap.min`/`heatmap.max` when
several heatmaps must share one scale.
:::
