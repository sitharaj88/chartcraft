# Extensibility: the decorator API

::: warning Experimental — may change in a minor release
This surface is still **experimental** as of v0.4. Four of its hooks were added
*during* v0.3 in response to real feature needs and more may follow, so the shape
is not settled. `registerDecorator` / `unregisterDecorator` / `decorators` /
`clearDecorators` and the `Decorator` interface are what may move.

It is documented and exported because the five built-in cross-cutting features
are built on it and the seams should be usable — not because the API is final.
**Pin your `@chartcraft/core` version if you ship a decorator.**
:::

## What a decorator is

A `Decorator` is a **type-agnostic overlay pass** that the pipeline walks for
every mounted chart. Error bars, trendlines, data labels, annotations and
zoom/pan/brush are all implemented as decorators, and they get no special
treatment: a chart type never knows any of them exist.

```ts
import { registerDecorator, unregisterDecorator, decorators, clearDecorators } from '@chartcraft/core';
import type { Decorator, DecoratorContext, DecoratorHost, DecorationLayer, Viewport } from '@chartcraft/core';
```

Two things a decorator is **not**:

- It is not a chart type. A decorator draws *over* or *under* whatever type is
  mounted; it cannot define marks, layout or a data shape.
- It is not per-chart. The list is **global to the build** — every mounted chart
  walks it, which is why `appliesTo` exists and why `attach` is the place for
  per-chart state.

Nothing is registered by default. With an empty list every pipeline stage behaves
exactly as it did in v0.2 (the five built-in features register themselves the
first time `createChart` runs).

## The interface

```ts
interface Decorator {
  readonly id: string;                  // stable; re-registering an id REPLACES it
  readonly layer: 'under' | 'over';     // beneath or above the type's marks
  readonly order?: number;              // ascending within a layer; ties keep registration order
  appliesTo?(ctx: DecoratorContext): boolean;
  draw(ctx: DecoratorContext): void;
  extendYDomain?(model, opts): [number, number] | null;
  legendItems?(ctx): LegendItem[];
  a11yTable?(ctx, spec): A11yTableSpec;
  tooltipPoints?(ctx, hit, points): TooltipPoint[];
  a11yDescription?(ctx): string | null;
  onClick?(ctx, px, py, native): boolean;
  attach?(host: DecoratorHost): (() => void) | void;
}
```

### Hook semantics

| Hook | When it runs | Semantics |
|---|---|---|
| `appliesTo` | Before `draw`, `legendItems`, `onClick`, `a11yTable`, `tooltipPoints` and `a11yDescription` | The cheap opt-out. Return `false` to skip this chart entirely. Keep it allocation-free — it runs per frame. |
| `draw` | Once per frame, in the decorator's layer | Paint through `ctx.r` (the `Renderer`), **never** the canvas API. Clip to `ctx.plot` yourself when the feature must not bleed into the margins. |
| `extendYDomain` | While the MODEL is built, **before scales exist** | The pipeline **unions** your range with the data extent; it never narrows. This is how error-bar whiskers land inside the value domain. Return `null` to leave the domain alone. |
| `legendItems` | When the legend is built | Items are appended **after** the type's own (a trendline must be legend-labeled so it can never read as observed data). Skipped for types that supply a custom legend element. |
| `a11yTable` | Between the type's `a11yTable` stage and **both** the DOM table and `exportData()` | There is exactly ONE table spec, so the table and the CSV/JSON export can never disagree. Return `spec` unchanged to opt out. |
| `tooltipPoints` | After the type's `tooltipPoints`, **before** `tooltip.format` | Enrich values (`"10 (8–12)"`) without wrapping the caller's formatter or mutating resolved options. |
| `a11yDescription` | When the description node is synced | Concatenated with `a11y.description` and the type's own description into ONE visually-hidden node and ONE `aria-describedby` token. Return `null` when there is nothing to say. |
| `onClick` | **Before** datum hit-testing, topmost-registered first | Return `true` to consume the click, suppressing `pointclick`. This is how `annotationclick` works. |
| `attach` | Once per chart instance, on mount | The returned function runs on `destroy`. **The only sanctioned place for DOM listeners.** |

### Paint order

```
surface → title/subtitle → grid → type's own 'under' decorations →
  under-decorators → the type's marks → axis chrome →
  type's own 'over' decorations → over-decorators
```

The `'over'` layer is drawn **last**, after axis chrome, so annotations, data
labels and the brush rectangle are never occluded by tick labels. Within a layer,
a type's own decorations always run before the global decorator list, and
decorators run in ascending `order`.

### `DecoratorContext`

Read-only. It carries `r` (the `Renderer`), `theme`, `opts` (resolved options),
`model`, `layout`, `plot`, `xScale`, `yScale`, `geom` (this frame's
animation-interpolated geometry), `hover`, `def` (the active chart type
definition — read `def.needs` to opt in or out), `viewport`, `emit` and `host`.

::: tip `host` is `null` on the export path
`exportImage()` paints through an **offscreen** renderer and hands decorators a
context whose `host` is `null`, so an export can never reach the live DOM — which
is exactly why no brush rectangle appears in an exported PNG. Treat a null host
as "draw only, touch nothing".
:::

### `DecoratorHost`

Passed to `attach`, created once per chart, with a **stable identity for the
chart's lifetime** — so keying per-chart state on it (in a `WeakMap`) is safe.

