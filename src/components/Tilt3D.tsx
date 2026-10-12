import type { PointerEvent, ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { springTilt } from '../lib/animations';

interface Props {
  children: ReactNode;
  className?: string;
  max?: number;
}

export default function Tilt3D({ children, className = '', max = 9 }: Props) {
  const reduce = useReducedMotion();
  const rotateX = useSpring(0, springTilt);
  const rotateY = useSpring(0, springTilt);
  const glareOpacity = useSpring(0, springTilt);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,236,180,0.28), transparent 55%)`;

  if (reduce) return <div className={className}>{children}</div>;

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 2 * max);
    rotateX.set((0.5 - py) * 2 * max);
    glareX.set(px * 100);
    glareY.set(py * 100);
    glareOpacity.set(1);
  }

  function reset() {
    rotateX.set(0);
    rotateY.set(0);
    glareOpacity.set(0);
  }

  return (
    <motion.div
      className={`relative ${className}`}
      style={{ rotateX, rotateY, transformPerspective: 700 }}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        style={{ background: glare, opacity: glareOpacity }}
      />
    </motion.div>
  );
}
