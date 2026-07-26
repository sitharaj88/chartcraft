# Sparkline

A chrome-free line for inline and stat-tile use: no axes, grid, legend, or
title padding — the chart fills its container (typical inline heights are
24–48px). Use sparklines to show *shape* next to a headline number: the tile
text carries the value, the sparkline carries the trend. Don't use one when
values must be read off the chart (no axes means no reading) — that's a
[line chart](line.md).

<ClientOnly>
  <DemoSparklineRow />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

// One tile's sparkline — the container is the ~48px-tall tile slot.
const chart = createChart(document.querySelector<HTMLElement>('#spark-revenue')!, {
  type: 'sparkline',
  data: {
    series: [
      {
        id: 'revenue',
        name: 'Monthly revenue',
        data: [96, 101, 99, 104, 108, 113, 111, 117, 119, 124, 122, 128],
      },
    ],
  },
  a11y: {
    title: 'Monthly revenue',
    description: 'Revenue rose from 96 to 128 thousand dollars over twelve months.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { SparklineChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  data: {
    series: [
      {
        id: 'revenue',
        name: 'Monthly revenue',
        data: [96, 101, 99, 104, 108, 113, 111, 117, 119, 124, 122, 128],
      },
    ],
  },
  a11y: {
    title: 'Monthly revenue',
    description: 'Revenue rose from 96 to 128 thousand dollars over twelve months.',
  },
};
</script>

<template>
  <div class="stat-tile">
    <span class="stat-tile__label">Monthly revenue</span>
    <span class="stat-tile__value">$128.4k</span>
    <SparklineChart :options="options" style="height: 48px" />
  </div>
</template>
```

:::

::: tip Sparkline is a preset of defaults
The tooltip and legend default **off** but an explicit `tooltip: true` /
`legend: true` is honored. `title`/`subtitle` are never rendered (there is no
chrome area for them) — set `a11y.title` for the accessible name, as above.
Keyboard navigation and the screen-reader data table stay fully on, so a
sparkline is as accessible as any other ChartCraft chart.
:::
