/* ==========================================================================
   ZEITKONTO — Serviceworker
   --------------------------------------------------------------------------
   Sorgt dafür, dass die App nach dem ersten Aufruf vollständig offline
   funktioniert — und dass jede Seite aus EINEM Guss geladen wird.

   Strategie:
     · Jede Version hat ihren eigenen Cache (CACHE_VERSION). Die Installation
       holt die ganze App-Hülle frisch vom Server (am HTTP- und CDN-Cache
       vorbei) in diesen Cache. Fehlt dabei eine Programmdatei, wird die
       Version nicht übernommen — lieber später noch einmal als halb.
     · Navigation UND Dateien kommen aus dem Cache der Version, die die
       Seite steuert. Nach einem Deploy läuft der erste Aufruf deshalb noch
       komplett mit der alten Version, nie mit neuem HTML und alten Skripten.
       Das Netz springt nur ein, wenn eine Datei im Cache fehlt.
     · Im Hintergrund prüft der Browser auf eine neue Version. Sie installiert
       sich, übernimmt, und die App lädt beim nächsten Verlassen still neu
       (App.updateReady) — dann vollständig in der neuen Version.
     · Fremde Hosts werden nicht angefasst.

   CACHE_VERSION bei jedem Release erhöhen (tests/sw.test.js prüft, dass sie
   zur App-Version passt) — sonst bleibt die alte Version im Cache stehen.
   ========================================================================== */
"use strict";

const CACHE_VERSION = "zeitkonto-v1.2.0";
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
  "./assets/js/core/planner.js",
  "./assets/js/core/assist.js",
  "./assets/js/core/insights.js",
  "./assets/js/core/whatif.js",
  "./assets/js/core/review.js",
  "./assets/js/core/ask.js",
  "./assets/js/core/qr.js",
  "./assets/js/core/closing.js",
  "./assets/js/core/rota.js",
  "./assets/js/data/store.js",
  "./assets/js/data/exporters.js",
  "./assets/js/data/msauth.js",
  "./assets/js/data/graph.js",
  "./assets/js/data/calendarsync.js",
  "./assets/js/ui/i18n.js",
  "./assets/js/ui/dom.js",
  "./assets/js/ui/ext.js",
  "./assets/js/ui/charts.js",
  "./assets/js/ui/onboarding.js",
  "./assets/js/ui/outlooksync.js",
  "./assets/js/ui/views/today.js",
  "./assets/js/ui/views/calendar.js",
  "./assets/js/ui/views/week.js",
  "./assets/js/ui/views/stats.js",
  "./assets/js/ui/views/reports.js",
  "./assets/js/ui/views/achievements.js",
  "./assets/js/ui/views/tools.js",
  "./assets/js/ui/views/settings.js",
  "./assets/js/ui/features/miniclock.js",
  "./assets/js/ui/features/assist.js",
  "./assets/js/ui/features/insights.js",
  "./assets/js/ui/features/whatif.js",
  "./assets/js/ui/features/review.js",
  "./assets/js/ui/features/ask.js",
  "./assets/js/ui/features/qr.js",
  "./assets/js/ui/features/breaktimer.js",
  "./assets/js/ui/features/closing.js",
  "./assets/js/ui/features/rota.js",
  "./assets/js/ui/app.js",

  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/apple-touch-icon.png"
];

/** Programmdateien: ohne sie ist eine Version unvollständig (Symbole sind verzichtbar). */
function isCore(url) {
  return /\.(html|js|css|webmanifest)$/.test(url) || /\/$/.test(url);
}

function absolute(url) {
  return new URL(url, self.location.href).href;
}

/**
 * Alle lokalen Skripte und Stylesheets, die index.html einbindet — so
 * gelangt auch eine neu hinzugekommene Datei in den Cache, wenn sie in
 * SHELL vergessen wurde.
 */
function referencedAssets(html) {
  const out = [];
  const re = /\s(?:src|href)="(?:\.\/)?(assets\/[^"?#]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push("./" + m[1]);
  return out;
}

/** Redirect-Antworten dürfen nicht für Navigationen benutzt werden — neu verpacken. */
function clean(response) {
  if (!response.redirected) return Promise.resolve(response);
  return response.blob().then((body) => new Response(body, {
    status: response.status, statusText: response.statusText, headers: response.headers
  }));
}

/** Frisch vom Server: eigener Parameter umgeht auch einen CDN-Zwischenspeicher. */
function fetchFresh(url) {
  const busted = new URL(url, self.location.href);
  busted.searchParams.set("__v", CACHE_VERSION);
  return fetch(busted.href, { cache: "reload", credentials: "same-origin" })
    .then((response) => (response && response.ok ? clean(response) : null))
    .catch(() => null);
}

