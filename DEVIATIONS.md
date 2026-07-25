# Deviations from docs/api-contract.md

Per the contract's own instruction, any necessary deviation is recorded here.

## 1. Wrapper name collision: core `Chart` type → re-exported as `ChartInstance`

The contract says wrappers "re-export all core types" and also that each
wrapper exports its component as `Chart`. Those two requirements collide on the
name `Chart` (core's *instance interface* vs. the wrapper *component*) — a
module cannot export both under one name.

Resolution (applied identically in `@chartcraft/react`, `@chartcraft/vue`, and
`@chartcraft/svelte`):

- The **component** owns the `Chart` export (plus the per-type aliases
  `LineChart` / `AreaChart` / `BarChart` / `ScatterChart` / `PieChart` /
  `DonutChart`).
- Core's `Chart` instance interface is re-exported as the type alias
  **`ChartInstance`** (`export type ChartInstance = import('@chartcraft/core').Chart`).
- Every **other** core public type (`ChartOptions`, `ChartType`, `ChartData`,
  `SeriesOptions`, `DataValue`, `AxisOptions`, `LegendOptions`,
  `TooltipOptions`, `TooltipPoint`, `AnimationOptions`, `A11yOptions`,
  `ChartEventMap`, `PointEvent`, `Theme`) is re-exported under its original
  name.
- Core's `Chart` type is deliberately **not** re-exported under the name
  `Chart` by any wrapper.

## 2. Missing workspace link for `@chartcraft/core` in root `node_modules`

The preinstalled root `node_modules` contained all third-party dependencies but
no `node_modules/@chartcraft/core` workspace link (the lockfile has no
workspace entries), and running `npm install` / touching `package-lock.json`
was out of scope. A directory **junction**
`node_modules/@chartcraft/core → packages/core` was created manually so the
wrappers resolve their `"@chartcraft/core": "0.1.0"` dependency exactly as an
npm workspaces install would link it. No tracked file was modified. A future
`npm install` will replace the junction with npm's own workspace links
(harmless).

## 3. `@chartcraft/svelte` ships source, has a no-op build and logic-only tests

- Components ship as **source `.svelte` files** with a plain-JS entry
  (`src/index.js`) and hand-written `src/index.d.ts` — the standard
  distribution model for Svelte libraries (consumers compile via the `svelte`
  export condition). The package's `build` script is therefore a documented
  no-op (`echo`).
- Compiling `.svelte` files inside vitest would require plugins
  (`@sveltejs/vite-plugin-svelte` / `svelte-loader`) that are not part of the
  repo's preinstalled toolchain, so the vitest suite covers the extracted
  plain-JS wrapper logic (`src/options.js`: `withType`, `EVENTS`). All seven
  `.svelte` components are additionally smoke-compiled with the installed
  `svelte/compiler` during development (all compile clean, zero warnings), and
  `npm run typecheck` validates `src/index.d.ts` with `tsc --noEmit`.

## 4. Svelte reactive update fires once right after mount

`Chart.svelte` uses `$: if (chart) chart.update(options)` for reactive updates.
Assigning `chart` in `onMount` triggers this statement once with the unchanged
initial options; per the contract, `update()` is deep-merged **and diffed**, so
this is a no-op re-render. Documented in the component source.

## 5. Vue tests use `createApp` directly

`@vue/test-utils` is not installed at the repo root, so the Vue suite mounts
components with Vue's own `createApp(...).mount(el)` into jsdom. Behavioral
coverage (mount / deep-watch update / event bridging / destroy / exposed
`chart`) is equivalent.
