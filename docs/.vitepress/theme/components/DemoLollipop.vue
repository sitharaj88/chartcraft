<script setup lang="ts">
/**
 * Lollipop: a bar chart's layout with a 1px stem and a terminal dot — less ink
 * for the same encoding, which reads better when the bars would be sparse.
 * `stacked: true` is an error on this type (the stem has no stack story), and
 * per-series `type` overrides are refused: one encoding, one mark language.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'lollipop',
  title: 'Feature adoption, 90 days after launch',
  subtitle: 'Share of active workspaces that used the feature at least once',
  data: {
    categories: [
      'Saved views',
      'Bulk edit',
      'Slack alerts',
      'API tokens',
      'Audit log',
      'SSO',
      'Custom fields',
    ],
    series: [
      {
        id: 'adoption',
        name: 'Adoption',
        data: [68.4, 54.1, 47.9, 31.2, 22.5, 18.3, 12.7],
      },
    ],
  },
  yAxis: { label: 'Workspaces (%)', min: 0 },
  a11y: {
    description:
      'Saved views reached 68% of active workspaces in the first 90 days; custom fields, the least adopted feature, reached 13%.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="340" />
</template>
