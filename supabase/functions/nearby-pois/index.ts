import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Poi {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
}

const MAPBOX_TOKEN = Deno.env.get("MAPBOX_TOKEN") || "pk.eyJ1IjoidmlyYXRrYXJ0aGlrIiwiYSI6ImNtcWtpbjN0OTAwemkyc3IxNWY1Mnl2MjAifQ.89nIW9ur4faNU7n8BAkHmw";

async function tryMapbox(
  centerLat: number,
  centerLng: number,
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<Poi[] | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const sessionToken = crypto.randomUUID();
    const params = new URLSearchParams({
      q: "",
      proximity: `${centerLng},${centerLat}`,
      bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
      limit: "25",
      session_token: sessionToken,
      access_token: MAPBOX_TOKEN,
    });
    // Use forward search with a broad wildcard to get nearby POIs in bbox
    const url = `https://api.mapbox.com/search/searchbox/v1/category/place?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any[] = Array.isArray(data?.features) ? data.features : [];
    return features
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any): Poi | null => {
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        const name: string = f.properties?.name || "";
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) return null;
        const kind: string =
          f.properties?.poi_category?.[0] ||
          f.properties?.feature_type ||
          "place";
        return {
          id: `mapbox-${f.properties?.mapbox_id || `${lat}-${lng}`}`,
          name,
          lat,
          lng,
          kind,
        };
      })
      .filter((p): p is Poi => p !== null);
  } catch {
    return null;
  }
}

async function tryOverpass(minLat: number, minLng: number, maxLat: number, maxLng: number): Promise<Poi[] | null> {
  try {
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
    const query = `[out:json][timeout:8];(node[name](${bbox});way[name](${bbox}););out tags center 60;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements: any[] = Array.isArray(data?.elements) ? data.elements : [];
    return elements
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((el: any): Poi | null => {
        const name: string = el.tags?.name || el.tags?.["name:en"] || "";
        if (!name) return null;
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        const tags = el.tags ?? {};
        const kind = tags.shop || tags.amenity || tags.tourism || tags.office || tags.leisure || tags.healthcare || tags.craft || tags.building || "place";
        return { id: `osm-${el.type}-${el.id}`, name, lat, lng, kind };
      })
      .filter((p): p is Poi => p !== null);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const minLat = Number(body.minLat);
    const minLng = Number(body.minLng);
    const maxLat = Number(body.maxLat);
    const maxLng = Number(body.maxLng);

    if (![minLat, minLng, maxLat, maxLng].every(Number.isFinite)) {
      return new Response(JSON.stringify({ error: "minLat/minLng/maxLat/maxLng required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const result =
      (await tryMapbox(centerLat, centerLng, minLat, minLng, maxLat, maxLng)) ||
      (await tryOverpass(minLat, minLng, maxLat, maxLng)) ||
      [];

    const filtered = result.filter((p) =>
      p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng
    );

    const provider = filtered.length > 0
      ? (filtered[0].id.startsWith("mapbox") ? "mapbox" : filtered[0].id.startsWith("osm") ? "osm" : "none")
      : "none";

    return new Response(JSON.stringify({ pois: filtered, provider }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
