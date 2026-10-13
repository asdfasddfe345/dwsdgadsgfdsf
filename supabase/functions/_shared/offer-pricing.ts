/*
  Server-side mirror of the offer maths in src/lib/offers.ts.

  The browser works out a discount to show the customer. The server recomputes
  it here from the offer row and the shop's own prices, and checkout refuses the
  order when the two disagree, so a crafted request cannot invent a discount.

  Only the maths lives here. Badges, CTA links and the wording of eligibility
  errors stay in the browser. order-pricing.check.ts runs this file and
  src/lib/offers.ts over the same carts and asserts they agree.
*/

export type OfferDiscountType = "percentage" | "flat" | "free_item" | "free_addons";
export type OfferMode = "coupon" | "automatic";
export type OfferTriggerType = "min_order" | "item_quantity";
export type OfferRewardItemSource = "specific_item" | "qualifying_item";

/** The offer columns the maths needs. Display-only columns are left out on purpose. */
export interface OfferRow {
  id: string;
  title: string | null;
  code: string | null;
  offer_mode: OfferMode | null;
  trigger_type: OfferTriggerType | null;
  discount_type: OfferDiscountType;
  discount_value: number;
  min_order: number;
  required_item_quantity: number | null;
  qualifying_category_id: string | null;
  qualifying_menu_item_id: string | null;
  reward_menu_item_id: string | null;
  reward_item_source: OfferRewardItemSource | null;
  reward_item_quantity: number | null;
  applies_to_delivery: boolean | null;
  applies_to_takeaway: boolean | null;
  applies_to_dine_in: boolean | null;
  first_n_orders: number | null;
}

export interface MenuItemRow {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
}

/** One cart line, already priced from the menu rather than from the request. */
export interface PricedLine {
  menu_item_id: string;
  category_id: string | null;
  quantity: number;
  /** Menu price of one unit. */
  unit_price: number;
  /** Add-ons on one unit, priced from customization_options. */
  add_on_total: number;
}

export interface OfferContext {
  subtotal: number;
  itemCount: number;
  addOnTotal: number;
  lines: PricedLine[];
  menuItemsById: Record<string, MenuItemRow>;
  orderType?: "delivery" | "pickup";
  pickupOption?: "dine_in" | "takeaway";
  /** Left undefined for guests, matching the browser: a first-order offer cannot be checked without an account. */
  userOrderCount?: number;
}

export interface OfferRewardLine {
  menu_item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
}

function normalizeNumber(value: number) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getOfferMode(offer: OfferRow): OfferMode {
  return offer.offer_mode === "automatic" ? "automatic" : "coupon";
}

export function getOfferCode(offer: OfferRow) {
  return typeof offer.code === "string" && offer.code.trim() ? offer.code.trim().toUpperCase() : null;
}

export function getOfferTriggerType(offer: OfferRow): OfferTriggerType {
  return offer.trigger_type === "item_quantity" ? "item_quantity" : "min_order";
}

export function getOfferDiscountType(offer: OfferRow): OfferDiscountType {
  return offer.discount_type === "free_addons"
    ? "free_addons"
    : offer.discount_type === "free_item"
      ? "free_item"
      : offer.discount_type === "flat"
        ? "flat"
        : "percentage";
}

function getRequiredItemQuantity(offer: OfferRow) {
  const quantity = offer.required_item_quantity ?? null;
  return quantity && quantity > 0 ? quantity : null;
}

function getRewardItemQuantity(offer: OfferRow) {
  const quantity = offer.reward_item_quantity ?? null;
  return quantity && quantity > 0 ? quantity : 1;
}

function getOfferRewardItemSource(offer: OfferRow): OfferRewardItemSource {
  return offer.reward_item_source === "qualifying_item" ? "qualifying_item" : "specific_item";
}

function getMatchingLines(offer: OfferRow, context: OfferContext) {
  const qualifyingItemId = normalizeOptionalText(offer.qualifying_menu_item_id);
  if (qualifyingItemId) {
    return context.lines.filter((line) => line.menu_item_id === qualifyingItemId);
  }

  const qualifyingCategoryId = normalizeOptionalText(offer.qualifying_category_id);
  if (qualifyingCategoryId) {
    return context.lines.filter((line) => line.category_id === qualifyingCategoryId);
  }

  return [...context.lines];
}

function getOfferItemCount(offer: OfferRow, context: OfferContext) {
  if (getOfferTriggerType(offer) !== "item_quantity") {
    return context.itemCount;
  }

  if (getOfferRewardItemSource(offer) === "qualifying_item") {
    const quantitiesByMenuItem = new Map<string, number>();
    for (const line of getMatchingLines(offer, context)) {
      quantitiesByMenuItem.set(
        line.menu_item_id,
        (quantitiesByMenuItem.get(line.menu_item_id) || 0) + line.quantity,
      );
    }

    return Array.from(quantitiesByMenuItem.values()).reduce((max, quantity) => Math.max(max, quantity), 0);
  }

  return getMatchingLines(offer, context).reduce((sum, line) => sum + line.quantity, 0);
}

