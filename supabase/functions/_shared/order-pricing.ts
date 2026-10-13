/*
  Prices a checkout from the shop's own data.

  Everything in the request body is treated as a claim: item prices, add-on
  prices, the subtotal and the discount. This module ignores the claimed money
  and rebuilds it from menu_items, customization_options and offers, so the
  worst a crafted request can do is get itself rejected.

  The caller compares the browser's numbers against what comes back and refuses
  the order on any mismatch, rather than quietly charging an amount other than
  the one the customer was shown.
*/

import type { AdminClient } from "./razorpay.ts";
import {
  getOfferDiscountAmount,
  getOfferEligibilityError,
  getOfferMode,
  getOfferRewardItems,
  isOfferApplicableToOrderType,
  type MenuItemRow,
  type OfferContext,
  type OfferRow,
  type PricedLine,
} from "./offer-pricing.ts";

const OFFER_SELECT =
  "id, title, code, offer_mode, trigger_type, discount_type, discount_value, min_order, " +
  "required_item_quantity, qualifying_category_id, qualifying_menu_item_id, reward_menu_item_id, " +
  "reward_item_source, reward_item_quantity, applies_to_delivery, applies_to_takeaway, " +
  "applies_to_dine_in, first_n_orders";

export interface SelectedCustomizationInput {
  group_name?: unknown;
  option_name?: unknown;
  price?: unknown;
}

export interface CheckoutItemInput {
  menu_item_id?: unknown;
  item_name?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  customizations?: unknown;
  /** Set by the browser on lines it believes an offer is giving away. Always re-checked here. */
  is_reward?: unknown;
}

export interface PricedCustomization {
  group_name: string;
  option_name: string;
  price: number;
}

export interface PricedOrderItem {
  menu_item_id: string;
  item_name: string;
  quantity: number;
  /** From menu_items.price, or 0 on a line an offer gives away. */
  unit_price: number;
  customizations: PricedCustomization[];
  is_reward: boolean;
}

export interface PricedOrder {
  items: PricedOrderItem[];
  /** Paid lines only, add-ons included, exactly like the cart's subtotal. */
  subtotal: number;
  /** What the claimed offers are worth as money off, recomputed here. */
  offerDiscount: number;
}

export type PricedOrderResult = PricedOrder | { error: string; status: number };

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function customizationKey(groupName: string, optionName: string) {
  return `${groupName.toLowerCase()}\u0000${optionName.toLowerCase()}`;
}

function readCustomizations(value: unknown): SelectedCustomizationInput[] {
  return Array.isArray(value) ? (value as SelectedCustomizationInput[]) : [];
}

/**
 * Rebuilds the order from the menu and works out what the claimed offers are
 * really worth. Returns an error when the request references something the shop
 * does not sell, or claims a free line no offer entitles it to.
 */
