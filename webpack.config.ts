import path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";
import webpack from "webpack";
import type { Configuration } from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";

dotenv.config({ path: [".env.local", ".env"] });

// PORT belongs to the API process in local/full-stack development. Reusing it
// here makes webpack bind to the API port and proxy /api back into itself.
const port = Number(process.env.FRONTEND_PORT || 8081);
const isProduction = process.env.NODE_ENV === "production";
const configuredApiUrl = process.env.VITE_API_URL?.trim();

const apiConfig = {
  baseUrl: configuredApiUrl || "/api",
};

let gitSha = "unknown";
let buildTime = "unknown";
try {
  gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  buildTime = new Date().toISOString();
} catch {
  // silently ignore if git is not available
}

const config: Configuration & { devServer?: DevServerConfiguration } = {
  context: path.resolve(__dirname),
  entry: path.resolve(__dirname, "src", "index.tsx"),
  mode: isProduction ? "production" : "development",
  module: {
    rules: [
      {
        exclude: /node_modules/,
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: { transpileOnly: true },
        },
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
    filename: isProduction ? "app.[contenthash:8].js" : "app.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/",
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new webpack.DefinePlugin({
      __API_CONFIG__: JSON.stringify(apiConfig),
      __BUILD_GIT_SHA__: JSON.stringify(gitSha),
      __BUILD_TIME__: JSON.stringify(buildTime),
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
        context: ["/api", "/health", "/ready"],
        target: `http://localhost:${process.env.API_PORT || 3001}`,
      },
    ],
    static: {
      directory: path.resolve(__dirname, "public"),
    },
  },
};

export default config;
