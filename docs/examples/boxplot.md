# Boxplot

Distribution **comparison** across categories: box from q1 to q3, a median
line, whiskers, and outlier dots. Use a boxplot when you need to compare
spread and center across groups at a glance. Don't use it for a single
distribution (a [histogram](histogram.md) shows shape better — a boxplot
hides bimodality) or for tiny samples where the five-number summary is
mostly noise.

You can pass either **raw samples** (`number[]` per category — the chart
computes R-7 quartiles, 1.5×IQR whiskers, and draws values beyond them as
outlier dots) or a precomputed 5-number object
(`{ min, q1, median, q3, max, outliers? }`).

<ClientOnly>
  <DemoBoxplot />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

// One raw-sample array per category (the chart summarizes them itself).
const samples = [
  [118, 124, 131, 137, 141, 146, 152, 158, 166, 171, 183, 197, 340], // US-East
  [141, 149, 155, 162, 168, 174, 179, 186, 194, 205, 219, 238], // EU-West
  [173, 181, 190, 198, 207, 214, 226, 238, 251, 267, 290, 452], // AP-South
  [201, 213, 224, 236, 247, 259, 270, 284, 301, 322, 348], // SA-East
];

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'boxplot',
  title: 'API response time by region',
  subtitle: 'p50 request latency samples, last 24 h (ms)',
  data: {
    categories: ['US-East', 'EU-West', 'AP-South', 'SA-East'],
    series: [
      {
        id: 'latency',
        name: 'Response time',
        // No cast needed: the DataValue union names the per-category
        // sample list, so a number[][] assigns directly.
        data: samples,
      },
    ],
  },
  yAxis: { label: 'Latency (ms)', min: 0 },
  a11y: {
    description:
      'Median latency rises with distance from US-East (about 150 ms) to SA-East (about 260 ms); US-East and AP-South each show one high outlier.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { BoxplotChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

// One raw-sample array per category (the chart summarizes them itself).
const samples = [
  [118, 124, 131, 137, 141, 146, 152, 158, 166, 171, 183, 197, 340], // US-East
  [141, 149, 155, 162, 168, 174, 179, 186, 194, 205, 219, 238], // EU-West
  [173, 181, 190, 198, 207, 214, 226, 238, 251, 267, 290, 452], // AP-South
  [201, 213, 224, 236, 247, 259, 270, 284, 301, 322, 348], // SA-East
];

const options: ChartSpec = {
  title: 'API response time by region',
  subtitle: 'p50 request latency samples, last 24 h (ms)',
  data: {
    categories: ['US-East', 'EU-West', 'AP-South', 'SA-East'],
    series: [
      {
        id: 'latency',
        name: 'Response time',
        // No cast needed: the DataValue union names the per-category
        // sample list, so a number[][] assigns directly.
        data: samples,
      },
    ],
  },
  yAxis: { label: 'Latency (ms)', min: 0 },
  a11y: {
    description:
      'Median latency rises with distance from US-East (about 150 ms) to SA-East (about 260 ms); US-East and AP-South each show one high outlier.',
  },
};
</script>

<template>
  <BoxplotChart :options="options" style="height: 360px" />
</template>
```

:::

::: tip Raw samples vs. 5-number objects
**Any** numeric-array entry — any length, including 3 or 5 — is treated as
raw samples and summarized; 5-number objects are used verbatim. Precomputed
summaries are the right choice when the raw data is too large to ship or the
quartile method must match an upstream system.
:::
