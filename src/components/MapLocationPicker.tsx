import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, MapPin, Navigation, Search, Loader2, X, Home, Layers,
  Plus, Minus, Building2, Hash, Landmark, AlertCircle, CheckCircle2,
  ChevronRight, StickyNote,
} from 'lucide-react';
import { DARK_MAP_STYLE, getGoogleMapsKey, getGoogleMapsLoader } from '../lib/googlemaps';
import type { MapConfirmData } from '../types';

const DEFAULT_LAT = 16.4724;
const DEFAULT_LNG = 80.6516;
const DEFAULT_ZOOM = 22;
const FLY_ZOOM    = 22;
const TILE_PREF_KEY = 'mapTilePreference';
const DELIVERY_RADIUS_KM = 15;
const RESTAURANT_LAT = 16.4724;
const RESTAURANT_LNG = 80.6516;

type TileMode = 'street' | 'satellite';
type Step = 'map' | 'details';

interface SearchSuggestion {
  label: string;
  sublabel: string;
  placeId: string;
}

interface Props {
  initialLat: number | null;
  initialLng: number | null;
  onConfirm: (data: MapConfirmData) => void;
  onClose: () => void;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcConfidence(house: string, building: string, landmark: string, pinMoved: boolean): number {
  let score = 0;
  if (house.trim()) score += 40;
  if (building.trim()) score += 20;
  if (landmark.trim()) score += 20;
  if (pinMoved) score += 20;
  return score;
}

function parseGoogleComponents(components: google.maps.GeocoderAddressComponent[]) {
  const get = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name || '';
  const area =
    get('sublocality_level_1') ||
    get('sublocality') ||
    get('neighborhood') ||
    get('locality') ||
    '';
  const pincode = get('postal_code').replace(/\s/g, '');
  return { area, pincode };
}

export default function MapLocationPicker({ initialLat, initialLng, onConfirm, onClose }: Props) {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const detailInputRef   = useRef<HTMLInputElement>(null);
  const mapRef           = useRef<google.maps.Map | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const geocoderRef      = useRef<google.maps.Geocoder | null>(null);
  const resolveDebounceRef  = useRef<ReturnType<typeof setTimeout>>();
  const searchDebounceRef   = useRef<ReturnType<typeof setTimeout>>();
  const lastGeocodedPosRef  = useRef<{ lat: number; lng: number } | null>(null);

  const [step, setStep] = useState<Step>('map');
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapsError, setMapsError] = useState(false);

  const centerLatRef = useRef(initialLat ?? DEFAULT_LAT);
  const centerLngRef = useRef(initialLng ?? DEFAULT_LNG);
  const [pinManuallyMoved, setPinManuallyMoved] = useState(false);
  const [detectedGpsLat, setDetectedGpsLat] = useState<number | null>(null);
  const [detectedGpsLng, setDetectedGpsLng] = useState<number | null>(null);
  const [tileMode, setTileMode] = useState<TileMode>(() => {
    if (typeof window === 'undefined') return 'street';
    return window.localStorage.getItem(TILE_PREF_KEY) === 'satellite' ? 'satellite' : 'street';
  });

