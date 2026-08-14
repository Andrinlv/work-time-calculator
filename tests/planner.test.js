"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../assets/js/core/planner.js");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const H = require("../assets/js/core/holidays.js");

const BASE = "2026-08-06"; // Donnerstag

/* ====================================================================== */
/* Schnellerfassung                                                        */
/* ====================================================================== */

test("Einfache Zeitspanne für heute", () => {
  const r = P.parseQuickEntry("8-17", BASE);
  assert.deepEqual(r.dates, [BASE]);
  assert.equal(r.start, "08:00");
  assert.equal(r.end, "17:00");
});

test("Alle Schreibweisen einer Zeitspanne", () => {
  ["8-17", "08:00-17:00", "0800-1700", "8:00 - 17:00", "8 bis 17"].forEach((input) => {
    const r = P.parseQuickEntry(input, BASE);
    assert.equal(r && r.start, "08:00", input);
    assert.equal(r && r.end, "17:00", input);
  });
});

test("Relative Tagesangaben", () => {
  assert.deepEqual(P.parseQuickEntry("gestern 8-17", BASE).dates, ["2026-08-05"]);
  assert.deepEqual(P.parseQuickEntry("vorgestern 8-17", BASE).dates, ["2026-08-04"]);
  assert.deepEqual(P.parseQuickEntry("morgen 8-17", BASE).dates, ["2026-08-07"]);
  assert.deepEqual(P.parseQuickEntry("yesterday 8-17", BASE).dates, ["2026-08-05"]);
});

test("Datum in verschiedenen Formaten", () => {
  assert.deepEqual(P.parseQuickEntry("12.8. 8-17", BASE).dates, ["2026-08-12"]);
  assert.deepEqual(P.parseQuickEntry("12.08.2027 8-17", BASE).dates, ["2027-08-12"]);
  assert.deepEqual(P.parseQuickEntry("2026-09-01 8-17", BASE).dates, ["2026-09-01"]);
});

test("Pausenangabe in verschiedenen Schreibweisen", () => {
  assert.equal(P.parseQuickEntry("8-17 p45", BASE).breakMinutes, 45);
  assert.equal(P.parseQuickEntry("8-17 pause 45", BASE).breakMinutes, 45);
  assert.equal(P.parseQuickEntry("8-17 45min", BASE).breakMinutes, 45);
  assert.equal(P.parseQuickEntry("8-17 45", BASE).breakMinutes, 45);
});

test("Datumsbereich mit Tagesart", () => {
  const r = P.parseQuickEntry("12.8.-16.8. ferien", BASE);
  assert.equal(r.type, "vacation");
  assert.equal(r.dates.length, 5);
  assert.equal(r.dates[0], "2026-08-12");
  assert.equal(r.dates[4], "2026-08-16");
});

test("Tagesarten in mehreren Sprachen", () => {
  assert.equal(P.parseQuickEntry("krank", BASE).type, "sick");
  assert.equal(P.parseQuickEntry("sick", BASE).type, "sick");
  assert.equal(P.parseQuickEntry("malattia", BASE).type, "sick");
  assert.equal(P.parseQuickEntry("kompensation", BASE).type, "comp");
  assert.equal(P.parseQuickEntry("wk", BASE).type, "military");
});

test("Halbtag wird erkannt", () => {
  const r = P.parseQuickEntry("ferien halbtag", BASE);
  assert.equal(r.type, "vacation");
  assert.equal(r.factor, 0.5);
});

test("Unbrauchbare Eingaben ergeben null", () => {
  assert.equal(P.parseQuickEntry("", BASE), null);
  assert.equal(P.parseQuickEntry("hallo welt", BASE), null);
  assert.equal(P.parseQuickEntry(null, BASE), null);
});

test("Nur ein Datum ohne alles Weitere ist zu wenig", () => {
  assert.equal(P.parseQuickEntry("12.8.", BASE), null);
});

test("Aus dem Parse-Ergebnis wird ein vollständiger Tageseintrag", () => {
  const patch = P.quickEntryToPatch(P.parseQuickEntry("gestern 7:45-16:30 p30", BASE), { breakLabel: "Mittag" });
  const day = patch["2026-08-05"];
  assert.equal(day.start, "07:45");
  assert.equal(day.end, "16:30");
  assert.equal(day.breaks.length, 1);
  assert.equal(day.breaks[0].label, "Mittag");

  // Gegenprobe über die Engine: 8h45 Anwesenheit − 30 min Pause
  const res = E.computeDay(day, { settings: Object.assign(R.defaultSettings(), { autoHolidays: false }) });
  assert.equal(res.presence, 525);
  assert.equal(res.breakTotal, 30);
  assert.equal(res.net, 495);
});

