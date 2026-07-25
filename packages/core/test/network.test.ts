/**
 * Network chart type: deterministic seeded layout (no Math.random), area-true
 * node radii, group -> categorical slot coloring, hairline 0.35-alpha links,
 * measured selective labels, group legend, degree-ordered keyboard walk, the
 * node/group/degree/value a11y table, tooltips, theming and resize.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGraphChartTypes } from '../src/charts/graph';
import { networkMaxRadius, NETWORK_LINK_ALPHA } from '../src/charts/graph/network';
import { lightTheme, darkTheme } from '../src/theme';
import type { ChartData, ChartOptions } from '../src/index';
import { cleanupDom, ctxOf, key, mount, paintedText, pointerMove } from './helpers';

registerGraphChartTypes();
afterEach(cleanupDom);

/** Degrees: b=3, a=2, c=2, d=1 -> node order Beta, Alpha, Gamma, Delta. */
const graph = {
  nodes: [
    { id: 'a', label: 'Alpha', group: 'One', value: 16 },
    { id: 'b', label: 'Beta', group: 'Two', value: 4 },
    { id: 'c', label: 'Gamma', group: 'One', value: 1 },
    { id: 'd', label: 'Delta', value: 9 },
  ],
  links: [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'b', target: 'd' },
    { source: 'a', target: 'c' },
  ],
};

const data = { series: [{ name: 'Graph', data: graph }] } as unknown as ChartData;

function mountNet(extra: Partial<ChartOptions> = {}, d: ChartData = data) {
  return mount({ type: 'network', data: d, ...extra } as Partial<ChartOptions> & Pick<ChartOptions, 'type' | 'data'>);
}

/** Drawn circles as [cx, cy, r], in draw (degree) order. */
function circles(el: HTMLElement): [number, number, number][] {
  return ctxOf(el)
    .__calls.filter((c) => c.method === 'arc')
    .map((c) => [c.args[0] as number, c.args[1] as number, c.args[2] as number]);
}

function fillsOf(el: HTMLElement): unknown[] {
  return ctxOf(el)
    .__props.filter((p) => p.prop === 'fillStyle')
    .map((p) => p.value);
}

describe('network rendering', () => {
  it('draws one hairline link per edge at 0.35 alpha, under the nodes', () => {
    const { el } = mountNet();
    const calls = ctxOf(el).__calls;
    // line() = beginPath + moveTo + lineTo + stroke; nothing else uses moveTo here.
    expect(calls.filter((c) => c.method === 'moveTo')).toHaveLength(4);
    const props = ctxOf(el).__props;
    expect(props.some((p) => p.prop === 'globalAlpha' && p.value === NETWORK_LINK_ALPHA)).toBe(true);
    expect(props.some((p) => p.prop === 'strokeStyle' && p.value === lightTheme.textMuted)).toBe(true);
    expect(props.some((p) => p.prop === 'lineWidth' && p.value === 1)).toBe(true);
    // All 4 link endpoints precede the first node circle.
    const firstArc = calls.findIndex((c) => c.method === 'arc');
    const lastMove = calls.map((c) => c.method).lastIndexOf('moveTo');
    expect(lastMove).toBeLessThan(firstArc);
  });

  it('node radius is AREA-TRUE: r = rMax·√(v/vMax), exactly', () => {
    const { el } = mountNet();
    const radii = circles(el).map((c) => c[2]);
    // maxR = 28 for the 576x376 plot; values in degree order are 4, 16, 1, 9.
    expect(networkMaxRadius({ x: 12, y: 12, w: 576, h: 376 })).toBe(28);
    expect(radii).toEqual([14, 28, 7, 21]);
    // Area ∝ value: Alpha (16) has exactly 16x the area of Gamma (1).
    const area = (r: number): number => Math.PI * r * r;
    expect(area(radii[1] as number) / area(radii[2] as number)).toBeCloseTo(16, 9);
    expect(area(radii[0] as number) / area(radii[2] as number)).toBeCloseTo(4, 9);
  });

  it('colors nodes by group through the categorical slots, first-seen order', () => {
    const { el } = mountNet();
    // clear() sets the surface fill first; then the 4 nodes in degree order.
    expect(fillsOf(el).slice(1, 5)).toEqual([
      lightTheme.series[1], // Beta  -> group Two  (second group seen)
      lightTheme.series[0], // Alpha -> group One  (first group seen)
      lightTheme.series[0], // Gamma -> group One
      lightTheme.series[0], // Delta -> no group   (slot 1)
    ]);
    const { el: dark } = mountNet({ theme: 'dark' });
    expect(fillsOf(dark).slice(1, 3)).toEqual([darkTheme.series[1], darkTheme.series[0]]);
  });

  it('labels only the nodes whose MEASURED text fits inside the circle', () => {
    const texts = paintedText(mountNet().el);
    // 6px/char in the test stub: Beta/Alpha/Delta fit their radii, Gamma (r=7) does not.
    expect(texts).toContain('Beta');
    expect(texts).toContain('Alpha');
    expect(texts).toContain('Delta');
    expect(texts).not.toContain('Gamma');
  });

  it('nodes stay inside the plot rect (radius-aware fit)', () => {
    for (const [cx, cy, r] of circles(mountNet().el)) {
      expect(cx - r).toBeGreaterThanOrEqual(12);
      expect(cx + r).toBeLessThanOrEqual(588);
      expect(cy - r).toBeGreaterThanOrEqual(12);
      expect(cy + r).toBeLessThanOrEqual(388);
    }
  });

  it('uniform mid-size radii when no node carries a value', () => {
    const plain = {
      series: [{ name: 'G', data: { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] } }],
    } as unknown as ChartData;
    const radii = circles(mountNet({}, plain).el).map((c) => c[2]);
    expect(radii).toEqual([16, 16]); // (4 + 28) / 2
  });
});

