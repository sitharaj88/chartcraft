import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigate } from '../src/a11y/keyboard';
import { cleanupDom, key, mount } from './helpers';
import type { PointEvent } from '../src/index';

afterEach(cleanupDom);

describe('navigate (pure state machine)', () => {
  const ctx = { seriesCount: 2, isVisible: () => true, pointCount: () => 3 };

  it('first ArrowRight enters the first point of the first visible series', () => {
    expect(navigate('ArrowRight', null, ctx)).toEqual({ kind: 'move', pos: { si: 0, pi: 0 } });
  });

  it('walks right/left with clamping at the ends', () => {
    expect(navigate('ArrowRight', { si: 0, pi: 0 }, ctx)).toEqual({ kind: 'move', pos: { si: 0, pi: 1 } });
    expect(navigate('ArrowLeft', { si: 0, pi: 1 }, ctx)).toEqual({ kind: 'move', pos: { si: 0, pi: 0 } });
    expect(navigate('ArrowLeft', { si: 0, pi: 0 }, ctx)).toEqual({ kind: 'none' });
    expect(navigate('ArrowRight', { si: 0, pi: 2 }, ctx)).toEqual({ kind: 'none' });
  });

  it('Home/End jump to first/last point', () => {
    expect(navigate('Home', { si: 1, pi: 2 }, ctx)).toEqual({ kind: 'move', pos: { si: 1, pi: 0 } });
    expect(navigate('End', { si: 1, pi: 0 }, ctx)).toEqual({ kind: 'move', pos: { si: 1, pi: 2 } });
  });

  it('ArrowDown/Up cycle series, skipping hidden ones', () => {
    const withHidden = { seriesCount: 3, isVisible: (si: number) => si !== 1, pointCount: () => 3 };
    expect(navigate('ArrowDown', { si: 0, pi: 1 }, withHidden)).toEqual({ kind: 'move', pos: { si: 2, pi: 1 } });
    expect(navigate('ArrowUp', { si: 2, pi: 1 }, withHidden)).toEqual({ kind: 'move', pos: { si: 0, pi: 1 } });
  });

  it('Enter activates, Escape clears', () => {
    expect(navigate('Enter', { si: 0, pi: 1 }, ctx)).toEqual({ kind: 'activate', pos: { si: 0, pi: 1 } });
    expect(navigate('Escape', { si: 0, pi: 1 }, ctx)).toEqual({ kind: 'clear' });
    expect(navigate('Enter', null, ctx)).toEqual({ kind: 'none' });
  });
});

describe('chart keyboard flow', () => {
  const data = {
    categories: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: 'North', data: [10, 20, 30] },
      { name: 'South', data: [5, 15, 25] },
    ],
  };

  it('arrow keys emit pointenter/pointleave with clientX/Y = -1', () => {
    const { el, chart } = mount({ type: 'line', data });
    const enters: PointEvent[] = [];
    const leaves: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    chart.on('pointleave', (e) => leaves.push(e));

    key(el, 'ArrowRight');
    expect(enters).toHaveLength(1);
    expect(enters[0]).toMatchObject({ seriesName: 'North', dataIndex: 0, clientX: -1, clientY: -1, x: 'Q1', y: 10 });

    key(el, 'ArrowRight');
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.dataIndex).toBe(0);
    expect(enters[1]).toMatchObject({ seriesName: 'North', dataIndex: 1, y: 20 });
  });

  it('End/Home jump; ArrowDown switches series', () => {
    const { el, chart } = mount({ type: 'line', data });
    const enters: PointEvent[] = [];
    chart.on('pointenter', (e) => enters.push(e));
    key(el, 'ArrowRight'); // (North, 0)
    key(el, 'End');
    expect(enters.at(-1)).toMatchObject({ seriesName: 'North', dataIndex: 2 });
    key(el, 'ArrowDown');
    expect(enters.at(-1)).toMatchObject({ seriesName: 'South', dataIndex: 2 });
    key(el, 'Home');
    expect(enters.at(-1)).toMatchObject({ seriesName: 'South', dataIndex: 0 });
  });

  it('Enter fires pointclick on the focused datum', () => {
    const { el, chart } = mount({ type: 'line', data });
    const onClick = vi.fn();
    chart.on('pointclick', onClick);
    key(el, 'ArrowRight');
    key(el, 'Enter');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0]).toMatchObject({ seriesName: 'North', dataIndex: 0, clientX: -1 });
  });

  it('announces focused points via the aria-live region', () => {
    const { el } = mount({ type: 'line', data });
    key(el, 'ArrowRight');
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toContain('North');
    expect(region.textContent).toContain('point 1 of 3');
    expect(region.textContent).toContain('Q1');
  });

  it('Escape clears focus and the announcement', () => {
    const { el } = mount({ type: 'line', data });
    key(el, 'ArrowRight');
    key(el, 'Escape');
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.textContent).toBe('');
  });

  it('keyboard disabled: no events emitted', () => {
    const { el, chart } = mount({ type: 'line', data, a11y: { keyboard: false } });
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    key(el, 'ArrowRight');
    expect(onEnter).not.toHaveBeenCalled();
  });
});
