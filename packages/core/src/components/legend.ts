/**
 * Legend: a DOM element with one item per entry — series for cartesian
 * charts, slices for pie/donut. Legend text is always ink-colored — the
 * swatch carries the color. Items are only interactive when they can be
 * toggled (series yes, slices not yet).
 */
import type { Theme } from '../types';
import type { ResolvedLegend } from '../model';

export interface LegendItem {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  toggleable: boolean;
}

export interface LegendCallbacks {
  onToggle(seriesId: string): void;
}

export class Legend {
  readonly el: HTMLElement;
  private cb: LegendCallbacks;

  constructor(doc: Document, cb: LegendCallbacks) {
    this.cb = cb;
    this.el = doc.createElement('div');
    this.el.className = 'chartcraft-legend';
    this.el.setAttribute('role', 'list');
    const st = this.el.style;
    st.display = 'flex';
    st.flexWrap = 'wrap';
    st.gap = '4px 16px';
    st.alignItems = 'center';
    st.margin = '4px 8px';
  }

  update(items: readonly LegendItem[], theme: Theme, legend: ResolvedLegend): void {
    const doc = this.el.ownerDocument;
    this.el.style.display = legend.show ? 'flex' : 'none';
    this.el.style.justifyContent = legend.position === 'right' ? 'flex-start' : 'center';
    this.el.style.flexDirection = legend.position === 'right' ? 'column' : 'row';
    this.el.textContent = '';
    if (!legend.show) return;

    for (const s of items) {
      const toggleable = legend.interactive && s.toggleable;
      const item = doc.createElement('button');
      item.type = 'button';
      item.className = 'chartcraft-legend-item';
      item.dataset.seriesId = s.id;
      item.setAttribute('role', 'listitem');
      if (s.toggleable) {
        item.setAttribute('aria-pressed', String(s.visible));
        item.setAttribute('aria-label', `${s.name}: ${s.visible ? 'visible' : 'hidden'}`);
      } else {
        item.setAttribute('aria-label', s.name);
      }
      const ist = item.style;
      ist.display = 'inline-flex';
      ist.alignItems = 'center';
      ist.gap = '6px';
      ist.border = 'none';
      ist.background = 'none';
      ist.padding = '2px 4px';
      ist.font = `${theme.fontSize}px ${theme.fontFamily}`;
      ist.cursor = toggleable ? 'pointer' : 'default';
      ist.opacity = s.visible ? '1' : '0.45';

      const swatch = doc.createElement('span');
      swatch.className = 'chartcraft-legend-swatch';
      const sst = swatch.style;
      sst.display = 'inline-block';
      sst.width = '10px';
      sst.height = '10px';
      sst.borderRadius = '3px';
      sst.background = s.visible ? s.color : 'transparent';
      sst.boxShadow = s.visible ? 'none' : `inset 0 0 0 1.5px ${s.color}`;
      sst.flexShrink = '0';

      const label = doc.createElement('span');
      label.className = 'chartcraft-legend-label';
      label.textContent = s.name;
      // Ink colors, never the series color.
      label.style.color = theme.textSecondary;

      item.append(swatch, label);
      if (toggleable) {
        item.addEventListener('click', () => this.cb.onToggle(s.id));
      } else {
        item.disabled = true;
        item.style.pointerEvents = 'none';
      }
      this.el.appendChild(item);
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
