<script setup lang="ts">
/**
 * The card chrome shared by every panel on the board.
 *
 * The visible heading is a real `<h2>` in the document outline — which is why
 * no chart is given a `title` option. Grid span comes in as a number and maps
 * onto the shared stylesheet's `.card--span-N` classes.
 *
 * The default slot holds the chart component itself, NOT a wrapper div: the
 * stylesheet's `.card__chart` carries the height, and the ChartCraft container
 * has to be the element that is actually sized. Callers therefore write
 * `<LineChart class="card__chart" …/>` and the wrapper's root div picks the
 * class up through attribute fallthrough.
 */
const props = defineProps<{
  title: string;
  subtitle?: string;
  /** 12-column grid span: 3, 4, 5, 7 or 8. */
  span: 3 | 4 | 5 | 7 | 8;
  /** Taller chart well, for the hero card. */
  hero?: boolean;
}>();
</script>

<template>
  <article class="card" :class="[`card--span-${props.span}`, { 'card--hero': props.hero }]">
    <div class="card__head">
      <div>
        <h2 class="card__title">{{ props.title }}</h2>
        <p v-if="props.subtitle" class="card__subtitle">{{ props.subtitle }}</p>
      </div>
      <slot name="actions" />
    </div>
    <slot />
  </article>
</template>
