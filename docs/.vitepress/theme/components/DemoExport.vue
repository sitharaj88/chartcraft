<script setup lang="ts">
/**
 * Export: `exportImage()` re-renders the TARGET frame offscreen at `scale`
 * (default 2) and resolves a `Blob`; `exportData()` returns exactly the
 * accessible table's contents as CSV or JSON — one spec backs both, so the
 * export can never disagree with the table a screen reader reads.
 *
 * The PNG button downloads a real file. The CSV button prints the string below
 * the chart; toggle a series off in the legend and export again to see that the
 * export mirrors the table, hidden series included.
 */
import { ref } from 'vue';
import type { ChartInstance, ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'bar',
  title: 'Revenue by quarter and product line',
  subtitle: 'Export this chart as a PNG or as CSV',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { id: 'platform', name: 'Platform', data: [12.4, 13.8, 15.1, 16.9] },
      { id: 'analytics', name: 'Analytics', data: [4.1, 5.2, 6.4, 7.8] },
      { id: 'services', name: 'Services', data: [2.6, 2.4, 3.1, 3.4] },
    ],
  },
  yAxis: { label: 'Revenue ($M)', min: 0 },
  a11y: {
    description:
      'All three product lines grew every quarter; platform revenue rose from $12.4M to $16.9M and analytics nearly doubled from $4.1M to $7.8M.',
  },
};

const demo = ref<{ chart: ChartInstance | null } | null>(null);
const csv = ref<string | null>(null);
const error = ref<string | null>(null);

async function downloadPng() {
  const chart = demo.value?.chart;
  if (!chart) return;
  error.value = null;
  try {
    const blob = await chart.exportImage({ format: 'png', scale: 2 });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revenue-by-quarter.png';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function showCsv() {
  const chart = demo.value?.chart;
  if (!chart) return;
  error.value = null;
  csv.value = chart.exportData({ format: 'csv' });
}
</script>

<template>
  <div>
    <div class="demo-export__controls">
      <button type="button" class="demo-export__button" @click="downloadPng">
        Download PNG (2×)
      </button>
      <button type="button" class="demo-export__button" @click="showCsv">Export CSV</button>
    </div>
    <ChartDemo ref="demo" :options="options" :height="360" />
    <p v-if="error" class="demo-export__error" role="alert"><code>{{ error }}</code></p>
    <pre v-if="csv" class="demo-export__csv">{{ csv }}</pre>
  </div>
</template>

<style scoped>
.demo-export__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 16px 0 0;
}

.demo-export__button {
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

.demo-export__button:hover {
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-brand-2);
  background-color: var(--vp-c-brand-soft);
}

.demo-export__error {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--vp-c-danger-1, var(--vp-c-text-2));
}

.demo-export__csv {
  margin: 0 0 16px;
  max-height: 220px;
  overflow: auto;
  font-size: 12.5px;
  line-height: 1.5;
}
</style>
