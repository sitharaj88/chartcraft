# Data model

Every ChartCraft chart is fed the same structure: a `ChartData` object holding
one or more **series**, optionally against a shared list of **categories**.

```ts
interface ChartData {
  categories?: (string | number | Date)[]; // band x-axis (bar, or line/area with category x)
  series: SeriesOptions[];
}
```

## Series

```ts
interface SeriesOptions {
  id?: string;                            // stable identity; defaults to name
  name: string;                           // legend & tooltip label (required)
  data: SeriesData;                       // DataValue[] — or a graph (see v0.3 below)
  color?: string;                         // override; otherwise palette slot by first-seen identity
  visible?: boolean;                      // default true; legend toggles this
  // line/area only:
  curve?: 'linear' | 'monotone' | 'step'; // default 'linear'
  lineWidth?: number;                     // default 2
  showMarkers?: boolean | 'auto';         // 'auto': markers when point count <= 60
  // v0.2:
  type?: SeriesKind;                      // combo: per-series mark override
  sizeRange?: [number, number];           // bubble: min/max marker diameter px
  // v0.3:
  errorBars?: ErrorBarOptions;            // uncertainty whiskers
  trendline?: TrendlineOptions;           // a fitted line, dashed and legend-labeled
  lowKey?: string; highKey?: string;      // range field names / dumbbell endpoint names
}
```

`name` is the only required field besides `data` — it is what the legend and
tooltip display. `curve`, `lineWidth`, and `showMarkers` apply to `line` and
`area` series only and are ignored elsewhere.

## The three `DataValue` shapes

```ts
type DataValue =
  | number | null                                  // y against categories/index (null = gap)
  | [number | Date, number | null]                 // [x, y] pair
  | { x?: number | Date | string; y: number | null; label?: string; color?: string };
```

### 1. Plain numbers — `number | null`

The simplest shape: each value is a y-value, positioned by the entry at the
same index in `data.categories` (or by its array index if no categories are
given). This is the natural shape for bar charts and category-based lines:

```ts
const data = {
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [{ name: 'Revenue', data: [12.4, 13.1, null, 16.2] }],
};
```

### 2. `[x, y]` pairs — `[number | Date, number | null]`

Each point carries its own x-position — a number or a `Date`. Use this for
scatter plots, time series, and any continuous x-axis. No `categories` needed:

```ts
const data = {
  series: [{
    name: 'CPU temperature',
    data: [
      [new Date('2026-07-01T00:00:00Z'), 41.2],
      [new Date('2026-07-01T01:00:00Z'), 39.8],
      [new Date('2026-07-01T02:00:00Z'), null],   // sensor offline
      [new Date('2026-07-01T03:00:00Z'), 40.5],
    ] satisfies [Date, number | null][],
  }],
};
```

### 3. Point objects — `{ x?, y, label?, color? }`

The most expressive shape. `y` is required; `x` is optional (falls back to
category/index positioning, and also accepts a `string` for per-point
category labels — the shape pie/donut slices use); `label` overrides the
tooltip/table label for that point; `color` overrides the color of that single
mark.

```ts
const data = {
  series: [{
    name: 'Browser share',
    data: [
      { x: 'Chrome', y: 64.1 },
      { x: 'Safari', y: 19.3 },
      { x: 'Edge', y: 5.4 },
      { x: 'Firefox', y: 3.1, label: 'Firefox (incl. forks)' },
      { x: 'Other', y: 8.1 },
    ],
  }],
};
```

The three shapes may not be what you already have — but they map directly:
rows of `{date, value}` become pairs; a keyed object becomes point objects;
parallel arrays become plain numbers plus `categories`.

## v0.2 data shapes

The 13 chart types added in v0.2 extend the same model rather than replacing
it — richer tuples, a superset of point-object fields, and two "raw input"
conventions:

- **`[x, y, r]` triples** (bubble): the third element is the size value,
  mapped to marker **area** via the series' `sizeRange`. Object form:
  `{ x, y, r }`.
- **`[x, o, h, l, c]` tuples** (candlestick/OHLC): open/high/low/close per
  x. Object form: `{ x, o, h, l, c }` — no `y` needed (it defaults to the
  close).
