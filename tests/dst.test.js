"use strict";
/* Zeitumstellung: Diese Datei läuft in eigener Prozessumgebung (node --test
   startet je Datei einen Prozess) und stellt die Zeitzone deshalb fest auf
   Zürich — unabhängig davon, wo die Tests laufen. */
process.env.TZ = "Europe/Zurich";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");

const ctx = (patch) => Object.assign({
  settings: Object.assign(R.defaultSettings(), { autoHolidays: false }),
  holiday: null,
  isToday: false
}, patch || {});

test("Zeitzone ist Zürich", () => {
  assert.equal(new Date(2026, 6, 1).getTimezoneOffset(), -120, "Sommerzeit");
  assert.equal(new Date(2026, 0, 1).getTimezoneOffset(), -60, "Winterzeit");
});

test("dstAxis rechnet Wanduhr in echte Minuten um", () => {
  const spring = T.dstAxis("2026-03-28");
  assert.ok(spring);
  assert.equal(spring.toReal(22 * 60), 22 * 60, "vor der Umstellung identisch");
  assert.equal(spring.toReal(T.DAY + 6 * 60), T.DAY + 5 * 60, "29.3. 06:00 liegt 29 echte Stunden nach Mitternacht");
  assert.equal(spring.toWall(T.DAY + 5 * 60), T.DAY + 6 * 60);
  const autumn = T.dstAxis("2026-10-24");
  assert.equal(autumn.toReal(T.DAY + 6 * 60), T.DAY + 7 * 60);
  assert.equal(autumn.toWall(T.DAY + 7 * 60), T.DAY + 6 * 60);
  assert.equal(T.dstAxis("2026-07-15"), null);
});

test("Nachtschicht in der Frühlingsnacht dauert eine Stunde weniger", () => {
  const res = E.computeDay({ date: "2026-03-28", start: "22:00", end: "06:00", breaks: [] }, ctx());
  assert.equal(res.presence, 420);
  assert.equal(res.endTl, T.DAY + 6 * 60, "Zeitstrahl bleibt Wanduhr");
  assert.equal(res.net, 405, "7 h anwesend → 15 min genügen (Arbeitszeit 6 h 45)");
});

test("Nachtschicht in der Herbstnacht dauert eine Stunde länger", () => {
  const res = E.computeDay({
    date: "2026-10-24", start: "22:00", end: "06:00",
    breaks: [{ id: "n", start: "01:00", end: "01:30" }]
  }, ctx());
  assert.equal(res.presence, 540);
  assert.equal(res.breakTotal, 30, "Pause vor der Umstellung bleibt 30 min");
  assert.equal(res.net, 510);
  const seg = res.segments;
  assert.equal(seg[0].start, 22 * 60);
  assert.equal(seg[seg.length - 1].end, T.DAY + 6 * 60, "Segmente enden auf der Wanduhr");
});

test("Pause über die Umstellung zählt die echte Dauer", () => {
  // 01:30–03:30 Wanduhr am 29.3. sind nur 60 echte Minuten.
  const res = E.computeDay({
    date: "2026-03-28", start: "22:00", end: "06:00",
    breaks: [{ id: "n", start: "01:30", end: "03:30" }]
  }, ctx());
  assert.equal(res.breakTotal, 60);
  assert.equal(res.net, 360);
});

test("Gehen-Zeit in der Umstellungsnacht folgt der echten Arbeitszeit", () => {
  // 28.3. und 24.10.2026 sind Samstage: Soll über targetOverride setzen.
  const night = (date, end) => ({ date: date, start: "22:00", end: end, breaks: [], targetOverride: 504 });
  const spring = E.computeDay(night("2026-03-28", ""), ctx());
  // 504 + 30 echte Minuten ab 22:00 = 06:54 — die Uhr springt um 02:00 vor, also 07:54
  assert.equal(spring.recommendedLeave, "07:54");
  const check = E.computeDay(night("2026-03-28", spring.recommendedLeave), ctx());
  assert.equal(check.net, 504);
  assert.equal(check.balance, 0);

  const autumn = E.computeDay(night("2026-10-24", ""), ctx());
  assert.equal(autumn.recommendedLeave, "05:54", "die Uhr springt um 03:00 zurück");
  const check2 = E.computeDay(night("2026-10-24", autumn.recommendedLeave), ctx());
  assert.equal(check2.balance, 0);
});

test("Tagschicht am Umstellungstag bleibt unberührt", () => {
  const res = E.computeDay({
    date: "2026-03-29", start: "08:00", end: "17:00",
    breaks: [{ id: "l", start: "12:00", end: "12:30" }]
  }, ctx());
  assert.equal(res.presence, 540);
  assert.equal(res.net, 510);
});

test("Laufende Nachtschicht über die Umstellung zählt echte Minuten", () => {
  const res = E.computeDay(
    { date: "2026-10-24", start: "22:00", end: "", breaks: [] },
    ctx({ now: new Date(2026, 9, 25, 4, 0) })
  );
  assert.equal(res.running, true);
  assert.equal(res.presence, 7 * 60, "22:00 bis 04:00 Wanduhr sind sieben echte Stunden");
});
