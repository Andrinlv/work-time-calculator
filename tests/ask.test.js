"use strict";
/* Frag dein Zeitkonto: Fragen in vier Sprachen verstehen (core/ask.js) und
   mit denselben Zahlen beantworten, die die Ansichten zeigen. Gerechnet wird
   mit der echten Engine, dem echten Planer und den Hilfen von Kalender,
   Woche, Rapport und „Heute“. */
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
const A = require("../assets/js/core/ask.js");
const X = require("../assets/js/core/insights.js");
const S = require("../assets/js/ui/views/today.js");
const I = require("../assets/js/ui/i18n.js");

/* Browser-Dateien in einer leeren Umgebung laden (wie in calweek.test.js) */
function load(file, extra) {
  const sandbox = { ZK: Object.assign({ Time: T, Rules: R, Holidays: H, Engine: E, Planner: P, I18n: I, Dom: {}, Ask: A }, extra || {}) };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
  return sandbox.ZK;
}
const CW = load("assets/js/ui/views/calendar.js").CalWeek;
const RP = load("assets/js/ui/views/reports.js").Views.reports.calc;
const extZK = load("assets/js/ui/ext.js");
const UI = load("assets/js/ui/features/ask.js", { CalWeek: CW, Ext: extZK.Ext, TodayState: S });
const AskUI = UI.AskUI;

const TODAY = "2026-10-16";                       // Freitag
const NOW = new Date(2026, 9, 16, 14, 23);

/* Testdaten wie im Browser-Prüfstand: Jan–Okt 2026, Ferien, Krankheit,
   Halbtag, Nachtschicht, Samstagseinsatz, Lücken, vergessenes Gehen und
   heute ein laufender Tag seit 07:42 mit Mittag 12:05–12:40. */
function seed(opts) {
  opts = opts || {};
  const days = {};
  const vac = new Set(["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
    "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"]);
  for (let iso = "2026-01-05"; iso <= "2026-10-15"; iso = T.addDays(iso, 1)) {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) continue;
    if (iso === "2026-10-12" || iso === "2026-10-13") continue;
    if (vac.has(iso)) { days[iso] = { date: iso, type: "vacation", start: "", end: "", breaks: [] }; continue; }
    if (iso === "2026-03-10") { days[iso] = { date: iso, type: "sick", start: "", end: "", breaks: [] }; continue; }
    const d = +iso.slice(8, 10);
    const start = 7 * 60 + (d % 5) * 11;                 // 07:00 … 07:44
    const len = 500 + (d % 7) * 6 - (wd === 5 ? 30 : 0);
    days[iso] = {
      date: iso, start: T.formatHHMM(start), end: T.formatHHMM(start + len + 30),
      breaks: [{ id: "l" + iso, start: "12:00", end: "12:30", paid: false }]
    };
  }
  days["2026-04-24"] = { date: "2026-04-24", type: "vacation", absenceFactor: 0.5, start: "07:30", end: "11:45", breaks: [] };
  days["2026-06-05"] = { date: "2026-06-05", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30" }] };
  days["2026-09-19"] = { date: "2026-09-19", start: "09:00", end: "13:00", breaks: [] };
  days["2026-09-22"] = Object.assign({}, days["2026-09-22"], { start: "06:40" });
  days["2026-10-14"] = Object.assign({}, days["2026-10-14"], { end: "" });
  if (opts.running !== false) days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [{ id: "r", start: "12:05", end: "12:40", paid: false }] };
  ["2026-12-28", "2026-12-29", "2026-12-30"].forEach((k) => { days[k] = { date: k, type: "vacation", start: "", end: "", breaks: [] }; });
  return days;
}

const STYLES = {
  long: { weekday: "short", day: "numeric", month: "long" },
  short: { weekday: "short", day: "numeric", month: "short" },
  dm: { day: "numeric", month: "short" }
};

