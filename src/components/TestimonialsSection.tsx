import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView, type Variants } from 'framer-motion';
import { Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react';

interface Testimonial {
  name: string;
  location: string;
  rating: number;
  text: string;
  item: string;
  avatar: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Priya Reddy',
    location: 'Vijayawada',
    rating: 5,
    text: "The Belgian waffles here are absolutely out of this world. That caramelised crunch, the warm chocolate drizzle — nothing comes close in Vijayawada. I order every single week.",
    item: 'Choco Lava Waffle',
    avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100',
  },
  {
    name: 'Aditya Kumar',
    location: 'Kanuru',
    rating: 5,
    text: "Tried the loaded burger + thick shake combo and my mind was blown. Supreme Waffle has completely raised the bar for street-premium food in this area. Non-negotiable Friday ritual.",
    item: 'Loaded Smash Burger',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100',
  },
  {
    name: 'Sneha Balachandran',
    location: 'Governorpet',
    rating: 5,
    text: "The momos are insanely good. Crispy on the outside, juicy inside. And the delivery is always hot and fast. This has become my go-to for late-night cravings without question.",
    item: 'Crispy Pan Momos',
    avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100',
  },
  {
    name: 'Ravi Shankar',
    location: 'Moghalrajpuram',
    rating: 5,
    text: "Ordered for a family gathering and every single person asked where the food was from. The dessert waffle platter was the showstopper — beautiful presentation, incredible taste.",
    item: 'Dessert Waffle Platter',
    avatar: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=100',
  },
  {
    name: 'Meghana Rao',
    location: 'Benz Circle',
    rating: 5,
    text: "The Nutella shake is something else. Thick, rich, insanely creamy. I've dragged all my friends here and they are all regulars now. Best shakes in Vijayawada, period.",
    item: 'Nutella Thick Shake',
    avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=100',
  },
];

const cardVariants: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir * 64,
    scale: 0.96,
    filter: 'blur(4px)',
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -64,
    scale: 0.96,
    filter: 'blur(4px)',
    transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] },
  }),
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } },
};

export default function TestimonialsSection() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(id);
  }, [paused]);

  function go(next: number) {
    setDirection(next > current ? 1 : -1);
    setCurrent((next + TESTIMONIALS.length) % TESTIMONIALS.length);
  }

  const t = TESTIMONIALS[current];

  return (
    <motion.section
      ref={ref}
      variants={sectionVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className="px-4 pt-8 pb-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-2xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-6">
          <p className="section-label mb-1">What People Say</p>
          <h2 className="section-title">Loved by Thousands</h2>
        </div>

        {/* Card */}
        <div className="relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="gloss-shell rounded-3xl px-6 py-7"
            >
              {/* Quote icon */}
              <div
                className="mb-4 inline-flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ background: 'rgba(212,160,23,0.12)' }}
              >
                <Quote size={16} className="text-brand-gold" />
              </div>

              {/* Text */}
              <p
                className="text-brand-text-muted leading-relaxed mb-6"
                style={{ fontSize: '15px', lineHeight: 1.7 }}
              >
                "{t.text}"
              </p>

              {/* Footer */}
              <div className="flex items-center gap-4">
                <img
                  src={t.avatar}
                  alt={t.name}
                  width={44}
                  height={44}
                  loading="lazy"
                  className="w-11 h-11 rounded-full object-cover border-2 border-brand-gold/30 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-brand-text truncate">{t.name}</p>
                  <p className="text-[12px] text-brand-text-dim truncate">{t.location}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex gap-0.5">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} size={12} className="text-brand-gold fill-brand-gold" fill="currentColor" />
                    ))}
                  </div>
                  <span className="text-[11px] text-brand-text-dim italic">{t.item}</span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mt-5">
          <button
            onClick={() => go(current - 1)}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-brand-border hover:border-brand-gold/40 hover:text-brand-gold text-brand-text-dim transition-colors"
            aria-label="Previous testimonial"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex gap-2">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Go to testimonial ${i + 1}`}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === current ? '20px' : '6px',
                  height: '6px',
                  background: i === current
                    ? '#D4A017'
                    : 'rgba(212,160,23,0.25)',
                }}
              />
            ))}
          </div>

          <button
            onClick={() => go(current + 1)}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-brand-border hover:border-brand-gold/40 hover:text-brand-gold text-brand-text-dim transition-colors"
            aria-label="Next testimonial"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </motion.section>
  );
}
