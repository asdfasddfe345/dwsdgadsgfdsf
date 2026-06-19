const KEY = 'supreme-waffle-checkout-resume';
const TTL_MS = 30 * 60 * 1000;

export interface CheckoutResumeState {
  name: string;
  email: string;
  phone: string;
  orderType: 'delivery' | 'pickup';
  deliveryAddress: string;
  deliveryPincode: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  savedAt: number;
}

function canUse() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function saveCheckoutResume(state: Omit<CheckoutResumeState, 'savedAt'>) {
  if (!canUse()) return;
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
}

export function readCheckoutResume(): Omit<CheckoutResumeState, 'savedAt'> | null {
  if (!canUse()) return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutResumeState>;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > TTL_MS) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return {
      name: parsed.name ?? '',
      email: parsed.email ?? '',
      phone: parsed.phone ?? '',
      orderType: parsed.orderType ?? 'delivery',
      deliveryAddress: parsed.deliveryAddress ?? '',
      deliveryPincode: parsed.deliveryPincode ?? '',
      deliveryLat: parsed.deliveryLat ?? null,
      deliveryLng: parsed.deliveryLng ?? null,
    };
  } catch {
    window.sessionStorage.removeItem(KEY);
    return null;
  }
}

export function clearCheckoutResume() {
  if (!canUse()) return;
  window.sessionStorage.removeItem(KEY);
}
