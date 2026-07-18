const CACHE_NAME = "joy-corner-shell-v1";
const SHELL = [
  "/",
  "/order",
  "/manifest.json",
  "/assets/joy-corner-logo.svg",
  "/assets/joy-corner-mark.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== CACHE_NAME)
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/health")
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || caches.match("/")),
      ),
  );
});
self.addEventListener("sync", (event) => {
  if (event.tag === "joy-corner-sync")
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true })
        .then((clients) =>
          clients.forEach((client) =>
            client.postMessage({ type: "JOY_SYNC_REQUEST" }),
          ),
        ),
    );
});
