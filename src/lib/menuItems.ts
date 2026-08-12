import type { MenuItem } from '../types';

const FALLBACK_CUSTOMIZATION_CATEGORY_IDS = new Set([
  'c0000000-0001-0000-0000-000000000001',
  'c0000000-0001-0000-0000-000000000002',
  'c0000000-0001-0000-0000-000000000004',
  'c0000000-0001-0000-0000-000000000005',
  'c0000000-0001-0000-0000-000000000006',
]);

/** Struck-through price + % off, or null when there is no real discount. */
export function getMenuItemDiscount(price: number, originalPrice?: number | null) {
  const original = Number(originalPrice);
  if (!Number.isFinite(original) || original <= price) return null;
  return { original, percent: Math.round(((original - price) / original) * 100) };
}

export function menuItemSupportsCustomizations(item: Pick<MenuItem, 'category_id' | 'has_customizations'>) {
  if (typeof item.has_customizations === 'boolean') {
    return item.has_customizations;
  }

  return FALLBACK_CUSTOMIZATION_CATEGORY_IDS.has(item.category_id);
}
