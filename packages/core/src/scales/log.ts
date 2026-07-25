import { roundFP } from '../util';
import { niceTicks } from './linear';

/**
 * Base-10 logarithmic scale. Domain must be positive; values are clamped to
 * a tiny epsilon to stay finite.
 */
export class LogScale {
  private d0 = 1;
  private d1 = 10;
  private r0 = 0;
  private r1 = 1;

  constructor(domain?: [number, number], range?: [number, number]) {
    if (domain) this.domain(domain);
    if (range) this.range(range);
  }

  private static safe(v: number): number {
    return v > 0 ? v : 1e-12;
  }

  domain(d?: [number, number]): [number, number] {
    if (d) {
      this.d0 = LogScale.safe(d[0]);
      this.d1 = LogScale.safe(d[1]);
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
    const l0 = Math.log10(this.d0);
    const l1 = Math.log10(this.d1);
    const span = l1 - l0;
    const t = span === 0 ? 0.5 : (Math.log10(LogScale.safe(v)) - l0) / span;
    return this.r0 + t * (this.r1 - this.r0);
  }

  invert(px: number): number {
    const span = this.r1 - this.r0;
    const t = span === 0 ? 0.5 : (px - this.r0) / span;
    const l0 = Math.log10(this.d0);
    const l1 = Math.log10(this.d1);
    return Math.pow(10, l0 + t * (l1 - l0));
  }

  /**
   * Ticks at powers of ten; when fewer than ~2 decades are visible, 2x and 5x
   * multiples are included; when many decades, powers are thinned.
   */
  ticks(count = 6): number[] {
    const lo = Math.min(this.d0, this.d1);
    const hi = Math.max(this.d0, this.d1);
    const e0 = Math.floor(Math.log10(lo));
    const e1 = Math.ceil(Math.log10(hi));
    const decades = e1 - e0;

    if (decades < 1) {
      // Sub-decade domain: fall back to linear nice ticks.
      return niceTicks(lo, hi, count).filter((t) => t > 0);
    }

    const out: number[] = [];
    if (decades <= 2 && count >= 4) {
      for (let e = e0; e <= e1; e++) {
        for (const m of [1, 2, 5]) {
          const v = roundFP(m * Math.pow(10, e));
          if (v >= lo && v <= hi) out.push(v);
        }
      }
      return out;
    }

    const stride = Math.max(1, Math.ceil(decades / Math.max(1, count)));
    for (let e = Math.ceil(e0 / stride) * stride; e <= e1; e += stride) {
      const v = roundFP(Math.pow(10, e));
      if (v >= lo && v <= hi) out.push(v);
    }
    if (out.length === 0) out.push(roundFP(Math.pow(10, e0)), roundFP(Math.pow(10, e1)));
    return out;
  }

  /** Expand domain outward to full decades. */
  nice(): this {
    const reversed = this.d1 < this.d0;
    const lo = Math.min(this.d0, this.d1);
    const hi = Math.max(this.d0, this.d1);
    const nlo = Math.pow(10, Math.floor(Math.log10(lo)));
    const nhi = Math.pow(10, Math.ceil(Math.log10(hi)));
    this.d0 = reversed ? nhi : nlo;
    this.d1 = reversed ? nlo : nhi;
    return this;
  }
}
