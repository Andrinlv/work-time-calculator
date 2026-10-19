"use strict";
/* Schichtplan. Diese Datei läuft in eigener Prozessumgebung (node --test
   startet je Datei einen Prozess) und stellt die Zeitzone fest auf Zürich —
   die Zeitumstellung soll überall gleich geprüft werden. */
process.env.TZ = "Europe/Zurich";

const test = require("node:test");
const assert = require("node:assert/strict");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const Rota = require("../assets/js/core/rota.js");
const S = require("../assets/js/data/store.js");

const TPL = R.defaultSettings().shiftTemplates;   // office, early, late, night
const tpl = (id) => TPL.find((t) => t.id === id);

/* 3-Schicht ab Montag, 5. Oktober 2026: KW 41 früh, KW 42 spät, KW 43 nacht */
const THREE = { enabled: true, anchor: "2026-10-05", cycle: Rota.preset("three-shift").cycle, name: "3-Schicht" };

function planOf(rota, from, to, records, holidays) {
  return Rota.plan(from, to, {
    rota: rota,
    templates: TPL,
    record: (iso) => (records && records[iso]) || null,
    holiday: (iso) => !!(holidays && holidays[iso])
  });
}
const idOf = (rota, iso, rec, holiday) => {
  const p = Rota.dayPlan(iso, { rota: rota, templates: TPL, record: rec || null, holiday: holiday || null });
  return Rota.hasShift(p) ? p.id : (p.free ? "free" : null);
};

test("Zeitzone ist Zürich", () => {
  assert.equal(new Date(2026, 6, 1).getTimezoneOffset(), -120);
});

/* ---------------------------------------------------------------------- */
/* Rhythmus                                                                */
/* ---------------------------------------------------------------------- */

test("Rhythmus: Tag 1 am Anker, wiederholt sich vorwärts und rückwärts", () => {
  assert.equal(Rota.cycleIndex(THREE, "2026-10-05"), 0);
  assert.equal(Rota.cycleIndex(THREE, "2026-10-12"), 7);
  assert.equal(Rota.cycleIndex(THREE, "2026-10-26"), 0, "nach 21 Tagen von vorn");
  assert.equal(Rota.cycleIndex(THREE, "2026-10-04"), 20, "Tag vor dem Anker = letzter Tag");
  assert.equal(Rota.cycleIndex(THREE, "2026-09-14"), 0, "drei Wochen vorher = Tag 1");
  assert.equal(idOf(THREE, "2026-10-19"), "night", "Mo KW 43");
  assert.equal(idOf(THREE, "2026-10-24"), "free", "Samstag frei");
  assert.equal(idOf(THREE, "2026-10-26"), "early");
  assert.equal(idOf(THREE, "2026-11-02"), "late");
});

test("Jahreswechsel: der Rhythmus läuft über Silvester und Schaltjahre weiter", () => {
  const r = { enabled: true, anchor: "2026-12-28", cycle: Rota.preset("three-shift").cycle };
  assert.equal(Rota.cycleIndex(r, "2026-12-31"), 3);
  assert.equal(Rota.cycleIndex(r, "2027-01-04"), 7);
  assert.equal(Rota.cycleIndex(r, "2027-01-18"), 0);
  assert.equal(idOf(r, "2027-01-01"), "early");
  assert.equal(idOf(r, "2027-01-11"), "night");
  // 2028 ist ein Schaltjahr: 63 Tage = drei volle Rhythmen
  const leap = { enabled: true, anchor: "2028-02-01", cycle: Rota.preset("three-shift").cycle };
  assert.equal(Rota.cycleIndex(leap, "2028-04-04"), 0);
  assert.equal(Rota.cycleIndex(leap, "2028-03-01"), 29 % 21);
});

