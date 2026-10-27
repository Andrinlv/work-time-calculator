"use strict";
/* Monatsabschluss quer durch die App: EIN Zeitkonto überall (Kopfzeile,
   Statistik, Fragen, Zeitschieber, Rückblick, Monatscheck) und keine
   Schreibangebote in abgeschlossene Monate (Lückenhilfe, Schnellerfassung,
   Outlook-Abgleich). Dazu Lohnmeldung, Erfassungsbeginn und Speicher. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const H = require("../assets/js/core/holidays.js");
const E = require("../assets/js/core/engine.js");
const P = require("../assets/js/core/planner.js");
const C = require("../assets/js/core/closing.js");
const W = require("../assets/js/core/whatif.js");
const RV = require("../assets/js/core/review.js");
const A = require("../assets/js/core/assist.js");
const ASK = require("../assets/js/core/ask.js");
const S = require("../assets/js/data/store.js");
const CS = require("../assets/js/data/calendarsync.js");
const I = require("../assets/js/ui/i18n.js");

const NOW = new Date(2026, 9, 16, 14, 23);   // Fr 16.10.2026, 14:23
const TODAY = "2026-10-16";
const YESTERDAY = "2026-10-15";

/* Browser-Dateien in einer kleinen Umgebung laden */
function load(file, extra) {
  const sandbox = { ZK: Object.assign({ Time: T, Rules: R, Holidays: H, Engine: E, Planner: P, I18n: I, Dom: {}, Closing: C }, extra || {}) };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
  return sandbox.ZK;
}
const STATS = load("assets/js/ui/views/stats.js").Views.stats.calc;

function work(iso, start, end) {
  return { date: iso, start: start || "08:00", end: end || "17:00", breaks: [{ id: "l" + iso, start: "12:00", end: "12:30", paid: false }], note: "", location: "office", absenceFactor: 1 };
}

function workMonth(month, until) {
  const days = {};
  T.rangeDays(month + "-01", T.endOfMonth(month + "-01")).forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6 || (until && iso > until)) return;
    days[iso] = work(iso);
  });
  return days;
}

function settings(extra) {
  return Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU" }, extra || {});
}

/* August bis gestern erfasst, heute läuft seit 07:42. September wird mit
   42 h abgeschlossen, danach wechselt das Modell rückwirkend auf 40 h —
   genau der Fall, für den es den Abschluss gibt: die Tage rechnen neu,
   der abgeschlossene Monat bleibt eingefroren. */
function scenario() {
  const records = Object.assign({}, workMonth("2026-08"), workMonth("2026-09"), workMonth("2026-10", YESTERDAY));
  records[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [] };
  const base = settings();
  const snap = C.buildSnapshot(records, base, "2026-09", { now: NOW });
  const s = Object.assign({}, base, { weeklyTargets: R.weeklyPreset(40 * 60), modelPreset: "40" });
  s[C.keyOf("2026-09")] = snap;
  return { records, s, snap };
}

function sum(map) { return Object.values(map).reduce((a, b) => a + b, 0); }

/* ====================================================================== */
/* Ein Zeitkonto                                                           */
/* ====================================================================== */

test("Abweichung je Tag ergibt genau die eingefrorene Differenz des Zeitkontos", () => {
  const { records, s, snap } = scenario();
  const acc = C.accountBalance(records, s, YESTERDAY, NOW);
  assert.notEqual(acc.frozenDelta, 0, "Voraussetzung: der Monat ist neu gerechnet anders");
  const deltas = C.dayDeltas(records, s, "2026-01-01", YESTERDAY, NOW);
  assert.ok(Object.keys(deltas).every((iso) => iso.slice(0, 7) === "2026-09"), "nur Tage abgeschlossener Monate");
  assert.equal(sum(deltas), acc.frozenDelta);
  assert.equal(C.frozenDelta(records, s, "2026-09-10", "2026-09-20", NOW), sum(Object.keys(deltas)
    .filter((iso) => iso >= "2026-09-10" && iso <= "2026-09-20").map((iso) => deltas[iso])));
  // Ein ganzer abgeschlossener Monat zählt mit seinem Monatssaldo, alles andere bleibt live
  assert.equal(C.periodBalance(records, s, "2026-09-01", "2026-09-30", 12345, NOW), snap.balance);
  assert.equal(C.periodBalance(records, s, "2026-08-01", "2026-08-31", 777, NOW), 777);
  assert.equal(C.periodBalance(records, settings(), "2026-09-01", "2026-09-30", 777, NOW), 777, "ohne Abschluss: live");
  assert.deepEqual(C.dayDeltas(records, settings(), "2026-01-01", TODAY, NOW), {});
});

