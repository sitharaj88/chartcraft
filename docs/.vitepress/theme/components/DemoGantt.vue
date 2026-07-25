<script setup lang="ts">
/**
 * Gantt: task bars on a real TIME axis (the pipeline's `TimeScale`, with
 * calendar-aligned ticks), rows grouped into swimlanes by `group`, and an
 * optional dashed `today` marker.
 *
 * This is a schedule VIEW, not a planner: there are no dependencies, no
 * critical path and no resource levelling — a bar is a span, nothing more.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'gantt',
  title: 'Release 4.0 plan',
  subtitle: 'Swimlanes by team · dashed line = today',
  gantt: { today: new Date('2026-08-24') },
  data: {
    series: [
      {
        id: 'plan',
        name: 'Tasks',
        data: [
          { x: 'Schema migration', group: 'Platform', start: new Date('2026-07-06'), end: new Date('2026-07-31') },
          { x: 'Query cache', group: 'Platform', start: new Date('2026-07-27'), end: new Date('2026-08-28') },
          { x: 'Rate limiter', group: 'Platform', start: new Date('2026-08-24'), end: new Date('2026-09-18') },
          { x: 'New dashboard', group: 'Product', start: new Date('2026-07-13'), end: new Date('2026-09-04') },
          { x: 'Onboarding flow', group: 'Product', start: new Date('2026-08-17'), end: new Date('2026-09-25') },
          { x: 'Design QA', group: 'Product', start: new Date('2026-09-21'), end: new Date('2026-10-02') },
          { x: 'Pen test', group: 'Launch', start: new Date('2026-09-07'), end: new Date('2026-09-25') },
          { x: 'Docs & training', group: 'Launch', start: new Date('2026-09-14'), end: new Date('2026-10-09') },
          { x: 'GA', group: 'Launch', start: new Date('2026-10-12'), end: new Date('2026-10-12') },
        ],
      },
    ],
  },
  xAxis: { label: '2026' },
  a11y: {
    description:
      'Platform work runs July through mid-September, product work July through early October, and the launch lane (pen test, docs, GA) closes on 12 October. Only the GA milestone is zero-length.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="440" />
</template>
