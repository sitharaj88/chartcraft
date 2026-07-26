<!--
  Inspector — where a `pointclick` becomes something you can read.

  The swatch colour is DERIVED from (series, scheme) rather than captured at
  click time, so flipping the theme recolours the current selection instead of
  leaving a stale palette slot behind.
-->
<script lang="ts">
  import { categoricalPalette } from '@chartcraft/core';

  import { formatX } from '../selection';
  import type { Selection } from '../selection';
  import type { Scheme } from '../theme';

  interface Props {
    selection: Selection | null;
    scheme: Scheme;
  }

  let { selection, scheme }: Props = $props();

  /** PointEvent carries no colour, so resolve the series' palette slot. */
  const swatch = $derived.by(() => {
    if (!selection) return 'transparent';
    const { series, ev } = selection;
    const index = series.findIndex((s) => (s.id ?? s.name) === ev.seriesId);
    const slots = categoricalPalette[scheme];
    return series[index]?.color ?? slots[(index < 0 ? 0 : index) % slots.length];
  });

  const rows = $derived.by((): [string, string][] =>
    selection
      ? [
          ['Chart', selection.cardTitle],
          ['Point', formatX(selection.ev.x)],
          ['Index', String(selection.ev.dataIndex)],
          // Keyboard-originated events report clientX/clientY as -1.
          [
            'Input',
            selection.ev.clientX === -1 && selection.ev.clientY === -1 ? 'Keyboard' : 'Pointer',
          ],
        ]
      : [],
  );
</script>

<div class="inspector">
  {#if !selection}
    <p class="inspector__empty">
      Click a point on any chart — the recurring-revenue line, the segment bars or the
      contract-value boxes — to inspect it here.
    </p>
    <p class="inspector__hint">
      Keyboard: Tab to a chart, walk it with the arrow keys, then press Enter.
    </p>
  {:else}
    <span class="inspector__series">
      <span class="inspector__swatch" style:background={swatch}></span>{selection.ev.seriesName}
    </span>
    <p class="inspector__value">
      {selection.ev.y === null ? 'No value' : selection.format(selection.ev.y)}
    </p>
    <dl class="inspector__list">
      {#each rows as [term, def] (term)}
        <dt>{term}</dt>
        <dd>{def}</dd>
      {/each}
    </dl>
    <p class="inspector__hint">Updated on every point click.</p>
  {/if}
</div>
