// Run: node --experimental-strip-types supabase/functions/_shared/order-pricing.check.ts
//
// The offer maths exists twice: once in the browser to show the customer a
// price, once on the server to decide what to charge. Checkout rejects an order
// when the two disagree, so drift between them looks like a broken coupon to
// every customer using it. This runs both over the same carts.
import assert from "node:assert/strict";
import {
  getOfferDiscountAmount,
  getOfferRewardItems,
  type OfferContext,
  type OfferRow,
  type PricedLine,
} from "./offer-pricing.ts";
import {
  getOfferDiscountAmount as browserDiscount,
  getOfferRewardItems as browserRewardItems,
  type OfferPricingContext,
} from "../../../src/lib/offers.ts";
import type { CartItem, MenuItem, Offer } from "../../../src/types/index.ts";

const MENU = {
  waffle: { id: "waffle", name: "Belgian Waffle", price: 200, category_id: "cat-waffle", image_url: "" },
  shake: { id: "shake", name: "Thick Shake", price: 120, category_id: "cat-drink", image_url: "" },
};

interface CartSpec {
  item: keyof typeof MENU;
  quantity: number;
  /** Add-on prices on one unit. */
  addOns?: number[];
}

/** One cart in both shapes, so the two implementations get identical inputs. */
function buildContexts(
  spec: CartSpec[],
  options: {
    orderType?: "delivery" | "pickup";
    pickupOption?: "dine_in" | "takeaway";
    userOrderCount?: number;
  } = {},
) {
  const subtotal = spec.reduce((sum, line) => {
    const addOnTotal = (line.addOns || []).reduce((total, price) => total + price, 0);
    return sum + (MENU[line.item].price + addOnTotal) * line.quantity;
  }, 0);
  const itemCount = spec.reduce((sum, line) => sum + line.quantity, 0);
  const addOnTotal = spec.reduce((sum, line) => (
    sum + (line.addOns || []).reduce((total, price) => total + price, 0) * line.quantity
  ), 0);

  const menuItemsById = Object.fromEntries(
    Object.values(MENU).map((menuItem) => [menuItem.id, menuItem]),
  );

  const lines: PricedLine[] = spec.map((line) => ({
    menu_item_id: MENU[line.item].id,
    category_id: MENU[line.item].category_id,
    quantity: line.quantity,
    unit_price: MENU[line.item].price,
    add_on_total: (line.addOns || []).reduce((total, price) => total + price, 0),
  }));

  const cartItems = spec.map((line, index) => ({
    id: `line-${index}`,
    menu_item: MENU[line.item] as unknown as MenuItem,
    quantity: line.quantity,
    customizations: (line.addOns || []).map((price, optionIndex) => ({
      group_name: "Toppings",
      option_name: `Topping ${optionIndex}`,
      price,
    })),
    total_price: 0,
  })) as unknown as CartItem[];

  const serverContext: OfferContext = {
    subtotal,
    itemCount,
    addOnTotal,
    lines,
    menuItemsById,
    orderType: options.orderType ?? "pickup",
    pickupOption: options.pickupOption ?? "takeaway",
    userOrderCount: options.userOrderCount,
  };

  const browserContext: OfferPricingContext = {
    subtotal,
    itemCount,
    addOnTotal,
    items: cartItems,
    menuItemsById: menuItemsById as OfferPricingContext["menuItemsById"],
    orderType: options.orderType ?? "pickup",
    pickupOption: options.pickupOption ?? "takeaway",
    userOrderCount: options.userOrderCount,
  };

  return { serverContext, browserContext, subtotal };
}

function offer(overrides: Partial<OfferRow> & Pick<OfferRow, "discount_type" | "discount_value">): OfferRow {
  return {
    id: "offer-1",
    title: "Test offer",
    code: "TEST",
    offer_mode: "coupon",
    trigger_type: "min_order",
    min_order: 0,
    required_item_quantity: null,
    qualifying_category_id: null,
    qualifying_menu_item_id: null,
    reward_menu_item_id: null,
    reward_item_source: null,
    reward_item_quantity: null,
    applies_to_delivery: true,
    applies_to_takeaway: true,
    applies_to_dine_in: true,
    first_n_orders: null,
    ...overrides,
  };
}

const bigCart: CartSpec[] = [{ item: "waffle", quantity: 2, addOns: [30] }, { item: "shake", quantity: 1 }];
const oneWaffle: CartSpec[] = [{ item: "waffle", quantity: 1 }];
const fourWaffles: CartSpec[] = [{ item: "waffle", quantity: 4 }];

