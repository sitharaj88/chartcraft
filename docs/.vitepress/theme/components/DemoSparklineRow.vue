<script setup lang="ts">
/**
 * Sparklines in a stat-tile row: three chrome-free inline charts under big
 * numbers. The sparkline preset removes axes, grid, legend, and title
 * padding (tooltip defaults off too); keyboard navigation and the a11y
 * table stay on. The tile text carries the headline value — the sparkline
 * carries the shape.
 */
import type { ChartOptions } from '@chartcraft/vue';

const spark = (
  id: string,
  name: string,
  data: number[],
  description: string,
): Omit<ChartOptions, 'theme'> => ({
  type: 'sparkline',
  data: { series: [{ id, name, data }] },
  a11y: { title: name, description },
});

const tiles = [
  {
    label: 'Monthly revenue',
    value: '$128.4k',
    delta: '+8.1%',
    up: true,
    options: spark(
      'revenue',
      'Monthly revenue',
      [96, 101, 99, 104, 108, 113, 111, 117, 119, 124, 122, 128],
      'Revenue rose from 96 to 128 thousand dollars over twelve months.',
    ),
  },
  {
    label: 'Active users',
    value: '24,110',
    delta: '+3.4%',
    up: true,
    options: spark(
      'users',
      'Active users',
      [19.9, 20.4, 21.1, 20.8, 21.6, 22.0, 22.7, 22.4, 23.1, 23.3, 23.8, 24.1],
      'Active users grew steadily from 19.9 to 24.1 thousand over twelve months.',
    ),
  },
  {
    label: 'p95 latency',
    value: '212 ms',
    delta: '−9.6%',
    up: false,
    options: spark(
      'latency',
      'p95 latency',
      [251, 246, 258, 240, 236, 229, 233, 224, 219, 226, 215, 212],
      'p95 latency improved from 251 to 212 milliseconds over twelve weeks.',
    ),
  },
];
</script>

<template>
  <div class="stat-tiles">
    <div v-for="tile in tiles" :key="tile.label" class="stat-tile">
      <span class="stat-tile__label">{{ tile.label }}</span>
      <span class="stat-tile__value">{{ tile.value }}</span>
      <span class="stat-tile__delta">{{ tile.delta }} vs. previous period</span>
      <ChartDemo :options="tile.options" :height="48" />
    </div>
  </div>
</template>

<style scoped>
.stat-tiles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin: 16px 0;
}

@media (min-width: 720px) {
  .stat-tiles {
    grid-template-columns: repeat(3, 1fr);
  }
}

.stat-tile {
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background-color: var(--vp-c-bg);
}

.stat-tile__label {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.stat-tile__value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--vp-c-text-1);
  font-variant-numeric: tabular-nums;
}

.stat-tile__delta {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

/* The sparkline is inside a tile that already has the frame — strip
   ChartDemo's own border/padding so the chart sits flush. */
.stat-tile :deep(.chart-demo) {
  margin: 10px 0 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}
</style>
