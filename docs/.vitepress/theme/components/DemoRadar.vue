<script setup lang="ts">
/**
 * Radar: `categories` are the spokes (3–12), series values are >= 0.
 * Series draw as 2px outlines with light fills over a recessive polar grid;
 * the legend toggles series as usual.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'radar',
  title: 'Vendor evaluation',
  subtitle: 'Weighted scores, 0–10',
  data: {
    categories: ['Performance', 'Security', 'Support', 'Documentation', 'Pricing', 'Ecosystem'],
    series: [
      { id: 'vendor-a', name: 'Vendor A', data: [8.4, 7.2, 6.1, 8.8, 5.6, 7.9] },
      { id: 'vendor-b', name: 'Vendor B', data: [6.9, 8.6, 8.2, 6.4, 7.8, 5.7] },
    ],
  },
  a11y: {
    description:
      'Vendor A leads on performance and documentation; Vendor B leads on security, support, and pricing. Ecosystem favors A, 7.9 to 5.7.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="400" />
</template>
