"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const C = require("../assets/js/core/closing.js");
const S = require("../assets/js/data/store.js");

const NOW = new Date(2026, 9, 19, 10, 0);   // Montag, 19.10.2026

/* Werktage 08:00–17:00 mit 30 min Mittag (Netto 8 h 30) */
function workMonth(month, opts) {
  opts = opts || {};
  const days = {};
  T.rangeDays(month + "-01", T.endOfMonth(month + "-01")).forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    if (opts.skip && opts.skip.includes(iso)) return;
    days[iso] = { date: iso, start: opts.start || "08:00", end: opts.end || "17:00", breaks: [{ id: "l" + iso, start: "12:00", end: "12:30", paid: false }], note: "", location: "office", absenceFactor: 1 };
  });
  return days;
}

function settings(extra) {
  return Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU" }, extra || {});
}

function noCaps(s) { return Object.assign({}, s, { capPlusMinutes: null, capMinusMinutes: null }); }

function sum(map) { return Object.values(map).reduce((a, b) => a + b, 0); }

/* ====================================================================== */
/* Schlüssel und Sperre                                                    */
/* ====================================================================== */

test("Jeder Monat hat seinen eigenen Schlüssel, gesperrt nur mit gültiger Momentaufnahme", () => {
  assert.equal(C.keyOf("2026-09"), "closing:2026-09");
  const records = workMonth("2026-09");
  const s = settings();
  const snap = C.buildSnapshot(records, s, "2026-09", { now: NOW });
  s[C.keyOf("2026-09")] = snap;
  assert.equal(C.isLocked(s, "2026-09-15"), true);
  assert.equal(C.guard("2026-09-30", s), true);
  assert.equal(C.isLocked(s, "2026-10-01"), false);
  assert.equal(C.isLocked(s, "2026-08-31"), false);
  // Unbrauchbares (z. B. aus einer fremden Datei) sperrt nichts
  s["closing:2026-08"] = true;
  s["closing:2026-07"] = { at: "x" };
  assert.equal(C.isLocked(s, "2026-08-10"), false);
  assert.equal(C.isLocked(s, "2026-07-10"), false);
  assert.deepEqual(C.list(s).map((c) => c.month), ["2026-09"]);
});

test("Ganzer Monat und vergangener Monat werden erkannt", () => {
  assert.equal(C.wholeMonth("2026-09-01", "2026-09-30"), "2026-09");
  assert.equal(C.wholeMonth("2026-02-01", "2026-02-28"), "2026-02");
  assert.equal(C.wholeMonth("2026-09-01", "2026-09-29"), null);
  assert.equal(C.wholeMonth("2026-09-02", "2026-09-30"), null);
  assert.equal(C.isPastMonth("2026-09", "2026-10-01"), true);
  assert.equal(C.isPastMonth("2026-09", "2026-09-30"), false, "am letzten Tag ist der Monat noch nicht vorbei");
  assert.equal(C.isPastMonth("2026-10", "2026-10-19"), false);
});

/* ====================================================================== */
/* Tagesbeiträge = Zeitkonto der Engine                                    */
/* ====================================================================== */

test("Tagesbeiträge ergeben genau das Zeitkonto der Engine", () => {
  const records = Object.assign({}, workMonth("2026-08"), workMonth("2026-09", { skip: ["2026-09-08", "2026-09-09"] }), workMonth("2026-10"));
  records["2026-09-14"] = { date: "2026-09-14", type: "vacation", start: "", end: "", breaks: [], absenceFactor: 1 };
  records["2026-09-15"] = { date: "2026-09-15", start: "08:00", end: "", breaks: [] };   // unvollständig
  records["2026-10-19"] = { date: "2026-10-19", start: "07:30", end: "", breaks: [] };   // läuft heute
  delete records["2026-10-20"]; delete records["2026-10-21"];
  const variants = [
    settings(),
    settings({ countMissingWorkdays: true }),
    settings({ carryOverFrom: "2026-09-10", carryOverMinutes: 30 }),
    settings({ countMissingWorkdays: true, carryOverFrom: "2026-08-20", roundStep: 15 })
  ];
  variants.forEach((s, i) => {
    [undefined, "2026-09-30", "2026-09-12", "2026-10-31"].forEach((upto) => {
      [false, true].forEach((running) => {
        const opts = running ? { includeRunning: true } : undefined;
        const engine = E.accountBalance(records, noCaps(s), upto, NOW, opts);
        const contrib = C.dayContributions(records, s, "2000-01-01", upto || T.todayISO(NOW), NOW, opts);
        const total = (s.carryOverMinutes || 0) + sum(contrib);
        assert.equal(total, running ? engine.provisionalMinutes : engine.minutes, "Variante " + i + " bis " + upto + (running ? " inkl. laufend" : ""));
      });
    });
  });
});

