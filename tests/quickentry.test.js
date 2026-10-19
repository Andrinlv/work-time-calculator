"use strict";
/* Schnellerfassung: Lesen, Planen, Zusammenführen — ohne Oberfläche. */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../assets/js/core/planner.js");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");

const BASE = "2026-10-16"; // Freitag
const settings = () => Object.assign(R.defaultSettings(), { autoHolidays: false });
const ok = (input, base) => {
  const r = P.analyzeQuickEntry(input, base || BASE);
  assert.equal(r.ok, true, input + " → " + JSON.stringify(r.error));
  return r;
};
const err = (input, base) => {
  const r = P.analyzeQuickEntry(input, base || BASE);
  assert.equal(r.ok, false, input + " sollte scheitern, ergab " + JSON.stringify(r));
  assert.equal(P.parseQuickEntry(input, base || BASE), null);
  return r.error;
};

/* ====================================================================== */
/* Zeitspannen                                                             */
/* ====================================================================== */

test("Vierstellige Zeiten werden ganz gelesen, nicht als Pause", () => {
  const r = ok("0745-1630");
  assert.equal(r.start, "07:45");
  assert.equal(r.end, "16:30");
  assert.equal(r.breakMinutes, null, "keine Phantom-Pause aus „30“");
  assert.equal(ok("7:45-1630").end, "16:30");
  assert.equal(ok("heute 0730-1645 p30").end, "16:45");
  assert.equal(ok("heute 0730-1645 p30").breakMinutes, 30);
});

test("„0800-1700“ lässt bestehende Pausen in Ruhe", () => {
  assert.equal(ok("0800-1700").breakMinutes, null);
});

test("Schweizer und französische Uhrzeiten", () => {
  [["7.45-16.30", "07:45", "16:30"], ["7h45-16h30", "07:45", "16:30"], ["hier 8h à 17h", "08:00", "17:00"],
   ["von 8 uhr bis 17 uhr", "08:00", "17:00"], ["dalle 8 alle 17", "08:00", "17:00"], ["8–17", "08:00", "17:00"]]
    .forEach(([input, s, e]) => {
      const r = ok(input);
      assert.equal(r.start, s, input);
      assert.equal(r.end, e, input);
    });
});

test("„8 to 5“ ist 8 bis 17 Uhr, eine Nachtschicht bleibt eine Nachtschicht", () => {
  assert.equal(ok("yesterday 8 to 5").end, "17:00");
  const night = ok("22-6 p30");
  assert.equal(night.start, "22:00");
  assert.equal(night.end, "06:00");
});

test("Zwei Spannen ergeben die Pause dazwischen", () => {
  const r = ok("8-12 13-17");
  assert.equal(r.start, "08:00");
  assert.equal(r.end, "17:00");
  assert.equal(r.breakMinutes, 60);
  assert.equal(r.breakStart, "12:00");
});

test("Pause mit Uhrzeit wird genau dort eingetragen", () => {
  const r = ok("8-17 pause 12-12:45");
  assert.equal(r.breakMinutes, 45);
  const day = P.quickEntryToPatch(r)[BASE];
  assert.equal(day.breaks[0].start, "12:00");
  assert.equal(day.breaks[0].end, "12:45");
  assert.equal(err("8-17 pause 18-19").code, "break-outside");
});

/* ====================================================================== */
/* Daten und Zeiträume                                                     */
/* ====================================================================== */

test("Schweizer Datum mit Schlusspunkt, allein und als Bereich", () => {
  assert.deepEqual(ok("12.10. 8-17").dates, ["2026-10-12"]);
  const r = ok("12.10.-16.10. ferien");
  assert.equal(r.dates.length, 5);
  assert.equal(r.dates[0], "2026-10-12");
  assert.equal(r.dates[4], "2026-10-16");
  assert.deepEqual(ok("12.-16.10. ferien").dates, r.dates, "Kurzform 12.-16.10.");
  assert.deepEqual(ok("du 12.10. au 16.10. vacances").dates, r.dates);
  assert.deepEqual(ok("dal 12.10. al 16.10. ferie").dates, r.dates);
});

test("Bereich über den Jahreswechsel", () => {
  const r = ok("28.12.-2.1. ferien");
  assert.equal(r.dates[0], "2026-12-28");
  assert.equal(r.dates[r.dates.length - 1], "2027-01-02");
  assert.equal(r.dates.length, 6);
});

test("Rückwärts laufender oder ungültiger Bereich ist ein Fehler — nie heute", () => {
  assert.equal(err("16.10.-12.10. ferien").code, "range-backwards");
  const bad = err("30.11.-31.11. krank");
  assert.equal(bad.code, "bad-date");
  assert.equal(bad.token, "31.11.");
  assert.equal(err("31.2. 8-17").code, "bad-date");
});

