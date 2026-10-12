import { FunctionsHttpError } from '@supabase/supabase-js';
import { customerSupabase } from './supabase';
import type { SpinPrize, SpinReward } from '../types';

interface SpinWheelResponse {
  success: boolean;
  alreadySpun?: boolean;
  reward?: SpinReward;
  error?: string;
}

const SPIN_FAILED_MESSAGE = 'Could not spin the wheel. Please try again.';

/** Active prizes in wheel order. Empty until the spin wheel tables exist, which keeps the wheel hidden. */
export async function fetchSpinPrizes(): Promise<SpinPrize[]> {
  const { data, error } = await customerSupabase
    .from('spin_prizes')
    .select('id, label, kind, percent, display_order')
    .eq('is_active', true)
    .order('display_order');

  if (error) {
    console.warn('Spin wheel prizes unavailable', error.message);
    return [];
  }

  return (data || []) as SpinPrize[];
}

/** The customer's most recent prizes, newest first. */
export async function fetchSpinRewards(userId: string): Promise<SpinReward[]> {
  const { data, error } = await customerSupabase
    .from('spin_rewards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.warn('Spin wheel prizes for this customer unavailable', error.message);
    return [];
  }

  return (data || []) as SpinReward[];
}

/** Asks the server for today's spin. The server picks the prize; the browser only animates the result. */
export async function spinTheWheel() {
  const { data, error } = await customerSupabase.functions.invoke<SpinWheelResponse>('spin-wheel', { body: {} });

  if (error) {
    const payload = error instanceof FunctionsHttpError
      ? await (error.context as Response).json().catch(() => null) as SpinWheelResponse | null
      : null;
    throw new Error(payload?.error || SPIN_FAILED_MESSAGE);
  }

  if (!data?.success || !data.reward) {
    throw new Error(data?.error || SPIN_FAILED_MESSAGE);
  }

  return data.reward;
}