test("Abwesenheiten löschen die Stempelzeiten", () => {
  const patch = P.quickEntryToPatch(P.parseQuickEntry("12.8.-13.8. ferien", BASE));
  assert.equal(patch["2026-08-12"].type, "vacation");
  assert.equal(patch["2026-08-12"].start, "");
  assert.deepEqual(patch["2026-08-12"].breaks, []);
  assert.equal(Object.keys(patch).length, 2);
});

/* ====================================================================== */
/* Gleitzeit-Planer                                                        */
/* ====================================================================== */

function workdays(n, target) {
  const out = [];
  let iso = BASE;
  while (out.length < n) {
    const wd = T.weekdayOf(iso);
    if (wd !== 0 && wd !== 6) out.push({ date: iso, target: target || 504 });
    iso = T.addDays(iso, 1);
  }
  return out;
}

test("Ein Plus wird gleichmässig abgebaut", () => {
  // +5:00 auf 10 Tage abbauen → 30 min weniger pro Tag
  const plan = P.distributeBalance(300, 0, workdays(10));
  assert.equal(plan.feasible, true);
  assert.equal(plan.perDay, -30);
  assert.equal(plan.days[0].plannedNet, 474);
  const sum = plan.days.reduce((a, d) => a + (d.plannedNet - d.target), 0);
  assert.equal(sum, -300, "die Summe muss die Differenz exakt treffen");
});

test("Rundungsreste gehen nicht verloren", () => {
  const plan = P.distributeBalance(0, 100, workdays(7));
  const sum = plan.days.reduce((a, d) => a + (d.plannedNet - d.target), 0);
  assert.equal(sum, 100);
});

test("Ohne Arbeitstage ist kein Plan möglich", () => {
  const plan = P.distributeBalance(300, 0, []);
  assert.equal(plan.feasible, false);
  assert.equal(plan.reason, "no-days");
});

test("Ein sportlicher Plan wird als solcher gemeldet", () => {
  const entspannt = P.distributeBalance(0, 300, workdays(20));
  assert.equal(entspannt.strained, false);
  const sportlich = P.distributeBalance(0, 1200, workdays(5));
  assert.equal(sportlich.strained, true, "über 10 Stunden pro Tag");
});

test("Kompensationstage aus dem Saldo", () => {
  const c = P.compensationDays(1100, 504);
  assert.equal(c.days, 2);
  assert.equal(c.rest, 92);
  assert.equal(P.compensationDays(-300, 504).days, 0);
  assert.equal(P.compensationDays(504, 504).days, 1);
});

test("Gehen-Zeit für einen gewünschten Tagessaldo", () => {
  // Soll 504, kein Plus gewünscht, keine Pause erfasst → wie in der Engine
  const exact = P.leaveTimeForBalance({ start: "08:00", target: 504, breakMinutes: 0 });
  assert.equal(exact.text, "16:54");

  // Eine Stunde Plus mitnehmen: die Anwesenheit überschreitet damit neun
  // Stunden und löst die 60-Minuten-Pausenstufe aus — 17:54 wäre zu früh.
  const plus = P.leaveTimeForBalance({ start: "08:00", target: 504, wantBalance: 60, breakMinutes: 0 });
  assert.equal(plus.text, "18:24");

  const res = E.computeDay(
    { date: BASE, start: "08:00", end: plus.text, breaks: [] },
    { settings: Object.assign(R.defaultSettings(), { autoHolidays: false }) }
  );
  assert.equal(res.balance, 60, "Gegenprobe über die Engine");
  assert.equal(res.requiredBreak, 60);
});

test("Gehen-Zeit berücksichtigt bereits erfasste Pausen", () => {
  const withBreak = P.leaveTimeForBalance({ start: "08:00", target: 504, breakMinutes: 60 });
  assert.equal(withBreak.text, "17:24");

  const res = E.computeDay(
    { date: BASE, start: "08:00", end: withBreak.text, breaks: [{ id: "b", start: "12:00", end: "13:00" }] },
    { settings: Object.assign(R.defaultSettings(), { autoHolidays: false }) }
  );
  assert.equal(res.balance, 0);
});

test("Gehen-Zeit ohne gültigen Start ergibt null", () => {
  assert.equal(P.leaveTimeForBalance({ start: "quatsch", target: 504 }), null);
});

/* ====================================================================== */
/* Brückentage                                                             */
/* ====================================================================== */

function bridgeOpts(region, year) {
  const holidays = H.forYear(year, region);
  return {
    from: year + "-01-01",
    to: year + "-12-31",
    isHoliday: (iso) => !!holidays[iso],
    isWorkday: (iso) => { const wd = T.weekdayOf(iso); return wd >= 1 && wd <= 5; }
  };
}

