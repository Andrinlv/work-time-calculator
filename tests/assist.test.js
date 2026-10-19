"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const Hol = require("../assets/js/core/holidays.js");
const I = require("../assets/js/ui/i18n.js");
const A = require("../assets/js/core/assist.js");

/* Lückenhilfe: übliche Zeiten, Erkennen und Vorschläge — immer mit fester
   Uhr („jetzt“) und gerechnet mit der echten Engine. Jeder Vorschlag muss
   einen Datensatz ergeben, den die Engine ohne Erfassungs-Warnung rechnet. */

const TODAY = "2026-10-16";                       // Freitag, Soll 8 h 24
const at = (h, m, iso) => {
  const d = T.fromISO(iso || TODAY);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
};
function settings(patch) {
  return Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU" }, patch || {});
}
const hm = (m) => T.formatHHMM(m);

/* Zwölf Wochen Arbeitstage bis gestern: Kommen 07:30/07:40/07:50 im Wochen-
   rhythmus (Median 07:40), Anwesenheit 9 h 10 (Gehen-Median 16:50),
   Mittag meist 12:00–12:35, jede vierte Woche 12:10–12:40. */
function history(opts) {
  opts = opts || {};
  const until = opts.until || "2026-10-15";
  const days = {};
  T.rangeDays(opts.from || "2026-07-20", until).forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    const w = Math.floor(T.diffDays(iso, TODAY) / 7);
    const start = 7 * 60 + 30 + (w % 3) * 10;
    const lunch = w % 4 === 0 ? [12 * 60 + 10, 12 * 60 + 40] : [12 * 60, 12 * 60 + 35];
    days[iso] = { date: iso, start: hm(start), end: hm(start + 550), breaks: [{ id: "l" + iso, label: "Mittag", start: hm(lunch[0]), end: hm(lunch[1]), paid: false }], note: "", location: "office", absenceFactor: 1 };
  });
  return days;
}
function issuesOf(rec, iso, s, now) {
  return E.computeDay(rec, { settings: s, now: now, isToday: iso === T.todayISO(now) }).warnings
    .filter((w) => A.RECORD_CODES.indexOf(w.code) >= 0).map((w) => w.code);
}
function apply(days, sug, s, now) {
  const iso = sug.date;
  const after = Object.assign({ date: iso }, days[iso] || {}, sug.patch);
  return { after, issues: issuesOf(after, iso, s, now), res: E.computeDay(after, { settings: s, now, isToday: iso === T.todayISO(now) }) };
}
const codes = (list) => list.map((x) => x.code);

/* ---------------------------------------------------------------------- */
/* Übliche Zeiten                                                          */
/* ---------------------------------------------------------------------- */

test("Median: ungerade Mitte, gerade Anzahl gerundetes Mittel, leer null", () => {
  assert.equal(A.median([3, 1, 2]), 2);
  assert.equal(A.median([1, 2, 3, 6]), 3);
  assert.equal(A.median([]), null);
});

test("Übliche Zeiten: Median der letzten acht gleichen Wochentage", () => {
  const typ = A.typicalTimes(history(), settings(), { date: TODAY, now: at(9, 0) });
  assert.equal(typ.source, "weekday");
  assert.equal(typ.n, 8);
  assert.equal(typ.night, false);
  assert.deepEqual(typ.text, { start: "07:40", end: "16:50", lunchStart: "12:00", lunchEnd: "12:35" });
});

test("Übliche Zeiten folgen dem Rundungsraster der Einstellungen", () => {
  const days = history();
  // Kommen 07:43 statt 07:40 an allen Freitagen → Raster 15 min ergibt 07:45
  Object.keys(days).forEach((iso) => {
    if (T.weekdayOf(iso) === 5) { days[iso].start = "07:43"; days[iso].end = "16:55"; }
  });
  const typ = A.typicalTimes(days, settings({ roundStep: 15 }), { date: TODAY, now: at(9, 0) });
  assert.equal(typ.text.start, "07:45");
  assert.equal(typ.text.end, "17:00");
  assert.equal(typ.text.lunchStart, "12:00");
});

