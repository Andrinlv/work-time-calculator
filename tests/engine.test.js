"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");

/* Basiseinstellungen für die Tests: 42-h-Woche, Schweizer Pausenrecht,
   keine Feiertagsautomatik (die wird separat getestet).                  */
function settings(patch) {
  return Object.assign(R.defaultSettings(), { autoHolidays: false }, patch || {});
}

/* 2026-08-06 ist ein Donnerstag → voller Arbeitstag, Soll 8:24 = 504 min */
const DO = "2026-08-06";
const SA = "2026-08-08"; // Samstag
const ctx = (patch) => Object.assign({ settings: settings(patch && patch.settings), holiday: null, isToday: false }, patch || {});

test("Standardtag: 08:00–17:00 mit 30 min Pause", () => {
  const res = E.computeDay({
    date: DO, start: "08:00", end: "17:00",
    breaks: [{ id: "b1", start: "12:00", end: "12:30" }]
  }, ctx());

  assert.equal(res.presence, 540);
  assert.equal(res.breakTotal, 30);
  assert.equal(res.requiredBreak, 30, "540 min > 7 h → 30 min Pflichtpause");
  assert.equal(res.autoDeducted, 0);
  assert.equal(res.net, 510);
  assert.equal(res.target, 504);
  assert.equal(res.balance, 6);
  assert.equal(res.complete, true);
  assert.equal(res.hasError, false);
});

test("Fehlende Pflichtpause wird automatisch abgezogen", () => {
  const res = E.computeDay({ date: DO, start: "08:00", end: "17:00", breaks: [] }, ctx());
  assert.equal(res.breakTotal, 0);
  assert.equal(res.requiredBreak, 30);
  assert.equal(res.autoDeducted, 30);
  assert.equal(res.effectiveBreak, 30);
  assert.equal(res.net, 510);
  assert.ok(res.warnings.some((w) => w.code === "break-auto"));
});

test("Ohne Automatik wird die fehlende Pause nur gemeldet", () => {
  const res = E.computeDay(
    { date: DO, start: "08:00", end: "17:00", breaks: [] },
    ctx({ settings: { autoDeductBreak: false } })
  );
  assert.equal(res.autoDeducted, 0);
  assert.equal(res.net, 540, "ohne Abzug zählt die volle Anwesenheit");
  assert.ok(res.warnings.some((w) => w.code === "break-short"));
});

test("Pausenstaffel: über 9 Stunden verlangt 60 Minuten", () => {
  const res = E.computeDay({ date: DO, start: "07:00", end: "17:30", breaks: [] }, ctx());
  assert.equal(res.presence, 630);
  assert.equal(res.requiredBreak, 60);
  assert.equal(res.net, 570);
});

test("Nachtschicht 22:00–06:00 wird als Folgetag gelesen", () => {
  const res = E.computeDay({
    date: DO, start: "22:00", end: "06:00",
    breaks: [{ id: "b1", start: "01:00", end: "01:30" }]
  }, ctx());
  assert.equal(res.presence, 480);
  assert.equal(res.breakTotal, 30, "Pause um 01:00 gehört zur Nacht");
  assert.equal(res.net, 450);
});

test("Überlappende Pausen werden nicht doppelt abgezogen", () => {
  const res = E.computeDay({
    date: DO, start: "08:00", end: "17:00",
    breaks: [
      { id: "b1", start: "12:00", end: "12:45" },
      { id: "b2", start: "12:30", end: "13:00" }
    ]
  }, ctx());
  assert.equal(res.breakTotal, 60, "12:00–13:00 sind 60 Minuten, nicht 75");
  assert.ok(res.warnings.some((w) => w.code === "break-overlap"));
});

test("Pausen ausserhalb der Anwesenheit werden beschnitten", () => {
  const res = E.computeDay({
    date: DO, start: "08:00", end: "12:00",
    breaks: [{ id: "b1", start: "11:30", end: "13:00" }]
  }, ctx());
  assert.equal(res.breakTotal, 30, "nur 11:30–12:00 liegt im Anwesenheitsfenster");
  assert.ok(res.warnings.some((w) => w.code === "break-outside"));
});

test("Empfohlene Gehen-Zeit erfüllt das Soll exakt (ohne Pauseneingabe)", () => {
  const res = E.computeDay({ date: DO, start: "08:00", end: "", breaks: [] }, ctx());
  assert.equal(res.recommendedLeave, "16:54", "504 min Soll + 30 min Pflichtpause");

  // Gegenprobe: mit dieser Gehen-Zeit muss der Saldo genau null sein
  const check = E.computeDay({ date: DO, start: "08:00", end: "16:54", breaks: [] }, ctx());
  assert.equal(check.net, 504);
  assert.equal(check.balance, 0);
});

test("Empfohlene Gehen-Zeit berücksichtigt eine längere Mittagspause", () => {
  const rec = { date: DO, start: "08:00", end: "", breaks: [{ id: "b1", start: "12:00", end: "13:00" }] };
  const res = E.computeDay(rec, ctx());
  assert.equal(res.recommendedLeave, "17:24", "504 + 60 min Pause");

  const check = E.computeDay(Object.assign({}, rec, { end: "17:24" }), ctx());
  assert.equal(check.balance, 0);
});