/** Datenzugang wie AskUI.buildApi — nur aus den Kernmodulen statt aus ZK.App. */
function makeApi(days, opts) {
  opts = opts || {};
  const now = opts.now || NOW;
  I.setLang(opts.lang || "de");
  const s = Object.assign(R.defaultSettings(), { holidayRegion: "CH-LU", carryOverMinutes: 125, carryOverFrom: "2026-01-01" }, opts.settings || {});
  const today = T.todayISO(now);
  const get = (iso) => days[iso];
  const holiday = (iso) => (s.autoHolidays === false ? null : H.lookup(iso, s.holidayRegion));
  const record = (iso) => Object.assign(E.emptyRecord(iso), days[iso] || {});
  const day = (iso) => {
    const prev = days[T.addDays(iso, -1)];
    const prevRes = prev ? E.computeDay(prev, { settings: s, now }) : null;
    return E.computeDay(record(iso), {
      settings: s, holiday: holiday(iso), now,
      prevEndTl: prevRes && prevRes.complete ? prevRes.endTl : null, isToday: iso === today
    });
  };
  const accountBalance = (upto, o) => E.accountBalance(days, s, upto, now, o);
  const activeDate = () => E.activeShiftDate(get, now);
  return {
    today, now, lang: I.getLang(), s,
    settings: () => s,
    records: () => days,
    record, day, holiday, activeDate, accountBalance,
    range: (a, b) => E.computeRange(a, b, get, s, now),
    settledBalance: () => {
      const active = activeDate();
      const res = day(active);
      if (!res.running) return { minutes: accountBalance().minutes, live: null, liveDate: null, overnight: false };
      return { minutes: accountBalance(T.addDays(active, -1)).minutes, live: res.balance, liveDate: active, overnight: !!res.overnight };
    },
    todayState: S,
    summarize: (ds) => CW.summarize(ds, { today, start: CW.trackingStart(days, s, null), hasRecord: (iso) => !!days[iso] }),
    overtimeYear: (y) => X.overtimeYear(E.computeRange(T.startOfWeek(y + "-01-01", 1), y + "-12-31", get, s, now).days, y,
      { maxWeekly: s.maxWeeklyMinutes || X.DEFAULT_MAX_WEEKLY, today }),
    overtimeLaw: RP.overtimeLaw,
    t: I.t, tn: I.tn,
    fmt: (m) => T.formatDuration(m, s.durationStyle || "hm", { comma: I.getLang() !== "en" }),
    fmtSigned: (m) => T.formatSigned(m, s.durationStyle === "decimal" ? "decimal" : "clock"),
    num: CW.fmtNum,
    date: (iso, style) => I.formatDate(iso, STYLES[style] || STYLES.long),
    weekday: I.weekdayName,
    month: I.monthName
  };
}

const intents = (q, today) => A.parse(q, { today: today || TODAY }).map((x) => x.intent);
const first = (q) => A.parse(q, { today: TODAY })[0] || null;
/* Antworten verbinden Dauern und Daten mit geschütztem Leerzeichen — für
   Vergleiche mit api.fmt() wieder als normales Leerzeichen lesen */
function plain(a) {
  return Object.assign({}, a, { label: String(a.label).replace(/\u00a0/g, " "), sub: String(a.sub || "").replace(/\u00a0/g, " ") });
}
const answer1 = (it, api) => plain(A.answer(it, api)[0]);
function one(q, api) {
  const r = A.ask(q, api);
  assert.ok(r.length >= 1, "keine Antwort auf „" + q + "“");
  return plain(r[0]);
}

/* ====================================================================== */
/* Verstehen                                                               */
/* ====================================================================== */

const PHRASINGS = {
  de: [
    ["Wann kann ich gehen?", "leave"], ["feierabend?", "leave"], ["Wann ist Feierabend", "leave"],
    ["wann bin ich fertig", "leave"], ["wann für +1h", "target"], ["bis wann für ±0", "target"],
    ["Wie lange gestern?", "day"], ["montag", "day"], ["am 12.10.", "day"], ["wie viel habe ich heute gearbeitet", "day"],
    ["Saldo diese Woche", "period"], ["Monatssaldo", "period"], ["saldo oktober", "period"], ["Jahressaldo", "period"],
    ["letzte Woche", "period"], ["Zeitkonto", "account"], ["wie ist mein Saldo", "account"], ["Kontostand", "account"],
    ["Wie viele Ferientage habe ich noch?", "vacation"], ["Ferien bezogen", "vacation"], ["geplante Ferien", "vacation"],
    ["Resturlaub", "vacation"], ["Nächster Feiertag?", "holiday"], ["Brückentage", "bridge"], ["nächstes langes Wochenende", "bridge"],
    ["Brauche ich heute eine Pause?", "break"], ["Wie viel Pause brauche ich?", "break"], ["Pflichtpause", "break"],
    ["Überstunden dieses Jahr", "overtime"], ["Überzeit", "overtime"],
    ["Wie viele Stunden diese Woche noch bis Wochensoll", "weekRest"], ["Wochensoll", "weekRest"],
    ["Wann zuletzt vor 7?", "last"], ["wann zuletzt nach 18 uhr gegangen", "last"], ["was kannst du", "help"], ["Hilfe", "help"]
  ],
  ch: [
    ["wenn chan i hei", "leave"], ["wenn isch Firabig", "leave"], ["wie vill Ferie hani no", "vacation"],
    ["Wie lang hani geschter gschaffet", "day"], ["nöchschte Fiirtig", "holiday"], ["wieviel Überziit hani", "overtime"],
    ["wieviel Pause bruuch i hüt", "break"], ["Saldo die Wuche", "period"], ["wenn bin i s letscht mal vor 7 cho", "last"],
    ["wie vill Stunde muess i die Wuche no schaffe", "weekRest"], ["mäntig", "day"]
  ],
  en: [
    ["When can I leave?", "leave"], ["what time can I go home", "leave"], ["when for +1h", "target"],
    ["How long yesterday?", "day"], ["how long today", "day"], ["Monday", "day"], ["balance this week", "period"],
    ["balance last month", "period"], ["my balance", "account"], ["How many vacation days are left?", "vacation"],
    ["how much leave do I have left", "vacation"], ["Next public holiday?", "holiday"], ["next long weekend", "bridge"],
    ["do I need a break today", "break"], ["overtime this year", "overtime"], ["hours left this week", "weekRest"],
    ["last time before 7am", "last"], ["what can you do", "help"]
  ],
  fr: [
    ["Quand puis-je partir ?", "leave"], ["à quelle heure je peux partir", "leave"], ["jusqu'à quand pour ±0 ?", "target"],
    ["Combien d'heures hier ?", "day"], ["lundi", "day"], ["Solde de la semaine ?", "period"], ["solde du mois", "period"],
    ["mon solde", "account"], ["Combien de jours de vacances me reste-t-il ?", "vacation"], ["Prochain jour férié ?", "holiday"],
    ["prochain pont", "bridge"], ["pause obligatoire aujourd'hui", "break"], ["heures supplémentaires cette année", "overtime"],
    ["combien d'heures reste-t-il cette semaine", "weekRest"], ["Dernière fois avant 7 h ?", "last"], ["aide", "help"]
  ],
  it: [
    ["A che ora posso andare?", "leave"], ["a che ora posso uscire", "leave"], ["fino a quando per ±0?", "target"],
    ["Quanto ho lavorato ieri?", "day"], ["lunedì", "day"], ["Saldo della settimana?", "period"], ["saldo del mese", "period"],
    ["il mio saldo", "account"], ["Quanti giorni di ferie mi restano?", "vacation"], ["Prossimo giorno festivo?", "holiday"],
    ["prossimo ponte", "bridge"], ["quanta pausa devo fare oggi", "break"], ["straordinari quest'anno", "overtime"],
    ["quante ore mancano questa settimana", "weekRest"], ["Ultima volta prima delle 7?", "last"], ["aiuto", "help"]
  ]
};

