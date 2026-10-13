/*
  # Spin wheel: only 5% and 10% are winnable, and a prize can carry a cap

  Every other prize keeps its slice on the wheel but drops to weight 0. The
  spin-wheel function only picks from prizes with weight > 0, so the wheel
  spins past them instead of stopping. Raising a weight here brings a prize
  back without a code change.

  `max_discount` is the most a prize can ever take off an order, in rupees;
  NULL means no cap. 100% OFF is capped at 100. The cap is copied onto the
  reward at spin time, the same way label/kind/percent are, so editing a prize
  later never changes what a customer already won, and checkout re-applies it
  server-side.
*/

ALTER TABLE public.spin_prizes
  ADD COLUMN IF NOT EXISTS max_discount numeric(10,2)
  CONSTRAINT spin_prizes_max_discount_check CHECK (max_discount IS NULL OR max_discount >= 0);

ALTER TABLE public.spin_rewards
  ADD COLUMN IF NOT EXISTS max_discount numeric(10,2)
  CONSTRAINT spin_rewards_max_discount_check CHECK (max_discount IS NULL OR max_discount >= 0);

-- The cap is shown to the customer, unlike the weights.
GRANT SELECT (max_discount) ON public.spin_prizes TO anon, authenticated;

-- A free order takes at most 100 rupees off.
UPDATE public.spin_prizes
SET max_discount = 100
WHERE kind = 'percent' AND percent = 100;

-- Only 5% OFF and 10% OFF can be won. The rest stay on the wheel, unwinnable.
UPDATE public.spin_prizes
SET weight = 0
WHERE NOT (kind = 'percent' AND percent IN (5, 10));

-- Fails the migration if the wheel could still stop anywhere else.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(label || ' (weight ' || weight || ')', ', ')
  INTO offenders
  FROM public.spin_prizes
  WHERE is_active
    AND weight > 0
    AND NOT (kind = 'percent' AND percent IN (5, 10));

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'These spin prizes can still be won: %', offenders;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.spin_prizes WHERE is_active AND weight > 0) THEN
    RAISE EXCEPTION 'No winnable spin prizes left, the wheel would be unavailable';
  END IF;
END $$;