test("Zu lange Zeiträume werden abgelehnt", () => {
  const e = err("1.1.-31.12. ferien");
  assert.equal(e.code, "range-too-long");
  assert.equal(e.days, 365);
});

test("Unbekannte Wörter werden gemeldet statt übergangen", () => {
  const e = err("mo-fr 8-17");
  assert.equal(e.code, "unknown");
  assert.equal(e.token, "mo-fr");
  assert.equal(err("ferien 3").code, "unknown");
  assert.equal(err("abc").code, "unreadable");
});

test("Unvollständige oder widersprüchliche Eingaben haben einen klaren Grund", () => {
  assert.equal(err("12.10.").code, "only-date");
  assert.equal(err("p30").code, "only-break");
  assert.equal(err("30 min").code, "only-break");
  assert.equal(err("heute 8-").code, "open-range");
  assert.equal(err("0-24").code, "span-empty");
  assert.equal(err("8-17 p600").code, "break-too-long");
  assert.equal(err("7:45").code, "single-time");
  assert.equal(err("25-30").code, "bad-time");
  assert.equal(err("ferien krank").code, "multi-type");
  assert.equal(err("12.10. 13.10. ferien").code, "multi-date");
  assert.equal(err("8-17 pause").code, "break-missing");
  assert.equal(err("halbtag 8-12").code, "half-type");
});

/* ====================================================================== */
/* Vier Sprachen                                                           */
/* ====================================================================== */

test("Stichworte auf Deutsch, Englisch, Französisch und Italienisch", () => {
  const cases = {
    "gestern 8-17": ["2026-10-15", null], "yesterday 8-17": ["2026-10-15", null],
    "hier 8-17": ["2026-10-15", null], "ieri 8-17": ["2026-10-15", null],
    "avant-hier 8-17": ["2026-10-14", null], "l'altro ieri 8-17": ["2026-10-14", null],
    "morgen ferien": ["2026-10-17", "vacation"], "tomorrow vacation": ["2026-10-17", "vacation"],
    "demain vacances": ["2026-10-17", "vacation"], "domani ferie": ["2026-10-17", "vacation"],
    "krank": [BASE, "sick"], "sick": [BASE, "sick"], "malade": [BASE, "sick"], "malattia": [BASE, "sick"],
    "kurs 8-17": [BASE, "training"], "formation 8-17": [BASE, "training"], "formazione 8-17": [BASE, "training"],
    "aujourd'hui malade": [BASE, "sick"], "oggi malattia": [BASE, "sick"], "après-demain ferien": ["2026-10-18", "vacation"]
  };
  Object.keys(cases).forEach((input) => {
    const r = ok(input);
    assert.deepEqual(r.dates, [cases[input][0]], input);
    assert.equal(r.type, cases[input][1], input);
  });
  assert.equal(ok("ieri 8-17 pausa 30").breakMinutes, 30);
  assert.equal(ok("today 9-17 break 30").breakMinutes, 30);
  assert.equal(ok("vacances demi").factor, 0.5);
  assert.equal(ok("ferie mezza giornata").factor, 0.5);
});

test("Arbeitsort und Notiz lassen sich mitgeben", () => {
  const r = ok('8-17 homeoffice "Kunde Basel"');
  assert.equal(r.location, "home");
  assert.equal(r.note, "Kunde Basel");
  assert.equal(ok("8-17 télétravail").location, "home");
  assert.equal(ok("8-17 trasferta").location, "travel");
});

/* ====================================================================== */
/* Pausen liegen immer in der Spanne                                       */
/* ====================================================================== */

test("Die Pause liegt auf der gewohnten Mittagspause, wenn sie passt", () => {
  const day = P.quickEntryToPatch(ok("7:45-16:30 p30"), { lunch: { start: "12:00", end: "12:30" } })[BASE];
  assert.equal(day.breaks[0].start, "12:00");
  assert.equal(day.breaks[0].end, "12:30");
});

test("Kurze Tage: die Pause rutscht in die Mitte und wird abgezogen", () => {
  const day = P.quickEntryToPatch(ok("8-11 p15"), { lunch: { start: "12:00", end: "12:30" } })[BASE];
  const res = E.computeDay(day, { settings: settings(), holiday: null, isToday: false });
  assert.equal(res.net, 165);
  assert.ok(!res.warnings.some((w) => w.code === "break-outside"));
});

test("Nachtschicht: die Pause liegt nach Mitternacht innerhalb der Schicht", () => {
  const day = P.quickEntryToPatch(ok("22-6 p30"), { lunch: { start: "12:00", end: "12:30" } })[BASE];
  const res = E.computeDay(day, { settings: settings(), holiday: null, isToday: false });
  assert.equal(res.net, 450);
});

/* ====================================================================== */
/* Planen und Zusammenführen                                               */
/* ====================================================================== */

