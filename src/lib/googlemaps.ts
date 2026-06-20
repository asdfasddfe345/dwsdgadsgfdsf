import { Loader } from '@googlemaps/js-api-loader';

export const STORE_LAT = 16.4724;
export const STORE_LNG = 80.6516;

export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffe082' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#ffd54f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#9e6c00' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e8f5' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e7d9e' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8e6c9' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#388e3c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f0f0f0' }] },
];

// Module-level singletons
let _keyPromise: Promise<string> | null = null;
let _loader: Loader | null = null;

async function fetchMapsKey(): Promise<string> {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || '';
  if (envKey) return envKey;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/get-maps-key`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    });
    if (!res.ok) return '';
    const data = await res.json() as { key?: string };
    return data.key ?? '';
  } catch {
    return '';
  }
}

export function getGoogleMapsKey(): Promise<string> {
  if (!_keyPromise) _keyPromise = fetchMapsKey();
  return _keyPromise;
}

export function getGoogleMapsLoader(apiKey: string): Loader {
  if (!_loader) {
    _loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'geometry', 'routes'],
    });
  }
  return _loader;
}
