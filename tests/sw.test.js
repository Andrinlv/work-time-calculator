"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SW_SOURCE = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const SCOPE = "https://example.test/app/";

/* ---------------------------------------------------------------------- */
/* Eine kleine Nachbildung von Cache-Speicher, Netz und Serviceworker-API   */
/* ---------------------------------------------------------------------- */

function makeCaches() {
  const stores = new Map();
  function open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      put(req, res) { map.set(typeof req === "string" ? req : req.url, res); return Promise.resolve(); },
      match(req, opts) {
        const url = typeof req === "string" ? req : req.url;
        let hit = map.get(url);
        if (!hit && opts && opts.ignoreSearch) {
          const bare = url.split("?")[0];
          for (const [k, v] of map) if (k.split("?")[0] === bare) { hit = v; break; }
        }
        return Promise.resolve(hit ? hit.clone() : undefined);
      }
    };
  }
  return {
    stores,
    open: (name) => Promise.resolve(open(name)),
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name) => Promise.resolve(stores.delete(name)),
    match: () => { throw new Error("globales caches.match mischt Versionen — nicht verwenden"); }
  };
}

/** Server mit Dateiinhalten; `version` steckt in jedem Inhalt. */
function makeServer(files) {
  const log = [];
  const server = {
    files, log, online: true,
    fetch(input, init) {
      const url = typeof input === "string" ? input : input.url;
      log.push({ url, cache: init && init.cache });
      if (!server.online) return Promise.reject(new TypeError("offline"));
      const u = new URL(url);
      let rel = u.pathname.slice(new URL(SCOPE).pathname.length);
      if (!rel) rel = "index.html";
      if (!(rel in server.files)) return Promise.resolve(new Response("nf", { status: 404 }));
      return Promise.resolve(new Response(server.files[rel], { status: 200 }));
    }
  };
  return server;
}

function loadWorker(source, caches, server, clients) {
  const handlers = {};
  const state = { skipped: false, claimed: false, updates: 0 };
  const self = {
    location: { href: SCOPE + "sw.js", origin: new URL(SCOPE).origin },
    registration: { scope: SCOPE, update() { state.updates++; return Promise.resolve(); } },
    clients: Object.assign({ claim() { state.claimed = true; return Promise.resolve(); } }, clients || {}),
    skipWaiting() { state.skipped = true; return Promise.resolve(); },
    addEventListener(type, fn) { handlers[type] = fn; }
  };
  vm.runInNewContext(source, {
    self, caches, fetch: server.fetch, URL, Response, Request, Promise, console
  });

  function lifecycle(type) {
    const waits = [];
    handlers[type]({ waitUntil(p) { waits.push(p); } });
    return Promise.all(waits);
  }
  function request(url, mode) {
    let responded = null;
    const waits = [];
    handlers.fetch({
      request: { url: new URL(url, SCOPE).href, method: "GET", mode: mode || "no-cors" },
      respondWith(p) { responded = p; },
      waitUntil(p) { waits.push(p); }
    });
    return Promise.all(waits).then(() => (responded ? responded.then((r) => r && r.text()) : "(Netz direkt)"));
  }
  /** Klick auf eine Benachrichtigung bzw. einen ihrer Knöpfe */
  function click(action, data) {
    const waits = [];
    const notification = { data: data || {}, closed: false, close() { this.closed = true; } };
    handlers.notificationclick({ action: action || "", notification, waitUntil(p) { waits.push(p); } });
    return Promise.all(waits).then(() => ({ notification, waited: waits.length }));
  }
  return { state, install: () => lifecycle("install"), activate: () => lifecycle("activate"), request, click };
}

