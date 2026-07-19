declare module "*.jpg" {
  const source: string;
  export default source;
}

declare module "*.png" {
  const source: string;
  export default source;
}

declare const __SUPABASE_CONFIG__: {
  publishableKey: string;
  url: string;
};

declare const __DATA_PROVIDER__: "legacy" | "supabase";
