<script setup lang="ts">
/**
 * Histogram: the series data is RAW SAMPLES (number[]); the chart bins them
 * itself (histogram.bins, default 'auto' = Freedman–Diaconis clamped 5..60).
 * With 'auto', bin edges are snapped to nice 1/2/5 widths so axis ticks land
 * exactly on the edges.
 */
import type { ChartOptions } from '@chartcraft/vue';

// Deterministic pseudo-normal samples: checkout durations in seconds.
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const samples = Array.from({ length: 420 }, () => {
  const base = 34 + (rnd() + rnd() + rnd() + rnd() - 2) * 26; // bell around ~34s
  const tail = rnd() < 0.07 ? rnd() * 70 : 0; // a slow-checkout tail
  return Math.round(Math.max(4, base + tail) * 10) / 10;
});

const options: Omit<ChartOptions, 'theme'> = {
  type: 'histogram',
  title: 'Checkout duration',
  subtitle: '420 orders, last 7 days',
  histogram: { bins: 'auto' },
  data: {
    series: [{ id: 'checkout', name: 'Orders', data: samples }],
  },
  xAxis: { label: 'Duration (seconds)' },
  yAxis: { label: 'Orders' },
  a11y: {
    description:
      'Checkout durations cluster around 30 to 40 seconds, with a small tail of slow checkouts beyond 80 seconds.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