test("Ausgeschaltet oder unvollständig: kein Plan, auch keine Abweichung", () => {
  const off = Object.assign({}, THREE, { enabled: false });
  assert.equal(Rota.isActive(off), false);
  assert.equal(Rota.dayPlan("2026-10-19", { rota: off, templates: TPL, record: { plan: "late" } }).source, null);
  assert.equal(Rota.isActive({ enabled: true, anchor: "2026-02-30", cycle: ["early"] }), false, "ungültiger Anker");
  assert.equal(Rota.isActive({ enabled: true, anchor: "2026-10-05", cycle: [] }), false, "leerer Rhythmus");
  assert.equal(Rota.isActive(null), false);
  const n = Rota.normalize({ enabled: true, anchor: "2026-10-05", cycle: new Array(50).fill("early").concat(["free", ""]) });
  assert.equal(n.cycle.length, Rota.MAX_CYCLE, "höchstens 42 Tage");
  assert.deepEqual(Rota.normalize({ cycle: ["free", "", null, " late "] }).cycle, [null, null, null, "late"]);
  assert.equal(Rota.normalize({}).skipHolidays, true, "Feiertage frei ist Standard");
});

test("Abweichung im Tagesdatensatz geht vor; „free“ heisst frei", () => {
  assert.equal(idOf(THREE, "2026-10-19", { plan: "late" }), "late");
  assert.equal(idOf(THREE, "2026-10-19", { plan: "free" }), "free");
  assert.equal(idOf(THREE, "2026-10-24", { plan: "early" }), "early", "Einsatz am Samstag");
  const p = Rota.dayPlan("2026-10-24", { rota: THREE, templates: TPL, record: { plan: "early" } });
  assert.equal(p.source, "override");
  assert.equal(Rota.dayPlan("2026-10-24", { rota: THREE, templates: TPL, record: {} }).source, "cycle");
});

test("Gelöschte Vorlage: geplant, aber keine Schicht", () => {
  const r = { enabled: true, anchor: "2026-10-05", cycle: ["gone", "early"] };
  const p = Rota.dayPlan("2026-10-05", { rota: r, templates: TPL });
  assert.equal(p.missing, true);
  assert.equal(p.tpl, null);
  assert.equal(Rota.hasShift(p), false);
  assert.equal(Rota.hasShift(Rota.dayPlan("2026-10-06", { rota: r, templates: TPL })), true);
});

test("Ferien und Krankheit setzen die Schicht aus, ein halber Tag nicht", () => {
  const vac = Rota.dayPlan("2026-10-19", { rota: THREE, templates: TPL, record: { type: "vacation" } });
  assert.equal(vac.off, "absence");
  assert.equal(Rota.hasShift(vac), false);
  const half = Rota.dayPlan("2026-10-19", { rota: THREE, templates: TPL, record: { type: "vacation", absenceFactor: 0.5 } });
  assert.equal(half.off, null);
  assert.equal(Rota.dayPlan("2026-10-19", { rota: THREE, templates: TPL, record: { type: "work" } }).off, null);
});

test("Feiertag: der Rhythmus pausiert nur, wenn so eingestellt; eine Abweichung gilt immer", () => {
  assert.equal(Rota.dayPlan("2026-10-19", { rota: THREE, templates: TPL, holiday: { name: "x" } }).off, "holiday");
  const keep = Object.assign({}, THREE, { skipHolidays: false });
  assert.equal(Rota.dayPlan("2026-10-19", { rota: keep, templates: TPL, holiday: { name: "x" } }).off, null);
  assert.equal(Rota.dayPlan("2026-10-19", { rota: THREE, templates: TPL, holiday: true, record: { plan: "night" } }).off, null);
});

/* ---------------------------------------------------------------------- */
/* Zeiten                                                                  */
/* ---------------------------------------------------------------------- */

