# Deviations from docs/api-contract.md

Per the contract's own instruction, any necessary deviation is recorded here.
This file is the honest record of where the implementation and the contract
diverge, and why.

**One sequential ledger, grouped by area.** v0.3 was built by parallel agents
that each improvised a prefix (`§19–28`, `I*`, `C*`, `P1.x`, `G.x`, `F1.x`,
`CC*`, `W*`); those collided and are gone. Entries resolved by the v0.3
shared-layer hardening pass are **deleted** rather than marked — the seams they
asked for exist now, and `packages/core/src/charts/AUTHORING.md` documents them.

| # | Area |
|---|---|
| 1–6 | Packaging, workspace & wrappers |
| 7–12 | Public types & data shapes |
| 13–21 | Shared pipeline: ingest, registry stages, decorators |
| 22–25 | Export, zoom & versioning |
| 26–27 | Cartesian & combo |
| 28–34 | Statistical & financial types |
| 35–43 | Matrix & hierarchy types |
| 44–50 | Radial & polar types |
| 51–56 | Interval & comparison types |
| 57–61 | Composition types |
| 62–65 | Distribution types |
| 66–73 | Flow & schedule types |
| 74–84 | Geographic & graph types |
| 85–90 | Cross-cutting features |
| 91–93 | Testing notes |
| 94 | Quality-audit finding accepted as documented behaviour |
| 95–105 | Quality-audit escalations: the architect's rulings |
| 106 | Touch interaction |

---

# Packaging, workspace & wrappers

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
- Every **other** core public type is re-exported under its original name.
  The wrappers' type surface is defined as "whatever `@chartcraft/core`'s entry
  exports", not a hand-picked subset — so `ChartOptions`, `ChartType`,
  `ChartData`, `SeriesOptions`, `SeriesKind`, `SeriesData`, `GraphData`,
  `DataValue`, `DataPoint`, `TreeNode`, `AxisOptions`, `LegendOptions`,
  `TooltipOptions`, `TooltipPoint`, `AnimationOptions`, `A11yOptions`,
  `ChartEventMap`, `PointEvent`, `Theme`, the v0.3 feature option types
  (`ErrorBarOptions`, `TrendlineOptions`, `DataLabelOptions`, `Annotation`,
  `ZoomOptions`, `ZoomRange`, `GeoFeatureCollection`) and the decoration
  plumbing (`Decorator`, `DecoratorContext`, `DecoratorHost`,
  `DecorationLayer`, `Viewport`) all travel automatically.
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

## 3. `@chartcraft/svelte` ships source and has a no-op build

Components ship as **source `.svelte` files** with a plain-JS entry
(`src/index.js`) and hand-written `src/index.d.ts` — the standard distribution
model for Svelte libraries (consumers compile via the `svelte` export
condition). The package's `build` script is therefore a documented no-op
(`echo`), and `npm run typecheck` validates `src/index.d.ts` with `tsc --noEmit`.

## 4. Svelte components are compiled IN MEMORY for tests

The repo ships no `@sveltejs/vite-plugin-svelte`, so for a while the Svelte suite
could only cover the extracted plain-JS helpers. It now does better without
adding a dependency: `test/loader.js` compiles a component with the installed
`svelte/compiler`, rewrites the handful of ESM `import`/`export default`
statements the compiler emits into calls on an injected resolver, and evaluates
it. `test/component.test.js` (`@vitest-environment jsdom`, stubs in
`test/setup.js`) then drives the real Svelte 4 component API
(`new C({ target, props })`, `$set`, `$on`, `$destroy`) against the real
`@chartcraft/core`.

Two details worth knowing:

- The `svelte` package only serves its **DOM** runtime under the `"browser"`
  export condition, which vitest's node-side resolver does not set. A bare
  `import 'svelte'` yields `ssr.js`, whose `onMount` is a **no-op** — components
  mount but never create a chart. The loader imports
  `node_modules/svelte/src/runtime/index.js` by path to get the DOM runtime, and
  re-exports `tick` so tests never touch the bare specifier.
- `svelte/internal` has a single unconditional export, so the compiled component
  and the runtime share one module instance (which is what makes lifecycle and
  `createEventDispatcher` work).

The source-shape suite (`test/options.test.js`) is kept as the exhaustive surface
check over all 39 aliases (exported, injects its type, forwards every `EVENTS`
entry, compiles warning-free); the component suite covers behaviour.

## 5. Svelte reactive update fires once right after mount; Vue tests use `createApp`

`Chart.svelte` uses `$: if (chart) chart.update(options)` for reactive updates.
Assigning `chart` in `onMount` triggers this statement once with the unchanged
initial options; per the contract, `update()` is deep-merged **and diffed**, so
this is a no-op re-render. Documented in the component source.

`@vue/test-utils` is not installed at the repo root, so the Vue suite mounts
components with Vue's own `createApp(...).mount(el)` into jsdom. Behavioral
coverage (mount / deep-watch update / event bridging / destroy / exposed
`chart`) is equivalent.

## 6. React's update effect derives its dependency list from an exhaustive key list

The React wrapper cannot depend on the options *object* (it is a fresh object
every render), so `useEffect` depends on the individual `ChartOptions` keys.
Hand-maintaining that inline array is how a wrapper silently stops re-rendering
when a new option block ships: the prop changes, no listed dependency changes,
`chart.update()` is never called.

`src/Chart.tsx` therefore declares the keys once as
`OPTION_KEYS = [...] as const satisfies readonly (keyof ChartOptions)[]`, maps it
to the (fixed-length) dependency array, and asserts exhaustiveness at compile
time:

```ts
type UnlistedOptionKey = Exclude<keyof ChartOptions, (typeof OPTION_KEYS)[number]>;
const _optionKeysAreExhaustive: UnlistedOptionKey extends never ? true : UnlistedOptionKey = true;
```

Adding a field to core's `ChartOptions` without listing it here now fails `tsc`
with the missing key's name, and `test/bridge.test.tsx` proves every listed key
round-trips to `chart.update()`. Vue (deep `watch` on one object) and Svelte
(reactive statement on `options`) need no equivalent — they are structurally
immune.

---

# Public types & data shapes

## 7. `SeriesOptions.data` is `SeriesData`, not `DataValue[]`

The contract puts a `{ nodes, links }` payload on the first series for `sankey`
and `network` — a shape no `DataValue` can express, because it is not one datum,
it is the whole series. `SeriesOptions.data` is therefore
`SeriesData = DataValue[] | GraphData` (both exported), so both shapes typecheck
with **no cast**. Internally exactly one helper narrows it,
`data/normalize.ts#dataValuesOf`, with `isGraphData` as its predicate.

The `DataValue` union itself is otherwise unchanged.

## 8. `DataPoint.value` is declared, so a `TreeNode[]` needs no cast either

The contract declares treemap/sunburst/icicle/circlepack data as
`data: TreeNode[]`, but `TreeNode.value` was not a `DataPoint` field, so
TypeScript callers had to cast. `DataPoint` now declares `value?: number`,
documented as the hierarchy node value, which makes a genuine `TreeNode`
assignable to `DataValue`.

The hierarchy types still read their nodes from the **RAW** options data (the
generic normalizer maps object data through `DataPoint.y`, so a top-level
`value` would otherwise be lost), and `y` is honored as a fallback for `value`.

## 9. `y` gains fallbacks, and `low`/`high` join the value extent unconditionally

So that range-shaped types (rangearea, dumbbell, bullet, gantt) need no domain
plumbing of their own, `buildModel` includes any point's `low`/`high` in the y
extent, and `normalizeSeriesData` falls `y` back to `c` → `weight` → `low`. Both
are no-ops for every v0.1/v0.2 chart (those fields did not exist before v0.3),
which is why the v0.2 tests were unaffected.

Three-element tuples are shape-ambiguous (`[x, y, r]` vs `[x, low, high]`), so
the reading is a registry declaration, `needs.triple: 'size' | 'range'`,
defaulting to `'size'` — the v0.2 bubble behavior is byte-identical.

## 10. OHLC data: `y` defaults to the close

The contract says `y` is "unused" for candlestick/ohlc data. Normalization
(`[x, o, h, l, c]` tuples and `{o,h,l,c}` objects without `y`) sets `y = c` so
the generic pipeline (a11y table fallback, announcements, events, domains before
the candlestick definition refines them) has a sensible value instead of
rendering every point as a gap. An explicit `y` still wins. The candlestick/ohlc
definitions remain free to override tables/tooltips with full OHLC columns per
the contract.

## 11. `SeriesKind` gained `'rangearea'`; the combo union is five wide

The contract's v0.2 combo union is `'line' | 'bar' | 'area' | 'scatter'`, and
v0.3 describes a rangearea as something that "pairs with a `line` series …
(combo)" without making it a per-series value. Implemented by making the band a
real **mark kind**: `SeriesKind` is five wide, `SeriesOptions.type: 'rangearea'`
is legal on any cartesian root, and the shared engine owns the geometry, the
paint order (`rangearea < area < bar < line < scatter`) and the hit test.
`src/charts/rangeband.ts` is the mark module, a peer of `bar.ts` / `line.ts`.

Consequence: a `'rangearea'` series is excluded from LTTB downsampling (LTTB
picks indices from `y` alone and would desynchronize the two bounds).

## 12. `getOptions().legend` carries an extra `auto` flag

`ResolvedLegend` gained `auto: boolean` — true when the caller did not set
`legend`/`legend.show`, i.e. `show` is a policy decision a later stage may still
refine. It is what lets `ChartTypeDefinition.resolveLegend` (entry 16) avoid
overriding an explicit choice without a module-level side table.

`getOptions()` returns resolved options, so the snapshot has one field the
contract's `LegendOptions` does not declare. Reading it is supported; the
contract's own three fields keep their documented meaning.

---

# Shared pipeline: ingest, registry stages, decorators

## 13. Option ingest deep-clones, with a documented rule about what it does NOT clone

The contract promises "the chart never mutates the object you pass", and the
chart does mutate its own retained options (a legend toggle flips
`series[i].visible`). `util.ts#deepClone` — applied to everything `deepMerge`
takes from a patch — makes ingest take ownership:

- **plain objects** are cloned recursively (every option the pipeline writes to
  lives there: `data`, `data.series[i]`, `xAxis`, `legend`, …);
- **arrays** always become a fresh array, but their ELEMENTS are only cloned
  when the element is itself a plain object or an array. A `number[]` sample, a
  `Float64Array` or an array of `Date`s therefore costs one spine copy, not one
  allocation per datum;
- **carried by reference, never cloned:** functions (`ticks.format`,
  `tooltip.format`, `dataLabels.format`), `Date`, `RegExp`, `Map`/`Set`,
  `ArrayBuffer` views and every class instance. Cloning those would break
  identity (a `Date` datum, a custom `Theme` class) or silently drop behavior (a
  formatter's closure).

Consequences worth knowing:

- object-shaped data (`{ x, y }` points, GeoJSON rings of `[lon, lat]` tuples) IS
  cloned element-wise, because the pipeline hands those objects to per-type
  modules as the caller's source of truth. That is ONE O(n) pass on ingest — the
  same order as the normalization pass right behind it — and it happens per
  `createChart`/`update` payload, never per frame. `deepMerge` reuses untouched
  branches of the already-owned base, so `update({ title })` copies nothing but
  the title.
- `choropleth.geojson` is cloned once at mount, so the parse cache keyed on
  object identity keys on the chart's own copy and stays stable across updates
  that do not pass a new topology.
- `ChartImpl#toggleSeries` is additionally copy-on-write (it rebuilds the series
  entry rather than assigning `visible`), so the invariant holds by construction
  and not only because the clone held.

## 14. The registry interface is the extension surface, and it grew in v0.3

`ChartTypeNeeds` / `ChartTypeDefinition` are internal, but they are the contract
between the pipeline and every chart type, and the brief's "declare, don't
implement" rule only works if the declarations are expressive enough. v0.3 added
four declarations, each because a type module had documented the gap:

| addition | replaces |
|---|---|
| `needs.axisChrome: boolean \| { x?, y? }` — per-axis chrome (line, tick labels, title, gridlines AND the reserved margin) | a streamgraph clearing `layout.yTicks` after the fact |
| `needs.axes: 'value-y' \| 'value-x' \| 'rows'` — which screen axis carries the value axis and which the band axis; `'rows'` = band on y + the continuous DATA axis on x | a gantt hand-drawing its own time axis, and three types post-processing `formattedX`/`formattedY` |
| `needs.bandIndex: 'position'` — a datum's band IS its point index | a violin overriding its tooltip header |
| `needs.rangeFromData` — band-ness decided by the data | rangearea re-implementing the combo kind dispatch |

plus three stages (entries 15–17) and the pure helpers `resolveAxisChrome`,
`axisArrangement`, `valueAxisOf` and `categoryAxisOf` — the ONE place the
pipeline answers "which axis is which", previously guessed from
`model.horizontal`, which is meaningless for a type that is neither vertical nor
`horizontal: true`.

`'rows'` exists because `computeCartesianLayout` pairs a band axis with a
Linear/Log VALUE scale in the other two arrangements, so "band cross-axis + time
axis" was not expressible at all.

## 15. `extendValueDomain`: value domains are a pipeline stage, not an axis rewrite

Six types need a value axis wider than the generic data extent, because their
marks live in RAW data the normalizer cannot see: `bullet` (qualitative ranges +
target), `boxplot` (whiskers + outliers from `number[]` samples), `waterfall`
(running totals), `candlestick`/`ohlc` (highs and lows), `violin` (raw samples).
Each of them used to write `resolved.xAxis.min/max` or `resolved.yAxis.min/max`
from `resolveOptions`.

That is now the `extendValueDomain(model, opts)` stage: the pipeline unions the
result with the data extent and never narrows. `{ exact: true }` additionally
suppresses `nice()` widening (bullet's outermost range must end exactly at the
plot edge), carried on `DataModel.valueDomainExact`.

**Observable change:** `getOptions().xAxis` / `.yAxis` no longer report a
computed domain for those six types. An options snapshot round-trips
configuration, not a derived scale. Six test assertions were updated to read the
(now exported, pure) domain functions and the rendered ticks instead.

## 16. `resolveLegend`: a legend decision that needs measured layout

`slope`'s contract rule is "direct series labels at both ends (no legend when
labels fit)", which needs text metrics AND the plot rect — neither available in
`resolveOptions`. It used to be taken inside `layout()`, which mutated
`ctx.opts.legend.show` and tracked "is the legend still on auto?" in a
module-level `WeakMap<ResolvedOptions, boolean>`.

