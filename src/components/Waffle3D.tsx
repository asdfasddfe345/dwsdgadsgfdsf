import { useRef, type CSSProperties } from 'react';
import { gsap, ScrollTrigger, useScrollFx } from '../lib/gsap';

const SLABS = Array.from({ length: 8 }, (_, index) => index * 3);

export default function Waffle3D({ size = 180, className = '' }: { size?: number; className?: string }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  // Scrolling spins the waffle faster; it then settles back to its idle turn.
  useScrollFx(sceneRef, () => {
    const spin = sceneRef.current?.querySelector('.waffle-spin')?.getAnimations()[0];
    if (!spin) return;
    const speed = { rate: 1 };
    ScrollTrigger.create({
      onUpdate: (self) => {
        const rate = 1 + Math.min(Math.abs(self.getVelocity()) / 220, 9);
        if (rate < speed.rate) return;
        speed.rate = rate;
        gsap.to(speed, {
          rate: 1,
          duration: 1.4,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: () => spin.updatePlaybackRate(speed.rate),
        });
      },
    });
  }, []);

  return (
    <div
      ref={sceneRef}
      className={`waffle-scene animate-float ${className}`}
      style={{ '--waffle': `${size}px` } as CSSProperties}
      aria-hidden
    >
      <span className="waffle-shadow" />
      <div className="waffle-spin">
        {SLABS.map((z) => (
          <span key={z} className="waffle-slab" style={{ transform: `translateZ(${z}px)` }} />
        ))}
        <span className="waffle-top" />
        <span className="waffle-syrup" />
        <span className="waffle-butter" />
      </div>
      <span className="waffle-chip" style={{ left: '6%', top: '18%' }} />
      <span className="waffle-chip animate-float-delayed" style={{ right: '8%', top: '10%', width: '7%', height: '7%' }} />
      <span className="waffle-chip animate-float-delayed" style={{ right: '2%', bottom: '30%' }} />
    </div>
  );
}
