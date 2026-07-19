const supabaseConfig =
  typeof __SUPABASE_CONFIG__ === "undefined"
    ? { publishableKey: "", url: "" }
    : __SUPABASE_CONFIG__;
const configuredProvider =
  typeof __DATA_PROVIDER__ === "undefined" ? "legacy" : __DATA_PROVIDER__;

export const supabaseModeEnabled = Boolean(
  configuredProvider === "supabase" &&
    supabaseConfig.url &&
    supabaseConfig.publishableKey,
);
