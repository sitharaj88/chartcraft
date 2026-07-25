<script setup lang="ts">
/**
 * Gauge: one series with one value on a 270° arc. With `gauge.bands`, the
 * track shows the band colors at low alpha and the value arc takes the color
 * of the band the value falls in; without bands it uses series-slot-1 blue.
 * Band colors are STATUS colors (never series-palette slots); the subtitle
 * carries the units.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'gauge',
  title: 'API cluster utilization',
  subtitle: '% of provisioned capacity, 5-min average',
  gauge: {
    min: 0,
    max: 100,
    bands: [
      { to: 60, color: '#0ca30c' }, // healthy
      { to: 85, color: '#c98500' }, // elevated
      { to: 100, color: '#d03b3b' }, // saturated
    ],
  },
  data: {
    series: [{ id: 'util', name: 'Utilization', data: [72] }],
  },
  a11y: {
    description:
      'Cluster utilization is at 72 percent of capacity — in the elevated band (60 to 85 percent), below the saturated threshold.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="320" />
</template>
