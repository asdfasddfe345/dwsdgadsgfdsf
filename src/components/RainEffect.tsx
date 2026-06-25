import { useMemo } from 'react';

interface Drop {
  id: number;
  left: number;
  delay: number;
  duration: number;
  opacity: number;
  width: number;
  height: number;
}

function generateDrops(count: number): Drop[] {
  const drops: Drop[] = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 0.6 + Math.random() * 0.8,
      opacity: 0.15 + Math.random() * 0.2,
      width: 0.5 + Math.random() * 0.7,
      height: 12 + Math.random() * 18,
    });
  }
  return drops;
}

export default function RainEffect({ contained = false }: { contained?: boolean }) {
  const drops = useMemo(() => generateDrops(120), []);

  return (
    <div
      className={`${contained ? 'absolute' : 'fixed'} inset-0 pointer-events-none overflow-hidden`}
      style={{ zIndex: contained ? 2 : 50 }}
      aria-hidden
    >
      <style>{`
        @keyframes sw-rain-fall {
          0%   { transform: translateY(0) skewX(-8deg); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translateY(105vh) skewX(-8deg); opacity: 0; }
        }
      `}</style>
      {drops.map((drop) => (
        <span
          key={drop.id}
          style={{
            position: 'absolute',
            left: `${drop.left}%`,
            top: '-40px',
            width: `${drop.width}px`,
            height: `${drop.height}px`,
            borderRadius: '0 0 3px 3px',
            background: `linear-gradient(to bottom, transparent, rgba(147,210,255,${drop.opacity + 0.1}))`,
            animationName: 'sw-rain-fall',
            animationDuration: `${drop.duration}s`,
            animationDelay: `${drop.delay}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
}
