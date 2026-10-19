"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const S = require("../assets/js/ui/views/today.js");

/* Zustandslogik der Ansicht „Heute“: Phase, Stempelleiste, Feierabend,
   Ring und was ein Stempel am Datensatz ändert. Gerechnet wird mit der
   echten Engine, damit Ansicht und Engine dieselbe Sprache sprechen.   */

function settings(patch) {
  return Object.assign(R.defaultSettings(), { autoHolidays: false }, patch || {});
}
const FR = "2026-10-16";                      // Freitag, Soll 8:24 = 504 min
const at = (h, m) => new Date(2026, 9, 16, h, m);
function day(rec, h, m, extra) {
  return E.computeDay(Object.assign({ date: FR, start: "", end: "", breaks: [] }, rec), Object.assign({
    settings: settings(), holiday: null, isToday: true, now: at(h, m)
  }, extra || {}));
}
function phaseOf(res, h, m, ctx) {
  const nowTl = S.nowOnTimeline(res, h * 60 + m);
  return S.phase(res, Object.assign({ isToday: true, canStamp: S.stampable(res), openBreak: S.openBreak(res, null, nowTl), nowTl: nowTl }, ctx || {}));
}
const ids = () => { let n = 0; return () => "x" + (++n); };

/* ---------------------------------------------------------------------- */
/* Stempeln                                                                */
/* ---------------------------------------------------------------------- */

test("Kommen ohne Eintrag setzt nur die Kommen-Zeit", () => {
  const step = S.stampPatch({ start: "", end: "", breaks: [] }, "in", 7 * 60 + 42);
  assert.equal(step.action, "in");
  assert.deepEqual(step.patch, { start: "07:42" });
});

test("Gehen während einer laufenden Pause beendet die Pause in derselben Minute", () => {
  const rec = { date: FR, start: "07:45", end: "", breaks: [{ id: "p", label: "Pause", start: "12:00", end: "", paid: false }] };
  const step = S.stampPatch(rec, "out", 17 * 60);
  assert.equal(step.action, "out");
  assert.equal(step.closedBreak, true);
  assert.equal(step.patch.end, "17:00");
  assert.equal(step.patch.breaks[0].end, "17:00");
  assert.equal(rec.breaks[0].end, "", "der Datensatz selbst bleibt unverändert");

  // Die Pause zählt danach als Pause, nicht als Arbeit: 4 h 15 statt 8 h 15
  const res = day(Object.assign({}, rec, step.patch), 17, 5);
  assert.equal(res.complete, true);
  assert.equal(res.net, 255);
  assert.equal(res.hasError, false);
});

test("Gehen ohne Kommen stempelt Kommen", () => {
  const step = S.stampPatch({ start: "", end: "", breaks: [] }, "out", 9 * 60);
  assert.equal(step.action, "in");
  assert.deepEqual(step.patch, { start: "09:00" });
});

test("Kommen nach Gehen: die Lücke wird zur Pause, der Tag läuft weiter", () => {
  const rec = { start: "07:42", end: "16:55", breaks: [{ id: "l", start: "12:05", end: "12:40", paid: true, note: "x" }] };
  const step = S.stampPatch(rec, "in", 17 * 60 + 30, { breakLabel: "Pause", makeId: ids() });
  assert.equal(step.action, "resume");
  assert.equal(step.gap, 35);
  assert.equal(step.patch.end, "");
  assert.equal(step.patch.breaks.length, 2);
  assert.deepEqual(step.patch.breaks[1], { id: "x1", label: "Pause", start: "16:55", end: "17:30", paid: false });
  assert.equal(step.patch.breaks[0].paid, true, "bezahlt bleibt bezahlt");
  assert.equal(step.patch.breaks[0].note, "x", "unbekannte Felder bleiben erhalten");
});

test("Kommen in derselben Minute wie Gehen hebt nur das Gehen auf", () => {
  const step = S.stampPatch({ start: "07:42", end: "16:55", breaks: [] }, "in", 16 * 60 + 55);
  assert.equal(step.action, "resume");
  assert.deepEqual(step.patch, { end: "" });
});

