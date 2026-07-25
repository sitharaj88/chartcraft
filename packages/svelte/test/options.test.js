/**
 * Logic tests for the plain-JS helpers used by the Svelte components
 * (compiling .svelte in vitest needs plugins not present in this repo, so the
 * component wiring is exercised through these helpers plus type-level checks).
 */
import { describe, expect, it } from 'vitest';
import { EVENTS, withType } from '../src/options.js';

describe('withType', () => {
  it('injects the given type into type-less options', () => {
    const options = { data: { series: [{ name: 'One', data: [1, 2] }] }, title: 'T' };
    expect(withType(options, 'line')).toEqual({ ...options, type: 'line' });
  });

  it('never mutates the input and always wins over a pre-existing type', () => {
    const options = { type: 'bar', data: { series: [] } };
    const result = withType(options, 'pie');
    expect(result.type).toBe('pie');
    expect(options.type).toBe('bar');
    expect(result).not.toBe(options);
    expect(result.data).toBe(options.data); // shallow merge: nested refs preserved
  });
});

describe('EVENTS', () => {
  it('lists exactly the four bridged core events, in a stable order', () => {
    expect(EVENTS).toEqual(['pointclick', 'pointenter', 'pointleave', 'legendtoggle']);
  });
});
