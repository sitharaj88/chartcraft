<script setup lang="ts">
/**
 * The visible destination for `pointclick`.
 *
 * Presentational: it renders whatever `entry` it is handed, or the empty
 * state. The card around it carries `aria-live="polite"`, so a click (or
 * Tab + arrow keys + Enter) announces the new reading.
 */
import type { InspectorEntry } from '../inspector';

defineProps<{ entry: InspectorEntry | null }>();
</script>

<template>
  <div class="inspector">
    <template v-if="entry">
      <span class="inspector__series">
        <span class="inspector__swatch" :style="{ background: entry.swatch }" />
        {{ entry.seriesName }}
      </span>
      <p class="inspector__value">{{ entry.value }}</p>
      <dl class="inspector__list">
        <template v-for="[term, definition] in entry.rows" :key="term">
          <dt>{{ term }}</dt>
          <dd>{{ definition }}</dd>
        </template>
      </dl>
      <p class="inspector__hint">Updated on every point click.</p>
    </template>

    <template v-else>
      <p class="inspector__empty">
        Click a point on any chart — the recurring-revenue line, the segment bars or the
        contract-value boxes — to inspect it here.
      </p>
      <p class="inspector__hint">
        Keyboard: Tab to a chart, walk it with the arrow keys, then press Enter.
      </p>
    </template>
  </div>
</template>
