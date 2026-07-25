<script setup lang="ts">
/**
 * Performance showcase: a 50,000-point line series with a toggle for the
 * built-in LTTB downsampling, and the time of the last committed render
 * (measured from the moment the option change is applied to the chart's
 * `render` event).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartInstance, ChartOptions } from '@chartcraft/vue';

const POINT_COUNT = 50_000;

/** Deterministic random walk with a daily cycle and occasional null gaps. */
function generateSeries(): [number, number | null][] {
  const points: [number, number | null][] = [];
  const start = Date.UTC(2026, 5, 1);
  const stepMs = 60_000; // one point per minute, ~35 days
  let value = 48;
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < POINT_COUNT; i++) {
    const daily = Math.sin((i / 1440) * 2 * Math.PI) * 9;
    value += (rand() - 0.5) * 1.6 + (48 - value) * 0.002;
    const y = i % 9973 === 0 ? null : Math.round((value + daily) * 100) / 100;
    points.push([start + i * stepMs, y]);
  }
  return points;
}

const data = generateSeries();

const { isDark } = useData();
const downsampleOn = ref(true);
const renderMs = ref<number | null>(null);
const chartRef = ref<{ chart: ChartInstance | null } | null>(null);

let t0 = performance.now();
let offRender: (() => void) | undefined;

const options = computed<ChartOptions>(() => ({
  type: 'line',
  theme: isDark.value ? 'dark' : 'light',
  title: 'Server load — 50,000 points',
  subtitle: 'One sample per minute for ~35 days',
  data: {
    series: [{ id: 'load', name: 'CPU load (%)', data }],
  },
  // Numeric epoch-ms x-values are lighter than 50k Date objects, but they
  // infer a linear axis — a time axis must be requested explicitly.
  xAxis: { type: 'time' },
  yAxis: { label: 'Load (%)', min: 0, max: 100 },
  downsample: { enabled: downsampleOn.value },
  animation: false,
}));

onMounted(() => {
  // The chart mounts in the child's onMounted (already run) and schedules
  // its first render; subscribe now and time every committed render.
  offRender = chartRef.value?.chart?.on('render', () => {
    renderMs.value = performance.now() - t0;
  });
});

onBeforeUnmount(() => offRender?.());

function toggleDownsample() {
  t0 = performance.now();
  downsampleOn.value = !downsampleOn.value;
}
</script>

<template>
  <div>
    <div class="demo-large__controls">
      <button type="button" class="demo-large__button" @click="toggleDownsample">
        {{ downsampleOn ? 'Disable' : 'Enable' }} downsampling
      </button>
      <span class="demo-large__stat">
        {{ POINT_COUNT.toLocaleString() }} points ·
        LTTB {{ downsampleOn ? 'on (threshold 5,000)' : 'off — every point drawn' }}
        <template v-if="renderMs !== null">
          · last render {{ renderMs.toFixed(1) }} ms
        </template>
      </span>
    </div>
    <div class="chart-demo demo-large__chart-frame">
      <Chart ref="chartRef" class="chart-demo__chart" :options="options" />
    </div>
  </div>
</template>

<style scoped>
.demo-large__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 16px 0 0;
}

.demo-large__button {
  padding: 6px 16px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 20px;
  background-color: transparent;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
}

.demo-large__button:hover {
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-brand-2);
  background-color: var(--vp-c-brand-soft);
}

.demo-large__stat {
  font-size: 13px;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.demo-large__chart-frame {
  height: 360px;
}
</style>
