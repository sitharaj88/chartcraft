/**
 * Export plumbing (v0.3): data export and raster image encoding.
 *
 * `exportData()` emits EXACTLY the accessible data table's contents — the same
 * `A11yTableSpec` every `ChartTypeDefinition` already produces for the a11y
 * layer. There is no second, parallel data-shape description in the codebase:
 * a type that gets its a11y table right gets CSV/JSON for free.
 */
import type { A11yTableSpec } from './a11y';

/** All cells of a table spec row, row-header first. */
function rowCells(row: A11yTableSpec['rows'][number]): string[] {
  return [row.header, ...row.cells];
}

/** RFC 4180 field: quote when it contains a comma, quote, CR or LF. */
function csvField(value: string): string {
  const s = value ?? '';
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV of the a11y table: header row from `columns`, then one row per spec row
 * (row header first). Fields are RFC 4180 quoted; rows are '\n'-separated with
 * no trailing newline. Ragged rows are padded to the column count.
 */
export function a11yTableToCSV(spec: A11yTableSpec): string {
  const width = spec.columns.length;
  const pad = (cells: string[]): string[] =>
    width > 0 ? Array.from({ length: width }, (_, i) => cells[i] ?? '') : cells;
  const lines = [pad(spec.columns).map(csvField).join(',')];
  for (const row of spec.rows) lines.push(pad(rowCells(row)).map(csvField).join(','));
  return lines.join('\n');
}

/**
 * JSON of the a11y table: `{ columns, rows }` where every row is an object
 * keyed by column name (row header under the first column's name). Duplicate
 * column names collapse — table columns are expected to be unique.
 * Pretty-printed with 2-space indent, no trailing newline.
 */
export function a11yTableToJSON(spec: A11yTableSpec): string {
  const columns = [...spec.columns];
  const rows = spec.rows.map((row) => {
    const cells = rowCells(row);
    const out: Record<string, string> = {};
    columns.forEach((col, i) => {
      out[col] = cells[i] ?? '';
    });
    return out;
  });
  return JSON.stringify({ columns, rows }, null, 2);
}

/**
 * Encode a canvas as a Blob. Prefers `toBlob`; falls back to `toDataURL` when
 * the environment lacks it, and rejects with a clear message when neither
 * works (e.g. a tainted or unsupported canvas).
 */
export function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const fail = (cause?: unknown): void => {
      reject(
        new Error(
          `@chartcraft/core: image export failed — this environment could not encode the canvas as ${mime}` +
            (cause instanceof Error ? ` (${cause.message})` : ''),
        ),
      );
    };
    const viaDataURL = (): void => {
      try {
        if (typeof canvas.toDataURL !== 'function') return fail();
        const url = canvas.toDataURL(mime);
        const comma = url.indexOf(',');
        if (comma < 0) return fail();
        const payload = url.slice(comma + 1);
        const decode = (globalThis as { atob?: (s: string) => string }).atob;
        if (typeof decode !== 'function') return fail();
        const bin = decode(payload);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: mime }));
      } catch (err) {
        fail(err);
      }
    };
    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob((blob) => (blob ? resolve(blob) : viaDataURL()), mime);
        return;
      } catch {
        // toBlob present but unusable — fall through to the data-URL path.
      }
    }
    viaDataURL();
  });
}
