<script setup lang="ts">
/**
 * Sticky top bar: brand, date-range segmented control, CSV export, theme
 * toggle.
 *
 * Deliberately CONTROLLED — it owns no state. `range` and `scheme` come down
 * as props and every interaction goes back up as an event, so `App.vue` stays
 * the single source of truth for both (the same discipline the vanilla sample
 * enforces with module-scope `let`s).
 */
import { RANGES } from '../data';
import type { RangeKey } from '../data';
import type { Scheme } from '../specs';

defineProps<{ range: RangeKey; scheme: Scheme }>();

defineEmits<{
  (e: 'update:range', value: RangeKey): void;
  (e: 'toggle-theme'): void;
  (e: 'export'): void;
}>();
</script>

<template>
  <header class="topbar">
    <div class="shell topbar__inner">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M2 12.5 6 7l3.5 3.2L16 3"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="16" cy="3" r="1.9" fill="currentColor" />
          </svg>
        </span>
        <span>
          <span class="brand__name">Northwind Cloud</span>
          <span class="brand__sub">Analytics</span>
        </span>
      </div>

      <div class="topbar__actions">
        <div class="segmented" role="group" aria-label="Date range">
          <button
            v-for="r in RANGES"
            :key="r.key"
            class="segmented__btn"
            type="button"
            :aria-pressed="r.key === range"
            :aria-label="r.long"
            @click="$emit('update:range', r.key)"
          >
            {{ r.label }}
          </button>
        </div>

        <button class="btn" type="button" @click="$emit('export')">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2v8m0 0L5 7m3 3 3-3M2.5 12.5v1h11v-1"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Export CSV
        </button>

        <button
          class="btn btn--icon"
          type="button"
          :aria-pressed="scheme === 'dark'"
          @click="$emit('toggle-theme')"
        >
          <span class="visually-hidden">Dark theme</span>
          <!-- `v-if`/`v-else` rather than the `hidden` attribute: `hidden` has
               no effect on SVG elements (they are not HTML elements, so the UA
               stylesheet's `[hidden] { display: none }` never matches). The
               shared stylesheet patches that for the vanilla port; Vue can
               simply not render the other icon. -->
          <svg v-if="scheme !== 'dark'" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.4" />
            <path
              d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1m11-5-1.1 1.1M5.1 10.9 4 12m8 0-1.1-1.1M5.1 5.1 4 4"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>
