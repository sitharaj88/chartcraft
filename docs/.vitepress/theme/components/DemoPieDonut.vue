<script setup lang="ts">
/**
 * Pie and donut side by side. Slices use the object data shape
 * ({ x: label, y: value }); the legend automatically lists slices
 * (label + swatch), so identity never relies on color alone.
 */
import type { ChartOptions } from '@chartcraft/vue';

const pie: Omit<ChartOptions, 'theme'> = {
  type: 'pie',
  title: 'Revenue by segment',
  subtitle: 'FY2025 share',
  data: {
    series: [
      {
        id: 'revenue-share',
        name: 'Revenue share',
        data: [
          { x: 'Enterprise', y: 46 },
          { x: 'Mid-market', y: 27 },
          { x: 'SMB', y: 18 },
          { x: 'Self-serve', y: 9 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Enterprise accounts for 46 percent of FY2025 revenue, mid-market 27, SMB 18, and self-serve 9.',
  },
};

const donut: Omit<ChartOptions, 'theme'> = {
  type: 'donut',
  title: 'Cloud spend by service',
  subtitle: 'This month',
  data: {
    series: [
      {
        id: 'cloud-spend',
        name: 'Cloud spend',
        data: [
          { x: 'Compute', y: 41 },
          { x: 'Storage', y: 24 },
          { x: 'Networking', y: 17 },
          { x: 'Databases', y: 12 },
          { x: 'Other', y: 6 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Compute is the largest cloud cost at 41 percent this month; storage follows at 24 percent.',
  },
};
</script>

<template>
  <div class="demo-pie-donut">
    <ChartDemo :options="pie" :height="340" />
    <ChartDemo :options="donut" :height="340" />
  </div>
</template>

<style scoped>
.demo-pie-donut {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 16px;
}

@media (min-width: 720px) {
  .demo-pie-donut {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