test("Ohne Abschluss rechnet das Zeitkonto genau wie die Engine", () => {
  const records = Object.assign({}, workMonth("2026-08"), workMonth("2026-09"));
  const s = settings({ capPlusMinutes: 600 });
  assert.deepEqual(C.accountBalance(records, s, "2026-09-30", NOW), E.accountBalance(records, s, "2026-09-30", NOW));
});

/* ====================================================================== */
/* Momentaufnahme                                                          */
/* ====================================================================== */

test("Momentaufnahme friert Saldo, Summen und Abwesenheiten ein", () => {
  const records = workMonth("2026-09");
  records["2026-09-14"] = { date: "2026-09-14", type: "vacation", start: "", end: "", breaks: [], absenceFactor: 1 };
  records["2026-09-15"] = { date: "2026-09-15", type: "vacation", start: "08:00", end: "12:00", breaks: [], absenceFactor: 0.5 };
  records["2026-09-16"] = { date: "2026-09-16", type: "sick", start: "", end: "", breaks: [], absenceFactor: 1 };
  records["2026-09-17"] = { date: "2026-09-17", type: "military", start: "", end: "", breaks: [], absenceFactor: 1 };
  records["2026-09-18"] = { date: "2026-09-18", type: "accident", start: "", end: "", breaks: [], absenceFactor: 1 };
  const s = settings();
  const snap = C.buildSnapshot(records, s, "2026-09", { now: NOW, at: "2026-10-03T09:00:00.000Z", issues: 2 });

  assert.equal(snap.v, 1);
  assert.equal(snap.at, "2026-10-03T09:00:00.000Z");
  assert.equal(snap.issues, 2);
  assert.equal(snap.balance, C.liveMonthBalance(records, s, "2026-09", NOW));
  assert.equal(sum(snap.days), snap.balance, "Tageswerte ergeben den Monatssaldo");
  assert.ok(Object.keys(snap.days).every((k) => /^\d\d$/.test(k) && snap.days[k] !== 0), "nur Tage mit Beitrag, als Tag im Monat");
  // 17 volle Arbeitstage à +6 min (8 h 30 statt 8 h 24) + halber Ferientag: 4 h Arbeit + 4 h 12 Gutschrift = −12 min
  assert.equal(snap.balance, 17 * 6 - 12);
  assert.equal(snap.target, 22 * 504);
  assert.equal(snap.vacationDays, 1.5);
  assert.equal(snap.sickDays, 1);
  assert.equal(snap.militaryDays, 1);
  assert.equal(snap.accidentDays, 1);
  assert.equal(snap.absence.vacation, 504 + 252);
  assert.equal(snap.absence.sick, 504);
  assert.equal(snap.net, 17 * 510 + 240);
  assert.equal(snap.account, C.accountBalance(records, s, "2026-09-30", NOW).minutes);
  assert.equal(snap.recordedDays, 22);
});

