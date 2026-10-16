"use strict";
/* Statistik, Rapport und Erfolge: die reinen Rechenhilfen der Ansichten
   (ohne DOM) plus die Datumsformate und die Übersetzungen der Ansichten. */
const test = require("node:test");
const assert = require("node:assert/strict");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const I = require("../assets/js/ui/i18n.js");

/* Die Ansichten sind Browser-Skripte (self.ZK …). Für die Tests reicht ein
   kleines self; die neuen Übersetzungen werden beim Laden mitgeschrieben. */
const added = [];
const origAdd = I.add;
I.add = function (dicts) { added.push(dicts); return origAdd(dicts); };
global.self = { ZK: { I18n: I, Time: T, Rules: R, Engine: E, Dom: {} } };
require("../assets/js/ui/views/stats.js");
require("../assets/js/ui/views/reports.js");
require("../assets/js/ui/views/achievements.js");
I.add = origAdd;
const S = global.self.ZK.Views.stats.calc;
const RP = global.self.ZK.Views.reports.calc;
const AC = global.self.ZK.Views.achievements.calc;

const NOW = new Date(2026, 9, 16, 14, 23);           // Fr 16.10.2026, 14:23
const TODAY = "2026-10-16";

function settings(patch) {
  return Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU" }, patch || {});
}
function work(date, start, end, extra) {
  return Object.assign({ date: date, start: start, end: end, breaks: [{ id: "m", start: "12:00", end: "12:30" }] }, extra || {});
}
function range(records, from, to, s) {
  return E.computeRange(from, to, (iso) => records[iso], s || settings(), NOW);
}

/* ---------------------------------------------------------------------- */
test("Übersetzungen der Ansichten: jeder Schlüssel in de, en, fr und it", () => {
  assert.ok(added.length >= 3, "jede Ansicht bringt ihre Texte mit");
  added.forEach((dicts) => {
    const base = (lang) => Object.keys(dicts[lang] || {}).filter((k) => !/\.one$/.test(k)).sort();
    const de = base("de");
    assert.ok(de.length > 5);
    ["en", "fr", "it"].forEach((lang) => assert.deepEqual(base(lang), de, "Schlüssel fehlen in " + lang));
    // Schweizer Rechtschreibung, keine leeren Texte
    Object.keys(dicts.de).forEach((k) => {
      assert.ok(!/ß/.test(dicts.de[k]), k + " enthält ß");
      ["de", "en", "fr", "it"].forEach((lang) => {
        if (dicts[lang][k] !== undefined) assert.ok(String(dicts[lang][k]).trim(), lang + ":" + k + " ist leer");
      });
    });
  });
});

test("Mehrzahl: 1 Tag / 2 Tage, nie „1 Tage“ oder kleingeschriebene Nomen", () => {
  I.setLang("de");
  assert.equal(I.tn("stats.nGaps", 1), "1 nicht erfasster Arbeitstag");
  assert.equal(I.tn("stats.nGaps", 2), "2 nicht erfasste Arbeitstage");
  assert.equal(I.tn("stats.nWorked", 9), "9 gearbeitete Tage");
  assert.equal(I.tn("stats.compliantOf", 1, { a: 1 }), "1 von 1 Tag regelkonform");
  assert.equal(I.tn("ach.hint.days", 1), "Noch 1 Tag erfassen");
  assert.equal(I.t("stats.kwShort", { n: 42 }), "KW42");
  I.setLang("fr");
  assert.equal(I.t("stats.kwShort", { n: 42 }), "S42");
  assert.equal(I.tn("stats.nWorked", 1), "1 jour travaillé");
  I.setLang("de");
});

test("Datumsformate: zwischengespeichert, aber je Sprache korrekt", () => {
  I.setLang("de");
  const de = I.formatDate("2026-10-16", { weekday: "short", day: "numeric", month: "long" });
  assert.equal(de, new Intl.DateTimeFormat("de-CH", { weekday: "short", day: "numeric", month: "long" }).format(new Date(2026, 9, 16)));
  assert.equal(I.formatDate("2026-10-16"), new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(2026, 9, 16)));
  I.setLang("fr");
  const fr = I.formatDate("2026-10-16", { weekday: "short", day: "numeric", month: "long" });
  assert.notEqual(fr, de, "Sprachwechsel darf keinen deutschen Formatierer wiederverwenden");
  assert.equal(I.weekdayName(1, "long"), new Intl.DateTimeFormat("fr-CH", { weekday: "long" }).format(new Date(2024, 0, 8)));
  assert.equal(I.monthName(9), new Intl.DateTimeFormat("fr-CH", { month: "long" }).format(new Date(2024, 9, 1)));
  I.setLang("de");
  assert.equal(I.monthName(9), "Oktober");
  assert.equal(I.weekdayName(5, "short"), new Intl.DateTimeFormat("de-CH", { weekday: "short" }).format(new Date(2024, 0, 12)));
  assert.equal(I.formatDate("kein Datum"), "kein Datum");
});

