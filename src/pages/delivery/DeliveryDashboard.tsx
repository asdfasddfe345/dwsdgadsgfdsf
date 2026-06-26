import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, LogOut, MapPin, Navigation, Phone,
  Loader2, RefreshCw, User, ShoppingBag, ChevronDown, ChevronUp,
  Route, Timer, KeyRound, ArrowLeft, ChefHat, CheckCircle2, MessageCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { getGoogleMapsKey, getGoogleMapsLoader, STORE_LAT, STORE_LNG, DARK_MAP_STYLE } from '../../lib/googlemaps';
import { storeAddressShort, storePhoneHref, storeWhatsAppHref } from '../../lib/storeInfo';
import type { Order } from '../../types';

interface OrderItemRow {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  customizations: { group_name: string; option_name: string; price: number }[] | null;
}

interface RouteInfo {
  durationMin: number;
  distanceKm: number;
}

const DELIVERY_ACTIVE_STATUSES = ['confirmed', 'preparing', 'packed', 'out_for_delivery'] as const;

const DELIVERY_STEPS = [
  { key: 'confirmed', label: 'Order Accepted' },
  { key: 'preparing', label: 'Chef Preparing' },
  { key: 'packed', label: 'Ready for Pickup' },
  { key: 'out_for_delivery', label: 'Picked Up' },
  { key: 'on_the_way', label: 'On the Way' },
  { key: 'delivered', label: 'Delivered' },
] as const;

function getStepIndex(status: Order['status']): number {
  if (status === 'confirmed') return 0;
  if (status === 'preparing') return 1;
  if (status === 'packed') return 2;
  if (status === 'out_for_delivery') return 3;
  if (status === 'delivered') return 5;
  return -1;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
}

function usePrepCountdown(order: Order) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (order.status !== 'preparing' && order.status !== 'confirmed') {
      setRemaining(null);
      return;
    }
    if (!order.estimated_minutes || !order.accepted_at) {
      setRemaining(null);
      return;
    }
    const endMs = new Date(order.accepted_at).getTime() + order.estimated_minutes * 60_000;
    function tick() {
      const secs = Math.max(0, Math.round((endMs - Date.now()) / 1000));
      setRemaining(secs);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.status, order.estimated_minutes, order.accepted_at]);

  return remaining;
}

