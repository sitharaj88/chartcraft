<script setup lang="ts">
/**
 * Word cloud: terms are the marks, so this is the one place text wears the
 * series colors — cycled by RANK, not by data order. Font size interpolates
 * linearly between `minFontSize` and `maxFontSize` by weight.
 *
 * The spiral placement is DETERMINISTIC (seeded, never `Math.random()`), so the
 * same data always renders the same picture. Terms that cannot be placed are
 * dropped from the picture but kept in keyboard navigation and the a11y table.
 */
import type { ChartOptions } from '@chartcraft/vue';

const options: Omit<ChartOptions, 'theme'> = {
  type: 'wordcloud',
  title: 'Most frequent terms in support tickets',
  subtitle: 'Last 30 days · size ∝ mentions (exact counts in the tooltip)',
  wordcloud: { minFontSize: 13, maxFontSize: 52, rotate: false },
  data: {
    series: [
      {
        id: 'terms',
        name: 'Mentions',
        data: [
          { x: 'invoice', y: 412 },
          { x: 'SSO login', y: 388 },
          { x: 'export', y: 341 },
          { x: 'timeout', y: 296 },
          { x: 'permissions', y: 264 },
          { x: 'webhook', y: 233 },
          { x: 'seat limit', y: 208 },
          { x: 'API key', y: 191 },
          { x: 'sync delay', y: 174 },
          { x: 'dashboard', y: 162 },
          { x: 'CSV', y: 148 },
          { x: 'billing date', y: 131 },
          { x: 'password reset', y: 119 },
          { x: '2FA', y: 104 },
          { x: 'rate limit', y: 92 },
          { x: 'audit log', y: 81 },
          { x: 'sandbox', y: 68 },
          { x: 'onboarding', y: 57 },
          { x: 'mobile app', y: 44 },
          { x: 'dark mode', y: 31 },
        ],
      },
    ],
  },
  a11y: {
    description:
      'Invoices (412 mentions), SSO login (388) and export (341) dominate support tickets; timeouts and permissions follow at around 280.',
  },
};
</script>

<template>
  <ChartDemo :options="options" :height="360" />
</template>
