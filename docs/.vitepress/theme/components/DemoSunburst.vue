<script setup lang="ts">
/**
 * Sunburst: a radial treemap — depth = ring, same TreeNode[] data and
 * coloring rules as treemap (top-level nodes take palette slots, children
 * are lightness steps). The center shows the root total. Same TypeScript
 * cast note as treemap: TreeNode[] data is cast to DataValue[].
 */
import type { ChartOptions, DataValue, TreeNode } from '@chartcraft/vue';

const nodes: TreeNode[] = [
  {
    label: 'Search',
    children: [
      { label: 'Organic', value: 412 },
      { label: 'Paid search', value: 186 },
    ],
  },
  {
    label: 'Social',
    children: [
      { label: 'Organic social', value: 118 },
      { label: 'Paid social', value: 94 },
    ],
  },
  { label: 'Direct', value: 231 },
  {
    label: 'Referral',
    children: [
      { label: 'Partners', value: 57 },
      { label: 'Press & blogs', value: 34 },
    ],
  },
];

const options: Omit<ChartOptions, 'theme'> = {
  type: 'sunburst',
  title: 'Sessions by traffic source',
  subtitle: 'Last 30 days (thousands)',
  data: {
    series: [
      { id: 'traffic', name: 'Sessions', data: nodes as unknown as DataValue[] },
    ],
  },
  a11y: {
    description:
      'Search drives the most sessions (598 thousand, 69 percent organic), ahead of direct (231) and social (212); referral traffic is smallest at 91 thousand.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="420" />
</template>
