"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const R = require("../assets/js/core/rules.js");
const S = require("../assets/js/data/store.js");

function fresh(opts) {
  const store = S.createStore(Object.assign({ backend: S.memoryBackend(), defaultSettings: R.defaultSettings }, opts || {}));
  store.load();
  return store;
}

/* Uhr zum Vorstellen: Rückgängig fasst schnelle Folgeänderungen zusammen */
function fakeClock(start) {
  let now = start || 1000000;
  const fn = () => now;
  fn.tick = (ms) => { now += ms; };
  return fn;
}

test("Ein frischer Speicher startet leer mit Standardeinstellungen", () => {
  const store = fresh();
  assert.equal(store.dayCount(), 0);
  assert.equal(store.getSettings().breakRuleset, "ch");
  assert.equal(store.getMeta().onboarded, false);
});

test("Tage anlegen, ändern und löschen", () => {
  const store = fresh();
  store.setDay("2026-08-06", { start: "08:00", end: "17:00" });
  assert.equal(store.dayCount(), 1);
  assert.equal(store.getDay("2026-08-06").start, "08:00");

  store.setDay("2026-08-06", { end: "18:00" });
  assert.equal(store.getDay("2026-08-06").start, "08:00", "Teilaktualisierung erhält andere Felder");
  assert.equal(store.getDay("2026-08-06").end, "18:00");
  assert.ok(store.getDay("2026-08-06").updatedAt);

  assert.equal(store.deleteDay("2026-08-06"), true);
  assert.equal(store.dayCount(), 0);
  assert.equal(store.deleteDay("2026-08-06"), false, "zweimal löschen ist kein Fehler");
});

test("getDayOrEmpty liefert eine benutzbare Vorlage", () => {
  const store = fresh();
  const empty = store.getDayOrEmpty("2026-08-06");
  assert.equal(empty.date, "2026-08-06");
  assert.deepEqual(empty.breaks, []);
  assert.equal(store.dayCount(), 0, "das Abfragen legt nichts an");
});

test("Massenänderungen und Löschen per null", () => {
  const store = fresh();
  store.setDays({
    "2026-08-03": { type: "vacation" },
    "2026-08-04": { type: "vacation" }
  });
  assert.equal(store.dayCount(), 2);
  store.setDays({ "2026-08-03": null });
  assert.equal(store.dayCount(), 1);
});

test("Rückgängig und Wiederherstellen", () => {
  const clock = fakeClock();
  const store = fresh({ clock });
  store.setDay("2026-08-06", { start: "08:00" });
  clock.tick(5000);
  store.setDay("2026-08-06", { start: "09:00" });
  assert.equal(store.canUndo(), true);

  store.undo();
  assert.equal(store.getDay("2026-08-06").start, "08:00");

  store.redo();
  assert.equal(store.getDay("2026-08-06").start, "09:00");

  store.undo();
  store.undo();
  assert.equal(store.getDay("2026-08-06"), null, "zurück bis vor die erste Änderung");
});

test("Eine neue Änderung verwirft den Wiederherstellen-Stapel", () => {
  const store = fresh();
  store.setDay("2026-08-06", { start: "08:00" });
  store.undo();
  assert.equal(store.canRedo(), true);
  store.setDay("2026-08-07", { start: "07:00" });
  assert.equal(store.canRedo(), false);
});

test("Einstellungen werden zusammengeführt, nicht ersetzt", () => {
  const store = fresh();
  store.updateSettings({ workloadPercent: 80 });
  assert.equal(store.getSettings().workloadPercent, 80);
  assert.equal(store.getSettings().breakRuleset, "ch", "andere Werte bleiben erhalten");
});

test("Daten überleben einen Neustart des Speichers", () => {
  const backend = S.memoryBackend();
  const first = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  first.load();
  first.setDay("2026-08-06", { start: "08:00", end: "17:00" });
  first.updateSettings({ lang: "fr" });
  first.flush();

  const second = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  second.load();
  assert.equal(second.getDay("2026-08-06").end, "17:00");
  assert.equal(second.getSettings().lang, "fr");
});

test("Kaputte Daten führen zu einem Neustart statt zu einem Absturz", () => {
  const backend = S.memoryBackend();
  backend.setItem(S.KEY, "{das ist kein JSON");
  const store = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  store.load();
  assert.equal(store.dayCount(), 0);
  assert.equal(store.getMeta().recoveredFromCorruption, true);
  assert.ok(backend.getItem("zeitkonto:backup:corrupt"), "die Originaldaten werden aufbewahrt");
});

test("Alte Datenstände werden migriert", () => {
  const backend = S.memoryBackend();
  backend.setItem(S.KEY, JSON.stringify({
    version: 1,
    settings: { lang: "de" },
    days: {
      "2026-08-06": { date: "2026-08-06", start: "08:00", end: "17:00", breaks: [{ start: "12:00", end: "12:30" }] }
    }
  }));
  const store = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  store.load();
  const day = store.getDay("2026-08-06");
  assert.equal(store.state.version, S.SCHEMA);
  assert.ok(day.breaks[0].id, "Migration 2 vergibt Pausen-IDs");
  assert.equal(day.breaks[0].paid, false);
  assert.equal(day.absenceFactor, 1, "Migration 3 ergänzt den Abwesenheitsfaktor");
  assert.equal(day.location, "office");
});

test("Export und Import im Modus „merge“", () => {
  const a = fresh();
  a.setDay("2026-08-03", { start: "08:00", end: "17:00" });
  a.setDay("2026-08-04", { start: "08:00", end: "16:00" });
  const dump = a.exportState();

  const b = fresh();
  b.setDay("2026-08-04", { start: "09:00", end: "18:00" });
  const result = b.importState(dump, "merge");

  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(b.getDay("2026-08-04").start, "08:00", "eingelesene Daten gewinnen");
  assert.equal(b.dayCount(), 2);
});

