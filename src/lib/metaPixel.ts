/**
 * Meta (Facebook) Pixel conversion tracking helpers.
 *
 * Pixel ID is read from the VITE_META_PIXEL_ID env var (Vite uses the VITE_
 * prefix for client-exposed env vars — the NEXT_PUBLIC_ prefix does not work
 * here). When unset, every call below is a safe no-op so the app keeps working
 * in development without a Pixel configured.
 */

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: unknown;
  }
}

type FbqArgs = unknown;

// Meta's standard fbq is callable as fbq('init', id), fbq('track', event, data),
// and also carries fbq.callMethod / fbq.queue. We model only what we use.
interface FbqCallMethod {
  (method: string, ...args: FbqArgs[]): void;
  callMethod?: FbqCallMethod;
  queue?: unknown[];
}

type FbqFunction = FbqCallMethod & {
  (method: string, ...args: FbqArgs[]): void;
};

const PURCHASE_FIRED_KEY = '__metaPixelPurchaseFired__';

function getPixelId(): string | undefined {
  const raw = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
  const value = raw?.trim();
  return value && value.length > 0 ? value : undefined;
}

function getFbq(): FbqFunction | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.fbq;
}

let initialized = false;

/** Initialise the Meta Pixel once. Safe to call multiple times. */
export function initMetaPixel(): void {
  if (initialized) return;
  const pixelId = getPixelId();
  if (!pixelId) return;

  const fbq = getFbq();
  if (!fbq) return;

  try {
    fbq('init', pixelId);
    initialized = true;
  } catch {
    // Swallow — never let tracking break the app.
  }
}

export function isMetaPixelActive(): boolean {
  return Boolean(getPixelId()) && Boolean(getFbq());
}

/**
 * Track a standard Meta Pixel event. Silently no-ops when fbq is missing or the
 * Pixel ID is not configured, so production stays safe.
 */
export function trackEvent(event: string, params?: Record<string, unknown>): void {
  const fbq = getFbq();
  if (!fbq) return;

  try {
    if (params) {
      fbq('track', event, params);
    } else {
      fbq('track', event);
    }
  } catch {
    // Swallow — never let tracking break the app.
  }
}

export function trackPageView(): void {
  trackEvent('PageView');
}

export interface AddToCartParams {
  content_ids: string[];
  content_name?: string;
  content_type: string;
  value: number;
  currency: string;
  [key: string]: unknown;
}

export function trackAddToCart(params: AddToCartParams): void {
  trackEvent('AddToCart', params);
}

export interface InitiateCheckoutParams {
  content_ids: string[];
  num_items: number;
  value: number;
  currency: string;
  [key: string]: unknown;
}

export function trackInitiateCheckout(params: InitiateCheckoutParams): void {
  trackEvent('InitiateCheckout', params);
}

export interface PurchaseParams {
  content_ids: string[];
  content_type: string;
  num_items: number;
  value: number;
  currency: string;
  order_id: string;
  [key: string]: unknown;
}

/**
 * Fire the Purchase event exactly once per order_id, even across page refreshes,
 * payment redirects and repeated success callbacks. Persists the set of already
 * fired order IDs in sessionStorage so a refresh of the success page cannot
 * duplicate the event.
 */
export function trackPurchase(params: PurchaseParams): void {
  const { order_id } = params;
  if (!order_id) return;

  try {
    const firedRaw = sessionStorage.getItem(PURCHASE_FIRED_KEY);
    const fired: string[] = firedRaw ? (JSON.parse(firedRaw) as string[]) : [];
    if (fired.includes(order_id)) return;
    fired.push(order_id);
    sessionStorage.setItem(PURCHASE_FIRED_KEY, JSON.stringify(fired));
  } catch {
    // If sessionStorage is unavailable, fall back to an in-memory guard.
    if (memoryFired.has(order_id)) return;
    memoryFired.add(order_id);
  }

  trackEvent('Purchase', params);
}

const memoryFired = new Set<string>();

/** Reset the Purchase dedup guard — intended only for tests. */
export function __resetPurchaseDedup(): void {
  try {
    sessionStorage.removeItem(PURCHASE_FIRED_KEY);
  } catch {
    // ignore
  }
  memoryFired.clear();
}