test("Schichtzeiten: Nachtschicht über Mitternacht, Pause nach Mitternacht", () => {
  const st = Rota.shiftTimes(tpl("night"));
  assert.deepEqual(st, { start: 1320, end: 1800, breakStart: 1560, breakEnd: 1590, paid: false });
  const iv = Rota.interval("2026-10-19", tpl("night"));
  assert.equal(iv.span, 480);
  assert.equal(iv.net, 450);
  assert.equal(iv.overnight, true);
  assert.equal(Rota.interval("2026-10-19", tpl("early")).net, 480);
  assert.equal(Rota.interval("2026-10-19", Object.assign({}, tpl("early"), { breakPaid: true })).net, 510, "bezahlte Pause zählt mit");
  assert.equal(Rota.shiftTimes({ start: "08:00", end: "08:00" }), null);
  assert.equal(Rota.shiftTimes({ start: "x", end: "17:00" }), null);
  // Pause ausserhalb der Schicht zählt nicht
  assert.equal(Rota.shiftTimes({ start: "06:00", end: "14:30", breakStart: "05:00", breakEnd: "05:30" }).breakStart, null);
  // bis Mitternacht
  assert.equal(Rota.shiftTimes({ start: "16:00", end: "00:00" }).end, 1440);
  assert.equal(Rota.interval("2026-10-19", { start: "16:00", end: "00:00" }).overnight, true);
});

test("Zeitumstellung im Herbst: die Nachtschicht dauert eine Stunde länger", () => {
  // Sa 24.10.2026 22:00 bis So 25.10. 06:00 — um 03:00 springt die Uhr auf 02:00
  const iv = Rota.interval("2026-10-24", tpl("night"));
  assert.equal(iv.span, 540);
  assert.equal(iv.breakMinutes, 30);
  assert.equal(iv.net, 510);
  assert.equal(iv.end, 1800, "Wanduhr bleibt 06:00");
});

test("Zeitumstellung im Frühling: die Nachtschicht dauert eine Stunde weniger", () => {
  const iv = Rota.interval("2026-03-28", tpl("night"));
  assert.equal(iv.span, 420);
  assert.equal(iv.net, 390);
  // Tagschicht am Umstellungstag selbst bleibt unberührt
  assert.equal(Rota.interval("2026-03-29", tpl("early")).net, 480);
});

/* ---------------------------------------------------------------------- */
/* Ruhezeit                                                                */
/* ---------------------------------------------------------------------- */

test("Ruhezeit: Spät, dann Früh am Folgetag ist zu kurz; ein freier Tag dazwischen genügt", () => {
  // KW 42 spät: Di 13.10. auf Früh getauscht → Mo spät (bis 22:30) → Di 06:00 = 7 h 30
  const recs = { "2026-10-13": { plan: "early" } };
  const entries = planOf(THREE, "2026-10-12", "2026-10-18", recs);
  const c = Rota.restConflicts(entries, 11);
  assert.equal(c.length, 1);
  assert.deepEqual(
    { from: c[0].from, to: c[0].to, rest: c[0].rest, need: c[0].need, fromId: c[0].fromId, toId: c[0].toId, overlap: c[0].overlap },
    { from: "2026-10-12", to: "2026-10-13", rest: 450, need: 660, fromId: "late", toId: "early", overlap: false }
  );
  // Di frei statt früh: Mo spät → Mi spät, weit über 11 h
  const free = planOf(THREE, "2026-10-12", "2026-10-18", { "2026-10-13": { plan: "free" } });
  assert.equal(Rota.restConflicts(free, 11).length, 0);
  // Früh → Spät am nächsten Tag ist kein Problem (14:30 → 14:00 = 23 h 30)
  const fwd = planOf(THREE, "2026-10-09", "2026-10-12", { "2026-10-09": { plan: "early" } });
  assert.equal(Rota.restConflicts(fwd, 11).length, 0);
});

test("Ruhezeit: Mindestruhe aus den Einstellungen, 0 oder leer gilt als 11 h", () => {
  const recs = { "2026-10-13": { plan: "early" } };
  const entries = planOf(THREE, "2026-10-12", "2026-10-13", recs);
  assert.equal(Rota.restConflicts(entries, 7).length, 0, "7 h genügen bei 7 h 30");
  assert.equal(Rota.restConflicts(entries, 8).length, 1);
  assert.equal(Rota.restConflicts(entries, 0)[0].need, 660);
  assert.equal(Rota.restConflicts(entries)[0].need, 660);
});

