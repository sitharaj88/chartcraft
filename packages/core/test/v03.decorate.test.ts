/**
 * v0.3 decoration/overlay plumbing: the definition's `decorations(ctx, layer)`
 * stage, the pipeline-level Decorator list, and the exact frame stage order.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDecorators,
  decorators,
  registerDecorator,
  unregisterDecorator,
  type Decorator,
  type DecoratorContext,
  type DecoratorHost,
} from '../src/index';
import { getChartType, registerChartType, type ChartTypeDefinition } from '../src/charts/registry';
import { registerBuiltinChartTypes } from '../src/charts';
import { cleanupDom, mount } from './helpers';

registerBuiltinChartTypes();

afterEach(() => {
  clearDecorators();
  cleanupDom();
});

const data = { categories: ['A', 'B', 'C'], series: [{ name: 'One', data: [1, 2, 3] }] };

/** A decorator that appends its id to `log` when drawn. */
function probe(id: string, layer: 'under' | 'over', log: string[], extra: Partial<Decorator> = {}): Decorator {
  return { id, layer, draw: () => log.push(id), ...extra };
}

describe('definition decorations stage', () => {
  it('is called with under BEFORE render and over AFTER it, once each per frame', () => {
    const real = getChartType('line');
    const log: string[] = [];
    const spy: ChartTypeDefinition = {
      ...real,
      render: (ctx) => {
        log.push('render');
        real.render(ctx);
      },
      decorations: (_ctx, layer) => log.push(`decorations:${layer}`),
    };
    try {
      registerChartType(spy);
      mount({ type: 'line', data });
    } finally {
      registerChartType(real);
    }
    expect(log).toEqual(['decorations:under', 'render', 'decorations:over']);
  });

  it('receives the same RenderContext the render stage gets', () => {
    const real = getChartType('line');
    const seen: unknown[] = [];
    try {
      registerChartType({ ...real, decorations: (ctx, layer) => seen.push({ layer, ctx }) });
      mount({ type: 'line', data });
    } finally {
      registerChartType(real);
    }
    const first = seen[0] as { layer: string; ctx: Record<string, unknown> };
    expect(first.layer).toBe('under');
    expect(first.ctx['r']).toBeDefined();
    expect(first.ctx['theme']).toBeDefined();
    expect(first.ctx['model']).toBeDefined();
    expect(first.ctx['layout']).toBeDefined();
    expect(first.ctx['geom']).toBeDefined();
  });

  it('is optional — types without it render exactly as before', () => {
    expect(getChartType('line').decorations).toBeUndefined();
    const { el } = mount({ type: 'line', data });
    expect(el.querySelector('canvas')).toBeTruthy();
  });
});

describe('decorator registry', () => {
  it('registers, lists and unregisters by id', () => {
    const log: string[] = [];
    registerDecorator(probe('a', 'over', log));
    expect(decorators().map((d) => d.id)).toEqual(['a']);
    expect(unregisterDecorator('a')).toBe(true);
    expect(unregisterDecorator('a')).toBe(false);
    expect(decorators()).toEqual([]);
  });

  it('re-registering the same id REPLACES the decorator', () => {
    const log: string[] = [];
    registerDecorator(probe('dup', 'over', log));
    registerDecorator({ id: 'dup', layer: 'under', draw: () => log.push('second') });
    expect(decorators()).toHaveLength(1);
    expect(decorators()[0]?.layer).toBe('under');
  });

  it('filters by layer and sorts by order (stable within equal order)', () => {
    const log: string[] = [];
    registerDecorator({ ...probe('late', 'over', log), order: 10 });
    registerDecorator({ ...probe('early', 'over', log), order: -1 });
    registerDecorator(probe('mid', 'over', log));
    registerDecorator(probe('mid2', 'over', log));
    registerDecorator(probe('beneath', 'under', log));
    expect(decorators('over').map((d) => d.id)).toEqual(['early', 'mid', 'mid2', 'late']);
    expect(decorators('under').map((d) => d.id)).toEqual(['beneath']);
  });

  it('rejects malformed decorators', () => {
    expect(() => registerDecorator({ id: '', layer: 'over', draw: () => {} })).toThrow(/non-empty string id/);
    expect(() =>
      registerDecorator({ id: 'x', layer: 'sideways' as 'over', draw: () => {} }),
    ).toThrow(/invalid layer/);
    expect(() => registerDecorator({ id: 'x', layer: 'over' } as unknown as Decorator)).toThrow(/must implement draw/);
  });
});

