# Waterfall

How a value got from A to B: a single series of **deltas**, with
`isTotal: true` points as absolute totals that rise from the baseline and
reset the running sum. Increases wear `theme.up`, decreases `theme.down`,
totals `theme.neutral`, and hairline connectors link consecutive bars. Use a
waterfall to explain a change (profit bridge, headcount walk, cash flow).
Don't use it to compare independent categories — that's a
[bar chart](bar.md); a waterfall's bars only make sense read in order.

<ClientOnly>
  <DemoWaterfall />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'waterfall',
  title: 'Operating profit bridge',
  subtitle: 'FY2025 → FY2026 ($M)',
  // waterfall: { connectors: true } is the default
  data: {
    series: [
      {
        id: 'bridge',
        name: 'Operating profit',
        data: [
          { x: 'FY2025', y: 8.4, isTotal: true },
          { x: 'Product revenue', y: 2.1 },
          { x: 'Services revenue', y: 0.6 },
          { x: 'COGS', y: -1.3 },
          { x: 'Operating expenses', y: -0.9 },
          { x: 'FX impact', y: -0.2 },
          { x: 'FY2026', y: 8.7, isTotal: true },
        ],
      },
    ],
  },
  yAxis: { label: '$M', min: 0 },
  a11y: {
    description:
      'Operating profit grew from 8.4 to 8.7 million dollars: revenue added 2.7 million, offset by 2.4 million of higher costs and FX.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { WaterfallChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Operating profit bridge',
  subtitle: 'FY2025 → FY2026 ($M)',
  // waterfall: { connectors: true } is the default
  data: {
    series: [
      {
        id: 'bridge',
        name: 'Operating profit',
        data: [
          { x: 'FY2025', y: 8.4, isTotal: true },
          { x: 'Product revenue', y: 2.1 },
          { x: 'Services revenue', y: 0.6 },
          { x: 'COGS', y: -1.3 },
          { x: 'Operating expenses', y: -0.9 },
          { x: 'FX impact', y: -0.2 },
          { x: 'FY2026', y: 8.7, isTotal: true },
        ],
      },
    ],
  },
  yAxis: { label: '$M', min: 0 },
  a11y: {
    description:
      'Operating profit grew from 8.4 to 8.7 million dollars: revenue added 2.7 million, offset by 2.4 million of higher costs and FX.',
  },
};
</script>

<template>
  <WaterfallChart :options="options" style="height: 360px" />
</template>
```

:::

::: tip Waterfall specifics
A waterfall is **single-series** — if more series are supplied, only the
first visible one renders. An `isTotal` bar resets the running total to its
absolute value (use it for the start, the end, and any subtotal checkpoints);
zero deltas render as hairline-height neutral bars. Set
`waterfall: { connectors: false }` to drop the hairline connectors.
:::
