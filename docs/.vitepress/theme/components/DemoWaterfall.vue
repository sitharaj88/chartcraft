<script setup lang="ts">
/**
 * Waterfall: one series of DELTAS; points marked isTotal are absolute totals
 * that rise from the baseline and reset the running total. Increases wear
 * theme.up, decreases theme.down, totals theme.neutral; hairline connectors
 * link consecutive bars (waterfall.connectors, default true).
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'waterfall',
  title: 'Operating profit bridge',
  subtitle: 'FY2025 → FY2026 ($M)',
  data: {
    series: [
      {
        id: 'bridge',
        name: 'Operating profit',
        data: [
          { x: 'FY2025', y: 8.4, isTotal: true },
          { x: 'Product revenue', y: 2.1 },
          { x: 'Services revenue', y: 0.6 },
          { x: 'COGS', y: -1.3 },
          { x: 'Operating expenses', y: -0.9 },
          { x: 'FX impact', y: -0.2 },
          { x: 'FY2026', y: 8.7, isTotal: true },
        ],
      },
    ],
  },
  yAxis: { label: '$M', min: 0 },
  a11y: {
    description:
      'Operating profit grew from 8.4 to 8.7 million dollars: revenue added 2.7 million, offset by 2.4 million of higher costs and FX.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
