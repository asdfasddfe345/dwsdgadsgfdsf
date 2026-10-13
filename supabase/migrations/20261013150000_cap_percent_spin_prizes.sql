/*
  # A ceiling on every percentage prize

  One spin can now only cost the shop as much as the prize's ceiling. The cap
  is a ceiling and not a flat amount, so a small order still gets the whole
  percentage: 10% off a 400 rupee order is 40 rupees, the same as before.

  Karthik chose these amounts on 2026-10-13. Only 5% and 10% can be won
  today; the rest are capped so that raising a weight later cannot reopen
  the hole.

  FREE ITEM and BUY 1 GET 1 stay uncapped on purpose. They give away the
  lowest-priced item in the order, which already bounds itself.
*/

UPDATE public.spin_prizes AS prize
SET max_discount = capped.cap
FROM (
  VALUES
    (5, 50),
    (10, 100),
    (15, 60),
    (20, 80),
    (25, 100),
    (30, 120),
    (50, 150),
    (100, 100)
) AS capped(percent, cap)
WHERE prize.kind = 'percent'
  AND prize.percent = capped.percent;

-- Fails the migration if a percentage prize is left with no ceiling, which is
-- how a new prize would quietly arrive uncapped.
DO $$
DECLARE
  uncapped text;
BEGIN
  SELECT string_agg(label, ', ' ORDER BY percent)
  INTO uncapped
  FROM public.spin_prizes
  WHERE kind = 'percent'
    AND max_discount IS NULL;

  IF uncapped IS NOT NULL THEN
    RAISE EXCEPTION 'These percentage prizes have no cap: %', uncapped;
  END IF;
END $$;
