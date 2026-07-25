<script setup lang="ts">
/**
 * The section label above every page's `h1`.
 *
 * The landing page opens each section with a small uppercase eyebrow; inner
 * pages get the same device, filled from the sidebar so it stays correct for
 * all ~60 pages with no per-page frontmatter. It renders the ANCESTOR groups
 * only — "Examples · Flow & schedule" over an `h1` that already says
 * "Sankey" — so it orients without repeating the title.
 *
 * Plain text, not links: sidebar groups have no `link` of their own, and
 * inventing one would mean inventing a URL.
 */
import { computed } from 'vue';
import { useData } from 'vitepress';

interface SidebarItem {
  text?: string;
  link?: string;
  items?: SidebarItem[];
}

const { page, theme, frontmatter } = useData();

/** `examples/sankey.md` → `/examples/sankey`; `examples/index.md` → `/examples/`. */
const current = computed(() => {
  const path = page.value.relativePath.replace(/\.md$/, '');
  return `/${path.replace(/(^|\/)index$/, '$1')}`;
});

function normalize(link: string): string {
  return link.replace(/\.(md|html)$/, '').replace(/(^|\/)index$/, '$1');
}

/** Depth-first walk; returns the ancestor group texts of the matching link. */
function trailTo(items: SidebarItem[] | undefined, trail: string[]): string[] | null {
  for (const item of items ?? []) {
    if (item.link && normalize(item.link) === current.value) return trail;
    if (item.items) {
      const found = trailTo(item.items, item.text ? [...trail, item.text] : trail);
      if (found) return found;
    }
  }
  return null;
}

const crumbs = computed<string[]>(() => {
  if (frontmatter.value.eyebrow === false) return [];
  const sidebar = theme.value.sidebar as SidebarItem[] | Record<string, unknown> | undefined;
  // Multi-sidebar configs key groups by path prefix; ChartCraft uses the
  // array form, but handle both rather than silently rendering nothing.
  const groups: SidebarItem[] = Array.isArray(sidebar)
    ? sidebar
    : Object.values(sidebar ?? {}).flatMap((value) =>
        Array.isArray(value) ? (value as SidebarItem[]) : [],
      );
  return trailTo(groups, []) ?? [];
});
</script>

<template>
  <p v-if="crumbs.length" class="cc-doc-eyebrow">
    <template v-for="(crumb, i) in crumbs" :key="crumb">
      <span v-if="i > 0" class="cc-doc-eyebrow__sep" aria-hidden="true">·</span>
      <span>{{ crumb }}</span>
    </template>
  </p>
</template>
