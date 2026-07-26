<script setup lang="ts">
/**
 * One KPI tile: label, headline figure, delta chip, comparison, sparkline.
 *
 * The tile owns nothing but presentation. Two things worth copying:
 *   · the delta TONE follows the metric's semantics, not the sign of the
 *     number — churn going up is the bad case — via `kpi.higherIsBetter`;
 *   · direction is also carried by a ▲/▼ glyph, so it is never colour alone.
 *
 * The chip's colours resolve to `--delta-up` / `--delta-down`, which `App.vue`
 * sets at runtime from `theme.up` / `theme.down`, so the chips can never drift
 * from what the charts draw.
 */
import { computed } from 'vue';
import { SparklineChart } from '@chartcraft/vue';

import { formatDelta } from '../data';
import type { KpiTile } from '../data';
import { sparkSpec } from '../specs';
import type { Scheme } from '../specs';

const props = defineProps<{ kpi: KpiTile; scheme: Scheme }>();

/** Re-derived whenever the range swaps the tile or the theme flips. */
const options = computed(() => sparkSpec(props.kpi, props.scheme));

const tone = computed(() =>
  props.kpi.higherIsBetter === props.kpi.delta >= 0 ? 'good' : 'bad',
);
</script>

<template>
  <article class="kpi">
    <span class="kpi__label">{{ props.kpi.label }}</span>
    <div class="kpi__row">
      <span class="kpi__value">{{ props.kpi.value }}</span>
      <span class="kpi__delta" :data-tone="tone">
        {{ formatDelta(props.kpi.delta, props.kpi.deltaUnit) }}
      </span>
    </div>
    <span class="kpi__comparison">{{ props.kpi.comparison }}</span>
    <SparklineChart class="kpi__spark" :options="options" />
  </article>
</template>
