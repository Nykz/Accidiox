// Accidiox Service Worker — app-shell caching only.
// Never intercepts BLE, geolocation, or the api/*.php, Nominatim, Overpass
// and WhatsApp calls; those always hit the network live.

const CACHE_NAME = "accidiox-shell-v19";
const SHELL_FILES = [
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/bluetooth.js",
  "js/bike3d.js",
  "manifest.json",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Tapping the crash notification should bring the already-open app to the
// front (or open it) rather than leaving the notification just sitting there.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for the app shell itself.
  // Everything else (PHP API, external APIs, WhatsApp) passes straight through.
  const isShellRequest =
    event.request.method === "GET" &&
    url.origin === self.location.origin &&
    !url.pathname.includes("/api/");

  if (!isShellRequest) return;

  // Network-first: this app changes often, so a visitor with the page open
  // should get the latest version whenever they're online. The cache only
  // kicks in if the network request actually fails (offline / dead spot).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
