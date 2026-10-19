"use strict";
/* Arbeitsmodell ab Stichtag: Pensum und Sollzeiten gelten ab einem Datum,
   die Vergangenheit behält das Modell, das damals galt. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const S = require("../assets/js/data/store.js");
const Hol = require("../assets/js/core/holidays.js");
const I = require("../assets/js/ui/i18n.js");

const NOW = new Date(2026, 9, 16, 14, 23);   // Fr 16.10.2026
const FULL = 504;                            // 8 h 24 (42-h-Woche)
const P80 = Math.round(FULL * 0.8);          // 403

function settings(patch) {
  return Object.assign(R.defaultSettings(), { autoHolidays: false }, patch || {});
}
function apply(s, patch) { return Object.assign({}, s, patch); }
function target(s, iso) { return E.computeDay({ date: iso }, { settings: s, isToday: false, now: NOW }).target; }

/* Erfasste Arbeitstage Jan–Okt 2026: jeder Werktag 07:30–17:00 mit Mittag */
function records() {
  const out = {};
  T.rangeDays("2026-01-05", "2026-10-15").forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    out[iso] = { date: iso, start: "07:30", end: "17:00", breaks: [{ id: "b", start: "12:00", end: "12:45" }] };
  });
  out["2026-08-10"] = { date: "2026-08-10", type: "vacation" };
  return out;
}

/* ---------------------------------------------------------------------- */
/* Ohne Verlauf: alles wie bisher                                          */
/* ---------------------------------------------------------------------- */

test("Ohne Verlauf gilt das Modell der Einstellungen für alle Tage", () => {
  const s = settings({ workloadPercent: 60 });
  assert.deepEqual(s.modelHistory, [], "Standard: leerer Verlauf");
  assert.equal(R.baseTargetFor("2020-03-02", s, 1), 302);
  assert.equal(R.baseTargetFor("2030-03-04", s, 1), 302);
  assert.equal(R.weeklyTargetMinutes(s), 1512);
  assert.equal(R.weeklyTargetMinutes(s, "2026-11-02"), 1512);
  const m = R.modelFor("2026-11-02", s);
  assert.equal(m.workloadPercent, 60);
  assert.equal(m.maxWeeklyMinutes, s.maxWeeklyMinutes, "Wochenhöchstzeit kommt aus den Einstellungen");
  assert.equal(R.modelTimeline(s).length, 1);
});

test("baseTargetFor ermittelt den Wochentag selbst, wenn er fehlt", () => {
  const s = settings();
  assert.equal(R.baseTargetFor("2026-11-02", s), FULL, "Montag");
  assert.equal(R.baseTargetFor("2026-11-01", s), 0, "Sonntag");
});

/* ---------------------------------------------------------------------- */
/* 100 → 80 % ab Stichtag                                                  */
/* ---------------------------------------------------------------------- */

test("80 % ab 01.11.: Oktober bleibt voll, November ist 80 %", () => {
  const base = settings();
  const patch = R.changeModel(base, { workloadPercent: 80 }, "2026-11-01", { since: "2026-01-05" });
  const s = apply(base, patch);
  assert.equal(patch.workloadPercent, 80, "die Felder zeigen das jüngste Modell");
  assert.equal(patch.modelHistory.length, 2);
  assert.equal(patch.modelHistory[0].from, "2026-01-05", "Anker: frühester erfasster Tag");
  assert.equal(patch.modelHistory[0].workloadPercent, 100);
  assert.equal(patch.modelHistory[1].from, "2026-11-01");
  assert.equal(target(s, "2026-10-30"), FULL);
  assert.equal(target(s, "2026-11-02"), P80);
  assert.equal(target(s, "2025-06-02"), FULL, "vor dem ersten Eintrag gilt der erste");
  assert.equal(R.weeklyTargetMinutes(s, "2026-10-01"), 2520);
  assert.equal(R.weeklyTargetMinutes(s, "2026-12-01"), 2016);
});