| Member | Purpose |
|---|---|
| `canvas` | The chart's canvas — attach pointer/wheel listeners here |
| `root` | The chart's root element (legend + canvas wrap + a11y nodes) |
| `el` | The container you passed to `createChart` |
| `context()` | A **fresh** context snapshot (call it; never cache it) |
| `requestRender()` | Repaint without re-running layout (coalesced through rAF) |
| `setViewport(v)` / `getViewport()` | Read/write the zoom window (re-runs downsampling, layout and paint) |
| `emit(type, ev)` | Emit a public chart event |

## A complete example: highlight the max point

A decorator that rings the highest point of every visible series, labels it, and
says so in the accessible description.

```ts
import { registerDecorator, unregisterDecorator } from '@chartcraft/core';
import type { Decorator } from '@chartcraft/core';

const RING_RADIUS = 9;

/** Index of the largest finite value in a model series, or -1. */
function argmax(values: readonly (number | null)[]): number {
  let best = -1;
  let bestValue = -Infinity;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    if (v > bestValue) {
      bestValue = v;
      best = i;
    }
  });
  return best;
}

export const highlightMax: Decorator = {
  id: 'example:highlight-max',
  layer: 'over',
  order: 50,

  // Cheap opt-out: cartesian charts with per-datum geometry only.
  appliesTo(ctx) {
    return ctx.def.needs.cartesianAxes && ctx.geom.pos.length > 0;
  },

  draw(ctx) {
    const { r, theme, model, geom, plot } = ctx;
    const font = `600 ${theme.fontSize}px ${theme.fontFamily}`;

    // Clip generously: the ring and its label may sit just outside the plot.
    r.clipRect(plot.x - 24, plot.y - 24, plot.w + 48, plot.h + 48, () => {
      model.series.forEach((s, si) => {
        if (!s.visible) return;
        const positions = geom.pos[si];
        if (!positions) return;

        const pi = argmax(s.points.map((p) => p.y));
        const at = pi >= 0 ? positions[pi] : null;
        if (!at) return;

        r.circle(at.x, at.y, RING_RADIUS, {
          stroke: { color: theme.textPrimary, width: 2 },
        });
        r.text(`max ${s.points[pi]?.y ?? ''}`, at.x, at.y - RING_RADIUS - 4, {
          font,
          color: theme.textPrimary,   // ink, never the series color
          align: 'center',
          baseline: 'bottom',
        });
      });
    });
  },

  // Screen-reader users get the same information, not a silent overlay.
  a11yDescription(ctx) {
    const peaks = ctx.model.series
      .filter((s) => s.visible)
      .map((s) => {
        const pi = argmax(s.points.map((p) => p.y));
        return pi >= 0 ? `${s.name} peaks at ${String(s.points[pi]?.y)}` : null;
      })
      .filter((t): t is string => t !== null);
    return peaks.length > 0 ? `${peaks.join('; ')}.` : null;
  },
};

// Register once, at module load time.
registerDecorator(highlightMax);

// …and, if your app tears the feature down:
unregisterDecorator('example:highlight-max');
```

Three details worth copying:

1. **Register at module load**, the way the built-in features and chart types do.
   `attach` runs when a chart mounts, so a decorator registered *after* a chart is
   already mounted will draw on that chart's next frame but never receive its host.
2. **Draw through `ctx.r`.** The `Renderer` interface (`line`, `path`, `rect`,
   `circle`, `sector`, `text`, `measure`, `clipRect`) is the only drawing API, which
   is what will let an SVG or WebGL renderer render your decorator unchanged.
3. **Ink colors for text.** The library's own rule: marks carry color, text
   carries ink.

## Registry functions

| Function | Behavior |
|---|---|
| `registerDecorator(d)` | Adds or **replaces** by `id`. Throws on a missing/empty `id`, an invalid `layer`, or a missing `draw`. |
| `unregisterDecorator(id)` | Removes one; returns `true` when something was removed. |
| `decorators(layer?)` | The registered list, sorted by `order` (stable within equal order). Pass a layer to filter. |
| `clearDecorators()` | Drops **everything**, including the five built-in features. Intended for tests and teardown. |

::: danger `clearDecorators()` disables the built-in features
Error bars, trendlines, data labels, annotations and zoom are ordinary
decorators. Clearing the list turns them off for every chart in the page until
something re-registers them (a new `createChart` call re-registers the builtins).
:::

## Rules a decorator must respect

- **Never mutate** the model, the layout or resolved options. The context is
  read-only, and `getOptions()` must keep round-tripping the caller's
  configuration.
- **No DOM outside `attach`.** Listeners belong to the lifecycle you can clean up;
  `draw` may run on an offscreen export renderer where there is no DOM at all.
- **Keep `draw` and `appliesTo` allocation-light** — they run every frame. The
  built-ins put their real work in pure, separately tested functions and let `draw`
  paint the result.
- **Say it accessibly too.** If your overlay carries information, contribute it
  through `a11yDescription` or `a11yTable`; a canvas-only overlay is invisible to
  half your audience.
- **Don't fake data.** A decorator that draws something which reads as a mark
  (solid lines, series-colored text) breaks the same rule trendlines and
  annotations follow: a derived thing must never be mistakable for an observation.
