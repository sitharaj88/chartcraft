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

## 6. Combo: horizontal charts ignore per-series `type` overrides

The contract defines combo (per-series `type` on cartesian roots) and,
separately, `horizontal` as "bar only", but does not say how they compose.
Mixed marks are implemented for vertical orientation only: when
`horizontal: true` is in effect (bar root), every series renders as the root
type's kind and per-series `type` overrides are ignored. Rationale:
line/area/scatter marks have no defined horizontal geometry in the contract,
and silently rotating them would invent one.

## 7. Sparkline: explicit `legend: true` is honored; `title`/`subtitle` are never rendered

The contract describes sparkline as a chrome-free preset ("no axes, grid,
legend, title padding; tooltip optional (default off)"). Implemented as a
*preset of defaults*, consistent with the tooltip wording: legend and tooltip
default OFF but an explicit `legend: true` / `tooltip: true` is honored.
`title`/`subtitle` are unconditionally not rendered (there is no chrome area
to render them into); use `a11y.title` for the accessible name.

## 8. OHLC data: `y` defaults to the close

The contract says `y` is "unused" for candlestick/ohlc data. Normalization
(`[x, o, h, l, c]` tuples and `{o,h,l,c}` objects without `y`) sets
`y = c` so the generic pipeline (a11y table fallback, announcements, events,
domains before the candlestick definition refines them) has a sensible value
instead of rendering every point as a gap. An explicit `y` still wins. The
candlestick/ohlc definitions remain free to override tables/tooltips with
full OHLC columns per the contract.

## 9. Funnel dark-mode ramp direction: starts at step `#184f95` and lightens

The contract fixes the ordinal ramp's *start* step per scheme (light: no
lighter than `#86b6ef`, dark: no darker than `#184f95`, both to clear 2:1 on
their surface) but not the step direction in dark mode. Implemented as: light
mode starts at index 3 (`#86b6ef`) and darkens toward index 12; dark mode
starts at index 10 (`#184f95`) and lightens toward index 0 — N stages take
evenly spaced (rounded) indices within that legal span, so every chosen step
clears 2:1 on its surface and stage 1 always sits at the mandated start step.

## 10. Gauge bands: band-colored track at 0.35 alpha under a full-alpha value arc

