/**
 * Color-scale helpers shared by the matrix/hierarchy chart types (heatmap,
 * treemap, sunburst). Pure functions — exact-value unit tested.
 *
 * - Sequential ramps interpolate LINEARLY IN RAMP INDEX: a normalized value
 *   t in [0, 1] lands between two adjacent ramp steps and mixes them.
 * - Hierarchy children take lightness steps of the parent hue by mixing the
 *   parent color toward the theme surface color (never new palette slots).
 * - Direct labels pick a contrasting ink from the cell's luminance.
 */

/** Parse `#rgb` / `#rrggbb` into [r, g, b] (0-255). */
export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function channelHex(v: number): string {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return c.toString(16).padStart(2, '0');
}

export function toHex(r: number, g: number, b: number): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

/** Linear RGB mix of two hex colors. t = 0 -> a, t = 1 -> b. */
export function mixHex(a: string, b: string, t: number): string {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex(ar + (br - ar) * tt, ag + (bg - ag) * tt, ab + (bb - ab) * tt);
}

/**
 * Sample a sequential ramp at normalized position t in [0, 1] (clamped),
 * interpolating linearly in ramp index between adjacent steps.
 *
 * A non-finite `t` samples the ramp START rather than indexing off the end.
 * `NaN` fails every comparison, so a bare `t < 0 ? … : t > 1 ? … : t` clamp
 * passes it straight through to `Math.floor(NaN)` → `ramp[NaN]` → `undefined`,
 * which used to throw out of `parseHex`. Callers compute `t` as
 * `(value - min) / (max - min)`, so a degenerate extent or a non-finite datum
 * reaches here as `NaN`/`±Infinity` and must degrade, never throw.
 */
export function rampColor(ramp: readonly string[], t: number): string {
  if (ramp.length === 0) return '#000000';
  const first = ramp[0] as string;
  if (ramp.length === 1) return first;
  if (!Number.isFinite(t)) return first;
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const f = tt * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(f));
  return mixHex(ramp[i] as string, ramp[i + 1] as string, f - i);
}

/** WCAG relative luminance of a hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Contrasting ink for text drawn directly on a colored mark: dark ink on
 * light cells, white ink on dark cells.
 */
export function contrastInk(bg: string): string {
  return relativeLuminance(bg) > 0.45 ? '#0b0b0b' : '#ffffff';
}
