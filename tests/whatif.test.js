"use strict";
/* Zeitschieber: eigene Prozessumgebung (node --test startet je Datei einen
   Prozess), die Zeitzone ist für die Zeitumstellung fest Zürich. */
process.env.TZ = "Europe/Zurich";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const W = require("../assets/js/core/whatif.js");

const settings = (patch) => Object.assign(R.defaultSettings(), { autoHolidays: false }, patch || {});
const hm = T.parseHHMM;
const at = (sc, i) => (i < 0 ? null : T.formatHHMM(sc.positions[i]));

/* Freitag 16.10.2026, gekommen 07:42, Mittag 12:05–12:40, jetzt 14:23 */
const RUNNING = { date: "2026-10-16", start: "07:42", end: "", breaks: [{ id: "r", start: "12:05", end: "12:40", paid: false }] };
const NOW = new Date(2026, 9, 16, 14, 23);
const runOpts = (patch) => Object.assign({ settings: settings(), holiday: null, now: NOW, isToday: true, nowTl: 14 * 60 + 23 }, patch || {});

test("Entwurf: Gehen gesetzt, laufende Pause endet jetzt, vorgemerkte fällt weg", () => {
  const rec = { date: "2026-10-16", start: "07:42", end: "", breaks: [
    { id: "a", start: "12:05", end: "" },
    { id: "b", start: "15:00", end: "" }
  ] };
  const d = W.draft(rec, 17 * 60 + 30, 12 * 60 + 40);
  assert.equal(d.end, "17:30");
  assert.deepEqual(d.breaks.map((b) => [b.id, b.start, b.end]), [["a", "12:05", "12:40"]]);
  assert.equal(rec.end, "", "das Original bleibt unberührt");
  assert.equal(rec.breaks[0].end, "");
  // Ohne „jetzt“ (vergangener Tag) zählt eine offene Zeile nicht — wie in der Engine
  assert.deepEqual(W.draft(rec, 1000).breaks, []);
});

test("Jede Stellung zeigt genau, was der Tag nach dem Speichern zeigt", () => {
  const s = settings({ roundStep: 5, roundMode: "nearest" });
  const rec = { date: "2026-10-15", start: "08:13", end: "17:02", breaks: [
    { start: "12:00", end: "12:20" }, { start: "15:00", end: "15:10", paid: true }
  ] };
  const sc = W.scan(rec, { settings: s, holiday: null, isToday: false });
  for (let i = 0; i < sc.positions.length; i += 7) {
    const p = sc.points[i];
    const saved = E.computeDay(Object.assign({}, rec, { end: p.end }), { settings: s, holiday: null, isToday: false });
    assert.equal(p.net, saved.net, p.end);
    assert.equal(p.balance, saved.balance, p.end);
    assert.equal(p.autoDeducted, saved.autoDeducted, p.end);
    assert.equal(p.effectiveBreak, saved.effectiveBreak, p.end);
  }
});

test("±0 liegt genau auf der Feierabend-Empfehlung der Engine", () => {
  [settings(), settings({ roundStep: 15, roundMode: "down" }), settings({ breakRuleset: "de" })].forEach((s) => {
    const res = E.computeDay(RUNNING, { settings: s, holiday: null, now: NOW, isToday: true });
    const sc = W.scan(RUNNING, runOpts({ settings: s, current: res }));
    assert.equal(sc.positions[sc.marks.zero], res.recommendedLeaveTl, s.breakRuleset + "/" + s.roundStep);
    assert.equal(sc.points[sc.marks.zero].balance >= 0, true);
    assert.equal(sc.points[sc.marks.zero - 1].balance < 0, true);
  });
  // Laufende Pause: Empfehlung und Zeitschieber rechnen beide „Pause endet jetzt“
  const onBreak = { date: "2026-10-16", start: "07:42", end: "", breaks: [{ start: "12:05", end: "" }] };
  const now = new Date(2026, 9, 16, 12, 50);
  const res = E.computeDay(onBreak, { settings: settings(), holiday: null, now, isToday: true });
  const sc = W.scan(onBreak, { settings: settings(), holiday: null, now, isToday: true, nowTl: 12 * 60 + 50, current: res });
  assert.equal(at(sc, sc.marks.zero), res.recommendedLeave);
  assert.equal(at(sc, sc.marks.zero), "16:51", "07:42 + 8:24 Soll + 45 min Pause bis jetzt");
});

