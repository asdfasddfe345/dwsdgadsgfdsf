/*
  # Add original (struck-through) price to menu_items

  `price` stays the amount the customer is charged. `original_price` is the
  optional higher "before discount" price shown struck through on the card.
  NULL = no discount badge.
*/

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS original_price numeric(10,2);