test("Monatssoll im Kalender: Wechsel mitten im Monat zählt Tag für Tag", () => {
  const base = settings();
  const s = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-11-16"));
  const nov = E.computeRange("2026-11-01", "2026-11-30", () => null, s, NOW);
  // 2.–13.11.: 10 Arbeitstage voll, 16.–30.11.: 11 Arbeitstage zu 80 %
  assert.equal(nov.totals.target, 10 * FULL + 11 * P80);
  const oct = E.computeRange("2026-10-01", "2026-10-31", () => null, s, NOW);
  assert.equal(oct.totals.target, 22 * FULL, "Oktober unberührt");
});

test("Wechsel mitten in der Woche: Vertrag der Woche ist anteilig", () => {
  const base = settings();
  const s = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-11-04"));
  const c = R.contractFor("2026-11-02", "2026-11-08", s);
  assert.equal(c.minutes, 2 * FULL + 3 * P80, "Mo, Di voll · Mi–Fr 80 %");
  assert.equal(c.days, 5);
  const week = E.computeRange("2026-11-02", "2026-11-08", () => null, s, NOW);
  assert.equal(week.totals.target, c.minutes, "gleiche Zahl wie die Woche aus der Engine");
});

test("Jahr über den Wechsel: Summe der Tagessollzeiten beider Modelle", () => {
  const base = settings();
  const s = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-07-01"));
  const h1 = R.contractFor("2026-01-01", "2026-06-30", base).minutes;
  const h2 = R.contractFor("2026-07-01", "2026-12-31", apply(base, { workloadPercent: 80 })).minutes;
  const year = E.computeRange("2026-01-01", "2026-12-31", () => null, s, NOW);
  assert.equal(year.totals.target, h1 + h2);
});

/* ---------------------------------------------------------------------- */
/* Arbeitstage Mo–Fr → Mo–Do                                               */
/* ---------------------------------------------------------------------- */

test("Freitag frei ab 01.12.: Arbeitstage werden Mo–Do, Vorlage „Individuell“", () => {
  const base = settings();
  const s = apply(base, R.changeModel(base, { weekday: 5, minutes: 0 }, "2026-12-01"));
  assert.equal(target(s, "2026-11-27"), FULL, "Freitag im November");
  assert.equal(target(s, "2026-12-04"), 0, "Freitag im Dezember");
  assert.equal(target(s, "2026-12-03"), FULL, "Donnerstag bleibt");
  assert.deepEqual(R.modelFor("2026-12-04", s).workdays, [1, 2, 3, 4]);
  assert.deepEqual(R.modelFor("2026-11-27", s).workdays, [1, 2, 3, 4, 5]);
  assert.equal(s.modelPreset, "custom");
  assert.deepEqual(s.workdays, [1, 2, 3, 4]);
});

test("Arbeitstage direkt ändern: Vorlage verteilt das Wochensoll neu", () => {
  const base = settings();
  const s = apply(base, R.changeModel(base, { workdays: [1, 2, 3, 4] }, "2026-12-01"));
  assert.equal(target(s, "2026-12-01"), 630, "42 h auf vier Tage = 10 h 30");
  assert.equal(target(s, "2026-12-04"), 0);
  assert.equal(target(s, "2026-11-30"), FULL);
  assert.equal(R.weeklyTargetMinutes(s, "2026-12-01"), 2520);
});

test("Vorlage ab Stichtag wechseln", () => {
  const base = settings();
  const s = apply(base, R.changeModel(base, { modelPreset: "40" }, "2027-01-01"));
  assert.equal(target(s, "2026-12-31"), FULL);
  assert.equal(target(s, "2027-01-04"), 480);
  assert.equal(s.modelPreset, "40");
  assert.equal(R.modelFor("2026-12-31", s).modelPreset, "42");
});

/* ---------------------------------------------------------------------- */
/* Mehrere Abschnitte                                                      */
/* ---------------------------------------------------------------------- */

