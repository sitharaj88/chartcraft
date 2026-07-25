<script setup lang="ts">
/**
 * One gallery card: a live miniature chart that links to its example page.
 *
 * Three things keep 40 of these cheap on one page:
 *   1. The chart is not created until the card is near the viewport
 *      (IntersectionObserver, 400px root margin) — before that the card shows
 *      a skeleton, so layout never shifts.
 *   2. Mounts are drained one per animation frame through `mountQueue`, so a
 *      row scrolling into view never lands several layouts in one task.
 *   3. Chrome is stripped: no title, no legend, no tooltip, no animation, and
 *      no a11y table or keyboard target — 40 nested tab stops and 40 hidden
 *      tables inside links would be worse for a screen reader, not better.
 *      The card itself is the accessible affordance: a link named for the
 *      type, whose example page carries the full accessible chart.
 *
 * The chart is destroyed by the Vue wrapper's own `onBeforeUnmount`.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useData, withBase } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartOptions } from '@chartcraft/vue';
import { enqueueMount } from './mountQueue';

const props = defineProps<{
  name: string;
  blurb: string;
  link: string;
  options: Omit<ChartOptions, 'theme'>;
}>();

const { isDark } = useData();

const root = shallowRef<HTMLElement | null>(null);
const mounted = ref(false);
let observer: IntersectionObserver | null = null;
let cancel: (() => void) | null = null;

const themed = computed<ChartOptions>(() => ({
  ...(props.options as ChartOptions),
  theme: isDark.value ? 'dark' : 'light',
  padding: 6,
  legend: false,
  tooltip: false,
  animation: false,
  a11y: { table: 'off', keyboard: false, title: `${props.name} chart preview` },
}));

const href = computed(() => withBase(`/examples/${props.link}`));

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    mounted.value = true;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer?.disconnect();
          observer = null;
          cancel = enqueueMount(() => {
            mounted.value = true;
          });
        }
      }
    },
    { rootMargin: '400px 0px' },
  );
  if (root.value) observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  cancel?.();
});
</script>

<template>
  <a ref="root" class="cc-gallery__card" :href="href">
    <span class="cc-gallery__canvas" aria-hidden="true">
      <Chart v-if="mounted" class="cc-gallery__chart" :options="themed" />
      <span v-else class="cc-gallery__skeleton" />
    </span>
    <span class="cc-gallery__meta">
      <span class="cc-gallery__name">{{ name }}</span>
      <span class="cc-gallery__blurb">{{ blurb }}</span>
    </span>
  </a>
</template>

<style scoped>
.cc-gallery__card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius);
  background-color: var(--vp-c-bg);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.cc-gallery__card:hover {
  transform: translateY(-3px);
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--cc-shadow);
}

.cc-gallery__card:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.cc-gallery__canvas {
  display: block;
  height: 190px;
  padding: 4px;
  border-bottom: 1px solid var(--cc-border);
  background-color: var(--vp-c-bg);
}

.cc-gallery__chart,
.cc-gallery__chart > div {
  height: 100%;
}

.cc-gallery__skeleton {
  display: block;
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(
    100deg,
    var(--vp-c-bg-soft) 30%,
    var(--vp-c-bg-alt) 50%,
    var(--vp-c-bg-soft) 70%
  );
  background-size: 300% 100%;
  animation: cc-shimmer 1.6s ease-in-out infinite;
}

@keyframes cc-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cc-gallery__skeleton {
    animation: none;
  }
}

.cc-gallery__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px 14px;
}

.cc-gallery__name {
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}

.cc-gallery__card:hover .cc-gallery__name {
  color: var(--vp-c-brand-1);
}

.cc-gallery__blurb {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--vp-c-text-3);
}
</style>