function site(version) {
  const files = { "index.html": "<html>" + version + "</html>", "app.webmanifest": "{}" };
  (SW_SOURCE.match(/"\.\/assets\/[^"]+"/g) || []).forEach((q) => { files[q.slice(3, -1)] = version + ":" + q; });
  return files;
}

function withVersion(source, version) {
  return source.replace(/const CACHE_VERSION = "[^"]+";/, 'const CACHE_VERSION = "zeitkonto-v' + version + '";');
}

/* ---------------------------------------------------------------------- */

test("Nach einem Deploy liefert der alte Serviceworker Seite UND Dateien aus seiner Version", async () => {
  const caches = makeCaches();
  const server = makeServer(site("1.0"));
  const v1 = loadWorker(withVersion(SW_SOURCE, "1.0"), caches, server);
  await v1.install();
  await v1.activate();
  assert.equal(v1.state.skipped, true);

  // Deploy: der Server hat jetzt überall 1.1
  server.files = site("1.1");
  assert.equal(await v1.request(SCOPE, "navigate"), "<html>1.0</html>", "Navigation aus dem Cache, nicht vom Netz");
  assert.equal(await v1.request(SCOPE + "index.html?source=pwa", "navigate"), "<html>1.0</html>");
  assert.ok((await v1.request("assets/js/ui/app.js")).startsWith("1.0:"), "Skript passt zur Seite");
  assert.ok((await v1.request("assets/css/views.css")).startsWith("1.0:"));
  assert.equal(v1.state.updates, 1, "im Hintergrund wird nach einer neuen Version gesehen");

  // Die neue Version installiert sich und übernimmt — danach alles aus 1.1
  const v2 = loadWorker(withVersion(SW_SOURCE, "1.1"), caches, server);
  await v2.install();
  await v2.activate();
  assert.equal(await v2.request(SCOPE, "navigate"), "<html>1.1</html>");
  assert.ok((await v2.request("assets/js/ui/app.js")).startsWith("1.1:"));
  assert.deepEqual([...caches.stores.keys()], ["zeitkonto-v1.1"], "der alte Cache ist weg");
});

test("Die Installation holt frisch vom Server und lässt eine unvollständige Version nicht zu", async () => {
  const caches = makeCaches();
  const files = site("2.0");
  delete files["assets/js/ui/app.js"];
  const server = makeServer(files);
  const w = loadWorker(withVersion(SW_SOURCE, "2.0"), caches, server);
  await assert.rejects(w.install(), /unvollständig/);
  assert.equal(w.state.skipped, false, "keine Übernahme mit fehlender Programmdatei");
  assert.ok(server.log.every((r) => r.cache === "reload" && /__v=zeitkonto-v2\.0/.test(r.url)), "am HTTP- und CDN-Cache vorbei");
});

test("Fehlende Symbole verhindern die Installation nicht", async () => {
  const caches = makeCaches();
  const files = site("2.1");
  delete files["assets/icons/maskable-512.png"];
  const w = loadWorker(withVersion(SW_SOURCE, "2.1"), caches, makeServer(files));
  await w.install();
  assert.equal(w.state.skipped, true);
});

test("Eine in index.html neu eingebundene Datei landet auch ohne SHELL-Eintrag im Cache", async () => {
  const caches = makeCaches();
  const files = site("3.0");
  files["index.html"] = '<html>3.0<script src="assets/js/ui/views/neu.js"></script></html>';
  files["assets/js/ui/views/neu.js"] = "3.0:neu";
  const server = makeServer(files);
  const w = loadWorker(withVersion(SW_SOURCE, "3.0"), caches, server);
  await w.install();
  server.online = false;
  assert.equal(await w.request("assets/js/ui/views/neu.js"), "3.0:neu");
  assert.equal(await w.request(SCOPE, "navigate"), files["index.html"], "offline aus dem Cache");
});

test("Dateien mit Versionsangabe (?v=) kommen offline aus dem Cache, eine neue Datei wird mit ?v= gefunden", async () => {
  const caches = makeCaches();
  const files = site("3.1");
  files["index.html"] = '<html>3.1<link rel="stylesheet" href="assets/css/views.css?v=3.1" />' +
    '<script src="assets/js/ui/views/neu.js?v=3.1"></script><script src="./assets/js/ui/app.js?v=3.1#x"></script></html>';
  files["assets/js/ui/views/neu.js"] = "3.1:neu";
  const server = makeServer(files);
  const w = loadWorker(withVersion(SW_SOURCE, "3.1"), caches, server);
  await w.install();
  const keys = [...caches.stores.get("zeitkonto-v3.1").keys()];
  assert.ok(keys.includes(SCOPE + "assets/js/ui/views/neu.js"), "die neue Datei — einmal, ohne ?v=");
  assert.ok(!keys.some((k) => /[?#]/.test(k)), "keine Einträge mit Versionsangabe: " + keys.filter((k) => /[?#]/.test(k)));
  server.online = false;
  assert.equal(await w.request("assets/js/ui/views/neu.js?v=3.1"), "3.1:neu");
  assert.ok((await w.request("assets/js/ui/app.js?v=3.1")).startsWith("3.1:"));
  assert.ok((await w.request("assets/css/views.css?v=3.1")).startsWith("3.1:"));
});

test("Verlangt die Seite eine andere Version (?v=), kommt die Datei vom Netz — nie aus diesem Cache", async () => {
  const caches = makeCaches();
  const server = makeServer(site("3.2"));
  const w = loadWorker(withVersion(SW_SOURCE, "3.2"), caches, server);
  await w.install();
  server.files = site("3.3");
  assert.ok((await w.request("assets/js/ui/app.js?v=3.3")).startsWith("3.3:"), "fremde Version: Netz");
  assert.ok((await w.request("assets/js/ui/app.js?v=3.2")).startsWith("3.2:"), "eigene Version: Cache");
  assert.ok((await w.request("assets/js/ui/app.js")).startsWith("3.2:"), "ohne Angabe: Cache");
  assert.ok((await w.request("assets/js/ui/app.js?foo=1")).startsWith("3.2:"), "andere Parameter: Cache");
});

test("Beim Aufräumen bleiben fremde Caches auf demselben Ursprung unberührt", async () => {
  const caches = makeCaches();
  await caches.open("anderes-projekt-v1");
  await caches.open("zeitkonto-v0.9");
  const w = loadWorker(withVersion(SW_SOURCE, "4.0"), caches, makeServer(site("4.0")));
  await w.install();
  await w.activate();
  assert.deepEqual([...caches.stores.keys()].sort(), ["anderes-projekt-v1", "zeitkonto-v4.0"]);
  assert.equal(w.state.claimed, true);
});

/* ---------------------------------------------------------------------- */
/* Benachrichtigungen: Klick und Knöpfe                                     */
/* ---------------------------------------------------------------------- */

/** Fenster-Attrappe: merkt sich Fokus und Nachrichten. */
function windowClient(url, extra) {
  const c = Object.assign({
    url, focused: false, visibilityState: "hidden", messages: [], focusCalls: 0,
    focus() { c.focusCalls++; c.focused = true; return Promise.resolve(c); },
    postMessage(msg) { c.messages.push(JSON.parse(JSON.stringify(msg))); }   // wie structuredClone, ohne fremde Prototypen
  }, extra || {});
  return c;
}

/** clients-Attrappe: matchAll liefert die Fenster, openWindow merkt sich die Adressen. */
function makeClients(windows) {
  const opened = [];
  const log = { opened, queries: [] };
  return {
    log,
    api: {
      matchAll(opts) { log.queries.push(JSON.parse(JSON.stringify(opts))); return Promise.resolve(windows.slice()); },
      openWindow(url) { const c = windowClient(url); opened.push(c); return Promise.resolve(c); }
    }
  };
}

function swWith(clients) {
  return loadWorker(withVersion(SW_SOURCE, "5.0"), makeCaches(), makeServer(site("5.0")), clients.api);
}

const FRESH = () => ({ kind: "leave", date: "2026-10-16", at: Date.now() - 60000 });

test("Knopf in der Benachrichtigung: offenes Fenster nach vorne, Aktion als Nachricht", async () => {
  const stats = windowClient(SCOPE + "index.html#/stats");
  const clients = makeClients([stats]);
  const sw = swWith(clients);
  const r = await sw.click("stamp-out", FRESH());
  assert.equal(r.waited, 1, "der Worker wartet, bis das Fenster benachrichtigt ist");
  assert.equal(r.notification.closed, true, "Meldung schliesst sich auch bei einem Knopf");
  assert.equal(stats.focusCalls, 1);
  assert.equal(stats.messages.length, 1);
  assert.deepEqual(stats.messages[0], { type: "notification-action", action: "stamp-out", kind: "leave", date: "2026-10-16", at: stats.messages[0].at });
  assert.ok(stats.messages[0].at > 0, "mit dem Zeitpunkt der Meldung — die App prüft das Alter");
  assert.equal(clients.log.opened.length, 0, "kein zweites Fenster, kein Direktlink");
  assert.deepEqual(clients.log.queries[0], { type: "window", includeUncontrolled: true });
});

test("Mehrere Fenster: das sichtbare bekommt die Aktion, fremde Projekte auf demselben Ursprung nie", async () => {
  const other = windowClient("https://example.test/anderes/index.html", { focused: true, visibilityState: "visible" });
  const hidden = windowClient(SCOPE + "index.html#/week");
  const visible = windowClient(SCOPE + "#/today", { visibilityState: "visible" });
  const sw = swWith(makeClients([other, hidden, visible]));
  await sw.click("end-break", { kind: "break", date: "2026-10-16", at: Date.now() });
  assert.equal(other.messages.length + other.focusCalls, 0);
  assert.equal(hidden.messages.length, 0);
  assert.equal(visible.messages[0].action, "end-break");
  assert.equal(visible.messages[0].kind, "break");
});

test("„+15 min“ erledigt sich im Hintergrund — das Fenster springt nicht nach vorne", async () => {
  const win = windowClient(SCOPE + "index.html#/today");
  const sw = swWith(makeClients([win]));
  await sw.click("snooze", FRESH());
  assert.equal(win.focusCalls, 0);
  assert.equal(win.messages[0].action, "snooze");
});

test("Kein Fenster offen: Stempel-Knöpfe öffnen den geprüften Link — nie einen Direktlink, der sofort stempelt", async () => {
  for (const action of ["stamp-out", "end-break", "start-break"]) {
    const clients = makeClients([]);
    const data = FRESH();
    await swWith(clients).click(action, data);
    assert.equal(clients.log.opened.length, 1, action);
    assert.equal(clients.log.opened[0].url, SCOPE + "index.html#/notify/" + action + "/2026-10-16/" + data.at, action);
    assert.ok(!/#\/stamp/.test(clients.log.opened[0].url), "nie #/stamp/…");
    assert.equal(clients.log.opened[0].messages.length, 0, "der Link trägt alles — keine zweite Nachricht");
  }
});

test("Kein Fenster offen: auch eine alte Meldung geht über den geprüften Link — die App lehnt sie ab und sagt es", async () => {
  const stale = { kind: "leave", date: "2026-10-15", at: Date.now() - 7 * 3600 * 1000 };
  const clients = makeClients([]);
  await swWith(clients).click("stamp-out", stale);
  assert.equal(clients.log.opened[0].url, SCOPE + "index.html#/notify/stamp-out/2026-10-15/" + stale.at);
});

test("Kein Fenster offen: Meldung ohne Tag oder Zeitpunkt oder Klick auf den Text öffnet nur „Heute“", async () => {
  const cases = [
    ["stamp-out", {}], ["end-break", { date: "2026-10-16" }], ["stamp-out", { at: Date.now() }],
    ["stamp-out", { date: "16.10.2026", at: Date.now() }], ["stamp-out", { date: "2026-10-16", at: "1" }],
    ["", FRESH()], ["unbekannt", FRESH()]
  ];
  for (const [action, data] of cases) {
    const clients = makeClients([]);
    await swWith(clients).click(action, data);
    assert.equal(clients.log.opened[0].url, SCOPE + "index.html#/today", action + " " + JSON.stringify(data));
    assert.equal(clients.log.opened[0].messages.length, 0);
  }
});

test("Kein Fenster offen und „+15 min“: App öffnen und die Erinnerung nachreichen", async () => {
  const clients = makeClients([]);
  await swWith(clients).click("snooze", FRESH());
  const win = clients.log.opened[0];
  assert.equal(win.url, SCOPE + "index.html#/today");
  assert.equal(win.messages.length, 1);
  assert.deepEqual(win.messages[0], { type: "notification-action", action: "snooze", kind: "leave", date: "2026-10-16", at: win.messages[0].at });
});

test("Fokus verweigert oder Meldung ohne Daten: die Aktion kommt trotzdem an", async () => {
  const win = windowClient(SCOPE + "index.html", { focus() { return Promise.reject(new Error("not allowed")); } });
  const sw = swWith(makeClients([win]));
  const r = await sw.click("stamp-out", undefined);
  assert.equal(r.notification.closed, true);
  assert.deepEqual(win.messages, [{ type: "notification-action", action: "stamp-out", kind: "", date: "", at: 0 }]);
});

/* ---------------------------------------------------------------------- */
/* Release-Disziplin                                                        */
/* ---------------------------------------------------------------------- */

const APP_VERSION = /var APP_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "assets/js/ui/app.js"), "utf8"))[1];
const INDEX = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

test("CACHE_VERSION passt zur App-Version — sonst bleibt nach dem Deploy die alte im Cache", () => {
  const cache = /CACHE_VERSION = "zeitkonto-v([^"]+)"/.exec(SW_SOURCE)[1];
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  assert.equal(cache, APP_VERSION, "sw.js CACHE_VERSION und app.js APP_VERSION");
  assert.equal(APP_VERSION, pkg, "app.js APP_VERSION und package.json");
  const readme = /^\s*◯ ●\s+Version (\S+)\s*$/m.exec(fs.readFileSync(path.join(ROOT, "README.md"), "utf8"));
  assert.ok(readme, "README: Kopf mit „Version x.y.z“");
  assert.equal(readme[1], APP_VERSION, "README-Kopf und app.js APP_VERSION");
});

