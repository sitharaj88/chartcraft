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
   - a visually-hidden `<table>` of the data (toggleable to visible),
   - keyboard navigation (arrow keys walk points/series, Home/End, Enter to
     activate) with an `aria-live` announcer,
   - respects `prefers-reduced-motion` (disables animation) and
     `forced-colors`.

4. **The default theme is a validated palette.** The 8-slot categorical order,
   sequential ramp, diverging pair, and chrome colors live in
   `packages/core/src/theme/` for light and dark. The ordering is a
   colorblind-safety mechanism (adjacent-pair CVD ΔE ≥ 8) — never re-sort it,
   never cycle hues past slot 8 (fold to "Other"). Series color follows the
   series identity, never its rank after filtering.

5. **Immutable-options, retained-model pipeline.**
   `createChart(el, options)` → normalize options → build data model → compute
   scales/layout → render. `chart.update(partial)` diffs and re-runs only the
   affected stages. Animation interpolates between retained models.

6. **Interactions ship by default:** crosshair + shared tooltip on line/area,
   per-mark tooltip on bar/scatter/pie, legend toggling, hover highlight with
   hit targets larger than the mark. All interaction is pointer-event based
   (mouse/touch/pen unified).

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

## Roadmap (post-v0.2)

- SVG + WebGL renderers, Angular & Solid wrappers, SSR snapshot rendering,
  image/PDF export, streaming data API, plugin system, visual regression
  harness.
