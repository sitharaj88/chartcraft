<script setup lang="ts">
/**
 * Treemap: one series whose data is TreeNode[] (label, value?, children?).
 * Top-level nodes take categorical palette slots in order; children are
 * lightness steps of the parent hue. TypeScript note: the DataValue union
 * doesn't name TreeNode, so genuine TreeNode[] data needs a cast (the
 * runtime reads it as-is); alternatively pass the value as `y`.
 */
import type { ChartOptions, DataValue, TreeNode } from '@chartcraft/vue';

const nodes: TreeNode[] = [
  {
    label: 'Platform',
    children: [
      { label: 'Subscriptions', value: 46.2 },
      { label: 'Usage overages', value: 11.8 },
      { label: 'Premium support', value: 7.4 },
    ],
  },
  {
    label: 'Services',
    children: [
      { label: 'Consulting', value: 14.6 },
      { label: 'Training', value: 5.2 },
    ],
  },
  {
    label: 'Marketplace',
    children: [
      { label: 'App revenue share', value: 8.9 },
      { label: 'Listings', value: 2.3 },
    ],
  },
  { label: 'Other', value: 3.6 },
];

const options: Omit<ChartOptions, 'theme'> = {
  type: 'treemap',
  title: 'Revenue by product line',
  subtitle: 'FY2026 ($M) — cell area = revenue',
  data: {
    series: [
      { id: 'revenue', name: 'Revenue', data: nodes as unknown as DataValue[] },
    ],
  },
  a11y: {
    description:
      'Platform is the largest line at 65.4 million dollars (subscriptions alone 46.2), followed by services at 19.8 and marketplace at 11.2.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="400" />
</template>
