# Examples

Every example on these pages is a **live ChartCraft chart**, rendered by this
site with `@chartcraft/vue` — toggle the site's dark mode and watch them
follow. Each page shows the chart first, then the exact source that produces
it, in vanilla TypeScript and Vue, then the type's real caveats.

**39 chart types.** Each page is opinionated about when *not* to use its type —
picking the wrong form is the most expensive mistake in data visualization, and
no amount of rendering quality fixes it.

## Trends & comparison

- [Line](line.md) — trends over time or ordered categories
- [Area](area.md) — stacked composition of a total
- [Bar](bar.md) — grouped and horizontal category comparison
- [Scatter](scatter.md) — two numeric dimensions per point
- [Bubble](bubble.md) — scatter plus a size channel (value maps to area)
- [Lollipop](lollipop.md) — a bar chart's encoding with a fraction of the ink
- [Slope](slope.md) — two stages, direct labels, rank changes made obvious
- [Dumbbell](dumbbell.md) — before/after per category, where the gap is the point
- [Range area](rangearea.md) — a low–high band; with a line, the forecast chart

## Part-to-whole & composition

- [Pie & donut](pie.md) — part-to-whole shares with automatic slice legends
- [Funnel](funnel.md) — ordered stage drop-off with direct labels
- [Pyramid](pyramid.md) — two groups mirrored across shared bands
- [Marimekko](marimekko.md) — variable-width 100% columns: two proportions at once
- [Streamgraph](streamgraph.md) — composition over time on a wiggle-minimizing baseline

## Statistical

- [Histogram](histogram.md) — the distribution of raw samples, auto-binned
- [Boxplot](boxplot.md) — five-number summaries and outliers per category
- [Violin](violin.md) — the whole distribution shape, with the box inside it
- [Parallel coordinates](parallel.md) — multivariate records across independent axes

## Financial & targets

- [Candlestick & OHLC](candlestick.md) — open/high/low/close on a time axis
- [Waterfall](waterfall.md) — how deltas walk a value from start to total
- [Bullet](bullet.md) — value vs target vs qualitative ranges, one row per KPI

## Hierarchy

- [Treemap](treemap.md) — nested part-to-whole by area
- [Sunburst](sunburst.md) — hierarchy as rings, root total in the center
- [Icicle](icicle.md) — hierarchy as rows: the levels stay legible
- [Circle packing](circlepack.md) — nesting by enclosure (structure over precision)

## Matrix & calendar

- [Heatmap](heatmap.md) — a matrix of magnitudes on a sequential ramp
- [Calendar](calendar.md) — a day per cell: weekday and seasonal rhythm at once

## Radial

- [Radar](radar.md) — profiles compared across shared spokes
- [Gauge](gauge.md) — one value against a bounded range, with status bands
- [Radial bar](radialbar.md) — concentric arcs against a shared maximum
- [Rose](rose.md) — cyclical categories, sector **area** ∝ value

## Flow & schedule

- [Sankey](sankey.md) — where a conserved quantity goes, layer by layer
- [Gantt](gantt.md) — task spans on a real time axis, grouped into swimlanes

## Geographic & graph

- [Choropleth](choropleth.md) — regions shaded by value, from **your** GeoJSON
- [Network](network.md) — a deterministic force layout of nodes and links

## Micro, combo & text

- [Sparkline](sparkline.md) — chrome-free inline trends for stat tiles
- [Combo](combo.md) — per-series mark mixing (bars + a target line)
- [Word cloud](wordcloud.md) — decorative, and honest about it

## Cross-cutting features

These are not chart types — they decorate the ones above:

- [Error bars](../features/error-bars.md) — per-point uncertainty, in the domain,
  the tooltip and the table
- [Trendlines](../features/trendlines.md) — least squares, moving average,
  exponential
- [Data labels](../features/data-labels.md) — measured selectivity, colliding
  labels dropped
- [Annotations](../features/annotations.md) — reference lines, bands, points, text
- [Zoom, pan & brush](../features/zoom-pan-brush.md) — and how zooming reveals
  real detail in a million points
- [Export](../features/export.md) — PNG at any scale, CSV/JSON that mirrors the
  data table

## Showcases

- [Large data](large-data.md) — 50,000 points with an LTTB downsampling toggle
  and live render timing
- [Events](events.md) — a chart wired to a log panel via the `pointclick` event

## A note on interaction

Everything you can do with a pointer here you can also do with a keyboard:
`Tab` to a chart, walk points with the arrow keys, press `Enter` to activate.
Tooltips, legend toggling, and keyboard navigation ship enabled by default —
none of these examples turn anything on, and all 39 types ship a data table
too. See [Accessibility](../accessibility.md) and
[Interactions](../concepts/interactions.md).