test("Ruhezeit: Überschneidung wird als solche gemeldet", () => {
  const long = { id: "long", name: "Lang", start: "21:00", end: "07:00" };
  const r = { enabled: true, anchor: "2026-10-05", cycle: ["long", "early"] };
  const entries = Rota.plan("2026-10-05", "2026-10-06", { rota: r, templates: TPL.concat([long]) });
  const c = Rota.restConflicts(entries, 11);
  assert.equal(c.length, 1);
  assert.equal(c[0].rest, -60);
  assert.equal(c[0].overlap, true);
});

test("Ruhezeit über die Zeitumstellung zählt echte Stunden", () => {
  const swap = { enabled: true, anchor: "2026-10-24", cycle: ["late", "early"] };
  // Herbst: Sa 22:30 → So 06:00 sind 8 h 30 statt 7 h 30
  const autumn = Rota.restConflicts(Rota.plan("2026-10-24", "2026-10-25", { rota: swap, templates: TPL }), 11);
  assert.equal(autumn[0].rest, 510);
  // Frühling: 6 h 30
  const spring = Object.assign({}, swap, { anchor: "2026-03-28" });
  const c = Rota.restConflicts(Rota.plan("2026-03-28", "2026-03-29", { rota: spring, templates: TPL }), 11);
  assert.equal(c[0].rest, 390);
});

test("Die mitgelieferten Rhythmen halten die Ruhezeit ein", () => {
  ["early-late", "three-shift", "office"].forEach((key) => {
    const r = { enabled: true, anchor: "2026-01-05", cycle: Rota.preset(key).cycle };
    const entries = planOf(r, "2026-01-01", "2026-12-31");
    assert.deepEqual(Rota.restConflicts(entries, 11), [], key);
  });
});

/* ---------------------------------------------------------------------- */
/* Wochenstunden                                                           */
/* ---------------------------------------------------------------------- */

test("Wochenstunden: 3-Schicht ergibt 40 / 40 / 37.5 h", () => {
  const w = Rota.weeklyLoad(planOf(THREE, "2026-10-05", "2026-10-25"), 45 * 60);
  assert.deepEqual(w.map((x) => [x.start, x.net, x.shifts, x.days, x.over]), [
    ["2026-10-05", 2400, 5, 7, 0],
    ["2026-10-12", 2400, 5, 7, 0],
    ["2026-10-19", 2250, 5, 7, 0]
  ]);
});

test("Wochenstunden über der Höchstarbeitszeit", () => {
  const recs = { "2026-10-10": { plan: "early" }, "2026-10-11": { plan: "early" } };
  const w = Rota.weeklyLoad(planOf(THREE, "2026-10-05", "2026-10-11", recs), 45 * 60);
  assert.equal(w[0].net, 56 * 60);
  assert.equal(w[0].over, 11 * 60);
  assert.equal(Rota.weeklyLoad(planOf(THREE, "2026-10-05", "2026-10-11", recs), 0)[0].over, 0, "ohne Grenze kein Überschuss");
});

test("Wochenstunden über den Jahreswechsel: KW 53 von 2026 reicht bis 3. Januar", () => {
  const r = { enabled: true, anchor: "2026-12-28", cycle: [null, null, null, null, null, null, "night"] };
  const w = Rota.weeklyLoad(planOf(r, "2026-12-28", "2027-01-10"), 50 * 60);
  assert.equal(T.isoWeek("2026-12-28"), 53);
  assert.deepEqual(w.map((x) => [x.start, x.end, x.shifts]), [["2026-12-28", "2027-01-03", 1], ["2027-01-04", "2027-01-10", 1]]);
  // Nachtschicht So 3.1. → Mo 4.1. zählt zur Woche ihres Beginns
  assert.equal(w[0].net, 450);
});

test("Wochenstunden in der Woche der Zeitumstellung zählen die echte Nacht", () => {
  const r = { enabled: true, anchor: "2026-10-19", cycle: Rota.preset("three-shift").cycle.slice(14).concat(Rota.preset("three-shift").cycle.slice(0, 14)) };
  const recs = { "2026-10-24": { plan: "night" } };
  const w = Rota.weeklyLoad(planOf(r, "2026-10-19", "2026-10-25", recs), 0);
  assert.equal(w[0].net, 5 * 450 + 510);
});

