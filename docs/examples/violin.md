# Violin

A kernel-density estimate mirrored around each category, with the box plot drawn
inside it. Where a box plot gives you five numbers, a violin shows the whole
shape — bimodality, skew, a cluster hiding inside the interquartile range.

**Use it** when the *distribution* is the point and you have enough samples per
category (say 30+): latency and load-time distributions, test scores, price
dispersion, A/B outcome spreads.

**Don't use it** with small samples — a KDE over eight points draws a smooth
curve that implies knowledge you do not have; use a box plot or a strip plot.
Don't use it for a lay audience that has never met one (a box plot annotated in
words travels further). And remember the density's *height* is not a count: each
violin is normalized to its own peak, so a wide violin does not mean more data.

<ClientOnly>
  <DemoViolin />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';
import type { DataValue } from '@chartcraft/core';

// A violin category is a RAW number[] of samples. The `DataValue` union names
// only the 2/3/5-element tuple shapes, so a longer sample array is asserted
// once here (the runtime accepts any numeric array).
const sample = (values: number[]): DataValue => values as unknown as DataValue;

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'violin',
  title: 'Page load time by device class',
  subtitle: 'Largest contentful paint, real-user samples (ms)',
  violin: { bandwidth: 'auto', showBox: true },
  data: {
    categories: ['Desktop', 'Tablet', 'Phone (high-end)', 'Phone (low-end)'],
    series: [
      {
        id: 'lcp',
        name: 'LCP',
        data: [
          sample([
            740, 780, 810, 830, 860, 880, 890, 910, 920, 940, 960, 980, 1010, 1040, 1080, 1120,
            1180, 1260, 1390, 1620,
          ]),
          sample([
            980, 1040, 1080, 1120, 1160, 1200, 1240, 1280, 1320, 1360, 1420, 1480, 1560, 1660,
            1780, 1940, 2160, 2480,
          ]),
          sample([
            1120, 1180, 1240, 1290, 1340, 1380, 1420, 1470, 1520, 1580, 1650, 1740, 1860, 2020,
            2240, 2560, 2980,
          ]),
          sample([
            1980, 2140, 2280, 2410, 2530, 2660, 2790, 2930, 3080, 3260, 3480, 3760, 4120, 4580,
            5180, 5960, 6840,
          ]),
        ],
      },
    ],
  },
  yAxis: { label: 'LCP (ms)', min: 0 },
  a11y: {
    description:
      'Desktop load times cluster tightly around 940 ms. Each step down in device class widens the distribution as well as shifting it: low-end phones have a median near 3,080 ms and a long tail past 6,800 ms.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { ViolinChart } from '@chartcraft/vue';
import type { DataValue, TypedChartOptions } from '@chartcraft/vue';

const sample = (values: number[]): DataValue => values as unknown as DataValue;

const options: TypedChartOptions = {
  title: 'Page load time by device class',
  subtitle: 'Largest contentful paint, real-user samples (ms)',
  violin: { bandwidth: 'auto', showBox: true },
  data: {
    categories: ['Desktop', 'Tablet', 'Phone (high-end)', 'Phone (low-end)'],
    series: [
      {
        id: 'lcp',
        name: 'LCP',
        data: [
          sample([
            740, 780, 810, 830, 860, 880, 890, 910, 920, 940, 960, 980, 1010, 1040, 1080, 1120,
            1180, 1260, 1390, 1620,
          ]),
          sample([
            980, 1040, 1080, 1120, 1160, 1200, 1240, 1280, 1320, 1360, 1420, 1480, 1560, 1660,
            1780, 1940, 2160, 2480,
          ]),
          sample([
            1120, 1180, 1240, 1290, 1340, 1380, 1420, 1470, 1520, 1580, 1650, 1740, 1860, 2020,
            2240, 2560, 2980,
          ]),
          sample([
            1980, 2140, 2280, 2410, 2530, 2660, 2790, 2930, 3080, 3260, 3480, 3760, 4120, 4580,
            5180, 5960, 6840,
          ]),
        ],
      },
    ],
  },
  yAxis: { label: 'LCP (ms)', min: 0 },
  a11y: {
    description:
      'Desktop load times cluster tightly around 940 ms. Each step down in device class widens the distribution as well as shifting it: low-end phones have a median near 3,080 ms and a long tail past 6,800 ms.',
  },
};
</script>

<template>
  <ViolinChart :options="options" style="height: 380px" />
</template>
```

:::

## Notes

- **Raw samples are read from your RAW data**, and any numeric-array entry (any
  length) is treated as a sample — the same rule as the boxplot. The `DataValue`
  union only names the 2/3/5-element tuple shapes, so TypeScript needs the one
  assertion shown above for longer arrays.
- **Bands are addressed positionally:** `data[i]` is the sample for
  `categories[i]`. A folded sample array would otherwise produce a meaningless
  `x`, so the type never consults it — which is also why the tooltip header, the
  table and keyboard navigation all agree.
- **Each violin is normalized to its OWN peak density** (seaborn's
  `scale="width"`), so widths compare *shapes*, not sample sizes. `n` travels in
  the tooltip, the announcement and the table.
- **The density is trimmed** to each sample's own `[min, max]` — 64 evaluation
  points across that range — so the shape never claims support the data does not
  have, and the value axis matches the box whiskers.
- **Bandwidth:** `'auto'` is Silverman's rule
  (`0.9 · min(sd, IQR/1.34) · n^(-1/5)`, sample sd and R-7 quartiles). When it
  collapses to 0 (n < 2 or zero spread) no density is drawn and the inner box
  carries the category. An explicit non-positive `violin.bandwidth` is rejected.
- **The inner box** is `theme.neutral` with a surface-colored median dot, so it
  never impersonates a series slot on top of the 0.35-alpha fill. Outliers are
  not re-drawn as dots — the KDE tails already show them. The table is the
  five-number summary plus `n`.