const TOTAL = Object.keys(PHRASINGS).reduce((a, k) => a + PHRASINGS[k].length, 0);

Object.keys(PHRASINGS).forEach((lang) => {
  test("Verstehen (" + lang + "): jede Formulierung findet ihre Frage", () => {
    PHRASINGS[lang].forEach(([q, want]) => {
      const got = first(q);
      assert.ok(got, "nichts verstanden: „" + q + "“");
      assert.equal(got.intent, want, "„" + q + "“ → " + got.intent);
    });
  });
});

test("Mindestens 40 Formulierungen über vier Sprachen samt Schweizerdeutsch", () => {
  assert.ok(TOTAL >= 40, TOTAL + " Formulierungen");
  ["de", "ch", "en", "fr", "it"].forEach((l) => assert.ok(PHRASINGS[l].length >= 10, l));
});

test("Tippfehler, fehlende Umlaute, Grossschrift und Satzzeichen stören nicht", () => {
  [
    ["wan kan ich gehn", "leave"], ["feirabend", "leave"], ["WANN KANN ICH GEHEN??", "leave"], ["  wann kann ich gehen  ", "leave"],
    ["naechster feiertag", "holiday"], ["nachster feiertag", "holiday"], ["Ueberstunden", "overtime"],
    ["ferientage uebrig", "vacation"], ["ferientage ubrig", "vacation"], ["wie lange gesten", "day"],
    ["saldo dise woche", "period"], ["quand puis je partir", "leave"], ["prochain jour ferie", "holiday"],
    ["a che ora posso andaree", "leave"], ["Wie viele Ferientage habe ich noch", "vacation"]
  ].forEach(([q, want]) => assert.equal((first(q) || {}).intent, want, q));
});

test("Befehle, Einträge und Leeres sind keine Fragen — die Palette bleibt still", () => {
  ["", "   ", "kalender", "export", "design", "statistik", "drucken", "outlook", "einstellungen", "werkzeuge",
    "gestern 7:45-16:30", "8-17 30", "12.10.-16.10. ferien", "morgen ferien", "vortag kopieren", "tag leeren", "clock out", "wo", "uhr", "mini uhr", "Mini-Uhr öffnen", "lücken", "vergessen"]
    .forEach((q) => assert.deepEqual(intents(q), [], "„" + q + "“"));
});

test("Mehrdeutiges zeigt höchstens zwei Deutungen", () => {
  const t = A.parse("wann für +1h", { today: TODAY });
  assert.deepEqual(t.map((x) => x.intent + ":" + x.mode), ["target:day", "target:account"]);
  assert.deepEqual(intents("holidays"), ["holiday", "vacation"]);
  assert.deepEqual(intents("prossime ferie"), ["vacation", "holiday"]);
  assert.deepEqual(A.parse("wann für zeitkonto +2h", { today: TODAY }).map((x) => x.mode), ["account"]);
  assert.deepEqual(A.parse("wann für +1h heute", { today: TODAY }).map((x) => x.mode), ["day"]);
  assert.deepEqual(A.parse("bis wann für +52:00", { today: TODAY }).map((x) => x.mode), ["account"]);
  ["wann für +1h", "holidays", "feier", "wieviel pause bruuch i hüt", "saldo heute", "wann kann ich heute gehen"].forEach((q) => {
    assert.ok(A.parse(q, { today: TODAY }).length <= 2, q);
  });
  assert.deepEqual(intents("wieviel pause bruuch i hüt"), ["break"]);
});

