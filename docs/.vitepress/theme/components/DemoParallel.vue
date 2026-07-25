<script setup lang="ts">
/**
 * Parallel coordinates: one vertical axis per dimension, each INDEPENDENTLY
 * scaled to the raw extent of its own dimension and labeled with its true max
 * and min at the top and bottom (no `nice()` widening — independent scaling is
 * the entire point of the form).
 *
 * A series is one polyline across the axes; `parallel.axes` names the
 * dimensions in order and each series' `data` carries one value per dimension.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'parallel',
  title: 'Plan profiles across five metrics',
  subtitle: 'Each axis is scaled to its own range — read the crossings, not the heights',
  parallel: { axes: ['ARR ($k)', 'Seats', 'Weekly active %', 'NPS', 'Churn %'] },
  data: {
    series: [
      { id: 'starter', name: 'Starter', data: [4.8, 6, 41, 12, 14.2] },
      { id: 'growth', name: 'Growth', data: [21.4, 24, 58, 34, 8.6] },
      { id: 'business', name: 'Business', data: [58.9, 85, 67, 41, 5.1] },
      { id: 'enterprise', name: 'Enterprise', data: [142.3, 320, 74, 47, 2.4] },
      { id: 'public', name: 'Public sector', data: [96.5, 410, 38, 22, 3.8] },
    ],
  },
  a11y: {
    description:
      'ARR, seats, weekly active share and NPS all rise together from Starter to Enterprise while churn falls. Public sector breaks the pattern: it has the most seats but the lowest weekly active share (38%) and an NPS of 22.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="400" />
</template>
