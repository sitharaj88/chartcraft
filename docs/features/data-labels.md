# Data labels

Values printed next to marks. The hard part is not drawing them — it is drawing
*few enough of them*, which is why selectivity is mandatory here and `'auto'`
measures every candidate and drops the ones that would collide.

Try the modes below; `'all'` on twelve months of two series is exactly the mess
`'auto'` exists to avoid.

<ClientOnly>
  <DemoDataLabels />
</ClientOnly>

## Enabling them

```ts
import { createChart } from '@chartcraft/core';

createChart(el, {
  type: 'line',
  data,
  dataLabels: true,                              // = { show: true, select: 'auto' }
});

createChart(el, {
  type: 'bar',
  data,
  dataLabels: { show: true, select: 'last', format: (p) => `$${p.formattedY}k` },
});
```

## `DataLabelOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `show` | `boolean` | `false` | Master switch. `dataLabels: true` / `false` is shorthand for this field. |
| `format` | `(point: TooltipPoint) => string` | the value, axis-formatted | Label text. Receives the same [`TooltipPoint`](../api/core.md#tooltippoint) the tooltip gets, so `formattedY` already respects your tick formatter. Returns **plain text**, not HTML. |
| `select` | `'auto' \| 'all' \| 'extremes' \| 'endpoints' \| 'last'` | `'auto'` | Which points get a label — see below. |
| `position` | `'outside' \| 'inside' \| 'auto'` | `'auto'` | `'auto'` prefers outside the mark and flips inside when the outside box would leave the plot. |

### `select` modes

| Mode | Candidates |
|---|---|
| `'auto'` (default) | endpoints ∪ extremes, then **collision-filtered** |
| `'all'` | every non-null datum, **no** collision filtering |
| `'extremes'` | the max and the min (first occurrence wins) |
| `'endpoints'` | first and last non-null |
| `'last'` | last non-null — the "label the current value" mode for sparkline-ish charts |

## How `'auto'` decides

Labels are **measured**, not estimated:

1. Candidates are the endpoints and the extremes of each series.
2. Each candidate's text box is measured and placed.
3. A candidate is **dropped** when its box leaves the plot or overlaps a box that
   has already been kept (2px clearance).
4. Ties are broken by a fixed priority — **max → min → last → first**, then
   candidate order (series order, then point order) — so the outcome is
   deterministic, not layout-dependent luck.

Collision filtering runs for `'auto'` only. `'all'` is the caller explicitly
asking for everything, overlaps included.

## Caveats

- **Cartesian types only.** Data labels apply to chart types that use the shared
  cartesian axes; radial, hierarchy, matrix, geo and graph types label their own
  marks (selectively) and ignore `dataLabels`.
- **Labels wear ink (`theme.textPrimary`), never the series color.** The mark
  carries the color; a colored label competes with it and fails contrast against
  the surface more often than not.
- **`'all'` will overlap.** That is not a bug — it is the mode's contract. If you
  want everything labeled, widen the chart or reduce the data.
- `format` returns plain text: there is no HTML escaping story here because there
  is no HTML.
- Labels are drawn in the `'over'` layer, above axis chrome, so a label near the
  plot edge is never occluded by a tick label.
- Data labels are implemented as a [decorator](../extensibility.md); nothing in a
  chart type knows about them.
