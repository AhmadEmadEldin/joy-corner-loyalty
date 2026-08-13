const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || 8081);

const contentTypes = {
  ".css": "text/css;charset=utf-8",
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function send(response, status, body, type = "text/plain;charset=utf-8") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": type,
  });
  response.end(body);
}

function fileForRequest(url) {
  const parsed = new URL(url || "/", `http://127.0.0.1:${port}`);
  const cleanPath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  const requested = path.resolve(root, cleanPath || "index.html");
  const relative = path.relative(root, requested);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.join(root, "index.html");
  }
  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
    return requested;
  }
  return path.join(root, "index.html");
}

const server = http.createServer((request, response) => {
  let filePath;
  try {
    filePath = fileForRequest(request.url);
  } catch {
    send(response, 400, "Bad request");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(response, 404, "Not found");
      return;
    }
    send(response, 200, data, contentTypes[path.extname(filePath)] || undefined);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static server listening at http://127.0.0.1:${port}`);
});