test("Kopfzeile, Zeitschieber, Rückblick, Statistik und Fragen nennen dasselbe Zeitkonto", () => {
  const { records, s, snap } = scenario();
  // Kopfzeile (App.settledBalance): laufender Tag → Konto bis gestern
  const header = C.accountBalance(records, s, YESTERDAY, NOW).minutes;
  const raw = E.accountBalance(records, s, YESTERDAY, NOW).minutes;
  assert.notEqual(header, raw, "Voraussetzung: eingefroren ≠ neu gerechnet");

  // Zeitschieber: Konto ohne den heutigen Tag (rechnet ohne Zutun über ZK.Closing)
  assert.equal(W.baseBalance(records, s, TODAY, NOW).minutes, header);
  // … und „Konto nach Gehen“ für einen Gehen-Zeitpunkt mit Tagessaldo ±0
  const sc = W.scan(records[TODAY], { settings: s, now: NOW, isToday: true, base: W.baseBalance(records, s, TODAY, NOW) });
  const zero = sc.points[sc.marks.zero];
  assert.equal(zero.account, header + zero.balance);

  // Jahresrückblick: Konto am Stichtag, Monatssaldo des abgeschlossenen Monats
  const st = RV.yearStats(records, s, 2026, NOW);
  assert.equal(st.balanceEnd, C.accountBalance(records, s, TODAY, NOW).minutes);
  assert.equal(st.balanceEnd, header, "der laufende Tag zählt nicht");
  assert.equal(st.months[8].balance, snap.balance, "September eingefroren wie im Kalender");
  const aug = E.computeRange("2026-08-01", "2026-08-31", (iso) => records[iso], s, NOW).totals.balance;
  assert.equal(st.months[7].balance, aug, "offener Monat: neu gerechnet");

  // Statistik: Verlauf endet bei der Kennzahl „Zeitkonto“; Säule September eingefroren
  const period = STATS.resolvePeriod("year", Object.keys(records).sort(), TODAY);
  const days = E.computeRange(period.from, period.until, (iso) => records[iso], s, NOW).days;
  const before = C.accountBalance(records, s, T.addDays(period.from, -1), NOW).minutes;
  const deltas = C.dayDeltas(records, s, period.from, period.until, NOW);
  const trend = STATS.trendSeries(days, before, period, deltas);
  assert.equal(trend.points[trend.points.length - 1].value, C.accountBalance(records, s, period.until, NOW).minutes);
  const bars = STATS.groupBars(days, "month", deltas);
  assert.equal(bars.find((b) => b.key === "2026-09").balance, snap.balance);

  // Fragen: „Saldo September“ wie der Kalender, das Jahr bis zum Konto
  const api = askApi(records, s);
  const sep = ASK.answer({ intent: "period", period: "month", month: 8, year: 2026 }, api)[0];
  assert.equal(sep.data.balance, snap.balance);
  const year = ASK.answer({ intent: "period", period: "year", year: 2026 }, api)[0];
  assert.equal(year.data.account, header);
  const live = E.computeRange("2026-01-01", TODAY, (iso) => records[iso], s, NOW).days
    .filter((r) => r.recorded && !r.running && !r.provisional && !r.incomplete).reduce((a, r) => a + r.balance, 0);
  assert.equal(year.data.balance, live + C.frozenDelta(records, s, "2026-01-01", TODAY, NOW));

  // Vorschau beim Modellwechsel („Saldo bis gestern: vorher → nachher“, settings.js):
  // „nachher“ ist, was die Kopfzeile danach zeigt; der abgeschlossene Monat verschiebt sich nicht
  const sBefore = Object.assign({}, s, { weeklyTargets: R.weeklyPreset(42 * 60), modelPreset: "42" });
  const previewBefore = C.accountBalance(records, sBefore, YESTERDAY, NOW).minutes;
  const previewAfter = C.accountBalance(records, s, YESTERDAY, NOW).minutes;
  assert.equal(previewAfter, header);
  assert.equal(previewBefore, E.accountBalance(records, sBefore, YESTERDAY, NOW).minutes, "vor dem Wechsel stimmt der Abschluss mit den Tagen überein");
  const sepLive40 = C.liveMonthBalance(records, s, "2026-09", NOW);
  assert.equal(previewAfter - previewBefore,
    (raw - E.accountBalance(records, sBefore, YESTERDAY, NOW).minutes) - (sepLive40 - snap.balance),
    "nur offene Monate bewegen sich");
});

