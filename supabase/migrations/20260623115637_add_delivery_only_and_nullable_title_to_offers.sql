-- Allow offer title to be null (for image-only poster offers)
ALTER TABLE public.offers
  ALTER COLUMN title DROP NOT NULL;

-- Tag offers as delivery-only so the Offers page can section them separately
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS delivery_only boolean NOT NULL DEFAULT false;
