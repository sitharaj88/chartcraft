/**
 * Legend: a DOM element with one interactive item per series.
 * Legend text is always ink-colored — the swatch carries the series color.
 */
import type { Theme } from '../types';
import { seriesColor, type NormalizedSeries, type ResolvedLegend } from '../model';

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

  update(series: readonly NormalizedSeries[], theme: Theme, legend: ResolvedLegend): void {
    const doc = this.el.ownerDocument;
    this.el.style.display = legend.show ? 'flex' : 'none';
    this.el.style.justifyContent = legend.position === 'right' ? 'flex-start' : 'center';
    this.el.style.flexDirection = legend.position === 'right' ? 'column' : 'row';
    this.el.textContent = '';
    if (!legend.show) return;

    for (const s of series) {
      const item = doc.createElement('button');
      item.type = 'button';
      item.className = 'chartcraft-legend-item';
      item.dataset.seriesId = s.id;
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-pressed', String(s.visible));
      item.setAttribute('aria-label', `${s.name}: ${s.visible ? 'visible' : 'hidden'}`);
      const ist = item.style;
      ist.display = 'inline-flex';
      ist.alignItems = 'center';
      ist.gap = '6px';
      ist.border = 'none';
      ist.background = 'none';
      ist.padding = '2px 4px';
      ist.font = `${theme.fontSize}px ${theme.fontFamily}`;
      ist.cursor = legend.interactive ? 'pointer' : 'default';
      ist.opacity = s.visible ? '1' : '0.45';

      const swatch = doc.createElement('span');
      swatch.className = 'chartcraft-legend-swatch';
      const sst = swatch.style;
      sst.display = 'inline-block';
      sst.width = '10px';
      sst.height = '10px';
      sst.borderRadius = '3px';
      sst.background = s.visible ? seriesColor(s, theme) : 'transparent';
      sst.boxShadow = s.visible ? 'none' : `inset 0 0 0 1.5px ${seriesColor(s, theme)}`;
      sst.flexShrink = '0';

      const label = doc.createElement('span');
      label.className = 'chartcraft-legend-label';
      label.textContent = s.name;
      // Ink colors, never the series color.
      label.style.color = theme.textSecondary;

      item.append(swatch, label);
      if (legend.interactive) {
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
