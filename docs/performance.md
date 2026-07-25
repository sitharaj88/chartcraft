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

`null` gaps are preserved, and your retained options keep every point —
`getOptions().data` still reports all 60,000 samples you passed.

::: warning What downsampling *does* affect
Downsampling happens on the way into the data **model**, not at the last drawing
step, so the retained points are what the chart reasons about: hover targets,
`PointEvent.dataIndex`, keyboard navigation, the accessibility **data table** and
therefore [`exportData()`](features/export.md) all describe the retained
(downsampled) points, not the raw array. A 60,000-point series at the default
threshold reports ~5,000 table rows.

That is a deliberate consequence of one model backing both the pixels and the
parallel DOM (they can never disagree), but it means the table is a faithful
description of *the chart*, not a full data dump. When exact values matter for
every sample, export from your own data source, or set
`downsample: { enabled: false }` on charts whose point counts are bounded.
:::

Live — 50,000 points; toggle downsampling and compare the render time:

<ClientOnly>
  <DemoLargeData />
</ClientOnly>

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

## Zoom and downsampling

These two features are designed to work together, and the interaction is the
reason zooming into a huge series is worth doing at all:

**For series above `downsample.threshold`, points are first sliced to the visible
window** (padded by one point on each side so lines still exit the plot edges),
**and only then LTTB'd — and only if the window still exceeds the threshold.**

The consequences:

- **Zooming reveals real detail.** You are not magnifying a downsampled picture:
  a 1M-point series windowed to 3,000 points draws every one of them. A spike that
  LTTB kept as one sample at full extent resolves into its actual shape.
- **The accessibility table follows the window too.** Zoom a 60,000-point series
  to one hour and the table (and `exportData()`) describe those ~120 points —
  keyboard users navigate exactly what is on screen, at the same fidelity.
- **Zoomed frames get cheaper, not dearer.** Fewer candidate points enter LTTB, so
  the deeper you zoom the less work each frame is.
- **Series below the threshold are never windowed or touched**, which keeps every
  pre-v0.3 render path byte-identical.
- The full-extent bounds used to clamp a gesture are captured from the layout
  whenever the chart is unzoomed, because the model's x-domain itself narrows to
  the window once a large series is windowed.

Two costs to know: each viewport change re-runs windowing + LTTB + layout (a
model-level pass, not a per-frame one — that is why a pan writes the viewport
during the gesture and emits its event once on release), and `zoom` on a chart
with `animation: true` will animate between windows. For huge series, pass
`animation: false` as the [zoom demo](features/zoom-pan-brush.md) does.

## Deterministic layouts

Three v0.3 types have layouts that would traditionally use `Math.random()`:
`wordcloud` (spiral placement), `circlepack` (Welzl's smallest enclosing circle)
and `network` (a force simulation). **None of them do.**

- Each uses one **seeded** generator (mulberry32); `network.fixedSeed` (default
  `1`) is the only knob, and the same graph plus the same seed always produces the
  same picture.
- The force simulation runs a **fixed iteration count to completion** — no
  `alphaMin` early exit, no `requestAnimationFrame` loop: simulate, then draw.
  Accumulation order is fixed everywhere (bodies in index order, quadtree
  quadrants NW/NE/SW/SE, links in input order), and coincident bodies are
  separated by an index-derived epsilon rather than a random jiggle. Repulsion is
  Barnes–Hut, O(n log n).
- The simulation runs in **abstract units** and is fitted to the plot afterwards,
  so a **resize re-fits the same graph** instead of computing a different one.
  Results are memoized under a structural key (bounded to 16 entries) purely to
  avoid recomputing on resize; the memo returns byte-identical values.

Why this belongs on a performance page: determinism is what makes these layouts
*testable* and *cacheable*. A layout that differs per render cannot be memoized
across resizes, cannot be snapshot-tested, and turns every bug report into "it
looked different on my machine".

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
   default threshold; see the [large-data example](examples/large-data.md).
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
