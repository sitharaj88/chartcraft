/**
 * TopBar — brand, date-range segmented control, Export CSV, theme toggle.
 *
 * Both controls are real `<button aria-pressed>`s. The range control is a
 * `role="group"` of pressed/unpressed buttons rather than a listbox, because
 * the pressed state IS the selection and it must be announced as such.
 *
 * ── Why the selector is `header[appTopBar]` ────────────────────────────────
 *
 * An element selector (`<app-top-bar>`) would put an extra wrapper element
 * between `<body>` and the sticky `.topbar`, and the shared stylesheet — which
 * is byte-identical across all five samples — styles a `.topbar` that is a
 * direct block-level child of the page. An **attribute selector** lets the
 * component's host BE the real `<header>`: the rendered DOM is identical to the
 * React/Vue/Svelte ports, the `banner` landmark is a genuine `<header>` rather
 * than a `role=` patch, and the class still comes from the component (`host`)
 * rather than the call site.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { RANGES } from '../data';
import type { RangeKey } from '../data';
import type { Scheme } from '../theme';

@Component({
  selector: 'header[appTopBar]',
  host: { class: 'topbar' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell topbar__inner">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M2 12.5 6 7l3.5 3.2L16 3"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="16" cy="3" r="1.9" fill="currentColor" />
          </svg>
        </span>
        <span>
          <span class="brand__name">Northwind Cloud</span>
          <span class="brand__sub">Analytics</span>
        </span>
      </div>

      <div class="topbar__actions">
        <div class="segmented" role="group" aria-label="Date range">
          @for (r of ranges; track r.key) {
            <button
              class="segmented__btn"
              type="button"
              [attr.aria-pressed]="r.key === range()"
              [attr.aria-label]="r.long"
              (click)="rangeChange.emit(r.key)"
            >
              {{ r.label }}
            </button>
          }
        </div>

        <button class="btn" type="button" (click)="exportClick.emit()">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2v8m0 0L5 7m3 3 3-3M2.5 12.5v1h11v-1"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Export CSV
        </button>

        <button
          class="btn btn--icon"
          type="button"
          [attr.aria-pressed]="dark()"
          (click)="themeToggle.emit()"
        >
          <span class="visually-hidden">Dark theme</span>
          <!-- Rendered with @if rather than toggled with the hidden attribute:
               HTML's hidden has no effect on SVG elements, which is a footgun
               the vanilla sample has to patch around in CSS. -->
          @if (dark()) {
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.4" />
              <path
                d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1m11-5-1.1 1.1M5.1 10.9 4 12m8 0-1.1-1.1M5.1 5.1 4 4"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
            </svg>
          } @else {
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
              />
            </svg>
          }
        </button>
      </div>
    </div>
  `,
})
export class TopBar {
  readonly range = input.required<RangeKey>();
  readonly scheme = input.required<Scheme>();

  readonly rangeChange = output<RangeKey>();
  readonly themeToggle = output<void>();
  readonly exportClick = output<void>();

  protected readonly ranges = RANGES;
  protected readonly dark = computed(() => this.scheme() === 'dark');
}
