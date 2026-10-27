"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const S = require("../assets/js/ui/views/today.js");
const MC = require("../assets/js/ui/features/miniclock.js");

/* Mini-Uhr: was das schwebende Fenster zeigt und welcher Knopf was tut.
   Gerechnet wird mit der echten Engine und ZK.TodayState — die Mini-Uhr
   darf nie etwas anderes sagen als „Heute“. */

const FR = "2026-10-16";                       // Freitag, Soll 8:24
const SA = "2026-10-17";
function settings(patch) {
  return Object.assign(R.defaultSettings(), { autoHolidays: false }, patch || {});
}
function day(rec, h, m, extra) {
  return E.computeDay(Object.assign({ date: FR, start: "", end: "", breaks: [] }, rec), Object.assign({
    settings: settings(), holiday: null, isToday: true, now: new Date(2026, 9, 16, h, m)
  }, extra || {}));
}
const fx = {
  t: (k, v) => (v ? k + JSON.stringify(v) : k),
  dur: (m) => T.formatDuration(m, "clock"),
  signed: (m) => T.formatSigned(m, "clock"),
  typeLabel: (k) => "type:" + k
};
const sec = (h, m, s) => h * 3600 + m * 60 + (s || 0);
function view(rec, h, m, s, extra) {
  const res = day(rec, h, m, extra && extra.engine);
  return MC.model(Object.assign({
    res, rec, nowSec: sec(h, m, s), isToday: true, showSeconds: true,
    whatIf: (nowMin) => E.computeDay(Object.assign({}, rec, { date: FR, start: T.formatHHMM(nowMin), end: "", breaks: rec.breaks || [] }), {
      settings: settings(), holiday: null, isToday: true, now: new Date(2026, 9, 16, h, m)
    })
  }, extra && extra.inp), fx);
}
const LUNCH = [{ id: "l", start: "12:05", end: "12:40" }];

/* ---------------------------------------------------------------------- */
/* Verfügbarkeit                                                           */
/* ---------------------------------------------------------------------- */

test("Knopf nur mit Schnittstelle, feinem Zeiger und nicht auf dem Handy", () => {
  assert.equal(MC.supported({ api: true, finePointer: true, mobile: false }), true);
  assert.equal(MC.supported({ api: false, finePointer: true, mobile: false }), false, "Firefox/Safari");
  assert.equal(MC.supported({ api: true, finePointer: false, mobile: false }), false, "nur Touch");
  assert.equal(MC.supported({ api: true, finePointer: true, mobile: true }), false, "Handy");
  assert.equal(MC.supported(null), false);
});

/* ---------------------------------------------------------------------- */
/* Countdown                                                               */
/* ---------------------------------------------------------------------- */

test("Countdown mit Sekunden und auf die Minute aufgerundet", () => {
  assert.equal(MC.formatCountdown(2 * 3600 + 17 * 60 + 53, true), "2:17:53");
  assert.equal(MC.formatCountdown(2 * 3600 + 17 * 60 + 53, false), "2:18");
  assert.equal(MC.formatCountdown(59, true), "0:00:59");
  assert.equal(MC.formatCountdown(59, false), "0:01");
  assert.equal(MC.formatCountdown(0, true), "0:00:00");
  assert.equal(MC.formatCountdown(-30, true), "0:00:00", "nie negativ");
  assert.equal(MC.formatCountdown(NaN, false), "0:00");
});

test("Ohne Sekunden zeigt der Countdown dasselbe wie der Browser-Tab", () => {
  const rec = { start: "07:42", breaks: LUNCH };
  for (const s of [0, 1, 30, 59]) {
    const res = day(rec, 14, 23);
    const lv = S.leave(res, 14 * 60 + 23);
    const m = view(rec, 14, 23, s, { inp: { showSeconds: false } });
    assert.equal(m.side, T.formatDuration(lv.leaveTl - (14 * 60 + 23), "clock"), "Sekunde " + s);
  }
});

/* ---------------------------------------------------------------------- */
/* Palette                                                                 */
/* ---------------------------------------------------------------------- */

test("Palette findet die Mini-Uhr über mini, pip, uhr und Übersetzungen", () => {
  for (const q of ["mini", "pip", "uhr", "Mini-Uhr", "horloge", "orologio", "fenêtre", "  PIP "]) {
    assert.equal(MC.matches(q), "strong", q);
  }
  assert.equal(MC.matches("mi"), "weak", "zwei Buchstaben reihen hinten ein");
  assert.equal(MC.matches("eingabe", ["Mini clock"]), null);
  assert.equal(MC.matches("cloc", ["Mini clock"]), "strong");
  for (const q of ["", "x", "ferien", "minus", "12.10."]) assert.equal(MC.matches(q), null, q);
});

/* ---------------------------------------------------------------------- */
/* Anzeige je Phase                                                        */
/* ---------------------------------------------------------------------- */

