<script setup lang="ts">
/**
 * The default theme layout plus two additions:
 *
 *  1. A section eyebrow above every documentation page's `h1`. The
 *     `doc-before` slot only exists in the doc layout, so the landing page is
 *     untouched.
 *  2. Truthful scroll state on wide tables. A table that fits its frame must
 *     not show an edge fade, and one that doesn't must — a distinction CSS
 *     cannot make on its own, so the two flags are set here and consumed by
 *     `.cc-table[data-cc-scrollable]` in docs.css.
 */
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { useRoute } from 'vitepress';
import DocEyebrow from './components/DocEyebrow.vue';

const { Layout } = DefaultTheme;

const route = useRoute();

const TRACKED = '__ccTableTracked';

function syncFrame(frame: HTMLElement): void {
  const scroller = frame.querySelector<HTMLElement>('.cc-table__scroll');
  if (!scroller) return;
  const overflow = scroller.scrollWidth - scroller.clientWidth;
  frame.toggleAttribute('data-cc-scrollable', overflow > 1);
  // 1px of slack: fractional layout widths mean scrollLeft rarely lands
  // exactly on the maximum.
  frame.toggleAttribute('data-cc-scroll-end', scroller.scrollLeft >= overflow - 1);
}

function syncAll(): void {
  for (const frame of document.querySelectorAll<HTMLElement>('.cc-table')) {
    const scroller = frame.querySelector<HTMLElement>('.cc-table__scroll');
    if (scroller && !(TRACKED in scroller.dataset)) {
      scroller.dataset[TRACKED] = '1';
      scroller.addEventListener('scroll', () => syncFrame(frame), { passive: true });
    }
    syncFrame(frame);
  }
}

let observer: ResizeObserver | null = null;
let stop: (() => void) | null = null;

onMounted(() => {
  syncAll();
  if (typeof ResizeObserver !== 'undefined') {
    // The doc column, not the window: the sidebar collapsing at a breakpoint
    // resizes the column without the table's own width ever being queried.
    observer = new ResizeObserver(() => syncAll());
    const doc = document.querySelector('.VPDoc');
    if (doc) observer.observe(doc);
  } else {
    const onResize = () => syncAll();
    window.addEventListener('resize', onResize, { passive: true });
    stop = () => window.removeEventListener('resize', onResize);
  }
});

watch(
  () => route.path,
  () => nextTick().then(syncAll),
);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  stop?.();
});
</script>

<template>
  <Layout>
    <template #doc-before>
      <DocEyebrow />
    </template>
  </Layout>
</template>
