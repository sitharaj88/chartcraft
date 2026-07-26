<script setup lang="ts">
/**
 * Code-to-result: the same chart in five flavours, next to the live thing the
 * code produces. The chart on the right IS rendered by the Vue snippet on the
 * left — this page dogfoods `@chartcraft/vue` for every demo it shows.
 */
import { computed, ref } from 'vue';
import { useData } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';
import { highlight } from './highlight';

const tabs = [
  {
    id: 'vanilla',
    label: 'Vanilla',
    code: `import { createChart } from '@chartcraft/core';

const chart = createChart(el, {
  type: 'bar',
  title: 'Revenue by quarter',
  subtitle: 'FY2026, USD millions',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
    ],
  },
});`,
  },
  {
    id: 'react',
    label: 'React',
    code: `import { BarChart } from '@chartcraft/react';

<BarChart
  title="Revenue by quarter"
  subtitle="FY2026, USD millions"
  data={{
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
    ],
  }}
/>`,
  },
  {
    id: 'vue',
    label: 'Vue',
    code: `<script setup lang="ts">
import { BarChart } from '@chartcraft/vue';

const options = {
  title: 'Revenue by quarter',
  subtitle: 'FY2026, USD millions',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
    ],
  },
};
<\/script>

<BarChart :options="options" />`,
  },
  {
    id: 'svelte',
    label: 'Svelte',
    code: `<script lang="ts">
  import { BarChart } from '@chartcraft/svelte';

  const options = {
    title: 'Revenue by quarter',
    subtitle: 'FY2026, USD millions',
    data: {
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
        { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
      ],
    },
  };
<\/script>

<BarChart {options} />`,
  },
  {
    id: 'angular',
    label: 'Angular',
    code: `import { Component } from '@angular/core';
import { CcBarChart } from '@chartcraft/angular';

@Component({
  selector: 'app-revenue',
  imports: [CcBarChart],
  template: \`<cc-bar-chart [options]="options" />\`,
})
export class RevenueComponent {
  readonly options = {
    title: 'Revenue by quarter',
    subtitle: 'FY2026, USD millions',
    data: {
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
        { name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
      ],
    },
  };
}`,
  },
] as const;

const active = ref(0);
const rendered = computed(() => highlight(tabs[active.value].code));

const { isDark } = useData();

const options = computed<ChartOptions>(() => ({
  type: 'bar',
  theme: isDark.value ? 'dark' : 'light',
  title: 'Revenue by quarter',
  subtitle: 'FY2026, USD millions',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { id: 'product', name: 'Product', data: [12.4, 13.1, 14.8, 16.2] },
      { id: 'services', name: 'Services', data: [6.1, 6.4, 7.0, 7.9] },
    ],
  },
  yAxis: { min: 0 },
  a11y: {
    description:
      'Product revenue grew from 12.4 to 16.2 million US dollars across FY2026; services grew from 6.1 to 7.9.',
  },
}));
</script>

<template>
  <div class="cc-code">
    <div class="cc-code__pane">
      <div class="cc-code__tabs" role="tablist" aria-label="Framework">
        <button
          v-for="(tab, i) in tabs"
          :id="`cc-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="cc-code__tab"
          :class="{ 'is-active': i === active }"
          :aria-selected="i === active"
          :tabindex="i === active ? 0 : -1"
          :aria-controls="`cc-panel-${tab.id}`"
          @click="active = i"
        >
          {{ tab.label }}
        </button>
      </div>
      <div
        :id="`cc-panel-${tabs[active].id}`"
        class="cc-code__body"
        role="tabpanel"
        :aria-labelledby="`cc-tab-${tabs[active].id}`"
        tabindex="0"
      >
        <pre><code v-html="rendered" /></pre>
      </div>
    </div>

    <div class="cc-code__result">
      <span class="cc-code__result-label">Renders</span>
      <div class="cc-code__frame">
        <Chart class="cc-code__chart" :options="options" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.cc-code {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  align-items: stretch;
}

@media (min-width: 900px) {
  .cc-code {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

.cc-code__pane,
.cc-code__result {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cc-code__pane {
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-lg);
  background-color: var(--vp-c-bg-alt);
  box-shadow: var(--cc-shadow);
  overflow: hidden;
}

.cc-code__tabs {
  display: flex;
  gap: 2px;
  padding: 6px 6px 0;
  border-bottom: 1px solid var(--cc-border);
  overflow-x: auto;
}

.cc-code__tab {
  flex: none;
  padding: 9px 15px;
  border: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  font-size: 13px;
  font-weight: 650;
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: color 0.18s ease, background-color 0.18s ease;
}

.cc-code__tab:hover {
  color: var(--vp-c-text-1);
}

.cc-code__tab.is-active {
  background-color: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  box-shadow: inset 0 -2px 0 var(--vp-c-brand-1);
}

.cc-code__tab:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

.cc-code__body {
  flex: 1;
  min-height: 0;
  background-color: var(--vp-c-bg);
  overflow: auto;
}

.cc-code__body:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

.cc-code__body pre {
  margin: 0;
  padding: 18px 20px;
}

.cc-code__body code {
  display: block;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.72;
  color: var(--vp-c-text-2);
  white-space: pre;
  tab-size: 2;
}

.cc-code__body :deep(.cc-tok-k) {
  color: #8250df;
  font-weight: 600;
}

.cc-code__body :deep(.cc-tok-s) {
  color: #0a7b58;
}

.cc-code__body :deep(.cc-tok-c) {
  color: var(--vp-c-text-3);
  font-style: italic;
}

.cc-code__body :deep(.cc-tok-n) {
  color: #b34a17;
}

:global(.dark) .cc-code__body :deep(.cc-tok-k) {
  color: #c193f5;
}

:global(.dark) .cc-code__body :deep(.cc-tok-s) {
  color: #57c48f;
}

:global(.dark) .cc-code__body :deep(.cc-tok-n) {
  color: #f0a06a;
}

.cc-code__result-label {
  display: inline-block;
  margin: 0 0 8px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.cc-code__frame {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 320px;
  padding: 10px;
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-lg);
  background-color: var(--vp-c-bg);
  box-shadow: var(--cc-shadow-lg);
  overflow: hidden;
}

.cc-code__chart {
  flex: 1;
  min-height: 0;
}

.cc-code__chart > div {
  height: 100%;
}
</style>
