# Large data

A single 50,000-point series, rendered live. LTTB downsampling is on by
default past 5,000 points per series — toggle it off to draw every point and
compare the render time. Downsampling is render-side only: tooltips, events,
and the accessibility data table always work against the full data.

<ClientOnly>
  <DemoLargeData />
</ClientOnly>

The essentials of the source (data generation elided — any
`[number, number | null][]` works):

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';

declare const points: [number, number | null][]; // 50,000 epoch-ms samples

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'line',
  title: 'Server load — 50,000 points',
  subtitle: 'One sample per minute for ~35 days',
  data: {
    series: [{ id: 'load', name: 'CPU load (%)', data: points }],
  },
  // Numeric epoch-ms x-values are far lighter than 50k Date objects, but
  // they infer a linear axis — request the time axis explicitly.
  xAxis: { type: 'time' },
  yAxis: { label: 'Load (%)', min: 0, max: 100 },
  downsample: { enabled: true }, // the default; threshold defaults to 5000
  animation: false,
});

// Measure a render: start the clock, change options, listen for `render`.
let t0 = performance.now();
chart.on('render', () => {
  console.log(`rendered in ${(performance.now() - t0).toFixed(1)} ms`);
});

function setDownsampling(enabled: boolean) {
  t0 = performance.now();
  chart.update({ downsample: { enabled } });
}
```

```vue [Vue]
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Chart } from '@chartcraft/vue';
import type { ChartInstance, ChartOptions } from '@chartcraft/vue';

declare const points: [number, number | null][]; // 50,000 epoch-ms samples

const downsampleOn = ref(true);
const renderMs = ref<number | null>(null);
const chartRef = ref<{ chart: ChartInstance | null } | null>(null);
let t0 = performance.now();

const options = computed<ChartOptions>(() => ({
  type: 'line',
  title: 'Server load — 50,000 points',
  data: { series: [{ id: 'load', name: 'CPU load (%)', data: points }] },
  xAxis: { type: 'time' },
  yAxis: { label: 'Load (%)', min: 0, max: 100 },
  downsample: { enabled: downsampleOn.value },
  animation: false,
}));

let off: (() => void) | undefined;
onMounted(() => {
  off = chartRef.value?.chart?.on('render', () => {
    renderMs.value = performance.now() - t0;
  });
});
onBeforeUnmount(() => off?.());

function toggle() {
  t0 = performance.now();
  downsampleOn.value = !downsampleOn.value;
}
</script>

<template>
  <button type="button" @click="toggle">
    {{ downsampleOn ? 'Disable' : 'Enable' }} downsampling
  </button>
  <span v-if="renderMs !== null">last render {{ renderMs.toFixed(1) }} ms</span>
  <Chart ref="chartRef" :options="options" style="height: 360px" />
</template>
```

:::

Why this stays smooth — canvas rendering, allocation-free hot paths, and the
LTTB algorithm that preserves peaks, troughs, and outliers while dropping only
visually redundant points — is covered in [Performance](../performance.md).
The algorithm itself is exported as
[`downsampleLTTB`](../api/core.md#downsamplelttb) for your own pipelines.
