-- Add delivery partner tracking fields to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_partner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_partner_lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS delivery_partner_lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS delivery_partner_location_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_otp text,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;

-- Index for partner assignment lookup
CREATE INDEX IF NOT EXISTS orders_delivery_partner_id_idx ON orders(delivery_partner_id);

-- Allow customers to read the live-tracking fields on their own orders
-- (the existing customer SELECT policy already covers reading their order row,
--  so no new policy is needed for reading these columns)

-- Allow delivery staff to update tracking fields on delivery orders
-- The existing "Delivery staff can update delivery order status" policy covers full-row updates,
-- which is sufficient. No new policy needed.

-- Allow authenticated users to read delivery_otp only on orders they own
-- This is handled by the existing RLS on orders for customers.
-- For the public / guest track-order lookup we expose only non-sensitive fields
-- through existing select policies.
