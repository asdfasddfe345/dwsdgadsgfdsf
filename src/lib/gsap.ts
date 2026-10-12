import { useLayoutEffect, type DependencyList, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Sections mount after their data loads, which moves every trigger below them.
if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
  let timer = 0;
  new ResizeObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(true), 200);
  }).observe(document.body);
}

/** Runs `setup` in a GSAP context scoped to `scope`, only for visitors who allow motion, and reverts it on cleanup. */
export function useScrollFx(scope: RefObject<Element | null>, setup: () => void, deps: DependencyList) {
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', setup, scope);
    return () => media.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers list what should rebuild the triggers
  }, deps);
}

const HINGED = { opacity: 0, y: 40, rotateX: 32, transformPerspective: 900, transformOrigin: '50% 100%' };
const upright = (stagger: number) => ({
  opacity: 1,
  y: 0,
  rotateX: 0,
  duration: 0.7,
  ease: 'power3.out',
  stagger,
  overwrite: true,
  clearProps: 'opacity,transform,transformOrigin',
});

/** Cards lie back, then stand up from their bottom edge as each row scrolls into view. */
export function flipInOnScroll(targets: string | Element) {
  const cards = gsap.utils.toArray<HTMLElement>(targets);
  if (!cards.length) return;
  gsap.set(cards, HINGED);
  ScrollTrigger.batch(cards, {
    start: 'top 94%',
    once: true,
    onEnter: (batch) => gsap.to(batch, upright(0.07)),
  });
}

/** Product rail: the heading slides in, the first cards stand up left to right, and the row leans back while scrolling. */
export function revealRail(section: Element) {
  const cards = gsap.utils.toArray<HTMLElement>('.rail-card').slice(0, 12);
  gsap.set(cards, HINGED);
  gsap
    .timeline({ scrollTrigger: { trigger: section, start: 'top 88%', once: true } })
    .from('.rail-head', { opacity: 0, y: 14, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform' })
    .to(cards, upright(0.06), 0.05);

  // The lean follows scroll speed and clears itself at rest, so card text stays sharp when nothing is moving.
  const row = gsap.utils.toArray<HTMLElement>('.rail-row');
  const lean = { deg: 0 };
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const deg = gsap.utils.clamp(-10, 10, self.getVelocity() / 250);
      if (Math.abs(deg) <= Math.abs(lean.deg)) return;
      lean.deg = deg;
      gsap.to(lean, {
        deg: 0,
        duration: 0.8,
        ease: 'power3.out',
        overwrite: true,
        onUpdate: () => gsap.set(row, { rotateX: lean.deg, transformPerspective: 1400 }),
        onComplete: () => gsap.set(row, { clearProps: 'transform' }),
      });
    },
  });
}

export { gsap, ScrollTrigger };
