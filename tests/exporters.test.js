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
  assert.equal(splitRespectingQuotes(line, ";").length, X.CSV_COLUMNS.length, "Spaltenzahl darf sich nicht verschieben");
  assert.equal(X.CSV_COLUMNS.length, 22, "neue Spalten nur hinten anfügen");
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

/* ---------------------------------------------------------------------- */
/* CSV: die eigene Datei kommt verlustfrei zurück                          */
/* ---------------------------------------------------------------------- */

const T = require("../assets/js/core/time.js");
const I = require("../assets/js/ui/i18n.js");
const S = require("../assets/js/data/store.js");

const TYPE_KEYS = Object.keys(R.DAY_TYPES);
function labelsIn(lang, prefix, keys) {
  const out = {};
  keys.forEach((k) => { out[k] = I.DICT[lang][prefix + k]; });
  return out;
}
const ALL_TYPE_LABELS = I.LANGS.map((l) => labelsIn(l, "type.", TYPE_KEYS));
const ALL_LOC_LABELS = I.LANGS.map((l) => labelsIn(l, "loc.", R.LOCATIONS));

function importCSV(csv, existing, settings) {
  const s = settings || Object.assign(R.defaultSettings(), { autoHolidays: true, holidayRegion: "CH-LU" });
  const parsed = X.parseCSV(csv);
  assert.equal(parsed.error, undefined, parsed.error);
  return X.csvRowsToDays(parsed, {
    getDay: (iso) => (existing && existing[iso]) || null,
    autoType: (iso) => E.computeDay({ date: iso }, { settings: s }).type,
    typeLabels: ALL_TYPE_LABELS,
    locationLabels: ALL_LOC_LABELS,
    breakLabel: "Mittag"
  });
}

const ROUND = {
  "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00", location: "home",
    breaks: [{ id: "a", start: "12:11", end: "12:46" }, { id: "b", start: "15:00", end: "15:10", paid: true }],
    note: "Zeile 1\nZeile 2; mit \"Zitat\", Komma" },
  "2026-08-04": { date: "2026-08-04", start: "08:00", end: "12:00", breaks: [{ id: "c", start: "10:00", end: "10:15" }], note: "=HYPERLINK(\"http://x\",\"klick\")" },
  "2026-08-05": { date: "2026-08-05", type: "vacation", absenceFactor: 1 },
  "2026-08-06": { date: "2026-08-06", type: "sick", absenceFactor: 0.5, start: "13:00", end: "17:30", breaks: [] },
  "2026-08-07": { date: "2026-08-07", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30" }], note: "'=schon mit Apostroph" },
  "2026-08-10": { date: "2026-08-10", type: "training", absenceFactor: 1, note: "-Kurs" },
  "2026-08-11": { date: "2026-08-11", type: "free", note: "" }
};

function rangeWith(days, settings) {
  return E.computeRange("2026-07-31", "2026-08-12", (iso) => days[iso], settings);
}

test("Die eigene CSV lässt sich verlustfrei wieder einlesen", () => {
  const settings = Object.assign(R.defaultSettings(), { autoHolidays: true, holidayRegion: "CH-LU" });
  const before = rangeWith(ROUND, settings);
  const csv = X.toCSV(before.days, { labels: I.typeLabels(), getRecord: (iso) => ROUND[iso] || null });
  const res = importCSV(csv, null, settings);
  const restored = {};
  Object.keys(res.days).forEach((iso) => { restored[iso] = Object.assign({ date: iso }, res.days[iso]); });

  assert.deepEqual(Object.keys(restored).sort(), Object.keys(ROUND).sort(), "genau die erfassten Tage, keine leeren Wochenenden");
  const after = rangeWith(restored, settings);
  assert.equal(after.totals.balance, before.totals.balance, "der Saldo bleibt derselbe");
  before.days.forEach((d, i) => {
    const a = after.days[i];
    assert.equal(a.type, d.type, d.date + " Tagesart");
    assert.equal(a.absenceFactor, d.absenceFactor, d.date + " Anteil");
    assert.equal(a.net, d.net, d.date + " Netto");
    assert.equal(a.location, d.location, d.date + " Ort");
    assert.equal(a.note, d.note, d.date + " Notiz");
  });
  assert.equal(restored["2026-08-01"], undefined, "1. August (Feiertag, automatisch) legt keinen Eintrag an");
  assert.deepEqual(restored["2026-08-03"].breaks.map((b) => b.start + "-" + b.end + (b.paid ? "*" : "")), ["12:11-12:46", "15:00-15:10*"]);
  assert.equal(restored["2026-08-11"].type, "free", "ausdrücklich arbeitsfreier Werktag bleibt arbeitsfrei");
});