test("Spätere Änderung gilt ab ihrem Stichtag für alle folgenden Abschnitte", () => {
  let s = settings();
  s = apply(s, R.changeModel(s, { workloadPercent: 80 }, "2026-11-01"));
  s = apply(s, R.changeModel(s, { weekday: 5, minutes: 0 }, "2026-12-01"));
  const tl = R.modelTimeline(s);
  assert.deepEqual(tl.map((t) => [t.from, t.to, t.model.workloadPercent, t.model.workdays.join("")]), [
    [null, "2026-10-31", 100, "12345"],
    ["2026-11-01", "2026-11-30", 80, "12345"],
    ["2026-12-01", null, 80, "1234"]
  ]);
  // Freitag frei schon ab 15.10.: reicht durch alle späteren Abschnitte
  s = apply(s, R.changeModel(s, { weekday: 5, minutes: 0 }, "2026-10-15"));
  assert.equal(target(s, "2026-10-16"), 0);
  assert.equal(target(s, "2026-11-06"), 0);
  assert.equal(target(s, "2026-11-05"), P80);
  assert.equal(target(s, "2026-10-09"), FULL);
  assert.equal(R.modelTimeline(s).length, 3, "Dezember fällt mit November zusammen");
});

test("Zurück auf das alte Modell: gleiche Nachbarn verschmelzen, der Verlauf wird leer", () => {
  let s = settings();
  s = apply(s, R.changeModel(s, { workloadPercent: 80 }, "2026-11-01"));
  s = apply(s, R.changeModel(s, { workloadPercent: 100 }, "2026-11-01"));
  assert.deepEqual(s.modelHistory, []);
  assert.equal(s.workloadPercent, 100);
});

test("Rückwirkend für alle Tage: wie bisher, auch über einen Verlauf hinweg", () => {
  const base = settings();
  const retro = apply(base, R.changeModel(base, { workloadPercent: 80 }, null));
  assert.deepEqual(retro.modelHistory, [], "ohne Verlauf entsteht keiner");
  assert.equal(target(retro, "2026-03-02"), P80);

  let s = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-11-01"));
  s = apply(s, R.changeModel(s, { weekday: 5, minutes: 0 }, null));
  assert.equal(target(s, "2026-03-06"), 0, "Freitag auch in der Vergangenheit frei");
  assert.equal(target(s, "2026-03-05"), FULL, "Pensum der Vergangenheit bleibt");
  assert.equal(target(s, "2026-11-05"), P80);
});

test("Abschnitt entfernen: das vorherige Modell gilt weiter", () => {
  let s = settings();
  s = apply(s, R.changeModel(s, { workloadPercent: 80 }, "2026-11-01"));
  s = apply(s, R.changeModel(s, { workloadPercent: 60 }, "2027-01-01"));
  assert.equal(R.modelTimeline(s).length, 3);
  const mid = apply(s, R.removeModelEntry(s, 1));
  assert.equal(target(mid, "2026-11-02"), FULL, "November wieder voll");
  assert.equal(target(mid, "2027-01-04"), 302);
  const last = apply(s, R.removeModelEntry(s, 2));
  assert.equal(target(last, "2027-01-04"), P80, "80 % gelten weiter");
  assert.equal(last.workloadPercent, 80, "die Felder folgen dem jüngsten Modell");
  const first = apply(s, R.removeModelEntry(s, 0));
  assert.equal(target(first, "2026-03-02"), P80, "beim ersten übernimmt der nächste auch die Zeit davor");
  assert.equal(R.removeModelEntry(settings(), 0), null, "ohne Verlauf nichts zu entfernen");
});

