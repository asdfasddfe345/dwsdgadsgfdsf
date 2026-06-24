import { useEffect, useState, type ReactNode } from 'react';
import { isMissingSiteSettingsSchemaError } from '../lib/siteSettings';
import { supabase } from '../lib/supabase';
import { SiteSettingsContext } from './siteSettingsShared';
import type { SiteSettings } from '../types';

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  async function refreshSettings() {
    const { data, error } = await supabase
      .from('site_settings_public')
      .select('*')
      .eq('id', true)
      .maybeSingle();

    if (isMissingSiteSettingsSchemaError(error)) {
      setSchemaMissing(true);
      setSettings(null);
      setLoading(false);
      return false;
    }

    if (error) {
      console.error('Failed to load site settings', error);
    }

    setSchemaMissing(false);
    setSettings(data);
    setLoading(false);
    return true;
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    void (async () => {
      const schemaReady = await refreshSettings();

      if (disposed || !schemaReady) return;

      // Realtime subscription — fires when admin updates site_settings
      channel = supabase
        .channel('site-settings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => {
          void refreshSettings();
        })
        .subscribe();

      // Polling fallback (every 15 s) in case realtime is throttled or the
      // anon client doesn't receive the event (e.g. RLS row-filter mismatch)
      pollTimer = setInterval(() => {
        void refreshSettings();
      }, 15_000);
    })();

    return () => {
      disposed = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ settings, loading, schemaMissing, refreshSettings }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}
