import { onBeforeUnmount, onMounted } from 'vue';

/**
 * Scroll-reveal for elements carrying `data-cc-reveal`.
 *
 * One IntersectionObserver per page root, not one per element. Elements are
 * discovered on mount (and again on the next frame, so children that mount
 * lazily are picked up). The transition itself lives in custom.css and is
 * neutralised by `prefers-reduced-motion: reduce`; the class is still applied
 * so nothing is ever left invisible.
 */
export function useReveal(): void {
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('[data-cc-reveal]').forEach((el) => el.classList.add('cc-in'));
      return;
    }

    observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('cc-in');
          obs.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    const scan = () =>
      document
        .querySelectorAll('[data-cc-reveal]:not(.cc-in)')
        .forEach((el) => observer?.observe(el));

    scan();
    requestAnimationFrame(scan);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
}
