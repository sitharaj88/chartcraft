# Histogram

The distribution of one numeric variable: pass **raw samples** (`number[]`)
and the chart bins them itself. Use a histogram to see shape — skew, spread,
modes, tails — in a single measurement. Don't use it for comparison across
categories (that's a [boxplot](boxplot.md)) or for data that is already
aggregated into named buckets (that's a [bar chart](bar.md)).

<ClientOnly>
  <DemoHistogram />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

// Deterministic pseudo-normal samples: checkout durations in seconds.
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const samples = Array.from({ length: 420 }, () => {
  const base = 34 + (rnd() + rnd() + rnd() + rnd() - 2) * 26; // bell around ~34s
  const tail = rnd() < 0.07 ? rnd() * 70 : 0; // a slow-checkout tail
  return Math.round(Math.max(4, base + tail) * 10) / 10;
});

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'histogram',
  title: 'Checkout duration',
  subtitle: '420 orders, last 7 days',
  histogram: { bins: 'auto' }, // Freedman–Diaconis, clamped 5..60 (the default)
  data: {
    series: [{ id: 'checkout', name: 'Orders', data: samples }],
  },
  xAxis: { label: 'Duration (seconds)' },
  yAxis: { label: 'Orders' },
  a11y: {
    description:
      'Checkout durations cluster around 30 to 40 seconds, with a small tail of slow checkouts beyond 80 seconds.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { HistogramChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

// Deterministic pseudo-normal samples: checkout durations in seconds.
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const samples = Array.from({ length: 420 }, () => {
  const base = 34 + (rnd() + rnd() + rnd() + rnd() - 2) * 26; // bell around ~34s
  const tail = rnd() < 0.07 ? rnd() * 70 : 0; // a slow-checkout tail
  return Math.round(Math.max(4, base + tail) * 10) / 10;
});

const options: ChartSpec = {
  title: 'Checkout duration',
  subtitle: '420 orders, last 7 days',
  histogram: { bins: 'auto' }, // Freedman–Diaconis, clamped 5..60 (the default)
  data: {
    series: [{ id: 'checkout', name: 'Orders', data: samples }],
  },
  xAxis: { label: 'Duration (seconds)' },
  yAxis: { label: 'Orders' },
  a11y: {
    description:
      'Checkout durations cluster around 30 to 40 seconds, with a small tail of slow checkouts beyond 80 seconds.',
  },
};
</script>

<template>
  <HistogramChart :options="options" style="height: 360px" />
</template>
```

:::

::: tip Binning behavior
With `bins: 'auto'` the Freedman–Diaconis width is snapped **up** to a nice
1/2/5 width and the first edge aligned to a multiple of it — so for ≤ 12 bins
the axis ticks land exactly on every bin edge. An explicit numeric `bins`
splits the raw data extent equally instead; its edges are generally not nice
numbers, so ticks stay at the axis's own nice values. Multiple series overlay
translucently (alpha 0.7). The tooltip and data table always carry the bin
range and count; `pointenter`/`pointclick` events use the **bin index** as
`dataIndex`.
:::
