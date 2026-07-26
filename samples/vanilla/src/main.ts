/**
 * Northwind Cloud — app bootstrap and chart wiring.
 *
 * This is the only framework-specific file in the sample: `data.ts` and
 * `styles.css` are copied verbatim into the React / Vue / Svelte / Angular
 * ports, and this file is what each of them re-expresses idiomatically.
 *
 * The shape it establishes, and which the ports should mirror:
 *
 *   1. ONE source of truth for the theme — `data-theme` on <html> drives both
 *      the CSS custom properties and the ChartCraft `theme` option.
 *   2. Chart options are a PURE FUNCTION of (data, scheme): `chartSpecs()`.
 *      Mounting and updating both consume the same specs, so a re-render can
 *      never disagree with a first render.
 *   3. Charts are created once and then `update()`d. Nothing is torn down and
 *      rebuilt on a theme or range change — that is what keeps the transition
 *      animated instead of a flash of empty cards.
 *   4. Every chart is destroyed on teardown.
 */

import {
  categoricalPalette,
  createChart,
  darkTheme,
  lightTheme,
  version,
} from '@chartcraft/core';
import type { Chart, ChartOptions, PointEvent } from '@chartcraft/core';

import {
  RANGES,
  formatDelta,
  formatNumber,
  getData,
  salesTerritories,
} from './data';
import type { DashboardData, KpiTile, RangeKey } from './data';

import './styles.css';

/* ------------------------------------------------------------------ *
 * Small DOM helpers
 * ------------------------------------------------------------------ */

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

type Scheme = 'light' | 'dark';

let scheme: Scheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';
let range: RangeKey = '12m';
let data: DashboardData = getData(range);

/** Every mounted chart, keyed by its container id. */
const charts = new Map<string, Chart>();
/** Every event unsubscribe, so teardown is exhaustive. */
const unsubscribes: (() => void)[] = [];

/* ------------------------------------------------------------------ *
 * Value formatters, per chart — used by the inspector and data labels
 * ------------------------------------------------------------------ */

const usd = (n: number): string => `$${formatNumber(Math.round(n))}`;
const usdK = (n: number): string => `$${formatNumber(Math.round(n))}K`;

/* ------------------------------------------------------------------ *
 * Chart specs — a pure function of (data, scheme)
 *
 * Titles live in the card chrome (real headings, in the document outline),
 * not in the canvas, so `title`/`subtitle` are deliberately NOT passed to the
 * charts. Each chart still gets `a11y.title`/`a11y.description`, so the
 * canvas is never an unlabeled black box to assistive tech.
 * ------------------------------------------------------------------ */