/* ---------------------------------------------------------------------- */
/* Rhythmus bearbeiten                                                     */
/* ---------------------------------------------------------------------- */

test("Vorlagen: drei Rhythmen, je aus ganzen Wochen ab Montag", () => {
  assert.equal(Rota.preset("early-late").cycle.length, 14);
  assert.equal(Rota.preset("three-shift").cycle.length, 21);
  assert.equal(Rota.preset("office").cycle.length, 7);
  assert.equal(Rota.preset("nope"), null);
  const p = Rota.preset("office");
  p.cycle[0] = "x";
  assert.equal(Rota.preset("office").cycle[0], "office", "Kopie, keine Referenz");
  assert.equal(Rota.matchPreset(Rota.preset("three-shift").cycle), "three-shift");
  assert.equal(Rota.matchPreset(["early"]), null);
});

test("Raster: Länge ändern, Zelle weiterschalten, Wochen erkennen", () => {
  assert.deepEqual(Rota.resize(["early"], 3), ["early", null, null]);
  assert.deepEqual(Rota.resize(["early", "late", "night"], 2), ["early", "late"]);
  assert.equal(Rota.resize([], 0).length, 1);
  assert.equal(Rota.resize([], 99).length, 42);
  assert.equal(Rota.nextInCycle(null, TPL), "office");
  assert.equal(Rota.nextInCycle("office", TPL), "early");
  assert.equal(Rota.nextInCycle("night", TPL), null, "nach der letzten Vorlage wieder frei");
  assert.equal(Rota.nextInCycle("gone", TPL), null);
  assert.equal(Rota.nextInCycle(null, []), null);
  assert.deepEqual(Rota.weeks(Rota.preset("three-shift").cycle), [
    { index: 0, main: "early" }, { index: 1, main: "late" }, { index: 2, main: "night" }
  ]);
  assert.equal(Rota.weeks(["early", "late"]), null);
});

test("Rhythmuswoche: diese Woche festlegen verschiebt den Anker um ganze Wochen", () => {
  assert.equal(Rota.weekOf(THREE, "2026-10-16", 1), 1, "KW 42 ist Woche 2 (spät)");
  assert.equal(Rota.weekOf(THREE, "2026-10-19", 1), 2);
  const anchor = Rota.anchorForWeek("2026-10-16", 2, 1);
  assert.equal(anchor, "2026-09-28");
  assert.equal(Rota.weekOf(Object.assign({}, THREE, { anchor: anchor }), "2026-10-16", 1), 2);
  assert.equal(idOf(Object.assign({}, THREE, { anchor: anchor }), "2026-10-16"), "night");
  assert.equal(Rota.weekOf(Object.assign({}, THREE, { anchor: "2026-10-06" }), "2026-10-16", 1), null, "Anker kein Montag");
  assert.equal(Rota.weekOf({ enabled: true, anchor: "2026-10-05", cycle: ["early", "late"] }, "2026-10-16", 1), null);
  assert.equal(Rota.anchorForWeek("2026-10-16", 0, 0), "2026-10-11", "Woche ab Sonntag");
});

test("Fehlende Vorlagen werden aus den mitgelieferten ergänzt", () => {
  const own = TPL.filter((t) => t.id !== "night");
  const r = Rota.ensureTemplates(own, ["early", "late", "night"], TPL);
  assert.deepEqual(r.added, ["night"]);
  assert.equal(r.templates.length, 4);
  assert.equal(own.length, 3, "Eingabe bleibt unverändert");
  assert.deepEqual(Rota.ensureTemplates(TPL, ["early"], TPL).added, []);
});

test("Kurzzeichen: übersetzt für mitgelieferte, sonst eindeutige Anfangsbuchstaben", () => {
  const fixed = { office: "B", early: "F", late: "S", night: "N" };
  const own = TPL.concat([
    { id: "a", name: "Samstag" },
    { id: "b", name: "Spezial" },
    { id: "c", name: "Sp" },
    { id: "d", name: "Frühdienst kurz" },
    { id: "e", name: "  " }
  ]);
  const c = Rota.codes(own, (t) => t.name, fixed);
  assert.equal(c.early, "F");
  assert.equal(c.night, "N");
  assert.equal(c.a, "Sa");
  assert.equal(c.b, "Sp");
  assert.equal(c.c, "S2", "S und Sp sind vergeben");
  assert.equal(c.d, "Fr");
  assert.equal(c.e, "?");
  const codesSeen = Object.values(c).map((x) => x.toUpperCase());
  assert.equal(new Set(codesSeen).size, codesSeen.length, "alle verschieden");
});