  const [resolving, setResolving]             = useState(true);
  const [areaName, setAreaName]               = useState('');
  const [fullAddress, setFullAddress]         = useState('');
  const [detectedPincode, setDetectedPincode] = useState('');
  const [outOfRange, setOutOfRange]           = useState(false);

  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching]         = useState(false);
  const [showResults, setShowResults]     = useState(false);
  const [noResults, setNoResults]         = useState(false);
  const [locating, setLocating]           = useState(false);
  const [autoLocating, setAutoLocating]     = useState(!initialLat && !initialLng);
  const pendingGpsRef = useRef<{ lat: number; lng: number } | null>(null);

  const [houseNumber, setHouseNumber]               = useState('');
  const [buildingName, setBuildingName]             = useState('');
  const [floorNumber, setFloorNumber]               = useState('');
  const [landmark, setLandmark]                     = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [manualPincode, setManualPincode]           = useState('');
  const [houseError, setHouseError]                 = useState(false);
  const [pincodeError, setPincodeError]             = useState(false);

  const confidenceScore = calcConfidence(houseNumber, buildingName, landmark, pinManuallyMoved);
  const finalPincode = detectedPincode || manualPincode.replace(/\D/g, '').slice(0, 6);
  const needsPincodeInput = step === 'details' && !resolving && !detectedPincode;

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    if (!geocoderRef.current) return;
    setResolving(true);
    setOutOfRange(haversineKm(RESTAURANT_LAT, RESTAURANT_LNG, lat, lng) > DELIVERY_RADIUS_KM);
    geocoderRef.current.geocode(
      { location: { lat, lng }, region: 'IN' },
      (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const { area, pincode } = parseGoogleComponents(results[0].address_components);
          setAreaName(area);
          setFullAddress(results[0].formatted_address);
          setDetectedPincode(pincode.length === 6 ? pincode : '');
        } else {
          setAreaName('');
          setFullAddress('');
          setDetectedPincode('');
        }
        setResolving(false);
      },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getGoogleMapsKey().then((key) => {
      if (cancelled) return;
      if (!key) { setMapsError(true); return; }
      void getGoogleMapsLoader(key).load().then(() => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new window.google.maps.Map(mapContainerRef.current, {
          center          : { lat: initialLat ?? DEFAULT_LAT, lng: initialLng ?? DEFAULT_LNG },
          zoom            : DEFAULT_ZOOM,
          mapTypeId       : tileMode === 'satellite' ? 'satellite' : 'roadmap',
          styles          : tileMode === 'street' ? DARK_MAP_STYLE : undefined,
          backgroundColor : '#0f1117',
          disableDefaultUI: true,
          gestureHandling : 'greedy',
          clickableIcons  : false,
        });
        mapRef.current = map;
        geocoderRef.current = new window.google.maps.Geocoder();
        placesServiceRef.current = new window.google.maps.places.PlacesService(map);
        map.addListener('drag', () => setPinManuallyMoved(true));
        map.addListener('idle', () => {
          const c = map.getCenter();
          if (!c) return;
          const lat = c.lat();
          const lng = c.lng();
          centerLatRef.current = lat;
          centerLngRef.current = lng;
          const last = lastGeocodedPosRef.current;
          if (last && Math.abs(last.lat - lat) < 0.00005 && Math.abs(last.lng - lng) < 0.00005) return;
          if (resolveDebounceRef.current) clearTimeout(resolveDebounceRef.current);
          resolveDebounceRef.current = setTimeout(() => {
            lastGeocodedPosRef.current = { lat, lng };
            reverseGeocode(lat, lng);
          }, 600);
        });
        setMapsLoaded(true);
        // If GPS was obtained before the map finished loading, fly there now
        if (pendingGpsRef.current) {
          const { lat, lng } = pendingGpsRef.current;
          pendingGpsRef.current = null;
          map.panTo({ lat, lng });
          map.setZoom(FLY_ZOOM);
          lastGeocodedPosRef.current = { lat, lng };
          reverseGeocode(lat, lng);
        } else {
          lastGeocodedPosRef.current = { lat: initialLat ?? DEFAULT_LAT, lng: initialLng ?? DEFAULT_LNG };
          reverseGeocode(initialLat ?? DEFAULT_LAT, initialLng ?? DEFAULT_LNG);
        }
      }).catch(() => setMapsError(true));
    });
    return () => {
      cancelled = true;
      if (resolveDebounceRef.current) clearTimeout(resolveDebounceRef.current);
      if (searchDebounceRef.current)  clearTimeout(searchDebounceRef.current);
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect GPS on first open when no saved location exists
  useEffect(() => {
    if (initialLat || initialLng) return;
    if (!navigator.geolocation) { setAutoLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDetectedGpsLat(lat);
        setDetectedGpsLng(lng);
        centerLatRef.current = lat;
        centerLngRef.current = lng;
        setAutoLocating(false);
        if (mapRef.current) {
          lastGeocodedPosRef.current = null;
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(FLY_ZOOM);
        } else {
          // map not ready yet — store for when it loads
          pendingGpsRef.current = { lat, lng };
        }
      },
      () => {
        // permission denied or error — just use default
        setAutoLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current) return;
    if (tileMode === 'satellite') {
      mapRef.current.setMapTypeId('satellite');
      mapRef.current.setOptions({ styles: [] });
    } else {
      mapRef.current.setMapTypeId('roadmap');
      mapRef.current.setOptions({ styles: DARK_MAP_STYLE });
    }
    if (typeof window !== 'undefined') window.localStorage.setItem(TILE_PREF_KEY, tileMode);
  }, [tileMode]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function flyTo(lat: number, lng: number) {
    if (!mapRef.current) return;
    lastGeocodedPosRef.current = null;
    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(FLY_ZOOM);
  }

  function detectLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setDetectedGpsLat(lat);
        setDetectedGpsLng(lng);
        centerLatRef.current = lat;
        centerLngRef.current = lng;
        flyTo(lat, lng);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function doSearch(q: string) {
    if (!mapsLoaded || q.trim().length < 2) { setSearchResults([]); setNoResults(false); return; }
    setSearching(true);
    setNoResults(false);
    const service = new window.google.maps.places.AutocompleteService();
    service.getPlacePredictions(
      {
        input                 : q,
        componentRestrictions : { country: 'IN' },
        locationBias          : { center: { lat: centerLatRef.current, lng: centerLngRef.current }, radius: 50000 },
      },
      (predictions, status) => {
        setSearching(false);
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !predictions || predictions.length === 0
        ) {
          setSearchResults([]);
          setShowResults(false);
          setNoResults(true);
          return;
        }
        setSearchResults(
          predictions.map((p) => ({
            label   : p.structured_formatting.main_text,
            sublabel: p.structured_formatting.secondary_text || '',
            placeId : p.place_id,
          })),
        );
        setShowResults(true);
        setNoResults(false);
      },
    );
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (!value.trim()) { setSearchResults([]); setShowResults(false); setNoResults(false); }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  function selectSearchResult(r: SearchSuggestion) {
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
    setNoResults(false);
    if (!placesServiceRef.current) return;
    placesServiceRef.current.getDetails(
      { placeId: r.placeId, fields: ['geometry'] },
      (place, status) => {
        if (
          status === window.google.maps.places.PlacesServiceStatus.OK &&
          place?.geometry?.location
        ) {
          flyTo(place.geometry.location.lat(), place.geometry.location.lng());
        }
      },
    );
  }

  function proceedToDetails() {
    setStep('details');
    setTimeout(() => detailInputRef.current?.focus(), 150);
  }

  function handleConfirm() {
    let valid = true;
    if (!houseNumber.trim()) { setHouseError(true); valid = false; }
    if (finalPincode.length !== 6) { setPincodeError(true); valid = false; }
    if (!valid) return;
    const baseAddress = fullAddress || areaName || '';
    const parts = [
      houseNumber.trim(),
      buildingName.trim(),
      floorNumber.trim() ? `Floor ${floorNumber.trim()}` : '',
      baseAddress,
    ].filter(Boolean);
    onConfirm({
      address             : parts.join(', '),
      pincode             : finalPincode,
      lat                 : centerLatRef.current,
      lng                 : centerLngRef.current,
      houseNumber         : houseNumber.trim(),
      buildingName        : buildingName.trim(),
      floorNumber         : floorNumber.trim(),
      landmark            : landmark.trim(),
      deliveryInstructions: deliveryInstructions.trim(),
      detectedGpsLat,
      detectedGpsLng,
      confidenceScore,
      pinManuallyMoved,
    });
  }

  if (typeof document === 'undefined') return null;

  if (mapsError) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-brand-surface px-8 gap-5">
        <div className="w-16 h-16 rounded-2xl bg-brand-gold/10 flex items-center justify-center">
          <MapPin size={28} className="text-brand-gold" strokeWidth={1.8} />
        </div>
        <div className="text-center space-y-2">
          <p className="text-white font-bold text-[17px]">Map unavailable</p>
          <p className="text-brand-text-dim text-[13px] leading-relaxed">
            The map service is not configured. Please enter your address manually.
          </p>
        </div>
        <button onClick={onClose} className="btn-primary px-8 py-3 rounded-xl text-[14px] font-bold">Go back</button>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0d0f14' }}>

      {/* ── Top bar ── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 pt-safe-top"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingBottom: 10,
          background: 'rgba(13,15,20,0.96)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <button
          onClick={step === 'details' ? () => setStep('map') : onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        >
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-white leading-tight truncate">
            {step === 'map' ? 'Set delivery location' : 'Address details'}
          </p>
          <p className="text-[11px] text-brand-text-dim leading-tight mt-0.5">
            {step === 'map' ? 'Drag map to pin your exact location' : 'Help the rider find you faster'}
          </p>
        </div>

        {/* Step pills */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StepPill n={1} active={step === 'map'} done={step === 'details'} />
          <div className="w-4 h-px bg-white/10" />
          <StepPill n={2} active={step === 'details'} done={false} />
        </div>
      </div>

      {/* ── Search bar (map step) ── */}
      {step === 'map' && (
        <div
          className="flex-shrink-0 px-4 py-2.5"
          style={{
            background: 'rgba(13,15,20,0.96)',
            backdropFilter: 'blur(14px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div ref={searchWrapperRef} className="relative">
            <div
              className="flex items-center gap-2.5 rounded-xl px-3.5 h-11"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {searching
                ? <Loader2 size={15} className="animate-spin text-brand-gold flex-shrink-0" />
                : <Search size={15} strokeWidth={2.2} className="text-brand-text-dim flex-shrink-0" />
              }
              <input
                type="text"
                placeholder="Search area, street, landmark…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                className="flex-1 bg-transparent text-[13.5px] text-white placeholder:text-brand-text-dim outline-none min-w-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false); setNoResults(false); }}
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,0.12)' }}
                >
                  <X size={11} strokeWidth={2.5} className="text-white" />
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            {((showResults && searchResults.length > 0) || noResults) && (
              <div
                className="absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden max-h-64 overflow-y-auto"
                style={{
                  background: 'rgba(20,23,30,0.98)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                  zIndex: 20,
                }}
              >
                {noResults ? (
                  <div className="px-4 py-5 text-center space-y-1">
                    <p className="text-[13px] text-white font-semibold">No results found</p>
                    <p className="text-[12px] text-brand-text-dim leading-snug">
                      Try a different spelling or switch to Satellite view
                    </p>
                  </div>
                ) : (
                  searchResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectSearchResult(r)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-3"
                      style={{ borderBottom: i < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(216,178,78,0.12)' }}
                      >
                        <MapPin size={13} className="text-brand-gold" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] text-white font-semibold leading-snug truncate">{r.label}</p>
                        {r.sublabel && <p className="text-[11px] text-brand-text-dim leading-snug truncate mt-0.5">{r.sublabel}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Map canvas (always mounted, hidden in details) ── */}
      <div className={`relative min-h-0 ${step === 'map' ? 'flex-1' : 'h-0 overflow-hidden'}`}>
        <div ref={mapContainerRef} className="absolute inset-0" style={{ background: '#0d0f14' }} />

        {(!mapsLoaded || autoLocating) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ zIndex: 10, background: 'rgba(13,15,20,0.92)', backdropFilter: 'blur(8px)' }}>
            <div className="relative">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(216,178,78,0.15)', border: '1.5px solid rgba(216,178,78,0.3)' }}
              >
                <Navigation size={26} className="text-brand-gold" strokeWidth={1.8} />
              </div>
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#0d0f14' }}>
                <Loader2 size={14} className="animate-spin text-brand-gold" />
              </span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-white text-[15px] font-bold">
                {autoLocating ? 'Detecting your location…' : 'Loading map…'}
              </p>
              <p className="text-brand-text-dim text-[12.5px] leading-snug">
                {autoLocating ? 'Allow location access for faster delivery' : 'Setting things up'}
              </p>
            </div>
            {autoLocating && (
              <button
                type="button"
                onClick={() => setAutoLocating(false)}
                className="text-[12.5px] text-brand-text-dim underline underline-offset-2 mt-1"
              >
                Set manually instead
              </button>
            )}
          </div>
        )}

        {/* Centre pin */}
        <div
          className="absolute pointer-events-none"
          style={{ zIndex: 9999, left: '50%', top: '50%', transform: 'translate(-50%, -100%)' }}
        >
          <div className="flex flex-col items-center">
            <div
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'linear-gradient(135deg, #D8B24E 0%, #f0d070 100%)',
                border: '3px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 32px rgba(216,178,78,0.7), 0 2px 10px rgba(0,0,0,0.5)',
              }}
            >
              <MapPin size={22} color="#1a1400" strokeWidth={2.8} />
            </div>
            <div style={{ width: 3, height: 12, background: '#D8B24E', borderRadius: '0 0 3px 3px' }} />
            <div style={{ width: 8, height: 3, borderRadius: '50%', background: 'rgba(0,0,0,0.3)' }} />
          </div>
        </div>

        {/* Drag hint pill */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 9999 }}>
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {pinManuallyMoved
              ? <CheckCircle2 size={12} className="text-emerald-400" strokeWidth={2.5} />
              : <div className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
            }
            <span className="text-[11px] font-semibold text-white/90">
              {pinManuallyMoved ? 'Pin placed — drag to fine-tune' : 'Move the pin to your entrance'}
            </span>
          </div>
        </div>

        {/* Out of range */}
        {outOfRange && (
          <div className="absolute bottom-48 left-4 right-4 pointer-events-none" style={{ zIndex: 9999 }}>
            <div
              className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
              style={{ background: 'rgba(220,38,38,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,100,100,0.3)' }}
            >
              <AlertCircle size={17} className="text-white flex-shrink-0" strokeWidth={2} />
              <p className="text-white text-[12.5px] font-semibold">Outside our delivery area</p>
            </div>
          </div>
        )}

        {/* Map controls — top right */}
        <div className="absolute top-3 right-3 flex flex-col gap-2" style={{ zIndex: 9999 }}>
          {/* Satellite toggle */}
          <button
            type="button"
            onClick={() => setTileMode((m) => (m === 'street' ? 'satellite' : 'street'))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white transition-all active:scale-95"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Layers size={13} strokeWidth={2.2} className="text-brand-gold" />
            <span>{tileMode === 'street' ? 'Satellite' : 'Map'}</span>
          </button>

          {/* GPS */}
          <button
            type="button"
            onClick={detectLocation}
            disabled={locating}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
            title="My location"
          >
            {locating ? <Loader2 size={15} className="animate-spin text-brand-gold" /> : <Navigation size={15} strokeWidth={2.2} className="text-brand-gold" />}
          </button>
        </div>

        {/* Zoom controls — bottom right */}
        <div className="absolute bottom-44 right-3 flex flex-col gap-1.5" style={{ zIndex: 9999 }}>
          <button
            type="button"
            onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? DEFAULT_ZOOM) + 1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all active:scale-95"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? DEFAULT_ZOOM) - 1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white transition-all active:scale-95"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Minus size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Map step bottom sheet ── */}
      {step === 'map' && (
        <div
          className="flex-shrink-0 px-4 pt-4 pb-8 space-y-4"
          style={{
            background: 'rgba(13,15,20,0.97)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Location pill */}
          <div
            className="flex items-start gap-3 rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(216,178,78,0.15)' }}
            >
              {resolving
                ? <Loader2 size={16} className="animate-spin text-brand-gold" />
                : <MapPin size={16} className="text-brand-gold" strokeWidth={2.2} />
              }
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              {resolving ? (
                <div className="space-y-1.5">
                  <div className="h-3.5 w-28 rounded-md bg-white/10 animate-pulse" />
                  <div className="h-2.5 w-40 rounded-md bg-white/6 animate-pulse" />
                </div>
              ) : (
                <>
                  <p className="text-[14.5px] font-bold text-white leading-tight">
                    {areaName || 'Move the map to detect location'}
                  </p>
                  {fullAddress && (
                    <p className="text-[12px] text-brand-text-dim leading-snug mt-1 line-clamp-2">{fullAddress}</p>
                  )}
                  {detectedPincode && (
                    <span
                      className="inline-block mt-1.5 text-[11px] font-semibold text-brand-text-dim px-2 py-0.5 rounded-md"
                      style={{ background: 'rgba(255,255,255,0.08)' }}
                    >
                      {detectedPincode}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <button
            onClick={proceedToDetails}
            disabled={resolving || outOfRange || (!areaName && !fullAddress)}
            className="btn-primary w-full rounded-2xl py-4 text-[15px] font-black flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            <span>Confirm & add details</span>
            <ChevronRight size={17} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Details step ── */}
      {step === 'details' && (
        <div className="flex-1 overflow-y-auto" style={{ background: '#0d0f14' }}>
          <div className="px-4 pt-4 pb-10 space-y-3">

            {/* Location summary */}
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: 'rgba(216,178,78,0.07)', border: '1px solid rgba(216,178,78,0.18)' }}
            >
              <MapPin size={14} className="text-brand-gold flex-shrink-0" strokeWidth={2.2} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{areaName || fullAddress || 'Selected location'}</p>
                {detectedPincode && <p className="text-[11px] text-brand-gold/70 mt-0.5">{detectedPincode}</p>}
              </div>
              <button
                onClick={() => setStep('map')}
                className="text-brand-gold text-[12px] font-bold flex-shrink-0 hover:opacity-80 transition-opacity"
              >
                Change
              </button>
            </div>

            {/* Form fields */}
            <div
              className="rounded-2xl overflow-hidden divide-y"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', divideColor: 'rgba(255,255,255,0.06)' }}
            >
              <FieldRow
                icon={<Hash size={14} className="text-brand-gold" strokeWidth={2.5} />}
                label="House / Flat no."
                required
                error={houseError}
                errorMsg="Enter your house or flat number"
              >
                <input
                  ref={detailInputRef}
                  type="text"
                  placeholder="e.g. 4B, Door no. 23"
                  value={houseNumber}
                  onChange={(e) => { setHouseNumber(e.target.value); if (e.target.value.trim()) setHouseError(false); }}
                  className="detail-input"
                />
              </FieldRow>

              <FieldRow
                icon={<Building2 size={14} className="text-brand-gold" strokeWidth={2.5} />}
                label="Apartment / Building"
              >
                <input
                  type="text"
                  placeholder="e.g. Sri Sai Residency"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  className="detail-input"
                />
              </FieldRow>

              <FieldRow
                icon={<Home size={14} className="text-brand-gold" strokeWidth={2.5} />}
                label="Floor number"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 3"
                  value={floorNumber}
                  onChange={(e) => setFloorNumber(e.target.value)}
                  className="detail-input"
                />
              </FieldRow>

              <FieldRow
                icon={<Landmark size={14} className="text-brand-gold" strokeWidth={2.5} />}
                label="Landmark"
              >
                <input
                  type="text"
                  placeholder="e.g. Near SBI ATM, opposite school"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="detail-input"
                />
              </FieldRow>

              <FieldRow
                icon={<StickyNote size={14} className="text-brand-gold" strokeWidth={2.5} />}
                label="Delivery note"
                hint="optional"
              >
                <textarea
                  rows={2}
                  placeholder="e.g. Ring bell twice, leave at door…"
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  className="detail-input resize-none leading-relaxed"
                />
              </FieldRow>
            </div>

            {/* Pincode fallback */}
            {needsPincodeInput && (
              <div>
                <div
                  className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${pincodeError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}` }}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter 6-digit pincode *"
                    value={manualPincode}
                    onChange={(e) => { setManualPincode(e.target.value.replace(/\D/g, '').slice(0, 6)); setPincodeError(false); }}
                    className="flex-1 bg-transparent text-[14px] text-white placeholder:text-brand-text-dim outline-none"
                  />
                </div>
                {pincodeError && <p className="text-[12px] text-red-400 font-semibold mt-1.5 px-1">Enter a valid 6-digit pincode</p>}
              </div>
            )}

            {/* Confidence bar */}
            <ConfidenceBar score={confidenceScore} />

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              className="btn-primary w-full rounded-2xl py-4 text-[15px] font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <CheckCircle2 size={17} strokeWidth={2.5} />
              <span>Save address</span>
            </button>
          </div>
        </div>
      )}

      <style>{`
        .detail-input {
          width: 100%;
          background: transparent;
          font-size: 13.5px;
          color: #fff;
          outline: none;
          padding: 0;
        }
        .detail-input::placeholder { color: rgba(255,255,255,0.28); }
      `}</style>
    </div>,
    document.body,
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepPill({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-300"
      style={{
        background: done ? '#22c55e' : active ? '#D8B24E' : 'rgba(255,255,255,0.1)',
        color: done || active ? '#0d0f14' : 'rgba(255,255,255,0.4)',
      }}
    >
      {done ? <CheckCircle2 size={13} strokeWidth={3} /> : n}
    </div>
  );
}

function FieldRow({
  icon, label, required, hint, error, errorMsg, children,
}: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  hint?: string;
  error?: boolean;
  errorMsg?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3.5 space-y-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11.5px] font-bold text-brand-text-dim uppercase tracking-wide">{label}</span>
        {required && <span className="text-red-400 text-[13px] leading-none">*</span>}
        {hint && <span className="text-brand-text-dim/50 text-[11px] font-normal">({hint})</span>}
      </div>
      {children}
      {error && errorMsg && (
        <p className="text-[11.5px] text-red-400 font-semibold flex items-center gap-1">
          <AlertCircle size={11} strokeWidth={2.5} />
          {errorMsg}
        </p>
      )}
    </div>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const low = score < 60;
  return (
    <div
      className="rounded-2xl px-4 py-3.5 space-y-2.5"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-brand-text-dim">Address accuracy</span>
        <span className={`text-[12px] font-bold ${low ? 'text-amber-400' : 'text-emerald-400'}`}>{score}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${low ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {low && (
        <p className="text-[11.5px] text-amber-400 flex items-center gap-1.5 leading-snug">
          <AlertCircle size={11} strokeWidth={2.5} />
          Add more details so the rider can find you easily
        </p>
      )}
    </div>
  );
}
