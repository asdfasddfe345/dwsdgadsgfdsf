import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useToast } from './Toast';
import { modalOverlay, modalSheet, springGentle, springSnappy, staggerChild } from '../lib/animations';
import { festival } from '../lib/festival';
import { gsap } from '../lib/gsap';
import { describeSpinReward, isSpinRewardUsable, todayInIndia } from '../lib/spinRewards';
import { fetchSpinPrizes, fetchSpinRewards, spinTheWheel } from '../lib/spinWheel';
import type { SpinPrize, SpinReward } from '../types';

const HIDDEN_ON = ['/cart', '/order-success', '/track'];
const SLICE_RADIUS = 88;
const PEG_RADIUS = 94;
const WHIRL_SPEED = 600; // degrees per second at full speed
const IDLE_SECONDS_PER_TURN = 80;
const SPIN_BUTTON_HEIGHT = 52;
const AUTO_OPEN_DELAY_MS = 1200;
const AUTO_OPEN_KEY = 'supreme-waffle-spin-auto-opened';
const RESUME_KEY = 'supreme-waffle-spin-resume';

// Sparks thrown off the rim when a prize lands. Golden-angle steps spread them evenly without a random source.
const SPARKS = Array.from({ length: 24 }, (_, index) => ({
  '--angle': `${(index * 137.5) % 360}deg`,
  '--reach': 0.58 + (index % 5) * 0.045,
  '--size': `${3 + (index % 3) * 1.5}px`,
  '--delay': `${(index % 6) * 0.04}s`,
}) as CSSProperties);

// The prize grows out of the space the spin button held, then its lines arrive one after another.
const prizeReveal: Variants = {
  hidden: { height: SPIN_BUTTON_HEIGHT, opacity: 0 },
  visible: { height: 'auto', opacity: 1, transition: { ...springGentle, staggerChildren: 0.09, delayChildren: 0.12 } },
};

const prizePop: Variants = {
  hidden: { opacity: 0, scale: 0.7, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 16 } },
};