test("Laufender Tag: Feierabend, Countdown in Sekunden, Gehen und Pause", () => {
  const rec = { start: "07:42", breaks: LUNCH };
  const res = day(rec, 14, 23);
  const lv = S.leave(res, 14 * 60 + 23);
  const m = view(rec, 14, 23, 7);
  assert.equal(m.phase, "running");
  assert.equal(m.dot, "live");
  assert.equal(m.status, 'day.running{"time":"07:42"}');
  assert.equal(m.eyebrow, "day.recommendedLeave");
  assert.equal(m.big, T.formatHHMM(lv.leaveTl));
  assert.equal(m.sideLabel, "mini.left");
  assert.equal(m.side, MC.formatCountdown(lv.leaveTl * 60 - sec(14, 23, 7), true));
  assert.match(m.side, /^\d+:\d\d:53$/);
  assert.equal(m.main.name, "out");
  assert.equal(m.main.primary, true);
  assert.equal(m.main.label, "day.stampOut");
  assert.equal(m.aux.name, "breakStart");
  assert.equal(m.net, 'mini.net{"v":"' + T.formatDuration(res.net, "clock") + '"}');
  assert.ok(m.progress.fill > 0.7 && m.progress.fill < 1);
  assert.equal(m.progress.over, 0);
  assert.equal(m.progress.reached, false);
});

test("Pause: Countdown pausiert, Hauptknopf beendet die Pause, daneben Gehen", () => {
  const rec = { start: "07:42", breaks: [{ id: "p", start: "12:05", end: "" }] };
  const m = view(rec, 12, 20, 0);
  assert.equal(m.phase, "break");
  assert.equal(m.dot, "paused");
  assert.equal(m.status, 'day.onBreak{"time":"12:05"}');
  assert.equal(m.statusTone, "warn");
  assert.equal(m.sideLabel, "mini.paused");
  assert.equal(m.side, T.formatDuration(day(rec, 12, 20).remaining, "clock"), "fehlende Arbeit, steht still");
  assert.equal(m.main.name, "breakEnd");
  assert.equal(m.main.kind, "break");
  assert.equal(m.aux.name, "out");
});

test("Soll erreicht: +Zeit seit dem Erreichen", () => {
  const rec = { start: "07:00", breaks: [{ id: "l", start: "12:00", end: "12:30" }] };
  const res = day(rec, 16, 30);
  const lv = S.leave(res, 16 * 60 + 30);
  const m = view(rec, 16, 30, 0);
  assert.equal(m.phase, "overtime");
  assert.equal(m.eyebrow, "day.goalReached");
  assert.equal(m.big, T.formatSigned(lv.over, "clock"));
  assert.ok(m.big.startsWith("+"));
  assert.equal(m.bigTone, "plus");
  assert.equal(m.sideLabel, "mini.since");
  assert.equal(m.side, T.formatHHMM(lv.reachedTl));
  assert.equal(m.main.name, "out");
  assert.equal(m.progress.reached, true);
});

test("Noch nicht gekommen: Feierabend, wenn man jetzt käme, und Kommen", () => {
  const m = view({}, 8, 0, 0);
  assert.equal(m.phase, "whatif");
  assert.equal(m.status, "mini.notStarted");
  assert.equal(m.eyebrow, "mini.ifNow");
  assert.match(m.big, /^\d\d:\d\d$/);
  assert.notEqual(m.big, "--:--");
  assert.equal(m.side, T.formatDuration(504, "clock"), "Soll des Tages");
  assert.equal(m.main.name, "in");
  assert.equal(m.main.label, "day.stampIn");
  assert.equal(m.aux, null);
  assert.equal(m.progress, null, "kein Balken vor dem ersten Stempel");
  assert.equal(m.net, "");
});

test("Gegangen: Tagessaldo, und „Weiter arbeiten“ als ruhiger Hauptknopf", () => {
  const rec = { start: "07:30", end: "16:30", breaks: [{ id: "l", start: "12:00", end: "12:30" }] };
  const m = view(rec, 17, 0, 0);
  assert.equal(m.phase, "ended");
  assert.equal(m.status, 'mini.leftAt{"time":"16:30"}');
  assert.equal(m.eyebrow, "day.balance");
  assert.equal(m.big, "+0:06");
  assert.equal(m.side, "", "Netto steht in der Fortschrittszeile");
  assert.equal(m.main.name, "resume");
  assert.equal(m.main.primary, false);
  assert.equal(m.aux, null);
  assert.ok(m.progress);
});

test("Freier Samstag: kein Soll, Kommen bleibt möglich", () => {
  const res = E.computeDay({ date: SA, start: "", end: "", breaks: [] }, { settings: settings(), holiday: null, isToday: true, now: new Date(2026, 9, 17, 10, 0) });
  const m = MC.model({ res, rec: {}, nowSec: sec(10, 0), isToday: true, showSeconds: true }, fx);
  assert.equal(m.phase, "free");
  assert.equal(m.status, "day.noTarget");
  assert.equal(m.bigWord, true);
  assert.equal(m.main.name, "in");
  assert.equal(m.main.primary, false);
});

