import { roundFP } from '../util';

const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

/** d3-style nice tick step: 1/2/5 x 10^k covering span/count. */
export function tickStep(start: number, stop: number, count: number): number {
  const span = Math.abs(stop - start);
  if (span === 0 || !Number.isFinite(span)) return 1;
  const step0 = span / Math.max(1, count);
  const power = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / power;
  const factor = err >= E10 ? 10 : err >= E5 ? 5 : err >= E2 ? 2 : 1;
  return roundFP(power * factor);
}

/** Nice ticks inside [start, stop] (inclusive), at multiples of a nice step. */
export function niceTicks(start: number, stop: number, count = 6): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return [];
  if (start === stop) return [roundFP(start)];
  const reverse = stop < start;
  let lo = reverse ? stop : start;
  let hi = reverse ? start : stop;
  const step = tickStep(lo, hi, count);
  const t0 = Math.ceil(lo / step) * step;
  const t1 = Math.floor(hi / step) * step;
  const n = Math.floor((t1 - t0) / step + 0.5) + 1;
  const ticks: number[] = [];
  for (let i = 0; i < n; i++) ticks.push(roundFP(t0 + i * step));
  return reverse ? ticks.reverse() : ticks;
}

/** Continuous linear scale mapping a numeric domain onto a pixel range. */
export class LinearScale {
  protected d0 = 0;
  protected d1 = 1;
  protected r0 = 0;
  protected r1 = 1;

  constructor(domain?: [number, number], range?: [number, number]) {
    if (domain) this.domain(domain);
    if (range) this.range(range);
  }

  domain(d?: [number, number]): [number, number] {
    if (d) {
      this.d0 = d[0];
      this.d1 = d[1];
    }
    return [this.d0, this.d1];
  }

  range(r?: [number, number]): [number, number] {
    if (r) {
      this.r0 = r[0];
      this.r1 = r[1];
    }
    return [this.r0, this.r1];
  }

  scale(v: number): number {
    const span = this.d1 - this.d0;
    const t = span === 0 ? 0.5 : (v - this.d0) / span;
    return this.r0 + t * (this.r1 - this.r0);
  }

  invert(px: number): number {
    const span = this.r1 - this.r0;
    const t = span === 0 ? 0.5 : (px - this.r0) / span;
    return this.d0 + t * (this.d1 - this.d0);
  }

  ticks(count = 6): number[] {
    return niceTicks(this.d0, this.d1, count);
  }

  /** Extend the domain outward to nice step multiples. */
  nice(count = 6): this {
    if (this.d0 === this.d1 || !Number.isFinite(this.d0) || !Number.isFinite(this.d1)) return this;
    const reverse = this.d1 < this.d0;
    const lo = reverse ? this.d1 : this.d0;
    const hi = reverse ? this.d0 : this.d1;
    const step = tickStep(lo, hi, count);
    const nlo = roundFP(Math.floor(lo / step) * step);
    const nhi = roundFP(Math.ceil(hi / step) * step);
    this.d0 = reverse ? nhi : nlo;
    this.d1 = reverse ? nlo : nhi;
    return this;
  }
}
