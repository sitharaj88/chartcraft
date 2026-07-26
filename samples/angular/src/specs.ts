/**
 * Chart specs — a PURE FUNCTION of (data, scheme).
 *
 * Nothing here touches the DOM or Angular: it is the same `chartSpecs()` idea as
 * the vanilla sample's `main.ts`, lifted into its own module so the components
 * stay templates. Because every spec is derived from the same two inputs, a
 * re-render can never disagree with a first render.
 *
 * ─── Why this file is load-bearing in Angular ──────────────────────────────
 *
 * `@chartcraft/angular` watches the `options` input with an `effect()`, which
 * reacts to **reference** changes. So the update contract is: BUILD A NEW
 * OBJECT. `App` wraps this function in a single `computed()`, which is exactly
 * the right shape — a computed re-runs when (and only when) `data` or `scheme`
 * moves, and it produces a brand-new options object every time it does.
 *
 *     // ✅ what App does — a new object per (data, scheme)
 *     readonly specs = computed(() => chartSpecs(this.data(), this.scheme()));
 *
 *     // ❌ would render nothing new — same reference
 *     this.specs().mrr.theme = 'dark';
 *
 * The per-type components (`<cc-line-chart>`, `<cc-gauge-chart>`, …) inject
 * `type` themselves, so these specs are `TypedChartOptions`
 * (= `Omit<ChartOptions, 'type'>`).
 *
 * Titles live in the card chrome (real headings, in the document outline), not
 * in the canvas, so `title`/`subtitle` are deliberately NOT passed to the
 * charts. Each chart still gets `a11y.title`/`a11y.description`, so the canvas
 * is never an unlabeled black box to assistive tech.
 */

import { darkTheme, lightTheme } from '@chartcraft/core';
import type { TypedChartOptions } from '@chartcraft/angular';

import { salesTerritories } from './data';
import type { DashboardData, KpiTile } from './data';
import type { Scheme } from './theme';

/** One spec per card, keyed so the inspector can name its source. */
export interface ChartSpecs {
  mrr: TypedChartOptions;
  capacity: TypedChartOptions;
  flow: TypedChartOptions;
  products: TypedChartOptions;
  tickets: TypedChartOptions;
  segments: TypedChartOptions;
  territories: TypedChartOptions;
  contracts: TypedChartOptions;
}

