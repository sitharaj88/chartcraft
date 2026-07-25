# Performance

ChartCraft is designed to stay predictable from 10 points to a million. This
page explains the architecture choices behind that, the knobs you control,
and how to measure.

## Why canvas

The core renders to a single Canvas 2D surface (per chart) behind a
`Renderer` interface. The rationale:

- **Predictable cost at scale.** SVG creates one retained DOM node per mark;
  at 10k+ points, layout, style recalculation, and memory dominate. Canvas
  draw cost is proportional to what you draw, with no retained per-mark
  objects.
- **One draw surface** means one compositing layer and no DOM diffing on
  update — the retained model diff decides *what* to redraw, and the canvas
  just redraws it.
- **Crisp at any DPI.** The canvas is sized in device pixels
  (devicePixelRatio-aware), so hairlines are hairlines on a 4k display.
- The `Renderer` interface keeps the door open: an SVG renderer
  (print/export, style-by-CSS) and a WebGL renderer (1M+ points) are on the
  [roadmap](roadmap.md) and slot in without touching chart code.

Costs of the choice — an opaque bitmap for assistive tech and no CSS styling
of marks — are paid deliberately: the [parallel DOM layer](accessibility.md)
covers the first, themes the second.

Interaction redraws (crosshair, hover highlight) can be layered onto a
separate offscreen canvas when redraw cost demands it, so moving the pointer
never re-renders the data layer.

## No allocation in the hot path

The render loop performs no per-frame allocation — no closures, no arrays,
no objects created while drawing. Large series take typed-array paths
internally. This is invisible in the API but is why long-running dashboards
don't accumulate GC pauses.

What it implies for you: passing fresh `data` arrays into `update` is fine
(that's an update, not a frame), but avoid calling `update` at animation
frequency yourself — see below.

## LTTB downsampling

Beyond a threshold, ChartCraft automatically downsamples `line`, `area`, and
`scatter` series before rendering using **LTTB (Largest-Triangle-Three-
Buckets)** — the standard algorithm for visual downsampling. LTTB picks, per
bucket, the point forming the largest triangle with its neighbors, which
preserves the visual shape of the series: peaks, troughs, and outliers
survive; only visually redundant points are dropped.

```ts
downsample?: { enabled?: boolean; threshold?: number };
// default: { enabled: true, threshold: 5000 }  (line/area/scatter only)
```

Downsampling is render-side only: tooltips, events, the data table, and axis
extents work against your full data. `null` gaps are preserved.

### Tuning the threshold

The default of 5000 points per series is conservative — well below where
rendering strains, and above the width in pixels of any realistic plot (a
1600px-wide chart cannot *display* more than ~1600 distinct x-positions, so
5000 retained points is already oversampled for the eye).

- **Lower it (1000–2000)** for many charts on one page, low-end/mobile
  targets, or charts that update frequently.
- **Raise it** if your analysis genuinely benefits from more retained points
  on very wide plots — measure first.
- **Disable it** (`{ enabled: false }`) only when every point must be
  individually hit-testable at full fidelity and your point counts are
  bounded. With 100k+ raw points, disabling it mostly buys you slower frames,
  not more visible information.

The algorithm is exported for your own pipelines (e.g. downsampling before
network transfer):

```ts
import { downsampleLTTB } from '@chartcraft/core';
```

## `update()` vs recreate

Always prefer `chart.update(partial)` (or `setData`) over destroy-and-
recreate. `update` deep-merges, **diffs, and re-runs only the affected
pipeline stages**:

| Change | What re-runs |
|---|---|
| `title`, `subtitle` | text layout + draw — scales untouched |
| `data` values (same shape) | data model onward; scales only if extents moved |
| `theme` | resolve + draw — no data or scale work |
| axis `min`/`max`/`type` | scales, layout, draw |
| `type` | full rebuild of the model (the one case close to recreate cost) |

Recreating instead (`destroy()` + `createChart`) tears down and rebuilds the
canvas, parallel a11y DOM, and observers, replays the entry animation, and
loses interaction state (focused point, toggled series). Reserve it for
actually replacing the chart.

For streaming updates, batch: push into your buffer and call `setData` at a
sensible cadence (250–1000ms is plenty for dashboards), not per datum.
Renders are internally coalesced through `requestAnimationFrame`, so
back-to-back `update` calls in one tick cost one render — but each call still
pays normalization/diffing.

## Resize behavior

Charts observe their container with `ResizeObserver` and re-render on size
changes, coalesced through `requestAnimationFrame` — continuous resizes
(dragging a panel splitter) render at most once per frame. Layout and scales
re-run; the data model does not.

- Give the container a real size (CSS or `width`/`height` options). A
  0-height container renders nothing — the classic "my chart is blank" bug.
- `chart.resize()` exists for the rare layouts `ResizeObserver` can't see
  (e.g. a `display: none` tab panel becoming visible in some environments) —
  call it after the container becomes measurable.
- Fixed `width`/`height` options opt out of responsiveness and skip observer
  work entirely — appropriate for server-rendered thumbnails or grids of many
  small multiples.

## Large-data tips

1. **Let downsampling work.** 100k-point series render smoothly at the
   default threshold; see `examples/large-data.html`.
2. **One chart, not thirty series.** Above ~8 series, color stops
   distinguishing (the palette folds to "Other" for a reason) and per-series
   cost stacks. Small multiples read better and render cheaper.
3. **Batch streaming updates** (above). Never `update` inside a
   `pointermove` or scroll handler.
4. **Numbers over Dates for very large series.** A million `Date` objects is
   a million heap allocations before the chart sees them; pairs of epoch
   numbers with a `time`-typed axis are far lighter (pass
   `xAxis: { type: 'time' }` explicitly in that case, and note numeric x
   otherwise infers a linear axis).
5. **Keep tooltips default for huge scatter.** Custom `format` functions run
   on every hover retarget; keep them allocation-light.
6. **Cap concurrent animation.** Entry animation on 50 charts at once is a
   thundering herd; consider `animation: false` for dashboard grids (users
   with `prefers-reduced-motion` already get this).

## Benchmark methodology

Benchmarks live in `packages/core/bench/` and run with `npm run bench`. When
you measure ChartCraft (please do, and file numbers with regressions):

- **Measure the pipeline stages, not just frames**: init (normalize + model +
  scales + layout + first render), `update` with same-shape data, `update`
  crossing the downsample threshold, resize, and hover retarget.
- **Report medians with sample counts**, warm (post-JIT) and cold separately;
  discard the first runs or report them as cold-start.
- **Fix the environment**: same browser build, plugged in, stable DPR,
  `animation: false` (or you're timing the easing function).
- **Realistic data**: monotonic time x-values with noise and nulls, not
  `Math.random()` clouds — LTTB cost and cache behavior differ.
- Watch allocation, not just time: a steady-state dashboard should show a
  flat sawtooth in the heap profiler, no growth across updates.

Regressions in `npm run bench` are release blockers for core.
