/**
 * StatTile — one KPI: label, headline figure, delta chip, sparkline.
 *
 * The sparkline is a real `<SparklineChart>`; `className` lands on the
 * container the wrapper renders, so the tile's height comes from
 * `.kpi__spark` in the shared stylesheet exactly as it does in the vanilla
 * sample.
 */

import { useMemo } from 'react';
import { SparklineChart } from '@chartcraft/react';

import { formatDelta } from '../data';
import type { KpiTile } from '../data';
import { sparkSpec } from '../specs';
import type { Scheme } from '../specs';

export interface StatTileProps {
  kpi: KpiTile;
  scheme: Scheme;
}

export function StatTile({ kpi, scheme }: StatTileProps) {
  // The wrapper diffs option props by identity, so the spec must be a stable
  // object: rebuilt only when the KPI (i.e. the range) or the theme changes.
  const spec = useMemo(() => sparkSpec(kpi, scheme), [kpi, scheme]);

  // A rise is not automatically good: churn going UP is the bad case, so the
  // tone follows the metric's semantics, mapped onto theme.up/down.
  const tone = kpi.higherIsBetter === kpi.delta >= 0 ? 'good' : 'bad';

  return (
    <article className="kpi">
      <span className="kpi__label">{kpi.label}</span>
      <div className="kpi__row">
        <span className="kpi__value">{kpi.value}</span>
        <span className="kpi__delta" data-tone={tone}>
          {formatDelta(kpi.delta, kpi.deltaUnit)}
        </span>
      </div>
      <span className="kpi__comparison">{kpi.comparison}</span>
      <SparklineChart {...spec} className="kpi__spark" />
    </article>
  );
}
