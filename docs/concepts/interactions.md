# Interactions

Interactions ship by default — tooltips, legend toggling, and hover highlight
are on unless you turn them off. All pointer handling is `PointerEvent`-based,
so mouse, touch, and pen all reach the same hit-testing and the same events —
but they are not the same gesture, and [Touch](#touch) documents where they
deliberately differ. Everything here also has a keyboard path; see
[Accessibility](../accessibility.md#keyboard-navigation).

## Tooltips

```ts
interface TooltipOptions {
  show?: boolean;
  shared?: boolean;    // default: true on line/area (crosshair, all series at x), false on bar/scatter/pie
  format?: (points: TooltipPoint[]) => string;     // returns HTML string
}

interface TooltipPoint {
  seriesId: string; seriesName: string; color: string;
  x: number | Date | string | null; y: number | null;
  formattedX: string; formattedY: string;
}
```

`tooltip: true` (the default) and `tooltip: false` are shorthands for
`{ show: true }` / `{ show: false }`.

### Shared crosshair vs per-mark

There are two tooltip modes, and the default depends on the chart type:

- **Shared crosshair** (`shared: true` — the default for `line` and `area`):
  a vertical crosshair tracks the pointer, snapping to the nearest x-position,
  and one tooltip lists **every visible series' value at that x**. This is the
  right reading model for time series — the question is almost always "what
  were all the lines doing at this moment?".
- **Per-mark** (`shared: false` — the default for `bar`, `scatter`, `pie`,
  `donut`): the tooltip describes the single mark under the pointer. Bars,
  points, and slices are discrete things; the question is "what is *this
  one*?".

Override the default when the reading model differs — e.g. a grouped bar
chart where users compare series within a category benefits from
`tooltip: { shared: true }`.

Hit targets are deliberately larger than the marks: nearest-point matching
within 24px for line/scatter, and the full column band for bars — nobody
should have to land a 2px line with a fingertip.

### Custom tooltip content

`format` receives the point(s) the tooltip describes — one `TooltipPoint` in
per-mark mode, one per visible series in shared mode — and returns an HTML
string:

```ts
createChart(el, {
  type: 'line',
  data,
  tooltip: {
    format: (points) => {
      const rows = points
        .map(
          (p) => `<tr>
            <td><span style="background:${p.color}" class="swatch"></span>${p.seriesName}</td>
            <td>${p.formattedY}</td>
          </tr>`,
        )
        .join('');
      return `<strong>${points[0].formattedX}</strong><table>${rows}</table>`;
    },
  },
});
```

Use `formattedX`/`formattedY` for display (they respect your axis tick
formatters) and the raw `x`/`y` for logic. The returned HTML is rendered
inside the tooltip container, which handles positioning: it follows the
pointer and never clips the viewport.

**Escape any user-provided strings** you interpolate into the returned HTML —
`format` output is injected as markup.

## Touch

A finger is not a small mouse. It never hovers, it hides the thing it is
pointing at, and the browser wants the same gesture in order to scroll the page.
Touch therefore gets its own path, and the mouse path is untouched by it.

| Gesture | What happens |
|---|---|
| Tap a mark | Hover is set, `pointenter` fires, the tooltip appears **above** the contact point, `pointclick` fires |
| Drag while touching | The tooltip scrubs along the data, exactly like moving a mouse |
| Lift the finger | The tooltip **stays** — it is only readable once the finger is out of the way |
| Tap another mark | Replaces the inspection |
| Tap outside the chart, or scroll | Dismisses it (`pointleave` fires) |
| Gesture cancelled by the OS | Hover, tooltip and any in-progress brush are dropped |

### Page scrolling still works

The canvas is `touch-action: pan-y`. **Vertical page scrolling over a chart is
never blocked** — charts are large on a phone, and a page that pins itself
wherever a chart sits under your thumb is a worse bug than a missing tooltip.
Everything else (taps, long presses, horizontal drags) reaches the chart, which
is exactly the axis a scrub, a brush and a pan need on a time-series chart.

It escalates to `touch-action: none` in two cases, both opt-in:

- `zoom` with `axis: 'y'` or `'xy'` **and** a drag gesture enabled — a vertical
  brush *is* a vertical drag, so it cannot coexist with `pan-y`;
- for the duration of a brush/pan drag, so a gesture that started horizontally is
  not stolen mid-drag when the finger wanders.

The value is recomputed on every `update()`, so turning zoom on or changing its
axis takes effect immediately.

### Bigger targets for a fingertip

The nearest-point hit radius is **24px for a mouse or stylus and 44px for a
finger** (the WCAG 2.1 target-size minimum). The choice is made **per event**
from `PointerEvent.pointerType`, not per device: a touchscreen laptop keeps full
mouse precision for its trackpad and gets finger-sized targets for its screen, in
the same session. Legend entries grow to a 44px minimum height when the primary
pointer is coarse.

## Legend toggling

```ts
interface LegendOptions {
  show?: boolean;
  position?: 'top' | 'bottom' | 'right';           // default 'top'
  interactive?: boolean;                            // click toggles series; default true
}
```

By default the legend is **auto**: shown when there are 2+ series, hidden for
a single series (the chart title names it). `legend: true` / `legend: false`
force it on or off; an object configures it.

For `pie` and `donut` charts the legend lists **slices** instead — each item
shows the slice's label next to its color, so slice identity never relies on
color alone. Auto keys off the slice count (shown for 2+ slices), and slice
items are not click-toggleable.

With `interactive: true` (default), clicking a legend item toggles that
series' `visible` flag. Toggling:

- re-renders with animation (axes may rescale to the remaining data),
- **does not repaint the remaining series** — color follows identity
  ([why](data-model.md#why-color-follows-identity-not-rank)),
- keeps the toggled-off item in the legend, dimmed, so it can be toggled back,
- emits a `legendtoggle` event,
- is reflected in `getOptions()` (the series' `visible` field), and mirrored
  to the accessibility layer.

Legend items are real buttons: focusable, Enter/Space-activatable, and
labeled for assistive tech. Legend text renders in ink colors — the swatch
carries the series color.

```ts
createChart(el, {
  type: 'line',
  data,
  legend: { position: 'bottom', interactive: true },
});
```

## Zoom, pan and brush

Off by default; `zoom: true` (or a [`ZoomOptions`](../api/core.md#zoomoptions)
object) turns it on for **continuous** axes:

```ts
createChart(el, {
  type: 'line',
  data,
  xAxis: { type: 'time' },
  zoom: { enabled: true, axis: 'x', minSpan: 60_000 },
});
```

| Input | Action |
|---|---|
| Drag (unzoomed) | Brush a region, zoom on release — mouse **or finger** |
| Drag (zoomed) | Pan; `Shift`+drag brushes instead |
| ctrl/⌘ + wheel | Zoom about the pointer |
| Double-click | Reset |
| `Escape` | Reset when zoomed; otherwise clears datum focus |
| `+` / `-` | Zoom in / out about the window center |
| `Shift` + arrows | Pan by 10% of the visible span |

A finger drag brushes and pans like a mouse drag. The gesture takes **pointer
capture**, so it survives the finger leaving the canvas, and it claims both
scroll axes for its duration (see [Touch](#touch)). A `pointercancel` — the OS
taking the gesture away — **aborts** a brush rather than zooming to a region the
user never finished drawing.

`chart.zoomTo(range)` is the programmatic path and `null` resets; the
[`zoom` event](#event-notes) reports every completed gesture. Band (category)
axes ignore the viewport entirely — windowing a band scale would desynchronize
band indices from `categories`, which tick labels, hit-testing and the data table
all address by index.

### Why plain arrow keys never pan

v0.1 binds the arrow keys to keyboard **point navigation**, and v0.3 needed "pan
when zoomed". Accessibility wins that conflict, deliberately:

- **plain `←` `→` `↑` `↓` always navigate points**, zoomed or not, and are never
  intercepted;
- **`Shift`+arrow pans** — and only when zoom is enabled, a viewport is active,
  `pan` is on, and that arrow's axis is actually zoomable. Otherwise the key
  falls through untouched;
- **`Escape` is two-stage:** it resets the zoom when zoomed, and otherwise falls
  through to clear the focused datum.

Claimed keys are intercepted in the **capture phase** on the chart root, so the
canvas's own handler never sees them and focus can never move behind a pan.
Everything else reaches the canvas exactly as before. Full behavior:
[Zoom, pan & brush](../features/zoom-pan-brush.md).

## Annotations are clickable

When [annotations](../features/annotations.md) are present they are hit-tested
**before** data points and **consume** the click — `annotationclick` fires and no
`pointclick` follows. Tolerances: 4px around a reference line, 8px around a point
dot, the measured text box for text, the rectangle for a band; marks beat bands
and later entries beat earlier ones.

## The events API

Try it live — click a point (or `Tab` to the chart and press `Enter`) and
watch the `pointclick` payloads land in the log:

<ClientOnly>
  <DemoEvents />
</ClientOnly>

```ts
interface ChartEventMap {
  pointenter: PointEvent;   // pointer or keyboard focus enters a datum
  pointleave: PointEvent;
  pointclick: PointEvent;   // click / Enter on focused datum
  legendtoggle: { seriesId: string; visible: boolean };
  render: { reason: 'init' | 'update' | 'resize' | 'toggle' };
  destroy: Record<string, never>;
  // v0.3
  zoom: { x?: [number, number]; y?: [number, number] } | null;   // null = reset
  annotationclick: { index: number; annotation: Annotation };
}

interface PointEvent {
  seriesId: string; seriesName: string;
  dataIndex: number;
  x: number | Date | string | null; y: number | null;
  clientX: number; clientY: number;   // -1 for keyboard-originated events
  native: Event | null;
}
```

`Chart.on` is fully typed — the handler's payload type follows the event
name — and **returns an unsubscribe function**:

```ts
const chart = createChart(el, { type: 'scatter', data });

const offClick = chart.on('pointclick', (ev) => {
  openDetailPanel(ev.seriesId, ev.dataIndex);
});
const offToggle = chart.on('legendtoggle', ({ seriesId, visible }) => {
  analytics.track('series_toggled', { seriesId, visible });
});

// Cleanup: call the unsubscribers (idiomatic), or use chart.off
offClick();
offToggle();
```

### The unsubscribe pattern

Prefer holding the returned function over `chart.off(type, handler)` — it
saves you keeping a reference to the exact handler and composes cleanly with
framework disposal hooks:

```ts
// e.g. inside any setup/teardown pairing
const subscriptions = [
  chart.on('pointenter', onEnter),
  chart.on('pointleave', onLeave),
];
const dispose = () => subscriptions.forEach((off) => off());
```

`chart.off` exists for the cases where an external system hands you handlers
to detach. `chart.destroy()` removes all remaining listeners — but freeing
your own references at the natural scope boundary is still good hygiene.

### Event notes

- `pointenter`/`pointleave`/`pointclick` fire for **keyboard** interaction
  too (arrow-key focus, Enter). Keyboard-originated events have
  `clientX === -1 && clientY === -1` and may have `native: null` — handle
  both origins if you position UI from the event.
- `render` fires after each committed render with the `reason`; useful for
  synchronizing overlays or measuring.
- `zoom` fires **once per completed gesture** — a pan writes the viewport
  silently while you drag and emits on release — and only when the window
  actually changed. Zooming all the way out emits `null`, because any axis
  spanning its full data bounds is dropped from the viewport.
- `annotationclick` consumes the click, so no `pointclick` follows it.
- `dataIndex` is the type's natural **mark** index, which is not always a data
  index: a bin for a histogram, a depth-first node for hierarchies, a rank for
  wordcloud and network, a row for bullet and gantt. See the caveat under
  [`PointEvent`](../api/core.md#pointevent).
- `destroy` fires once, last. No events fire after it.
- Handlers run synchronously; keep them cheap (especially `pointenter` during
  pointer moves) or debounce your side effects.
