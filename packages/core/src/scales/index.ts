import { LinearScale } from './linear';
import { LogScale, positiveLogDomain } from './log';

export { LinearScale, niceTicks, tickStep } from './linear';
export { TimeScale } from './time';
export { BandScale } from './band';
export type { BandValue } from './band';
export { LOG_EPSILON, LogScale, positiveLogDomain } from './log';

/**
 * Widen a VALUE domain outward to round bounds, by the convention of the axis
 * that will carry it.
 *
 * The two conventions are not interchangeable, which is the whole reason this
 * exists as one shared function rather than four copies of
 * `new LinearScale([lo, hi]).nice(5)`:
 *
 * - a LINEAR axis rounds outward to multiples of a nice tick step, and rounding
 *   a positive floor DOWN THROUGH ZERO is normal and desirable there (a
 *   1.2 … 260 extent becomes 0 … 300);
 * - a LOG axis has no zero to round down to. Applying the linear convention to
 *   one contributes a 0 floor that the log scale can only clamp to an epsilon —
 *   the twelve-decade axis reported from the sample dashboard's boxplot. A log
 *   axis rounds outward to whole DECADES instead (1.2 … 260 becomes 1 … 1000),
 *   and a non-positive bound is discarded rather than widened.
 *
 * Every chart type that widens its own value-domain contribution
 * (`extendValueDomain`) calls this with `model.valueAxisLog`, so "which
 * convention applies" is decided once, by the axis, and never per type.
 */
export function niceValueDomain(lo: number, hi: number, log = false, count = 5): [number, number] {
  if (!log) {
    const d = new LinearScale([lo, hi]).nice(count).domain();
    return [d[0], d[1]];
  }
  const [plo, phi] = positiveLogDomain(lo, hi);
  const d = new LogScale([plo, phi]).nice().domain();
  return [d[0], d[1]];
}
