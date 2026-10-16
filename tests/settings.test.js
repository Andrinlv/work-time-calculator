"use strict";
/* Einstellungen: Zahlenfelder, Schichtvorlagen, übersetzte Beschriftungen.
   Die Ansicht ist reiner Browser-Code — geladen wird sie hier in einem
   VM-Kontext mit den echten Kernmodulen, ohne DOM. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const Hol = require("../assets/js/core/holidays.js");
const I = require("../assets/js/ui/i18n.js");

function loadView() {
  const sandbox = { ZK: { Time: T, Rules: R, Holidays: Hol, I18n: I, Dom: {} }, console };
  sandbox.self = sandbox;
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/ui/views/settings.js"), "utf8");
  vm.runInNewContext(src, sandbox, { filename: "settings.js" });
  return sandbox.ZK.Views.settings;
}
const S = loadView();

test("Zahlenfeld: leer oder unlesbar wird nicht gespeichert", () => {
  assert.equal(S.readNumber("", { min: 1, max: 200 }).ok, false, "leer → alter Wert bleibt");
  assert.equal(S.readNumber("   ", { min: 1, max: 200 }).ok, false);
  assert.equal(S.readNumber("abc", { min: 1, max: 200 }).ok, false);
  assert.equal(S.readNumber("1e3", { min: 1, max: 200 }).ok, false, "Exponentschreibweise ist kein Beschäftigungsgrad");
  assert.equal(S.readNumber("12abc", { min: 0, max: 365 }).ok, false);
});

test("Zahlenfeld: 0 bleibt 0, wo es erlaubt ist", () => {
  const r = S.readNumber("0", { min: 0, max: 365 });
  assert.deepEqual([r.ok, r.value, r.clamped], [true, 0, false], "Sicherungs-Erinnerung 0 = aus");
  assert.deepEqual([S.readNumber("0", { min: 1, max: 24 }).value, S.readNumber("0", { min: 1, max: 24 }).clamped], [1, true],
    "Ruhezeit kann nicht 0 sein — wird auf 1 begrenzt und als korrigiert gemeldet");
});

test("Zahlenfeld: Grenzen, Schrittweite, Komma und Minus", () => {
  const over = S.readNumber("250", { min: 1, max: 200 });
  assert.deepEqual([over.ok, over.value, over.clamped], [true, 200, true]);
  const neg = S.readNumber("-3", { min: 0, max: 366 });
  assert.deepEqual([neg.ok, neg.value, neg.clamped], [true, 0, true]);
  assert.equal(S.readNumber("25,5", { min: 0, max: 366, step: 0.5 }).value, 25.5);
  assert.equal(S.readNumber("25.3", { min: 0, max: 366, step: 0.5 }).value, 25.5, "auf halbe Tage gerundet");
  assert.equal(S.readNumber("−2", { min: -366, max: 366, step: 0.5 }).value, -2, "typografisches Minus");
  assert.equal(S.readNumber("80.4", { min: 1, max: 200 }).value, 80, "ganze Prozent");
});

test("Schichtvorlagen: mitgelieferte Vorlagen sind gültig und übersetzbar", () => {
  const tpls = R.defaultSettings().shiftTemplates;
  assert.equal(tpls.length, 4);
  tpls.forEach((t) => {
    assert.ok(t.nameKey, t.id + " trägt einen nameKey");
    I.LANGS.forEach((l) => assert.ok(I.DICT[l][t.nameKey], t.nameKey + " fehlt in " + l));
    assert.equal(S.checkShift(t).ok, true, t.id + " ist gültig");
  });
});

test("Schichtvorlagen: Nachtschicht über Mitternacht", () => {
  const night = { name: "Nacht", start: "22:00", end: "06:00", breakStart: "02:00", breakEnd: "02:30" };
  const r = S.checkShift(night);
  assert.equal(r.ok, true);
  assert.equal(r.overnight, true);
  assert.equal(r.span, 480);
  assert.equal(r.net, 450);
  const cross = S.checkShift({ name: "Nacht", start: "22:00", end: "06:00", breakStart: "23:50", breakEnd: "00:20" });
  assert.equal(cross.ok, true, "Pause über Mitternacht innerhalb der Schicht");
  assert.equal(cross.breakMinutes, 30);
});

test("Schichtvorlagen: bezahlte Pause zählt zur Arbeitszeit", () => {
  const r = S.checkShift({ name: "Früh", start: "06:00", end: "14:30", breakStart: "09:00", breakEnd: "09:30", breakPaid: true });
  assert.equal(r.ok, true);
  assert.equal(r.net, 510);
  assert.equal(r.breakMinutes, 30);
});

test("Schichtvorlagen: ohne Pause ist erlaubt, halbe Pause nicht", () => {
  assert.equal(S.checkShift({ name: "Kurz", start: "08:00", end: "12:00", breakStart: "", breakEnd: "" }).ok, true);
  const half = S.checkShift({ name: "Kurz", start: "08:00", end: "12:00", breakStart: "10:00", breakEnd: "" });
  assert.equal(half.ok, false);
  assert.equal(half.errors.breakEnd, "pair");
});

test("Schichtvorlagen: Fehler werden dem richtigen Feld zugeordnet", () => {
  const base = { name: "Büro", start: "08:00", end: "17:00", breakStart: "12:00", breakEnd: "12:30" };
  assert.equal(S.checkShift(Object.assign({}, base, { start: "" })).errors.start, "required");
  assert.equal(S.checkShift(Object.assign({}, base, { end: "25:00" })).errors.end, "format");
  assert.equal(S.checkShift(Object.assign({}, base, { end: "08:00" })).errors.end, "same");
  assert.equal(S.checkShift(Object.assign({}, base, { breakStart: "12:30", breakEnd: "12:00" })).errors.breakEnd, "order");
  assert.equal(S.checkShift(Object.assign({}, base, { breakStart: "17:30", breakEnd: "18:00" })).errors.breakStart, "outside");
  assert.equal(S.checkShift(Object.assign({}, base, { breakStart: "16:45", breakEnd: "17:15" })).errors.breakEnd, "outside",
    "Pause endet nach der Schicht");
  assert.equal(S.checkShift(Object.assign({}, base, { breakStart: "07:30", breakEnd: "08:15" })).errors.breakStart, "outside",
    "Pause beginnt vor der Schicht");
  assert.equal(S.checkShift(Object.assign({}, base, { name: "  " })).errors.name, "required");
});

test("Schichtvorlagen: Umbenennen löst die Übersetzung", () => {
  I.setLang("fr");
  const office = R.defaultSettings().shiftTemplates[0];
  const same = S.renameShift(office, "Bureau");
  assert.equal(same.nameKey, "shift.office", "unveränderter (übersetzter) Name bleibt übersetzbar");
  const renamed = S.renameShift(office, "Atelier");
  assert.equal(renamed.nameKey, undefined);
  assert.equal(renamed.name, "Atelier");
  assert.equal(S.cleanShift(renamed).nameKey, undefined);
  assert.equal(S.labels.shiftName(renamed), "Atelier");
  assert.equal(S.labels.shiftName(office), "Bureau");
  I.setLang("de");
});

test("Schichtvorlagen: ältere Speicherstände ohne nameKey bleiben übersetzbar", () => {
  const legacy = { id: "early", name: "Frühschicht", start: "06:00", end: "14:30", breakStart: "09:00", breakEnd: "09:30" };
  const clean = S.cleanShift(legacy);
  assert.equal(clean.nameKey, "shift.early");
  assert.equal(clean.breakPaid, false);
  I.setLang("it");
  assert.equal(S.labels.shiftName(legacy), "Turno mattutino");
  I.setLang("de");
  const own = { id: "early", name: "Früh A", start: "06:00", end: "14:30" };
  assert.equal(S.cleanShift(own).nameKey, undefined, "umbenannte Vorlage bleibt wörtlich");
});

test("Arbeitsmodell: Wochensoll wird einer Vorlage zugeordnet", () => {
  assert.equal(S.matchPreset(R.weeklyPreset(40 * 60, [1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]), "40");
  assert.equal(S.matchPreset(R.weeklyPreset(42 * 60, [1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]), "42");
  const edited = R.weeklyPreset(42 * 60, [1, 2, 3, 4, 5]);
  edited[1] = 450;
  assert.equal(S.matchPreset(edited, [1, 2, 3, 4, 5]), "custom", "geänderter Montag → Individuell");
});

test("Beschriftungen: Vorlagen, Regelwerke und Regionen in allen Sprachen", () => {
  R.MODEL_PRESETS.forEach((p) => {
    I.LANGS.forEach((l) => {
      I.setLang(l);
      const label = S.labels.preset(p);
      assert.ok(label && !/\{|\}/.test(label), p.key + " in " + l);
      if (l !== "de") assert.ok(!/Woche|Individuell/.test(label), "kein Deutsch in " + l + ": " + label);
    });
  });
  Object.keys(R.BREAK_RULESETS).forEach((k) => {
    I.LANGS.forEach((l) => assert.ok(I.DICT[l]["ruleset." + k], "ruleset." + k + " fehlt in " + l));
  });
  Hol.REGIONS.forEach((r) => {
    I.LANGS.forEach((l) => assert.ok(I.DICT[l]["region." + r.key], "region." + r.key + " fehlt in " + l));
  });
  I.setLang("fr");
  assert.equal(S.labels.region(Hol.REGIONS.filter((r) => r.key === "CH-GE")[0]), "Suisse · Genève");
  assert.equal(S.labels.ruleset("ch"), "Suisse (LTr art. 15)");
  I.setLang("de");
  assert.equal(S.labels.region(Hol.REGIONS.filter((r) => r.key === "CH-LU")[0]), "Schweiz · Luzern");
  assert.equal(S.labels.preset(R.MODEL_PRESETS[0]), "42 h / Woche");
  assert.match(S.labels.presetNote(R.MODEL_PRESETS[0], [1, 2, 3, 4, 5]), /^8 h 24 min pro Tag · \S+–\S+$/);
});

test("Neue Texte der Einstellungen existieren in allen vier Sprachen", () => {
  const prefixes = ["set.shift", "shift.", "set.preset", "onb.", "ol.showAs.", "ol.err.", "ruleset.", "region."];
  const keys = Object.keys(I.DICT.de).filter((k) => prefixes.some((p) => k.indexOf(p) === 0));
  assert.ok(keys.length > 80);
  keys.forEach((k) => I.LANGS.forEach((l) => assert.ok(I.DICT[l][k] !== undefined, k + " fehlt in " + l)));
  Object.keys(I.DICT.de).forEach((k) => assert.ok(!/ß/.test(I.DICT.de[k]), "Schweizer Schreibweise: " + k));
});