test("index.html bindet jedes Skript und Stylesheet mit ?v=<App-Version> ein", () => {
  // Ältere Serviceworker (1.0–1.2) liefern Dateien aus ihrem Cache, die Seite
  // nach einem Deploy aber vom Netz. Nur mit neuer Adresse holen sie auch
  // die neuen Skripte — sonst läuft der erste Aufruf mit gemischten Dateien.
  const refs = [];
  const re = /<(?:script|link)\b[^>]*\s(?:src|href)="((?:\.\/)?assets\/[^"]+\.(?:js|css)(?:\?[^"]*)?)"/g;
  let m;
  while ((m = re.exec(INDEX))) refs.push(m[1]);
  assert.ok(refs.length > 40, "alle Skripte und Stylesheets gefunden");
  refs.forEach((ref) => {
    const v = /\?v=([^&#"]+)$/.exec(ref);
    assert.ok(v, ref + " ohne ?v=");
    assert.equal(v[1], APP_VERSION, ref);
  });
  assert.ok(!/(?:src|href)="(?:\.\/)?assets\/[^"]+\.(?:js|css)"/.test(INDEX), "keine Datei ohne Versionsangabe");
});

test("Jede Datei in SHELL existiert — sonst scheitert jede künftige Installation", () => {
  // Neue Dateien aus index.html holt die Installation selbst dazu; eine
  // gelöschte oder umbenannte SHELL-Datei dagegen blockiert jedes Update.
  const shell = (SW_SOURCE.match(/"\.\/[^"]*"/g) || []).map((q) => q.slice(3, -1));
  assert.ok(shell.length > 30);
  shell.filter(Boolean).forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), f + " existiert nicht"));
  const re = /\s(?:src|href)="(?:\.\/)?(assets\/[^"?#]+)(?:[?#][^"]*)?"/g;
  let m, n = 0;
  while ((m = re.exec(INDEX))) { n++; assert.ok(fs.existsSync(path.join(ROOT, m[1])), "index.html bindet " + m[1] + " ein, die Datei fehlt"); }
  assert.ok(n > 40, "die Prüfung findet die Dateien auch mit Versionsangabe");
});
