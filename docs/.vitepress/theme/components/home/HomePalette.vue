<script setup lang="ts">
/**
 * The palette, both schemes at once.
 *
 * These two charts pin `theme: 'light'` and `theme: 'dark'` and therefore
 * deliberately ignore the site toggle — that is the point of the panel. The
 * swatch rows below them are the actual exported `categoricalPalette`, not
 * hand-copied hex: if a slot ever changes, this section changes with it.
 */
import { Chart } from '@chartcraft/vue';
import { categoricalPalette } from '@chartcraft/core';
import type { ChartOptions } from '@chartcraft/vue';

const base = {
  type: 'bar',
  title: 'Deploys per weekday',
  data: {
    categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    series: [
      { id: 'prod', name: 'Production', data: [14, 18, 16, 21, 9] },
      { id: 'staging', name: 'Staging', data: [22, 25, 24, 27, 15] },
      { id: 'preview', name: 'Preview', data: [31, 29, 34, 38, 21] },
    ],
  },
  yAxis: { min: 0 },
  a11y: { table: 'off' },
} satisfies Omit<ChartOptions, 'theme'>;

const light: ChartOptions = { ...base, subtitle: "theme: 'light'", theme: 'light' };
const dark: ChartOptions = { ...base, subtitle: "theme: 'dark'", theme: 'dark' };

const schemes = [
  { name: 'light', colors: categoricalPalette.light },
  { name: 'dark', colors: categoricalPalette.dark },
];
</script>

<template>
  <div class="cc-palette">
    <div class="cc-palette__panels">
      <div class="cc-palette__panel cc-palette__panel--light">
        <Chart class="cc-palette__chart" :options="light" />
      </div>
      <div class="cc-palette__panel cc-palette__panel--dark">
        <Chart class="cc-palette__chart" :options="dark" />
      </div>
    </div>

    <div class="cc-palette__swatches">
      <div v-for="scheme in schemes" :key="scheme.name" class="cc-palette__row">
        <span class="cc-palette__row-label">{{ scheme.name }}</span>
        <ul class="cc-palette__chips">
          <li
            v-for="(color, i) in scheme.colors"
            :key="color"
            class="cc-palette__chip"
            :style="{ backgroundColor: color }"
            :title="`slot ${i + 1} — ${color}`"
          >
            <span class="cc-palette__sr">slot {{ i + 1 }}, {{ color }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cc-palette {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-palette__panels {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 620px) {
  .cc-palette__panels {
    grid-template-columns: 1fr 1fr;
  }
}

.cc-palette__panel {
  box-sizing: border-box;
  height: 280px;
  padding: 10px;
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-lg);
  box-shadow: var(--cc-shadow-lg);
  overflow: hidden;
}

/* Each panel matches its own pinned scheme's surface, not the site's. */
.cc-palette__panel--light {
  background-color: #fcfcfb;
}

.cc-palette__panel--dark {
  background-color: #1a1a19;
}

.cc-palette__chart,
.cc-palette__chart > div {
  height: 100%;
}

.cc-palette__swatches {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-palette__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cc-palette__row-label {
  width: 46px;
  flex: none;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.cc-palette__chips {
  display: flex;
  flex: 1;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cc-palette__chip {
  flex: 1;
  height: 22px;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.cc-palette__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