test("Abschnitt bearbeiten: Stichtag verschieben und Werte ändern", () => {
  let s = settings();
  s = apply(s, R.changeModel(s, { workloadPercent: 80 }, "2026-11-01"));
  const moved = apply(s, R.editModelEntry(s, 1, { from: "2026-11-16", workloadPercent: 80, weeklyTargets: s.weeklyTargets }));
  assert.equal(target(moved, "2026-11-13"), FULL);
  assert.equal(target(moved, "2026-11-16"), P80);
  const past = apply(s, R.editModelEntry(s, 0, { workloadPercent: 90, weeklyTargets: R.weeklyPreset(2520, [1, 2, 3, 4, 5]) }));
  assert.equal(target(past, "2026-10-30"), 454, "90 % von 8 h 24 in der Vergangenheit");
  assert.equal(target(past, "2026-11-02"), P80);
  // Vor den Anker verschoben: der Anker rückt mit, die Reihenfolge stimmt
  const early = apply(s, R.editModelEntry(s, 1, { from: "2025-06-01" }));
  assert.equal(early.modelHistory[0].from < "2025-06-01", true);
  assert.equal(target(early, "2025-06-02"), P80);
  assert.equal(target(early, "2025-05-30"), FULL);
});

test("Verlauf wird beim Lesen bereinigt und sortiert", () => {
  const s = settings({
    workloadPercent: 50,
    modelHistory: [
      { from: "2026-11-01", weeklyTargets: R.weeklyPreset(2520, [1, 2, 3, 4, 5]), workloadPercent: 50 },
      { from: "kaputt", weeklyTargets: [1, 2] },
      { from: "2026-01-01", weeklyTargets: R.weeklyPreset(2520, [1, 2, 3, 4, 5]), workloadPercent: 100 },
      { from: "2026-02-30", weeklyTargets: R.weeklyPreset(2520, [1, 2, 3, 4, 5]) },
      null
    ]
  });
  assert.equal(target(s, "2026-10-30"), FULL);
  assert.equal(target(s, "2026-11-02"), 252, "letzter Abschnitt: Werte der Einstellungen");
  assert.equal(R.modelTimeline(s).length, 2);
  // Ein einzelner Eintrag ist der letzte Abschnitt — es gelten die Einstellungen
  const one = settings({ workloadPercent: 70, modelHistory: [{ from: "2026-01-01", weeklyTargets: R.weeklyPreset(2520, [1, 2, 3, 4, 5]), workloadPercent: 100 }] });
  assert.equal(target(one, "2026-03-02"), Math.round(FULL * 0.7));
});

test("Onboarding und ältere Fenster ändern über die Felder das jüngste Modell", () => {
  let s = settings();
  s = apply(s, R.changeModel(s, { workloadPercent: 80 }, "2026-11-01"));
  s = apply(s, { workloadPercent: 50 });      // schreibt nur das Feld, nicht den Verlauf
  assert.equal(target(s, "2026-11-02"), 252);
  assert.equal(target(s, "2026-10-30"), FULL, "die Vergangenheit bleibt");
  assert.equal(R.modelTimeline(s)[1].model.workloadPercent, 50);
});

test("Eigene Wochenhöchstzeit eines Eintrags gilt nur in seinem Abschnitt", () => {
  const wk = R.weeklyPreset(2520, [1, 2, 3, 4, 5]);
  const s = settings({
    maxWeeklyMinutes: 3000,
    modelHistory: [
      { from: "2026-01-01", weeklyTargets: wk, workloadPercent: 100, maxWeeklyMinutes: 2700 },
      { from: "2026-11-01", weeklyTargets: wk, workloadPercent: 80 }
    ]
  });
  assert.equal(R.modelFor("2026-05-04", s).maxWeeklyMinutes, 2700);
  assert.equal(R.modelFor("2026-11-02", s).maxWeeklyMinutes, 3000);
  const patch = R.changeModel(s, { workloadPercent: 60 }, "2027-01-01");
  assert.equal(patch.modelHistory[0].maxWeeklyMinutes, 2700, "bleibt beim Umschreiben erhalten");
  assert.equal(patch.modelHistory[2].maxWeeklyMinutes, undefined, "die der Einstellungen wird nicht kopiert");
});