export function chartSpecs(d: DashboardData, mode: Scheme): ChartSpecs {
  const t = mode === 'dark' ? darkTheme : lightTheme;

  return {
    /* ---- Hero: MRR by segment on a real time axis ---------------- *
     * A line is the only honest form for "how did this move over time",
     * and two segments on ONE y-axis is the whole point — an Enterprise /
     * Self-serve split would otherwise be tempting to draw as dual axes.
     *
     * Carries three cross-cutting features that earn their place here:
     *   · `annotations` — the Atlas 2.0 launch is the reason for the bend
     *     in the Enterprise line; without the marker the chart poses a
     *     question it does not answer.
     *   · `zoom` — 90 daily points is more than fits, so a brush-drag is
     *     the difference between "a shape" and "a readable series".
     *   · `dataLabels: 'last'` — direct labels at the line ends, which is
     *     the documented alternative to making the reader trace back to
     *     the axis. Selectivity matters: a label on every point is noise.
     */
    mrr: {
      theme: mode,
      data: { series: d.mrr.series },
      // Direct end-labels and the final time tick are both drawn OUTSIDE the
      // plot rect and are otherwise clipped by the canvas edge — the default
      // padding reserves no room for either.
      padding: { right: 56 },
      xAxis: { type: 'time' },
      yAxis: {
        label: 'MRR',
        ticks: { format: (v) => `$${Math.round(Number(v) / 1000)}k` },
      },
      legend: { position: 'top' },
      zoom: { enabled: true, axis: 'x' },
      dataLabels: {
        show: true,
        select: 'last',
        format: (p) => `$${Math.round(Number(p.y) / 1000)}k`,
      },
      annotations: [
        {
          kind: 'line',
          axis: 'x',
          value: d.mrr.launchAt,
          label: d.mrr.launchLabel,
          dashed: true,
        },
      ],
      a11y: { title: 'Recurring revenue by segment', description: d.mrr.a11y },
    },

    /* ---- Gauge: one value against known thresholds --------------- *
     * Capacity has a hard ceiling and named danger zones, which is exactly
     * (and only) when a gauge beats a stat tile.
     */
    capacity: {
      theme: mode,
      gauge: {
        min: 0,
        max: 100,
        // `bands[].color` is required and `Theme` exposes no "warning" slot,
        // so the middle step is the status hue the library's own gauge
        // example documents. The two ends come from the theme.
        bands: [
          { to: 60, color: t.up },
          { to: 85, color: '#c98500' },
          { to: 100, color: t.down },
        ],
      },
      data: { series: [{ id: 'capacity', name: 'Capacity used', data: [d.capacity.value] }] },
      a11y: { title: 'Platform capacity use', description: d.capacity.a11y },
    },

    /* ---- Sankey: a branching conversion flow --------------------- *
     * The acquisition path branches (bounced / stalled / lapsed), and a
     * funnel cannot show where the drop-offs went — only that they went.
     */
    flow: {
      theme: mode,
      sankey: { nodeWidth: 12, nodePadding: 12, align: 'justify' },
      data: { series: [{ id: 'flow', name: 'Accounts', data: d.flow.data }] },
      a11y: { title: 'Acquisition flow', description: d.flow.a11y },
    },

    /* ---- Treemap: nested part-to-whole --------------------------- *
     * Eleven leaves under four parents. A bar chart would need two charts
     * or a nested axis; area carries the hierarchy in one glance.
     */
    products: {
      theme: mode,
      data: { series: [{ id: 'revenue', name: 'Revenue', data: d.products.nodes }] },
      a11y: { title: 'Revenue by product line', description: d.products.a11y },
    },

    /* ---- Heatmap: two categorical dimensions × one magnitude ----- *
     * Weekday × time-block is the textbook case: 42 cells, where the
     * PATTERN (business-hours ridge) is the finding, not any one value.
     */
    tickets: {
      theme: mode,
      data: { categories: d.tickets.blocks, series: d.tickets.rows },
      a11y: { title: 'Support ticket volume by weekday and time', description: d.tickets.a11y },
    },

    /* ---- Stacked bar: composition over a few periods -------------- *
     * Both the total and the mix matter, over a handful of periods —
     * which is the one case where stacking beats grouping.
     */
    segments: {
      theme: mode,
      stacked: true,
      data: { categories: d.segments.periods, series: d.segments.series },
      yAxis: { label: 'Revenue ($K)' },
      legend: { position: 'bottom' },
      a11y: { title: 'Revenue by customer segment', description: d.segments.a11y },
    },

    /* ---- Choropleth: geography IS the question ------------------- *
     * Topology is always the caller's — this is a tiny synthetic
     * FeatureCollection defined in `data.ts`. Nothing is fetched and no
     * atlas is bundled, which is why this card costs ~2 kB and not 500.
     */
    territories: {
      theme: mode,
      choropleth: {
        geojson: salesTerritories,
        projection: 'mercator',
        featureKey: 'name',
        unmatched: 'warn',
      },
      data: { series: [{ id: 'territory-revenue', name: 'Revenue', data: d.territories.data }] },
      a11y: { title: 'Revenue by sales territory', description: d.territories.a11y },
    },

    /* ---- Boxplot: distribution, not average ---------------------- *
     * Mean contract value is the most misleading number on a SaaS
     * dashboard — enterprise deals are a long right tail. Comparing
     * SPREAD across segments is what a boxplot exists for, and it is the
     * only card here that shows a distribution at all.
     */
    contracts: {
      theme: mode,
      data: {
        categories: d.contracts.categories,
        series: [{ id: 'acv', name: 'Annual contract value', data: d.contracts.samples }],
      },
      // ACV spans a ~200× range (self-serve ~$1.5K, enterprise ~$260K). On a
      // linear axis three of the four boxes collapse into unreadable slivers,
      // which defeats the point of showing the distribution at all.
      // `min` is REQUIRED here, not cosmetic: on a log axis the value domain
      // still picks up a 0 lower bound, which LogScale clamps to its epsilon —
      // yielding a twelve-decade axis (1e-12 … 1e3) with every box squashed
      // into the top 10%. Pinning the floor to the data's own order of
      // magnitude is the fix.
      yAxis: { label: 'ACV ($K)', type: 'log', min: 1 },
      a11y: { title: 'Contract value distribution by segment', description: d.contracts.a11y },
    },
  };
}

/** Sparkline spec for one KPI tile. */
export function sparkSpec(kpi: KpiTile, mode: Scheme): TypedChartOptions {
  return {
    theme: mode,
    // A 40px-tall tile carries SHAPE, not points — markers at this size are
    // noise (the library would draw them: 'auto' shows them under 60 points).
    data: { series: [{ id: kpi.id, name: kpi.label, data: kpi.spark, showMarkers: false }] },
    a11y: { title: kpi.label, description: kpi.a11y },
  };
}