test("Import im Modus „merge-keep“ schützt vorhandene Tage", () => {
  const a = fresh();
  a.setDay("2026-08-04", { start: "08:00" });
  const dump = a.exportState();

  const b = fresh();
  b.setDay("2026-08-04", { start: "09:00" });
  const result = b.importState(dump, "merge-keep");
  assert.equal(result.skipped, 1);
  assert.equal(b.getDay("2026-08-04").start, "09:00");
});

test("Import im Modus „replace“ ersetzt alles", () => {
  const a = fresh();
  a.setDay("2026-08-03", { start: "08:00" });
  const dump = a.exportState();

  const b = fresh();
  b.setDay("2020-01-01", { start: "07:00" });
  b.importState(dump, "replace");
  assert.equal(b.dayCount(), 1);
  assert.equal(b.getDay("2020-01-01"), null);
});

test("Import weist unbrauchbare Dateien zurück", () => {
  const store = fresh();
  assert.throws(() => store.importState(null, "merge"));
  assert.throws(() => store.importState({ nichts: true }, "merge"));
});

test("Import überspringt kaputte Schlüssel", () => {
  const store = fresh();
  const result = store.importState({
    days: { "2026-08-03": { start: "08:00" }, "kein-datum": { start: "08:00" }, "2026-13-45": {} }
  }, "merge");
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
});

test("Import ist umkehrbar", () => {
  const store = fresh();
  store.setDay("2026-08-03", { start: "08:00" });
  store.importState({ days: { "2026-08-10": { start: "07:00" } } }, "merge");
  assert.equal(store.dayCount(), 2);
  store.undo();
  assert.equal(store.dayCount(), 1);
});

test("reset behält auf Wunsch die Einstellungen", () => {
  const store = fresh();
  store.updateSettings({ workloadPercent: 60 });
  store.setDay("2026-08-03", { start: "08:00" });

  store.reset(true);
  assert.equal(store.dayCount(), 0);
  assert.equal(store.getSettings().workloadPercent, 60);

  store.updateSettings({ workloadPercent: 60 });
  store.reset(false);
  assert.equal(store.getSettings().workloadPercent, 100);
});

test("Beobachter werden benachrichtigt und lassen sich abmelden", () => {
  const store = fresh();
  const seen = [];
  const off = store.subscribe((evt) => seen.push(evt.type));
  store.setDay("2026-08-03", { start: "08:00" });
  store.updateSettings({ lang: "en" });
  off();
  store.setDay("2026-08-04", { start: "08:00" });
  assert.deepEqual(seen, ["day", "settings"]);
});

test("Ein fehlerhafter Beobachter blockiert die anderen nicht", () => {
  const store = fresh();
  let reached = false;
  store.subscribe(() => { throw new Error("kaputt"); });
  store.subscribe(() => { reached = true; });
  store.setDay("2026-08-03", { start: "08:00" });
  assert.equal(reached, true);
});

test("Diagnose meldet den Zustand", () => {
  const store = fresh();
  store.setDay("2026-08-03", { start: "08:00" });
  store.flush();
  const d = store.diagnostics();
  assert.equal(d.days, 1);
  assert.equal(d.schema, S.SCHEMA);
  assert.ok(d.bytes > 0);
  assert.equal(d.volatile, true, "der Testspeicher ist flüchtig");
});

test("Sicherung lässt sich schreiben und lesen", () => {
  const store = fresh();
  store.setDay("2026-08-03", { start: "08:00" });
  assert.equal(store.makeBackup(), true);
  const backup = store.readBackup();
  assert.ok(backup.at);
  assert.equal(backup.data.days["2026-08-03"].start, "08:00");
});

test("Ein voller Speicher meldet einen Fehler statt zu schweigen", () => {
  const backend = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: () => {}
  };
  const store = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  store.load();
  const errors = [];
  store.subscribe((evt) => { if (evt.type === "error") errors.push(evt); });
  store.setDay("2026-08-03", { start: "08:00" }, { immediate: true });
  assert.equal(errors.length, 1);
  assert.equal(store.getDay("2026-08-03").start, "08:00", "im Arbeitsspeicher bleibt der Wert erhalten");
});

/* ---------------------------------------------------------------------- */
/* Mehrere Fenster teilen sich einen Speicher                              */
/* ---------------------------------------------------------------------- */

function twoWindows() {
  const backend = S.memoryBackend();
  const a = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  a.load();
  a.setDay("2026-08-03", { start: "08:00", end: "17:00" }, { immediate: true });
  const b = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  b.load();
  return { backend, a, b };
}

test("Zwei Fenster überschreiben sich nicht gegenseitig", () => {
  const { backend, a, b } = twoWindows();
  a.setDay("2026-08-04", { start: "07:30", end: "16:30" });
  a.flush();
  // Fenster B kennt den 4.8. noch nicht und speichert einen anderen Tag
  b.setDay("2026-08-05", { start: "09:00", end: "18:00" });
  b.flush();

  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.equal(saved.days["2026-08-04"].start, "07:30", "Eingabe aus Fenster A bleibt erhalten");
  assert.equal(saved.days["2026-08-05"].start, "09:00", "Eingabe aus Fenster B ist gespeichert");
  assert.equal(b.getDay("2026-08-04").start, "07:30", "B hat den Stand von A übernommen");
});

test("Beim selben Tag gewinnt die jüngste Eingabe", () => {
  const { backend, a, b } = twoWindows();
  a.setDay("2026-08-03", { end: "18:00" }); a.flush();
  b.setDay("2026-08-03", { end: "19:00" }); b.flush();
  assert.equal(JSON.parse(backend.getItem(S.KEY)).days["2026-08-03"].end, "19:00");
});