test("Prüfsumme: gleiche Daten gleiche Summe — Speicherzeitpunkt und Reihenfolge egal", () => {
  const a = workMonth("2026-09");
  const b = {};
  Object.keys(a).reverse().forEach((k) => {
    const copy = {};
    Object.keys(a[k]).reverse().forEach((f) => { copy[f] = a[k][f]; });
    copy.updatedAt = "2026-10-01T10:00:00.000Z";
    b[k] = copy;
  });
  assert.equal(C.checksum(a, "2026-09"), C.checksum(b, "2026-09"));
  assert.match(C.checksum(a, "2026-09"), /^[0-9a-f]{8}$/);
  const snap = C.buildSnapshot(a, settings(), "2026-09", { now: NOW });
  assert.equal(C.isStale(snap, b, "2026-09"), false);
  b["2026-09-10"] = Object.assign({}, b["2026-09-10"], { end: "17:05" });
  assert.equal(C.isStale(snap, b, "2026-09"), true, "eine geänderte Gehen-Zeit fällt auf");
  // Andere Monate ändern die Summe nicht
  const c = Object.assign({}, a, { "2026-10-01": { date: "2026-10-01", start: "08:00", end: "17:00" } });
  assert.equal(C.checksum(c, "2026-09"), C.checksum(a, "2026-09"));
});

test("Nacht-, Sonntags- und Feiertagsarbeit wie in der Statistik (ArG-Fenster)", () => {
  const records = {
    // Samstag 22:00 – Sonntag 06:00, Pause 02:00–02:30: Sonntag beginnt nach ArG schon Samstag 23 Uhr
    "2026-09-19": { date: "2026-09-19", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30", paid: false }] },
    // Sonntag 09:00–13:00
    "2026-09-27": { date: "2026-09-27", start: "09:00", end: "13:00", breaks: [] },
    // Werktag 05:00–14:00 mit 30 min Pause: eine Stunde Nachtarbeit
    "2026-09-22": { date: "2026-09-22", start: "05:00", end: "14:00", breaks: [{ id: "p", start: "10:00", end: "10:30", paid: false }] }
  };
  const s = settings();
  const night = C.premiumsOf(E.computeDay(records["2026-09-19"], { settings: s, now: NOW }), s);
  assert.equal(Math.round(night.night), 7 * 60 - 30);
  assert.equal(Math.round(night.sunday), 7 * 60 - 30);
  const sunday = C.premiumsOf(E.computeDay(records["2026-09-27"], { settings: s, now: NOW }), s);
  assert.equal(Math.round(sunday.sunday), 240);
  assert.equal(Math.round(sunday.night), 0);
  const early = C.premiumsOf(E.computeDay(records["2026-09-22"], { settings: s, now: NOW }), s);
  assert.equal(Math.round(early.night), 60);
  assert.equal(Math.round(early.sunday), 0);

  const snap = C.buildSnapshot(records, s, "2026-09", { now: NOW });
  assert.equal(snap.nightMinutes, 390 + 60);
  assert.equal(snap.sundayMinutes, 390 + 240);
  assert.equal(snap.holidayWorkMinutes, 0);

  // Auffahrt (Do 14.5.2026): Arbeit an einem Feiertag zählt wie Sonntagsarbeit
  const may = { "2026-05-14": { date: "2026-05-14", type: "work", start: "08:00", end: "12:00", breaks: [] } };
  const maySnap = C.buildSnapshot(may, s, "2026-05", { now: NOW });
  assert.equal(maySnap.holidayWorkMinutes, 240);
  assert.equal(maySnap.sundayMinutes, 240);
  const off = Object.assign({}, s, { autoHolidays: false });
  assert.equal(C.buildSnapshot(may, off, "2026-05", { now: NOW }).holidayWorkMinutes, 0, "ohne Feiertage keine Feiertagsarbeit");
});

test("Überzeit nach ArG: Minuten über der Wochengrenze, über den Monatswechsel verteilt", () => {
  const records = {};
  // 07:00–18:00 mit einer Stunde Pause (Pflicht über 9 h) = 10 h netto
  const tenHours = (iso) => ({ date: iso, start: "07:00", end: "18:00", breaks: [{ id: "x", start: "12:00", end: "13:00", paid: false }] });
  // Woche 21.–25.9.: 5 × 10 h = 50 h → 5 h über 45 h, alles am Freitag
  ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"].forEach((d) => { records[d] = tenHours(d); });
  // Woche 28.9.–4.10.: 3 × 12 h im September (36 h) zählen mit, die Grenze fällt aber erst
  // am 1.10. (48 h → 3 h Überzeit) — die Überzeit gehört ganz zum Oktober
  const twelveHours = (iso) => ({ date: iso, start: "07:00", end: "20:00", breaks: [{ id: "x", start: "12:00", end: "13:00", paid: false }] });
  ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].forEach((d) => { records[d] = twelveHours(d); });
  records["2026-10-02"] = tenHours("2026-10-02");
  const s = settings({ maxWeeklyMinutes: 45 * 60 });
  const range = E.computeRange("2026-09-21", "2026-10-04", (iso) => records[iso], s, NOW);
  const ot = C.overtimeByDay(range.days, s.maxWeeklyMinutes, "2026-10-19");
  assert.deepEqual(ot, { "2026-09-25": 300, "2026-10-01": 180, "2026-10-02": 600 });
  assert.equal(C.buildSnapshot(records, s, "2026-09", { now: NOW }).overtime, 300);
  assert.equal(C.buildSnapshot(records, s, "2026-10", { now: NOW }).overtime, 780);
  assert.deepEqual(C.overtimeByDay(range.days, 0, "2026-10-19"), {}, "ohne Höchstarbeitszeit keine Überzeit");
  // Grenze je Woche (Arbeitsmodell ab Stichtag): ab 28.9. gelten 50 h
  const perWeek = (monday) => (monday >= "2026-09-28" ? 50 * 60 : 45 * 60);
  assert.deepEqual(C.overtimeByDay(range.days, perWeek, "2026-10-19"), { "2026-09-25": 300, "2026-10-02": 480 });
});