test("Empfohlene Gehen-Zeit findet den Fixpunkt an der 9-Stunden-Schwelle", () => {
  // Soll 10 h: naiv 600 + 30 = 630 min Anwesenheit, das kippt aber in die
  // 60-Minuten-Stufe. Die Engine muss auf 660 min nachziehen.
  const s = { settings: { weeklyTargets: R.weeklyPreset(50 * 60, [1, 2, 3, 4, 5]) } };
  const res = E.computeDay({ date: DO, start: "08:00", end: "", breaks: [] }, ctx(s));
  assert.equal(res.target, 600);
  assert.equal(res.recommendedLeave, "19:00", "600 min Arbeit + 60 min Pflichtpause");

  const check = E.computeDay({ date: DO, start: "08:00", end: "19:00", breaks: [] }, ctx(s));
  assert.equal(check.net, 600);
  assert.equal(check.balance, 0);
});

test("Empfohlene Gehen-Zeit hält auch bei Rundung das Soll", () => {
  const s = { settings: { roundStep: 15, roundMode: "down" } };
  const res = E.computeDay({ date: DO, start: "08:00", end: "", breaks: [] }, ctx(s));
  const check = E.computeDay({ date: DO, start: "08:00", end: res.recommendedLeave, breaks: [] }, ctx(s));
  assert.ok(check.net >= check.target, "gerundetes Netto darf das Soll nicht unterschreiten");
  assert.ok(check.balance >= 0);
});

test("Samstag hat kein Soll und erzeugt kein Minus", () => {
  const res = E.computeDay({ date: SA }, ctx());
  assert.equal(res.target, 0);
  assert.equal(res.type, "free");
  assert.equal(res.balance, 0);
});

test("Samstagsarbeit landet vollständig im Plus", () => {
  const res = E.computeDay({ date: SA, start: "09:00", end: "12:00", breaks: [] }, ctx());
  assert.equal(res.target, 0);
  assert.equal(res.net, 180);
  assert.equal(res.balance, 180);
});

test("Ferientag: Soll wird gutgeschrieben, Saldo bleibt null", () => {
  const res = E.computeDay({ date: DO, type: "vacation" }, ctx());
  assert.equal(res.target, 504);
  assert.equal(res.credited, 504);
  assert.equal(res.net, 0);
  assert.equal(res.balance, 0);
  assert.equal(res.recorded, true);
});

test("Halber Ferientag plus halbe Arbeit ergibt Saldo null", () => {
  const res = E.computeDay({
    date: DO, type: "vacation", absenceFactor: 0.5,
    start: "08:00", end: "12:12", breaks: []
  }, ctx());
  assert.equal(res.credited, 252);
  assert.equal(res.net, 252);
  assert.equal(res.balance, 0);
});

test("Kompensationstag erzeugt bewusst ein Minus", () => {
  const res = E.computeDay({ date: DO, type: "comp" }, ctx());
  assert.equal(res.target, 504);
  assert.equal(res.credited, 0);
  assert.equal(res.balance, -504, "Zeitausgleich zehrt vom Gleitzeitkonto");
});

test("Unbezahlt frei hat weder Soll noch Saldo", () => {
  const res = E.computeDay({ date: DO, type: "unpaid" }, ctx());
  assert.equal(res.target, 0);
  assert.equal(res.balance, 0);
});

test("Feiertag wird gutgeschrieben; Arbeit an diesem Tag kommt obendrauf", () => {
  const holiday = { id: "test", name: "Testfeiertag", names: { de: "Testfeiertag" } };
  const free = E.computeDay({ date: DO }, ctx({ holiday: holiday, settings: { autoHolidays: true } }));
  assert.equal(free.type, "holiday");
  assert.equal(free.credited, 504);
  assert.equal(free.balance, 0);

  const worked = E.computeDay(
    { date: DO, start: "08:00", end: "12:00", breaks: [] },
    ctx({ holiday: holiday, settings: { autoHolidays: true } })
  );
  assert.equal(worked.credited, 504);
  assert.equal(worked.net, 240);
  assert.equal(worked.balance, 240);
});

test("Abweichende Sollzeit überschreibt das Wochenmodell", () => {
  const res = E.computeDay({ date: DO, targetOverride: 240, start: "08:00", end: "12:00", breaks: [] }, ctx());
  assert.equal(res.target, 240);
  assert.equal(res.balance, 0);
});

test("Beschäftigungsgrad skaliert das Soll", () => {
  const res = E.computeDay({ date: DO }, ctx({ settings: { workloadPercent: 50 } }));
  assert.equal(res.target, 252);
});

test("Ein leerer Tag verändert nichts", () => {
  const res = E.computeDay({ date: DO }, ctx());
  assert.equal(res.recorded, false);
  assert.equal(res.balance, 0);
  assert.equal(res.net, 0);
  assert.equal(res.empty, true);
});

test("Unlesbare Zeiten werden als Fehler gemeldet", () => {
  const res = E.computeDay({ date: DO, start: "99:99", end: "17:00" }, ctx());
  assert.equal(res.hasError, true);
  assert.ok(res.warnings.some((w) => w.code === "invalid-start"));
});

test("Zu kurze Ruhezeit zum Vortag wird erkannt", () => {
  // Vortag bis 23:00 (= 1380), heute ab 06:00 → 7 Stunden Ruhe
  const res = E.computeDay({ date: DO, start: "06:00", end: "15:00", breaks: [] }, ctx({ prevEndTl: 1380 }));
  const w = res.warnings.filter((x) => x.code === "rest-short")[0];
  assert.ok(w, "Warnung erwartet");
  assert.equal(w.minutes, 420);
});

test("Ausreichende Ruhezeit erzeugt keine Warnung", () => {
  const res = E.computeDay({ date: DO, start: "08:00", end: "17:00", breaks: [] }, ctx({ prevEndTl: 1020 }));
  assert.equal(res.warnings.some((w) => w.code === "rest-short"), false);
});

