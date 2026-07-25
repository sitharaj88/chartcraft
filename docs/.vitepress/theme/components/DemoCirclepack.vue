<script setup lang="ts">
/**
 * Circle packing: leaves filled, parents outlined in their own color (so the
 * palette rules hold for the outline too), nested by enclosure. Labels appear
 * only on leaves where the FULL term fits the chord — a circle has no good
 * ellipsis story, so an over-long label is dropped rather than truncated.
 *
 * The pack is deterministic: the only randomized step (Welzl's smallest
 * enclosing circle) runs off a seeded generator, never `Math.random()`.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'circlepack',
  title: 'Bundle composition',
  subtitle: 'Gzipped size by workspace and module, KB',
  data: {
    series: [
      {
        id: 'bundle',
        name: 'Bundle',
        data: [
          {
            label: 'app',
            children: [
              { label: 'routes', value: 64 },
              { label: 'views', value: 48 },
              { label: 'state', value: 22 },
              { label: 'forms', value: 31 },
            ],
          },
          {
            label: 'design-system',
            children: [
              { label: 'components', value: 58 },
              { label: 'icons', value: 36 },
              { label: 'tokens', value: 8 },
            ],
          },
          {
            label: 'charts',
            children: [
              { label: 'core', value: 42 },
              { label: 'types', value: 27 },
              { label: 'a11y', value: 11 },
            ],
          },
          {
            label: 'vendor',
            children: [
              { label: 'router', value: 19 },
              { label: 'i18n', value: 26 },
              { label: 'date', value: 14 },
            ],
          },
        ],
      },
    ],
  },
  a11y: {
    description:
      'The app workspace is the largest at 165 KB gzipped, followed by the design system at 102 KB, charts at 80 KB and vendor libraries at 59 KB. The single biggest module is app routes at 64 KB.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="400" />
</template>