test("Absenzen, halbe Tage, unvollständige und kurze Tage sind keine Vorbilder", () => {
  const days = history({ from: "2026-05-04" });
  days["2026-10-09"] = { date: "2026-10-09", type: "vacation", absenceFactor: 0.5, start: "07:00", end: "11:00", breaks: [] };
  days["2026-10-02"] = { date: "2026-10-02", type: "sick", start: "", end: "", breaks: [] };
  days["2026-09-25"] = { date: "2026-09-25", start: "06:00", end: "", breaks: [] };
  days["2026-09-18"] = { date: "2026-09-18", start: "08:00", end: "10:00", breaks: [] };
  days["2026-09-11"] = { date: "2026-09-11", type: "training", start: "08:30", end: "16:30", breaks: [] };
  const samples = A.collectSamples(days, settings(), { before: TODAY, now: at(9, 0) });
  ["2026-10-09", "2026-10-02", "2026-09-25", "2026-09-18", "2026-09-11"].forEach((iso) => {
    assert.equal(samples.some((x) => x.date === iso), false, iso);
  });
  const typ = A.typicalTimes(days, settings(), { date: TODAY, now: at(9, 0) });
  assert.equal(typ.n, 8, "es zählen die acht jüngsten echten Arbeitsfreitage");
  assert.equal(typ.source, "weekday");
});

test("Heute und spätere Tage zählen nicht als Vorbild", () => {
  const days = history();
  days[TODAY] = { date: TODAY, start: "05:00", end: "06:00", breaks: [] };
  days["2026-10-23"] = { date: "2026-10-23", start: "10:00", end: "20:00", breaks: [] };
  const samples = A.collectSamples(days, settings(), { before: TODAY, now: at(9, 0) });
  assert.equal(samples.some((x) => x.date >= TODAY), false);
});

test("Zu wenig gleiche Wochentage: die letzten Arbeitstage, sonst die Vorlage", () => {
  const days = history({ from: "2026-10-05" });      // nur zwei Freitage? nein: einer (09.10.)
  const typ = A.typicalTimes(days, settings(), { date: TODAY, now: at(9, 0) });
  assert.equal(typ.source, "recent");
  assert.equal(typ.n, 8);

  const tpl = A.typicalTimes({}, settings(), { date: TODAY, now: at(9, 0) });
  assert.equal(tpl.source, "template");
  assert.equal(tpl.n, 0);
  assert.deepEqual(tpl.text, { start: "08:00", end: "17:00", lunchStart: "12:00", lunchEnd: "12:30" });

  const none = A.typicalTimes({}, settings({ shiftTemplates: [] }), { date: TODAY, now: at(9, 0) });
  assert.equal(none.source, "default");
  assert.equal(none.text.lunchStart, "12:00", "Mittag aus settings.defaultLunch");
});

test("Nachtschicht: sind die jüngsten Tage Nächte, gelten Nachtzeiten", () => {
  const days = history({ until: "2026-09-30" });
  T.rangeDays("2026-10-01", "2026-10-15").forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    days[iso] = { date: iso, start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30", paid: false }] };
  });
  const typ = A.typicalTimes(days, settings(), { date: TODAY, now: at(9, 0) });
  assert.equal(typ.night, true);
  assert.deepEqual(typ.text, { start: "22:00", end: "06:00", lunchStart: "02:00", lunchEnd: "02:30" });
  assert.equal(typ.end - typ.start, 8 * 60, "Gehen liegt am Folgetag");

  // Eine einzelne Nacht verfälscht die Tageszeiten nicht
  const day = history();
  day["2026-10-09"] = { date: "2026-10-09", start: "22:00", end: "06:00", breaks: [] };
  const d = A.typicalTimes(day, settings(), { date: TODAY, now: at(9, 0) });
  assert.equal(d.night, false);
  assert.equal(d.text.start, "07:40");
});

