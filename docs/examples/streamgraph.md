# Streamgraph

A stacked area chart on a **wiggle-minimizing baseline**: instead of stacking up
from zero, the bands are offset "inside-out" so each ribbon stays as flat as
possible. The result reads composition-over-time as a flow, and it is markedly
easier to follow one band across a busy chart than in a zero-baseline stack.

**Use it** for many categories over many time steps where the *shape of the mix*
is the message: traffic sources, genre popularity, support channels, energy
generation mix.

**Don't use it** when readers must read values off the y-axis — the baseline is
meaningless, so the axis is suppressed entirely and every value has to come from
the tooltip or the table. Don't use it for few series (three bands: use a
stacked area, where the baseline still means zero) or for data with negatives or
gaps in the middle of the stack. And never use it when the total matters as much
as the mix: a stacked area with a real zero baseline shows both.

<ClientOnly>
  <DemoStreamgraph />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'streamgraph',
  title: 'Support volume by channel',
  subtitle: 'Conversations per week, rolling 12 months',
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      { id: 'email', name: 'Email', data: [820, 790, 810, 760, 700, 640, 610, 590, 620, 660, 690, 710] },
      { id: 'chat', name: 'Live chat', data: [310, 360, 420, 500, 580, 640, 700, 760, 810, 880, 940, 1010] },
      { id: 'phone', name: 'Phone', data: [240, 235, 250, 230, 220, 205, 190, 185, 195, 210, 225, 240] },
      { id: 'community', name: 'Community', data: [90, 120, 160, 190, 230, 280, 340, 380, 410, 430, 460, 500] },
      { id: 'social', name: 'Social', data: [60, 70, 95, 130, 180, 210, 190, 160, 140, 130, 120, 115] },
    ],
  },
  a11y: {
    description:
      'Total support volume grew from about 1,520 conversations per week to 2,575. Live chat and community drove all of the growth; email and phone volumes declined slowly.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { StreamgraphChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'Support volume by channel',
  subtitle: 'Conversations per week, rolling 12 months',
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      { id: 'email', name: 'Email', data: [820, 790, 810, 760, 700, 640, 610, 590, 620, 660, 690, 710] },
      { id: 'chat', name: 'Live chat', data: [310, 360, 420, 500, 580, 640, 700, 760, 810, 880, 940, 1010] },
      { id: 'phone', name: 'Phone', data: [240, 235, 250, 230, 220, 205, 190, 185, 195, 210, 225, 240] },
      { id: 'community', name: 'Community', data: [90, 120, 160, 190, 230, 280, 340, 380, 410, 430, 460, 500] },
      { id: 'social', name: 'Social', data: [60, 70, 95, 130, 180, 210, 190, 160, 140, 130, 120, 115] },
    ],
  },
  a11y: {
    description:
      'Total support volume grew from about 1,520 conversations per week to 2,575. Live chat and community drove all of the growth; email and phone volumes declined slowly.',
  },
};
</script>

<template>
  <StreamgraphChart :options="options" style="height: 360px" />
</template>
```

:::

## Notes

- **The value axis is gone, on purpose.** No tick labels, no axis line, no
  gridlines — and no left margin reserved for labels that are not drawn, so the
  plot starts at `padding.left` and stays stable as the data changes. Values live
  in the tooltip and the data table.
- **The a11y table gains a `Total` column**, and the tooltip reads
  `value of total`: once the baseline is meaningless, the stack total is the only
  vertically readable quantity. `exportData()` carries the same columns.
- **Ribbon order is computed, but color is not.** Bands are ordered inside-out
  (by peak position, then greedily filled to the smaller side); **color still
  follows series identity** and the legend stays in input order, so toggling or
  reordering never repaints a band.
- **`stacked` is irrelevant here** — the type computes its own baseline and
  value mapping and always fills the plot exactly. Downsampling is disabled for
  the same reason it is for stacked areas: LTTB would pick different indices per
  series and break the index-aligned stack.
- Columns are point **indices**, and a `null` contributes 0 thickness (a stacked
  baseline is otherwise undefined). Nulls still show as an em dash in the table.
- **`curve` is ignored** — only straight edges are drawn, so a ribbon's
  thickness is exactly its value everywhere.