test("CSV aus einer anderen Sprache wird ebenso erkannt", () => {
  const range = rangeWith(ROUND, R.defaultSettings());
  const fr = labelsIn("fr", "type.", TYPE_KEYS);
  const csv = X.toCSV(range.days, { labels: fr, locationLabels: labelsIn("fr", "loc.", R.LOCATIONS), getRecord: (iso) => ROUND[iso] || null });
  const res = importCSV(csv);
  assert.equal(res.days["2026-08-05"].type, "vacation", "« Vacances » → Ferien");
  assert.equal(res.days["2026-08-03"].location, "home", "« Télétravail » → Homeoffice");
  assert.equal(res.unknownTypes, 0);
});

test("CSV-Export schützt vor Formeln, das Einlesen stellt den Text wieder her", () => {
  const range = rangeWith(ROUND, R.defaultSettings());
  const csv = X.toCSV(range.days, {});
  const line = csv.split("\r\n").filter((l) => l.startsWith("2026-08-04"))[0];
  assert.ok(line.indexOf(";\"'=HYPERLINK(") >= 0, "Formel mit Apostroph entschärft: " + line);
  assert.ok(!/;"?=HYPERLINK/.test(line));
  assert.ok(line.indexOf(";-") < 0 || /;-\d/.test(line), "nur Text wird maskiert, keine Zahlen");
  const rows = X.parseCSV(csv).rows;
  const byDate = {};
  rows.forEach((r) => { byDate[r.date] = r; });
  assert.equal(byDate["2026-08-04"].note, "=HYPERLINK(\"http://x\",\"klick\")");
  assert.equal(byDate["2026-08-07"].note, "'=schon mit Apostroph");
  assert.equal(byDate["2026-08-10"].note, "-Kurs");
});

test("Mehrzeilige Notizen mit Trennzeichen und Anführungszeichen überstehen das Einlesen", () => {
  const rows = X.parseCSV("Datum;Kommen;Notiz\r\n03.08.2026;08:00;\"Zeile 1\nZeile 2; mit \"\"Zitat\"\"\"\r\n04.08.2026;07:30;ok").rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].note, "Zeile 1\nZeile 2; mit \"Zitat\"");
  assert.equal(rows[1].start, "07:30");
});

test("Spaltenerkennung arbeitet mit ganzen Wörtern, nicht mit Wortteilen", () => {
  const en = X.parseCSV("Date,Start,End,Break\n2026-08-03,08:00,17:00,30\n");
  assert.equal(en.columns.type, -1, "„Start“ ist keine Tagesart-Spalte");
  assert.equal(en.columns.start, 1);
  assert.equal(en.rows[0].breakMinutes, 30);

  const de = X.parseCSV("Wochentag;Datum;Kommen;Gehen\nMo;03.08.2026;08:00;17:00\n");
  assert.equal(de.columns.date, 1, "„Datum“ statt „Wochentag“");
  assert.equal(de.rows.length, 1);

  const fr = X.parseCSV("Jour;Date;Arrivée;Départ;Pause;Remarque\nlu;03.08.2026;08:00;17:00;45;ok\n");
  assert.equal(fr.columns.date, 1);
  assert.equal(fr.rows[0].start, "08:00");
  assert.equal(fr.rows[0].end, "17:00");
  assert.equal(fr.rows[0].note, "ok");

  const own = X.parseCSV(X.toCSV(rangeWith(ROUND, R.defaultSettings()).days, {}));
  assert.equal(own.columns.brk, 8, "„Pausen (min)“, nicht „Pflichtpause (min)“");
  assert.equal(own.columns.breakTimes, 21);
  assert.equal(own.columns.type, 3);
  assert.equal(own.columns.factor, 20);
});

test("Pausendauern in allen gängigen Schreibweisen", () => {
  assert.equal(X.parseBreakMinutes("1:00"), 60);
  assert.equal(X.parseBreakMinutes("0,5 h"), 30);
  assert.equal(X.parseBreakMinutes("0.75"), 45);
  assert.equal(X.parseBreakMinutes("45"), 45);
  assert.equal(X.parseBreakMinutes("15"), 15, "kleine Zahlen sind Minuten, nicht Stunden");
  assert.equal(X.parseBreakMinutes("45 min"), 45);
  assert.equal(X.parseBreakMinutes("1", "h"), 60, "Spalte in Stunden");
  assert.equal(X.parseBreakMinutes("abc"), null);
  const rows = X.parseCSV("Datum;Kommen;Gehen;Pause (h)\n03.08.2026;08:00;17:00;1\n").rows;
  assert.equal(rows[0].breakMinutes, 60);
});

test("Eine Pause aus der Dauer liegt mitten im Tag, nie ausserhalb", () => {
  const res = importCSV("Datum;Kommen;Gehen;Pause\n03.08.2026;08:00;12:00;15\n");
  const b = res.days["2026-08-03"].breaks[0];
  assert.equal(b.start, "09:53");
  assert.equal(b.end, "10:08");
  const day = E.computeDay(Object.assign({ date: "2026-08-03" }, res.days["2026-08-03"]), { settings: R.defaultSettings(), holiday: null, isToday: false });
  assert.equal(day.breakTotal, 15, "die Pause wird abgezogen");
});

