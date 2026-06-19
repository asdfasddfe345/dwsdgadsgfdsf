import { Loader } from '@googlemaps/js-api-loader';

export const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || '';
export const STORE_LAT = 16.4724;
export const STORE_LNG = 80.6516;

export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f1117' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8fa8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#252533' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c5e' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#D8B24E' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a5568' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#c4a25a' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2e1a' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#D8B24E' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#D8B24E' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1a1b2e' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1f2037' }] },
];

// Module-level singleton loader — shared across MapLocationPicker and DeliveryDashboard
let _loader: Loader | null = null;

export function getGoogleMapsLoader(): Loader {
  if (!_loader) {
    _loader = new Loader({
      apiKey: GOOGLE_MAPS_KEY,
      version: 'weekly',
      libraries: ['places', 'geometry', 'routes'],
    });
  }
  return _loader;
}
