<script setup lang="ts">
/**
 * Choropleth: the topology is ALWAYS caller-supplied — ChartCraft bundles no
 * atlas and never fetches one. This demo therefore embeds a tiny synthetic
 * FeatureCollection (seven rectangular sales territories) inline, which is also
 * the honest way to keep a docs page dependency-free.
 *
 * `featureKey` (default 'name') is matched EXACTLY against each datum's
 * `label ?? x`. 'Isle of Kerr' deliberately has no datum, so it renders in the
 * gridline color and appears in the a11y table as `no data`.
 */
import type { ChartOptions, GeoFeatureCollection } from '@chartcraft/vue';

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
      geometry: {
        type: 'Polygon',
        coordinates: [[[6, 40], [12, 41], [12, 44], [6, 44], [6, 40]]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Isle of Kerr' },
      geometry: { type: 'Polygon', coordinates: [[[13.2, 41], [15, 41.4], [14.6, 43], [13.2, 42.6], [13.2, 41]]] },
    },
  ],
};

const options: Omit<ChartOptions, 'theme'> = {
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
};
</script>

<template>
  <ChartDemo :options="options" :height="420" />
</template>
