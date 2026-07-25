<script setup lang="ts">
/**
 * Shared wrapper for all live docs demos.
 *
 * VitePress toggles dark mode by class (`.dark` on <html>), not via
 * `prefers-color-scheme`, so the library's default `theme: 'auto'` cannot
 * follow the site toggle. This wrapper reads `useData().isDark` and pins
 * `theme` to 'light'/'dark' through a computed, so every chart tracks the
 * site toggle instantly. It also provides the standard demo frame
 * (explicit height, rounded corners, hairline border).
 *
 * It forwards every public chart event (including the v0.3 `zoom` and
 * `annotation-click`) and exposes the live `Chart` instance as `chart`, so a
 * demo can drive `zoomTo()`, `exportImage()` or `exportData()` through a
 * template ref without dropping the theme plumbing.
 */
import { computed, ref } from 'vue';
import { useData } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartEventMap, ChartExposed, ChartOptions, PointEvent } from '@chartcraft/vue';

const props = withDefaults(
  defineProps<{
    options: Omit<ChartOptions, 'theme'>;
    height?: number;
  }>(),
  { height: 340 },
);

const emit = defineEmits<{
  'point-click': [ev: PointEvent];
  'point-enter': [ev: PointEvent];
  'point-leave': [ev: PointEvent];
  'legend-toggle': [ev: ChartEventMap['legendtoggle']];
  zoom: [ev: ChartEventMap['zoom']];
  'annotation-click': [ev: ChartEventMap['annotationclick']];
}>();

const { isDark } = useData();

const themed = computed<ChartOptions>(() => ({
  ...(props.options as ChartOptions),
  theme: isDark.value ? 'dark' : 'light',
}));

const inner = ref<ChartExposed | null>(null);
defineExpose({ chart: computed(() => inner.value?.chart ?? null) });
</script>

<template>
  <div class="chart-demo" :style="{ height: `${height}px` }">
    <Chart
      ref="inner"
      class="chart-demo__chart"
      :options="themed"
      @point-click="emit('point-click', $event)"
      @point-enter="emit('point-enter', $event)"
      @point-leave="emit('point-leave', $event)"
      @legend-toggle="emit('legend-toggle', $event)"
      @zoom="emit('zoom', $event)"
      @annotation-click="emit('annotation-click', $event)"
    />
  </div>
</template>
