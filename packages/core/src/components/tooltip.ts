/**
 * Tooltip: a fixed-position DOM element that follows the pointer and is
 * clamped so it never clips the viewport. Surface bg + hairline border.
 */
import type { Theme, TooltipPoint } from '../types';
import { escapeHtml } from '../util';

const OFFSET = 12;
const MARGIN = 4;

export function defaultTooltipHTML(points: TooltipPoint[]): string {
  if (points.length === 0) return '';
  const first = points[0] as TooltipPoint;
  const header =
    first.formattedX !== ''
      ? `<div class="chartcraft-tooltip-x" style="font-weight:600;margin-bottom:4px">${escapeHtml(first.formattedX)}</div>`
      : '';
  const rows = points
    .map(
      (p) =>
        `<div class="chartcraft-tooltip-row" style="display:flex;align-items:center;gap:6px">` +
        `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${escapeHtml(p.color)}"></span>` +
        `<span class="chartcraft-tooltip-name">${escapeHtml(p.seriesName)}</span>` +
        `<span class="chartcraft-tooltip-value" style="margin-left:auto;font-variant-numeric:tabular-nums">${escapeHtml(p.formattedY)}</span>` +
        `</div>`,
    )
    .join('');
  return header + rows;
}

export class Tooltip {
  readonly el: HTMLElement;

  constructor(doc: Document) {
    this.el = doc.createElement('div');
    this.el.className = 'chartcraft-tooltip';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-hidden', 'true');
    const st = this.el.style;
    st.position = 'fixed';
    st.zIndex = '10';
    st.pointerEvents = 'none';
    st.display = 'none';
    st.padding = '6px 10px';
    st.borderRadius = '6px';
    st.minWidth = '80px';
    st.maxWidth = '320px';
    st.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
  }

  applyTheme(theme: Theme): void {
    const st = this.el.style;
    st.background = theme.surface;
    st.border = `1px solid ${theme.gridline}`;
    st.color = theme.textPrimary;
    st.font = `${theme.fontSize}px ${theme.fontFamily}`;
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  show(html: string, clientX: number, clientY: number): void {
    this.el.innerHTML = html;
    this.el.style.display = 'block';
    this.position(clientX, clientY);
  }

  /** Position near the pointer, flipped/clamped to stay inside the viewport. */
  position(clientX: number, clientY: number): void {
    const win = this.el.ownerDocument.defaultView;
    const vw = win?.innerWidth ?? 1024;
    const vh = win?.innerHeight ?? 768;
    const w = this.el.offsetWidth || 120;
    const h = this.el.offsetHeight || 40;

    let left = clientX + OFFSET;
    if (left + w + MARGIN > vw) left = clientX - OFFSET - w; // flip to the left
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    let top = clientY + OFFSET;
    if (top + h + MARGIN > vh) top = clientY - OFFSET - h; // flip above
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  destroy(): void {
    this.el.remove();
  }
}