/* ---------------------------------------------------------------------- */
/* Saldo, Gutschriften, Kontingente                                        */
/* ---------------------------------------------------------------------- */

test("Zeitkonto: Saldo der Vergangenheit bleibt bei einer Änderung ab Stichtag gleich", () => {
  const days = records();
  const base = settings();
  const before = E.accountBalance(days, base, "2026-10-15", NOW).minutes;
  const future = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-11-01", { since: "2026-01-05" }));
  assert.equal(E.accountBalance(days, future, "2026-10-15", NOW).minutes, before, "ab 01.11.");
  const today = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-10-16"));
  assert.equal(E.accountBalance(days, today, "2026-10-15", NOW).minutes, before, "ab heute");
  const retro = apply(base, R.changeModel(base, { workloadPercent: 80 }, null));
  assert.ok(E.accountBalance(days, retro, "2026-10-15", NOW).minutes > before + 100 * 60, "rückwirkend: weniger Soll, viel mehr Plus");
  const sept = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-09-01"));
  const diff = E.accountBalance(days, sept, "2026-10-15", NOW).minutes - before;
  const workdays = E.computeRange("2026-09-01", "2026-10-15", (iso) => days[iso], base, NOW).days
    .filter((r) => r.type === "work" && r.recorded).length;
  assert.equal(diff, workdays * (FULL - P80), "ab 01.09.: nur Sept./Okt. rechnen neu");
});

test("Lücken als Minus: auch sie zählen mit dem Modell ihres Tages", () => {
  const base = settings({ countMissingWorkdays: true, carryOverFrom: "2026-10-01" });
  const s = apply(base, R.changeModel(base, { workloadPercent: 50 }, "2026-10-12"));
  // 12. und 13.10. ohne Eintrag: je 4 h 12 statt 8 h 24 Minus
  const days = { "2026-10-14": { date: "2026-10-14", type: "vacation" } };
  const r = E.accountBalance(days, s, "2026-10-13", NOW);
  const full = E.accountBalance(days, base, "2026-10-13", NOW);
  assert.equal(full.minutes - r.minutes, -(2 * (FULL - 252)), "zwei Tage im neuen Modell sind halb so teuer");
});

test("Feiertage und Absenzen schreiben das Soll ihres Tages gut", () => {
  const base = settings({ autoHolidays: true, holidayRegion: "CH-LU" });
  const s = apply(base, R.changeModel(base, { workloadPercent: 80 }, "2026-11-01"));
  const vacOct = E.computeDay({ date: "2026-10-30", type: "vacation" }, { settings: s, isToday: false, now: NOW });
  const vacNov = E.computeDay({ date: "2026-11-03", type: "vacation" }, { settings: s, isToday: false, now: NOW });
  assert.equal(vacOct.credited, FULL);
  assert.equal(vacNov.credited, P80);
  const half = E.computeDay({ date: "2026-11-04", type: "sick", absenceFactor: 0.5 }, { settings: s, isToday: false, now: NOW });
  assert.equal(half.credited, Math.round(P80 * 0.5));
  // Feiertag (8.12. Mariä Empfängnis, LU) im neuen Modell
  const hol = E.computeDay({ date: "2026-12-08" }, { settings: s, isToday: false, now: NOW, holiday: Hol.lookup("2026-12-08", "CH-LU") });
  assert.equal(hol.type, "holiday");
  assert.equal(hol.credited, P80);
});

test("Ferien-Kontingent: ein freier Freitag im neuen Modell kostet keinen Ferientag", () => {
  const base = settings();
  const s = apply(base, R.changeModel(base, { weekday: 5, minutes: 0 }, "2026-11-01"));
  const days = {
    "2026-10-30": { date: "2026-10-30", type: "vacation" },
    "2026-11-06": { date: "2026-11-06", type: "vacation" },
    "2026-11-05": { date: "2026-11-05", type: "vacation" }
  };
  const q = E.quotaUsage(days, 2026, s, NOW);
  assert.equal(q.vacation, 2, "30.10. und 5.11. — der 6.11. ist kein Arbeitstag mehr");
});

