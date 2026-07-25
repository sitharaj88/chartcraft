/**
 * Docs-demo smoke test: extracts the option objects from every v0.2 docs demo
 * component (docs/.vitepress/theme/components/Demo*.vue) and mounts them
 * against the real @chartcraft/core, proving the documented API shapes render
 * without throwing. Keeps the live docs demos honest as core evolves.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'vue/compiler-sfc';
import ts from 'typescript';
import { createChart } from '@chartcraft/core';
import type { ChartOptions } from '@chartcraft/core';
import './setup';

// The repo ships no @types/node, so load the builtins through non-literal
// dynamic imports (untyped at compile time, real node modules at runtime).
const nodeModule = async <T>(name: string): Promise<T> =>
  (await import(/* @vite-ignore */ name)) as T;
const { readFileSync } = await nodeModule<{ readFileSync(p: string, enc: 'utf8'): string }>(
  'node:fs',
);
const { fileURLToPath } = await nodeModule<{ fileURLToPath(u: string): string }>('node:url');
const { dirname, join } = await nodeModule<{
  dirname(p: string): string;
  join(...parts: string[]): string;
}>('node:path');

const componentsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  '.vitepress',
  'theme',
  'components',
);

/** file → expression evaluating to ChartOptions[] using the script's consts */
const DEMOS: Record<string, string> = {
  'DemoBubble.vue': '[options]',
  'DemoHistogram.vue': '[options]',
  'DemoBoxplot.vue': '[options]',
  'DemoCandlestick.vue': '[candlestick, ohlc]',
  'DemoWaterfall.vue': '[options]',
  'DemoHeatmap.vue': '[options]',
  'DemoTreemap.vue': '[options]',
  'DemoSunburst.vue': '[options]',
  'DemoFunnel.vue': '[options]',
  'DemoRadar.vue': '[options]',
  'DemoGauge.vue': '[options]',
  'DemoSparklineRow.vue': 'tiles.map((t) => t.options)',
  'DemoCombo.vue': '[options]',
};

function extractOptions(file: string, expr: string): ChartOptions[] {
  const source = readFileSync(join(componentsDir, file), 'utf8');
  const { descriptor } = parse(source);
  const script = descriptor.scriptSetup?.content ?? '';
  const body = script.replace(/^import .*$/gm, ''); // demos only import types
  const js = ts.transpileModule(`${body}\n;return ${expr};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  // eslint-disable-next-line no-new-func
  return new Function(js)() as ChartOptions[];
}

describe('docs demo option sets mount against real core', () => {
  for (const [file, expr] of Object.entries(DEMOS)) {
    it(`${file} renders without throwing`, () => {
      const optionSets = extractOptions(file, expr);
      expect(optionSets.length).toBeGreaterThan(0);
      for (const options of optionSets) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const chart = createChart(host, {
          ...options,
          theme: 'light',
          width: 640,
          height: 360,
        });
        expect(chart.getOptions().type).toBe(options.type);
        expect(host.querySelector('canvas')).not.toBeNull();
        chart.destroy();
        host.remove();
      }
    });
  }
});
