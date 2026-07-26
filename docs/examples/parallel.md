# Parallel coordinates

One vertical axis per dimension, each **independently scaled**, and one polyline
per series crossing them all. It is the standard way to look at multivariate
records without projecting them into two dimensions — and the crossings between
adjacent axes carry the information: parallel lines mean correlation, an X means
inversion.

**Use it** for comparing a handful of records across 3–8 numeric dimensions:
plan/product profiles, model hyper-parameter runs, candidate configurations,
cluster centroids.

**Don't use it** for many records — beyond a few dozen lines it is a smear, and
you need brushing (see the notes) to get anything out of it. Don't use it when
the *values* matter more than the pattern: each axis has its own scale, so a
line high on one axis and low on the next says nothing about their magnitudes.
And be aware the axis ORDER changes the story — only adjacent axes can be
compared, so pick the order deliberately with `parallel.axes`.

<ClientOnly>
  <DemoParallel />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'parallel',
  title: 'Plan profiles across five metrics',
  subtitle: 'Each axis is scaled to its own range — read the crossings, not the heights',
  parallel: { axes: ['ARR ($k)', 'Seats', 'Weekly active %', 'NPS', 'Churn %'] },
  data: {
    series: [
      { id: 'starter', name: 'Starter', data: [4.8, 6, 41, 12, 14.2] },
      { id: 'growth', name: 'Growth', data: [21.4, 24, 58, 34, 8.6] },
      { id: 'business', name: 'Business', data: [58.9, 85, 67, 41, 5.1] },
      { id: 'enterprise', name: 'Enterprise', data: [142.3, 320, 74, 47, 2.4] },
      { id: 'public', name: 'Public sector', data: [96.5, 410, 38, 22, 3.8] },
    ],
  },
  a11y: {
    description:
      'ARR, seats, weekly active share and NPS all rise together from Starter to Enterprise while churn falls. Public sector breaks the pattern: it has the most seats but the lowest weekly active share (38%) and an NPS of 22.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { ParallelChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Plan profiles across five metrics',
  subtitle: 'Each axis is scaled to its own range — read the crossings, not the heights',
  parallel: { axes: ['ARR ($k)', 'Seats', 'Weekly active %', 'NPS', 'Churn %'] },
  data: {
    series: [
      { id: 'starter', name: 'Starter', data: [4.8, 6, 41, 12, 14.2] },
      { id: 'growth', name: 'Growth', data: [21.4, 24, 58, 34, 8.6] },
      { id: 'business', name: 'Business', data: [58.9, 85, 67, 41, 5.1] },
      { id: 'enterprise', name: 'Enterprise', data: [142.3, 320, 74, 47, 2.4] },
      { id: 'public', name: 'Public sector', data: [96.5, 410, 38, 22, 3.8] },
    ],
  },
  a11y: {
    description:
      'ARR, seats, weekly active share and NPS all rise together from Starter to Enterprise while churn falls. Public sector breaks the pattern: it has the most seats but the lowest weekly active share (38%) and an NPS of 22.',
  },
};
</script>

<template>
  <ParallelChart :options="options" style="height: 400px" />
</template>
```

:::

## Notes

- **Dimension names** come from `parallel.axes`, else `data.categories`, else the
  1-based data index. Each series' `data` carries one value per dimension, in that
  order.
- **Each axis is scaled to the RAW extent of its dimension over the visible
  series — with no `nice()` widening.** The labels at the top and bottom of an
  axis are the true max and min of that dimension, which is the entire point of
  independent scaling. (A degenerate extent widens by ±0.5.)
- **Axis-name collisions resolve deterministically:** fit on one row → stagger
  over two rows (reserving one more label row) → ellipsize to the slot width.
  Names are never rotated — a rotated name over a vertical axis runs into the
  neighbouring axis line.
- **Hit testing** takes the nearest vertex within 24px, else the nearest polyline
  *segment* within 6px, so a line is hoverable between axes. The focused datum is
  the segment endpoint nearer the pointer; other lines dim so the focused one
  reads.
- **Axis brushing is the zoom feature's job, not this type's.** The seam exists
  and is pure (a decorator can map a pointer x to a dimension and a pixel back to
  that axis's value), but dragging an axis to filter lines is not wired up in
  v0.3 — treat this chart as read-only for now.
- Axes are centered in equal slots, so the outermost axes' labels cannot clip the
  plot edge.