test("Ohne abgeschlossenen Monat rechnen alle wie die Engine", () => {
  const { records } = scenario();
  const s = settings({ weeklyTargets: R.weeklyPreset(40 * 60), modelPreset: "40" });
  const raw = E.accountBalance(records, s, YESTERDAY, NOW).minutes;
  assert.equal(C.accountBalance(records, s, YESTERDAY, NOW).minutes, raw);
  assert.equal(W.baseBalance(records, s, TODAY, NOW).minutes, raw);
  assert.equal(RV.yearStats(records, s, 2026, NOW).balanceEnd, raw);
});

test("Zeitschieber: eigene Kontorechnung lässt sich einsetzen", () => {
  const { records, s } = scenario();
  const calls = [];
  const res = W.baseBalance(records, s, TODAY, NOW, { accountBalance: (...a) => { calls.push(a[2]); return { minutes: 42 }; } });
  assert.equal(res.minutes, 42);
  assert.deepEqual(calls, [TODAY]);
});

test("Moment „Neuer Monat“: Vormonat abgeschlossen → eingefrorener Saldo", () => {
  const { records, s, snap } = scenario();
  const first = new Date(2026, 9, 1, 9, 0);     // Do 01.10.2026, erster Arbeitstag
  const recs = Object.assign({}, records);
  Object.keys(recs).forEach((k) => { if (k >= "2026-10-01") delete recs[k]; });
  recs["2026-10-01"] = { date: "2026-10-01", start: "08:00", end: "", breaks: [] };
  const m = RV.moment({ records: recs, settings: s, now: first });
  assert.equal(m && m.kind, "month");
  assert.equal(m.vars.balance, snap.balance);
});

/* Datenzugang wie AskUI.buildApi, nur mit den Kernmodulen */
function askApi(days, s) {
  I.setLang("de");
  const get = (iso) => days[iso];
  return {
    today: TODAY, now: NOW, lang: "de",
    settings: () => s,
    records: () => days,
    record: (iso) => Object.assign(E.emptyRecord(iso), days[iso] || {}),
    day: (iso) => E.computeDay(days[iso] || { date: iso }, { settings: s, now: NOW, isToday: iso === TODAY }),
    holiday: (iso) => H.lookup(iso, s.holidayRegion),
    activeDate: () => TODAY,
    range: (a, b) => E.computeRange(a, b, get, s, NOW),
    accountBalance: (upto, o) => C.accountBalance(days, s, upto, NOW, o),
    periodBalance: (from, to, live) => C.periodBalance(days, s, from, to, live, NOW),
    settledBalance: () => ({ minutes: C.accountBalance(days, s, YESTERDAY, NOW).minutes, live: 0, liveDate: TODAY, overnight: false }),
    t: I.t, tn: I.tn,
    fmt: (m) => T.formatDuration(m, "hm", { comma: true }),
    fmtSigned: (m) => T.formatSigned(m, "clock"),
    num: (v) => String(v),
    date: (iso) => iso,
    weekday: I.weekdayName,
    month: I.monthName
  };
}

