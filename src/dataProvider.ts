const supabaseConfig =
  typeof __SUPABASE_CONFIG__ === "undefined"
    ? { publishableKey: "", url: "" }
    : __SUPABASE_CONFIG__;
export const configuredDataProvider =
  typeof __DATA_PROVIDER__ === "undefined" ? "supabase" : __DATA_PROVIDER__;

export const supabaseConfigPresent = Boolean(
  supabaseConfig.url && supabaseConfig.publishableKey,
);

export const supabaseModeEnabled = Boolean(
  configuredDataProvider === "supabase" && supabaseConfigPresent,
);