export async function priceCheckout(
  adminClient: AdminClient,
  input: {
    items: CheckoutItemInput[];
    orderType: "delivery" | "pickup";
    pickupOption: "dine_in" | "takeaway";
    couponOfferId: string;
    automaticOfferId: string;
    userId: string | null;
  },
): Promise<PricedOrderResult> {
  const { items, orderType, pickupOption, couponOfferId, automaticOfferId, userId } = input;

  if (!items.length) {
    return { error: "Cart is empty", status: 400 };
  }

  const normalizedItems = items.map((item) => ({
    menuItemId: asText(item.menu_item_id),
    itemName: asText(item.item_name),
    quantity: Number(item.quantity),
    isReward: item.is_reward === true,
    customizations: readCustomizations(item.customizations),
  }));

  for (const item of normalizedItems) {
    if (!item.menuItemId) {
      return { error: "An item in this order is missing", status: 400 };
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99) {
      return { error: "Invalid item quantity", status: 400 };
    }
  }

  const menuItemIds = Array.from(new Set(normalizedItems.map((item) => item.menuItemId)));

  const { data: menuRows, error: menuError } = await adminClient
    .from("menu_items")
    .select("id, name, price, is_available, category_id")
    .in("id", menuItemIds);

  if (menuError) {
    throw menuError;
  }

  const menuItemsById: Record<string, MenuItemRow> = {};
  const availabilityById = new Map<string, boolean>();
  for (const row of (menuRows || []) as Array<MenuItemRow & { is_available: boolean | null }>) {
    menuItemsById[row.id] = {
      id: row.id,
      name: row.name,
      price: Number(row.price),
      category_id: row.category_id ?? null,
    };
    availabilityById.set(row.id, row.is_available !== false);
  }

  const missingNames = normalizedItems
    .filter((item) => !menuItemsById[item.menuItemId])
    .map((item) => item.itemName || "Item");

  if (missingNames.length > 0) {
    return { error: `${missingNames[0]} is no longer on the menu`, status: 409 };
  }

  const unavailableNames = normalizedItems
    .filter((item) => !availabilityById.get(item.menuItemId))
    .map((item) => menuItemsById[item.menuItemId].name);

  if (unavailableNames.length > 0) {
    return {
      error: unavailableNames.length === 1
        ? `${unavailableNames[0]} is out of stock right now`
        : `Some items are out of stock right now: ${unavailableNames.join(", ")}`,
      status: 409,
    };
  }

  const addOnPrices = await loadCustomizationPrices(adminClient, normalizedItems);

  // Price every line from the menu. A line the browser marked free starts at the
  // real price and only drops to zero once an offer is shown to grant it.
  const pricedItems: PricedOrderItem[] = [];
  for (const item of normalizedItems) {
    const menuItem = menuItemsById[item.menuItemId];
    const customizations: PricedCustomization[] = [];

    for (const customization of item.customizations) {
      const groupName = asText(customization.group_name);
      const optionName = asText(customization.option_name);

      if (!groupName || !optionName) {
        return { error: "An item option in this order is missing", status: 400 };
      }

      const price = addOnPrices.get(customizationKey(groupName, optionName));
      if (price === undefined) {
        return { error: `${optionName} is no longer available for ${menuItem.name}`, status: 409 };
      }

      customizations.push({ group_name: groupName, option_name: optionName, price });
    }

    pricedItems.push({
      menu_item_id: menuItem.id,
      item_name: item.isReward ? `${menuItem.name} (Free)` : menuItem.name,
      quantity: item.quantity,
      unit_price: menuItem.price,
      customizations,
      is_reward: item.isReward,
    });
  }

  const paidItems = pricedItems.filter((item) => !item.is_reward);

  const lines: PricedLine[] = paidItems.map((item) => ({
    menu_item_id: item.menu_item_id,
    category_id: menuItemsById[item.menu_item_id].category_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    add_on_total: item.customizations.reduce((sum, customization) => sum + customization.price, 0),
  }));

  const subtotal = roundCurrency(
    lines.reduce((sum, line) => sum + (line.unit_price + line.add_on_total) * line.quantity, 0),
  );
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const addOnTotal = roundCurrency(
    lines.reduce((sum, line) => sum + line.add_on_total * line.quantity, 0),
  );

  const claimedOfferIds = [couponOfferId, automaticOfferId].filter((offerId) => !!offerId);
  const offers = claimedOfferIds.length > 0 ? await loadLiveOffers(adminClient, claimedOfferIds) : [];

  const context: OfferContext = {
    subtotal,
    itemCount,
    addOnTotal,
    lines,
    menuItemsById,
    orderType,
    pickupOption,
    userOrderCount: await resolveUserOrderCount(adminClient, userId, offers),
  };

  let offerDiscount = 0;
  const entitledRewards = new Map<string, number>();

  for (
    const [offerId, expectedMode] of [
      [couponOfferId, "coupon"] as const,
      [automaticOfferId, "automatic"] as const,
    ]
  ) {
    if (!offerId) continue;

    const offer = offers.find((row) => row.id === offerId);
    if (!offer) {
      return { error: "This offer is no longer available", status: 409 };
    }

    if (getOfferMode(offer) !== expectedMode) {
      return { error: "This offer cannot be applied here", status: 400 };
    }

    if (!isOfferApplicableToOrderType(offer, context)) {
      return { error: "This offer is not available for this order type", status: 409 };
    }

    const eligibilityError = getOfferEligibilityError(offer, context);
    if (eligibilityError) {
      return { error: eligibilityError, status: 409 };
    }

    offerDiscount += getOfferDiscountAmount(offer, context);

    for (const reward of getOfferRewardItems(offer, context)) {
      entitledRewards.set(
        reward.menu_item_id,
        (entitledRewards.get(reward.menu_item_id) || 0) + reward.quantity,
      );
    }
  }

  // A free line is only as free as an offer says. Anything past the entitlement
  // is how a crafted cart would walk off with stock.
  const claimedRewards = new Map<string, number>();
  for (const item of pricedItems) {
    if (!item.is_reward) continue;
    claimedRewards.set(item.menu_item_id, (claimedRewards.get(item.menu_item_id) || 0) + item.quantity);
  }

  for (const [menuItemId, claimedQuantity] of claimedRewards) {
    if (claimedQuantity > (entitledRewards.get(menuItemId) || 0)) {
      return { error: "This order claims a free item no offer gives it", status: 400 };
    }
  }

  for (const item of pricedItems) {
    if (item.is_reward) {
      item.unit_price = 0;
      item.customizations = [];
    }
  }

  return {
    items: pricedItems,
    subtotal,
    offerDiscount: roundCurrency(Math.min(subtotal, Math.max(0, offerDiscount))),
  };
}