describe('network determinism', () => {
  it('never calls Math.random while laying out or drawing', () => {
    const spy = vi.spyOn(Math, 'random');
    const { chart } = mountNet();
    chart.resize();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('two identical charts produce identical node positions', () => {
    const a = circles(mountNet().el);
    const b = circles(mountNet().el);
    expect(a).toEqual(b);
  });

  it('a resize re-fits the SAME layout (identical positions at the same size)', () => {
    const { el, chart } = mountNet();
    const before = circles(el).slice(0, 4);
    chart.resize();
    const after = circles(el).slice(4, 8);
    expect(after).toEqual(before);
  });

  it('network.fixedSeed and network.iterations change the layout deterministically', () => {
    const base = circles(mountNet().el).map((c) => [c[0], c[1]]);
    const seeded = circles(mountNet({ network: { fixedSeed: 42 } }).el).map((c) => [c[0], c[1]]);
    const fewer = circles(mountNet({ network: { iterations: 5 } }).el).map((c) => [c[0], c[1]]);
    expect(seeded).not.toEqual(base);
    expect(fewer).not.toEqual(base);
    // ...and each is reproducible.
    expect(circles(mountNet({ network: { fixedSeed: 42 } }).el).map((c) => [c[0], c[1]])).toEqual(seeded);
  });

  it('linkDistance changes the geometry but keeps every node finite and placed', () => {
    const wide = circles(mountNet({ network: { linkDistance: 200 } }).el);
    expect(wide).toHaveLength(4);
    for (const [cx, cy] of wide) {
      expect(Number.isFinite(cx)).toBe(true);
      expect(Number.isFinite(cy)).toBe(true);
    }
  });
});

describe('network legend (groups)', () => {
  it('lists groups in first-seen order, non-toggleable', () => {
    const { el, chart } = mountNet();
    const items = [...el.querySelectorAll('.chartcraft-legend-item')] as HTMLButtonElement[];
    expect(items.map((i) => i.textContent)).toEqual(['One', 'Two']);
    expect(items.map((i) => i.dataset.seriesId)).toEqual(['group:One', 'group:Two']);
    expect(items.every((i) => i.disabled)).toBe(true);
    const swatches = [...el.querySelectorAll('.chartcraft-legend-swatch')] as HTMLElement[];
    expect(swatches).toHaveLength(2);
    const onToggle = vi.fn();
    chart.on('legendtoggle', onToggle);
    items[0]!.click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('hides itself when there are fewer than two groups; legend:false always wins', () => {
    const oneGroup = {
      series: [
        {
          name: 'G',
          data: {
            nodes: [{ id: 'a', group: 'Only' }, { id: 'b', group: 'Only' }],
            links: [{ source: 'a', target: 'b' }],
          },
        },
      ],
    } as unknown as ChartData;
    const { el } = mountNet({}, oneGroup);
    expect((el.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
    const { el: shown } = mountNet({ legend: true }, oneGroup);
    expect((shown.querySelector('.chartcraft-legend') as HTMLElement).style.display).not.toBe('none');
    const { el: hidden } = mountNet({ legend: false });
    expect((hidden.querySelector('.chartcraft-legend') as HTMLElement).style.display).toBe('none');
  });
});

describe('network a11y, keyboard & tooltip', () => {
  it('a11y table is node / group / degree / value in degree order', () => {
    const { el } = mountNet();
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Node',
      'Group',
      'Degree',
      'Value',
    ]);
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['Beta', 'Two', '3', '4'],
      ['Alpha', 'One', '2', '16'],
      ['Gamma', 'One', '2', '1'],
      ['Delta', '—', '1', '9'],
    ]);
  });

  it('exportData mirrors the a11y table exactly', () => {
    const { chart } = mountNet();
    expect(chart.exportData()).toBe(
      'Node,Group,Degree,Value\nBeta,Two,3,4\nAlpha,One,2,16\nGamma,One,2,1\nDelta,—,1,9',
    );
  });

  it('keyboard walks nodes by DEGREE descending and announces group/degree', () => {
    const { el, chart } = mountNet();
    const enters: { dataIndex: number; y: number | null }[] = [];
    chart.on('pointenter', (e) => enters.push({ dataIndex: e.dataIndex, y: e.y }));
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;

    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ dataIndex: 0, y: 4 }); // Beta, degree 3
    expect(region.textContent).toBe('Beta: 4. Two, degree 3, node 1 of 4.');
    key(el, 'ArrowRight');
    expect(enters.at(-1)).toEqual({ dataIndex: 1, y: 16 }); // Alpha, degree 2
    expect(region.textContent).toBe('Alpha: 16. One, degree 2, node 2 of 4.');
    key(el, 'End');
    expect(enters.at(-1)).toEqual({ dataIndex: 3, y: 9 }); // Delta, degree 1
    expect(region.textContent).toBe('Delta: 9. degree 1, node 4 of 4.');
  });

  it('Enter activates the focused node with a meaningful dataIndex', () => {
    const { el, chart } = mountNet();
    const onClick = vi.fn();
    chart.on('pointclick', onClick);
    key(el, 'ArrowRight');
    key(el, 'Enter');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0]).toMatchObject({ dataIndex: 0, y: 4, seriesName: 'Graph' });
  });

  it('hover hits a node and the tooltip carries label, value, group and degree', () => {
    const { el, chart } = mountNet();
    const [cx, cy] = circles(el)[0] as [number, number, number]; // Beta
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    pointerMove(el, cx, cy);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]![0]).toMatchObject({ dataIndex: 0, y: 4 });
    const tip = document.querySelector('.chartcraft-tooltip') as HTMLElement;
    expect(tip.style.display).not.toBe('none');
    expect(tip.innerHTML).toContain('Beta');
    expect(tip.innerHTML).toContain('Value');
    expect(tip.innerHTML).toContain('Group');
    expect(tip.innerHTML).toContain('Two');
    expect(tip.innerHTML).toContain('Degree');
    expect(tip.innerHTML).toContain('>3<');
  });

  it('empty canvas space is not a hit and hides the tooltip', () => {
    const { el, chart } = mountNet();
    const onEnter = vi.fn();
    chart.on('pointenter', onEnter);
    pointerMove(el, 13, 13); // plot corner: far from every node
    expect(onEnter).not.toHaveBeenCalled();
    expect((document.querySelector('.chartcraft-tooltip') as HTMLElement).style.display).toBe('none');
  });

  it('aria label and hidden data table are wired up', () => {
    const { el } = mountNet();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toContain('Network chart');
    expect(canvas.tabIndex).toBe(0);
    expect((el.querySelector('.chartcraft-a11y-table') as HTMLElement).style.clipPath).toBe('inset(50%)');
  });
});

