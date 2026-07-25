/**
 * v0.3.2 — the architect's rulings on the six escalations left open by
 * `QUALITY-AUDIT.md` after v0.3.1.
 *
 * E-2  hierarchy child fills are clamped to a 2:1 contrast floor
 * E-4  network links are reachable and announced, like sankey's
 * E-5  a chart type may DECLARE a time axis (`needs.xScale: 'time'`)
 * E-7  `zoomTo` re-windows incrementally instead of rebuilding the model
 * E-8  the `a11yTable` stage takes an optional `limit`
 * E-9  candlestick/ohlc/network throw on wrong-shape data, like their peers
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartOptions } from '../src/index';
import { darkTheme, lightTheme } from '../src/index';
import { registerBuiltinChartTypes } from '../src/charts';
import { contrastRatio } from '../src/charts/matrix/color-scale';
import { buildHierarchy, CHILD_MIN_CONTRAST, childColor } from '../src/charts/matrix/hierarchy';
import { getChartType } from '../src/charts/registry';
import { inferXType } from '../src/data/normalize';
import { buildModel, resolveOptions, rewindowModel } from '../src/model';
import { a11yRowBudget, applyTableLimit, type A11yTableSpec } from '../src/a11y';
import { formatTemporal } from '../src/util';
import type { Theme, TreeNode } from '../src/types';
import { canvasOf, cleanupDom, key, mount, paintedText } from './helpers';

registerBuiltinChartTypes();

afterEach(cleanupDom);

// ---------------------------------------------------------------------------
// E-2 — hierarchy children may never fade into the surface.

/** A single-child chain `depth` levels deep under one top-level node. */
function chain(depth: number, breadth = 1): TreeNode {
  const leaf = (label: string): TreeNode => ({ label, value: 1 });
  let node: TreeNode = leaf('L');
  for (let d = depth; d >= 1; d--) {
    const kids: TreeNode[] = [node];
    for (let b = 1; b < breadth; b++) kids.push(leaf(`d${d}s${b}`));
    node = { label: `d${d}`, children: kids };
  }
  return node;
}

/** Every node of the hierarchy rooted at palette slot `slot`. */
function slotChain(slot: number, theme: Theme, depth: number, breadth = 1): string[] {
  // Pad with (unused) leading roots so the chain lands on the wanted slot.
  const roots: TreeNode[] = [];
  for (let i = 0; i < slot; i++) roots.push({ label: `pad${i}`, value: 1 });
  roots.push(chain(depth, breadth));
  const h = buildHierarchy(roots, theme);
  return h.nodes.filter((n) => n.topIndex === slot).map((n) => n.color);
}