test("Stundenpause: zwischen 17:17 und 17:42 zählt jede Minute als Pause", () => {
  const sc = W.scan(RUNNING, runOpts());
  assert.equal(sc.zones.length, 1);
  const z = sc.zones[0];
  assert.equal(at(sc, z.from), "17:17");
  assert.equal(at(sc, z.to), "17:42");
  assert.equal(z.require, 60);
  assert.equal(z.extra, 25, "35 min Mittag sind erfasst, 25 kommen dazu");
  // Netto steht in der Zone still
  assert.equal(sc.points[z.from].net, 540);
  assert.equal(sc.points[z.to].net, 540);
  assert.equal(sc.points[z.to + 1].net, 541);
  // Bei 17:30 kostet die Stufe 13 min
  const i = W.indexOf(sc, hm("17:30"));
  assert.deepEqual(W.tierPenalty(sc, i), { zone: z, minutes: 13 });
  assert.equal(sc.points[i].effectiveBreak, 48);
  assert.equal(W.tierPenalty(sc, z.from), null, "davor kostet sie nichts");
  assert.equal(W.zoneNear(sc, W.indexOf(sc, hm("16:41"))), z, "kommt als nächste");
  assert.equal(W.zoneNear(sc, W.indexOf(sc, hm("18:00"))), null, "liegt hinter uns");
});

test("Ohne erfasste Pause greifen alle drei Stufen nacheinander", () => {
  const rec = { date: "2026-10-15", start: "07:00", end: "16:00", breaks: [] };
  const sc = W.scan(rec, { settings: settings(), holiday: null, isToday: false });
  assert.deepEqual(sc.zones.map((z) => [at(sc, z.from), at(sc, z.to), z.require, z.extra]), [
    ["12:30", "12:45", 15, 15],
    ["14:15", "14:30", 30, 15],
    ["16:30", "17:00", 60, 30]
  ]);
});

test("Interessante Punkte: ±0, +1 h, max. 10 h, jetzt", () => {
  const sc = W.scan(RUNNING, runOpts({ base: { minutes: 3077, counts: true } }));
  assert.equal(at(sc, sc.marks.zero), "16:41");
  assert.equal(at(sc, sc.marks.plus), "18:06");
  assert.equal(sc.points[sc.marks.plus].balance, 60);
  assert.equal(at(sc, sc.marks.max), "18:42");
  assert.equal(sc.points[sc.marks.max].net, 600);
  assert.equal(sc.points[sc.marks.max + 1].overDaily, true);
  assert.equal(at(sc, sc.marks.now), "14:23");
  assert.equal(sc.marks.current, -1, "läuft noch — kein gespeichertes Gehen");
  assert.equal(sc.marks.account, -1, "+51 h lassen sich heute nicht abbauen");
  assert.equal(sc.points[sc.marks.zero].account, 3077);
});

test("Konto auf ±0: nur, wenn es heute erreichbar ist", () => {
  const sc = W.scan(RUNNING, runOpts({ base: { minutes: -90, counts: true } }));
  assert.equal(at(sc, sc.marks.account), "18:36", "16:41 + 1:30, die Stundenpause kostet 25 min");
  assert.equal(sc.points[sc.marks.account].account, 0);
  assert.equal(W.scan(RUNNING, runOpts({ base: { minutes: 20 * 60, counts: true } })).marks.account, -1);
  // Kontobeginn liegt nach dem Tag: der Stand bewegt sich nicht
  const before = W.scan(RUNNING, runOpts({ base: { minutes: -90, counts: false } }));
  assert.equal(before.marks.account, -1);
  assert.equal(before.points[0].account, -90);
});

test("Ruhezeit: letzte Stellung mit 11 h bis zum nächsten Kommen", () => {
  const sc = W.scan(RUNNING, runOpts({ nextStartTl: hm("06:30") + T.DAY }));
  assert.equal(at(sc, sc.marks.rest), "19:30");
  assert.equal(sc.points[sc.marks.rest].restShort, false);
  assert.equal(sc.points[sc.marks.rest + 1].restShort, true);
  assert.equal(sc.points[sc.marks.rest + 1].rest, 659);
  // Engine sieht es am Folgetag genauso
  const prev = E.computeDay(Object.assign({}, RUNNING, { end: "19:31" }), { settings: settings(), holiday: null, isToday: false });
  const next = E.computeDay({ date: "2026-10-17", start: "06:30", end: "12:00" }, { settings: settings(), holiday: null, isToday: false, prevEndTl: prev.endTl });
  assert.ok(next.warnings.some((w) => w.code === "rest-short" && w.minutes === 659));
  assert.equal(W.scan(RUNNING, runOpts()).marks.rest, -1, "ohne bekanntes nächstes Kommen keine Marke");
  assert.equal(W.scan(RUNNING, runOpts({ nextStartTl: hm("07:00") + T.DAY })).marks.rest, -1, "Grenze 20:00 liegt hinter dem Bereich");
});

