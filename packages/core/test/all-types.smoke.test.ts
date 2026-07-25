/**
 * Integration guard: EVERY contract chart type must mount, paint, expose an
 * a11y table, export data, and destroy cleanly through the wired registry.
 *
 * This is the test that proves the registry wiring in src/charts/index.ts is
 * complete — a type whose registration was forgotten shows up here as a
 * "not implemented" throw rather than silently shipping broken.
 */
import { describe, expect, it } from 'vitest';
import { CHART_TYPE_IDS, isChartTypeRegistered } from '../src/charts/registry';
import { registerBuiltinChartTypes } from '../src/charts';
import type { ChartOptions, ChartType } from '../src/index';
import { cleanupDom, ctxOf, mount } from './helpers';
import { FIXTURES } from './fixtures.all-types';

registerBuiltinChartTypes();

describe('all contract chart types mount through the wired registry', () => {
  it('covers every declared id with a fixture (no type left untested)', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...CHART_TYPE_IDS].sort());
  });

  it('every declared id has a real registered definition (no placeholders left)', () => {
    const missing = CHART_TYPE_IDS.filter((id) => !isChartTypeRegistered(id));
    expect(missing).toEqual([]);
  });

  for (const type of CHART_TYPE_IDS) {
    it(`${type}: mounts, paints, tables, exports and destroys`, () => {
      const fixture = FIXTURES[type];
      const { el, chart } = mount({ type, title: `${type} smoke`, ...fixture } as ChartOptions);

      // Painted something.
      expect(ctxOf(el).__calls.length).toBeGreaterThan(0);
      // Accessible: role=img with a name, and a data table with headers.
      const canvas = el.querySelector('canvas')!;
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toBeTruthy();
      const headers = [...el.querySelectorAll('.chartcraft-a11y-table thead th')];
      expect(headers.length).toBeGreaterThan(0);
      // Export mirrors the table.
      const csv = chart.exportData({ format: 'csv' });
      expect(csv.split('\n').length).toBeGreaterThan(1);
      const json = JSON.parse(chart.exportData({ format: 'json' })) as { columns: string[]; rows: unknown[] };
      expect(json.columns.length).toBeGreaterThan(0);
      // Update + destroy are clean.
      chart.update({ theme: 'dark' });
      expect(() => chart.destroy()).not.toThrow();
      cleanupDom();
    });
  }
});
