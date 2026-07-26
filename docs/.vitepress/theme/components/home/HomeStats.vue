<script setup lang="ts">
/**
 * The proof band. Every figure here is measured or countable, and nothing
 * else goes in it — no download counts, no logos, no "trusted by N teams".
 * The 1M redraw figure is the `line ds=on — resize` row of the benchmark
 * table in QUALITY-AUDIT.md; the test count is the four workspaces' suites.
 */
interface Stat {
  value: string;
  label: string;
  detail: string;
}

const stats: Stat[] = [
  { value: '39', label: 'chart types', detail: 'line through sankey, choropleth and network' },
  { value: '0', label: 'runtime dependencies', detail: 'ESM, CJS and .d.ts, strict TypeScript' },
  { value: '2,114', label: 'tests, all green', detail: 'across core and the four wrappers' },
  { value: '3.1 ms', label: 'redraw at 1M points', detail: 'measured; flat across 1k → 1M' },
  { value: 'WCAG 2.2', label: 'mapped, by default', detail: 'data table, keyboard nav, live region' },
  { value: '4', label: 'framework wrappers', detail: 'React, Vue, Svelte and Angular — exact parity' },
];
</script>

<template>
  <section class="cc-section cc-section--tint cc-stats">
    <div class="cc-wrap">
      <ul class="cc-stats__grid">
        <li v-for="stat in stats" :key="stat.label" class="cc-stats__item" data-cc-reveal>
          <span class="cc-stats__value">{{ stat.value }}</span>
          <span class="cc-stats__label">{{ stat.label }}</span>
          <span class="cc-stats__detail">{{ stat.detail }}</span>
        </li>
      </ul>
      <p class="cc-stats__foot">
        Performance figures come from <code>npm run bench -w @chartcraft/core</code> — 129
        measurements of the library's own work (ingest, model, layout, draw calls), not of
        rasterization. The numbers, and their caveats, are published in the quality audit.
      </p>
    </div>
  </section>
</template>

<style scoped>
.cc-stats__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 720px) {
  .cc-stats__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 30px 24px;
  }
}

@media (min-width: 1100px) {
  .cc-stats__grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.cc-stats__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding-left: 14px;
  border-left: 2px solid var(--vp-c-brand-soft);
}

.cc-stats__value {
  font-size: clamp(1.5rem, 1.2rem + 1.1vw, 2.05rem);
  font-weight: 750;
  line-height: 1.1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.cc-stats__label {
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.35;
  color: var(--vp-c-brand-1);
}

.cc-stats__detail {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--vp-c-text-3);
}

.cc-stats__foot {
  margin: 36px 0 0;
  max-width: 78ch;
  font-size: 13px;
  line-height: 1.65;
  color: var(--vp-c-text-3);
}

.cc-stats__foot code {
  font-size: 0.94em;
  padding: 1px 5px;
  border-radius: 5px;
  background-color: var(--vp-c-bg);
}
</style>
