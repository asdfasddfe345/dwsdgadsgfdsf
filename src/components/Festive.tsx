import type { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion, type Variants } from 'motion/react';
import { fadeUp, springGentle, staggerChild } from '../lib/animations';
import { festival } from '../lib/festival';

// Checkout and order tracking stay calm: no petals drifting over the bill.
const NO_PETALS_ON = ['/cart', '/order-success', '/track'];

// Marigold petals falling over the page. Small, soft ones read as further away, which gives the shower depth.
// Fixed values, so nothing here depends on a random source.
const PETALS = [
  { '--x': '4%', '--size': '9px', '--fall': '11s', '--delay': '0s', '--sway': '26px', '--alpha': 0.9 },
  { '--x': '13%', '--size': '6px', '--fall': '16s', '--delay': '-5s', '--sway': '16px', '--alpha': 0.55, '--blur': '1px' },
  { '--x': '22%', '--size': '11px', '--fall': '9.5s', '--delay': '-2.5s', '--sway': '34px', '--alpha': 0.95 },
  { '--x': '31%', '--size': '7px', '--fall': '14s', '--delay': '-9s', '--sway': '20px', '--alpha': 0.6, '--blur': '1px' },
  { '--x': '40%', '--size': '9px', '--fall': '12s', '--delay': '-6.5s', '--sway': '28px', '--alpha': 0.85 },
  { '--x': '49%', '--size': '6px', '--fall': '17s', '--delay': '-12s', '--sway': '14px', '--alpha': 0.5, '--blur': '1.5px' },
  { '--x': '57%', '--size': '10px', '--fall': '10s', '--delay': '-1.2s', '--sway': '30px', '--alpha': 0.9 },
  { '--x': '65%', '--size': '7px', '--fall': '15s', '--delay': '-7.8s', '--sway': '18px', '--alpha': 0.6, '--blur': '1px' },
  { '--x': '73%', '--size': '12px', '--fall': '9s', '--delay': '-4.1s', '--sway': '36px', '--alpha': 0.95 },
  { '--x': '81%', '--size': '8px', '--fall': '13s', '--delay': '-10.4s', '--sway': '22px', '--alpha': 0.75 },
  { '--x': '89%', '--size': '6px', '--fall': '16.5s', '--delay': '-3.3s', '--sway': '15px', '--alpha': 0.5, '--blur': '1.5px' },
  { '--x': '95%', '--size': '10px', '--fall': '10.5s', '--delay': '-8.6s', '--sway': '28px', '--alpha': 0.9 },
].map((petal) => petal as CSSProperties);

// Small stars of light that twinkle around the lamp.
const SPARKS = [
  { right: '148px', top: '18%', '--delay': '0s' },
  { right: '24px', top: '14%', '--delay': '0.7s' },
  { right: '118px', top: '72%', '--delay': '1.3s' },
  { right: '12px', top: '66%', '--delay': '1.9s' },
  { right: '196px', top: '46%', '--delay': '0.4s' },
  { right: '74px', top: '8%', '--delay': '1.6s' },
].map((spark) => spark as CSSProperties);

const bannerText: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

/** The festival dressing shared by every customer page: falling petals, and a toran hung under the header. Decoration only. */
export function FestiveToran() {
  const { pathname } = useLocation();
  if (!festival) return null;

  return (
    <>
      {!NO_PETALS_ON.some((path) => pathname.startsWith(path)) && (
        <div className="festive-petals" aria-hidden>
          {PETALS.map((style, index) => <span key={index} className="festive-petal" style={style} />)}
        </div>
      )}
      <div className="festive-toran" aria-hidden>
        <div className="festive-toran__layer" />
        <div className="festive-toran__layer festive-toran__layer--flowers" />
        <div className="festive-toran__layer festive-toran__layer--drops" />
      </div>
    </>
  );
}

/** The festival greeting at the top of the homepage. */
export function FestiveBanner() {
  if (!festival) return null;

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="visible" className="px-4 pt-4" aria-label={festival.greeting}>
      <div className="festive-banner">
        <div className="festive-banner__mandala" aria-hidden />
        <div className="festive-banner__mandala festive-banner__mandala--inner" aria-hidden />
        {SPARKS.map((style, index) => <span key={index} className="festive-spark" style={style} aria-hidden />)}
        <motion.div
          className="festive-diya"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...springGentle, delay: 0.3 }}
          aria-hidden
        >
          <span className="festive-diya__flame" />
          <span className="festive-diya__bowl" />
        </motion.div>

        <motion.div variants={bannerText} className="relative max-w-[62%]">
          <motion.p variants={staggerChild} lang="te" className="text-[13px] font-semibold text-brand-gold-soft">
            {festival.greetingTelugu}
          </motion.p>
          <motion.h2 variants={staggerChild} className="text-shimmer mt-0.5 font-display text-[26px] font-black leading-tight sm:text-[34px]">
            {festival.greeting}
          </motion.h2>
          <motion.p variants={staggerChild} className="mt-1.5 text-[13px] leading-snug text-brand-text-muted sm:text-[15px]">
            Celebrate with a warm waffle and a thick shake.
          </motion.p>
          <motion.div variants={staggerChild}>
            <Link to="/menu" className="btn-primary btn-sheen mt-3.5 inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px]">
              Order now <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </motion.section>
  );
}