/* ====================================================================== */
/* Eingefrorenes Zeitkonto                                                 */
/* ====================================================================== */

test("Nach dem Abschluss verschiebt ein neues Arbeitsmodell den Monat nicht mehr", () => {
  const records = Object.assign({}, workMonth("2026-08"), workMonth("2026-09"), workMonth("2026-10"));
  Object.keys(records).forEach((k) => { if (k > "2026-10-16") delete records[k]; });
  const before = settings({ carryOverMinutes: 60, carryOverFrom: "2026-08-01" });
  const snap = C.buildSnapshot(records, before, "2026-09", { now: NOW });
  const accountAtClose = C.accountBalance(records, before, "2026-09-30", NOW).minutes;
  assert.equal(snap.account, accountAtClose);

  // 40-h-Woche statt 42 h: jeder Werktag zählt nun +30 statt +6 min
  const after = Object.assign({}, before, { weeklyTargets: R.weeklyPreset(40 * 60, [1, 2, 3, 4, 5]) });
  after[C.keyOf("2026-09")] = snap;
  const liveSept = C.liveMonthBalance(records, after, "2026-09", NOW);
  assert.notEqual(liveSept, snap.balance, "neu gerechnet wäre der September anders");

  const engine = E.accountBalance(records, after, "2026-10-16", NOW);
  const frozen = C.accountBalance(records, after, "2026-10-16", NOW);
  assert.equal(frozen.minutes, engine.minutes - liveSept + snap.balance, "September zählt eingefroren, August und Oktober neu");
  assert.equal(frozen.frozenDelta, snap.balance - liveSept);
  assert.equal(frozen.closedMonths, 1);

  // Stichtag mitten im abgeschlossenen Monat: eingefrorene Tageswerte
  const mid = C.accountBalance(records, after, "2026-09-15", NOW).minutes;
  const aug = C.liveMonthBalance(records, after, "2026-08", NOW);
  const frozenTo15 = Object.keys(snap.days).filter((dd) => dd <= "15").reduce((a, dd) => a + snap.days[dd], 0);
  assert.equal(mid, 60 + aug + frozenTo15);

  // Vor dem abgeschlossenen Monat ändert sich nichts
  assert.equal(C.accountBalance(records, after, "2026-08-31", NOW).minutes, E.accountBalance(records, after, "2026-08-31", NOW).minutes);
});

