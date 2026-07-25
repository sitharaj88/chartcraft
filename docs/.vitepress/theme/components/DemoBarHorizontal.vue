<script setup lang="ts">
/**
 * Horizontal bar chart: single series, long category labels.
 * With one series the legend hides automatically — the title names it.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'bar',
  horizontal: true,
  title: 'Support tickets by category',
  subtitle: 'Open tickets, this week',
  data: {
    categories: [
      'Billing & invoicing',
      'Account access',
      'API & integrations',
      'Performance',
      'Feature requests',
      'Other',
    ],
    series: [
      { id: 'tickets', name: 'Open tickets', data: [64, 51, 43, 28, 19, 12] },
    ],
  },
  xAxis: { label: 'Tickets' },
  a11y: {
    description:
      'Billing and invoicing leads open support tickets this week with 64, followed by account access with 51.',
  },
};
</script>

<template>
  <ChartDemo :options="options" />
</template>