test("Zielsaldo, Uhrzeit-Grenze und Tage werden gelesen", () => {
  const tg = (q) => A.analyze(q, { today: TODAY }).target;
  assert.equal(tg("wann für +1h"), 60);
  assert.equal(tg("wann für -0:30"), -30);
  assert.equal(tg("wann für −0:30"), -30);
  assert.equal(tg("bis wann für ±0"), 0);
  assert.equal(tg("wann für +1h30"), 90);
  assert.equal(tg("wann für +45min"), 45);
  assert.equal(tg("wann für +1,5 h"), 90);
  assert.equal(tg("wann für + 2 h"), 120);
  assert.equal(tg("bis wann für null"), 0);
  const hr = (q) => A.analyze(q, { today: TODAY }).hour;
  assert.deepEqual(hr("wann zuletzt vor 7:30"), { dir: "before", minutes: 450 });
  assert.deepEqual(hr("last time after 6pm"), { dir: "after", minutes: 1080 });
  assert.deepEqual(hr("dernière fois avant 7h"), { dir: "before", minutes: 420 });
  assert.deepEqual(hr("ultima volta dopo le 19"), { dir: "after", minutes: 1140 });
  assert.equal(hr("vor 7 tagen"), null);
  const day = (q) => (A.parse(q, { today: TODAY })[0] || {}).date;
  assert.equal(day("am 12.10."), "2026-10-12");
  assert.equal(day("wie lange am 12.10.2026"), "2026-10-12");
  assert.equal(day("montag"), "2026-10-12");
  assert.equal(day("freitag"), TODAY);
  assert.equal(day("nächsten Montag"), "2026-10-19");
  assert.equal(day("letzten Freitag"), "2026-10-09");
  assert.equal(day("vorgestern"), "2026-10-14");
  assert.equal(day("wie lange am 3."), "2026-10-03");
  assert.equal(day("wie lange am 20."), "2026-09-20");
});

test("Lesen bleibt unter 5 ms pro Frage", () => {
  const all = [];
  Object.keys(PHRASINGS).forEach((l) => PHRASINGS[l].forEach((p) => all.push(p[0])));
  all.forEach((q) => A.parse(q, { today: TODAY }));         // aufwärmen
  const times = [];
  for (let round = 0; round < 5; round++) {
    all.forEach((q, i) => {
      const t0 = process.hrtime.bigint();
      A.parse(q + " ".repeat(round + (i % 2)), { today: TODAY });   // am Zwischenspeicher vorbei
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    });
  }
  /* Einzelne Ausreisser sind Speicherbereinigung oder ein voller Rechner,
     nicht der Parser — gemessen wird Median und 95. Perzentil. */
  times.sort((a, b) => a - b);
  const median = times[times.length >> 1], p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(median < 1, "Median " + median.toFixed(3) + " ms");
  assert.ok(p95 < 5, "95. Perzentil " + p95.toFixed(3) + " ms");
});

/* ====================================================================== */
/* Antworten = Zahlen der Ansichten                                        */
/* ====================================================================== */

test("Feierabend: dieselbe Zeit, Pause und derselbe Rest wie in „Heute“", () => {
  const api = makeApi(seed());
  const a = one("Wann kann ich gehen?", api);
  const res = api.day(TODAY);
  const lv = S.leave(res, S.nowOnTimeline(res, 14 * 60 + 23));
  assert.equal(a.intent, "leave");
  assert.equal(a.data.leaveTl, lv.leaveTl);
  assert.equal(a.data.remaining, res.remaining);
  assert.equal(a.data.brk, S.recommendedBreak(res));
  assert.ok(a.label.indexOf(T.formatHHMM(lv.leaveTl)) === 0, a.label);
  assert.ok(a.label.indexOf(api.fmt(res.remaining)) > 0, a.label);
  assert.ok(a.label.indexOf("35 min Pause") > 0, a.label);
  assert.ok(a.sub.indexOf("07:42") >= 0, a.sub);
  assert.deepEqual(a.nav, { view: "today", date: TODAY });
  const raw = A.ask("Wann kann ich gehen?", api)[0];
  assert.ok(/ min/.test(raw.label) && !/\d min/.test(raw.label + raw.sub), "Dauern ohne Umbruch: " + raw.label);
});

test("Feierabend vor dem Einstempeln: „Wenn du jetzt kommst“ wie in „Heute“", () => {
  const days = seed({ running: false });
  const api = makeApi(days);
  const a = one("feierabend", api);
  const w = E.computeDay(Object.assign(E.emptyRecord(TODAY), { start: "14:23", end: "" }), { settings: api.s, holiday: null, isToday: true, now: NOW });
  assert.equal(a.data.phase, "whatif");
  assert.equal(a.data.leaveTl, w.recommendedLeaveTl);
  assert.ok(a.label.indexOf(T.formatHHMM(w.recommendedLeaveTl)) > 0, a.label);
});

