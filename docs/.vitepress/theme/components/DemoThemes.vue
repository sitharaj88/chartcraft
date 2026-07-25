<script setup lang="ts">
/**
 * Explicit `theme: 'light'` and `theme: 'dark'` side by side.
 * These two charts deliberately ignore the site's dark-mode toggle —
 * that is the point: pinned themes stay pinned.
 */
import { Chart } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';

const base = {
  type: 'bar',
  title: 'Deploys per weekday',
  data: {
    categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    series: [
      { id: 'prod', name: 'Production', data: [14, 18, 16, 21, 9] },
      { id: 'staging', name: 'Staging', data: [22, 25, 24, 27, 15] },
    ],
  },
} satisfies Omit<ChartOptions, 'theme'>;

const light: ChartOptions = { ...base, subtitle: "theme: 'light'", theme: 'light' };
const dark: ChartOptions = { ...base, subtitle: "theme: 'dark'", theme: 'dark' };
</script>

<template>
  <div class="demo-themes">
    <div class="chart-demo demo-themes__panel demo-themes__panel--light">
      <Chart class="chart-demo__chart" :options="light" />
    </div>
    <div class="chart-demo demo-themes__panel demo-themes__panel--dark">
      <Chart class="chart-demo__chart" :options="dark" />
    </div>
  </div>
</template>

<style scoped>
.demo-themes {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 16px;
}

@media (min-width: 720px) {
  .demo-themes {
    grid-template-columns: 1fr 1fr;
  }
}

.demo-themes__panel {
  height: 320px;
}

/* Panels match each chart's own surface, whatever the site mode is. */
.demo-themes__panel--light {
  background-color: #fcfcfb;
}

.demo-themes__panel--dark {
  background-color: #1a1a19;
}
</style>
