# @chartcraft/angular

Angular wrapper for [ChartCraft](https://sitharaj88.github.io/chartcraft/) —
a thin lifecycle/event bridge around
[`@chartcraft/core`](https://www.npmjs.com/package/@chartcraft/core), at
full feature parity with the vanilla API.

Standalone components, signal `input()`/`output()`, SSR-safe via
`afterNextRender()`, and **no `zone.js` dependency** — works in zone-based and
zoneless apps alike. Requires Angular 20+.

```sh
npm install @chartcraft/core @chartcraft/angular
```

```ts
import { Component, signal } from '@angular/core';
import { CcLineChart } from '@chartcraft/angular';
import type { TypedChartOptions } from '@chartcraft/angular';

@Component({
  selector: 'app-wau',
  imports: [CcLineChart],
  template: `<cc-line-chart [options]="options()" style="height: 320px" />`,
})
export class WauComponent {
  readonly options = signal<TypedChartOptions>({
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
`<cc-chart [options]="{ type: '...' }">` for the generic form. The public
`chart` signal — reached with `viewChild(CcChart)` — is the underlying
`ChartInstance` for `exportImage()`, `exportData()`, `zoomTo()`, and friends.

The `options` input is watched by **reference**: assign a new object to
trigger an update; mutating in place does nothing (same contract as the React
wrapper).

**Full guide:** <https://sitharaj88.github.io/chartcraft/frameworks/angular>

---

Built by [Sitharaj](https://sitharaj.in) —
[GitHub](https://github.com/sitharaj88) ·
[LinkedIn](https://www.linkedin.com/in/sitharaj08) ·
[buy me a coffee](https://www.buymeacoffee.com/sitharaj88)

MIT
