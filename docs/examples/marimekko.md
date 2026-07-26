# Marimekko

Also called a mosaic or Mekko chart: 100%-stacked columns whose **widths vary**.
Column width encodes the column's share of the grand total, segment height its
share within that column — two proportions in one picture, which is exactly what
a market-structure question asks for.

**Use it** for market sizing and portfolio mix: "which segments are big, and
what do they buy?" Revenue by segment × product, spend by region × channel,
installed base by industry × tier.

**Don't use it** if either dimension has more than about five members — the
narrow columns become unreadable slivers and the labels stop fitting. Don't use
it when readers need to compare *segments across columns*: unequal widths make
that comparison genuinely hard (two segments of equal area can have very
different values). And never use it for time series; columns are categories, not
steps.

<ClientOnly>
  <DemoMarimekko />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'marimekko',
  title: 'Revenue mix by customer segment',
  subtitle: 'Column width = share of total revenue · segment height = product mix',
  data: {
    categories: ['SMB', 'Mid-market', 'Enterprise', 'Public sector'],
    series: [
      {
        id: 'platform',
        name: 'Platform',
        // `r` on the FIRST series carries each column's width measure
        // (total revenue for that segment, $M).
        data: [
          { y: 8.2, r: 14.6 },
          { y: 15.4, r: 31.2 },
          { y: 26.1, r: 62.8 },
          { y: 5.3, r: 11.4 },
        ],
      },
      { id: 'analytics', name: 'Analytics add-on', data: [3.1, 8.9, 21.4, 2.6] },
      { id: 'services', name: 'Services', data: [1.4, 4.2, 12.7, 2.9] },
      { id: 'support', name: 'Premium support', data: [1.9, 2.7, 2.6, 0.6] },
    ],
  },
  a11y: {
    description:
      'Enterprise is 52% of total revenue and leans hardest on add-ons: analytics is a third of its mix. SMB is only 12% of revenue and is almost all platform subscription.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { MarimekkoChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Revenue mix by customer segment',
  subtitle: 'Column width = share of total revenue · segment height = product mix',
  data: {
    categories: ['SMB', 'Mid-market', 'Enterprise', 'Public sector'],
    series: [
      {
        id: 'platform',
        name: 'Platform',
        data: [
          { y: 8.2, r: 14.6 },
          { y: 15.4, r: 31.2 },
          { y: 26.1, r: 62.8 },
          { y: 5.3, r: 11.4 },
        ],
      },
      { id: 'analytics', name: 'Analytics add-on', data: [3.1, 8.9, 21.4, 2.6] },
      { id: 'services', name: 'Services', data: [1.4, 4.2, 12.7, 2.9] },
      { id: 'support', name: 'Premium support', data: [1.9, 2.7, 2.6, 0.6] },
    ],
  },
  a11y: {
    description:
      'Enterprise is 52% of total revenue and leans hardest on add-ons: analytics is a third of its mix. SMB is only 12% of revenue and is almost all platform subscription.',
  },
};
</script>

<template>
  <MarimekkoChart :options="options" style="height: 380px" />
</template>
```

:::

## Notes

- **Column widths come from `r` on the first series' points**, index-aligned to
  the columns. That is the one mechanism (`r` is already a declared `DataPoint`
  field carried losslessly through normalization, so no extra option is needed).
  It is used only when **every** column has a positive finite `r`; otherwise each
  column falls back to its own **total**, which is the contract's default rule.
- The width measure is read from the first series **even if that series is
  legend-hidden** — a width is an independent measure, not part of the stack.
  (Under the `total` fallback, hiding a series legitimately changes the widths.)
- **Both dimensions travel with every readout.** The tooltip reads
  `Column — 75% of total width` / `value (25% of column)`, and the table is
  `Column | Width share | <series…>` with `value (share)` cells — which is
  exactly what `exportData()` emits.
- The percentage scale (0/25/50/75/100%) is drawn as **labels only**. Gridlines
  across contiguous segments would be chart junk.
- 2px surface gaps in both directions are subtracted from the available space
  (not inset into the marks), so column widths and segment heights still sum to
  the plot rect exactly.
