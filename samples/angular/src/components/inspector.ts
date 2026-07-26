/**
 * Inspector — the visible destination for `(pointClick)`.
 *
 * Purely presentational: it renders whatever `entry` it is handed, or the empty
 * state. The card around it carries `aria-live="polite"`, so a click (or Tab +
 * arrow keys + Enter) announces the new reading.
 *
 * `@if (entry(); as e)` is Angular's built-in control flow — no `NgIf`, no
 * `CommonModule` import anywhere in this sample.
 */
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { InspectorEntry } from '../selection';

@Component({
  selector: 'div[appInspector]',
  host: { class: 'inspector' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entry(); as e) {
      <span class="inspector__series">
        <span class="inspector__swatch" [style.background]="e.swatch"></span>{{ e.seriesName }}
      </span>
      <p class="inspector__value">{{ e.value }}</p>
      <dl class="inspector__list">
        <!-- dt/dd must stay DIRECT children of the dl: .inspector__list is a
             two-column grid, so a wrapper element would break the rows. @for
             renders no host element of its own, which is exactly what is
             needed here. -->
        @for (row of e.rows; track row[0]) {
          <dt>{{ row[0] }}</dt>
          <dd>{{ row[1] }}</dd>
        }
      </dl>
      <p class="inspector__hint">Updated on every point click.</p>
    } @else {
      <p class="inspector__empty">
        Click a point on any chart — the recurring-revenue line, the segment bars or the
        contract-value boxes — to inspect it here.
      </p>
      <p class="inspector__hint">
        Keyboard: Tab to a chart, walk it with the arrow keys, then press Enter.
      </p>
    }
  `,
})
export class Inspector {
  readonly entry = input.required<InspectorEntry | null>();
}