test("Brückentage werden gefunden und sind plausibel", () => {
  const list = P.bridgeDays(bridgeOpts("CH-LU", 2026));
  assert.ok(list.length > 0, "in einem Jahr gibt es Brücken");

  list.forEach((b) => {
    assert.ok(b.vacationDays >= 1 && b.vacationDays <= 4);
    assert.ok(b.ratio >= 2, "sonst lohnt es sich nicht");
    assert.ok(b.totalDays >= 3);
    assert.equal(b.dates.length, b.vacationDays);
    assert.ok(b.holidays.length > 0, "ohne Feiertag ist es keine Brücke");
    assert.equal(T.diffDays(b.from, b.to) + 1, b.totalDays);
  });
});

test("Vorschläge überschneiden sich nicht", () => {
  const list = P.bridgeDays(bridgeOpts("CH-ZH", 2026));
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].to < list[i].from, "Überschneidung bei " + list[i].from);
  }
});

test("Vorgeschlagene Ferientage sind wirklich Arbeitstage ohne Feiertag", () => {
  const opts = bridgeOpts("CH-BE", 2026);
  P.bridgeDays(opts).forEach((b) => {
    b.dates.forEach((iso) => {
      assert.equal(opts.isWorkday(iso), true, iso + " ist kein Arbeitstag");
      assert.equal(opts.isHoliday(iso), false, iso + " ist bereits frei");
    });
  });
});

test("Ohne Feiertage gibt es keine Brücken", () => {
  const list = P.bridgeDays({
    from: "2026-01-01", to: "2026-12-31",
    isHoliday: () => false,
    isWorkday: (iso) => { const wd = T.weekdayOf(iso); return wd >= 1 && wd <= 5; }
  });
  assert.deepEqual(list, []);
});

test("Ein strengeres Verhältnis liefert weniger Vorschläge", () => {
  const opts = bridgeOpts("CH-LU", 2026);
  const locker = P.bridgeDays(Object.assign({}, opts, { minRatio: 2 }));
  const streng = P.bridgeDays(Object.assign({}, opts, { minRatio: 3 }));
  assert.ok(streng.length <= locker.length);
  streng.forEach((b) => assert.ok(b.ratio >= 3));
});

/* ====================================================================== */
/* Monatscheck                                                             */
/* ====================================================================== */

function auditFor(days, from, to) {
  const settings = Object.assign(R.defaultSettings(), { autoHolidays: false });
  const range = E.computeRange(from, to, (iso) => days[iso], settings);
  return P.auditRange(range.days, "2026-09-01");
}

test("Ein sauberer Monat meldet nichts", () => {
  const days = {};
  T.rangeDays("2026-08-03", "2026-08-07").forEach((iso) => {
    days[iso] = { date: iso, start: "08:00", end: "16:54", breaks: [{ id: "b", start: "12:00", end: "12:30" }] };
  });
  const audit = auditFor(days, "2026-08-03", "2026-08-07");
  assert.equal(audit.clean, true);
  assert.equal(audit.total, 0);
});

test("Lücken werden als Fehler gemeldet", () => {
  const audit = auditFor({}, "2026-08-03", "2026-08-07");
  const gap = audit.issues.filter((i) => i.code === "gap")[0];
  assert.ok(gap);
  assert.equal(gap.count, 5);
  assert.equal(gap.level, "error");
});

test("Angefangene Tage und automatische Pausenabzüge tauchen auf", () => {
  const days = {
    "2026-08-03": { date: "2026-08-03", start: "08:00", end: "" },
    "2026-08-04": { date: "2026-08-04", start: "08:00", end: "17:00", breaks: [] }
  };
  const audit = auditFor(days, "2026-08-03", "2026-08-04");
  const codes = audit.issues.map((i) => i.code);
  assert.ok(codes.indexOf("incomplete") >= 0);
  assert.ok(codes.indexOf("break-auto") >= 0);
  assert.ok(audit.errors >= 1);
});

test("Überlange Tage werden gemeldet", () => {
  const days = { "2026-08-03": { date: "2026-08-03", start: "06:00", end: "19:00", breaks: [] } };
  const audit = auditFor(days, "2026-08-03", "2026-08-03");
  assert.ok(audit.issues.some((i) => i.code === "over-daily-max"));
});

/* ====================================================================== */
/* Prognose                                                                */
/* ====================================================================== */

test("Prognose schreibt den Schnitt fort", () => {
  const f = P.forecast(120, 10, 6);
  assert.equal(f.balance, 180);
  assert.equal(f.remainingWorkdays, 10);
  assert.equal(P.forecast(120, 10, 0).balance, 120);
});
