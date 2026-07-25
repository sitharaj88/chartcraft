<script setup lang="ts">
/**
 * The landing page.
 *
 * Order is deliberate: claim → proof → breadth → the four things that are
 * actually hard (accessibility, scale, colour, framework parity) → how little
 * code it takes → install. Every "demo" slot below is a live chart, because a
 * charting library that can only show you screenshots of itself is telling
 * you something.
 */
import { withBase } from 'vitepress';
import { useReveal } from '../useReveal';

useReveal();
</script>

<template>
  <div class="cc-home">
    <HomeHero />

    <HomeStats />

    <HomeTypes />

    <HomeSection
      tint
      eyebrow="Accessibility"
      title="Every chart is readable without looking at it"
      lede="A canvas is one opaque rectangle to assistive technology. So every ChartCraft chart maintains a parallel DOM beside the pixels — generated from the same model, on every update, with zero configuration."
      :points="[
        'A real <table> of the data, visually hidden by default and never out of sync',
        'Tab to a chart, walk points with the arrow keys, Enter to activate — on all 39 types',
        'A polite live region announces the focused datum as you move',
        'prefers-reduced-motion and forced-colors are honoured, not detected and ignored',
      ]"
      link-text="Read the accessibility guide"
      :link-href="withBase('/accessibility')"
    >
      <HomeA11y />
    </HomeSection>

    <HomeSection
      flip
      wide
      eyebrow="Performance"
      title="A million points, redrawn in single-digit milliseconds"
      lede="LTTB downsampling reduces a series to the plot width once, and the retained model stays reduced — so a resize at one million points costs the same as a resize at one thousand. Then it re-runs inside the zoom window, so detail comes back when you go looking for it."
      :points="[
        'Measured: 3.1 ms to redraw 1M points, flat across four orders of magnitude',
        'LTTB itself is sub-linear — 10.7 ms for a million points',
        'No per-frame allocation: 200 redraws at 100k points move the heap by −0.4 KB/frame',
        'Canvas 2D, one context, no virtual DOM between your data and the pixels',
      ]"
      link-text="Read the performance guide"
      :link-href="withBase('/performance')"
    >
      <HomePerf />
    </HomeSection>

    <HomeSection
      tint
      eyebrow="Colour"
      title="A palette that survives colourblindness — and dark mode"
      lede="Eight categorical slots, validated pairwise under CVD simulation in both schemes. Colour follows series identity, never rank, so a series keeps its slot when you filter, sort or toggle it. Dark mode is a second designed scheme, not an inversion."
      :points="[
        'Both schemes ship in the library — the swatches below are read from it, not copied',
        'Series past slot 8 fall back to marker shape rather than colours that collide',
        'Forced-colors mode drops to three system colours and encodes the rest with shape',
        'Sequential and diverging ramps for heatmaps, calendars and choropleths',
      ]"
      link-text="Read the theming guide"
      :link-href="withBase('/concepts/theming')"
    >
      <HomePalette />
    </HomeSection>

    <HomeSection
      flip
      eyebrow="Frameworks"
      title="One engine, three wrappers, exact parity"
      lede="Every feature lives in @chartcraft/core. The wrappers own lifecycle, resize observation and event bridging — and nothing else, so there is no feature that exists in one framework and not another, and nothing to port when the next one lands."
      :points="[
        'Options are deep-watched and routed through chart.update(), which diffs',
        'The live chart instance is reachable for zoomTo(), exportImage() and exportData()',
        'SSR-safe: the chart is created on mount, never at module scope',
        'Angular and Solid are on the roadmap — the core will not change to get them',
      ]"
      link-text="See the roadmap"
      :link-href="withBase('/roadmap')"
    >
      <HomeFrameworks />
    </HomeSection>

    <section class="cc-section cc-section--tint">
      <div class="cc-wrap">
        <div class="cc-codehead" data-cc-reveal>
          <p class="cc-eyebrow">Code to result</p>
          <h2 class="cc-h2">This much code, that much chart</h2>
          <p class="cc-lede">
            Axes are inferred from the data. The legend appears because there are two series.
            Tooltips, keyboard navigation and the data table are already on. Nothing below is
            abbreviated for the pitch — it is the whole thing.
          </p>
        </div>
        <div data-cc-reveal>
          <HomeCode />
        </div>
      </div>
    </section>

    <HomeCta />
  </div>
</template>

<style scoped>
.cc-codehead {
  margin-bottom: 32px;
}
</style>
