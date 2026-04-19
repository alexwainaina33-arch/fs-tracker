// public/sw.js
// FieldTrack Service Worker
// ⚡ CACHE_NAME is injected at build time by vite.config.js — changes on every deploy
// This guarantees installed PWAs always update after a Vercel push

const CACHE_NAME = "fieldtrack-__BUILD_TIMESTAMP__";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// ── INSTALL: cache static assets ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing cache:", CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Pre-cache failed:", err);
      });
    })
  );
  // Take control immediately — skip waiting for old SW
  self.skipWaiting();
});

// ── ACTIVATE: wipe ALL old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating:", CACHE_NAME);
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
    ).then(() => {
      // Take control of ALL open clients immediately
      return self.clients.claim();
    }).then(() => {
      // Tell every open tab: "reload now, you have the new version"
      return self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "SW_UPDATED", cache: CACHE_NAME })
        );
      });
    })
  );
});

// ── FETCH: network-first for API, cache-first for assets ──────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache PocketBase API or realtime SSE
  if (
    url.hostname.includes("fly.dev") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("realtime")   // never cache SSE stream
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: "offline" }), {
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  // Never cache Vite dev server requests
  if (url.pathname.includes("@vite") || url.pathname.includes("__vite")) return;

  // Navigation (HTML) — network first, fallback to cached /index.html
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

  // JS / CSS / fonts — stale-while-revalidate
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

// ── MESSAGES FROM APP ─────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
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
      actions: data.url ? [{ action: "open", title: "Open App" }] : [],
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