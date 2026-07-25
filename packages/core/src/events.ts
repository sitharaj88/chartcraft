/** Minimal typed event emitter used by Chart instances. */

type Handler = (ev: unknown) => void;

export class Emitter<M extends object> {
  private handlers = new Map<keyof M, Set<Handler>>();

  on<K extends keyof M>(type: K, handler: (ev: M[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler);
    return () => this.off(type, handler);
  }

  off<K extends keyof M>(type: K, handler: (ev: M[K]) => void): void {
    this.handlers.get(type)?.delete(handler as Handler);
  }

  emit<K extends keyof M>(type: K, ev: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so handlers that unsubscribe during emit don't break iteration.
    for (const h of [...set]) h(ev);
  }

  listenerCount(type: keyof M): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
