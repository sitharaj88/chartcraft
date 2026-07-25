<script setup lang="ts">
/**
 * Violin plot: a Gaussian KDE mirrored around each category, with the inner box
 * plot (median, quartiles, Tukey whiskers) drawn on top.
 *
 * Each category's datum is a RAW `number[]` of samples — the chart estimates
 * the density (Silverman bandwidth for `'auto'`), trims it to the sample's own
 * [min, max], and normalizes every violin to its OWN peak, so widths compare
 * SHAPES, not sample sizes (n travels in the tooltip and the table).
 *
 * TypeScript note: the `DataValue` union names only the 2/3/5-element tuple
 * shapes, so a longer raw sample array is asserted once here.
 */
import type { ChartOptions, DataValue } from '@chartcraft/vue';

const sample = (values: number[]): DataValue => values as unknown as DataValue;

const options: Omit<ChartOptions, 'theme'> = {
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
};
</script>

<template>
  <ChartDemo :options="options" :height="380" />
</template>
