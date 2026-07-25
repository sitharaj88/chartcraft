<script setup lang="ts">
/**
 * Zoom, pan & brush on a 60,000-point series.
 *
 * Drag a region to zoom · ctrl/⌘ + wheel to zoom about the pointer ·
 * drag to pan once zoomed (Shift + drag brushes again) · Shift + arrows to pan
 * from the keyboard · Escape or double-click to reset.
 *
 * Downsampling re-runs against the VISIBLE window, so every zoom step reveals
 * real detail rather than magnifying the LTTB result. The `zoom` event fires
 * once per completed gesture and carries the window (or `null` on reset).
 */
import { computed, ref } from 'vue';
import type { ChartEventMap, ChartInstance, ChartOptions } from '@chartcraft/vue';

const POINT_COUNT = 60_000;
const STEP_MS = 30_000; // one sample per 30 s ≈ 21 days

/** Deterministic random walk with a daily cycle and two spikes. */
function series(): [number, number][] {
  const out: [number, number][] = [];
  const start = Date.UTC(2026, 4, 1);
  let value = 320;
  let seed = 11;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < POINT_COUNT; i++) {
    const daily = Math.sin((i / 2880) * 2 * Math.PI) * 48;
    value += (rand() - 0.5) * 7 + (320 - value) * 0.0015;
    const spike = i === 21_000 || i === 44_500 ? 260 : 0;
    out.push([start + i * STEP_MS, Math.round(value + daily + spike)]);
  }
  return out;
}

const data = series();

const options: Omit<ChartOptions, 'theme'> = {
  type: 'line',
  title: 'Requests per second',
  subtitle: '60,000 samples · drag to zoom, ctrl/⌘ + wheel to zoom, Esc to reset',
  data: { series: [{ id: 'rps', name: 'Requests/s', data, showMarkers: false }] },
  xAxis: { type: 'time' },
  yAxis: { label: 'Requests/s', min: 0 },
  zoom: { enabled: true, axis: 'x', wheel: true, drag: true, pan: true, minSpan: 10 * 60_000 },
  animation: false,
  a11y: {
    description:
      'Request rate oscillates on a daily cycle around 320 per second over three weeks, with two isolated spikes above 600.',
  },
};

const demo = ref<{ chart: ChartInstance | null } | null>(null);
const viewport = ref<ChartEventMap['zoom']>(null);

const label = computed(() => {
  const w = viewport.value;
  if (!w || !w.x) return 'Full extent — 60,000 points, downsampled to the plot width';
  const [a, b] = w.x;
  const fmt = (ms: number) =>
    new Date(ms).toISOString().replace('T', ' ').slice(0, 16).concat(' UTC');
  const minutes = Math.round((b - a) / 60_000);
  return `${fmt(a)} → ${fmt(b)} (${minutes.toLocaleString()} min visible)`;
});

function reset() {
  demo.value?.chart?.zoomTo(null);
}
</script>

<template>
  <div>
    <div class="demo-zoom__controls">
      <button type="button" class="demo-zoom__button" @click="reset">Reset zoom</button>
      <span class="demo-zoom__stat">{{ label }}</span>
    </div>
    <ChartDemo ref="demo" :options="options" :height="380" @zoom="viewport = $event" />
  </div>
</template>

<style scoped>
.demo-zoom__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 16px 0 0;
}

.demo-zoom__button {
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

.demo-zoom__button:hover {
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-brand-2);
  background-color: var(--vp-c-brand-soft);
}

.demo-zoom__stat {
  font-size: 13px;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
</style>