test("Feierabend im Soll-Plus, nach dem Gehen und am freien Tag", () => {
  const late = makeApi(seed(), { now: new Date(2026, 9, 16, 17, 30) });
  const a = one("wann kann ich gehen", late);
  assert.equal(a.data.phase, "overtime");
  assert.equal(a.tone, "plus");
  const days = seed();
  days[TODAY] = Object.assign({}, days[TODAY], { end: "13:00" });
  const gone = one("feierabend", makeApi(days));
  assert.ok(/^Heute schon gegangen: 13:00/.test(gone.label), gone.label);
  const sat = one("feierabend", makeApi(seed(), { now: new Date(2026, 9, 17, 10, 0) }));
  assert.equal(sat.label, "Heute ist frei — kein Soll");
});

test("Nachtschicht: Feierabend gehört zur Schicht von gestern", () => {
  const days = { "2026-10-15": { date: "2026-10-15", start: "22:00", end: "", breaks: [] } };
  const api = makeApi(days, { now: new Date(2026, 9, 16, 2, 0) });
  const a = one("wann kann ich gehen", api);
  assert.equal(a.nav.date, "2026-10-15");
  assert.ok(/\(\+1 Tag\)/.test(a.label), a.label);
  assert.ok(a.sub.indexOf("Nachtschicht seit 22:00") === 0, a.sub);
});

test("Zielsaldo heute: ±0 ist der Feierabend, +1h die erste Minute mit Tagessaldo +1:00", () => {
  const api = makeApi(seed());
  const zero = answer1({ intent: "target", mode: "day", minutes: 0 }, api);
  const leave = one("feierabend", api);
  assert.equal(zero.data.leaveTl, leave.data.leaveTl);
  const plus = answer1({ intent: "target", mode: "day", minutes: 60 }, api);
  const at = (tl) => E.computeDay(Object.assign({}, api.record(TODAY), { end: T.formatHHMM(tl) }), { settings: api.s, isToday: true, now: NOW }).balance;
  assert.ok(at(plus.data.leaveTl) >= 60);
  assert.ok(at(plus.data.leaveTl - 1) < 60);
  // +1 h Arbeit kreuzt hier die 9-h-Stufe: 60 statt 30 min Pause, also 25 min länger bleiben
  assert.equal(plus.data.leaveTl - zero.data.leaveTl, 85);
  assert.ok(/inkl\. 1 h Pause/.test(plus.sub), plus.sub);
  assert.ok(plus.label.indexOf("für +1:00 heute") > 0, plus.label);
  const reached = answer1({ intent: "target", mode: "day", minutes: -300 }, api);
  assert.ok(/schon erreicht/.test(reached.label), reached.label);
});

test("Zielsaldo Zeitkonto: rechnet wie der Gleitzeit-Planer und öffnet ihn vorbelegt", () => {
  const api = makeApi(seed());
  const a = answer1({ intent: "target", mode: "account", minutes: 60 }, api);
  const res = api.day(TODAY);
  const base = api.accountBalance(T.addDays(TODAY, -1)).minutes;
  const plan = P.distributeBalance(base, 60, [{ date: TODAY, target: res.target, min: res.net, today: true }], { maxNet: 600 });
  if (plan.feasible) {
    const leave = P.leaveTimeForBalance({ start: res.start, target: plan.days[0].target, wantBalance: plan.days[0].deltaPerDay,
      breakMinutes: res.breakTotal, breakRuleset: "ch", customBreakTiers: api.s.customBreakTiers, autoDeductBreak: true, roundStep: 0, roundMode: "nearest" });
    assert.equal(a.data.leaveTl, leave.minutes);
  } else {
    assert.ok(/erreicht|nicht erreichbar/.test(a.label), a.label);
  }
  assert.equal(a.data.base, base);
  assert.deepEqual(a.nav, { view: "tools", planner: { until: TODAY, target: "+1:00" } });
  const bal = answer1({ intent: "target", mode: "account", minutes: base + 30 }, api);
  assert.equal(bal.data.deltaToday, 30);
});

test("Ein Tag: Netto, Saldo, Lücke und fehlendes Gehen wie im Tagesdialog", () => {
  const api = makeApi(seed());
  const y = one("wie lange gestern", api);
  const r = api.day("2026-10-15");
  assert.equal(y.label, api.fmt(r.net) + " netto · Saldo " + api.fmtSigned(r.balance));
  assert.ok(y.sub.indexOf(r.start + "–" + r.end) >= 0, y.sub);
  assert.deepEqual(y.nav, { view: "today", date: "2026-10-15" });
  assert.equal(one("montag", api).label, "Nichts erfasst");
  assert.ok(/^Gehen fehlt — gekommen/.test(one("vorgestern", api).label));
  const half = one("am 24.4.", api);
  assert.ok(/netto \+ 4 h 12 min Ferien 50 %/.test(half.label), half.label);
  const today = one("wie lange heute", api);
  assert.ok(today.label.indexOf(api.fmt(api.day(TODAY).net) + " netto bisher") === 0, today.label);
  assert.equal(one("nächsten Montag", api).label, "Noch nichts erfasst · Soll 8 h 24 min");
  assert.equal(one("am 29.12.2026", api).label, "Geplant: Ferien");
  assert.ok(/^Feiertag: /.test(one("am 1.1.2026", api).label));
});

