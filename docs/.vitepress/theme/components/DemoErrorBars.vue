<script setup lang="ts">
/**
 * Error bars: `SeriesOptions.errorBars` opts a series in (even `{}`), and
 * per-point absolute bounds (`eLow`/`eHigh`) win over the uniform
 * `value`/`percent`. The interval joins the value domain, so a whisker is never
 * clipped; the tooltip reads `value (low–high)`; and the a11y table (and
 * therefore `exportData()`) gains `± low` / `± high` columns.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'bar',
  title: 'Checkout conversion by variant',
  subtitle: 'A/B/n test, 95% confidence interval per variant',
  data: {
    categories: ['Control', 'One-page', 'Wallet first', 'Guest default'],
    series: [
      {
        id: 'conversion',
        name: 'Conversion (%)',
        errorBars: { capWidth: 8 },
        data: [
          { y: 3.41, eLow: 3.22, eHigh: 3.6 },
          { y: 3.94, eLow: 3.71, eHigh: 4.17 },
          { y: 3.58, eLow: 3.3, eHigh: 3.86 },
          { y: 4.12, eLow: 3.79, eHigh: 4.45 },
        ],
      },
    ],
  },
  yAxis: { label: 'Conversion (%)', min: 0 },
  a11y: {
    description:
      'Guest default converted best at 4.12% (95% CI 3.79–4.45%) and one-page checkout at 3.94% (3.71–4.17%). Both intervals sit clear of the control at 3.41%; wallet-first overlaps the control and is not distinguishable from it.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
