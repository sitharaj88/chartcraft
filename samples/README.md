# ChartCraft samples

**The same dashboard, built five times.**

Each folder is a standalone application that installs `@chartcraft/*` **from the
npm registry** — not via workspace links, not via relative paths into
`packages/`. That is deliberate: these are the proof that the *published*
packages work for a real consumer, not just inside this monorepo.

| Sample | Packages | Stack |
|---|---|---|
| [`vanilla/`](vanilla) | `@chartcraft/core` | Vite + TypeScript |
| [`react/`](react) | `@chartcraft/core` · `@chartcraft/react` | Vite + React 18 |
| [`vue/`](vue) | `@chartcraft/core` · `@chartcraft/vue` | Vite + Vue 3 |
| [`svelte/`](svelte) | `@chartcraft/core` · `@chartcraft/svelte` | Vite + Svelte 5 |
| [`angular/`](angular) | `@chartcraft/core` · `@chartcraft/angular` | Vite + Angular 21 (standalone · signals · zoneless) |

## Run one

```sh
cd samples/react     # or vanilla · vue · svelte · angular
npm install
npm run dev          # or: npm run build && npm run preview
```

Each sample keeps its own `node_modules` and lockfile. They are intentionally
**not** npm workspaces of this repo (the root `workspaces` field is
`packages/*` only), so `npm install` resolves from the registry exactly as it
would in your own project.

## The app: "Northwind Cloud — Revenue & Product Analytics"

A realistic SaaS analytics dashboard rather than a chart zoo — every chart is
the *right* form for the question it answers.

| Card | Type | Why this form |
|---|---|---|
| Monthly recurring revenue | `line` | Two segments on **one** y-axis — the no-dual-axis rule in practice |
| Platform capacity | `gauge` | A single value against a hard ceiling with named thresholds |
| Acquisition flow | `sankey` | The funnel *branches*; a funnel chart can't show where drop-offs went |
| Product mix | `treemap` | Eleven leaves under four parents, sized by revenue |
| Support load | `heatmap` | Two categorical dimensions × one magnitude |
| Revenue by segment | `bar` (stacked) | Total **and** mix, across few periods |
| Territory coverage | `choropleth` | Small inline synthetic GeoJSON — nothing is fetched or bundled |
| Contract value | `boxplot` | The spread is the story; mean ACV is the most misleading number on a SaaS dashboard |
| 4 × KPI tiles | `sparkline` | Trend shape at a glance, no axes needed |

It also exercises the cross-cutting features: an **annotation** marking a
product launch on the revenue line, **zoom** (drag to brush, with a Reset
button driven by the `zoom` event), **data labels**, and **`exportData()`**
wired to a working Export CSV button. Plus a live light/dark toggle, a
30d/90d/12m range switch, and an Inspector panel fed by `pointclick` that
reports whether the interaction came from a pointer or the keyboard.

## Why they look identical

`src/data.ts` and `src/styles.css` are **byte-identical across all five
samples** (verified by hash). Only the app code differs, and it is written
idiomatically for each framework — hooks and `useMemo` in React, `<script
setup>` and `computed` in Vue, runes and snippets in Svelte, standalone
components with `signal`/`computed` under `provideZonelessChangeDetection()` in
Angular, direct `createChart` calls in vanilla.

That is the point. Rendered side by side, the five builds differ by **~0.02%
of pixels** (Angular vs vanilla at 1440px light: 428 / 2,954,880 =
**0.0145%**), entirely in the footer line naming the package, with document
heights equal to the pixel. Feature parity across frameworks isn't a claim in
these samples — it's a measurement.

## Accessibility

The samples keep the library's accessibility guarantees rather than switching
them off for a demo: real landmarks, `aria-pressed` on the toggles, visible
focus, an `a11y.title` on every chart, and the screen-reader data table left
on. Tab to any chart, walk it with the arrow keys, press Enter — the Inspector
fills in and reports `Keyboard` as the input source.