test("Woche, Monat, Jahr: dieselben Saldi wie Woche, Kalender und Statistik", () => {
  const api = makeApi(seed());
  const w = one("saldo diese woche", api);
  const ws = api.summarize(api.range("2026-10-12", "2026-10-18").days);
  assert.equal(w.data.balance, ws.settled);
  assert.equal(w.data.provisional, ws.provisional);
  assert.equal(w.label, "Saldo KW 42: " + api.fmtSigned(ws.settled));
  assert.deepEqual(w.nav, { view: "week", date: "2026-10-12" });

  const m = one("monatssaldo", api);
  const ms = api.summarize(api.range("2026-10-01", "2026-10-31").days);
  assert.equal(m.data.balance, ms.settled);
  assert.equal(m.data.balance, api.range("2026-10-01", "2026-10-31").totals.balance);
  assert.equal(m.data.target, ms.targetToDate);
  assert.ok(/Soll bis heute/.test(m.sub) && /heute läuft/.test(m.sub) && /2 Lücken/.test(m.sub), m.sub);
  assert.deepEqual(m.nav, { view: "calendar", month: "2026-10" });

  const sep = one("saldo september", api);
  assert.equal(sep.data.balance, api.range("2026-09-01", "2026-09-30").totals.balance);
  assert.ok(/^Saldo September 2026: /.test(sep.label), sep.label);

  const y = one("jahressaldo", api);
  assert.equal(y.data.balance, api.range("2026-01-01", TODAY).totals.balance);
  assert.equal(y.data.account, api.accountBalance(TODAY).minutes);
  assert.equal(y.data.account, y.data.balance + 125);    // Übertrag
  assert.deepEqual(y.nav, { view: "stats" });

  const last = one("letzte woche", api);
  assert.equal(last.data.from, "2026-10-05");
});

test("Zeitkonto: abgerechnet wie die Kopfzeile, Live-Teil getrennt", () => {
  const api = makeApi(seed());
  const a = one("zeitkonto", api);
  const bal = api.settledBalance();
  assert.equal(a.data.minutes, bal.minutes);
  assert.equal(a.data.live, bal.live);
  assert.equal(a.label, "Zeitkonto " + api.fmtSigned(bal.minutes));
  assert.ok(a.sub.indexOf("heute läuft " + api.fmtSigned(bal.live)) >= 0, a.sub);
  assert.deepEqual(a.nav, { view: "stats" });
});

test("Ferien: übrig, bezogen, geplant aus E.quotaUsage", () => {
  const api = makeApi(seed());
  const q = E.quotaUsage(api.records(), 2026, api.s, NOW);
  const left = one("Wie viele Ferientage habe ich noch?", api);
  assert.equal(left.data.quota.vacationLeft, q.vacationLeft);
  assert.equal(left.label, CW.fmtNum(q.vacationLeft) + " Ferientage übrig");
  assert.ok(left.sub.indexOf("Anspruch 25") > 0, left.sub);
  const taken = one("ferien bezogen", api);
  assert.equal(taken.label, CW.fmtNum(q.vacationTaken) + " Ferientage bezogen");
  const planned = one("geplante ferien", api);
  assert.equal(planned.label, "3 Ferientage geplant");
  assert.deepEqual(planned.data.next, { from: "2026-12-28", to: "2026-12-30" });
  assert.deepEqual(planned.nav, { view: "calendar", month: "2026-12" });
  const over = one("ferien übrig", makeApi(seed(), { settings: { vacationDaysPerYear: 5 } }));
  assert.equal(over.tone, "minus");
  assert.ok(/überzogen/.test(over.label), over.label);
});

test("Feiertage: nächster Feiertag, am Wochenende mit dem nächsten freien Werktag", () => {
  const api = makeApi(seed());
  const a = one("Nächster Feiertag?", api);
  assert.equal(a.data.date, "2026-11-01");
  assert.ok(a.label.indexOf("Allerheiligen") === 0, a.label);
  assert.ok(/in 16 Tagen/.test(a.sub) && /fällt auf Sonntag/.test(a.sub) && /Mariä Empfängnis/.test(a.sub), a.sub);
  assert.deepEqual(a.nav, { view: "calendar", month: "2026-11" });
  I.setLang("fr");
  const fr = one("prochain jour férié", makeApi(seed(), { lang: "fr" }));
  assert.ok(fr.label.indexOf("Toussaint") === 0, fr.label);
  const off = one("nächster feiertag", makeApi(seed(), { settings: { autoHolidays: false } }));
  assert.equal(off.label, "Feiertage sind ausgeschaltet");
});

