<script setup lang="ts">
/** Basic line chart: two series over categories, default markers. */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'line',
  title: 'Weekly active users',
  subtitle: 'Last 8 weeks',
  data: {
    categories: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
    series: [
      { id: 'web', name: 'Web', data: [1240, 1355, 1480, 1462, 1621, 1748, 1803, 1957] },
      { id: 'mobile', name: 'Mobile', data: [2110, 2280, 2195, 2404, 2542, 2601, 2789, 2932] },
    ],
  },
  yAxis: { label: 'Users', min: 0 },
  a11y: {
    description:
      'Web and mobile weekly active users both grew over the last 8 weeks; mobile stayed roughly 1,000 users ahead.',
  },
};
</script>

<template>
  <ChartDemo :options="options" />
</template>