test("Jahresrückblick: Saldo in Tagen mit dem Modell am Ende des Jahres", () => {
  const Rev = require("../assets/js/core/review.js");
  const base = settings();
  const s = apply(base, R.changeModel(base, { workloadPercent: 50 }, "2026-07-01"));
  assert.equal(Rev.yearStats({}, s, 2025, NOW).dayTarget, FULL, "2025 noch voll");
  assert.equal(Rev.yearStats({}, s, 2026, NOW).dayTarget, 252, "2026 endet mit 50 %");
});

/* ---------------------------------------------------------------------- */
/* Speicher: der Verlauf ist ein Schlüssel und reist mit den Feldern        */
/* ---------------------------------------------------------------------- */

function twoWindows() {
  const backend = S.memoryBackend();
  const a = S.createStore({ backend, defaultSettings: R.defaultSettings });
  a.load();
  a.setDay("2026-10-05", { start: "08:00", end: "17:00" }, { immediate: true });
  const b = S.createStore({ backend, defaultSettings: R.defaultSettings });
  b.load();
  return { backend, a, b };
}

test("Speicher: Verlauf und Felder überleben Neustart, Export und Import", () => {
  const { backend, a } = twoWindows();
  a.updateSettings(R.changeModel(a.getSettings(), { workloadPercent: 80 }, "2026-11-01", { since: "2026-10-05" }), { immediate: true });
  const again = S.createStore({ backend, defaultSettings: R.defaultSettings });
  again.load();
  assert.equal(again.getSettings().modelHistory.length, 2);
  assert.equal(R.baseTargetFor("2026-11-02", again.getSettings(), 1), P80);
  const fresh = S.createStore({ backend: S.memoryBackend(), defaultSettings: R.defaultSettings });
  fresh.load();
  fresh.importState(again.exportState(), "replace");
  assert.deepEqual(fresh.getSettings().modelHistory, again.getSettings().modelHistory);
  // Kaputter Typ beim Import wird verworfen, der Standard bleibt
  const other = S.createStore({ backend: S.memoryBackend(), defaultSettings: R.defaultSettings });
  other.load();
  other.importState({ days: { "2026-10-05": { start: "08:00", end: "17:00" } }, settings: { modelHistory: "kaputt" } }, "merge");
  assert.deepEqual(other.getSettings().modelHistory, []);
});

test("Speicher: zwei Fenster — der Verlauf geht als ein Schlüssel nicht verloren", () => {
  const { backend, a, b } = twoWindows();
  a.updateSettings(R.changeModel(a.getSettings(), { workloadPercent: 80 }, "2026-11-01"));
  a.flush();
  b.updateSettings({ theme: "dark" });
  b.flush();
  const saved = JSON.parse(backend.getItem(S.KEY)).settings;
  assert.equal(saved.theme, "dark");
  assert.equal(saved.modelHistory.length, 2, "B überschreibt den Verlauf von A nicht");
  assert.equal(saved.workloadPercent, 80);
  assert.equal(R.baseTargetFor("2026-11-02", b.getSettings(), 1), P80, "B rechnet mit dem übernommenen Verlauf");
  assert.equal(R.baseTargetFor("2026-10-30", b.getSettings(), 5), FULL);
});

test("Speicher: Rückgängig nimmt Verlauf und Felder gemeinsam zurück", () => {
  const backend = S.memoryBackend();
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings });
  store.load();
  store.updateSettings(R.changeModel(store.getSettings(), { workloadPercent: 80 }, "2026-11-01"));
  assert.equal(store.getSettings().modelHistory.length, 2);
  store.undo();
  assert.deepEqual(store.getSettings().modelHistory, []);
  assert.equal(store.getSettings().workloadPercent, 100);
  assert.equal(R.baseTargetFor("2026-11-02", store.getSettings(), 1), FULL, "kein veralteter Zwischenspeicher");
  store.redo();
  assert.equal(R.baseTargetFor("2026-11-02", store.getSettings(), 1), P80);
});

