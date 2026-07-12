import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useAnimation, useInView, type Variants } from 'framer-motion';
import { Sparkles, ArrowRight, Star } from 'lucide-react';

const HERO_IMG = 'https://images.pexels.com/photos/1099680/pexels-photo-1099680.jpeg?auto=compress&cs=tinysrgb&w=900';

const CATEGORY_CHIPS = [
  { label: 'Waffles', emoji: '🧇' },
  { label: 'Shakes', emoji: '🥤' },
  { label: 'Burgers', emoji: '🍔' },
  { label: 'Pizza', emoji: '🍕' },
  { label: 'Momos', emoji: '🥟' },
  { label: 'Fries', emoji: '🍟' },
  { label: 'Desserts', emoji: '🍰' },
];

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

const imageVariants: Variants = {
  hidden: { opacity: 0, x: 80, scale: 0.88, filter: 'blur(12px)' },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.3 },
  },
};

const chipContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.9 } },
};

const chipVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.85 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] },
  },
};

const ratingVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1], delay: 0.75 },
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

            {/* Eyebrow pill */}
            <motion.div
              variants={fadeUpVariants}
              initial="hidden"
              animate={controls}
              className="inline-flex items-center gap-2 rounded-full border border-brand-gold/25 bg-brand-gold/8 px-4 py-1.5 mb-6 backdrop-blur-sm"
              style={{ background: 'rgba(212,160,23,0.08)' }}
            >
              <Sparkles size={13} className="text-brand-gold" />
              <span className="text-[12px] font-bold text-brand-gold tracking-widest uppercase">
                Premium Belgian Craft
              </span>
            </motion.div>

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

            {/* Rating badge */}
            <motion.div
              variants={ratingVariants}
              initial="hidden"
              animate={controls}
              className="flex items-center gap-3"
            >
              <div
                className="flex items-center gap-1.5 rounded-full border border-brand-gold/25 px-3.5 py-1.5"
                style={{ background: 'rgba(212,160,23,0.07)' }}
              >
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={13}
                    className="text-brand-gold fill-brand-gold"
                    fill="currentColor"
                  />
                ))}
                <span className="text-[13px] font-bold text-brand-gold ml-1">4.9</span>
              </div>
              <span className="text-[13px] text-brand-text-dim font-medium">
                10,000+ happy customers
              </span>
            </motion.div>

            {/* Category chips */}
            <motion.div
              variants={chipContainerVariants}
              initial="hidden"
              animate={controls}
              className="flex flex-wrap gap-2 mt-7 justify-center lg:justify-start"
            >
              {CATEGORY_CHIPS.map((chip) => (
                <motion.div key={chip.label} variants={chipVariants}>
                  <Link
                    to={`/menu?q=${chip.label.toLowerCase()}`}
                    className="gloss-chip hover:border-brand-gold/30 hover:text-brand-gold transition-colors"
                  >
                    <span role="img" aria-label={chip.label} style={{ fontSize: 13 }}>
                      {chip.emoji}
                    </span>
                    <span>{chip.label}</span>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* ── Right: Hero Image ── */}
          <div className="flex-1 relative flex justify-center lg:justify-end items-center">
            {/* Outer glow ring */}
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="absolute rounded-full choc-glow"
              style={{
                width: 'clamp(280px, 46vw, 500px)',
                height: 'clamp(280px, 46vw, 500px)',
                background: 'radial-gradient(circle, rgba(212,160,23,0.12) 0%, rgba(107,58,30,0.16) 40%, transparent 72%)',
                filter: 'blur(24px)',
              }}
            />

            {/* Rotating dashed ring */}
            <motion.div
              initial={{ opacity: 0, rotate: -30 }}
              animate={isInView ? { opacity: 0.3, rotate: 0 } : {}}
              transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
              style={{
                position: 'absolute',
                width: 'clamp(300px, 48vw, 520px)',
                height: 'clamp(300px, 48vw, 520px)',
                borderRadius: '50%',
                border: '1px dashed rgba(212,160,23,0.35)',
              }}
            />

            {/* Main image */}
            <motion.div
              variants={imageVariants}
              initial="hidden"
              animate={controls}
              className="relative z-10 animate-float"
              style={{
                width: 'clamp(240px, 40vw, 460px)',
                height: 'clamp(240px, 40vw, 460px)',
              }}
            >
              <div
                className="w-full h-full rounded-[32px] overflow-hidden"
                style={{
                  boxShadow: '0 32px 80px rgba(0,0,0,0.65), 0 0 60px rgba(212,160,23,0.20), inset 0 1px 0 rgba(255,255,255,0.12)',
                  border: '1px solid rgba(212,160,23,0.20)',
                }}
              >
                <img
                  src={HERO_IMG}
                  alt="Supreme Waffle — premium Belgian waffle"
                  loading="eager"
                  decoding="async"
                  className="w-full h-full object-cover"
                  style={{ filter: 'saturate(1.15) brightness(0.92) contrast(1.05)' }}
                />
                {/* Gold shimmer overlay */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(135deg, rgba(212,160,23,0.10) 0%, transparent 50%, rgba(107,58,30,0.12) 100%)',
                  }}
                />
              </div>

              {/* Floating badge — top left */}
              <motion.div
                initial={{ opacity: 0, scale: 0.6, y: 10 }}
                animate={isInView ? { opacity: 1, scale: 1, y: 0 } : {}}
                transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: 1.0 }}
                className="absolute -top-4 -left-4 rounded-2xl border border-brand-gold/30 px-3.5 py-2.5 backdrop-blur-xl"
                style={{
                  background: 'rgba(13,5,1,0.82)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.40)',
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">Crafted Fresh</p>
                <p className="text-[13px] font-bold text-brand-text">Belgian Waffles</p>
              </motion.div>

              {/* Floating badge — bottom right */}
              <motion.div
                initial={{ opacity: 0, scale: 0.6, y: -10 }}
                animate={isInView ? { opacity: 1, scale: 1, y: 0 } : {}}
                transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1], delay: 1.15 }}
                className="absolute -bottom-4 -right-4 rounded-2xl border border-emerald-500/20 px-3.5 py-2.5 backdrop-blur-xl"
                style={{
                  background: 'rgba(13,5,1,0.82)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.40)',
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Order In</p>
                <p className="text-[13px] font-bold text-brand-text">30 Min Delivery</p>
              </motion.div>
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
