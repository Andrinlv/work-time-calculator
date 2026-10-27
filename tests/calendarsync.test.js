"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../assets/js/data/calendarsync.js");

/* Hilfen zum Bauen von Graph-Terminen ---------------------------------- */
function allDay(subject, fromDate, toDateExclusive, extra) {
  return Object.assign({
    id: "e-" + subject,
    subject: subject,
    isAllDay: true,
    showAs: "oof",
    start: { dateTime: fromDate + "T00:00:00.0000000", timeZone: "Europe/Zurich" },
    end: { dateTime: toDateExclusive + "T00:00:00.0000000", timeZone: "Europe/Zurich" }
  }, extra || {});
}

function timed(subject, date, from, to, extra) {
  return Object.assign({
    id: "t-" + subject,
    subject: subject,
    isAllDay: false,
    showAs: "busy",
    start: { dateTime: date + "T" + from + ":00.0000000", timeZone: "Europe/Zurich" },
    end: { dateTime: date + "T" + to + ":00.0000000", timeZone: "Europe/Zurich" }
  }, extra || {});
}

/* ====================================================================== */
/* Zeitumrechnung                                                          */
/* ====================================================================== */

test("Wanduhrzeit wird ohne Zeitzonenrechnung gelesen", () => {
  const p = C.toLocalParts({ dateTime: "2026-08-06T09:30:00.0000000", timeZone: "Europe/Zurich" });
  assert.equal(p.date, "2026-08-06");
  assert.equal(p.minutes, 570);
});

test("UTC-Antworten werden in die Gerätezeit umgerechnet", () => {
  const p = C.toLocalParts({ dateTime: "2026-08-06T09:30:00.0000000", timeZone: "UTC" });
  const expected = new Date("2026-08-06T09:30:00Z");
  assert.equal(p.minutes, expected.getHours() * 60 + expected.getMinutes());
});

test("Unbrauchbare Zeitangaben ergeben null", () => {
  assert.equal(C.toLocalParts(null), null);
  assert.equal(C.toLocalParts({}), null);
  assert.equal(C.toLocalParts({ dateTime: "quatsch", timeZone: "Europe/Zurich" }), null);
});

/* ====================================================================== */
/* Ganztagestermine — die klassische Falle                                 */
/* ====================================================================== */

test("Eintägige Ganztagesabwesenheit ergibt genau einen Tag", () => {
  // Outlook: 06.08. ganztägig => start 06.08. 00:00, end 07.08. 00:00
  const days = C.eventDays(allDay("Ferien", "2026-08-06", "2026-08-07"));
  assert.deepEqual(days, ["2026-08-06"], "der Folgetag darf nicht mitgezählt werden");
});

