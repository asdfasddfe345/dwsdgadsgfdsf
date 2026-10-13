/*
  # A lifetime win limit per prize

  `win_limit` is how many times a prize may ever be won, counted as rows in
  `spin_rewards`. NULL means unlimited, which is every other prize.

  50% OFF and FLAT ₹100 OFF get 1 each, so exactly two customers ever win a
  big prize. After that the two slices stay on the wheel and stop paying,
  the same way the switched-off prizes already do.

  Karthik asked for this on 2026-10-13: "only two spins overall, no more".
  To allow more winners later, raise these numbers; no code change needed.
*/

ALTER TABLE public.spin_prizes
  ADD COLUMN IF NOT EXISTS win_limit integer
  CONSTRAINT spin_prizes_win_limit_check CHECK (win_limit IS NULL OR win_limit > 0);

UPDATE public.spin_prizes
SET win_limit = 1
WHERE kind = 'percent'
  AND percent IN (50, 100);

-- Wins are counted per prize on every spin, so make that an index lookup.
CREATE INDEX IF NOT EXISTS spin_rewards_prize_id_idx
  ON public.spin_rewards (prize_id);

-- Fails the migration if the big prizes are not limited to two winners between them.
DO $$
DECLARE
  limited integer;
  total_winners integer;
BEGIN
  SELECT count(*), coalesce(sum(win_limit), 0)
  INTO limited, total_winners
  FROM public.spin_prizes
  WHERE win_limit IS NOT NULL;

  IF limited <> 2 OR total_winners <> 2 THEN
    RAISE EXCEPTION
      'Expected 2 limited prizes allowing 2 winners in total, found % prizes allowing %',
      limited, total_winners;
  END IF;
END $$;