test("Oberfläche und Rechner rufen das Zeitkonto nie an ZK.Closing vorbei", () => {
  const root = path.join(__dirname, "..", "assets", "js");
  const files = [];
  ["ui", "ui/views", "ui/features"].forEach((dir) => {
    fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".js")).forEach((f) => files.push(path.join(dir, f)));
  });
  ["core/whatif.js", "core/review.js", "core/ask.js", "core/insights.js", "core/planner.js"].forEach((f) => files.push(f));
  const hits = [];
  files.forEach((f) => {
    fs.readFileSync(path.join(root, f), "utf8").split("\n").forEach((line, i) => {
      if (/\b(E|Engine)\.accountBalance\s*\(/.test(line)) hits.push(f + ":" + (i + 1));
    });
  });
  assert.deepEqual(hits, [], "direkte Engine-Aufrufe: " + hits.join(", "));
});

/* ====================================================================== */
/* Keine Schreibangebote in abgeschlossene Monate                          */
/* ====================================================================== */

function lockedScenario() {
  const records = Object.assign({}, workMonth("2026-09"), workMonth("2026-10", YESTERDAY));
  records["2026-09-29"] = { date: "2026-09-29", start: "08:00", end: "", breaks: [] };   // Gehen vergessen
  delete records["2026-09-30"];                                                         // Lücke
  delete records["2026-10-01"];                                                         // Lücke im offenen Monat
  const s = settings();
  s[C.keyOf("2026-09")] = C.buildSnapshot(records, s, "2026-09", { now: NOW, issues: 2 });
  return { records, s, isLocked: (iso) => C.isLocked(s, iso) };
}

test("Lückenhilfe: abgeschlossene Tage werden weder gefunden noch vorgeschlagen", () => {
  const { records, s, isLocked } = lockedScenario();
  const now = new Date(2026, 9, 2, 9, 0);   // Fr 02.10.: 29./30.09. liegen im Suchfenster
  const opts = { now, trackingStart: "2026-09-01", isLocked };
  // ohne Sperre (wie bisher) würden sie angeboten — die Voraussetzung des Tests
  const open = A.detect(records, s, { now, trackingStart: "2026-09-01" });
  assert.ok(open.some((x) => x.date === "2026-09-29" || (x.dates || []).indexOf("2026-09-30") >= 0));

  const list = A.detect(records, s, opts);
  const touched = [];
  list.forEach((x) => (x.dates || [x.date]).forEach((d) => { if (x.code !== "in" && isLocked(d)) touched.push(x.code + ":" + d); }));
  assert.deepEqual(touched, []);
  assert.deepEqual(list.find((x) => x.code === "gaps").dates, ["2026-10-01"], "die Lücke im offenen Monat bleibt");

  const found = A.scan(records, s, { from: "2026-09-01", to: "2026-09-30", now, trackingStart: "2026-09-01", isLocked });
  assert.deepEqual(found, { incomplete: [], gaps: [] });
  assert.deepEqual(A.detectDay(records, s, "2026-09-29", opts), []);
  assert.deepEqual(A.planFill(records, s, ["2026-09-29", "2026-09-30", "2026-10-01"], opts).map((p) => p.date), ["2026-10-01"]);
});

test("Outlook: Änderungen in abgeschlossenen Monaten sind geschützt, nicht angeboten", () => {
  const st = S.createStore({ backend: S.memoryBackend(), defaultSettings: R.defaultSettings, listen: false });
  st.load();
  st.setGuard(C.guard, { prefix: C.PREFIX });
  st.setDay("2026-09-21", { location: "office", note: "", start: "", end: "" });
  st.setDay("2026-09-24", { type: "vacation", source: CS.SOURCE, outlookSyncedAt: new Date().toISOString() });   // Kalendertag, nicht von Hand geändert
  st.updateSettings({ "closing:2026-09": { v: 1, at: "2026-10-01T08:00:00Z", balance: 0, days: {} } });
  const events = [
    { id: "v1", subject: "Ferien", isAllDay: true, showAs: "oof", start: { dateTime: "2026-09-28T00:00:00.0000000" }, end: { dateTime: "2026-09-30T00:00:00.0000000" } },
    { id: "h1", subject: "Homeoffice", isAllDay: true, showAs: "workingElsewhere", start: { dateTime: "2026-09-21T00:00:00.0000000" }, end: { dateTime: "2026-09-22T00:00:00.0000000" } },
    { id: "v2", subject: "Ferien", isAllDay: true, showAs: "oof", start: { dateTime: "2026-10-19T00:00:00.0000000" }, end: { dateTime: "2026-10-20T00:00:00.0000000" } }
  ];
  const range = CS.syncRange({}, TODAY);
  const plan = CS.planSync(CS.mapEvents(events, {}), (iso) => st.getDay(iso), Object.assign({}, range, { isLocked: (iso) => st.isLocked(iso) }));
  assert.deepEqual(plan.changes.map((c) => c.date), ["2026-10-19"], "nur der offene Monat wird angeboten (und gezählt)");
  assert.equal(plan.closed, 4);
  const closed = plan.protectedDays.filter((p) => p.reason === "closed");
  assert.deepEqual(closed.map((p) => p.date + ":" + p.change.action),
    ["2026-09-21:location", "2026-09-24:clear", "2026-09-28:set", "2026-09-29:set"]);
  const res = st.setDays(CS.buildPatch(plan.changes, new Date().toISOString()), { label: "outlook" });
  assert.deepEqual(res, { written: 1, locked: [] }, "alles Angebotene lässt sich auch speichern");
});

