"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const Hol = require("../assets/js/core/holidays.js");
const E = require("../assets/js/core/engine.js");
const I = require("../assets/js/ui/i18n.js");

/* Die gemeinsamen Hilfen von Kalender und Woche (ZK.CalWeek) hängen nicht am
   DOM — calendar.js lässt sich darum in einer leeren Umgebung laden. */
function loadCalWeek() {
  const sandbox = { ZK: { Time: T, Rules: R, Holidays: Hol, Engine: E, I18n: I, Dom: {} } };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/ui/views/calendar.js"), "utf8");
  vm.runInContext(src, sandbox);
  return sandbox.ZK.CalWeek;
}
const CW = loadCalWeek();

const TODAY = "2026-10-16";                       // Freitag
const NOW = new Date(2026, 9, 16, 14, 23);
const settings = Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU" });

function day(rec, iso) {
  const date = iso || rec.date;
  return E.computeDay(Object.assign({ date }, rec), {
    settings, now: NOW, isToday: date === TODAY, holiday: Hol.lookup(date, settings.holidayRegion)
  });
}

test("Erfassungsbeginn: ohne eigene Einträge gibt es keine Lücken", () => {
  assert.equal(CW.trackingStart({}, settings, { createdAt: "2026-01-05T07:00:00Z" }), null);
});

test("Erfassungsbeginn: neuer Nutzer — Kontostart Monatsanfang, erster Eintrag heute", () => {
  const days = { "2026-10-16": { date: "2026-10-16", start: "07:42" } };
  const s = Object.assign({}, settings, { carryOverFrom: "2026-10-01" });
  assert.equal(CW.trackingStart(days, s, { createdAt: "2026-10-16T08:00:00Z" }), "2026-10-16");
});

test("Erfassungsbeginn: nachgetragene Tage vor der Installation zählen ab dem ersten Eintrag", () => {
  const days = { "2026-10-05": { date: "2026-10-05", start: "08:00", end: "17:00" }, "2026-10-06": { date: "2026-10-06" } };
  const s = Object.assign({}, settings, { carryOverFrom: "2026-10-01" });
  assert.equal(CW.trackingStart(days, s, { createdAt: "2026-10-16T08:00:00Z" }), "2026-10-05");
});

test("Erfassungsbeginn: Kontostart nach dem ersten Eintrag gewinnt", () => {
  const days = { "2026-01-05": { date: "2026-01-05", start: "08:00", end: "17:00" } };
  const s = Object.assign({}, settings, { carryOverFrom: "2026-03-01" });
  assert.equal(CW.trackingStart(days, s, { createdAt: "2026-01-05T07:00:00Z" }), "2026-03-01");
});

test("Erfassungsbeginn: nur aus Outlook übernommene Abwesenheiten starten nichts", () => {
  const days = { "2026-08-03": { date: "2026-08-03", type: "vacation", source: "outlook" } };
  assert.equal(CW.trackingStart(days, settings, { createdAt: "2026-10-16T08:00:00Z" }), null);
});

test("Tageszustand: laufend, ohne Gehen, erfasst, Lücke, leer", () => {
  const start = "2026-10-01";
  assert.equal(CW.dayState(day({ start: "07:42" }, TODAY), TODAY, start), "running");
  assert.equal(CW.dayState(day({ start: "07:05" }, "2026-10-14"), TODAY, start), "incomplete");
  assert.equal(CW.dayState(day({ start: "07:30", end: "16:30" }, "2026-10-15"), TODAY, start), "recorded");
  assert.equal(CW.dayState(day({}, "2026-10-13"), TODAY, start), "gap");
  assert.equal(CW.dayState(day({}, "2026-10-13"), TODAY, "2026-10-14"), "empty", "vor dem Erfassungsbeginn keine Lücke");
  assert.equal(CW.dayState(day({}, "2026-10-13"), TODAY, null), "empty", "ohne Erfassungsbeginn keine Lücke");
  assert.equal(CW.dayState(day({}, "2026-10-10"), TODAY, start), "empty", "Samstag hat kein Soll");
  assert.equal(CW.dayState(day({}, "2026-10-19"), TODAY, start), "empty", "Zukunft ist keine Lücke");
});

test("Laufender Tag: Zwischenstand kommt aus dem Tagessaldo", () => {
  const res = day({ start: "07:42", breaks: [{ id: "r", start: "12:05", end: "12:40" }] }, TODAY);
  assert.equal(CW.isProvisional(res), true);
  assert.equal(CW.liveBalance(res), res.balance);
  assert.ok(res.balance < 0, "um 14:23 fehlt noch Zeit");
});

