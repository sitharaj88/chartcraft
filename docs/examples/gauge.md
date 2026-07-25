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
    bands: [
      { to: 60, color: '#0ca30c' }, // healthy
      { to: 85, color: '#c98500' }, // elevated
      { to: 100, color: '#d03b3b' }, // saturated
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
import type { TypedChartOptions } from '@chartcraft/vue';

const options: TypedChartOptions = {
  title: 'API cluster utilization',
  subtitle: '% of provisioned capacity, 5-min average',
  gauge: {
    min: 0, // default 0
    max: 100, // default 100
    bands: [
      { to: 60, color: '#0ca30c' }, // healthy
      { to: 85, color: '#c98500' }, // elevated
      { to: 100, color: '#d03b3b' }, // saturated
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
**status** colors — pick them for meaning, never from the series palette.
There is no legend on a gauge.
:::