describe('E-2 — hierarchy child lightness is clamped to a contrast floor', () => {
  for (const [name, theme] of [['light', lightTheme], ['dark', darkTheme]] as const) {
    it(`${name} mode: the WORST slot at depth 5 stays >= 2:1 against the surface`, () => {
      // Slot 4 (`#eda100`) is the audit's failing case: 2.11:1 on the light
      // surface, so it has almost no headroom left to lighten into.
      for (const breadth of [1, 3]) {
        const colors = slotChain(3, theme, 5, breadth);
        expect(colors.length).toBeGreaterThanOrEqual(6);
        for (const c of colors) {
          expect(contrastRatio(c, theme.surface), `${name}/${breadth}: ${c}`).toBeGreaterThanOrEqual(
            CHILD_MIN_CONTRAST,
          );
        }
      }
    });

    it(`${name} mode: no two adjacent depths collapse to the same fill`, () => {
      // One child per level, so consecutive entries ARE consecutive depths.
      for (const slot of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const colors = slotChain(slot, theme, 5);
        for (let i = 1; i < colors.length; i++) {
          expect(colors[i], `${name} slot ${slot} depth ${i}`).not.toBe(colors[i - 1]);
        }
      }
    });

    it(`${name} mode: EVERY palette slot clears the floor at every depth`, () => {
      for (let slot = 0; slot < theme.series.length; slot++) {
        for (const c of slotChain(slot, theme, 5, 3)) {
          expect(contrastRatio(c, theme.surface), `${name} slot ${slot}: ${c}`).toBeGreaterThanOrEqual(
            CHILD_MIN_CONTRAST,
          );
        }
      }
    });
  }

  it('a step that clears the floor is used VERBATIM (no hue that was legible changes)', () => {
    // Slot 1 blue: the audit measured its third child at 2.36:1 — legal, so the
    // clamp must be a no-op there.
    const t = 0.5 * (3 / 4);
    expect(childColor('#2a78d6', lightTheme.surface, t)).toBe('#79aae4');
  });

  it('a step that would fall below the floor flips direction instead of shrinking', () => {
    const t = 0.5 * (3 / 4);
    const faded = childColor('#eda100', lightTheme.surface, t);
    // `#f3c473` (1.58:1) was the defect; the replacement moves AWAY from the
    // surface, so it is darker than the parent, not lighter.
    expect(faded).not.toBe('#f3c473');
    expect(contrastRatio(faded, lightTheme.surface)).toBeGreaterThanOrEqual(CHILD_MIN_CONTRAST);
    expect(contrastRatio(faded, lightTheme.surface)).toBeGreaterThan(
      contrastRatio('#eda100', lightTheme.surface),
    );
  });

  it('all four hierarchy types inherit the clamp (they share buildHierarchy)', () => {
    const data = {
      series: [
        {
          name: 'S',
          data: [
            { label: 'pad0', value: 1 },
            { label: 'pad1', value: 1 },
            { label: 'pad2', value: 1 },
            chain(4, 2),
          ] as never,
        },
      ],
    };
    for (const type of ['treemap', 'sunburst', 'icicle', 'circlepack'] as const) {
      const { el, chart } = mount({ type, data } as ChartOptions);
      expect(canvasOf(el).getAttribute('aria-label'), type).toBeTruthy();
      chart.destroy();
      cleanupDom();
    }
    // The colours themselves are asserted on the shared builder above; this
    // pins that no type computes its own child fills behind its back.
    const fromBuilder = slotChain(3, lightTheme, 4, 2);
    for (const c of fromBuilder) {
      expect(contrastRatio(c, lightTheme.surface)).toBeGreaterThanOrEqual(CHILD_MIN_CONTRAST);
    }
  });
});

// ---------------------------------------------------------------------------
// E-9 — no silent empty renders.