/* ---------------------------------------------------------------------- */
test("Zeitraum: Monat/Jahr enden bei heute, die Achse am Monats-/Jahresende", () => {
  const m = S.resolvePeriod("month", [], TODAY);
  assert.deepEqual([m.from, m.until, m.to, m.bucket], ["2026-10-01", TODAY, "2026-10-31", "week"]);
  const y = S.resolvePeriod("year", [], TODAY);
  assert.deepEqual([y.from, y.until, y.to, y.bucket, y.grain], ["2026-01-01", TODAY, "2026-12-31", "month", "week"]);
  const q = S.resolvePeriod("quarter", [], TODAY);
  assert.equal(T.diffDays(q.from, q.until), 89);
  // geplante Ferien im Dezember verlängern „Alle“ nicht in die Zukunft
  const a = S.resolvePeriod("all", ["2026-01-05", "2026-12-30"], TODAY);
  assert.deepEqual([a.from, a.until, a.to], ["2026-01-05", TODAY, TODAY]);
  // nur künftige Daten: kein umgekehrter Zeitraum
  const f = S.resolvePeriod("all", ["2026-12-28"], TODAY);
  assert.ok(f.from <= f.until);
});

test("Stunden pro Woche: angeschnittene Wochen tragen ihr eigenes, anteiliges Soll", () => {
  const recs = {
    "2026-10-01": work("2026-10-01", "08:00", "17:00"),   // Do
    "2026-10-02": work("2026-10-02", "08:00", "17:00"),   // Fr
    "2026-10-05": work("2026-10-05", "08:00", "17:00")    // Mo
  };
  const r = range(recs, "2026-10-01", "2026-10-11", settings({ autoHolidays: false }));
  const g = S.groupBars(r.days, "week");
  assert.equal(g.length, 2);
  assert.equal(g[0].key, "2026-09-28", "Woche beginnt am Montag");
  assert.equal(g[0].count, 4);
  assert.equal(g[0].partial, true);
  assert.equal(g[0].ref, 2 * 504, "nur Do + Fr haben Soll");
  assert.equal(g[0].value, 2 * 510);
  assert.equal(g[1].partial, false);
  assert.equal(g[1].ref, 5 * 504);
  const months = S.groupBars(r.days, "month");
  assert.equal(months.length, 1);
  assert.equal(months[0].partial, true);
});

test("Saldo-Verlauf: laufender Tag bewegt die Linie nicht, Zwischenstand steht daneben", () => {
  const s = settings({ autoHolidays: false });
  const recs = {
    "2026-10-15": work("2026-10-15", "08:00", "18:00"),   // +1:06
    "2026-10-16": { date: "2026-10-16", start: "07:42", end: "", breaks: [] }
  };
  const period = S.resolvePeriod("month", Object.keys(recs), TODAY);
  const r = range(recs, period.from, period.until, s);
  const tr = S.trendSeries(r.days, 120, period);
  assert.equal(tr.points[0].start, true);
  assert.equal(tr.points[0].value, 120);
  assert.equal(tr.slots, 32, "Startpunkt + 31 Tage Oktober");
  assert.equal(tr.points.length, 17, "Startpunkt + 1.–16. Oktober");
  const last = tr.points[tr.points.length - 1];
  const settled = 120 + r.days[14].balance;
  assert.equal(last.value, settled);
  assert.equal(last.value, 120 + r.totals.balance, "gleich wie der abgerechnete Zeitraumsaldo");
  assert.equal(typeof last.provisional, "number");
  assert.equal(last.provisional, 120 + r.totals.provisionalBalance);
  // Wochenraster für Jahr/Alle
  const py = S.resolvePeriod("year", [], TODAY);
  const ry = range(recs, py.from, py.until, s);
  const ty = S.trendSeries(ry.days, 0, py);
  assert.ok(ty.slots > ty.points.length, "Achse reicht bis Jahresende");
  assert.equal(ty.points[ty.points.length - 1].date, TODAY);
});

