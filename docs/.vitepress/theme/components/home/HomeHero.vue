<script setup lang="ts">
/** Landing hero: the claim, two CTAs, the repo link, and the live showcase. */
import { withBase } from 'vitepress';
</script>

<template>
  <section class="cc-hero">
    <div class="cc-hero__wash" aria-hidden="true" />
    <div class="cc-wrap cc-hero__inner">
      <div class="cc-hero__copy">
        <p class="cc-hero__badge">
          <span class="cc-hero__dot" aria-hidden="true" />
          v0.3 · MIT · zero runtime dependencies
        </p>

        <h1 class="cc-hero__title">
          <span class="cc-gradient-text">ChartCraft</span>
        </h1>

        <p class="cc-hero__claim">
          39 chart types, one accessible canvas engine, and nothing else in your
          <code>node_modules</code>.
        </p>

        <p class="cc-hero__tagline">
          A framework-agnostic charting core with thin React, Vue and Svelte wrappers.
          Every chart ships a screen-reader data table, full keyboard navigation and a
          colorblind-safe palette — before you configure anything.
        </p>

        <div class="cc-hero__actions">
          <a class="cc-btn cc-btn--primary" :href="withBase('/getting-started')">Get started</a>
          <a class="cc-btn cc-btn--alt" :href="withBase('/examples/')">See all 39 charts</a>
          <a
            class="cc-btn cc-btn--ghost"
            href="https://github.com/OWNER/charts"
            rel="noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
              />
            </svg>
            GitHub
          </a>
        </div>

        <p class="cc-hero__install">
          <code>npm install @chartcraft/core</code>
        </p>
      </div>

      <div class="cc-hero__demo">
        <HeroShowcase />
      </div>
    </div>
  </section>
</template>

<style scoped>
.cc-hero {
  position: relative;
  padding: 40px 0 56px;
  isolation: isolate;
}

@media (min-width: 960px) {
  .cc-hero {
    padding: 64px 0 80px;
  }
}

.cc-hero__wash {
  position: absolute;
  inset: -120px 0 0;
  z-index: -1;
  background: var(--cc-grad-wash);
  pointer-events: none;
}

.cc-hero__inner {
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
  align-items: center;
}

@media (min-width: 1000px) {
  .cc-hero__inner {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 56px;
  }
}

.cc-hero__copy {
  min-width: 0;
}

.cc-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 20px;
  padding: 6px 14px;
  border: 1px solid var(--cc-border);
  border-radius: 999px;
  background-color: var(--vp-c-bg);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.cc-hero__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cc-grad);
}

.cc-hero__title {
  margin: 0;
  font-size: clamp(3rem, 1.9rem + 4.6vw, 4.75rem);
  line-height: 1.02;
  letter-spacing: -0.035em;
  font-weight: 800;
}

.cc-hero__claim {
  margin: 14px 0 0;
  font-size: clamp(1.25rem, 1.05rem + 1vw, 1.85rem);
  line-height: 1.28;
  letter-spacing: -0.02em;
  font-weight: 650;
  color: var(--vp-c-text-1);
  text-wrap: balance;
}

.cc-hero__claim code {
  font-size: 0.86em;
  padding: 2px 7px;
  border-radius: 6px;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.cc-hero__tagline {
  margin: 18px 0 0;
  max-width: 54ch;
  font-size: clamp(0.95rem, 0.92rem + 0.2vw, 1.06rem);
  line-height: 1.68;
  color: var(--vp-c-text-2);
}

.cc-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 30px 0 0;
}

.cc-hero__install {
  margin: 22px 0 0;
}

.cc-hero__install code {
  padding: 7px 14px;
  border: 1px dashed var(--cc-border);
  border-radius: 8px;
  background-color: var(--vp-c-bg-soft);
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.cc-hero__demo {
  min-width: 0;
}
</style>
