import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReverseGeocodePayload {
  buildingName: string;
  area: string;
  fullAddress: string;
  pincode: string;
  hasSpecificPlace: boolean;
}

interface CachedRow {
  payload: ReverseGeocodePayload;
  provider: string;
  created_at: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_MAPS_KEY = Deno.env.get("GOOGLE_MAPS_KEY") ?? "";

const CACHE_MAX_AGE_DAYS = 60;

const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromComponents(components: any[]): { buildingName: string; area: string; pincode: string } {
  let buildingName = "";
  let area = "";
  let pincode = "";

  for (const c of components) {
    const types: string[] = c.types ?? [];
    if (types.includes("premise") || types.includes("point_of_interest") || types.includes("establishment")) {
      if (!buildingName) buildingName = c.long_name;
    }
    if (types.includes("sublocality_level_1") || types.includes("sublocality")) {
      if (!area) area = c.long_name;
    }
    if (types.includes("neighborhood") && !area) {
      area = c.long_name;
    }
    if (types.includes("postal_code")) {
      pincode = c.long_name.replace(/\s/g, "");
    }
  }

  // Fallback area from locality
  if (!area) {
    for (const c of components) {
      const types: string[] = c.types ?? [];
      if (types.includes("locality")) {
        area = c.long_name;
        break;
      }
    }
  }

  return { buildingName, area, pincode };
}

async function tryGoogle(lat: number, lng: number): Promise<{ payload: ReverseGeocodePayload; provider: string } | null> {
  if (!GOOGLE_MAPS_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=IN&key=${GOOGLE_MAPS_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) return null;

    const result = data.results[0];
    const { buildingName, area, pincode } = extractFromComponents(result.address_components ?? []);
    const fullAddress: string = result.formatted_address ?? area;

    return {
      provider: "google",
      payload: {
        buildingName,
        area,
        fullAddress,
        pincode,
        hasSpecificPlace: !!buildingName,
      },
    };
  } catch {
    return null;
  }
}

function keyForLatLng(lat: number, lng: number): { latKey: string; lngKey: string } {
  return { latKey: lat.toFixed(5), lngKey: lng.toFixed(5) };
}

async function readCache(lat: number, lng: number): Promise<CachedRow | null> {
  if (!admin) return null;
  const { latKey, lngKey } = keyForLatLng(lat, lng);
  const { data, error } = await admin
    .from("reverse_geocode_cache")
    .select("payload, provider, created_at")
    .eq("lat_key", latKey)
    .eq("lng_key", lngKey)
    .maybeSingle();
  if (error || !data) return null;
  const ageDays = (Date.now() - new Date(data.created_at).getTime()) / 86_400_000;
  if (ageDays > CACHE_MAX_AGE_DAYS) return null;
  return data as CachedRow;
}

async function writeCache(lat: number, lng: number, provider: string, payload: ReverseGeocodePayload) {
  if (!admin) return;
  const { latKey, lngKey } = keyForLatLng(lat, lng);
  await admin
    .from("reverse_geocode_cache")
    .upsert({ lat_key: latKey, lng_key: lngKey, payload, provider, created_at: new Date().toISOString() }, {
      onConflict: "lat_key,lng_key",
    });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(JSON.stringify({ error: "lat and lng required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const cached = await readCache(lat, lng);
    if (cached) {
      return new Response(JSON.stringify({ ...cached.payload, provider: cached.provider, cached: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const result = await tryGoogle(lat, lng);

    if (!result) {
      return new Response(JSON.stringify({
        buildingName: "",
        area: "",
        fullAddress: "",
        pincode: "",
        hasSpecificPlace: false,
        provider: "none",
        cached: false,
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    writeCache(lat, lng, result.provider, result.payload).catch(() => {});

    return new Response(JSON.stringify({ ...result.payload, provider: result.provider, cached: false }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
