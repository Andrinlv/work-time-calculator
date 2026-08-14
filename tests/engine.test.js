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
  // Tag 1: 570 min Anwesenheit → über 9 h, also 60 min Pflichtpause → 510 netto → +6
  // Tag 2: 510 min Anwesenheit → 30 min Pflichtpause → 480 netto → −24
  const bal = E.accountBalance(days, settings({ carryOverMinutes: 120 }), "2026-08-31");
  assert.equal(bal.minutes, 120 + 6 - 24);
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
