import { LinearScale, niceTicks, tickStep } from './linear';

const SECOND = 1e3;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Candidate sub-month tick intervals in ms. */
const INTERVALS: number[] = [
  SECOND, 5 * SECOND, 15 * SECOND, 30 * SECOND,
  MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 7 * DAY,
];

/**
 * Time scale: a linear scale over epoch milliseconds whose ticks fall on
 * calendar-aware boundaries (seconds/minutes/hours/days/months/years).
 */
export class TimeScale extends LinearScale {
  constructor(domain?: [number | Date, number | Date], range?: [number, number]) {
    super(undefined, range);
    if (domain) this.timeDomain(domain);
  }

  timeDomain(d?: [number | Date, number | Date]): [Date, Date] {
    if (d) this.domain([Number(d[0]), Number(d[1])]);
    return [new Date(this.d0), new Date(this.d1)];
  }

  override ticks(count = 6): number[] {
    return this.timeTicks(count).map((d) => d.getTime());
  }

  timeTicks(count = 6): Date[] {
    let lo = Math.min(this.d0, this.d1);
    let hi = Math.max(this.d0, this.d1);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
    if (lo === hi) return [new Date(lo)];
    const target = (hi - lo) / Math.max(1, count);

    if (target > 15 * DAY) return this.monthYearTicks(lo, hi, target);

    // Pick the smallest interval >= target (fall back to the largest).
    let step = INTERVALS[INTERVALS.length - 1] ?? DAY;
    for (const iv of INTERVALS) {
      if (iv >= target) {
        step = iv;
        break;
      }
    }

    if (step >= DAY) return this.dayTicks(lo, hi, step / DAY);

    const out: Date[] = [];
    const t0 = Math.ceil(lo / step) * step;
    for (let t = t0; t <= hi; t += step) out.push(new Date(t));
    return out;
  }

  private dayTicks(lo: number, hi: number, stepDays: number): Date[] {
    // Align to local midnight so day labels are stable across timezones.
    const first = new Date(lo);
    first.setHours(0, 0, 0, 0);
    if (first.getTime() < lo) first.setDate(first.getDate() + 1);
    const out: Date[] = [];
    const d = new Date(first.getTime());
    while (d.getTime() <= hi) {
      out.push(new Date(d.getTime()));
      d.setDate(d.getDate() + stepDays);
    }
    return out;
  }

  private monthYearTicks(lo: number, hi: number, target: number): Date[] {
    const AVG_MONTH = 30 * DAY;
    if (target <= 6 * AVG_MONTH) {
      const monthsStep = target <= AVG_MONTH ? 1 : target <= 3 * AVG_MONTH ? 3 : 6;
      const start = new Date(lo);
      start.setHours(0, 0, 0, 0);
      start.setDate(1);
      // Align to a multiple of the step from January.
      start.setMonth(Math.ceil(start.getMonth() / monthsStep) * monthsStep);
      if (start.getTime() < lo) start.setMonth(start.getMonth() + monthsStep);
      const out: Date[] = [];
      const d = new Date(start.getTime());
      while (d.getTime() <= hi) {
        out.push(new Date(d.getTime()));
        d.setMonth(d.getMonth() + monthsStep);
      }
      return out;
    }
    // Year ticks with a nice numeric step.
    const y0 = new Date(lo).getFullYear();
    const y1 = new Date(hi).getFullYear() + 1;
    const step = Math.max(1, Math.round(tickStep(y0, y1, Math.max(1, Math.round((hi - lo) / target)))));
    const out: Date[] = [];
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const d = new Date(y, 0, 1);
      if (d.getTime() >= lo && d.getTime() <= hi) out.push(d);
    }
    return out.length > 0 ? out : niceTicks(lo, hi, 4).map((t) => new Date(t));
  }
}
