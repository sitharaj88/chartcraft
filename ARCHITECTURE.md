# ChartCraft — Architecture

ChartCraft is a framework-agnostic charting library for the web, built for
companies that need production-grade performance, accessibility, and
documentation. One rendering core, thin idiomatic wrappers per framework.

## Package layout

```
packages/
  core/      @chartcraft/core     — framework-agnostic engine (zero dependencies)
  react/     @chartcraft/react    — React 18+ wrapper
  vue/       @chartcraft/vue      — Vue 3 wrapper
  svelte/    @chartcraft/svelte   — Svelte 4/5 wrapper
docs/        — markdown documentation (guides, API reference, concepts)
examples/    — runnable vanilla HTML demos against the built core
```

## Core decisions (ADR summary)

1. **TypeScript, strict, zero runtime dependencies in core.** Every public type
   is exported. The npm package ships ESM + CJS + `.d.ts` via tsup.

2. **Canvas 2D is the primary renderer**, behind a `Renderer` interface.
   Rationale: predictable performance at 10k–1M points, single draw surface,
   devicePixelRatio-aware crisp output. An SVG renderer (for print/export and
   style-by-CSS use cases) and a WebGL renderer (1M+ points) implement the same
   interface later — chart code never touches the canvas API directly.

3. **Accessibility is a first-class subsystem, not a bolt-on.** Because canvas
   is opaque to assistive tech, every chart maintains a parallel DOM layer:
   - `role="img"` with generated or author-provided `aria-label` summary,
   - a visually-hidden `<table>` of the data (toggleable to visible), whose row
     budget is pushed DOWN into the chart type (`a11yTable(ctx, { limit })`) so
     a bounded table costs a bounded build, never a full one,
   - keyboard navigation (arrow keys walk points/series, Home/End, Enter to
     activate) with an `aria-live` announcer,
   - respects `prefers-reduced-motion` (disables animation) and
     `forced-colors` (below).

   **`forced-colors: active`** is handled explicitly rather than inherited.
   The DOM layer above picks up the user's forced palette for free, as any DOM
   content does — but a canvas does **not**: its pixels are not re-mapped by the
   browser, so without action a chart would keep painting its authored palette
   into a high-contrast desktop. So the pipeline detects
   `matchMedia('(forced-colors: active)')`, re-expresses the resolved theme in
   CSS **system colors** (`Canvas`, `CanvasText`, `GrayText`, `LinkText`,
   `Highlight`) and repaints, and it watches the query for the chart's whole
   lifetime — the same live-update pattern `theme: 'auto'` uses for
   `prefers-color-scheme`. Because forced colors is a *user* preference it
   overrides `theme: 'dark'` and a custom `Theme` object alike. A forced palette
   offers only three usable foreground roles, so series 4+ separate by the same
   composite encoding described in §4, and `up`/`down`/`warning` collapse to one
   color —
   which is exactly why `candlestick` encodes rise and fall with a **fill**
   (hollow rising bodies), not with hue.

4. **The default theme is a validated palette.** The 8-slot categorical order,
   sequential ramp, diverging pair, and chrome colors live in
   `packages/core/src/theme/` for light and dark. The ordering is a
   colorblind-safety mechanism (adjacent-pair CVD ΔE ≥ 8) — never re-sort it,
   never *generate* a 9th hue. Series color follows the series identity, never
   its rank after filtering — which is why `PointEvent`/`TooltipPoint` carry the
   resolved `color` of the mark: an app that re-derives a swatch from a series'
   array index gets a colour the chart is not using.

   **Status colors are a separate, three-step scale** — `up`, `warning`, `down`
   (plus `neutral` for chrome) — identical in both schemes, because a status
   colour carries a meaning and must not shift hue with the surface. They never
   impersonate a categorical slot, and no consumer should have to hardcode one.

   **Past slot 8** the library reuses the hue order and adds a second,
   non-color channel — a **dash pattern** on line-family marks and a
   **marker shape** where markers are drawn (`model.ts#seriesDash`,
   `seriesMarker`) — carried onto the legend swatch so the legend never becomes
   the one place series 9 still looks exactly like series 1. It also emits one
   `console.warn` per chart naming the chart and recommending the real fix.

   It does **not** silently fold the tail into "Other". Folding is the right
   answer and the warning says so, but performing it would destroy data the
   caller explicitly asked us to draw — that is the caller's decision, not a
   library's. Composite encoding is the sanctioned alternative; the warning
   exists so nobody mistakes the fallback for a design.

   **Sequential encoding is directional.** The default ramp is written
   light→dark, which is only correct on a light surface: the near-zero end of a
   sequential ramp may recede toward the surface, but the high end never may.
   `theme#sequentialRampFor` therefore reverses the default ramp under
   `colorScheme: 'dark'` — same steps, mirrored mapping — so the
   highest-magnitude cell clears 3:1 in both modes (11.64:1 light, 13.16:1
   dark). A caller-supplied ramp is used verbatim: they chose the direction.

5. **Immutable-options, retained-model pipeline.**
   `createChart(el, options)` → normalize options → build data model → compute
   scales/layout → render. `chart.update(partial)` diffs and re-runs only the
   affected stages. Animation interpolates between retained models.

