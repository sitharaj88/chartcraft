/**
 * ChartCard — the card chrome shared by every panel on the board.
 *
 * The visible title is a real `<h2>` in the document outline, NOT a canvas
 * `title` option: card chrome owns the heading, the chart owns `a11y.title`.
 *
 * Like `TopBar`, the selector is an **attribute** selector, so the host element
 * IS the `<article class="card card--span-8">` the shared stylesheet expects —
 * no wrapper element between the `.grid` and its grid items, and therefore no
 * risk of the 12-column layout landing on the wrong element.
 *
 * The class list is one `[class]` host binding fed by a `computed()`, rather
 * than five `[class.card--span-N]` bindings: the span is data, not five booleans.
 */
import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

/** Column spans that exist in styles.css (`.card--span-*`). */
export type Span = 3 | 4 | 5 | 7 | 8;

@Component({
  selector: 'article[appChartCard]',
  host: {
    '[class]': 'hostClass()',
    '[attr.aria-live]': "live() ? 'polite' : null",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card__head">
      <div>
        <h2 class="card__title">{{ heading() }}</h2>
        <p class="card__subtitle">{{ subtitle() }}</p>
      </div>
      <ng-content select="[cardAction]" />
    </div>
    <ng-content />
  `,
})
export class ChartCard {
  /** Named `heading`, not `title`: a `title` input on a real `<article>` would
   *  also land in the DOM as the native tooltip attribute. */
  readonly heading = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly span = input.required<Span>();
  /** Taller plot for the hero card. */
  readonly hero = input(false, { transform: booleanAttribute });
  /** Announce content changes (the Inspector card). */
  readonly live = input(false, { transform: booleanAttribute });

  protected readonly hostClass = computed(
    () => `card card--span-${this.span()}${this.hero() ? ' card--hero' : ''}`,
  );
}
