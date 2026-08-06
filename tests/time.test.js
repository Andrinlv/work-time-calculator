"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../assets/js/core/time.js");

test("parseHHMM liest die üblichen Schreibweisen", () => {
  assert.equal(T.parseHHMM("07:50"), 470);
  assert.equal(T.parseHHMM("7:50"), 470);
  assert.equal(T.parseHHMM("0750"), 470);
  assert.equal(T.parseHHMM("750"), 470);
  assert.equal(T.parseHHMM("7.50"), 470);
  assert.equal(T.parseHHMM("7h50"), 470);
  assert.equal(T.parseHHMM("8"), 480);
  assert.equal(T.parseHHMM("08"), 480);
  assert.equal(T.parseHHMM("00:00"), 0);
  assert.equal(T.parseHHMM("23:59"), 1439);
  assert.equal(T.parseHHMM("24:00"), 1440, "24:00 bedeutet Tagesende");
});

test("parseHHMM weist Unsinn zurück", () => {
  assert.equal(T.parseHHMM(""), null);
  assert.equal(T.parseHHMM(null), null);
  assert.equal(T.parseHHMM("25:00"), null);
  assert.equal(T.parseHHMM("12:60"), null);
  assert.equal(T.parseHHMM("abc"), null);
  assert.equal(T.parseHHMM("123456"), null);
});

test("isStrictHHMM akzeptiert nur das Normalformat", () => {
  assert.equal(T.isStrictHHMM("07:50"), true);
  assert.equal(T.isStrictHHMM("7:50"), false);
  assert.equal(T.isStrictHHMM("24:00"), false);
});

test("formatHHMM bricht am Tagesende korrekt um", () => {
  assert.equal(T.formatHHMM(0), "00:00");
  assert.equal(T.formatHHMM(470), "07:50");
  assert.equal(T.formatHHMM(1440), "00:00");
  assert.equal(T.formatHHMM(1500), "01:00");
  assert.equal(T.formatHHMM(null), "--:--");
});

test("dayOffsetOf zählt Tagesgrenzen", () => {
  assert.equal(T.dayOffsetOf(1439), 0);
  assert.equal(T.dayOffsetOf(1440), 1);
  assert.equal(T.dayOffsetOf(2000), 1);
});

test("formatDuration in allen Stilen", () => {
  assert.equal(T.formatDuration(504), "8 h 24 min");
  assert.equal(T.formatDuration(504, "clock"), "8:24");
  assert.equal(T.formatDuration(504, "decimal"), "8.40 h");
  assert.equal(T.formatDuration(480), "8 h");
  assert.equal(T.formatDuration(45), "45 min");
  assert.equal(T.formatDuration(-90, "clock"), "-1:30");
  assert.equal(T.formatDuration(null), "–");
});

test("formatSigned zeigt immer ein Vorzeichen", () => {
  assert.equal(T.formatSigned(35), "+0:35");
  assert.equal(T.formatSigned(-70), "−1:10");
  assert.equal(T.formatSigned(0), "±0:00");
});

test("parseDuration versteht Uhr-, Dezimal- und Minutenangaben", () => {
  assert.equal(T.parseDuration("8:24"), 504);
  assert.equal(T.parseDuration("8h24"), 504);
  assert.equal(T.parseDuration("8.4"), 504);
  assert.equal(T.parseDuration("8,4"), 504);
  assert.equal(T.parseDuration("504"), 504, "grosse Zahlen sind Minuten");
  assert.equal(T.parseDuration("8"), 480, "kleine Zahlen sind Stunden");
  assert.equal(T.parseDuration("30m"), 30);
  assert.equal(T.parseDuration("2h"), 120);
  assert.equal(T.parseDuration("-1:30"), -90);
  assert.equal(T.parseDuration("quatsch"), null);
  assert.equal(T.parseDuration("8:70"), null, "70 Minuten gibt es nicht");
});

test("intervalMinutes rechnet über Mitternacht", () => {
  const anchor = T.parseHHMM("08:00");
  assert.equal(T.intervalMinutes(T.parseHHMM("12:00"), T.parseHHMM("12:30"), anchor), 30);
  // Nachtschicht: Anker 22:00, Ende 06:00 liegt am Folgetag
  const night = T.parseHHMM("22:00");
  assert.equal(T.intervalMinutes(night, T.parseHHMM("06:00"), night), 480);
  // Pause über Mitternacht innerhalb einer Nachtschicht
  assert.equal(T.intervalMinutes(T.parseHHMM("23:45"), T.parseHHMM("00:15"), night), 30);
});

