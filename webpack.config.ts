import path from "path";
import dotenv from "dotenv";
import webpack from "webpack";
import type { Configuration } from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";

dotenv.config({ path: [".env.local", ".env"] });

const port = Number(process.env.PORT || process.env.FRONTEND_PORT || 8081);

const apiConfig = {
  baseUrl: process.env.VITE_API_URL || "/api",
};

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
      __API_CONFIG__: JSON.stringify(apiConfig),
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
        target: `http://localhost:${process.env.API_PORT || 3001}`,
      },
    ],
    static: {
      directory: path.resolve(__dirname, "public"),
    },
  },
};

export default config;