function formatCountdown(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StatusStrip({ status }: { status: Order['status'] }) {
  const activeIdx = getStepIndex(status);
  const displayIdx = status === 'out_for_delivery' ? 4 : activeIdx;

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
      {DELIVERY_STEPS.map((step, i) => {
        const done = i < displayIdx;
        const active = i === displayIdx;
        return (
          <div key={step.key} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                done
                  ? 'bg-emerald-500 border-emerald-500'
                  : active
                    ? 'bg-sky-500 border-sky-500 animate-pulse'
                    : 'bg-transparent border-white/20'
              }`}>
                {done ? (
                  <CheckCircle2 size={12} className="text-white" />
                ) : (
                  <span className={`text-[8px] font-bold ${active ? 'text-white' : 'text-white/30'}`}>{i + 1}</span>
                )}
              </div>
              <span className={`text-[9px] font-semibold whitespace-nowrap ${
                done ? 'text-emerald-400' : active ? 'text-sky-400' : 'text-white/25'
              }`}>{step.label}</span>
            </div>
            {i < DELIVERY_STEPS.length - 1 && (
              <div className={`w-4 h-0.5 mt-[-10px] mx-0.5 flex-shrink-0 rounded-full ${done ? 'bg-emerald-500' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RouteMap({ order }: { order: Order }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [routeError, setRouteError] = useState(false);

  const hasCoords = order.delivery_lat != null && order.delivery_lng != null;

  useEffect(() => {
    if (!hasCoords || !mapContainerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const key = await getGoogleMapsKey();
        if (!key) return;
        await getGoogleMapsLoader(key).load();
        if (cancelled || !mapContainerRef.current) return;

        const map = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: STORE_LAT, lng: STORE_LNG },
          zoom: 12,
          mapTypeId: 'roadmap',
          styles: DARK_MAP_STYLE,
          backgroundColor: '#0f1117',
          disableDefaultUI: true,
          gestureHandling: 'cooperative',
          clickableIcons: false,
        });
        mapRef.current = map;

        const storeEl = document.createElement('div');
        storeEl.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#D8B24E;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(216,178,78,0.5);';
        storeEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0f1117" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
        new window.google.maps.marker.AdvancedMarkerElement({ position: { lat: STORE_LAT, lng: STORE_LNG }, map, content: storeEl });

        const destEl = document.createElement('div');
        destEl.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#0ea5e9;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(14,165,233,0.5);';
        destEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
        new window.google.maps.marker.AdvancedMarkerElement({ position: { lat: order.delivery_lat!, lng: order.delivery_lng! }, map, content: destEl });

        const directionsService = new window.google.maps.DirectionsService();
        const renderer = new window.google.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          polylineOptions: { strokeColor: '#38bdf8', strokeWeight: 4, strokeOpacity: 0.9 },
        });
        rendererRef.current = renderer;

        directionsService.route({
          origin: { lat: STORE_LAT, lng: STORE_LNG },
          destination: { lat: order.delivery_lat!, lng: order.delivery_lng! },
          travelMode: window.google.maps.TravelMode.DRIVING,
          region: 'IN',
        }, (result, status) => {
          if (cancelled) return;
          if (status === window.google.maps.DirectionsStatus.OK && result) {
            renderer.setDirections(result);
            const leg = result.routes[0]?.legs[0];
            if (leg) {
              setRouteInfo({
                durationMin: Math.ceil((leg.duration?.value ?? 0) / 60),
                distanceKm: Math.round((leg.distance?.value ?? 0) / 100) / 10,
              });
            }
          } else {
            setRouteError(true);
            const bounds = new window.google.maps.LatLngBounds();
            bounds.extend({ lat: STORE_LAT, lng: STORE_LNG });
            bounds.extend({ lat: order.delivery_lat!, lng: order.delivery_lng! });
            map.fitBounds(bounds, 52);
          }
          setLoadingRoute(false);
        });
      } catch {
        if (!cancelled) { setRouteError(true); setLoadingRoute(false); }
      }
    })();

    return () => {
      cancelled = true;
      rendererRef.current?.setMap(null);
      rendererRef.current = null;
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.delivery_lat, order.delivery_lng, hasCoords]);

  if (!hasCoords) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-sky-500/20">
      {!loadingRoute && !routeError && routeInfo && (
        <div className="flex items-center gap-4 px-3 py-2 bg-sky-500/10 border-b border-sky-500/15">
          <div className="flex items-center gap-1.5 text-sky-400">
            <Timer size={13} />
            <span className="text-[12px] font-bold">~{routeInfo.durationMin} min</span>
          </div>
          <div className="flex items-center gap-1.5 text-brand-text-dim">
            <Route size={13} />
            <span className="text-[12px] font-semibold">{routeInfo.distanceKm} km</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-brand-text-dim">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-gold inline-block" /> Store</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Customer</span>
          </div>
        </div>
      )}
      {loadingRoute ? (
        <div className="h-[200px] bg-brand-bg flex items-center justify-center gap-2 text-brand-text-dim text-[13px]">
          <Loader2 size={16} className="animate-spin text-sky-400" /><span>Loading route...</span>
        </div>
      ) : routeError ? (
        <div className="h-[140px] bg-brand-bg flex items-center justify-center text-brand-text-dim text-[13px]">Could not load route</div>
      ) : (
        <div ref={mapContainerRef} style={{ height: 220 }} />
      )}
    </div>
  );
}

