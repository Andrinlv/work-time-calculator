"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const RV = require("../assets/js/core/review.js");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const A = require("../assets/js/core/achievements.js");
const H = require("../assets/js/core/holidays.js");

const S = Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU" });
const NOW = new Date(2026, 9, 16, 14, 23);   // Fr 16.10.2026, 14:23

function work(date, start, end, extra) {
  return Object.assign({ date, start, end, breaks: [{ id: "l", start: "12:00", end: "12:30", paid: false }], note: "", absenceFactor: 1, location: "office" }, extra || {});
}
function absent(date, type, extra) {
  return Object.assign({ date, type, start: "", end: "", breaks: [], note: "", absenceFactor: 1, location: "office" }, extra || {});
}

/* Ein Jahr wie im Alltag: Mo Homeoffice, Do länger, Fr kürzer, Sportferien
   im Februar, Auffahrtsbrücke (Fr 15.5.), heute läuft seit 07:30. */
function seedLike() {
  const days = {};
  T.rangeDays("2026-01-05", "2026-10-15").forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    if (iso >= "2026-02-16" && iso <= "2026-02-20") { days[iso] = absent(iso, "vacation"); return; }
    if (iso === "2026-05-15") { days[iso] = absent(iso, "vacation"); return; }
    if (H.lookup(iso, "CH-LU")) return;   // Feiertage ohne Eintrag
    const end = wd === 4 ? "17:30" : wd === 5 ? "16:00" : "17:00";
    days[iso] = work(iso, wd === 2 ? "06:45" : "08:00", end, { location: wd === 1 ? "home" : "office" });
  });
  days["2026-09-19"] = work("2026-09-19", "09:00", "11:00", { breaks: [] });   // Samstagseinsatz
  days["2026-10-16"] = work("2026-10-16", "07:30", "", { breaks: [] });         // läuft
  days["2026-12-28"] = absent("2026-12-28", "vacation");                         // geplant
  return days;
}

/* ====================================================================== */
/* Jahreskennzahlen                                                         */
/* ====================================================================== */

test("Jahreskennzahlen stimmen mit Engine und Statistik überein", () => {
  const days = seedLike();
  const st = RV.yearStats(days, S, 2026, NOW);
  const range = E.computeRange("2026-01-01", "2026-10-16", (iso) => days[iso], S, NOW);
  assert.equal(st.until, "2026-10-16");
  assert.equal(st.partial, true);
  assert.equal(st.totalNet, range.totals.net);
  assert.equal(st.workedDays, range.totals.workedDays);
  assert.equal(st.avgNet, range.totals.avgNet);
  assert.equal(st.avgStart, range.totals.avgStart);
  assert.equal(st.avgEnd, range.totals.avgEnd);
  assert.equal(st.earliest.minutes, range.totals.earliestStart);
  assert.equal(st.latest.minutes, range.totals.latestEnd);
  assert.equal(st.longest.minutes, range.totals.longestDay);
  // Erfasst = eigener Eintrag (automatische Feiertage zählen nicht)
  const own = range.days.filter((r) => r.recorded && days[r.date]).length;
  assert.equal(st.recordedDays, own);
  // Zeitkonto abgerechnet: der laufende Tag zählt nicht
  assert.equal(st.balanceEnd, E.accountBalance(days, S, "2026-10-16", NOW).minutes);
  assert.equal(st.balanceEnd, E.accountBalance(days, S, "2026-10-15", NOW).minutes);
  assert.equal(st.balanceStart, 0);
  assert.equal(st.balanceDelta, st.balanceEnd);
  // Ferien wie im Kontingent: geplante Dezembertage sind nicht bezogen
  const q = E.quotaUsage(days, 2026, S, NOW);
  assert.equal(st.vacationTaken, q.vacationTaken);
  assert.equal(st.vacationTaken, 6);
  assert.equal(st.vacationPlanned, 1);
});

