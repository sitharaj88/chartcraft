# Slope

Two (or more) ordered stages, one straight line per series, labeled directly at
both ends. A slope chart answers one question extremely well: **who moved, and
did anyone change places?**

**Use it** for before/after comparisons across a handful of series where rank
changes matter — market share shifts, channel mix, survey scores between two
waves, budget allocation year over year.

**Don't use it** with many series: above roughly eight lines the crossings turn
into a hairball and the direct labels stop fitting (at which point they are
dropped wholesale — see the notes). Don't use it for a dense time series; that
is a line chart. And don't reach for it when only the totals changed and no one
swapped places — two bars say that more plainly.

<ClientOnly>
  <DemoSlope />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'slope',
  title: 'Share of new signups by acquisition channel',
  subtitle: '2023 → 2025 (%)',
  data: {
    categories: ['2023', '2025'],
    series: [
      { id: 'organic', name: 'Organic search', data: [31, 24] },
      { id: 'partner', name: 'Partners', data: [12, 26] },
      { id: 'paid', name: 'Paid social', data: [24, 15] },
      { id: 'referral', name: 'Referrals', data: [18, 22] },
      { id: 'events', name: 'Events', data: [15, 13] },
    ],
  },
  yAxis: { label: 'Share of signups (%)', min: 0 },
  a11y: {
    description:
      'Partners more than doubled their share of new signups between 2023 and 2025 (12% to 26%), overtaking organic search, which fell from 31% to 24%. Paid social dropped from 24% to 15%.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { SlopeChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Share of new signups by acquisition channel',
  subtitle: '2023 → 2025 (%)',
  data: {
    categories: ['2023', '2025'],
    series: [
      { id: 'organic', name: 'Organic search', data: [31, 24] },
      { id: 'partner', name: 'Partners', data: [12, 26] },
      { id: 'paid', name: 'Paid social', data: [24, 15] },
      { id: 'referral', name: 'Referrals', data: [18, 22] },
      { id: 'events', name: 'Events', data: [15, 13] },
    ],
  },
  yAxis: { label: 'Share of signups (%)', min: 0 },
  a11y: {
    description:
      'Partners more than doubled their share of new signups between 2023 and 2025 (12% to 26%), overtaking organic search, which fell from 31% to 24%. Paid social dropped from 24% to 15%.',
  },
};
</script>

<template>
  <SlopeChart :options="options" style="height: 360px" />
</template>
```

:::

## Notes

- **Direct labels are all-or-nothing.** Every visible series' name must fit in
  the gutter outside the first and last stage columns, and no two labels at the
  same end may sit closer than one line height. If that fails, **no** labels are
  drawn and the legend appears instead — a half-labeled end reads worse than a
  legend.
- Because that decision needs the measured plot rect, it is taken after layout.
  A responsive container sitting exactly on the threshold could in principle
  flip between "labels" and "legend" as it resizes. An explicit `legend: true`
  shows both the legend and the labels.
- **A per-series `curve` is deliberately ignored.** The contract requires rank
  changes to read true, and a smoothed slope chart invents crossings that are not
  in the data.
- More than two stages are allowed (`categories` is "2+ ordered stages"); each
  stage is a column and lines are straight between columns.
- One point per stage per series, colored by series identity, with ≥ 8px endpoint
  dots.
