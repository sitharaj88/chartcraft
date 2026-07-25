/**
 * Minimal benchmark for the pure hot paths: LTTB downsampling and
 * scale/tick math at 10k–1M points.
 *
 * Run from packages/core:
 *   npm run bench
 * (compiles this file with tsup, then runs it with plain node — no ts runner)
 */
import { downsampleLTTB } from '../src/data/downsample';
import { LinearScale } from '../src/scales/linear';

function bench(name: string, iterations: number, fn: () => void): void {
  fn(); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = (performance.now() - t0) / iterations;
  console.log(`${name.padEnd(44)} ${ms.toFixed(2).padStart(8)} ms/op`);
}

function makeSeries(n: number): { x: number; y: number }[] {
  const out = new Array<{ x: number; y: number }>(n);
  for (let i = 0; i < n; i++) {
    out[i] = { x: i, y: Math.sin(i / 25) * 100 + Math.random() * 10 };
  }
  return out;
}

console.log('@chartcraft/core benchmarks\n');

for (const n of [10_000, 100_000, 1_000_000]) {
  const data = makeSeries(n);
  bench(`LTTB ${n.toLocaleString()} -> 1,000 points`, n >= 1_000_000 ? 3 : 10, () => {
    downsampleLTTB(data, 1000);
  });
}

const scale = new LinearScale([0, 1_000_000], [0, 800]);
bench('LinearScale.scale x 1,000,000', 10, () => {
  let acc = 0;
  for (let i = 0; i < 1_000_000; i++) acc += scale.scale(i);
  if (acc === Infinity) throw new Error('unreachable');
});

bench('nice ticks x 10,000 domains', 10, () => {
  for (let i = 1; i <= 10_000; i++) scale.ticks(5);
});

console.log('\ndone');