test("Monatswerte summieren sich zum Jahr", () => {
  const days = seedLike();
  const st = RV.yearStats(days, S, 2026, NOW);
  assert.equal(st.months.length, 12);
  assert.equal(st.months.reduce((a, m) => a + m.net, 0), st.totalNet);
  assert.equal(st.months[10].future, true);
  assert.equal(st.months[9].future, false);
  assert.ok(st.busiestMonth.net >= Math.max.apply(null, st.months.map((m) => m.net)));
  // Saldo eines Monats wie die Monatssäule: Summe der Tagessaldi
  const sep = E.computeRange("2026-09-01", "2026-09-30", (iso) => days[iso], S, NOW).totals;
  assert.equal(st.months[8].balance, sep.provisionalBalance);
  assert.equal(st.months[8].net, sep.net);
});

test("Lieblingstag ignoriert einzelne Samstagseinsätze", () => {
  const st = RV.yearStats(seedLike(), S, 2026, NOW);
  assert.equal(st.favoriteWeekday.weekday, 2);   // Di beginnt 06:45
  assert.equal(st.shortestWeekday.weekday, 5);   // Fr endet 16:00
  assert.equal(st.weekdays[6].count, 0, "ein Samstagseinsatz ohne Soll ist kein voller Arbeitstag");
  const tue = E.computeDay(seedLike()["2026-10-13"], { settings: S, now: NOW });
  assert.equal(st.favoriteWeekday.avg, tue.net);
});

test("Frühester Beginn, Frühstarts und Homeoffice-Anteil", () => {
  const st = RV.yearStats(seedLike(), S, 2026, NOW);
  assert.equal(st.earliest.minutes, 6 * 60 + 45);
  assert.equal(st.earliest.date, "2026-01-06");   // erster Dienstag gewinnt
  assert.ok(st.earlyStarts > 30);
  assert.equal(st.locations.home + st.locations.office + st.locations.field + st.locations.travel, st.workedDays);
  assert.ok(Math.abs(st.homeShare - st.locations.home / st.workedDays) < 1e-9);
  assert.ok(st.homeShare > 0.15 && st.homeShare < 0.25);
});

test("Serie wie bei den Erfolgen, Feiertage unterbrechen nicht", () => {
  const days = seedLike();
  const st = RV.yearStats(days, S, 2026, NOW);
  const ach = A.buildStats(days, S, NOW);
  assert.equal(st.streak.days, ach.bestStreak);
  assert.equal(st.streak.from, "2026-01-05");
  // Eine Lücke teilt die Serie
  const gap = Object.assign({}, days);
  delete gap["2026-06-10"];
  const st2 = RV.yearStats(gap, S, 2026, NOW);
  assert.equal(st2.streak.days, A.buildStats(gap, S, NOW).bestStreak);
  assert.ok(st2.streak.days < st.streak.days);
});

test("Beste Brücke: Auffahrt mit einem Ferientag schlägt eine Ferienwoche", () => {
  const st = RV.yearStats(seedLike(), S, 2026, NOW);
  assert.deepEqual(
    { from: st.bridge.from, to: st.bridge.to, days: st.bridge.days, vacation: st.bridge.vacation, ratio: st.bridge.ratio },
    { from: "2026-05-14", to: "2026-05-17", days: 4, vacation: 1, ratio: 4 }
  );
  assert.deepEqual(st.bridge.holidays, ["2026-05-14"]);
});

test("Brücke: halbe Ferientage und Geplantes zählen nicht", () => {
  const days = {
    "2026-03-05": absent("2026-03-05", "vacation", { absenceFactor: 0.5 }),
    "2026-03-06": absent("2026-03-06", "vacation"),
    "2026-11-20": absent("2026-11-20", "vacation")      // nach „heute“
  };
  const st = RV.yearStats(days, S, 2026, NOW);
  assert.equal(st.bridge.from, "2026-03-06");
  assert.equal(st.bridge.days, 3);      // Fr–So
  assert.equal(st.bridge.vacation, 1);
  assert.deepEqual(st.bridge.holidays, []);
});

