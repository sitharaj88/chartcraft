# Bubble

A scatter plot with a third, quantitative dimension: `r` maps to marker
**area** (never radius) through `sizeRange` — the min/max marker *diameter*
in px. Use a bubble chart when all three values are quantitative and the
third is a magnitude (reach, population, spend). Don't use it when the third
dimension is categorical (use color/series instead) or when precise
comparison of the third value matters — area is read approximately; put the
exact value in the tooltip, where ChartCraft shows x, y, and r.

<ClientOnly>
  <DemoBubble />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'bubble',
  title: 'Campaign efficiency',
  subtitle: 'Monthly spend vs. qualified leads — bubble area = audience reach (thousands)',
  data: {
    series: [
      {
        id: 'paid',
        name: 'Paid channels',
        sizeRange: [10, 44], // min/max marker DIAMETER px; default [8, 40]
        data: [
          { x: 18, y: 240, r: 320, label: 'Search ads' },
          { x: 26, y: 310, r: 480, label: 'Social ads' },
          { x: 9, y: 90, r: 150, label: 'Display' },
          { x: 14, y: 150, r: 610, label: 'Video' },
        ],
      },
      {
        id: 'owned',
        name: 'Owned channels',
        sizeRange: [10, 44],
        data: [
          { x: 6, y: 180, r: 260, label: 'Newsletter' },
          { x: 11, y: 260, r: 140, label: 'Webinars' },
          { x: 4, y: 120, r: 90, label: 'Community' },
          { x: 8, y: 95, r: 400, label: 'Blog / SEO' },
        ],
      },
    ],
  },
  xAxis: { label: 'Monthly spend ($k)', min: 0 },
  yAxis: { label: 'Qualified leads', min: 0 },
  a11y: {
    description:
      'Owned channels produce leads at lower spend than paid channels; social ads have the highest spend and lead count, while video reaches the largest audience.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { BubbleChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Campaign efficiency',
  subtitle: 'Monthly spend vs. qualified leads — bubble area = audience reach (thousands)',
  data: {
    series: [
      {
        id: 'paid',
        name: 'Paid channels',
        sizeRange: [10, 44], // min/max marker DIAMETER px; default [8, 40]
        data: [
          { x: 18, y: 240, r: 320, label: 'Search ads' },
          { x: 26, y: 310, r: 480, label: 'Social ads' },
          { x: 9, y: 90, r: 150, label: 'Display' },
          { x: 14, y: 150, r: 610, label: 'Video' },
        ],
      },
      {
        id: 'owned',
        name: 'Owned channels',
        sizeRange: [10, 44],
        data: [
          { x: 6, y: 180, r: 260, label: 'Newsletter' },
          { x: 11, y: 260, r: 140, label: 'Webinars' },
          { x: 4, y: 120, r: 90, label: 'Community' },
          { x: 8, y: 95, r: 400, label: 'Blog / SEO' },
        ],
      },
    ],
  },
  xAxis: { label: 'Monthly spend ($k)', min: 0 },
  yAxis: { label: 'Qualified leads', min: 0 },
  a11y: {
    description:
      'Owned channels produce leads at lower spend than paid channels; social ads have the highest spend and lead count, while video reaches the largest audience.',
  },
};
</script>

<template>
  <BubbleChart :options="options" style="height: 380px" />
</template>
```

:::

Points also accept `[x, y, r]` tuples when you don't need per-point labels.
Because `r` maps to area, a value twice as large reads as a bubble of twice
the *area* — the perceptually honest encoding.
