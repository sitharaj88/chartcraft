import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../src/events';

interface M extends Record<string, unknown> {
  a: { v: number };
  b: string;
}

describe('Emitter', () => {
  it('delivers events to subscribed handlers with payload', () => {
    const e = new Emitter<M>();
    const fn = vi.fn();
    e.on('a', fn);
    e.emit('a', { v: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ v: 1 });
  });

  it('on() returns an unsubscribe function', () => {
    const e = new Emitter<M>();
    const fn = vi.fn();
    const off = e.on('a', fn);
    off();
    e.emit('a', { v: 2 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() removes a specific handler only', () => {
    const e = new Emitter<M>();
    const f1 = vi.fn();
    const f2 = vi.fn();
    e.on('a', f1);
    e.on('a', f2);
    e.off('a', f1);
    e.emit('a', { v: 3 });
    expect(f1).not.toHaveBeenCalled();
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it('handlers for other event types are not invoked', () => {
    const e = new Emitter<M>();
    const fn = vi.fn();
    e.on('b', fn);
    e.emit('a', { v: 4 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('a handler unsubscribing itself during emit does not break others', () => {
    const e = new Emitter<M>();
    const calls: string[] = [];
    const off = e.on('a', () => {
      calls.push('first');
      off();
    });
    e.on('a', () => calls.push('second'));
    e.emit('a', { v: 5 });
    expect(calls).toEqual(['first', 'second']);
    e.emit('a', { v: 6 });
    expect(calls).toEqual(['first', 'second', 'second']);
  });

  it('clear() removes everything', () => {
    const e = new Emitter<M>();
    const fn = vi.fn();
    e.on('a', fn);
    e.clear();
    e.emit('a', { v: 7 });
    expect(fn).not.toHaveBeenCalled();
    expect(e.listenerCount('a')).toBe(0);
  });
});
