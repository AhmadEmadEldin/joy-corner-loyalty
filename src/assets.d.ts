declare module "*.jpg" {
  const source: string;
  export default source;
}

declare module "*.png" {
  const source: string;
  export default source;
}

declare const __API_CONFIG__: {
  baseUrl: string;
};

declare const __BUILD_GIT_SHA__: string;
declare const __BUILD_TIME__: string;
