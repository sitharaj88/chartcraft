# Pie & donut

Slices use the object data shape (`{ x: label, y: value }`) in a single
series. The legend automatically lists **slices** — label next to swatch, so
slice identity never relies on color alone — and slice items are not
click-toggleable.

<ClientOnly>
  <DemoPieDonut />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const pie = createChart(document.querySelector<HTMLElement>('#pie')!, {
  type: 'pie',
  title: 'Revenue by segment',
  subtitle: 'FY2025 share',
  data: {
    series: [
      {
        id: 'revenue-share',
        name: 'Revenue share',
        data: [
          { x: 'Enterprise', y: 46 },
          { x: 'Mid-market', y: 27 },
          { x: 'SMB', y: 18 },
          { x: 'Self-serve', y: 9 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Enterprise accounts for 46 percent of FY2025 revenue, mid-market 27, SMB 18, and self-serve 9.',
  },
});

const donut = createChart(document.querySelector<HTMLElement>('#donut')!, {
  type: 'donut',
  title: 'Cloud spend by service',
  subtitle: 'This month',
  data: {
    series: [
      {
        id: 'cloud-spend',
        name: 'Cloud spend',
        data: [
          { x: 'Compute', y: 41 },
          { x: 'Storage', y: 24 },
          { x: 'Networking', y: 17 },
          { x: 'Databases', y: 12 },
          { x: 'Other', y: 6 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Compute is the largest cloud cost at 41 percent this month; storage follows at 24 percent.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { PieChart, DonutChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const pie: TypedChartOptions = {
  title: 'Revenue by segment',
  subtitle: 'FY2025 share',
  data: {
    series: [
      {
        id: 'revenue-share',
        name: 'Revenue share',
        data: [
          { x: 'Enterprise', y: 46 },
          { x: 'Mid-market', y: 27 },
          { x: 'SMB', y: 18 },
          { x: 'Self-serve', y: 9 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Enterprise accounts for 46 percent of FY2025 revenue, mid-market 27, SMB 18, and self-serve 9.',
  },
};

const donut: TypedChartOptions = {
  title: 'Cloud spend by service',
  subtitle: 'This month',
  data: {
    series: [
      {
        id: 'cloud-spend',
        name: 'Cloud spend',
        data: [
          { x: 'Compute', y: 41 },
          { x: 'Storage', y: 24 },
          { x: 'Networking', y: 17 },
          { x: 'Databases', y: 12 },
          { x: 'Other', y: 6 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Compute is the largest cloud cost at 41 percent this month; storage follows at 24 percent.',
  },
};
</script>

<template>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
    <PieChart :options="pie" style="height: 340px" />
    <DonutChart :options="donut" style="height: 340px" />
  </div>
</template>
```

:::

Pie and donut charts ignore all cartesian options (`xAxis`, `yAxis`,
`stacked`, `horizontal`). Like every chart, they carry a screen-reader data
table and keyboard navigation by default — see
[Accessibility](../accessibility.md).