test("Arbeitsmodell ab Stichtag: abgeschlossener Monat bleibt — vorwärts wie rückwirkend", () => {
  const records = Object.assign({}, workMonth("2026-08"), workMonth("2026-09"), workMonth("2026-10"));
  Object.keys(records).forEach((k) => { if (k > "2026-10-16") delete records[k]; });
  const s = settings({ carryOverFrom: "2026-08-01" });
  const snap = C.buildSnapshot(records, s, "2026-09", { now: NOW });

  // Ab 1.10. 80 %: September rechnet neu genau wie eingefroren — keine Abweichung
  const forward = Object.assign({}, s, R.changeModel(s, { workloadPercent: 80 }, "2026-10-01", { since: "2026-08-01" }));
  forward[C.keyOf("2026-09")] = snap;
  assert.equal(C.liveMonthBalance(records, forward, "2026-09", NOW), snap.balance);
  const fwd = C.accountBalance(records, forward, "2026-10-16", NOW);
  assert.equal(fwd.frozenDelta, 0);
  assert.equal(fwd.minutes, E.accountBalance(records, forward, "2026-10-16", NOW).minutes);

  // Rückwirkend (für alle Tage) 80 %: August und Oktober neu, September eingefroren
  const back = Object.assign({}, s, R.changeModel(s, { workloadPercent: 80 }, null));
  back[C.keyOf("2026-09")] = snap;
  const liveSep = C.liveMonthBalance(records, back, "2026-09", NOW);
  assert.notEqual(liveSep, snap.balance);
  assert.equal(C.accountBalance(records, back, "2026-10-16", NOW).minutes,
    E.accountBalance(records, back, "2026-10-16", NOW).minutes - liveSep + snap.balance);

  // Überzeit-Grenze aus dem Modell der jeweiligen Woche
  const hist = Object.assign({}, s, { maxWeeklyMinutes: 45 * 60 });
  assert.equal(C.buildSnapshot(records, hist, "2026-09", { now: NOW }).overtime, 0, "8 h 30 × 5 = 42 h 30 bleibt unter 45 h");
});

test("Kappung wirkt erst auf das Ergebnis mit eingefrorenem Monat", () => {
  const records = Object.assign({}, workMonth("2026-08"), workMonth("2026-09"));
  const s = settings({ carryOverFrom: "2026-08-01" });
  const snap = C.buildSnapshot(records, s, "2026-09", { now: NOW });
  const capped = Object.assign({}, s, { capPlusMinutes: 100, weeklyTargets: R.weeklyPreset(40 * 60, [1, 2, 3, 4, 5]) });
  capped[C.keyOf("2026-09")] = snap;
  // neu gerechnet wären es weit über 100 — die Kappung greift trotzdem genau bei 100
  assert.equal(C.accountBalance(records, capped, "2026-09-30", NOW).minutes, 100);
  const loose = Object.assign({}, capped, { capPlusMinutes: null });
  assert.ok(C.accountBalance(records, loose, "2026-09-30", NOW).minutes > 100);
});

test("Konto-Beginn nach dem Abschluss: eingefrorene Tage davor zählen nicht", () => {
  const records = Object.assign({}, workMonth("2026-09"), workMonth("2026-10"));
  const s = settings();
  const snap = C.buildSnapshot(records, s, "2026-09", { now: NOW });
  const later = Object.assign({}, s, { carryOverFrom: "2026-09-16", carryOverMinutes: 0 });
  later[C.keyOf("2026-09")] = snap;
  const fromDay16 = Object.keys(snap.days).filter((dd) => dd >= "16").reduce((a, dd) => a + snap.days[dd], 0);
  assert.equal(C.accountBalance(records, later, "2026-09-30", NOW).minutes, fromDay16);
});

/* ====================================================================== */
/* Monatscheck                                                             */
/* ====================================================================== */

