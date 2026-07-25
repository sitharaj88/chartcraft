# Zoom, pan & brush

Drag a region to zoom into it, ctrl/⌘+wheel to zoom about the pointer, drag to pan
once zoomed, `Shift`+arrows to pan from the keyboard, `Escape` or double-click to
reset.

The demo below draws 60,000 points. **Downsampling re-runs against the visible
window**, so every zoom step reveals detail that was not on screen a moment ago —
you are not magnifying a downsampled picture.

<ClientOnly>
  <DemoZoom />
</ClientOnly>

## Enabling it

```ts
import { createChart } from '@chartcraft/core';

const chart = createChart(el, {
  type: 'line',
  data,
  xAxis: { type: 'time' },
  zoom: { enabled: true, axis: 'x', minSpan: 10 * 60_000 },  // never below 10 minutes
});

chart.on('zoom', (range) => {
  // range is { x?: [number, number]; y?: [number, number] } | null  (null = reset)
  syncOtherChart(range);
});

chart.zoomTo({ x: [Date.UTC(2026, 4, 3), Date.UTC(2026, 4, 4)] });  // programmatic
chart.zoomTo(null);                                                 // reset
```

`zoom: true` is shorthand for `{ enabled: true }`.

## `ZoomOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Master switch. `zoom: true` / `false` is shorthand. |
| `axis` | `'x' \| 'y' \| 'xy'` | `'x'` | Which axes a gesture may zoom. |
| `wheel` | `boolean` | `true` | ctrl/⌘ + wheel zooms about the pointer. (Plain wheel always scrolls the page.) |
| `drag` | `boolean` | `true` | Dragging draws a brush rectangle and zooms on release. |
| `pan` | `boolean` | `true` | Once zoomed, a plain drag pans (and `Shift`+drag brushes again). |
| `minSpan` | `number` | none | Smallest zoomable **x** span, in data units (ms for a time axis). |

## Interaction map

| Input | Action |
|---|---|
| Drag (unzoomed) | Brush a region, zoom on release |
| Drag (zoomed) | **Pan**; `Shift`+drag brushes instead |
| ctrl/⌘ + wheel | Zoom about the pointer (0.8× in, 1.25× out) |
| Double-click | Reset |
| `Escape` | Reset when zoomed; otherwise falls through to clear datum focus |
| `+` / `=` | Zoom in about the window center |
| `-` / `_` | Zoom out about the window center |
| `Shift` + arrows | Pan by 10% of the visible span |
| Arrows (plain) | **Point navigation — never panning.** See below. |

### Why plain arrows never pan

The contract asks for "arrows pan when zoomed", and v0.1 already binds arrows to
keyboard point navigation. **Accessibility wins**: plain
`ArrowLeft/Right/Up/Down` always belong to point navigation, zoomed or not, and are
never intercepted. Panning is `Shift`+arrow, and is claimed only when zoom is
enabled, a viewport is active, `pan` is on, and the arrow's axis is actually
zoomable — otherwise the key falls through untouched.

Claimed keys are intercepted in the **capture phase** on the chart root, so the
canvas's own handler never sees them and the keyboard focus can never end up
behind a pan. Everything else reaches the canvas exactly as before. See
[Interactions](../concepts/interactions.md#zoom-pan-and-brush) and
[Accessibility](../accessibility.md#keyboard-navigation).

## Caveats

- **Continuous axes only.** Band (category) axes ignore the viewport entirely:
  windowing a band scale would desynchronize band indices from `categories`, which
  tick labels, hit-testing and the a11y table all address by index. A gesture on a
  band axis simply produces no window.
- **The viewport is instance state, not an option.** It does **not** appear in
  `getOptions()` — an options snapshot round-trips configuration, not scroll
  position. Supplying new `data` or a new `type` **resets** it, because the window
  is expressed in the previous data's units.
- **Events fire once per gesture.** A pan writes the viewport silently while you
  drag and emits a single `zoom` on release; brush release, wheel, keyboard zoom
  and every reset emit immediately — and only when the window actually changed.
- **Zooming all the way out is a reset:** any axis spanning its full data bounds is
  dropped from the viewport, and an empty viewport normalizes to `null`, so you get
  `zoom: null` rather than a viewport equal to the extent.
- **A drag shorter than 4px along a zoomed axis is a click, not a zoom** — so
  clicking a point still works with `drag` enabled.
- **`minSpan` is enforced on the x (data) axis only** — the contract defines it in
  x-span terms — by growing the window about the gesture's anchor and then clamping
  to the data bounds.
- **The brush rectangle never appears in an export.** It is live interaction state,
  and `exportImage()` paints through an offscreen renderer where the decorator sees
  no DOM host at all.
- While a gesture is in progress, pointer moves are captured, so hover and tooltip
  do not fight the drag.
- **Downsampling interacts deliberately**: points are sliced to the visible window
  (padded one point each side so lines exit the plot edges) and then LTTB'd only if
  the window still exceeds the threshold. Series below the threshold are never
  windowed. See [Performance](../performance.md#zoom-and-downsampling).
- **The data table follows the window.** Because windowing happens in the data
  model, the accessibility table, keyboard navigation and `exportData()` all
  describe the visible points — zoom a 60,000-point series to one hour and the
  table has ~120 rows. Keyboard users get the same fidelity as sighted ones, but
  an export taken while zoomed is not the whole series.
- Zoom is implemented as a [decorator](../extensibility.md), and it is the reason
  the `attach(host)` hook exists — all of its DOM listeners live there, so
  `chart.ts` contains no zoom interaction code at all.