test("Ferienblock über Neujahr gehört dem Jahr seines ersten Ferientags", () => {
  const days = {};
  ["2025-12-29", "2025-12-30", "2025-12-31"].forEach((d) => { days[d] = absent(d, "vacation"); });
  const s25 = RV.yearStats(days, S, 2025, NOW);
  // Sa 27.12. bis So 4.1.: Neujahr und Berchtoldstag sind Feiertage in Luzern
  assert.equal(s25.bridge.from, "2025-12-25");
  assert.equal(s25.bridge.to, "2026-01-04");
  assert.equal(s25.bridge.vacation, 3);
  assert.equal(RV.yearStats(days, S, 2026, NOW).bridge, null);
});

test("Leeres Jahr: keine NaN, keine erfundenen Werte", () => {
  const st = RV.yearStats({}, S, 2026, NOW);
  assert.equal(st.empty, true);
  assert.equal(st.recordedDays, 0);
  assert.equal(st.totalNet, 0);
  assert.equal(st.avgNet, 0);
  assert.equal(st.longest, null);
  assert.equal(st.earliest, null);
  assert.equal(st.favoriteWeekday, null);
  assert.equal(st.busiestMonth, null);
  assert.equal(st.streak, null);
  assert.equal(st.bridge, null);
  assert.equal(st.homeShare, 0);
  assert.equal(st.balanceEnd, 0);
  assert.deepEqual(st.compare, { lugano: 0, glacier: 0, crossings: 0, km: 0 });
  JSON.stringify(st, (k, v) => { assert.ok(!(typeof v === "number" && !isFinite(v)), k); return v; });
  // Ein Jahr in der Zukunft hat ebenfalls nichts
  const future = RV.yearStats(seedLike(), S, 2027, NOW);
  assert.equal(future.empty, true);
  assert.equal(future.totalNet, 0);
});

test("Schaltjahr: der 29. Februar zählt mit", () => {
  const days = {};
  T.rangeDays("2024-02-26", "2024-03-01").forEach((iso) => { days[iso] = work(iso, "08:00", "17:00"); });
  const now = new Date(2025, 2, 1, 12, 0);
  const st = RV.yearStats(days, S, 2024, now);
  assert.equal(st.partial, false);
  assert.equal(st.until, "2024-12-31");
  assert.equal(st.recordedDays, 5);
  assert.equal(st.months[1].days, 4);              // 26.–29. Februar
  assert.equal(st.months[2].days, 1);
  assert.equal(st.streak.days, 5);
  assert.equal(st.streak.to, "2024-03-01");
  assert.equal(st.totalNet, 5 * 510);
  const range = E.computeRange("2024-01-01", "2024-12-31", (iso) => days[iso], S, now);
  assert.equal(range.days.length, 366);
  assert.equal(st.totalNet, range.totals.net);
});

test("Kontostand: Vorjahr und Übertrag ergeben den Jahresbeginn", () => {
  const days = {
    "2025-12-15": work("2025-12-15", "07:00", "18:00"),
    "2026-01-12": work("2026-01-12", "08:00", "17:00")
  };
  const s = Object.assign({}, S, { carryOverMinutes: 60, carryOverFrom: "2025-01-01" });
  const st = RV.yearStats(days, s, 2026, NOW);
  assert.equal(st.balanceStart, E.accountBalance(days, s, "2025-12-31", NOW).minutes);
  // 07:00–18:00: über 9 h Arbeit verlangen 60 min Pause → 9 h 60 netto, +96
  assert.equal(st.balanceStart, 60 + 96);
  assert.equal(st.balanceEnd, 60 + 96 + 6);
  assert.equal(st.balanceDelta, 6);
});

