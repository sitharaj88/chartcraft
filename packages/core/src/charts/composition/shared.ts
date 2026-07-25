/**
 * Shared helpers for the COMPOSITION chart family (v0.3):
 * `streamgraph`, `marimekko`, `pyramid`, `calendar`.
 *
 * Everything here is pure and DOM-free so the layout math of all four types is
 * unit-testable without mounting a chart. The types themselves are ordinary
 * `ChartTypeDefinition` modules (see ../AUTHORING.md) — nothing in this folder
 * touches the pipeline.
 */
import type { Rect } from '../../layout';
import type { DataModel } from '../../model';
import { formatValue } from '../../util';

/**
 * 2px surface-colored gap between adjacent marks — the contract's mark spec
 * (and marimekko's "2px surface gaps" in both directions).
 */
export const COMPOSITION_GAP = 2;

/** Hairline width for separators (month boundaries, magnitude gridlines). */
export const HAIRLINE = 1;

export interface RectInset {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Shrink a rect by per-side insets, never below 1px in either dimension. */
export function insetRect(rect: Rect, ins: RectInset): Rect {
  const top = ins.top ?? 0;
  const right = ins.right ?? 0;
  const bottom = ins.bottom ?? 0;
  const left = ins.left ?? 0;
  return {
    x: rect.x + left,
    y: rect.y + top,
    w: Math.max(1, rect.w - left - right),
    h: Math.max(1, rect.h - top - bottom),
  };
}

/**
 * Linear value -> pixel mapper. Pass a descending pixel range (`p0 > p1`) for
 * a screen y axis. A degenerate domain maps everything to the range center.
 */
export function linearMap(d0: number, d1: number, p0: number, p1: number): (v: number) => number {
  const span = d1 - d0;
  if (span === 0) {
    const mid = (p0 + p1) / 2;
    return () => mid;
  }
  return (v: number) => p0 + ((v - d0) / span) * (p1 - p0);
}

/** Finite non-negative magnitude of a value (nulls/NaN/negatives -> 0). */
export function magnitude(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Finite value or 0 (sign preserved). */
export function finite(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function sumFinite(vs: readonly (number | null | undefined)[]): number {
  let acc = 0;
  for (const v of vs) acc += finite(v);
  return acc;
}

/**
 * Share as a percentage with at most one decimal:
 * `0.3 -> '30%'`, `0.125 -> '12.5%'`, non-finite -> `'—'`.
 */
export function formatShare(share: number): string {
  if (!Number.isFinite(share)) return '—';
  return `${Math.round(share * 1000) / 10}%`;
}

/**
 * Category (column) labels, index-aligned to `count`, falling back to 1-based
 * indices when the model has no category for a slot.
 */
export function columnLabels(model: DataModel, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const cat = model.categories?.[i];
    out.push(cat !== undefined ? formatValue(cat) : String(i + 1));
  }
  return out;
}

/** MODEL indices of visible series, in model order. */
export function visibleIndices(model: DataModel): number[] {
  const out: number[] = [];
  model.series.forEach((s, si) => {
    if (s.visible) out.push(si);
  });
  return out;
}

/** Read a definition's `extra` geometry back out of a TypeGeom. */
export function extraOf<T>(geom: { extra?: unknown }): T | null {
  return (geom.extra as T | undefined) ?? null;
}