test("Schnellerfassung: Tage abgeschlossener Monate heissen „abgeschlossen“ und werden nicht gezählt", () => {
  const ZK = load("assets/js/ui/views/tools.js");
  const Q = ZK.QuickEntry;
  const isLocked = (iso) => iso < "2026-10-01";
  const before = { "2026-09-15": work("2026-09-15") };
  const one = Q.lockPlan(P.planQuickEntry(P.analyzeQuickEntry("15.9. 7-16", TODAY), { getRecord: (iso) => before[iso] || null }), isLocked);
  assert.equal(one.days[0].status, "locked");
  assert.equal(one.occupied, 0);
  assert.equal(one.locked, 1);
  assert.equal(one.error, "locked");
  assert.deepEqual(Object.keys(P.selectQuickPatch(one, true)), [], "auch „überschreiben“ schreibt nichts");

  const span = Q.lockPlan(P.planQuickEntry(P.analyzeQuickEntry("29.9.-2.10. ferien", TODAY), {
    getRecord: () => null,
    dayOff: (iso) => (T.weekdayOf(iso) === 0 || T.weekdayOf(iso) === 6 ? "weekend" : null)
  }), isLocked);
  assert.deepEqual(span.days.map((d) => d.status), ["locked", "locked", "new", "new"]);
  assert.equal(span.fresh, 2);
  assert.equal(span.locked, 2);
  assert.equal(span.error, null);
  assert.deepEqual(Object.keys(P.selectQuickPatch(span, false)).sort(), ["2026-10-01", "2026-10-02"]);
  // ohne Sperre unverändert
  assert.equal(Q.lockPlan(P.planQuickEntry(P.analyzeQuickEntry("15.9. 7-16", TODAY), { getRecord: () => null }), null).locked, 0);
});

/* ====================================================================== */
/* Lohnmeldung: Absenzen auf Feiertagen                                    */
/* ====================================================================== */