`resolveLegend(ctx): boolean | null` runs between `layout()` and the DOM sync and
returns the decision; `legend.auto` (entry 12) is how a definition avoids
overriding an explicit choice. `layout()` is now pure with respect to `opts`.

## 17. `a11yDescription`: one description node, one `aria-describedby` token

`a11y.description` belongs to the caller, so a feature that wants to add prose
(annotations: "included in the a11y description"; choropleth: unmatched rows)
cannot overwrite it. Both the chart type
(`ChartTypeDefinition.a11yDescription`) and decorators
(`Decorator.a11yDescription`) can contribute, and `chart.ts` concatenates caller
text → type → decorators into the ONE visually-hidden node it already manages.

Annotations no longer maintain a private `.chartcraft-annotations-desc` node or
append a second `aria-describedby` token.

## 18. `Decorator` has eight optional hooks beyond `draw`

The brief asked for "an internal `Decorator` list the pipeline walks, each
receiving plot rect, scales, model, theme, renderer". The v0.3 feature specs
cannot be satisfied by drawing alone, so the interface carries:

- `extendYDomain` — "error bars … included in the y-domain" (the domain is
  decided before any renderer exists);
- `legendItems` — "trendlines … labeled in the legend";
- `a11yTable(ctx, spec)` — "the a11y table gains ± columns", applied between the
  type's stage and BOTH the table DOM and `exportData()`;
- `tooltipPoints(ctx, hit, points)` — "the tooltip shows the interval", applied
  before `opts.tooltip.format`;
- `a11yDescription(ctx)` — see entry 17;
- `onClick` — `annotationclick` needs a hit target, and must be able to suppress
  the underlying `pointclick`;
- `attach(host)` — zoom/pan/brush needs pointer, wheel, keyboard and
  double-click listeners; this is the single sanctioned place for them, so
  `chart.ts` contains no zoom interaction code at all;
- `appliesTo` — the cheap opt-out consulted before all of the above.

Nothing is registered by default, so with an empty list every pipeline stage
behaves exactly as in v0.2.

The `a11yTable`, `tooltipPoints` and `a11yDescription` hooks replaced three
workarounds that reached around the pipeline: appending `<th>`/`<td>` to the
already-built table (which made `exportData()` disagree with the DOM — a real
contract violation, since exportData must emit *exactly* the table's contents),
wrapping `ResolvedOptions.tooltip.format` once per options object (which mutated
documented-read-only options and left `getOptions().tooltip.format` defined even
when the caller passed none), and the private description node above.

## 19. `DecoratorContext.host` is nullable, and that is the export-isolation guarantee

`draw` used to receive only a `Renderer`, so a feature needing the DOM side of
the chart recovered its host from a `WeakMap<Renderer, DecoratorHost>` populated
in `attach`. `DecoratorContext.host` now carries it directly, and is **null**
whenever the pass paints through a renderer that is not the mounted canvas.

That nullability is load-bearing, not incidental: `exportImage()` renders
offscreen, so an export can never reach live DOM (the zoom decorator returns
early, and no brush rectangle appears in an exported PNG). A draw-only decorator
can now reach the host too, which the WeakMap could not offer.

`DecoratorHost` is created once per chart and its identity is stable for the
chart's lifetime, so a decorator may key per-chart state on it (the zoom
decorator does).

## 20. The decorator API is exported but **experimental**

`registerDecorator`, `unregisterDecorator`, `decorators`, `clearDecorators` and
the `Decorator` / `DecoratorContext` / `DecoratorHost` / `DecorationLayer` /
`Viewport` types are part of `@chartcraft/core`'s public surface, and the
contract now documents them ("Extensibility: the decorator API").

They are marked **experimental**: four hooks were added during v0.3 in response
to real feature needs and more may follow, so the shape may change in a minor
release. Documented as such rather than left undocumented, because the five
built-in features are built on it and nothing a decorator does is reachable any
other way.

## 21. Overlay order places axis chrome BELOW the 'over' layer

`ChartImpl#paint` order is: surface → title/subtitle → grid →
`decorations('under')` → under-decorators → `render` (marks) → axis chrome →
`decorations('over')` → over-decorators. Grid and axes keep their v0.2 positions
relative to the marks; the `'over'` layer is drawn last so annotations, data
labels and the brush rectangle are never occluded by tick labels. Within a layer
the type's own `decorations` always runs before the global decorator list.

One consequence of moving gantt onto the pipeline's chrome (entry 71): its time
tick labels are now painted AFTER its task bars, where they used to be painted
before. Nothing overlaps — the labels live below the plot — but a call-log
ordering assertion changed.

---

# Export, zoom & versioning

## 22. The zoom viewport applies to CONTINUOUS axes only; band axes ignore it

`ZoomOptions.minSpan` is specified as "smallest zoomable x-span in **data
units**" and `zoomTo({ x: [number, number] })` takes numeric ranges, so zoom is
defined on continuous (linear/time/log) axes. Band (category) axes ignore the
viewport entirely: windowing a `BandScale` would desynchronize band indices from
`model.categories` (which `bandIndexFor`, tick labels, hit-testing and the a11y
table all address by index) and no contract text requires category zoom.
`Layout.viewport` is still populated for band charts so decorators can see the
requested window.

## 23. The viewport is instance STATE, not an option (and not in `getOptions()`)

`ChartOptions.zoom` configures the zoom *feature*; the current zoom *window* is
transient interaction state. It therefore lives on the chart instance
(`chart.zoomTo`, `DecoratorHost.setViewport`), is mirrored read-only onto
`model.viewport` / `layout.viewport`, and does not appear in the `getOptions()`
snapshot — an options snapshot round-trips configuration, not scroll position.
Supplying new `data` or a new `type` resets it, because the window is expressed
in the previous data's units.

## 24. `exportData` JSON shape and CSV dialect

The contract says `exportData()` "emits exactly the a11y table's contents" but
does not fix a serialization. Chosen, and locked by tests:

- **CSV**: header row from `A11yTableSpec.columns`, then one row per spec row
  with the row-header cell first. RFC 4180 quoting (a field containing `,`, `"`,
  CR or LF is quoted; `"` doubles). Rows are `\n`-separated with **no** trailing
  newline. Ragged rows are padded to the column count.
