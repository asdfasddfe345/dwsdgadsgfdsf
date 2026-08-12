// Run: node --experimental-strip-types src/lib/menuItems.check.ts
import assert from 'node:assert/strict';
import { getMenuItemDiscount } from './menuItems.ts';

assert.deepEqual(getMenuItemDiscount(89, 99), { original: 99, percent: 10 });
assert.equal(getMenuItemDiscount(99, null), null);
assert.equal(getMenuItemDiscount(99, undefined), null);
assert.equal(getMenuItemDiscount(99, 99), null); // equal is not a discount
assert.equal(getMenuItemDiscount(99, 89), null); // never strike a lower price
console.log('ok');
