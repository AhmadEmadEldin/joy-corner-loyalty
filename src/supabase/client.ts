import { createClient, SupabaseClient } from "@supabase/supabase-js";

const runtimeConfig =
  typeof __SUPABASE_CONFIG__ === "undefined"
    ? { publishableKey: "", url: "" }
    : __SUPABASE_CONFIG__;
export const supabaseConfigured = Boolean(
  runtimeConfig.url && runtimeConfig.publishableKey,
);

let singleton: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  singleton ??= createClient(runtimeConfig.url, runtimeConfig.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  return singleton;
}