test("Lange Wochenenden: derselbe Brückentag wie in den Werkzeugen", () => {
  const api = makeApi(seed());
  const a = one("nächstes langes Wochenende", api);
  const map = Object.assign({}, H.forYear(2025, "CH-LU"), H.forYear(2026, "CH-LU"), H.forYear(2027, "CH-LU"));
  const tools = P.bridgeDays({
    from: "2026-10-17", to: "2027-01-10",
    isHoliday: (iso) => !!map[iso], isWorkday: (iso) => R.baseTargetFor(iso, api.s, T.weekdayOf(iso)) > 0
  }).filter((b) => T.yearOf(b.from) === 2026);
  assert.equal(a.data.kind, "bridge");
  assert.equal(a.data.from, tools[0].from);
  assert.equal(a.data.vacationDays, tools[0].vacationDays);
  assert.ok(/4 Tage frei mit 1 Ferientag/.test(a.label), a.label);
  assert.deepEqual(a.nav, { view: "tools", section: "bridges" });
});

test("Pause: heute noch nötig, erledigt oder für einen vollen Tag", () => {
  const api = makeApi(seed());
  const done = one("brauche ich heute pause", api);
  assert.equal(done.data.taken, 35);
  assert.equal(done.label, "35 min Pause — erledigt");
  assert.ok(/ab 9 h Arbeit: 1 h$/.test(done.sub), done.sub);     // die nächste Stufe, die mehr verlangt
  const days = seed();
  days[TODAY] = { date: TODAY, start: "07:42", end: "", breaks: [] };
  const todo = one("wie viel pause brauche ich", makeApi(days));
  assert.equal(todo.label, "Noch 30 min Pause nötig");
  const fresh = one("pflichtpause", makeApi(seed({ running: false })));
  assert.equal(fresh.label, "Für einen vollen Tag: 30 min Pause");
  assert.ok(/ab 5 h 30 min Arbeit: 15 min/.test(fresh.sub), fresh.sub);
});

test("Überzeit: wie in den Erkenntnissen der Statistik, sonst wie im Rapport, sonst Plus-Tage", () => {
  const api = makeApi(seed(), { settings: { maxWeeklyMinutes: 42 * 60 } });
  const a = one("überstunden dieses jahr", api);
  const ot = api.overtimeYear(2026);
  assert.equal(a.data.law, ot.total);
  assert.ok(ot.total > 0, "Testdaten sollen Überzeit enthalten");
  assert.equal(a.label, api.fmt(ot.total) + " Überzeit 2026");
  assert.ok(/über 42 h pro Woche/.test(a.sub) && /Jahreskontingent 170 h/.test(a.sub), a.sub);
  const range = api.range("2026-01-01", TODAY);
  const plus = range.days.filter((r) => !r.running && !r.incomplete && r.balance > 0).length;
  assert.equal(a.data.plusDays, plus);
  const rapport = answer1({ intent: "overtime" }, Object.assign(makeApi(seed(), { settings: { maxWeeklyMinutes: 42 * 60 } }), { overtimeYear: null }));
  assert.equal(rapport.data.law, RP.overtimeLaw(range.days, TODAY, 42 * 60));
  const none = one("überzeit", makeApi(seed(), { settings: { maxWeeklyMinutes: 50 * 60 } }));
  assert.equal(none.label, "Keine Überzeit 2026");
  const noLaw = answer1({ intent: "overtime" }, Object.assign(makeApi(seed()), { overtimeLaw: null, overtimeYear: null }));
  assert.ok(noLaw.label.indexOf("Tage im Plus (2026)") > 0, noLaw.label);
});

test("Bis zum Wochensoll: Ist und Soll der Wochenansicht", () => {
  const api = makeApi(seed());
  const a = one("wie viele stunden diese woche noch bis wochensoll", api);
  const ws = api.summarize(api.range("2026-10-12", "2026-10-18").days);
  assert.equal(a.data.actual, ws.net + ws.credited);
  assert.equal(a.data.target, ws.target);
  assert.equal(a.label, "Noch " + api.fmt(ws.target - ws.net - ws.credited) + " bis zum Wochensoll");
  assert.deepEqual(a.nav, { view: "week", date: "2026-10-12" });
});

test("Wann zuletzt vor 7 / nach 18 Uhr", () => {
  const api = makeApi(seed());
  const a = one("wann zuletzt vor 7", api);
  assert.equal(a.data.date, "2026-09-22");
  assert.ok(a.label.indexOf("06:40") > 0, a.label);
  assert.deepEqual(a.nav, { view: "today", date: "2026-09-22" });
  const late = one("wann zuletzt nach 18 uhr gegangen", api);
  assert.equal(late.data.date, "2026-06-05");                // Nachtschicht bis 06:00 (+1)
  const never = one("wann zuletzt vor 5", api);
  assert.equal(never.label, "Noch nie vor 05:00 gekommen");
});