test("Passt die gewohnte Mittagspause in den Tag, liegt die Pause dort", () => {
  const parsed = X.parseCSV("Datum;Kommen;Gehen;Pause\n03.08.2026;08:00;17:00;30\n04.08.2026;13:00;17:00;15\n");
  const res = X.csvRowsToDays(parsed, { lunch: { start: "12:00", end: "12:30" } });
  assert.equal(res.days["2026-08-03"].breaks[0].start, "12:00");
  assert.equal(res.days["2026-08-03"].breaks[0].end, "12:30");
  assert.equal(res.days["2026-08-04"].breaks[0].start, "14:53", "Nachmittag: Mittagspause liegt ausserhalb, also mittig");
});

test("Fremde CSV ändert nur die Spalten, die sie hat", () => {
  const existing = { "2026-08-03": { date: "2026-08-03", start: "07:00", end: "16:00", note: "meins", location: "home",
    breaks: [{ id: "x", start: "11:50", end: "12:20" }] } };
  const res = importCSV("Datum;Kommen;Gehen;Pause\n03.08.2026;07:00;16:30;30\n", existing);
  const p = res.days["2026-08-03"];
  assert.equal(p.end, "16:30");
  assert.equal(p.note, undefined, "keine Notiz-Spalte, Notiz bleibt");
  assert.equal(p.location, undefined);
  assert.equal(p.breaks, undefined, "gleich lange echte Pause bleibt erhalten");
  const same = importCSV("Datum;Kommen;Gehen\n03.08.2026;07:00;16:00\n", existing);
  assert.equal(same.skipped, 1, "unveränderte Zeile wird übersprungen");
  assert.deepEqual(same.days, {});
});

test("Leere Zeilen löschen keine erfassten Tage", () => {
  const existing = { "2026-08-08": { date: "2026-08-08", start: "09:00", end: "12:00" } };
  const res = importCSV("Datum;Art;Kommen;Gehen\n08.08.2026;Arbeitsfrei;;\n", existing);
  assert.deepEqual(res.days, {});
});

/* ---------------------------------------------------------------------- */
/* ICS                                                                      */
/* ---------------------------------------------------------------------- */

test("ICS faltet nach UTF-8-Oktetten und zerteilt keine Emoji", () => {
  const days = { "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00", breaks: [], note: "x".repeat(40) + "😀".repeat(30) + "äöü".repeat(20) } };
  const ics = X.toICS(buildRange(days).days, { labels: LABELS });
  ics.split("\r\n").forEach((line) => {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, "Zeile hat " + Buffer.byteLength(line, "utf8") + " Oktette");
    assert.ok(!/[\uD800-\uDBFF]$/.test(line) && !/^ ?[\uDC00-\uDFFF]/.test(line), "Emoji zerteilt");
  });
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.indexOf("😀".repeat(30)) >= 0, "nach dem Entfalten ist der Text vollständig");
});

test("ICS-UID hängt nur am Datum, nicht am Exportzeitraum", () => {
  const days = { "2026-08-03": { date: "2026-08-03", start: "08:00", end: "17:00", breaks: [] } };
  const settings = Object.assign(R.defaultSettings(), { autoHolidays: false });
  const a = X.toICS(E.computeRange("2026-08-03", "2026-08-03", (iso) => days[iso], settings).days).match(/UID:(.*)/)[1];
  const b = X.toICS(E.computeRange("2026-07-01", "2026-08-31", (iso) => days[iso], settings).days).match(/UID:(.*)/)[1];
  assert.equal(a, b);
  assert.equal(a, "zk-2026-08-03@zeitkonto");
});

test("ICS-Zeiten bleiben an Tagen der Zeitumstellung korrekt", () => {
  const days = {
    "2026-03-28": { date: "2026-03-28", start: "22:00", end: "06:00", breaks: [] },
    "2026-03-29": { date: "2026-03-29", start: "08:00", end: "12:00", breaks: [] }
  };
  const settings = Object.assign(R.defaultSettings(), { autoHolidays: false });
  const ics = X.toICS(E.computeRange("2026-03-28", "2026-03-29", (iso) => days[iso], settings).days);
  assert.ok(ics.indexOf("DTSTART:20260329T080000") >= 0);
  assert.ok(ics.indexOf("DTEND:20260329T060000") >= 0, "Nachtschicht endet am Folgetag um 06:00");
});