test("Monatscheck: Befunde werden gezählt, ein laufender Tag verhindert den Abschluss", () => {
  const records = workMonth("2026-09", { skip: ["2026-09-08"] });
  records["2026-09-15"] = { date: "2026-09-15", start: "08:00", end: "", breaks: [] };
  const s = settings();
  const range = E.computeRange("2026-09-01", "2026-09-30", (iso) => records[iso], s, NOW);
  const since = C.auditSince(records, s);
  assert.equal(since, "2026-09-01");
  const res = C.check(range.days, "2026-10-19", since);
  assert.equal(res.clean, false);
  assert.equal(res.running, 0);
  const codes = res.audit.issues.map((i) => i.code);
  assert.ok(codes.includes("gap") && codes.includes("incomplete"));
  assert.equal(res.errors, 2);

  const clean = C.check(E.computeRange("2026-09-01", "2026-09-30", (iso) => workMonth("2026-09")[iso], s, NOW).days, "2026-10-19", "2026-09-01");
  assert.equal(clean.clean, true);

  const running = C.check([Object.assign({}, range.days[0], { running: true, warnings: [] })], "2026-10-19", "2026-09-01");
  assert.equal(running.running, 1);
  assert.equal(running.clean, false);
});

test("Monatscheck beginnt mit dem ersten Eintrag oder dem späteren Konto-Beginn", () => {
  const records = workMonth("2026-09");
  assert.equal(C.auditSince(records, settings()), "2026-09-01");
  assert.equal(C.auditSince(records, settings({ carryOverFrom: "2026-09-10" })), "2026-09-10");
  assert.equal(C.auditSince({}, settings()), null);
});

/* ====================================================================== */
/* Lohnmeldung                                                             */
/* ====================================================================== */

function sampleSnap() {
  return {
    v: 1, at: "2026-10-03T09:00:00.000Z", balance: -95, days: {}, account: 754,
    net: 9000, target: 9240, credited: 504, recordedDays: 21,
    vacationDays: 1.5, sickDays: 0, accidentDays: 0, militaryDays: 0, holidayDays: 0,
    absence: { vacation: 756, sick: 0, accident: 0, military: 0, holiday: 0, training: 60 },
    nightMinutes: 390, sundayMinutes: 0, overtime: 0, issues: 0, checksum: "00000000"
  };
}

test("Lohnmeldung: eine Zeile je Lohnart, leere Codes und Nullzeilen fallen weg", () => {
  const rows = C.payrollRows(sampleSnap(), C.codesOf(settings()));
  assert.deepEqual(rows.map((r) => r.key), ["normal", "flex", "night", "vacation"]);
  assert.deepEqual(rows[0], { key: "normal", code: "NORM", minutes: 9060, days: null }, "Netto plus Kursgutschrift");
  assert.equal(rows[1].minutes, -95, "Gleitzeit darf negativ sein");
  assert.deepEqual(rows[3], { key: "vacation", code: "VAC", minutes: 756, days: 1.5 });

  const codes = C.codesOf(settings({ payrollCodes: { normal: " 1000 ", night: "", vacation: "3000" } }));
  assert.equal(codes.normal, "1000");
  assert.equal(codes.flex, "FLEX", "nicht gesetzte Codes behalten den Platzhalter");
  const own = C.payrollRows(sampleSnap(), codes);
  assert.deepEqual(own.map((r) => r.code), ["1000", "FLEX", "3000"], "leerer Code = Zeile wird nicht gemeldet");
  assert.deepEqual(C.payrollRows(null, codes), []);
});

test("Lohnmeldung als CSV: BOM, Semikolon, Dezimalkomma und Formelschutz", () => {
  const rows = C.payrollRows(sampleSnap(), C.codesOf(settings({ payrollCodes: { normal: "=SUM(A1)", flex: "Gleit;zeit" } })));
  const csv = C.payrollCSV(rows, { employeeId: "4711", employee: "+Muster, Anna", period: "2026-09" }, {
    labels: { normal: "Normalstunden", flex: "Überstunden/Gleitzeit", night: "Nachtarbeit (23–06)", vacation: "Ferien" }
  });
  assert.equal(csv.charCodeAt(0), 0xFEFF, "BOM für Excel");
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], "Personalnummer;Name;Periode;Lohnart;Bezeichnung;Stunden;Minuten;Tage");
  assert.equal(lines[1], "4711;'+Muster, Anna;2026-09;'=SUM(A1);Normalstunden;151,00;9060;");
  assert.equal(lines[2], "4711;'+Muster, Anna;2026-09;\"Gleit;zeit\";Überstunden/Gleitzeit;-1,58;-95;", "negative Zahl bleibt Zahl");
  assert.equal(lines[4], "4711;'+Muster, Anna;2026-09;VAC;Ferien;12,60;756;1,50");
  assert.equal(lines.length, 5);

  const en = C.payrollCSV(rows.slice(0, 1), { period: "2026-09" }, {
    delimiter: ",", decimalComma: false, bom: false,
    headers: { employeeId: "Employee no.", employee: "Name", period: "Period", code: "Wage type", label: "Description", hours: "Hours", minutes: "Minutes", days: "Days" }
  });
  assert.equal(en.split("\r\n")[0], "Employee no.,Name,Period,Wage type,Description,Hours,Minutes,Days");
  assert.equal(en.split("\r\n")[1], ",,2026-09,'=SUM(A1),normal,151.00,9060,");
});

