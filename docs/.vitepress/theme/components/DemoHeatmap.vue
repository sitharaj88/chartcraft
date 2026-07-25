<script setup lang="ts">
/**
 * Heatmap: each series is one ROW, its numbers aligned to `categories`
 * (the columns). Cell color comes from the sequential ramp scaled over
 * heatmap.min..max (default: data extent). The legend is a gradient
 * color-scale bar — shown even for a single row, since it is the only key
 * to what the colors mean.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'heatmap',
  title: 'Support tickets by weekday and time',
  subtitle: 'Average tickets opened per 4-hour block, last quarter',
  data: {
    categories: ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'],
    series: [
      { id: 'mon', name: 'Mon', data: [4, 9, 38, 46, 27, 11] },
      { id: 'tue', name: 'Tue', data: [3, 8, 41, 44, 25, 10] },
      { id: 'wed', name: 'Wed', data: [4, 10, 43, 47, 28, 12] },
      { id: 'thu', name: 'Thu', data: [3, 9, 39, 42, 26, 11] },
      { id: 'fri', name: 'Fri', data: [5, 8, 34, 31, 18, 9] },
      { id: 'sat', name: 'Sat', data: [6, 5, 12, 15, 13, 8] },
      { id: 'sun', name: 'Sun', data: [5, 4, 9, 12, 11, 7] },
    ],
  },
  a11y: {
    description:
      'Ticket volume peaks on weekday business hours — roughly 40 per block between 08:00 and 16:00 Monday to Thursday — and drops to single digits overnight and on weekends.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="380" />
</template>
