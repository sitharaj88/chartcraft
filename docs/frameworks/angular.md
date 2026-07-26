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
npm install @chartcraft/angular
```

Requires Angular **20 or newer**.

**One package, not two.** `@chartcraft/angular` depends on core and re-exports its
whole public surface — every type *and* every value — so `@chartcraft/core` does
not need to be a second direct dependency:

```ts
import {
  CcLineChart,
  // themes & palette
  lightTheme, darkTheme, categoricalPalette, sequentialPalette, sequentialRampFor,
  // utilities
  LinearScale, TimeScale, BandScale, LogScale, downsampleLTTB,
  // custom decorators
  registerDecorator, unregisterDecorator, decorators, clearDecorators,
  // escape hatch + version
  createChart, version,
} from '@chartcraft/angular';
```

These are named re-exports, never `export *`, so they tree-shake: importing
`lightTheme` from the wrapper is byte-identical to importing it from core and
pulls in neither the chart engine nor any component.

Core's `Chart` *interface* would collide with the `Cc…Chart` component classes,
so the instance type is re-exported as **`ChartInstance`**. Every other core type
keeps its own name.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and binding it to the matching per-type
component. All four ChartCraft wrappers export it under this same name, so a
spec module is portable between them.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/angular';

export const revenue: ChartSpec = {
  title: 'Revenue',
  data: {
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: 'Product', data: [12.4, 13.1, 14.8, 16.2] }],
  },
};
```
```html
<cc-bar-chart [options]="revenue" />
```

`ChartSpec` replaces `TypedChartOptions`, which is kept as a **deprecated
alias** so 0.3.0 code keeps compiling; it will be removed in 1.0.

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
| `(ready)` | **v0.4.** payload `ChartInstance`. Emits exactly **once**, from `afterNextRender`, with the live instance. |

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

The inverse trap is an object literal written inline in the template —
`[options]="{ title: 'WAU', data: data() }"` — which is rebuilt on every
change-detection pass and therefore pushes a redundant `chart.update()` each
time (and with `zoom: { enabled: true }`, an update whose data lands on a
different domain discards the user's viewport). Hold options in a `signal` or
`computed()` and bind that.

Since **0.4** the wrapper tells you when you get this wrong: if `[options]`
arrives as a new-but-deeply-equal object three passes in a row, it logs one
`console.warn` naming the component. The check is guarded by
[`isDevMode()`](https://angular.dev/api/core/isDevMode), which is `false` in
every production build, so it never runs in a shipped app.

::: tip Since 0.4, an update only resets the zoom when it has to
The viewport now survives any update whose **computed domains** are unchanged —
so a theme change, an equivalent re-send, or new values on the same timestamps
all keep the window. See
[Zoom, pan & brush](../features/zoom-pan-brush.md#the-viewport-across-an-update).
:::

For very large `data`, replacing the whole options object is still cheap: it is
one shallow spread, and core diffs the result. If you want to bypass the
wrapper entirely, take the instance (below) and call `setData` directly.

## Per-type components

One per chart type — **39 of them**, same interface, minus `type` inside
`options` (their options type is `ChartSpec`). Class names are
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
import { Component, signal } from '@angular/core';
import { CcBarChart } from '@chartcraft/angular';
import type { ChartSpec } from '@chartcraft/angular';

@Component({
  selector: 'app-revenue',
  imports: [CcBarChart],
  template: `<cc-bar-chart [options]="options()" style="height: 320px" />`,
})
export class RevenueComponent {
  readonly options = signal<ChartSpec>({ data: revenue, stacked: true, title: 'Revenue' });
}
```

They emit exactly the same outputs (including `(ready)`) and expose the same
`chart` signal and `whenReady()` method.

::: tip Known limitation: the per-type components share one options type
`[options]` is the same loose `ChartSpec` for all 39 of them, so
`<cc-gauge-chart [options]="{ sankey: { nodeWidth: 12 } }">` type-checks even
under `strictTemplates`. The components buy you the correct `type` string, not a
narrowed options shape. Narrowing was assessed and deliberately deferred: it
would break the shared-`ChartSpec` pattern above, and it is a 1.0-shaped change.
:::

## Getting the `Chart` instance: `(ready)` and `whenReady()`

`viewChild()` is `undefined` before the view exists and the `chart` signal is
`null` before the first render, so `this.hero()?.chart()?.…` used to mean two
levels of nullability at every imperative call site. Since **0.4** two
affordances remove it.

In a template, bind the `(ready)` output — it emits exactly once, from
`afterNextRender`, with the live instance:

```html
<cc-line-chart [options]="options()" (ready)="onChartReady($event)" />
```

In setup code, await `whenReady()` — already resolved if the chart is up:

```ts
import { Component, afterNextRender, signal, viewChild } from '@angular/core';
import { CcLineChart } from '@chartcraft/angular';
import type { ChartSpec } from '@chartcraft/angular';

@Component({
  selector: 'app-revenue',
  imports: [CcLineChart],
  template: `<cc-line-chart [options]="options()" style="height: 300px" />`,
})
export class RevenueComponent {
  readonly options = signal<ChartSpec>({ /* … */ } as ChartSpec);
  private readonly hero = viewChild.required(CcLineChart);

  constructor() {
    afterNextRender(async () => {
      const chart = await this.hero().whenReady();
      chart.zoomTo({ x: [0, 10] });
    });
  }
}
```

The `chart` signal (`Signal<ChartInstance | null>` — `null` before the first
render and after destroy) is still there for event handlers and template reads,
where the instance already exists, and an `effect()` over it still works:

```ts
effect((onCleanup) => {
  const chart = this.hero().chart();
  if (!chart) return;                    // not rendered yet
  onCleanup(chart.on('render', ({ reason }) => console.log('rendered:', reason)));
});
```

Either way the instance gives you the full imperative surface: `on`/`off`
beyond the bridged events, `setData`, `resize`, `getOptions`, `exportImage`,
`exportData`, `zoomTo`.

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
