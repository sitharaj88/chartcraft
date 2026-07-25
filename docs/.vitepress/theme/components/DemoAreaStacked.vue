<script setup lang="ts">
/** Stacked area chart: composition of a total over time. */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'area',
  stacked: true,
  title: 'Site traffic by channel',
  subtitle: 'Sessions per month, thousands',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [
      { id: 'organic', name: 'Organic search', data: [86, 92, 101, 110, 118, 131] },
      { id: 'direct', name: 'Direct', data: [54, 55, 58, 61, 66, 68] },
      { id: 'referral', name: 'Referral', data: [22, 25, 24, 29, 31, 36] },
      { id: 'social', name: 'Social', data: [14, 17, 21, 19, 24, 28] },
    ],
  },
  yAxis: { label: 'Sessions (thousands)' },
  a11y: {
    description:
      'Total monthly sessions grew from 176 to 263 thousand between January and June, with organic search contributing about half throughout.',
  },
};
</script>

<template>
  <ChartDemo :options="options" />
</template>
