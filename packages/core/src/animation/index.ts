/**
 * rAF-driven interpolation between retained models.
 * Honors prefers-reduced-motion (callers should check and pass duration 0).
 */
import { caf, clamp, raf } from '../util';

export type EasingName = 'linear' | 'ease-out' | 'ease-in-out';

export const easings: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** SSR-safe check; false when matchMedia is unavailable. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface AnimatorHandle {
  cancel(): void;
  readonly running: boolean;
}

/**
 * Drive `onFrame(easedT)` from 0..1 over `duration` ms via rAF.
 * duration <= 0 fires a single final frame synchronously.
 */
export class Animator {
  private rafId: number | null = null;
  private active = false;

  get running(): boolean {
    return this.active;
  }

  start(duration: number, easing: EasingName, onFrame: (t: number) => void, onDone?: () => void): void {
    this.cancel();
    if (duration <= 0) {
      onFrame(1);
      onDone?.();
      return;
    }
    const ease = easings[easing] ?? easings['ease-out'];
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.active = true;
    const tick = (now: number) => {
      const t = clamp((now - t0) / duration, 0, 1);
      onFrame(ease(t));
      if (t >= 1) {
        this.active = false;
        this.rafId = null;
        onDone?.();
        return;
      }
      this.rafId = raf(tick);
    };
    this.rafId = raf(tick);
  }

  cancel(): void {
    if (this.rafId !== null) {
      caf(this.rafId);
      this.rafId = null;
    }
    this.active = false;
  }
}

/** Linear interpolation helper used when blending retained models. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