test("Jahre mit Daten: neuestes zuerst, Geplantes zählt nicht", () => {
  const days = Object.assign(seedLike(), {
    "2025-11-03": work("2025-11-03", "08:00", "17:00"),
    "2027-01-04": absent("2027-01-04", "vacation")
  });
  const ys = RV.yearsWithData(days, S, NOW);
  assert.deepEqual(ys.map((y) => y.year), [2026, 2025]);
  assert.equal(ys[1].days, 1);
  assert.equal(RV.recordedDays(days, S, 2026, NOW), RV.yearStats(days, S, 2026, NOW).recordedDays);
  assert.equal(RV.recordedDays(days, S, 2024, NOW), 0);
});

test("Vergleiche zum Schmunzeln sind abgerundet", () => {
  assert.deepEqual(RV.compare(120 * 60), { lugano: 60, glacier: 15, crossings: 1, km: 600 });
  assert.deepEqual(RV.compare(119), { lugano: 0, glacier: 0, crossings: 0, km: 10 });
  assert.deepEqual(RV.compare(-50), { lugano: 0, glacier: 0, crossings: 0, km: 0 });
});

/* ====================================================================== */
/* Momente                                                                  */
/* ====================================================================== */

function at(y, m, d, h) { return new Date(y, m - 1, d, h || 9, 0); }
function moment(days, now, extra) {
  return RV.moment({ records: days, settings: Object.assign({}, S, extra || {}), now });
}

test("Ferien-Countdown zählt die Arbeitstage nach heute", () => {
  const days = {};
  ["2026-12-28", "2026-12-29", "2026-12-30"].forEach((d) => { days[d] = absent(d, "vacation"); });
  // Di 22.12.: Mi, Do — Fr 25.12. ist Weihnachten
  assert.deepEqual(moment(days, at(2026, 12, 22)), { kind: "vacation", key: "vac:2026-12-28", vars: { n: 2, start: "2026-12-28", days: 3 } });
  assert.equal(moment(days, at(2026, 12, 24)).vars.n, 0);       // letzter Arbeitstag
  assert.equal(moment(days, at(2026, 12, 26)), null);            // Ferien haben faktisch begonnen
  assert.equal(moment(days, at(2026, 12, 15)), null);            // noch zu weit weg
});

test("Ein einzelner Ferientag ist kein Ferien-Countdown, aber ein langes Wochenende", () => {
  const days = { "2026-03-13": absent("2026-03-13", "vacation") };   // Fr
  const m = moment(days, at(2026, 3, 10));
  assert.equal(m.kind, "weekend");
  assert.deepEqual(m.vars, { days: 3, start: "2026-03-13", holiday: null });
});

test("Langes Wochenende über Pfingsten", () => {
  const m = moment({}, at(2026, 5, 20));
  assert.equal(m.kind, "weekend");
  assert.deepEqual(m.vars, { days: 3, start: "2026-05-23", holiday: "2026-05-25" });
  assert.equal(m.key, "lw:2026-05-23");
  // Ein gewöhnliches Wochenende ist kein Anlass
  assert.equal(moment({}, at(2026, 6, 10)), null);
});

test("Brückentag-Tipp nur ohne Eintrag am Brückentag", () => {
  const m = moment({}, at(2026, 12, 1));
  assert.equal(m.kind, "bridge");
  assert.deepEqual(m.vars, { date: "2026-12-07", days: 4, holiday: "2026-12-08" });
  const taken = { "2026-12-07": work("2026-12-07", "08:00", "17:00") };
  assert.equal(moment(taken, at(2026, 12, 1)), null);
});

test("Neuer Monat: erster Arbeitstag mit dem Saldo des Vormonats", () => {
  const days = {
    "2026-10-29": work("2026-10-29", "08:00", "18:00"),
    "2026-10-30": work("2026-10-30", "08:00", "16:00")
  };
  const m = moment(days, at(2026, 11, 2));   // 1.11. ist ein Sonntag
  assert.equal(m.kind, "month");
  assert.equal(m.key, "mo:2026-11");
  const oct = E.computeRange("2026-10-01", "2026-10-31", (iso) => days[iso], S, at(2026, 11, 2)).totals.balance;
  assert.equal(m.vars.balance, oct);
  assert.equal(m.vars.balance, 36 - 54);   // 9 h netto (60 min Pflichtpause) und 7 h 30
  assert.equal(moment(days, at(2026, 11, 3)), null);       // zweiter Arbeitstag
  assert.equal(moment({}, at(2026, 11, 2)), null);         // Vormonat ohne Erfassung
});