test("Löschen in einem Fenster wird vom anderen nicht rückgängig gemacht", () => {
  const { backend, a, b } = twoWindows();
  a.deleteDay("2026-08-03"); a.flush();
  b.updateSettings({ lang: "fr" }); b.flush();
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.equal(saved.days["2026-08-03"], undefined, "der gelöschte Tag bleibt gelöscht");
  assert.equal(saved.settings.lang, "fr");
});

test("Einstellungen aus beiden Fenstern werden zusammengeführt", () => {
  const { backend, a, b } = twoWindows();
  a.updateSettings({ holidayRegion: "CH-BE" }); a.flush();
  b.updateSettings({ theme: "dark" }); b.flush();
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.equal(saved.settings.holidayRegion, "CH-BE");
  assert.equal(saved.settings.theme, "dark");
});

test("syncExternal übernimmt fremde Änderungen und meldet sie", () => {
  const { backend, a, b } = twoWindows();
  const events = [];
  b.subscribe((evt) => events.push(evt));
  a.setDay("2026-08-06", { start: "06:00" }); a.flush();
  assert.equal(b.syncExternal(backend.getItem(S.KEY)), true);
  assert.equal(b.getDay("2026-08-06").start, "06:00");
  const ext = events.find((e) => e.type === "external");
  assert.ok(ext, "Ereignis für die Oberfläche");
  assert.deepEqual(ext.days, ["2026-08-06"]);
  assert.equal(b.syncExternal(backend.getItem(S.KEY)), false, "derselbe Stand löst nichts zweimal aus");
});

test("Rückgängig nimmt nur die eigenen Änderungen zurück", () => {
  const { backend, a, b } = twoWindows();
  b.setDay("2026-08-10", { start: "08:00" }); b.flush();
  a.setDay("2026-08-11", { start: "07:00" }); a.flush();
  b.syncExternal(backend.getItem(S.KEY));
  assert.equal(b.getDay("2026-08-11").start, "07:00");
  b.undo(); b.flush();
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.equal(saved.days["2026-08-10"], undefined, "B's eigene Eingabe ist zurückgenommen");
  assert.equal(saved.days["2026-08-11"].start, "07:00", "A's Eingabe bleibt stehen");
});

test("Abzeichen gehen beim Zusammenführen nicht verloren", () => {
  const { backend, a, b } = twoWindows();
  a.saveAchievements({ earned: { first: "2026-08-03" }, xp: 10, bestStreak: 1, seen: {} }); a.flush();
  b.saveAchievements({ earned: { week: "2026-08-07" }, xp: 30, bestStreak: 3, seen: {} }); b.flush();
  const ach = JSON.parse(backend.getItem(S.KEY)).achievements;
  assert.ok(ach.earned.first && ach.earned.week);
  assert.equal(ach.xp, 30);
});

test("Import im Modus „replace“ setzt sich gegen ein anderes Fenster durch", () => {
  const { backend, a, b } = twoWindows();
  a.setDay("2026-08-12", { start: "08:00" }); a.flush();
  b.importState({ days: { "2026-09-01": { start: "07:00" } } }, "replace"); b.flush();
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.deepEqual(Object.keys(saved.days), ["2026-09-01"]);
});

test("Daten einer neueren App-Version werden nicht zurückgestuft", () => {
  const backend = S.memoryBackend();
  backend.setItem(S.KEY, JSON.stringify({ version: S.SCHEMA + 1, settings: {}, days: { "2026-08-03": { start: "08:00", future: { x: 1 } } } }));
  const store = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  store.load();
  assert.equal(store.isNewerSchema(), true);
  store.setDay("2026-08-04", { start: "09:00" }, { immediate: true });
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.equal(saved.version, S.SCHEMA + 1, "Versionsnummer bleibt");
  assert.deepEqual(saved.days["2026-08-03"].future, { x: 1 }, "unbekannte Felder bleiben erhalten");
});

test("Ein leerer Stand überschreibt nie eine gefüllte Sicherung", () => {
  const backend = S.memoryBackend();
  const store = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  store.load();
  store.setDay("2026-08-03", { start: "08:00" }, { immediate: true });
  assert.equal(store.makeBackup(), true);
  // Datenschaden: Hauptstand unlesbar, App startet leer
  backend.setItem(S.KEY, "{kaputt");
  const after = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  after.load();
  assert.equal(after.dayCount(), 0);
  assert.equal(after.makeBackup(), false, "leerer Stand wird nicht gesichert");
  assert.equal(after.readBackup().data.days["2026-08-03"].start, "08:00", "die gute Sicherung ist noch da");
  assert.equal(after.readBackup().days, 1);
  assert.equal(after.readCorrupt(), "{kaputt");
});

test("Sicherung vom Vortag bleibt als zweite Stufe erhalten", () => {
  const backend = S.memoryBackend();
  backend.setItem("zeitkonto:backup", JSON.stringify({ at: "2026-08-01T10:00:00.000Z", data: { days: { "2026-07-31": { start: "08:00" } } } }));
  const store = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  store.load();
  store.setDay("2026-08-03", { start: "08:00" }, { immediate: true });
  store.makeBackup();
  assert.ok(store.readBackup("prev").data.days["2026-07-31"], "Vortagssicherung");
  assert.ok(store.readBackup().data.days["2026-08-03"], "aktuelle Sicherung");
});

