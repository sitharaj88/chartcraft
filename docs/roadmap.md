# Roadmap

Where ChartCraft goes next. Items are grouped by theme, not strictly
ordered; the [API contract](api-contract.md) governs every addition — each of
these lands as a contract change first, then core, then wrappers, then docs
(see `CONTRIBUTING.md` in the repository root).

## Shipped in 0.2

The chart-type items from the original roadmap landed in v0.2 — thirteen new
types plus combo (per-series mark mixing), for 19 total: bubble, sparkline,
histogram, boxplot, candlestick, OHLC, waterfall, heatmap, treemap, sunburst,
funnel, radar, and gauge. As promised, every one shipped with palette slots
by identity, a data-table representation, and full keyboard navigation — and
the financial types got their volume-pane story as a small multiple, not a
dual axis. See the [examples gallery](examples/index.md).

## Renderers

The `Renderer` interface exists precisely so these slot in without touching
chart code:

- **SVG renderer** — for print/export pipelines and style-by-CSS use cases
  (design systems that must restyle marks with stylesheets). Same visual
  spec; one retained node per mark, so intended for small/medium data.
- **WebGL renderer** — for the 1M+ point regime where Canvas 2D fill rate
  becomes the ceiling. Targets scatter and line first. Automatic renderer
  selection by data size is a possible follow-on once both exist.

## Frameworks

- **Angular wrapper** (`@chartcraft/angular`) and **Solid wrapper**
  (`@chartcraft/solid`) — same thin-wrapper contract as React/Vue/Svelte:
  lifecycle, resize observation, event bridging, nothing else. Feature
  parity comes from core, as always.

## Server-side & export

- **SSR snapshot rendering** — render a chart to markup/image on the server
  so the HTML payload contains real chart content (today, wrappers are
  SSR-safe but the chart appears at hydration). Also unlocks static-site and
  email use.
- **Image/PDF export** — first-class `toImage`/`toPDF`-style export built on
  the SVG renderer for vector-quality print output.

## Chart types

- The v0.1 chart-type wishlist (financial and statistical types) shipped in
  v0.2 — see [Shipped in 0.2](#shipped-in-0-2) above.
- Still open: **error bars** as a series decoration on cartesian types.
- Any future type follows the same rules: palette slots by identity, a
  data-table representation, and full keyboard navigation before it ships.

## Data

- **Streaming data API** — an append-oriented path (`appendData`-style)
  cheaper than `setData` for live feeds: no re-normalization of unchanged
  history, windowing, and downsample-aware appends.

## Extensibility

- **Plugin system** — a documented lifecycle-hook surface (annotations,
  custom overlays, exporters) so today's "reach for the `Chart` instance and
  the exported scales" patterns get a supported, versioned home.

## Quality infrastructure

- **Visual regression harness** — pixel-diff snapshots of every example and
  mark-spec fixture across themes and DPRs, wired into CI, so the visual
  quality bar in the contract is enforced by machines rather than reviewers'
  eyes.

## Non-goals

For clarity, some things stay out regardless of demand:

- **Dual y-axes** — two measures of different scale get two charts or an
  indexed common base ([why](concepts/scales-and-axes.md#one-y-axis-on-purpose)).
- **Runtime dependencies in core** — zero now, zero later.
- **Unvalidated palette growth** — no 9th categorical slot; beyond 8, design
  changes (fold to "Other", small multiples), not color generation.
