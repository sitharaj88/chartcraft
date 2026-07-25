import { describe, expect, it } from 'vitest';
import { LinearScale, niceTicks, tickStep } from '../src/scales/linear';

describe('tickStep', () => {
  it('picks 1/2/5 * 10^k steps', () => {
    expect(tickStep(0, 10, 5)).toBe(2);
    expect(tickStep(0, 100, 5)).toBe(20);
    expect(tickStep(0, 1, 5)).toBe(0.2);
    expect(tickStep(0, 7, 7)).toBe(1);
    expect(tickStep(0, 50, 5)).toBe(10);
  });

  it('handles zero/degenerate spans', () => {
    expect(tickStep(5, 5, 5)).toBe(1);
  });
});

describe('niceTicks', () => {
  it('generates ticks inside the domain at nice multiples', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('handles non-zero-anchored and negative domains', () => {
    expect(niceTicks(-10, 10, 4)).toEqual([-10, -5, 0, 5, 10]);
    expect(niceTicks(3, 17, 5)).toEqual([4, 6, 8, 10, 12, 14, 16]);
  });

  it('handles reversed domains', () => {
    expect(niceTicks(10, 0, 5)).toEqual([10, 8, 6, 4, 2, 0]);
  });

  it('avoids floating point noise', () => {
    for (const t of niceTicks(0, 0.7, 7)) {
      expect(String(t).length).toBeLessThan(6);
    }
  });
});

describe('LinearScale', () => {
  it('maps domain to range linearly and inverts', () => {
    const s = new LinearScale([0, 100], [0, 500]);
    expect(s.scale(0)).toBe(0);
    expect(s.scale(50)).toBe(250);
    expect(s.scale(100)).toBe(500);
    expect(s.invert(250)).toBe(50);
  });

  it('supports inverted (screen-y) ranges', () => {
    const s = new LinearScale([0, 10], [400, 0]);
    expect(s.scale(0)).toBe(400);
    expect(s.scale(10)).toBe(0);
    expect(s.scale(5)).toBe(200);
  });

  it('nice() extends domain to step multiples', () => {
    const s = new LinearScale([3, 97], [0, 1]).nice(5);
    expect(s.domain()).toEqual([0, 100]);
  });

  it('ticks() returns nice ticks within the domain', () => {
    const s = new LinearScale([0, 10], [0, 1]);
    expect(s.ticks(5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('degenerate domain does not produce NaN', () => {
    const s = new LinearScale([5, 5], [0, 100]);
    expect(s.scale(5)).toBe(50);
  });
});
