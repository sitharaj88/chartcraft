import { describe, expect, it } from 'vitest';
import { downsampleLTTB } from '../src/data/downsample';

const wave = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: Math.sin(i / 5) * 100 }));

describe('downsampleLTTB', () => {
  it('returns input untouched when below threshold', () => {
    const data = wave(50);
    expect(downsampleLTTB(data, 100)).toBe(data);
    expect(downsampleLTTB(data, 50)).toBe(data);
  });

  it('reduces to exactly the threshold length', () => {
    const data = wave(1000);
    expect(downsampleLTTB(data, 100)).toHaveLength(100);
    expect(downsampleLTTB(data, 3)).toHaveLength(3);
  });

  it('always keeps the first and last points', () => {
    const data = wave(500);
    const out = downsampleLTTB(data, 20);
    expect(out[0]).toBe(data[0]);
    expect(out.at(-1)).toBe(data.at(-1));
  });

  it('preserves x ordering', () => {
    const out = downsampleLTTB(wave(2000), 50);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.x).toBeGreaterThan(out[i - 1]!.x);
    }
  });

  it('preserves extreme peaks (visual fidelity)', () => {
    // A flat series with one huge spike: LTTB must keep the spike.
    const data = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: i === 500 ? 1000 : 0 }));
    const out = downsampleLTTB(data, 20);
    expect(out.some((p) => p.y === 1000)).toBe(true);
  });

  it('preserves both min and max of an oscillating series', () => {
    const data = wave(5000);
    const out = downsampleLTTB(data, 100);
    const maxIn = Math.max(...data.map((p) => p.y));
    const maxOut = Math.max(...out.map((p) => p.y));
    const minOut = Math.min(...out.map((p) => p.y));
    expect(maxOut).toBeGreaterThan(maxIn * 0.98);
    expect(minOut).toBeLessThan(-maxIn * 0.98);
  });

  it('degenerate thresholds', () => {
    const data = wave(10);
    expect(downsampleLTTB(data, 1)).toEqual([data[0]]);
    expect(downsampleLTTB(data, 2)).toEqual([data[0], data[9]]);
  });
});