The contract says "value needle/arc fill in series-1 blue unless
`gauge.bands` given" and the spec adds "then band colors, value arc colored
by the band it falls in", without describing how the unreached portion of the
arc looks. Implemented as: with bands configured the gridline track is
replaced by band-colored segments at 0.35 alpha (any range beyond the last
band falls back to the gridline color), and the value arc overlays them at
full alpha in the color of the band the value falls in (values beyond the
last band use the last band's color). Without bands, the track is the
gridline color and the value arc is `theme.series[0]`, per the contract.

## 11. Treemap/sunburst TypeScript data shape: `TreeNode.value` needs a cast (or `y`)

The contract declares treemap/sunburst data as `data: TreeNode[]`, but the
`DataValue` union in `types.ts` (which `SeriesOptions.data` uses, and which
must not be edited per AUTHORING.md) does not include `TreeNode` — `value`
is not a `DataPoint` field. At runtime both types accept genuine
`TreeNode[]` input (`value`, `color`, `children`, nested) by reading the RAW
options data: the generic normalizer maps object data through `DataPoint.y`,
so a top-level `value` would otherwise be lost. TypeScript callers either
cast (`data: nodes as unknown as DataValue[]`) or pass the value as `y`
(`{ label, y: 10 }`), which is honored as a fallback for `value`.

## 12. Treemap/sunburst point events: `dataIndex` is the depth-first index; `x`/`y` only meaningful for top-level nodes

Per the contract, keyboard navigation and `dataIndex` follow the type's
natural reading order: the flattened depth-first LEAF order for treemap and
the depth-first order over ALL nodes for sunburst. The shared pipeline
builds `pointenter/leave/click` payloads from the backing normalized point
(`series.points[dataIndex]`), which only exists for top-level data. So for
nested trees: events still fire with the correct `dataIndex` while it
addresses an existing top-level datum (and `x`/`y` then reflect that
top-level datum, not the nested node), and are not emitted for indices
beyond the top-level count. Tooltips, hit-testing, focus announcements and
the a11y table are unaffected — they always use the hierarchy node's
path/value/share.

## 13. Heatmap legend auto policy: shown for a single row too

The generic legend auto policy is "shown when series >= 2". The heatmap's
legend is a gradient color-scale bar (the only key to what cell colors
mean), so its `resolveOptions` hook resolves legend "auto" to SHOWN even
with one series/row. An explicit `legend: false` (or `legend.show: false`)
is honored.

## 14. Histogram bin-edge ticks: guaranteed for 'auto' nice-width bins, best-effort for explicit `bins`

The pipeline owns tick generation (`layout.ts`, nice 1/2/5-step ticks) and
may not be modified, so exact tick positions cannot be injected per type.
The histogram therefore makes the edges themselves nice: 'auto'
(Freedman–Diaconis, clamped 5..60) snaps the FD width UP to a 1/2/5×10^k
width and aligns the first edge to a multiple of it, then sets the x-axis
extents to the outer edges and (for <= 12 bins) `ticks.count` to the bin
count — the pipeline's nice ticks then land EXACTLY on every bin edge. An
explicit numeric `bins` splits the raw data extent equally, so its edges are
generally not nice numbers: tick positions/labels remain the pipeline's nice
values within the correct linear scale rather than exact edge values. Above
12 bins the tick count falls back to the width-based default (a subset of
edges when the bin width is nice) to keep labels legible.

## 15. Histogram events: `dataIndex` is the bin index; `x`/`y` come from the backing raw sample

Bins are the interaction unit (contract: "dataIndex meaningful for the
type"): hover/keyboard walk bins and `dataIndex` is the bin index. The
shared pipeline builds `pointenter/leave/click` payloads from
`series.points[dataIndex]` — for a histogram that backing point is the
`dataIndex`-th RAW SAMPLE, so the event's `x`/`y` carry that sample, not
the bin range/count (and events are not emitted for bin indices beyond the
sample count). Tooltip, announcements and the a11y table always carry the
bin range + count.

## 16. Boxplot raw arrays are read from the RAW data; any numeric array entry = raw samples

The generic normalizer (not modifiable) folds numeric arrays into tuple
shapes (`[x, y]` / `[x, y, r]` / `[x, o, h, l, c]`), which would mangle a
raw `number[]` sample. The boxplot definition therefore reads the RAW
series data for its per-category input: any numeric-array entry (any
length, including 3 and 5) is treated as raw samples and summarized
(quartiles via linear interpolation / R-7; whiskers to the most extreme
samples within 1.5×IQR; values beyond are outlier dots). 5-number objects
are used verbatim. The mangled normalized points remain only as the
pipeline's per-category backing data (count, event identity).

## 17. Candlestick/ohlc: animation is force-disabled; doji (c === o) colored `theme.up`

The contract mandates "never animated sweeps — appear instantly", so the
financial definitions disable the animation entirely in their
resolveOptions hook — an explicit `animation: true` is overridden (there is
no legal animated presentation for these marks) and all candle geometry is
non-interpolated. Bodies/ticks compare close vs open; the contract does not
specify the equal case, so `c === o` (doji) renders in `theme.up`.

## 18. Waterfall renders the first visible series only

The contract declares waterfall data as a single series. When multiple
series are supplied anyway, the definition lays out and renders the FIRST
visible series and ignores the rest (they still occupy legend/palette
identity slots via the shared pipeline). A total (`isTotal: true`) bar
rises from the zero baseline and RESETS the running total to its absolute
value; zero deltas render as neutral (theme.neutral) hairline-height bars.
