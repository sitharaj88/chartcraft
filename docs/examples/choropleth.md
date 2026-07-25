# Choropleth

Map regions shaded by value. ChartCraft projects and draws whatever GeoJSON you
hand it — **the topology is always yours**: no atlas is bundled and none is ever
fetched, which keeps the core dependency-free and keeps you in control of
projection accuracy, simplification and licensing.

**Use it** when geography *is* the question: regional performance, coverage,
turnout, incidence rates.

**Don't use it** for count data over regions of wildly different size or
population — a choropleth of raw counts is a population map wearing a disguise;
normalize to a rate first. Don't use it when a bar chart of ten regions would
answer the question faster (it usually does — a map is expensive in pixels and
attention). And beware area bias: big rural regions shout, dense urban ones
whisper.

The demo below embeds a **tiny synthetic FeatureCollection** inline — seven
rectangular "territories" — which is also how to keep a docs page or a test
fixture self-contained. 'Isle of Kerr' deliberately has no datum, so it renders
in the gridline color.

<ClientOnly>
  <DemoChoropleth />
</ClientOnly>

::: code-group

```ts [Vanilla]
import { createChart } from '@chartcraft/core';
import type { GeoFeatureCollection } from '@chartcraft/core';

/** Synthetic topology: closed rings of [lon, lat] pairs. */
const territories: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Northmark' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 48], [6, 48], [6, 52], [2, 53], [0, 52], [0, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Easthaven' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[6, 48], [12, 48], [13, 51], [10, 52.5], [6, 52], [6, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Westford' },
      geometry: { type: 'Polygon', coordinates: [[[0, 44], [6, 44], [6, 48], [0, 48], [0, 44]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Midvale' },
      geometry: { type: 'Polygon', coordinates: [[[6, 44], [12, 44], [12, 48], [6, 48], [6, 44]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Southgate' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 40], [6, 40], [6, 44], [0, 44], [-0.5, 42], [0, 40]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Portsea' },
      geometry: { type: 'Polygon', coordinates: [[[6, 40], [12, 41], [12, 44], [6, 44], [6, 40]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Isle of Kerr' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[13.2, 41], [15, 41.4], [14.6, 43], [13.2, 42.6], [13.2, 41]]],
      },
    },
  ],
};

const chart = createChart(document.querySelector<HTMLElement>('#chart')!, {
  type: 'choropleth',
  title: 'Revenue per territory',
  subtitle: 'Synthetic topology · $ thousands',
  choropleth: {
    geojson: territories,
    projection: 'equirectangular',
    featureKey: 'name',
    unmatched: 'warn',
  },
  data: {
    series: [
      {
        id: 'revenue',
        name: 'Revenue',
        data: [
          { x: 'Northmark', y: 412 },
          { x: 'Easthaven', y: 286 },
          { x: 'Westford', y: 194 },
          { x: 'Midvale', y: 341 },
          { x: 'Southgate', y: 128 },
          { x: 'Portsea', y: 233 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Northmark leads at $412k, followed by Midvale ($341k) and Easthaven ($286k). Southgate is the weakest territory at $128k, and Isle of Kerr has no data.',
  },
});
```