test("Mehrtägige Ferien decken den ganzen Zeitraum ab", () => {
  const days = C.eventDays(allDay("Ferien", "2026-08-03", "2026-08-08"));
  assert.deepEqual(days, ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
  assert.equal(days.length, 5, "Mo bis Fr, nicht 6 Tage");
});

test("Termin über Mitternacht zählt den Folgetag nicht doppelt", () => {
  const ev = {
    id: "n", subject: "Nachtschicht", isAllDay: false, showAs: "busy",
    start: { dateTime: "2026-08-06T22:00:00", timeZone: "Europe/Zurich" },
    end: { dateTime: "2026-08-07T00:00:00", timeZone: "Europe/Zurich" }
  };
  assert.deepEqual(C.eventDays(ev), ["2026-08-06"]);
});

test("Termin, der wirklich in den Folgetag reicht, zählt beide Tage", () => {
  const ev = {
    id: "n2", subject: "Nachtschicht", isAllDay: false, showAs: "busy",
    start: { dateTime: "2026-08-06T22:00:00", timeZone: "Europe/Zurich" },
    end: { dateTime: "2026-08-07T06:00:00", timeZone: "Europe/Zurich" }
  };
  assert.deepEqual(C.eventDays(ev), ["2026-08-06", "2026-08-07"]);
});

/* ====================================================================== */
/* Regelauswertung                                                         */
/* ====================================================================== */

test("Stichwörter im Betreff greifen", () => {
  const mapped = C.mapEvents([allDay("Ferien Tessin", "2026-08-06", "2026-08-07")], {});
  assert.equal(mapped["2026-08-06"].type, "vacation");
});

test("Stichwörter in Kategorien greifen ebenso", () => {
  const ev = allDay("Abwesend", "2026-08-06", "2026-08-07", { categories: ["Krankheit"] });
  const mapped = C.mapEvents([ev], {});
  assert.equal(mapped["2026-08-06"].type, "sick");
});

test("Gross- und Kleinschreibung spielt keine Rolle", () => {
  const mapped = C.mapEvents([allDay("FERIEN", "2026-08-06", "2026-08-07")], {});
  assert.equal(mapped["2026-08-06"].type, "vacation");
});

test("Alle vier Sprachen werden erkannt", () => {
  const cases = [
    ["Vacances d'été", "vacation"],
    ["Ferie estive", "vacation"],
    ["Annual vacation", "vacation"],
    ["Malattia", "sick"],
    ["Formation continue", "training"],
    ["Recupero ore", "comp"]
  ];
  cases.forEach(([subject, expected]) => {
    const mapped = C.mapEvents([allDay(subject, "2026-08-06", "2026-08-07")], {});
    assert.equal(mapped["2026-08-06"] && mapped["2026-08-06"].type, expected, subject);
  });
});

test("Abwesend-Ganztagestermin ohne Stichwort gilt als Ferien", () => {
  const mapped = C.mapEvents([allDay("Nicht im Büro", "2026-08-06", "2026-08-07")], {});
  assert.equal(mapped["2026-08-06"].type, "vacation");
  assert.equal(mapped["2026-08-06"].ruleId, "oof");
});

test("Abwesend-Markierung an einem Kurztermin löst keine Ferien aus", () => {
  const ev = timed("Zahnarzt", "2026-08-06", "09:00", "10:00", { showAs: "oof", subject: "Termin" });
  const mapped = C.mapEvents([ev], {});
  assert.equal(mapped["2026-08-06"], undefined, "eine Stunde abwesend ist kein Ferientag");
});

test("Die erste passende Regel gewinnt", () => {
  // „Krank" steht vor der allgemeinen Abwesend-Regel
  const mapped = C.mapEvents([allDay("Krank gemeldet", "2026-08-06", "2026-08-07")], {});
  assert.equal(mapped["2026-08-06"].type, "sick");
});

test("Halbtage werden erkannt", () => {
  const mapped = C.mapEvents([allDay("Ferien Halbtag", "2026-08-06", "2026-08-07")], {});
  assert.equal(mapped["2026-08-06"].factor, 0.5);
  assert.equal(C.isHalfDay("ferien ½ tag"), true);
  assert.equal(C.isHalfDay("ferien"), false);
});

test("Zwei Halbtage derselben Art ergeben einen ganzen Tag", () => {
  const mapped = C.mapEvents([
    allDay("Ferien Vormittag", "2026-08-06", "2026-08-07", { id: "a" }),
    allDay("Ferien Nachmittag", "2026-08-06", "2026-08-07", { id: "b" })
  ], {});
  assert.equal(mapped["2026-08-06"].factor, 1);
});

test("Homeoffice setzt nur den Arbeitsort, keine Tagesart", () => {
  const ev = timed("Homeoffice", "2026-08-06", "08:00", "17:00", { showAs: "workingElsewhere" });
  const mapped = C.mapEvents([ev], {});
  assert.equal(mapped["2026-08-06"].location, "home");
  assert.equal(mapped["2026-08-06"].type, undefined, "Homeoffice ist ein Arbeitstag");
});

test("Homeoffice lässt sich abschalten", () => {
  const ev = timed("Homeoffice", "2026-08-06", "08:00", "17:00", { showAs: "workingElsewhere" });
  const mapped = C.mapEvents([ev], { importHomeOffice: false });
  assert.equal(mapped["2026-08-06"], undefined);
});

test("Ferien und Homeoffice am selben Tag: beides wird übernommen", () => {
  const mapped = C.mapEvents([
    allDay("Ferien", "2026-08-06", "2026-08-07"),
    timed("Homeoffice", "2026-08-06", "08:00", "12:00", { showAs: "workingElsewhere", id: "h" })
  ], {});
  assert.equal(mapped["2026-08-06"].type, "vacation");
  assert.equal(mapped["2026-08-06"].location, "home");
});

/* ====================================================================== */
/* Aussortieren                                                            */
/* ====================================================================== */

test("Abgesagte Termine werden ignoriert", () => {
  const mapped = C.mapEvents([allDay("Ferien", "2026-08-06", "2026-08-07", { isCancelled: true })], {});
  assert.deepEqual(Object.keys(mapped), []);
});

test("Abgelehnte Einladungen werden ignoriert", () => {
  const ev = allDay("Ferien", "2026-08-06", "2026-08-07", { responseStatus: { response: "declined" } });
  assert.deepEqual(Object.keys(C.mapEvents([ev], {})), []);
});

test("Serienköpfe werden ignoriert — calendarView liefert die Vorkommen", () => {
  const ev = allDay("Ferien", "2026-08-06", "2026-08-07", { type: "seriesMaster" });
  assert.deepEqual(Object.keys(C.mapEvents([ev], {})), []);
});

test("Private Termine bleiben aussen vor, Abwesenheiten aber zählen", () => {
  const privat = timed("Privat", "2026-08-06", "09:00", "10:00", { sensitivity: "private" });
  assert.deepEqual(Object.keys(C.mapEvents([privat], {})), []);

  const ferien = allDay("Ferien", "2026-08-06", "2026-08-07", { sensitivity: "private" });
  const mapped = C.mapEvents([ferien], {});
  assert.equal(mapped["2026-08-06"].type, "vacation");
  assert.equal(mapped["2026-08-06"].note, "", "der Betreff eines privaten Termins wird nicht übernommen");
});

test("Betreff wandert auf Wunsch nicht in die Notiz", () => {
  const mapped = C.mapEvents([allDay("Ferien Mallorca", "2026-08-06", "2026-08-07")], { copySubjectToNote: false });
  assert.equal(mapped["2026-08-06"].note, "");
});

test("Gewöhnliche Besprechungen erzeugen keinen Eintrag", () => {
  const mapped = C.mapEvents([timed("Teamsitzung", "2026-08-06", "09:00", "10:00")], {});
  assert.deepEqual(Object.keys(mapped), []);
});

/* ====================================================================== */
/* Abgleichplan                                                            */
/* ====================================================================== */

function planWith(records, events, range) {
  const mapped = C.mapEvents(events, {});
  return C.planSync(mapped, (iso) => records[iso] || null, range || { from: "2026-08-03", to: "2026-08-07" });
}

test("Leerer Tag mit Kalendereintrag wird vorgeschlagen", () => {
  const plan = planWith({}, [allDay("Ferien", "2026-08-05", "2026-08-06")]);
  const change = plan.changes.filter((c) => c.date === "2026-08-05")[0];
  assert.equal(change.action, "set");
  assert.equal(change.type, "vacation");
  assert.equal(change.reason, "new");
});

test("Eigene Stempelungen werden niemals überschrieben", () => {
  const records = { "2026-08-05": { date: "2026-08-05", start: "08:00", end: "17:00", breaks: [] } };
  const plan = planWith(records, [allDay("Ferien", "2026-08-05", "2026-08-06")]);
  assert.equal(plan.changes.filter((c) => c.date === "2026-08-05").length, 0);
  assert.equal(plan.protectedDays.length, 1);
  assert.equal(plan.protectedDays[0].date, "2026-08-05");
});

test("Eigene Tagesart wird nicht durch eine andere ersetzt", () => {
  const records = { "2026-08-05": { date: "2026-08-05", type: "comp" } };
  const plan = planWith(records, [allDay("Ferien", "2026-08-05", "2026-08-06")]);
  assert.equal(plan.changes.filter((c) => c.date === "2026-08-05").length, 0);
  assert.equal(plan.protectedDays.length, 1);
});

test("Früher übernommener Tag darf aktualisiert werden", () => {
  const records = { "2026-08-05": { date: "2026-08-05", type: "vacation", source: "outlook", absenceFactor: 1 } };
  const plan = planWith(records, [allDay("Krank", "2026-08-05", "2026-08-06")]);
  const change = plan.changes.filter((c) => c.date === "2026-08-05")[0];
  assert.equal(change.action, "set");
  assert.equal(change.type, "sick");
  assert.equal(change.reason, "update");
});

test("Gelöschter Termin nimmt den übernommenen Tag zurück", () => {
  const records = { "2026-08-05": { date: "2026-08-05", type: "vacation", source: "outlook" } };
  const plan = planWith(records, []);
  const change = plan.changes.filter((c) => c.date === "2026-08-05")[0];
  assert.equal(change.action, "clear");
  assert.equal(change.reason, "gone");
});

test("Ein manuell erfasster Tag wird nicht zurückgenommen", () => {
  const records = { "2026-08-05": { date: "2026-08-05", type: "vacation" } };
  const plan = planWith(records, []);
  assert.equal(plan.changes.length, 0);
});

test("Bereits stimmige Tage erzeugen keine Änderung", () => {
  const records = {
    "2026-08-05": { date: "2026-08-05", type: "vacation", source: "outlook", absenceFactor: 1 }
  };
  const plan = planWith(records, [allDay("Ferien", "2026-08-05", "2026-08-06")]);
  assert.equal(plan.changes.filter((c) => c.date === "2026-08-05").length, 0);
  assert.ok(plan.unchanged >= 1);
});

test("Der Arbeitsort wird auch auf erfassten Tagen gesetzt", () => {
  const records = { "2026-08-05": { date: "2026-08-05", start: "08:00", end: "17:00", location: "office" } };
  const ev = timed("Homeoffice", "2026-08-05", "08:00", "17:00", { showAs: "workingElsewhere" });
  const plan = planWith(records, [ev]);
  const change = plan.changes.filter((c) => c.date === "2026-08-05")[0];
  assert.equal(change.action, "location");
  assert.equal(change.location, "home");
});

test("Mehrtägige Ferien erzeugen einen Vorschlag je Tag", () => {
  const plan = planWith({}, [allDay("Ferien", "2026-08-03", "2026-08-06")]);
  const sets = plan.changes.filter((c) => c.action === "set");
  assert.equal(sets.length, 3);
  assert.deepEqual(sets.map((c) => c.date), ["2026-08-03", "2026-08-04", "2026-08-05"]);
});

/* ====================================================================== */
/* Speicher-Aufträge                                                       */
/* ====================================================================== */

test("buildPatch erzeugt vollständige Tageseinträge", () => {
  const plan = planWith({}, [allDay("Ferien Tessin", "2026-08-05", "2026-08-06")]);
  const patch = C.buildPatch(plan.changes, "2026-08-06T10:00:00Z");
  const day = patch["2026-08-05"];
  assert.equal(day.type, "vacation");
  assert.equal(day.absenceFactor, 1);
  assert.equal(day.source, "outlook");
  assert.equal(day.start, "", "Kalenderabwesenheiten tragen keine Stempelzeiten");
  assert.deepEqual(day.breaks, []);
  assert.equal(day.note, "Ferien Tessin");
  assert.equal(day.outlookSyncedAt, "2026-08-06T10:00:00Z");
});

test("buildPatch löscht mit null", () => {
  const patch = C.buildPatch([{ date: "2026-08-05", action: "clear" }]);
  assert.equal(patch["2026-08-05"], null);
});

test("buildPatch rührt bei Ortsänderung nichts anderes an", () => {
  const before = { type: null, factor: 1, start: "08:00", end: "17:00", location: "office", source: null, edited: false };
  const patch = C.buildPatch([{ date: "2026-08-05", action: "location", location: "home", before }]);
  assert.deepEqual(Object.keys(patch["2026-08-05"]).sort(), ["location", "outlookSyncedAt"]);
});

test("buildPatch: ein neuer Datensatz nur für den Ort gehört dem Kalender", () => {
  const patch = C.buildPatch([{ date: "2026-08-05", action: "location", location: "home", before: null }]);
  assert.deepEqual(Object.keys(patch["2026-08-05"]).sort(), ["location", "outlookSyncedAt", "source"]);
  assert.equal(patch["2026-08-05"].source, C.SOURCE);
});

/* ====================================================================== */
/* Zeitraum                                                                */
/* ====================================================================== */

test("syncRange folgt den Einstellungen", () => {
  const r = C.syncRange({ pastDays: 30, futureDays: 90 }, "2026-08-06");
  assert.equal(r.from, "2026-07-07");
  assert.equal(r.to, "2026-11-04");
});

test("syncRange verträgt negative Angaben", () => {
  const r = C.syncRange({ pastDays: -30, futureDays: -90 }, "2026-08-06");
  assert.ok(r.from < "2026-08-06");
  assert.ok(r.to > "2026-08-06");
});

test("Standardeinstellungen sind vollständig", () => {
  const s = C.defaultSettings();
  assert.equal(s.enabled, false);
  assert.equal(s.tenant, "common");
  assert.ok(s.rules.length >= 9);
  assert.ok(s.futureDays > 0);
});

/* ====================================================================== */
/* Kurze Termine, Wortgrenzen, Halbtage aus der Dauer                      */
/* ====================================================================== */

test("Kurze Termine mit Stichwort werden keine Abwesenheitstage", () => {
  const mapped = C.mapEvents([
    timed("Ferienplanung Team", "2026-11-05", "10:00", "11:00"),
    timed("Arzttermin", "2026-11-06", "16:00", "17:00"),
    timed("Zahnarzt", "2026-11-09", "09:00", "10:00", { showAs: "oof" }),
    timed("Remote-Meeting", "2026-11-10", "14:00", "15:00", { showAs: "workingElsewhere" })
  ], {});
  assert.deepEqual(Object.keys(mapped), []);
});

test("Lange Termine zählen — ein halber Tag wird zum Halbtag", () => {
  const mapped = C.mapEvents([
    timed("Ferien", "2026-11-05", "08:00", "17:00", { id: "f" }),
    timed("Weiterbildung Excel", "2026-11-06", "08:00", "12:00", { id: "w" }),
    timed("Krank", "2026-11-09", "13:00", "17:30", { id: "k" })
  ], {});
  assert.equal(mapped["2026-11-05"].factor, 1);
  assert.equal(mapped["2026-11-06"].type, "training");
  assert.equal(mapped["2026-11-06"].factor, 0.5);
  assert.equal(mapped["2026-11-09"].factor, 0.5);
});

test("Mehrtägiger Termin mit Uhrzeit: angebrochene Rand-Tage zählen nicht", () => {
  const ev = {
    id: "m", subject: "Ferien", isAllDay: false, showAs: "oof",
    start: { dateTime: "2026-11-09T17:00:00", timeZone: "Europe/Zurich" },
    end: { dateTime: "2026-11-12T08:00:00", timeZone: "Europe/Zurich" }
  };
  const mapped = C.mapEvents([ev], {});
  assert.deepEqual(Object.keys(mapped).sort(), ["2026-11-10", "2026-11-11"]);
  assert.equal(mapped["2026-11-10"].factor, 1);
});

test("Stichwörter greifen als ganzes Wort oder Wortende, nie mitten im Wort", () => {
  const hit = (subject) => {
    const m = C.mapEvents([allDay(subject, "2026-11-12", "2026-11-13")], {})["2026-11-12"];
    return m ? m.type : null;
  };
  assert.equal(hit("Konkursverfahren Firma X"), "vacation", "nur „Abwesend“ (oof) greift, nicht „Kurs“");
  assert.equal(C.hasKeyword("konkursverfahren firma x", "kurs"), false);
  assert.equal(C.hasKeyword("informationsveranstaltung", "formation"), false);
  assert.equal(C.hasKeyword("ferienvertretung für max", "ferien"), false);
  assert.equal(hit("Sommerferien"), "vacation");
  assert.equal(hit("Betriebsferien"), "vacation");
  assert.equal(hit("Ferientag"), "vacation");
  assert.equal(hit("Krankheitstage"), "sick");
  assert.equal(hit("Zahnarzt"), "sick");
  assert.equal(hit("Kurse Excel"), "training");
  assert.equal(hit("WK Thun"), "military");
  assert.equal(C.hasKeyword("wkly sync", "wk"), false);
  assert.equal(hit("Formation continue"), "training");
});

test("Derselbe Termin aus zwei Kalendern zählt nur einmal", () => {
  const ev = allDay("Ferien Halbtag", "2026-11-13", "2026-11-14", { id: "same" });
  const mapped = C.mapEvents([ev, Object.assign({}, ev)], {});
  assert.equal(mapped["2026-11-13"].factor, 0.5);
});

test("Ganztagestermin in UTC landet auf dem richtigen Tag", () => {
  const ev = allDay("Ferien", "2026-08-06", "2026-08-07");
  ev.start.timeZone = "UTC";
  ev.end.timeZone = "UTC";
  assert.deepEqual(C.eventDays(ev), ["2026-08-06"]);
});

/* ====================================================================== */
/* Eigene Stempelungen und Handarbeit sind tabu                            */
/* ====================================================================== */

test("Stempelungen auf einem Kalendertag bleiben bei geändertem Termin erhalten", () => {
  const record = { date: "2026-11-10", type: "training", absenceFactor: 1, source: "outlook", start: "08:00", end: "17:00",
    breaks: [{ id: "a", start: "12:00", end: "12:30" }] };
  const mapped = { "2026-11-10": { date: "2026-11-10", type: "training", factor: 0.5, note: "Kurs Halbtag" } };
  const plan = C.planSync(mapped, (iso) => (iso === record.date ? record : null), { from: "2026-11-10", to: "2026-11-10" });
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.protectedDays.length, 1);
  const gone = C.planSync({}, (iso) => (iso === record.date ? record : null), { from: "2026-11-10", to: "2026-11-10" });
  assert.equal(gone.changes.length, 0, "auch ein gelöschter Termin leert keinen gestempelten Tag");
});

