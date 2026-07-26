# Radial bar

Concentric arcs, one per category, each sweeping clockwise from 12 o'clock. It
is a bar chart wrapped around a circle — which means it is a **decorative**
encoding: arc length is harder to compare than bar length, and outer arcs get
more pixels per unit than inner ones.

**Use it** when you have few categories, values that share a natural maximum
(progress toward 100%, quota attainment, capacity used), and a layout that wants
a compact circular block — a dashboard tile, a KPI header.

**Don't use it** for precise ranking or for values without a shared ceiling: the
same value drawn on an outer track looks bigger than on an inner one, which is a
real bias, not a nitpick. Above five or six categories the arcs get thin and the
labels stop fitting. If comparison is the job, use a bar chart; if you have one
value, use a gauge.

<ClientOnly>
  <DemoRadialbar />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'radialbar',
  title: 'Quota attainment by sales team',
  subtitle: 'Q3, percent of quota · full circle = 120%',
  radialbar: { innerRadius: 0.32, maxValue: 120, track: true },
  data: {
    categories: ['EMEA North', 'EMEA South', 'AMER East', 'AMER West', 'APAC'],
    series: [{ id: 'attainment', name: 'Attainment (%)', data: [112, 96, 104, 88, 71] }],
  },
  a11y: {
    description:
      'EMEA North finished Q3 at 112% of quota and AMER East at 104%. APAC was furthest behind at 71%.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { RadialbarChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'Quota attainment by sales team',
  subtitle: 'Q3, percent of quota · full circle = 120%',
  radialbar: { innerRadius: 0.32, maxValue: 120, track: true },
  data: {
    categories: ['EMEA North', 'EMEA South', 'AMER East', 'AMER West', 'APAC'],
    series: [{ id: 'attainment', name: 'Attainment (%)', data: [112, 96, 104, 88, 71] }],
  },
  a11y: {
    description:
      'EMEA North finished Q3 at 112% of quota and AMER East at 104%. APAC was furthest behind at 71%.',
  },
};
</script>

<template>
  <RadialbarChart :options="options" style="height: 380px" />
</template>
```

:::

## Notes

- **Tracks are (category × visible series), category-major.** With **one**
  series — the common shape — there is one track per category, colored by
  *category* in slot order (the arcs *are* the categories) and labeled with the
  category name. With **several** series there is a track per series inside each
  category group, colored by the series' palette slot (hue keeps meaning series
  identity) and labeled `"Category · Series"`.
- The legend follows the same split: one series → non-toggleable **category**
  items (shown from 2 arcs, pie's policy); several series → toggleable **series**
  items under the generic `series >= 2` rule.
- **Arc thickness and gaps are computed, never configured.** The tracks always
  fill the band between `innerRadius * outer` and `outer` exactly: the desired
  4px gap shrinks (to 0 if it must) to keep every arc at least 2px thick, so high
  track counts produce thinner arcs rather than overflow.
- **Direct labels are selective:** when radial spacing is tighter than one line
  of text, only every *n*-th arc is labeled.
- **Negative values throw.** An angular sweep cannot encode a negative
  magnitude, so `createChart` fails with an error naming the series and index
  rather than silently clamping (radar's precedent).
- Options: `innerRadius` (0..1 of the outer radius, default `0.3`), `maxValue`
  (default the data max), `track` (draw the unreached remainder at gridline
  color).