test("Bei vollem Speicher wird zuerst die alte Sicherung geopfert", () => {
  const mem = S.memoryBackend();
  let limit = true;
  const backend = {
    getItem: (k) => mem.getItem(k),
    removeItem: (k) => { mem.removeItem(k); limit = false; },
    setItem: (k, v) => { if (k === S.KEY && limit) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } mem.setItem(k, v); }
  };
  mem.setItem("zeitkonto:backup:prev", "x".repeat(100));
  const store = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  store.load();
  const errors = [];
  store.subscribe((evt) => { if (evt.type === "error") errors.push(evt); });
  store.setDay("2026-08-03", { start: "08:00" }, { immediate: true });
  assert.equal(errors.length, 0, "nach dem Aufräumen klappt das Speichern");
  assert.equal(mem.getItem("zeitkonto:backup:prev"), null);
  assert.ok(JSON.parse(mem.getItem(S.KEY)).days["2026-08-03"]);
});

/* ---------------------------------------------------------------------- */
/* Rückgängig: kleine Schritte, zusammengefasstes Tippen                    */
/* ---------------------------------------------------------------------- */

const E = require("../assets/js/core/engine.js");

function bigStore(opts) {
  const store = fresh(opts);
  const map = {};
  for (let i = 0; i < 300; i++) {
    const iso = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    map[iso] = { start: "08:00", end: "17:00", breaks: [{ id: "b" + i, start: "12:00", end: "12:30", paid: false }], note: "Tag " + i };
  }
  store.setDays(map);
  return store;
}

test("Ein Tastendruck serialisiert nicht mehr den ganzen Datenbestand", () => {
  const clock = fakeClock();
  const store = bigStore({ clock });
  const whole = JSON.stringify(store.state).length;
  const original = JSON.stringify;
  let written = 0;
  JSON.stringify = function () { const out = original.apply(JSON, arguments); written += out ? out.length : 0; return out; };
  try {
    for (let k = 0; k < 40; k++) {
      store.setDay("2026-08-03", { end: "17:" + String(k).padStart(2, "0") });
      clock.tick(3000);   // jedes Mal ein eigener Schritt
    }
  } finally { JSON.stringify = original; }
  assert.ok(written < whole / 4, "serialisiert: " + written + " Zeichen, Gesamtstand: " + whole);
  assert.equal(store.diagnostics().undoDepth > 40, true);
});

test("Schnelles Tippen in einem Feld ergibt einen einzigen Rückgängig-Schritt", () => {
  const clock = fakeClock();
  const store = fresh({ clock });
  store.setDay("2026-08-03", { start: "07:00", end: "16:00" });
  clock.tick(5000);
  ["0", "07", "074", "0745"].forEach((v) => { store.setDay("2026-08-03", { start: v }); clock.tick(300); });
  assert.equal(store.getDay("2026-08-03").start, "0745");
  store.undo();
  assert.equal(store.getDay("2026-08-03").start, "07:00", "ein Schritt nimmt das ganze Wort zurück");
  store.redo();
  assert.equal(store.getDay("2026-08-03").start, "0745");
});

test("Pause oder anderes Feld beginnt einen neuen Schritt", () => {
  const clock = fakeClock();
  const store = fresh({ clock });
  store.setDay("2026-08-03", { start: "07:00" });
  clock.tick(500);
  store.setDay("2026-08-03", { end: "16:00" });      // anderes Feld
  clock.tick(2000);
  store.setDay("2026-08-03", { end: "16:30" });      // nach einer Pause
  store.undo();
  assert.equal(store.getDay("2026-08-03").end, "16:00");
  store.undo();
  assert.equal(store.getDay("2026-08-03").end || "", "");
  assert.equal(store.getDay("2026-08-03").start, "07:00");
  store.undo();
  assert.equal(store.getDay("2026-08-03"), null);
});

test("Nach einem Rückgängig wächst kein alter Schritt weiter", () => {
  const clock = fakeClock();
  const store = fresh({ clock });
  store.setDay("2026-08-03", { start: "07:00" });
  clock.tick(5000);
  store.setDay("2026-08-03", { start: "08:00" });
  store.undo();                                     // zurück auf 07:00
  clock.tick(200);
  store.setDay("2026-08-03", { start: "09:00" });
  store.undo();
  assert.equal(store.getDay("2026-08-03").start, "07:00");
});

test("Unveränderte Eingabe legt keinen Schritt an und markiert nichts", () => {
  const { backend, a, b } = twoWindows();
  const depth = b.diagnostics().undoDepth;
  b.setDay("2026-08-03", { start: "08:00" });       // Feld verlassen ohne Änderung
  assert.equal(b.diagnostics().undoDepth, depth, "kein leerer Schritt");
  a.setDay("2026-08-03", { start: "06:30" }); a.flush();
  b.updateSettings({ theme: "dark" }); b.flush();
  assert.equal(JSON.parse(backend.getItem(S.KEY)).days["2026-08-03"].start, "06:30", "B überstimmt A nicht grundlos");
});

test("Rückgängig nach fremder Änderung am selben Tag lässt die fremde stehen", () => {
  const { backend, a, b } = twoWindows();
  b.setDay("2026-08-03", { note: "von B" }); b.flush();
  a.syncExternal(backend.getItem(S.KEY));
  a.setDay("2026-08-03", { note: "von A" }); a.flush();
  b.syncExternal(backend.getItem(S.KEY));
  assert.equal(b.getDay("2026-08-03").note, "von A");
  b.undo(); b.flush();
  assert.equal(JSON.parse(backend.getItem(S.KEY)).days["2026-08-03"].note, "von A", "A's neuere Eingabe bleibt");
});