test("Überschrittene Tageshöchstarbeitszeit wird gemeldet", () => {
  const res = E.computeDay({ date: DO, start: "06:00", end: "18:00", breaks: [] }, ctx());
  assert.ok(res.warnings.some((w) => w.code === "over-daily-max"));
});

test("Segmente beschreiben den Tagesverlauf lückenlos", () => {
  const res = E.computeDay({
    date: DO, start: "08:00", end: "17:00",
    breaks: [{ id: "b1", start: "12:00", end: "12:30" }]
  }, ctx());
  assert.equal(res.segments.length, 3);
  assert.deepEqual(res.segments.map((s) => s.kind), ["work", "break", "work"]);
  assert.equal(res.segments[0].start, 480);
  assert.equal(res.segments[2].end, 1020);
  const covered = res.segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  assert.equal(covered, res.presence);
});

test("Rundung wirkt auf das Netto, nicht auf die Anwesenheit", () => {
  const res = E.computeDay(
    { date: DO, start: "08:03", end: "17:00", breaks: [] },
    ctx({ settings: { roundStep: 15, roundMode: "nearest" } })
  );
  assert.equal(res.presence, 537);
  assert.equal(res.netRaw, 507);
  assert.equal(res.net, 510, "507 auf 15 min gerundet");
});

/* ====================================================================== */
/* Zeiträume und Kontostand                                                */
/* ====================================================================== */

test("computeRange summiert eine Woche korrekt", () => {
  const days = {
    "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00", breaks: [{ id: "a", start: "12:00", end: "12:30" }] },
    "2026-08-04": { date: "2026-08-04", start: "08:00", end: "17:00", breaks: [{ id: "b", start: "12:00", end: "12:30" }] },
    "2026-08-05": { date: "2026-08-05", type: "vacation" }
  };
  const range = E.computeRange("2026-08-03", "2026-08-09", (iso) => days[iso], settings());
  assert.equal(range.days.length, 7);
  assert.equal(range.totals.target, 504 * 5);
  assert.equal(range.totals.net, 1020);
  assert.equal(range.totals.credited, 504);
  assert.equal(range.totals.balance, 12, "zweimal +6 Minuten");
  assert.equal(range.totals.recordedDays, 3);
  assert.equal(range.totals.workedDays, 2);
});

test("computeRange weist nicht erfasste Arbeitstage als Lücke aus", () => {
  const range = E.computeRange("2020-01-06", "2020-01-10", () => undefined, settings());
  assert.equal(range.totals.gapDays, 5);
  assert.equal(range.totals.balance, 0, "Lücken ziehen das Konto nicht ins Minus");
});

test("accountBalance zählt Startsaldo und erfasste Tage", () => {
  const days = {
    "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:30", breaks: [{ id: "a", start: "12:00", end: "12:30" }] },
    "2026-08-04": { date: "2026-08-04", start: "08:00", end: "16:30", breaks: [{ id: "b", start: "12:00", end: "12:30" }] }
  };
  // Tag 1: 570 min Anwesenheit, 30 min Mittag → 540 min ARBEITSZEIT = genau 9 h.
  //        Korrigiert: früher galt die Staffel für die Anwesenheit (> 9 h → 60 min,
  //        510 netto, +6). ArG Art. 15 bezieht sich auf die Arbeitszeit; die ist
  //        nicht über 9 h, also genügen 30 min → 540 netto → +36.
  // Tag 2: 510 min Anwesenheit → 30 min Pflichtpause → 480 netto → −24
  const bal = E.accountBalance(days, settings({ carryOverMinutes: 120 }), "2026-08-31");
  assert.equal(bal.minutes, 120 + 36 - 24);
  assert.equal(bal.days, 2);
});

test("Angefangener Tag ohne Gehen-Zeit bewegt das Konto nicht", () => {
  // Bewusst ein fest in der Vergangenheit liegender Mittwoch, damit der Tag
  // nie als „laufend“ interpretiert wird.
  const PAST = "2025-03-12";
  const res = E.computeDay({ date: PAST, start: "08:00", end: "" }, ctx());
  assert.equal(res.incomplete, true);
  assert.equal(res.balance, 0, "eine vergessene Stempelung darf kein Minus erzeugen");
  assert.ok(res.warnings.some((w) => w.code === "missing-end"));

  const bal = E.accountBalance({ [PAST]: { date: PAST, start: "08:00", end: "" } }, settings(), "2025-12-31");
  assert.equal(bal.minutes, 0);
});

test("accountBalance ignoriert Tage vor dem Stichtag", () => {
  const days = {
    "2026-07-01": { date: "2026-07-01", start: "08:00", end: "18:00", breaks: [] },
    "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00", breaks: [{ id: "a", start: "12:00", end: "12:30" }] }
  };
  const bal = E.accountBalance(days, settings({ carryOverFrom: "2026-08-01" }), "2026-08-31");
  assert.equal(bal.days, 1);
  assert.equal(bal.minutes, 6);
});

test("accountBalance respektiert die Kappung", () => {
  const days = { "2026-08-03": { date: "2026-08-03", start: "06:00", end: "20:00", breaks: [] } };
  const bal = E.accountBalance(days, settings({ capPlusMinutes: 60 }), "2026-08-31");
  assert.equal(bal.minutes, 60);
});

test("quotaUsage zählt Ferien, Absenzen und Kompensation", () => {
  const days = {
    "2026-08-03": { date: "2026-08-03", type: "vacation" },
    "2026-08-04": { date: "2026-08-04", type: "vacation", absenceFactor: 0.5 },
    "2026-08-05": { date: "2026-08-05", type: "sick" },
    "2026-08-06": { date: "2026-08-06", type: "comp" }
  };
  const q = E.quotaUsage(days, 2026, settings({ vacationDaysPerYear: 25 }));
  assert.equal(q.vacation, 1.5);
  assert.equal(q.sick, 1);
  assert.equal(q.comp, 1);
  assert.equal(q.vacationLeft, 23.5);
});

