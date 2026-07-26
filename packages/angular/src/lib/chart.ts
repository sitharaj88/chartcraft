/**
 * `<cc-chart>` — the generic ChartCraft Angular component.
 *
 * Standalone (no NgModule), signal-based, OnPush. The chart is rendered
 * directly into the component's own host element.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { ChartOptions } from '@chartcraft/core';
import { ChartBase } from './chart-base';

/**
 * ```html
 * <cc-chart [options]="opts" (pointClick)="onPoint($event)" style="height: 320px" />
 * ```
 *
 * `options` carries its own `type`. Prefer a per-type component
 * (`<cc-line-chart>`, `<cc-sankey-chart>`, …) when the type is fixed.
 */
@Component({
  selector: 'cc-chart',
  template: '',
  host: { style: 'display: block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcChart extends ChartBase<ChartOptions> {}
