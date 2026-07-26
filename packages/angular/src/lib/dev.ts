/**
 * Development-only diagnostics for @chartcraft/angular.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `ChartBase` watches `options` by **reference**. That is what makes an
 * in-place mutation invisible (documented on `ChartBase`), and it also makes the
 * opposite mistake invisible:
 *
 *   <cc-line-chart [options]="{ title: 'WAU', data: data() }" />
 *
 * An object literal in a template is rebuilt on every change-detection pass, so
 * the input signal is set to a new reference each time and the chart is handed a
 * full `update()` on every CD cycle — including one that discards a
 * brush-zoom viewport. Nothing in the types says so, so this makes it
 * self-announcing. It is the same trap the React wrapper warns about, reported
 * with the same wording.
 *
 * HOW IT IS KEPT OUT OF PRODUCTION
 * --------------------------------
 * The only caller guards on `isDevMode()` from `@angular/core` — public API,
 * and `false` in any production build (the CLI defines `ngDevMode` as `false`,
 * and `enableProdMode()` sets it explicitly). The comparison work below
 * therefore never executes in a production app.
 */

/** Consecutive redundant reference changes tolerated before warning. */
const STREAK_LIMIT = 3;

/**
 * Node visits allowed per comparison. Bounds the dev-only cost on large
 * datasets: when the budget runs out the values are reported as "different",
 * which resets the streak and therefore never produces a false warning.
 */
const COMPARE_BUDGET = 5000;

/** Per-component-instance state for the reference-identity check. */
export interface OptionStabilityProbe {
  /** The options object seen on the previous run of the update effect. */
  previous: unknown;
  /** Consecutive redundant-reference count. */
  streak: number;
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

/** The warning text. Names the input, names the selector, prescribes the fix. */
export function unstableOptionsMessage(selector: string): string {
  return (
    `[@chartcraft/angular] <${selector}>: the [options] input has been a brand-new object on ` +
    `${STREAK_LIMIT} consecutive change-detection passes while its contents never changed.\n\n` +
    'This wrapper watches [options] by REFERENCE, so an object literal written inline in the ' +
    'template is rebuilt every pass and pushes a redundant chart.update() each time (and with ' +
    "`zoom` enabled that also discards the user's viewport). Hold it in a signal or computed() " +
    'and bind that instead:\n\n' +
    "  readonly options = computed<ChartSpec>(() => ({ title: 'WAU', data: this.data() }));\n" +
    `  <${selector} [options]="options()" />\n\n` +
    'Assign a NEW object to change it — mutating in place is invisible to the reference watch.\n' +
    'This warning is development-only (isDevMode()) and is logged once per component.'
  );
}

/**
 * One step of the reference-identity check, called from the update effect.
 *
 * Pass the probe returned by the previous call (or `null` on the first run) and
 * get the probe to keep. The first call only records a baseline; from then on,
 * every new-but-deeply-equal reference extends a streak, and crossing
 * {@link STREAK_LIMIT} logs one warning.
 */
export function trackOptionStability(
  probe: OptionStabilityProbe | null,
  options: unknown,
  selector: string,
  warn: (message: string) => void = (message) => console.warn(message),
): OptionStabilityProbe {
  if (!probe) return { previous: options, streak: 0, warned: false };
  if (probe.warned) {
    probe.previous = options;
    return probe;
  }
  const previous = probe.previous;
  probe.previous = options;
  if (
    previous === options ||
    !isObjectLike(previous) ||
    !isObjectLike(options) ||
    !equalWithin(previous, options, { left: COMPARE_BUDGET })
  ) {
    probe.streak = 0;
    return probe;
  }
  probe.streak += 1;
  if (probe.streak >= STREAK_LIMIT) {
    probe.warned = true;
    warn(unstableOptionsMessage(selector));
  }
  return probe;
}