// Browser storage can be blocked (private mode, strict settings). `undefined` means "blocked",
// and then the wheel never opens by itself, which beats opening on every visit.
function readStored(kind: 'local' | 'session', key: string) {
  try {
    return (kind === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return undefined;
  }
}

function writeStored(kind: 'local' | 'session', key: string, value: string | null) {
  try {
    const store = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Blocked storage: see readStored.
  }
}

function slicePath(index: number, count: number) {
  const step = (2 * Math.PI) / count;
  const point = (angle: number) => `${(SLICE_RADIUS * Math.sin(angle)).toFixed(2)} ${(-SLICE_RADIUS * Math.cos(angle)).toFixed(2)}`;
  return `M0 0L${point(index * step)}A${SLICE_RADIUS} ${SLICE_RADIUS} 0 0 1 ${point((index + 1) * step)}Z`;
}

/** Wheel rotation in degrees that puts the middle of a slice under the pointer at the top. */
function restingRotation(index: number, count: number) {
  return 360 - (index + 0.5) * (360 / count);
}

/** The two lines drawn on a slice: "50% OFF" gives "50%" over "OFF", "BUY 1 GET 1" gives "BUY 1" over "GET 1". */
function labelLines(label: string) {
  const words = label.trim().split(/\s+/);
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

export default function SpinWheel() {
  const { user, loading: authLoading } = useAuth();
  const { itemCount } = useCart();
  const { settings, loading: settingsLoading } = useSiteSettings();
  const { showToast } = useToast();
  const location = useLocation();
  const [prizes, setPrizes] = useState<SpinPrize[]>([]);
  const [rewards, setRewards] = useState<SpinReward[]>([]);
  const [rewardsUserId, setRewardsUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const discRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Animation | null>(null);
  const pegRef = useRef<number | null>(null);
  const pegCount = prizes.length;

  useEffect(() => {
    void fetchSpinPrizes().then(setPrizes);
  }, []);

  useEffect(() => {
    if (!user) {
      setRewards([]);
      setRewardsUserId(null);
      return;
    }

    let active = true;
    void fetchSpinRewards(user.id).then((list) => {
      if (!active) return;
      setRewards(list);
      setRewardsUserId(user.id);
    });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => () => {
    tweenRef.current?.kill();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !spinning) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, spinning]);

  const todaysReward = rewards[0]?.spin_day === todayInIndia() ? rewards[0] : null;
  const todaysIndex = todaysReward ? prizes.findIndex((prize) => prize.id === todaysReward.prize_id) : -1;
  const spinsLeft = todaysReward ? 0 : 1;
  // Until a signed-in customer's prizes have loaded we cannot tell whether today's spin is still unused.
  const rewardsReady = !user || rewardsUserId === user.id;
  const wheelVisible = prizes.length >= 2 && !HIDDEN_ON.some((path) => location.pathname.startsWith(path));
  const siteOpen = !settings || settings.site_is_open;

  // Once a day, a visitor who still has a spin sees the wheel open by itself on the homepage.
  useEffect(() => {
    if (location.pathname !== '/' || !wheelVisible || spinsLeft === 0) return;
    if (authLoading || !rewardsReady || settingsLoading || !siteOpen) return;

    const lastAutoOpen = readStored('local', AUTO_OPEN_KEY);
    if (lastAutoOpen === undefined || lastAutoOpen === todayInIndia()) return;

    const timer = window.setTimeout(() => {
      writeStored('local', AUTO_OPEN_KEY, todayInIndia());
      setOpen(true);
    }, AUTO_OPEN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [location.pathname, wheelVisible, spinsLeft, authLoading, rewardsReady, settingsLoading, siteOpen]);

  // "Sign in to spin" sends the visitor to the sign-in page. Bring the wheel back when they return signed in.
  useEffect(() => {
    if (!user || !rewardsReady || !wheelVisible) return;

    if (readStored('session', RESUME_KEY)) {
      writeStored('session', RESUME_KEY, null);
      setOpen(true);
    }
  }, [user, rewardsReady, wheelVisible]);

  // The pointer is a sprung flap: each peg that passes knocks it aside, then it snaps back.
  const tick = useCallback(() => {
    const disc = discRef.current;
    const pointer = pointerRef.current;
    if (!disc || !pointer) return;

    const peg = Math.floor(Number(gsap.getProperty(disc, 'rotation')) / (360 / pegCount));
    const last = pegRef.current;
    pegRef.current = peg;
    if (last === null || last === peg) return;

    gsap.to(pointer, {
      keyframes: [
        { rotation: peg > last ? -26 : 26, duration: 0.05, ease: 'power2.out' },
        { rotation: 0, duration: 0.55, ease: 'elastic.out(1, 0.35)' },
      ],
      overwrite: true,
    });
  }, [pegCount]);

  // On opening, a wheel that already has today's prize rests on it. Otherwise it swings in and keeps drifting until it is spun.
  useLayoutEffect(() => {
    const disc = discRef.current;
    if (!open || spinning || !disc) return;

    pegRef.current = null;
    if (todaysIndex >= 0) {
      gsap.set(disc, { rotation: restingRotation(todaysIndex, pegCount) });
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const idle = gsap
      .timeline({ onUpdate: tick })
      .from(disc, { rotation: '-=120', duration: 1.6, ease: 'power3.out' })
      .to(disc, { rotation: '+=360', duration: IDLE_SECONDS_PER_TURN, ease: 'none', repeat: -1 });

    return () => {
      idle.kill();
    };
  }, [open, spinning, todaysIndex, pegCount, tick]);

  async function handleSpin() {
    const disc = discRef.current;
    if (!disc || spinning) return;

    setSpinning(true);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Pull back, throw the wheel, then hold full speed until the server has picked the prize.
    // The throw ends at exactly full speed, so the hand-over to the steady whirl has no jolt.
    const upToSpeed = reduceMotion
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          tweenRef.current = gsap
            .timeline({ onUpdate: tick })
            .to(disc, { rotation: '-=18', duration: 0.32, ease: 'power2.out' })
            .to(disc, { rotation: '+=198', duration: (2 * 198) / WHIRL_SPEED, ease: 'power1.in' })
            .call(resolve)
            .to(disc, { rotation: '+=360', duration: 360 / WHIRL_SPEED, ease: 'none', repeat: -1 });
        });

    try {
      const [reward] = await Promise.all([spinTheWheel(), upToSpeed]);

      let wheelPrizes = prizes;
      if (!wheelPrizes.some((prize) => prize.id === reward.prize_id)) {
        wheelPrizes = await fetchSpinPrizes();
        setPrizes(wheelPrizes);
      }

      const index = wheelPrizes.findIndex((prize) => prize.id === reward.prize_id);
      tweenRef.current?.kill();

      if (index >= 0) {
        const current = Number(gsap.getProperty(disc, 'rotation'));
        const earliest = current + 720;
        const target = earliest + (((restingRotation(index, wheelPrizes.length) - earliest) % 360) + 360) % 360;

        if (reduceMotion) {
          gsap.set(disc, { rotation: target });
        } else {
          // A cubic ease-out starts at three times its average speed, so this length lets the wheel slow down from full speed.
          tweenRef.current = gsap.to(disc, {
            rotation: target,
            duration: (3 * (target - current)) / WHIRL_SPEED,
            ease: 'power2.out',
            onUpdate: tick,
          });
          await tweenRef.current;
        }
      }

      setRewards((current) => [reward, ...current.filter((entry) => entry.id !== reward.id)]);
      setCelebrating(true);
    } catch (error) {
      tweenRef.current?.kill();
      showToast(error instanceof Error ? error.message : 'Could not spin the wheel. Please try again.', 'error');
    } finally {
      setSpinning(false);
    }
  }

  if (!wheelVisible) {
    return null;
  }

  const close = () => {
    if (!spinning) setOpen(false);
  };
  const sliceDegrees = 360 / prizes.length;
  const prizeUsable = todaysReward ? isSpinRewardUsable(todaysReward) : false;
  const expiresLabel = todaysReward
    ? new Date(todaysReward.expires_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <>
      <motion.button
        type="button"
        className={`spin-launcher ${spinsLeft ? 'spin-launcher--ready' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`Spin the wheel. ${spinsLeft ? '1 spin left today' : 'No spins left today'}.`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        transition={springSnappy}
      >
        {spinsLeft > 0 && (
          <span className="spin-launcher__label" aria-hidden>{festival ? `${festival.name} spin` : 'Spin & win'}</span>
        )}
        <span className="spin-launcher__coin">
          <span className="spin-launcher__wheel" aria-hidden />
          <span
            className={`spin-launcher__badge ${spinsLeft ? 'bg-brand-gold-soft text-brand-bg' : 'bg-brand-surface-strong text-brand-text-dim'}`}
            aria-hidden
          >
            {spinsLeft}
          </span>
        </span>
      </motion.button>

      <AnimatePresence onExitComplete={() => setCelebrating(false)}>
        {open && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
            <motion.div
              variants={modalOverlay}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute inset-0 bg-brand-overlay backdrop-blur-sm"
              onClick={close}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="spin-wheel-title"
              variants={modalSheet}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="spin-sheet relative max-h-[94vh] w-full overflow-y-auto overflow-x-hidden rounded-t-3xl border border-brand-border px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-6 text-center sm:max-w-md sm:rounded-3xl sm:pb-6"
            >
              <button
                type="button"
                onClick={close}
                disabled={spinning}
                aria-label="Close"
                className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/5 p-2 text-brand-text-dim transition-colors hover:text-white disabled:opacity-40"
              >
                <X size={18} strokeWidth={2.5} />
              </button>

              <p className="section-label">{festival ? `${festival.name} lucky spin` : 'Daily reward'}</p>
              <h2 id="spin-wheel-title" className="text-rise mt-1 font-display text-[28px] font-black text-white">Spin and win</h2>
              <p className="mt-1 text-[13px] text-brand-text-muted">One free spin every day.</p>

              <motion.div
                className="my-8"
                initial={{ scale: 0.82, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...springGentle, delay: 0.1 }}
              >
                <div
                  className={`spin-wheel ${spinning ? 'spin-wheel--spinning' : ''} ${todaysIndex >= 0 ? 'spin-wheel--won' : ''}`}
                  style={{ '--slice': `${sliceDegrees}deg` } as CSSProperties}
                >
                  <div className="spin-wheel__rim" />
                  <div ref={discRef} className="spin-wheel__disc">
                    <svg
                      viewBox="-100 -100 200 200"
                      role="img"
                      aria-label={`Prize wheel: ${prizes.map((prize) => prize.label).join(', ')}`}
                    >
                      <defs>
                        <radialGradient id="spin-slice-0" gradientUnits="userSpaceOnUse" cx="0" cy="0" r={SLICE_RADIUS}>
                          <stop offset="0.25" stopColor="#0F0703" />
                          <stop offset="0.8" stopColor="#27140A" />
                          <stop offset="1" stopColor="#1A0D06" />
                        </radialGradient>
                        <radialGradient id="spin-slice-1" gradientUnits="userSpaceOnUse" cx="0" cy="0" r={SLICE_RADIUS}>
                          <stop offset="0.25" stopColor="#1E1007" />
                          <stop offset="0.8" stopColor="#4A2A12" />
                          <stop offset="1" stopColor="#331B0B" />
                        </radialGradient>
                        <linearGradient id="spin-foil" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#FFF6D8" />
                          <stop offset="0.5" stopColor="#E8BE50" />
                          <stop offset="1" stopColor="#B88629" />
                        </linearGradient>
                        <radialGradient id="spin-peg">
                          <stop offset="0" stopColor="#FFF6D8" />
                          <stop offset="0.55" stopColor="#D4A017" />
                          <stop offset="1" stopColor="#6E4E0E" />
                        </radialGradient>
                      </defs>

                      <circle r="100" fill="#0B0401" />
                      {/* Sixty fine marks round the edge, like the minute track of a watch. */}
                      <circle
                        r={PEG_RADIUS}
                        fill="none"
                        stroke="#E8BE50"
                        strokeOpacity="0.4"
                        strokeWidth="2.4"
                        pathLength={360}
                        strokeDasharray="0.3 5.7"
                        strokeDashoffset="0.15"
                      />
                      {prizes.map((prize, index) => {
                        const [head, tail] = labelLines(prize.label);
                        return (
                          <g key={prize.id}>
                            <path
                              d={slicePath(index, prizes.length)}
                              fill={`url(#spin-slice-${index % 2})`}
                              stroke="#E8BE50"
                              strokeOpacity="0.5"
                              strokeWidth="0.5"
                            />
                            <g transform={`rotate(${(index + 0.5) * sliceDegrees})`}>
                              <text
                                y="-64"
                                textAnchor="middle"
                                fontSize={Math.min(15, 46 / head.length)}
                                fontWeight="800"
                                fill="url(#spin-foil)"
                                className="font-display lining-nums"
                              >
                                {head}
                              </text>
                              <text y="-56.5" textAnchor="middle" fontSize="5.4" fontWeight="700" letterSpacing="1.3" fill="#C4B59A">
                                {tail}
                              </text>
                            </g>
                            <circle r="2.3" transform={`rotate(${index * sliceDegrees}) translate(0 ${-PEG_RADIUS})`} fill="url(#spin-peg)" />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div className="spin-wheel__gloss" />
                  <div className="spin-wheel__spot" />
                  <div className="spin-wheel__hub" />
                  <div ref={pointerRef} className="spin-wheel__pointer" />
                  {celebrating && (
                    <div className="spin-sparks" aria-hidden>
                      {SPARKS.map((style, index) => <span key={index} style={style} />)}
                    </div>
                  )}
                </div>
              </motion.div>

              <motion.div
                aria-live="polite"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 }}
              >
                {todaysReward ? (
                  <motion.div
                    variants={prizeReveal}
                    initial={celebrating ? 'hidden' : false}
                    animate="visible"
                    className="-mx-5 -mb-7 overflow-hidden px-5 pb-10"
                  >
                    <motion.p variants={staggerChild} className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-text-dim">
                      {prizeUsable ? 'You won' : "Today's prize"}
                    </motion.p>
                    <motion.p variants={prizePop} className="text-shimmer mt-1 font-display text-[40px] font-black leading-tight lining-nums">
                      {todaysReward.label}
                    </motion.p>
                    {prizeUsable ? (
                      <>
                        <motion.p variants={staggerChild} className="mt-2 text-[13px] text-brand-text-muted">
                          {describeSpinReward(todaysReward)}
                        </motion.p>
                        <motion.p variants={staggerChild} className="mt-1 text-[12px] text-brand-text-dim">
                          Use it at checkout before {expiresLabel}.
                        </motion.p>
                        <motion.div variants={staggerChild}>
                          <Link
                            to={itemCount > 0 ? '/cart' : '/menu'}
                            onClick={() => setOpen(false)}
                            className="btn-primary btn-sheen mt-4 inline-flex w-full items-center justify-center"
                          >
                            {itemCount > 0 ? 'Go to cart' : 'Order now'}
                          </Link>
                        </motion.div>
                      </>
                    ) : (
                      <motion.p variants={staggerChild} className="mt-2 text-[13px] text-brand-text-muted">
                        {todaysReward.redeemed_order_id ? "You've used today's prize." : "Today's prize has expired."}{' '}
                        Come back tomorrow for another spin.
                      </motion.p>
                    )}
                  </motion.div>
                ) : user ? (
                  <button type="button" onClick={handleSpin} disabled={spinning} className="btn-primary btn-sheen w-full">
                    {spinning ? 'Spinning…' : 'Spin the wheel'}
                  </button>
                ) : (
                  <>
                    <p className="text-[13px] text-brand-text-muted">Sign in to take today's spin.</p>
                    <Link
                      to="/auth"
                      state={{ from: location.pathname }}
                      onClick={() => {
                        writeStored('session', RESUME_KEY, '1');
                        setOpen(false);
                      }}
                      className="btn-primary btn-sheen mt-3 inline-flex w-full items-center justify-center"
                    >
                      Sign in to spin
                    </Link>
                  </>
                )}
              </motion.div>

              <p className="mt-4 text-[11px] text-brand-text-dim">
                Chances differ for each prize. One prize per order, valid for 24 hours.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
