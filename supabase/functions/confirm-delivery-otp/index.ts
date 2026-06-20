import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  orderId?: string;
  otp?: string;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const body = await req.json() as RequestBody;
    const { orderId, otp } = body;

    if (!orderId || !otp) return json({ error: "orderId and otp are required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "delivery" && profile?.role !== "admin") {
      return json({ error: "Delivery staff access required" }, 403);
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, order_id, status, order_type, delivery_otp")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) return json({ error: "Order not found" }, 404);
    if (order.order_type !== "delivery") return json({ error: "Not a delivery order" }, 400);
    if (order.status !== "out_for_delivery") return json({ error: "Order is not out for delivery" }, 409);

    if (!order.delivery_otp || order.delivery_otp.trim() !== otp.trim()) {
      return json({ error: "Incorrect OTP" }, 422);
    }

    const { error: updateError } = await adminClient
      .from("orders")
      .update({
        status: "delivered",
        completed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateError) throw updateError;

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