const cases: Array<{
  name: string;
  offer: OfferRow;
  cart: CartSpec[];
  options?: Parameters<typeof buildContexts>[1];
}> = [
  { name: "percentage", offer: offer({ discount_type: "percentage", discount_value: 10 }), cart: bigCart },
  {
    name: "percentage under the minimum",
    offer: offer({ discount_type: "percentage", discount_value: 20, min_order: 5000 }),
    cart: bigCart,
  },
  { name: "flat", offer: offer({ discount_type: "flat", discount_value: 50 }), cart: bigCart },
  { name: "flat above the subtotal", offer: offer({ discount_type: "flat", discount_value: 99999 }), cart: oneWaffle },
  { name: "free add-ons", offer: offer({ discount_type: "free_addons", discount_value: 0 }), cart: bigCart },
  {
    name: "free specific item over a minimum",
    offer: offer({
      discount_type: "free_item",
      discount_value: 0,
      min_order: 300,
      reward_menu_item_id: "shake",
      reward_item_source: "specific_item",
      reward_item_quantity: 1,
    }),
    cart: bigCart,
  },
  {
    name: "free specific item under the minimum",
    offer: offer({
      discount_type: "free_item",
      discount_value: 0,
      min_order: 300,
      reward_menu_item_id: "shake",
      reward_item_source: "specific_item",
    }),
    cart: oneWaffle,
  },
  {
    name: "buy two get one of the same item",
    offer: offer({
      discount_type: "free_item",
      discount_value: 0,
      trigger_type: "item_quantity",
      required_item_quantity: 2,
      reward_item_source: "qualifying_item",
      reward_item_quantity: 1,
    }),
    cart: fourWaffles,
  },
  {
    name: "item-quantity trigger with a minimum pays one reward only",
    offer: offer({
      discount_type: "free_item",
      discount_value: 0,
      trigger_type: "item_quantity",
      required_item_quantity: 2,
      min_order: 300,
      reward_menu_item_id: "shake",
      reward_item_source: "specific_item",
      reward_item_quantity: 1,
    }),
    cart: fourWaffles,
  },
  {
    name: "category-qualified percentage",
    offer: offer({
      discount_type: "percentage",
      discount_value: 15,
      trigger_type: "item_quantity",
      required_item_quantity: 2,
      qualifying_category_id: "cat-waffle",
    }),
    cart: bigCart,
  },
  {
    name: "first order only, used by a repeat customer",
    offer: offer({ discount_type: "percentage", discount_value: 25, first_n_orders: 1 }),
    cart: bigCart,
    options: { userOrderCount: 3 },
  },
  {
    name: "first order only, used by a new customer",
    offer: offer({ discount_type: "percentage", discount_value: 25, first_n_orders: 1 }),
    cart: bigCart,
    options: { userOrderCount: 0 },
  },
];

for (const testCase of cases) {
  const { serverContext, browserContext } = buildContexts(testCase.cart, testCase.options);
  const browserOffer = testCase.offer as unknown as Offer;

  assert.equal(
    getOfferDiscountAmount(testCase.offer, serverContext),
    browserDiscount(browserOffer, browserContext),
    `discount disagrees on: ${testCase.name}`,
  );

  const serverRewards = getOfferRewardItems(testCase.offer, serverContext)
    .map((reward) => `${reward.menu_item_id}x${reward.quantity}@${reward.unit_price}`)
    .sort();
  const browserRewards = browserRewardItems(browserOffer, browserContext)
    .map((reward) => `${reward.menu_item_id}x${reward.quantity}@${reward.unit_price}`)
    .sort();

  assert.deepEqual(serverRewards, browserRewards, `free items disagree on: ${testCase.name}`);
}

// The numbers themselves, so a change that moves both sides together still fails.
const { serverContext: bigContext } = buildContexts(bigCart);
assert.equal(bigContext.subtotal, 580);
assert.equal(bigContext.addOnTotal, 60);
assert.equal(getOfferDiscountAmount(offer({ discount_type: "percentage", discount_value: 10 }), bigContext), 58);
assert.equal(getOfferDiscountAmount(offer({ discount_type: "free_addons", discount_value: 0 }), bigContext), 60);
assert.equal(
  getOfferDiscountAmount(
    offer({ discount_type: "flat", discount_value: 99999 }),
    buildContexts(oneWaffle).serverContext,
  ),
  200,
  "a flat discount never exceeds the subtotal",
);

const buyTwoGetOne = offer({
  discount_type: "free_item",
  discount_value: 0,
  trigger_type: "item_quantity",
  required_item_quantity: 2,
  reward_item_source: "qualifying_item",
  reward_item_quantity: 1,
});
assert.deepEqual(
  getOfferRewardItems(buyTwoGetOne, buildContexts(fourWaffles).serverContext).map((reward) => reward.quantity),
  [2],
  "four items at two-for-one is two free",
);

console.log("ok");