test("Zurücksetzen ist vollständig umkehrbar — Erfolge und Einrichtung inklusive", () => {
  const backend = S.memoryBackend();
  backend.setItem(S.KEY, JSON.stringify({
    version: 3, settings: { workloadPercent: 80 },
    days: { "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00" } },
    achievements: { earned: { first: "2026-08-03" }, xp: 970, bestStreak: 4, seen: {} },
    meta: { onboarded: true, createdAt: "2026-01-01T00:00:00.000Z" },
    projects: [{ id: "p1" }]
  }));
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings });
  store.load();
  store.reset(false);
  assert.equal(store.dayCount(), 0);
  assert.equal(store.getMeta().onboarded, false);
  assert.equal(store.undo(), "reset");
  assert.equal(store.getDay("2026-08-03").start, "08:00");
  assert.equal(store.getAchievements().xp, 970);
  assert.equal(store.getMeta().onboarded, true, "der Einrichtungsassistent erscheint nicht erneut");
  assert.equal(store.getSettings().workloadPercent, 80);
  store.flush();
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.deepEqual(saved.projects, [{ id: "p1" }], "auch Bereiche einer neueren Version kommen zurück");
  assert.equal(saved.meta.onboarded, true);
  store.redo();
  assert.equal(store.dayCount(), 0);
});

test("Rückgängig nach einem Import nimmt auch die Erfolge zurück", () => {
  const store = fresh();
  store.importState({ days: {}, achievements: { earned: { first: "2026-01-01" }, xp: 10 } }, "merge");
  assert.equal(store.getAchievements().earned.first, "2026-01-01");
  store.undo();
  assert.deepEqual(store.getAchievements().earned, {});
});

test("Buchhaltung (letzter Export, letzter Abgleich) ist kein eigener Schritt", () => {
  const store = fresh();
  store.updateSettings({ outlook: { enabled: true, rules: [], lastSyncAt: null } });
  store.setDays({ "2026-08-05": { type: "vacation", source: "outlook" } }, { label: "outlook" });
  store.updateSettings({ outlook: { enabled: true, rules: [], lastSyncAt: "2026-08-06T10:00:00Z" } });
  store.updateSettings({ lastExportAt: "2026-08-06T10:00:00Z" });
  assert.equal(store.undo(), "outlook", "Rückgängig trifft den Abgleich, nicht dessen Zeitstempel");
  assert.equal(store.getDay("2026-08-05"), null);
  assert.equal(store.getSettings().outlook.lastSyncAt, "2026-08-06T10:00:00Z");
});

test("rev() zählt jede Datenänderung", () => {
  const store = fresh();
  const r0 = store.rev();
  store.setDay("2026-08-03", { start: "08:00" });
  store.updateSettings({ theme: "dark" });
  assert.equal(store.rev(), r0 + 2);
  store.setDay("2026-08-03", { start: "08:00" });   // unverändert
  assert.equal(store.rev(), r0 + 2);
  store.undo();
  assert.equal(store.rev(), r0 + 3);
});

/* ---------------------------------------------------------------------- */
/* Import: prüfen, migrieren, nie die Berechnung zum Absturz bringen         */
/* ---------------------------------------------------------------------- */

test("Import migriert eine alte Sicherung (Schema 1)", () => {
  const store = fresh();
  store.importState({ app: "Zeitkonto", schema: 1, days: {
    "2026-08-03": { start: "08:00", end: "17:00", breaks: [{ start: "12:00", end: "12:30" }] }
  } }, "merge");
  const d = store.getDay("2026-08-03");
  assert.ok(d.breaks[0].id, "Pausen-ID ergänzt");
  assert.equal(d.breaks[0].paid, false);
  assert.equal(d.absenceFactor, 1);
  assert.equal(d.location, "office");
});

test("Import überspringt kaputte Tage, zählt sie und rechnet danach fehlerfrei", () => {
  const store = fresh();
  const file = { days: {
    "2026-08-03": { start: "08:00", end: "17:00", breaks: "12:00-12:30" },
    "2026-08-04": { start: 800 },
    "2026-08-05": { start: "08:00", end: "16:00", breaks: [null] },
    "2026-08-06": { start: "08:00", end: "17:00", breaks: [{ start: "12:00", end: "12:45" }] },
    "2026-08-07": "Ferien"
  } };
  const before = JSON.stringify(file);
  const result = store.importState(file, "merge");
  assert.equal(result.added, 1);
  assert.equal(result.invalid, 4);
  assert.equal(result.skipped, 4);
  assert.equal(JSON.stringify(file), before, "die Datei selbst bleibt unverändert");
  Object.keys(store.allDays()).forEach((iso) => {
    assert.doesNotThrow(() => E.computeDay(store.getDay(iso), { settings: store.getSettings(), holiday: null, isToday: false }));
  });
});

test("Ein Import ganz ohne lesbare Tage bricht mit verständlichem Code ab", () => {
  const store = fresh();
  store.setDay("2026-08-01", { start: "08:00" });
  assert.throws(() => store.importState({ days: { "2026-08-03": { breaks: "x" } } }, "replace"), (e) => e.code === "no-valid-days");
  assert.equal(store.getDay("2026-08-01").start, "08:00", "nichts wurde verändert");
  assert.throws(() => store.importState([], "merge"), (e) => e.code === "invalid");
  assert.throws(() => store.importState({ settings: {} }, "merge"), (e) => e.code === "no-days");
});

test("Import beim Zusammenführen: nur die Felder aus der Datei überschreiben", () => {
  const store = fresh();
  store.setDay("2026-08-03", { start: "08:00", end: "17:00", note: "meine Notiz", location: "home" });
  store.importState({ schema: 3, days: { "2026-08-03": { end: "18:00" } } }, "merge");
  const d = store.getDay("2026-08-03");
  assert.equal(d.end, "18:00");
  assert.equal(d.note, "meine Notiz");
  assert.equal(d.location, "home");
});

