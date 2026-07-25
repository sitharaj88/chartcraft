import { describe, expect, it } from 'vitest';
import { computeStacks, stackExtent } from '../src/data/stack';
import { normalizeSeriesData } from '../src/data/normalize';

const pts = (ys: (number | null)[]) => normalizeSeriesData(ys, null);

describe('computeStacks', () => {
  it('stacks positive values cumulatively in series order', () => {
    const stacks = computeStacks([pts([1, 2]), pts([3, 4])]);
    expect(stacks[0]!.y0).toEqual([0, 0]);
    expect(stacks[0]!.y1).toEqual([1, 2]);
    expect(stacks[1]!.y0).toEqual([1, 2]);
    expect(stacks[1]!.y1).toEqual([4, 6]);
  });

  it('stacks negative values downward independently (diverging)', () => {
    const stacks = computeStacks([pts([2, -2]), pts([-3, 3]), pts([1, -1])]);
    // Series 0: +2 then -2.
    expect(stacks[0]!.y1).toEqual([2, -2]);
    // Series 1: -3 stacks below zero; +3 stacks above zero.
    expect(stacks[1]!.y0).toEqual([0, 0]);
    expect(stacks[1]!.y1).toEqual([-3, 3]);
    // Series 2: +1 goes on top of +2; -1 below -2.
    expect(stacks[2]!.y0).toEqual([2, -2]);
    expect(stacks[2]!.y1).toEqual([3, -3]);
  });

  it('null values create null stack bounds and contribute nothing', () => {
    const stacks = computeStacks([pts([1, null]), pts([2, 5])]);
    expect(stacks[0]!.y0[1]).toBeNull();
    expect(stacks[0]!.y1[1]).toBeNull();
    // Second series at index 1 starts from 0 (the null contributed nothing).
    expect(stacks[1]!.y0[1]).toBe(0);
    expect(stacks[1]!.y1[1]).toBe(5);
  });

  it('handles unequal series lengths', () => {
    const stacks = computeStacks([pts([1]), pts([2, 3])]);
    expect(stacks[1]!.y1).toEqual([3, 3]);
  });
});

describe('stackExtent', () => {
  it('covers the full stacked range including zero', () => {
    const stacks = computeStacks([pts([1, 2]), pts([3, 4])]);
    expect(stackExtent(stacks)).toEqual([0, 6]);
  });

  it('includes negative stack depth', () => {
    const stacks = computeStacks([pts([2, -2]), pts([-3, 3])]);
    const [lo, hi] = stackExtent(stacks);
    expect(lo).toBe(-3);
    expect(hi).toBe(3);
  });
});