test("buildPatch leert nie einen gestempelten Tag, auch nicht mit einem fremden Plan", () => {
  const before = { type: "training", factor: 1, start: "08:00", end: "17:00", location: "office", source: "outlook" };
  const patch = C.buildPatch([
    { date: "2026-11-10", action: "set", type: "vacation", factor: 1, before: before },
    { date: "2026-11-11", action: "clear", before: before }
  ], "x");
  assert.deepEqual(Object.keys(patch), []);
});

test("Von Hand geänderter Kalendertag gilt als eigener Eintrag", () => {
  const record = { date: "2026-11-10", type: "sick", absenceFactor: 1, source: "outlook",
    outlookSyncedAt: "2026-11-01T08:00:00.000Z", updatedAt: "2026-11-03T09:30:00.000Z" };
  const getDay = (iso) => (iso === record.date ? record : null);
  const range = { from: "2026-11-10", to: "2026-11-10" };
  const changed = C.planSync({ "2026-11-10": { date: "2026-11-10", type: "vacation", factor: 1 } }, getDay, range);
  assert.equal(changed.changes.length, 0, "die eigene Korrektur wird nicht zurückgedreht");
  assert.equal(changed.protectedDays.length, 1);
  const gone = C.planSync({}, getDay, range);
  assert.equal(gone.changes.length, 0, "und nicht gelöscht, wenn der Termin verschwindet");

  const fresh = Object.assign({}, record, { updatedAt: "2026-11-01T08:00:00.020Z" });
  const plan = C.planSync({}, (iso) => (iso === record.date ? fresh : null), range);
  assert.equal(plan.changes[0].action, "clear", "unberührter Kalendertag wird wie bisher zurückgenommen");
});

