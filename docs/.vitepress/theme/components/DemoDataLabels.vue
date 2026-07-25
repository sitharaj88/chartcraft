<script setup lang="ts">
/**
 * Data labels: `dataLabels` with the five `select` modes. Switch between them —
 * `'auto'` (the default when enabled) keeps endpoints and extremes and then
 * MEASURES every candidate, dropping any label that would collide with a kept
 * label or leave the plot; `'all'` is the caller explicitly asking for
 * everything, collisions included.
 *
 * Labels always wear ink colors, never the series color — the mark carries the
 * color.
 */
import { computed, ref } from 'vue';
import type { ChartOptions, DataLabelOptions } from '@chartcraft/vue';

type Select = NonNullable<DataLabelOptions['select']>;
const modes: Select[] = ['auto', 'all', 'extremes', 'endpoints', 'last'];
const mode = ref<Select>('auto');

const options = computed<Omit<ChartOptions, 'theme'>>(() => ({
  type: 'line',
  title: 'Net new ARR by region',
  subtitle: `dataLabels: { select: '${mode.value}' }`,
  dataLabels: {
    show: true,
    select: mode.value,
    format: (p) => `$${p.formattedY}k`,
  },
  data: {
    categories: [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ],
    series: [
      { id: 'amer', name: 'AMER', data: [412, 388, 441, 468, 452, 511, 534, 498, 562, 588, 604, 671] },
      { id: 'emea', name: 'EMEA', data: [284, 312, 298, 341, 366, 352, 389, 412, 398, 447, 468, 502] },
    ],
  },
  yAxis: { label: 'Net new ARR ($k)', min: 0 },
  a11y: {
    description:
      'Both regions grew through the year, AMER from $412k to $671k of net new ARR per month and EMEA from $284k to $502k, with a dip in each around February and August respectively.',
  },
}));
</script>

<template>
  <div>
    <div class="demo-modes" role="group" aria-label="Data label selectivity">
      <button
        v-for="m in modes"
        :key="m"
        type="button"
        class="demo-modes__button"
        :class="{ 'demo-modes__button--active': m === mode }"
        :aria-pressed="m === mode"
        @click="mode = m"
      >
        {{ m }}
      </button>
    </div>
    <ChartDemo :options="options" :height="380" />
  </div>
</template>

<style scoped>
.demo-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 0;
}

.demo-modes__button {
  padding: 4px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background-color: transparent;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-family: var(--vp-font-family-mono);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
}

.demo-modes__button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.demo-modes__button--active {
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
</style>
