# Interactions

Interactions ship by default — tooltips, legend toggling, and hover highlight
are on unless you turn them off. All pointer handling is `PointerEvent`-based,
so mouse, touch, and pen behave identically. Everything here also has a
keyboard path; see [Accessibility](../accessibility.md#keyboard-navigation).

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

## The events API

```ts
interface ChartEventMap {
  pointenter: PointEvent;   // pointer or keyboard focus enters a datum
  pointleave: PointEvent;
  pointclick: PointEvent;   // click / Enter on focused datum
  legendtoggle: { seriesId: string; visible: boolean };
  render: { reason: 'init' | 'update' | 'resize' | 'toggle' };
  destroy: Record<string, never>;
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
- `destroy` fires once, last. No events fire after it.
- Handlers run synchronously; keep them cheap (especially `pointenter` during
  pointer moves) or debounce your side effects.
