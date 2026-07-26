# Pyramid

Two series mirrored around a centered category axis — the population pyramid.
The mirror makes one specific comparison effortless: *how does the shape of A
differ from the shape of B across the same bands?*

**Use it** for exactly two groups over shared ordered categories: age/sex
distributions, permanent vs contract headcount, this year vs last year by
cohort, wins vs losses by deal size.

**Don't use it** for more than two groups (there are only two arms — and the type
throws rather than silently dropping the third) or for categories with no
inherent order, where a grouped bar chart compares better. And don't use it when
readers need to compare the *same* band across arms precisely: mirrored bars
share a scale but not a baseline, so a grouped horizontal bar chart wins for
that question.

<ClientOnly>
  <DemoPyramid />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
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
});
```

```vue [Vue]
<script setup lang="ts">
import { PyramidChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
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
  <PyramidChart :options="options" style="height: 360px" />
</template>
```

:::

## Notes

- **Exactly two series, enforced.** Any other count throws from `createChart`
  (and from `update()`) with a message naming the type and suggesting
  `bar` + `horizontal: true` instead.
- **Axis options split by ROLE, not by screen direction:** `yAxis` (label,
  `ticks.format`) describes the vertical **category** axis, `xAxis` the
  horizontal **magnitude** axis. The tooltip's formatted values follow the same
  binding, so no formatter ends up on the wrong axis.
- **Values are magnitudes.** `Math.abs` is applied throughout, both arms share
  one scale, and no tick label can ever be negative — pass positive numbers for
  both series (don't negate one side).
- Hit testing takes the **full row band of the arm under the pointer**, the bar
  spec's "full column band" mirrored, so thin rows are still easy to hover.
- Rows, gutter, arms, gridlines and magnitude ticks are computed by the type
  (no pipeline cartesian layout can express a centered category axis), which is
  why `padding` is the knob for spacing rather than axis options.
