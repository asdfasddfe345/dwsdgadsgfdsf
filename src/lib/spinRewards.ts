import type { SpinPrizeKind, SpinReward } from '../types';

interface PricedItem {
  quantity: number;
  unit_price: number;
}

type RewardRule = { kind: SpinPrizeKind; percent: number; max_discount?: number | null };

/** The shop's calendar day (India), which is what the one-spin-per-day limit follows. */
export function todayInIndia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export function isSpinRewardUsable(reward: Pick<SpinReward, 'expires_at' | 'redeemed_order_id'>, now = Date.now()) {
  return !reward.redeemed_order_id && new Date(reward.expires_at).getTime() > now;
}

// Keep in sync with calculateSpinRewardDiscount in supabase/functions/_shared/spin-rewards.ts.
// The server recomputes this at checkout and rejects the order if the two disagree.
export function calculateSpinRewardDiscount(reward: RewardRule, subtotal: number, items: PricedItem[]) {
  const cap = reward.max_discount == null ? Infinity : Number(reward.max_discount);

  if (reward.kind === 'percent') {
    return Math.min(cap, Math.round((subtotal * Number(reward.percent)) / 100));
  }

  const paidItems = items.filter((item) => Number(item.unit_price) > 0 && Number(item.quantity) > 0);
  const unitCount = paidItems.reduce((sum, item) => sum + Number(item.quantity), 0);

  if (unitCount === 0 || (reward.kind === 'bogo' && unitCount < 2)) {
    return 0;
  }

  return Math.min(cap, Math.round(Math.min(...paidItems.map((item) => Number(item.unit_price)))));
}

export function describeSpinReward(reward: RewardRule) {
  // A capped prize has to say so here, or the wheel promises more than checkout gives.
  const cap = reward.max_discount == null ? '' : `, up to ₹${Number(reward.max_discount)} off`;

  if (reward.kind === 'bogo') return `Order 2 or more items and the lowest-priced one is free${cap}.`;
  if (reward.kind === 'free_item') return `Your lowest-priced item is free${cap}.`;
  if (Number(reward.percent) >= 100 && !cap) {
    return 'Your whole order is free. Delivery and takeaway charges still apply.';
  }
  return `${Number(reward.percent)}% off your order${cap}.`;
}
