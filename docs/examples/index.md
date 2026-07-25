# Examples

Every example on these pages is a **live ChartCraft chart**, rendered by this
site with `@chartcraft/vue` — toggle the site's dark mode and watch them
follow. Each page shows the chart first, then the exact source that produces
it, in vanilla TypeScript and Vue.

## Chart types

- [Line](line.md) — trends over time or ordered categories
- [Area](area.md) — stacked composition of a total
- [Bar](bar.md) — grouped and horizontal category comparison
- [Scatter](scatter.md) — two numeric dimensions per point
- [Pie & donut](pie.md) — part-to-whole shares with automatic slice legends

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