/* ====================================================================== */
/* Oberfläche (ohne DOM geladen)                                           */
/* ====================================================================== */

function loadUI() {
  const fs = require("fs");
  const path = require("path");
  const vm = require("vm");
  const I = require("../assets/js/ui/i18n.js");
  const P = require("../assets/js/core/planner.js");
  const slots = {};
  const sandbox = {
    ZK: {
      Time: T, Rules: R, Engine: E, Planner: P, Closing: C, I18n: I, Dom: {},
      Ext: { register: (slot, def) => { (slots[slot] = slots[slot] || []).push(def); } }
    },
    console
  };
  sandbox.self = sandbox;
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/ui/features/closing.js"), "utf8");
  vm.runInNewContext(src, sandbox, { filename: "closing.js" });
  return { UI: sandbox.ZK.ClosingUI, I, slots };
}

test("Oberfläche: alle Texte in vier Sprachen, Schweizer Schreibweise", () => {
  const { I } = loadUI();
  const keys = (lang) => Object.keys(I.DICT[lang]).filter((k) => k.startsWith("closing.")).sort();
  const de = keys("de");
  assert.ok(de.length > 60);
  ["en", "fr", "it"].forEach((lang) => assert.deepEqual(keys(lang), de, lang));
  de.forEach((k) => {
    assert.ok(!/ß/.test(I.DICT.de[k]), "ss statt ß: " + k);
    ["de", "en", "fr", "it"].forEach((lang) => assert.ok(String(I.DICT[lang][k]).trim(), lang + " " + k));
  });
  // Platzhalter stimmen in allen Sprachen überein
  de.forEach((k) => {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    ["en", "fr", "it"].forEach((lang) => assert.equal(vars(I.DICT[lang][k]), vars(I.DICT.de[k]), lang + " " + k));
  });
});

test("Oberfläche: hängt sich in alle vorgesehenen Erweiterungspunkte", () => {
  const { slots } = loadUI();
  ["reports.actions", "reports.top", "calendar.top", "calendar.cell", "stats.top", "today.cards", "settings.sections"].forEach((slot) => {
    assert.equal((slots[slot] || []).filter((d) => d.id === "closing").length, 1, slot);
  });
});

test("Oberfläche: Lohnmeldung in der Sprache der App, Monatsname gross", () => {
  const { UI, I } = loadUI();
  const records = workMonth("2026-09");
  const s = settings({ employeeName: "Anna Muster", payrollEmployeeId: "4711", payrollCodes: { normal: "1000" } });
  s[C.keyOf("2026-09")] = C.buildSnapshot(records, s, "2026-09", { now: NOW });
  const App = { settings: () => s, store: { allDays: () => records } };
  I.setLang("fr");
  try {
    assert.equal(UI.monthLabel("2026-09", true), "Septembre 2026");
    const lines = UI.payrollCSV(App, "2026-09").slice(1).split("\r\n");
    assert.equal(lines[0], "N° de personnel;Nom;Période;Type de salaire;Désignation;Heures;Minutes;Jours");
    assert.match(lines[1], /^4711;Anna Muster;2026-09;1000;Heures normales;\d+,\d\d;\d+;$/);
    assert.equal(UI.payrollCSV(App, "2026-08"), "", "offener Monat: keine Lohnmeldung");
  } finally {
    I.setLang("de");
  }
});

