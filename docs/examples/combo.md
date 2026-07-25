# Combo

Per-series mark mixing on one cartesian chart: give any series its own
`type` (`'line' | 'bar' | 'area' | 'scatter'`) on a chart whose root type is
one of those four. The classic use is actual-vs-target — bars for the
measured value, a line for the reference. All series share **one y-axis**
(the one-axis rule is non-negotiable — ChartCraft will never grow a dual
axis), so only mix series measured in the *same unit*. If your two measures
have different scales, use two charts or index both to a common base.

<ClientOnly>
  <DemoCombo />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'bar', // root type: the default mark for series without a `type`
  title: 'Revenue vs. target',
  subtitle: 'FY2026 by month ($k)',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
    series: [
      {
        id: 'actual',
        name: 'Actual',
        data: [96, 101, 99, 108, 113, 111, 119, 128],
      },
      {
        id: 'target',
        name: 'Target',
        type: 'line', // per-series override — same y-axis, same unit
        data: [100, 102, 105, 107, 110, 113, 116, 120],
      },
    ],
  },
  yAxis: { label: 'Revenue ($k)', min: 0 },
  a11y: {
    description:
      'Monthly revenue tracked slightly below target through March, then beat it from April on, ending August at 128 thousand against a 120 thousand target.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { BarChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Revenue vs. target',
  subtitle: 'FY2026 by month ($k)',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
    series: [
      {
        id: 'actual',
        name: 'Actual',
        data: [96, 101, 99, 108, 113, 111, 119, 128],
      },
      {
        id: 'target',
        name: 'Target',
        type: 'line', // per-series override — same y-axis, same unit
        data: [100, 102, 105, 107, 110, 113, 116, 120],
      },
    ],
  },
  yAxis: { label: 'Revenue ($k)', min: 0 },
  a11y: {
    description:
      'Monthly revenue tracked slightly below target through March, then beat it from April on, ending August at 128 thousand against a 120 thousand target.',
  },
};
</script>

<template>
  <BarChart :options="options" style="height: 360px" />
</template>
```

:::

::: tip Combo rules
- Overrides work on charts whose **root type** is `line`, `area`, `bar`, or
  `scatter` — the root type is the default for series without a `type`.
- Mixing is **vertical-only**: with `horizontal: true` (bar root), per-series
  `type` overrides are ignored and every series renders as the root kind.
- Each series keeps its palette slot by identity, exactly as on
  single-mark charts.
:::
