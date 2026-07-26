/**
 * StatTile — one KPI: label, headline figure, delta chip, sparkline.
 *
 * The sparkline is a real `<cc-sparkline-chart>` carrying `class="kpi__spark"`.
 * The wrapper renders the chart into its **own host element**, so that class
 * lands on the very box the stylesheet sizes: no extra element, and the chart's
 * `ResizeObserver` measures exactly the 40px well `.kpi__spark` defines.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CcSparklineChart } from '@chartcraft/angular';

import { formatDelta } from '../data';
import type { KpiTile } from '../data';
import { sparkSpec } from '../specs';
import type { Scheme } from '../theme';

@Component({
  selector: 'article[appStatTile]',
  host: { class: 'kpi' },
  imports: [CcSparklineChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="kpi__label">{{ kpi().label }}</span>
    <div class="kpi__row">
      <span class="kpi__value">{{ kpi().value }}</span>
      <span class="kpi__delta" [attr.data-tone]="tone()">{{ delta() }}</span>
    </div>
    <span class="kpi__comparison">{{ kpi().comparison }}</span>
    <cc-sparkline-chart class="kpi__spark" [options]="spec()" />
  `,
})
export class StatTile {
  readonly kpi = input.required<KpiTile>();
  readonly scheme = input.required<Scheme>();

  /**
   * A new object per (kpi, scheme) — which is the whole update contract. The
   * wrapper's `effect()` compares `options` by reference, so a `computed()` is
   * both the idiomatic and the *correct* place to build it.
   */
  protected readonly spec = computed(() => sparkSpec(this.kpi(), this.scheme()));

  protected readonly delta = computed(() => formatDelta(this.kpi().delta, this.kpi().deltaUnit));

  // A rise is not automatically good: churn going UP is the bad case, so the
  // tone follows the metric's semantics, mapped onto theme.up/down.
  protected readonly tone = computed(() =>
    this.kpi().higherIsBetter === this.kpi().delta >= 0 ? 'good' : 'bad',
  );
}
