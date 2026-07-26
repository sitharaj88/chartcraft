<script setup lang="ts">
/**
 * Northwind Cloud — the Vue 3 port of `samples/vanilla`.
 *
 * `data.ts` and `styles.css` are copied VERBATIM from the vanilla sample; this
 * file is the Vue re-expression of `main.ts` + `index.html`. The shape the
 * vanilla sample establishes is preserved exactly, only spelled reactively:
 *
 *   1. ONE source of truth for the theme — `useTheme()` writes `data-theme` on
 *      `<html>`, which drives both the CSS custom properties and every chart's
 *      `theme` option.
 *   2. Chart options are a PURE FUNCTION of (data, scheme) — `specs.ts`. Here
 *      each builder is wrapped in a `computed`, so an option object is
 *      re-derived exactly when one of its inputs moves and can never disagree
 *      with what is on screen.
 *   3. Charts are created once and then `update()`d. `@chartcraft/vue`
 *      deep-watches `options` and routes changes into `chart.update()`, so a
 *      theme or range change animates instead of flashing empty cards. Nothing
 *      here is keyed or `v-if`-ed on the theme — that would remount and undo it.
 *   4. Teardown is the wrapper's job: `<Chart>` destroys its instance in
 *      `onBeforeUnmount`, so this port needs no `pagehide` handler.
 */
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { version } from '@chartcraft/core';
import type { ChartEventMap, PointEvent, SeriesOptions } from '@chartcraft/core';
import {
  BarChart,
  BoxplotChart,
  ChoroplethChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  SankeyChart,
  TreemapChart,
} from '@chartcraft/vue';
import type { ChartExposed } from '@chartcraft/vue';

import ChartCard from './components/ChartCard.vue';
import Inspector from './components/Inspector.vue';
import StatTile from './components/StatTile.vue';
import TopBar from './components/TopBar.vue';

import { formatNumber, getData } from './data';
import type { DashboardData, RangeKey } from './data';
import {
  capacitySpec,
  contractsSpec,
  flowSpec,
  mrrSpec,
  productsSpec,
  segmentsSpec,
  territoriesSpec,
  ticketsSpec,
} from './specs';
import { buildEntry } from './inspector';
import type { InspectableId, Selection } from './inspector';
import { useTheme } from './useTheme';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const { scheme, toggleTheme } = useTheme();

const range = shallowRef<RangeKey>('12m');
/** `getData` is pure and deterministic, so the dataset is just a `computed`. */
const data = computed(() => getData(range.value));

/* ------------------------------------------------------------------ *
 * Chart options — one `computed` per card
 *
 * The Vue wrapper deep-watches `options`, so a new object from any of these
 * becomes a `chart.update()` on the live instance. Keying them on
 * `(data, scheme)` is the whole pattern.
 * ------------------------------------------------------------------ */

const mrrOptions = computed(() => mrrSpec(data.value, scheme.value));
const capacityOptions = computed(() => capacitySpec(data.value, scheme.value));
const flowOptions = computed(() => flowSpec(data.value, scheme.value));
const productsOptions = computed(() => productsSpec(data.value, scheme.value));
const ticketsOptions = computed(() => ticketsSpec(data.value, scheme.value));
const segmentsOptions = computed(() => segmentsSpec(data.value, scheme.value));
const territoriesOptions = computed(() => territoriesSpec(data.value, scheme.value));
const contractsOptions = computed(() => contractsSpec(data.value, scheme.value));

/* ------------------------------------------------------------------ *
 * Inspector — the visible destination for `@point-click`
 * ------------------------------------------------------------------ */

const usd = (n: number): string => `$${formatNumber(Math.round(n))}`;
const usdK = (n: number): string => `$${formatNumber(Math.round(n))}K`;

/** Cards whose points feed the inspector, with a value formatter each. */
const INSPECTABLE: Record<
  InspectableId,
  {
    title: string;
    format: (n: number) => string;
    /** The series list the swatch colour is resolved against. */
    series: (d: DashboardData) => readonly SeriesOptions[];
  }
> = {
  mrr: { title: 'Recurring revenue', format: usd, series: (d) => d.mrr.series },
  segments: { title: 'Revenue by segment', format: usdK, series: (d) => d.segments.series },
  contracts: {
    title: 'Contract value',
    format: usdK,
    series: (d) => [{ id: 'acv', name: 'Annual contract value', data: d.contracts.samples }],
  },
  tickets: {
    title: 'Support load',
    format: (n) => `${formatNumber(n)} tickets`,
    series: (d) => d.tickets.rows,
  },
};

/** `shallowRef`: a `PointEvent` carries a native DOM `Event`, not app state. */
const selection = shallowRef<Selection | null>(null);

const inspect = (chartId: InspectableId, ev: PointEvent): void => {
  selection.value = { chartId, ev };
};

/**
 * Derived, not captured: the swatch colour comes out of the theme-dependent
 * palette, so a theme flip must re-colour the panel to match the marks.
 */
const entry = computed(() => {
  const sel = selection.value;
  if (!sel) return null;
  const meta = INSPECTABLE[sel.chartId];
  return buildEntry(sel.ev, meta.title, meta.series(data.value), meta.format, scheme.value);
});

/* ------------------------------------------------------------------ *
 * Hero chart: zoom + CSV export
 * ------------------------------------------------------------------ */

