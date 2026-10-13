// Run: node --experimental-strip-types supabase/functions/_shared/spin-rewards.check.ts
import assert from 'node:assert/strict';
import { availableSpinPrizes, calculateSpinRewardDiscount, pickSpinPrize } from './spin-rewards.ts';
import { calculateSpinRewardDiscount as browserDiscount } from '../../../src/lib/spinRewards.ts';

const cart = [
  { quantity: 1, unit_price: 99 },
  { quantity: 2, unit_price: 59 },
  { quantity: 1, unit_price: 0 }, // a free promo line must never count as the "lowest-priced item"
];
const oneItem = [{ quantity: 1, unit_price: 99 }];

const cases = [
  { reward: { kind: 'percent', percent: 10, max_discount: null }, subtotal: 217, items: cart, expected: 22 },
  { reward: { kind: 'percent', percent: 100, max_discount: null }, subtotal: 217, items: cart, expected: 217 },
  { reward: { kind: 'bogo', percent: 0, max_discount: null }, subtotal: 217, items: cart, expected: 59 },
  { reward: { kind: 'bogo', percent: 0, max_discount: null }, subtotal: 99, items: oneItem, expected: 0 }, // buy 1 get 1 needs 2 items
  { reward: { kind: 'free_item', percent: 0, max_discount: null }, subtotal: 99, items: oneItem, expected: 99 },
  { reward: { kind: 'free_item', percent: 0, max_discount: null }, subtotal: 0, items: [], expected: 0 },
  // 100% OFF is capped at 100 rupees: a big order stops at the cap, a small one just goes free.
  { reward: { kind: 'percent', percent: 100, max_discount: 100 }, subtotal: 217, items: cart, expected: 100 },
  { reward: { kind: 'percent', percent: 100, max_discount: 100 }, subtotal: 80, items: cart, expected: 80 },
  // A cap above the discount changes nothing, and it holds for item prizes too.
  { reward: { kind: 'percent', percent: 10, max_discount: 100 }, subtotal: 217, items: cart, expected: 22 },
  { reward: { kind: 'free_item', percent: 0, max_discount: 50 }, subtotal: 99, items: oneItem, expected: 50 },
];

for (const { reward, subtotal, items, expected } of cases) {
  assert.equal(calculateSpinRewardDiscount(reward, subtotal, items), expected);
  // The browser and the server must agree, or checkout rejects the prize.
  assert.equal(browserDiscount(reward, subtotal, items), expected);
}

// Weighted pick: boundaries land on the right prize and a zero-weight prize can never win.
const prizes = [{ id: 'a', weight: 1 }, { id: 'never', weight: 0 }, { id: 'b', weight: 3 }];
assert.equal(pickSpinPrize(prizes, 0).id, 'a');
assert.equal(pickSpinPrize(prizes, 0.2499).id, 'a');
assert.equal(pickSpinPrize(prizes, 0.25).id, 'b');
assert.equal(pickSpinPrize(prizes, 0.9999).id, 'b');

const wins = { a: 0, never: 0, b: 0 };
for (let spin = 0; spin < 40000; spin += 1) wins[pickSpinPrize(prizes).id] += 1;
assert.equal(wins.never, 0);
assert.ok(Math.abs(wins.a / 40000 - 0.25) < 0.02, `expected about 25% for a, got ${wins.a / 400}%`);

// Win limits: a limited prize leaves the draw once it has been won that many
// times, and an unlimited prize never does.
const limitedPrizes = [
  { id: 'fifty', weight: 3, win_limit: 1 },
  { id: 'hundred', weight: 1, win_limit: 2 },
  { id: 'ten', weight: 280, win_limit: null },
];

assert.deepEqual(availableSpinPrizes(limitedPrizes, {}).map((prize) => prize.id), ['fifty', 'hundred', 'ten']);
assert.deepEqual(
  availableSpinPrizes(limitedPrizes, { fifty: 1 }).map((prize) => prize.id),
  ['hundred', 'ten'],
  'a prize at its limit stops being drawable',
);
assert.deepEqual(
  availableSpinPrizes(limitedPrizes, { fifty: 1, hundred: 1 }).map((prize) => prize.id),
  ['hundred', 'ten'],
  'a limit of 2 survives its first win',
);
assert.deepEqual(
  availableSpinPrizes(limitedPrizes, { fifty: 9, hundred: 9, ten: 9999 }).map((prize) => prize.id),
  ['ten'],
  'an unlimited prize is never exhausted',
);

// The live setting: the two big prizes together can only ever be won twice.
const bigPrizes = [{ id: 'fifty', weight: 3, win_limit: 1 }, { id: 'hundred', weight: 1, win_limit: 1 }];
assert.equal(bigPrizes.reduce((total, prize) => total + (prize.win_limit ?? 0), 0), 2);
assert.deepEqual(availableSpinPrizes(bigPrizes, { fifty: 1, hundred: 1 }), [], 'after two winners both are gone');

console.log('ok');