test("Hilfe: acht Beispiele, die sich selbst verstehen — in jeder Sprache", () => {
  ["de", "en", "fr", "it"].forEach((lang) => {
    const api = makeApi(seed(), { lang });
    const help = A.ask("?", api);
    assert.equal(help.length, 8);
    help.forEach((h) => {
      assert.equal(h.fill, h.label);
      const got = A.parse(h.fill, { today: TODAY });
      assert.ok(got.length && got[0].intent !== "help", lang + ": „" + h.fill + "“");
    });
  });
});

test("Antworten in vier Sprachen ohne Platzhalter, undefined oder NaN", () => {
  const qs = ["wann kann ich gehen", "wann für +1h", "wie lange gestern", "vorgestern", "montag", "saldo diese woche",
    "monatssaldo", "jahressaldo", "zeitkonto", "ferientage übrig", "ferien bezogen", "geplante ferien", "nächster feiertag",
    "brückentage", "pause", "überzeit", "wochensoll", "wann zuletzt vor 7", "wann zuletzt nach 18", "?"];
  ["de", "en", "fr", "it"].forEach((lang) => {
    [seed(), seed({ running: false }), {}].forEach((days) => {
      const api = makeApi(days, { lang });
      qs.forEach((q) => {
        A.ask(q, api).forEach((a) => {
          [a.label, a.sub].forEach((txt) => {
            assert.equal(typeof a.label, "string");
            assert.ok(!/undefined|NaN|null|\{\w+\}|ask\./.test(txt || ""), lang + " „" + q + "“: " + txt);
          });
        });
      });
    });
  });
  I.setLang("de");
});

test("Leere Daten: jede Frage hat eine ruhige Antwort", () => {
  const api = makeApi({});
  assert.equal(one("zeitkonto", api).label, "Zeitkonto +2:05");
  assert.equal(one("ferientage übrig", api).label, "25 Ferientage übrig");
  assert.equal(one("wann zuletzt vor 7", api).label, "Noch nie vor 07:00 gekommen");
});

/* ====================================================================== */
/* Palette                                                                 */
/* ====================================================================== */

test("Palette: Antworten oben und zweizeilig; Stempelbefehle behalten Enter", () => {
  I.setLang("de");
  const api = makeApi(seed());
  const cmds = AskUI.toCommands(A.ask("wann kann ich gehen", api), "wann kann ich gehen", {});
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].answer, true);
  assert.equal(cmds[0].late, false);
  assert.equal(cmds[0].group, "Antwort");
  ["pause", "Pause", "gehen stempeln", "kommen", "pau"].forEach((q) => assert.equal(AskUI.clashesWithAction(q), true, q));
  ["wann kann ich gehen", "wie viel pause", "feierabend"].forEach((q) => assert.equal(AskUI.clashesWithAction(q), false, q));
  const help = AskUI.toCommands(A.ask("?", api), "?", {});
  assert.equal(help[0].group, "Frag dein Zeitkonto");
  assert.equal(typeof help[0].fill, "string");
});

test("Palette: leer gibt es nur die Vorschlagszeile ganz unten", () => {
  I.setLang("de");
  const row = AskUI.collect("", { App: {} })[0];
  assert.equal(row.late, true);
  assert.equal(row.fill, "?");
  assert.equal(row.sub.split(" · ").length, 4);
  assert.equal(AskUI.collect("kalender", { App: { settings: () => ({}), dataRevision: () => "x" } }).length, 0);
  assert.ok(extZK.Ext.list("palette.commands").some((d) => d.id === "ask"));
});

test("Texte: jeder Schlüssel in allen vier Sprachen, Schweizer „ss“", () => {
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/core/ask.js"), "utf8") +
    fs.readFileSync(path.join(__dirname, "../assets/js/ui/features/ask.js"), "utf8");
  const used = new Set((src.match(/"ask\.[a-zA-Z.]+"/g) || []).map((s) => s.slice(1, -1)));
  ["leave", "vacation", "day", "week", "holiday", "target", "break", "last"].forEach((k) => {
    used.add("ask.ex." + k); used.add("ask.exs." + k);
  });
  const de = Object.keys(I.DICT.de).filter((k) => k.indexOf("ask.") === 0);
  ["en", "fr", "it"].forEach((lang) => {
    const keys = Object.keys(I.DICT[lang]).filter((k) => k.indexOf("ask.") === 0);
    assert.deepEqual(keys.slice().sort(), de.slice().sort(), lang);
  });
  used.forEach((k) => {
    if (/\.$/.test(k)) return;
    ["de", "en", "fr", "it"].forEach((lang) => assert.ok(I.DICT[lang][k] !== undefined, lang + ": " + k));
  });
  de.forEach((k) => assert.ok(I.DICT.de[k].indexOf("ß") < 0, k));
  ["de", "en", "fr", "it"].forEach((lang) => assert.ok(/\S/.test(I.DICT[lang]["cmd.placeholder"])));
});