test("Ganzer Tag wie üblich: Pause erfüllt das Gesetz für die ganze Anwesenheit", () => {
  const s = settings();
  // Üblich ohne Mittag: die Pflichtpause kommt an die gewohnte Mittagszeit
  const typ = { start: 7 * 60, end: 17 * 60, lunch: null, night: false };
  const day = A.buildDay(typ, s, { breakLabel: "Mittag", idBase: "x" });
  assert.equal(day.start, "07:00");
  assert.equal(day.end, "17:00");
  assert.equal(day.breaks.length, 1);
  assert.equal(day.breaks[0].start, "12:00");
  const res = E.computeDay(Object.assign({ date: "2026-10-12" }, day), { settings: s, now: at(9, 0), isToday: false });
  assert.ok(res.legalBreak >= res.requiredBreak);
  assert.deepEqual(issuesOf(Object.assign({ date: "2026-10-12" }, day), "2026-10-12", s, at(9, 0)), []);

  // Zu kurze übliche Pause wird verlängert (DE: 30 min ab 6 h, 45 ab 9 h)
  const de = settings({ breakRuleset: "de" });
  const long = A.buildDay({ start: 7 * 60, end: 17 * 60 + 30, lunch: { start: 12 * 60, end: 12 * 60 + 20 }, night: false }, de, {});
  const r2 = E.computeDay(Object.assign({ date: "2026-10-12" }, long), { settings: de, now: at(9, 0), isToday: false });
  assert.equal(r2.autoDeducted, 0);
  assert.deepEqual(issuesOf(Object.assign({ date: "2026-10-12" }, long), "2026-10-12", de, at(9, 0)), []);
});

/* ---------------------------------------------------------------------- */
/* (a) Kommen vergessen                                                    */
/* ---------------------------------------------------------------------- */

test("Kommen vergessen: Arbeitstag, nichts erfasst, üblich + 45 min vorbei", () => {
  const days = history();
  const s = settings();
  assert.deepEqual(codes(A.detect(days, s, { now: at(8, 20) })).filter((c) => c === "in"), [], "07:40 + 45 = 08:25");
  const list = A.detect(days, s, { now: at(9, 30) });
  const sug = list.find((x) => x.code === "in");
  assert.ok(sug);
  assert.equal(sug.start, "07:40");
  assert.equal(sug.fullDay, false);
  assert.deepEqual(sug.patch, { start: "07:40" });
  const r = apply(days, sug, s, at(9, 30));
  assert.equal(r.res.running, true);
  assert.deepEqual(r.issues, []);
});

test("Kommen vergessen nach dem Mittag: der übliche Mittag kommt mit, ohne Pausenabzug", () => {
  const days = history();
  const s = settings();
  const sug = A.detect(days, s, { now: at(14, 0) }).find((x) => x.code === "in");
  assert.deepEqual(sug.lunch, { start: "12:00", end: "12:35" });
  assert.equal(sug.patch.breaks.length, 1);
  const r = apply(days, sug, s, at(14, 0));
  assert.deepEqual(r.issues, []);
  assert.equal(r.res.autoDeducted, 0);
});

test("Kommen vergessen nach dem üblichen Gehen: der ganze Tag wie üblich", () => {
  const days = history();
  const s = settings();
  const sug = A.detect(days, s, { now: at(18, 30) }).find((x) => x.code === "in");
  assert.equal(sug.fullDay, true);
  assert.equal(sug.patch.start, "07:40");
  assert.equal(sug.patch.end, "16:50");
  const r = apply(days, sug, s, at(18, 30));
  assert.equal(r.res.complete, true);
  assert.deepEqual(r.issues, []);
});