```vue [Vue]
<script setup lang="ts">
import { ChoroplethChart } from '@chartcraft/vue';
import type { GeoFeatureCollection, TypedChartOptions } from '@chartcraft/vue';

const territories: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Northmark' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 48], [6, 48], [6, 52], [2, 53], [0, 52], [0, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Easthaven' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[6, 48], [12, 48], [13, 51], [10, 52.5], [6, 52], [6, 48]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Westford' },
      geometry: { type: 'Polygon', coordinates: [[[0, 44], [6, 44], [6, 48], [0, 48], [0, 44]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Midvale' },
      geometry: { type: 'Polygon', coordinates: [[[6, 44], [12, 44], [12, 48], [6, 48], [6, 44]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Southgate' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 40], [6, 40], [6, 44], [0, 44], [-0.5, 42], [0, 40]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Portsea' },
      geometry: { type: 'Polygon', coordinates: [[[6, 40], [12, 41], [12, 44], [6, 44], [6, 40]]] },
    },
    {
      type: 'Feature',
      properties: { name: 'Isle of Kerr' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[13.2, 41], [15, 41.4], [14.6, 43], [13.2, 42.6], [13.2, 41]]],
      },
    },
  ],
};

const options: TypedChartOptions = {
  title: 'Revenue per territory',
  subtitle: 'Synthetic topology · $ thousands',
  choropleth: {
    geojson: territories,
    projection: 'equirectangular',
    featureKey: 'name',
    unmatched: 'warn',
  },
  data: {
    series: [
      {
        id: 'revenue',
        name: 'Revenue',
        data: [
          { x: 'Northmark', y: 412 },
          { x: 'Easthaven', y: 286 },
          { x: 'Westford', y: 194 },
          { x: 'Midvale', y: 341 },
          { x: 'Southgate', y: 128 },
          { x: 'Portsea', y: 233 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Northmark leads at $412k, followed by Midvale ($341k) and Easthaven ($286k). Southgate is the weakest territory at $128k, and Isle of Kerr has no data.',
  },
};
</script>

<template>
  <ChoroplethChart :options="options" style="height: 420px" />
</template>
```

:::

## Notes

- **Matching is EXACT** — no trimming, no case folding, no fuzzy matching —
  between the GeoJSON property named by `choropleth.featureKey` (default
  `'name'`) and each datum's `label ?? x`. The key is looked up in
  `properties[key]`, then on the feature itself, then (for `'id'`)
  `feature.id`.
- **A data row that matches no feature follows `choropleth.unmatched`:**

  | value | behavior |
  |---|---|
  | `'warn'` (default) | The row is not shaded but it *is* reported: one structured `console.warn` naming up to five unmatched labels, the key used and the feature count, **plus** a sentence in the chart's accessible description. Warned once per distinct diagnostic, not once per frame. |
  | `'strict'` | Throws with the same message. For CI and data pipelines, where a typo'd region must fail the build rather than ship a plausible-looking map. |
  | `'omit'` | Silent. For deliberately partial datasets. |

  Under **every** policy the row keeps its a11y table entry, so `exportData()`
  still carries every datum.
- **Features with no datum** are always filled `theme.gridline`, are **not
  hoverable** (there is no datum to report), and are appended to the a11y table
  as `no data` rows. One datum may color several features sharing a key (islands
  of one country); a feature matches at most one datum.
- **Only area geometry is drawn.** `Polygon`, `MultiPolygon` and the
  Polygon/MultiPolygon members of a `GeometryCollection` render; `Point`,
  `MultiPoint`, `LineString`, `MultiLineString` and null geometries are skipped
  silently — a choropleth colors areas, and a geometry with no area has no fill to
  carry a value.
- **Projections:** `'mercator'`, `'equirectangular'`, `'albersUsa'`,
  `'orthographic'`, fitted to the plot. Known simplifications: `albersUsa`
  selects its Alaska/Hawaii panes by lon/lat boxes (anything outside them,
  including Puerto Rico, is projected with the lower-48 conic rather than
  dropped); antimeridian rings are **unwrapped, never split**, so a whole-world
  topology may extend slightly past ±180 and widen the fitted bounds;
  `orthographic` truncates rings at the horizon with a chord rather than
  interpolating the limb, and far-side features are skipped but keep their table
  row and keyboard slot.
- **Winding is normalized by the library** (exterior positive, holes negative)
  because real-world files routinely get RFC 7946 winding wrong. A polygon whose
  rings genuinely overlap (invalid GeoJSON) can still fill oddly.
- The gradient scale legend shows **even for a single series** — it is the only
  key to what the fills mean. Keyboard navigation walks features in data order.
- Parsed features are memoized on the `geojson` object identity plus the
  `featureKey`, so passing a stable topology object keeps updates cheap even for a
  multi-megabyte world file.
