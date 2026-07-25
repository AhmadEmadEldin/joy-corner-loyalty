import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const publicAssetsDir = path.join(root, "public", "assets");

mkdirSync(distDir, { recursive: true });
copyFileSync(
  path.join(root, "public", "index.html"),
  path.join(distDir, "index.html"),
);
copyFileSync(
  path.join(root, "public", "manifest.json"),
  path.join(distDir, "manifest.json"),
);

if (existsSync(publicAssetsDir)) {
  cpSync(publicAssetsDir, path.join(distDir, "assets"), { recursive: true });
}

const distFiles = readdirSync(distDir);
const hashedJs = distFiles.find((f) => /^app\.[a-f0-9]+\.js$/.test(f));
if (hashedJs) {
  const indexPath = path.join(distDir, "index.html");
  let html = readFileSync(indexPath, "utf-8");
  html = html.replace(
    /<script\s+src="\/app\.js"><\/script>/,
    `<script src="/${hashedJs}"></script>`,
  );
  writeFileSync(indexPath, html);
  console.log(`[write_standalone_html] Injected hashed JS: ${hashedJs}`);
}
