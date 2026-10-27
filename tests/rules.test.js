"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../assets/js/core/rules.js");

test("Schweizer Pausenstaffel (ArG Art. 15)", () => {
  assert.equal(R.requiredBreak(300, "ch"), 0, "5 h → keine Pflichtpause");
  assert.equal(R.requiredBreak(330, "ch"), 0, "genau 5.5 h → noch keine");
  assert.equal(R.requiredBreak(331, "ch"), 15);
  assert.equal(R.requiredBreak(420, "ch"), 15, "genau 7 h");
  assert.equal(R.requiredBreak(421, "ch"), 30);
  assert.equal(R.requiredBreak(540, "ch"), 30, "genau 9 h");
  assert.equal(R.requiredBreak(541, "ch"), 60);
  assert.equal(R.requiredBreak(720, "ch"), 60);
});

test("Deutsche Pausenstaffel (ArbZG §4)", () => {
  assert.equal(R.requiredBreak(360, "de"), 0, "genau 6 h");
  assert.equal(R.requiredBreak(361, "de"), 30);
  assert.equal(R.requiredBreak(540, "de"), 30);
  assert.equal(R.requiredBreak(541, "de"), 45);
});

test("Österreichische Pausenstaffel und Sonderfälle", () => {
  assert.equal(R.requiredBreak(400, "at"), 30);
  assert.equal(R.requiredBreak(1000, "none"), 0, "ohne Vorgabe nie eine Pflichtpause");
  assert.equal(R.requiredBreak(10, "fixed30"), 30, "pauschal immer 30 Minuten");
});

test("Eigene Staffel wird verwendet", () => {
  const tiers = [{ over: 240, require: 20 }, { over: 480, require: 45 }];
  assert.equal(R.requiredBreak(200, "custom", tiers), 0);
  assert.equal(R.requiredBreak(300, "custom", tiers), 20);
  assert.equal(R.requiredBreak(500, "custom", tiers), 45);
});

test("nextBreakTier zeigt die nächste Schwelle", () => {
  assert.equal(R.nextBreakTier(300, "ch").over, 330);
  assert.equal(R.nextBreakTier(400, "ch").require, 30);
  assert.equal(R.nextBreakTier(700, "ch"), null, "oberhalb der letzten Stufe gibt es keine mehr");
});

test("weeklyPreset verteilt exakt ohne Rundungsverlust", () => {
  const map = R.weeklyPreset(42 * 60, [1, 2, 3, 4, 5]);
  assert.equal(map.reduce((a, b) => a + b, 0), 2520);
  assert.equal(map[1], 504);
  assert.equal(map[0], 0, "Sonntag frei");
  assert.equal(map[6], 0, "Samstag frei");

  // Ein Wert, der sich nicht glatt teilen lässt
  const odd = R.weeklyPreset(41 * 60 + 7, [1, 2, 3, 4, 5]);
  assert.equal(odd.reduce((a, b) => a + b, 0), 41 * 60 + 7, "der Rest darf nicht verschwinden");
});

test("weeklyPreset funktioniert auch mit Sechs-Tage-Woche", () => {
  const map = R.weeklyPreset(45 * 60, [1, 2, 3, 4, 5, 6]);
  assert.equal(map.reduce((a, b) => a + b, 0), 2700);
  assert.ok(map[6] > 0);
});

test("baseTargetFor skaliert mit dem Beschäftigungsgrad", () => {
  const s = R.defaultSettings();
  assert.equal(R.baseTargetFor("2026-08-06", s, 4), 504, "Donnerstag voll");
  assert.equal(R.baseTargetFor("2026-08-08", s, 6), 0, "Samstag ohne Soll");

  s.workloadPercent = 60;
  assert.equal(R.baseTargetFor("2026-08-06", s, 4), 302, "60 % von 504");
});

test("weeklyTargetMinutes berücksichtigt das Pensum", () => {
  const s = R.defaultSettings();
  assert.equal(R.weeklyTargetMinutes(s), 2520);
  s.workloadPercent = 80;
  // Summe der je Tag gerundeten Sollzeiten (5 × 403) — wie Woche und Tage
  assert.equal(R.weeklyTargetMinutes(s), 2015);
  assert.equal(R.weeklyTargetMinutes(s), R.contractFor("2026-11-02", "2026-11-08", s).minutes);
});

