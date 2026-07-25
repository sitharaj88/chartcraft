<script setup lang="ts">
/**
 * Annotations: all four kinds on one chart — a `band` (drawn UNDER the marks, so
 * it never hides data), two reference `line`s, a labeled `point` and free
 * `text`. Labels are `textSecondary` over a surface halo, everything is clipped
 * to the plot, and annotations join the accessible DESCRIPTION rather than the
 * data table.
 *
 * Click any annotation mark: it consumes the click (no `pointclick` follows) and
 * emits `annotationclick` with the index and the original object.
 */
import { ref } from 'vue';
import type { Annotation, ChartEventMap, ChartOptions } from '@chartcraft/vue';

const DAY = 86_400_000;
const start = Date.UTC(2026, 5, 1);

/** Deterministic daily p95 latency with one incident spike. */
function latency(): [number, number][] {
  const out: [number, number][] = [];
  let seed = 5;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 28; i++) {
    let v = 186 + rand() * 34 + (i > 13 ? 22 : 0);
    if (i === 19) v = 412;
    if (i === 20) v = 318;
    out.push([start + i * DAY, Math.round(v)]);
  }
  return out;
}

const annotations: Annotation[] = [
  { kind: 'band', axis: 'y', from: 0, to: 250, label: 'Within SLA' },
  { kind: 'line', axis: 'y', value: 300, label: 'SLA breach (300 ms)' },
  { kind: 'line', axis: 'x', value: new Date(start + 14 * DAY), label: 'Release 4.0' },
  { kind: 'point', x: new Date(start + 19 * DAY), y: 412, label: 'Incident #482' },
  { kind: 'text', x: new Date(start + 24 * DAY), y: 150, text: 'Cache warm-up complete' },
];

const options: Omit<ChartOptions, 'theme'> = {
  type: 'line',
  title: 'p95 API latency',
  subtitle: 'June 2026 · click an annotation',
  annotations,
  data: {
    series: [{ id: 'p95', name: 'p95 latency (ms)', data: latency() }],
  },
  xAxis: { type: 'time' },
  yAxis: { label: 'Latency (ms)', min: 0 },
  a11y: {
    description:
      'p95 latency held near 200 ms until the Release 4.0 deploy on 15 June, after which it settled around 225 ms. Incident #482 on 20 June pushed it to 412 ms for one day.',
  },
};

const last = ref<string | null>(null);

function onAnnotationClick(ev: ChartEventMap['annotationclick']) {
  const a = ev.annotation;
  const name = a.kind === 'text' ? a.text : (a.label ?? a.kind);
  last.value = `annotationclick  index ${ev.index} · ${a.kind} · ${name}`;
}
</script>

<template>
  <div>
    <ChartDemo :options="options" :height="380" @annotation-click="onAnnotationClick" />
    <p class="demo-annotations__log" role="status">
      <code v-if="last">{{ last }}</code>
      <span v-else>No annotation clicked yet — try the SLA line or the incident dot.</span>
    </p>
  </div>
</template>

<style scoped>
.demo-annotations__log {
  margin: 0 0 16px;
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background-color: var(--vp-c-bg-soft);
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.demo-annotations__log code {
  background: none;
  padding: 0;
}
</style>