test("Kein Weiterarbeiten, wenn Gehen noch vor uns liegt oder der Tag nicht begonnen hat", () => {
  assert.equal(S.stampPatch({ start: "08:00", end: "17:00", breaks: [] }, "in", 10 * 60).action, "none");
  assert.equal(S.stampPatch({ start: "22:00", end: "06:00", breaks: [] }, "in", 14 * 60).action, "none");
  assert.equal(S.stampPatch({ start: "07:00", end: "08:00", breaks: [] }, "in", 21 * 60).action, "none", "mehr als 12 h Lücke");
  assert.equal(S.stampPatch({ start: "07:00", end: "", breaks: [] }, "in", 9 * 60).action, "none", "schon eingestempelt");
});

test("Pause starten und beenden — immer ein einziger Patch", () => {
  const start = S.stampPatch({ start: "07:42", end: "", breaks: [] }, "break", 12 * 60 + 5, { breakLabel: "Pause", makeId: ids() });
  assert.equal(start.action, "breakStart");
  assert.deepEqual(start.patch.breaks, [{ id: "x1", label: "Pause", start: "12:05", end: "", paid: false }]);
  assert.equal(start.patch.start, undefined);

  const end = S.stampPatch({ start: "07:42", end: "", breaks: start.patch.breaks }, "break", 12 * 60 + 40);
  assert.equal(end.action, "breakEnd");
  assert.equal(end.minutes, 35);
  assert.equal(end.patch.breaks[0].end, "12:40");

  const cold = S.stampPatch({ start: "", end: "", breaks: [] }, "break", 8 * 60);
  assert.equal(cold.stampedIn, true);
  assert.equal(cold.patch.start, "08:00", "Kommen und Pause in einem Schritt");

  const after = S.stampPatch({ start: "07:42", end: "16:55", breaks: [] }, "break", 17 * 60);
  assert.equal(after.action, "none");
});

/* ---------------------------------------------------------------------- */
/* Phase und Stempelleiste                                                 */
/* ---------------------------------------------------------------------- */

test("Phasen eines Arbeitstags", () => {
  assert.equal(phaseOf(day({}, 7, 31), 7, 31), "whatif");
  assert.equal(phaseOf(day({ start: "07:42" }, 14, 23), 14, 23), "running");
  assert.equal(phaseOf(day({ start: "07:42", breaks: [{ id: "p", start: "12:05", end: "" }] }, 12, 17), 12, 17), "break");
  assert.equal(phaseOf(day({ start: "07:42", breaks: [{ id: "l", start: "12:05", end: "12:40" }] }, 17, 30), 17, 30), "overtime");
  assert.equal(phaseOf(day({ start: "07:42", end: "16:55" }, 17, 5), 17, 5), "ended");
  assert.equal(phaseOf(day({ start: "08:00", end: "17:00" }, 10, 0), 10, 0), "planned");
  assert.equal(phaseOf(day({ start: "07:05" }, 9, 0, { isToday: false, now: new Date(2026, 9, 16, 9, 0) }), 9, 0, { isToday: false }), "incomplete");
});

test("Phasen von Abwesenheiten und freien Tagen", () => {
  assert.equal(phaseOf(day({ type: "vacation" }, 10, 0), 10, 0), "absence");
  assert.equal(phaseOf(day({ type: "comp" }, 10, 0), 10, 0), "comp");
  assert.equal(phaseOf(day({ type: "free" }, 10, 0), 10, 0), "free");
  // Halber Ferientag heute: die andere Hälfte wird gearbeitet → „Wenn du jetzt kommst“
  const half = day({ type: "vacation", absenceFactor: 0.5 }, 13, 0);
  assert.equal(S.stampable(half), true);
  assert.equal(S.neededNet(half), 252);
  assert.equal(phaseOf(half, 13, 0), "whatif");
  // Vergangener Arbeitstag ohne Eintrag
  assert.equal(phaseOf(day({}, 10, 0, { isToday: false }), 10, 0, { isToday: false }), "pending");
});

