# @chartcraft/angular

Angular wrapper for [ChartCraft](https://sitharaj88.github.io/chartcraft/) —
a thin lifecycle/event bridge around
[`@chartcraft/core`](https://www.npmjs.com/package/@chartcraft/core), at
full feature parity with the vanilla API.

Standalone components, signal `input()`/`output()`, SSR-safe via
`afterNextRender()`, and **no `zone.js` dependency** — works in zone-based and
zoneless apps alike. Requires Angular 20+.

```sh
npm install @chartcraft/angular
```

```ts
import { Component, signal } from '@angular/core';
import { CcLineChart } from '@chartcraft/angular';
import type { ChartSpec } from '@chartcraft/angular';

@Component({
  selector: 'app-wau',
  imports: [CcLineChart],
  template: `<cc-line-chart [options]="options()" style="height: 320px" />`,
})
export class WauComponent {
  readonly options = signal<ChartSpec>({
    title: 'Weekly active users',
    data: {
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      series: [{ name: 'WAU', data: [12000, 14200, 15800, 21000, 31000] }],
    },
  });
}
```

One component per chart type (`CcLineChart`, `CcBarChart`, `CcSankeyChart`,
`CcChoroplethChart`, …, 39 in total) under the `cc-` selector prefix, plus
`<cc-chart [options]="{ type: '...' }">` for the generic form.

**Full guide:** <https://sitharaj88.github.io/chartcraft/frameworks/angular>

---

## Reaching the instance: `(ready)` and `whenReady()`

`viewChild()` is `undefined` before the view exists and the `chart` signal is
`null` before the first render, so `this.hero()?.chart()?.…` used to mean two
levels of nullability in every imperative call site. Two affordances remove it.

In a template, bind the `(ready)` output — it emits exactly once, from
`afterNextRender`, with the live instance:

```html
<cc-line-chart [options]="options()" (ready)="onChartReady($event)" />
```

In setup code, await `whenReady()` — already resolved if the chart is up:

```ts
readonly hero = viewChild.required(CcLineChart);

constructor() {
  afterNextRender(async () => {
    const chart = await this.hero().whenReady();
    chart.zoomTo({ x: [0, 10] });
  });
}
```

The `chart` signal is still there for event handlers and template reads, where
the instance already exists.

## One package, not two

`@chartcraft/angular` re-exports core's runtime values as well as its types, so
`@chartcraft/core` does not need to be a direct dependency:

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

These are named re-exports, so they tree-shake: importing `lightTheme` alone
pulls in neither the chart engine nor any component.

## `ChartSpec`: options in their own module

`ChartSpec` is `Omit<ChartOptions, 'type'>` — the type for keeping chart
configuration in a plain `specs.ts` and binding it to the matching per-type
component. Every ChartCraft wrapper exports it under this same name.

```ts
// specs.ts
import type { ChartSpec } from '@chartcraft/angular';
export const revenue: ChartSpec = {
  title: 'Revenue',
  data: { categories: ['Q1', 'Q2'], series: [{ name: 'ARR', data: [12.4, 13.1] }] },
};
```
```html
<cc-bar-chart [options]="revenue" />
```

`TypedChartOptions` is a deprecated alias of `ChartSpec`, kept so 0.3.0 code
keeps compiling. It will be removed in 1.0.

## How updates reach the chart

The `options` input is watched by **reference**: assign a new object to trigger
an update; mutating in place does nothing (same contract as the React wrapper).

```ts
this.options.set({ ...this.options(), title: 'New title' });  // ✅
this.options().title = 'New title';                           // ❌ silently ignored
```

The inverse trap is an object literal written inline in the template —
`[options]="{ title: 'WAU', data: data() }"` — which is rebuilt on every
change-detection pass and therefore pushes a redundant `chart.update()` each
time (and with `zoom: { enabled: true }` discards the user's viewport). Hold
options in a `signal` or `computed()` and bind that.

In development the wrapper tells you when you get this wrong: if `[options]`
arrives as a new-but-deeply-equal object three passes in a row, it logs one
`console.warn` naming the component. The check is guarded by `isDevMode()`, which
is `false` in every production build, so it never runs in a shipped app.

## Known limitation

The per-type components share one loose options type: `ChartSpec` for all 39 of
them, so `<cc-gauge-chart [options]="{ sankey: { … } }">` type-checks even under
`strictTemplates`. The components buy you the correct `type` string, not a
narrowed options shape.

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