test("mergeIntervals fasst Überschneidungen zusammen", () => {
  const merged = T.mergeIntervals([
    { start: 100, end: 160 },
    { start: 140, end: 200 },
    { start: 300, end: 330 }
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual([merged[0].start, merged[0].end], [100, 200]);
  assert.equal(T.totalOf(merged), 130, "doppelt erfasste Minuten zählen nur einmal");
});

test("mergeIntervals verwirft leere und verkehrte Bereiche", () => {
  const merged = T.mergeIntervals([
    { start: 100, end: 100 },
    { start: 200, end: 150 },
    { start: 300, end: 330 }
  ]);
  assert.equal(merged.length, 1);
});

test("clipIntervals beschneidet auf ein Fenster", () => {
  const clipped = T.clipIntervals([{ start: 100, end: 200 }], 150, 300);
  assert.deepEqual([clipped[0].start, clipped[0].end], [150, 200]);
  assert.equal(T.clipIntervals([{ start: 10, end: 20 }], 100, 200).length, 0);
});

test("roundMinutes in allen Modi", () => {
  assert.equal(T.roundMinutes(487, 15, "nearest"), 480, "487/15 = 32.47 → 32 Schritte");
  assert.equal(T.roundMinutes(488, 15, "nearest"), 495, "488/15 = 32.53 → 33 Schritte");
  assert.equal(T.roundMinutes(488, 15, "down"), 480);
  assert.equal(T.roundMinutes(481, 15, "up"), 495);
  assert.equal(T.roundMinutes(480, 15, "up"), 480, "exakte Treffer bleiben unverändert");
  assert.equal(T.roundMinutes(487, 0, "nearest"), 487, "Schritt 0 rundet nicht");
  assert.equal(T.roundMinutes(487.4, 1, "nearest"), 487);
});

test("Datumsfunktionen bleiben in der lokalen Zeitzone korrekt", () => {
  assert.equal(T.addDays("2026-08-06", 1), "2026-08-07");
  assert.equal(T.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(T.addDays("2024-02-28", 1), "2024-02-29", "2024 ist ein Schaltjahr");
  assert.equal(T.addDays("2025-02-28", 1), "2025-03-01");
  assert.equal(T.addDays("2026-01-01", -1), "2025-12-31");
});

test("addMonths klemmt auf den letzten gültigen Tag", () => {
  assert.equal(T.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(T.addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(T.addMonths("2026-08-06", 5), "2027-01-06");
});

test("endOfMonth und startOfMonth", () => {
  assert.equal(T.endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(T.endOfMonth("2024-02-10"), "2024-02-29");
  assert.equal(T.startOfMonth("2026-08-06"), "2026-08-01");
});

test("isoWeek folgt ISO-8601", () => {
  assert.equal(T.isoWeek("2026-01-01"), 1);
  assert.equal(T.isoWeek("2026-08-06"), 32);
  assert.equal(T.isoWeek("2021-01-01"), 53, "1.1.2021 gehört zur KW 53 von 2020");
  assert.equal(T.isoWeekYear("2021-01-01"), 2020);
});

test("startOfWeek respektiert den Wochenbeginn", () => {
  assert.equal(T.startOfWeek("2026-08-06", 1), "2026-08-03", "Donnerstag -> Montag");
  assert.equal(T.startOfWeek("2026-08-06", 0), "2026-08-02", "Donnerstag -> Sonntag");
  assert.equal(T.startOfWeek("2026-08-03", 1), "2026-08-03", "Montag bleibt Montag");
});

test("rangeDays liefert einen lückenlosen Bereich", () => {
  const days = T.rangeDays("2026-08-01", "2026-08-05");
  assert.equal(days.length, 5);
  assert.equal(days[0], "2026-08-01");
  assert.equal(days[4], "2026-08-05");
  assert.equal(T.rangeDays("2026-08-05", "2026-08-01").length, 0, "verkehrte Reihenfolge ergibt nichts");
  assert.equal(T.rangeDays("2026-08-01", "2026-08-01").length, 1);
});

test("fromISO weist ungültige Daten zurück", () => {
  assert.equal(T.fromISO("2026-02-30"), null);
  assert.equal(T.fromISO("2026-13-01"), null);
  assert.equal(T.fromISO("nope"), null);
  assert.notEqual(T.fromISO("2024-02-29"), null);
});

test("diffDays zählt Kalendertage", () => {
  assert.equal(T.diffDays("2026-08-01", "2026-08-06"), 5);
  assert.equal(T.diffDays("2026-08-06", "2026-08-01"), -5);
});
