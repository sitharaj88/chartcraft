<script setup lang="ts">
/**
 * Slope chart: two ordered stages, one line per series, direct labels at both
 * ends instead of a legend (when they fit — the fit is measured, and a
 * half-labeled end would be worse than a legend, so it is all or nothing).
 * A per-series `curve` is deliberately ignored: smoothing a slope chart
 * invents crossings that the data does not contain.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
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
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
