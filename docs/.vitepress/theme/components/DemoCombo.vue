<script setup lang="ts">
/**
 * Combo: per-series `type` overrides on a cartesian root — here bars for
 * actual revenue with a line for the target. All series share ONE y-axis
 * (same units!); ChartCraft never grows a dual axis. Note: combo mixing is
 * vertical-only — `horizontal: true` ignores per-series type overrides.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'bar',
  title: 'Revenue vs. target',
  subtitle: 'FY2026 by month ($k)',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
    series: [
      {
        id: 'actual',
        name: 'Actual',
        data: [96, 101, 99, 108, 113, 111, 119, 128],
      },
      {
        id: 'target',
        name: 'Target',
        type: 'line',
        data: [100, 102, 105, 107, 110, 113, 116, 120],
      },
    ],
  },
  yAxis: { label: 'Revenue ($k)', min: 0 },
  a11y: {
    description:
      'Monthly revenue tracked slightly below target through March, then beat it from April on, ending August at 128 thousand against a 120 thousand target.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
