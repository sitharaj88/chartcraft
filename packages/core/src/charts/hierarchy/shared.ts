/**
 * Shared helpers for the v0.3 hierarchy & text-layout chart types
 * (`icicle`, `circlepack`, `wordcloud`).
 *
 * The tree machinery itself is NOT re-implemented here: `buildHierarchy`,
 * `treeRoots`, `hierarchyTableRows`, `formatShare` and the node counters live
 * in `../matrix/hierarchy` and are imported read-only, so icicle/circlepack
 * inherit the treemap's value semantics (parent value = sum of children) and
 * its coloring rules verbatim — top-level nodes take the categorical palette
 * slots IN ORDER, descendants are lightness steps of the parent hue (mixed
 * toward the theme surface). No hierarchy chart ever invents a hue.
 *
 * `fitLabel`, `insetRect` and the legend-auto policy are small local copies of
 * their treemap counterparts on purpose: this folder must not depend on a
 * sibling chart-type MODULE (only on the pure hierarchy/color helpers), which
 * keeps `hierarchy/` outside the documented `matrix -> pie -> model ->
 * charts/index` ESM cycle risk. See DEVIATIONS.md.
 */
import type { ChartOptions } from '../../types';
import { dataValuesOf } from '../../data/normalize';
import type { Rect } from '../../layout';
import type { ResolvedOptions } from '../../model';
import type { LegendItem } from '../../components/legend';
import type { DefinitionContext } from '../registry';
import { buildHierarchy, treeRoots, type Hierarchy } from '../matrix/hierarchy';

/** 2px surface gap between adjacent marks (contract) — each mark insets 1px. */
export const HIERARCHY_GAP = 2;

/** Padding between a direct label and its cell edge. */
export const LABEL_PAD = 4;

/**
 * Build the colored hierarchy for a pipeline context.
 *
 * Values must come from the RAW options data (the generic normalizer folds
 * object data through `DataPoint.y`, so a `TreeNode.value` never reaches the
 * model); `treeRoots` handles that, plus visibility and the tolerated
 * flat-number shape.
 */
export function buildHierarchyFor(ctx: Pick<DefinitionContext, 'model' | 'opts' | 'theme'>): {
  h: Hierarchy;
  si: number;
} {
  const { roots, si } = treeRoots(
    ctx.model,
    ctx.opts.data.series.map((s) => dataValuesOf(s.data)),
  );
  return { h: buildHierarchy(roots, ctx.theme), si };
}

/**
 * Legend-auto policy for the TreeNode types: keys off the TOP-LEVEL node
 * count (not the series count — there is only ever one series), so a single
 * root hides the legend because there is nothing to distinguish.
 */
export function hierarchyLegendPolicy(resolved: ResolvedOptions, raw: ChartOptions): void {
  const rawShow = typeof raw.legend === 'boolean' ? raw.legend : raw.legend?.show;
  if (rawShow !== undefined) return;
  const topCount = dataValuesOf(raw.data?.series?.[0]?.data).filter((d) => d !== null && d !== undefined).length;
  resolved.legend.show = topCount >= 2;
}

/** Top-level nodes as legend entries, non-toggleable (same rule as treemap). */
export function topLevelLegendItems(h: Hierarchy): LegendItem[] {
  return h.roots.map((n, i) => ({
    id: `node:${i}`,
    name: n.label,
    color: n.color,
    visible: true,
    toggleable: false,
  }));
}

/** Ellipsize `text` to fit `maxW` (measured); null when nothing fits. */
export function fitLabel(text: string, maxW: number, measure: (t: string) => number): string | null {
  if (maxW <= 0) return null;
  if (measure(text) <= maxW) return text;
  for (let n = text.length - 1; n >= 1; n--) {
    const t = `${text.slice(0, n).trimEnd()}…`;
    if (measure(t) <= maxW) return t;
  }
  return null;
}

/** Shrink a rect by `by` on every side (never below zero size). */
export function insetRect(r: Rect, by: number): Rect {
  return {
    x: r.x + by,
    y: r.y + by,
    w: Math.max(0, r.w - by * 2),
    h: Math.max(0, r.h - by * 2),
  };
}

export function rectContains(r: Rect, px: number, py: number): boolean {
  return r.w > 0 && r.h > 0 && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/**
 * Seeded PRNG (mulberry32) — the ONLY source of pseudo-randomness allowed in
 * this folder's layouts. `Math.random()` is banned by the contract ("no
 * `Math.random()` in layout"): every stochastic step (the Welzl shuffle in
 * circle packing, the per-word spiral phase in the word cloud) draws from a
 * generator seeded with a fixed constant, so identical input renders
 * identically forever and layouts are exactly assertable in tests.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place-free deterministic Fisher-Yates using a seeded generator. */
export function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length; i > 1; i--) {
    const j = Math.floor(rand() * i);
    const a = out[i - 1] as T;
    out[i - 1] = out[j] as T;
    out[j] = a;
  }
  return out;
}
