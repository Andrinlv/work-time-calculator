"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const A = require("../assets/js/core/achievements.js");

/* Jeder Werktag im Zeitraum 08:00–17:00 mit 30 min Mittag (+6), ausser `skip`. */
function workdays(from, to, skip) {
  const out = {};
  T.rangeDays(from, to).forEach((d) => {
    const wd = T.weekdayOf(d);
    if (wd === 0 || wd === 6 || (skip || []).includes(d)) return;
    out[d] = { date: d, start: "08:00", end: "17:00", breaks: [{ id: "l", start: "12:00", end: "12:30" }] };
  });
  return out;
}
const LU = () => Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU", autoHolidays: true });
const plain = () => Object.assign(R.defaultSettings(), { autoHolidays: false });

test("Serie: Feiertage ohne Eintrag unterbrechen nicht und zählen nicht", () => {
  // 23.3.–10.4.2026: 15 Werktage, davon Karfreitag und Ostermontag (LU) frei
  const recs = workdays("2026-03-23", "2026-04-10", ["2026-04-03", "2026-04-06"]);
  const st = A.buildStats(recs, LU(), new Date(2026, 3, 10, 18, 0));
  assert.equal(st.currentStreak, 13);
  assert.equal(st.bestStreak, 13);
});

test("Serie: ein fehlender Werktag unterbricht, heute darf noch offen sein", () => {
  const recs = workdays("2026-08-03", "2026-08-14", ["2026-08-11"]);
  delete recs["2026-08-14"];                         // heute (Fr) noch nichts
  const st = A.buildStats(recs, plain(), new Date(2026, 7, 14, 9, 0));
  assert.equal(st.currentStreak, 2, "Mi + Do nach der Lücke am Di");
  assert.equal(st.bestStreak, 6);
});

test("Vollständiger Monat trotz Feiertag ohne Eintrag", () => {
  const recs = workdays("2026-06-01", "2026-06-30", ["2026-06-04"]);   // Fronleichnam LU
  const st = A.buildStats(recs, LU(), new Date(2026, 6, 1, 9, 0));
  assert.equal(st.completeMonths, 1);
});

test("Ein laufender Monat ist noch nicht vollständig", () => {
  const recs = workdays("2026-06-01", "2026-06-15");
  const st = A.buildStats(recs, plain(), new Date(2026, 5, 15, 18, 0));
  assert.equal(st.completeMonths, 0);
});

test("Perfekte Woche verlangt jeden Werktag", () => {
  const missingFriday = workdays("2026-08-03", "2026-08-06");
  assert.equal(A.buildStats(missingFriday, plain(), new Date(2026, 7, 10, 9, 0)).perfectWeeks, 0);

  const full = workdays("2026-08-03", "2026-08-07");
  assert.equal(A.buildStats(full, plain(), new Date(2026, 7, 10, 9, 0)).perfectWeeks, 1);
  // Freitagabend, Woche erledigt: zählt schon vor dem Wochenende
  assert.equal(A.buildStats(full, plain(), new Date(2026, 7, 7, 18, 0)).perfectWeeks, 1);
});

test("Osterwoche mit Feiertag kann perfekt sein", () => {
  // 30.3.–3.4.2026: Karfreitag ist in LU frei, die vier anderen Tage erfasst
  const recs = workdays("2026-03-30", "2026-04-02");
  assert.equal(A.buildStats(recs, LU(), new Date(2026, 3, 6, 9, 0)).perfectWeeks, 1);
});

test("Geplante Ferien zählen noch nicht als erfasste Tage", () => {
  const recs = { "2026-12-28": { date: "2026-12-28", type: "vacation" }, "2026-12-29": { date: "2026-12-29", type: "vacation" } };
  const st = A.buildStats(recs, plain(), new Date(2026, 9, 16, 9, 0));
  assert.equal(st.recordedDays, 0);
  assert.equal(st.vacationDays, 0);
});

test("Pausendisziplin zählt bezahlte Pausen mit", () => {
  const recs = { "2026-08-06": { date: "2026-08-06", start: "08:00", end: "14:00", breaks: [{ id: "p", start: "10:00", end: "10:15", paid: true }] } };
  const st = A.buildStats(recs, plain(), new Date(2026, 7, 10, 9, 0));
  assert.equal(st.breakCompliant, 1);
});
