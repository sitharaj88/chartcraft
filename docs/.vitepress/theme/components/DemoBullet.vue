<script setup lang="ts">
/**
 * Bullet graph: one row per KPI, measured as a percentage of plan so every
 * row shares one scale. The qualitative ranges are grey lightness steps
 * (never hues), the measure is a thin dark bar, the target a perpendicular
 * tick. `horizontal: true` is forced by the type, and the value axis is
 * exactly 0..max so the outermost range fills the row.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'bullet',
  title: 'Q3 KPI attainment vs plan',
  subtitle: 'Percent of quarterly plan · grey steps = below / on / above plan',
  bullet: { ranges: [70, 90, 115], target: 100 },
  data: {
    series: [
      {
        id: 'attainment',
        name: 'Attainment',
        data: [
          { x: 'New ARR', y: 108 },
          { x: 'Expansion ARR', y: 94 },
          { x: 'Net retention', y: 101, target: 105 },
          { x: 'Support CSAT', y: 87 },
          { x: 'Onboarding time', y: 72, target: 90 },
        ],
      },
    ],
  },
  xAxis: { label: '% of plan' },
  a11y: {
    description:
      'New ARR beat plan at 108%; net retention just cleared its 105% target at 101%. Support CSAT (87%) and onboarding time (72% of a 90% target) both sit in the lowest qualitative band.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="300" />
</template>