/* ---------------------------------------------------------------------- */
/* Abweichungen speichern                                                  */
/* ---------------------------------------------------------------------- */

test("Abweichung: nur wenn sie vom Rhythmus abweicht", () => {
  assert.equal(Rota.overrideFor(THREE, "2026-10-19", "night"), null, "Rhythmus sieht schon Nacht vor");
  assert.equal(Rota.overrideFor(THREE, "2026-10-19", "early"), "early");
  assert.equal(Rota.overrideFor(THREE, "2026-10-24", "free"), null, "Samstag ist schon frei");
  assert.equal(Rota.overrideFor(THREE, "2026-10-19", "free"), "free");
  assert.equal(Rota.overrideFor(THREE, "2026-10-19", null), null);
});

test("Abweichung am Feiertag: die Schicht des Rhythmus braucht dann eine Abweichung", () => {
  assert.equal(Rota.overrideFor(THREE, "2026-10-19", "night", { name: "x" }), "night", "Rhythmus pausiert");
  assert.equal(Rota.overrideFor(THREE, "2026-10-19", "free", { name: "x" }), null, "frei ist dann schon so");
  const keep = Object.assign({}, THREE, { skipHolidays: false });
  assert.equal(Rota.overrideFor(keep, "2026-10-19", "night", { name: "x" }), null, "Rhythmus läuft weiter");
  const p = Rota.dayPlan("2026-10-19", { rota: THREE, templates: TPL, holiday: true, record: { plan: "night" } });
  assert.equal(Rota.hasShift(p), true);
});

test("Ein Tag, der nur die Planung trägt, darf beim Zurücksetzen weg", () => {
  assert.equal(Rota.onlyPlan({ date: "2026-10-19", plan: "early", breaks: [], updatedAt: "x" }), true);
  assert.equal(Rota.onlyPlan({ date: "2026-10-19", plan: "early", location: "office", absenceFactor: 1, note: "" }), true);
  assert.equal(Rota.onlyPlan({ date: "2026-10-19", plan: "early", start: "06:00" }), false);
  assert.equal(Rota.onlyPlan({ date: "2026-10-19", plan: "early", note: "Tausch mit Ana" }), false);
  assert.equal(Rota.onlyPlan({ date: "2026-10-19", plan: "early", location: "home" }), false);
  assert.equal(Rota.onlyPlan(null), false);
});

test("Rhythmus und Abweichung überleben Speichern, Laden und Sicherung", () => {
  const backend = S.memoryBackend();
  const a = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  a.load();
  a.updateSettings({ rota: THREE });
  a.setDay("2026-10-24", { plan: "early" });
  a.flush();
  const b = S.createStore({ backend: backend, defaultSettings: R.defaultSettings });
  b.load();
  assert.equal(b.getDay("2026-10-24").plan, "early");
  assert.deepEqual(b.getSettings().rota, THREE);

  const c = S.createStore({ backend: S.memoryBackend(), defaultSettings: R.defaultSettings });
  c.load();
  c.importState(JSON.parse(JSON.stringify(b.exportState())), "replace");
  assert.equal(c.getDay("2026-10-24").plan, "early");
  assert.deepEqual(c.getSettings().rota, THREE);
});

/* ---------------------------------------------------------------------- */
/* Oberfläche: Palette, Karte in „Heute“, Texte, Einbindung                */
/* ---------------------------------------------------------------------- */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const RU = require("../assets/js/ui/features/rota.js");