function chartSpecs(d: DashboardData, mode: Scheme): Record<string, ChartOptions> {
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
    'chart-mrr': {
      type: 'line',
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
    'chart-capacity': {
      type: 'gauge',
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
    'chart-flow': {
      type: 'sankey',
      theme: mode,
      sankey: { nodeWidth: 12, nodePadding: 12, align: 'justify' },
      data: { series: [{ id: 'flow', name: 'Accounts', data: d.flow.data }] },
      a11y: { title: 'Acquisition flow', description: d.flow.a11y },
    },

    /* ---- Treemap: nested part-to-whole --------------------------- *
     * Eleven leaves under four parents. A bar chart would need two charts
     * or a nested axis; area carries the hierarchy in one glance.
     */
    'chart-products': {
      type: 'treemap',
      theme: mode,
      data: { series: [{ id: 'revenue', name: 'Revenue', data: d.products.nodes }] },
      a11y: { title: 'Revenue by product line', description: d.products.a11y },
    },

    /* ---- Heatmap: two categorical dimensions × one magnitude ----- *
     * Weekday × time-block is the textbook case: 42 cells, where the
     * PATTERN (business-hours ridge) is the finding, not any one value.
     */
    'chart-tickets': {
      type: 'heatmap',
      theme: mode,
      data: { categories: d.tickets.blocks, series: d.tickets.rows },
      a11y: { title: 'Support ticket volume by weekday and time', description: d.tickets.a11y },
    },

    /* ---- Stacked bar: composition over a few periods -------------- *
     * Both the total and the mix matter, over a handful of periods —
     * which is the one case where stacking beats grouping.
     */
    'chart-segments': {
      type: 'bar',
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
    'chart-territories': {
      type: 'choropleth',
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
    'chart-contracts': {
      type: 'boxplot',
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
function sparkSpec(kpi: KpiTile, mode: Scheme): ChartOptions {
  return {
    type: 'sparkline',
    theme: mode,
    // A 40px-tall tile carries SHAPE, not points — markers at this size are
    // noise (the library would draw them: 'auto' shows them under 60 points).
    data: { series: [{ id: kpi.id, name: kpi.label, data: kpi.spark, showMarkers: false }] },
    a11y: { title: kpi.label, description: kpi.a11y },
  };
}

/* ------------------------------------------------------------------ *
 * Inspector — the visible destination for `pointclick`
 * ------------------------------------------------------------------ */

interface Selection {
  chartId: string;
  cardTitle: string;
  ev: PointEvent;
  format: (n: number) => string;
}

let selection: Selection | null = null;

/** PointEvent carries no colour, so resolve the series' palette slot. */
function seriesColor(chartId: string, seriesId: string): string {
  const chart = charts.get(chartId);
  const series = chart?.getOptions().data.series ?? [];
  const index = series.findIndex((s) => (s.id ?? s.name) === seriesId);
  const slots = categoricalPalette[scheme];
  return series[index]?.color ?? slots[(index < 0 ? 0 : index) % slots.length];
}

function formatX(x: PointEvent['x']): string {
  if (x === null) return '—';
  if (x instanceof Date) {
    return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (typeof x === 'number') return formatNumber(x);
  return x;
}

function renderInspector(): void {
  const host = byId('inspector');
  host.replaceChildren();

  if (!selection) {
    host.append(
      el(
        'p',
        'inspector__empty',
        'Click a point on any chart — the recurring-revenue line, the segment bars or the contract-value boxes — to inspect it here.',
      ),
      el(
        'p',
        'inspector__hint',
        'Keyboard: Tab to a chart, walk it with the arrow keys, then press Enter.',
      ),
    );
    return;
  }

  const { ev, cardTitle, chartId, format } = selection;

  const series = el('span', 'inspector__series');
  const swatch = el('span', 'inspector__swatch');
  swatch.style.background = seriesColor(chartId, ev.seriesId);
  series.append(swatch, document.createTextNode(ev.seriesName));

  const value = el('p', 'inspector__value', ev.y === null ? 'No value' : format(ev.y));

  const list = el('dl', 'inspector__list');
  const rows: [string, string][] = [
    ['Chart', cardTitle],
    ['Point', formatX(ev.x)],
    ['Index', String(ev.dataIndex)],
    // Keyboard-originated events report clientX/clientY as -1.
    ['Input', ev.clientX === -1 && ev.clientY === -1 ? 'Keyboard' : 'Pointer'],
  ];
  for (const [term, def] of rows) list.append(el('dt', undefined, term), el('dd', undefined, def));

  host.append(series, value, list, el('p', 'inspector__hint', 'Updated on every point click.'));
}

/* ------------------------------------------------------------------ *
 * KPI tiles — built once, updated in place
 * ------------------------------------------------------------------ */

interface TileRefs {
  value: HTMLElement;
  delta: HTMLElement;
  comparison: HTMLElement;
}

const tiles = new Map<string, TileRefs>();

function renderKpis(d: DashboardData): void {
  const host = byId('kpis');

  for (const kpi of d.kpis) {
    let refs = tiles.get(kpi.id);

    if (!refs) {
      const card = el('article', 'kpi');
      const label = el('span', 'kpi__label', kpi.label);
      const row = el('div', 'kpi__row');
      const value = el('span', 'kpi__value');
      const delta = el('span', 'kpi__delta');
      row.append(value, delta);
      const comparison = el('span', 'kpi__comparison');
      const spark = el('div', 'kpi__spark');
      spark.id = `spark-${kpi.id}`;
      card.append(label, row, comparison, spark);
      host.append(card);

      refs = { value, delta, comparison };
      tiles.set(kpi.id, refs);
      mount(spark.id, sparkSpec(kpi, scheme));
    } else {
      charts.get(`spark-${kpi.id}`)?.update(sparkSpec(kpi, scheme));
    }

    refs.value.textContent = kpi.value;
    refs.delta.textContent = formatDelta(kpi.delta, kpi.deltaUnit);
    // A rise is not automatically good: churn going UP is the bad case, so
    // the tone follows the metric's semantics, mapped onto theme.up/down.
    refs.delta.dataset.tone = kpi.higherIsBetter === kpi.delta >= 0 ? 'good' : 'bad';
    refs.comparison.textContent = kpi.comparison;
  }
}

/* ------------------------------------------------------------------ *
 * Mount / update
 * ------------------------------------------------------------------ */

function mount(id: string, options: ChartOptions): Chart {
  const chart = createChart(byId(id), options);
  charts.set(id, chart);
  return chart;
}

/** Cards whose points feed the inspector, with a value formatter each. */
const INSPECTABLE: Record<string, { title: string; format: (n: number) => string }> = {
  'chart-mrr': { title: 'Recurring revenue', format: usd },
  'chart-segments': { title: 'Revenue by segment', format: usdK },
  'chart-contracts': { title: 'Contract value', format: usdK },
  'chart-tickets': { title: 'Support load', format: (n) => `${formatNumber(n)} tickets` },
};

function mountCharts(): void {
  const specs = chartSpecs(data, scheme);

  for (const [id, options] of Object.entries(specs)) {
    const chart = mount(id, options);

    const inspectable = INSPECTABLE[id];
    if (inspectable) {
      unsubscribes.push(
        chart.on('pointclick', (ev) => {
          selection = { chartId: id, cardTitle: inspectable.title, ev, format: inspectable.format };
          renderInspector();
        }),
      );
    }
  }

  // Reset-zoom affordance: only offered once there is something to reset.
  const hero = charts.get('chart-mrr');
  const resetBtn = byId<HTMLButtonElement>('reset-zoom');
  if (hero) {
    unsubscribes.push(
      hero.on('zoom', (window_) => {
        resetBtn.hidden = window_ === null;
      }),
    );
    resetBtn.addEventListener('click', () => {
      hero.zoomTo(null);
      resetBtn.hidden = true;
    });
  }
}

function updateCharts(): void {
  const specs = chartSpecs(data, scheme);
  for (const [id, options] of Object.entries(specs)) charts.get(id)?.update(options);
}

/** Subtitles are range-dependent, so they live with the data, not the markup. */
function renderCopy(d: DashboardData): void {
  byId('range-summary').textContent = `${d.rangeLabel} · updated hourly`;
  byId('sub-mrr').textContent = d.mrr.subtitle;
  byId('sub-capacity').textContent = d.capacity.subtitle;
  byId('sub-flow').textContent = d.flow.subtitle;
  byId('sub-products').textContent = d.products.subtitle;
  byId('sub-tickets').textContent = d.tickets.subtitle;
  byId('sub-segments').textContent = d.segments.subtitle;
  byId('sub-territories').textContent = d.territories.subtitle;
  byId('sub-contracts').textContent = d.contracts.subtitle;
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

function applyScheme(next: Scheme): void {
  scheme = next;
  document.documentElement.dataset.theme = next;

  // The delta chips borrow the CHARTS' own up/down semantics rather than
  // hand-picked green and red, so a theme change can never desynchronise
  // the tiles from the marks.
  const t = next === 'dark' ? darkTheme : lightTheme;
  const root = document.documentElement.style;
  root.setProperty('--delta-up', t.up);
  root.setProperty('--delta-down', t.down);

  const toggle = byId<HTMLButtonElement>('theme-toggle');
  toggle.setAttribute('aria-pressed', String(next === 'dark'));
  // `toggleAttribute`, NOT `.hidden = …`. The `hidden` IDL property is defined
  // on HTMLElement, and an <svg> is an SVGElement (it extends Element, not
  // HTMLElement) — so `svgIcon.hidden = true` silently creates a plain JS
  // expando and never writes the attribute that `svg[hidden]` in styles.css
  // matches. The icons looked right on first paint only because index.html
  // hard-codes the attribute on the sun; the toggle never changed them.
  byId('icon-moon').toggleAttribute('hidden', next === 'dark');
  byId('icon-sun').toggleAttribute('hidden', next !== 'dark');

  for (const chart of charts.values()) chart.update({ theme: next });
  renderInspector(); // the swatch is palette-dependent
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

function buildRangeControl(): void {
  const host = byId('range-control');

  for (const r of RANGES) {
    const btn = el('button', 'segmented__btn', r.label);
    btn.type = 'button';
    btn.dataset.range = r.key;
    btn.setAttribute('aria-pressed', String(r.key === range));
    btn.setAttribute('aria-label', r.long);
    btn.addEventListener('click', () => setRange(r.key));
    host.append(btn);
  }
}

function setRange(next: RangeKey): void {
  if (next === range) return;
  range = next;
  data = getData(range);

  for (const btn of byId('range-control').querySelectorAll<HTMLButtonElement>('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.range === range));
  }

  // A new window invalidates the old selection — and a stale inspector
  // reading is worse than an empty one.
  selection = null;
  byId<HTMLButtonElement>('reset-zoom').hidden = true;

  renderCopy(data);
  renderKpis(data);
  updateCharts();
  renderInspector();
}

function wireExport(): void {
  byId('export-csv').addEventListener('click', () => {
    const hero = charts.get('chart-mrr');
    if (!hero) return;

    // exportData() emits exactly the chart's accessible data table — so the
    // CSV and what a screen reader reads can never disagree, and unlike the
    // table it is never row-capped.
    const csv = hero.exportData({ format: 'csv' });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = el('a');
    a.href = url;
    a.download = `northwind-mrr-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/* ------------------------------------------------------------------ *
 * Teardown
 * ------------------------------------------------------------------ */

function destroyAll(): void {
  for (const off of unsubscribes.splice(0)) off();
  for (const chart of charts.values()) chart.destroy();
  charts.clear();
  tiles.clear();
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function boot(): void {
  byId('cc-version').textContent = `v${version}`;

  buildRangeControl();
  byId('theme-toggle').addEventListener('click', () =>
    applyScheme(scheme === 'dark' ? 'light' : 'dark'),
  );
  wireExport();

  renderCopy(data);
  renderKpis(data);
  mountCharts();
  renderInspector();
  applyScheme(scheme);
}

boot();

window.addEventListener('pagehide', destroyAll);
if (import.meta.hot) import.meta.hot.dispose(destroyAll);
