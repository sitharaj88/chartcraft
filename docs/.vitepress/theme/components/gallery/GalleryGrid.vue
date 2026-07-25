<script setup lang="ts">
/**
 * The visual gallery: every chart type ChartCraft ships, rendered live,
 * grouped by family. See `GalleryCard` for how 40 canvases stay cheap.
 */
import { galleryFamilies } from './galleryData';
</script>

<template>
  <div class="cc-gallery">
    <section v-for="family in galleryFamilies" :id="family.id" :key="family.id" class="cc-gallery__family">
      <h2 class="cc-gallery__title">
        {{ family.title }}
        <span class="cc-gallery__count">{{ family.entries.length }}</span>
      </h2>
      <div class="cc-gallery__grid">
        <GalleryCard
          v-for="entry in family.entries"
          :key="entry.name"
          :name="entry.name"
          :blurb="entry.blurb"
          :link="entry.link"
          :options="entry.options"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.cc-gallery {
  margin: 8px 0 0;
}

.cc-gallery__family + .cc-gallery__family {
  margin-top: 44px;
}

.cc-gallery__title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--cc-border);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}

.cc-gallery__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cc-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 18px;
}

@media (max-width: 400px) {
  .cc-gallery__grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