/* ---------------------------------------------------------------------- */
/* Einstellungen: Stichtag-Auswahl und Beschriftungen                      */
/* ---------------------------------------------------------------------- */

function loadSettingsView() {
  const sandbox = { ZK: { Time: T, Rules: R, Holidays: Hol, I18n: I, Dom: {} }, console };
  sandbox.self = sandbox;
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/ui/views/settings.js"), "utf8");
  vm.runInNewContext(src, sandbox, { filename: "settings.js" });
  return sandbox.ZK.Views.settings;
}
const V = loadSettingsView();

test("Stichtag-Auswahl: heute, nächster Monat, Datum, rückwirkend", () => {
  assert.equal(V.scopeFrom("today", "2026-10-16"), "2026-10-16");
  assert.equal(V.scopeFrom("month", "2026-10-16"), "2026-11-01");
  assert.equal(V.scopeFrom("month", "2026-12-31"), "2027-01-01", "über den Jahreswechsel");
  assert.equal(V.scopeFrom("date", "2026-10-16", "2026-11-04"), "2026-11-04");
  assert.equal(V.scopeFrom("date", "2026-10-16", "kaputt"), "2026-10-16", "ungültiges Datum → heute");
  assert.equal(V.scopeFrom("all", "2026-10-16"), null);
});

test("Verlauf: Beschriftung der Abschnitte in allen Sprachen", () => {
  let s = settings();
  s = apply(s, R.changeModel(s, { workloadPercent: 80 }, "2026-11-01"));
  s = apply(s, R.changeModel(s, { weekday: 5, minutes: 0 }, "2027-02-01"));
  const tl = R.modelTimeline(s);
  const fmt = (m) => T.formatDuration(m, "hm");
  I.setLang("de");
  assert.equal(V.segmentWhen(tl[0], "2026-10-16"), "bis 31.10.");
  assert.equal(V.segmentWhen(tl[1], "2026-10-16"), "01.11. – 31.01.2027");
  assert.equal(V.segmentWhen(tl[2], "2026-10-16"), "ab 01.02.2027");
  assert.equal(V.segmentWhat(tl[0].model, fmt), "100 % · 42 h · Mo–Fr");
  assert.equal(V.segmentWhat(tl[1].model, fmt), "80 % · 33 h 36 min · Mo–Fr");
  assert.equal(V.segmentWhat(tl[2].model, fmt), "80 % · 26 h 53 min · Mo–Do");
  I.LANGS.forEach((l) => {
    I.setLang(l);
    tl.forEach((seg) => {
      const text = V.segmentWhen(seg, "2026-10-16") + " " + V.segmentWhat(seg.model, fmt);
      assert.ok(!/\{|\}|undefined|NaN|set\.mh/.test(text), l + ": " + text);
    });
  });
  I.setLang("de");
});

test("Neue Texte des Arbeitsmodell-Verlaufs existieren in allen vier Sprachen", () => {
  const keys = Object.keys(I.DICT.de).filter((k) => k.indexOf("set.mh.") === 0);
  assert.ok(keys.length >= 30, "Texte registriert: " + keys.length);
  keys.forEach((k) => I.LANGS.forEach((l) => {
    assert.ok(I.DICT[l][k], k + " fehlt in " + l);
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
    assert.equal(vars(I.DICT[l][k]), vars(I.DICT.de[k]), k + ": Platzhalter in " + l);
  }));
  keys.forEach((k) => assert.ok(!/ß/.test(I.DICT.de[k]), "Schweizer Schreibweise: " + k));
});
