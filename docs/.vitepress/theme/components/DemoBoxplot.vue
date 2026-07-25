<script setup lang="ts">
/**
 * Boxplot fed RAW SAMPLES: each entry in `data` is one category's number[]
 * (any length) — the chart computes the 5-number summary (R-7 quartiles,
 * 1.5×IQR whiskers) and draws values beyond the whiskers as outlier dots.
 * A 5-number object ({ min, q1, median, q3, max, outliers? }) per category
 * works too. TypeScript note: raw number[] entries need a cast because the
 * DataValue union only names the tuple shapes.
 */
import type { ChartOptions, DataValue } from '@chartcraft/vue';

const samples = [
  // US-East
  [118, 124, 131, 137, 141, 146, 152, 158, 166, 171, 183, 197, 340],
  // EU-West
  [141, 149, 155, 162, 168, 174, 179, 186, 194, 205, 219, 238],
  // AP-South
  [173, 181, 190, 198, 207, 214, 226, 238, 251, 267, 290, 452],
  // SA-East
  [201, 213, 224, 236, 247, 259, 270, 284, 301, 322, 348],
];

const options: Omit<ChartOptions, 'theme'> = {
  type: 'boxplot',
  title: 'API response time by region',
  subtitle: 'p50 request latency samples, last 24 h (ms)',
  data: {
    categories: ['US-East', 'EU-West', 'AP-South', 'SA-East'],
    series: [
      {
        id: 'latency',
        name: 'Response time',
        data: samples as unknown as DataValue[],
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
  <ChartDemo :options="options" :height="360" />
</template>
