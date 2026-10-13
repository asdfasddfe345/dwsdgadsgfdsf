/*
  # Say the cap on the wheel

  100% OFF takes at most 100 rupees off, so the slice should not promise a
  free order. The wheel draws `spin_prizes.label` straight from this table,
  so renaming the prize here is all it takes.

  A reward already won keeps the label it was given at spin time, so this
  does not change what any customer was already told.
*/

UPDATE public.spin_prizes
SET label = 'FLAT ₹100 OFF'
WHERE kind = 'percent'
  AND percent = 100;

-- Fails the migration if a capped prize still promises more than it pays.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(label || ' (max ' || max_discount || ')', ', ')
  INTO offenders
  FROM public.spin_prizes
  WHERE max_discount IS NOT NULL
    AND kind = 'percent'
    AND percent = 100
    AND label NOT LIKE '%' || max_discount::integer || '%';

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'These capped prizes do not name their cap: %', offenders;
  END IF;
END $$;
