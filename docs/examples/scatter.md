# Scatter

Each point is an `[x, y]` pair. When both positions matter, turn on the
x-gridlines too (`xAxis: { grid: true }` — the y-grid is already on by
default).

<ClientOnly>
  <DemoScatter />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'scatter',
  title: 'Deal size vs. sales cycle',
  subtitle: 'Closed-won deals, trailing 12 months',
  data: {
    series: [
      {
        id: 'new-business',
        name: 'New business',
        data: [
          [14, 18], [22, 25], [31, 34], [45, 41], [52, 46], [61, 58],
          [38, 39], [27, 30], [74, 66], [89, 74], [56, 52], [42, 47],
          [19, 24], [68, 61], [95, 82], [33, 31],
        ],
      },
      {
        id: 'expansion',
        name: 'Expansion',
        data: [
          [12, 9], [18, 14], [26, 17], [35, 22], [48, 28], [57, 31],
          [24, 16], [41, 25], [66, 35], [78, 41], [30, 19], [51, 27],
        ],
      },
    ],
  },
  xAxis: { label: 'Deal size (USD, thousands)', grid: true, min: 0 },
  yAxis: { label: 'Sales cycle (days)', min: 0 },
  a11y: {
    description:
      'Larger deals take longer to close; expansion deals close roughly twice as fast as new business at every deal size.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { ScatterChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Deal size vs. sales cycle',
  subtitle: 'Closed-won deals, trailing 12 months',
  data: {
    series: [
      {
        id: 'new-business',
        name: 'New business',
        data: [
          [14, 18], [22, 25], [31, 34], [45, 41], [52, 46], [61, 58],
          [38, 39], [27, 30], [74, 66], [89, 74], [56, 52], [42, 47],
          [19, 24], [68, 61], [95, 82], [33, 31],
        ],
      },
      {
        id: 'expansion',
        name: 'Expansion',
        data: [
          [12, 9], [18, 14], [26, 17], [35, 22], [48, 28], [57, 31],
          [24, 16], [41, 25], [66, 35], [78, 41], [30, 19], [51, 27],
        ],
      },
    ],
  },
  xAxis: { label: 'Deal size (USD, thousands)', grid: true, min: 0 },
  yAxis: { label: 'Sales cycle (days)', min: 0 },
  a11y: {
    description:
      'Larger deals take longer to close; expansion deals close roughly twice as fast as new business at every deal size.',
  },
};
</script>

<template>
  <ScatterChart :options="options" style="height: 340px" />
</template>
```

:::

Scatter tooltips are per-mark by default, and hit targets use nearest-point
matching within 24px — nobody has to land a pointer on an 8px dot. Very large
point clouds downsample automatically past 5,000 points per series; see the
[large-data showcase](large-data.md).