/** The one place this app reaches past the declarative API for imperative
 *  calls. `@chartcraft/vue` exposes the live instance as `chart`. */
const hero = useTemplateRef<ChartExposed>('hero');

/** The live brush window, mirrored from the chart's own `zoom` event. */
const zoomWindow = shallowRef<ChartEventMap['zoom']>(null);

/** Reset-zoom affordance: only offered once there is something to reset. */
const zoomed = computed(() => zoomWindow.value !== null);

const onZoom = (window_: ChartEventMap['zoom']): void => {
  zoomWindow.value = window_;
};

/** `zoomTo(null)` emits `zoom: null`, which clears `zoomWindow` for us. */
const resetZoom = (): void => {
  hero.value?.chart?.zoomTo(null);
};

/**
 * A new window invalidates both the old selection and the old zoom — a stale
 * inspector reading is worse than an empty one, and a brush expressed in the
 * previous range's units means nothing in this one.
 */
watch(range, () => {
  selection.value = null;
  zoomWindow.value = null;
});

/**
 * Keep the zoom across a THEME change.
 *
 * The vanilla sample can re-theme with `chart.update({ theme })` — a partial
 * that carries no `data`, which core takes as "the viewport is still valid".
 * The Vue wrapper deep-watches `options` and always re-sends the WHOLE object,
 * so every update carries `data` and core drops the viewport (silently: it
 * does not emit `zoom`). Re-applying the window after the update lands is the
 * app-level fix, and `flush: 'post'` is what orders it after the wrapper's own
 * `pre`-flush watcher has called `update()`.
 */
watch(
  scheme,
  () => {
    const window_ = zoomWindow.value;
    if (window_) hero.value?.chart?.zoomTo(window_);
  },
  { flush: 'post' },
);

const exportCsv = (): void => {
  const chart = hero.value?.chart;
  if (!chart) return;

  // exportData() emits exactly the chart's accessible data table — so the CSV
  // and what a screen reader reads can never disagree, and unlike the table it
  // is never row-capped.
  const csv = chart.exportData({ format: 'csv' });
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `northwind-mrr-${range.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <TopBar
    :range="range"
    :scheme="scheme"
    @update:range="range = $event"
    @toggle-theme="toggleTheme"
    @export="exportCsv"
  />

  <main id="main" class="shell">
    <div class="page-head">
      <div>
        <h1 class="page-head__title">Revenue &amp; product analytics</h1>
        <p class="page-head__meta">{{ data.rangeLabel }} · updated hourly</p>
      </div>
      <p class="page-head__stamp">Data as of 24 Jul 2026 · all figures USD</p>
    </div>

    <section class="kpis" aria-label="Key performance indicators">
      <StatTile v-for="kpi in data.kpis" :key="kpi.id" :kpi="kpi" :scheme="scheme" />
    </section>

    <section class="grid" aria-label="Analytics charts">
      <!-- Row 1 -->
      <ChartCard title="Recurring revenue" :subtitle="data.mrr.subtitle" :span="8" hero>
        <template #actions>
          <button v-if="zoomed" class="btn btn--ghost" type="button" @click="resetZoom">
            Reset zoom
          </button>
        </template>
        <LineChart
          ref="hero"
          class="card__chart"
          :options="mrrOptions"
          @point-click="inspect('mrr', $event)"
          @zoom="onZoom"
        />
      </ChartCard>

      <ChartCard title="Platform capacity" :subtitle="data.capacity.subtitle" :span="4">
        <GaugeChart class="card__chart" :options="capacityOptions" />
      </ChartCard>

      <!-- Row 2 -->
      <ChartCard title="Acquisition flow" :subtitle="data.flow.subtitle" :span="7">
        <SankeyChart class="card__chart" :options="flowOptions" />
      </ChartCard>

      <ChartCard title="Product mix" :subtitle="data.products.subtitle" :span="5">
        <TreemapChart class="card__chart" :options="productsOptions" />
      </ChartCard>

      <!-- Row 3 -->
      <ChartCard title="Support load" :subtitle="data.tickets.subtitle" :span="8">
        <HeatmapChart
          class="card__chart"
          :options="ticketsOptions"
          @point-click="inspect('tickets', $event)"
        />
      </ChartCard>

      <ChartCard title="Revenue by segment" :subtitle="data.segments.subtitle" :span="4">
        <BarChart
          class="card__chart"
          :options="segmentsOptions"
          @point-click="inspect('segments', $event)"
        />
      </ChartCard>

      <!-- Row 4 -->
      <ChartCard title="Territory coverage" :subtitle="data.territories.subtitle" :span="4">
        <ChoroplethChart class="card__chart" :options="territoriesOptions" />
      </ChartCard>

      <ChartCard title="Contract value" :subtitle="data.contracts.subtitle" :span="5">
        <BoxplotChart
          class="card__chart"
          :options="contractsOptions"
          @point-click="inspect('contracts', $event)"
        />
      </ChartCard>

      <ChartCard title="Inspector" subtitle="Selected data point" :span="3" aria-live="polite">
        <Inspector :entry="entry" />
      </ChartCard>
    </section>
  </main>

  <footer class="footer shell">
    <span>
      Northwind Cloud is a fictional product. All figures are synthetic and deterministic.
    </span>
    <span> Built with <code>@chartcraft/vue</code> <code>v{{ version }}</code> </span>
  </footer>
</template>