test("Lohnmeldung: Ferien über Auffahrt — der Feiertag ist kein Ferientag (wie im Kontingent)", () => {
  const s = settings();
  const records = workMonth("2026-05");
  ["2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15"].forEach((iso) => {
    records[iso] = { date: iso, type: "vacation", start: "", end: "", breaks: [], absenceFactor: 1, source: "outlook" };
  });
  records["2026-05-25"] = { date: "2026-05-25", type: "sick", start: "", end: "", breaks: [], absenceFactor: 0.5 };   // Pfingstmontag, halb krank
  const snap = C.buildSnapshot(records, s, "2026-05", { now: NOW });
  const quota = E.quotaUsage(records, 2026, s, NOW);
  assert.equal(snap.vacationDays, quota.vacation, "Lohnmeldung und Kontingent zählen gleich");
  assert.equal(snap.vacationDays, 4);
  assert.equal(snap.absence.vacation, 4 * 504);
  assert.equal(snap.sickDays, 0, "halbe Krankheit am Pfingstmontag ist ein Feiertag");
  // Auffahrt, Pfingstmontag — je ein Tag, egal ob halb
  assert.equal(snap.holidayDays, 2);
  const auffahrt = E.computeDay(records["2026-05-14"], { settings: s, now: NOW });
  const pfingst = E.computeDay(records["2026-05-25"], { settings: s, now: NOW });
  assert.equal(snap.absence.holiday, auffahrt.credited + pfingst.credited);
  const rows = C.payrollRows(snap, C.DEFAULT_CODES);
  assert.equal(rows.find((r) => r.key === "vacation").days, 4);
  assert.equal(rows.find((r) => r.key === "holiday").days, 2);
  assert.equal(rows.find((r) => r.key === "sick"), undefined);
  // Das Zeitkonto bleibt unberührt: nur die Aufteilung der Lohnarten ändert
  assert.equal(snap.balance, C.liveMonthBalance(records, s, "2026-05", NOW));
  assert.equal(C.payrollKind({ type: "vacation", holiday: null, baseTarget: 504 }), "vacation");
  assert.equal(C.payrollKind({ type: "vacation", holiday: { name: "x" }, baseTarget: 0 }), "vacation", "Feiertag am freien Tag: nichts zu melden");
});

/* ====================================================================== */
/* Outlook-Homeoffice und Erfassungsbeginn                                 */
/* ====================================================================== */

test("Homeoffice aus Outlook verschiebt den Erfassungsbeginn nicht", () => {
  const CW = load("assets/js/ui/views/calendar.js").CalWeek;
  const s = settings();
  const days = { "2026-10-15": work("2026-10-15") };
  const events = [];
  T.rangeDays(T.addDays(TODAY, -60), YESTERDAY).forEach((iso) => {
    if (T.weekdayOf(iso) !== 5) return;
    events.push({ id: "ho" + iso, subject: "Homeoffice", isAllDay: true, showAs: "workingElsewhere",
      start: { dateTime: iso + "T00:00:00.0000000" }, end: { dateTime: T.addDays(iso, 1) + "T00:00:00.0000000" } });
  });
  const plan = CS.planSync(CS.mapEvents(events, {}), (iso) => days[iso] || null, CS.syncRange({}, TODAY));
  const patch = CS.buildPatch(plan.changes, "2026-10-16T08:00:00.000Z");
  Object.keys(patch).forEach((iso) => { days[iso] = Object.assign({ date: iso }, patch[iso]); });
  assert.ok(Object.keys(patch).length >= 8);
  assert.ok(Object.keys(patch).every((iso) => patch[iso].source === CS.SOURCE), "neue Ort-Datensätze gehören dem Kalender");
  assert.equal(A.trackingStartOf(days, s, null), "2026-10-15");
  assert.equal(CW.trackingStart(days, s, null), "2026-10-15");
  const gaps = A.detect(days, s, { now: NOW }).find((x) => x.code === "gaps");
  assert.equal(gaps, undefined, "keine erfundenen Lücken");

  // Ältere Stände ohne Quelle: zählen ebenfalls nicht und räumt der Abgleich ab
  const legacy = { "2026-10-15": work("2026-10-15"), "2026-09-04": { date: "2026-09-04", location: "home", outlookSyncedAt: "2026-09-05T08:00:00.000Z", updatedAt: "2026-09-05T08:00:00.100Z" } };
  assert.equal(A.trackingStartOf(legacy, s, null), "2026-10-15");
  assert.equal(CW.trackingStart(legacy, s, null), "2026-10-15");
  const gone = CS.planSync({}, (iso) => legacy[iso] || null, CS.syncRange({}, TODAY));
  assert.deepEqual(gone.changes.map((c) => c.date + ":" + c.action), ["2026-09-04:clear"]);
  assert.equal(CS.buildPatch(gone.changes)["2026-09-04"], null);

  // Wer an so einem Tag stempelt, hat angefangen — auch mit Quelle „outlook“
  const stamped = Object.assign({}, days, { "2026-09-25": Object.assign({}, days["2026-09-25"], { start: "08:00", end: "17:00" }) });
  assert.equal(A.trackingStartOf(stamped, s, null), "2026-09-25");
  assert.equal(CW.trackingStart(stamped, s, null), "2026-09-25");
  // Ein reiner Plan-Datensatz (Schichtplan) startet nichts
  assert.equal(A.trackingStartOf({ "2026-10-15": work("2026-10-15"), "2026-10-01": { date: "2026-10-01", plan: "late" } }, s, null), "2026-10-15");
});

