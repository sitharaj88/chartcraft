# Lollipop

A bar chart on a diet: a 1px stem from the baseline and a terminal dot where the
bar's end would be. Same encoding, a fraction of the ink — which matters when
you have many thin categories and the bars would turn the plot into a solid
block.

**Use it** for ranked category comparisons with more than a handful of
categories, especially when the values are similar and the *positions* of the
ends are what the reader compares.

**Don't use it** when you need stacking or grouping — a stem cannot be stacked
(the type throws if you ask), and stems for grouped series read as a picket
fence. Don't use it for very few categories: with three bars, bars are better
(the area helps). And don't use it when the *magnitude* rather than the ranking
is the message — a dot de-emphasizes exactly the quantity a bar's area conveys.

<ClientOnly>
  <DemoLollipop />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'lollipop',
  title: 'Feature adoption, 90 days after launch',
  subtitle: 'Share of active workspaces that used the feature at least once',
  data: {
    categories: [
      'Saved views',
      'Bulk edit',
      'Slack alerts',
      'API tokens',
      'Audit log',
      'SSO',
      'Custom fields',
    ],
    series: [
      {
        id: 'adoption',
        name: 'Adoption',
        data: [68.4, 54.1, 47.9, 31.2, 22.5, 18.3, 12.7],
      },
    ],
  },
  yAxis: { label: 'Workspaces (%)', min: 0 },
  a11y: {
    description:
      'Saved views reached 68% of active workspaces in the first 90 days; custom fields, the least adopted feature, reached 13%.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { LollipopChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Feature adoption, 90 days after launch',
  subtitle: 'Share of active workspaces that used the feature at least once',
  data: {
    categories: [
      'Saved views',
      'Bulk edit',
      'Slack alerts',
      'API tokens',
      'Audit log',
      'SSO',
      'Custom fields',
    ],
    series: [
      {
        id: 'adoption',
        name: 'Adoption',
        data: [68.4, 54.1, 47.9, 31.2, 22.5, 18.3, 12.7],
      },
    ],
  },
  yAxis: { label: 'Workspaces (%)', min: 0 },
  a11y: {
    description:
      'Saved views reached 68% of active workspaces in the first 90 days; custom fields, the least adopted feature, reached 13%.',
  },
};
</script>

<template>
  <LollipopChart :options="options" style="height: 340px" />
</template>
```

:::

## Notes

- **`stacked: true` throws** — from `createChart` *and* from `update()` — with a
  message containing "does not support stacking". Stacking is unsupported by the
  contract, and silently ignoring the flag would produce a plausible-but-wrong
  chart.
- **Per-series `type` overrides (combo) are refused.** "Like a bar" is about
  layout; mixing bar or line marks into a lollipop root would give one chart two
  mark languages for one encoding.
- Everything else is the shared cartesian engine verbatim: band slots for
  multiple series, `horizontal: true`, the **full column band** as the hit
  target (you never have to hit the 1px stem), legend policy, data table and
  keyboard order.
- Dot radius is `clamp(slotWidth / 2, 5, 9)` px — never under the contract's
  10px diameter on a narrow band, never a blob on a wide one.
- `curve`, `lineWidth` and `showMarkers` are line/area options and are ignored
  here.