6. **Interactions ship by default:** crosshair + shared tooltip on line/area,
   per-mark tooltip on bar/scatter/pie, legend toggling, hover highlight with
   hit targets larger than the mark. All interaction is pointer-event based —
   one hit-testing path for mouse, touch and pen — but touch is treated as its
   own input, not as a mouse that happens to have no cursor:
   - a **tap** inspects (`pointerdown` sets hover and shows the tooltip; a
     finger produces no `pointermove`, so hover alone would never fire), a drag
     scrubs, and the tooltip survives the lift because it is invisible under the
     finger that summoned it;
   - hit radius is chosen **per event** from `pointerType` — 24px for a cursor
     or stylus, 44px for a fingertip;
   - the canvas is **`touch-action: pan-y`**, never `none` by default: the page
     must keep scrolling over a chart. It escalates to `none` only for vertical
     zoom drags and for the duration of a brush/pan gesture, which is the only
     place a decorator may raise it (`DecoratorHost.setGestureLock`).

7. **Wrappers are thin.** They own lifecycle (mount/update/destroy), resize
   observation, and event bridging — nothing else. No chart logic outside core.
   This keeps every framework at feature parity for free.

8. **The API contract is law.** `docs/api-contract.md` defines the public
   surface. Core implements it; wrappers consume it; docs document it. Any
   deviation must be recorded in `DEVIATIONS.md` at repo root and reconciled.

## Performance principles

- One canvas per chart; layered offscreen canvas only when interaction redraw
  cost demands it (crosshair layer separate from data layer).
- No per-frame allocation in the render loop; typed-array paths for large series.
- Automatic downsampling (LTTB) beyond a configurable point threshold.
- Resize via `ResizeObserver`, renders coalesced through `requestAnimationFrame`.
- Benchmarks live in `packages/core/bench/` (documented, run with `npm run bench`).

## Testing

- `vitest` + jsdom. Canvas 2D context is stubbed in `test/setup.ts` (jsdom has
  no canvas); unit tests target the pure stages — scale math, layout, data
  normalization, downsampling, a11y tree text, theme resolution — plus renderer
  call-log assertions against the stub.
- Wrapper tests mount/update/destroy against the real core.

## Chart-type registry (v0.2)

Every chart type is a `ChartTypeDefinition` module registered in
`packages/core/src/charts/registry.ts` — it owns layout, render, hit-test,
legend items, a11y table rows, and keyboard geometry for its type.
`chart.ts` dispatches through the registry and contains no per-type
branching. Adding a chart type = adding one module + registering it; the
pipeline, wrappers, and a11y layer pick it up automatically. Combo charts
(per-series `type` on cartesian roots) mix line/bar/area/scatter series on
one shared y-axis — the one-axis rule is non-negotiable.

## Decorations & viewport (v0.3)

Two pipeline extensions keep cross-cutting features out of the chart types:

- **Decorators** — error bars, trendlines, data labels, annotations and the
  brush rectangle draw through a pipeline-level decorator list (each gets the
  plot rect, scales, model, theme and renderer) plus an optional per-type
  `decorations(ctx, layer)` stage. No chart type knows a feature exists, and
  no feature needs a per-type branch.
- **Viewport** — zoom/pan is expressed as optional x/y domain overrides
  consumed by the layout stage. Downsampling re-runs inside the viewport, so
  zooming into a million points reveals genuine detail rather than a
  magnified approximation. A gesture **re-windows incrementally** rather than
  re-ingesting: nothing about a viewport change invalidates normalization, and
  the full series is already retained on the model, so `zoomTo` re-slices the
  retained points and recomputes the domains through the same helpers the full
  build uses (`model.ts#rewindowModel`). It falls back to a full build for the
  shapes where that is not obviously equivalent — a stacked model, whose
  `y0`/`y1` are index-aligned to a stack pass, and a band x axis, which ignores
  the viewport by design.

  A viewport **survives an `update()`** unless the new data makes it meaningless,
  and the discriminator is the DOMAIN rather than which option keys the payload
  carried (`chart.ts#viewportSurvives`): the chart type and x-axis kind must be
  unchanged, an `x` window needs an unchanged x extent and a `y` window an
  unchanged value extent. This is what makes zoom usable through the wrappers,
  every one of which re-sends the whole `options` object — `data` included — on
  any change, so keying off "the payload mentions `data`" made a theme toggle
  destroy the user's zoom. It reads numbers the layout already computed, so the
  check costs the same at 1M points as at 10, and a reset always **emits `zoom`**
  so an app's Reset affordance cannot disagree with the actual state.

## Axis kind is a property the domain stages consult (v0.4.0)

A **log** value axis has no zero, no negative half and no outward direction
toward either, so every stage that widens a value domain asks the axis first
(`DataModel.valueAxisLog`, resolved once from the registry's `valueAxisOf`): zero
anchoring does not apply, rounding goes to whole decades through the one shared
`niceValueDomain` helper, a stack's zero floor is replaced by the cumulative
tops, and any non-positive bound — from a type, a decorator, an explicit `min` or
a zoom edge — is discarded rather than clamped to an epsilon. A value ≤ 0 in the
DATA becomes a gap (`null`, the representation `NaN`/`±Infinity` already fold to)
with one warning per chart; it is not an error, because the library throws only
for structural impossibilities where there is nothing to draw at all.

Stochastic layouts (word cloud, force-directed network) are **seeded and
deterministic** — no `Math.random()` — so renders are reproducible and
unit-testable.

## Roadmap (post-v0.3)

- SVG + WebGL renderers, Angular & Solid wrappers, SSR snapshot rendering,
  PDF export, streaming data API, public plugin API, visual regression
  harness.
