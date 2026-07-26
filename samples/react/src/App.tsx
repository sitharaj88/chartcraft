/**
 * Northwind Cloud — the dashboard, as React.
 *
 * This is the file that replaces the vanilla sample's `main.ts` + `index.html`,
 * and it keeps that app's shape while dropping every line of DOM bookkeeping:
 *
 *   1. ONE source of truth for the theme — `useTheme` puts `data-theme` on
 *      <html> (driving the CSS custom properties) and hands the same string to
 *      every chart's `theme` prop.
 *   2. Chart options are a PURE FUNCTION of (data, scheme): `chartSpecs()`.
 *      `useMemo` keys it on exactly those two, so every nested option object
 *      keeps its identity between renders — which is what the wrapper's
 *      per-key diff needs to stay quiet. Mutating a spec in place would be the
 *      bug; building a new one is the contract.
 *   3. Charts are never torn down and rebuilt. A theme or range change is a
 *      prop change, so the wrapper calls `update()` and the transition stays
 *      animated instead of flashing an empty card.
 *   4. Teardown is the wrapper's job — it destroys the chart on unmount.
 *
 * Events are handler PROPS (`onPointClick`, `onZoom`), not `chart.on(...)`.
 * The one place the imperative instance is still needed is `exportData()`,
 * which is what the `ref` is for.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { version } from '@chartcraft/core';
import {
  BarChart,
  BoxplotChart,
  ChoroplethChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  SankeyChart,
  TreemapChart,
  type ChartInstance,
} from '@chartcraft/react';

import { ChartCard } from './components/ChartCard';
import { Inspector, type Selection } from './components/Inspector';
import { StatTile } from './components/StatTile';
import { TopBar } from './components/TopBar';
import { useTheme } from './hooks/useTheme';
import { getData } from './data';
import type { RangeKey } from './data';
import { chartSpecs } from './specs';

export default function App() {
  const { scheme, toggle } = useTheme();

  const [range, setRange] = useState<RangeKey>('12m');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [zoomed, setZoomed] = useState(false);

  // `getData` is deterministic and pure, so memoising on the range is safe —
  // and it keeps every KPI/series object referentially stable, which is what
  // stops the charts from diffing on unrelated re-renders.
  const data = useMemo(() => getData(range), [range]);
  const specs = useMemo(() => chartSpecs(data, scheme), [data, scheme]);

  /** The only imperative handle we need: `exportData()` lives on the instance. */
  const heroRef = useRef<ChartInstance | null>(null);

  const handleRange = useCallback(
    (next: RangeKey) => {
      if (next === range) return;
      setRange(next);
      // A new window invalidates the old selection — and a stale inspector
      // reading is worse than an empty one.
      setSelection(null);
      setZoomed(false);
    },
    [range],
  );

  const resetZoom = useCallback(() => {
    heroRef.current?.zoomTo(null);
    setZoomed(false);
  }, []);

  const handleExport = useCallback(() => {
    const hero = heroRef.current;
    if (!hero) return;

    // exportData() emits exactly the chart's accessible data table — so the
    // CSV and what a screen reader reads can never disagree, and unlike the
    // table it is never row-capped.
    const csv = hero.exportData({ format: 'csv' });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `northwind-mrr-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [range]);

  return (
    <>
      <TopBar
        range={range}
        onRangeChange={handleRange}
        scheme={scheme}
        onThemeToggle={toggle}
        onExport={handleExport}
      />

      <main className="shell" id="main">
        <div className="page-head">
          <div>
            <h1 className="page-head__title">Revenue &amp; product analytics</h1>
            <p className="page-head__meta">{data.rangeLabel} · updated hourly</p>
          </div>
          <p className="page-head__stamp">Data as of 24 Jul 2026 · all figures USD</p>
        </div>

        <section className="kpis" aria-label="Key performance indicators">
          {data.kpis.map((kpi) => (
            <StatTile key={kpi.id} kpi={kpi} scheme={scheme} />
          ))}
        </section>

        <section className="grid" aria-label="Analytics charts">
          {/* ---- Row 1 ------------------------------------------------ */}
          <ChartCard
            title="Recurring revenue"
            subtitle={data.mrr.subtitle}
            span={8}
            hero
            action={
              // Reset-zoom affordance: only offered once there is something to
              // reset. `onZoom` fires with `null` when the window is cleared.
              zoomed ? (
                <button className="btn btn--ghost" type="button" onClick={resetZoom}>
                  Reset zoom
                </button>
              ) : undefined
            }
          >
            <LineChart
              {...specs.mrr}
              ref={heroRef}
              className="card__chart"
              onPointClick={(ev) => setSelection({ chartId: 'mrr', ev })}
              onZoom={(window_) => setZoomed(window_ !== null)}
            />
          </ChartCard>

          <ChartCard title="Platform capacity" subtitle={data.capacity.subtitle} span={4}>
            <GaugeChart {...specs.capacity} className="card__chart" />
          </ChartCard>

          {/* ---- Row 2 ------------------------------------------------ */}
          <ChartCard title="Acquisition flow" subtitle={data.flow.subtitle} span={7}>
            <SankeyChart {...specs.flow} className="card__chart" />
          </ChartCard>

          <ChartCard title="Product mix" subtitle={data.products.subtitle} span={5}>
            <TreemapChart {...specs.products} className="card__chart" />
          </ChartCard>

          {/* ---- Row 3 ------------------------------------------------ */}
          <ChartCard title="Support load" subtitle={data.tickets.subtitle} span={8}>
            <HeatmapChart
              {...specs.tickets}
              className="card__chart"
              onPointClick={(ev) => setSelection({ chartId: 'tickets', ev })}
            />
          </ChartCard>

          <ChartCard title="Revenue by segment" subtitle={data.segments.subtitle} span={4}>
            <BarChart
              {...specs.segments}
              className="card__chart"
              onPointClick={(ev) => setSelection({ chartId: 'segments', ev })}
            />
          </ChartCard>

          {/* ---- Row 4 ------------------------------------------------ */}
          <ChartCard title="Territory coverage" subtitle={data.territories.subtitle} span={4}>
            <ChoroplethChart {...specs.territories} className="card__chart" />
          </ChartCard>

          <ChartCard title="Contract value" subtitle={data.contracts.subtitle} span={5}>
            <BoxplotChart
              {...specs.contracts}
              className="card__chart"
              onPointClick={(ev) => setSelection({ chartId: 'contracts', ev })}
            />
          </ChartCard>

          <ChartCard title="Inspector" subtitle="Selected data point" span={3} live>
            <Inspector selection={selection} specs={specs} scheme={scheme} />
          </ChartCard>
        </section>
      </main>

      <footer className="footer shell">
        <span>
          Northwind Cloud is a fictional product. All figures are synthetic and deterministic.
        </span>
        <span>
          Built with <code>@chartcraft/react</code> <code>v{version}</code>
        </span>
      </footer>
    </>
  );
}
