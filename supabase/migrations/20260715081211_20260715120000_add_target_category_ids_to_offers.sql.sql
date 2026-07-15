/*
# Add multi-category targeting to offers

1. Purpose
   Allow an offer to be attached to one or more specific categories. Previously
   offers could only target a single category via `qualifying_category_id`
   (used for buy-X-get-Y item-quantity triggers) or `cta_target_category_id`
   (used for banner CTA links). This migration adds a dedicated array column
   `target_category_ids` that stores multiple category UUIDs so an admin can
   select one or more categories to attach an offer to.

2. Changes
   - offers table: ADD COLUMN `target_category_ids` uuid[] defaulting to an
     empty array. Existing rows get an empty array (no targeting) so nothing
     changes for current offers.
   - The array references categories(id) implicitly via app-level validation;
     we do NOT add a FK constraint on array elements because Postgres does not
     support FK on array elements natively without a trigger, and the column
     is optional.

3. Security
   - No new tables, no RLS changes. The existing offers policies already govern
     read/write access.
   - No destructive operations — purely additive.

4. Important notes
   - The column is nullable-safe: empty array means "no category targeting"
     (offer applies broadly), non-empty means the offer is scoped to the
     listed categories.
   - Backward compatible: all existing queries continue to work unchanged.
*/

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS target_category_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill any NULL values (should not exist due to NOT NULL, but guard anyway)
UPDATE offers SET target_category_ids = '{}' WHERE target_category_ids IS NULL;
