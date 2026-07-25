import { afterEach, describe, expect, it } from 'vitest';
import { canvasOf, cleanupDom, mount } from './helpers';

afterEach(cleanupDom);

const data = {
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'North', data: [10, null, 30] },
    { name: 'South', data: [5, 15, 25] },
  ],
};

describe('a11y', () => {
  it('canvas gets role="img" and a generated aria-label', () => {
    const { el } = mount({ type: 'bar', data });
    const canvas = canvasOf(el);
    expect(canvas.getAttribute('role')).toBe('img');
    const label = canvas.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/Bar chart/);
    expect(label).toMatch(/2 series/);
  });

  it('a11y.title overrides; options.title is woven into the label', () => {
    const a = mount({ type: 'line', data, a11y: { title: 'Custom label' } });
    expect(canvasOf(a.el).getAttribute('aria-label')).toBe('Custom label');
    const b = mount({ type: 'line', data, title: 'Sales' });
    expect(canvasOf(b.el).getAttribute('aria-label')).toMatch(/^Sales\./);
  });

  it('description renders visually hidden and is referenced by aria-describedby', () => {
    const { el } = mount({ type: 'line', data, a11y: { description: 'Longer description here.' } });
    const canvas = canvasOf(el);
    const descId = canvas.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = el.querySelector(`#${descId}`) as HTMLElement;
    expect(desc.textContent).toBe('Longer description here.');
    expect(desc.style.position).toBe('absolute');
    expect(desc.style.width).toBe('1px');
  });

  it('data table: header row = x + series names; rows carry values; null shows as gap', () => {
    const { el } = mount({ type: 'line', data, title: 'Sales' });
    const table = el.querySelector('.chartcraft-a11y-table table') as HTMLTableElement;
    expect(table.querySelector('caption')!.textContent).toBe('Sales');
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Category', 'North', 'South']);
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(3);
    const firstRow = [...rows[0]!.children].map((c) => c.textContent);
    expect(firstRow).toEqual(['Q1', '10', '5']);
    const secondRow = [...rows[1]!.children].map((c) => c.textContent);
    expect(secondRow).toEqual(['Q2', '—', '15']);
  });

  it('pie table lists slices and values', () => {
    const { el } = mount({
      type: 'pie',
      data: { series: [{ name: 'Share', data: [{ x: 'A', y: 3 }, { x: 'B', y: 1 }] }] },
    });
    const cells = [...el.querySelectorAll('.chartcraft-a11y-table tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(cells).toEqual([
      ['A', '3'],
      ['B', '1'],
    ]);
  });

  it("table modes: default 'hidden' is visually hidden; 'visible' is not; 'off' removes it", () => {
    const hidden = mount({ type: 'line', data });
    const hiddenWrap = hidden.el.querySelector('.chartcraft-a11y-table') as HTMLElement;
    expect(hiddenWrap.style.width).toBe('1px');
    expect(hiddenWrap.querySelector('table')).toBeTruthy();

    const visible = mount({ type: 'line', data, a11y: { table: 'visible' } });
    const visWrap = visible.el.querySelector('.chartcraft-a11y-table') as HTMLElement;
    expect(visWrap.style.width).not.toBe('1px');
    expect(visWrap.querySelector('table')).toBeTruthy();

    const off = mount({ type: 'line', data, a11y: { table: 'off' } });
    expect(off.el.querySelector('.chartcraft-a11y-table table')).toBeNull();
  });

  it('keyboard: canvas focusable by default; not focusable when disabled', () => {
    const on = mount({ type: 'line', data });
    expect(canvasOf(on.el).tabIndex).toBe(0);
    const off = mount({ type: 'line', data, a11y: { keyboard: false } });
    expect(canvasOf(off.el).hasAttribute('tabindex')).toBe(false);
  });

  it('mounts a polite aria-live announcer region', () => {
    const { el } = mount({ type: 'line', data });
    const region = el.querySelector('.chartcraft-announcer') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.style.position).toBe('absolute');
  });
});
