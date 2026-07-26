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
  isDevMode,
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
import { trackOptionStability, type OptionStabilityProbe } from './dev';

/** The live chart instance type (core's `Chart` interface, renamed to avoid colliding with the `Chart` component). */
export type ChartInstance = CoreChart;

/**
 * A chart's options with no `type` — the shape for holding chart configuration
 * in its own module (`specs.ts`) and binding it to the matching per-type
 * component. Identical in every ChartCraft wrapper (`@chartcraft/react`,
 * `@chartcraft/vue`, `@chartcraft/svelte`, `@chartcraft/angular`).
 *
 * ```ts
 * // specs.ts
 * import type { ChartSpec } from '@chartcraft/angular';
 * export const revenue: ChartSpec = { title: 'Revenue', data: { ... } };
 * ```
 * ```html
 * <cc-bar-chart [options]="revenue" />
 * ```
 */
export type ChartSpec = Omit<ChartOptions, 'type'>;

/**
 * @deprecated Since 0.3.1 — use {@link ChartSpec}, which is the same type under
 * the name every ChartCraft wrapper now shares. Kept as an alias so 0.3.0 code
 * keeps compiling; it will be removed in 1.0.
 */
export type TypedChartOptions = ChartSpec;

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
export abstract class ChartBase<TOptions extends ChartSpec> {
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
  /**
   * The chart instance exists and is rendered — emitted exactly once, from
   * `afterNextRender`.
   *
   * This is the zero-nullability way to reach the instance for setup code.
   * `viewChild()` is `undefined` until the view exists and `chart()` is `null`
   * until the first render, and a host's own `afterNextRender` is registered
   * *before* its children's, so `this.hero()?.chart()?.…` in setup code is a
   * trap. Bind `(ready)` instead:
   *
   * ```html
   * <cc-line-chart [options]="options()" (ready)="onChartReady($event)" />
   * ```
   */
  readonly ready = output<ChartInstance>();

  private readonly instance = signal<ChartInstance | null>(null);

  /**
   * The live core `Chart` instance, or `null` before the first render (and
   * after destroy). Reach it from a host component with
   * `viewChild(CcChart)` / `@ViewChild(CcChart)` → `ref.chart()`.
   *
   * Prefer `(ready)` or {@link whenReady} in setup code; this signal is for
   * event handlers and template reads, where the instance already exists.
   */
  readonly chart: Signal<ChartInstance | null> = this.instance.asReadonly();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The exact options reference last handed to core; guards the mount-time update. */
  private applied: TOptions | null = null;

  /** Pending {@link whenReady} resolvers, drained once by `afterNextRender`. */
  private pendingReady: ((chart: ChartInstance) => void)[] | null = null;

  /** Development-only reference-churn detector; see ./dev.ts. */
  private stabilityProbe: OptionStabilityProbe | null = null;

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
      const waiting = this.pendingReady;
      this.pendingReady = null;
      if (waiting) for (const resolve of waiting) resolve(chart);
      this.ready.emit(chart);
    });

    // Options → chart.update(). Reads `options()` (tracked) but the instance
    // untracked, so creating the chart never re-runs this; and the
    // `applied` reference guard means the options the chart was *built* with
    // are never re-applied as a redundant mount-time update.
    effect(() => {
      const options = this.options();
      const chart = untracked(this.instance);
      // Development-only: catch the "object literal rebuilt on every
      // change-detection pass" trap this reference watch makes so easy to fall
      // into. `isDevMode()` is `false` in every production build, so the
      // comparison below never runs in a shipped app — see ./dev.ts.
      if (isDevMode()) {
        this.stabilityProbe = trackOptionStability(
          this.stabilityProbe,
          options,
          this.host.nativeElement.tagName.toLowerCase(),
        );
      }
      if (!chart || options === this.applied) return;
      this.applied = options;
      chart.update(this.resolve(options));
    });

    inject(DestroyRef).onDestroy(() => {
      this.pendingReady = null;
      this.instance()?.destroy(); // removes DOM, observers, listeners
      this.instance.set(null);
    });
  }

  /**
   * Resolves with the live instance as soon as it exists — already-resolved if
   * the chart is up.
   *
   * The imperative counterpart to `(ready)`, for a host that reaches the chart
   * from its own `afterNextRender`/`ngAfterViewInit` (where `viewChild()` is
   * defined but `chart()` is not yet set):
   *
   * ```ts
   * afterNextRender(async () => {
   *   const chart = await this.hero()!.whenReady();
   *   chart.zoomTo({ x: [0, 10] });
   * });
   * ```
   *
   * If the component is destroyed before its first render — the only way it can
   * never have an instance — the promise simply never settles.
   */
  whenReady(): Promise<ChartInstance> {
    const existing = untracked(this.instance);
    if (existing) return Promise.resolve(existing);
    return new Promise<ChartInstance>((resolve) => {
      (this.pendingReady ??= []).push(resolve);
    });
  }

  private resolve(options: TOptions): ChartOptions {
    const type = this.chartType;
    return (type === null ? options : { ...options, type }) as unknown as ChartOptions;
  }
}
