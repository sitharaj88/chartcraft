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
import type { ChartOptions, ChartType, PointEvent } from '../src/index';
import { cleanupDom, ctxOf, mount, tap, tooltipVisible } from './helpers';
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

/**
 * v0.3.3 — tap-to-inspect is pipeline-level, not per-type: `chart.ts` drives it
 * through the same `hitTest` stage the mouse uses. This proves that for one
 * representative type per FAMILY, so a family whose geometry the touch path
 * cannot reach (a hierarchy's rects, a projected geography, a force-laid graph)
 * fails here rather than on a user's phone.
 */
describe('a tap reaches a datum on every chart family', () => {
  const REPRESENTATIVE: ChartType[] = [
    'line', // cartesian
    'bar', // cartesian / banded
    'scatter', // point cloud
    'pie', // radial
    'treemap', // hierarchy
    'heatmap', // matrix
    'sankey', // graph / flow
    'network', // graph / force
    'choropleth', // geo
  ];

  for (const type of REPRESENTATIVE) {
    it(`${type}: a finger tap shows a tooltip`, () => {
      const { el, chart } = mount({ type, ...FIXTURES[type] } as ChartOptions);
      const enters: PointEvent[] = [];
      chart.on('pointenter', (e) => enters.push(e));

      // Sweep the canvas: SOMEWHERE on a chart of this type a tap must land on
      // a mark. Which pixel that is depends on the fixture, not on the touch
      // plumbing under test.
      let hit = false;
      for (let x = 20; x <= 580 && !hit; x += 20) {
        for (let y = 20; y <= 380 && !hit; y += 20) {
          tap(el, x, y);
          hit = tooltipVisible(el);
        }
      }

      expect(hit).toBe(true);
      expect(enters.length).toBeGreaterThan(0);
      chart.destroy();
      cleanupDom();
    });
  }
});
