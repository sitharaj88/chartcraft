/**
 * @chartcraft/angular — shared base for every ChartCraft Angular component.
 *
 * Responsibilities (and nothing more): lifecycle (create in `afterNextRender`,
 * destroy via `DestroyRef`), option updates routed through `chart.update()`
 * (core diffs), event bridging to `output()`s, and instance exposure through
 * the public `chart` signal.
 *
 * SSR-safe **by construction**: `afterNextRender()` only ever runs in the
 * browser, after the first render — there is no `isPlatformBrowser` check to
 * forget and no chart work at module scope.
 *
 * Zoneless-safe: all reactivity is signal-based, so the package works
 * identically in zone-based and `provideZonelessChangeDetection()` apps.
 * `zone.js` is neither a dependency nor a peer dependency.
 */
import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { createChart } from '@chartcraft/core';
import type {
  Chart as CoreChart,
  ChartEventMap,
  ChartOptions,
  ChartType,
  PointEvent,
} from '@chartcraft/core';

/** The live chart instance type (core's `Chart` interface, renamed to avoid colliding with the `Chart` component). */
export type ChartInstance = CoreChart;

/** Options for the per-type convenience components (`type` is injected). */
export type TypedChartOptions = Omit<ChartOptions, 'type'>;

/**
 * Base class for `<cc-chart>` and all 39 per-type components.
 *
 * **Immutable update contract.** The `options` input is watched with an
 * `effect()`, which reacts to *reference* changes. Mutating the same options
 * object in place will NOT push anything to the chart — always assign a new
 * object:
 *
 * ```ts
 * // ✅ triggers chart.update()
 * this.opts = { ...this.opts, title: 'New title' };
 * // ❌ silently ignored
 * this.opts.title = 'New title';
 * ```
 *
 * Because the effect reads the whole `options()` signal, there is no
 * hand-maintained key list that can fall out of sync with `ChartOptions`:
 * *any* reference change is picked up, including option blocks added by future
 * core versions.
 */
@Directive()
export abstract class ChartBase<TOptions extends TypedChartOptions> {
  /**
   * Chart type injected by the per-type subclasses (`cc-line-chart` → `'line'`).
   * `null` on the generic `<cc-chart>`, whose `options` carry their own `type`.
   */
  protected readonly chartType: ChartType | null = null;

  /** All `ChartOptions` (minus `type` on the per-type components). Replace the object to update. */
  readonly options = input.required<TOptions>();

  /** Pointer or keyboard activation on a datum. */
  readonly pointClick = output<PointEvent>();
  /** Pointer or keyboard focus enters a datum. */
  readonly pointEnter = output<PointEvent>();
  /** Pointer or keyboard focus leaves a datum. */
  readonly pointLeave = output<PointEvent>();
  /** A legend item was toggled. */
  readonly legendToggle = output<ChartEventMap['legendtoggle']>();
  /** zoom/pan/brush committed (or reset — the payload is `null`). */
  readonly zoom = output<ChartEventMap['zoom']>();
  /** An annotation was clicked. */
  readonly annotationClick = output<ChartEventMap['annotationclick']>();

  private readonly instance = signal<ChartInstance | null>(null);

  /**
   * The live core `Chart` instance, or `null` before the first render (and
   * after destroy). Reach it from a host component with
   * `viewChild(CcChart)` / `@ViewChild(CcChart)` → `ref.chart()`.
   */
  readonly chart: Signal<ChartInstance | null> = this.instance.asReadonly();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The exact options reference last handed to core; guards the mount-time update. */
  private applied: TOptions | null = null;

  constructor() {
    // Browser-only, post-first-render: SSR-safe without a platform check.
    afterNextRender(() => {
      const options = this.options();
      this.applied = options;
      const chart = createChart(this.host.nativeElement, this.resolve(options));
      chart.on('pointclick', (ev) => this.pointClick.emit(ev));
      chart.on('pointenter', (ev) => this.pointEnter.emit(ev));
      chart.on('pointleave', (ev) => this.pointLeave.emit(ev));
      chart.on('legendtoggle', (ev) => this.legendToggle.emit(ev));
      chart.on('zoom', (ev) => this.zoom.emit(ev));
      chart.on('annotationclick', (ev) => this.annotationClick.emit(ev));
      this.instance.set(chart);
    });

    // Options → chart.update(). Reads `options()` (tracked) but the instance
    // untracked, so creating the chart never re-runs this; and the
    // `applied` reference guard means the options the chart was *built* with
    // are never re-applied as a redundant mount-time update.
    effect(() => {
      const options = this.options();
      const chart = untracked(this.instance);
      if (!chart || options === this.applied) return;
      this.applied = options;
      chart.update(this.resolve(options));
    });

    inject(DestroyRef).onDestroy(() => {
      this.instance()?.destroy(); // removes DOM, observers, listeners
      this.instance.set(null);
    });
  }

  private resolve(options: TOptions): ChartOptions {
    const type = this.chartType;
    return (type === null ? options : { ...options, type }) as unknown as ChartOptions;
  }
}