/* ---------------------------------------------------------------------- */
/* Nachtschicht über Mitternacht                                           */
/* ---------------------------------------------------------------------- */

test("Eine Nachtschicht läuft nach Mitternacht weiter", () => {
  const s = Object.assign(R.defaultSettings(), { autoHolidays: false });
  const now = new Date(2026, 9, 16, 2, 0);                 // Fr 16.10. 02:00
  const res = E.computeDay({ date: "2026-10-15", start: "22:00", end: "", breaks: [] }, { settings: s, now: now, isToday: false });
  assert.equal(res.running, true, "gestern 22:00 begonnen, jetzt 02:00 → läuft");
  assert.equal(res.overnight, true);
  assert.equal(res.presence, 240, "vier Stunden seit Schichtbeginn");
  assert.ok(!res.warnings.some((w) => w.code === "missing-end"), "keine Fehlermeldung, solange die Schicht läuft");
});

test("Nach 16 Stunden gilt die Schicht als vergessen statt laufend", () => {
  const s = Object.assign(R.defaultSettings(), { autoHolidays: false });
  const now = new Date(2026, 9, 16, 14, 30);               // 16.5 h nach 22:00
  const res = E.computeDay({ date: "2026-10-15", start: "22:00", end: "", breaks: [] }, { settings: s, now: now, isToday: false });
  assert.equal(res.running, false);
  assert.ok(res.warnings.some((w) => w.code === "missing-end"));
  assert.equal(res.balance, 0, "ein unvollständiger Tag bewegt das Konto nicht");
});

test("Eine Tagschicht von gestern wird nach Mitternacht nicht wiederbelebt", () => {
  const s = Object.assign(R.defaultSettings(), { autoHolidays: false });
  const now = new Date(2026, 9, 16, 9, 0);
  const res = E.computeDay({ date: "2026-10-15", start: "08:00", end: "", breaks: [] }, { settings: s, now: now, isToday: false });
  assert.equal(res.running, false, "08:00 gestern + 25 h → kein Lauf");
});

test("activeShiftDate folgt der laufenden Nachtschicht", () => {
  const days = { "2026-10-15": { date: "2026-10-15", start: "22:00", end: "" } };
  const get = (iso) => days[iso] || null;
  assert.equal(E.activeShiftDate(get, new Date(2026, 9, 16, 5, 30)), "2026-10-15", "05:30 → Schicht von gestern");
  assert.equal(E.activeShiftDate(get, new Date(2026, 9, 15, 23, 0)), "2026-10-15", "vor Mitternacht ist es ohnehin heute");
  days["2026-10-15"].end = "06:00";
  assert.equal(E.activeShiftDate(get, new Date(2026, 9, 16, 6, 5)), "2026-10-16", "ausgestempelt → wieder heute");
  days["2026-10-15"].end = "";
  days["2026-10-16"] = { date: "2026-10-16", start: "05:50", end: "" };
  assert.equal(E.activeShiftDate(get, new Date(2026, 9, 16, 6, 5)), "2026-10-16", "heute schon eingestempelt hat Vorrang");
  assert.equal(E.activeShiftDate(() => null, new Date(2026, 9, 16, 6, 5)), "2026-10-16");
});

/* ====================================================================== */
/* Pausenrecht: Staffeln gelten für die Arbeitszeit, nicht die Anwesenheit */
/* ====================================================================== */

test("SECO-Beispiel: 5 h 40 Anwesenheit verlangt nur 10 min Pause", () => {
  // Mit 10 min Pause bleibt die Arbeitszeit bei 5 h 30 — die 15-min-Stufe greift nicht.
  const res = E.computeDay({ date: DO, start: "08:00", end: "13:40", breaks: [] }, ctx());
  assert.equal(res.requiredBreak, 10);
  assert.equal(res.autoDeducted, 10);
  assert.equal(res.net, 330);
});

test("Genau 9 h Arbeit mit 30 min Mittag: keine Stunde Pflichtpause", () => {
  const res = E.computeDay({ date: DO, start: "07:30", end: "17:00", breaks: [{ id: "l", start: "12:00", end: "12:30" }] }, ctx());
  assert.equal(res.presence, 570);
  assert.equal(res.requiredBreak, 30, "540 min Arbeitszeit sind nicht mehr als 9 h");
  assert.equal(res.autoDeducted, 0);
  assert.equal(res.net, 540);
  assert.equal(res.workingTime, 540);
});

test("Zwischen den Stufen wird das Netto auf der Schwelle gehalten", () => {
  // 9 h 50 ohne Pause: 30 min Pause liessen 9 h 20 Arbeit (→ 60 nötig), 50 min lassen
  // genau 9 h (→ 30 genügen). Kleinste konforme Pause: 50.
  const res = E.computeDay({ date: DO, start: "08:00", end: "17:50", breaks: [] }, ctx());
  assert.equal(res.requiredBreak, 50);
  assert.equal(res.net, 540);
});

test("Bezahlte Pause zählt für die Pflichtpause, wird aber nicht abgezogen", () => {
  const res = E.computeDay({
    date: DO, start: "08:00", end: "14:00",
    breaks: [{ id: "p", start: "10:00", end: "10:15", paid: true }]
  }, ctx());
  assert.equal(res.requiredBreak, 15);
  assert.equal(res.legalBreak, 15);
  assert.equal(res.paidBreakTotal, 15);
  assert.equal(res.breakTotal, 0, "breakTotal bleibt der abgezogene, unbezahlte Teil");
  assert.equal(res.autoDeducted, 0, "kein zweiter Abzug für dieselbe Viertelstunde");
  assert.equal(res.net, 360);
});

