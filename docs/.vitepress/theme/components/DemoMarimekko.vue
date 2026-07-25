<script setup lang="ts">
/**
 * Marimekko (mosaic): variable-width 100%-stacked columns. Column WIDTH is the
 * segment's share of the grand total, segment HEIGHT its share within the
 * column — two encodings in one picture, so both travel with every readout
 * (tooltip and a11y table carry the width share and the within-column share).
 *
 * The width measure comes from `r` on the FIRST series' points, index-aligned
 * to the columns; without a usable `r` on every column, each column falls back
 * to its own total.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'marimekko',
  title: 'Revenue mix by customer segment',
  subtitle: 'Column width = share of total revenue · segment height = product mix',
  data: {
    categories: ['SMB', 'Mid-market', 'Enterprise', 'Public sector'],
    series: [
      {
        id: 'platform',
        name: 'Platform',
        // `r` on the FIRST series carries each column's width measure
        // (total revenue for that segment, $M).
        data: [
          { y: 8.2, r: 14.6 },
          { y: 15.4, r: 31.2 },
          { y: 26.1, r: 62.8 },
          { y: 5.3, r: 11.4 },
        ],
      },
      { id: 'analytics', name: 'Analytics add-on', data: [3.1, 8.9, 21.4, 2.6] },
      { id: 'services', name: 'Services', data: [1.4, 4.2, 12.7, 2.9] },
      { id: 'support', name: 'Premium support', data: [1.9, 2.7, 2.6, 0.6] },
    ],
  },
  a11y: {
    description:
      'Enterprise is 52% of total revenue and leans hardest on add-ons: analytics is a third of its mix. SMB is only 12% of revenue and is almost all platform subscription.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="380" />
</template>
