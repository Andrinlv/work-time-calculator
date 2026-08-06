"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const R = require("../assets/js/core/rules.js");
const S = require("../assets/js/data/store.js");

function fresh() {
  const store = S.createStore({ backend: S.memoryBackend(), defaultSettings: R.defaultSettings });
  store.load();
  return store;
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
  const store = fresh();
  store.setDay("2026-08-06", { start: "08:00" });
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