/* ====================================================================== */
/* Zusammenspiel mit dem Store                                             */
/* ====================================================================== */

function guardedStore(backend, clock) {
  const store = S.createStore({ backend, defaultSettings: R.defaultSettings, clock });
  store.setGuard(C.guard, { prefix: C.PREFIX });
  store.load();
  return store;
}

test("Zwei Fenster schliessen verschiedene Monate ab — beide Abschlüsse bleiben", () => {
  const backend = S.memoryBackend();
  const a = guardedStore(backend);
  a.setDays(Object.assign({}, workMonth("2026-08"), workMonth("2026-09")));
  a.flush();
  const b = guardedStore(backend);
  const snapAug = C.buildSnapshot(a.allDays(), a.getSettings(), "2026-08", { now: NOW });
  const snapSep = C.buildSnapshot(b.allDays(), b.getSettings(), "2026-09", { now: NOW });
  a.updateSettings({ "closing:2026-08": snapAug });
  b.updateSettings({ "closing:2026-09": snapSep });
  a.flush();
  b.flush();
  a.syncExternal(backend.getItem(S.KEY));
  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.ok(saved.settings["closing:2026-08"] && saved.settings["closing:2026-09"], "beide im Speicher");
  assert.deepEqual(C.list(a.getSettings()).map((c) => c.month), ["2026-08", "2026-09"]);
  assert.deepEqual(C.list(b.getSettings()).map((c) => c.month), ["2026-08", "2026-09"]);
});

test("Abschluss im anderen Fenster schlägt eine offene Änderung am selben Monat", () => {
  const backend = S.memoryBackend();
  const a = guardedStore(backend);
  a.setDays(workMonth("2026-09"));
  a.flush();
  const b = guardedStore(backend);
  const events = [];
  a.subscribe((evt) => events.push(evt));

  a.setDay("2026-09-15", { end: "19:00" });          // noch nicht gespeichert
  b.updateSettings({ "closing:2026-09": C.buildSnapshot(b.allDays(), b.getSettings(), "2026-09", { now: NOW }) });
  b.flush();
  a.flush();

  const saved = JSON.parse(backend.getItem(S.KEY));
  assert.equal(saved.days["2026-09-15"].end, "17:00", "der abgeschlossene Stand gilt");
  assert.equal(a.getDay("2026-09-15").end, "17:00");
  const locked = events.find((e) => e.type === "locked");
  assert.deepEqual(locked && locked.dates, ["2026-09-15"]);
  assert.equal(C.isStale(saved.settings["closing:2026-09"], saved.days, "2026-09"), false);
  // Rückgängig in A darf den abgeschlossenen Tag nicht mehr anfassen
  a.undo();
  assert.equal(a.getDay("2026-09-15").end, "17:00");
});

test("Rückgängig über einen Abschluss hinweg: erst den Abschluss, dann den Tag", () => {
  const clock = (() => { let t = 1e6; const f = () => t; f.tick = (ms) => { t += ms; }; return f; })();
  const store = guardedStore(S.memoryBackend(), clock);
  store.setDays(workMonth("2026-09"));
  clock.tick(5000);
  store.setDay("2026-09-15", { end: "18:00" });
  clock.tick(5000);
  store.updateSettings({ "closing:2026-09": C.buildSnapshot(store.allDays(), store.getSettings(), "2026-09", { now: NOW }) });
  assert.equal(store.isLocked("2026-09-15"), true);

  store.undo();                                         // nimmt den Abschluss zurück
  assert.equal(store.isLocked("2026-09-15"), false);
  store.undo();                                         // jetzt ist der Tag wieder offen
  assert.equal(store.getDay("2026-09-15").end, "17:00");
  store.redo();
  store.redo();
  assert.equal(store.getDay("2026-09-15").end, "18:00");
  assert.equal(store.isLocked("2026-09-15"), true, "Wiederherstellen schliesst wieder ab");
});