- **JSON**: `{ "columns": string[], "rows": Array<Record<string,string>> }`,
  each row keyed by column name (the row header under the first column's name),
  pretty-printed with a 2-space indent and no trailing newline.

Both come from the definition's `a11yTable` stage plus every applying
decorator's `a11yTable` transform — ONE spec, so the DOM table and the export
can never disagree. There is no second data-shape description anywhere in the
codebase.

## 25. `exportImage` details, and `version` stays `'0.2.0'`

- `format: 'svg'` rejects with a message containing **"SVG renderer not
  available"** (this build ships the canvas renderer only), per the contract's
  "else rejects with a clear error".
- `scale` defaults to 2 and is clamped to `[0.1, 8]`; an unclamped scale is a
  trivial way to OOM a tab.
- The export paints the **target** frame (final geometry), never a
  mid-animation interpolation, and reuses `ChartImpl#paint`, so decorations and
  decorators appear in the exported image exactly as on screen — except anything
  that needs the live DOM, which sees `ctx.host === null` (entry 19).
- Encoding prefers `canvas.toBlob` and falls back to `toDataURL`; when neither
  works the promise rejects with an explicit environment message. (jsdom
  implements neither, so `test/setup.ts` stubs both alongside its existing
  canvas/ResizeObserver/matchMedia stubs.)
- `chart.ts` still exports `version = '0.2.0'`. Bumping the published version is
  a release step, not a plumbing step (and `test/chart.create.test.ts` asserts
  the current value).

---

# Cartesian & combo

## 26. Combo: horizontal charts ignore per-series `type` overrides

The contract defines combo (per-series `type` on cartesian roots) and,
separately, `horizontal` as "bar only", but does not say how they compose. Mixed
marks are implemented for vertical orientation only: when `horizontal: true` is
in effect (bar root), every series renders as the root type's kind and
per-series `type` overrides are ignored. Rationale: line/area/scatter marks have
no defined horizontal geometry in the contract, and silently rotating them would
invent one.

## 27. Sparkline: explicit `legend: true` is honored; `title`/`subtitle` are never rendered

The contract describes sparkline as a chrome-free preset ("no axes, grid,
legend, title padding; tooltip optional (default off)"). Implemented as a
*preset of defaults*, consistent with the tooltip wording: legend and tooltip
default OFF but an explicit `legend: true` / `tooltip: true` is honored.
`title`/`subtitle` are unconditionally not rendered (there is no chrome area to
render them into); use `a11y.title` for the accessible name.

---

# Statistical & financial types

## 28. Histogram bin-edge ticks — and the one axis rewrite that remains

The pipeline owns tick generation (`layout.ts`, nice 1/2/5-step ticks), so exact
tick positions cannot be injected per type. The histogram therefore makes the
edges themselves nice: `'auto'` (Freedman–Diaconis, clamped 5..60) snaps the FD
width UP to a 1/2/5×10^k width and aligns the first edge to a multiple of it,
then sets the x-axis extents to the outer edges and (for ≤ 12 bins)
`ticks.count` to the bin count — the pipeline's nice ticks then land EXACTLY on
every bin edge. An explicit numeric `bins` splits the raw data extent equally, so
its edges are generally not nice numbers: tick positions/labels remain the
pipeline's nice values within the correct linear scale rather than exact edge
values. Above 12 bins the tick count falls back to the width-based default (a
subset of edges when the bin width is nice) to keep labels legible.

**Histogram is the one type that still writes `resolved.xAxis.min/max` and
`resolved.yAxis.min/max` from `resolveOptions`**, and it is a different need from
entry 15: it sets a **data-axis** domain (bin edges on x) together with
`ticks.count`, so that the tick VALUES align with the edges.
`extendValueDomain` covers the value axis only, and there is no
`extendDataDomain` or "put ticks exactly here" seam. If one is ever added, this
is the call site to move.

## 29. Histogram events: `dataIndex` is the bin index; `x`/`y` come from the backing raw sample

Bins are the interaction unit (contract: "dataIndex meaningful for the type"):
hover/keyboard walk bins and `dataIndex` is the bin index. The shared pipeline
builds `pointenter/leave/click` payloads from `series.points[dataIndex]` — for a
histogram that backing point is the `dataIndex`-th RAW SAMPLE, so the event's
`x`/`y` carry that sample, not the bin range/count (and events are not emitted
for bin indices beyond the sample count). Tooltip, announcements and the a11y
table always carry the bin range + count.

## 30. Boxplot raw arrays are read from the RAW data; any numeric array entry = raw samples

The generic normalizer (not modifiable) folds numeric arrays into tuple shapes
(`[x, y]` / `[x, y, r]` / `[x, o, h, l, c]`), which would mangle a raw
`number[]` sample. The boxplot definition therefore reads the RAW series data
for its per-category input: any numeric-array entry (any length, including 3 and
5) is treated as raw samples and summarized (quartiles via linear interpolation
/ R-7; whiskers to the most extreme samples within 1.5×IQR; values beyond are
outlier dots). 5-number objects are used verbatim. The mangled normalized points
remain only as the pipeline's per-category backing data (count, event identity).

## 31. Candlestick/ohlc: animation is force-disabled; doji (c === o) colored `theme.up`

The contract mandates "never animated sweeps — appear instantly", so the
financial definitions disable the animation entirely in their `resolveOptions`
hook — an explicit `animation: true` is overridden (there is no legal animated
presentation for these marks) and all candle geometry is non-interpolated.
Bodies/ticks compare close vs open; the contract does not specify the equal
case, so `c === o` (doji) renders in `theme.up`.

## 32. Waterfall renders the first visible series only

The contract declares waterfall data as a single series. When multiple series
are supplied anyway, the definition lays out and renders the FIRST visible
series and ignores the rest (they still occupy legend/palette identity slots via
the shared pipeline). A total (`isTotal: true`) bar rises from the zero baseline
and RESETS the running total to its absolute value; zero deltas render as
neutral (`theme.neutral`) hairline-height bars.

## 33. Heatmap legend auto policy: shown for a single row too

The generic legend auto policy is "shown when series >= 2". The heatmap's legend
is a gradient color-scale bar (the only key to what cell colors mean), so its
`resolveOptions` hook resolves legend "auto" to SHOWN even with one series/row.
An explicit `legend: false` (or `legend.show: false`) is honored.

## 34. Gauge bands: band-colored track at 0.35 alpha under a full-alpha value arc

The contract says "value needle/arc fill in series-1 blue unless `gauge.bands`
given" and the spec adds "then band colors, value arc colored by the band it
falls in", without describing how the unreached portion of the arc looks.
Implemented as: with bands configured the gridline track is replaced by
band-colored segments at 0.35 alpha (any range beyond the last band falls back
to the gridline color), and the value arc overlays them at full alpha in the
color of the band the value falls in (values beyond the last band use the last
band's color). Without bands, the track is the gridline color and the value arc
is `theme.series[0]`, per the contract.

---

# Matrix & hierarchy types

## 35. Treemap/sunburst point events: `dataIndex` is the depth-first index; `x`/`y` only meaningful for top-level nodes

Per the contract, keyboard navigation and `dataIndex` follow the type's natural
reading order: the flattened depth-first LEAF order for treemap and the
depth-first order over ALL nodes for sunburst. The shared pipeline builds
`pointenter/leave/click` payloads from the backing normalized point
(`series.points[dataIndex]`), which only exists for top-level data. So for
nested trees: events still fire with the correct `dataIndex` while it addresses
an existing top-level datum (and `x`/`y` then reflect that top-level datum, not
the nested node), and are not emitted for indices beyond the top-level count.
Tooltips, hit-testing, focus announcements and the a11y table are unaffected —
they always use the hierarchy node's path/value/share.

## 36. Funnel dark-mode ramp direction: starts at step `#184f95` and lightens

The contract fixes the ordinal ramp's *start* step per scheme (light: no lighter
than `#86b6ef`, dark: no darker than `#184f95`, both to clear 2:1 on their
surface) but not the step direction in dark mode. Implemented as: light mode
starts at index 3 (`#86b6ef`) and darkens toward index 12; dark mode starts at
index 10 (`#184f95`) and lightens toward index 0 — N stages take evenly spaced
(rounded) indices within that legal span, so every chosen step clears 2:1 on its
surface and stage 1 always sits at the mandated start step.

## 37. Hierarchy & text-layout types live in `hierarchy/`

`icicle`, `circlepack` and `wordcloud` live in `src/charts/hierarchy/` (one
module per type plus `shared.ts` for the cross-type helpers and `pack.ts` for
the circle-packing math) and are registered by the idempotent
`registerHierarchyChartTypes()`.

## 38. `hierarchy/` copies three small treemap helpers instead of importing them

`buildHierarchy`, `treeRoots`, `hierarchyTableRows`, `formatShare`,
`countTreeNodes`, `mixHex` and `contrastInk` are imported read-only from
`matrix/hierarchy.ts` / `matrix/color-scale.ts`, so icicle and circlepack
inherit the treemap's value semantics and coloring rules verbatim (top-level
slots in order, children as lightness steps toward the surface — no new hues).

`fitLabel`, `insetRect` and the legend-auto policy, however, are re-declared
locally in `hierarchy/shared.ts` rather than imported from `matrix/treemap.ts`.
They are ~10 lines each, and importing them would make this folder depend on a
sibling chart-type MODULE — the exact shape that already produced a documented
ESM cycle in v0.2 (`sunburst.ts` keeps a local copy of pie's `START_ANGLE`
because `matrix -> pie -> model -> charts/index -> pie` deadlocks when the
matrix module loads first). Depending only on the pure hierarchy/color helpers
keeps `hierarchy/` cycle-free by construction. No cycle was hit in practice;
this is prevention, and it is the only duplication.

## 39. icicle and circlepack navigate ALL nodes, not just leaves

Treemap walks leaves because only leaves are drawn. In an icicle every node is a
drawn row cell, and in a circle pack every parent is a drawn (outlined) circle,
so `keyboardNav` uses `countTreeNodes` and `pi` = `flatIndex` (depth-first,
parent before children) — the sunburst rule. The a11y table is identical to
treemap's: indented label + value + share, depth-first.

## 40. circlepack: parent outlines wear the parent's own color; labels are not ellipsized

The contract says "leaves filled, parents outlined hairline; same palette
rules". The 1px parent outline is drawn in the parent node's own resolved color
(not `theme.gridline`) so "same palette rules" holds for the outline as well and
nesting stays readable. A parent circle is grown 5%
(`PARENT_PADDING_RATIO`) beyond the enclosure of its children so its outline
never coincides with a child's edge; because siblings are packed with the grown
radii, the DRAWN circles are still guaranteed non-overlapping.

Leaf labels are drawn only when the FULL term fits the chord at the label's
height (`circleLabelWidth`) — a circle has no good ellipsis story, so an
over-long label is dropped rather than truncated. (Icicle cells do ellipsize,
like treemap.)

## 41. Determinism strategy in `hierarchy/`: one seeded generator, zero `Math.random()`

`shared.ts#seededRandom` is a mulberry32 generator and the only source of
pseudo-randomness in the folder:

- **circlepack** — sibling placement (front chain) is fully analytic; the
  smallest-enclosing-circle step is Welzl's algorithm, whose expected-linear
  behavior needs a randomized insertion order, so it consumes a seeded
  Fisher-Yates shuffle (`PACK_SEED`). Welzl also never throws here: a degenerate
  basis falls back to the axis-aligned bounding circle, and the refinement loop
  has a step budget, because a layout must not crash or hang a render.
- **wordcloud** — the Archimedean spiral is analytic; only each word's spiral
  START PHASE is drawn from the generator (`WORDCLOUD_SEED`), in rank order.

Both are therefore bit-reproducible, and the tests assert equality of two
independent runs (and of two independently mounted charts).

## 42. wordcloud: `pi` is a RANK, and the legend is hidden by default

The contract's keyboard order for wordcloud is "terms by rank", so `pi` = rank
(weight descending, ties in data order) everywhere in the definition:
`geom.pos`, hit-testing, tooltips, announcements and the a11y table
(`Term | Weight | Rank`) are all rank-ordered and mutually consistent. The
consequence is that `PointEvent.dataIndex` is a rank rather than a data index,
and the pipeline-built `PointEvent.x/y` (`chart.ts#pointEventFor` reads
`points[pi]`) describe the datum at that index — the same known limitation
treemap and sunburst already have for nested nodes (entry 35). Everything the
definition itself supplies (tooltip, announcement, table) always describes the
correct term.

The legend is hidden unless the caller asks for it: the terms ARE the marks and
are directly labeled, so a legend would be chart junk (funnel's rule). An
explicit `legend: true` still lists the terms in rank order, non-toggleable.

## 43. wordcloud defaults and text metrics

The contract declares `wordcloud?: { minFontSize?; maxFontSize?; rotate? }`
without defaults; this build uses `minFontSize: 12`, `maxFontSize: 48`,
`rotate: false`, and normalizes swapped bounds. Font size is interpolated
LINEARLY in weight; a degenerate weight range (one term, or all weights equal)
puts every word at `maxFontSize` — none of them should read as smaller than the
others. With `rotate: true`, odd ranks are rotated 90° (deterministic
alternation, not a random draw).

Collision detection needs text metrics, which the layout takes as a `measure`
callback wired to the renderer's `measureText` path. Two documented estimates
cover what canvas metrics cannot give us:

- **height** — the `Renderer` interface exposes no height metric at all, so a
  line box is always `fontSize * 1.2` (`LINE_HEIGHT_RATIO`);
- **width** — when `measure` returns a non-finite or zero width (a headless
  canvas stub), the layout falls back to `term.length * fontSize * 0.6`
  (`FALLBACK_WIDTH_RATIO`).

Words that cannot be placed inside the plot after 1600 spiral probes are dropped
from the picture but kept in the a11y table (and in keyboard navigation), so no
datum is silently lost.

---

# Radial & polar types

## 44. `radialbar`/`rose` share `polar/`; `violin`/`parallel` share `distribution/`

`radialbar` and `rose` live in `src/charts/polar/` (registered by the idempotent
`registerPolarChartTypes()`), `violin` and `parallel` in
`src/charts/distribution/` (`registerDistributionChartTypes()`).

Shared math is imported read-only, never copied: `radial/polar.ts`
(`polarToCartesian`, `clamp01`) and `statistical/stats.ts` (`quantileR7`,
`summarizeBox`) are pure LEAF modules (they import only `scales/` + `util`), so
importing them cannot close a cycle back through
`model -> charts/index -> type module`. Quartile/Tukey math has exactly one
implementation in the codebase and the violin's inner box uses it verbatim.

## 45. radialbar tracks are (category × visible series), category-major

The contract's data shape is "`categories` + one value each (**or series**)".
Implemented as one track per (category, visible series) pair in category-major
order, so:

- one visible series → exactly one track per category (the common shape),
  colored by CATEGORY in categorical slot order (the arcs *are* the categories)
  and labeled with the category name;
- several visible series → a track per series inside each category group,
  colored by the SERIES' palette slot (hue keeps meaning series identity) and
  labeled `"Category · Series"`.

The legend follows the same split: one series → non-toggleable category items
with pie's slice-count auto policy (shown from 2 arcs); several series →
toggleable series items under the generic `series >= 2` policy.

## 46. Arc thickness and inter-track gaps are COMPUTED, never configured

The contract exposes no thickness option, so `radialBarBands()` fits `n` tracks
into `[innerRadius * rOuter, rOuter]`: the desired 4px gap is reduced (to 0 if
necessary) to keep every arc at least 2px thick, and the thickness absorbs the
remainder so `n * thickness + (n - 1) * gap === band` EXACTLY. Consequences: the
tracks always fill the band and can never overlap at any count (tested for 1..10
tracks and for bands too tight even for the 2px minimum), and very high track
counts produce thinner arcs rather than overflow.

Direct labels are selective, per the contract's data-label rule: when the radial
spacing is tighter than one line of text, only every `labelStride`-th arc is
labeled (`radialBarLabelStride`).

## 47. radialbar and rose reject negative values

Radar's precedent: an angular sweep (radialbar) and a sector area (rose) cannot
encode a negative magnitude, so `createChart` throws an error naming the series
and the index instead of silently clamping.

## 48. `rose.startAngle` is DEGREES CLOCKWISE FROM 12 O'CLOCK

The contract declares `rose?: { startAngle?: number }` without a unit. Chosen:
degrees, measured clockwise from 12 o'clock, default 0 (= 12 o'clock, the
contract's default orientation) — the Highcharts convention, and what callers
expect from a public `startAngle`. It is converted internally to this codebase's
canvas radians (`-PI/2 + rad`); a non-finite value throws.

## 49. rose renders the first visible series; zero sectors keep their slot

Single-series form (pie / funnel / waterfall precedent): extra series still take
palette identity but are not drawn. Every category keeps its equal-angle slot
even when its value is 0 or null (radius 0) — a rose sector is a category, not a
share of a total. The a11y table's third column is "% of total" (with area
proportional to value, the value share IS the area share).

## 50. radialbar/rose value arcs are emitted as `slices`

So the pipeline's "entering slices sweep from the start angle" animation applies
verbatim (radialbar's 12 o'clock start IS the pipeline's `START_ANGLE`). The
authoritative geometry stays in `TypeGeom.extra`; `render` takes only the angles
from the same-index interpolated slice. `PieSlice` is keyed by `pi`, so for a
MULTI-series radialbar the animator's previous-slice matching is by data index
only: during an update a track may sweep from a sibling's previous angles. That
is transient and visual; laid-out and final geometry are always exact.

---

# Interval & comparison types

## 51. `rangearea`: band-ness is decided by the DATA on a rangearea root

`needs.rangeFromData` (entry 14) makes a series on a `rangearea` root render as a
BAND exactly when its data carries a full `low`/`high` pair; an explicit
per-series `type` always wins. Everything else renders as its ordinary cartesian
mark in the shared combo z-order, on the one shared y-axis.

Consequences, all covered by tests:

- `baseKind: 'line'` (not `'area'`) is deliberate: `'area'` would zero-anchor
  the value domain and squash a 90..110 confidence band against the axis.
- A band point needs BOTH bounds. A half-open point (`{x, low}` only) is a gap,
  not a half-band, and a band run of a single point draws nothing (a closed band
  needs two x positions) — both are gaps in the a11y table too.
- Band geometry lives in `pos` (`y` = high edge, `y0` = low edge), so the
  pipeline's generic animation opens the band from its low edge with no extra
  code, and no `extra` geometry has to be re-interpolated.
- The a11y table keys off the RESOLVED mark kind, not the data, so an explicit
  `type: 'line'` on band-shaped data gets one value column and the table agrees
  with the picture.

## 52. `rangearea` a11y table column names

The contract fixes the shape ("Tooltip lists low & high") but not the column
titles. A chart whose ONLY series is a band gets plain `Low` / `High` columns;
any other combination prefixes them with the series name (`CI low`, `CI high`)
and non-band series keep their single name column. `exportData()` mirrors this
verbatim, since it serializes the same spec.

## 53. `bullet` forces `horizontal: true` and an EXACT `0..max` value axis

The contract's bullet is horizontal-only, so the definition sets
`resolved.horizontal = true` in its option hook rather than asking callers to
remember a flag — row labels then come free from the pipeline's band (y) axis
chrome, and `getOptions().horizontal` reports `true`.

Unlike boxplot/waterfall (which `nice()` their domain), the bullet value axis is
EXACTLY `[0, max(values, targets, range boundaries)]`, requested through
`extendValueDomain` with `exact: true` (entry 15), so the outermost qualitative
range fills the row to the plot edge — a bullet graph whose widest grey band
stops short of the row end reads as a data range, not as the scale. Tick values
remain the pipeline's nice 1/2/5 steps inside that domain, so they may not land
on the outer edge. Explicit `xAxis.min`/`max` still win.

## 54. `bullet` grey range steps: `theme.axisLine` to `theme.gridline`, and what "2:1 relief" means here

Range steps are lightness steps between the two theme chrome greys, indexed by
ascending range order: the smallest (innermost) range is `theme.axisLine`
(darkest), the largest (outermost) is `theme.gridline` (lightest), with even RGB
mixes in between; a single range uses `theme.gridline` alone. Never hues.

A literal 2:1 **contrast ratio between adjacent steps** is unattainable inside
that interval (`#c3c2b7` vs `#e1e0d9` is ~1.33:1 in light, similar in dark), so
what is guaranteed and tested is: (a) the ramp endpoints are exactly
`axisLine`/`gridline`, (b) every step is strictly separated in luminance from
its neighbours (even spacing, monotone), and (c) the marks that must READ
against the ranges — the measure bar and the target tick, both
`theme.textPrimary` — clear 2:1 against **every** step by a wide margin. Going
outside `[gridline, axisLine]` to buy adjacent-step contrast would make the
qualitative bands compete with the data, which is the opposite of the intent.

## 55. `bullet` renders the first visible series; a per-row `low`/`high` overrides `bullet.ranges`

The contract declares bullet data as one series. With several supplied, the first
visible one is laid out and rendered and the rest are ignored (the waterfall
precedent, entry 32). `types.ts` documents `low`/`high` as also meaning "bullet
range", so a datum carrying both bounds replaces the chart-wide `bullet.ranges`
for THAT row (a per-row qualitative range); `bullet.target` is likewise the
default for rows whose datum has no `target`. Events keep the generic pipeline
payload (`dataIndex` = row index).

## 56. `dumbbell`, `lollipop` and `slope` specifics

**`dumbbell`:**

- **Names.** The legend names the two ENDS, not the series. They come from
  `SeriesOptions.lowKey` / `highKey` when the caller set them (those are
  caller-chosen, human-meaningful field names — `lowKey: '2010'`), else
  `Low` / `High`. The same two names title the table's bound columns.
- **Colors.** Both endpoints use palette slots 1 and 2 for EVERY series, so the
  legend stays true when more than one series is drawn; a per-datum `color`
  overrides both dots of that datum. Series identity is therefore not
  color-encoded on a dumbbell — use small multiples if you need it.
- **Legend auto.** The contract's generic auto policy hides the legend for a
  single series, but the endpoint legend is the only key to which dot is which,
  so `auto` resolves to SHOWN even with one series (the heatmap color-scale
  precedent, entry 33). Explicit `legend: false` / `legend.show: false` is
  honored, and endpoint items are **non-toggleable** (there is no series behind
  them).
- Several series are supported: each visible series takes its own slot inside
  the category band, 2px apart (the boxplot slot precedent).

**`lollipop`:** `stacked: true` throws from the option hook (message contains
"does not support stacking"), which surfaces out of `createChart` and out of
`update()` — the contract calls stacking unsupported, and silently ignoring it
would produce a plausible-but-wrong chart. `needs.stacking` is additionally
`false`, so no stack math can run even if the throw were bypassed.
`needs.combo` is `false`: "like bar" is about layout, and mixing bar/line marks
into a lollipop root would give one chart two mark languages for the same
encoding. Everything else — band slots, `horizontal`, full-column hit target,
legend, table, keyboard order — is the shared cartesian engine verbatim. Dot
radius is `clamp(slotW / 2, 5, 9)`: never under the contract's 10px diameter,
never a blob on a wide band.

**`slope`:** the fit rule (`planSlopeLabels`, pure and tested) is that every
visible series' name must fit in the gutter outside the first/last stage column,
and no two labels at the same end may sit closer than one line height
(`fontSize + 2`). Otherwise NO labels are drawn — a half-labeled end reads worse
than a legend. The decision reaches the legend through the `resolveLegend` stage
(entry 16); an explicit `legend: true` therefore shows both the legend and the
labels. Because the decision depends on the plot rect, a responsive container
that gains/loses the legend right at the threshold could in principle oscillate;
the rule is ratio-like in the vertical dimension, so this needs the layout to
sit exactly on the boundary. A per-series `curve` is deliberately IGNORED: the
contract requires rank changes to read true, and a smoothed slope chart invents
crossings.

---

# Composition types

## 57. The four composition types live in `composition/`

`streamgraph`, `marimekko`, `pyramid` and `calendar` live in
`packages/core/src/charts/composition/` (one module per type + `shared.ts`) and
register through `registerCompositionChartTypes()`.

## 58. `streamgraph` computes its OWN value mapping, stacking and ordering

- The pipeline's `yDomain` is a zero-anchored stack extent, but a wiggle
  baseline is negative and the stream occupies `[min g0, max (g0 + total)]`, so
  the definition maps values to pixels itself (`shared.ts#linearMap`) over that
  occupied extent. Consequences: the stream always exactly fills the plot, and
  `stacked` / `needs.stacking` are irrelevant (declared `false`, so the model
  never computes `y0`/`y1`).
- The value axis carries no information, so the type declares
  `needs.axisChrome: { x: true, y: false }` (entry 14): no value tick labels, no
  value axis line, no y gridlines — and no left margin reserved for labels that
  are not drawn, so the plot rect starts at `padding.left` and is now stable
  across data changes. (Before per-axis chrome existed this was a
  `ctx.layout.yTicks = []` assignment, which kept the margin as a side effect.)
- `needs.downsample` is `false`. LTTB picks different indices per series, which
  would silently break the index-aligned stack; the pipeline already excludes
  stacked areas for the same reason.
- Columns are point INDICES (index-aligned, exactly like `data/stack.ts`), and
  `null` contributes 0 thickness — a stacked baseline is otherwise undefined.
  Nulls are still reported as an em dash in the a11y table.
- Ordering is `insideOutOrder` (sort by peak position, then greedily fill the
  smaller side), not input order, and ties break by input index so the result
  never depends on `Array.prototype.sort` stability. **Color follows series
  identity** (the model's palette slot, assigned by first-seen id) and never
  stacking rank; the legend also stays in input order. A test asserts both for a
  dataset whose computed order is `[1, 0]`.
- Only straight (linear) edges are drawn: `SeriesOptions.curve` is ignored so a
  ribbon's thickness is exactly its value everywhere. Documented, not silent.
- The a11y table adds a `Total` column — the stack total is the only vertically
  readable quantity once the baseline is meaningless — and the tooltip renders
  `value of total` for the same reason.

## 59. `marimekko` reads column widths from `r` on the FIRST series

The contract offers "`data[i].r` or a `widths` categories parallel"; ONE
mechanism was picked: **`r` on the first series' points, index-aligned to the
columns**, because `r` is already a declared `DataPoint` field carried
losslessly through normalization, so no new option and no parallel array are
needed. It is used only when EVERY column has a positive finite `r`; otherwise
every column falls back to its own total (the contract's "column width is
proportional to the column total"). `marimekkoWidthValues()` returns the source
(`'r' | 'total'`) and is unit-tested both ways. The width measure is read from
`model.series[0]` even when that series is legend-hidden: a width is an
independent measure, not part of the stack. (Under the `total` fallback, hiding a
series legitimately changes the widths.)

Other marimekko decisions:

- The 2px gaps in both directions are SUBTRACTED from the available space rather
  than insetting the marks, so column widths sum to exactly
  `rect.w - gap*(n-1)` and segment heights to exactly `rect.h - gap*(k-1)`
  (asserted exactly in tests).
- `needs.cartesianAxes: false` (variable widths are not a band scale) but
  `needs.xScale: 'band'`, so the model still derives categories and formats x
  values as categories. The percentage scale (0/25/50/75/100%) is drawn as
  LABELS ONLY — gridlines across contiguous segments would be chart junk.
- Both share dimensions travel together: the tooltip reads
  `Column — 75% of total width` / `value (25% of column)`, and the a11y table is
  `Column | Width share | <series...>` with `value (share)` cells, which is also
  exactly what `exportData()` emits. Those two strings are the type's OWN
  content — the contract requires both dimensions in the tooltip — not
  compensation for pipeline formatting, so they stay in `tooltipPoints`.

## 60. `pyramid` throws on any series count other than 2, and declares a mirrored axis arrangement

- `resolveOptions` throws when `data.series.length !== 2`, so `createChart` (and
  `update`) fails fast with a message naming the type and suggesting
  `bar` + `horizontal: true`. This is the contract's "exactly 2 series".
- `needs.cartesianAxes: false`: no pipeline cartesian layout can express a
  CENTERED category axis with mirrored arms, so rows, gutter, arms, gridlines
  and magnitude ticks are computed in `computePyramidLayout` and drawn by the
  definition (gridlines in `decorations('under')`, labels in
  `decorations('over')`). `needs.xScale: 'band'` still declares categorical x.
- Axis options split by ROLE, and the type says so with `needs.axes: 'value-x'`
  (entry 14): `yAxis.ticks.format` + `yAxis.label` describe the vertical
  CATEGORY axis, `xAxis.ticks.format` the horizontal MAGNITUDE axis. The
  pipeline reads that declaration through `valueAxisOf` / `categoryAxisOf`, so
  `formattedX` and the value formatter come out right with no tooltip
  post-processing.
- Values are magnitudes: `Math.abs` everywhere, both arms share ONE scale, and
  no tick label can ever be negative (asserted). That `Math.abs` is the one
  thing the type still applies in `tooltipPoints` — its own rule, not an
  axis-binding workaround. Hit testing takes the full row band of the arm under
  the pointer (the bar spec's "full column band", mirrored).

## 61. `calendar` is UTC, and its keyboard order is data order

- **Timezone: UTC, unconditionally.** A cell is a calendar day, and a day is
  only well defined against a fixed zone: with local arithmetic the same datum
  lands in different cells (and different months) depending on the browser's
  offset, and DST would produce 6- and 8-cell weeks. So the day of a datum is
  `floor(timestamp / 86400000)` and every label uses the UTC getters
  (`formatUTCDate`, not `util.ts#formatDate`, which is local-time). Callers
  should build dates with `Date.UTC(...)` or `'YYYY-MM-DD'` strings;
  `calendar.start`/`end` follow the same rule and a plain number is epoch ms.
  This also makes every calendar test timezone-independent. The tooltip header
  is set from that UTC day in `tooltipPoints` — the one remaining tooltip
  override in this folder, and a TIMEZONE decision rather than compensation for
  axis-role guessing.
- **Keyboard walks data order, not sorted order.** `NavContext` maps `pi`
  directly to the model point index and `PointEvent.dataIndex` is that index, so
  a chronological remap is impossible without touching `a11y/keyboard.ts` or
  `chart.ts`. Cells are POSITIONED by their date, so unsorted input still
  renders correctly; the walk (and the a11y table, kept consistent with it) is
  in data order, which for calendar data is chronological. The announcement
  always names the full date, so focus is never ambiguous.
- Days inside the range with no datum are drawn in `theme.gridline` (the
  choropleth rule for missing features) and are NOT hoverable — there is nothing
  to report. Cells carry a 1px surface gap (the heatmap cell precedent); the
  contract fixes no gap for calendars.
- Only the FIRST visible series is rendered (the contract says "one series");
  extra series are ignored rather than being an error, and `keyboardNav`
  confines navigation to that series.
- Month labels are `Jan`...`Dec` with no year, dropped when they would collide
  with the previous one (direct labels are selective). Multi-year ranges
  therefore repeat month names — the axis of a calendar is the grid itself.
- The gradient scale legend reuses the `legendCustomEl` hook and the heatmap's
  DOM shape under `chartcraft-calendar-legend[-bar|-min|-max]`, and
  `legend.show` defaults to `true` (heatmap's policy: the ramp is the value key
  for every cell). `calendar` has no `min`/`max` option in the contract, so the
  color extent is always the data extent.

---

# Distribution types

## 62. `violin` reads RAW `number[]` samples and addresses bands POSITIONALLY

The first half is entry 30's reason verbatim (the generic normalizer folds
numeric arrays into tuple shapes, so raw samples must be read from the RAW
options data). The second half: a folded sample also produces a MEANINGLESS
normalized `x` (`[1,2,3,4]` becomes `x = 1`), so the violin never consults it —
`data[i]` is the sample for `categories[i]`.

That positional rule is DECLARED, not worked around: `needs.bandIndex:
'position'` (entry 14) makes `bandIndexFor` return the point index, so band
placement, hit-testing, the a11y table, announcements AND the pipeline-built
tooltip header all agree without the type overriding `formattedX`.

## 63. violin KDE choices the contract leaves open

- **Trimmed support**: density is evaluated on 64 points across each sample's
  own `[min, max]`, so the shape never claims support the data does not have and
  the value axis (widened from the sample extent through `extendValueDomain`)
  matches the box whiskers.
- **Per-violin width normalization**: each violin is scaled by its OWN peak
  density, so every violin peaks at its full slot half-width (seaborn's
  `scale="width"`). Widths compare SHAPES, not sample sizes; `n` is carried by
  the tooltip, the announcement and the table, as the contract requires.
- **Bandwidth**: `'auto'` = Silverman `0.9 * min(sd, IQR/1.34) * n^(-1/5)` with
  the sample standard deviation (n-1) and R-7 quartiles. When it collapses to 0
  (n < 2, or zero spread) no density is drawn and the inner box carries the
  category. An explicit non-positive `violin.bandwidth` is rejected.
- **Inner box colors** (unspecified in the contract): a `theme.neutral` box and
  whiskers with a `theme.surface` median dot, so the overlay never impersonates
  a series slot on top of the 0.35-alpha fill. Outliers are not re-drawn as dots
  — the KDE tails already show them, and the shared Tukey whiskers keep them out
  of the summary's min/max.

## 64. parallel: raw per-axis extents, slot-centered axes, label strategy, brush seam

- Each axis is scaled to the RAW extent of its dimension over the VISIBLE series
  (a degenerate extent widens by ±0.5). No shared domain and deliberately **no
  `nice()`**: the labels at the top and bottom of an axis are the true max and
  min, which is the entire point of independent scaling.
- Axes are centered in equal slots (`plot.w / n`), so the outermost axes' labels
  cannot clip the plot edge.
- **Axis-name collisions** are resolved deterministically: fit on one row →
  stagger over two rows (which reserves one more label row above the axes) →
  ellipsize to the slot width. Names are never ROTATED: a rotated name over a
  vertical axis runs into the neighboring axis line.
- **Brushing is not implemented here** — filtering lines by dragging an axis is
  the cross-cutting zoom feature's work. The seam is documented and pure:
  `geom.extra` is a `ParallelFrame`, `parallelAxisAtX()` maps a pointer x to a
  dimension and `parallelYToValue()` maps a pixel back to that axis's value, so
  a decorator can implement a brush without this type knowing it exists.
- **Hit-testing** is the nearest vertex within 24px, else the nearest polyline
  SEGMENT within 6px (a line must be hoverable between axes); the focused datum
  is the segment endpoint nearer the pointer.

## 65. Entering-point animation interpolates `y` from `y0`, which is an x for row-shaped geometry

For horizontal-bar-shaped geometry (pyramid) the row center animates from a
pixel that is actually an x coordinate. The existing horizontal `bar` has the
same behavior, so pyramid matches the precedent rather than inventing a second
convention; cells (marimekko, calendar) live in `TypeGeom.extra` and are drawn
at target, as `AUTHORING.md` prescribes.

---

# Flow & schedule types

## 66. `sankey` and `gantt` live in `flow/`

Both live in `src/charts/flow/` (`sankey.ts` + the pure `graph.ts`, `gantt.ts` +
the pure `schedule.ts`, plus `shared.ts`) and are registered by
`registerFlowChartTypes()`.

## 67. Both types normalize their input into ONE synthetic series in `resolveOptions`

Neither type's marks are visible to the generic normalizer: a sankey's series
data is a `{ nodes, links }` OBJECT (so `normalizeSeriesData` cannot even
iterate it), and a gantt's rows are tasks in swimlane order — an order that may
reorder and span several input series. Each definition therefore rewrites
`resolved.data` in its `resolveOptions` hook (the sanctioned per-type option
stage) into ONE synthetic series whose points are its MARKS IN READING ORDER:
for sankey each node followed by its outgoing links, for gantt the tasks in row
order. The caller's own objects are never mutated (a fresh `ChartData` is built)
and `raw` is untouched, so an `update()` re-derives everything from the caller's
original input.

Consequences:

- `getOptions().data` reports the normalized single-series form, not the
  caller's payload (the raw options remain the source of truth internally).
- Because a backing point exists for EVERY mark, `pointenter/leave/click` fire
  for every node, link and task with `dataIndex` = the reading-order index —
  this type pair does not have the treemap/sunburst/wordcloud limitation
  (entries 35 / 42). `x`/`y` on those events carry the node label + throughput,
  the link label + value, or the task start + span.
- `seriesId`/`seriesName` come from the FIRST input series (falling back to
  `'Flow'` / `'Tasks'`), so a multi-series gantt collapses into one series and
  the input series NAMES become swimlane groups (a per-point `group` wins).
- Both legends are non-toggleable, so collapsing series never removes a toggle
  the caller had.

## 68. Sankey values the contract leaves open

- `nodeWidth` default **16**, `nodePadding` default **8**, and `nodePadding` is
  clamped to a **2px minimum** so the contract's "2px node gaps" always holds.
- Node bars: one column per layer, spaced edge-to-edge (first layer flush left,
  last flush right); each layer's stack is centered vertically. The
  value-to-pixel factor is the largest that fits EVERY layer's bars plus gaps in
  the plot.
- Node throughput = `max(inValue, outValue)`; that is what the bar height
  encodes, and link ribbons stack from the top of the bar at both ends (so a
  balanced node's ribbon offsets sum exactly to its height).
- Ribbon control points sit on the mid-x (curvature 0.5) — a cubic with flat
  ends, which is what makes `x(t)` monotonic and hit-testing exact.
- **Crossing reduction**: 6 fixed alternating sweeps (forward = barycenter of
  incoming neighbours, backward = of outgoing), value-weighted, stable-sorted
  with an explicit previous-rank tiebreak, keeping the arrangement with the
  fewest crossings (ties keep the earlier one). Deterministic, no
  `Math.random()`. "Crossings" are counted exactly, between links that share the
  same layer GAP (same source layer and same target layer); links spanning
  different layer counts are not comparable and are not counted.
- Links with `value: 0` are legal (they render as nothing); negative values are
  rejected.
- Node palette slots follow the reading order (layer, then rank); an explicit
  node `color` wins.
- The payload is validated with actionable errors (unusable shape, empty or
  duplicate ids, unknown or out-of-range endpoint, non-finite/negative value,
  self-loop, cycle). `source`/`target` accept a node id or a 0-based node index.

## 69. Sankey keyboard order is ONE flat sequence, and the table mirrors it

The contract says keyboard "walks nodes then their links". A 2D
(series × point) mapping cannot express "that node's links" (the `NavContext`
sees no focus), so the type exposes a single sequence — each node immediately
followed by its own outgoing links — and arrow keys walk it end to end. The a11y
table uses the same order with the same indices: `Node / link | Source | Target
| Value`, where a node row carries its throughput (`—` for source/target) and
its links are indented two spaces beneath it (the treemap indentation
convention). One order therefore backs navigation, `dataIndex`, hit-testing, the
table and `exportData()`.

The legend is hidden unless the caller asks: node bars carry direct, measured
labels (funnel's rule). An explicit `legend: true` lists the nodes in reading
order, non-toggleable.

## 70. Sankey/gantt geometry is not interpolated

Ribbons, node bars and task bars live in `TypeGeom.extra` (the sanctioned home
for geometry with no generic interpolation — heatmap cells and treemap cells
already do this), so they are drawn at their target values every frame.
`TypeGeom.pos` is still populated per mark, which is what the keyboard tooltip
anchor and hover plumbing use. Reduced motion is therefore satisfied trivially.

## 71. Gantt uses the pipeline's TimeScale AND the pipeline's axis chrome

`gantt` declares `needs.axes: 'rows'` with
`needs.axisChrome: { x: true, y: false }` (entry 14), and `resolveOptions` pins
`xAxis.type: 'time'` plus `xAxis.min/max` to `[min start, max end]` (an explicit
caller `min`/`max` still wins). The pipeline therefore builds the real
`TimeScale` — calendar-aligned ticks, `viewport` support — reserves the bottom
strip, and draws the time axis line, its tick labels, its title and the time
gridlines. The definition positions bars against the scale and draws only what
is genuinely its own: the swimlane header rows, the task bars and the today
marker.

(Before the `'rows'` arrangement existed, `computeCartesianLayout` could only
pair a band axis with a Linear/Log VALUE scale, so "band cross-axis + time axis"
was inexpressible and this module hand-drew its axis line, tick labels, title
and gridlines from `decorations()`.)

Two related decisions stand:

- the time domain is used verbatim — no padding — so the first bar starts at the
  plot's left edge and the last ends at its right edge;
- gridlines run along the TIME axis, the opposite of the generic "grid: true on
  y, false on x" default, because a gantt's cross axis is a list of rows with
  nothing to grid. `resolveOptions` sets `xAxis.grid ?? true` so the pipeline's
  grid pass does it.

Swimlane headers stay the type's own: a lane header labels a GROUP of rows, in
`textSecondary`, which is not a tick and no band axis can draw it.

## 72. Gantt duration unit rule and table date format

`Duration` is the largest unit the span REACHES: days (`>= 1 day`, and for a
zero-length milestone), hours (`>= 1 hour`), minutes (`>= 1 minute`), else
seconds — at most two decimals, trailing zeros trimmed (`36h` prints `1.5d`,
`90m` prints `1.5h`, `0` prints `0d`). Weeks, months and years are deliberately
never used: their length is calendar-dependent, so `1mo` would not be a
duration.

`Start`/`End` print as local `YYYY-MM-DD`, gaining ` HH:MM` when the whole
schedule spans less than two days. An unambiguous absolute date beats the
axis-style `formatDate` granularity in a table that has no axis for context; an
`xAxis.ticks.format` callback still owns the AXIS labels.

## 73. Gantt row/bar/label sizing, and `today` outside the schedule

- `gantt.today` is drawn only when it falls inside the schedule's time extent.
  Extending the domain to reach a distant marker would squash every bar, and
  clamping it to the edge would state something false. A marker outside the data
  is simply absent. The marker is a 2px dashed line in `theme.textSecondary`
  spanning the rows area, labelled "Today" at the top of the rows.
- `rowHeight` default = **fit**: the rows area divided by the row count,
  including swimlane header rows. An explicit `rowHeight` is used verbatim (rows
  then simply do not fill the plot).
- Bar height = row height minus 4px padding top and bottom, capped at **28px**
  and never below 2px; bars are centered in their row, with 4px radii on BOTH
  ends.
- Zero-length tasks (milestones) still get a **2px** minimum bar width, and a
  zero-width schedule (one instant) widens its domain by one day.
- Direct labels are drawn INSIDE the bar only when the whole label fits
  (measured); otherwise immediately to the right of the bar (ellipsized to the
  remaining plot width); otherwise dropped — the task stays in the tooltip, the
  announcement and the table. An ellipsized `A…` inside a narrow bar tells the
  reader nothing, so in-bar labels are never truncated.
- Task spans are accepted as `start`/`end` or as the generic `low`/`high` range
  fields (the contract lists "gantt span" for both); `null` data entries are
  gaps, not tasks.
- The legend is hidden by default (rows are labelled directly); an explicit
  `legend: true` lists the SWIMLANES, non-toggleable, in first-seen order with
  their categorical slots. Ungrouped schedules then legitimately have an empty
  legend.

---

# Geographic & graph types

## 74. `choropleth` and `network` are dependency-free and written from scratch

`choropleth` lives in `src/charts/geo/` (`projections.ts`, `geojson.ts`,
`polygon.ts`, `choropleth.ts`) and registers through `registerGeoChartTypes()`;
`network` lives in `src/charts/graph/` (`quadtree.ts`, `force.ts`, `graph.ts`,
`network.ts`) with `registerGraphChartTypes()`. GeoJSON is **never bundled** —
`choropleth.geojson` is required and the library ships no topology.

## 75. Network accepts four encodings of the contract's graph payload

`parseNetworkGraph` accepts:

1. `series[0].data = { nodes, links }` — the contract shape verbatim (and, since
   entry 7, the one that typechecks without a cast);
2. `series[0].data = [{ nodes, links }]` — the same object wrapped;
3. `series[0].data = nodes` with links on `series[0].links` or `data.links`;
4. `data = { series: [...], nodes, links }` — graph on `ChartData`.

Nodes are addressed by `id`; a link endpoint may also be a 0-based node index. A
link naming a node that does not exist **throws** (a silently dropped edge is a
wrong picture), duplicate ids keep the first node, and self-links are kept for
the record but contribute no degree and no drawn edge.

## 76. `network` rewrites `resolved.data`: nodes become points, ordered by degree

The contract wants "keyboard walks nodes by degree", and the pipeline's
`navigate()` walks `points[pi]` linearly, so the network's `resolveOptions` hook
rewrites `resolved.data` to a single series whose `data` is the node list
**sorted by degree descending** (ties keep caller order), with the normalized
graph carried alongside on the series object. Consequences:

- `PointEvent.dataIndex` is the degree RANK; the a11y table, `exportData`,
  tooltips, announcements and `geom.pos` all use that same order, so everything
  stays mutually consistent.
- `getOptions()` echoes the reordered node list (it is resolved options, not the
  caller's literal input). Nothing the caller passed is mutated — new objects
  are built.
- This is what keeps `chart.ts` free of per-type branching: every node is a real
  normalized point, so events, tooltips, focus and the a11y layer work with zero
  pipeline changes.

## 77. Choropleth matching: EXACT keys, a configurable unmatched-data policy, grey features

Matching is exact (no trimming, no case folding) between the GeoJSON property
`choropleth.featureKey` (default `'name'`) and each datum's `label ?? x`.

**Unmatched DATA rows** are the interesting case, and the contract allows either
a diagnostic or a throw. This build defaults to the **loud, non-fatal**
diagnostic, because real-world name mismatches ("USA" vs "United States of
America") are the norm and a hard throw is hostile to a legitimate caller, while
silent omission hides a data bug:

- `choropleth.unmatched: 'warn'` (**default**) — the row is not shaded, but it
  is reported twice over: one structured `console.warn` naming up to 5 unmatched
  labels, the key used and the feature count, plus a sentence in the chart's
  accessible description (the `a11yDescription` stage, entry 17). Warned once per
  distinct diagnostic, not once per frame, with a bounded set of seen messages.
- `'strict'` — throws from `layout()` with the same message the warning uses. For
  CI and data pipelines, where a typo'd region must fail the build rather than
  ship a plausible-looking map.
- `'omit'` — silent, for deliberately partial datasets.

Under every policy the row keeps its a11y table entry, so `exportData()` still
carries every datum and nothing is lost.

**Unmatched FEATURES** (features with no datum) are filled `theme.gridline` and
deliberately **not hoverable** (there is no datum to put in a `PointEvent` or
tooltip); they appear in the a11y table as extra rows with the value `no data`,
appended after the data rows, and therefore in CSV/JSON exports too. One datum
may color several features that share a key (islands of one country); a feature
matches at most one datum.

## 78. `albersUsa` is d3's composite ARRANGEMENT with longitude/latitude panes

The lower 48 use the conic equal-area projection with standard parallels
29.5°/45.5° about 96°W. Alaska (parallels 55°/65°, 154°W, scaled 0.35) and
Hawaii (8°/18°, 157°W, 1×) are placed at d3.geoAlbersUsa's offsets
(`-0.307, -0.201` and `-0.205, -0.212` plane units from the lower-48 center; d3
expresses them in screen units, so the y sign flips on our north-positive
plane). Two documented simplifications: pane selection uses lon/lat boxes
(Alaska = lat ≥ 50 and lon ≤ -129 or ≥ 172; Hawaii = lat ≤ 30 and lon ≤ -140)
instead of d3's per-pane clip extents, and anything outside those boxes — Puerto
Rico, or a non-US topology — is projected with the lower-48 conic rather than
dropped, so an unexpected input degrades to a plain Albers map instead of
vanishing.

## 79. Antimeridian rings are unwrapped, never split

A ring crossing ±180 has its longitudes made CONTINUOUS (whole turns of 360°
added per vertex so no step exceeds 180°, then the whole ring shifted back so
its mean longitude is in range). The shape stays contiguous — no streak across
the map — but it may extend slightly past ±180, which widens `fitExtent`'s
bounds for whole-world topologies. Proper polygon splitting needs a spherical
boolean operation and is out of scope for a projection module.

## 80. Orthographic clipping truncates rings at the horizon

`orthographic` returns `null` for the far hemisphere (`cos c < 0`). A ring
straddling the horizon keeps only its visible vertices — no horizon arc is
interpolated, so a partially visible shape's cut edge is a chord rather than the
true limb. Features entirely on the far side are skipped (they still own their
datum, keyboard slot and table row).

## 81. Renderer primitives: no polygon / fill-rule primitive existed

The `Renderer` interface has no polygon, multi-subpath or fill-rule API, and it
must not be modified. Both needs were composed from what exists:

- **Polygons with holes** are emitted as one `M`/`L…`/`Z` subpath per ring
  through the existing `path(cmds, opts)`. The canvas fill rule is NONZERO, so
  `orientPolygon` normalizes winding itself (exterior positive, holes negative)
  instead of trusting RFC 7946 — real-world files routinely get winding wrong.
  **Limitation:** because the renderer exposes no `'evenodd'` fill rule,
  correctness depends on that normalization; a polygon whose rings genuinely
  overlap (invalid GeoJSON) can still fill oddly.
- **Hit testing** is our own ray casting (`polygon.ts`), even-odd across a
  polygon's rings and MultiPolygon-aware, because the renderer offers no
  `isPointInPath`.

No renderer change was made.

## 82. Network link color: `theme.textMuted` at 0.35 alpha

The contract fixes the alpha ("links hairline at 0.35 alpha") but not the hue.
`theme.axisLine` at 0.35 alpha is effectively invisible on the dark surface
(`#383835` on `#1a1a19`), so links use `theme.textMuted` — identical in both
schemes (`#898781`) and legible on either surface, still an ink color, never a
series slot.

## 83. Node radii: area-true, with a legibility floor

`r = rMax·√(v/vMax)` exactly, so area ∝ value (a radius-linear encoding is a
bug). `rMax` is `min(plot.w, plot.h)/10` clamped to `[6, 28]` px. Two documented
edges: values whose scaled radius falls below the 4px floor are clamped to it
(proportionality holds for every value above the floor), and a graph where NO
node carries a value draws every node at the mid-size radius — "no value" must
not read as "big".

## 84. Force-layout determinism, undocumented defaults, and the parse/legend policies

`network.iterations` (300), `network.fixedSeed` (1), `network.linkDistance` (40)
and `network.charge` (-220) have no contract defaults; the last two were chosen
for a readable node separation. Determinism is structural:

- initial positions are a phyllotaxis spiral whose only seed-dependent term is a
  rotation phase drawn from a mulberry32 PRNG — the single use of the seed;
- a FIXED iteration count runs to completion (no `alphaMin` early exit, no rAF,
  no animation loop: simulate, then draw);
- accumulation order is fixed everywhere (bodies in index order, quadtree
  quadrants NW/NE/SW/SE, links in input order), and coincident bodies are
  separated by an index-derived epsilon instead of d3's random "jiggle";
- repulsion is Barnes-Hut (O(n log n), `theta = 0.9`); with `theta = 0` the
  traversal is the exact pairwise sum, which the tests assert.

The simulation runs in ABSTRACT units and `fitPositions` maps the result into
the plot rect afterwards, so a resize re-fits the same graph instead of
producing a different one. Results are memoized under a structural key (bounded
to 16 entries) purely to avoid recomputing on resize; the memo returns
byte-identical values. Node radii are px and are NOT scaled by the fit, so a
very dense graph can still overlap marks.

Legend policies: like heatmap (entry 33), `choropleth` resolves legend "auto" to
SHOWN even for one series — the gradient scale is the only key to what the fills
mean. `network` instead keys legend "auto" off the GROUP count (`groups >= 2`):
its legend lists groups, not series, and a one-series graph would otherwise
never show it. Group items are non-toggleable (a group is a color key, not a
series).

Parsed GeoJSON features are memoized in a `WeakMap` keyed on the `geojson`
object identity plus the `featureKey` in use, because layout, the a11y table and
the legend all need the feature list and a world topology is megabytes of
coordinates. Since v0.3 that identity is the chart's own ingest clone (entry
13), so it is stable across updates that do not supply new topology.

---

# Cross-cutting features

Error bars, trendlines, data labels, annotations and zoom are implemented in
`packages/core/src/features/**` as pipeline-level `Decorator`s (entry 18).
Feature 6 (export) needed no decorator: `exportImage()` / `exportData()` live in
the shared layer (`src/export.ts` + `chart.ts`), so
`registerBuiltinDecorators()` covers the other five only.

## 85. Arrow-key conflict rule: plain arrows always navigate points; `Shift`+arrow pans

The contract asks for "arrows pan when zoomed" while v0.1 already binds arrows
to keyboard point navigation. Accessibility wins:

- **Plain `ArrowLeft/Right/Up/Down` always belong to point navigation**, zoomed
  or not. They are never intercepted.
- **`Shift`+arrow pans**, and only when: `zoom.enabled`, a viewport is active,
  `pan` is on, and the arrow's axis is actually zoomable (`zoom.axis`). One step
  is 10% of the visible span. Otherwise the key is not claimed and falls through
  untouched.
- **`Escape` is two-stage:** it resets the zoom when zoomed (claimed), and
  otherwise falls through to clear the datum focus.
- `+`/`=` zoom in and `-`/`_` zoom out about the window center; the navigation
  state machine ignores those keys, so there is no conflict.

Claimed keys are intercepted by a **capture-phase** `keydown` listener on the
chart root (`stopPropagation` + `preventDefault`), so the canvas's own handler
never sees them and the focus cannot move behind a pan. Everything else reaches
the canvas exactly as before.

## 86. Error-bar naming and formatting choices the contract leaves open

- ± columns are named `"<series> ± low"` / `"<series> ± high"` and **appended**
  after the type's own columns (a decorator cannot know where a type's series
  columns live). They now reach `exportData()` as well as the DOM table, because
  both come from one spec (entries 18, 24).
- The tooltip interval renders as `"<value> (<low>–<high>)"` (en dash), built by
  `formatInterval`.
- The default whisker color is the series color **darkened by 30%** (per the
  contract's "series color darkened"), falling back to `theme.textSecondary` for
  non-hex series colors.
- A series opts into error bars with `SeriesOptions.errorBars` (even `{}`);
  per-point `eLow`/`eHigh` alone do **not** turn the feature on. Uniform `value`
  wins over `percent`, and `percent` is a share of `|value|`.

## 87. Annotation presentation details

The contract fixes the four kinds, the under/over split, clipping and
`textSecondary` labels with a surface halo, but not the rest:

- reference lines are **dashed by default** (`dashed: false` opts out), 1px, in
  `theme.textSecondary` — annotations must not read as data;
- bands fill `annotation.color ?? theme.gridline` at **0.55 alpha**;
- point annotations are 5px dots with a 2px surface ring, label to the right;
- the halo is a 3px-padded rounded surface rect at 0.85 alpha behind the text;
- labels sit at the top of a vertical line, the right end of a horizontal one,
  the top center of a band, and centered on a `text` annotation's anchor;
- annotations that cannot be placed are **dropped, not clamped** (a band that
  partly overlaps the plot is clipped to it);
- `axis: 'x'` addresses the DATA axis and `axis: 'y'` the VALUE axis (the zoom
  viewport's vocabulary), so `horizontal: true` needs no special casing. On a
  band axis a string/Date is looked up as a category and a number is a band
  index; anything unplaceable yields no geometry;
- hit tolerances: 4px for lines, 8px for point dots, the measured text box
  (+2px) for text, the rect for bands. Marks beat bands, later entries beat
  earlier ones;
- annotations are described through the `a11yDescription` seam (entry 17) and are
  deliberately absent from the data table.

## 88. Trendline & data-label math decisions

- `movingAverage` uses the window `[i - floor((period-1)/2), ...]` of length
  `period` — exactly centered for odd periods, one extra sample on the right for
  even ones — and **clamps at the edges** (a partial average) so the line spans
  the whole series; nulls are skipped and an all-null window yields `null`.
- `'exponential'` fits `ln y` by least squares (points with `y <= 0` are
  dropped) and is drawn as **64 samples** across the x extent; `'linear'` is
  drawn as its two fitted endpoints.
- Trendlines are excluded from the value domain unconditionally (the module
  declares no `extendYDomain`) and are clipped to the plot, so a steep fit can
  leave the plot rather than rescale the data.
- Data-label drop priority inside `'auto'` is **max → min → last → first**, then
  candidate order (series order, then point order). A candidate is dropped when
  its measured box leaves the plot or overlaps an already-kept box (2px
  clearance). Collision filtering runs for `'auto'` only — `'all'` is the caller
  explicitly asking for everything.
- Labels are `theme.textPrimary` (ink), never the series color, and `'auto'`
  positioning prefers outside and flips inside when the outside box would leave
  the plot.

## 89. Zoom specifics

- Wheel/keyboard factors: **0.8** in, **1.25** out. Keyboard pan step: **10%**
  of the visible span.
- A drag shorter than **4px** along a zoomed axis is a click, not a zoom.
- Once zoomed, a plain drag **pans** and `Shift`+drag **brushes**; unzoomed, a
  drag always brushes.
- A pan writes the viewport through `host.setViewport()` **silently** during the
  gesture and emits a single `zoom` event on release. Brush release, wheel,
  keyboard zoom and every reset emit immediately, and only when the window
  actually changed (`sameViewport`).
- Any axis that ends up spanning its full data bounds is dropped from the
  viewport; an empty viewport normalizes to `null`, so zooming all the way out
  is a reset and emits `zoom: null`.
- `minSpan` is enforced on the **x (data) axis only** — the contract defines it
  as "smallest zoomable x-span in data units" — by growing the window about the
  gesture's anchor (its center for a brush) and then clamping to the data
  bounds.
- The full-extent bounds used for clamping are captured from the layout scales
  whenever the chart is unzoomed (in `attach` and in every unzoomed frame),
  because `model.xDomain` narrows to the window once downsampling windows a
  large series.
- Band (category) axes are not zoomable (entry 22), so a gesture on one simply
  produces no window.
- The brush rectangle is `theme.surface` at 0.45 alpha with a 1px
  `theme.axisLine` edge, and spans the full plot extent on any axis that is not
  being zoomed. It is gated on `ctx.host`, so it never appears in an export
  (entry 19).
- While a gesture is in progress the capture-phase `pointermove` listener calls
  `stopPropagation`, so hover/tooltip do not fight the drag.
- **v0.3.3, touch:** the gesture takes `setPointerCapture` on the canvas (best
  effort — absent in jsdom, and a stale id throws, so every failure is
  swallowed) and matches its `pointerId` on every move, so a second finger
  cannot hijack a drag. It raises `host.setGestureLock(true)` for the duration,
  which is what puts `touch-action: none` on the canvas while the drag lasts.
- **v0.3.3:** `pointercancel` now **aborts** a brush instead of committing it
  (it previously shared the `pointerup` handler). A cancelled PAN is still
  reported where it landed, because a pan has already moved the viewport on
  every move and rolling it back would be a second surprise.

## 90. Downsampling re-runs against the visible window

For series that exceed `downsample.threshold`, the points are first sliced to
the visible window (padded by one point each side so lines exit the plot edges),
then LTTB'd only if the window still exceeds the threshold. Series below the
threshold are never windowed or touched, which keeps every v0.2 path
byte-identical.

---

# Testing notes

## 91. Test assertions that encoded behavior this repo deliberately changed

Two v0.2 registry assertions changed when the 20 v0.3 ids were added to
`ChartType` / `CHART_TYPE_IDS`: `declares all 19 contract ids` became
`declares all 39 contract ids`, and the `unknown chart type` test switched its
example from `'sankey'` (a real v0.3 id now) to `'quantumplot'`, an id no
contract declares. To keep every other message-matching test passing unchanged,
the "not implemented" error names the contract version an id belongs to.

The v0.3 hardening pass updated eleven more, each because the behavior it
asserted was deliberately changed:

- five domain assertions (`bullet`, `boxplot`, `waterfall`, `candlestick`,
  `ohlc`) now read the exported pure domain functions instead of
  `getOptions().xAxis/yAxis` — entry 15;
- two streamgraph assertions (plot rect, axis-line count) follow the released
  left margin — entry 58;
- one gantt paint-order assertion follows axis chrome moving after the marks —
  entry 21;
- one `exportData` assertion **locked in a contract violation** (the ± columns
  appeared in the DOM table but not in the export) and now asserts the two
  agree — entry 18;
- two annotation a11y assertions follow the single description node — entry 17.

## 92. Animation of an INITIAL mount cannot be asserted under jsdom

jsdom's `requestAnimationFrame` hands its callback a timestamp that does not
advance relative to `performance.now()`, so `Animator` keeps computing `t = 0`
for the first animated render (the frames repaint the entering state
indefinitely). The affected suites therefore assert the ENTERING frame on mount,
then repaint via `chart.update()` — whose `t = 0` frame starts from the retained
TARGET geometry — and assert final geometry there. The v0.1/v0.2 suites never
animate, so the quirk was previously unobserved; no production code path is
involved.

## 93. Legend-toggle tests and shared fixtures

A legend toggle changes the chart's retained options. Since v0.3 those are the
chart's own deep clone (entry 13), so the caller's object is untouched and a
shared fixture is safe — but tests that assert on a fixture across several
mounts still build data through a factory, because a `structuredClone`
comparison is only meaningful against a pristine object.

---

# Quality-audit findings accepted rather than fixed (v0.3)

Entry 94 was raised by the v0.3 quality audit (`/QUALITY-AUDIT.md`) and is a
defect that was **judged and consciously accepted**, not one that was missed.
Anything the audit fixed is not recorded here — the fix and its test are the
record. Its three former neighbours (`network` links invisible to AT, epoch `x`
announced as a number, and the three types that rendered empty in silence) were
accepted only for as long as they were unruled; rulings E-4, E-5 and E-9 closed
all three in v0.3.2, so they are deleted rather than marked, and what the fixes
themselves changed is recorded in §100–§105 below.

## 94. `calendar` paints day cells that keyboard navigation and the data table cannot reach

A calendar draws a cell for **every day in `[start, end]`** but only days
carrying a datum are navigable or tabulated: a sparse year is 365 painted cells,
3 keyboard stops and 3 table rows. The contract says "Keyboard walks days", and
`choropleth` already sets the opposite precedent (features with no datum are
listed as `no data`).

Accepted because closing it needs a synthetic day series spanning the whole
range — a type-level redesign of calendar's model, not a patch — and the visual
affordance the missing cells provide (an empty grid position) is genuinely
weaker information than the ones that are exposed.

Mitigated instead: the accessible NAME states the sparsity outright ("1 Jan 2026
to 31 Jan 2026 (31 days), 2 with data, values from …"), so a screen-reader user
is never told the month contains only two days. Pinned by
`test/a11y.conformance.test.ts` ("calendar: no-value day cells are drawn but not
navigable (known gap, pinned)") so the gap cannot widen unnoticed.

# Quality-audit escalations: the architect's rulings

## 95. A caller-supplied sequential ramp is used VERBATIM in both colour schemes

Ruling E-3 made the DEFAULT sequential ramp's direction depend on
`theme.colorScheme`: light keeps low → lightest / high → darkest, dark reverses,
so the highest-magnitude step clears 3:1 on either surface (11.64:1 light,
13.16:1 dark; it was 1.46:1 in dark before). `heatmap`, `calendar` and
`choropleth` all take the oriented default, and `docs/api-contract.md` now
states the per-scheme direction where it used to say only "default ramp:
sequentialPalette".

The deviation is the carve-out: **a ramp the caller passes** (`heatmap.ramp`,
`calendar.ramp`, `choropleth.ramp`) is **not** reoriented. The rule the ruling
enforces — "the near-zero end may recede, the high end may not" — is not
enforced on caller ramps.

Accepted because reversing an array the caller wrote is a worse failure than the
one it prevents: their ramp may not even be monotone in lightness (a two-hue or
banded ramp reversed by us would encode the opposite of what they meant), and a
library silently inverting an explicit visual choice is unpredictable in a way
the original bug was not. The direction rule is documented in the contract so a
caller supplying a ramp knows what is expected of it.

**Hierarchy lightness steps are a DEPTH encoding, not a magnitude one**, and
share no code with the sequential ramp — a deeper node receding toward the
surface is correct on either surface. What they now also obey is a contrast
floor, for a different reason: see §100.

## 96. Palette slots 9+ get composite encoding, not the fold `ARCHITECTURE.md` promised

`ARCHITECTURE.md` §4 used to say "never cycle hues past slot 8 (fold to
'Other')". The library does not fold, and now does not claim to. Ruling E-1:
auto-merging a 9th series into "Other" would destroy data the caller explicitly
asked us to draw, and that is not the library's decision to make.

What happens instead: the validated hue ORDER is reused (never a generated
hue), and a second, non-colour channel separates the repeat — a **dash pattern**
on line/area strokes and a **marker shape** (square, triangle, diamond) wherever
markers are drawn, carried onto the legend swatch as a matching stripe. One
`console.warn` per chart instance names the chart and recommends the real fix
("Other", or small multiples). §4 has been rewritten to describe this.

Two bounded gaps, deliberate:

- **Bar, pie and the non-cartesian types get colour only.** A bar has no line to
  dash and no marker to reshape; texture fills would be the analogous channel and
  the renderer has no texture primitive. In practice these forms carry direct
  labels or a data table, which is the relief the palette rules ask for.
- **`bubble` keeps circles.** Its marker size is a data channel; changing the
  shape as well would make two encodings share one mark.

## 97. `ohlc` gets no new glyph — its redundant channel is geometric

Ruling E-6 asked for the hollow/solid fill convention on `candlestick` and to
"carry the same fill convention to `ohlc` where it applies". Candlestick is
implemented exactly as ruled: rising bodies hollow (1px outline, surface-filled),
falling bodies solid.

For `ohlc` the judgement was that the fill convention does **not** apply and does
not need to. An OHLC mark has no body to fill, and it already encodes direction
geometrically: the close tick (right) sits above the open tick (left) on a rising
mark and below it on a falling one — the same redundancy the audit itself
accepted as sufficient for `waterfall` ("direction is redundantly encoded by
whether the bar rises or falls"). Inventing a terminator glyph would have added
visual output the contract does not describe, and would have broken three
existing tests that encode the contract's OHLC spec ("no filled bodies", "three
1px strokes per mark") rather than any defect.

What was added instead: the geometric invariant is now pinned by a test, and the
convention is stated in `ohlc`'s accessible description so a reader who cannot
use the colour is told which channel carries the direction. Both types also
announce "rising" / "falling" / "unchanged" per mark — the comparison the chart
exists to convey was previously left for the listener to perform.

**Flagged for the architect**: if the intent was a drawn glyph on `ohlc` as well,
this is the one place the ruling was read narrowly.

## 98. The DOM data table is capped by default, and `exportData()` never is

Ruling E-10 confirmed the 2,000-row DOM cap and made it the caller's choice:
`a11y.tableMaxRows` (default 2000, `Infinity` allowed) is now part of
`A11yOptions` in the contract.

The deviation from "row counts match the input" stands for the DOM table at its
default, and is stated in both places a reader could look — the table's own
`<caption>` and the chart's accessible description, each naming `exportData()`
as the complete source. Materializing one `<tr>` per datum costs ~115 µs/row:
~11.5 s of synchronous main-thread work at 100k rows, heap exhaustion at 1M. A
caller who needs every row in the DOM sets the option and accepts that cost.
`exportData()` is uncapped at every setting.

Since v0.3.2 the cap also bounds what is BUILT, not only what is materialized
(§104).

## 99. `forced-colors` support is implemented, with two stated limits

`ARCHITECTURE.md` §3 claimed `forced-colors` support that did not exist. Option
(a) of the ruling was taken rather than deleting the claim: the pipeline detects
`matchMedia('(forced-colors: active)')`, re-expresses the resolved theme in CSS
system colours (`Canvas`, `CanvasText`, `GrayText`, `LinkText`, `Highlight`)
before painting, and watches the query for the chart's whole lifetime. It
overrides `theme: 'dark'` and a custom `Theme` object alike, because forced
colours is a user preference. §3 now describes the mechanism instead of
asserting the outcome.

Two limits, recorded rather than papered over:

1. **Three series colours, not eight.** A forced palette defines only a handful
   of foreground roles that every High Contrast theme keeps distinguishable from
   the background; `CanvasText`, `LinkText` and `Highlight` are those. Series 4+
   fall back to the composite encoding of §96. Deriving more "hues" would be
   inventing contrast guarantees the platform does not make.
2. **Real-browser resolution is unverified.** The tests drive a `matchMedia`
   stub and assert that system-colour keywords reach the renderer; that a browser
   resolves `ctx.fillStyle = 'CanvasText'` against the user's forced palette is
   documented CSS behaviour, but this suite runs on jsdom with a stubbed canvas
   and cannot prove it. It falls inside the audit's existing "no real-browser
   rendering was verified" gap, not outside it.

## 100. Hierarchy depth steps REVERSE at the contrast floor instead of stopping

Ruling E-2: a hierarchy child's lightness step is computed as before and then
clamped so every node's fill clears **2:1** against the current surface. The
ruling explicitly rejected lowering `CHILD_MIX_MAX` globally — that dulls every
hue to fix one — and asked for a per-slot clamp, with depth allowed to
*alternate direction* where a hue cannot express further steps within the floor.

`CHILD_MIX_MAX` is therefore unchanged at 0.5, and `matrix/hierarchy.ts#childColor`
is the whole of the mechanism: take the step toward the surface if it clears the
floor, otherwise take the same-size step AWAY from the surface. The deviations
worth knowing:

- **A yellow hierarchy alternates lighter/darker by depth.** Slot 4 (`#eda100`)
  measures 2.11:1 on the light surface, so it has no usable headroom to lighten
  at all; its children are darker than their parent, whose children are lighter
  again. "Children are lightness steps of the parent hue" still holds — the
  hue is untouched and no new slot is introduced — but the steps are no longer
  monotone in one direction for every hue. The contract's dataviz rule now says
  so.
- **The clamp is measured, not tabulated.** It asks `contrastRatio` against
  `theme.surface` at build time, so a custom theme gets the same guarantee, and
  a custom theme whose slot ALREADY sits below the floor is walked toward the
  away-pole until it clears (a bounded loop, never a throw).
- **An explicit `TreeNode.color` is never clamped.** A colour the caller wrote
  is their choice, exactly as with a caller-supplied ramp (§95). Its children
  are clamped, because those we generate.

Measured, light surface, slot 4 at the audit's failing step: **1.58:1 → 4.69:1**.
Depth 5 in both schemes, every slot, is asserted in `test/v032.rulings.test.ts`.

## 101. `network` walks nodes THEN links, and `dataIndex` is a reading-order index

Ruling E-4: network's keyboard walk and data table cover links as well as nodes,
"exactly as `sankey` already does". Implemented by reusing sankey's shape — one
flat reading order (`networkReadingOrder`: each node, then that node's outgoing
links) synthesised onto the first series in `resolveOptions`, so the shared
pipeline gives every mark an event identity, a focus stop, a tooltip and a table
row with no per-type branching.

The contract's `network` row is amended accordingly (it specified
`node, group, degree, value` and "keyboard walks nodes by degree"). Three
consequences a caller can observe:

- **`PointEvent.dataIndex` is now the reading-order index, not the degree rank.**
  For a node it is still the rank when the graph has no links, and the nodes are
  still visited in degree-descending order — but a link sits between them. This
  is the same index-space rule sankey has always had, and it is the only way the
  two surfaces can agree.
- **The table gained two columns** (`Source`, `Target`) and its first column is
  titled `Node / link`. `exportData()` mirrors it, so a CSV consumer sees the
  new columns. Node rows carry `—` in the link columns and vice versa.
- **Links are hit-testable** (within 5px of the segment), nodes winning ties, so
  the pointer reaches exactly the marks the keyboard does. Link tooltips show
  the edge and its value.

## 102. A declared time axis makes a bare `x` epoch milliseconds

Ruling E-5 added `ChartTypeNeeds.xScale: 'time'`, declared by `candlestick`,
`ohlc` and `gantt`. `inferXType` honours it, so on those types a numeric `x` is
epoch ms and the tick labels, tooltip header, a11y table and keyboard
announcement all read as times instead of announcing `1767.23B`.

What deviates, stated because it is a behaviour change on existing data:

- **A small integer `x` on these three types is now 1 Jan 1970**, not `1`. That
  is the declaration doing exactly what it says; it is also why the audit's
  scoped fix was correctly reverted (sniffing magnitudes is a guess, declaring
  is not). Two existing assertions that demanded the bare number under a column
  titled `Time` were restated — they encoded audit finding A-7.
- **The declaration loses to genuinely categorical data.** Caller-supplied
  `categories` or string `x` values still produce a band axis, because the rest
  of the pipeline (`bandIndexFor`, tick lookup, the table) is already addressing
  bands by index and a declaration must not contradict a placement in use.
  An explicit `xAxis.type` outranks everything, as always.
- **`gantt` no longer writes `xAxis.type: 'time'` into the resolved options.**
  It declares instead, so `getOptions().xAxis` round-trips the caller's
  configuration rather than a computed one (entry 15's rule). It still pins
  `min`/`max` to the task span, which is a domain, not an axis kind.
- **Dates are formatted in LOCAL time**, as every other time axis in the library
  is (`util.ts#formatDate`). `calendar` remains the documented exception (entry
  61: a calendar day is only well defined against a fixed zone, so it is UTC).

## 103. A zoom gesture re-windows incrementally, with two documented fallbacks

Ruling E-7: `zoomTo` re-slices the retained `sourcePoints` instead of re-running
`buildModel`. `model.ts#rewindowModel` recomputes the drawn points, the value
and x extents and both domain-extension stages through the SAME helpers
`buildModel` uses, so the two cannot drift.

It deliberately declines — returning `null`, which makes the caller fall back to
the full rebuild — in two cases:

1. **A stacked model.** `y0`/`y1` are index-aligned to the arrays a stack pass
   produced; windowing one member of a stack would desynchronize it. Stacked
   bar/area are excluded from downsampling anyway, so this costs nothing real.
2. **A non-continuous x axis.** A band axis ignores the viewport by design
   (entry 22), so there is nothing to re-slice.

Measured on the bench host: `zoomTo` a 0.1% window of 1M points **76.8 ms →
9.9 ms**; a full reset from 1M 310.9 ms → 253.0 ms (the reset still pays LTTB
over the whole series plus the a11y sampling note's count, which is the
remaining cost and is not a re-ingest).

## 104. `a11yTable`'s `limit` is optional, and only four table implementations honour it

Ruling E-8: `a11yTable(ctx, opts?: { limit?: number })`, additive and optional.
The DOM path passes the resolved `a11y.tableMaxRows`; `exportData()` passes
nothing and still gets every row. A definition that ignores `limit` is sliced by
the pipeline, which also fills in `A11yTableSpec.total`, so no type was forced to
change.

Adopted where a row is genuinely expensive to build — one row object with
formatted string cells per DATUM: the shared **cartesian** table (line, area,
bar, scatter and everything built on it), **candlestick/ohlc**, **bubble** and
**rangearea**. Every other type still builds its rows eagerly, which is correct:
their row counts are bounded by their own shape (a gauge has one row, a sankey
has nodes + links, a heatmap has one row per series), so a budget would be
ceremony. `AUTHORING.md` documents when to adopt it and the exact shape.

Consequences: `A11yTableSpec` gained an optional `total`, and the caption and
accessible description read it rather than `rows.length` — a definition that
honours `limit` but forgets `total` would report the truncated count as the
whole truth. Decorator `a11yTable` transforms run AFTER the bound, on the rows
that survived it, and the pipeline carries `total` across them.

Measured mount with the default (`table: 'hidden'`), bench host: **100k
643.7 ms → 292.1 ms**, **1M 4697.2 ms → 1206.8 ms**. The a11y layer's share of
the mount at 1M falls from +3.89 s to +0.28 s. `exportData()` is unchanged and
still complete.

## 105. `candlestick`, `ohlc` and `network` reject wrong-shape data — but not EMPTY data

Ruling E-9: these three throw the same clear, actionable errors as their peers
instead of rendering an empty chart in silence. The messages name the type, the
expected shape and (for the financial pair) the offending series and entry.

The line drawn, which is the deviation worth recording: **an empty series list,
an empty `data` array and all-null data are still an empty chart, not an error**
— no data is not wrong data, and that is exactly where `gantt` and `sankey` draw
it too. The financial check additionally passes as soon as ONE entry carries a
full open/high/low/close, so a payload with some malformed rows still renders
and simply skips them, as it always did; only a series that cannot produce a
single mark is an error.

`test/robustness.test.ts` pinned the old silence; it now pins the diagnostic,
including that the message stays actionable rather than merely present.

---

# Touch interaction

## 106. Touch is a first-class input — and four things it deliberately does NOT do

v0.3.3 fixed a reported bug: **no chart of any of the 39 types responded to a
finger**, on real devices and in DevTools device emulation alike. Three
independent causes, all confirmed in source: `touch-action` was never set (the
UA cancelled every gesture it suspected of being a scroll), there was no
`pointerdown` handler (a tap produces no `pointermove`, and `handlePointerMove`
was the only thing that set hover), and there was no `pointercancel` handler
(a cancelled gesture left stale hover state). What is now implemented is in
`docs/concepts/interactions.md#touch` and the contract's mark & interaction
spec. What is *not*, and why:

- **No pinch-to-zoom.** `zoom` on touch is brush and pan — the same two
  gestures the mouse has. A pinch needs two-pointer tracking, a scale anchor and
  a fight with the UA's own pinch (which `touch-action: none` would have to
  claim on every zoomable chart, re-introducing the page-trapping problem this
  fix exists to avoid). It is a feature, not a bug fix, and it is not in this
  change.
- **No double-tap reset.** Double-click reset is unchanged and works from a
  mouse. Whether a double tap synthesizes `dblclick` is UA- and
  `touch-action`-dependent, so touch users reset with the "reset" affordance the
  page provides, `Escape` from a keyboard, or `chart.zoomTo(null)`.
- **No long-press affordance.** A long press is left to the platform (text
  selection, context menu). ChartCraft claims neither.
- **The legend's coarse sizing is decided once, when the legend is built.** It
  reads `matchMedia('(pointer: coarse)')` and does not subscribe to changes, so
  a device that gains or loses a mouse mid-session keeps the sizing it started
  with until the next `update()`. Plot hit targets have no such limitation —
  they read each event's `pointerType`.

Two further consequences worth stating rather than discovering:

- **`touch-action: pan-y` means a horizontal swipe over a chart no longer
  scrolls a horizontally-scrollable ancestor**, because the chart claims that
  axis (it is where scrubbing and brushing live). Vertical scrolling — the
  gesture that actually matters on a phone — is untouched. A chart placed inside
  a horizontal carousel should be given its own non-chart drag handle.
- **The tooltip from the tap that started a brush stays on screen during the
  drag**, because the zoom decorator suppresses hover while a gesture runs. It
  is cleared the moment the gesture applies a viewport; a drag too short to zoom
  is a tap, and keeping it is then the correct outcome.

---

# Angular wrapper (added 2026-07-26)

Recorded with an `A-` prefix rather than continuing the numbered ledger: these
are wrapper-packaging facts, not deviations in core's contract.

## A-1. `@chartcraft/angular` is built with ng-packagr, not tsup

Every other package in this repo is bundled with `tsup`. The Angular wrapper
cannot be, and the reason is not preference: `@Component` decorators require
the real Angular compiler (`ngtsc`, from `@angular/compiler-cli`) to emit Ivy
component definitions. A plain TypeScript/esbuild transpile leaves the
decorator *inert* — the class compiles, imports fine, and does nothing at
runtime. That is fundamentally unlike the other three wrappers: React's JSX is
native to esbuild, this repo's Vue wrapper is plain `h()` calls with no SFC
compiler, and the Svelte wrapper ships uncompiled `.svelte` source for the
consumer's own tooling. Shipping raw decorated `.ts` is not how the Angular
ecosystem publishes libraries and breaks consumer AOT builds.

So the package is built with **ng-packagr** (`21.2.x`) into the Angular Package
Format: partial-Ivy `fesm2022` + `.d.ts`, `compilationMode: "partial"`, with
the Angular linker finalizing the declarations inside the consumer's build.

Three consequences worth stating rather than discovering:

- **The publishable artifact is `packages/angular/dist`, not the package root.**
  ng-packagr writes `dist/package.json` itself (adding `module`, `typings`,
  `exports`, `type: module`) and *errors* if the source `package.json` already
  declares those keys. The other three wrappers publish from their root with
  `files: ["dist"]`; this one is published from `dist`. The consequence inside
  the monorepo is that `import … from '@chartcraft/angular'` does not resolve
  against the workspace symlink (the source `package.json` has no entry point)
  — the package's own tests import from `../src/public-api` instead, which is
  what the ng-packagr workflow expects.
- **`@chartcraft/core` stays a real `dependency`**, matching the other three
  wrappers. ng-packagr wants library dependencies to be peers and fails
  otherwise, so `ng-package.json` carries an explicit
  `allowedNonPeerDependencies: ["@chartcraft/core"]`.
- **The shared `tsconfig.base.json` needed no changes.** `moduleResolution:
  "bundler"`, `verbatimModuleSyntax: true` and `isolatedModules: true` all
  passed through `ngtsc` unmodified; the package adds only a `tsconfig.lib.json`
  (emit + `angularCompilerOptions`) and a `tsconfig.spec.json`.

## A-2. `cc-` selector prefix and `Cc*` class names

Angular element selectors are global to a template's import graph, so a
library must namespace them; `<chart>` or `<line-chart>` would collide with
half the ecosystem. The components are `<cc-chart>` and `<cc-<type>-chart>`
(39 of those), with class names `CcChart` / `Cc<Type>Chart`. This is the one
place the Angular wrapper's public names differ from React/Vue/Svelte, which
export bare `Chart` / `LineChart`. Core's `Chart` *instance interface* is
re-exported as `ChartInstance`, exactly as in the other wrappers.

## A-3. Options updates are immutable-by-reference, like React — not deep-watched like Vue

The `options` input is watched with an `effect()`, which reacts to reference
changes. Mutating the same object in place does **not** reach `chart.update()`;
callers must pass a new object. This matches the React wrapper's contract and
is documented on the Angular guide page and in the component JSDoc.

The upside over React's implementation is worth recording: React's update
effect depends on a hand-written exhaustive `OPTION_KEYS` list (a prior version
shipped a real bug where new option keys were missing from it, so changing them
did nothing). The Angular effect reads the whole `options()` signal, so there
is no key list to keep in sync — any reference change is picked up, including
option blocks added by future core versions.

Two guards make the behaviour deterministic: the effect reads the chart
instance `untracked`, so creating the chart never re-triggers it, and the exact
options reference the chart was *built* with is remembered, so mounting never
issues a redundant `chart.update()`.

## A-4. zone.js is neither a dependency nor a peer dependency

`@angular/core` lists `zone.js` as an *optional* peer. The wrapper's reactivity
is signals end to end (`input()`, `output()`, `effect()`, `afterNextRender()`),
so it never touches `NgZone` and works identically in zone-based and
`provideZonelessChangeDetection()` applications. The package's own test suite
runs zoneless with no zone.js loaded anywhere, which is the proof.

`peerDependencies` are floored at `@angular/core >= 20.0.0` (no upper bound,
matching the other wrappers' style): v20 is the earliest major where every API
used here — signal `input()`/`output()`, `afterNextRender()`, zoneless change
detection — is stable. The dev/build toolchain targets Angular 21, which is the
major whose TypeScript peer range (`>=5.9 <6.0`) matches the repo's already
resolved TypeScript 5.9.3 with no second copy.

## A-5. Angular components are tested AOT, with a second Vitest major

Angular's JIT compiler builds directive metadata from the decorator object; it
does not scan class fields, so **signal `input()`/`output()` declarations are
invisible to JIT**. Testing this package therefore requires real AOT
compilation, provided by `@analogjs/vite-plugin-angular` running `ngtsc` inside
Vite (with `@angular/build` as its compilation backend). Tests drive Angular's
own `TestBed` with `provideZonelessChangeDetection()`.

That toolchain requires Vite 6+, and `@angular/build@21` peers on `vitest@^4`,
so `packages/angular` carries its own **Vitest 4** (nested under
`packages/angular/node_modules`) while core/react/vue/svelte stay on the root's
Vitest 2. `npm run test -w @chartcraft/angular` and `npm test` from the root
both work unchanged; the two majors never share a process.
