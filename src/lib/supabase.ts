import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnvironmentVariable(
  variableName: string,
  variableValue: string | undefined
): string {
  const cleanedValue = variableValue?.trim();

  if (!cleanedValue) {
    throw new Error(
      `${variableName} is missing. Add it to Cloudflare Pages environment variables and redeploy the application.`
    );
  }

  return cleanedValue;
}

function extractProjectReference(url: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      'VITE_SUPABASE_URL is invalid. Expected a URL such as https://your-project.supabase.co'
    );
  }

  const projectReference = parsedUrl.hostname.split('.')[0];

  if (!projectReference) {
    throw new Error(
      'Unable to extract the Supabase project reference from VITE_SUPABASE_URL.'
    );
  }

  return projectReference;
}

const supabaseUrl = requireEnvironmentVariable(
  'VITE_SUPABASE_URL',
  import.meta.env.VITE_SUPABASE_URL
);

const supabaseAnonKey = requireEnvironmentVariable(
  'VITE_SUPABASE_ANON_KEY',
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const projectRef = extractProjectReference(supabaseUrl);

const legacyStorageKey = `sb-${projectRef}-auth-token`;
const customerStorageKey = `${legacyStorageKey}-customer`;
const staffStorageKey = `${legacyStorageKey}-staff`;

type ClientRegistry = Record<string, SupabaseClient>;

declare global {
  interface Window {
    __supremeWaffleSupabaseClients__?: ClientRegistry;
  }
}

function getClientRegistry(): ClientRegistry {
  if (typeof window === 'undefined') {
    return {};
  }

  if (!window.__supremeWaffleSupabaseClients__) {
    window.__supremeWaffleSupabaseClients__ = {};
  }

  return window.__supremeWaffleSupabaseClients__;
}

function createScopedSupabaseClient(
  storageKey: string
): SupabaseClient {
  const registry = getClientRegistry();
  const existingClient = registry[storageKey];

  if (existingClient) {
    return existingClient;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  if (typeof window !== 'undefined') {
    registry[storageKey] = client;
  }

  return client;
}

function getBrowserPathname(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  return window.location.pathname;
}

export function isStaffPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/chef') ||
    pathname.startsWith('/delivery')
  );
}

export const customerSupabase =
  createScopedSupabaseClient(customerStorageKey);

export const staffSupabase =
  createScopedSupabaseClient(staffStorageKey);

export function getSupabaseClientForPath(
  pathname: string = getBrowserPathname()
): SupabaseClient {
  return isStaffPath(pathname)
    ? staffSupabase
    : customerSupabase;
}

if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem(legacyStorageKey);
  } catch {
    // Ignore browsers where localStorage access is restricted.
  }
}

export const supabase = new Proxy(customerSupabase, {
  get(_target, property) {
    const selectedClient = getSupabaseClientForPath();
    const value = Reflect.get(
      selectedClient,
      property,
      selectedClient
    );

    return typeof value === 'function'
      ? value.bind(selectedClient)
      : value;
  },
}) as typeof customerSupabase;