test("Auch ohne Rohdaten (nur Berechnungsergebnis) bleibt der Saldo beim Wiedereinlesen gleich", () => {
  const settings = Object.assign(R.defaultSettings(), { autoHolidays: true, holidayRegion: "CH-LU" });
  const before = rangeWith(ROUND, settings);
  const res = importCSV(X.toCSV(before.days, { labels: I.typeLabels() }), null, settings);
  const restored = {};
  Object.keys(res.days).forEach((iso) => { restored[iso] = Object.assign({ date: iso }, res.days[iso]); });
  assert.equal(rangeWith(restored, settings).totals.balance, before.totals.balance);
});

test("CSV schützt auch Kommen, Gehen und Pausenzeiten aus einer Sicherung vor Formeln", () => {
  // Solche Werte übersteht store.cleanDay beim Einlesen einer JSON-Sicherung (beliebiger Text)
  const days = {
    "2026-08-03": { date: "2026-08-03", start: "=HYPERLINK(\"http://x\")", end: "-2+3", breaks: [{ id: "a", start: "+1", end: "@SUM(1)" }] },
    "2026-08-04": { date: "2026-08-04", start: "08:00", end: "17:00", breaks: [{ id: "b", start: "12:00", end: "12:30" }] }
  };
  const csv = X.toCSV(buildRange(days).days, { getRecord: (iso) => days[iso] || null });
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  const bad = splitRespectingQuotes(lines.filter((l) => l.startsWith("2026-08-03"))[0], ";");
  const col = (id) => X.CSV_COLUMNS.findIndex((c) => c[0] === id);
  [col("start"), col("end"), col("breakTimes")].forEach((i) => {
    const cell = bad[i].replace(/^"|"$/g, "");
    assert.ok(cell === "" || cell.charAt(0) === "'", "Zelle beginnt nicht mit einer Formel: " + bad[i]);
  });
  assert.equal(bad[col("end")], "'-2+3");
  // Gewöhnliche Zeiten bleiben unverändert — und kommen beim Einlesen genau so zurück
  const ok = splitRespectingQuotes(lines.filter((l) => l.startsWith("2026-08-04"))[0], ";");
  assert.equal(ok[col("start")], "08:00");
  assert.equal(ok[col("breakTimes")], "12:00-12:30");
  const rows = X.parseCSV(csv).rows;
  const back = rows.filter((r) => r.date === "2026-08-04")[0];
  assert.equal(back.start, "08:00");
  assert.deepEqual(back.breakTimes, [{ start: "12:00", end: "12:30", paid: false }]);
  // Der Import entfernt den Schutz-Apostroph: dasselbe Ergebnis wie ohne ihn
  const raw = X.parseCSV("Datum;Kommen;Gehen\r\n2026-08-03;-2+3;-2+3").rows[0];
  const escaped = rows.filter((r) => r.date === "2026-08-03")[0];
  assert.equal(escaped.end, raw.end);
  const quoted = X.parseCSV("Datum;Kommen;Gehen;Pausenzeiten (* bezahlt)\r\n2026-08-05;'=07:30;'+16:30;'-12:00-12:30*").rows[0];
  assert.deepEqual(quoted.breakTimes, [{ start: "12:00", end: "12:30", paid: true }]);
});

test("Textzusammenfassung und Kalender übernehmen übersetzte Texte, ohne Texte bleibt Deutsch", () => {
  const range = buildRange(SAMPLE);
  const text = { title: "ZEITKONTO · {from} to {to}", net: "Net", target: "Target", actual: "Actual", balance: "Balance",
    breaks: "Breaks", days: "Days", daysLine: "{recorded} recorded · {worked} worked", netOf: "{v} net" };
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const txt = X.toText(range, { labels: { work: "Work", vacation: "Vacation" }, weekdays, text, formatDate: (iso) => iso.split("-").reverse().join("/") });
  assert.ok(txt.startsWith("ZEITKONTO · 03/08/2026 to 04/08/2026"), txt);
  assert.ok(txt.indexOf("Mon") >= 0 && txt.indexOf("[Vacation]") >= 0);
  assert.ok(/^Balance\s+\+0:06$/m.test(txt), txt);
  assert.ok(/^Days\s+2 recorded · 1 worked$/m.test(txt), txt);
  const ics = X.toICS(range.days, { labels: { work: "Work" }, text }).replace(/\r\n /g, "");
  assert.ok(ics.indexOf("SUMMARY:Work · 8:30 net") >= 0, ics);
  assert.ok(ics.indexOf("DESCRIPTION:Net 8:30 · Target 8:24 · Balance +0:06 · Breaks 30 min") >= 0, ics);
  // Ohne übersetzte Texte wie bisher Deutsch
  assert.ok(X.toText(range, {}).indexOf("ZEITKONTO · 2026-08-03 bis 2026-08-04") === 0);
  assert.ok(X.toICS(range.days, {}).indexOf("Netto 8:30 · Soll 8:24") >= 0);
});