function getOfferEligibleCycles(offer: OfferRow, context: OfferContext) {
  if (getOfferTriggerType(offer) === "item_quantity") {
    const minimumOrder = Math.max(0, normalizeNumber(offer.min_order));
    if (minimumOrder > 0 && context.subtotal < minimumOrder) {
      return 0;
    }

    const requiredQuantity = getRequiredItemQuantity(offer) || 1;
    const eligibleCycles = Math.floor(getOfferItemCount(offer, context) / requiredQuantity);

    // A free-item offer that also has a minimum-order gate gives one reward per
    // order once both conditions are met, not one per cycle.
    if (getOfferDiscountType(offer) === "free_item" && minimumOrder > 0) {
      return eligibleCycles > 0 ? 1 : 0;
    }

    return eligibleCycles;
  }

  const minimumOrder = Math.max(0, normalizeNumber(offer.min_order));
  return context.subtotal >= minimumOrder ? 1 : 0;
}

export function isOfferApplicableToOrderType(offer: OfferRow, context: OfferContext): boolean {
  if (context.orderType === undefined) return true;

  if (context.orderType === "delivery") {
    return offer.applies_to_delivery !== false;
  }

  if (context.pickupOption === "takeaway") {
    return offer.applies_to_takeaway !== false;
  }

  if (context.pickupOption === "dine_in") {
    return offer.applies_to_dine_in !== false;
  }

  return true;
}

/** Why this cart cannot use the offer, or null when it can. The browser owns the customer-facing wording. */
export function getOfferEligibilityError(offer: OfferRow, context: OfferContext): string | null {
  const limit = offer.first_n_orders ?? null;
  if (limit !== null && limit > 0 && context.userOrderCount !== undefined && context.userOrderCount >= limit) {
    return "This offer is only valid on a first order";
  }

  const minimumOrder = Math.max(0, normalizeNumber(offer.min_order));

  if (getOfferTriggerType(offer) === "item_quantity") {
    const requiredQuantity = getRequiredItemQuantity(offer) || 1;
    if (getOfferItemCount(offer, context) < requiredQuantity) {
      return "This order does not have the items the offer needs";
    }

    if (minimumOrder > 0 && context.subtotal < minimumOrder) {
      return "Order is below the offer minimum";
    }

    return null;
  }

  if (context.subtotal < minimumOrder) {
    return "Order is below the offer minimum";
  }

  return null;
}

export function getOfferDiscountAmount(offer: OfferRow, context: OfferContext) {
  if (getOfferEligibilityError(offer, context)) {
    return 0;
  }

  let discountAmount = 0;
  switch (getOfferDiscountType(offer)) {
    case "percentage":
      discountAmount = Math.round(context.subtotal * (normalizeNumber(offer.discount_value) / 100));
      break;
    case "flat":
      discountAmount = normalizeNumber(offer.discount_value);
      break;
    case "free_addons":
      discountAmount = context.addOnTotal;
      break;
    case "free_item":
      // Paid out as a free line instead of money off.
      discountAmount = 0;
      break;
  }

  return Math.min(context.subtotal, Math.max(0, discountAmount));
}

/** The free lines this offer gives this cart, priced from the menu. */
export function getOfferRewardItems(offer: OfferRow, context: OfferContext): OfferRewardLine[] {
  if (getOfferDiscountType(offer) !== "free_item" || getOfferEligibilityError(offer, context)) {
    return [];
  }

  if (getOfferRewardItemSource(offer) === "qualifying_item") {
    if (getOfferTriggerType(offer) !== "item_quantity") {
      return [];
    }

    const requiredQuantity = getRequiredItemQuantity(offer) || 1;
    const rewardQuantity = getRewardItemQuantity(offer);
    const qualifyingByMenuItem = new Map<string, { item: MenuItemRow; quantity: number }>();

    for (const line of getMatchingLines(offer, context)) {
      const rewardMenuItem = context.menuItemsById[line.menu_item_id];
      if (!rewardMenuItem) {
        continue;
      }

      const existingEntry = qualifyingByMenuItem.get(rewardMenuItem.id);
      if (existingEntry) {
        existingEntry.quantity += line.quantity;
        continue;
      }

      qualifyingByMenuItem.set(rewardMenuItem.id, { item: rewardMenuItem, quantity: line.quantity });
    }

    const rewardLines: OfferRewardLine[] = [];
    for (const { item, quantity } of qualifyingByMenuItem.values()) {
      const eligibleCycles = Math.floor(quantity / requiredQuantity);
      if (eligibleCycles <= 0) {
        continue;
      }

      rewardLines.push({
        menu_item_id: item.id,
        item_name: item.name,
        quantity: rewardQuantity * eligibleCycles,
        unit_price: normalizeNumber(item.price),
      });
    }

    return rewardLines;
  }

  const rewardItemId = normalizeOptionalText(offer.reward_menu_item_id);
  if (!rewardItemId) {
    return [];
  }

  const rewardItem = context.menuItemsById[rewardItemId];
  if (!rewardItem) {
    return [];
  }

  const eligibleCycles = getOfferEligibleCycles(offer, context);
  if (eligibleCycles <= 0) {
    return [];
  }

  return [{
    menu_item_id: rewardItem.id,
    item_name: rewardItem.name,
    quantity: getRewardItemQuantity(offer) * eligibleCycles,
    unit_price: normalizeNumber(rewardItem.price),
  }];
}
