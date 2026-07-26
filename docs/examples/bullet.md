# Bullet

A bullet graph is a gauge that respects space: one row per measure, the value
as a thin dark bar, the target as a perpendicular tick, and qualitative ranges
as nested grey steps behind it. Stephen Few designed it to replace dashboard
gauges, and it earns that — five bullet rows fit where one gauge dial does, and
they can be compared vertically.

**Use it** for KPI-vs-target reporting where "did we hit it?" and "how far
off?" are the questions: quota attainment, SLA compliance, budget burn,
scorecards.

**Don't use it** for a value with no target or no qualitative context — that is
a bar chart, and a bullet without a target tick is just a bar with decoration.
Don't put measures with unrelated units in one bullet chart: every row shares
one value axis, so mixing dollars and percentages makes the grey bands lie.
Normalize to "% of plan" first, as the demo does.

<ClientOnly>
  <DemoBullet />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
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
});
```

```vue [Vue]
<script setup lang="ts">
import { BulletChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
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
  <BulletChart :options="options" style="height: 300px" />
</template>
```

:::

## Notes

- **The type forces `horizontal: true`.** Row labels then come free from the
  pipeline's band axis, and `getOptions().horizontal` reports `true`. The value
  axis is the **x** axis, so use `xAxis` for its label, ticks and any explicit
  `min`/`max`.
- **The value axis is exactly `[0, max]`** over every value, target and range
  boundary — no `nice()` widening — so the outermost qualitative range fills the
  row to the plot edge. (A widest grey band that stops short of the row end
  reads as a data range, not as the scale.) Tick values remain the pipeline's
  nice 1/2/5 steps *inside* that domain, so the last tick may not sit on the
  edge. Explicit `xAxis.min`/`max` still win.
- **Ranges are grey lightness steps, never hues:** the innermost (smallest)
  range is `theme.axisLine`, the outermost is `theme.gridline`, with even mixes
  between. A literal 2:1 contrast between *adjacent* steps is impossible inside
  that interval; what is guaranteed is monotone separation between steps, and
  that the measure bar and target tick (both `theme.textPrimary`) clear 2:1
  against **every** step.
- **`bullet.ranges` must be ascending**, and a datum carrying `low`/`high`
  replaces the chart-wide ranges **for that row**. `bullet.target` is the
  default target for rows whose datum has no `target`.
- **One series.** The contract declares bullet data as a single series; with
  several supplied, the first visible one is drawn and the rest are ignored
  (they still consume palette identity).
- The legend is hidden — rows are labeled directly. `dataIndex` in point events
  is the row index.
