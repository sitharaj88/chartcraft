/**
 * Legend: a DOM element with one item per entry — series for cartesian
 * charts, slices for pie/donut. Legend text is always ink-colored — the
 * swatch carries the color. Items are only interactive when they can be
 * toggled (series yes, slices not yet).
 */
import type { Theme } from '../types';
import type { ResolvedLegend } from '../model';
import { coarsePointerMedia } from '../interaction/hittest';

export interface LegendItem {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  toggleable: boolean;
  /**
   * Composite-encoding dash pattern (`model.ts#seriesDash`), set by the
   * pipeline for series past the validated 8 palette slots. The swatch stripes
   * itself to match the drawn line — otherwise the legend would be the one
   * place where series 9 still looked exactly like series 1.
   */
  dash?: number[];
}

export interface LegendCallbacks {
  onToggle(seriesId: string): void;
}

/**
 * Swatch fill: a flat color normally, and a striped gradient echoing the dash
 * pattern when one is set. The stripe period is the dash's own on/off lengths,
 * scaled into a 10px swatch, so the legend and the line read as the same series.
 */
export function swatchBackground(color: string, dash?: readonly number[]): string {
  if (!dash || dash.length < 2) return color;
  const on = Math.max(1, Math.min(5, dash[0] as number));
  const off = Math.max(1, Math.min(5, dash[1] as number));
  return `repeating-linear-gradient(90deg, ${color} 0 ${on}px, transparent ${on}px ${on + off}px)`;
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

    // Legend entries are real `<button>`s, so a tap already activates them —
    // but at the mouse padding a series swatch is a ~16px tall target, half the
    // 44px minimum a fingertip can reliably hit. Sizing is a property of the
    // DEVICE (there is no event to ask when the legend is built), so this is
    // the one decision that legitimately reads the media query rather than a
    // per-event `pointerType`.
    const coarse = coarsePointerMedia();

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
      ist.padding = coarse ? '10px 8px' : '2px 4px';
      if (coarse) ist.minHeight = '44px';
      ist.font = `${theme.fontSize}px ${theme.fontFamily}`;
      ist.cursor = toggleable ? 'pointer' : 'default';
      ist.opacity = s.visible ? '1' : '0.45';
      // No double-tap-to-zoom delay on the toggle, and no page scroll started
      // from a button the user meant to press.
      ist.touchAction = 'manipulation';

      const swatch = doc.createElement('span');
      swatch.className = 'chartcraft-legend-swatch';
      const sst = swatch.style;
      sst.display = 'inline-block';
      sst.width = '10px';
      sst.height = '10px';
      sst.borderRadius = '3px';
      sst.background = s.visible ? swatchBackground(s.color, s.dash) : 'transparent';
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
