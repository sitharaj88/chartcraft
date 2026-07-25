<script setup lang="ts">
/**
 * Network: `data: { nodes, links }` on the series (no cast — that is what
 * `GraphData` is for). Node radius is √value (area-true), node color comes from
 * `group`, and links are hairlines at 0.35 alpha.
 *
 * The force layout is DETERMINISTIC: a seeded phyllotaxis start, a fixed
 * iteration count, Barnes–Hut repulsion, no animation loop and no
 * `Math.random()` — simulate, then draw. The same graph always lands in the
 * same place, and a resize re-fits the same layout rather than producing a new
 * one. Keyboard navigation walks nodes by degree.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'network',
  title: 'Service dependency graph',
  subtitle: 'Node area ∝ requests per second · color = tier',
  network: { linkDistance: 46, charge: -260, iterations: 320, fixedSeed: 1 },
  data: {
    series: [
      {
        id: 'services',
        name: 'Services',
        data: {
          nodes: [
            { id: 'gateway', label: 'API gateway', group: 'Edge', value: 9800 },
            { id: 'web', label: 'Web app', group: 'Edge', value: 6400 },
            { id: 'mobile', label: 'Mobile BFF', group: 'Edge', value: 3100 },
            { id: 'auth', label: 'Auth', group: 'Core', value: 5200 },
            { id: 'billing', label: 'Billing', group: 'Core', value: 1400 },
            { id: 'catalog', label: 'Catalog', group: 'Core', value: 4300 },
            { id: 'orders', label: 'Orders', group: 'Core', value: 2600 },
            { id: 'search', label: 'Search', group: 'Core', value: 3800 },
            { id: 'notify', label: 'Notifications', group: 'Core', value: 900 },
            { id: 'pg', label: 'Postgres', group: 'Data', value: 7200 },
            { id: 'redis', label: 'Redis', group: 'Data', value: 8100 },
            { id: 'queue', label: 'Kafka', group: 'Data', value: 2200 },
            { id: 'warehouse', label: 'Warehouse', group: 'Data', value: 600 },
          ],
          links: [
            { source: 'web', target: 'gateway', value: 6 },
            { source: 'mobile', target: 'gateway', value: 3 },
            { source: 'gateway', target: 'auth', value: 5 },
            { source: 'gateway', target: 'catalog', value: 4 },
            { source: 'gateway', target: 'orders', value: 3 },
            { source: 'gateway', target: 'search', value: 4 },
            { source: 'orders', target: 'billing', value: 2 },
            { source: 'orders', target: 'notify', value: 1 },
            { source: 'billing', target: 'notify', value: 1 },
            { source: 'auth', target: 'pg', value: 4 },
            { source: 'auth', target: 'redis', value: 5 },
            { source: 'catalog', target: 'pg', value: 3 },
            { source: 'catalog', target: 'redis', value: 4 },
            { source: 'orders', target: 'pg', value: 3 },
            { source: 'orders', target: 'queue', value: 2 },
            { source: 'search', target: 'redis', value: 4 },
            { source: 'search', target: 'queue', value: 1 },
            { source: 'queue', target: 'warehouse', value: 1 },
            { source: 'notify', target: 'queue', value: 1 },
          ],
        },
      },
    ],
  },
  a11y: {
    description:
      'The API gateway is the highest-degree node, fanning out to auth, catalog, orders and search. Redis and Postgres are the busiest data services by request rate; the warehouse sits at the edge of the graph behind Kafka.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="440" />
</template>
