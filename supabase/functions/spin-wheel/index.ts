import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { pickSpinPrize } from "../_shared/spin-rewards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const REWARD_VALID_HOURS = 24;

interface SpinPrizeRow {
  id: string;
  label: string;
  kind: string;
  percent: number;
  max_discount: number | null;
  weight: number;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The daily limit follows the shop's calendar day, not UTC.
function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Sign in to spin the wheel" }, 401);
    }

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

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ success: false, error: "Sign in to spin the wheel" }, 401);
    }

    const userId = user.id;
    const spinDay = todayInIndia();

    async function findTodaysReward() {
      const { data, error } = await adminClient
        .from("spin_rewards")
        .select("*")
        .eq("user_id", userId)
        .eq("spin_day", spinDay)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    }

    const existingReward = await findTodaysReward();
    if (existingReward) {
      return jsonResponse({ success: true, alreadySpun: true, reward: existingReward });
    }

    const { data: prizes, error: prizesError } = await adminClient
      .from("spin_prizes")
      .select("id, label, kind, percent, max_discount, weight")
      .eq("is_active", true)
      .gt("weight", 0)
      .order("display_order");

    if (prizesError) {
      throw prizesError;
    }

    if (!prizes?.length) {
      return jsonResponse({ success: false, error: "The wheel is not available right now" }, 409);
    }

    const prize = pickSpinPrize(prizes as SpinPrizeRow[]);

    const { data: reward, error: rewardError } = await adminClient
      .from("spin_rewards")
      .insert({
        user_id: userId,
        prize_id: prize.id,
        label: prize.label,
        kind: prize.kind,
        percent: prize.percent,
        max_discount: prize.max_discount,
        spin_day: spinDay,
        expires_at: new Date(Date.now() + REWARD_VALID_HOURS * 60 * 60 * 1000).toISOString(),
      })
      .select("*")
      .single();

    if (rewardError) {
      // 23505: a second tap or tab won the race for today's spin. Return that spin's prize instead of a new one.
      if (rewardError.code === "23505") {
        const racedReward = await findTodaysReward();
        if (racedReward) {
          return jsonResponse({ success: true, alreadySpun: true, reward: racedReward });
        }
      }

      throw rewardError;
    }

    return jsonResponse({ success: true, alreadySpun: false, reward });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
