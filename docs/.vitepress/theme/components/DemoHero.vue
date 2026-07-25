<script setup lang="ts">
/** Landing-page hero demo: multi-series smooth line chart. */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'line',
  title: 'Monthly recurring revenue',
  subtitle: 'FY2025, USD thousands',
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      {
        id: 'enterprise',
        name: 'Enterprise',
        curve: 'monotone',
        data: [182, 194, 201, 216, 228, 245, 259, 271, 290, 308, 331, 356],
      },
      {
        id: 'team',
        name: 'Team',
        curve: 'monotone',
        data: [104, 109, 117, 121, 130, 136, 145, 149, 158, 167, 172, 181],
      },
      {
        id: 'starter',
        name: 'Starter',
        curve: 'monotone',
        data: [58, 61, 63, 68, 70, 74, 76, 81, 83, 88, 91, 95],
      },
    ],
  },
  yAxis: { label: 'MRR (USD, thousands)', min: 0 },
  a11y: {
    description:
      'All three plans grew through FY2025; Enterprise MRR nearly doubled from 182 to 356 thousand USD.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="380" />
</template>
