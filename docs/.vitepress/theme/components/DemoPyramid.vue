<script setup lang="ts">
/**
 * Population pyramid: EXACTLY two series mirrored around a centered category
 * axis. Values are magnitudes — both arms share one scale and no tick label is
 * ever negative, so you pass positive numbers for both sides.
 *
 * Axis options split by ROLE, not by screen direction: `yAxis` describes the
 * vertical CATEGORY axis (the age bands) and `xAxis` the horizontal MAGNITUDE
 * axis. Any series count other than 2 throws.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'pyramid',
  title: 'Workforce by age band and contract type',
  subtitle: 'Headcount, end of Q3',
  data: {
    categories: ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'],
    series: [
      { id: 'permanent', name: 'Permanent', data: [64, 412, 508, 331, 148, 27] },
      { id: 'contract', name: 'Contract', data: [96, 218, 174, 96, 51, 22] },
    ],
  },
  xAxis: { label: 'Headcount' },
  yAxis: { label: 'Age band' },
  a11y: {
    description:
      'Permanent headcount peaks in the 35–44 band (508 people) while contractors peak a decade earlier, at 25–34 (218). Contractors outnumber permanent staff only in the 18–24 band.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
