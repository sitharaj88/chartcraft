<script setup lang="ts">
/**
 * Range area as a CONFIDENCE BAND — the canonical forecast chart: one band
 * series (`low`/`high`) plus a line of the SAME color for the point forecast,
 * in ONE chart on ONE y-axis.
 *
 * On a `rangearea` root, a series renders as a band exactly when its datum
 * carries BOTH bounds, so the median line needs no per-series `type`. Bands
 * paint first (rangearea < area < bar < line < scatter), so the line is never
 * hidden by its own interval.
 *
 * The shared color is read from the library's own palette (slot 1) so the band
 * and the line are visibly the same series family in light and dark mode.
 */
import { computed } from 'vue';
import { useData } from 'vitepress';
import { categoricalPalette } from '@chartcraft/core';
import type { ChartOptions } from '@chartcraft/vue';

const { isDark } = useData();
const slot1 = computed(() => (isDark.value ? categoricalPalette.dark : categoricalPalette.light)[0]);

const options = computed<Omit<ChartOptions, 'theme'>>(() => ({
  type: 'rangearea',
  title: 'Monthly recurring revenue — actuals and forecast',
  subtitle: 'Shaded band = 80% prediction interval',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    series: [
      {
        id: 'ci',
        name: '80% interval',
        color: slot1.value,
        // A band point needs BOTH bounds — the six observed months are gaps.
        data: [
          null,
          null,
          null,
          null,
          null,
          null,
          { low: 4.28, high: 4.62 },
          { low: 4.34, high: 4.86 },
          { low: 4.39, high: 5.09 },
          { low: 4.41, high: 5.33 },
          { low: 4.44, high: 5.58 },
          { low: 4.45, high: 5.85 },
        ],
      },
      {
        id: 'mrr',
        name: 'MRR ($M)',
        color: slot1.value,
        data: [3.41, 3.58, 3.72, 3.94, 4.13, 4.28, 4.45, 4.6, 4.74, 4.87, 5.01, 5.15],
      },
    ],
  },
  yAxis: { label: 'MRR ($M)', min: 3 },
  a11y: {
    description:
      'MRR grew from $3.41M in January to $4.28M in June. The forecast reaches $5.15M by December, with an 80% prediction interval that widens from $4.28–4.62M in July to $4.45–5.85M in December.',
  },
}));
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
