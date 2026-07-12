import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, type Variants } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { normalizeImageUrl, setImageFallback } from '../lib/images';
import type { Category } from '../types';

interface CategoryCarouselProps {
  categories: Category[];
}

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.88 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.48, ease: [0.34, 1.56, 0.64, 1] },
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  waffles:  'from-amber-700/40 to-amber-900/20',
  shakes:   'from-purple-700/40 to-purple-900/20',
  burgers:  'from-red-700/40 to-red-900/20',
  pizza:    'from-orange-700/40 to-orange-900/20',
  momos:    'from-teal-700/40 to-teal-900/20',
  fries:    'from-yellow-600/40 to-yellow-900/20',
  desserts: 'from-pink-700/40 to-pink-900/20',
};

function getCategoryGradient(slug: string): string {
  const key = Object.keys(CATEGORY_COLORS).find((k) => slug.toLowerCase().includes(k));
  return key ? CATEGORY_COLORS[key] : 'from-brand-choc/40 to-brand-choc/10';
}

export default function CategoryCarousel({ categories }: CategoryCarouselProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  if (categories.length === 0) return null;

  return (
    <section ref={ref} className="pt-6 pb-2">
      <div className="flex items-center justify-between px-4 mb-4">
        <div>
          <p className="section-label">Explore</p>
          <h2 className="section-title">Shop by Category</h2>
        </div>
        <Link
          to="/menu"
          className="flex items-center gap-1 text-[12px] font-bold text-brand-gold hover:text-brand-gold-soft transition-colors"
        >
          All <ChevronRight size={14} />
        </Link>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2"
      >
        {categories.map((cat) => {
          const gradient = getCategoryGradient(cat.slug);
          return (
            <motion.div key={cat.id} variants={itemVariants} className="flex-shrink-0">
              <Link
                to={`/menu?category=${cat.slug}`}
                className="group flex flex-col items-center gap-2"
                style={{ width: '72px' }}
              >
                <div
                  className={`relative w-[64px] h-[64px] rounded-2xl overflow-hidden border border-brand-border bg-gradient-to-br ${gradient} group-hover:border-brand-gold/40 transition-all duration-300 group-hover:scale-105 group-hover:shadow-glow-gold`}
                  style={{
                    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                  }}
                >
                  <img
                    src={normalizeImageUrl(cat.image_url)}
                    alt={cat.name}
                    loading="lazy"
                    decoding="async"
                    width={64}
                    height={64}
                    onError={setImageFallback}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <span
                  className="text-[10px] font-semibold text-brand-text-muted text-center leading-tight group-hover:text-brand-gold transition-colors duration-200"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    width: '72px',
                  }}
                >
                  {cat.name}
                </span>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
