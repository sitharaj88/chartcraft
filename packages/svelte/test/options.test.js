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

describe('v0.2 per-type components', () => {
  const V02_COMPONENTS = [
    ['BubbleChart', 'bubble'],
    ['SparklineChart', 'sparkline'],
    ['HistogramChart', 'histogram'],
    ['BoxplotChart', 'boxplot'],
    ['CandlestickChart', 'candlestick'],
    ['OhlcChart', 'ohlc'],
    ['WaterfallChart', 'waterfall'],
    ['HeatmapChart', 'heatmap'],
    ['TreemapChart', 'treemap'],
    ['SunburstChart', 'sunburst'],
    ['FunnelChart', 'funnel'],
    ['RadarChart', 'radar'],
    ['GaugeChart', 'gauge'],
  ];

  it('every v0.2 alias is exported, injects its type via withType, and compiles clean', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const { compile } = await import('svelte/compiler');
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

    const indexSource = readFileSync(join(srcDir, 'index.js'), 'utf8');
    const dtsSource = readFileSync(join(srcDir, 'index.d.ts'), 'utf8');

    for (const [name, type] of V02_COMPONENTS) {
      // Exported from the package entry and typed in index.d.ts.
      expect(indexSource).toContain(`export { default as ${name} } from './${name}.svelte'`);
      expect(dtsSource).toContain(`export class ${name} extends TypedChart {}`);

      // The component injects exactly its chart type (sampling the wiring
      // through the same withType helper the component calls).
      const source = readFileSync(join(srcDir, `${name}.svelte`), 'utf8');
      expect(source).toContain(`withType(options, '${type}')`);
      expect(withType({ data: { series: [] } }, type).type).toBe(type);

      // Smoke-compile: zero errors, zero warnings.
      const { warnings } = compile(source, { filename: `${name}.svelte`, generate: 'dom' });
      expect(warnings).toEqual([]);
    }
  });
});

describe('EVENTS', () => {
  it('lists exactly the four bridged core events, in a stable order', () => {
    expect(EVENTS).toEqual(['pointclick', 'pointenter', 'pointleave', 'legendtoggle']);
  });
});