test("Kein „Kommen vergessen“ an Wochenende, Feiertag, Absenz oder abgeschaltet", () => {
  const s = settings();
  const days = history({ until: "2026-05-22" , from: "2026-03-01" });
  // Samstag
  assert.equal(codes(A.detect(history(), s, { now: at(11, 0, "2026-10-17") })).indexOf("in"), -1);
  // Pfingstmontag (Feiertag in Luzern)
  assert.equal(codes(A.detect(days, s, { now: at(11, 0, "2026-05-25") })).indexOf("in"), -1);
  // Ferien heute
  const vac = history();
  vac[TODAY] = { date: TODAY, type: "vacation", start: "", end: "", breaks: [] };
  assert.equal(codes(A.detect(vac, s, { now: at(11, 0) })).indexOf("in"), -1);
  // Lückenhilfe aus
  assert.deepEqual(A.detect(history(), settings({ assist: false }), { now: at(11, 0) }), []);
});

/* ---------------------------------------------------------------------- */
/* (b) Pause offen · (e) Gehen vergessen                                    */
/* ---------------------------------------------------------------------- */

test("Pause seit 12:05 offen, jetzt 14:00: Ende zur üblichen Mittagszeit", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [{ id: "r", start: "12:05", end: "", paid: false }] };
  assert.equal(codes(A.detect(days, s, { now: at(13, 30) })).indexOf("break"), -1, "85 min: noch nicht");
  const sug = A.detect(days, s, { now: at(14, 0) }).find((x) => x.code === "break");
  assert.ok(sug);
  assert.equal(sug.since, "12:05");
  assert.equal(sug.minutes, 115);
  assert.equal(sug.end, "12:35", "übliches Mittagsende");
  const r = apply(days, sug, s, at(14, 0));
  assert.equal(r.res.openBreak, null);
  assert.equal(r.res.running, true);
  assert.deepEqual(r.issues, []);
});

test("Offene Pause erst nach dem üblichen Mittagsende: übliche Pausenlänge", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [{ id: "r", start: "12:40", end: "", paid: false }] };
  const sug = A.detect(days, s, { now: at(14, 30) }).find((x) => x.code === "break");
  assert.equal(sug.end, "13:15", "12:40 + 35 min");
  assert.deepEqual(apply(days, sug, s, at(14, 30)).issues, []);
});

test("Offene Pause nach dem üblichen Mittag endet zum üblichen Mittagsende", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [{ id: "r", start: "11:50", end: "", paid: false }] };
  const sug = A.detect(days, s, { now: at(14, 0) }).find((x) => x.code === "break");
  assert.equal(sug.end, "12:35");
  assert.equal(sug.patch.breaks[0].id, "r", "dieselbe Pause wird geschlossen");
});

test("Gehen vergessen: üblich + 2 h vorbei — Vorschlag zum üblichen Gehen", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [{ id: "r", start: "12:05", end: "12:40", paid: false }] };
  assert.equal(codes(A.detect(days, s, { now: at(18, 40) })).indexOf("leave"), -1, "16:50 + 2 h = 18:50");
  const sug = A.detect(days, s, { now: at(19, 30) }).find((x) => x.code === "leave");
  assert.ok(sug);
  assert.equal(sug.end, "16:50");
  const r = apply(days, sug, s, at(19, 30));
  assert.equal(r.res.complete, true);
  assert.deepEqual(r.issues, []);
});

test("Gehen vergessen: spät gekommen verschiebt das übliche Gehen mit", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "10:00", end: "", breaks: [{ id: "r", start: "13:00", end: "13:30", paid: false }] };
  assert.equal(codes(A.detect(days, s, { now: at(19, 0) })).indexOf("leave"), -1, "10:00 + 9 h 10 + 2 h = 21:10");
  const sug = A.detect(days, s, { now: at(21, 30) }).find((x) => x.code === "leave");
  assert.equal(sug.end, "19:10");
});

