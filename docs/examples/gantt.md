# Gantt

Task bars on a time axis, optionally grouped into swimlanes, with a "today"
marker. It is the fastest way to answer *what overlaps when*.

Set expectations first: **this is a schedule view, not a project planner.** There
are no dependencies, no critical path, no resource levelling, no percent-complete
and no drag-to-reschedule. A bar is a span with a label.

**Use it** for communicating a plan or a history to readers: release timelines,
campaign calendars, sprint contents, incident timelines, contract periods,
booking occupancy.

**Don't use it** as a planning tool (use a planner and *render* its output here),
and don't use it for hundreds of tasks — rows get thin, labels get dropped, and
a table with sorting serves better. If tasks have no meaningful duration, they are
events: a scatter or a timeline of points says so more clearly.

<ClientOnly>
  <DemoGantt />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
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
});
```

```vue [Vue]
<script setup lang="ts">
import { GanttChart } from '@chartcraft/vue';
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
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
  <GanttChart :options="options" style="height: 440px" />
</template>
```

:::

## Notes

- **Task spans accept `start`/`end` or the generic `low`/`high` range fields**
  (`Date` or epoch ms). A task needs both bounds with `end >= start`;
  `null` entries are gaps, not tasks.
- **Swimlanes** come from a per-point `group`; if you pass several series instead,
  their **names** become the lanes (a per-point `group` wins). Rows are tasks in
  data order, grouped under lane headers drawn in `textSecondary`.
- **The time axis is the pipeline's real `TimeScale`** — calendar-aligned ticks —
  with the domain pinned to `[min start, max end]` **verbatim, no padding**, so the
  first bar starts at the left edge and the last ends at the right. An explicit
  `xAxis.min`/`max` still wins. Gridlines run along the **time** axis (the opposite
  of the generic default), because a gantt's cross axis is a list of rows with
  nothing to grid.
- **`gantt.today` is drawn only when it falls inside the schedule.** Extending the
  domain to reach a distant marker would squash every bar and clamping it to the
  edge would state something false, so a marker outside the data is simply absent.
- **Sizing:** `rowHeight` defaults to *fit* (the rows area divided by the row
  count, header rows included); an explicit `rowHeight` is used verbatim and the
  rows then simply do not fill the plot. Bar height is the row minus 4px top and
  bottom, capped at 28px. Zero-length milestones still get a 2px sliver, and a
  zero-width schedule widens its domain by one day.
- **Labels are measured, never truncated inside a bar:** the label goes inside the
  bar when the whole thing fits, otherwise immediately to its right (ellipsized to
  the remaining plot width), otherwise it is dropped — the task is still in the
  tooltip, the announcement and the table.
- **The table** is `Task | Start | End | Duration`. Dates print as local
  `YYYY-MM-DD` (gaining ` HH:MM` when the whole schedule spans under two days), and
  `Duration` uses the largest unit the span *reaches* — days, hours, minutes,
  seconds. Weeks, months and years are deliberately never used: their length is
  calendar-dependent, so `1mo` would not be a duration.
- **`getOptions().data` reports one normalized series** of tasks in row order (a
  multi-series gantt collapses into one), and every task, node and lane keeps a
  meaningful `dataIndex`. The legend is hidden by default; `legend: true` lists the
  **swimlanes**, non-toggleable — so an ungrouped schedule shows an empty legend.
