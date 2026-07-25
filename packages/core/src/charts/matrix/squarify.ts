/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, "Squarified
 * Treemaps"). Pure function, unit tested with exact numeric assertions.
 *
 * Rows are laid along the shorter side of the free rectangle; an item joins
 * the current row only while it does not worsen the row's worst aspect
 * ratio. Internally items are processed in descending area order (as the
 * paper prescribes) but the returned rects are in INPUT order so callers can
 * keep palette-slot / hierarchy ordering.
 */
import type { Rect } from '../../layout';

interface Item {
  i: number;
  area: number;
}

/** Worst aspect ratio of a row with total area `sum`, extremes and side length. */
function worst(sum: number, minA: number, maxA: number, side: number): number {
  const s2 = sum * sum;
  const w2 = side * side;
  return Math.max((w2 * maxA) / s2, s2 / (w2 * minA));
}

/**
 * Lay out `values` into `rect`. Returns one Rect per value, preserving input
 * order; each rect's area is proportional to its (positive) value. Values
 * <= 0 (or non-finite) produce zero-size rects at the rect origin.
 */
export function squarify(values: readonly number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array(values.length);
  const zero: Rect = { x: rect.x, y: rect.y, w: 0, h: 0 };

  let total = 0;
  for (const v of values) if (Number.isFinite(v) && v > 0) total += v;
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) {
    for (let i = 0; i < values.length; i++) out[i] = { ...zero };
    return out;
  }

  const scale = (rect.w * rect.h) / total;
  const items: Item[] = [];
  values.forEach((v, i) => {
    if (Number.isFinite(v) && v > 0) items.push({ i, area: v * scale });
    else out[i] = { ...zero };
  });
  items.sort((a, b) => b.area - a.area);

  let free: Rect = { ...rect };
  let row: Item[] = [];
  let rowArea = 0;
  let minA = Infinity;
  let maxA = 0;

  const flushRow = (): void => {
    if (row.length === 0) return;
    if (free.w >= free.h) {
      // Row is a vertical strip on the left, items stacked top-to-bottom.
      const w = rowArea / free.h;
      let y = free.y;
      for (const it of row) {
        const h = it.area / w;
        out[it.i] = { x: free.x, y, w, h };
        y += h;
      }
      free = { x: free.x + w, y: free.y, w: free.w - w, h: free.h };
    } else {
      // Row is a horizontal strip on top, items placed left-to-right.
      const h = rowArea / free.w;
      let x = free.x;
      for (const it of row) {
        const w = it.area / h;
        out[it.i] = { x, y: free.y, w, h };
        x += w;
      }
      free = { x: free.x, y: free.y + h, w: free.w, h: free.h - h };
    }
    row = [];
    rowArea = 0;
    minA = Infinity;
    maxA = 0;
  };

  for (const it of items) {
    const side = Math.min(free.w, free.h);
    if (row.length > 0) {
      const cur = worst(rowArea, minA, maxA, side);
      const nMin = Math.min(minA, it.area);
      const nMax = Math.max(maxA, it.area);
      const next = worst(rowArea + it.area, nMin, nMax, side);
      if (next > cur) flushRow();
    }
    row.push(it);
    rowArea += it.area;
    if (it.area < minA) minA = it.area;
    if (it.area > maxA) maxA = it.area;
  }
  flushRow();
  return out;
}