test("Nachtschicht: Stellungen nach Mitternacht liegen über 1440", () => {
  const night = { date: "2026-06-05", start: "22:00", end: "06:00", breaks: [{ start: "02:00", end: "02:30" }] };
  const sc = W.scan(night, { settings: settings(), holiday: null, isToday: false });
  assert.equal(sc.positions[0], T.DAY + 2 * 60, "Kommen + 4 h = 02:00 am Folgetag");
  assert.equal(sc.positions[sc.positions.length - 1], T.DAY + 10 * 60);
  assert.equal(sc.positions[sc.marks.current], T.DAY + 6 * 60);
  assert.equal(sc.points[sc.marks.current].dayOffset, 1);
  assert.equal(sc.points[sc.marks.current].balance, -54);
  assert.equal(sc.positions[sc.marks.zero], T.DAY + 6 * 60 + 54);
  const hours = W.hoursOf(sc);
  assert.ok(hours.length >= 6);
  assert.ok(hours.every((h) => h.dayOffset === 1 && h.tl % 60 === 0));
});

test("Zeitumstellung: keine fehlende Stellung im Frühling, doppelte Stunde im Herbst", () => {
  const spring = { date: "2026-03-28", start: "21:00", end: "06:00", breaks: [] };
  const sp = W.scan(spring, { settings: settings(), holiday: null, isToday: false });
  assert.equal(sp.dst, true);
  assert.equal(T.formatHHMM(sp.positions[59]) + "→" + T.formatHHMM(sp.positions[60]), "01:59→03:00");
  sp.points.forEach((p, i) => assert.equal(p.presence, sp.lo + i, "jede Stellung eine echte Minute"));
  assert.ok(!sp.positions.some((tl) => tl >= T.DAY + 120 && tl < T.DAY + 180), "02:xx gibt es am 29.3. nicht");
  assert.equal(sp.points[sp.marks.current].presence, 8 * 60, "21:00–06:00 sind in dieser Nacht 8 h");
  assert.ok(!W.hoursOf(sp).some((h) => h.tl === T.DAY + 120), "keine Skalenmarke bei 02:00");

  const autumn = { date: "2026-10-24", start: "22:00", end: "06:00", breaks: [] };
  const au = W.scan(autumn, { settings: settings(), holiday: null, isToday: false });
  const twice = au.positions.filter((tl) => tl === T.DAY + 150);
  assert.equal(twice.length, 2, "02:30 kommt zweimal vor");
  assert.equal(au.points[au.marks.current].presence, 9 * 60);
  // Die Uhr springt einmal zurück (03:00 → 02:00), sonst steigt sie
  const back = au.positions.filter((tl, i) => i > 0 && tl < au.positions[i - 1]);
  assert.deepEqual(back, [T.DAY + 120]);
  assert.equal(W.indexOf(au, T.DAY + 150), au.positions.indexOf(T.DAY + 150), "02:30 findet die erste");
  assert.equal(T.formatHHMM(au.positions[W.indexOf(au, T.DAY + 210)]), "03:30");
});

test("Tag ohne Soll: kein ±0, Bereich ab Kommen + 4 h", () => {
  const sat = { date: "2026-09-19", start: "09:00", end: "13:00", breaks: [] };
  const sc = W.scan(sat, { settings: settings(), holiday: null, isToday: false });
  assert.equal(sc.marks.zero, -1);
  assert.equal(sc.lo, 3 * 60, "gespeichertes Gehen (4 h) mit einer Stunde Luft");
  assert.ok(sc.points.every((p) => p.balance >= 0));
});

test("Halber Ferientag: ±0 nach der halben Sollzeit", () => {
  const half = { date: "2026-04-24", type: "vacation", absenceFactor: 0.5, start: "07:30", end: "", breaks: [] };
  const sc = W.scan(half, { settings: settings(), holiday: null, isToday: false });
  assert.equal(at(sc, sc.marks.zero), "11:42", "4 h 12 min Arbeit, darunter keine Pflichtpause");
  assert.equal(sc.points[sc.marks.zero].balance, 0);
});