test("Gelöschte Ferien mit verbleibendem Homeoffice-Termin: Abwesenheit weg, Ort bleibt", () => {
  const record = { date: "2026-11-11", type: "vacation", absenceFactor: 1, source: "outlook", start: "", end: "", note: "Ferien" };
  const mapped = { "2026-11-11": { date: "2026-11-11", location: "home", locationSubject: "Homeoffice" } };
  const plan = C.planSync(mapped, (iso) => (iso === record.date ? record : null), { from: "2026-11-11", to: "2026-11-11" });
  assert.equal(plan.changes[0].action, "clear");
  const patch = C.buildPatch(plan.changes, "x");
  const merged = Object.assign({}, record, patch["2026-11-11"]);
  assert.equal(merged.type, null);
  assert.equal(merged.location, "home");
  assert.equal(merged.note, "");
});

test("Ein Homeoffice-Abgleich macht einen von Hand geänderten Tag nicht wieder zum Kalendertag", () => {
  const record = { date: "2026-11-10", type: "sick", absenceFactor: 1, source: "outlook", location: "office",
    outlookSyncedAt: "2026-11-01T08:00:00.000Z", updatedAt: "2026-11-03T09:30:00.000Z" };
  const mapped = { "2026-11-10": { date: "2026-11-10", location: "home", locationSubject: "Homeoffice" } };
  const plan = C.planSync(mapped, (iso) => (iso === record.date ? record : null), { from: "2026-11-10", to: "2026-11-10" });
  assert.equal(plan.changes[0].action, "location");
  const patch = C.buildPatch(plan.changes, "2026-11-10T07:00:00.000Z");
  assert.deepEqual(patch["2026-11-10"], { location: "home" });
});
