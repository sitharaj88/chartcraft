<script setup lang="ts">
/**
 * The wrapper row: four real charts, one per framework guide.
 *
 * Every chart on this site — including these four — is rendered by
 * `@chartcraft/vue`, because the wrappers are thin enough that the choice is
 * not supposed to matter. That is the claim this section is making, so the
 * cards say which package each link documents rather than implying four
 * different engines are at work.
 */
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';

const { isDark } = useData();

interface Wrapper {
  name: string;
  pkg: string;
  peer: string;
  link: string;
  spark: number[];
  metric: string;
  value: string;
}

const wrappers: Wrapper[] = [
  {
    name: 'React',
    pkg: '@chartcraft/react',
    peer: 'React 18+',
    link: '/frameworks/react',
    metric: 'Monthly revenue',
    value: '$128.4k',
    spark: [96, 101, 99, 104, 108, 113, 111, 117, 119, 124, 122, 128],
  },
  {
    name: 'Vue',
    pkg: '@chartcraft/vue',
    peer: 'Vue 3',
    link: '/frameworks/vue',
    metric: 'Active users',
    value: '24,110',
    spark: [19.9, 20.4, 21.1, 20.8, 21.6, 22.0, 22.7, 22.4, 23.1, 23.3, 23.8, 24.1],
  },
  {
    name: 'Svelte',
    pkg: '@chartcraft/svelte',
    peer: 'Svelte 4 & 5',
    link: '/frameworks/svelte',
    metric: 'p95 latency',
    value: '212 ms',
    spark: [251, 246, 258, 240, 236, 229, 233, 224, 219, 226, 215, 212],
  },
  {
    name: 'Angular',
    pkg: '@chartcraft/angular',
    peer: 'Angular 20+',
    link: '/frameworks/angular',
    metric: 'Builds per day',
    value: '341',
    spark: [268, 274, 281, 279, 292, 298, 305, 301, 314, 322, 333, 341],
  },
];

const optionsFor = computed(() => (w: Wrapper): ChartOptions => ({
  type: 'sparkline',
  theme: isDark.value ? 'dark' : 'light',
  padding: 2,
  animation: false,
  data: { series: [{ id: w.name, name: w.metric, data: w.spark, showMarkers: false }] },
  a11y: { table: 'off', keyboard: false, title: `${w.metric} sparkline` },
}));
</script>

<template>
  <ul class="cc-fw">
    <li v-for="w in wrappers" :key="w.name" class="cc-fw__card">
      <a class="cc-fw__link" :href="withBase(w.link)">
        <span class="cc-fw__head">
          <span class="cc-fw__name">{{ w.name }}</span>
          <span class="cc-fw__peer">{{ w.peer }}</span>
        </span>
        <span class="cc-fw__metric">{{ w.metric }}</span>
        <span class="cc-fw__value">{{ w.value }}</span>
        <span class="cc-fw__spark" aria-hidden="true">
          <Chart class="cc-fw__chart" :options="optionsFor(w)" />
        </span>
        <code class="cc-fw__pkg">{{ w.pkg }}</code>
      </a>
    </li>
  </ul>
</template>

<style scoped>
.cc-fw {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 560px) {
  .cc-fw {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/*
 * Deliberately capped at TWO columns, not four.
 *
 * These cards live in one half of an alternating two-column section, so a
 * `min-width: 900px` VIEWPORT query says nothing about the width the grid
 * actually gets: at a 1280px viewport the column is ~620px, and four across
 * left each card ~142px — narrower than the `@chartcraft/angular` chip, which
 * then overflowed its card (a viewport media query cannot see the container it
 * is laid out in; a container query could, but that needs a wrapper element to
 * query against, since an element cannot query itself). Two columns give each
 * card ~300px, which fits the longest package name with room to spare.
 */
@media (min-width: 900px) {
  .cc-fw {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.cc-fw__card {
  min-width: 0;
}

.cc-fw__link {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 18px 18px;
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-lg);
  background-color: var(--vp-c-bg);
  box-shadow: var(--cc-shadow);
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.cc-fw__link:hover {
  transform: translateY(-3px);
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--cc-shadow-lg);
}

.cc-fw__link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

/*
 * Stacked, not baseline-aligned: "Svelte 4 & 5" wraps against a 200px card and
 * a wrapped peer line pushed the name off its own row.
 */
.cc-fw__head {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 14px;
}

.cc-fw__name {
  font-size: 16px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.cc-fw__peer {
  font-size: 11.5px;
  color: var(--vp-c-text-3);
}

.cc-fw__metric {
  font-size: 12.5px;
  color: var(--vp-c-text-3);
}

.cc-fw__value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.cc-fw__spark {
  display: block;
  height: 44px;
  margin: 8px 0 14px;
}

.cc-fw__chart,
.cc-fw__chart > div {
  height: 100%;
}

.cc-fw__pkg {
  margin-top: auto;
  padding: 5px 8px;
  border-radius: 6px;
  background-color: var(--vp-c-bg-soft);
  /* Narrow cards: shrink the package name rather than clip it. */
  font-size: clamp(9.5px, 1.05vw, 11.5px);
  color: var(--vp-c-text-2);
  white-space: nowrap;
  text-align: center;
}
</style>
