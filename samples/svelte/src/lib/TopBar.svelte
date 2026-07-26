<!--
  Top bar: brand, date-range segmented control, Export CSV, theme toggle.

  Both controls are real <button aria-pressed>s. The parent owns the state; this
  component only reports intent through callback props, which is the Svelte 5
  replacement for `createEventDispatcher`.
-->
<script lang="ts">
  import { RANGES } from '../data';
  import type { RangeKey } from '../data';
  import type { Scheme } from '../theme';

  interface Props {
    range: RangeKey;
    scheme: Scheme;
    onrange: (next: RangeKey) => void;
    onexport: () => void;
    ontoggletheme: () => void;
  }

  let { range, scheme, onrange, onexport, ontoggletheme }: Props = $props();
</script>

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
        {#each RANGES as r (r.key)}
          <button
            class="segmented__btn"
            type="button"
            aria-pressed={r.key === range}
            aria-label={r.long}
            onclick={() => onrange(r.key)}
          >
            {r.label}
          </button>
        {/each}
      </div>

      <button class="btn" type="button" onclick={onexport}>
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
        aria-pressed={scheme === 'dark'}
        onclick={ontoggletheme}
      >
        <span class="visually-hidden">Dark theme</span>
        {#if scheme === 'dark'}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.4" />
            <path
              d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1m11-5-1.1 1.1M5.1 10.9 4 12m8 0-1.1-1.1M5.1 5.1 4 4"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
        {/if}
      </button>
    </div>
  </div>
</header>