- **`TreeNode[]`** (treemap/sunburst, and v0.3's icicle/circlepack):
  `{ label, value?, color?, children? }`, nested; a parent's value defaults to
  the sum of its children. Since v0.3 `DataPoint` declares `value`, so a genuine
  `TreeNode[]` **needs no cast**.
- **Raw samples** (histogram/boxplot, and v0.3's violin): a histogram series is
  just `number[]` — the raw samples, binned by the chart. A boxplot or violin
  category is either a 5-number object
  (`{ min, q1, median, q3, max, outliers? }`, boxplot only) or a raw `number[]`,
  summarized by the chart. **Raw per-category arrays still need a TypeScript
  assertion** (`values as unknown as DataValue`): the union names only the
  2/3/5-element tuple shapes.

Waterfall points add `isTotal: true` to mark absolute totals among deltas.
Full field-by-field semantics: [`DataPoint`](../api/core.md#datapoint) in the
API reference, and each type's [example page](../examples/index.md).

## v0.3 data shapes

The 20 types added in v0.3 keep the same model. Three additions are worth
learning once:

### Range points — `{ x, low, high }`

A band, a dumbbell's two ends, a per-row bullet range and a gantt span are all
"this datum has two bounds":

```ts
const forecast = {
  categories: ['Jul', 'Aug', 'Sep'],
  series: [
    { name: '80% interval', data: [{ low: 4.28, high: 4.62 }, { low: 4.34, high: 4.86 }, { low: 4.39, high: 5.09 }] },
    { name: 'Forecast', data: [4.45, 4.6, 4.74] },
  ],
};
```

`[x, low, high]` triples work too — on range types a three-element tuple is read
as a range rather than as a bubble size. `SeriesOptions.lowKey`/`highKey` rename
the fields (`lowKey: 'p10'`), and on a dumbbell those names double as the
endpoint labels in the legend and table.

**Both bounds are required.** A datum with only one is a **gap**, not a half-band
— and a band run of a single point draws nothing, because a closed band needs two
x positions. `low` and `high` always join the value extent, so no range type needs
axis plumbing of its own.

### Graph data — `{ nodes, links }`

`sankey` and `network` are the two types whose whole series *is* the graph, so
`SeriesOptions.data` is widened to `SeriesData`:

```ts
type SeriesData = DataValue[] | GraphData;

interface GraphData {
  nodes: readonly { id?: string; label?: string; color?: string; group?: string; value?: number }[];
  links: readonly { source: string | number; target: string | number; value?: number;
                    label?: string; color?: string }[];
}
```

```ts
const flow = {
  series: [
    {
      name: 'Users',
      data: {
        nodes: [{ id: 'signup', label: 'Signed up' }, { id: 'trial', label: 'Started trial' }],
        links: [{ source: 'signup', target: 'trial', value: 5100 }],
      },
    },
  ],
};
```

Both members typecheck with **no cast**. `source`/`target` accept a node `id` or
a 0-based node index. A link naming a node that does not exist **throws** (a
silently dropped edge is a wrong picture), and a `sankey` cycle throws too.

::: tip These two types normalize your input
`sankey`, `gantt` and `network` rewrite their resolved `data` into one synthetic
series — marks in reading order, tasks in row order, each network node followed
by its own links — so every
mark has a real backing point and events, tooltips, focus and the a11y layer work
with no per-type special cases. Your objects are never mutated, but
`getOptions().data` reports the normalized form, and `PointEvent.dataIndex` is
that reading order.
:::

### Other v0.3 object fields

`target` (bullet), `start`/`end` (gantt spans), `group` (gantt swimlane, network
cluster, parallel class), `weight` (wordcloud, an alias of `y`), `eLow`/`eHigh`
(error-bar bounds) and `value` (hierarchy nodes). Everything is optional and
carried through normalization losslessly — see
[`DataPoint`](../api/core.md#datapoint).

Two shapes deserve a warning of their own:

- **`calendar` dates are UTC**, unconditionally. Build them with `Date.UTC(...)`
  or from `'YYYY-MM-DD'` strings, or the same datum will land in different cells
  in different time zones.
- **`parallel` series carry one value per dimension**, named by `parallel.axes`
  (or `categories`) — the array order *is* the axis order.

## Categories vs `[x, y]` pairs

Choose by what the x-axis *is*:

| | `categories` + plain numbers | `[x, y]` pairs / `{x, y}` objects |
|---|---|---|
| x-axis type | `category` (band scale) | `linear` or `time` (continuous), inferred |
| Spacing | every category equal width | positioned by value — uneven gaps show as uneven gaps |
| Best for | bar charts, discrete buckets (quarters, regions) | time series, measurements, scatter |
| Alignment across series | by index — series should be same length as `categories` | by x-value — series may have different lengths and x-positions |

A common mistake is plotting monthly timestamps as categories: it works, but
a missing month silently disappears instead of leaving a visible gap. If your
x-values are instants in time, use `Date` x-values and a time axis — missing
spans then look missing.

## Null means gap

`null` for `y` (in any of the three shapes) is an explicit statement: *there
is no value here*.

- In `line`/`area` series, the line **breaks** at the null — no interpolation
  across it. This is deliberate: bridging a gap fabricates data.
- In `bar`, no bar is drawn for that category.
- In the accessibility data table, the cell reads as empty, and keyboard
  navigation announces the gap rather than skipping it silently.
- Nulls are ignored when auto-computing axis min/max.

If you want zero, say `0`. If you want "unknown", say `null`. They render —
and read — very differently.

## Stable series identity

Every series has an identity: `id` if provided, otherwise `name`. Identity
drives three behaviors:

1. **Color assignment.** Palette slots are assigned by *first-seen identity*,
   in order — the first series ever seen gets slot 1, the second slot 2, and
   so on. An identity keeps its slot for the lifetime of the chart.
2. **Update matching.** On `chart.update`/`setData`, series with the same
   identity are diffed and animated in place; a new identity enters as a new
   series; a missing identity animates out.
3. **Legend toggling and events.** `legendtoggle` and all point events carry
   the `seriesId`.

### Why color follows identity, not rank

Consider three series — North (slot 1, blue), South (slot 2, orange), West
(slot 3, green). If a user filters out North and colors were assigned by
*position*, South would silently be repainted blue and West orange — every
color association the reader built is now wrong, and any external legend,
annotation, or memory of "South is the orange one" lies.

ChartCraft never does this. Filtering, toggling, or reordering series does not
repaint the survivors: **color belongs to the entity, not to its rank.**

Practical consequences:

- If your series list is dynamic, set explicit `id`s so identity survives
  renames (e.g. `{ id: 'region-south', name: 'South (updated)' }`).
- To hide a series, set `visible: false` (or let the user toggle it in the
  legend) rather than removing it from the array — the series keeps its
  color slot, stays in the legend (dimmed), and can be toggled back without
  you re-supplying its data.
- Beyond 8 identities, ChartCraft does not invent colors — see
  [Theming](theming.md#more-than-8-series) for the fold-to-"Other" rule.
