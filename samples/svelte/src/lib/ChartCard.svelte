<!--
  Card chrome: the visible <h2>/subtitle, an optional head action, and the
  card body as a snippet.

  The heading lives HERE rather than in the canvas (no `title` option is passed
  to any chart), so card titles stay in the document outline. The body snippet
  is normally a chart component given `class="card__chart"` — the wrapper's
  `class` prop puts the sizing class on the very div ChartCraft mounts into.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle: string;
    /** Grid span, matching the `.card--span-*` utilities in styles.css. */
    span: 3 | 4 | 5 | 7 | 8;
    /** Taller chart well, for the hero card. */
    hero?: boolean;
    /** Announce body changes (the Inspector). */
    live?: boolean;
    /** Optional control rendered at the top-right of the card head. */
    action?: Snippet;
    children: Snippet;
  }

  let { title, subtitle, span, hero = false, live = false, action, children }: Props = $props();
</script>

<article
  class="card card--span-{span}"
  class:card--hero={hero}
  aria-live={live ? 'polite' : undefined}
>
  <div class="card__head">
    <div>
      <h2 class="card__title">{title}</h2>
      <p class="card__subtitle">{subtitle}</p>
    </div>
    {#if action}{@render action()}{/if}
  </div>
  {@render children()}
</article>
