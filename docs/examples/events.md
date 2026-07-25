# Events

Click a data point — or `Tab` to the chart, walk with the arrow keys, and
press `Enter` — and the `pointclick` payload appears in the log under the
chart. Keyboard-originated events carry `clientX === clientY === -1` so
handlers can tell the origin.

<ClientOnly>
  <DemoEvents />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';
import type { PointEvent } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'line',
  title: 'p95 latency by region',
  subtitle: 'Click a point — or Tab to the chart and press Enter',
  data: {
    categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    series: [
      { id: 'us-east', name: 'US East', data: [212, 198, 231, 305, 288, 240] },
      { id: 'eu-west', name: 'EU West', data: [188, 176, 214, 262, 251, 209] },
    ],
  },
  yAxis: { label: 'Latency (ms)', min: 0 },
});

// `on` returns an unsubscribe function — the idiomatic cleanup.
const off = chart.on('pointclick', (ev: PointEvent) => {
  const origin = ev.clientX === -1 && ev.clientY === -1 ? 'keyboard' : 'pointer';
  appendToLog(
    `pointclick  ${ev.seriesName} — x: ${String(ev.x)}, y: ${ev.y} (index ${ev.dataIndex})`,
    origin,
  );
});

// later: off();
```

```vue [Vue]
<script setup lang="ts">
import { ref } from 'vue';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions, PointEvent } from '@chartcraft/vue';

const options: ChartOptions = {
  type: 'line',
  title: 'p95 latency by region',
  subtitle: 'Click a point — or Tab to the chart and press Enter',
  data: {
    categories: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    series: [
      { id: 'us-east', name: 'US East', data: [212, 198, 231, 305, 288, 240] },
      { id: 'eu-west', name: 'EU West', data: [188, 176, 214, 262, 251, 209] },
    ],
  },
  yAxis: { label: 'Latency (ms)', min: 0 },
};

const log = ref<string[]>([]);

function onPointClick(ev: PointEvent) {
  const origin = ev.clientX === -1 && ev.clientY === -1 ? 'keyboard' : 'pointer';
  log.value.unshift(
    `[${origin}] pointclick  ${ev.seriesName} — x: ${String(ev.x)}, y: ${ev.y} (index ${ev.dataIndex})`,
  );
  if (log.value.length > 8) log.value.pop();
}
</script>

<template>
  <Chart :options="options" style="height: 340px" @point-click="onPointClick" />
  <ul role="log">
    <li v-for="(entry, i) in log" :key="log.length - i">{{ entry }}</li>
  </ul>
</template>
```

:::

The full event surface — `pointenter`, `pointleave`, `pointclick`,
`legendtoggle`, `render`, `destroy` — with payload types and the unsubscribe
pattern is documented in [Interactions](../concepts/interactions.md#the-events-api)
and the [API reference](../api/core.md#events).
