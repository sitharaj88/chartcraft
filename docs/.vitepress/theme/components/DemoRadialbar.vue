<script setup lang="ts">
/**
 * Radial bars: one concentric arc per category, sweeping from 12 o'clock.
 * With ONE series the arcs *are* the categories, so they take categorical
 * slots in order and are labeled with the category name; the legend lists the
 * categories and is non-toggleable.
 *
 * Arc thickness and inter-track gaps are computed to fill the band exactly —
 * there is no thickness option — so more categories mean thinner arcs, never
 * overflow.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'radialbar',
  title: 'Quota attainment by sales team',
  subtitle: 'Q3, percent of quota · full circle = 120%',
  radialbar: { innerRadius: 0.32, maxValue: 120, track: true },
  data: {
    categories: ['EMEA North', 'EMEA South', 'AMER East', 'AMER West', 'APAC'],
    series: [{ id: 'attainment', name: 'Attainment (%)', data: [112, 96, 104, 88, 71] }],
  },
  a11y: {
    description:
      'EMEA North finished Q3 at 112% of quota and AMER East at 104%. APAC was furthest behind at 71%.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="380" />
</template>