test("Bezahlte und unbezahlte Pause überschneiden sich: Überschneidung gilt als unbezahlt", () => {
  const res = E.computeDay({
    date: DO, start: "08:00", end: "17:00",
    breaks: [{ id: "a", start: "12:00", end: "12:30" }, { id: "b", start: "12:15", end: "12:45", paid: true }]
  }, ctx());
  assert.equal(res.breakTotal, 30);
  assert.equal(res.paidBreakTotal, 15);
  assert.equal(res.net, 510);
  assert.ok(res.warnings.some((w) => w.code === "break-overlap"));
});

test("Nahtlos aneinanderliegende Pausen sind keine Überlappung", () => {
  const res = E.computeDay({
    date: DO, start: "08:00", end: "17:00",
    breaks: [{ id: "a", start: "12:00", end: "12:30" }, { id: "b", start: "12:30", end: "12:45" }]
  }, ctx());
  assert.equal(res.breakTotal, 45);
  assert.ok(!res.warnings.some((w) => w.code === "break-overlap"));
});

/* ====================================================================== */
/* Laufender Tag: offene und geplante Pausen                               */
/* ====================================================================== */

const HEUTE = "2026-10-16";
const live = (h, m) => ctx({ isToday: true, now: new Date(2026, 9, 16, h, m) });

test("Laufende Pause: kein Fehler, Netto steht still, Gehen-Zeit rückt nach", () => {
  const rec = { date: HEUTE, start: "08:00", end: "", breaks: [{ id: "b1", start: "12:05", end: "" }] };
  const at1235 = E.computeDay(rec, live(12, 35));
  assert.equal(at1235.running, true);
  assert.equal(at1235.provisional, true);
  assert.equal(at1235.hasError, false, "die laufende Pause ist keine unvollständige Zeile");
  assert.deepEqual(
    { start: at1235.openBreak.start, ref: at1235.openBreak.ref, minutes: at1235.openBreak.minutes },
    { start: "12:05", ref: "b1", minutes: 30 }
  );
  assert.equal(at1235.netRaw, 245, "08:00–12:05 gearbeitet, seither Pause");
  assert.equal(at1235.breakTotal, 30);
  assert.equal(at1235.recommendedLeave, "16:54", "die 30 min decken die Pflichtpause");
  assert.equal(at1235.recommendedBreak, 30);

  const at1305 = E.computeDay(rec, live(13, 5));
  assert.equal(at1305.netRaw, 245, "während der Pause wächst das Netto nicht");
  assert.equal(at1305.remaining, at1235.remaining);
  assert.equal(at1305.balance, at1235.balance);
  assert.equal(at1305.recommendedLeave, "17:24", "60 min Pause → Gehen 30 min später");
  assert.equal(at1305.recommendedBreak, 60);
  const seg = at1305.segments.filter((x) => x.kind === "break");
  assert.equal(seg.length, 1);
  assert.equal(seg[0].open, true, "der Zeitstrahl kennt die laufende Pause");
  assert.equal(seg[0].end, 13 * 60 + 5);
});

test("Offene Pausenzeile an einem vergangenen Tag bleibt ein Fehler", () => {
  const res = E.computeDay({ date: DO, start: "08:00", end: "17:00", breaks: [{ id: "b1", start: "12:05", end: "" }] }, ctx());
  assert.equal(res.openBreak, null);
  assert.ok(res.warnings.some((w) => w.code === "invalid-break"));
  assert.equal(res.hasError, true);
});

test("Nur eine Pause kann laufen; eine zweite offene Zeile ist ein Fehler", () => {
  const res = E.computeDay({
    date: HEUTE, start: "08:00", end: "",
    breaks: [{ id: "a", start: "10:00", end: "" }, { id: "b", start: "11:00", end: "" }]
  }, live(11, 30));
  assert.equal(res.openBreak.ref, "a");
  assert.ok(res.warnings.some((w) => w.code === "invalid-break" && w.count === 1));
});

test("Geplante Mittagspause am laufenden Tag: keine Warnung, aber in der Gehen-Zeit", () => {
  const rec = { date: HEUTE, start: "08:00", end: "", breaks: [{ id: "l", start: "12:00", end: "13:00" }] };
  const res = E.computeDay(rec, live(10, 0));
  assert.ok(!res.warnings.some((w) => w.code === "break-outside"), "die Pause liegt nur noch in der Zukunft");
  assert.equal(res.breakTotal, 0, "bis jetzt keine Pause");
  assert.equal(res.netRaw, 120);
  assert.equal(res.recommendedLeave, "17:24", "504 + 60 min geplanter Mittag");
  assert.equal(res.recommendedBreak, 60);
  assert.equal(res.openBreak, null);
});

test("Mitten in einer erfassten Pause zählt nur der vergangene Teil", () => {
  const res = E.computeDay({ date: HEUTE, start: "08:00", end: "", breaks: [{ id: "l", start: "12:00", end: "12:30" }] }, live(12, 10));
  assert.equal(res.breakTotal, 10);
  assert.equal(res.netRaw, 240);
  assert.equal(res.recommendedLeave, "16:54");
});

test("Eine vorgemerkte Pause ohne Ende wird erst ab ihrem Beginn zur laufenden Pause", () => {
  const rec = { date: HEUTE, start: "08:00", end: "", breaks: [{ id: "l", start: "12:00", end: "" }] };
  const before = E.computeDay(rec, live(10, 0));
  assert.equal(before.openBreak, null);
  assert.equal(before.hasError, false, "vorgemerkt ist kein Fehler");
  assert.equal(before.netRaw, 120);
  const after = E.computeDay(rec, live(12, 20));
  assert.equal(after.openBreak.start, "12:00");
  assert.equal(after.netRaw, 240);
});

