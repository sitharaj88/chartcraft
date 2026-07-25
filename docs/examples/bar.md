# Bar

## Grouped bars

Multiple series against shared categories render as grouped bars. Bar charts
default to a per-mark tooltip; this one opts into `tooltip: { shared: true }`
because readers compare the three series within a quarter.

<ClientOnly>
  <DemoBarGrouped />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'bar',
  title: 'Revenue by quarter',
  subtitle: 'FY2025, USD millions',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { id: 'product', name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { id: 'services', name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
      { id: 'licensing', name: 'Licensing', data: [2.8, 3.0, 3.1, 3.6] },
    ],
  },
  yAxis: { label: 'USD (millions)' },
  tooltip: { shared: true },
  a11y: {
    description:
      'All three revenue lines grew each quarter of FY2025; product revenue led, ending at 16.2 million USD in Q4.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { BarChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Revenue by quarter',
  subtitle: 'FY2025, USD millions',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { id: 'product', name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { id: 'services', name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
      { id: 'licensing', name: 'Licensing', data: [2.8, 3.0, 3.1, 3.6] },
    ],
  },
  yAxis: { label: 'USD (millions)' },
  tooltip: { shared: true },
  a11y: {
    description:
      'All three revenue lines grew each quarter of FY2025; product revenue led, ending at 16.2 million USD in Q4.',
  },
};
</script>

<template>
  <BarChart :options="options" style="height: 340px" />
</template>
```

:::

## Horizontal bars

`horizontal: true` puts categories on the y-axis — the right form for long
category labels. With a single series the legend hides automatically; the
title names the measure.

<ClientOnly>
  <DemoBarHorizontal />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'bar',
  horizontal: true,
  title: 'Support tickets by category',
  subtitle: 'Open tickets, this week',
  data: {
    categories: [
      'Billing & invoicing',
      'Account access',
      'API & integrations',
      'Performance',
      'Feature requests',
      'Other',
    ],
    series: [{ id: 'tickets', name: 'Open tickets', data: [64, 51, 43, 28, 19, 12] }],
  },
  xAxis: { label: 'Tickets' },
  a11y: {
    description:
      'Billing and invoicing leads open support tickets this week with 64, followed by account access with 51.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { BarChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  horizontal: true,
  title: 'Support tickets by category',
  subtitle: 'Open tickets, this week',
  data: {
    categories: [
      'Billing & invoicing',
      'Account access',
      'API & integrations',
      'Performance',
      'Feature requests',
      'Other',
    ],
    series: [{ id: 'tickets', name: 'Open tickets', data: [64, 51, 43, 28, 19, 12] }],
  },
  xAxis: { label: 'Tickets' },
  a11y: {
    description:
      'Billing and invoicing leads open support tickets this week with 64, followed by account access with 51.',
  },
};
</script>

<template>
  <BarChart :options="options" style="height: 340px" />
</template>
```

:::

Bar baselines anchor at 0 when the data is non-negative — truncating a bar
axis misrepresents magnitude, so a truncated `min` must always be explicit
([Scales and axes](../concepts/scales-and-axes.md#min-max-and-the-auto-domain)).
