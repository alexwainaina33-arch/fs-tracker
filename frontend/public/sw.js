// public/sw.js
// FieldTrack Service Worker
// Handles: offline caching, background sync, auto-updates

const CACHE_NAME = "fieldtrack-v3";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// ── INSTALL: cache static assets ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Pre-cache failed:", err);
      });
    })
  );
  // Take control immediately — don't wait for old SW to die
  self.skipWaiting();
});

// ── ACTIVATE: clean old caches ────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── FETCH: network-first for API, cache-first for assets ──────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache PocketBase API calls
  if (url.hostname.includes("fly.dev") || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => {
      return new Response(JSON.stringify({ error: "offline" }), {
        headers: { "Content-Type": "application/json" },
      });
    }));
    return;
  }

  // Never cache hot-reload or dev server
  if (url.pathname.includes("@vite") || url.pathname.includes("__vite")) return;

  // For navigation requests (HTML) — network first, fallback to cached index
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // For JS/CSS/fonts — stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});

// ── UPDATE DETECTION: notify clients of new version ───────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data === "CHECK_UPDATE") {
    // Tell all clients there's an update ready
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: "UPDATE_AVAILABLE" })
      );
    });
  }
});

// ── PUSH NOTIFICATIONS (future use) ──────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? "FieldTrack", {
      body:    data.body ?? "",
      icon:    "/icons/icon-192x192.png",
      badge:   "/icons/icon-72x72.png",
      tag:     data.tag ?? "fieldtrack",
      data:    data.url ? { url: data.url } : {},
      actions: data.url
        ? [{ action: "open", title: "Open App" }]
        : [],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});