# Radar

Multivariate comparison over shared axes: `categories` become 3–12 spokes,
each series draws a 2px outline with a light fill over a recessive polar
grid. Use a radar to compare a small number of profiles across the same
non-negative dimensions — evaluations, skill matrices, benchmark suites.
Don't use it for time series or precise value reading (polar areas distort;
a [bar chart](bar.md) or small multiples read more accurately), for
mixed-unit axes, or for many series (2–3 outlines is the practical limit).

<ClientOnly>
  <DemoRadar />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'radar',
  title: 'Vendor evaluation',
  subtitle: 'Weighted scores, 0–10',
  data: {
    categories: ['Performance', 'Security', 'Support', 'Documentation', 'Pricing', 'Ecosystem'],
    series: [
      { id: 'vendor-a', name: 'Vendor A', data: [8.4, 7.2, 6.1, 8.8, 5.6, 7.9] },
      { id: 'vendor-b', name: 'Vendor B', data: [6.9, 8.6, 8.2, 6.4, 7.8, 5.7] },
    ],
  },
  a11y: {
    description:
      'Vendor A leads on performance and documentation; Vendor B leads on security, support, and pricing. Ecosystem favors A, 7.9 to 5.7.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { RadarChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Vendor evaluation',
  subtitle: 'Weighted scores, 0–10',
  data: {
    categories: ['Performance', 'Security', 'Support', 'Documentation', 'Pricing', 'Ecosystem'],
    series: [
      { id: 'vendor-a', name: 'Vendor A', data: [8.4, 7.2, 6.1, 8.8, 5.6, 7.9] },
      { id: 'vendor-b', name: 'Vendor B', data: [6.9, 8.6, 8.2, 6.4, 7.8, 5.7] },
    ],
  },
  a11y: {
    description:
      'Vendor A leads on performance and documentation; Vendor B leads on security, support, and pricing. Ecosystem favors A, 7.9 to 5.7.',
  },
};
</script>

<template>
  <RadarChart :options="options" style="height: 400px" />
</template>
```

:::

Series values must be **≥ 0** (spokes radiate from zero). Vertex markers
(≥ 8px) appear on hover and keyboard focus; the legend toggles series as on
any cartesian chart.
