import { describe, expect, it } from 'vitest';
import { BandScale } from '../src/scales/band';
import { LogScale } from '../src/scales/log';
import { TimeScale } from '../src/scales/time';

describe('BandScale', () => {
  it('positions bands with padding and computes bandwidth', () => {
    const s = new BandScale(['a', 'b', 'c'], [0, 300]);
    const bw = s.bandwidth();
    const step = s.step();
    expect(bw).toBeGreaterThan(0);
    expect(step).toBeGreaterThan(bw);
    // Bands are evenly spaced.
    expect(s.scale('b') - s.scale('a')).toBeCloseTo(step, 6);
    expect(s.scale('c') - s.scale('b')).toBeCloseTo(step, 6);
  });

  it('scale() accepts values or indices; center() is band midpoint', () => {
    const s = new BandScale(['a', 'b', 'c'], [0, 300]);
    expect(s.scale('b')).toBeCloseTo(s.scale(1), 6);
    expect(s.center(1)).toBeCloseTo(s.scale(1) + s.bandwidth() / 2, 6);
  });

  it('invertIndex() returns the containing band, clamped (full column hit)', () => {
    const s = new BandScale(['a', 'b', 'c'], [0, 300]);
    expect(s.invertIndex(s.center(0))).toBe(0);
    expect(s.invertIndex(s.center(1))).toBe(1);
    expect(s.invertIndex(s.center(2))).toBe(2);
    expect(s.invertIndex(-50)).toBe(0);
    expect(s.invertIndex(500)).toBe(2);
  });

  it('handles numeric and Date categories', () => {
    const d = new Date(2024, 0, 1);
    const s = new BandScale([1, 2, d], [0, 90]);
    expect(s.indexOf(d)).toBe(2);
    expect(s.indexOf(2)).toBe(1);
  });
});

describe('LogScale', () => {
  it('maps decades evenly', () => {
    const s = new LogScale([1, 1000], [0, 300]);
    expect(s.scale(1)).toBeCloseTo(0);
    expect(s.scale(10)).toBeCloseTo(100);
    expect(s.scale(100)).toBeCloseTo(200);
    expect(s.scale(1000)).toBeCloseTo(300);
    expect(s.invert(100)).toBeCloseTo(10);
  });

  it('ticks at powers of ten across many decades', () => {
    const s = new LogScale([1, 1e6], [0, 1]);
    const ticks = s.ticks(7);
    expect(ticks).toContain(1);
    expect(ticks).toContain(1000);
    expect(ticks).toContain(1e6);
  });

  it('includes 2x/5x multiples for narrow domains', () => {
    const s = new LogScale([1, 100], [0, 1]);
    const ticks = s.ticks(8);
    expect(ticks).toEqual([1, 2, 5, 10, 20, 50, 100]);
  });

  it('nice() expands to full decades and guards non-positive domains', () => {
    const s = new LogScale([3, 800], [0, 1]).nice();
    expect(s.domain()).toEqual([1, 1000]);
    const guarded = new LogScale([0, 100]);
    expect(Number.isFinite(guarded.scale(50))).toBe(true);
  });
});

describe('TimeScale', () => {
  it('behaves as a linear scale over ms', () => {
    const t0 = new Date(2024, 0, 1);
    const t1 = new Date(2024, 0, 11);
    const s = new TimeScale([t0, t1], [0, 100]);
    expect(s.scale(t0.getTime())).toBeCloseTo(0);
    expect(s.scale(t1.getTime())).toBeCloseTo(100);
    expect(s.scale(new Date(2024, 0, 6).getTime())).toBeCloseTo(50);
  });

  it('day-span ticks fall on local midnights', () => {
    const s = new TimeScale([new Date(2024, 0, 1, 5), new Date(2024, 0, 9, 5)], [0, 100]);
    const ticks = s.timeTicks(8);
    expect(ticks.length).toBeGreaterThan(2);
    for (const d of ticks) {
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    }
  });

  it('hour-span ticks are aligned and inside the domain', () => {
    const t0 = new Date(2024, 5, 10, 0, 0, 0);
    const t1 = new Date(2024, 5, 10, 12, 0, 0);
    const s = new TimeScale([t0, t1], [0, 100]);
    const ticks = s.timeTicks(6);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    for (const d of ticks) {
      expect(d.getTime()).toBeGreaterThanOrEqual(t0.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(t1.getTime());
    }
  });

  it('multi-year spans tick on year boundaries', () => {
    const s = new TimeScale([new Date(2015, 3, 1), new Date(2024, 8, 1)], [0, 100]);
    const ticks = s.timeTicks(6);
    expect(ticks.length).toBeGreaterThan(1);
    for (const d of ticks) {
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(1);
    }
  });
});
