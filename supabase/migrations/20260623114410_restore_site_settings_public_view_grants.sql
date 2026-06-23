-- Restore SELECT on site_settings_public view that was lost when the view
-- was dropped and recreated in the add_rain_enabled migration.
-- DROP+CREATE VIEW silently revokes all existing grants on the old view.
GRANT SELECT ON public.site_settings_public TO anon, authenticated;
