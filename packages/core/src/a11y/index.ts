/**
 * Accessibility subsystem: aria labeling, visually-hidden data table, and an
 * aria-live announcer. Canvas is opaque to AT, so this DOM layer is the
 * accessible representation of the chart.
 *
 * v0.2: table CONTENT is supplied by the chart-type definition (registry
 * `a11yTable` stage) as an A11yTableSpec — this module only builds DOM from
 * the spec, with zero per-type branching.
 */
import type { DataModel, ResolvedOptions } from '../model';

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

/**
 * Data-table content, shape-appropriate to the chart type (e.g. an OHLC
 * table has open/high/low/close columns). Produced by the type definition's
 * `a11yTable` stage; the first column is the row-header column.
 */
export interface A11yTableSpec {
  /** Header row: first entry is the row-header column's title. */
  columns: string[];
  rows: {
    /** Row header cell (th scope="row"). */
    header: string;
    /** One cell per remaining column. */
    cells: string[];
  }[];
}

/** Build (or rebuild) the data table fallback from a definition's spec. */
export function buildDataTable(doc: Document, caption: string, spec: A11yTableSpec): HTMLTableElement {
  const table = doc.createElement('table');
  table.className = 'chartcraft-data-table';

  const cap = doc.createElement('caption');
  cap.textContent = caption;
  table.appendChild(cap);

  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const col of spec.columns) {
    const th = doc.createElement('th');
    th.scope = 'col';
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = doc.createElement('tbody');
  for (const row of spec.rows) {
    const tr = doc.createElement('tr');
    const th = doc.createElement('th');
    th.scope = 'row';
    th.textContent = row.header;
    tr.appendChild(th);
    for (const cell of row.cells) {
      const td = doc.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
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
