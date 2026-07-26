# Angular

`@chartcraft/angular` is a thin Angular wrapper around `@chartcraft/core`: it
owns lifecycle (mount/update/destroy), resize observation, and event bridging.
All chart logic lives in core, so Angular charts have exact feature parity with
every other framework.

Everything it ships is **standalone** (no `NgModule` to import), **signal-based**
(`input()` / `output()`), and **zoneless-ready** — `zone.js` is neither a
dependency nor a peer dependency, so the same package works unchanged in
zone-based and `provideZonelessChangeDetection()` applications.

## Install

```sh
npm install @chartcraft/core @chartcraft/angular
```

Requires Angular **20 or newer**. The wrapper re-exports all core types —
import everything from `@chartcraft/angular`.

## The `<cc-chart>` component

Import the standalone component into whatever component uses it and pass a
single `options` object:

```ts
import { Component, signal } from '@angular/core';
import { CcChart } from '@chartcraft/angular';
import type { ChartOptions, PointEvent } from '@chartcraft/angular';

@Component({
  selector: 'app-revenue',
  imports: [CcChart],
  template: `
    <cc-chart
      [options]="options()"
      style="height: 360px"
      (pointClick)="onPointClick($event)"
      (pointEnter)="log('enter', $event)"
      (pointLeave)="log('leave', $event)"
      (legendToggle)="console.log($event.seriesId, $event.visible)"
    />
  `,
})
export class RevenueComponent {
  readonly options = signal<ChartOptions>({
    type: 'line',
    title: 'Weekly active users',
    data: {
      categories: ['W1', 'W2', 'W3', 'W4'],
      series: [
        { name: 'Web', data: [1200, 1350, 1480, 1620] },
        { name: 'Mobile', data: [2100, 2280, 2190, 2540] },
      ],
    },
  });

  onPointClick(ev: PointEvent) {
    console.log(ev.seriesName, ev.x, ev.y);
  }
}
```

| | |
|---|---|
| `[options]` | `ChartOptions` — watched by reference; a **new object** triggers `chart.update` |
| `(pointClick)` | payload `PointEvent` (bridges core `pointclick`) |
| `(pointEnter)` | payload `PointEvent` |
| `(pointLeave)` | payload `PointEvent` |
| `(legendToggle)` | payload `{ seriesId: string; visible: boolean }` |
| `(zoom)` | **v0.3.** payload `{ x?: [number, number]; y?: [number, number] } \| null` (`null` = reset) |
| `(annotationClick)` | **v0.3.** payload `{ index: number; annotation: Annotation }` |

Lifecycle mapping: `afterNextRender` → `createChart`; the `options` `effect()`
fires → `chart.update`; `DestroyRef.onDestroy` → `chart.destroy`.

The chart renders directly into the component's own host element, which is
`display: block`. Give it a height (`style="height: 360px"`, a host class,
whatever) — an unsized container has nothing to fill.

### Updates are immutable {#immutable-updates}

The `options` input is watched by an `effect()`, which reacts to **reference**
changes. Mutating the object in place will not push anything to the chart:

```ts
// ✅ triggers chart.update()
this.options.update((o) => ({ ...o, title: 'Weekly active users (updated)' }));

// ❌ silently ignored — same object reference
this.options().title = 'Weekly active users (updated)';
```

This is the same contract as the React wrapper, and the opposite of Vue's
deep watch. The upside over React's is that the effect reads the *whole*
`options()` signal, so there is no hand-maintained dependency list that can
fall out of sync with `ChartOptions` — any reference change is picked up,
including option blocks added by future core versions.

For very large `data`, replacing the whole options object is still cheap: it is
one shallow spread, and core diffs the result. If you want to bypass the
wrapper entirely, take the instance (below) and call `setData` directly.

## Per-type components

One per chart type — **39 of them**, same interface, minus `type` inside
`options` (their options type is `TypedChartOptions`). Class names are
`Cc` + type + `Chart`; selectors are `cc-<type>-chart`:

- **v0.1** `CcLineChart`, `CcAreaChart`, `CcBarChart`, `CcScatterChart`,
  `CcPieChart`, `CcDonutChart`