/* ---------------------------------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      fetchFresh("./index.html").then((index) => {
        if (!index) throw new Error("index.html nicht erreichbar");
        return index.clone().text().then((html) => {
          const list = SHELL.concat(referencedAssets(html))
            .filter((url, i, all) => url !== "./" && url !== "./index.html" && all.indexOf(url) === i);
          return Promise.all([
            cache.put(absolute("./index.html"), index.clone()),
            cache.put(absolute("./"), index)
          ].concat(list.map((url) =>
            fetchFresh(url).then((response) => {
              if (!response) return !isCore(url);
              return cache.put(absolute(url), response).then(() => true);
            })
          )));
        });
      }).then((results) => {
        if (results.some((ok) => ok === false)) throw new Error("App-Hülle unvollständig");
      })
    ).then(() => self.skipWaiting())
  );
});

/* ---------------------------------------------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // Nur eigene, ältere Caches löschen: auf github.io teilen sich alle
        // Projektseiten eines Kontos denselben Ursprung und damit den Cache-Speicher.
        keys.filter((k) => k.indexOf("zeitkonto-") === 0 && k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------------------------------------------------------------------- */

/** Nur im Cache DIESER Version suchen — nie in dem einer anderen. */
function fromCache(request) {
  return caches.open(CACHE_VERSION).then((cache) =>
    cache.match(request).then((hit) => hit || cache.match(request, { ignoreSearch: true }))
  ).catch(() => undefined);
}

/** Die App-Hülle selbst: Startadresse oder index.html, mit beliebigen Parametern. */
function isShellPage(url) {
  const scope = new URL(self.registration.scope);
  return url.pathname === scope.pathname || url.pathname === scope.pathname + "index.html";
}

let lastUpdateCheck = 0;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (isShellPage(url)) {
      // Hülle aus dem Cache dieser Version. Nach einer neuen Version sieht
      // der Browser bei jeder Navigation selbst; hier nur zusätzlich, falls
      // die App lange offen bleibt (höchstens einmal pro Stunde). Bewusst
      // ohne waitUntil: die neue Version wartet sonst mit der Übernahme, bis
      // dieser Abruf „fertig“ ist — und der wartet auf sie.
      if (Date.now() - lastUpdateCheck > 3600000) {
        lastUpdateCheck = Date.now();
        self.registration.update().catch(() => {});
      }
      event.respondWith(
        fromCache(absolute("./index.html")).then((hit) => hit || fetch(request))
      );
      return;
    }
    // Andere Seiten (z. B. die Einzeldatei in dist/): Netz zuerst, offline der Cache
    event.respondWith(
      fetch(request).catch(() =>
        fromCache(request).then((hit) => hit || fromCache(absolute("./index.html")))
      )
    );
    return;
  }

  // Dateien: aus derselben Version wie die Seite; Netz nur, wenn sie fehlen
  event.respondWith(
    fromCache(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        // Eine bei der Installation verpasste Symbol-Datei nachtragen
        const path = "./" + url.pathname.slice(new URL(self.registration.scope).pathname.length);
        if (response && response.ok && response.type === "basic" && !url.search && SHELL.indexOf(path) >= 0) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
        }
        return response;
      });
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

/* ---------------------------------------------------------------------- */
/* Benachrichtigungen: Klick und Knöpfe                                     */
/* ---------------------------------------------------------------------- */
/* Ohne Push-Server zeigt nur die offene App Benachrichtigungen an. Ein
   Klick holt sie nach vorne und meldet die gewählte Aktion; die App prüft
   dann, ob sie noch passt (Pause schon beendet? anderer Tag?). Ist kein
   Fenster mehr offen, öffnen die ausdrücklichen Stempel-Knöpfe einen
   Direktlink (#/stamp/…) — der stempelt sofort, deshalb nur für Knöpfe und
   nur, solange die Meldung frisch ist. Ein Klick auf die Meldung selbst
   öffnet bloss „Heute“, „+15 min“ wird dem neuen Fenster nachgereicht. */
const STAMP_LINKS = { "stamp-out": "#/stamp/out", "end-break": "#/stamp/break", "start-break": "#/stamp/break" };
const NOTICE_FRESH_MS = 6 * 60 * 60 * 1000;

function noticeLink(action, data, now) {
  const at = data && typeof data.at === "number" ? data.at : 0;
  const fresh = at > 0 && now - at <= NOTICE_FRESH_MS && now >= at - 60000;
  return STAMP_LINKS[action] && fresh ? STAMP_LINKS[action] : "#/today";
}

function handleNoticeClick(action, data) {
  const msg = { type: "notification-action", action: action, kind: data.kind || "", date: data.date || "" };
  const scope = self.registration.scope;
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    // Nur Fenster dieser App — auf github.io teilen sich Projekte den Ursprung
    const mine = list.filter((c) => c.url && c.url.indexOf(scope) === 0);
    const client = mine.filter((c) => c.focused)[0] ||
      mine.filter((c) => c.visibilityState === "visible")[0] || mine[0];
    if (client) {
      // „+15 min“ erledigt sich im Hintergrund, alles andere holt die App nach vorne
      if (action === "snooze" || typeof client.focus !== "function") { client.postMessage(msg); return; }
      return client.focus().then((c) => (c || client).postMessage(msg), () => client.postMessage(msg));
    }
    if (!self.clients.openWindow) return;
    const url = new URL("./index.html" + noticeLink(action, data, Date.now()), scope).href;
    return self.clients.openWindow(url).then((c) => {
      if (c && action === "snooze") c.postMessage(msg);
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = (notification && notification.data) || {};
  if (notification) notification.close();
  event.waitUntil(handleNoticeClick(event.action || "", data).catch(() => {}));
});
