const apiConfig =
  typeof __API_CONFIG__ === "undefined" ? { baseUrl: "/api" } : __API_CONFIG__;

export const apiConfigPresent = Boolean(apiConfig.baseUrl);