- **v0.2** `CcBubbleChart`, `CcSparklineChart`, `CcHistogramChart`,
  `CcBoxplotChart`, `CcCandlestickChart`, `CcOhlcChart`, `CcWaterfallChart`,
  `CcHeatmapChart`, `CcTreemapChart`, `CcSunburstChart`, `CcFunnelChart`,
  `CcRadarChart`, `CcGaugeChart`
- **v0.3** `CcRangeareaChart`, `CcBulletChart`, `CcDumbbellChart`,
  `CcLollipopChart`, `CcSlopeChart`, `CcStreamgraphChart`, `CcMarimekkoChart`,
  `CcPyramidChart`, `CcCalendarChart`, `CcRadialbarChart`, `CcRoseChart`,
  `CcViolinChart`, `CcParallelChart`, `CcIcicleChart`, `CcCirclepackChart`,
  `CcWordcloudChart`, `CcSankeyChart`, `CcGanttChart`, `CcChoroplethChart`,
  `CcNetworkChart`

```ts
@Component({
  selector: 'app-revenue',
  imports: [CcBarChart],
  template: `<cc-bar-chart [options]="options" style="height: 320px" />`,
})
export class RevenueComponent {
  readonly options = { data: revenue, stacked: true, title: 'Revenue' };
}
```

They emit exactly the same six outputs and expose the same `chart` signal.

## Getting the `Chart` instance

Every component exposes the underlying instance as a public `chart` **signal**
(`Signal<ChartInstance | null>` — `null` before the first render and after
destroy). Angular's `viewChild`/`@ViewChild` on the component class gives you
the component instance directly, so there is no separate "expose" mechanism:

```ts
import { Component, effect, signal, viewChild } from '@angular/core';
import { CcChart } from '@chartcraft/angular';
import type { ChartOptions } from '@chartcraft/angular';

@Component({
  selector: 'app-revenue',
  imports: [CcChart],
  template: `<cc-chart [options]="options()" style="height: 300px" />`,
})
export class RevenueComponent {
  readonly options = signal<ChartOptions>({ /* … */ } as ChartOptions);
  private readonly chartCmp = viewChild.required(CcChart);

  constructor() {
    effect((onCleanup) => {
      const chart = this.chartCmp().chart();
      if (!chart) return;                    // not rendered yet
      const off = chart.on('render', ({ reason }) => console.log('rendered:', reason));
      onCleanup(off);
    });
  }
}
```

Because `chart` is a signal, an `effect()` is the natural way to wait for it —
no `AfterViewInit` timing puzzle. The instance gives you the full imperative
surface: `on`/`off` beyond the bridged events, `setData`, `resize`,
`getOptions`, `exportImage`, `exportData`, `zoomTo`.

## SSR (Angular Universal / `@angular/ssr`)

The wrapper is SSR-safe **by construction**. The chart is created inside
[`afterNextRender()`](https://angular.dev/api/core/afterNextRender), which only
ever runs in the browser, after the first render — there is no
`isPlatformBrowser` check to forget and no chart work at module scope. Use the
components in a server-rendered app with no `@defer`, no `@if (isBrowser)`, and
no dynamic import needed.

- Server output contains no chart pixels or a11y DOM; HTML-payload chart
  content is the SSR snapshot item on the [roadmap](../roadmap.md).
- Give the host a CSS height that exists before hydration to avoid layout
  shift.

## Zoneless

Nothing in the package touches `NgZone`, and `zone.js` is not a dependency or a
peer dependency. Reactivity is signals end to end, so the wrapper behaves
identically under `provideZonelessChangeDetection()`. The package's own test
suite runs zoneless.

## Packaging note

`@chartcraft/angular` is built with **ng-packagr** into the Angular Package
Format (partial-Ivy `fesm2022` + `.d.ts`), which is what every Angular
consumer's build expects — the Angular linker finalizes the partial
declarations during your application build. This is the only ChartCraft package
not built with `tsup`; Angular components cannot be produced by a plain
esbuild transpile. See [DEVIATIONS](https://github.com/sitharaj88/chartcraft/blob/main/DEVIATIONS.md)
for the reasoning.
