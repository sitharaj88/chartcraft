<script setup lang="ts">
/**
 * Breadth, shown rather than claimed: eight live miniatures picked from the
 * same data the full gallery uses, so there is exactly one definition of what
 * a "sankey card" looks like on this site.
 */
import { withBase } from 'vitepress';
import GalleryCard from '../gallery/GalleryCard.vue';
import { galleryFamilies } from '../gallery/galleryData';

const PICKS = [
  'Sankey',
  'Treemap',
  'Candlestick',
  'Violin',
  'Calendar',
  'Radial bar',
  'Network',
  'Streamgraph',
];

const all = galleryFamilies.flatMap((f) => f.entries);
const picks = PICKS.map((name) => all.find((e) => e.name === name)).filter(
  (e): e is NonNullable<typeof e> => Boolean(e),
);
</script>

<template>
  <section class="cc-section cc-types">
    <div class="cc-wrap">
      <div class="cc-types__head" data-cc-reveal>
        <div>
          <p class="cc-eyebrow">The catalogue</p>
          <h2 class="cc-h2">39 chart types, and the judgement to pick one</h2>
          <p class="cc-lede">
            Every type ships with tooltips, keyboard navigation, a data table and export —
            there is no "advanced" tier. Each example page is also opinionated about when
            <em>not</em> to use its type, because picking the wrong form is the most
            expensive mistake in data visualization.
          </p>
        </div>
        <a class="cc-btn cc-btn--alt cc-types__cta" :href="withBase('/examples/')">
          Open the gallery
        </a>
      </div>

      <div class="cc-types__grid" data-cc-reveal>
        <GalleryCard
          v-for="entry in picks"
          :key="entry.name"
          :name="entry.name"
          :blurb="entry.blurb"
          :link="entry.link"
          :options="entry.options"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.cc-types__head {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 32px;
}

@media (min-width: 900px) {
  .cc-types__head {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: 40px;
  }
}

.cc-types__cta {
  flex: none;
  align-self: flex-start;
}

.cc-types__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 18px;
}

@media (max-width: 400px) {
  .cc-types__grid {
    grid-template-columns: 1fr;
  }
}
</style>
