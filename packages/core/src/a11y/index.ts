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

/**
 * Display names for type ids whose mechanical capitalization is WRONG —
 * `'ohlc'` capitalized to `Ohlc`, which is what a screen reader said out loud.
 *
 * Deliberately not a prettifier: re-spelling `streamgraph` as "Stream graph" or
 * `choropleth` as "Choropleth map" reads marginally better but breaks the
 * invariant that the accessible name CONTAINS the type id, which existing tests
 * assert (`composition.shared.test.ts` matches `new RegExp(id, 'i')`) and which
 * is worth more than the cosmetics: it is how a caller confirms the label
 * describes the chart they asked for. Add an entry here only for an id whose
 * default capitalization is incorrect, not merely inelegant.
 */
const TYPE_DISPLAY_NAMES: Record<string, string> = {
  ohlc: 'OHLC',
};

function typeDisplayName(type: string): string {
  return TYPE_DISPLAY_NAMES[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * What the pipeline knows about the marks when it builds the accessible name.
 *
 * `marks` is the number of KEYBOARD-REACHABLE marks (summed over the type's own
 * `keyboardNav` geometry), not `model.maxLen`. Those differ for most v0.3 types
 * and the old label reported the wrong one: a 2x3 heat map announced "3 points"
 * (it has 6 cells), a sankey of 3 nodes and 2 links announced "1 series and 5
 * points", and a treemap announced its top-level count while drawing its leaves.
 */
export interface AriaLabelFacts {
  /** Keyboard-reachable mark count across visible series. */
  marks: number;
  /** Value extent actually plotted, or null when the type has no value axis. */
  valueRange?: [number, number] | null;
  /** Names of visible series, for the "series" clause. */
  seriesNames?: string[];
  /** A type's own summary clause, replacing the generic mark/series clause. */
  typeSummary?: string | null;
  /** Formatter for values in the range clause (the value axis' own). */
  formatValue?: (v: number) => string;
}

/**
 * Generated accessible NAME, used when no explicit `a11y.title` exists.
 *
 * The contract asks for a "meaningful generated aria summary". "Line chart with
 * 1 series and 3 points." names the chart but says nothing ABOUT it, so the
 * generated name now also carries the series identities and the value range —
 * the two facts that make a summary worth hearing before deciding whether to
 * walk the data table. A type whose marks are not "points" supplies its own
 * clause through the `a11ySummary` definition stage (`facts.typeSummary`).
 */
export function generateAriaLabel(opts: ResolvedOptions, model: DataModel, facts?: AriaLabelFacts): string {
  if (opts.a11y.title) return opts.a11y.title;
  const typeName = typeDisplayName(model.type);
  const base = opts.title ? `${opts.title}. ${typeName} chart` : `${typeName} chart`;

  if (facts?.typeSummary) return `${base}: ${facts.typeSummary}`;

  const visible = model.series.filter((s) => s.visible);
  const n = visible.length;
  const marks = facts?.marks ?? model.maxLen;
  // One sentence: counts, then the value range. `valueRange: null` suppresses
  // the range clause for a type that has no value axis (`axes: 'rows'`), where
  // reporting `model.yDomain` announced raw epoch milliseconds as data values.
  let sentence = `${base} with ${n} series and ${marks} ${marks === 1 ? 'point' : 'points'}`;
  const range = facts && 'valueRange' in facts ? facts.valueRange : model.yDomain;
  const fmt = facts?.formatValue;
  if (range && Number.isFinite(range[0]) && Number.isFinite(range[1]) && marks > 0) {
    const lo = fmt ? fmt(range[0]) : String(range[0]);
    const hi = fmt ? fmt(range[1]) : String(range[1]);
    sentence += lo === hi ? `, value ${lo}` : `, values from ${lo} to ${hi}`;
  }
  sentence += '.';

  // Series identities as a second sentence: the legend carries them visually, so
  // the accessible name must too. Capped — a 40-series name is not a summary.
  const names = (facts?.seriesNames ?? visible.map((s) => s.name)).filter((s) => s.length > 0);
  if (n > 1 && names.length > 0) {
    sentence +=
      names.length <= 4
        ? ` Series: ${names.join(', ')}.`
        : ` ${names.length} series including ${names.slice(0, 4).join(', ')}.`;
  }

  return sentence;
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

/**
 * Maximum rows MATERIALIZED into the DOM table.
 *
 * The table is a real `<table>` with one `<tr>` per datum, rebuilt whenever the
 * data changes, and building it is linear in rows with a large constant (DOM
 * node creation). Measured on the bench host: ~115 microseconds per row, so a
 * 100,000-row table costs ~11.5 SECONDS of synchronous main-thread work on
 * mount, and a million-row one exhausts the heap outright.
 *
 * So the DOM table is capped and SAYS SO — in its own `<caption>` and in the
 * chart's accessible description. `exportData()` is NOT capped: it builds a
 * string on demand, only when asked, and an export that silently truncates is a
 * data-integrity bug. The split is deliberate: completeness where it is
 * affordable, a stated bound where it is not.
 *
 * (Escalated in QUALITY-AUDIT.md: the alternative — an uncapped table — trades a
 * multi-second stall and an OOM for rows no screen reader can practically reach.)
 */
export const A11Y_TABLE_MAX_ROWS = 2000;

/**
 * Build (or rebuild) the data table fallback from a definition's spec.
 * Truncates at `A11Y_TABLE_MAX_ROWS`, stating the truncation in the caption.
 */
export function buildDataTable(doc: Document, caption: string, spec: A11yTableSpec): HTMLTableElement {
  const table = doc.createElement('table');
  table.className = 'chartcraft-data-table';

  const truncated = spec.rows.length > A11Y_TABLE_MAX_ROWS;
  const cap = doc.createElement('caption');
  cap.textContent = truncated
    ? `${caption} — showing the first ${A11Y_TABLE_MAX_ROWS.toLocaleString()} of ` +
      `${spec.rows.length.toLocaleString()} rows. Use exportData() for the complete data.`
    : caption;
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
  for (const row of truncated ? spec.rows.slice(0, A11Y_TABLE_MAX_ROWS) : spec.rows) {
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
