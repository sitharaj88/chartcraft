<script setup lang="ts">
/**
 * Nightingale rose: equal-angle sectors whose RADIUS is proportional to
 * √value, so the sector AREA is proportional to the value. (Radius ∝ value
 * would exaggerate large values quadratically — that is a bug, not a style.)
 *
 * Use it for genuinely cyclical data, where the wrap-around of the circle is
 * the point. `rose.startAngle` is degrees clockwise from 12 o'clock.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'rose',
  title: 'Orders by month',
  subtitle: 'Thousands of orders, last complete year · sector area ∝ orders',
  rose: { startAngle: 0 },
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      {
        id: 'orders',
        name: 'Orders (k)',
        data: [18.2, 15.4, 19.1, 22.6, 26.3, 24.8, 21.5, 20.9, 25.4, 29.7, 41.2, 48.6],
      },
    ],
  },
  a11y: {
    description:
      'Orders follow a seasonal cycle that peaks in November and December (41,200 and 48,600) and bottoms out in February (15,400).',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="400" />
</template>
