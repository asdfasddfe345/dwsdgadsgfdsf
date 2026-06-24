-- Enable FULL replica identity so Supabase Realtime can evaluate RLS filters
-- for anon subscribers on the site_settings table.
ALTER TABLE public.site_settings REPLICA IDENTITY FULL;
