# Range area

A filled band between a `low` and a `high` bound at 0.18 alpha in the series
color, with hairline edges. Its reason for existing is the **forecast /
confidence chart**: a band plus a line of the same color, in one chart, on one
y-axis.

**Use it** for prediction intervals, min–max envelopes (daily temperature
range, bid–ask spread), tolerance bands, and any "we believe the true value is
somewhere in here" statement. A band is the honest way to show a forecast:
a bare forecast line claims a precision nobody has.

**Don't use it** to stack several bands on one chart — overlapping translucent
bands stop being readable at about two, and the reader cannot tell an overlap
from a third band. Don't use it for two unrelated measures that merely happen
to bracket each other; a band asserts that the space between the bounds is
*possible values of one quantity*. And if the interval is the same width
everywhere, say so in a sentence and draw the line.

<ClientOnly>
  <DemoRangearea />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { categoricalPalette, createChart } from '@chartcraft/core';

// The band and the line share one color so they read as one series family.
// (This page's live demo swaps to `categoricalPalette.dark[0]` with the site
// theme; in your app, `theme: 'auto'` plus one explicit hex is usually enough.)
const brand = categoricalPalette.light[0];

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'rangearea',
  title: 'Monthly recurring revenue — actuals and forecast',
  subtitle: 'Shaded band = 80% prediction interval',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    series: [
      {
        id: 'ci',
        name: '80% interval',
        color: brand,
        // A band point needs BOTH bounds — the six observed months are gaps.
        data: [
          null, null, null, null, null, null,
          { low: 4.28, high: 4.62 },
          { low: 4.34, high: 4.86 },
          { low: 4.39, high: 5.09 },
          { low: 4.41, high: 5.33 },
          { low: 4.44, high: 5.58 },
          { low: 4.45, high: 5.85 },
        ],
      },
      {
        id: 'mrr',
        name: 'MRR ($M)',
        color: brand,
        data: [3.41, 3.58, 3.72, 3.94, 4.13, 4.28, 4.45, 4.6, 4.74, 4.87, 5.01, 5.15],
      },
    ],
  },
  yAxis: { label: 'MRR ($M)', min: 3 },
  a11y: {
    description:
      'MRR grew from $3.41M in January to $4.28M in June. The forecast reaches $5.15M by December, with an 80% prediction interval that widens from $4.28–4.62M in July to $4.45–5.85M in December.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { categoricalPalette } from '@chartcraft/core';
import { RangeareaChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const brand = categoricalPalette.light[0];

const options: ChartSpec = {
  title: 'Monthly recurring revenue — actuals and forecast',
  subtitle: 'Shaded band = 80% prediction interval',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    series: [
      {
        id: 'ci',
        name: '80% interval',
        color: brand,
        data: [
          null, null, null, null, null, null,
          { low: 4.28, high: 4.62 },
          { low: 4.34, high: 4.86 },
          { low: 4.39, high: 5.09 },
          { low: 4.41, high: 5.33 },
          { low: 4.44, high: 5.58 },
          { low: 4.45, high: 5.85 },
        ],
      },
      {
        id: 'mrr',
        name: 'MRR ($M)',
        color: brand,
        data: [3.41, 3.58, 3.72, 3.94, 4.13, 4.28, 4.45, 4.6, 4.74, 4.87, 5.01, 5.15],
      },
    ],
  },
  yAxis: { label: 'MRR ($M)', min: 3 },
  a11y: {
    description:
      'MRR grew from $3.41M in January to $4.28M in June. The forecast reaches $5.15M by December, with an 80% prediction interval that widens from $4.28–4.62M in July to $4.45–5.85M in December.',
  },
};
</script>

<template>
  <RangeareaChart :options="options" style="height: 360px" />
</template>
```

:::

## Notes

- **A band is a mark kind, not just a chart type.** `SeriesOptions.type:
  'rangearea'` is legal on **any** cartesian root, so you can add a band to a
  line, area, bar or scatter chart. Bands paint first —
  `rangearea < area < bar < line < scatter` — so a band never covers its own
  line.
- **On a `rangearea` root, band-ness is decided by the data:** a series renders
  as a band exactly when its datum carries a full `low`/`high` pair. An
  explicit per-series `type` always wins.
- **A band point needs both bounds.** `{ x, low }` alone is a **gap**, not a
  half-band, and a band run of a single point draws nothing (a closed band needs
  two x positions). Both show as gaps in the data table too.
- **The value domain is not zero-anchored.** The mark's base kind is `line`, not
  `area` — deliberately, because zero-anchoring would squash a 90–110
  confidence band flat against the axis.
- **Range-area series are excluded from LTTB downsampling.** LTTB picks indices
  from `y` alone, which would desynchronize the two bounds; the rest of the
  chart still downsamples normally.
- **Data shapes:** `{ x, low, high }` objects or `[x, low, high]` triples. With
  object data, `SeriesOptions.lowKey` / `highKey` rename the fields the bounds
  are read from (`lowKey: 'p10', highKey: 'p90'`).
- **Table columns:** a chart whose only series is a band gets plain `Low` /
  `High` columns; in any other combination they are prefixed with the series
  name (`CI low`, `CI high`). `exportData()` serializes the same spec, so the
  CSV always matches the table.
- `rangearea: { showBounds: false }` drops the hairline edges and leaves the
  fill alone.
