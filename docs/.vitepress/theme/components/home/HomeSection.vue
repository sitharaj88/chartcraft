<script setup lang="ts">
/**
 * One alternating feature section: a claim on one side, the live demo that
 * backs it on the other. `flip` puts the demo first on wide screens; on
 * narrow ones the copy always leads, because reading order beats symmetry.
 */
withDefaults(
  defineProps<{
    eyebrow: string;
    title: string;
    lede: string;
    points?: string[];
    linkText?: string;
    linkHref?: string;
    flip?: boolean;
    tint?: boolean;
    /** Give the demo column more room (wide charts, code panes). */
    wide?: boolean;
  }>(),
  { points: () => [], linkText: '', linkHref: '', flip: false, tint: false, wide: false },
);
</script>

<template>
  <section class="cc-section" :class="{ 'cc-section--tint': tint }">
    <div class="cc-wrap cc-feature" :class="{ 'cc-feature--flip': flip, 'cc-feature--wide': wide }">
      <div class="cc-feature__copy" data-cc-reveal>
        <p class="cc-eyebrow">{{ eyebrow }}</p>
        <h2 class="cc-h2">{{ title }}</h2>
        <p class="cc-lede">{{ lede }}</p>

        <ul v-if="points.length" class="cc-feature__points">
          <li v-for="point in points" :key="point">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M6.2 11.3 3.4 8.5l-1 1L6.2 13.3 14 5.5l-1-1z"
                fill="currentColor"
              />
            </svg>
            <span>{{ point }}</span>
          </li>
        </ul>

        <a v-if="linkHref" class="cc-feature__link" :href="linkHref">
          {{ linkText }}
          <span aria-hidden="true">→</span>
        </a>
      </div>

      <div class="cc-feature__demo" data-cc-reveal>
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.cc-feature {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
  align-items: center;
}

@media (min-width: 1000px) {
  .cc-feature {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 56px;
  }

  .cc-feature--wide {
    grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  }

  /*
   * `order` swaps which COLUMN each child lands in, so the track sizes have to
   * be mirrored too — otherwise flipping hands the demo the narrow track and
   * the copy the wide one, which is exactly backwards.
   */
  .cc-feature--flip {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  }

  .cc-feature--flip.cc-feature--wide {
    grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
  }

  .cc-feature--flip .cc-feature__copy {
    order: 2;
  }

  .cc-feature--flip .cc-feature__demo {
    order: 1;
  }
}

.cc-feature__copy,
.cc-feature__demo {
  min-width: 0;
}

.cc-feature__points {
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cc-feature__points li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.cc-feature__points svg {
  flex: none;
  margin-top: 3px;
  color: var(--vp-c-brand-1);
}

.cc-feature__link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 24px 0 0;
  font-size: 14.5px;
  font-weight: 650;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  transition: gap 0.18s ease;
}

.cc-feature__link:hover {
  gap: 11px;
  color: var(--vp-c-brand-2);
}

/* Demos inside a section already sit on a card — drop the doc-page frame. */
.cc-feature__demo :deep(.chart-demo) {
  margin: 0;
  border-radius: var(--cc-radius-lg);
  box-shadow: var(--cc-shadow-lg);
}
</style>