test("Heatmap: eine Definition für ±0, Lücke, offen, geplant und laufend", () => {
  const recs = {
    "2026-10-12": work("2026-10-12", "08:00", "16:54"),                          // ±0
    "2026-10-14": { date: "2026-10-14", start: "07:05", end: "", breaks: [], note: "vergessen" },
    "2026-10-16": { date: "2026-10-16", start: "07:42", end: "", breaks: [] },
    "2026-12-28": { date: "2026-12-28", type: "vacation", start: "", end: "", breaks: [] }
  };
  const s = settings({ autoHolidays: false });
  const byDate = {};
  range(recs, "2026-10-12", "2026-12-28", s).days.forEach((d) => { byDate[d.date] = d; });
  assert.equal(S.heatKind(byDate["2026-10-12"], TODAY), "zero");
  assert.equal(S.heatKind(byDate["2026-10-13"], TODAY), "gap");
  assert.equal(S.heatKind(byDate["2026-10-14"], TODAY), "open");
  assert.equal(S.heatKind(byDate["2026-10-15"], TODAY), "gap");
  assert.equal(S.heatKind(byDate["2026-10-16"], TODAY), "running");
  assert.equal(S.heatKind(byDate["2026-10-17"], TODAY), "future");
  assert.equal(S.heatKind(byDate["2026-12-28"], TODAY), "planned");
  const sat = E.computeDay({ date: "2026-10-10" }, { settings: s, now: NOW });
  assert.equal(S.heatKind(sat, TODAY), "off");
});

test("Kontingente: gleiche Zahlen wie Engine.quotaUsage, Feiertage bisher/kommend", () => {
  const s = settings();
  const recs = {
    "2026-02-16": { date: "2026-02-16", type: "vacation" },
    "2026-02-17": { date: "2026-02-17", type: "vacation" },
    "2026-03-10": { date: "2026-03-10", type: "sick" },
    "2026-04-24": { date: "2026-04-24", type: "vacation", absenceFactor: 0.5, start: "07:30", end: "11:45" },
    "2026-08-21": { date: "2026-08-21", type: "comp" },
    "2026-09-02": { date: "2026-09-02", type: "training", start: "08:30", end: "16:30" },
    "2026-12-24": { date: "2026-12-24", type: "vacation" },
    "2026-12-25": { date: "2026-12-25", type: "vacation" },                   // Weihnachten: kostet nichts
    "2026-12-26": { date: "2026-12-26", type: "vacation" }                    // Samstag: kostet nichts
  };
  const days = range(recs, "2026-01-01", "2026-12-31", s).days;
  const q = S.quotaOf(days, 2026, TODAY, s);
  const e = E.quotaUsage(recs, 2026, s, NOW);
  assert.equal(q.vacationTaken, e.vacationTaken);
  assert.equal(q.vacationPlanned, e.vacationPlanned);
  assert.equal(q.vacationTaken, 2.5);
  assert.equal(q.vacationPlanned, 1);
  assert.equal(q.sick, e.sick);
  assert.equal(q.comp, e.comp);
  assert.equal(q.other, e.other);
  assert.equal(q.holiday + q.holidayAhead, e.holiday, "alle Feiertage auf Arbeitstagen");
  assert.ok(q.holidayAhead >= 1, "Weihnachten liegt noch vor uns");
  assert.equal(q.vacationLeft, e.vacationLeft);
});

test("Tagesarten: Samstagseinsatz zählt als Arbeit, halber Ferientag als ½", () => {
  const s = settings({ autoHolidays: false });
  const recs = {
    "2026-09-19": { date: "2026-09-19", start: "09:00", end: "13:00", breaks: [] },  // Samstag
    "2026-04-24": { date: "2026-04-24", type: "vacation", absenceFactor: 0.5, start: "07:30", end: "11:45", breaks: [] }
  };
  const days = ["2026-09-19", "2026-04-24"].map((iso) => E.computeDay(recs[iso], { settings: s, now: NOW, holiday: null }));
  assert.deepEqual(S.typeCounts(days), { work: 1, vacation: 0.5 });
});

test("Uhrzeit über Mitternacht: Feierabend der Nachtschicht mit (+1)", () => {
  assert.equal(S.clock(30 * 60), "06:00 (+1)");
  assert.equal(S.clock(17 * 60 + 1), "17:01");
  assert.equal(S.clock(null), "–");
});