describe('network data contract', () => {
  it('accepts nodes as series data with links alongside', () => {
    const alt = {
      series: [
        {
          name: 'G',
          data: [
            { id: 'a', label: 'Alpha', value: 4 },
            { id: 'b', label: 'Beta', value: 1 },
          ],
          links: [{ source: 'a', target: 'b' }],
        },
      ],
    } as unknown as ChartData;
    const { el } = mountNet({}, alt);
    expect(circles(el).map((c) => c[2])).toEqual([28, 14]);
    expect(ctxOf(el).__calls.filter((c) => c.method === 'moveTo')).toHaveLength(1);
  });

  it('throws a clear error when a link references an unknown node', () => {
    const broken = {
      series: [{ name: 'G', data: { nodes: [{ id: 'a' }], links: [{ source: 'a', target: 'ghost' }] } }],
    } as unknown as ChartData;
    expect(() => mountNet({}, broken)).toThrow(/unknown node 'ghost'/);
  });

  it('renders nothing (and does not throw) for an empty graph', () => {
    const empty = { series: [{ name: 'G', data: { nodes: [], links: [] } }] } as unknown as ChartData;
    const { el } = mountNet({}, empty);
    expect(circles(el)).toHaveLength(0);
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect(table.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('animation on: the chart still mounts, links follow the animated nodes', () => {
    const { el } = mount({ type: 'network', data, animation: true, theme: 'light', width: 600, height: 400 } as ChartOptions);
    expect(circles(el)).toHaveLength(4);
    expect(ctxOf(el).__calls.filter((c) => c.method === 'moveTo')).toHaveLength(4);
  });
});
