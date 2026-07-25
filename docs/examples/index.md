---
aside: false
outline: false
---

# Every chart type, live

Every card below is a **real ChartCraft chart**, rendered by this site with
`@chartcraft/vue` — toggle the site's dark mode and watch all of them follow.
They are miniatures on purpose: no legend, no tooltip, no animation, so the
*shape* of each type is the whole message. Click one for the full chart, the
exact source in vanilla TypeScript and Vue, and that type's real caveats.

**39 chart types**, plus per-series mark mixing (the `Combo` card, which is not
a separate type). Each example page is opinionated about when *not* to use its
type — picking the wrong form is the most expensive mistake in data
visualization, and no amount of rendering quality fixes it.

<ClientOnly>
  <GalleryGrid />
</ClientOnly>

## Cross-cutting features

These are not chart types — they decorate the ones above, and each composes
with all 39:

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
none of the example pages turn anything on, and all 39 types ship a data table
too. (The miniatures above are the one exception: they are decorative previews
inside links, so their tables and tab stops are off. The chart on each example
page has them all.) See [Accessibility](../accessibility.md) and
[Interactions](../concepts/interactions.md).