test("Summen: abgerechnet und laufend getrennt, Soll bis heute ab Erfassungsbeginn", () => {
  const recs = {
    "2026-10-12": null,                                                       // Lücke
    "2026-10-13": null,                                                       // Lücke
    "2026-10-14": { start: "07:05" },                                         // Gehen fehlt
    "2026-10-15": { start: "08:00", end: "17:00", breaks: [{ id: "a", start: "12:00", end: "12:30" }] },
    "2026-10-16": { start: "07:42", breaks: [{ id: "r", start: "12:05", end: "12:40" }] },
    "2026-10-17": null,
    "2026-10-18": null
  };
  const days = Object.keys(recs).map((iso) => day(recs[iso] || {}, iso));
  const sum = CW.summarize(days, { today: TODAY, start: "2026-10-12", hasRecord: (iso) => !!recs[iso] });
  const d15 = days[3], d16 = days[4];
  assert.equal(sum.settled, d15.balance, "nur der abgeschlossene Donnerstag zählt");
  assert.equal(sum.provisional, d16.balance);
  assert.equal(sum.runningDays, 1);
  assert.deepEqual(Array.from(sum.gaps), ["2026-10-12", "2026-10-13"]);
  assert.deepEqual(Array.from(sum.incomplete), ["2026-10-14"]);
  assert.equal(sum.targetToDate, 5 * 504, "Mo–Fr bis heute");
  assert.equal(sum.uncoveredTarget, 3 * 504);
  assert.equal(sum.recordedDays, 3, "14., 15. und 16. — Lücken nicht");
  // Ist − Soll bis heute = abgerechnet + laufend − Soll ohne Erfassung
  assert.equal(sum.net + sum.credited - sum.targetToDate, sum.settled + sum.provisional - sum.uncoveredTarget);
});

test("Summen: automatische Feiertage zählen nicht als erfasste Tage", () => {
  const days = [day({}, "2026-11-02"), day({}, "2026-11-01"), day({}, "2026-12-25")];
  const sum = CW.summarize(days, { today: "2026-12-31", start: "2026-10-01", hasRecord: () => false });
  assert.equal(sum.recordedDays, 0);
});

test("Summen: vor dem Erfassungsbeginn kein Soll bis heute", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"].map((iso) => day({}, iso));
  const sum = CW.summarize(days, { today: TODAY, start: null, hasRecord: () => false });
  assert.equal(sum.targetToDate, 0);
  assert.equal(sum.target, 4 * 504);
  assert.equal(sum.gaps.length, 0);
});

test("Anteil im Kürzel: 50 % wird ½, sonst Prozent", () => {
  const half = day({ type: "vacation", absenceFactor: 0.5 }, "2026-11-10");
  const quarter = day({ type: "vacation", absenceFactor: 0.25 }, "2026-11-11");
  const full = day({ type: "vacation" }, "2026-11-12");
  const comp = day({ type: "comp", absenceFactor: 0.5 }, "2026-11-13");
  assert.equal(CW.factorText(half, true), "½");
  assert.equal(CW.factorText(half, false), " 50 %");
  assert.equal(CW.factorText(quarter, true), "25%");
  assert.equal(CW.factorText(full, true), "");
  assert.equal(CW.factorText(comp, true), "", "Kompensation schreibt nichts gut");
});

test("Feiertagsname und KW in der gewählten Sprache", () => {
  const h = Hol.lookup("2026-11-01", "CH-LU");
  I.setLang("fr");
  assert.equal(CW.holidayName(h), h.names.fr);
  assert.equal(CW.kwLabel("2026-10-12"), "S 42");
  I.setLang("it");
  assert.equal(CW.kwLabel("2026-10-12"), "Sett. 42");
  assert.equal(CW.cap("ottobre"), "Ottobre");
  I.setLang("de");
  assert.equal(CW.kwLabel("2026-10-12"), "KW 42");
});

test("Neue Texte für Kalender und Woche gibt es in allen vier Sprachen", () => {
  const keys = Object.keys(I.DICT.de).filter((k) =>
    /^(cal\.(recordedDays|workdays|gapsCount|gapTip|missing|uncovered|targetToDate|monthTargetSub|actualSplit|provisionalSub|vacationSub|bulkPreview|bulkSkipRecorded|bulkConflicts|bulkConfirm|bulkNone|lg|code\.)|week\.(balance|chartTitle|maxWeeklySub|contract|col|autoSub)|warn\.over-weekly-max|common\.weekShort|day\.(missingEnd|runningShort|provisional|typeAuto))/.test(k));
  assert.ok(keys.length >= 50, "Schlüssel gefunden: " + keys.length);
  for (const lang of ["en", "fr", "it"]) {
    for (const k of keys) assert.ok(I.DICT[lang][k], lang + " fehlt " + k);
  }
  for (const lang of ["de", "en", "fr", "it"]) {
    I.setLang(lang);
    assert.match(I.tn("cal.gapsCount", 1), /^1 /);
    assert.notEqual(I.tn("cal.gapsCount", 1), I.tn("cal.gapsCount", 2).replace("2", "1"), lang + ": Einzahl");
  }
  I.setLang("de");
  // Kürzel sind je Sprache eindeutig
  for (const lang of ["de", "en", "fr", "it"]) {
    const codes = ["work", "vacation", "holiday", "sick", "accident", "military", "comp", "training", "unpaid", "free"].map((t) => I.DICT[lang]["cal.code." + t]);
    assert.equal(new Set(codes).size, codes.length, lang + ": Kürzel doppelt");
  }
});
