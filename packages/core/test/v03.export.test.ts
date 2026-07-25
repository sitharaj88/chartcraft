/**
 * v0.3 export plumbing: exportData (CSV/JSON straight off the a11y table
 * spec — one source of truth) and exportImage (offscreen PNG re-render).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { a11yTableToCSV, a11yTableToJSON } from '../src/export';
import type { A11yTableSpec } from '../src/a11y';
import { cleanupDom, mount } from './helpers';
import { encodedCanvases } from './setup';

afterEach(cleanupDom);
beforeEach(() => {
  encodedCanvases.length = 0;
});

const data = {
  categories: ['A', 'B', 'C'],
  series: [
    { name: 'One', data: [1, 2, null] },
    { name: 'Two', data: [4, 5, 6] },
  ],
};

describe('a11y table serializers', () => {
  const spec: A11yTableSpec = {
    columns: ['Category', 'One', 'Two'],
    rows: [
      { header: 'A', cells: ['1', '4'] },
      { header: 'B', cells: ['2', '5'] },
    ],
  };

  it('CSV is the header row plus one row per spec row, header cell first', () => {
    expect(a11yTableToCSV(spec)).toBe('Category,One,Two\nA,1,4\nB,2,5');
  });

  it('CSV quotes commas, quotes and newlines (RFC 4180)', () => {
    const tricky: A11yTableSpec = {
      columns: ['Label', 'Value'],
      rows: [
        { header: 'Smith, John', cells: ['1,234'] },
        { header: 'He said "hi"', cells: ['line1\nline2'] },
      ],
    };
    expect(a11yTableToCSV(tricky)).toBe(
      'Label,Value\n"Smith, John","1,234"\n"He said ""hi""","line1\nline2"',
    );
  });

  it('CSV pads ragged rows to the column count', () => {
    const ragged: A11yTableSpec = { columns: ['A', 'B', 'C'], rows: [{ header: 'x', cells: [] }] };
    expect(a11yTableToCSV(ragged)).toBe('A,B,C\nx,,');
  });

  it('JSON is { columns, rows } with rows keyed by column name', () => {
    expect(JSON.parse(a11yTableToJSON(spec))).toEqual({
      columns: ['Category', 'One', 'Two'],
      rows: [
        { Category: 'A', One: '1', Two: '4' },
        { Category: 'B', One: '2', Two: '5' },
      ],
    });
  });

  it('JSON is pretty-printed with a 2-space indent and no trailing newline', () => {
    const out = a11yTableToJSON(spec);
    expect(out.startsWith('{\n  "columns"')).toBe(true);
    expect(out.endsWith('}')).toBe(true);
  });
});

describe('Chart.exportData', () => {
  it('defaults to CSV and mirrors the mounted a11y table exactly', () => {
    const { el, chart } = mount({ type: 'line', data });
    const csv = chart.exportData();
    // Rebuild the expected CSV from the DOM table the a11y layer rendered.
    const table = el.querySelector('.chartcraft-a11y-table table');
    const head = [...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent ?? '');
    const rows = [...(table?.querySelectorAll('tbody tr') ?? [])].map((tr) =>
      [...tr.querySelectorAll('th,td')].map((c) => c.textContent ?? ''),
    );
    expect(csv).toBe([head.join(','), ...rows.map((r) => r.join(','))].join('\n'));
    expect(csv).toBe('Category,One,Two\nA,1,4\nB,2,5\nC,—,6');
  });

  it('uses the axis label as the first column header when given', () => {
    const { chart } = mount({ type: 'bar', data, xAxis: { label: 'Quarter' } });
    expect(chart.exportData().split('\n')[0]).toBe('Quarter,One,Two');
  });

  it('emits JSON on request, with the same cells as the CSV', () => {
    const { chart } = mount({ type: 'bar', data });
    const parsed = JSON.parse(chart.exportData({ format: 'json' })) as {
      columns: string[];
      rows: Record<string, string>[];
    };
    expect(parsed.columns).toEqual(['Category', 'One', 'Two']);
    expect(parsed.rows).toEqual([
      { Category: 'A', One: '1', Two: '4' },
      { Category: 'B', One: '2', Two: '5' },
      { Category: 'C', One: '—', Two: '6' },
    ]);
  });

  it('reflects a shape-specific table (ohlc columns, not x/y)', () => {
    const { chart } = mount({
      type: 'ohlc',
      data: { series: [{ name: 'ACME', data: [[Date.UTC(2024, 0, 1), 10, 12, 9, 11]] as [number, number, number, number, number][] }] },
    });
    const header = chart.exportData().split('\n')[0] ?? '';
    expect(header.toLowerCase()).toContain('open');
    expect(header.toLowerCase()).toContain('high');
    expect(header.toLowerCase()).toContain('low');
    expect(header.toLowerCase()).toContain('close');
  });

  it('tracks legend toggles and data updates (it is the live table)', () => {
    const { chart } = mount({ type: 'bar', data });
    chart.setData({ categories: ['Z'], series: [{ name: 'Solo', data: [7] }] });
    expect(chart.exportData()).toBe('Category,Solo\nZ,7');
  });
});

describe('Chart.exportImage', () => {
  it('resolves a PNG Blob', async () => {
    const { chart } = mount({ type: 'line', data });
    const blob = await chart.exportImage();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('renders offscreen at scale 2 by default', async () => {
    const { chart } = mount({ type: 'line', data });
    await chart.exportImage();
    expect(encodedCanvases.at(-1)).toEqual({ width: 1200, height: 800, type: 'image/png' });
  });

  it('honors an explicit scale', async () => {
    const { chart } = mount({ type: 'line', data });
    await chart.exportImage({ scale: 3 });
    expect(encodedCanvases.at(-1)).toEqual({ width: 1800, height: 1200, type: 'image/png' });
  });

  it('clamps absurd scales instead of allocating a huge canvas', async () => {
    const { chart } = mount({ type: 'line', data });
    await chart.exportImage({ scale: 10_000 });
    expect(encodedCanvases.at(-1)?.width).toBe(600 * 8);
  });

  it('paints the requested background instead of the theme surface', async () => {
    const { chart } = mount({ type: 'line', data });
    // Capture the offscreen canvas (it is never mounted in the document).
    const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
    const real = proto['toBlob'] as (cb: (b: Blob | null) => void, t?: string) => void;
    let offscreen: HTMLCanvasElement | null = null;
    proto['toBlob'] = function patched(this: HTMLCanvasElement, cb: (b: Blob | null) => void, t?: string) {
      offscreen = this;
      real.call(this, cb, t);
    };
    try {
      await chart.exportImage({ background: '#ff00ff' });
    } finally {
      proto['toBlob'] = real;
    }
    const ctx = (offscreen as unknown as HTMLCanvasElement).getContext('2d') as unknown as {
      __props: { prop: string; value: unknown }[];
    };
    expect(ctx.__props.find((p) => p.prop === 'fillStyle')?.value).toBe('#ff00ff');
  });

  it('does not disturb the live canvas size', async () => {
    const { el, chart } = mount({ type: 'line', data });
    const live = el.querySelector('canvas') as HTMLCanvasElement;
    const before = { w: live.width, h: live.height };
    await chart.exportImage({ scale: 4 });
    expect({ w: live.width, h: live.height }).toEqual(before);
  });

  it("rejects format 'svg' with a clear 'SVG renderer not available' error", async () => {
    const { chart } = mount({ type: 'line', data });
    await expect(chart.exportImage({ format: 'svg' })).rejects.toThrow(/SVG renderer not available/);
    await expect(chart.exportImage({ format: 'svg' })).rejects.toThrow(/format: 'png'/);
  });

  it('rejects after destroy', async () => {
    const { chart } = mount({ type: 'line', data });
    chart.destroy();
    await expect(chart.exportImage()).rejects.toThrow(/destroyed chart/);
  });

  it('works for a non-cartesian type too (registry dispatch, no branching)', async () => {
    const { chart } = mount({ type: 'pie', data: { series: [{ name: 'Share', data: [{ x: 'A', y: 3 }, { x: 'B', y: 1 }] }] } });
    const blob = await chart.exportImage({ scale: 1 });
    expect(blob).toBeInstanceOf(Blob);
    expect(encodedCanvases.at(-1)).toEqual({ width: 600, height: 400, type: 'image/png' });
  });
});
