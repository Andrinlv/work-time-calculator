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
  assert.equal(R.weeklyTargetMinutes(s), 2016);
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
