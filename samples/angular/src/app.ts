/**
 * Northwind Cloud — the dashboard, as Angular.
 *
 * This is the file that replaces the vanilla sample's `main.ts` + `index.html`.
 * It keeps that app's shape while dropping every line of DOM bookkeeping:
 *
 *   1. ONE source of truth for the theme — `ThemeStore` puts `data-theme` on
 *      `<html>` (driving the CSS custom properties) and hands the same string
 *      to every chart through `chartSpecs()`.
 *   2. Chart options are a PURE FUNCTION of (data, scheme): `chartSpecs()`,
 *      wrapped in ONE `computed()`. That is not an optimisation — it is the
 *      wrapper's contract. `@chartcraft/angular` watches `options` with an
 *      `effect()` that reacts to *reference* changes, so an update has to be a
 *      NEW OBJECT. A `computed()` produces exactly that, exactly when (and only
 *      when) `data` or `scheme` moves. Mutating `specs().mrr` in place would
 *      render nothing.
 *   3. Charts are never torn down and rebuilt. A new `options` reference is an
 *      input change, so the wrapper calls `chart.update()` and the transition
 *      stays animated instead of flashing an empty card. `@for` over the KPI
 *      tiles is tracked by `kpi.id` for the same reason.
 *   4. Teardown is the wrapper's job — `DestroyRef.onDestroy` → `chart.destroy()`.
 *      There is no `pagehide` handler in this port.
 *
 * Events are `output()` bindings — `(pointClick)`, `(zoom)` — not
 * `chart.on(...)`. The one place the imperative instance is still needed is
 * `exportData()` / `zoomTo()`, which is what `viewChild(CcLineChart)` is for:
 * every ChartCraft component exposes the live instance as a `chart` **signal**.
 */