test("Persönlicher Rekord nur am Tag, an dem er fällt", () => {
  const days = {};
  T.rangeDays("2026-01-05", "2026-01-09").forEach((d) => { days[d] = work(d, "08:00", "17:00"); });   // 5 Tage
  T.rangeDays("2026-01-13", "2026-01-19").forEach((d) => { if (T.weekdayOf(d) % 6) days[d] = work(d, "08:00", "17:00"); });
  // 12.1. fehlt → zweite Serie ab 13.1.: Di–Fr + Mo = 5 Tage; Di 20.1. macht 6
  assert.equal(moment(days, at(2026, 1, 19, 18)), null);
  days["2026-01-20"] = work("2026-01-20", "08:00", "17:00");
  const m = moment(days, at(2026, 1, 20, 18));
  assert.equal(m.kind, "record");
  assert.deepEqual(m.vars, { days: 6, previous: 5 });
  days["2026-01-21"] = work("2026-01-21", "08:00", "17:00");
  assert.equal(moment(days, at(2026, 1, 21, 18)), null);   // nicht jeden Tag wieder
});

test("Momente: ausgeschaltet, weggeklickt und höchstens einmal am Tag", () => {
  const days = {};
  ["2026-12-28", "2026-12-29"].forEach((d) => { days[d] = absent(d, "vacation"); });
  assert.equal(moment(days, at(2026, 12, 22), { moments: { enabled: false } }), null);
  // Countdown weggeklickt → an einem späteren Tag kommt er nicht wieder
  const gone = { moments: { enabled: true, dismissed: { "vac:2026-12-28": "2026-12-21" } } };
  assert.equal(moment(days, at(2026, 12, 22), gone), null);
  // Heute schon etwas weggeklickt → heute nichts mehr
  const today = { moments: { dismissed: { "mo:2026-12": "2026-12-01" } } };
  assert.equal(moment({}, at(2026, 12, 1), today), null);
  // Ein anderer Anlass desselben Tages kommt erst morgen
  assert.equal(moment({}, at(2026, 12, 2), today).kind, "bridge");
});

test("dismiss merkt den Anlass und räumt Altes weg", () => {
  const cfg = { enabled: true, dismissed: { "mo:2025-01": "2025-01-06", "vac:2026-07-13": "2026-07-08" } };
  const next = RV.dismiss(cfg, "lw:2026-10-17", "2026-10-16");
  assert.deepEqual(next, { enabled: true, dismissed: { "vac:2026-07-13": "2026-07-08", "lw:2026-10-17": "2026-10-16" } });
  assert.deepEqual(RV.dismiss(undefined, "x", "2026-10-16"), { enabled: true, dismissed: { x: "2026-10-16" } });
  assert.equal(cfg.dismissed["mo:2025-01"], "2025-01-06");   // Eingabe bleibt unverändert
});

/* ====================================================================== */
/* Oberfläche: Kartenmodell, Palette, Texte (ohne DOM)                      */
/* ====================================================================== */

const I = require("../assets/js/ui/i18n.js");
const addedDicts = [];
const origAdd = I.add;
I.add = function (dicts) { addedDicts.push(dicts); return origAdd(dicts); };
global.self = { ZK: { I18n: I, Time: T, Rules: R, Engine: E, Review: RV, Dom: {} } };
require("../assets/js/ui/ext.js");
require("../assets/js/ui/views/stats.js");
require("../assets/js/ui/features/review.js");
I.add = origAdd;
const UI = global.self.ZK.ReviewUI;
const STATS = global.self.ZK.Views.stats.calc;

