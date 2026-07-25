<script setup lang="ts">
/**
 * Icicle: a rectangular partition of a hierarchy — depth is the ROW, width is
 * the value. Same coloring rules as the treemap: top-level nodes take
 * categorical slots in order, children are lightness steps of their parent's
 * hue (a hierarchy never invents hues).
 *
 * Every node is a drawn cell, so keyboard navigation walks ALL nodes
 * depth-first (parent before children), not only the leaves.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'icicle',
  title: 'Cloud spend by service',
  subtitle: 'Last month, $ thousands',
  data: {
    series: [
      {
        id: 'spend',
        name: 'Spend',
        data: [
          {
            label: 'Compute',
            children: [
              { label: 'API cluster', value: 148 },
              { label: 'Batch workers', value: 92 },
              { label: 'ML training', value: 64 },
            ],
          },
          {
            label: 'Storage',
            children: [
              { label: 'Object store', value: 78 },
              { label: 'Warehouse', value: 54 },
              { label: 'Backups', value: 21 },
            ],
          },
          {
            label: 'Network',
            children: [
              { label: 'Egress', value: 46 },
              { label: 'Load balancers', value: 18 },
              { label: 'CDN', value: 31 },
            ],
          },
          {
            label: 'Platform',
            children: [
              { label: 'Observability', value: 37 },
              { label: 'CI runners', value: 24 },
            ],
          },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Compute is 44% of cloud spend ($304k of $683k), and the API cluster alone is $148k. Storage follows at $153k, network at $95k and platform tooling at $61k.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
