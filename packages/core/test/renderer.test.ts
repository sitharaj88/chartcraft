import { describe, expect, it } from 'vitest';
import { CanvasRenderer } from '../src/render/canvas';
import type { RecordingContext2D } from './setup';

function make(): { r: CanvasRenderer; ctx: RecordingContext2D } {
  const canvas = document.createElement('canvas');
  const r = new CanvasRenderer(canvas);
  const ctx = canvas.getContext('2d') as unknown as RecordingContext2D;
  return { r, ctx };
}

describe('CanvasRenderer', () => {
  it('resize scales the backing store by devicePixelRatio and sets the transform', () => {
    const { r, ctx } = make();
    r.resize(100, 50, 2);
    expect(ctx.canvas.width).toBe(200);
    expect(ctx.canvas.height).toBe(100);
    expect(ctx.canvas.style.width).toBe('100px');
    expect(ctx.canvas.style.height).toBe('50px');
    const st = ctx.__calls.find((c) => c.method === 'setTransform');
    expect(st?.args).toEqual([2, 0, 0, 2, 0, 0]);
    expect(r.width).toBe(100);
    expect(r.height).toBe(50);
  });

  it('clear fills the full CSS-pixel surface', () => {
    const { r, ctx } = make();
    r.resize(100, 50, 1);
    r.clear('#fcfcfb');
    const fr = ctx.__calls.filter((c) => c.method === 'fillRect').at(-1);
    expect(fr?.args).toEqual([0, 0, 100, 50]);
    expect(ctx.__props.some((p) => p.prop === 'fillStyle' && p.value === '#fcfcfb')).toBe(true);
  });

  it('rect with radii builds a rounded path via arcTo; without radii uses fillRect', () => {
    const { r, ctx } = make();
    r.resize(100, 100, 1);
    r.rect(10, 10, 20, 30, { fill: '#000', radii: [4, 4, 0, 0] });
    expect(ctx.__calls.filter((c) => c.method === 'arcTo')).toHaveLength(4);
    const before = ctx.__calls.filter((c) => c.method === 'fillRect').length;
    r.rect(0, 0, 5, 5, { fill: '#000' });
    expect(ctx.__calls.filter((c) => c.method === 'fillRect')).toHaveLength(before + 1);
  });

  it('path executes M/L/C/Z commands', () => {
    const { r, ctx } = make();
    r.path(
      [
        ['M', 0, 0],
        ['L', 10, 10],
        ['C', 1, 2, 3, 4, 5, 6],
        ['Z'],
      ],
      { stroke: { color: '#123', width: 2 } },
    );
    expect(ctx.__calls.some((c) => c.method === 'moveTo')).toBe(true);
    expect(ctx.__calls.some((c) => c.method === 'lineTo')).toBe(true);
    expect(ctx.__calls.some((c) => c.method === 'bezierCurveTo')).toBe(true);
    expect(ctx.__calls.some((c) => c.method === 'stroke')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'lineWidth' && p.value === 2)).toBe(true);
  });

  it('sector draws pie (lineTo center) vs donut (double arc)', () => {
    const { r, ctx } = make();
    r.sector(50, 50, 0, 40, 0, Math.PI, { fill: '#f00' });
    expect(ctx.__calls.filter((c) => c.method === 'arc')).toHaveLength(1);
    expect(ctx.__calls.some((c) => c.method === 'lineTo' && c.args[0] === 50 && c.args[1] === 50)).toBe(true);
    ctx.__calls.length = 0;
    r.sector(50, 50, 20, 40, 0, Math.PI, { fill: '#f00' });
    expect(ctx.__calls.filter((c) => c.method === 'arc')).toHaveLength(2);
  });

  it('text supports rotation (translate + rotate) and styling', () => {
    const { r, ctx } = make();
    r.text('hi', 10, 20, { font: '12px sans-serif', color: '#333', rotate: -Math.PI / 2 });
    expect(ctx.__calls.some((c) => c.method === 'translate')).toBe(true);
    expect(ctx.__calls.some((c) => c.method === 'rotate')).toBe(true);
    expect(ctx.__calls.some((c) => c.method === 'fillText' && c.args[0] === 'hi')).toBe(true);
    expect(ctx.__props.some((p) => p.prop === 'font' && p.value === '12px sans-serif')).toBe(true);
  });

  it('measure uses the mock 6px-per-char metric', () => {
    const { r } = make();
    expect(r.measure('abcd', '12px sans-serif')).toBe(24);
  });

  it('alpha applies per draw via globalAlpha', () => {
    const { r, ctx } = make();
    r.circle(10, 10, 4, { fill: '#000', alpha: 0.5 });
    expect(ctx.__props.some((p) => p.prop === 'globalAlpha' && p.value === 0.5)).toBe(true);
  });
});
