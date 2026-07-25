<script setup lang="ts">
/** Scatter chart: two numeric dimensions, [x, y] pairs, grid on both axes. */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'scatter',
  title: 'Deal size vs. sales cycle',
  subtitle: 'Closed-won deals, trailing 12 months',
  data: {
    series: [
      {
        id: 'new-business',
        name: 'New business',
        data: [
          [14, 18], [22, 25], [31, 34], [45, 41], [52, 46], [61, 58],
          [38, 39], [27, 30], [74, 66], [89, 74], [56, 52], [42, 47],
          [19, 24], [68, 61], [95, 82], [33, 31],
        ],
      },
      {
        id: 'expansion',
        name: 'Expansion',
        data: [
          [12, 9], [18, 14], [26, 17], [35, 22], [48, 28], [57, 31],
          [24, 16], [41, 25], [66, 35], [78, 41], [30, 19], [51, 27],
        ],
      },
    ],
  },
  xAxis: { label: 'Deal size (USD, thousands)', grid: true, min: 0 },
  yAxis: { label: 'Sales cycle (days)', min: 0 },
  a11y: {
    description:
      'Larger deals take longer to close; expansion deals close roughly twice as fast as new business at every deal size.',
  },
};
</script>

<template>
  <ChartDemo :options="options" />
</template>
