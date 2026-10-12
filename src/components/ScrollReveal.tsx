import { useRef, type ReactNode } from 'react';
import { flipInOnScroll, useScrollFx } from '../lib/gsap';

export default function ScrollReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollFx(ref, () => {
    if (ref.current) flipInOnScroll(ref.current);
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
