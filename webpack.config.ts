import path from "path";
import dotenv from "dotenv";
import webpack from "webpack";
import type { Configuration } from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";

dotenv.config();

const port = Number(process.env.PORT || process.env.CANVA_FRONTEND_PORT || 8081);

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "",
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "",
  authDomain:
    process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "",
  measurementId:
    process.env.VITE_FIREBASE_MEASUREMENT_ID ||
    process.env.FIREBASE_MEASUREMENT_ID ||
    "",
  messagingSenderId:
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    "",
  projectId:
    process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    "",
};

const appApiBaseUrl = process.env.APP_API_BASE_URL || "/api";
const allowLocalPreviewFallback =
  process.env.ALLOW_LOCAL_PREVIEW_FALLBACK === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.ALLOW_LOCAL_PREVIEW_FALLBACK !== "false");

const config: Configuration & { devServer?: DevServerConfiguration } = {
  context: path.resolve(__dirname),
  entry: path.resolve(__dirname, "src", "index.tsx"),
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  module: {
    rules: [
      {
        exclude: /node_modules/,
        test: /\.tsx?$/,
        use: "ts-loader",
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpg|jpeg|svg|woff|woff2)$/i,
        type: "asset/resource",
      },
    ],
  },
  output: {
    clean: true,
    filename: "app.js",
    path: path.resolve(__dirname, "dist"),
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new webpack.DefinePlugin({
      __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
      __APP_API_BASE_URL__: JSON.stringify(appApiBaseUrl),
      __ALLOW_LOCAL_PREVIEW_FALLBACK__: JSON.stringify(allowLocalPreviewFallback),
    }),
  ],
  devServer: {
    client: {
      overlay: true,
    },
    historyApiFallback: true,
    host: "localhost",
    hot: true,
    open: true,
    port,
    proxy: [
      {
        context: ["/api", "/health"],
        target: `http://localhost:${process.env.CANVA_BACKEND_PORT || 3001}`,
      },
    ],
    static: {
      directory: path.resolve(__dirname, "public"),
    },
  },
};

export default config;
