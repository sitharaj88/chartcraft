<script setup lang="ts">
/** Grouped bar chart: comparing series within categories. */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'bar',
  title: 'Revenue by quarter',
  subtitle: 'FY2025, USD millions',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { id: 'product', name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { id: 'services', name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
      { id: 'licensing', name: 'Licensing', data: [2.8, 3.0, 3.1, 3.6] },
    ],
  },
  yAxis: { label: 'USD (millions)' },
  // Grouped bars where users compare series within a quarter read best
  // with the shared tooltip.
  tooltip: { shared: true },
  a11y: {
    description:
      'All three revenue lines grew each quarter of FY2025; product revenue led, ending at 16.2 million USD in Q4.',
  },
};
</script>

<template>
  <ChartDemo :options="options" />
</template>
