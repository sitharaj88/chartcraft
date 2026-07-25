<script setup lang="ts">
/** Closing CTA: install line with a copy button, plus the two entry points. */
import { ref } from 'vue';
import { withBase } from 'vitepress';

const COMMAND = 'npm install @chartcraft/core';

const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(COMMAND);
    copied.value = true;
  } catch {
    // Clipboard permission can be denied (or absent over http). Say so rather
    // than claiming a copy that did not happen.
    copied.value = false;
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1800);
}
</script>

<template>
  <section class="cc-cta">
    <div class="cc-wrap cc-cta__inner" data-cc-reveal>
      <h2 class="cc-cta__title">Ready in one install</h2>
      <p class="cc-cta__lede">
        No plugin registry, no license key, no runtime dependencies. Add the core, import a
        wrapper if you use one, and every chart type on this site is available to you.
      </p>

      <div class="cc-cta__command">
        <code>{{ COMMAND }}</code>
        <button
          type="button"
          class="cc-cta__copy"
          :aria-label="`Copy ${COMMAND} to the clipboard`"
          @click="copy"
        >
          <span aria-hidden="true">{{ copied ? '✓' : '⧉' }}</span>
          <span>{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>

      <div class="cc-cta__actions">
        <a class="cc-btn cc-btn--primary" :href="withBase('/getting-started')">Get started</a>
        <a class="cc-btn cc-btn--alt" :href="withBase('/api/core')">Read the API</a>
      </div>

      <p class="cc-cta__fine">
        MIT licensed. React 18+, Vue 3 and Svelte 4/5 wrappers ship alongside the core;
        Angular and Solid are on the <a :href="withBase('/roadmap')">roadmap</a>.
      </p>
    </div>
  </section>
</template>

<style scoped>
.cc-cta {
  position: relative;
  padding: 80px 0 96px;
  border-top: 1px solid var(--cc-border);
  background: var(--cc-grad-wash);
}

.cc-cta__inner {
  text-align: center;
}

.cc-cta__title {
  margin: 0;
  font-size: clamp(1.9rem, 1.3rem + 2.4vw, 3rem);
  line-height: 1.12;
  letter-spacing: -0.028em;
  font-weight: 780;
  color: var(--vp-c-text-1);
}

.cc-cta__lede {
  margin: 16px auto 0;
  max-width: 58ch;
  font-size: clamp(0.98rem, 0.94rem + 0.2vw, 1.1rem);
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

.cc-cta__command {
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  margin: 32px 0 0;
  max-width: 100%;
  border: 1px solid var(--cc-border);
  border-radius: 12px;
  background-color: var(--vp-c-bg);
  box-shadow: var(--cc-shadow);
  overflow: hidden;
}

.cc-cta__command code {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  font-size: 14px;
  color: var(--vp-c-text-1);
  white-space: nowrap;
  overflow-x: auto;
}

.cc-cta__copy {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  padding: 0 18px;
  border: none;
  border-left: 1px solid var(--cc-border);
  background-color: var(--vp-c-bg-soft);
  font-size: 13px;
  font-weight: 650;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.cc-cta__copy:hover {
  background-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.cc-cta__copy:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

.cc-cta__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin: 28px 0 0;
}

.cc-cta__fine {
  margin: 26px auto 0;
  max-width: 60ch;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

.cc-cta__fine a {
  color: var(--vp-c-brand-1);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (max-width: 420px) {
  .cc-cta__command {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .cc-cta__copy {
    border-left: none;
    border-top: 1px solid var(--cc-border);
    justify-content: center;
    padding: 12px;
  }
}
</style>
