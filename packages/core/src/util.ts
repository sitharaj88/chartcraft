/** Internal shared utilities. Zero dependencies, SSR-safe. */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    Object.getPrototypeOf(v) !== null &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(Object.getPrototypeOf(v)) === null)
  );
}

/**
 * Deep merge for options objects. Plain objects merge recursively; arrays,
 * functions, Dates, class instances and primitives replace wholesale.
 * `undefined` values in the patch are ignored (keep existing).
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (pv === undefined) continue;
    const bv = out[key];
    out[key] = isPlainObject(bv) && isPlainObject(pv) ? deepMerge(bv, pv) : pv;
  }
  return out as T;
}

/** Round away floating point noise (for tick values). */
export function roundFP(v: number): number {
  if (!Number.isFinite(v)) return v;
  if (Math.abs(v) < 1e-12) return 0;
  return Number(v.toPrecision(12));
}

/** Human-friendly default number formatting for ticks/tooltips. */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = roundFP(v);
  const abs = Math.abs(r);
  if (abs >= 1e9) return trimZeros(r / 1e9) + 'B';
  if (abs >= 1e6) return trimZeros(r / 1e6) + 'M';
  if (abs >= 1e4) return trimZeros(r / 1e3) + 'k';
  return String(r);
}

function trimZeros(v: number): string {
  return String(roundFP(Math.round(v * 100) / 100));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(v: number): string {
  return v < 10 ? '0' + v : String(v);
}

/**
 * Default date formatting; granularity chosen from the visible span in ms.
 */
export function formatDate(d: Date, spanMs = 0): string {
  const DAY = 864e5;
  if (spanMs > 0 && spanMs >= 365 * DAY * 2) return String(d.getFullYear());
  if (spanMs > 0 && spanMs >= 60 * DAY) return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (spanMs === 0 || spanMs >= DAY) {
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  if (spanMs >= 6e4) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Default formatting for any x/y value. */
export function formatValue(v: number | Date | string | null, spanMs = 0): string {
  if (v === null || v === undefined) return '—';
  if (v instanceof Date) return formatDate(v, spanMs);
  if (typeof v === 'number') return formatNumber(v);
  return String(v);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let uidCounter = 0;
export function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/** rAF that degrades to setTimeout outside the browser. */
export function raf(cb: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

export function caf(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}
