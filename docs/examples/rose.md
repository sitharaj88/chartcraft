# Rose (Nightingale)

Equal-angle sectors whose **radius is √value**, so a sector's *area* is
proportional to its value. Florence Nightingale's coxcomb, drawn honestly.

Be clear-eyed about it: **a rose distorts comparison.** Judging relative area of
pie-like wedges is one of the least accurate perceptual tasks there is, and even
area-true encoding cannot fix that. The form's one genuine advantage is that the
circle *wraps* — December sits next to January — so cyclical structure is visible
in a way a bar chart cannot show.

**Use it** for genuinely cyclical data where the cycle is the story: monthly
seasonality, hours of the day, wind direction, weekday patterns.

**Don't use it** to compare a handful of unordered categories (bars, every time),
and don't use it when the reader must rank values or read magnitudes. If someone
asks "which month was biggest?" and has to squint, you picked the wrong chart.

<ClientOnly>
  <DemoRose />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'rose',
  title: 'Orders by month',
  subtitle: 'Thousands of orders, last complete year · sector area ∝ orders',
  rose: { startAngle: 0 },
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      {
        id: 'orders',
        name: 'Orders (k)',
        data: [18.2, 15.4, 19.1, 22.6, 26.3, 24.8, 21.5, 20.9, 25.4, 29.7, 41.2, 48.6],
      },
    ],
  },
  a11y: {
    description:
      'Orders follow a seasonal cycle that peaks in November and December (41,200 and 48,600) and bottoms out in February (15,400).',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { RoseChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Orders by month',
  subtitle: 'Thousands of orders, last complete year · sector area ∝ orders',
  rose: { startAngle: 0 },
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      {
        id: 'orders',
        name: 'Orders (k)',
        data: [18.2, 15.4, 19.1, 22.6, 26.3, 24.8, 21.5, 20.9, 25.4, 29.7, 41.2, 48.6],
      },
    ],
  },
  a11y: {
    description:
      'Orders follow a seasonal cycle that peaks in November and December (41,200 and 48,600) and bottoms out in February (15,400).',
  },
};
</script>

<template>
  <RoseChart :options="options" style="height: 400px" />
</template>
```

:::

## Notes

- **Radius ∝ √value, always.** Radius-linear encoding would exaggerate large
  values quadratically; in this library that is a bug, not a style option.
- **`rose.startAngle` is degrees clockwise from 12 o'clock** (default `0`, i.e.
  12 o'clock — the contract's default orientation). A non-finite value throws.
- **Negative values throw**, naming the series and index: a sector area cannot
  encode a negative magnitude.
- **Every category keeps its equal-angle slot**, even at value `0` or `null`
  (radius 0) — a rose sector is a category, not a share of a total.
- **One series is drawn.** Extra series still take palette identity but are not
  rendered (the pie / funnel / waterfall precedent).
- The a11y table's third column is `% of total`: with area proportional to value,
  the value share *is* the area share.
