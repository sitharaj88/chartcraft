<script setup lang="ts">
/**
 * Accessibility demo: the same chart, with its normally-hidden data table
 * made visible (`a11y.table: 'visible'`). Nothing here is authored — the
 * table, the accessible name and the keyboard target are generated from the
 * same model that draws the pixels, so they cannot drift apart.
 *
 * Tab into the chart and walk the points with the arrow keys.
 */
import { computed } from 'vue';
import { useData } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';

const { isDark } = useData();

const options = computed<ChartOptions>(() => ({
  type: 'bar',
  theme: isDark.value ? 'dark' : 'light',
  title: 'Deploys per weekday',
  subtitle: 'Tab to the chart, then use the arrow keys',
  data: {
    categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    series: [
      { id: 'prod', name: 'Production', data: [14, 18, 16, 21, 9] },
      { id: 'staging', name: 'Staging', data: [22, 25, 24, 27, 15] },
    ],
  },
  yAxis: { label: 'Deploys', min: 0 },
  a11y: {
    table: 'visible',
    description:
      'Both environments peak on Thursday and fall sharply on Friday. Staging runs roughly 50 percent more deploys than production every day.',
  },
}));
</script>

<template>
  <div class="cc-a11y">
    <div class="cc-a11y__chart">
      <Chart class="cc-a11y__inner" :options="options" />
    </div>
    <p class="cc-a11y__note">
      The table below the chart is the <code>a11y.table</code> fallback, shown here instead of
      visually hidden. It is what a screen reader reads, and what
      <code>exportData()</code> writes to CSV — the same rows, always.
    </p>
  </div>
</template>

<style scoped>
.cc-a11y {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-a11y__chart {
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-lg);
  background-color: var(--vp-c-bg);
  box-shadow: var(--cc-shadow-lg);
  /* Tall enough for legend + the 320px canvas + all five table rows, so the
     card never shows an inner scrollbar clipping a row mid-height. */
  max-height: 680px;
  overflow: auto;
}

/*
 * Core lays the chart root out as a flex ROW (canvas | table | announcer),
 * which is right when the table is visually hidden and takes no space. With
 * `table: 'visible'` we want it stacked, so the column direction is set here
 * — presentation, in the page's own stylesheet, exactly where it belongs.
 */
.cc-a11y__inner > :deep(.chartcraft) {
  flex-direction: column;
  height: auto;
}

/*
 * Reserve the canvas its own height above the visible table.
 *
 * `!important` is load-bearing, not laziness: core sets `flex: 1 1 auto` as an
 * INLINE style on the wrapper, and an inline declaration beats a stylesheet
 * rule regardless of specificity. Without it this rule silently lost, the wrap
 * collapsed to ~150px, and the plot rendered ~55px tall with the y-axis ticks
 * (30/25/20/15/10/5/0) overlapping into an unreadable block — in the section
 * whose headline is "every chart is readable". `height` is not set inline, so
 * it applies normally and pins the box for a flex-basis of `auto`.
 */
.cc-a11y__inner :deep(.chartcraft-canvas-wrap) {
  flex: 0 0 320px !important;
  height: 320px;
}

.cc-a11y__inner :deep(table) {
  width: 100%;
  margin-top: 14px;
  border-collapse: collapse;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.cc-a11y__inner :deep(caption) {
  padding-bottom: 6px;
  font-size: 12px;
  text-align: left;
  color: var(--vp-c-text-3);
}

.cc-a11y__inner :deep(th),
.cc-a11y__inner :deep(td) {
  padding: 5px 10px;
  border: 1px solid var(--cc-border);
  text-align: left;
  color: var(--vp-c-text-2);
}

.cc-a11y__inner :deep(th) {
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-weight: 650;
}

.cc-a11y__note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

.cc-a11y__note code {
  font-size: 0.94em;
  padding: 1px 5px;
  border-radius: 5px;
  background-color: var(--vp-c-bg-soft);
}
</style>