test("Import übernimmt nur Einstellungen mit passendem Typ", () => {
  const store = fresh();
  store.importState({ days: {}, settings: { workloadPercent: "achtzig", theme: "dark", autoHolidays: "ja", futureKey: { a: 1 } } }, "merge");
  const s = store.getSettings();
  assert.equal(s.workloadPercent, 100);
  assert.equal(s.theme, "dark");
  assert.equal(s.autoHolidays, true);
  assert.deepEqual(s.futureKey, { a: 1 }, "unbekannte Einstellungen bleiben erhalten");
});

/* ---------------------------------------------------------------------- */
/* Vorwärtskompatibel: Neueres wird mitgeführt, nie zurückgestuft           */
/* ---------------------------------------------------------------------- */

test("Unbekannte Bereiche und Felder überleben Laden, Speichern, Export und Import", () => {
  const backend = S.memoryBackend();
  backend.setItem(S.KEY, JSON.stringify({
    version: S.SCHEMA + 1, settings: { lang: "fr" },
    days: { "2026-08-03": { start: "08:00", projectId: "p1" } },
    projects: [{ id: "p1", name: "Alpha" }]
  }));
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings });
  store.load();
  store.setDay("2026-08-04", { start: "09:00" }, { immediate: true });
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.deepEqual(saved.projects, [{ id: "p1", name: "Alpha" }]);
  assert.equal(saved.version, S.SCHEMA + 1);
  assert.equal(saved.days["2026-08-03"].projectId, "p1");

  const dump = store.exportState();
  assert.equal(dump.schema, S.SCHEMA + 1, "Export stuft nicht zurück");
  assert.deepEqual(dump.projects, [{ id: "p1", name: "Alpha" }]);

  const other = fresh();
  const result = other.importState(JSON.parse(JSON.stringify(dump)), "replace");
  assert.equal(result.newer, true);
  assert.deepEqual(other.state.projects, [{ id: "p1", name: "Alpha" }]);
  assert.equal(other.getDay("2026-08-03").projectId, "p1");
  assert.equal(other.state.app, undefined, "die Export-Hülle gehört nicht in den Zustand");
});

test("Laden repariert Tage, statt die Berechnung abstürzen zu lassen", () => {
  const backend = S.memoryBackend();
  backend.setItem(S.KEY, JSON.stringify({ version: 3, days: {
    "2026-08-03": { start: "08:00", end: "17:00", breaks: [null, { start: "12:00", end: "12:30" }], targetOverride: "viel" }
  } }));
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings });
  store.load();
  const d = store.getDay("2026-08-03");
  assert.equal(d.breaks.length, 1);
  assert.equal(d.targetOverride, null);
  assert.doesNotThrow(() => E.computeDay(d, { settings: store.getSettings(), holiday: null, isToday: false }));
});

/* ---------------------------------------------------------------------- */
/* Voller Speicher                                                          */
/* ---------------------------------------------------------------------- */

function quotaError() { const e = new Error("The quota has been exceeded."); e.name = "QuotaExceededError"; e.code = 22; return e; }

test("Voller Speicher beim Start: Daten werden trotzdem gelesen, nicht der flüchtige Speicher", () => {
  const mem = S.memoryBackend();
  mem.setItem(S.KEY, JSON.stringify({ version: 3, days: { "2026-08-03": { start: "08:00" } }, meta: { onboarded: true } }));
  const full = {
    getItem: (k) => mem.getItem(k),
    removeItem: (k) => mem.removeItem(k),
    setItem: () => { throw quotaError(); }
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: full, configurable: true, writable: true });
  try {
    const detected = S.detectBackend();
    assert.equal(detected.backend, full, "localStorage bleibt in Gebrauch");
    assert.equal(detected.full, true);
    const store = S.createStore({ defaultSettings: R.defaultSettings, listen: false });
    store.load();
    assert.equal(store.dayCount(), 1);
    assert.equal(store.getMeta().onboarded, true, "kein Einrichtungsassistent");
    const diag = store.diagnostics();
    assert.equal(diag.volatile, false);
    assert.equal(diag.full, true);
    assert.equal(store.makeBackup(), false, "keine zusätzliche Kopie in einen vollen Speicher");
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
});

test("Gesperrter Speicher (SecurityError) fällt auf den Arbeitsspeicher zurück", () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { get() { const e = new Error("denied"); e.name = "SecurityError"; throw e; }, configurable: true });
  try {
    assert.equal(S.detectBackend().backend.volatile, true);
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
});

test("Speicherwarnung kommt nicht bei jedem Tastendruck", () => {
  const clock = fakeClock();
  const backend = { getItem: () => null, removeItem: () => {}, setItem: () => { throw quotaError(); } };
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings, clock });
  store.load();
  const errors = [];
  store.subscribe((evt) => { if (evt.type === "error") errors.push(evt); });
  store.setDay("2026-08-03", { start: "0" }, { immediate: true });
  clock.tick(400);
  store.setDay("2026-08-03", { start: "08" }, { immediate: true });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].quota, true);
  assert.equal(store.diagnostics().full, true);
  clock.tick(31000);
  store.setDay("2026-08-03", { start: "08:00" }, { immediate: true });
  assert.equal(errors.length, 2, "nach einer Weile wird erneut gewarnt");
});

