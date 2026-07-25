/**
 * Point-marker shapes.
 *
 * Marks are circles by default and stay circles for every series inside the
 * validated 8-slot palette. The other shapes exist for ONE reason: when a chart
 * has more series than there are colorblind-safe hues, the repeat of the hue
 * order must not be visually identical to its first pass. Shape is the second
 * channel (dash pattern is the other — see `model.ts#seriesDash`), which is what
 * the dataviz rules permit in place of folding the tail into "Other".
 *
 * Every shape is drawn to the same nominal DIAMETER (2 * r) so no shape reads as
 * larger than another, and all carry the same 2px surface ring as the circle.
 */
import type { DrawOpts, PathCmd, Renderer } from '../render/renderer';

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

/**
 * Draw one marker of `shape` centered at (cx, cy) with radius `r`
 * (half the nominal diameter), using the same DrawOpts a circle would take.
 */
export function drawMarker(
  r: Renderer,
  shape: MarkerShape,
  cx: number,
  cy: number,
  radius: number,
  opts: DrawOpts,
): void {
  if (radius <= 0) return;
  if (shape === 'circle') {
    r.circle(cx, cy, radius, opts);
    return;
  }
  if (shape === 'square') {
    // Side chosen so the square's AREA matches the circle's, not its bounding
    // box — an inscribed square would read as the smaller mark.
    const half = radius * 0.886;
    r.rect(cx - half, cy - half, half * 2, half * 2, opts);
    return;
  }
  r.path(markerPath(shape, cx, cy, radius), opts);
}

/** Path commands for the polygonal shapes (exported for exact-value tests). */
export function markerPath(
  shape: 'triangle' | 'diamond',
  cx: number,
  cy: number,
  radius: number,
): PathCmd[] {
  if (shape === 'diamond') {
    // Area-matched to the circle: a square rotated 45 degrees needs a longer
    // half-diagonal than the circle's radius to cover the same area.
    const d = radius * 1.253;
    return [
      ['M', cx, cy - d],
      ['L', cx + d, cy],
      ['L', cx, cy + d],
      ['L', cx - d, cy],
      ['Z'],
    ];
  }
  // Equilateral triangle, area-matched, pointing up. An equilateral triangle of
  // circumradius R has area (3*sqrt(3)/4) R^2, so matching pi*r^2 needs
  // R = r * sqrt(4*pi/(3*sqrt(3))) ~= 1.5551 r. Inscribing it in the marker
  // radius instead would draw a mark ~25% smaller than the circle beside it.
  const R = radius * 1.5551;
  const cos30 = Math.sqrt(3) / 2;
  return [
    ['M', cx, cy - R],
    ['L', cx + R * cos30, cy + R / 2],
    ['L', cx - R * cos30, cy + R / 2],
    ['Z'],
  ];
}