test("recommendedBreak nennt die Pause in der Gehen-Zeit schon beim Einstempeln", () => {
  const res = E.computeDay({ date: HEUTE, start: "07:42", end: "", breaks: [] }, live(7, 42));
  assert.equal(res.recommendedLeave, "16:36");
  assert.equal(res.recommendedBreak, 30, "„inkl. 30 min Pause“");
  assert.equal(res.provisional, true);
});

test("Ein abgeschlossener Tag ist nicht vorläufig", () => {
  const res = E.computeDay({ date: DO, start: "08:00", end: "17:00", breaks: [] }, ctx());
  assert.equal(res.provisional, false);
  assert.equal(res.openBreak, null);
});

test("Nachtschicht: laufende Pause nach Mitternacht", () => {
  const res = E.computeDay(
    { date: "2026-10-15", start: "22:00", end: "", breaks: [{ id: "n", start: "02:00", end: "" }] },
    ctx({ now: new Date(2026, 9, 16, 3, 0) })
  );
  assert.equal(res.running, true);
  assert.equal(res.openBreak.start, "02:00");
  assert.equal(res.openBreak.minutes, 60);
  assert.equal(res.netRaw, 240);
  assert.equal(res.recommendedLeave, "07:24");
  assert.equal(res.recommendedLeaveDayOffset, 1);
});

/* ====================================================================== */
/* Gutschrift und Stempelzeit                                              */
/* ====================================================================== */

test("Kurstag mit Stempelzeit: Gutschrift füllt nur bis zum Soll auf", () => {
  // Früher: Gutschrift 504 + Netto 510 − Soll 504 = +8 h 30.
  const long = E.computeDay({ date: DO, type: "training", start: "08:00", end: "17:00", breaks: [{ id: "l", start: "12:00", end: "12:30" }] }, ctx());
  assert.equal(long.credited, 0);
  assert.equal(long.balance, 6, "8 h 30 Kurs an einem 8-h-24-Tag");
  assert.ok(!long.warnings.some((w) => w.code === "absence-with-times"), "Stempeln am Kurstag ist normal");

  const short = E.computeDay({ date: DO, type: "training", start: "08:00", end: "12:00", breaks: [] }, ctx());
  assert.equal(short.credited, 264);
  assert.equal(short.balance, 0, "ein kurzer Kurstag zählt als voller Tag");
});

test("Ganztägige Absenz mit Stempelzeit: Warnung statt doppelter Gutschrift", () => {
  const vac = E.computeDay({ date: DO, type: "vacation", start: "08:00", end: "17:00", breaks: [{ id: "l", start: "12:00", end: "12:30" }] }, ctx());
  const w = vac.warnings.filter((x) => x.code === "absence-with-times")[0];
  assert.ok(w, "der Widerspruch wird gemeldet");
  assert.equal(w.type, "vacation");
  assert.equal(w.minutes, 510);
  assert.equal(vac.balance, 6, "nicht +8 h 30");

  const sick = E.computeDay({ date: DO, type: "sick", start: "08:00", end: "11:00", breaks: [] }, ctx());
  assert.equal(sick.balance, 0, "nach drei Stunden krank heim: der Tag ist gedeckt");
  assert.equal(sick.credited, 324);
});

test("Teilabsenz: Stempelzeit kommt auf die anteilige Gutschrift obendrauf", () => {
  const res = E.computeDay({ date: DO, type: "vacation", absenceFactor: 0.5, start: "08:00", end: "13:00", breaks: [] }, ctx());
  assert.equal(res.credited, 252);
  assert.equal(res.balance, 48, "300 gearbeitet, 252 waren nötig");
  assert.ok(!res.warnings.some((w) => w.code === "absence-with-times"));
});

/* ====================================================================== */
/* Zeitraum, Konto, Kontingente                                            */
/* ====================================================================== */

const BAL_DAYS = {
  "2026-10-15": { date: "2026-10-15", start: "08:00", end: "17:30", breaks: [{ id: "l", start: "12:00", end: "12:30" }] },
  "2026-10-16": { date: "2026-10-16", start: "07:42", end: "", breaks: [{ id: "l", start: "12:05", end: "12:40" }] }
};

test("computeRange trennt abgerechneten Saldo und Zwischenstand", () => {
  const now = new Date(2026, 9, 16, 9, 0);
  const range = E.computeRange("2026-10-12", "2026-10-18", (iso) => BAL_DAYS[iso], settings(), now);
  const today = range.days.filter((d) => d.date === "2026-10-16")[0];
  assert.equal(today.running, true);
  assert.equal(range.totals.runningDays, 1);
  assert.equal(range.totals.balance, 36, "nur der abgeschlossene Donnerstag");
  assert.equal(range.totals.provisionalBalance, 36 + today.balance);
  assert.equal(range.totals.undertimeDays, 0, "der laufende Tag ist kein Minustag");
});

