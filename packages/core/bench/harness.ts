/**
 * Benchmark harness: seeded PRNG, timing, and table printing.
 *
 * Determinism note: the bench uses `rng`, never `Math.random()` — the same
 * reason the contract bans it in layout. A benchmark whose input changes run to
 * run cannot support a before/after claim.
 */

/** mulberry32 — small, fast, seeded. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Row {
  group: string;
  case: string;
  n: string;
  ms: number;
  /** Units the measurement amortizes over, for the per-unit column. */
  units?: number;
  note?: string;
}

const rows: Row[] = [];

export function record(row: Row): void {
  rows.push(row);
}

/**
 * Time `fn` and return the MEDIAN ms/op over `iterations` measured passes after
 * one warm-up pass. Median, not mean: a single GC pause should not become the
 * headline number.
 */
export function time(iterations: number, fn: () => void): number {
  fn(); // warm-up (JIT + first-touch allocation)
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] as number;
}

/** Time + record in one call. */
export function bench(
  group: string,
  name: string,
  n: string,
  iterations: number,
  fn: () => void,
  opts?: { units?: number; note?: string },
): number {
  const ms = time(iterations, fn);
  const row: Row = { group, case: name, n, ms };
  if (opts?.units !== undefined) row.units = opts.units;
  if (opts?.note) row.note = opts.note;
  record(row);
  return ms;
}

function pad(s: string, w: number, right = false): string {
  return right ? s.padStart(w) : s.padEnd(w);
}

export function printTable(): void {
  const head = ['group', 'case', 'size', 'ms', 'us/unit', 'note'];
  const body = rows.map((r) => [
    r.group,
    r.case,
    r.n,
    r.ms === 0 ? '' : r.ms.toFixed(r.ms < 10 ? 3 : 1),
    r.units ? ((r.ms * 1000) / r.units).toFixed(3) : '',
    r.note ?? '',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => (b[i] as string).length)));
  const line = (cells: string[], rightAlign: boolean): string =>
    cells.map((c, i) => pad(c, widths[i] as number, rightAlign && (i === 3 || i === 4))).join('  ');
  console.log('');
  console.log(line(head, false));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const b of body) console.log(line(b as string[], true));
  console.log('');
}

export function heading(text: string): void {
  console.log(`\n### ${text}`);
}

/**
 * Heap growth in MB across `fn`, with a forced GC either side when the process
 * was started with `--expose-gc` (the bench script passes it). Best effort: a
 * number near zero means "no retained per-frame garbage", a large number means
 * the hot path allocates.
 */
export function heapDelta(fn: () => void): number {
  const g = (globalThis as { gc?: () => void }).gc;
  g?.();
  const before = process.memoryUsage().heapUsed;
  fn();
  g?.();
  const after = process.memoryUsage().heapUsed;
  return (after - before) / 1048576;
}

export function allRows(): readonly Row[] {
  return rows;
}
