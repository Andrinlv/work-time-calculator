"use strict";
/* Pausenrecht quer durch Engine und Planer: Die empfohlene Gehen-Zeit muss
   für jedes Soll, jede Pausenlage und jedes Regelwerk genau das Soll
   erreichen — und eine Minute früher darf es nicht reichen. So fällt sofort
   auf, wenn der Fixpunkt zwischen zwei Pausenstufen pendelt. */
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const P = require("../assets/js/core/planner.js");

const DO = "2026-08-06";
const settings = (patch) => Object.assign(R.defaultSettings(), { autoHolidays: false }, patch || {});
const ctx = (s) => ({ settings: s, holiday: null, isToday: false });

function dayAt(target, end, breaks) {
  return { date: DO, start: "07:00", end: end, breaks: breaks, targetOverride: target };
}

const VARIANTS = [
  { name: "ch", s: {} },
  { name: "de", s: { breakRuleset: "de" } },
  { name: "at", s: { breakRuleset: "at" } },
  { name: "fixed30", s: { breakRuleset: "fixed30" } },
  { name: "custom", s: { breakRuleset: "custom", customBreakTiers: [{ over: 240, require: 20 }, { over: 480, require: 45 }] } },
  { name: "ch ohne Automatik", s: { autoDeductBreak: false } },
  { name: "ch 15 ab", s: { roundStep: 15, roundMode: "down" } },
  { name: "ch 10 auf", s: { roundStep: 10, roundMode: "up" } },
  { name: "ch 6 nächste", s: { roundStep: 6, roundMode: "nearest" } }
];
const BREAKS = [
  [],
  [{ id: "l", start: "12:00", end: "12:30" }],
  [{ id: "l", start: "12:00", end: "13:00" }],
  [{ id: "p", start: "09:30", end: "09:45", paid: true }, { id: "l", start: "12:00", end: "12:20" }]
];

test("Gehen-Zeit erreicht das Soll genau — für jedes Soll und Regelwerk", () => {
  VARIANTS.forEach((v) => {
    const s = settings(v.s);
    BREAKS.forEach((br) => {
      for (let target = 0; target <= 720; target += 7) {
        const res = E.computeDay(dayAt(target, "", br), ctx(s));
        const leave = res.recommendedLeaveTl;
        const at = E.computeDay(dayAt(target, T.formatHHMM(leave), br), ctx(s));
        const label = v.name + " · Soll " + target + " · Pausen " + br.length + " · Gehen " + res.recommendedLeave;
        assert.ok(at.net >= target, label + ": Netto " + at.net);
        if (leave > 7 * 60) {
          const before = E.computeDay(dayAt(target, T.formatHHMM(leave - 1), br), ctx(s));
          assert.ok(before.net < target, label + ": schon eine Minute früher reicht es (" + before.net + ")");
        }
        // recommendedBreak erklärt die Gehen-Zeit (ohne Rundungsüberschuss)
        if (!s.roundStep) assert.equal(leave - 7 * 60, target + res.recommendedBreak + (at.net - target), label);
      }
    });
  });
});

test("Planer und Engine nennen dieselbe Gehen-Zeit", () => {
  VARIANTS.filter((v) => !v.name.includes("custom")).forEach((v) => {
    const s = settings(v.s);
    [0, 30, 60].forEach((lunch) => {
      const br = lunch ? [{ id: "l", start: "12:00", end: T.formatHHMM(12 * 60 + lunch) }] : [];
      // Der Planer nimmt die Pause als gesetzt an; ab 360 min liegt der Mittag sicher im Tag.
      [360, 504, 540, 541, 570, 600].forEach((target) => {
        const engine = E.computeDay(dayAt(target, "", br), ctx(s)).recommendedLeave;
        const planner = P.leaveTimeForBalance({
          start: "07:00", target: target, breakMinutes: lunch,
          breakRuleset: s.breakRuleset, customBreakTiers: s.customBreakTiers,
          autoDeductBreak: s.autoDeductBreak, roundStep: s.roundStep, roundMode: s.roundMode
        }).text;
        assert.equal(planner, engine, v.name + " · Soll " + target + " · Mittag " + lunch);
      });
    });
  });
});

test("Planer berücksichtigt die Rundung (gehen zur empfohlenen Zeit ergibt nie ein Minus)", () => {
  const s = settings({ roundStep: 15, roundMode: "down" });
  const leave = P.leaveTimeForBalance({ start: "08:00", target: 504, breakMinutes: 30, roundStep: 15, roundMode: "down" });
  const res = E.computeDay({ date: DO, start: "08:00", end: leave.text, breaks: [{ id: "l", start: "12:00", end: "12:30" }] }, ctx(s));
  assert.ok(res.balance >= 0, "Saldo " + res.balance + " bei " + leave.text);
});

test("Netto ist entlang der Anwesenheit monoton (kein Pendeln an den Schwellen)", () => {
  ["ch", "de", "at"].forEach((rs) => {
    const s = settings({ breakRuleset: rs });
    let prev = -1;
    for (let m = 0; m <= 12 * 60; m++) {
      const res = E.computeDay({ date: DO, start: "06:00", end: T.formatHHMM(6 * 60 + m), breaks: [], targetOverride: 0 }, ctx(s));
      assert.ok(res.net >= prev, rs + " bei " + m + " min: " + prev + " → " + res.net);
      assert.ok(res.net <= prev + 1 || prev < 0, rs + " springt bei " + m);
      prev = res.net;
    }
  });
});
