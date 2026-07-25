import { clamp } from '../util';

export type BandValue = string | number | Date;

/**
 * Ordinal band scale (category axis). Positions each category in an evenly
 * spaced band with inner/outer padding, d3-band style.
 */
export class BandScale {
  private cats: BandValue[] = [];
  private keyToIndex = new Map<string, number>();
  private r0 = 0;
  private r1 = 1;
  private pInner = 0.2;
  private pOuter = 0.1;

  constructor(domain?: BandValue[], range?: [number, number]) {
    if (domain) this.domain(domain);
    if (range) this.range(range);
  }

  private static key(v: BandValue): string {
    return v instanceof Date ? `d:${v.getTime()}` : `${typeof v}:${String(v)}`;
  }

  domain(d?: BandValue[]): BandValue[] {
    if (d) {
      this.cats = [...d];
      this.keyToIndex.clear();
      this.cats.forEach((c, i) => {
        const k = BandScale.key(c);
        if (!this.keyToIndex.has(k)) this.keyToIndex.set(k, i);
      });
    }
    return this.cats;
  }

  range(r?: [number, number]): [number, number] {
    if (r) {
      this.r0 = r[0];
      this.r1 = r[1];
    }
    return [this.r0, this.r1];
  }

  padding(inner?: number, outer?: number): this {
    if (inner !== undefined) this.pInner = clamp(inner, 0, 1);
    if (outer !== undefined) this.pOuter = Math.max(0, outer);
    return this;
  }

  get count(): number {
    return this.cats.length;
  }

  step(): number {
    const n = Math.max(1, this.cats.length);
    const denom = Math.max(1e-9, n - this.pInner + 2 * this.pOuter);
    return (this.r1 - this.r0) / denom;
  }

  bandwidth(): number {
    return Math.abs(this.step() * (1 - this.pInner));
  }

  indexOf(v: BandValue): number {
    return this.keyToIndex.get(BandScale.key(v)) ?? -1;
  }

  /** Left/start edge of the band for a category value or index. */
  scale(v: BandValue | number): number {
    const i = typeof v === 'number' && !this.keyToIndex.has(BandScale.key(v)) ? v : this.indexFor(v);
    const s = this.step();
    return this.r0 + s * this.pOuter + i * s;
  }

  private indexFor(v: BandValue | number): number {
    const i = this.indexOf(v as BandValue);
    return i >= 0 ? i : typeof v === 'number' ? v : 0;
  }

  /** Center of band i. */
  center(i: number): number {
    return this.scale(i) + (this.step() * (1 - this.pInner)) / 2;
  }

  /** Index of the band containing/nearest to pixel px (full column band hit). */
  invertIndex(px: number): number {
    if (this.cats.length === 0) return -1;
    const s = this.step();
    if (s === 0) return 0;
    const raw = (px - this.r0 - s * this.pOuter) / s - (1 - this.pInner) / 2;
    return clamp(Math.round(raw), 0, this.cats.length - 1);
  }

  ticks(): BandValue[] {
    return this.cats;
  }
}
