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
 */
import { computed } from 'vue';
import { useData } from 'vitepress';
import { Chart } from '@chartcraft/vue';
import type { ChartEventMap, ChartOptions, PointEvent } from '@chartcraft/vue';

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
}>();

const { isDark } = useData();

const themed = computed<ChartOptions>(() => ({
  ...(props.options as ChartOptions),
  theme: isDark.value ? 'dark' : 'light',
}));
</script>

<template>
  <div class="chart-demo" :style="{ height: `${height}px` }">
    <Chart
      class="chart-demo__chart"
      :options="themed"
      @point-click="emit('point-click', $event)"
      @point-enter="emit('point-enter', $event)"
      @point-leave="emit('point-leave', $event)"
      @legend-toggle="emit('legend-toggle', $event)"
    />
  </div>
</template>
