/**
 * 0.3.1 DX fixes, against the real @chartcraft/core:
 *
 * - GAP 1: core's runtime values (themes, palette, scales, decorators, version)
 *   are reachable from `@chartcraft/react` alone.
 * - GAP 2: `ChartSpec` is the options-shaped spec type, spelled identically in
 *   every wrapper.
 * - GAP 3: the development-only "memoise your `data` prop" warning — fires once,
 *   only for genuinely redundant identity churn, and never in production.
 * - GAP 4: `ref.current` is the instance by the time a PARENT's first
 *   `useEffect` runs (it used to be null for one render).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createRef, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../src/index';
import { Chart, LineChart, type ChartInstance, type ChartSpec } from '../src/index';
import { trackOptionStability, unstableOptionMessage } from '../src/dev';

const base = { theme: 'light' as const, animation: false as const, width: 600, height: 400 };

/** A fresh-but-always-equal data object, i.e. the inline-JSX-literal case. */
const freshData = () => ({
  categories: ['a', 'b', 'c'],
  series: [{ name: 'One', data: [1, 2, 3] }],
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- GAP 1

describe('core runtime values are re-exported (one dependency, not two)', () => {
  it('exposes the themes, palettes and version without importing @chartcraft/core', () => {
    expect(typeof api.version).toBe('string');
    expect(typeof api.createChart).toBe('function');
    expect(api.lightTheme.colorScheme).toBe('light');
    expect(api.darkTheme.colorScheme).toBe('dark');
    expect(api.lightTheme.surface).not.toBe(api.darkTheme.surface);
    expect(api.categoricalPalette.light.length).toBeGreaterThan(0);
    expect(api.categoricalPalette.dark.length).toBeGreaterThan(0);
    expect(Array.isArray(api.sequentialPalette)).toBe(true);
    expect(api.sequentialRampFor('light').length).toBeGreaterThan(0);
    expect(api.sequentialRampFor('dark').length).toBeGreaterThan(0);
  });

  it('exposes the scale classes and the downsampler', () => {
    expect(new api.LinearScale([0, 10], [0, 100]).scale(5)).toBeCloseTo(50);
    expect(typeof api.TimeScale).toBe('function');
    expect(typeof api.BandScale).toBe('function');
    expect(typeof api.LogScale).toBe('function');
    const points = [0, 1, 2, 3, 4].map((x) => ({ x, y: x * x }));
    expect(api.downsampleLTTB(points, 3)).toHaveLength(3);
  });

  it('exposes the decorator registry', () => {
    const decorator = { id: 'react-dx-probe', layer: 'over' as const, draw: () => undefined };
    api.registerDecorator(decorator);
    expect(api.decorators().some((d) => d.id === 'react-dx-probe')).toBe(true);
    api.unregisterDecorator('react-dx-probe');
    expect(api.decorators().some((d) => d.id === 'react-dx-probe')).toBe(false);
    expect(typeof api.clearDecorators).toBe('function');
  });
});

// ---------------------------------------------------------------- GAP 2

describe('ChartSpec', () => {
  it('is options-shaped (no `type`) and spreads into a per-type component', () => {
    // Compile-time: a `type` key here is an excess property and fails tsc.
    const spec: ChartSpec = { ...base, title: 'Revenue', data: freshData() };
    const ref = createRef<ChartInstance>();
    render(<LineChart ref={ref} {...spec} />);
    expect(ref.current!.getOptions().type).toBe('line');
    expect(ref.current!.getOptions().title).toBe('Revenue');
  });
});

// ---------------------------------------------------------------- GAP 3

describe('development-only unstable-options warning', () => {
  it('warns exactly once, naming the prop and useMemo, for a fresh-every-render `data`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = render(<LineChart {...base} data={freshData()} />);
    expect(warn).not.toHaveBeenCalled();

    rerender(<LineChart {...base} data={freshData()} />);
    rerender(<LineChart {...base} data={freshData()} />);
    expect(warn).not.toHaveBeenCalled(); // still inside the tolerance

    rerender(<LineChart {...base} data={freshData()} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    expect(message).toContain('@chartcraft/react');
    expect(message).toContain('`data`');
    expect(message).toContain('useMemo');
    expect(message).toContain('type="line"');

    // Warned once per component instance, not once per render.
    rerender(<LineChart {...base} data={freshData()} />);
    rerender(<LineChart {...base} data={freshData()} />);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the data prop is memoised (the documented fix)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    function App(): React.ReactElement {
      const [, setTick] = useState(0);
      const data = useMemo(freshData, []);
      // Re-render six times without touching `data`.
      useEffect(() => {
        setTick((n) => (n < 6 ? n + 1 : n));
      });
      return <LineChart {...base} data={data} />;
    }

    render(<App />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent when the data genuinely changes every render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = render(
      <LineChart {...base} data={{ series: [{ name: 'One', data: [1] }] }} />,
    );
    for (const n of [2, 3, 4, 5, 6]) {
      rerender(<LineChart {...base} data={{ series: [{ name: 'One', data: [n] }] }} />);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('cannot fire when NODE_ENV is production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('NODE_ENV', 'production');
    const { rerender } = render(<LineChart {...base} data={freshData()} />);
    for (let i = 0; i < 8; i += 1) rerender(<LineChart {...base} data={freshData()} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is StrictMode-safe: the same options object twice is an identity match, not churn', () => {
    const warn = vi.fn();
    const same = { ...base, type: 'line' as const, data: freshData() };
    let probe = trackOptionStability(null, same, warn);
    for (let i = 0; i < 10; i += 1) probe = trackOptionStability(probe, same, warn);
    expect(warn).not.toHaveBeenCalled();
    expect(probe.warned).toBe(false);
  });

  it('a real change clears the streak instead of tripping the warning', () => {
    const warn = vi.fn();
    const spec = (data: unknown) => ({ ...base, type: 'line' as const, data }) as never;
    let probe = trackOptionStability(null, spec(freshData()), warn); // baseline
    probe = trackOptionStability(probe, spec(freshData()), warn); // streak 1
    probe = trackOptionStability(probe, spec(freshData()), warn); // streak 2
    probe = trackOptionStability(probe, spec({ series: [{ name: 'One', data: [9] }] }), warn); // 0
    expect(warn).not.toHaveBeenCalled();

    // Counting restarts from the next comparison against the new baseline.
    probe = trackOptionStability(probe, spec(freshData()), warn); // 0 (differs from [9])
    probe = trackOptionStability(probe, spec(freshData()), warn); // streak 1
    probe = trackOptionStability(probe, spec(freshData()), warn); // streak 2
    expect(warn).not.toHaveBeenCalled();
    probe = trackOptionStability(probe, spec(freshData()), warn); // streak 3
    expect(warn).toHaveBeenCalledTimes(1);
    expect(probe.warned).toBe(true);
  });

  it('watches the other object-valued option props too, not just `data`', () => {
    const warn = vi.fn();
    const data = freshData(); // stable — only xAxis churns
    let probe = trackOptionStability(
      null,
      { ...base, type: 'line', data, xAxis: { label: 'x' } },
      warn,
    );
    for (let i = 0; i < 3; i += 1) {
      probe = trackOptionStability(
        probe,
        { ...base, type: 'line', data, xAxis: { label: 'x' } },
        warn,
      );
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('`xAxis`');
  });

  it('the message names the offending prop and the chart type', () => {
    expect(unstableOptionMessage('annotations', 'gauge')).toContain('`annotations`');
    expect(unstableOptionMessage('annotations', 'gauge')).toContain('type="gauge"');
  });
});

// ---------------------------------------------------------------- GAP 4

describe('ref timing', () => {
  it("is already populated when a PARENT's first useEffect runs", () => {
    const seen: (ChartInstance | null)[] = [];

    function Parent(): React.ReactElement {
      const ref = useRef<ChartInstance>(null);
      useEffect(() => {
        seen.push(ref.current);
      }, []);
      return <Chart ref={ref} type="line" {...base} data={freshData()} />;
    }

    render(<Parent />);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBeNull();
    expect(typeof seen[0]!.exportData).toBe('function');
  });

  it('supports the callback-ref form and clears it on unmount', () => {
    const values: (ChartInstance | null)[] = [];
    const { unmount } = render(
      <Chart ref={(chart) => values.push(chart)} type="line" {...base} data={freshData()} />,
    );
    expect(values.filter(Boolean)).toHaveLength(1);
    unmount();
    expect(values[values.length - 1]).toBeNull();
  });

  it('object refs are cleared on unmount', () => {
    const ref = createRef<ChartInstance>();
    const { unmount } = render(<Chart ref={ref} type="line" {...base} data={freshData()} />);
    expect(ref.current).not.toBeNull();
    unmount();
    expect(ref.current).toBeNull();
  });
});
