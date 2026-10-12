import { useRef } from 'react';
import { gsap, useScrollFx } from '../lib/gsap';

export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useScrollFx(ref, () => {
    gsap.fromTo(ref.current, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
  }, []);

  return <div ref={ref} aria-hidden className="scroll-progress" />;
}
