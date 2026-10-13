import type { AdminClient } from "./razorpay.ts";

export type SpinPrizeKind = "percent" | "bogo" | "free_item";

export interface SpinRewardRecord {
  id: string;
  user_id: string;
  kind: SpinPrizeKind;
  percent: number;
  /** Most this prize can take off an order, in rupees. null means no cap. */
  max_discount: number | null;
  expires_at: string;
  redeemed_order_id: string | null;
}

interface PricedItem {
  quantity: number;
  unit_price: number;
}

type SpinRewardCheck = { discount: number } | { error: string; status: number };

const SPIN_REWARD_SELECT =
  "id, user_id, kind, percent, max_discount, expires_at, redeemed_order_id";

function cryptoRoll() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/** Weighted pick. `roll` is in [0, 1) and defaults to a cryptographic one, so a spin cannot be predicted from earlier spins. */
export function pickSpinPrize<T extends { weight: number }>(prizes: T[], roll = cryptoRoll()) {
  const totalWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0);
  let remaining = roll * totalWeight;

  for (const prize of prizes) {
    remaining -= prize.weight;
    if (remaining < 0) return prize;
  }

  return prizes[prizes.length - 1];
}

/**
 * Prizes that can still be won. A prize with a `win_limit` drops out of the
 * draw once that many rewards have been handed out, for good.
 */
export function availableSpinPrizes<T extends { id: string; win_limit?: number | null }>(
  prizes: T[],
  winsByPrizeId: Record<string, number>,
) {
  return prizes.filter((prize) => (
    prize.win_limit == null || (winsByPrizeId[prize.id] ?? 0) < prize.win_limit
  ));
}

// Keep in sync with calculateSpinRewardDiscount in src/lib/spinRewards.ts. spin-rewards.check.ts compares the two.
export function calculateSpinRewardDiscount(
  reward: Pick<SpinRewardRecord, "kind" | "percent" | "max_discount">,
  subtotal: number,
  items: PricedItem[],
) {
  const cap = reward.max_discount == null ? Infinity : Number(reward.max_discount);

  if (reward.kind === "percent") {
    return Math.min(cap, Math.round((subtotal * Number(reward.percent)) / 100));
  }

  const paidItems = items.filter((item) => Number(item.unit_price) > 0 && Number(item.quantity) > 0);
  const unitCount = paidItems.reduce((sum, item) => sum + Number(item.quantity), 0);

  if (unitCount === 0 || (reward.kind === "bogo" && unitCount < 2)) {
    return 0;
  }

  return Math.min(cap, Math.round(Math.min(...paidItems.map((item) => Number(item.unit_price)))));
}

/** Confirms the customer owns an unused, unexpired prize and that the claimed discount is exactly what that prize gives. */
export async function verifySpinRewardForOrder(
  adminClient: AdminClient,
  input: {
    rewardId: string;
    claimedDiscount: number;
    userId: string | null;
    subtotal: number;
    items: PricedItem[];
  },
): Promise<SpinRewardCheck> {
  const { rewardId, claimedDiscount, userId, subtotal, items } = input;

  if (!Number.isFinite(claimedDiscount) || claimedDiscount < 0) {
    return { error: "Invalid spin prize discount", status: 400 };
  }

  if (!rewardId) {
    return claimedDiscount > 0
      ? { error: "A spin prize is required for this discount", status: 400 }
      : { discount: 0 };
  }

  if (!userId) {
    return { error: "Sign in to use your spin prize", status: 401 };
  }

  const { data, error } = await adminClient
    .from("spin_rewards")
    .select(SPIN_REWARD_SELECT)
    .eq("id", rewardId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const reward = data as SpinRewardRecord | null;

  if (!reward) {
    return { error: "Spin prize not found", status: 404 };
  }

  if (reward.redeemed_order_id) {
    return { error: "This spin prize has already been used", status: 409 };
  }

  if (new Date(reward.expires_at).getTime() <= Date.now()) {
    return { error: "This spin prize has expired", status: 409 };
  }

  const discount = calculateSpinRewardDiscount(reward, subtotal, items);

  if (claimedDiscount !== discount) {
    return { error: "Spin prize discount mismatch", status: 400 };
  }

  return { discount };
}

/** Marks the prize as used by this order. Returns false when another order claimed it first. */
export async function reserveSpinReward(
  adminClient: AdminClient,
  rewardId: string,
  userId: string,
  orderId: string,
) {
  const { data, error } = await adminClient
    .from("spin_rewards")
    .update({
      redeemed_order_id: orderId,
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", rewardId)
    .eq("user_id", userId)
    .is("redeemed_order_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
}