test("Stempelleiste: eine Hauptaktion, höchstens eine Nebenaktion, nie ausgegraut", () => {
  const ctx = { canStamp: true, isToday: true, started: true };
  assert.deepEqual(S.stampActions("whatif", ctx), { primary: "in", secondary: null, shifts: true });
  assert.deepEqual(S.stampActions("running", ctx), { primary: "out", secondary: "breakStart" });
  assert.deepEqual(S.stampActions("overtime", ctx), { primary: "out", secondary: "breakStart" });
  assert.deepEqual(S.stampActions("break", ctx), { primary: "breakEnd", secondary: "out" });
  assert.deepEqual(S.stampActions("ended", ctx), { primary: null, secondary: "resume" });
  assert.equal(S.stampActions("incomplete", ctx), null);
  assert.equal(S.stampActions("pending", ctx), null);
  assert.equal(S.stampActions("running", { canStamp: false }), null, "andere Tage: keine Leiste");
  assert.equal(S.stampActions("absence", { canStamp: true, isToday: false }), null);
  assert.equal(S.stampActions("planned", { canStamp: true, isToday: true, started: false }), null);
  ["in", "resume", "out", "breakStart", "breakEnd"].forEach((k) => {
    assert.ok(["in", "out", "break"].indexOf(S.ACTIONS[k].kind) >= 0);
  });
});

test("Gutschrift-Tage ohne Stempelrecht: keine Kommen-Aufforderung", () => {
  const vac = day({ type: "vacation" }, 10, 0);
  assert.equal(S.stampable(vac), false);
  assert.equal(S.stampActions(phaseOf(vac, 10, 0), { canStamp: S.stampable(vac), isToday: true }), null);
});

/* ---------------------------------------------------------------------- */
/* Feierabend und laufende Pause                                           */
/* ---------------------------------------------------------------------- */

test("Laufende Pause kommt aus der Engine, sonst aus dem Datensatz", () => {
  const res = day({ start: "07:42", breaks: [{ id: "p", start: "12:05", end: "" }] }, 12, 17);
  const ob = S.openBreak(res, null, 12 * 60 + 17);
  assert.equal(ob.start, "12:05");
  assert.equal(ob.minutes, 12);
  assert.equal(ob.ref, "p");

  // Engine-Stand ohne openBreak-Feld: aus dem Datensatz lesen
  const legacy = Object.assign({}, res);
  delete legacy.openBreak;
  const ob2 = S.openBreak(legacy, { breaks: [{ id: "p", start: "12:05", end: "" }] }, 12 * 60 + 17);
  assert.equal(ob2.startTl, 12 * 60 + 5);
  assert.equal(ob2.minutes, 12);
  // Nicht laufender Tag: offene Zeile ist keine laufende Pause
  assert.equal(S.openBreak(Object.assign({}, legacy, { running: false }), { breaks: [{ start: "12:05", end: "" }] }, 800), null);
});

test("Empfohlene Pause: Engine-Feld, sonst aus der Gehen-Zeit hergeleitet", () => {
  const res = day({ start: "07:31" }, 7, 31);
  assert.equal(S.recommendedBreak(res), res.recommendedBreak);
  assert.equal(S.recommendedBreak({ recommendedLeaveTl: 600 + 504 + 30, startTl: 600, target: 504, credited: 0, typeMeta: {} }), 30);
  assert.equal(S.recommendedBreak({ recommendedLeaveTl: null, startTl: 600 }), null);
});

test("Feierabend: vor dem Soll die Empfehlung, danach seit wann und wie viel darüber", () => {
  const running = day({ start: "07:42", breaks: [{ id: "l", start: "12:05", end: "12:40" }] }, 14, 23);
  const lv = S.leave(running, 14 * 60 + 23);
  assert.equal(lv.leaveTl, running.recommendedLeaveTl);
  assert.equal(lv.shifted, false);

  const late = day({ start: "07:42", breaks: [{ id: "l", start: "12:05", end: "12:40" }] }, 17, 0);
  const lv2 = S.leave(late, 17 * 60);
  assert.equal(late.remaining, 0);
  assert.equal(lv2.over, late.net - 504);
  assert.equal(lv2.reachedTl, late.recommendedLeaveTl, "erreicht zur empfohlenen Zeit");
});

