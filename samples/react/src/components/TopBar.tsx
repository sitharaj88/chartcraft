/**
 * TopBar — brand, date-range segmented control, Export CSV, theme toggle.
 *
 * Both controls are real <button aria-pressed> — the range control is a
 * `role="group"` of pressed/unpressed buttons rather than a listbox, because
 * the pressed state IS the selection and it must be announced as such.
 */

import { RANGES } from '../data';
import type { RangeKey } from '../data';
import type { Scheme } from '../specs';

export interface TopBarProps {
  range: RangeKey;
  onRangeChange: (next: RangeKey) => void;
  scheme: Scheme;
  onThemeToggle: () => void;
  onExport: () => void;
}

export function TopBar({ range, onRangeChange, scheme, onThemeToggle, onExport }: TopBarProps) {
  const dark = scheme === 'dark';

  return (
    <header className="topbar">
      <div className="shell topbar__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M2 12.5 6 7l3.5 3.2L16 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="16" cy="3" r="1.9" fill="currentColor" />
            </svg>
          </span>
          <span>
            <span className="brand__name">Northwind Cloud</span>
            <span className="brand__sub">Analytics</span>
          </span>
        </div>

        <div className="topbar__actions">
          <div className="segmented" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className="segmented__btn"
                type="button"
                aria-pressed={r.key === range}
                aria-label={r.long}
                onClick={() => onRangeChange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button className="btn" type="button" onClick={onExport}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 2v8m0 0L5 7m3 3 3-3M2.5 12.5v1h11v-1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export CSV
          </button>

          <button
            className="btn btn--icon"
            type="button"
            aria-pressed={dark}
            onClick={onThemeToggle}
          >
            <span className="visually-hidden">Dark theme</span>
            {/* Rendered conditionally rather than toggled with `hidden`: the
                HTML `hidden` attribute has no effect on SVG elements, which is
                a footgun the vanilla sample has to patch around in CSS. */}
            {dark ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1m11-5-1.1 1.1M5.1 10.9 4 12m8 0-1.1-1.1M5.1 5.1 4 4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