const NAMES = { office: "Büro", early: "Frühschicht", late: "Spätschicht", night: "Nachtschicht" };
const TRANS = {
  office: ["Büro", "Office", "Bureau", "Ufficio"],
  early: ["Frühschicht", "Early shift", "Équipe du matin", "Turno mattutino"],
  late: ["Spätschicht", "Late shift", "Équipe du soir", "Turno serale"],
  night: ["Nachtschicht", "Night shift", "Équipe de nuit", "Turno notturno"]
};
const WORDS = RU.wordsFor(TPL, (t) => NAMES[t.id] || t.name, { office: "B", early: "F", late: "S", night: "N" }, TRANS);
const cmd = (q) => RU.parseCommand(q, { today: "2026-10-16", words: WORDS, order: TPL.map((t) => t.id) });

test("Palette: Datum und Schicht in beliebiger Reihenfolge, in allen Sprachen", () => {
  assert.deepEqual(cmd("plan 23.10. nacht"), { lead: "full", date: "2026-10-23", target: "night", rest: [] });
  assert.equal(cmd("Schicht morgen frei").target, "free");
  assert.equal(cmd("Schicht morgen frei").date, "2026-10-17");
  assert.equal(cmd("plan spät 23.10.").date, "2026-10-23");
  assert.equal(cmd("plan spät 23.10.").target, "late");
  assert.equal(cmd("plan montag f").date, "2026-10-19", "nächster Montag");
  assert.equal(cmd("plan montag f").target, "early", "Kürzel");
  assert.equal(cmd("plan fr N").date, "2026-10-16", "heute ist Freitag");
  assert.equal(cmd("plan fr N").target, "night");
  assert.equal(cmd("équipe demain nuit").target, "night");
  assert.equal(cmd("équipe demain nuit").date, "2026-10-17");
  assert.equal(cmd("turno domani notturno").target, "night", "„Turno“ allein trifft keine Vorlage");
  assert.equal(cmd("turno domani mattina").target, "early");
  assert.equal(cmd("shift tomorrow late").target, "late");
  assert.equal(cmd("plan 2.11. rhythmus").target, "reset");
  assert.equal(cmd("plan 2.11. nachtschicht").target, "night");
  assert.equal(cmd("plan 2.11. büro").target, "office");
});

test("Palette: ohne Jahr ist der nächste solche Tag gemeint", () => {
  assert.equal(cmd("plan 5.1. früh").date, "2027-01-05");
  assert.equal(cmd("plan 5.1.2026 früh").date, "2026-01-05", "ausdrückliches Jahr bleibt");
  assert.equal(cmd("plan 2026-11-02 früh").date, "2026-11-02");
  assert.equal(cmd("plan 16.10. früh").date, "2026-10-16", "heute selbst");
});

test("Palette: nur mit einleitendem Wort, sonst nichts", () => {
  assert.equal(cmd("ferien morgen"), null);
  assert.equal(cmd(""), null);
  assert.deepEqual(cmd("plan"), { lead: "full", date: null, target: null, rest: [] });
  assert.equal(cmd("pla").lead, "partial");
  assert.equal(cmd("pl"), null, "zwei Buchstaben sind zu wenig");
  assert.deepEqual(cmd("plan 23.10. quatsch nacht").rest, ["quatsch"]);
});

const early = { tpl: tpl("early"), id: "early", off: null };
const night = { tpl: tpl("night"), id: "night", off: null };

test("Heute: ohne Eintrag „Übernehmen“, nach dem Einstempeln das Schichtende", () => {
  assert.deepEqual(RU.todayModel({ entry: early, rec: {} }), { mode: "prefill" });
  assert.deepEqual(RU.todayModel({ entry: early, rec: { plan: "early", breaks: [] } }), { mode: "prefill" });
  assert.equal(RU.todayModel({ entry: early, rec: { type: "vacation" } }), null);
  assert.equal(RU.todayModel({ entry: Object.assign({}, early, { off: "absence" }), rec: {} }), null);
  assert.equal(RU.todayModel({ entry: { tpl: null, free: true }, rec: {} }), null);
  // Kommen 07:42, Feierabend 16:41 → Plan endet 2 h 11 min früher
  assert.deepEqual(
    RU.todayModel({ entry: early, rec: { start: "07:42" }, phase: "running", leave: { leaveTl: 1001 } }),
    { mode: "running", endTl: 870, leaveTl: 1001, diff: -131 }
  );
  assert.equal(RU.todayModel({ entry: early, rec: { start: "06:02" }, phase: "running", leave: { leaveTl: 872 } }), null, "bis 5 min gilt als gleich");
  assert.equal(RU.todayModel({ entry: early, rec: { start: "06:00", end: "14:30" }, phase: "ended", leave: {} }), null);
  assert.equal(RU.todayModel({ entry: early, rec: { start: "06:00" }, phase: "overtime", leave: { leaveTl: null, reachedTl: 800 } }).diff, 70);
});

