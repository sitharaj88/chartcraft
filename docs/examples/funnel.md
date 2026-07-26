# Funnel

Ordered stage drop-off: one series of `{ x: stage, y: value }` points, drawn
as centered horizontal segments with widths proportional to value. Colors are
ordinal steps of the sequential ramp, and every segment carries its stage
label and value directly — so there is **no legend**. Use a funnel for a
strictly ordered process where each stage is a subset of the previous
(signup flows, sales pipelines). Don't use it for unordered categories or
when stages can *gain* members — that's a [bar chart](bar.md).

<ClientOnly>
  <DemoFunnel />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'funnel',
  title: 'Trial conversion funnel',
  subtitle: 'Last 90 days',
  data: {
    series: [
      {
        id: 'funnel',
        name: 'Prospects',
        data: [
          { x: 'Visited pricing', y: 48200 },
          { x: 'Started trial', y: 9600 },
          { x: 'Activated workspace', y: 5200 },
          { x: 'Subscribed', y: 1900 },
          { x: 'Expanded seats', y: 640 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Of 48,200 pricing-page visitors, 20 percent started a trial, 11 percent activated, 4 percent subscribed, and 1.3 percent expanded seats.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { FunnelChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Trial conversion funnel',
  subtitle: 'Last 90 days',
  data: {
    series: [
      {
        id: 'funnel',
        name: 'Prospects',
        data: [
          { x: 'Visited pricing', y: 48200 },
          { x: 'Started trial', y: 9600 },
          { x: 'Activated workspace', y: 5200 },
          { x: 'Subscribed', y: 1900 },
          { x: 'Expanded seats', y: 640 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Of 48,200 pricing-page visitors, 20 percent started a trial, 11 percent activated, 4 percent subscribed, and 1.3 percent expanded seats.',
  },
};
</script>

<template>
  <FunnelChart :options="options" style="height: 380px" />
</template>
```

:::

::: tip Ramp contrast
Stage colors are evenly spaced steps of the sequential ramp within a legal
span per scheme — in light mode starting at `#86b6ef` and darkening, in dark
mode starting at `#184f95` and lightening — so every step keeps ≥ 2:1
contrast against its surface. Keyboard navigation walks the stages in order.
:::