test("Kennzahlen: laufende und unvollständige Tage sind weder Plus- noch Minustag", () => {
  const s = settings({ autoHolidays: false });
  const recs = {
    "2026-10-13": work("2026-10-13", "08:00", "18:00"),
    "2026-10-14": { date: "2026-10-14", start: "07:05", end: "", breaks: [] },
    "2026-10-15": work("2026-10-15", "08:00", "16:00"),
    "2026-10-16": { date: "2026-10-16", start: "07:42", end: "", breaks: [] }
  };
  const r = range(recs, "2026-10-13", TODAY, s);
  const sum = S.summarize(r.days, (iso) => !!recs[iso]);
  assert.equal(sum.plus, 1);
  assert.equal(sum.minus, 1);
  assert.equal(sum.recorded, 3, "unvollständig ohne Notiz gilt nicht als erfasst");
  assert.equal(sum.longestDate, "2026-10-13");
});

/* ---------------------------------------------------------------------- */
test("Rapport: Titel nach Zeitraum, Von/Bis werden getauscht", () => {
  assert.equal(RP.rangeKind("2026-10-01", "2026-10-31"), "month");
  assert.equal(RP.rangeKind("2026-02-01", "2026-02-28"), "month");
  assert.equal(RP.rangeKind("2026-01-01", "2026-12-31"), "year");
  assert.equal(RP.rangeKind("2026-10-01", "2026-10-30"), "range");
  assert.equal(RP.rangeKind("2025-01-01", "2026-12-31"), "range");
  assert.deepEqual(RP.normalizeRange("2026-10-31", "2026-10-01"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(RP.normalizeRange("2026-10-01", "2026-10-31"), { from: "2026-10-01", to: "2026-10-31" });
});

test("Rapport: Zukunft nur mit Plan, Summen bis heute ohne laufenden Tag, Übertrag geht auf", () => {
  const s = settings({ autoHolidays: false, carryOverMinutes: 125, carryOverFrom: "2026-01-01" });
  const recs = {
    "2026-09-30": work("2026-09-30", "08:00", "17:30"),
    "2026-10-01": work("2026-10-01", "08:00", "17:30"),
    "2026-10-02": work("2026-10-02", "08:00", "16:00"),
    "2026-10-14": { date: "2026-10-14", start: "07:05", end: "", breaks: [], note: "Gehen vergessen" },
    "2026-10-16": { date: "2026-10-16", start: "07:42", end: "", breaks: [] },
    "2026-10-28": { date: "2026-10-28", type: "vacation" }
  };
  const r = range(recs, "2026-10-01", "2026-10-31", s);
  const b = RP.buildRows(r.days, TODAY);
  const dates = b.rows.map((x) => x.r.date);
  assert.ok(dates.indexOf("2026-10-28") >= 0, "geplante Ferien stehen drin");
  assert.equal(b.rows.filter((x) => x.planned).length, 1);
  assert.ok(dates.indexOf("2026-10-27") < 0, "leere Zukunft steht nicht drin");
  assert.ok(dates.indexOf("2026-10-03") < 0, "leeres Wochenende steht nicht drin");
  assert.ok(dates.indexOf("2026-10-05") >= 0, "Lücke steht drin");
  assert.equal(b.sum.open, 1);
  assert.equal(b.sum.running, 1);
  assert.equal(b.sum.future, true);
  // Soll nur bis gestern (heute läuft): 1.–15. Oktober = 11 Arbeitstage
  assert.equal(b.sum.target, 11 * 504);
  // Übertrag Vormonat + Saldo der Zeilen = Saldo per heute (abgerechnet)
  const carryIn = E.accountBalance(recs, s, "2026-09-30", NOW).minutes;
  const carryOut = E.accountBalance(recs, s, TODAY, NOW).minutes;
  assert.equal(carryIn + b.sum.balance, carryOut);
  assert.equal(b.sum.balance, r.totals.balance);
});

test("Rapport: Überzeit über dem wöchentlichen Höchstmass", () => {
  const s = settings({ autoHolidays: false });
  const recs = {};
  ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].forEach((iso) => {
    recs[iso] = work(iso, "06:00", "17:30");                                // 11 h − 1 h Pause = 10 h 30
  });
  const days = range(recs, "2026-10-05", "2026-10-11", s).days;
  const net = days.reduce((a, d) => a + d.net, 0);
  assert.equal(RP.overtimeLaw(days, TODAY, 45 * 60), Math.max(0, net - 45 * 60));
  assert.ok(RP.overtimeLaw(days, TODAY, 45 * 60) > 0);
  assert.equal(RP.overtimeLaw(days, TODAY, 60 * 60), 0);
  assert.equal(RP.overtimeLaw(days, TODAY, 0), null);
});

/* ---------------------------------------------------------------------- */
test("Erfolge: Farb-Emoji, nächste Abzeichen und konkrete Hinweise", () => {
  assert.equal(AC.colorEmoji("🏛"), "🏛️");
  assert.equal(AC.colorEmoji("☄️"), "☄️", "schon mit Variantenwähler: unverändert");
  const badges = [
    { id: "days250", goal: 250, value: 204, progress: 204 / 250, earned: false, xp: 180 },
    { id: "first", goal: 1, value: 1, progress: 1, earned: true, xp: 10 },
    { id: "chronicler", goal: 20, value: 13, progress: 0.65, earned: false, xp: 25 },
    { id: "nightOwl", goal: 10, value: 0, progress: 0, earned: false, xp: 30 },
    { id: "streak20", goal: 20, value: 18, progress: 0.9, earned: false, xp: 70 }
  ];
  const next = AC.closest(badges, 3).map((b) => b.id);
  assert.deepEqual(next, ["streak20", "days250", "chronicler"]);
  I.setLang("de");
  assert.equal(AC.hintFor(badges[0], {}), "Noch 46 Tage erfassen");
  assert.equal(AC.hintFor(badges[4], { currentStreak: 19 }), "Noch 1 Arbeitstag am Stück erfassen");
  assert.equal(AC.hintFor(badges[4], { currentStreak: 3 }), "Noch 17 Arbeitstage am Stück erfassen");
  assert.match(AC.hintFor({ id: "archivist", goal: 1, value: 0 }, {}), /Berichte → JSON-Sicherung/);
});

test("CSV in der Sprache der Oberfläche — der Import erkennt jede Sprache wieder", () => {
  const X = require("../assets/js/data/exporters.js");
  const s = settings({ autoHolidays: false });
  const recs = {
    "2026-10-01": Object.assign(work("2026-10-01", "08:00", "17:00"), { location: "home", note: "Projekt" }),
    "2026-10-02": { date: "2026-10-02", type: "vacation" }
  };
  const days = range(recs, "2026-10-01", "2026-10-02", s).days;
  ["de", "en", "fr", "it"].forEach((lang) => {
    I.setLang(lang);
    const opts = RP.csvOptions((iso) => recs[iso]);
    const csv = X.toCSV(days, opts);
    const head = csv.replace(/^﻿/, "").split(/\r?\n/)[0];
    assert.ok(head.indexOf(I.t("csv.start")) >= 0, lang + ": übersetzte Überschrift");
    assert.ok(csv.indexOf(I.t("loc.home")) >= 0, lang + ": Ort übersetzt");
    const parsed = X.parseCSV(csv);
    assert.ok(!parsed.error, lang + ": " + parsed.error);
    const r1 = parsed.rows.filter((r) => r.date === "2026-10-01")[0];
    assert.ok(r1, lang + ": Zeile gefunden");
    assert.equal(r1.start, "08:00", lang + ": Kommen erkannt");
    assert.equal(r1.end, "17:00", lang + ": Gehen erkannt");
    assert.equal(r1.note, "Projekt", lang + ": Notiz erkannt");
  });
  I.setLang("de");
});

test("Rapport: lange Zeiträume als Monatszeilen mit Monatssummen", () => {
  const s = settings({ autoHolidays: false });
  const recs = {
    "2026-09-29": work("2026-09-29", "08:00", "17:30"),
    "2026-10-01": work("2026-10-01", "08:00", "16:00"),
    "2026-10-16": { date: "2026-10-16", start: "07:42", end: "", breaks: [] },
    "2026-10-28": { date: "2026-10-28", type: "vacation" }
  };
  const r = range(recs, "2026-09-01", "2026-10-31", s);
  const b = RP.buildRows(r.days, TODAY);
  const g = RP.groupMonths(b.rows);
  assert.deepEqual(g.map((x) => x.key), ["2026-09", "2026-10"]);
  assert.equal(g[0].rows.length + g[1].rows.length, b.rows.length);
  // Monatssummen ergeben zusammen die Gesamtsumme (ohne Plan und laufenden Tag)
  assert.equal(g[0].balance + g[1].balance, b.sum.balance);
  assert.equal(g[0].target + g[1].target, b.sum.target);
  assert.equal(g[0].actual + g[1].actual, b.sum.actual);
});
