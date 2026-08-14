"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const X = require("../assets/js/data/exporters.js");

const LABELS = { work: "Arbeit", vacation: "Ferien", holiday: "Feiertag", free: "Arbeitsfrei" };

function buildRange(days) {
  return E.computeRange(
    Object.keys(days).sort()[0],
    Object.keys(days).sort().pop(),
    (iso) => days[iso],
    Object.assign(R.defaultSettings(), { autoHolidays: false })
  );
}

const SAMPLE = {
  "2026-08-03": {
    date: "2026-08-03", start: "08:00", end: "17:00",
    breaks: [{ id: "a", start: "12:00", end: "12:30" }],
    note: "Ganz normaler Montag"
  },
  "2026-08-04": { date: "2026-08-04", type: "vacation" }
};

test("CSV enthält Kopfzeile, BOM und alle Tage", () => {
  const range = buildRange(SAMPLE);
  const csv = X.toCSV(range.days, { labels: LABELS });

  assert.ok(csv.charCodeAt(0) === 0xfeff, "BOM für Excel");
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  assert.ok(lines[0].startsWith("Datum;Wochentag;KW"));
  assert.ok(lines.some((l) => l.startsWith("2026-08-03")));
  assert.ok(lines.some((l) => l.indexOf("Ferien") >= 0));

  const monday = lines.filter((l) => l.startsWith("2026-08-03"))[0].split(";");
  assert.equal(monday[1], "Mo");
  assert.equal(monday[5], "08:00");
  assert.equal(monday[6], "17:00");
});

test("CSV maskiert Trennzeichen und Anführungszeichen in Notizen", () => {
  const days = {
    "2026-08-03": {
      date: "2026-08-03", start: "08:00", end: "17:00", breaks: [],
      note: 'Kunde "Meier"; Rückruf nötig'
    }
  };
  const csv = X.toCSV(buildRange(days).days, { labels: LABELS });
  assert.ok(csv.indexOf('"Kunde ""Meier""; Rückruf nötig"') >= 0, "Zelle muss vollständig maskiert sein");
  const line = csv.replace(/^﻿/, "").split("\r\n")[1];
  assert.equal(splitRespectingQuotes(line, ";").length, 20, "Spaltenzahl darf sich nicht verschieben");
});

test("CSV kann mit Komma und ohne BOM erzeugt werden", () => {
  const csv = X.toCSV(buildRange(SAMPLE).days, { labels: LABELS, delimiter: ",", bom: false, decimalComma: false });
  assert.notEqual(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.split("\r\n")[0].indexOf(",") > 0);
  assert.ok(/8\.50|8\.\d\d/.test(csv), "Dezimalpunkt statt Komma");
});

test("ICS ist ein gültiger Kalender", () => {
  const ics = X.toICS(buildRange(SAMPLE).days, { labels: LABELS, calendarName: "Test" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(ics.trim().endsWith("END:VCALENDAR"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, "ein Arbeitstag + ein Ferientag");
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  assert.ok(ics.indexOf("DTSTART:20260803T080000") >= 0);
  assert.ok(ics.indexOf("DTEND:20260803T170000") >= 0);
  assert.ok(ics.indexOf("DTSTART;VALUE=DATE:20260804") >= 0, "Ferien als Ganztagestermin");
  assert.ok(ics.indexOf("\r\n") > 0, "CRLF nach RFC 5545");
});

test("ICS maskiert Sonderzeichen", () => {
  const days = {
    "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00", breaks: [], note: "A; B, C\nD" }
  };
  const ics = X.toICS(buildRange(days).days, { labels: LABELS });
  // Vor dem Prüfen die RFC-5545-Faltung wieder auflösen
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.indexOf("A\\; B\\, C\\nD") >= 0);
});

test("ICS faltet zu lange Zeilen", () => {
  const days = {
    "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00", breaks: [], note: "x".repeat(300) }
  };
  const ics = X.toICS(buildRange(days).days, { labels: LABELS });
  ics.split("\r\n").forEach((line) => {
    assert.ok(line.length <= 75, "Zeile zu lang: " + line.length);
  });
});

test("Textzusammenfassung enthält die Summen", () => {
  const range = buildRange(SAMPLE);
  const txt = X.toText(range, { labels: LABELS });
  assert.ok(txt.indexOf("ZEITKONTO") >= 0);
  assert.ok(txt.indexOf("2026-08-03") >= 0);
  assert.ok(txt.indexOf("Saldo") >= 0);
  assert.ok(txt.indexOf("[Ferien]") >= 0);
});

test("CSV-Import erkennt Trennzeichen und Spalten automatisch", () => {
  const csv = [
    "Datum;Kommen;Gehen;Pause;Notiz",
    "03.08.2026;08:00;17:00;30;Montag",
    "2026-08-04;0730;1615;45;",
    "kaputt;;;;"
  ].join("\n");
  const result = X.parseCSV(csv);
  assert.equal(result.error, undefined);
  assert.equal(result.delimiter, ";");
  assert.equal(result.rows.length, 2, "die kaputte Zeile wird übersprungen");
  assert.equal(result.rows[0].date, "2026-08-03");
  assert.equal(result.rows[0].start, "08:00");
  assert.equal(result.rows[0].breakMinutes, 30);
  assert.equal(result.rows[0].note, "Montag");
  assert.equal(result.rows[1].date, "2026-08-04");
  assert.equal(result.rows[1].start, "07:30", "0730 wird zu 07:30");
  assert.equal(result.rows[1].end, "16:15");
});

test("CSV-Import kommt auch mit Komma-Dateien zurecht", () => {
  const result = X.parseCSV("Date,Clock-in,Clock-out\n2026-08-03,08:00,17:00");
  assert.equal(result.delimiter, ",");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].end, "17:00");
});

test("CSV-Import meldet fehlende Datumsspalte", () => {
  const result = X.parseCSV("Von;Bis\n08:00;17:00");
  assert.ok(result.error);
  assert.equal(result.rows.length, 0);
});

test("normalizeDate versteht die gängigen Schreibweisen", () => {
  assert.equal(X.normalizeDate("2026-08-06"), "2026-08-06");
  assert.equal(X.normalizeDate("06.08.2026"), "2026-08-06");
  assert.equal(X.normalizeDate("6/8/26"), "2026-08-06");
  assert.equal(X.normalizeDate("31.02.2026"), null, "den 31. Februar gibt es nicht");
  assert.equal(X.normalizeDate("irgendwas"), null);
});

/* Hilfsfunktion: CSV-Zeile unter Beachtung von Anführungszeichen zerlegen */
function splitRespectingQuotes(line, delim) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