describe('pipeline walks the decorator list', () => {
  it('draws under-decorators before the marks and over-decorators after', () => {
    const real = getChartType('line');
    const log: string[] = [];
    registerDecorator(probe('under-1', 'under', log));
    registerDecorator(probe('over-1', 'over', log));
    try {
      registerChartType({
        ...real,
        render: (ctx) => {
          log.push('marks');
          real.render(ctx);
        },
        decorations: (_c, layer) => log.push(`own:${layer}`),
      });
      mount({ type: 'line', data });
    } finally {
      registerChartType(real);
    }
    // A definition's own decorations always precede the global list in a layer.
    expect(log).toEqual(['own:under', 'under-1', 'marks', 'own:over', 'over-1']);
  });

  it('hands every decorator the plot rect, scales, model, theme and renderer', () => {
    let ctx: DecoratorContext | null = null;
    registerDecorator({ id: 'capture', layer: 'over', draw: (c) => (ctx = c) });
    mount({ type: 'line', data });
    const c = ctx as unknown as DecoratorContext;
    expect(c).not.toBeNull();
    expect(c.plot).toBe(c.layout.plot);
    expect(c.plot.w).toBeGreaterThan(0);
    expect(c.xScale).toBe(c.layout.xScale);
    expect(c.yScale).toBe(c.layout.yScale);
    expect(c.model.series[0]?.name).toBe('One');
    expect(c.theme.colorScheme).toBe('light');
    expect(typeof c.r.rect).toBe('function');
    expect(c.def.id).toBe('line');
    expect(c.viewport).toBeNull();
    expect(typeof c.emit).toBe('function');
  });

  it('honors appliesTo (cheap opt-out)', () => {
    const log: string[] = [];
    registerDecorator({ ...probe('skipped', 'over', log), appliesTo: () => false });
    registerDecorator({ ...probe('kept', 'over', log), appliesTo: (c) => c.def.id === 'line' });
    mount({ type: 'line', data });
    expect(log).toEqual(['kept']);
  });

  it('lets a decorator emit public chart events', () => {
    const seen: unknown[] = [];
    registerDecorator({
      id: 'emitter',
      layer: 'over',
      draw: (c) =>
        c.emit('annotationclick', { index: 3, annotation: { kind: 'line', axis: 'y', value: 1 } }),
    });
    // The first paint happens during mount, so subscribe then force a repaint.
    const { chart } = mount({ type: 'line', data });
    chart.on('annotationclick', (ev) => seen.push(ev));
    chart.update({ title: 'redraw' });
    expect(seen).toContainEqual({ index: 3, annotation: { kind: 'line', axis: 'y', value: 1 } });
  });

  it('appends decorator legend entries after the type items', () => {
    registerDecorator({
      id: 'trend-legend',
      layer: 'over',
      draw: () => {},
      legendItems: () => [{ id: 'One-trend', name: 'One trend', color: '#2a78d6', visible: true, toggleable: false }],
    });
    const { el } = mount({ type: 'line', data: { ...data, series: [...data.series, { name: 'Two', data: [3, 2, 1] }] } });
    const names = [...el.querySelectorAll('.chartcraft-legend-item')].map((b) => b.textContent);
    expect(names).toEqual(['One', 'Two', 'One trend']);
  });

  it('extendYDomain widens the value domain before scales are built', () => {
    registerDecorator({
      id: 'errorbars',
      layer: 'over',
      draw: () => {},
      extendYDomain: () => [-10, 50],
    });
    let ctx: DecoratorContext | null = null;
    registerDecorator({ id: 'capture', layer: 'over', draw: (c) => (ctx = c) });
    mount({ type: 'line', data });
    const c = ctx as unknown as DecoratorContext;
    expect(c.model.yDomain[0]).toBeLessThanOrEqual(-10);
    expect(c.model.yDomain[1]).toBeGreaterThanOrEqual(50);
  });

  it('onClick gets first refusal and can suppress datum events', () => {
    const clicks: number[] = [];
    registerDecorator({ id: 'claim', layer: 'over', draw: () => {}, onClick: () => true });
    const { el, chart } = mount({ type: 'line', data });
    chart.on('pointclick', () => clicks.push(1));
    el.querySelector('canvas')?.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 10, bubbles: true }));
    expect(clicks).toEqual([]);
  });

  it('attach runs once per chart and its teardown runs on destroy', () => {
    const teardown = vi.fn();
    let host: DecoratorHost | null = null;
    const attach = vi.fn((h: DecoratorHost) => {
      host = h;
      return teardown;
    });
    registerDecorator({ id: 'zoomish', layer: 'over', draw: () => {}, attach });
    const { chart } = mount({ type: 'line', data });
    expect(attach).toHaveBeenCalledTimes(1);
    const h = host as unknown as DecoratorHost;
    expect(h.canvas.tagName).toBe('CANVAS');
    expect(h.root.className).toBe('chartcraft');
    expect(h.getViewport()).toBeNull();
    expect(h.context().def.id).toBe('line');
    expect(typeof h.requestRender).toBe('function');
    chart.destroy();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('with an empty list nothing extra is drawn (v0.2 paint is unchanged)', () => {
    clearDecorators();
    const log: string[] = [];
    const real = getChartType('line');
    try {
      registerChartType({
        ...real,
        render: (ctx) => {
          log.push('marks');
          real.render(ctx);
        },
      });
      mount({ type: 'line', data });
    } finally {
      registerChartType(real);
    }
    expect(log).toEqual(['marks']);
  });
});