test("Bereich: 4–12 h, erweitert um gespeichertes Gehen, jetzt und ±0", () => {
  assert.deepEqual(W.spanFor([]), { lo: 240, hi: 720 });
  assert.deepEqual(W.spanFor([null, 500]), { lo: 240, hi: 720 });
  assert.deepEqual(W.spanFor([150]), { lo: 90, hi: 720 });
  assert.deepEqual(W.spanFor([700]), { lo: 240, hi: 765 });
  assert.deepEqual(W.spanFor([10]), { lo: 30, hi: 720 }, "nie kürzer als 30 min");
  assert.deepEqual(W.spanFor([1190]), { lo: 240, hi: 1200 }, "höchstens 20 h");
});

test("Kontostand danach: gekappt wie das Konto, Tag zählt nur ab Kontobeginn", () => {
  assert.equal(W.accountAfter(100, 30, {}), 130);
  assert.equal(W.accountAfter(100, 30, { capPlusMinutes: 120 }), 120);
  assert.equal(W.accountAfter(-100, -30, { capMinusMinutes: 120 }), -120);
  const s = settings({ carryOverMinutes: 60, carryOverFrom: "2026-10-01" });
  const days = {
    "2026-09-30": { date: "2026-09-30", start: "08:00", end: "18:00", breaks: [] },
    "2026-10-14": { date: "2026-10-14", start: "08:00", end: "18:00", breaks: [] },
    "2026-10-15": { date: "2026-10-15", start: "08:00", end: "16:00", breaks: [] }
  };
  const now = new Date(2026, 9, 16, 14, 23);
  const total = E.accountBalance(days, s, null, now).minutes;
  const base = W.baseBalance(days, s, "2026-10-15", now);
  const day = E.computeDay(days["2026-10-15"], { settings: s, now, isToday: false });
  assert.equal(base.counts, true);
  assert.equal(base.minutes + day.balance, total, "ohne den Tag + sein Saldo = Konto");
  assert.equal(W.baseBalance(days, s, "2026-09-30", now).counts, false, "vor dem Kontobeginn");
});

test("Kontostand danach: mit „fehlende Arbeitstage als Minus“ wird der Tag nicht zur Lücke", () => {
  const s = settings({ countMissingWorkdays: true, carryOverFrom: "2026-10-12" });
  const days = {
    "2026-10-12": { date: "2026-10-12", start: "08:00", end: "17:00", breaks: [{ start: "12:00", end: "12:30" }] },
    "2026-10-14": { date: "2026-10-14", start: "08:00", end: "", breaks: [] }
  };
  const now = new Date(2026, 9, 16, 14, 23);
  const base = W.baseBalance(days, s, "2026-10-12", now);
  const day = E.computeDay(days["2026-10-12"], { settings: s, now, isToday: false });
  assert.equal(base.minutes + day.balance, E.accountBalance(days, s, null, now).minutes);
});

test("Stellung finden: erste ab einer Zeit, sonst die letzte", () => {
  const sc = W.scan(RUNNING, runOpts());
  assert.equal(at(sc, W.indexOf(sc, hm("16:00"))), "16:00");
  assert.equal(W.indexOf(sc, T.DAY * 2), -1);
  assert.equal(W.clampIndex(sc, T.DAY * 2), sc.positions.length - 1);
  assert.equal(W.clampIndex(sc, 0), 0);
  assert.equal(W.fractionOf(sc, sc.positions[0]), 0);
  assert.equal(W.fractionOf(sc, sc.positions[sc.positions.length - 1]), 1);
  assert.equal(W.scan({ date: "2026-10-16", start: "" }, runOpts()), null);
});

test("Texte der Karte gibt es in allen vier Sprachen, mit denselben Platzhaltern", () => {
  const fs = require("fs");
  const path = require("path");
  const vm = require("vm");
  const I = require("../assets/js/ui/i18n.js");
  const sandbox = { ZK: { I18n: I } };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/ui/features/whatif.js"), "utf8"), sandbox, { filename: "whatif.js" });
  const keys = Object.keys(I.DICT.de).filter((k) => k.indexOf("wf.") === 0);
  assert.ok(keys.length >= 30, "Texte geladen");
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  ["en", "fr", "it"].forEach((lang) => {
    keys.forEach((k) => {
      assert.equal(typeof I.DICT[lang][k], "string", lang + " fehlt " + k);
      assert.equal(vars(I.DICT[lang][k]), vars(I.DICT.de[k]), lang + " " + k);
    });
  });
  keys.forEach((k) => assert.ok(!/ß/.test(I.DICT.de[k]), "Schweizer Schreibweise: " + k));
  // Genutzte, bestehende Schlüssel
  ["day.work", "day.break", "day.nextDay", "day.nextDays", "common.now", "common.undo", "app.name"].forEach((k) => {
    I.LANGS.forEach((lang) => assert.ok(I.DICT[lang][k], lang + " fehlt " + k));
  });
});
