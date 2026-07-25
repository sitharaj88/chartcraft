# ChartCraft

**A framework-agnostic TypeScript charting library with a canvas core, thin
React/Vue/Svelte wrappers, and accessibility built in — not bolted on.**

ChartCraft is built for teams that ship charts to production: predictable
performance from 10 points to 1M, a colorblind-validated default palette,
a parallel DOM layer that makes every chart readable by assistive technology,
and one API contract shared by every framework wrapper.

## Highlights

- **Framework-agnostic canvas core.** `@chartcraft/core` has **zero runtime
  dependencies** and renders to Canvas 2D behind a swappable `Renderer`
  interface. Wrappers add lifecycle, resize observation, and event bridging —
  nothing else — so every framework has feature parity by construction.
- **React, Vue, and Svelte wrappers.** One idiomatic `<Chart>` component per
  framework, plus per-type conveniences (`<LineChart>`, `<BarChart>`, …). All
  SSR-safe.
- **Accessibility first.** Canvas is opaque to screen readers, so every chart
  maintains a parallel DOM layer: `role="img"` summary, a real `<table>` of the
  data, full keyboard navigation with `aria-live` announcements, and respect
  for `prefers-reduced-motion` and `forced-colors`. See
  [docs/accessibility.md](docs/accessibility.md).
- **Validated colorblind-safe palette.** The default 8-slot categorical palette
  is machine-validated (adjacent-pair CVD ΔE ≥ 8) in both light and dark modes.
  Series color follows series *identity*, never rank — filtering never repaints
  the survivors. See [docs/concepts/theming.md](docs/concepts/theming.md).
- **Performance by design.** Retained-model pipeline with diffed updates,
  no per-frame allocation, automatic LTTB downsampling beyond a configurable
  threshold, `ResizeObserver` + `requestAnimationFrame`-coalesced redraws.
- **TypeScript, strict.** Every public type is exported. ESM + CJS + `.d.ts`.

## Chart types (v0.1)

`line` · `area` (stackable) · `bar` (grouped, stacked, horizontal) · `scatter` · `pie` · `donut`

## Install

```sh
# Core only (vanilla / any framework)
npm install @chartcraft/core

# React
npm install @chartcraft/core @chartcraft/react

# Vue 3
npm install @chartcraft/core @chartcraft/vue

# Svelte 4/5
npm install @chartcraft/core @chartcraft/svelte
```

## Quick start

### Vanilla (any framework, no framework)

```ts
import { createChart } from '@chartcraft/core';

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'line',
  title: 'Monthly revenue',
  data: {
    categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [
      { name: 'North', data: [42, 48, 51, 47, 60, 66] },
      { name: 'South', data: [30, 32, 29, 38, 41, 45] },
    ],
  },
});

chart.on('pointclick', (ev) => console.log(ev.seriesName, ev.x, ev.y));
chart.update({ title: 'Monthly revenue (USD k)' }); // diffed re-render
// chart.destroy(); // when done
```

### React

```tsx
import { LineChart } from '@chartcraft/react';

export function Revenue() {
  return (
    <LineChart
      title="Monthly revenue"
      data={{
        categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        series: [
          { name: 'North', data: [42, 48, 51, 47, 60, 66] },
          { name: 'South', data: [30, 32, 29, 38, 41, 45] },
        ],
      }}
      onPointClick={(ev) => console.log(ev.seriesName, ev.x, ev.y)}
    />
  );
}
```

## Documentation

| | |
|---|---|
| [Getting started](docs/getting-started.md) | Install, first chart in every framework, updating, destroying |
| [Data model](docs/concepts/data-model.md) | Series, the three `DataValue` shapes, null gaps, stable identity |
| [Scales & axes](docs/concepts/scales-and-axes.md) | Axis types, auto-inference, ticks, log & time handling |
| [Theming](docs/concepts/theming.md) | Light/dark/auto, the validated palette, custom themes |
| [Interactions](docs/concepts/interactions.md) | Tooltips, legend toggling, the events API |
| [Accessibility](docs/accessibility.md) | The parallel DOM strategy, keyboard map, WCAG mapping |
| [Performance](docs/performance.md) | Downsampling, update vs recreate, large-data tips |
| [React](docs/frameworks/react.md) · [Vue](docs/frameworks/vue.md) · [Svelte](docs/frameworks/svelte.md) | Per-framework guides |
| [API reference](docs/api/core.md) | Complete `@chartcraft/core` reference |
| [Roadmap](docs/roadmap.md) | What's next after v0.1 |

Runnable demos live in [`examples/`](examples/) — build the core, serve the
repo root, and open `examples/index.html`.

## Developing in this monorepo

npm workspaces; packages live under `packages/`.

```sh
npm install        # install all workspace dependencies
npm run build      # build core + wrappers (tsup, ESM + CJS + .d.ts)
npm test           # vitest across all packages
npm run docs:dev   # docs site (VitePress) with live chart demos
npm run docs:build # static docs site → docs/.vitepress/dist
```

Both workflows are **manual only** — start them from the repository's Actions
tab, or from the CLI:

```sh
gh workflow run ci.yml --ref main            # build, typecheck, test (Node 18/20/22)
gh workflow run deploy-docs.yml --ref main   # build and publish the docs site
```

`deploy-docs` provisions the GitHub Pages site itself (`configure-pages` with
`enablement: true`), so no manual Pages setup is needed, and the base path is
derived from the repository name — correct for a project page or a user page.
Once it has run, the site is live at <https://sitharaj88.github.io/chartcraft/>.

To go back to deploying on every push, restore the `push:` trigger at the top
of `.github/workflows/deploy-docs.yml` (and `push:`/`pull_request:` in
`ci.yml`).

The public API surface is defined by [`docs/api-contract.md`](docs/api-contract.md)
— core implements it, wrappers consume it, docs document it. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the contract-first workflow.

## License

MIT © ChartCraft contributors. See [LICENSE](LICENSE).
