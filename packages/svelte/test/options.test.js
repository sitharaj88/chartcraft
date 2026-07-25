/**
 * Logic + source-shape tests for the plain-JS helpers and the per-type
 * component surface (exported, injects its type, forwards every bridged event,
 * compiles warning-free). Behavioural coverage of the mounted components lives
 * in ./component.test.js, which compiles them in-memory (./loader.js).
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

describe('v0.2 per-type components', () => {
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

describe('v0.3 per-type components', () => {
  const V03_COMPONENTS = [
    ['RangeareaChart', 'rangearea'],
    ['BulletChart', 'bullet'],
    ['DumbbellChart', 'dumbbell'],
    ['LollipopChart', 'lollipop'],
    ['SlopeChart', 'slope'],
    ['StreamgraphChart', 'streamgraph'],
    ['MarimekkoChart', 'marimekko'],
    ['PyramidChart', 'pyramid'],
    ['CalendarChart', 'calendar'],
    ['RadialbarChart', 'radialbar'],
    ['RoseChart', 'rose'],
    ['ViolinChart', 'violin'],
    ['ParallelChart', 'parallel'],
    ['IcicleChart', 'icicle'],
    ['CirclepackChart', 'circlepack'],
    ['WordcloudChart', 'wordcloud'],
    ['SankeyChart', 'sankey'],
    ['GanttChart', 'gantt'],
    ['ChoroplethChart', 'choropleth'],
    ['NetworkChart', 'network'],
  ];

  it('every v0.3 alias is exported, injects its type, forwards all six events, and compiles clean', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const { compile } = await import('svelte/compiler');
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

    const indexSource = readFileSync(join(srcDir, 'index.js'), 'utf8');
    const dtsSource = readFileSync(join(srcDir, 'index.d.ts'), 'utf8');

    expect(V03_COMPONENTS).toHaveLength(20);

    for (const [name, type] of V03_COMPONENTS) {
      // Exported from the package entry and typed in index.d.ts.
      expect(indexSource).toContain(`export { default as ${name} } from './${name}.svelte'`);
      expect(dtsSource).toContain(`export class ${name} extends TypedChart {}`);

      const source = readFileSync(join(srcDir, `${name}.svelte`), 'utf8');
      expect(source).toContain(`withType(options, '${type}')`);
      expect(withType({ data: { series: [] } }, type).type).toBe(type);

      // Every bridged core event is forwarded from the inner <Chart>.
      for (const event of EVENTS) expect(source).toContain(`on:${event}`);

      // Smoke-compile: zero errors, zero warnings.
      const { warnings } = compile(source, { filename: `${name}.svelte`, generate: 'dom' });
      expect(warnings).toEqual([]);
    }
  });

  it('the v0.2 aliases forward the two new events as well', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

    for (const [name] of V02_COMPONENTS) {
      const source = readFileSync(join(srcDir, `${name}.svelte`), 'utf8');
      expect(source, `${name} must forward on:zoom`).toContain('on:zoom');
      expect(source, `${name} must forward on:annotationclick`).toContain('on:annotationclick');
    }
  });
});

describe('EVENTS', () => {
  it('lists exactly the six bridged core events, in a stable order', () => {
    expect(EVENTS).toEqual([
      'pointclick',
      'pointenter',
      'pointleave',
      'legendtoggle',
      'zoom',
      'annotationclick',
    ]);
  });
});