test("Als letzte Stufe weicht die Startsicherung den aktuellen Daten", () => {
  const mem = S.memoryBackend();
  const LIMIT = 3000;
  const size = () => ["zeitkonto:v1", "zeitkonto:backup"].reduce((n, k) => n + (mem.getItem(k) || "").length, 0);
  const backend = {
    getItem: (k) => mem.getItem(k),
    removeItem: (k) => mem.removeItem(k),
    setItem: (k, v) => {
      const next = size() - (mem.getItem(k) || "").length + String(v).length;
      if (next > LIMIT) throw quotaError();
      mem.setItem(k, v);
    }
  };
  mem.setItem("zeitkonto:backup", "x".repeat(2000));
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings });
  store.load();
  assert.equal(store.setDay("2026-08-03", { note: "y".repeat(1200) }, { immediate: true }).note.length, 1200);
  assert.ok(JSON.parse(mem.getItem(S.KEY)).days["2026-08-03"], "die Daten sind gespeichert");
  assert.equal(mem.getItem("zeitkonto:backup"), null, "die alte Sicherung musste weichen");
});

test("Speichergrösse kommt aus dem Gedächtnis, nicht aus einem erneuten Lesen", () => {
  const mem = S.memoryBackend();
  let reads = 0;
  const backend = { getItem: (k) => { reads++; return mem.getItem(k); }, setItem: (k, v) => mem.setItem(k, v), removeItem: (k) => mem.removeItem(k) };
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings });
  store.load();
  store.setDay("2026-08-03", { start: "08:00" }, { immediate: true });
  const before = reads;
  const d = store.diagnostics();
  assert.equal(reads, before);
  assert.equal(d.bytes, mem.getItem(S.KEY).length);
});

/* ---------------------------------------------------------------------- */
/* Sperre (Monatsabschluss)                                                */
/* ---------------------------------------------------------------------- */

/* Gesperrt ist, wofür die Einstellungen „lock:JJJJ-MM“ tragen — wie die
   Abschlüsse der App, aber ohne deren Rechnerei. */
function lockGuard(iso, settings) { return !!settings["lock:" + iso.slice(0, 7)]; }

function lockedStore(opts) {
  const store = fresh(opts);
  store.setGuard(lockGuard, { prefix: "lock:" });
  return store;
}

test("Sperre: gesperrte Tage werden nicht geschrieben, sondern gemeldet", () => {
  const store = lockedStore();
  store.setDays({ "2026-09-15": { start: "08:00", end: "17:00" }, "2026-10-01": { start: "08:00", end: "17:00" } });
  store.updateSettings({ "lock:2026-09": true });
  const events = [];
  store.subscribe((e) => events.push(e));
  const rev = store.rev();

  const res = store.setDay("2026-09-15", { end: "18:00" });
  assert.equal(res.end, "17:00", "zurück kommt der unveränderte Tag");
  assert.equal(store.getDay("2026-09-15").end, "17:00");
  assert.equal(store.deleteDay("2026-09-15"), false);
  assert.ok(store.getDay("2026-09-15"));
  store.setDay("2026-09-20", { type: "vacation" });
  assert.equal(store.getDay("2026-09-20"), null, "auch neue Tage im gesperrten Monat nicht");

  const bulk = store.setDays({ "2026-09-16": { type: "vacation" }, "2026-10-02": { type: "vacation" } });
  assert.deepEqual(bulk, { written: 1, locked: ["2026-09-16"] });
  assert.equal(store.getDay("2026-10-02").type, "vacation", "offene Tage gehen durch");
  assert.equal(store.getDay("2026-09-16"), null);

  const locked = events.filter((e) => e.type === "locked").map((e) => e.dates);
  assert.deepEqual(locked, [["2026-09-15"], ["2026-09-15"], ["2026-09-20"], ["2026-09-16"]]);
  assert.equal(store.isLocked("2026-09-01"), true);
  assert.equal(store.isLocked("2026-10-01"), false);
  assert.equal(store.rev(), rev + 1, "nur der offene Tag zählt als Datenänderung");
});

test("Sperre: Speichern ohne Änderung bleibt still", () => {
  const store = lockedStore();
  store.setDay("2026-09-15", { start: "08:00", end: "17:00", note: "" });
  store.updateSettings({ "lock:2026-09": true });
  const events = [];
  store.subscribe((e) => events.push(e));
  store.setDay("2026-09-15", { start: "08:00" });                  // Feld verlassen ohne Eingabe
  store.setDay("2026-09-20", { note: "", breaks: [], type: null }); // leeres Formular eines leeren Tags
  store.setDays({ "2026-09-21": null, "2026-09-15": { end: "17:00" } });
  assert.deepEqual(events, []);
});

test("Sperre: Import „zusammenführen“ lässt gesperrte Tage aus, „ersetzen“ nicht", () => {
  const store = lockedStore();
  store.setDay("2026-09-15", { start: "08:00", end: "17:00" });
  store.updateSettings({ "lock:2026-09": true });
  const events = [];
  store.subscribe((e) => events.push(e));
  const file = { days: { "2026-09-15": { start: "07:00", end: "16:00" }, "2026-09-16": { type: "sick" }, "2026-10-05": { type: "sick" } } };

  const merged = store.importState(JSON.parse(JSON.stringify(file)), "merge");
  assert.equal(merged.added, 1);
  assert.equal(merged.skipped, 2);
  assert.equal(merged.locked, 2);
  assert.equal(store.getDay("2026-09-15").start, "08:00");
  assert.equal(store.getDay("2026-09-16"), null);
  assert.deepEqual(events.find((e) => e.type === "locked").dates, ["2026-09-15", "2026-09-16"]);

  const kept = store.importState(JSON.parse(JSON.stringify(file)), "merge-keep");
  assert.equal(kept.locked, 1, "merge-keep: vorhandene Tage sind ohnehin geschützt");

  store.importState(JSON.parse(JSON.stringify(file)), "replace");
  assert.equal(store.getDay("2026-09-15").start, "07:00", "ersetzen ist ein ganzer Stand");
  store.undo();
  assert.equal(store.getDay("2026-09-15").start, "08:00", "und lässt sich auch als Ganzes zurücknehmen");
});

