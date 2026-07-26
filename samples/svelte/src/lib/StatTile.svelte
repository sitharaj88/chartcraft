<!--
  KPI tile: headline figure, delta chip, and a 40px sparkline.

  `<SparklineChart>` is given `class="kpi__spark"` so the wrapper's own div IS
  the sized well — no extra element, and the chart's ResizeObserver measures
  exactly the box the stylesheet defines.
-->
<script lang="ts">
  import { SparklineChart } from '@chartcraft/svelte';

  import { formatDelta } from '../data';
  import type { KpiTile } from '../data';
  import { sparkSpec } from '../specs';
  import type { Scheme } from '../theme';

  interface Props {
    kpi: KpiTile;
    scheme: Scheme;
  }

  let { kpi, scheme }: Props = $props();

  // A rise is not automatically good: churn going UP is the bad case, so the
  // tone follows the metric's semantics, mapped onto theme.up/down.
  const tone = $derived(kpi.higherIsBetter === kpi.delta >= 0 ? 'good' : 'bad');
</script>

<article class="kpi">
  <span class="kpi__label">{kpi.label}</span>
  <div class="kpi__row">
    <span class="kpi__value">{kpi.value}</span>
    <span class="kpi__delta" data-tone={tone}>{formatDelta(kpi.delta, kpi.deltaUnit)}</span>
  </div>
  <span class="kpi__comparison">{kpi.comparison}</span>
  <SparklineChart class="kpi__spark" options={sparkSpec(kpi, scheme)} />
</article>