test("Tagesarten tragen die richtige Wirkung", () => {
  assert.equal(R.dayType("work").credits, false);
  assert.equal(R.dayType("vacation").credits, true);
  assert.equal(R.dayType("comp").credits, false, "Kompensation wird nicht gutgeschrieben");
  assert.equal(R.dayType("comp").targetFactor, 1, "das Soll bleibt bestehen");
  assert.equal(R.dayType("unpaid").targetFactor, 0);
  assert.equal(R.dayType("free").targetFactor, 0);
  assert.equal(R.dayType("quatsch").key, "work", "unbekannte Arten fallen auf Arbeit zurück");
});

test("weeklyTargetMinutes: 0 % ist 0, nicht 100 %", () => {
  const s = R.defaultSettings();
  s.workloadPercent = 0;
  assert.equal(R.weeklyTargetMinutes(s), 0);
  assert.equal(R.baseTargetFor("2026-08-06", s, 4), 0, "gleiche Lesart wie das Tagessoll");
  delete s.workloadPercent;
  assert.equal(R.weeklyTargetMinutes(s), 2520, "fehlend heisst weiterhin 100 %");
});

test("minBreakFor: kleinste Pause, nach der die Arbeitszeit die Staffel erfüllt", () => {
  assert.equal(R.minBreakFor(0, "ch"), 0);
  assert.equal(R.minBreakFor(330, "ch"), 0, "5 h 30 Arbeit ohne Pause sind erlaubt");
  assert.equal(R.minBreakFor(340, "ch"), 10, "SECO: 5 h 40 anwesend → 10 min");
  assert.equal(R.minBreakFor(345, "ch"), 15);
  assert.equal(R.minBreakFor(450, "ch"), 30, "7 h 30 anwesend: 15 min liessen 7 h 15 Arbeit");
  assert.equal(R.minBreakFor(440, "ch"), 20, "mit 20 min bleiben genau 7 h");
  assert.equal(R.minBreakFor(570, "ch"), 30, "9 h 30 anwesend: 30 min → genau 9 h Arbeit");
  assert.equal(R.minBreakFor(590, "ch"), 50);
  assert.equal(R.minBreakFor(600, "ch"), 60);
  assert.equal(R.minBreakFor(720, "ch"), 60);
  assert.equal(R.minBreakFor(390, "de"), 30);
  assert.equal(R.minBreakFor(375, "de"), 15, "DE: mit 15 min bleiben genau 6 h");
  assert.equal(R.minBreakFor(600, "de"), 45);
  assert.equal(R.minBreakFor(1000, "none"), 0);
  assert.equal(R.minBreakFor(20, "fixed30"), 20, "nie mehr Pause als Anwesenheit");
  assert.equal(R.minBreakFor(100, "fixed30"), 30);
});

test("minBreakFor ist monoton und wächst pro Minute höchstens um eine Minute", () => {
  ["ch", "de", "at", "fixed30"].forEach((rs) => {
    let prev = 0;
    for (let p = 0; p <= 900; p++) {
      const b = R.minBreakFor(p, rs);
      assert.ok(b >= prev && b <= prev + 1, rs + " bei " + p + ": " + prev + " → " + b);
      assert.ok(b >= R.requiredBreak(p - b, rs), rs + " bei " + p + " nicht konform");
      prev = b;
    }
  });
});

test("Eigene Staffeln: ungültige Einträge werden ignoriert", () => {
  const tiers = [{ over: 240, require: 20 }, { over: "x", require: 99 }, null, { over: 480, require: 45 }];
  assert.equal(R.requiredBreak(300, "custom", tiers), 20);
  assert.equal(R.minBreakFor(300, "custom", tiers), 20);
  assert.equal(R.minBreakFor(500, "custom", tiers), 20, "mit 20 min bleiben genau 8 h");
});

