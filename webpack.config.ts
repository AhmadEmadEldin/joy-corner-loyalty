import path from "path";
import dotenv from "dotenv";
import webpack from "webpack";
import type { Configuration } from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";

dotenv.config({ path: [".env.local", ".env"] });

const port = Number(process.env.PORT || process.env.FRONTEND_PORT || 8081);

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "",
  appId: process.env.VITE_FIREBASE_APP_ID || "",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
};

const supabaseConfig = {
  url: process.env.VITE_SUPABASE_URL || "",
  publishableKey:
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "",
};

const dataProvider =
  process.env.VITE_DATA_PROVIDER === "legacy" ? "legacy" : "supabase";

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
      __SUPABASE_CONFIG__: JSON.stringify(supabaseConfig),
      __DATA_PROVIDER__: JSON.stringify(dataProvider),
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
    proxy:
      dataProvider === "legacy"
        ? [
            {
              context: ["/api", "/health"],
              target: `http://localhost:${process.env.API_PORT || process.env.JOY_BACKEND_PORT || 3001}`,
            },
          ]
        : undefined,
    static: {
      directory: path.resolve(__dirname, "public"),
    },
  },
};

export default config;
