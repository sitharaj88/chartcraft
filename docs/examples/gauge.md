# Gauge

One value against a bounded range: a 270° arc with the value large in the
center and min/max in muted ink — the subtitle carries the units. Use a
gauge when a single current value against known thresholds *is* the message
(utilization, error budget, NPS). Don't use it for history (that's a
[sparkline](sparkline.md) or [line](line.md)), for comparing several values
(bars), or as dashboard decoration — a number with no meaningful bounds is a
stat tile, not a gauge.

<ClientOnly>
  <DemoGauge />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'gauge',
  title: 'API cluster utilization',
  subtitle: '% of provisioned capacity, 5-min average',
  gauge: {
    min: 0, // default 0
    max: 100, // default 100
    // No colours: the bands are themed by POSITION — theme.up, theme.warning,
    // theme.down. See the note below.
    bands: [
      { to: 60 }, // healthy
      { to: 85 }, // elevated
      { to: 100 }, // saturated
    ],
  },
  data: {
    series: [{ id: 'util', name: 'Utilization', data: [72] }],
  },
  a11y: {
    description:
      'Cluster utilization is at 72 percent of capacity — in the elevated band (60 to 85 percent), below the saturated threshold.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { GaugeChart } from '@chartcraft/vue';
import type { ChartSpec } from '@chartcraft/vue';

const options: ChartSpec = {
  title: 'API cluster utilization',
  subtitle: '% of provisioned capacity, 5-min average',
  gauge: {
    min: 0, // default 0
    max: 100, // default 100
    // No colours: the bands are themed by POSITION. See the note below.
    bands: [
      { to: 60 }, // healthy
      { to: 85 }, // elevated
      { to: 100 }, // saturated
    ],
  },
  data: {
    series: [{ id: 'util', name: 'Utilization', data: [72] }],
  },
  a11y: {
    description:
      'Cluster utilization is at 72 percent of capacity — in the elevated band (60 to 85 percent), below the saturated threshold.',
  },
};
</script>

<template>
  <GaugeChart :options="options" style="height: 320px" />
</template>
```

:::

::: tip Bands
Without `bands`, the value arc is series-slot-1 blue over a gridline-colored
track. With bands, the track shows the band colors at 0.35 alpha and the
value arc overlays them at full alpha in the color of the band the value
falls in (values beyond the last band use the last band's color; track range
beyond the last band falls back to the gridline color). Band colors are
**status** colors — never series-palette colors. There is no legend on a gauge.
:::

## Band colors are optional {#band-colors}

`bands[].color` is **optional**. Omit it and the band takes the themed status
color for its **position**, so a gauge needs no hardcoded hexes at all:

| bands | defaults |
|---|---|
| 1 | `theme.neutral` — a single band states no comparison, it is just a track |
| 2 | `theme.up`, `theme.down` |
| 3 | `theme.up`, `theme.warning`, `theme.down` |
| n | `theme.up`, `theme.warning` × (n−2), `theme.down` |

`theme.warning` (`#fab219`, both schemes) is the [v0.4 caution
step](../concepts/theming.md#warning-slot) that made this possible: before it,
`up`/`down` covered two of the three states a gauge actually has, so the middle
band forced a literal like `'#c98500'` — which is not even a status color, it is
dark-mode series slot 4, and it stopped following the theme the moment the user
switched schemes.

Defaults are filled in **per band**, so a mix is legal and a named color is never
overwritten:

```ts
gauge: { bands: [{ to: 60 }, { to: 85 }, { to: 100, color: brandRed }] }
```

::: warning The polarity assumption
Bands are *ascending value ranges*, and the defaults read them as ascending
**severity** — low is good, high is bad. That is the convention for the
utilization, capacity, load and error-rate gauges this default exists for. A gauge
whose polarity runs the other way (uptime, SLA attainment, test coverage) must
name its colors: the library cannot infer which direction is "bad" from a number.
:::
