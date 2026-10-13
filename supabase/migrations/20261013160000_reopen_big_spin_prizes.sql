/*
  # Bring the big prizes back, rarely

  Every percentage prize now has a ceiling, so a rare big win costs a known
  amount rather than an open-ended one. That is what makes this affordable:
  on a 500 rupee order the whole wheel averages about 7.3% off, against 7.0%
  for the wheel that only paid 5% and 10%.

  15%, 20%, 25% and 30% stay switched off. They crowd the middle of the
  wheel without giving anyone a reason to spin it.

  Karthik chose this on 2026-10-13, over leaving the wheel at two prizes and
  over the full seeded odds.
*/

UPDATE public.spin_prizes AS prize
SET weight = reopened.weight
FROM (
  VALUES
    ('percent',     5, 420),
    ('percent',    10, 280),
    ('bogo',        0,   5),
    ('percent',    50,   3),
    ('free_item',   0,   2),
    ('percent',   100,   1),
    -- Deliberately left unwinnable.
    ('percent',    15,   0),
    ('percent',    20,   0),
    ('percent',    25,   0),
    ('percent',    30,   0)
) AS reopened(kind, percent, weight)
WHERE prize.kind = reopened.kind
  AND prize.percent = reopened.percent;

DO $$
DECLARE
  winnable integer;
  unexpected text;
BEGIN
  SELECT count(*) INTO winnable
  FROM public.spin_prizes
  WHERE is_active AND weight > 0;

  IF winnable <> 6 THEN
    RAISE EXCEPTION 'Expected 6 winnable spin prizes, found %', winnable;
  END IF;

  SELECT string_agg(label, ', ' ORDER BY label)
  INTO unexpected
  FROM public.spin_prizes
  WHERE is_active
    AND weight > 0
    AND kind = 'percent'
    AND percent IN (15, 20, 25, 30);

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'These prizes were meant to stay switched off: %', unexpected;
  END IF;
END $$;
