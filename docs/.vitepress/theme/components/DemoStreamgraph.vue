<script setup lang="ts">
/**
 * Streamgraph: a stacked area on a wiggle-minimizing ("inside-out") baseline.
 * The baseline carries no information, so the value axis is suppressed
 * entirely — no ticks, no axis line, no gridlines, and no reserved margin.
 * Values live in the tooltip and the a11y table, which gains a `Total` column
 * because the stack total is the only vertically readable quantity left.
 *
 * Ribbon ORDER is computed (by peak position), but COLOR still follows series
 * identity and the legend stays in input order.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'streamgraph',
  title: 'Support volume by channel',
  subtitle: 'Conversations per week, rolling 12 months',
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      { id: 'email', name: 'Email', data: [820, 790, 810, 760, 700, 640, 610, 590, 620, 660, 690, 710] },
      { id: 'chat', name: 'Live chat', data: [310, 360, 420, 500, 580, 640, 700, 760, 810, 880, 940, 1010] },
      { id: 'phone', name: 'Phone', data: [240, 235, 250, 230, 220, 205, 190, 185, 195, 210, 225, 240] },
      { id: 'community', name: 'Community', data: [90, 120, 160, 190, 230, 280, 340, 380, 410, 430, 460, 500] },
      { id: 'social', name: 'Social', data: [60, 70, 95, 130, 180, 210, 190, 160, 140, 130, 120, 115] },
    ],
  },
  a11y: {
    description:
      'Total support volume grew from about 1,520 conversations per week to 2,575. Live chat and community drove all of the growth; email and phone volumes declined slowly.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