test("Sperre: ein Schritt nur aus gesperrten Tagen bleibt liegen, bis der Monat offen ist", () => {
  const clock = fakeClock();
  const store = lockedStore({ clock });
  store.setDay("2026-09-15", { start: "08:00" });
  clock.tick(5000);
  store.setDay("2026-09-15", { start: "09:00" });
  clock.tick(5000);
  // Wie ein Abschluss aus einem anderen Fenster: kein eigener Rückgängig-Schritt
  store.updateSettings({ "lock:2026-09": true }, { undo: false });
  const events = [];
  store.subscribe((e) => events.push(e));

  assert.equal(store.undo(), false);
  assert.equal(store.getDay("2026-09-15").start, "09:00");
  assert.equal(store.canUndo(), true, "der Schritt ist nicht verloren");
  assert.deepEqual(events.map((e) => e.type), ["locked"]);

  store.updateSettings({ "lock:2026-09": false }, { undo: false });
  assert.equal(store.undo(), "day");
  assert.equal(store.getDay("2026-09-15").start, "08:00");
});

test("Sperre: ein gemischter Schritt nimmt nur die offenen Tage zurück", () => {
  const clock = fakeClock();
  const store = lockedStore({ clock });
  store.setDays({ "2026-09-30": { type: "vacation" }, "2026-10-01": { type: "vacation" } });
  clock.tick(5000);
  store.updateSettings({ "lock:2026-09": true }, { undo: false });
  const events = [];
  store.subscribe((e) => events.push(e));
  store.undo();
  assert.equal(store.getDay("2026-10-01"), null);
  assert.equal(store.getDay("2026-09-30").type, "vacation");
  assert.deepEqual(events.filter((e) => e.type === "locked").map((e) => e.dates), [["2026-09-30"]]);
  store.redo();
  assert.equal(store.getDay("2026-10-01").type, "vacation");
});

test("Abschliessen und sofort wieder öffnen sind zwei eigene Rückgängig-Schritte", () => {
  const store = lockedStore({ clock: () => 1000000 });          // stehende Uhr: alles „gleichzeitig“
  store.updateSettings({ "lock:2026-09": true }, { coalesce: false });
  store.updateSettings({ "lock:2026-09": undefined }, { coalesce: false });
  store.undo();
  assert.equal(store.isLocked("2026-09-15"), true, "Rückgängig nimmt nur das Wiederöffnen zurück");
  store.undo();
  assert.equal(store.isLocked("2026-09-15"), false);
});

test("Sperre: Rückgängig des Abschlusses selbst ist erlaubt", () => {
  const clock = fakeClock();
  const store = lockedStore({ clock });
  store.setDay("2026-09-15", { start: "08:00" });
  clock.tick(5000);
  store.updateSettings({ "lock:2026-09": true });
  assert.equal(store.isLocked("2026-09-15"), true);
  store.undo();
  assert.equal(store.isLocked("2026-09-15"), false);
  store.setDay("2026-09-15", { start: "07:00" });
  assert.equal(store.getDay("2026-09-15").start, "07:00");
});

test("Alles löschen entfernt die zugehörigen Einstellungen — und Rückgängig bringt sie zurück", () => {
  const store = lockedStore();
  store.setDay("2026-09-15", { start: "08:00", end: "17:00" });
  store.updateSettings({ "lock:2026-09": true, holidayRegion: "CH-BE" });
  store.reset(true);
  assert.equal(store.getSettings()["lock:2026-09"], undefined, "ohne Tage gibt es nichts abzuschliessen");
  assert.equal(store.getSettings().holidayRegion, "CH-BE", "die übrigen Einstellungen bleiben");
  assert.equal(store.dayCount(), 0);
  store.undo();
  assert.equal(store.getSettings()["lock:2026-09"], true);
  assert.equal(store.getDay("2026-09-15").start, "08:00", "auch der gesperrte Tag ist zurück");
});

test("Sperre aus dem anderen Fenster verwirft die offene Änderung und meldet sie", () => {
  const backend = S.memoryBackend();
  const make = () => {
    const st = S.createStore({ backend, defaultSettings: R.defaultSettings });
    st.setGuard(lockGuard, { prefix: "lock:" });
    st.load();
    return st;
  };
  const a = make();
  a.setDays({ "2026-09-15": { start: "08:00", end: "17:00" }, "2026-10-01": { start: "08:00", end: "17:00" } });
  a.flush();
  const b = make();
  const events = [];
  a.subscribe((e) => events.push(e));

  a.setDay("2026-09-15", { end: "19:00" });
  a.setDay("2026-10-01", { end: "19:00" });
  b.updateSettings({ "lock:2026-09": true });
  b.flush();
  a.flush();

  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.equal(saved.days["2026-09-15"].end, "17:00", "der gesperrte Tag bleibt, wie er beim Sperren war");
  assert.equal(saved.days["2026-10-01"].end, "19:00", "der offene Tag kommt durch");
  assert.equal(saved.settings["lock:2026-09"], true);
  const ext = events.find((e) => e.type === "external");
  assert.ok(ext && ext.days.includes("2026-09-15"), "die Oberfläche zeichnet den Tag neu");
  assert.deepEqual(events.find((e) => e.type === "locked").dates, ["2026-09-15"]);

  // Hat dieses Fenster selbst gesperrt, gilt sein eigener Stand
  const c = make();
  c.setDay("2026-10-05", { start: "08:00" });
  c.updateSettings({ "lock:2026-10": true });
  b.setDay("2026-11-02", { start: "08:00" }); b.flush();
  c.flush();
  assert.equal(JSON.parse(backend.getItem(S.KEY)).days["2026-10-05"].start, "08:00");
});