const recorded = {
  "2026-10-15": { date: "2026-10-15", start: "08:30", end: "17:58", note: "Quartal", location: "home",
    breaks: [{ id: "l", start: "11:35", end: "12:28", paid: false }], absenceFactor: 1 },
  "2026-10-14": { date: "2026-10-14", type: "vacation", start: "", end: "", breaks: [], absenceFactor: 1 }
};
const getRecord = (iso) => recorded[iso] || null;

test("Ein erfasster Tag wird erkannt und nicht stillschweigend geplant", () => {
  const plan = P.planQuickEntry(ok("gestern 7:45-16:30"), { getRecord });
  assert.equal(plan.occupied, 1);
  assert.equal(plan.fresh, 0);
  assert.equal(plan.days[0].status, "occupied");
  assert.deepEqual(Object.keys(P.selectQuickPatch(plan, false)), [], "ohne Bestätigung bleibt der Tag");
  assert.deepEqual(Object.keys(P.selectQuickPatch(plan, true)), ["2026-10-15"]);
});

test("Überschreiben behält Pausen, Notiz und Ort, wenn die Eingabe sie nicht nennt", () => {
  const plan = P.planQuickEntry(ok("gestern 7:45-16:30"), { getRecord });
  const after = plan.days[0].after;
  assert.equal(after.start, "07:45");
  assert.equal(after.end, "16:30");
  assert.equal(after.note, "Quartal");
  assert.equal(after.location, "home");
  assert.equal(after.breaks.length, 1);
  assert.equal(after.breaks[0].start, "11:35");
});

test("Eine genannte Pause ersetzt die bisherigen", () => {
  const plan = P.planQuickEntry(ok("gestern 7:45-16:30 p30"), { getRecord, lunch: { start: "12:00", end: "12:30" } });
  const after = plan.days[0].after;
  assert.equal(after.breaks.length, 1);
  assert.equal(after.breaks[0].start, "12:00");
  assert.equal(after.note, "Quartal");
});

test("Zeiten auf einem Ferientag machen daraus wieder einen Arbeitstag", () => {
  const plan = P.planQuickEntry(ok("14.10. 8-17"), { getRecord });
  assert.equal(plan.days[0].after.type, null);
  assert.equal(plan.days[0].after.start, "08:00");
});

test("Dieselbe Eingabe zweimal ändert nichts", () => {
  const plan = P.planQuickEntry(ok("14.10. ferien"), { getRecord });
  assert.equal(plan.days[0].status, "same");
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(Object.keys(P.selectQuickPatch(plan, true)), []);
});

test("Zeiträume überspringen Wochenenden und Feiertage", () => {
  const dayOff = (iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return "weekend";
    return iso === "2026-12-25" || iso === "2027-01-01" ? "holiday" : null;
  };
  const plan = P.planQuickEntry(ok("21.12.-2.1. ferien"), { dayOff });
  const booked = plan.days.filter((d) => d.status === "new").map((d) => d.date);
  assert.equal(plan.skipped, 5, "25.12., 26./27.12., 1.1., 2.1.");
  assert.equal(booked.length, 8);
  assert.ok(booked.indexOf("2026-12-25") < 0, "Weihnachten ist schon frei");
  assert.ok(booked.indexOf("2026-12-26") < 0, "Samstag bleibt frei");
});

test("Ein einzeln genannter freier Tag wird nicht übersprungen", () => {
  const plan = P.planQuickEntry(ok("17.10. 9-13"), { dayOff: () => "weekend" });
  assert.equal(plan.fresh, 1);
});

test("Nur freie Tage im Zeitraum: der Plan meldet es", () => {
  const plan = P.planQuickEntry(ok("17.10.-18.10. ferien"), { dayOff: () => "weekend" });
  assert.equal(plan.error, "no-workday");
});

test("Halber Ferientag behält die Stempelzeiten", () => {
  const plan = P.planQuickEntry(ok("gestern ferien halbtag"), { getRecord });
  const after = plan.days[0].after;
  assert.equal(after.type, "vacation");
  assert.equal(after.absenceFactor, 0.5);
  assert.equal(after.start, "08:30");
});

test("Ganztägige Abwesenheit räumt Stempel und Pausen, Notiz bleibt", () => {
  const plan = P.planQuickEntry(ok("gestern krank"), { getRecord });
  const after = plan.days[0].after;
  assert.equal(after.type, "sick");
  assert.equal(after.start, "");
  assert.deepEqual(after.breaks, []);
  assert.equal(after.note, "Quartal");
});

test("Ganzer Ferientag mit Arbeitszeit ist ein Widerspruch, ein halber nicht", () => {
  assert.equal(err("ferien 8-17").code, "absence-times");
  assert.equal(err("krank 8-12").code, "absence-times");
  const half = ok("ferien halbtag 13-17");
  assert.equal(half.factor, 0.5);
  assert.equal(ok("kurs 8-17").type, "training", "Kurse werden gestempelt");
});