test("Gehen vergessen: mehr als 12 h anwesend reicht als Anlass", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "05:00", end: "", breaks: [{ id: "r", start: "11:00", end: "11:30", paid: false }] };
  const sug = A.detect(days, s, { now: at(17, 10) }).find((x) => x.code === "leave");
  assert.ok(sug, "12 h 10 anwesend");
  assert.equal(sug.end, "14:10", "05:00 + übliche 9 h 10");
  assert.deepEqual(apply(days, sug, s, at(17, 10)).issues, []);
});

test("Gehen vergessen ohne Mittag: die Pflichtpause wird ergänzt", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "07:40", end: "", breaks: [] };
  const sug = A.detect(days, s, { now: at(20, 0) }).find((x) => x.code === "leave");
  assert.equal(sug.addedBreak, true);
  assert.deepEqual(sug.patch.breaks.map((b) => b.start + "-" + b.end), ["12:00-12:35"]);
  const r = apply(days, sug, s, at(20, 0));
  assert.equal(r.res.autoDeducted, 0);
  assert.deepEqual(r.issues, []);
});

test("Pause gedrückt statt Gehen: die offene Pause nach dem üblichen Gehen wird zum Gehen", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "07:40", end: "", breaks: [
    { id: "m", start: "12:00", end: "12:35", paid: false }, { id: "x", start: "18:00", end: "", paid: false }] };
  const list = A.detect(days, s, { now: at(21, 0) });
  const leave = list.find((x) => x.code === "leave");
  assert.equal(leave.end, "18:00", "anwesend war die Person bis zur Pause");
  assert.equal(leave.patch.breaks.length, 1, "die offene Pause verschwindet");
  assert.deepEqual(apply(days, leave, s, at(21, 0)).issues, []);
  assert.equal(codes(list).indexOf("break"), -1, "kein widersprüchliches „Pause beenden“");
});

test("Pause und Gehen zugleich: die offene Pause kommt zuerst", () => {
  const days = history();
  const s = settings();
  days[TODAY] = { date: TODAY, start: "07:40", end: "", breaks: [{ id: "x", start: "12:00", end: "", paid: false }] };
  const list = A.detect(days, s, { now: at(19, 30) });
  assert.deepEqual(codes(list).slice(0, 2), ["break", "leave"]);
  const leave = list[1];
  assert.equal(leave.closedBreak, true);
  assert.equal(leave.patch.breaks[0].end, "12:35");
  assert.deepEqual(apply(days, leave, s, at(19, 30)).issues, []);
});

test("Nachtschicht über Mitternacht: läuft, wird nicht als fehlend gemeldet", () => {
  const days = history({ until: "2026-09-30" });
  T.rangeDays("2026-10-01", "2026-10-14").forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    days[iso] = { date: iso, start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30", paid: false }] };
  });
  days["2026-10-15"] = { date: "2026-10-15", start: "22:00", end: "", breaks: [{ id: "n", start: "02:00", end: "02:30", paid: false }] };
  const s = settings();
  const early = A.detect(days, s, { now: at(4, 0) });
  assert.deepEqual(codes(early).filter((c) => c === "end" || c === "leave" || c === "in"), []);
  // Nacht läuft bis 10:30: übliches Gehen 06:00 + 2 h ist vorbei
  const late = A.detect(days, s, { now: at(8, 30) });
  const leave = late.find((x) => x.code === "leave");
  assert.ok(leave);
  assert.equal(leave.date, "2026-10-15");
  assert.equal(leave.end, "06:00");
  const after = Object.assign({}, days["2026-10-15"], leave.patch);
  assert.deepEqual(issuesOf(after, "2026-10-15", s, at(8, 30)), []);
  // Tagsüber kein „Kommen vergessen“ für Nachtleute
  delete days["2026-10-15"];
  assert.equal(codes(A.detect(days, s, { now: at(11, 0) })).indexOf("in"), -1);
});

/* ---------------------------------------------------------------------- */
/* (c) Gehen fehlt · (d) Tage ohne Erfassung                                */
/* ---------------------------------------------------------------------- */

