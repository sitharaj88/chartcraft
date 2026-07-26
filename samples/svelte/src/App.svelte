<!--
  Northwind Cloud — the dashboard.

  The shape this app establishes (mirroring the vanilla sample so all five ports
  render the same board):

    1. ONE source of truth for the theme — `data-theme` on <html> drives both
       the CSS custom properties and the ChartCraft `theme` option. The `$effect`
       below is the only place the document is touched.
    2. Chart options are a PURE FUNCTION of (data, scheme): `chartSpecs()`. It is
       a `$derived`, so first render and every re-render consume identical specs
       and can never disagree.
    3. Charts are created once and then updated. `@chartcraft/svelte` routes a
       changed `options` prop through `chart.update()`, and the KPI `{#each}` is
       keyed, so nothing is torn down and rebuilt on a theme or range change —
       that is what keeps the transition animated instead of a flash of empty
       cards.
    4. Teardown is the wrapper's job: each component `destroy()`s its chart and
       drops its listeners in `onDestroy`, so there is no manual bookkeeping.
-->
<script lang="ts">
  import { version } from '@chartcraft/core';
  import {
    BarChart,
    BoxplotChart,
    ChoroplethChart,
    GaugeChart,
    HeatmapChart,
    LineChart,
    SankeyChart,
    TreemapChart,
  } from '@chartcraft/svelte';
  import type { PointEvent, ZoomRange } from '@chartcraft/svelte';

  import ChartCard from './lib/ChartCard.svelte';
  import Inspector from './lib/Inspector.svelte';
  import StatTile from './lib/StatTile.svelte';
  import TopBar from './lib/TopBar.svelte';

  import { getData } from './data';
  import type { RangeKey } from './data';
  import { chartSpecs } from './specs';
  import { INSPECTABLE } from './selection';
  import type { InspectableKey, Selection } from './selection';
  import { applyScheme, preferredScheme } from './theme';
  import type { Scheme } from './theme';

  /* ---------------- State ---------------- */

  let scheme = $state<Scheme>(preferredScheme());
  let range = $state<RangeKey>('12m');
  let selection = $state<Selection | null>(null);
  let zoomed = $state(false);

  /** The hero chart component, for `getChart()` (export + programmatic zoom). */
  let hero = $state<LineChart>();

  const data = $derived(getData(range));
  const specs = $derived(chartSpecs(data, scheme));

  // The theme's side-effects. Charts pick the scheme up through their specs.
  $effect(() => applyScheme(scheme));

  /* ---------------- Handlers ---------------- */

  function setRange(next: RangeKey): void {
    if (next === range) return;
    range = next;
    // A new window invalidates the old selection — and a stale inspector
    // reading is worse than an empty one.
    selection = null;
    zoomed = false;
  }

  /** `pointclick` → Inspector. The key names both the card and its formatter. */
  function inspect(key: InspectableKey, ev: PointEvent): void {
    selection = {
      cardTitle: INSPECTABLE[key].title,
      format: INSPECTABLE[key].format,
      ev,
      series: specs[key].data.series ?? [],
    };
  }

  /** Reset-zoom affordance: only offered once there is something to reset. */
  function onZoom(window_: ZoomRange): void {
    zoomed = window_ !== null;
  }

  function resetZoom(): void {
    hero?.getChart()?.zoomTo(null);
    zoomed = false;
  }

  function exportCsv(): void {
    const chart = hero?.getChart();
    if (!chart) return;

    // exportData() emits exactly the chart's accessible data table — so the
    // CSV and what a screen reader reads can never disagree, and unlike the
    // table it is never row-capped.
    const csv = chart.exportData({ format: 'csv' });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `northwind-mrr-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<TopBar
  {range}
  {scheme}
  onrange={setRange}
  onexport={exportCsv}
  ontoggletheme={() => (scheme = scheme === 'dark' ? 'light' : 'dark')}
/>

<main class="shell" id="main">
  <div class="page-head">
    <div>
      <h1 class="page-head__title">Revenue &amp; product analytics</h1>
      <p class="page-head__meta">{data.rangeLabel} · updated hourly</p>
    </div>
    <p class="page-head__stamp">Data as of 24 Jul 2026 · all figures USD</p>
  </div>

  <section class="kpis" aria-label="Key performance indicators">
    {#each data.kpis as kpi (kpi.id)}
      <StatTile {kpi} {scheme} />
    {/each}
  </section>

  <section class="grid" aria-label="Analytics charts">
    <!-- Row 1 -->
    <ChartCard title="Recurring revenue" subtitle={data.mrr.subtitle} span={8} hero>
      {#snippet action()}
        {#if zoomed}
          <button class="btn btn--ghost" type="button" onclick={resetZoom}>Reset zoom</button>
        {/if}
      {/snippet}
      <LineChart
        bind:this={hero}
        class="card__chart"
        options={specs.mrr}
        on:pointclick={(e) => inspect('mrr', e.detail)}
        on:zoom={(e) => onZoom(e.detail)}
      />
    </ChartCard>

    <ChartCard title="Platform capacity" subtitle={data.capacity.subtitle} span={4}>
      <GaugeChart class="card__chart" options={specs.capacity} />
    </ChartCard>

    <!-- Row 2 -->
    <ChartCard title="Acquisition flow" subtitle={data.flow.subtitle} span={7}>
      <SankeyChart class="card__chart" options={specs.flow} />
    </ChartCard>

    <ChartCard title="Product mix" subtitle={data.products.subtitle} span={5}>
      <TreemapChart class="card__chart" options={specs.products} />
    </ChartCard>

    <!-- Row 3 -->
    <ChartCard title="Support load" subtitle={data.tickets.subtitle} span={8}>
      <HeatmapChart
        class="card__chart"
        options={specs.tickets}
        on:pointclick={(e) => inspect('tickets', e.detail)}
      />
    </ChartCard>

    <ChartCard title="Revenue by segment" subtitle={data.segments.subtitle} span={4}>
      <BarChart
        class="card__chart"
        options={specs.segments}
        on:pointclick={(e) => inspect('segments', e.detail)}
      />
    </ChartCard>

    <!-- Row 4 -->
    <ChartCard title="Territory coverage" subtitle={data.territories.subtitle} span={4}>
      <ChoroplethChart class="card__chart" options={specs.territories} />
    </ChartCard>

    <ChartCard title="Contract value" subtitle={data.contracts.subtitle} span={5}>
      <BoxplotChart
        class="card__chart"
        options={specs.contracts}
        on:pointclick={(e) => inspect('contracts', e.detail)}
      />
    </ChartCard>

    <ChartCard title="Inspector" subtitle="Selected data point" span={3} live>
      <Inspector {selection} {scheme} />
    </ChartCard>
  </section>
</main>

<footer class="footer shell">
  <span>
    Northwind Cloud is a fictional product. All figures are synthetic and deterministic.
  </span>
  <span>
    Built with <code>@chartcraft/svelte</code> <code>v{version}</code>
  </span>
</footer>
