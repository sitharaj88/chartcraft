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
 * Ingest clone for caller-supplied options (v0.3).
 *
 * The contract promises "the chart never mutates the object you pass". The
 * chart DOES mutate its own retained options (a legend toggle flips
 * `series[i].visible`), so ingest has to take ownership of everything it might
 * write to. The rule, chosen to keep that promise without turning a 100k-point
 * series into a deep structural copy:
 *
 * - **plain objects** are cloned recursively (this is where every option the
 *   pipeline writes to lives: `data`, `data.series[i]`, `xAxis`, `legend`, ...);
 * - **arrays** always become a FRESH array (so a caller's array is never
 *   shared), but their ELEMENTS are only cloned when the element is itself a
 *   plain object or an array. A `number[]` sample, a `Float64Array` or an array
 *   of Dates therefore costs one copy of the spine, not one allocation per
 *   datum;
 * - **carried by reference, never cloned:** functions (`ticks.format`,
 *   `tooltip.format`, `dataLabels.format`), `Date`, `RegExp`, `Map`/`Set`,
 *   `ArrayBuffer` views (typed arrays) and every class instance. Cloning those
 *   would either break identity (a `Date` datum, a custom `Theme` class) or
 *   silently drop behavior (a formatter's closure).
 *
 * Consequence worth knowing: object-shaped data (`{ x, y }` points) IS cloned
 * element-wise, because those elements are plain objects and the pipeline hands
 * them to per-type modules that read them as the caller's source of truth. That
 * is one O(n) pass on ingest — the same order as the normalization pass that
 * immediately follows — and it happens once per `createChart`/`update` payload,
 * never per frame.
 *
 * `BY_REFERENCE_KEYS` is the escape hatch for caller-supplied inputs that are
 * (a) read-only to us and (b) potentially enormous. `choropleth.geojson` is the
 * case: a world atlas is megabytes of nested coordinate arrays, nothing in the
 * pipeline ever writes to it, and the projection cache keys on its identity —
 * so cloning it would double the memory and walk hundreds of thousands of
 * coordinate pairs on every mount to protect a mutation that cannot happen.
 * The trade: mutating your GeoJSON in place after mount is undefined behavior
 * (pass a new object instead). Add a key here only when both (a) and (b) hold.
 */
const BY_REFERENCE_KEYS = new Set(['geojson']);

export function deepClone<T>(v: T): T {
  if (Array.isArray(v)) {
    const n = v.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const e = v[i];
      out[i] = isPlainObject(e) || Array.isArray(e) ? deepClone(e) : e;
    }
    return out as unknown as T;
  }
  if (!isPlainObject(v)) return v;
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    const e = src[key];
    if (BY_REFERENCE_KEYS.has(key)) {
      out[key] = e;
      continue;
    }
    out[key] = isPlainObject(e) || Array.isArray(e) ? deepClone(e) : e;
  }
  return out as T;
}

/**
 * Deep merge for options objects. Plain objects merge recursively; arrays,
 * functions, Dates, class instances and primitives replace wholesale.
 * `undefined` values in the patch are ignored (keep existing).
 *
 * Everything taken from `patch` is passed through `deepClone` first, so the
 * merged result never shares a mutable structure with the caller (see
 * `deepClone` for the exact rule). `base` is assumed to be already owned by the
 * chart, so its untouched branches are reused as-is — an `update()` therefore
 * only pays for the payload it was handed.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return deepClone(patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (pv === undefined) continue;
    if (BY_REFERENCE_KEYS.has(key)) {
      out[key] = pv;
      continue;
    }
    const bv = out[key];
    out[key] = isPlainObject(bv) && isPlainObject(pv) ? deepMerge(bv, pv) : deepClone(pv);
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