/* ====================================================================== */
/* Speicher: mehrere Fenster und Import                                    */
/* ====================================================================== */

function storeOn(backend) {
  const st = S.createStore({ backend, defaultSettings: R.defaultSettings, listen: false });
  st.load();
  st.setGuard(C.guard, { prefix: C.PREFIX });
  return st;
}
const SNAP = { v: 1, at: "2026-10-01T08:00:00.000Z", balance: 30, days: { "15": 30 }, account: 30 };

test("Wieder geöffneter Monat im anderen Fenster: Ereignis, neuer Stand, Rückgängig nachgeführt", () => {
  const be = S.memoryBackend();
  const a = storeOn(be);
  a.setDay("2026-09-15", { start: "08:00", end: "17:00" }, { immediate: true });
  a.updateSettings({ "closing:2026-09": SNAP }, { immediate: true, coalesce: false });
  const b = storeOn(be);
  b.updateSettings({ "closing:2026-09": SNAP, theme: "dark" }, { immediate: true, coalesce: false });   // eigener Rückgängig-Schritt in B
  a.syncExternal(be.getItem(S.KEY));
  const events = [];
  b.subscribe((e) => events.push(e));
  const rev = b.rev();
  a.updateSettings({ "closing:2026-09": undefined }, { immediate: true, coalesce: false });
  assert.equal(b.syncExternal(be.getItem(S.KEY)), true);
  assert.equal(b.isLocked("2026-09-15"), false);
  const ext = events.find((e) => e.type === "external");
  assert.ok(ext, "Ereignis „external“");
  assert.deepEqual(ext.settingKeys, ["closing:2026-09"]);
  assert.notEqual(b.rev(), rev, "Zwischenspeicher (App.accountBalance) laufen neu");
  // Rückgängig in B stellt den Abschluss nicht still wieder her — nur, was B selbst geändert hat
  b.undo();
  assert.equal(b.getSettings()["closing:2026-09"], undefined);
});

test("Import „zusammenführen“ ersetzt keinen bestehenden Abschluss — und sagt es", () => {
  const st = storeOn(S.memoryBackend());
  st.setDay("2026-09-30", { start: "08:00", end: "19:00" });
  const current = Object.assign({}, SNAP, { balance: 222, at: "2026-10-05T08:00:00.000Z" });
  st.updateSettings({ "closing:2026-09": current }, { coalesce: false });
  const file = {
    schema: S.SCHEMA,
    days: { "2026-09-30": { date: "2026-09-30", start: "08:00", end: "17:00" }, "2026-08-14": { date: "2026-08-14", start: "08:00", end: "17:00" } },
    settings: { "closing:2026-09": Object.assign({}, SNAP, { balance: 132 }), "closing:2026-08": SNAP, theme: "dark" }
  };
  const res = st.importState(JSON.parse(JSON.stringify(file)), "merge");
  assert.equal(st.getSettings()["closing:2026-09"].balance, 222, "der aktuelle Abschluss bleibt");
  assert.deepEqual(res.closingsKept, ["2026-09"]);
  assert.equal(st.getSettings()["closing:2026-08"].balance, 30, "neue Abschlüsse kommen dazu");
  assert.equal(st.getSettings().theme, "dark", "übrige Einstellungen wie bisher");
  assert.equal(st.getDay("2026-09-30").end, "19:00");
  // Gleicher Abschluss in der Datei: nichts zu melden
  const same = st.importState({ schema: S.SCHEMA, days: {}, settings: { "closing:2026-09": current } }, "merge");
  assert.deepEqual(same.closingsKept, []);
  // „Alles ersetzen“ ersetzt auch den Abschluss
  st.importState(JSON.parse(JSON.stringify(file)), "replace");
  assert.equal(st.getSettings()["closing:2026-09"].balance, 132);
});
