<script setup lang="ts">
/**
 * Funnel: one series of ordered { x: stage, y: value } points. Segment
 * widths are proportional to value; colors are ordinal steps of the
 * sequential ramp; stage labels + values sit directly on the segments, so
 * there is no legend.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'funnel',
  title: 'Trial conversion funnel',
  subtitle: 'Last 90 days',
  data: {
    series: [
      {
        id: 'funnel',
        name: 'Prospects',
        data: [
          { x: 'Visited pricing', y: 48200 },
          { x: 'Started trial', y: 9600 },
          { x: 'Activated workspace', y: 5200 },
          { x: 'Subscribed', y: 1900 },
          { x: 'Expanded seats', y: 640 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Of 48,200 pricing-page visitors, 20 percent started a trial, 11 percent activated, 4 percent subscribed, and 1.3 percent expanded seats.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="380" />
</template>
