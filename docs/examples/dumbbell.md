# Dumbbell

Two measurements per category, drawn as two large dots joined by a hairline.
The distance *is* the message: a dumbbell chart makes change, gaps and
disparities readable at a glance in a way two bars never do.

**Use it** for before/after comparisons across categories (2021 vs 2025, plan
vs actual, us vs competitor), and for gap analysis where the gap is the point —
pay equity, regional disparity, response-time improvement.

**Don't use it** for more than two points in time: three dots on a line are a
slope chart, four are a line chart, and a "dumbbell" with three dots stops
having a clear reading order. Don't use it when the two values are different
measures — the connector asserts they are two states of *the same* quantity.
And if the categories have a natural order (time), use a line.

<ClientOnly>
  <DemoDumbbell />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
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
});
```

```vue [Vue]
<script setup lang="ts">
import { DumbbellChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Median annual contract value by segment',
  subtitle: '2021 vs 2025 ($k)',
  data: {
    categories: ['Free → paid', 'Starter', 'Growth', 'Business', 'Enterprise'],
    series: [
      {
        id: 'acv',
        name: 'ACV',
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
  <DumbbellChart :options="options" style="height: 340px" />
</template>
```

:::

## Notes

- **The legend names the two ENDS, not the series** — and those names come from
  `SeriesOptions.lowKey` / `highKey` when you set them (`'2021'` / `'2025'`
  above), falling back to `Low` / `High`. The same two names title the table's
  bound columns. With object data, those keys *also* select which fields the
  bounds are read from, so `lowKey: '2021'` works whether your datum is
  `{ low, high }` or `{ '2021': …, '2025': … }`. The table is
  `Category | <low name> | <high name> | Delta` — the signed gap is computed for
  you, and `exportData()` carries it.
- **Endpoint colors are always palette slots 1 and 2, for every series.** That
  keeps the endpoint legend true when more than one series is drawn — but it
  means series identity is *not* color-encoded on a dumbbell. If you need to
  compare several series, use small multiples. A per-datum `color` overrides
  both dots of that datum.
- **The legend shows even for a single series** (it is the only key to which dot
  is which) and its items are **non-toggleable** — there is no series behind an
  endpoint. Explicit `legend: false` is still honored.
- **Both bounds are required.** A datum with only one bound is a gap.
- Categories sit on the band (x) axis and values on **y**, like a bar chart —
  configure the value axis through `yAxis`.
- Several series are supported: each visible series takes its own slot inside
  the category band, 2px apart. The connector is drawn in `theme.gridline` so
  the dots carry the encoding.
- Data shapes: `{ x, low, high }` objects or `[x, low, high]` triples (on this
  type a three-element tuple is read as a **range**, not as a bubble size).