test("netOf: bezahlte Pausen decken die Pflicht, abgezogen wird nur Unbezahltes", () => {
  const s = R.defaultSettings();
  assert.deepEqual(R.netOf(540, { unpaid: 30, paid: 0 }, s), { net: 510, required: 30, shortfall: 0, autoDeducted: 0, deducted: 30 });
  assert.equal(R.netOf(540, { unpaid: 0, paid: 15 }, s).net, 525, "15 bezahlt + 15 Manko abgezogen");
  assert.equal(R.netOf(540, { unpaid: 0, paid: 30 }, s).net, 540);
  const noAuto = Object.assign(R.defaultSettings(), { autoDeductBreak: false });
  const r = R.netOf(540, { unpaid: 0, paid: 0 }, noAuto);
  assert.equal(r.net, 540);
  assert.equal(r.shortfall, 30, "gemeldet, aber nicht abgezogen");
});

test("presenceForNet findet die kleinste Anwesenheit, auch mit Rundung", () => {
  const s = R.defaultSettings();
  assert.equal(R.presenceForNet(504, s, { unpaid: 0 }).gross, 534);
  assert.equal(R.presenceForNet(540, s, { unpaid: 0 }).gross, 570, "9 h netto brauchen nur 30 min");
  assert.equal(R.presenceForNet(541, s, { unpaid: 0 }).gross, 601);
  assert.equal(R.presenceForNet(504, s, { unpaid: 60 }).gross, 564);
  assert.equal(R.presenceForNet(0, s, { unpaid: 0 }).gross, 0);
  const down = Object.assign(R.defaultSettings(), { roundStep: 15, roundMode: "down" });
  assert.equal(R.presenceForNet(504, down, { unpaid: 30 }).gross, 540, "510 roh → abgerundet 510 ≥ 504");
  const up = Object.assign(R.defaultSettings(), { roundStep: 15, roundMode: "up" });
  assert.equal(R.presenceForNet(504, up, { unpaid: 30 }).gross, 526, "496 roh → aufgerundet 510");
});

test("Standardeinstellungen sind vollständig und plausibel", () => {
  const s = R.defaultSettings();
  assert.equal(s.weeklyTargets.length, 7);
  assert.equal(s.breakRuleset, "ch");
  assert.equal(s.autoDeductBreak, true);
  assert.equal(s.countMissingWorkdays, false, "Lücken dürfen nicht heimlich verrechnet werden");
  assert.equal(s.roundStep, 0);
  assert.ok(s.maxDailyMinutes > 0);
  assert.ok(s.minRestHours > 0);
});

/* ---------------------------------------------------------------------- */
/* Einstellungen säubern                                                    */
/* ---------------------------------------------------------------------- */

test("sanitizeSettings: gültige Standardeinstellungen bleiben unverändert", () => {
  const s = R.defaultSettings();
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(R.sanitizeSettings(s), copy);
  assert.equal(R.defaultSettings.sanitize, R.sanitizeSettings, "der Store findet den Prüfer an den Standardwerten");
});

test("sanitizeSettings: Schichtvorlagen nur als Objekte mit Kennung und Zeiten", () => {
  const s = R.sanitizeSettings({ shiftTemplates: [null, 5, "x", [], { id: 7, start: "6:00", end: "14:30", breakStart: "zz", nameKey: 3 },
    { id: "", start: "08:00", end: "17:00" }, { id: "a", start: "08:00" }, { id: "7", start: "07:00", end: "15:00" }] }, { partial: true });
  assert.equal(s.shiftTemplates.length, 1, "doppelte Kennung zählt einmal");
  assert.deepEqual(s.shiftTemplates[0], { id: "7", name: "", start: "6:00", end: "14:30", breakStart: "", breakEnd: "" });
});

test("sanitizeSettings: Einlesen verwirft Unbrauchbares, Laden setzt den Standard", () => {
  const partial = R.sanitizeSettings({ theme: 5, roundStep: 7, workloadPercent: 90, x: "neu" }, { partial: true });
  assert.deepEqual(partial, { workloadPercent: 90, x: "neu" });
  const full = R.sanitizeSettings(Object.assign(R.defaultSettings(), { theme: 5, roundStep: 7, weeklyTargets: [0, 480, 480, 480, 480, 0, 0], workdays: null }));
  assert.equal(full.theme, "auto");
  assert.equal(full.roundStep, 0);
  assert.deepEqual(full.workdays, [1, 2, 3, 4], "Arbeitstage aus den Sollzeiten abgeleitet");
  assert.equal(R.sanitizeSettings(null).breakRuleset, "ch");
});
