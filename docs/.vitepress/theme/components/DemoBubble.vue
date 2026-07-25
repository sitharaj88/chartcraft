<script setup lang="ts">
/**
 * Bubble: scatter + a size channel. r maps to marker AREA (never radius)
 * via sizeRange — legend lists series, tooltip shows x, y, and r.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'bubble',
  title: 'Campaign efficiency',
  subtitle: 'Monthly spend vs. qualified leads — bubble area = audience reach (thousands)',
  data: {
    series: [
      {
        id: 'paid',
        name: 'Paid channels',
        sizeRange: [10, 44],
        data: [
          { x: 18, y: 240, r: 320, label: 'Search ads' },
          { x: 26, y: 310, r: 480, label: 'Social ads' },
          { x: 9, y: 90, r: 150, label: 'Display' },
          { x: 14, y: 150, r: 610, label: 'Video' },
        ],
      },
      {
        id: 'owned',
        name: 'Owned channels',
        sizeRange: [10, 44],
        data: [
          { x: 6, y: 180, r: 260, label: 'Newsletter' },
          { x: 11, y: 260, r: 140, label: 'Webinars' },
          { x: 4, y: 120, r: 90, label: 'Community' },
          { x: 8, y: 95, r: 400, label: 'Blog / SEO' },
        ],
      },
    ],
  },
  xAxis: { label: 'Monthly spend ($k)', min: 0 },
  yAxis: { label: 'Qualified leads', min: 0 },
  a11y: {
    description:
      'Owned channels produce leads at lower spend than paid channels; social ads have the highest spend and lead count, while video reaches the largest audience.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="380" />
</template>
