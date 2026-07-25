# Export

Two methods on the chart instance: `exportImage()` for a raster (or vector, when a
vector renderer is available) and `exportData()` for the numbers.

The important property of `exportData()` is that it emits **exactly the accessible
table's contents** — one table spec backs the DOM table, the screen-reader
experience and the CSV, so they can never disagree.

<ClientOnly>
  <DemoExport />
</ClientOnly>

## `exportImage(opts?)`

```ts
exportImage(opts?: { format?: 'png' | 'svg'; scale?: number; background?: string }): Promise<Blob>;
```

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'png' \| 'svg'` | `'png'` | `'svg'` re-renders through the SVG renderer path **if the build has one**; this build ships the canvas renderer only, so it rejects (see caveats). |
| `scale` | `number` | `2` | Device-pixel multiplier. Clamped to `[0.1, 8]` — an unclamped scale is a trivial way to run a tab out of memory. |
| `background` | `string` | theme surface | Background fill. Pass a color for a chart that will land on paper or in an email. |

```ts
const blob = await chart.exportImage({ format: 'png', scale: 2 });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'revenue.png';
a.click();
URL.revokeObjectURL(url);
```

## `exportData(opts?)`

```ts
exportData(opts?: { format?: 'csv' | 'json' }): string;
```

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'csv' \| 'json'` | `'csv'` | Serialization. Both carry the same content. |

**CSV dialect** (locked by tests): a header row from the table's columns, then one
row per table row with the row-header cell first. RFC 4180 quoting — a field
containing `,`, `"`, CR or LF is quoted and `"` is doubled. Rows are `\n`-separated
with **no trailing newline**; ragged rows are padded to the column count.

**JSON shape:**

```json
{
  "columns": ["Quarter", "Platform", "Analytics", "Services"],
  "rows": [
    { "Quarter": "Q1", "Platform": "12.4", "Analytics": "4.1", "Services": "2.6" }
  ]
}
```

Every cell is a **string** — the export mirrors the table, and a table cell is
formatted text (your `ticks.format` included). Pretty-printed with a 2-space
indent, no trailing newline.

## Caveats

- **`format: 'svg'` rejects in this build** with a message containing
  **"SVG renderer not available"**. The `Renderer` seam exists and an SVG renderer
  is on the [roadmap](../roadmap.md); until then, handle the rejection.
- **The export paints the TARGET frame**, never a mid-animation interpolation, so
  an export taken during an animation shows the final geometry.
- **Decorations and decorators appear in the image exactly as on screen — except
  anything that needs the live DOM.** The export renders offscreen and hands
  decorators a context whose `host` is `null`, so no brush rectangle (or other
  interaction state) can leak into a PNG.
- **Encoding**: `canvas.toBlob` is preferred, with a `toDataURL` fallback; when
  neither is available the promise rejects with an explicit environment message
  (headless environments without a canvas implementation, for example).
- **`exportData()` includes what the table includes** — which is more than "the
  series you passed": error-bar `± low`/`± high` columns, a streamgraph's `Total`
  column, a marimekko's width shares, choropleth features with `no data`,
  unmatched choropleth rows, and a sankey's indented link rows all appear, because
  they are all in the one table spec. It does **not** include annotations, which are
  context rather than data.
- **Hidden series** follow the table: toggling a series off in the legend changes
  what the table (and therefore the export) contains.
- **`exportData()` is not a raw-data dump.** Because it mirrors the table, it
  describes the points the chart actually retained: a series above
  `downsample.threshold` exports its **downsampled** points (~5,000 rows for
  60,000 samples), and a zoomed chart exports only the visible window. Export from
  your own data source when you need every raw sample, or disable downsampling.
- `a11y: { table: 'off' }` removes the DOM table but `exportData()` still works —
  the spec is built either way.
- Both methods need a mounted chart; call them after mount (in a framework wrapper,
  reach the instance through the `ref`/`chart` handle).
