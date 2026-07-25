/**
 * Keyboard navigation state machine (pure, unit-testable).
 * Arrow keys walk points/series, Home/End jump, Enter activates,
 * Escape clears focus.
 */

export interface NavPosition {
  si: number;
  pi: number;
}

export type NavAction =
  | { kind: 'move'; pos: NavPosition }
  | { kind: 'activate'; pos: NavPosition }
  | { kind: 'clear' }
  | { kind: 'none' };

export interface NavContext {
  seriesCount: number;
  isVisible(si: number): boolean;
  pointCount(si: number): number;
}

function firstVisible(ctx: NavContext, from = 0, dir = 1): number {
  for (let step = 0; step < ctx.seriesCount; step++) {
    const si = (from + dir * step + ctx.seriesCount * 2) % ctx.seriesCount;
    if (ctx.isVisible(si) && ctx.pointCount(si) > 0) return si;
  }
  return -1;
}

export function navigate(key: string, cur: NavPosition | null, ctx: NavContext): NavAction {
  if (ctx.seriesCount === 0) return { kind: 'none' };

  const ensure = (): NavPosition | null => {
    const si = firstVisible(ctx);
    return si < 0 ? null : { si, pi: 0 };
  };

  switch (key) {
    case 'ArrowRight':
    case 'ArrowLeft': {
      if (!cur) {
        const pos = ensure();
        return pos ? { kind: 'move', pos } : { kind: 'none' };
      }
      const n = ctx.pointCount(cur.si);
      if (n === 0) return { kind: 'none' };
      const delta = key === 'ArrowRight' ? 1 : -1;
      const pi = Math.max(0, Math.min(n - 1, cur.pi + delta));
      if (pi === cur.pi) return { kind: 'none' };
      return { kind: 'move', pos: { si: cur.si, pi } };
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!cur) {
        const pos = ensure();
        return pos ? { kind: 'move', pos } : { kind: 'none' };
      }
      const dir = key === 'ArrowDown' ? 1 : -1;
      let si = cur.si;
      for (let step = 1; step <= ctx.seriesCount; step++) {
        const cand = (cur.si + dir * step + ctx.seriesCount * 2) % ctx.seriesCount;
        if (ctx.isVisible(cand) && ctx.pointCount(cand) > 0) {
          si = cand;
          break;
        }
      }
      if (si === cur.si) return { kind: 'none' };
      const pi = Math.min(cur.pi, ctx.pointCount(si) - 1);
      return { kind: 'move', pos: { si, pi: Math.max(0, pi) } };
    }
    case 'Home': {
      const base = cur ?? ensure();
      if (!base) return { kind: 'none' };
      return { kind: 'move', pos: { si: base.si, pi: 0 } };
    }
    case 'End': {
      const base = cur ?? ensure();
      if (!base) return { kind: 'none' };
      return { kind: 'move', pos: { si: base.si, pi: Math.max(0, ctx.pointCount(base.si) - 1) } };
    }
    case 'Enter':
    case ' ': {
      if (!cur) return { kind: 'none' };
      return { kind: 'activate', pos: cur };
    }
    case 'Escape':
      return cur ? { kind: 'clear' } : { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}