test("Heute: Nachtschicht vergleicht auf der Zeitachse über Mitternacht", () => {
  const m = RU.todayModel({ entry: night, rec: { start: "22:00" }, phase: "running", leave: { leaveTl: 1700 } });
  assert.equal(m.endTl, 1800);
  assert.equal(m.diff, 100);
});

test("Konflikte je Tag: vor und nach der Schicht", () => {
  const list = [{ from: "2026-10-12", to: "2026-10-13" }, { from: "2026-10-13", to: "2026-10-14" }];
  const c = RU.conflictsFor(list, "2026-10-13");
  assert.equal(c.before, list[0]);
  assert.equal(c.after, list[1]);
  assert.deepEqual(RU.conflictsFor(list, "2026-10-20"), { before: null, after: null });
});

const LANGS = ["de", "en", "fr", "it"];
function parity(dict, label) {
  const keys = Object.keys(dict.de).sort();
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(dict[lang]).sort(), keys, label + " " + lang);
    for (const k of keys) {
      assert.ok(String(dict[lang][k]).trim(), label + " " + lang + " " + k);
      assert.equal(holes(dict[lang][k]), holes(dict.de[k]), label + " " + lang + " " + k);
    }
  }
  for (const k of keys) assert.ok(!/ß/.test(dict.de[k]), label + " " + k);
}

test("Texte in allen vier Sprachen, gleiche Platzhalter, Schweizer Schreibweise", () => {
  parity(RU.STRINGS, "rota");
  for (const lang of LANGS) {
    const codes = ["office", "early", "late", "night"].map((id) => RU.STRINGS[lang]["rota.code." + id]);
    assert.equal(new Set(codes).size, 4, lang + ": Kürzel eindeutig");
  }
});

test("Onboarding: neue Frage in allen vier Sprachen", () => {
  let added = null;
  const sandbox = { ZK: { Dom: {}, Time: T, Rules: R, Holidays: {}, I18n: { add: (d) => { added = d; } } } };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/ui/onboarding.js"), "utf8"), sandbox);
  assert.ok(added && added.de["onb.step.work"]);
  parity(added, "onb");
  assert.equal(typeof sandbox.ZK.Onboarding.open, "function");
});

test("Skripte eingebunden: Logik nach dem Planer, Oberfläche vor dem App-Start, offline verfügbar", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const at = (f) => html.indexOf('<script src="' + f + '"></script>');
  assert.ok(at("assets/js/core/rota.js") > at("assets/js/core/planner.js"));
  assert.ok(at("assets/js/core/rota.js") < at("assets/js/ui/onboarding.js"), "das Onboarding nutzt die Vorlagen");
  assert.ok(at("assets/js/ui/features/rota.js") > at("assets/js/ui/views/settings.js"));
  assert.ok(at("assets/js/ui/features/rota.js") < at("assets/js/ui/app.js"));
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.indexOf('"./assets/js/core/rota.js"') > 0);
  assert.ok(sw.indexOf('"./assets/js/ui/features/rota.js"') > 0);
  // Die Woche weitet ihren Massstab für geplante Schichten und gibt ihn den Dekorierern mit
  const week = fs.readFileSync(path.join(root, "assets/js/ui/views/week.js"), "utf8");
  assert.ok(week.indexOf('ZK.Ext.collect("week.span"') > 0);
  assert.ok(/decorate\("week\.row", row, \{[^}]*scale:/.test(week));
});