test("Liegt die Empfehlung zurück und fehlt wieder Zeit, wird ab jetzt neu gerechnet", () => {
  const res = { running: true, remaining: 16, net: 488, target: 504, credited: 0, typeMeta: {}, recommendedLeaveTl: 16 * 60 + 41 };
  const lv = S.leave(res, 16 * 60 + 50);
  assert.equal(lv.shifted, true);
  assert.equal(lv.leaveTl, 17 * 60 + 6);
  // Vor der Empfehlung bleibt sie stehen (auch wenn jetzt+Rest früher wäre)
  const early = S.leave(Object.assign({}, res, { remaining: 300 }), 10 * 60);
  assert.equal(early.leaveTl, 16 * 60 + 41);
  assert.equal(early.shifted, false);
});

test("Während der Pause steht der Rest still, die Gehen-Zeit rückt nach", () => {
  const rec = { start: "08:00", breaks: [{ id: "p", start: "12:00", end: "" }] };
  const a = day(rec, 12, 40);
  const b = day(rec, 13, 0);
  assert.equal(a.remaining, b.remaining);
  assert.ok(b.recommendedLeaveTl > a.recommendedLeaveTl);
  assert.equal(phaseOf(b, 13, 0), "break");
});

test("Stillstand über der Pausenstufe wird erkannt (ungerundetes Netto)", () => {
  const res = { running: true, remaining: 0, net: 540, netRaw: 540 };
  const flat = S.plateauAhead(res, () => ({ running: true, netRaw: 540 }), 10);
  assert.deepEqual(flat, { inMin: 0 });
  const soon = S.plateauAhead(res, (m) => ({ running: true, netRaw: 540 + Math.min(m, 4) }), 10);
  assert.deepEqual(soon, { inMin: 4 });
  assert.equal(S.plateauAhead(res, (m) => ({ running: true, netRaw: 540 + m }), 10), null);
  assert.equal(S.plateauAhead(Object.assign({}, res, { remaining: 5 }), () => null, 10), null);
});

/* ---------------------------------------------------------------------- */
/* Ring                                                                    */
/* ---------------------------------------------------------------------- */

test("Ring: Ferien voll in der Farbe der Tagesart, Halbtag geteilt, Überzeit als zweite Runde", () => {
  const vac = day({ type: "vacation" }, 10, 0, { isToday: false });
  assert.deepEqual(S.ring(vac, "absence"), { credit: 1, work: 0, over: 0, total: 1, reached: true });

  const half = day({ type: "vacation", absenceFactor: 0.5, start: "07:30", end: "11:45" }, 13, 0, { isToday: false });
  const p = S.ring(half, "ended");
  assert.equal(p.credit, 0.5);
  assert.equal(p.work, 0.5, "Arbeit füllt den Rest bis zum vollen Ring");
  assert.ok(p.total > 1 && p.over > 0, "4 h 15 + 4 h 12 > 8 h 24");

  const over = S.ring({ target: 240, credited: 0, net: 511, typeMeta: {} }, "ended");
  assert.equal(over.over, 1, "die zweite Runde ist auf eine volle Runde begrenzt");
  assert.equal(S.ring({ target: 504, credited: 0, net: 0 }, "comp").credit, 1);
  assert.equal(S.ring({ target: 0, credited: 0, net: 30 }, "ended").total, null);
});

test("Ganztägige Gutschrift mit Stempelzeit: Restbedarf bleibt 0", () => {
  const res = day({ type: "training", start: "08:00", end: "12:00" }, 13, 0, { isToday: false });
  assert.ok(res.credited < res.target, "Engine kürzt die Gutschrift um die Stempelzeit");
  assert.equal(S.neededNet(res), 0);
  assert.equal(S.ring(res, "ended").total, 1);
});