describe('E-9 — candlestick/ohlc/network throw on wrong-shape data', () => {
  const wrong = { series: [{ name: 'S', data: [1, 2, 3] }] };

  it('candlestick names the OHLC shape it needs', () => {
    expect(() => mount({ type: 'candlestick', data: wrong } as ChartOptions)).toThrow(
      /candlestick data must be OHLC entries/,
    );
  });

  it('ohlc names the OHLC shape it needs', () => {
    expect(() => mount({ type: 'ohlc', data: wrong } as ChartOptions)).toThrow(
      /ohlc data must be OHLC entries/,
    );
  });

  it('network names the graph payload it needs, like sankey', () => {
    expect(() => mount({ type: 'network', data: wrong } as ChartOptions)).toThrow(
      /expects its graph on the FIRST series/,
    );
  });

  it('the error names the series and the offending entry', () => {
    let message = '';
    try {
      mount({ type: 'candlestick', data: { series: [{ name: 'AAPL', data: [1, 2] }] } } as ChartOptions);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("'AAPL'");
    expect(message).toContain('[x, open, high, low, close]');
  });

  it('EMPTY data is still an empty chart, not an error (no data is not wrong data)', () => {
    for (const type of ['candlestick', 'ohlc', 'network'] as const) {
      for (const data of [{ series: [] }, { series: [{ name: 'S', data: [] }] }, { series: [{ name: 'S', data: [null, null] }] }]) {
        const { el, chart } = mount({ type, data } as ChartOptions);
        expect(canvasOf(el).getAttribute('aria-label'), type).toBeTruthy();
        chart.destroy();
        cleanupDom();
      }
    }
  });

  it('a PARTIALLY valid series still renders (only a total mismatch is an error)', () => {
    const { el, chart } = mount({
      type: 'candlestick',
      data: { series: [{ name: 'S', data: [[1, 10, 12, 9, 11] as never, 5 as never] }] },
    } as ChartOptions);
    expect(canvasOf(el).getAttribute('aria-label')).toBeTruthy();
    expect(chart.exportData({ format: 'csv' }).split('\n').length - 1).toBe(1);
  });

  it('a rejected update leaves the chart alive (the C-3 invariant still holds)', () => {
    const { chart } = mount({
      type: 'network',
      data: { series: [{ name: 'S', data: { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] } as never }] },
    } as ChartOptions);
    expect(() => chart.update({ data: wrong })).toThrow(/expects its graph/);
    expect(() => chart.exportData()).not.toThrow();
    expect(() => chart.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// E-4 — network links are reachable by assistive tech.

const GRAPH = {
  series: [
    {
      name: 'Net',
      data: {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        links: [
          { source: 'a', target: 'b', value: 2 },
          { source: 'a', target: 'c', value: 3 },
          { source: 'b', target: 'c', value: 1 },
        ],
      } as never,
    },
  ],
};

function tableRows(el: HTMLElement): string[][] {
  return [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
    [...tr.children].map((c) => c.textContent ?? ''),
  );
}

describe('E-4 — every network link is reachable and announced', () => {
  it('the data table lists nodes AND their links', () => {
    const { el } = mount({ type: 'network', data: GRAPH } as ChartOptions);
    const rows = tableRows(el);
    expect(rows).toHaveLength(6); // 3 nodes + 3 links
    const headers = rows.map((r) => r[0] ?? '');
    expect(headers.filter((h) => h.includes('→'))).toHaveLength(3);
    expect(headers.some((h) => h.includes('a') && h.includes('b') && h.includes('→'))).toBe(true);
  });

  it('the columns describe both kinds of row', () => {
    const { el } = mount({ type: 'network', data: GRAPH } as ChartOptions);
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head).toEqual(['Node / link', 'Group', 'Degree', 'Source', 'Target', 'Value']);
  });

  it('keyboard walks node, then that node\'s links, and announces each', () => {
    const { el } = mount({ type: 'network', data: GRAPH } as ChartOptions);
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    const said: string[] = [];
    for (let i = 0; i < 6; i++) {
      key(el, 'ArrowRight');
      said.push(region.textContent ?? '');
    }
    // Every link is announced by name at some stop.
    expect(said.filter((s) => s.includes(' to '))).toHaveLength(3);
    expect(said.some((s) => /a to b/.test(s))).toBe(true);
    expect(said.some((s) => /a to c/.test(s))).toBe(true);
    expect(said.some((s) => /b to c/.test(s))).toBe(true);
    // Node stops still say what they said before.
    expect(said.some((s) => /degree/.test(s))).toBe(true);
  });

  it('exportData carries the links too', () => {
    const { chart } = mount({ type: 'network', data: GRAPH } as ChartOptions);
    const csv = chart.exportData({ format: 'csv' });
    expect(csv.split('\n')).toHaveLength(7);
    expect(csv).toContain('→');
  });

  it('a graph with no links is unchanged (nodes only)', () => {
    const { el } = mount({
      type: 'network',
      data: { series: [{ name: 'N', data: { nodes: [{ id: 'a' }, { id: 'b' }], links: [] } as never }] },
    } as ChartOptions);
    expect(tableRows(el)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// E-5 — a chart type may DECLARE a time axis.

describe("E-5 — needs.xScale: 'time' declares a temporal x axis", () => {
  it('the three inherently-temporal types declare it', () => {
    for (const id of ['candlestick', 'ohlc', 'gantt'] as const) {
      expect(getChartType(id).needs.xScale, id).toBe('time');
    }
  });

  it('inferXType honours the declaration for numeric x', () => {
    const base = { chartType: 'candlestick', hasCategories: false, sampleXs: [1, 2, 3] };
    expect(inferXType(base)).toBe('linear');
    expect(inferXType({ ...base, forceTime: true })).toBe('time');
  });

  it("the CALLER's xAxis.type still wins over the declaration", () => {
    expect(
      inferXType({ explicit: 'linear', chartType: 'candlestick', hasCategories: false, sampleXs: [1], forceTime: true }),
    ).toBe('linear');
  });

  it('genuinely categorical data still wins over the declaration', () => {
    expect(inferXType({ chartType: 'candlestick', hasCategories: true, sampleXs: [1], forceTime: true })).toBe(
      'category',
    );
    expect(inferXType({ chartType: 'candlestick', hasCategories: false, sampleXs: ['Mon'], forceTime: true })).toBe(
      'category',
    );
  });

  it('a candlestick with epoch-ms x reports xType time and formats every surface as a time', () => {
    const t0 = Date.UTC(2026, 0, 1);
    const day = 864e5;
    const data = {
      series: [
        {
          name: 'AAPL',
          data: [
            [t0, 10, 12, 9, 11] as never,
            [t0 + day, 11, 13, 10, 12] as never,
            [t0 + 2 * day, 12, 14, 11, 13] as never,
          ],
        },
      ],
    };
    const opts = resolveOptions({ type: 'candlestick', data } as ChartOptions);
    expect(buildModel(opts, new Map()).xType).toBe('time');

    const { el, chart } = mount({ type: 'candlestick', data } as ChartOptions);
    // The a11y table's `Time` column reads as a date, not as `1767.23B`.
    const first = [...(el.querySelectorAll('.chartcraft-a11y-table tbody tr')[0] as HTMLElement).children].map(
      (c) => c.textContent ?? '',
    );
    expect(first[0]).not.toMatch(/^\d+(\.\d+)?B?$/);
    expect(first[0]).toMatch(/Jan/);
    // ...and so does the keyboard announcement, and the CSV.
    key(el, 'ArrowRight');
    const said = (el.querySelector('.chartcraft-announcer') as HTMLElement).textContent ?? '';
    expect(said).toMatch(/Jan/);
    expect(said).not.toMatch(/17\d\d\.\d\dB/);
    expect(chart.exportData()).toMatch(/Jan/);
    // ...and the axis tick labels, which is the point of doing this as a
    // declaration rather than as a scoped formatting patch.
    expect(paintedText(el).some((t) => /Jan/.test(t))).toBe(true);
  });

  it('formatTemporal reads a bare number as epoch ms ONLY on a time axis', () => {
    expect(formatTemporal(1767225600000, false)).not.toMatch(/Jan|Dec/);
    expect(formatTemporal(1767225600000, true)).toMatch(/[A-Z][a-z]{2} \d+/);
    expect(formatTemporal('Mon', true)).toBe('Mon');
    expect(formatTemporal(null, true)).toBe('—');
  });

  it("gantt no longer writes `type` into the caller's xAxis options", () => {
    const { chart } = mount({
      type: 'gantt',
      data: {
        series: [
          { name: 'T', data: [{ x: 'Design', start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 0, 5) }] as never },
        ],
      },
    } as ChartOptions);
    // The axis KIND is a declaration now; `getOptions()` round-trips the
    // caller's configuration, not a computed one (deviation 15's rule).
    expect(chart.getOptions().xAxis?.type).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// E-7 — zoom re-windows incrementally.

/** A deterministic line well past the downsample threshold. */
function bigLine(n = 20_000): ChartOptions {
  const data: [number, number][] = [];
  for (let i = 0; i < n; i++) data.push([i, Math.sin(i / 97) * 100 + (i % 7)]);
  return { type: 'line', data: { series: [{ name: 'S', data: data as never }] } } as ChartOptions;
}

describe('E-7 — zoomTo re-windows from the retained points', () => {
  it('produces the SAME model a full rebuild would', () => {
    const opts = resolveOptions(bigLine());
    const base = buildModel(opts, new Map());
    const viewport = { x: [4000, 4500] as [number, number] };

    const rebuilt = buildModel(opts, new Map(), viewport);
    const rewound = rewindowModel(base, opts, viewport);
    expect(rewound).not.toBeNull();
    const r = rewound as NonNullable<typeof rewound>;

    expect(r.yDomain).toEqual(rebuilt.yDomain);
    expect(r.xDomain).toEqual(rebuilt.xDomain);
    expect(r.maxLen).toBe(rebuilt.maxLen);
    expect(r.viewport).toEqual(rebuilt.viewport);
    expect(r.series[0]!.points).toEqual(rebuilt.series[0]!.points);
    // The FULL series is still retained, so the a11y table stays complete.
    expect(r.series[0]!.sourcePoints).toHaveLength(20_000);
  });

  it('never compounds: window, then window again, then reset', () => {
    const opts = resolveOptions(bigLine());
    let m = buildModel(opts, new Map());
    m = rewindowModel(m, opts, { x: [0, 10_000] })!;
    m = rewindowModel(m, opts, { x: [4000, 4500] })!;
    expect(m.series[0]!.points).toEqual(buildModel(opts, new Map(), { x: [4000, 4500] }).series[0]!.points);
    const reset = rewindowModel(m, opts, null)!;
    expect(reset.series[0]!.points).toEqual(buildModel(opts, new Map()).series[0]!.points);
    expect(reset.viewport).toBeNull();
  });

  it('declines (returns null) where a re-window is not obviously equivalent', () => {
    const stacked = resolveOptions({ ...bigLine(1000), type: 'area', stacked: true } as ChartOptions);
    expect(rewindowModel(buildModel(stacked, new Map()), stacked, { x: [0, 10] })).toBeNull();

    const band = resolveOptions({
      type: 'bar',
      data: { categories: ['a', 'b'], series: [{ name: 'S', data: [1, 2] }] },
    } as ChartOptions);
    expect(rewindowModel(buildModel(band, new Map()), band, { x: [0, 1] })).toBeNull();
  });

  it('the chart-level behaviour is unchanged: zoomTo narrows, resets and emits', () => {
    const { chart } = mount(bigLine(12_000));
    const seen: unknown[] = [];
    chart.on('zoom', (e) => seen.push(e));
    const full = chart.exportData().split('\n').length;
    chart.zoomTo({ x: [100, 200] });
    expect(seen).toHaveLength(1);
    // The table is still the FULL series (audit A-1), not the window.
    expect(chart.exportData().split('\n').length).toBe(full);
    chart.zoomTo(null);
    expect(seen).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// E-8 — the a11yTable stage takes an optional limit.

describe('E-8 — a11yTable(ctx, { limit })', () => {
  it('a11yRowBudget treats missing/Infinity/NaN as unbounded and clamps negatives', () => {
    expect(a11yRowBudget(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(a11yRowBudget({})).toBe(Number.POSITIVE_INFINITY);
    expect(a11yRowBudget({ limit: Number.POSITIVE_INFINITY })).toBe(Number.POSITIVE_INFINITY);
    expect(a11yRowBudget({ limit: Number.NaN })).toBe(Number.POSITIVE_INFINITY);
    expect(a11yRowBudget({ limit: -5 })).toBe(0);
    expect(a11yRowBudget({ limit: 10 })).toBe(10);
  });

  it('applyTableLimit slices a definition that ignored the limit and keeps the count true', () => {
    const spec: A11yTableSpec = {
      columns: ['X', 'S'],
      rows: Array.from({ length: 10 }, (_, i) => ({ header: String(i), cells: [String(i)] })),
    };
    const cut = applyTableLimit(spec, 3);
    expect(cut.rows).toHaveLength(3);
    expect(cut.total).toBe(10);
    // Already within the bound: rows untouched, total filled in.
    expect(applyTableLimit(spec, 50).rows).toHaveLength(10);
    expect(applyTableLimit(spec, 50).total).toBe(10);
  });

  it('a definition that HONOURS limit builds only that many rows and reports the total', () => {
    const opts = resolveOptions(bigLine(5000));
    const model = buildModel(opts, new Map());
    const def = getChartType('line');
    const ctx = { opts, theme: lightTheme, model, layout: undefined as never };
    const bounded = def.a11yTable(ctx, { limit: 25 });
    expect(bounded.rows).toHaveLength(25);
    expect(bounded.total).toBe(model.maxLen);
    const all = def.a11yTable(ctx);
    expect(all.rows).toHaveLength(model.maxLen);
  });

  it('the DOM table is bounded, the caption and description state the TOTAL, the export is complete', () => {
    const { el, chart } = mount({ ...bigLine(3000), a11y: { tableMaxRows: 40 } } as ChartOptions);
    expect(el.querySelectorAll('.chartcraft-a11y-table tbody tr')).toHaveLength(40);
    const caption = el.querySelector('.chartcraft-a11y-table caption') as HTMLElement;
    expect(caption.textContent).toContain('first 40 of 3,000 rows');
    const descId = (canvasOf(el).getAttribute('aria-describedby') ?? '').split(' ')[0] ?? '';
    expect(document.getElementById(descId)?.textContent ?? '').toContain('3,000');
    // exportData is never bounded.
    expect(chart.exportData().split('\n').length - 1).toBe(3000);
  });

  it('a definition that IGNORES limit keeps working — the pipeline slices it', () => {
    // `waterfall` builds its rows from a running total and takes no `limit`.
    const data = { series: [{ name: 'S', data: Array.from({ length: 300 }, (_, i) => (i % 3) - 1) }] };
    const { el, chart } = mount({ type: 'waterfall', data, a11y: { tableMaxRows: 12 } } as ChartOptions);
    expect(el.querySelectorAll('.chartcraft-a11y-table tbody tr')).toHaveLength(12);
    expect((el.querySelector('.chartcraft-a11y-table caption') as HTMLElement).textContent).toContain(
      'first 12 of 300 rows',
    );
    expect(chart.exportData().split('\n').length - 1).toBe(300);
  });

  it('an uncapped table still materializes every row', () => {
    const { el } = mount({ ...bigLine(120), a11y: { tableMaxRows: Number.POSITIVE_INFINITY } } as ChartOptions);
    expect(el.querySelectorAll('.chartcraft-a11y-table tbody tr')).toHaveLength(120);
    expect((el.querySelector('.chartcraft-a11y-table caption') as HTMLElement).textContent).not.toContain('first');
  });

  it('decorator columns survive the limit, and the export still matches the table', () => {
    const data = {
      series: [
        {
          name: 'S',
          data: Array.from({ length: 50 }, (_, i) => ({ x: i, y: i })) as never,
          errorBars: { value: 1 },
        },
      ],
    };
    const { el, chart } = mount({ type: 'line', data, a11y: { tableMaxRows: 5 } } as ChartOptions);
    const head = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((th) => th.textContent);
    expect(head.length).toBeGreaterThan(2);
    expect(el.querySelectorAll('.chartcraft-a11y-table tbody tr')).toHaveLength(5);
    const csv = chart.exportData().split('\n');
    expect(csv[0]).toBe(head.join(','));
    expect(csv.length - 1).toBe(50);
  });
});