function OtpVerifyDialog({
  order,
  onConfirmed,
  onClose,
}: {
  order: Order;
  onConfirmed: () => void;
  onClose: () => void;
}) {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  async function handleVerify() {
    if (otp.trim().length < 4) { setError('Enter the 4-digit OTP'); return; }
    setLoading(true);
    setError('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const res = await fetch(`${supabaseUrl}/functions/v1/confirm-delivery-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({ orderId: order.id, otp: otp.trim() }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error === 'Incorrect OTP' ? 'Incorrect OTP. Please try again.' : (data.error ?? 'Verification failed'));
        return;
      }
      showToast(`Order ${order.order_id} delivered!`);
      onConfirmed();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-brand-surface rounded-2xl border border-brand-border p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
            <KeyRound size={18} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-[15px] font-extrabold text-white">Confirm Delivery</h3>
            <p className="text-[12px] text-brand-text-dim">Ask the customer for their OTP</p>
          </div>
        </div>
        <p className="text-[13px] text-brand-text-muted mb-4">
          The customer sees a 4-digit OTP in their tracking screen. Enter it here to confirm delivery.
        </p>
        <input
          type="number"
          inputMode="numeric"
          maxLength={4}
          placeholder="Enter OTP"
          value={otp}
          onChange={(e) => { setOtp(e.target.value.slice(0, 4)); setError(''); }}
          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 text-white text-center text-2xl font-extrabold tracking-[0.3em] placeholder:text-brand-text-dim placeholder:text-base placeholder:tracking-normal focus:outline-none focus:border-emerald-500/50 mb-3"
        />
        {error && <p className="text-rose-400 text-[12px] text-center mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 py-3 rounded-xl border border-white/15 text-brand-text-muted text-sm font-semibold hover:bg-white/5 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => void handleVerify()}
            disabled={loading || otp.trim().length < 4}
            className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Verifying...' : 'Confirm Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderDetail({
  order,
  items,
  onBack,
  onStatusUpdated,
}: {
  order: Order;
  items: OrderItemRow[];
  onBack: () => void;
  onStatusUpdated: (id: string, newStatus: Order['status']) => void;
}) {
  const [updatingPickup, setUpdatingPickup] = useState(false);
  const [showOtpDialog, setShowOtpDialog] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const { showToast } = useToast();
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdown = usePrepCountdown(order);

  const hasCoords = order.delivery_lat != null && order.delivery_lng != null;
  const mapsHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${order.delivery_lat},${order.delivery_lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`;

  // Start GPS location broadcasting when out for delivery
  useEffect(() => {
    if (order.status !== 'out_for_delivery') {
      if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
      return;
    }
    if (!navigator.geolocation) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    async function pushLocation() {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const session = (await supabase.auth.getSession()).data.session;
          if (!session) return;
          await fetch(`${supabaseUrl}/functions/v1/update-delivery-location`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: anonKey,
            },
            body: JSON.stringify({ orderId: order.id, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
        } catch { /* silent */ }
      });
    }

    void pushLocation();
    gpsIntervalRef.current = setInterval(() => { void pushLocation(); }, 15_000);
    return () => {
      if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    };
  }, [order.status, order.id]);

  async function handleConfirmPickup() {
    if (updatingPickup) return;
    setUpdatingPickup(true);
    try {
      const otp = String(Math.floor(1000 + Math.random() * 9000));
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'out_for_delivery',
          delivery_otp: otp,
          delivery_partner_id: (await supabase.auth.getUser()).data.user?.id ?? null,
          picked_up_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (error) throw error;
      showToast(`Order ${order.order_id} picked up!`);
      onStatusUpdated(order.id, 'out_for_delivery');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to confirm pickup', 'error');
    } finally {
      setUpdatingPickup(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-brand-surface-light text-brand-text-dim hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h2 className="text-[16px] font-extrabold text-white leading-none">{order.order_id}</h2>
          <p className="text-[12px] text-brand-text-dim mt-0.5">{timeAgo(order.placed_at)}</p>
        </div>
        <span className="font-bold text-brand-gold text-lg">₹{order.total}</span>
      </div>

      {/* Status strip */}
      <div className="rounded-2xl border border-brand-border bg-brand-surface p-3">
        <StatusStrip status={order.status} />
      </div>

      {/* Prep countdown banner */}
      {(order.status === 'preparing' || order.status === 'confirmed') && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 flex items-center gap-3">
          <ChefHat size={20} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-bold text-amber-300">
              {order.status === 'preparing' ? 'Your order is being prepared' : 'Order accepted — preparing soon'}
            </p>
            {countdown !== null && countdown > 0 && (
              <p className="text-[12px] text-amber-400/70 mt-0.5">Est. ready in {formatCountdown(countdown)}</p>
            )}
            {countdown === 0 && (
              <p className="text-[12px] text-emerald-400 mt-0.5">Should be ready any moment!</p>
            )}
          </div>
        </div>
      )}

      {/* Restaurant info */}
      <div className="rounded-2xl border border-brand-border bg-brand-surface p-4 space-y-2">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-brand-text-dim mb-2">Restaurant</p>
        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-brand-gold flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-brand-text-muted leading-snug flex-1">{storeAddressShort}</p>
        </div>
        <div className="flex gap-2">
          <a href={storePhoneHref} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-surface-light border border-brand-border text-[12px] font-bold text-white hover:bg-white/10 transition-colors">
            <Phone size={12} className="text-brand-gold" /> Call Store
          </a>
          <a href={storeWhatsAppHref} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-surface-light border border-brand-border text-[12px] font-bold text-white hover:bg-white/10 transition-colors">
            <MessageCircle size={12} className="text-emerald-400" /> WhatsApp
          </a>
        </div>
      </div>

      {/* Customer info */}
      <div className="rounded-2xl border border-brand-border bg-brand-surface p-4 space-y-3">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-brand-text-dim">Customer</p>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-surface-light rounded-xl flex items-center justify-center">
            <User size={16} className="text-brand-text-dim" />
          </div>
          <span className="font-bold text-white text-[14px]">{order.customer_name}</span>
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400 text-[12px] font-bold hover:bg-sky-500/20 transition-colors">
              <Phone size={12} /> Call
            </a>
          )}
        </div>

        {/* Delivery address */}
        <div className="flex items-start gap-2 bg-brand-surface-light rounded-xl p-3">
          <MapPin size={14} className="text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            {order.house_number && <p className="text-[13px] font-semibold text-white">{order.house_number}{order.building_name ? `, ${order.building_name}` : ''}</p>}
            {order.floor_number && <p className="text-[11px] text-brand-text-dim">{order.floor_number}</p>}
            <p className="text-[12px] text-brand-text-muted leading-snug mt-0.5">{order.address}</p>
            {order.landmark && <p className="text-[11px] text-brand-text-dim mt-0.5">Near: {order.landmark}</p>}
            {order.delivery_instructions && (
              <p className="text-[11px] text-amber-400 mt-1 italic">"{order.delivery_instructions}"</p>
            )}
          </div>
        </div>

        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[13px] font-bold transition-colors shadow-md shadow-sky-500/20"
        >
          <Navigation size={14} /> Open Navigation
        </a>
      </div>

      {/* Route map toggle */}
      {hasCoords && (
        <>
          <button
            onClick={() => setShowRouteMap((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 text-sky-400 text-[13px] font-bold hover:bg-sky-500/10 transition-colors"
          >
            <div className="flex items-center gap-2"><Route size={14} /> View Route</div>
            {showRouteMap ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showRouteMap && <RouteMap order={order} />}
        </>
      )}

      {/* Items */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-brand-border bg-brand-surface p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-brand-text-dim mb-3">Items</p>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-[12px] font-bold text-brand-gold bg-brand-gold/10 rounded-md px-1.5 py-0.5 tabular-nums flex-shrink-0">×{item.quantity}</span>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{item.item_name}</p>
                    {item.customizations && item.customizations.length > 0 && (
                      <p className="text-[11px] text-brand-text-dim">{item.customizations.map((c) => c.option_name).join(', ')}</p>
                    )}
                  </div>
                </div>
                <span className="text-[12px] text-brand-text-dim tabular-nums flex-shrink-0">₹{item.unit_price * item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {order.status === 'packed' && (
        <button
          onClick={() => void handleConfirmPickup()}
          disabled={updatingPickup}
          className="w-full py-4 rounded-2xl font-bold text-[15px] bg-sky-500 hover:bg-sky-600 text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25"
        >
          {updatingPickup ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
          Confirm Pickup
        </button>
      )}

      {order.status === 'out_for_delivery' && (
        <button
          onClick={() => setShowOtpDialog(true)}
          className="w-full py-4 rounded-2xl font-bold text-[15px] bg-emerald-500 hover:bg-emerald-600 text-white transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
        >
          <KeyRound size={18} /> Confirm Delivery via OTP
        </button>
      )}

      {showOtpDialog && (
        <OtpVerifyDialog
          order={order}
          onConfirmed={() => { setShowOtpDialog(false); onStatusUpdated(order.id, 'delivered'); onBack(); }}
          onClose={() => setShowOtpDialog(false)}
        />
      )}
    </div>
  );
}

export default function DeliveryDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, OrderItemRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { profile, signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_type', 'delivery')
      .in('status', [...DELIVERY_ACTIVE_STATUSES])
      .order('placed_at', { ascending: true });

    if (error || !mountedRef.current) return;

    const fetchedOrders = (data ?? []) as Order[];
    setOrders(fetchedOrders);
    setLoading(false);

    const ids = fetchedOrders.map((o) => o.id);
    if (!ids.length) { setItemsMap({}); return; }

    const { data: items } = await supabase.from('order_items').select('*').in('order_id', ids);
    if (!mountedRef.current) return;

    const map: Record<string, OrderItemRow[]> = {};
    (items ?? []).forEach((item) => {
      const oi = item as OrderItemRow;
      if (!map[oi.order_id]) map[oi.order_id] = [];
      map[oi.order_id].push(oi);
    });
    setItemsMap(map);
  }, []);

  useEffect(() => {
    void loadOrders();
    const channel = supabase
      .channel('delivery-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'order_type=eq.delivery' }, () => { void loadOrders(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadOrders]);

  function handleStatusUpdated(id: string, newStatus: Order['status']) {
    if (newStatus === 'delivered') {
      setOrders((prev) => prev.filter((o) => o.id !== id));
      showToast('Order marked as delivered!');
    } else {
      setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: newStatus } : o));
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/delivery/login', { replace: true });
  }

  const packed = orders.filter((o) => o.status === 'packed');
  const outForDelivery = orders.filter((o) => o.status === 'out_for_delivery');
  const upcoming = orders.filter((o) => o.status === 'confirmed' || o.status === 'preparing');

  const selectedOrder = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) ?? null : null;

  function OrderCard({ order }: { order: Order }) {
    const items = itemsMap[order.id] ?? [];
    const itemCount = items.reduce((s, i) => s + i.quantity, 0);

    return (
      <button
        type="button"
        onClick={() => setSelectedOrderId(order.id)}
        className={`w-full text-left rounded-2xl border p-4 transition-all hover:border-sky-500/40 hover:shadow-lg ${
          order.status === 'packed'
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : order.status === 'out_for_delivery'
              ? 'bg-sky-500/5 border-sky-500/20'
              : 'bg-brand-surface border-brand-border'
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className="font-bold text-white text-[15px]">{order.order_id}</span>
            <p className="text-[11px] text-brand-text-dim mt-0.5">{timeAgo(order.placed_at)}</p>
          </div>
          <span className="font-bold text-brand-gold text-base tabular-nums">{itemCount} item{itemCount !== 1 ? 's' : ''} · ₹{order.total}</span>
        </div>
        <div className="flex items-center gap-2">
          <User size={12} className="text-brand-text-dim flex-shrink-0" />
          <span className="text-[13px] font-semibold text-white flex-1 truncate">{order.customer_name}</span>
          {order.status === 'packed' && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Ready</span>
          )}
          {order.status === 'out_for_delivery' && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">En Route</span>
          )}
          {order.status === 'preparing' && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Preparing</span>
          )}
          {order.status === 'confirmed' && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">Confirmed</span>
          )}
        </div>
        <div className="flex items-start gap-1.5 mt-2">
          <MapPin size={11} className="text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            {(order.house_number || order.building_name) && (
              <p className="text-[12px] font-semibold text-white leading-snug">
                {[order.house_number, order.building_name].filter(Boolean).join(', ')}
              </p>
            )}
            {order.floor_number && (
              <p className="text-[11px] text-brand-text-dim leading-snug">{order.floor_number}</p>
            )}
            <p className="text-[11px] text-brand-text-muted leading-snug">{order.address}</p>
            {order.pincode && (
              <p className="text-[11px] text-brand-text-dim leading-snug">PIN: {order.pincode}</p>
            )}
            {order.landmark && (
              <p className="text-[11px] text-brand-text-dim leading-snug">Near: {order.landmark}</p>
            )}
            {order.delivery_instructions && (
              <p className="text-[11px] text-amber-400 italic leading-snug mt-0.5">"{order.delivery_instructions}"</p>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <header className="sticky top-0 z-40 bg-brand-surface/95 backdrop-blur-md border-b border-brand-border">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {selectedOrder ? (
              <button onClick={() => setSelectedOrderId(null)} className="p-1.5 rounded-lg text-brand-text-dim hover:text-white hover:bg-brand-surface-light transition-colors">
                <ArrowLeft size={16} />
              </button>
            ) : (
              <div className="w-8 h-8 bg-sky-500/15 border border-sky-500/20 rounded-lg flex items-center justify-center">
                <Truck size={16} className="text-sky-400" />
              </div>
            )}
            <div>
              <h1 className="text-[14px] font-extrabold text-white leading-none">
                {selectedOrder ? selectedOrder.order_id : 'Delivery'}
              </h1>
              <p className="text-[11px] text-brand-text-dim leading-none mt-0.5">{profile?.full_name || 'Staff'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!selectedOrder && (
              <button onClick={() => void loadOrders()} className="p-2 rounded-lg text-brand-text-dim hover:text-white hover:bg-brand-surface-light transition-colors" aria-label="Refresh">
                <RefreshCw size={15} />
              </button>
            )}
            <button onClick={() => void handleSignOut()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-brand-text-dim hover:text-red-400 hover:bg-red-500/10 text-[13px] font-semibold transition-colors">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-sky-400" />
          </div>
        ) : selectedOrder ? (
          <OrderDetail
            order={selectedOrder}
            items={itemsMap[selectedOrder.id] ?? []}
            onBack={() => setSelectedOrderId(null)}
            onStatusUpdated={handleStatusUpdated}
          />
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-brand-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={28} className="text-brand-text-dim" />
            </div>
            <p className="text-white font-bold text-lg">No active deliveries</p>
            <p className="text-brand-text-dim text-sm mt-1">New delivery orders will appear here</p>
          </div>
        ) : (
          <div className="space-y-6">
            {packed.length > 0 && (
              <section>
                <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400 mb-3">Ready for Pickup ({packed.length})</h2>
                <div className="space-y-3">{packed.map((o) => <OrderCard key={o.id} order={o} />)}</div>
              </section>
            )}
            {outForDelivery.length > 0 && (
              <section>
                <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-sky-400 mb-3">Out for Delivery ({outForDelivery.length})</h2>
                <div className="space-y-3">{outForDelivery.map((o) => <OrderCard key={o.id} order={o} />)}</div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-brand-text-dim mb-3">Upcoming ({upcoming.length})</h2>
                <div className="space-y-3">{upcoming.map((o) => <OrderCard key={o.id} order={o} />)}</div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
