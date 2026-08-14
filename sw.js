/* ==========================================================================
   ZEITKONTO — Serviceworker
   --------------------------------------------------------------------------
   Sorgt dafür, dass die App nach dem ersten Aufruf vollständig offline
   funktioniert. Strategie:

     · App-Hülle  → cache-first mit stiller Aktualisierung im Hintergrund
     · Navigation → Cache zuerst, Netz als Ergänzung, index.html als Rückfall
     · Fremde Hosts werden nicht angefasst (die App lädt ohnehin nichts extern)

   CACHE_VERSION bei jedem Release erhöhen — dann räumt activate() auf und
   die App meldet „Neue Version bereit“.
   ========================================================================== */
"use strict";

const CACHE_VERSION = "zeitkonto-v1.1.0";
const SHELL = [
  "./",
  "./index.html",
  "./app.webmanifest",

  "./assets/css/tokens.css",
  "./assets/css/base.css",
  "./assets/css/components.css",
  "./assets/css/views.css",

  "./assets/js/core/time.js",
  "./assets/js/core/rules.js",
  "./assets/js/core/holidays.js",
  "./assets/js/core/engine.js",
  "./assets/js/core/achievements.js",
  "./assets/js/data/store.js",
  "./assets/js/data/exporters.js",
  "./assets/js/data/msauth.js",
  "./assets/js/data/graph.js",
  "./assets/js/data/calendarsync.js",
  "./assets/js/ui/i18n.js",
  "./assets/js/ui/dom.js",
  "./assets/js/ui/charts.js",
  "./assets/js/ui/onboarding.js",
  "./assets/js/ui/outlooksync.js",
  "./assets/js/ui/views/today.js",
  "./assets/js/ui/views/calendar.js",
  "./assets/js/ui/views/week.js",
  "./assets/js/ui/views/stats.js",
  "./assets/js/ui/views/reports.js",
  "./assets/js/ui/views/achievements.js",
  "./assets/js/ui/views/settings.js",
  "./assets/js/ui/app.js",

  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png"
];

/* ---------------------------------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Einzeln ablegen: eine fehlende Datei darf die Installation nicht kippen
      Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* ---------------------------------------------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------------------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigationsanfragen: gecachte Hülle bevorzugen, sonst Netz, sonst index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* ---------------------------------------------------------------------- */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data === "version" && event.source) {
    event.source.postMessage({ type: "version", version: CACHE_VERSION });
  }
});
