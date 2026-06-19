import { useState, useEffect, useCallback } from 'react';
import { MapPin, Pencil, Map, Home, Briefcase, MoreHorizontal, Plus, Trash2, Loader2, Star } from 'lucide-react';
import MapLocationPicker from './MapLocationPicker';
import type { MapConfirmData, SavedAddress, AddressLabel } from '../types';
import { customerSupabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface LocationPickerProps {
  address: string;
  pincode: string;
  onAddressChange: (address: string) => void;
  onPincodeChange: (pincode: string) => void;
  onLatChange?: (lat: number | null) => void;
  onLngChange?: (lng: number | null) => void;
  onExtendedConfirm?: (data: MapConfirmData) => void;
}

const LABEL_ICONS: Record<AddressLabel, typeof Home> = {
  Home : Home,
  Work : Briefcase,
  Other: MoreHorizontal,
};

function AddressLabelBadge({ label }: { label: AddressLabel }) {
  const Icon = LABEL_ICONS[label] ?? MoreHorizontal;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-brand-surface-light text-brand-text-dim">
      <Icon size={9} strokeWidth={2.5} />
      {label}
    </span>
  );
}

export default function LocationPicker({
  address,
  pincode,
  onAddressChange,
  onPincodeChange,
  onLatChange,
  onLngChange,
  onExtendedConfirm,
}: LocationPickerProps) {
  const { user } = useAuth();
  const [mapOpen, setMapOpen] = useState(false);
  const [savedLat, setSavedLat] = useState<number | null>(null);
  const [savedLng, setSavedLng] = useState<number | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load saved addresses ─────────────────────────────────────────────────
  const loadSavedAddresses = useCallback(async () => {
    if (!user) return;
    setLoadingAddresses(true);
    try {
      const { data } = await customerSupabase
        .from('saved_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      setSavedAddresses((data as SavedAddress[]) ?? []);
    } catch { /* ignore */ }
    finally { setLoadingAddresses(false); }
  }, [user]);

  useEffect(() => { void loadSavedAddresses(); }, [loadSavedAddresses]);

  // ── Apply a saved address ────────────────────────────────────────────────
  function useSavedAddress(sa: SavedAddress) {
    const parts = [sa.house_number, sa.building_name, sa.address].filter(Boolean);
    onAddressChange(parts.join(', '));
    if (sa.pincode) onPincodeChange(sa.pincode);
    onLatChange?.(sa.lat ?? null);
    onLngChange?.(sa.lng ?? null);
    if (sa.lat != null) setSavedLat(sa.lat);
    if (sa.lng != null) setSavedLng(sa.lng);
    onExtendedConfirm?.({
      address             : parts.join(', '),
      pincode             : sa.pincode,
      lat                 : sa.lat ?? 0,
      lng                 : sa.lng ?? 0,
      houseNumber         : sa.house_number,
      buildingName        : sa.building_name,
      floorNumber         : sa.floor_number,
      landmark            : sa.landmark,
      deliveryInstructions: '',
      detectedGpsLat      : null,
      detectedGpsLng      : null,
      confidenceScore     : 100,
      pinManuallyMoved    : false,
      savedAddressId      : sa.id,
    });
  }

  // ── Delete a saved address ───────────────────────────────────────────────
  async function deleteAddress(id: string) {
    setDeletingId(id);
    try {
      await customerSupabase.from('saved_addresses').delete().eq('id', id);
      setSavedAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  // ── Map confirm ──────────────────────────────────────────────────────────
  function handleConfirm(data: MapConfirmData) {
    onAddressChange(data.address);
    if (data.pincode.length === 6) onPincodeChange(data.pincode);
    onLatChange?.(data.lat);
    onLngChange?.(data.lng);
    setSavedLat(data.lat);
    setSavedLng(data.lng);
    onExtendedConfirm?.(data);
    setMapOpen(false);
    // Offer to save this address for logged-in users
    if (user) void offerSaveAddress(data);
  }

  // ── Auto-save address for logged-in users ────────────────────────────────
  async function offerSaveAddress(data: MapConfirmData) {
    if (!user || !data.houseNumber) return;
    // Don't duplicate: check if an existing address with same lat/lng already exists
    const alreadyExists = savedAddresses.some(
      (a) => a.lat != null && Math.abs(a.lat - data.lat) < 0.0001 && a.lng != null && Math.abs(a.lng - data.lng) < 0.0001,
    );
    if (alreadyExists) return;
    const label: AddressLabel = savedAddresses.length === 0 ? 'Home' : 'Other';
    const isDefault = savedAddresses.length === 0;
    try {
      const { data: inserted } = await customerSupabase
        .from('saved_addresses')
        .insert({
          user_id     : user.id,
          label,
          house_number: data.houseNumber,
          building_name: data.buildingName,
          floor_number: data.floorNumber,
          landmark    : data.landmark,
          address     : data.address,
          pincode     : data.pincode,
          lat         : data.lat,
          lng         : data.lng,
          is_default  : isDefault,
        })
        .select()
        .single();
      if (inserted) setSavedAddresses((prev) => [inserted as SavedAddress, ...prev]);
    } catch { /* ignore — saving is best-effort */ }
  }

  return (
    <>
      {/* ── Saved addresses list ── */}
      {user && savedAddresses.length > 0 && !address && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-brand-text-dim uppercase tracking-wide px-0.5">Saved addresses</p>
          {loadingAddresses ? (
            <div className="flex items-center gap-2 text-brand-text-dim text-[12px] py-2">
              <Loader2 size={13} className="animate-spin" />
              <span>Loading saved addresses...</span>
            </div>
          ) : (
            savedAddresses.map((sa) => (
              <div key={sa.id} className="flex items-start gap-3 rounded-xl border border-brand-border px-3 py-2.5 hover:border-brand-gold/30 transition-colors group" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: 'rgba(216,178,78,0.08)' }}>
                  {(() => { const Icon = LABEL_ICONS[sa.label] ?? MoreHorizontal; return <Icon size={14} className="text-brand-gold" strokeWidth={2.2} />; })()}
                </div>
                <button type="button" onClick={() => useSavedAddress(sa)} className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <AddressLabelBadge label={sa.label} />
                    {sa.is_default && <Star size={9} className="text-brand-gold fill-brand-gold" />}
                  </div>
                  <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2">
                    {[sa.house_number, sa.building_name, sa.address].filter(Boolean).join(', ')}
                  </p>
                  {sa.landmark && <p className="text-[11px] text-brand-text-dim mt-0.5 truncate">Near {sa.landmark}</p>}
                  {sa.pincode && <p className="text-[11px] text-brand-text-dim">{sa.pincode}</p>}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAddress(sa.id)}
                  disabled={deletingId === sa.id}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-brand-text-dim hover:text-red-400 flex-shrink-0 mt-0.5"
                >
                  {deletingId === sa.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} strokeWidth={2} />}
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-brand-border text-brand-text-dim text-[13px] hover:border-brand-gold/30 hover:text-brand-gold transition-colors"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="font-semibold">Add new address</span>
          </button>
        </div>
      )}

      {/* ── Active address display or pick-from-map button ── */}
      {address ? (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="w-full flex items-start gap-3 rounded-xl border border-emerald-500/25 px-4 py-3 text-left transition-colors hover:border-emerald-500/40 group"
          style={{ background: 'rgba(16,185,129,0.07)' }}
        >
          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <MapPin size={15} className="text-emerald-400" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-emerald-400 leading-snug line-clamp-2">{address}</p>
            {pincode && <p className="text-[11px] text-emerald-300/60 mt-0.5">{pincode}</p>}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
            <Pencil size={12} className="text-emerald-400/50 group-hover:text-emerald-400 transition-colors" strokeWidth={2.2} />
            <span className="text-[11px] font-semibold text-emerald-400/50 group-hover:text-emerald-400 transition-colors">Edit</span>
          </div>
        </button>
      ) : (
        !(user && savedAddresses.length > 0) && (
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed border-brand-gold/30 text-left transition-all hover:border-brand-gold/50 hover:bg-brand-gold/5 active:scale-[0.98]"
          >
            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(216,178,78,0.12)' }}>
              <Map size={16} className="text-brand-gold" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[14px] font-bold text-brand-gold">Set delivery location</p>
              <p className="text-[11px] text-brand-text-dim mt-0.5">Pin your exact address on the map</p>
            </div>
          </button>
        )
      )}

      {mapOpen && (
        <MapLocationPicker
          initialLat={savedLat}
          initialLng={savedLng}
          onConfirm={handleConfirm}
          onClose={() => setMapOpen(false)}
        />
      )}
    </>
  );
}
