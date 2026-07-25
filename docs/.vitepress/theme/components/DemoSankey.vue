<script setup lang="ts">
/**
 * Sankey: the whole series IS the graph — `data: { nodes, links }` typechecks
 * directly (that is what `SeriesData` / `GraphData` are for; no cast).
 *
 * Nodes are laid out in layers, links are cubic ribbons at 0.45 alpha colored
 * by their source. The graph must be acyclic — a cycle is rejected with a clear
 * error rather than drawn as something plausible. Keyboard navigation walks one
 * flat sequence: each node, then that node's outgoing links.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'sankey',
  title: 'Signup to paid conversion',
  subtitle: 'Last quarter · width ∝ users',
  sankey: { nodeWidth: 16, nodePadding: 10, align: 'justify' },
  data: {
    series: [
      {
        id: 'flow',
        name: 'Users',
        data: {
          nodes: [
            { id: 'organic', label: 'Organic search' },
            { id: 'paid', label: 'Paid social' },
            { id: 'partner', label: 'Partners' },
            { id: 'signup', label: 'Signed up' },
            { id: 'trial', label: 'Started trial' },
            { id: 'bounced', label: 'Never returned' },
            { id: 'activated', label: 'Activated' },
            { id: 'stalled', label: 'Stalled in trial' },
            { id: 'paidplan', label: 'Paid plan' },
            { id: 'lapsed', label: 'Lapsed' },
          ],
          links: [
            { source: 'organic', target: 'signup', value: 4200 },
            { source: 'paid', target: 'signup', value: 2600 },
            { source: 'partner', target: 'signup', value: 1800 },
            { source: 'signup', target: 'trial', value: 5100 },
            { source: 'signup', target: 'bounced', value: 3500 },
            { source: 'trial', target: 'activated', value: 3100 },
            { source: 'trial', target: 'stalled', value: 2000 },
            { source: 'activated', target: 'paidplan', value: 1850 },
            { source: 'activated', target: 'lapsed', value: 1250 },
          ],
        },
      },
    ],
  },
  a11y: {
    description:
      'Of 8,600 signups, 5,100 started a trial and 3,500 never returned. 3,100 trials activated and 1,850 of those converted to a paid plan — 21% of all signups.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="420" />
</template>
