/**
 * Accessibility subsystem: aria labeling, visually-hidden data table, and an
 * aria-live announcer. Canvas is opaque to AT, so this DOM layer is the
 * accessible representation of the chart.
 */
import type { DataModel, ResolvedOptions } from '../model';
import { formatValue } from '../util';

/** Apply the visually-hidden (AT-readable) clip technique. */
export function visuallyHide(el: HTMLElement): void {
  const st = el.style;
  st.position = 'absolute';
  st.width = '1px';
  st.height = '1px';
  st.margin = '-1px';
  st.padding = '0';
  st.border = '0';
  st.clip = 'rect(0 0 0 0)';
  st.clipPath = 'inset(50%)';
  st.overflow = 'hidden';
  st.whiteSpace = 'nowrap';
}

export function unhide(el: HTMLElement): void {
  const st = el.style;
  st.position = '';
  st.width = '';
  st.height = '';
  st.margin = '';
  st.padding = '';
  st.border = '';
  st.clip = '';
  st.clipPath = '';
  st.overflow = '';
  st.whiteSpace = '';
}

/** Generated summary used when no explicit a11y title / title exists. */
export function generateAriaLabel(opts: ResolvedOptions, model: DataModel): string {
  if (opts.a11y.title) return opts.a11y.title;
  const typeName = model.type.charAt(0).toUpperCase() + model.type.slice(1);
  const base = opts.title ? `${opts.title}. ${typeName} chart` : `${typeName} chart`;
  const n = model.series.length;
  const pts = model.maxLen;
  return `${base} with ${n} series and ${pts} ${pts === 1 ? 'point' : 'points'}.`;
}

/** Build (or rebuild) the data table fallback. */
export function buildDataTable(doc: Document, model: DataModel, opts: ResolvedOptions): HTMLTableElement {
  const table = doc.createElement('table');
  table.className = 'chartcraft-data-table';

  const caption = doc.createElement('caption');
  caption.textContent = opts.title ?? generateAriaLabel(opts, model);
  table.appendChild(caption);

  const isPie = model.type === 'pie' || model.type === 'donut';
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  const xHead = doc.createElement('th');
  xHead.scope = 'col';
  xHead.textContent = isPie
    ? 'Slice'
    : (opts.xAxis.label ?? (model.xType === 'category' ? 'Category' : model.xType === 'time' ? 'Time' : 'X'));
  headRow.appendChild(xHead);

  if (isPie) {
    const vHead = doc.createElement('th');
    vHead.scope = 'col';
    vHead.textContent = 'Value';
    headRow.appendChild(vHead);
  } else {
    for (const s of model.series) {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.textContent = s.name;
      headRow.appendChild(th);
    }
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = doc.createElement('tbody');
  if (isPie) {
    const series = model.series.find((s) => s.visible) ?? model.series[0];
    series?.points.forEach((p, pi) => {
      const tr = doc.createElement('tr');
      const th = doc.createElement('th');
      th.scope = 'row';
      th.textContent = p.label ?? (typeof p.x === 'string' ? p.x : formatValue(model.categories?.[pi] ?? pi));
      tr.appendChild(th);
      const td = doc.createElement('td');
      td.textContent = p.y === null ? '—' : formatValue(p.y);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  } else {
    for (let i = 0; i < model.maxLen; i++) {
      const tr = doc.createElement('tr');
      const th = doc.createElement('th');
      th.scope = 'row';
      const cat = model.categories?.[i];
      const xVal = cat !== undefined ? cat : (model.series[0]?.points[i]?.x ?? i);
      th.textContent = formatValue(xVal);
      tr.appendChild(th);
      for (const s of model.series) {
        const td = doc.createElement('td');
        const y = s.points[i]?.y ?? null;
        td.textContent = y === null ? '—' : formatValue(y);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  return table;
}

/** aria-live region for keyboard navigation announcements. */
export class Announcer {
  readonly el: HTMLElement;

  constructor(doc: Document) {
    this.el = doc.createElement('div');
    this.el.className = 'chartcraft-announcer';
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('role', 'status');
    visuallyHide(this.el);
  }

  announce(text: string): void {
    this.el.textContent = text;
  }

  destroy(): void {
    this.el.remove();
  }
}
