/*
  # Spin wheel

  A signed-in customer gets one spin per day (India time). The `spin-wheel`
  edge function picks a prize from `spin_prizes` by weight and stores it in
  `spin_rewards` as a single-use reward. Checkout verifies the reward again
  before applying its discount.

  A reward counts as used while `redeemed_order_id` points at a live order. It
  frees itself when that order is deleted, cancelled, expired, or its payment
  fails, so no edge function has to remember to release it.

  To change the prizes or the odds, edit the rows in `spin_prizes`. A prize
  wins `weight / (sum of all active weights)` of the time.
*/

CREATE TABLE IF NOT EXISTS public.spin_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  -- percent: `percent` off the item total. bogo: lowest-priced item free when
  -- the order has 2 or more items. free_item: lowest-priced item free.
  kind text NOT NULL CHECK (kind IN ('percent', 'bogo', 'free_item')),
  percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  weight integer NOT NULL DEFAULT 1 CHECK (weight >= 0),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spin_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prize_id uuid REFERENCES public.spin_prizes(id) ON DELETE SET NULL,
  -- label, kind and percent are copied from the prize at spin time, so editing
  -- a prize later never changes what a customer already won.
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('percent', 'bogo', 'free_item')),
  percent numeric(5,2) NOT NULL DEFAULT 0,
  spin_day date NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One spin per customer per day, enforced here so two fast taps cannot both win.
  UNIQUE (user_id, spin_day)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS spin_reward_id uuid REFERENCES public.spin_rewards(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS spin_reward_discount_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.spin_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_rewards ENABLE ROW LEVEL SECURITY;

-- The website may read the prize list but not the weights. Only the edge
-- functions (service role) write to either table.
REVOKE ALL ON public.spin_prizes FROM anon, authenticated;
GRANT SELECT (id, label, kind, percent, display_order, is_active) ON public.spin_prizes TO anon, authenticated;

REVOKE ALL ON public.spin_rewards FROM anon, authenticated;
GRANT SELECT ON public.spin_rewards TO authenticated;

GRANT ALL ON public.spin_prizes TO service_role;
GRANT ALL ON public.spin_rewards TO service_role;

DROP POLICY IF EXISTS "Anyone can view active spin prizes" ON public.spin_prizes;
CREATE POLICY "Anyone can view active spin prizes"
  ON public.spin_prizes
  FOR SELECT
  TO anon, authenticated
  USING (is_active);

DROP POLICY IF EXISTS "Users can view own spin rewards" ON public.spin_rewards;
CREATE POLICY "Users can view own spin rewards"
  ON public.spin_rewards
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.release_spin_reward_for_dead_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.spin_rewards
  SET redeemed_order_id = NULL,
      redeemed_at = NULL
  WHERE id = NEW.spin_reward_id
    AND redeemed_order_id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_spin_reward_for_dead_order() FROM PUBLIC;

DROP TRIGGER IF EXISTS release_spin_reward_on_dead_order ON public.orders;
CREATE TRIGGER release_spin_reward_on_dead_order
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  WHEN (
    NEW.spin_reward_id IS NOT NULL
    AND (NEW.status IN ('cancelled', 'expired') OR NEW.payment_status = 'failed')
  )
  EXECUTE FUNCTION public.release_spin_reward_for_dead_order();

-- Starting prizes. Weights add up to 1000, so a weight of 5 is 1 spin in 200.
INSERT INTO public.spin_prizes (label, kind, percent, weight, display_order)
SELECT seed.label, seed.kind, seed.percent, seed.weight, seed.display_order
FROM (
  VALUES
    ('5% OFF',      'percent',     5, 420,  1),
    ('50% OFF',     'percent',    50,   5,  2),
    ('10% OFF',     'percent',    10, 280,  3),
    ('FREE ITEM',   'free_item',   0,   3,  4),
    ('15% OFF',     'percent',    15, 140,  5),
    ('100% OFF',    'percent',   100,   1,  6),
    ('20% OFF',     'percent',    20,  90,  7),
    ('BUY 1 GET 1', 'bogo',        0,  10,  8),
    ('25% OFF',     'percent',    25,  34,  9),
    ('30% OFF',     'percent',    30,  17, 10)
) AS seed(label, kind, percent, weight, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.spin_prizes);