test("accountBalance zählt den laufenden Tag erst mit includeRunning", () => {
  const s = settings();
  const at0900 = E.accountBalance(BAL_DAYS, s, undefined, new Date(2026, 9, 16, 9, 0));
  const at1423 = E.accountBalance(BAL_DAYS, s, undefined, new Date(2026, 9, 16, 14, 23));
  assert.equal(at0900.minutes, 36, "das Konto fällt beim Einstempeln nicht um ein Tagessoll");
  assert.equal(at1423.minutes, 36);
  assert.equal(at0900.runningDays, 1);
  assert.equal(at0900.days, 1);

  const live0900 = E.accountBalance(BAL_DAYS, s, undefined, new Date(2026, 9, 16, 9, 0), { includeRunning: true });
  assert.equal(live0900.minutes, 36 + (78 - 504), "07:42–09:00 = 78 min netto");
  assert.equal(at0900.runningMinutes, 78 - 504);
  assert.equal(at0900.provisionalMinutes, live0900.minutes);

  // Positionsparameter wie bisher: ohne now/opts
  assert.equal(typeof E.accountBalance(BAL_DAYS, s, "2026-10-15").minutes, "number");
});

test("accountBalance: eine laufende Nachtschicht von gestern ist ebenfalls offen", () => {
  const days = { "2026-10-15": { date: "2026-10-15", start: "22:00", end: "", breaks: [] } };
  const bal = E.accountBalance(days, settings(), undefined, new Date(2026, 9, 16, 2, 0));
  assert.equal(bal.minutes, 0);
  assert.equal(bal.runningDays, 1);
});

test("Lücken als Minus: Feiertage sind keine Lücken, leere Formulare schon", () => {
  const full = (d) => ({ date: d, start: "08:00", end: "17:00", breaks: [{ id: "x", start: "12:00", end: "12:30" }] });
  const days = {};
  ["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10"]
    .forEach((d) => { days[d] = full(d); });
  const s = Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU", autoHolidays: true, countMissingWorkdays: true });
  const bal = E.accountBalance(days, s, "2026-04-10", new Date(2026, 3, 11, 12, 0));
  assert.equal(bal.gapsCounted, 0, "Karfreitag und Ostermontag sind Feiertage");
  assert.equal(bal.minutes, 8 * 6);

  // Ein leer gespeicherter Tag ist eine Lücke — wie in computeRange.
  days["2026-04-13"] = { date: "2026-04-13", start: "", end: "", breaks: [], note: "" };
  const later = E.accountBalance(days, s, "2026-04-13", new Date(2026, 3, 14, 12, 0));
  assert.equal(later.gapsCounted, 1);
  assert.equal(later.minutes, 48 - 504);

  // Unvollständig (Kommen ohne Gehen) meldet sich als Fehler und wird nicht zusätzlich bestraft.
  days["2026-04-13"] = { date: "2026-04-13", start: "08:00", end: "", breaks: [] };
  const inc = E.accountBalance(days, s, "2026-04-13", new Date(2026, 3, 14, 12, 0));
  assert.equal(inc.gapsCounted, 0);
});

test("quotaUsage trennt bezogene und geplante Ferien", () => {
  const days = {
    "2026-08-03": { date: "2026-08-03", type: "vacation" },
    "2026-10-16": { date: "2026-10-16", type: "vacation", absenceFactor: 0.5 },
    "2026-12-28": { date: "2026-12-28", type: "vacation" },
    "2026-12-29": { date: "2026-12-29", type: "vacation" }
  };
  const q = E.quotaUsage(days, 2026, settings(), new Date(2026, 9, 16, 9, 0));
  assert.equal(q.vacationTaken, 1.5, "heute zählt als bezogen");
  assert.equal(q.vacationPlanned, 2);
  assert.equal(q.vacation, 3.5);
  assert.equal(q.vacationLeft, 25 - 3.5);
});

test("quotaUsage: Ferien auf Feiertagen und Wochenenden kosten nichts", () => {
  const s = Object.assign(R.defaultSettings(), { holidayRegion: "CH-ZH", autoHolidays: true });
  const days = {};
  T.rangeDays("2026-12-21", "2026-12-31").forEach((d) => { days[d] = { date: d, type: "vacation" }; });
  const q = E.quotaUsage(days, 2026, s, new Date(2026, 9, 16));
  // Mo 21. – Do 31.12.: 9 Werktage, davon Weihnachten (Fr 25.12.) Feiertag → 8
  assert.equal(q.vacation, 8);
  assert.equal(q.vacationPlanned, 8);
});

test("quotaUsage zählt Feiertage auf Arbeitstagen auch ohne Eintrag", () => {
  const s = Object.assign(R.defaultSettings(), { holidayRegion: "CH-ZH", autoHolidays: true });
  const q = E.quotaUsage({}, 2026, s, new Date(2026, 9, 16));
  // ZH 2026 auf Werktagen: 1.1., 2.1., 3.4., 6.4., 1.5., 14.5., 25.5., 25.12. (1.8. und 26.12. sind Samstage)
  assert.equal(q.holiday, 8);
  const days = { "2026-04-06": { date: "2026-04-06", start: "08:00", end: "12:00", breaks: [] } };
  assert.equal(E.quotaUsage(days, 2026, s, new Date(2026, 9, 16)).holiday, 8, "Arbeit am Feiertag ändert die Zahl nicht");
});

test("quotaUsage zählt unbezahlte Tage auf Arbeitstagen unter „other“", () => {
  const q = E.quotaUsage({ "2026-08-03": { date: "2026-08-03", type: "unpaid" } }, 2026, settings());
  assert.equal(q.other, 1);
});

/* ---------------------------------------------------------------------- */
/* Gemeinsame Definitionen: Lücken, Erfassungsbeginn, Ø Beginn/Feierabend  */
/* ---------------------------------------------------------------------- */

const NOW_OCT = new Date(2026, 9, 16, 14, 23);     // Fr 16.10.2026
const workRec = (date, start, end) => ({ date, start, end, breaks: [{ id: "m", start: "12:00", end: "12:30" }] });

