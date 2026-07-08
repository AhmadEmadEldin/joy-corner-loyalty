import { copyFileSync, cpSync, existsSync, mkdirSync } from "fs";
import path from "path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const publicAssetsDir = path.join(root, "public", "assets");

mkdirSync(distDir, { recursive: true });
copyFileSync(path.join(root, "public", "index.html"), path.join(distDir, "index.html"));
copyFileSync(path.join(root, "public", "manifest.json"), path.join(distDir, "manifest.json"));

if (existsSync(publicAssetsDir)) {
  cpSync(publicAssetsDir, path.join(distDir, "assets"), { recursive: true });
}
