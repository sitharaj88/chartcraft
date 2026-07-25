import { describe, expect, it } from 'vitest';
import { CHART_TYPE_IDS, getChartType } from '../src/charts/registry';
import { registerBuiltinChartTypes } from '../src/charts';
import type { ChartOptions } from '../src/index';
import { canvasOf, cleanupDom, key, mount } from './helpers';
import { FIXTURES } from './fixtures.all-types';

registerBuiltinChartTypes();

describe('report', () => {
  it('emit conformance table', () => {
    const out: string[] = [];
    out.push('| type | accessible name (generated) | table columns | rows | nav stops | announcement sample |');
    out.push('|---|---|---|---|---|---|');
    for (const type of CHART_TYPE_IDS) {
      const { el } = mount({ type, ...FIXTURES[type] } as ChartOptions);
      const label = canvasOf(el).getAttribute('aria-label') ?? '';
      const cols = [...el.querySelectorAll('.chartcraft-a11y-table thead th')].map((t) => t.textContent).join(', ');
      const rows = el.querySelectorAll('.chartcraft-a11y-table tbody tr').length;
      const ann = el.querySelector('.chartcraft-announcer') as HTMLElement;
      const stops: string[] = [];
      let prev = '';
      for (let i = 0; i < 200; i++) {
        key(el, 'ArrowRight');
        const t = ann.textContent ?? '';
        if (t === prev) break;
        prev = t;
        stops.push(t);
      }
      const def = getChartType(type);
      const custom = def.a11ySummary ? ' *(type summary)*' : '';
      out.push(
        `| \`${type}\` | ${label}${custom} | ${cols} | ${rows} | ${stops.length}${def.announce ? ' *(type)*' : ' *(generic)*'} | ${stops[0] ?? '—'} |`,
      );
      cleanupDom();
    }
    console.log('\nCONFORMANCE_TABLE_START\n' + out.join('\n') + '\nCONFORMANCE_TABLE_END');
    expect(true).toBe(true);
  });
});
