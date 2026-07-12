import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useAnimation, useInView, type Variants } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const TITLE_WORDS = ['THE', 'SUPREME', 'WAFFLE'];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.13, delayChildren: 0.2 },
  },
};

const wordVariants: Variants = {
  hidden: { opacity: 0, y: 48, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const controls = useAnimation();
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  useEffect(() => {
    if (isInView) void controls.start('visible');
  }, [isInView, controls]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden hero-grid"
      style={{ minHeight: 'min(92vh, 720px)' }}
    >
      {/* Ambient glow blobs */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 w-[480px] h-[480px] rounded-full animate-ambient-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(212,160,23,0.18) 0%, rgba(212,160,23,0.06) 40%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 w-[360px] h-[360px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(107,58,30,0.28) 0%, rgba(107,58,30,0.08) 50%, transparent 70%)',
          filter: 'blur(52px)',
          animationDuration: '7s',
        }}
      />

      {/* Noise texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-16 lg:pb-20">
        <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-0">

          {/* ── Left: Text Content ── */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">

            {/* Title: word-by-word stagger */}
            <motion.h1
              variants={containerVariants}
              initial="hidden"
              animate={controls}
              className="font-display flex flex-wrap gap-x-3 gap-y-1 justify-center lg:justify-start mb-2"
              style={{ lineHeight: 1 }}
              aria-label="The Supreme Waffle"
            >
              {TITLE_WORDS.map((word, i) => (
                <motion.span
                  key={word}
                  variants={wordVariants}
                  className="block"
                  style={{
                    fontSize: 'clamp(3rem, 9vw, 6.5rem)',
                    fontWeight: 900,
                    color: i === 1
                      ? '#D4A017'
                      : '#F6EFE4',
                    textShadow: i === 1
                      ? '0 0 40px rgba(212,160,23,0.35)'
                      : '0 2px 20px rgba(0,0,0,0.5)',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </motion.h1>

            {/* Tagline */}
            <motion.p
              variants={fadeUpVariants}
              initial="hidden"
              animate={controls}
              transition={{ delay: 0.55 }}
              className="mt-4 mb-6 max-w-md text-brand-text-muted"
              style={{ fontSize: 'clamp(14px, 2.4vw, 18px)', lineHeight: 1.65, fontWeight: 500 }}
            >
              Bold flavours. Crafted with obsession.{' '}
              <span className="text-brand-gold font-semibold">Waffles, shakes, burgers, pizza, momos</span>{' '}
              — every bite, unforgettable.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={fadeUpVariants}
              initial="hidden"
              animate={controls}
              transition={{ delay: 0.65 }}
              className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mb-8"
            >
              <Link
                to="/menu"
                className="btn-primary flex items-center justify-center gap-2 text-base"
                style={{ minWidth: '168px' }}
              >
                Order Now
                <ArrowRight size={17} strokeWidth={2.5} />
              </Link>
              <Link
                to="/offers"
                className="btn-secondary flex items-center justify-center gap-2 text-base"
                style={{ minWidth: '148px' }}
              >
                View Offers
              </Link>
            </motion.div>


          </div>


        </div>
      </div>

      {/* Bottom fade gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, #0D0501)' }}
      />
    </section>
  );
}