function fakeApp(records) {
  return {
    settings: () => S,
    fmt: (m) => T.formatDuration(m, "hm"),
    fmtSigned: (m) => T.formatSigned(m, "clock"),
    holiday: (iso) => H.lookup(iso, "CH-LU"),
    store: { allDays: () => records },
    dataRevision: () => "t"
  };
}

test("Übersetzungen des Rückblicks: jeder Schlüssel in de, en, fr und it", () => {
  const mine = addedDicts.filter((d) => Object.keys(d.de || {}).some((k) => k.indexOf("rv.") === 0));
  assert.equal(mine.length, 1);
  const d = mine[0];
  const keys = Object.keys(d.de);
  ["en", "fr", "it"].forEach((lang) => {
    assert.deepEqual(Object.keys(d[lang]).sort(), keys.slice().sort(), lang);
    keys.forEach((k) => assert.ok(String(d[lang][k]).trim(), lang + " " + k));
  });
  keys.forEach((k) => assert.ok(d.de[k].indexOf("ß") < 0, "Schweizer Schreibweise: " + k));
  // Platzhalter stimmen in allen Sprachen überein (die Einzahl darf die Zahl ausschreiben)
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  keys.forEach((k) => {
    if (k.slice(-4) === ".one") return;
    ["en", "fr", "it"].forEach((lang) => assert.equal(ph(d[lang][k]), ph(d.de[k]), lang + " " + k));
  });
});

test("Rückblick und Statistik nennen dieselben Zahlen", () => {
  I.setLang("de");
  const days = seedLike();
  const st = RV.yearStats(days, S, 2026, NOW);
  const range = E.computeRange("2026-01-01", "2026-10-16", (iso) => days[iso], S, NOW);
  const sum = STATS.summarize(range.days, (iso) => !!days[iso]);
  assert.equal(st.recordedDays, sum.recorded);
  assert.equal(st.workedDays, sum.worked);
  assert.equal(st.longest.minutes, sum.longest);
  assert.equal(st.longest.date, sum.longestDate);
  const q = STATS.quotaOf(range.days, 2026, "2026-10-16", S);
  assert.equal(st.vacationTaken, q.vacationTaken);
  const App = fakeApp(days);
  const cards = UI.buildCards(App, st);
  assert.deepEqual(cards.map((c) => c.id), ["intro", "hours", "rhythm", "streak", "weekday", "month", "place", "vacation", "balance"]);
  const by = (id) => cards.find((c) => c.id === id);
  assert.equal(by("balance").big, App.fmtSigned(E.accountBalance(days, S, "2026-10-16", NOW).minutes));
  assert.equal(by("hours").rows[0].value, App.fmt(range.totals.avgNet));
  assert.equal(by("rhythm").big, T.formatHHMM(range.totals.avgStart) + "–" + T.formatHHMM(range.totals.avgEnd));
  assert.equal(by("streak").big, String(st.streak.days));
  assert.equal(by("vacation").box.title, "Beste Brücke");
  assert.match(by("vacation").box.line, /1 Ferientag → 4 Tage frei/);
  // Töne wechseln, die letzte Karte ist wieder „tief“
  assert.equal(cards[0].tone, "a");
  assert.equal(cards[cards.length - 1].tone, "a");
  assert.notEqual(cards[cards.length - 2].tone, "a");
});

test("Text zum Kopieren: nur Zahlen, keine Notizen", () => {
  I.setLang("de");
  const days = seedLike();
  days["2026-03-03"].note = "Kundentermin Coop Basel";
  days["2026-03-10"] = absent("2026-03-10", "sick", { note: "Grippe" });
  const st = RV.yearStats(days, S, 2026, NOW);
  const text = UI.summaryText(UI.buildCards(fakeApp(days), st));
  assert.ok(text.indexOf("Coop") < 0 && text.indexOf("Grippe") < 0);
  assert.ok(!/krank/i.test(text));
  assert.match(text, /^Mein Arbeitsjahr 2026 \(Stand 16\. Oktober\)/);
  assert.match(text, /Zeitkonto: [+−±]\d+:\d\d/);
});

