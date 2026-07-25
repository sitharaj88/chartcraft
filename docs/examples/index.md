# Examples

Every example on these pages is a **live ChartCraft chart**, rendered by this
site with `@chartcraft/vue` — toggle the site's dark mode and watch them
follow. Each page shows the chart first, then the exact source that produces
it, in vanilla TypeScript and Vue.

## Trends & comparison

- [Line](line.md) — trends over time or ordered categories
- [Area](area.md) — stacked composition of a total
- [Bar](bar.md) — grouped and horizontal category comparison
- [Scatter](scatter.md) — two numeric dimensions per point
- [Bubble](bubble.md) — scatter plus a size channel (value maps to area)

## Part-to-whole & stages

- [Pie & donut](pie.md) — part-to-whole shares with automatic slice legends
- [Funnel](funnel.md) — ordered stage drop-off with direct labels

## Statistical

- [Histogram](histogram.md) — the distribution of raw samples, auto-binned
- [Boxplot](boxplot.md) — five-number summaries and outliers per category

## Financial

- [Candlestick & OHLC](candlestick.md) — open/high/low/close on a time axis
- [Waterfall](waterfall.md) — how deltas walk a value from start to total

## Hierarchy & matrix

- [Treemap](treemap.md) — nested part-to-whole by area
- [Sunburst](sunburst.md) — hierarchy as rings, root total in the center
- [Heatmap](heatmap.md) — a matrix of magnitudes on a sequential ramp

## Radial

- [Radar](radar.md) — profiles compared across shared spokes
- [Gauge](gauge.md) — one value against a bounded range, with status bands

## Micro & combo

- [Sparkline](sparkline.md) — chrome-free inline trends for stat tiles
- [Combo](combo.md) — per-series mark mixing (bars + a target line)

## Showcases

- [Large data](large-data.md) — 50,000 points with an LTTB downsampling toggle
  and live render timing
- [Events](events.md) — a chart wired to a log panel via the `pointclick` event

## A note on interaction

Everything you can do with a pointer here you can also do with a keyboard:
`Tab` to a chart, walk points with the arrow keys, press `Enter` to activate.
Tooltips, legend toggling, and keyboard navigation ship enabled by default —
none of these examples turn anything on. See
[Accessibility](../accessibility.md) and
[Interactions](../concepts/interactions.md).
