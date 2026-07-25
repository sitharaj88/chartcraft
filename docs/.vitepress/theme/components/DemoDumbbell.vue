<script setup lang="ts">
/**
 * Dumbbell: two measurements per category, joined by a hairline. The legend
 * names the two ENDS, not the series — those names come from `lowKey` /
 * `highKey`, which are caller-chosen and human-meaningful ('2021' / '2025').
 * Endpoint colors are always palette slots 1 and 2, so the legend stays true
 * even when several series are drawn.
 *
 * Categories sit on the band (x) axis and the values on y, like a bar chart.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'dumbbell',
  title: 'Median annual contract value by segment',
  subtitle: '2021 vs 2025 ($k)',
  data: {
    categories: ['Free → paid', 'Starter', 'Growth', 'Business', 'Enterprise'],
    series: [
      {
        id: 'acv',
        name: 'ACV',
        // The endpoint NAMES shown in the legend and the a11y table columns.
        lowKey: '2021',
        highKey: '2025',
        data: [
          { low: 1.2, high: 2.4 },
          { low: 4.8, high: 7.1 },
          { low: 12.6, high: 21.4 },
          { low: 34.2, high: 58.9 },
          { low: 96.5, high: 142.3 },
        ],
      },
    ],
  },
  yAxis: { label: 'ACV ($k)', min: 0 },
  a11y: {
    description:
      'Median contract value rose in every segment between 2021 and 2025, most steeply on Enterprise ($96.5k to $142.3k) and Business ($34.2k to $58.9k).',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="340" />
</template>