test("Vergangener Tag ohne Gehen: Vorschlag zum üblichen Gehen, laufender Tag nie", () => {
  const days = history();
  const s = settings();
  days["2026-10-14"] = { date: "2026-10-14", start: "07:40", end: "", breaks: [{ id: "m", start: "12:00", end: "12:35", paid: false }] };
  days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [] };
  const list = A.detect(days, s, { now: at(14, 23) });
  const ends = list.filter((x) => x.code === "end");
  assert.deepEqual(ends.map((x) => x.date), ["2026-10-14"]);
  assert.equal(ends[0].key, "end:2026-10-14");
  assert.equal(ends[0].end, "16:50");
  const r = apply(days, ends[0], s, at(14, 23));
  assert.equal(r.res.complete, true);
  assert.deepEqual(r.issues, []);
});

test("Gehen fehlt, früh gekommen: das übliche Gehen rückt um denselben Betrag vor", () => {
  const days = history();
  const s = settings();
  days["2026-10-14"] = { date: "2026-10-14", start: "07:05", end: "", breaks: [] };
  const sug = A.detect(days, s, { now: at(14, 23) }).find((x) => x.code === "end");
  assert.equal(sug.end, "16:15");
  assert.equal(sug.addedBreak, true);
  assert.deepEqual(apply(days, sug, s, at(14, 23)).issues, []);
});

test("Gehen fehlt mit Raster 5 min: auf das Raster gerundet", () => {
  const days = history();
  const s = settings({ roundStep: 5 });
  days["2026-10-14"] = { date: "2026-10-14", start: "07:07", end: "", breaks: [] };
  const sug = A.detect(days, s, { now: at(14, 23) }).find((x) => x.code === "end");
  assert.equal(T.parseHHMM(sug.end) % 5, 0);
});

test("Tage ohne Erfassung: nur Arbeitstage ab Erfassungsbeginn, nichts wird überschrieben", () => {
  const days = history();
  const s = settings();
  delete days["2026-10-12"];
  delete days["2026-10-13"];
  days["2026-10-07"] = { date: "2026-10-07", start: "", end: "", breaks: [{ id: "p", start: "12:00", end: "12:30" }] };  // nur Pause: Inhalt
  delete days["2026-10-08"];
  days["2026-10-08"] = { date: "2026-10-08", note: "Kundentermin" };                                       // Notiz: erfasst
  const list = A.detect(days, s, { now: at(9, 0), trackingStart: "2026-07-20" });
  const gaps = list.find((x) => x.code === "gaps");
  assert.ok(gaps);
  assert.deepEqual(gaps.dates, ["2026-10-12", "2026-10-13"]);
  gaps.plan.forEach((p) => {
    assert.equal(p.kind, "day");
    const after = Object.assign({ date: p.date }, days[p.date] || {}, p.patch);
    assert.deepEqual(issuesOf(after, p.date, s, at(9, 0)), [], p.date);
  });
  // Montag üblich wie die anderen Montage: 07:40–16:50 mit Mittag
  assert.equal(gaps.plan[0].patch.start, "07:40");
  assert.equal(gaps.plan[0].patch.end, "16:50");
  assert.deepEqual(gaps.plan[0].patch.breaks.map((b) => b.start + "-" + b.end), ["12:00-12:35"]);
  // Vor dem Erfassungsbeginn gibt es keine Lücken
  const later = A.detect(days, s, { now: at(9, 0), trackingStart: "2026-10-14" });
  assert.equal(later.some((x) => x.code === "gaps"), false);
  // Ohne jeden eigenen Eintrag: keine Lücken
  assert.equal(A.detect({}, s, { now: at(9, 0) }).some((x) => x.code === "gaps"), false);
});