/** Add-on prices by group and option name, which is all a cart line carries. */
async function loadCustomizationPrices(
  adminClient: AdminClient,
  items: Array<{ customizations: SelectedCustomizationInput[] }>,
) {
  const prices = new Map<string, number>();

  if (!items.some((item) => item.customizations.length > 0)) {
    return prices;
  }

  // ponytail: reads the whole option list, which is small for one shop's menu.
  // Filter by the referenced names if it ever grows.
  const [groupsResult, optionsResult] = await Promise.all([
    adminClient.from("customization_groups").select("id, name"),
    adminClient.from("customization_options").select("group_id, name, price, is_available"),
  ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }

  if (optionsResult.error) {
    throw optionsResult.error;
  }

  const groupNamesById = new Map(
    ((groupsResult.data || []) as Array<{ id: string; name: string }>).map((group) => [group.id, group.name]),
  );

  for (
    const option of (optionsResult.data || []) as Array<
      { group_id: string; name: string; price: number; is_available: boolean | null }
    >
  ) {
    if (option.is_available === false) {
      continue;
    }

    const groupName = groupNamesById.get(option.group_id);
    if (!groupName) {
      continue;
    }

    prices.set(customizationKey(groupName, option.name), Number(option.price) || 0);
  }

  return prices;
}

/** Only offers that are active and inside their date window count. */
async function loadLiveOffers(adminClient: AdminClient, offerIds: string[]) {
  const now = new Date().toISOString();

  const { data, error } = await adminClient
    .from("offers")
    .select(OFFER_SELECT)
    .in("id", offerIds)
    .eq("is_active", true)
    .lte("valid_from", now)
    .gte("valid_until", now);

  if (error) {
    throw error;
  }

  return (data || []) as unknown as OfferRow[];
}

/** Counted the way the cart counts it, so first-order offers agree on both sides. */
async function resolveUserOrderCount(
  adminClient: AdminClient,
  userId: string | null,
  offers: OfferRow[],
) {
  if (!userId || !offers.some((offer) => (offer.first_n_orders ?? 0) > 0)) {
    return undefined;
  }

  const { count, error } = await adminClient
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("status", "in", '("cancelled","expired")');

  if (error) {
    throw error;
  }

  return count ?? 0;
}