test("Ferientag: Gutschrift, kein Stempelknopf", () => {
  const m = view({ type: "vacation" }, 10, 0, 0);
  assert.equal(m.phase, "absence");
  assert.equal(m.status, "type:vacation");
  assert.equal(m.big, T.formatDuration(504, "clock"));
  assert.equal(m.main, null);
});

test("Nachtschicht nach Mitternacht: Countdown auf der Zeitachse des Vortags", () => {
  const rec = { date: "2026-10-15", start: "22:00", end: "", breaks: [] };
  const now = new Date(2026, 9, 16, 2, 0);
  const res = E.computeDay(rec, { settings: settings(), holiday: null, isToday: false, now });
  assert.equal(res.running, true);
  assert.equal(res.overnight, true);
  const m = MC.model({ res, rec, nowSec: sec(2, 0, 10), isToday: false, showSeconds: true }, fx);
  const lv = S.leave(res, 2 * 60 + T.DAY);
  assert.equal(m.phase, "running");
  assert.equal(m.side, MC.formatCountdown(lv.leaveTl * 60 - ((2 * 60 + T.DAY) * 60 + 10), true));
  assert.equal(m.tag, 'day.nextDay{"n":1}', "Feierabend liegt am Folgetag");
  assert.equal(m.main.name, "out");
});

/* Der Hauptknopf tut, was App.stampSmart() täte — dieselbe Regel wie in app.js */
function smartKind(rec) {
  if (!rec.start || rec.end) return "in";
  const onBreak = (rec.breaks || []).some((b) => b.start && !b.end);
  return onBreak ? "break" : "out";
}

test("Hauptknopf wirkt wie der Stempelknopf in „Heute“ (stampSmart)", () => {
  const cases = [
    [{}, 8, 0],
    [{ start: "07:42", breaks: LUNCH }, 14, 23],
    [{ start: "07:42", breaks: [{ id: "p", start: "12:05", end: "" }] }, 12, 20],
    [{ start: "07:00", breaks: [{ id: "l", start: "12:00", end: "12:30" }] }, 16, 30],
    [{ start: "07:30", end: "16:30", breaks: [] }, 17, 0]
  ];
  for (const [rec, h, m] of cases) {
    const v = view(rec, h, m, 0);
    const acts = S.stampActions(v.phase, { canStamp: true, isToday: true, started: true });
    assert.equal(v.main.name, acts.primary || acts.secondary, v.phase);
    assert.equal(v.main.kind, smartKind(rec), v.phase);
  }
});

/* ---------------------------------------------------------------------- */
/* Bestätigung nach dem Stempeln                                           */
/* ---------------------------------------------------------------------- */

test("Bestätigung nennt Aktion und Zeit, Rückgängig nur nach echtem Stempel", () => {
  const c = (step) => MC.confirmation(step, fx);
  assert.deepEqual(c({ action: "in", time: "07:42" }), { text: 'toast.stampedIn{"time":"07:42"}', tone: "plus", icon: "check", undo: true });
  assert.equal(c({ action: "out", time: "17:02" }).text, 'toast.stampedOut{"time":"17:02"}');
  assert.equal(c({ action: "resume", time: "13:05", gap: 25 }).text, 'toast.resumedNoGap{"time":"13:05"}');
  assert.equal(c({ action: "breakStart", time: "12:05" }).tone, "warn");
  assert.equal(c({ action: "breakEnd", time: "12:40", minutes: 35 }).text, 'toast.breakEnded{"v":"0:35"}');
  const none = c({ action: "none", reason: "in", time: "07:42" });
  assert.equal(none.undo, false);
  assert.equal(none.tone, "warn");
  assert.equal(none.text, "day.clockIn: 07:42");
  assert.equal(none.icon, "alert");
});

/* ---------------------------------------------------------------------- */
/* Texte und Einbindung                                                    */
/* ---------------------------------------------------------------------- */

test("Texte in allen vier Sprachen, gleiche Platzhalter, Schweizer Schreibweise", () => {
  const langs = ["de", "en", "fr", "it"];
  const keys = Object.keys(MC.STRINGS.de).sort();
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  for (const lang of langs) {
    assert.deepEqual(Object.keys(MC.STRINGS[lang]).sort(), keys, lang);
    for (const k of keys) {
      assert.ok(MC.STRINGS[lang][k].trim(), lang + " " + k);
      assert.equal(holes(MC.STRINGS[lang][k]), holes(MC.STRINGS.de[k]), lang + " " + k);
    }
  }
  for (const k of keys) assert.ok(!/ß/.test(MC.STRINGS.de[k]), k);
});

test("Skript ist nach „Heute“ und vor dem App-Start eingebunden und im Offline-Paket", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const at = (f) => html.search(new RegExp('<script src="' + f.replace(/\./g, "\\.") + '(\\?v=[^"]*)?"></script>'));
  assert.ok(at("assets/js/ui/features/miniclock.js") > at("assets/js/ui/views/today.js"));
  assert.ok(at("assets/js/ui/features/miniclock.js") < at("assets/js/ui/app.js"));
  assert.ok(at("assets/js/ui/views/today.js") > 0);
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.indexOf('"./assets/js/ui/features/miniclock.js"') > 0);
});