test("Lücken zählen erst ab dem Erfassungsbeginn", () => {
  const days = { "2026-10-12": workRec("2026-10-12", "08:00", "17:00") };
  const get = (iso) => days[iso];
  const all = E.computeRange("2026-10-01", "2026-10-15", get, settings(), NOW_OCT);
  assert.equal(all.totals.gapDays, 10, "ohne Angabe: jeder leere Arbeitstag");
  const since = E.computeRange("2026-10-01", "2026-10-15", get, settings(), NOW_OCT, { since: "2026-10-12" });
  assert.deepEqual(since.totals.gaps, ["2026-10-13", "2026-10-14", "2026-10-15"]);
  const none = E.computeRange("2026-10-01", "2026-10-15", () => undefined, settings(), NOW_OCT, { since: null });
  assert.equal(none.totals.gapDays, 0, "noch kein eigener Eintrag: keine Lücken");
});

test("Ein Tag ohne Gehen ist offen, keine Lücke", () => {
  const days = {
    "2026-10-13": workRec("2026-10-13", "08:00", "17:00"),
    "2026-10-14": { date: "2026-10-14", start: "07:05", end: "", breaks: [] }
  };
  const r = E.computeRange("2026-10-13", "2026-10-15", (iso) => days[iso], settings(), NOW_OCT, { since: "2026-10-13" });
  assert.equal(r.days[1].incomplete, true);
  assert.deepEqual(r.totals.gaps, ["2026-10-15"]);
  assert.equal(E.isGap(r.days[1], "2026-10-16", "2026-10-01"), false);
  assert.equal(E.isGap(r.days[2], "2026-10-16", "2026-10-01"), true);
  assert.equal(E.isGap(r.days[2], "2026-10-16", "2026-10-16"), false, "vor dem Erfassungsbeginn");
  assert.equal(E.isGap(r.days[2], "2026-10-15", "2026-10-01"), false, "heute ist noch keine Lücke");
});

test("Erfassungsbeginn: erster eigener Eintrag, früherer App-Start, frühestens Kontobeginn", () => {
  const days = {
    "2026-09-01": { date: "2026-09-01", type: "vacation", source: "outlook" },
    "2026-09-14": workRec("2026-09-14", "08:00", "17:00")
  };
  assert.equal(E.trackingStart({}, settings(), null), null);
  assert.equal(E.trackingStart(days, settings(), null), "2026-09-14", "aus Outlook übernommen zählt nicht");
  assert.equal(E.trackingStart(days, settings(), { createdAt: "2026-09-07T06:00:00Z" }), "2026-09-07");
  assert.equal(E.trackingStart(days, settings(), { createdAt: "2026-09-20T06:00:00Z" }), "2026-09-14");
  assert.equal(E.trackingStart(days, settings({ carryOverFrom: "2026-09-21" }), { createdAt: "2026-09-07T06:00:00Z" }), "2026-09-21");
  assert.equal(E.trackingStart(days, settings(), { createdAt: "kaputt" }), "2026-09-14");
});

test("Ø Beginn und Feierabend ohne Nachtschicht — sie wird gezählt, nicht gemittelt", () => {
  const days = {
    "2026-10-05": workRec("2026-10-05", "07:40", "17:00"),
    "2026-10-06": workRec("2026-10-06", "08:10", "17:20"),
    "2026-10-07": { date: "2026-10-07", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30" }] }
  };
  const t = E.computeRange("2026-10-05", "2026-10-07", (iso) => days[iso], settings(), NOW_OCT).totals;
  assert.equal(t.avgStart, 475, "07:55 aus 07:40 und 08:10, nicht 12:37 mit der Nacht");
  assert.equal(t.avgEnd, 1030);
  assert.equal(t.nightShifts, 1);
  assert.equal(t.shiftWork, false);
  assert.equal(t.latestEnd, 30 * 60, "späteste bleibt die echte: 06:00 am Folgetag");
});

test("Wechselnde Schichten ergeben keinen Ø Beginn (statt „18:00“)", () => {
  // Oktober eines Dreischicht-Plans: 2 × Spät, 5 × Nacht, 1 × Früh
  const plan = [["2026-10-01", "14:00", "22:30"], ["2026-10-02", "14:00", "22:30"],
    ["2026-10-05", "22:00", "06:00"], ["2026-10-06", "22:00", "06:00"], ["2026-10-07", "22:00", "06:00"],
    ["2026-10-08", "22:00", "06:00"], ["2026-10-09", "22:00", "06:00"], ["2026-10-12", "06:00", "14:30"]];
  const days = {};
  plan.forEach(([d, a, b]) => { days[d] = { date: d, start: a, end: b, breaks: [] }; });
  const t = E.computeRange("2026-10-01", "2026-10-15", (iso) => days[iso], settings(), NOW_OCT).totals;
  assert.equal(t.shiftWork, true);
  assert.equal(t.avgStart, null);
  assert.equal(t.avgEnd, null);
  // Früh und Spät ohne Nächte streuen ebenso zu stark für einen Mittelwert
  const twoShift = E.clockAverages([
    { net: 480, startTod: 360, endTl: 870, complete: true }, { net: 480, startTod: 840, endTl: 1350, complete: true },
    { net: 480, startTod: 360, endTl: 870, complete: true }, { net: 480, startTod: 840, endTl: 1350, complete: true }
  ]);
  assert.equal(twoShift.shifts, true);
  // Gleitzeit zwischen 07:00 und 09:00 ist dagegen ein ganz normaler Schnitt
  const flex = E.clockAverages([420, 450, 480, 510, 540].map((s) => ({ net: 480, startTod: s, endTl: s + 510, complete: true })));
  assert.equal(flex.shifts, false);
  assert.equal(flex.avgStart, 480);
});