test("Tage ohne Erfassung überspringen Feiertage, Absenzen und Wochenenden", () => {
  const s = settings();
  const days = history({ from: "2026-03-02", until: "2026-05-15" });
  // 18.–29.05. nichts erfasst: Pfingstmontag 25.05. ist Feiertag, 27.05. Ferien
  days["2026-05-27"] = { date: "2026-05-27", type: "vacation", start: "", end: "", breaks: [] };
  const sug = A.detect(days, s, { now: at(9, 0, "2026-05-29"), trackingStart: "2026-03-02" }).find((x) => x.code === "gaps");
  assert.deepEqual(sug.dates, ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21", "2026-05-22", "2026-05-26", "2026-05-28"]);
  assert.ok(Hol.lookup("2026-05-25", "CH-LU"));
});

test("Lücken älter als 31 Tage meldet die Karte nicht", () => {
  const days = history();
  delete days["2026-09-07"];
  delete days["2026-10-05"];
  const sug = A.detect(days, settings(), { now: at(9, 0), trackingStart: "2026-07-20" }).find((x) => x.code === "gaps");
  assert.deepEqual(sug.dates, ["2026-10-05"]);
});

test("scan und planFill für einen ganzen Monat (Kalender)", () => {
  const days = history();
  const s = settings();
  delete days["2026-10-12"];
  days["2026-10-14"] = { date: "2026-10-14", start: "07:40", end: "", breaks: [] };
  days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [] };
  const found = A.scan(days, s, { from: "2026-10-01", to: "2026-10-31", now: at(14, 23), active: TODAY, trackingStart: "2026-07-20" });
  assert.deepEqual(found, { incomplete: ["2026-10-14"], gaps: ["2026-10-12"] });
  const plan = A.planFill(days, s, found.incomplete.concat(found.gaps), { now: at(14, 23) });
  assert.deepEqual(plan.map((p) => p.date + ":" + p.kind), ["2026-10-14:end", "2026-10-12:day"]);
  plan.forEach((p) => assert.deepEqual(p.issues, [], p.date));
  assert.equal(plan[0].addedBreak, true);
});

test("Ein früherer Tag in der Ansicht: nur Vorschläge zu genau diesem Tag", () => {
  const days = history();
  const s = settings();
  delete days["2026-10-12"];
  days["2026-10-14"] = { date: "2026-10-14", start: "07:40", end: "", breaks: [] };
  const gap = A.detectDay(days, s, "2026-10-12", { now: at(14, 23), trackingStart: "2026-07-20" });
  assert.deepEqual(codes(gap), ["gap"]);
  assert.equal(gap[0].key, "gap:2026-10-12");
  assert.equal(gap[0].patch.start, "07:40");
  const end = A.detectDay(days, s, "2026-10-14", { now: at(14, 23), trackingStart: "2026-07-20" });
  assert.deepEqual(codes(end), ["end"]);
  assert.deepEqual(A.detectDay(days, s, "2026-10-13", { now: at(14, 23), trackingStart: "2026-07-20" }), []);
});

/* ---------------------------------------------------------------------- */
/* Reihenfolge und Ausblenden                                              */
/* ---------------------------------------------------------------------- */

test("Reihenfolge: offene Pause, Gehen, Kommen, fehlendes Gehen, Lücken", () => {
  const days = history();
  const s = settings();
  delete days["2026-10-12"];
  days["2026-10-14"] = { date: "2026-10-14", start: "07:40", end: "", breaks: [] };
  days["2026-10-13"] = { date: "2026-10-13", start: "07:40", end: "", breaks: [] };
  const list = A.detect(days, s, { now: at(9, 30), trackingStart: "2026-07-20" });
  assert.deepEqual(list.map((x) => x.key), ["in", "end:2026-10-14", "end:2026-10-13", "gaps"]);
});

