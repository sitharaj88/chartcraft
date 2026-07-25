/**
 * Seeded data generators for the benchmarks.
 *
 * Every generator is deterministic (`rng`, never `Math.random`) so a before/after
 * comparison measures the CODE and not a different random walk.
 */
import { rng } from './harness';
import type { ChartOptions, DataPoint, TreeNode } from '../src/types';

/** n points of a noisy sine, as `[x, y]` tuples on a continuous x axis. */
export function xyTuples(n: number, seed = 1): [number, number][] {
  const rand = rng(seed);
  const out = new Array<[number, number]>(n);
  for (let i = 0; i < n; i++) out[i] = [i, Math.sin(i / 25) * 100 + rand() * 10];
  return out;
}

/** n categories with one value each. */
export function categories(n: number): string[] {
  const out = new Array<string>(n);
  for (let i = 0; i < n; i++) out[i] = `cat-${i}`;
  return out;
}

export function values(n: number, seed = 2): number[] {
  const rand = rng(seed);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 1000;
  return out;
}

/** A rows x cols heat map: one series per row. */
export function matrix(rows: number, cols: number, seed = 3): ChartOptions['data'] {
  const rand = rng(seed);
  return {
    categories: categories(cols),
    series: Array.from({ length: rows }, (_, r) => ({
      name: `row-${r}`,
      data: Array.from({ length: cols }, () => rand() * 100),
    })),
  };
}

/** A layered DAG: `nodes` nodes across ~6 layers, `links` edges, no cycles. */
export function dag(nodes: number, links: number, seed = 4): { nodes: { id: string; label: string }[]; links: { source: string; target: string; value: number }[] } {
  const rand = rng(seed);
  const layers = 6;
  const per = Math.max(1, Math.ceil(nodes / layers));
  const n = Array.from({ length: nodes }, (_, i) => ({ id: `n${i}`, label: `N${i}` }));
  const l: { source: string; target: string; value: number }[] = [];
  for (let i = 0; i < links; i++) {
    // Always forward-going (layer L -> layer L+1), so the graph is acyclic.
    const fromLayer = Math.floor(rand() * (layers - 1));
    const a = fromLayer * per + Math.floor(rand() * per);
    const b = (fromLayer + 1) * per + Math.floor(rand() * per);
    if (a >= nodes || b >= nodes || a === b) continue;
    l.push({ source: `n${a}`, target: `n${b}`, value: 1 + Math.floor(rand() * 20) });
  }
  return { nodes: n, links: l };
}

/** An undirected-ish graph for the force layout: `nodes` nodes, `links` edges. */
export function graph(nodes: number, links: number, seed = 5): { nodes: { id: string; group: string; value: number }[]; links: { source: string; target: string }[] } {
  const rand = rng(seed);
  return {
    nodes: Array.from({ length: nodes }, (_, i) => ({ id: `n${i}`, group: `g${i % 6}`, value: 1 + Math.floor(rand() * 30) })),
    links: Array.from({ length: links }, () => ({
      source: `n${Math.floor(rand() * nodes)}`,
      target: `n${Math.floor(rand() * nodes)}`,
    })),
  };
}

/** A two-level tree with `leaves` leaves spread over `groups` top-level nodes. */
export function tree(leaves: number, groups = 12, seed = 6): TreeNode[] {
  const rand = rng(seed);
  const per = Math.max(1, Math.round(leaves / groups));
  return Array.from({ length: groups }, (_, g) => ({
    label: `g${g}`,
    children: Array.from({ length: per }, (_, i) => ({ label: `n${g}-${i}`, value: 1 + rand() * 100 })),
  }));
}

/** `n` weighted terms, descending by weight (wordcloud rank order). */
export function terms(n: number, seed = 7): DataPoint[] {
  const rand = rng(seed);
  return Array.from({ length: n }, (_, i) => ({ x: `term${i}-${'x'.repeat(1 + (i % 7))}`, y: n - i + rand() }));
}