import {
  ChangeDetectionStrategy,
  Component,
  afterRenderEffect,
  computed,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { version } from '@chartcraft/core';
import {
  CcBarChart,
  CcBoxplotChart,
  CcChoroplethChart,
  CcGaugeChart,
  CcHeatmapChart,
  CcLineChart,
  CcSankeyChart,
  CcTreemapChart,
} from '@chartcraft/angular';
import type { PointEvent, ZoomRange } from '@chartcraft/angular';

import { ChartCard } from './components/chart-card';
import { Inspector } from './components/inspector';
import { StatTile } from './components/stat-tile';
import { TopBar } from './components/top-bar';

import { getData } from './data';
import type { RangeKey } from './data';
import { chartSpecs } from './specs';
import { INSPECTABLE, buildEntry } from './selection';
import type { InspectableId, InspectorEntry, Selection } from './selection';
import { ThemeStore } from './theme';

@Component({
  selector: 'app-root',
  imports: [
    TopBar,
    StatTile,
    ChartCard,
    Inspector,
    // Per-type components, never the generic `<cc-chart>`: each injects its own
    // `type`, so a spec can only be handed to the component that matches it.
    CcLineChart,
    CcGaugeChart,
    CcSankeyChart,
    CcTreemapChart,
    CcHeatmapChart,
    CcBarChart,
    CcChoroplethChart,
    CcBoxplotChart,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `<app-root>` is the exact counterpart of the React port's `<div id="root">`:
  // a plain block wrapper around the three landmarks.
  styles: ':host { display: block }',
  template: `
    <header
      appTopBar
      [range]="range()"
      [scheme]="scheme()"
      (rangeChange)="setRange($event)"
      (themeToggle)="toggleTheme()"
      (exportClick)="exportCsv()"
    ></header>

    <main class="shell" id="main">
      <div class="page-head">
        <div>
          <h1 class="page-head__title">Revenue &amp; product analytics</h1>
          <p class="page-head__meta">{{ data().rangeLabel }} · updated hourly</p>
        </div>
        <p class="page-head__stamp">Data as of 24 Jul 2026 · all figures USD</p>
      </div>

      <section class="kpis" aria-label="Key performance indicators">
        @for (kpi of data().kpis; track kpi.id) {
          <article appStatTile [kpi]="kpi" [scheme]="scheme()"></article>
        }
      </section>

      <section class="grid" aria-label="Analytics charts">
        <!-- ---- Row 1 ------------------------------------------------ -->
        <article
          appChartCard
          heading="Recurring revenue"
          [subtitle]="data().mrr.subtitle"
          [span]="8"
          hero
        >
          <!-- Reset-zoom affordance: only offered once there is something to
               reset. The (zoom) output fires with null when the window is
               cleared, which clears zoomWindow and hides this again.

               Worth knowing: a projected node declared inside an @if block IS
               still matched against ng-content select="[cardAction]" — it does
               not fall through to the catch-all slot — so conditional
               projection needs no ng-template or [hidden] workaround. -->
          @if (zoomed()) {
            <button cardAction class="btn btn--ghost" type="button" (click)="resetZoom()">
              Reset zoom
            </button>
          }

          <cc-line-chart
            class="card__chart"
            [options]="specs().mrr"
            (pointClick)="inspect('mrr', $event)"
            (zoom)="onZoom($event)"
          />
        </article>

        <article
          appChartCard
          heading="Platform capacity"
          [subtitle]="data().capacity.subtitle"
          [span]="4"
        >
          <cc-gauge-chart class="card__chart" [options]="specs().capacity" />
        </article>

        <!-- ---- Row 2 ------------------------------------------------ -->
        <article appChartCard heading="Acquisition flow" [subtitle]="data().flow.subtitle" [span]="7">
          <cc-sankey-chart class="card__chart" [options]="specs().flow" />
        </article>

        <article appChartCard heading="Product mix" [subtitle]="data().products.subtitle" [span]="5">
          <cc-treemap-chart class="card__chart" [options]="specs().products" />
        </article>

        <!-- ---- Row 3 ------------------------------------------------ -->
        <article appChartCard heading="Support load" [subtitle]="data().tickets.subtitle" [span]="8">
          <cc-heatmap-chart
            class="card__chart"
            [options]="specs().tickets"
            (pointClick)="inspect('tickets', $event)"
          />
        </article>

        <article
          appChartCard
          heading="Revenue by segment"
          [subtitle]="data().segments.subtitle"
          [span]="4"
        >
          <cc-bar-chart
            class="card__chart"
            [options]="specs().segments"
            (pointClick)="inspect('segments', $event)"
          />
        </article>

        <!-- ---- Row 4 ------------------------------------------------ -->
        <article
          appChartCard
          heading="Territory coverage"
          [subtitle]="data().territories.subtitle"
          [span]="4"
        >
          <cc-choropleth-chart class="card__chart" [options]="specs().territories" />
        </article>

        <article
          appChartCard
          heading="Contract value"
          [subtitle]="data().contracts.subtitle"
          [span]="5"
        >
          <cc-boxplot-chart
            class="card__chart"
            [options]="specs().contracts"
            (pointClick)="inspect('contracts', $event)"
          />
        </article>

        <article
          appChartCard
          heading="Inspector"
          subtitle="Selected data point"
          [span]="3"
          live
        >
          <div appInspector [entry]="entry()"></div>
        </article>
      </section>
    </main>

    <footer class="footer shell">
      <span>
        Northwind Cloud is a fictional product. All figures are synthetic and deterministic.
      </span>
      <!-- &ngsp; is Angular's "keep this space": with the default
           preserveWhitespaces: false the compiler drops whitespace-only text
           nodes, which would run the package name and the version together. -->
      <span>
        Built with <code>&#64;chartcraft/angular</code>&ngsp;<code>v{{ version }}</code>
      </span>
    </footer>
  `,
})
export class App {
  /* ---------------- State: four signals ---------------- */

  private readonly theme = inject(ThemeStore);
  /** The theme signal itself, so every spec re-derives on a toggle. */
  protected readonly scheme = this.theme.scheme;

  protected readonly range = signal<RangeKey>('12m');
  private readonly selection = signal<Selection | null>(null);
  /** The live brush window, mirrored from the chart's own `zoom` output. */
  private readonly zoomWindow = signal<ZoomRange>(null);

  /* ---------------- Derived ---------------- */

  /** `getData` is pure and deterministic, so the dataset is just a `computed`. */
  protected readonly data = computed(() => getData(this.range()));

  /** The chart options for all eight cards. A new object per (data, scheme). */
  protected readonly specs = computed(() => chartSpecs(this.data(), this.scheme()));

  /** Reset-zoom affordance: only offered once there is something to reset. */
  protected readonly zoomed = computed(() => this.zoomWindow() !== null);

  /**
   * Derived, not captured: the swatch colour comes out of the theme-dependent
   * palette, so a theme flip must re-colour the panel to match the marks.
   */
  protected readonly entry = computed<InspectorEntry | null>(() => {
    const sel = this.selection();
    if (!sel) return null;
    const meta = INSPECTABLE[sel.chartId];
    const series = this.specs()[sel.chartId].data.series ?? [];
    return buildEntry(sel.ev, meta.title, series, meta.format, this.scheme());
  });

  protected readonly version = version;

  /**
   * The only imperative handle this app needs. Every ChartCraft component
   * exposes the live core instance as a `chart` signal, so `viewChild` on the
   * component class is all it takes — no `AfterViewInit` timing puzzle.
   */
  private readonly hero = viewChild(CcLineChart);

  constructor() {
    /**
     * Keep the zoom across a THEME change.
     *
     * KNOWN LIBRARY BUG, worked around at app level (see README). The vanilla
     * sample can re-theme with `chart.update({ theme })` — a partial that
     * carries no `data`, which core takes as "the viewport is still valid". The
     * wrappers instead re-send the WHOLE options object, so every update carries
     * `data` and core drops the viewport — silently: it emits no `zoom` event,
     * so the Reset button would be left pointing at nothing.
     *
     * `afterRenderEffect` is Angular's answer to Vue's `flush: 'post'`: a
     * component `effect()` created here would be registered BEFORE the child
     * `<cc-line-chart>`'s own effect and would therefore re-apply the window
     * before the update that destroys it. After-render effects run once the
     * whole change-detection pass has been flushed to the DOM, which is after
     * the wrapper has called `chart.update()`.
     *
     * Only `scheme()` is tracked; the window and the view query are read
     * `untracked` so that `zoomTo()` re-emitting `zoom` cannot re-trigger this.
     */
    afterRenderEffect(() => {
      this.scheme();
      untracked(() => {
        const window_ = this.zoomWindow();
        if (window_) this.hero()?.chart()?.zoomTo(window_);
      });
    });
  }

  /* ---------------- Handlers ---------------- */

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected setRange(next: RangeKey): void {
    if (next === this.range()) return;
    this.range.set(next);
    // A new window invalidates both the old selection and the old zoom — a
    // stale inspector reading is worse than an empty one, and a brush expressed
    // in the previous range's units means nothing in this one.
    this.selection.set(null);
    this.zoomWindow.set(null);
  }

  /** `(pointClick)` → Inspector. The id names both the card and its formatter. */
  protected inspect(chartId: InspectableId, ev: PointEvent): void {
    this.selection.set({ chartId, ev });
  }

  protected onZoom(window_: ZoomRange): void {
    this.zoomWindow.set(window_);
  }

  /** `zoomTo(null)` emits `zoom: null`, which clears `zoomWindow` for us. */
  protected resetZoom(): void {
    this.hero()?.chart()?.zoomTo(null);
  }

  protected exportCsv(): void {
    const chart = this.hero()?.chart();
    if (!chart) return;

    // exportData() emits exactly the chart's accessible data table — so the CSV
    // and what a screen reader reads can never disagree, and unlike the table it
    // is never row-capped.
    const csv = chart.exportData({ format: 'csv' });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `northwind-mrr-${this.range()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
