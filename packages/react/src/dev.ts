/**
 * Development-only diagnostics for @chartcraft/react.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The update effect in Chart.tsx depends on `ChartOptions` keys **by
 * identity**. That makes the idiomatic-looking React snippet
 *
 *   <LineChart data={{ categories, series }} />
 *
 * push a brand-new `data` object into `chart.update()` on *every* re-render,
 * because a JSX object literal is a fresh object each time. Nothing in the
 * types says so, so this module makes the trap self-announcing.
 *
 * HOW IT IS KEPT OUT OF PRODUCTION
 * --------------------------------
 * Every entry point here is called from inside a literal
 * `if (process.env.NODE_ENV !== 'production')` guard in Chart.tsx — the same
 * guard React itself uses. Bundlers substitute `process.env.NODE_ENV` at build
 * time (webpack `DefinePlugin`, Vite/Rollup `define`, esbuild `--define`,
 * Next.js, CRA), so in a production build the condition folds to `false`, the
 * call sites are dead code, and this whole module becomes unreachable and is
 * dropped. It cannot fire in production because it is not *there* in
 * production.
 */
import type { ChartOptions } from '@chartcraft/core';

/**
 * The option props that are realistically written as an inline object/array
 * literal in JSX. Primitive-valued keys (`title`, `width`, `stacked`, …) cannot
 * suffer from the identity trap, so they are not worth comparing.
 */
const WATCHED_KEYS = [
  'data',
  'theme',
  'padding',
  'xAxis',
  'yAxis',
  'legend',
  'tooltip',
  'animation',
  'downsample',
  'a11y',
  'dataLabels',
  'annotations',
  'zoom',
] as const satisfies readonly (keyof ChartOptions)[];

type WatchedKey = (typeof WATCHED_KEYS)[number];

/**
 * How many *consecutive* renders may hand over a new-but-deeply-equal object
 * before we warn. Three is enough to rule out a one-off (a genuine update that
 * happens to produce equal contents) while still firing on the second or third
 * keystroke of a real app.
 */
const STREAK_LIMIT = 3;

/**
 * Node visits allowed per comparison. Bounds the dev-only cost on large
 * datasets: when the budget runs out the values are reported as "different",
 * which resets the streak and therefore never produces a false warning.
 */
const COMPARE_BUDGET = 5000;

/** Per-component-instance state for the identity check. */
export interface OptionStabilityProbe {
  /** The options object seen on the previous run of the update effect. */
  previous: ChartOptions;
  /** Consecutive redundant-identity count, per watched key. */
  streaks: Partial<Record<WatchedKey, number>>;
  /** Set once a warning has been logged, so we warn once per component. */
  warned: boolean;
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Structural equality with a hard visit budget. Conservative by design:
 * anything it is unsure about (budget exhausted, `NaN`, exotic objects) comes
 * back `false`, which suppresses the warning rather than risking a false one.
 */
function equalWithin(a: unknown, b: unknown, budget: { left: number }): boolean {
  if (a === b) return true;
  if (--budget.left < 0) return false;
  if (!isObjectLike(a) || !isObjectLike(b)) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (!equalWithin(left[i], right[i], budget)) return false;
    }
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!equalWithin(left[key], right[key], budget)) return false;
  }
  return true;
}

/** The warning text. Names the prop, names the component, prescribes the fix. */
export function unstableOptionMessage(key: WatchedKey, type: ChartOptions['type']): string {
  return (
    `[@chartcraft/react] <Chart type="${String(type)}">: the \`${key}\` prop has been a ` +
    `brand-new object on ${STREAK_LIMIT} consecutive renders while its contents never changed.\n\n` +
    'This wrapper diffs option props by IDENTITY, so an inline object literal in JSX pushes a ' +
    `redundant chart.update() on every single re-render (and with \`zoom\` enabled that also ` +
    "discards the user's viewport). Memoise it:\n\n" +
    `  const ${key} = useMemo(() => ({ /* ... */ }), [deps]);\n` +
    `  <Chart type="${String(type)}" ${key}={${key}} />\n\n` +
    'Hoist it to module scope instead if it never changes. Always build a NEW object to change ' +
    'it — mutating in place is invisible to the diff.\n' +
    'This warning is development-only (stripped from production builds) and is logged once per component.'
  );
}

/**
 * One step of the identity check, called from the update effect.
 *
 * Pass the probe returned by the previous call (or `null` on the first run) and
 * get the probe to keep. The first call only records a baseline; from then on,
 * every watched key that arrives as a new object with unchanged contents
 * extends a streak, and crossing {@link STREAK_LIMIT} logs one warning.
 *
 * Safe under `<StrictMode>`: its double-invoked mount effect passes the very
 * same options object twice, which is an identity *match* and therefore resets
 * the streaks instead of inflating them.
 */
export function trackOptionStability(
  probe: OptionStabilityProbe | null,
  options: ChartOptions,
  warn: (message: string) => void = (message) => console.warn(message),
): OptionStabilityProbe {
  if (!probe) return { previous: options, streaks: {}, warned: false };
  if (probe.warned) {
    probe.previous = options;
    return probe;
  }
  const previous = probe.previous;
  probe.previous = options;
  for (const key of WATCHED_KEYS) {
    const before: unknown = previous[key];
    const after: unknown = options[key];
    if (before === after || !isObjectLike(before) || !isObjectLike(after)) {
      probe.streaks[key] = 0;
      continue;
    }
    if (!equalWithin(before, after, { left: COMPARE_BUDGET })) {
      probe.streaks[key] = 0;
      continue;
    }
    const streak = (probe.streaks[key] ?? 0) + 1;
    probe.streaks[key] = streak;
    if (streak < STREAK_LIMIT) continue;
    probe.warned = true;
    warn(unstableOptionMessage(key, options.type));
    return probe;
  }
  return probe;
}
