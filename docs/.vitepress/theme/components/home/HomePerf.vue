<script setup lang="ts">
/**
 * Performance demo: pick a point count, watch the real render time.
 *
 * The number under the chart is measured in YOUR browser on the chart's
 * `render` event, not quoted from a table. The chart mounts with 10,000
 * points — cheap enough to pay for on page load — and the larger sets are
 * generated only when asked for, because a million `[x, y]` tuples is tens of
 * megabytes nobody should allocate for a page they might scroll past.
 *
 * Subscription timing matters: the chart instance exists after the child's
 * `onMounted`, but its FIRST render is only scheduled there, so subscribing in
 * the parent's `onMounted` still catches it.
 *
 * Drag on the plot to zoom: LTTB re-runs inside the zoom window, so detail
 * that was downsampled away at full extent comes back.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useData } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartExposed, ChartOptions } from '@chartcraft/vue';

const SIZES = [10_000, 100_000, 1_000_000] as const;
type Size = (typeof SIZES)[number];

function build(n: Size): [number, number][] {
  const out: [number, number][] = new Array(n);
  const start = Date.UTC(2026, 4, 1);
  const stepMs = Math.round((21 * 86_400_000) / n);
  let value = 320;
  let seed = 11;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const period = n / 21;
  const spikeA = Math.floor(n * 0.35);
  const spikeB = Math.floor(n * 0.74);
  for (let i = 0; i < n; i++) {
    const daily = Math.sin((i / period) * 2 * Math.PI) * 46;
    value += (rand() - 0.5) * 7 + (320 - value) * 0.0015;
    const spike = i === spikeA || i === spikeB ? 240 : 0;
    out[i] = [start + i * stepMs, Math.round(value + daily + spike)];
  }
  return out;
}

const { isDark } = useData();

const demo = ref<ChartExposed | null>(null);
const size = ref<Size>(10_000);
const busy = ref(false);
const renderMs = ref<number | null>(null);
const points = shallowRef<[number, number][]>(build(10_000));

const options = computed<ChartOptions>(() => ({
  type: 'line',
  theme: isDark.value ? 'dark' : 'light',
  title: 'Requests per second',
  subtitle: 'Drag on the plot to zoom · ctrl/⌘ + wheel · Esc resets',
  data: { series: [{ id: 'rps', name: 'Requests/s', data: points.value, showMarkers: false }] },
  xAxis: { type: 'time' },
  yAxis: { label: 'Requests/s', min: 0 },
  zoom: { enabled: true, axis: 'x', wheel: true, drag: true, pan: true, minSpan: 10 * 60_000 },
  animation: false,
  downsample: { enabled: true },
  a11y: {
    // A million rows must never be materialised into the DOM table.
    tableMaxRows: 200,
    description:
      'Request rate oscillates on a daily cycle around 320 per second over three weeks, with two isolated spikes above 550.',
  },
}));

/**
 * `chart.update()` is fully synchronous — it builds the model, lays out and
 * draws before it returns (see `Chart.refresh`). So the honest measurement is
 * the window around the Vue flush that calls it: generating the points is
 * excluded, ingest + model + downsample + layout + draw are all inside.
 */
async function load(n: Size): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  renderMs.value = null;
  // Yield a real frame so the pressed chip paints before the blocking build.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const data = build(n);
  size.value = n;

  const t = performance.now();
  points.value = data;
  await nextTick(); // the wrapper's deep watcher has now run chart.update()
  renderMs.value = performance.now() - t;

  busy.value = false;
}

onMounted(() => {
  // One measured update at the mounted size, so the readout is never empty.
  void load(10_000);
});

onBeforeUnmount(() => {
  points.value = [];
});

function reset(): void {
  demo.value?.chart?.zoomTo(null);
}

const fmt = new Intl.NumberFormat('en-US');
</script>

<template>
  <div class="cc-perf">
    <div class="cc-perf__frame">
      <Chart ref="demo" class="cc-perf__chart" :options="options" />
    </div>

    <div class="cc-perf__bar">
      <div class="cc-chips" role="group" aria-label="Number of points to render">
        <button
          v-for="n in SIZES"
          :key="n"
          type="button"
          class="cc-chip"
          :aria-pressed="size === n"
          :disabled="busy"
          @click="load(n)"
        >
          {{ fmt.format(n) }} points
        </button>
        <button type="button" class="cc-chip" @click="reset">Reset zoom</button>
      </div>

      <p class="cc-perf__readout">
        <template v-if="busy">Generating {{ fmt.format(size) }} points…</template>
        <template v-else-if="renderMs !== null">
          <strong>{{ renderMs.toFixed(0) }} ms</strong> to ingest, model and draw
          {{ fmt.format(size) }} points in this browser — LTTB reduces them to the plot
          width, then re-runs inside every zoom window.
        </template>
        <template v-else>Measuring…</template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.cc-perf {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cc-perf__frame {
  box-sizing: border-box;
  padding: 10px;
  height: 400px;
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-lg);
  background-color: var(--vp-c-bg);
  box-shadow: var(--cc-shadow-lg);
  overflow: hidden;
}

.cc-perf__chart,
.cc-perf__chart > div {
  height: 100%;
}

.cc-perf__bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cc-chip:disabled {
  opacity: 0.5;
  cursor: progress;
}

.cc-perf__readout {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}

.cc-perf__readout strong {
  color: var(--vp-c-text-1);
}
</style>