test("Leeres Jahr: nur die Titelkarte", () => {
  I.setLang("de");
  const cards = UI.buildCards(fakeApp({}), RV.yearStats({}, S, 2026, NOW));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].lead, "Für 2026 ist noch nichts erfasst.");
});

test("Palette erkennt den Rückblick in allen Sprachen", () => {
  ["rückblick", "Rueckblick", "Jahresrückblick", "jah", "review", "Year", "bilan", "année", "riepilogo", "anno"].forEach((q) => {
    assert.deepEqual(UI.matchQuery(q), { year: null }, q);
  });
  assert.deepEqual(UI.matchQuery("Bilan 2025"), { year: 2025 });
  ["ja", "notiz", "ferien", "8-17", "2025"].forEach((q) => assert.equal(UI.matchQuery(q), null, q));
});

test("Momente als Text in vier Sprachen", () => {
  const App = fakeApp({});
  const cases = [
    { kind: "vacation", vars: { n: 3 } },
    { kind: "vacation", vars: { n: 1 } },
    { kind: "vacation", vars: { n: 0 } },
    { kind: "weekend", vars: { days: 4, start: "2026-05-14", holiday: "2026-05-14" } },
    { kind: "bridge", vars: { date: "2026-12-07", days: 4, holiday: "2026-12-08" } },
    { kind: "month", vars: { month: "2026-09-01", balance: 200 } },
    { kind: "record", vars: { days: 42 } }
  ];
  I.setLang("de");
  assert.deepEqual(cases.map((m) => UI.momentText(App, m)), [
    "Noch 3 Arbeitstage bis zu den Ferien",
    "Noch 1 Arbeitstag bis zu den Ferien",
    "Letzter Arbeitstag vor den Ferien – schöne Ferien!",
    "Langes Wochenende in Sicht: 4 freie Tage ab Donnerstag (Auffahrt)",
    "Brückentag in Sicht: Mit 1 Ferientag am Mo., 7. Dezember werden es 4 freie Tage (Mariä Empfängnis)",
    "Neuer Monat – September endete mit +3:20",
    "Neuer Rekord: 42 Arbeitstage in Folge erfasst"
  ]);
  ["en", "fr", "it"].forEach((lang) => {
    I.setLang(lang);
    cases.forEach((m) => {
      const s = UI.momentText(App, m);
      assert.ok(s && !/\{\w+\}/.test(s) && s.indexOf("rv.") < 0, lang + ": " + s);
    });
  });
  I.setLang("de");
});

test("Lieblingstag und „längste Tage“ der Erkenntnisse: dieselbe Grundlage, derselbe Tag", () => {
  const X = require("../assets/js/core/insights.js");
  const days = seedLike();
  // Lange Kurstage am Mittwoch zählen nicht als Arbeitstag — sonst gewönne der Mittwoch
  Object.keys(days).forEach((iso) => {
    if (T.weekdayOf(iso) === 3 && iso < "2026-05-01" && days[iso].start) days[iso] = Object.assign({}, days[iso], { type: "training", start: "07:00", end: "20:00" });
  });
  const st = RV.yearStats(days, S, 2026, NOW);
  const range = E.computeRange("2026-01-01", "2026-10-16", (iso) => days[iso], S, NOW);
  const fact = X.rhythm(range.days).facts.find((f) => f.id === "longest");
  assert.equal(st.favoriteWeekday.weekday, 2, "Dienstag (06:45–17:00)");
  assert.ok(fact, "die Erkenntnisse nennen einen längsten Tag");
  assert.equal(fact.weekday, st.favoriteWeekday.weekday);
  assert.equal(fact.avg, st.favoriteWeekday.avg);
  // Ø Beginn und Feierabend wie die Kennzahlen der Statistik und die Erkenntnisse
  const rh = X.rhythm(range.days);
  assert.equal(st.avgStart, rh.avg.arrive);
  assert.equal(st.avgEnd, rh.avg.leave);
});
