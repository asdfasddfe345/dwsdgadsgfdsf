-- ── Saved Addresses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label           text NOT NULL DEFAULT 'Other',  -- 'Home', 'Work', 'Other'
  house_number    text NOT NULL DEFAULT '',
  building_name   text NOT NULL DEFAULT '',
  floor_number    text NOT NULL DEFAULT '',
  landmark        text NOT NULL DEFAULT '',
  address         text NOT NULL DEFAULT '',
  pincode         text NOT NULL DEFAULT '',
  lat             numeric(10, 7),
  lng             numeric(10, 7),
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_saved_addresses" ON saved_addresses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "insert_own_saved_addresses" ON saved_addresses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_saved_addresses" ON saved_addresses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_saved_addresses" ON saved_addresses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS saved_addresses_user_id_idx ON saved_addresses (user_id);

-- ── Orders: extended address detail + GPS tracking ───────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS house_number        text,
  ADD COLUMN IF NOT EXISTS building_name       text,
  ADD COLUMN IF NOT EXISTS floor_number        text,
  ADD COLUMN IF NOT EXISTS landmark            text,
  ADD COLUMN IF NOT EXISTS delivery_instructions text,
  ADD COLUMN IF NOT EXISTS detected_gps_lat    numeric(10, 7),
  ADD COLUMN IF NOT EXISTS detected_gps_lng    numeric(10, 7),
  ADD COLUMN IF NOT EXISTS address_confidence  smallint,
  ADD COLUMN IF NOT EXISTS saved_address_id    uuid REFERENCES saved_addresses(id) ON DELETE SET NULL;