test("Ausgeblendet gilt nur für den Tag; Einträge älter als 45 Tage werden aufgeräumt", () => {
  const days = history();
  const s = settings();
  days["2026-10-14"] = { date: "2026-10-14", start: "07:40", end: "", breaks: [] };
  let map = A.dismiss({ "2026-08-01": ["in"], "2026-09-10": ["gaps", "gaps", 3] }, TODAY, "end:2026-10-14");
  assert.deepEqual(map, { "2026-09-10": ["gaps"], [TODAY]: ["end:2026-10-14"] });
  map = A.dismiss(map, TODAY, "in");
  assert.deepEqual(map[TODAY], ["end:2026-10-14", "in"]);

  const hidden = A.detect(days, s, { now: at(9, 30), dismissed: map });
  assert.equal(hidden.some((x) => x.code === "end" || x.code === "in"), false);
  const all = A.detect(days, s, { now: at(9, 30), dismissed: map, includeDismissed: true });
  assert.equal(all.find((x) => x.code === "end").dismissed, true);
  // Am nächsten Arbeitstag ist der Hinweis wieder da
  const monday = A.detect(days, s, { now: at(9, 30, "2026-10-19"), dismissed: map });
  assert.equal(monday.some((x) => x.code === "end"), true);
  // Aus settings.assistDismissed gelesen, wenn nichts übergeben wird
  const viaSettings = A.detect(days, settings({ assistDismissed: map }), { now: at(9, 30) });
  assert.equal(viaSettings.some((x) => x.code === "in"), false);

  assert.deepEqual(A.undismiss(map, TODAY, "in")[TODAY], ["end:2026-10-14"]);
  assert.equal(A.undismiss(map, TODAY)[TODAY], undefined);
  assert.deepEqual(A.pruneDismissed({ "kaputt": ["x"], "2026-10-20": ["x"] }, TODAY), {});
});

test("Erfassungsbeginn wie im Kalender (ZK.CalWeek.trackingStart)", () => {
  const sandbox = { ZK: { Time: T, Rules: R, Holidays: Hol, Engine: E, I18n: I, Dom: {} } };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/ui/views/calendar.js"), "utf8"), sandbox);
  const CW = sandbox.ZK.CalWeek;
  const s = settings({ carryOverFrom: "2026-02-01" });
  const days = { "2026-01-10": { date: "2026-01-10" }, "2026-01-02": { date: "2026-01-02", source: "outlook", type: "vacation" } };
  const metas = [null, { createdAt: "2026-01-05T07:00:00Z" }, { createdAt: "2026-03-01T07:00:00Z" }];
  metas.forEach((m) => {
    assert.equal(A.trackingStartOf(days, s, m), CW.trackingStart(days, s, m));
    assert.equal(A.trackingStartOf(days, settings(), m), CW.trackingStart(days, settings(), m));
  });
  assert.equal(A.trackingStartOf({}, s, null), null);
});

/* ---------------------------------------------------------------------- */
/* Oberfläche: Texte in allen vier Sprachen                                */
/* ---------------------------------------------------------------------- */

test("Texte der Lückenhilfe gibt es in allen vier Sprachen, ohne ß", () => {
  const sandbox = { ZK: { I18n: I } };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/ui/features/assist.js"), "utf8"), sandbox);
  const keys = Object.keys(I.DICT.de).filter((k) => k.indexOf("assist.") === 0);
  assert.ok(keys.length > 20);
  ["en", "fr", "it"].forEach((lang) => {
    keys.forEach((k) => assert.ok(I.DICT[lang][k], lang + ": " + k));
    Object.keys(I.DICT[lang]).filter((k) => k.indexOf("assist.") === 0)
      .forEach((k) => assert.ok(I.DICT.de[k] !== undefined, "de fehlt: " + k));
  });
  keys.forEach((k) => assert.equal(/ß/.test(I.DICT.de[k]), false, k));
  // Platzhalter stimmen überall überein
  keys.forEach((k) => {
    const want = (I.DICT.de[k].match(/\{\w+\}/g) || []).sort().join();
    ["en", "fr", "it"].forEach((lang) => assert.equal((I.DICT[lang][k].match(/\{\w+\}/g) || []).sort().join(), want, lang + ": " + k));
  });
});
