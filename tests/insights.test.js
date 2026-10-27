"use strict";
/* Erkenntnisse: Rhythmus und Aussagen, Saldo-Prognose, Überzeit nach ArG,
   Zuschlagszeiten (Nacht, Sonntag, Feiertag — auch über die Zeitumstellung)
   und Arbeitsort. Zeitzone fest auf Zürich (eigener Prozess je Datei). */
process.env.TZ = "Europe/Zurich";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../assets/js/core/time.js");
const R = require("../assets/js/core/rules.js");
const E = require("../assets/js/core/engine.js");
const X = require("../assets/js/core/insights.js");

const NOW = new Date(2026, 9, 16, 14, 23);        // Fr 16.10.2026, 14:23
const TODAY = "2026-10-16";

function settings(patch) {
  return Object.assign(R.defaultSettings(), { autoHolidays: false, holidayRegion: "none" }, patch || {});
}
function hm(m) { return T.formatHHMM(m); }
function day(record, s) {
  return E.computeDay(record, { settings: s || settings(), holiday: null, isToday: record.date === TODAY, now: NOW });
}
function range(records, from, to, s) {
  return E.computeRange(from, to, (iso) => records[iso], s || settings(), NOW).days;
}
/** Arbeitstag mit 30 min Mittag um 12:00 */
function work(date, start, end, extra) {
  return Object.assign({ date: date, start: start, end: end, breaks: [{ id: "m", start: "12:00", end: "12:30" }] }, extra || {});
}
/** Alle Werktage (Mo–Fr) zwischen from und to, Zeiten aus fn(iso, i) */
function workdays(from, to, fn) {
  const out = {};
  let i = 0;
  T.rangeDays(from, to).forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    const r = fn(iso, i++, wd);
    if (r) out[iso] = r;
  });
  return out;
}
/** Kleines, festes Rauschen (−6 … +6 min) statt Zufall */
function jitter(i) { return [0, 4, -3, 6, -6, 2, -2, 5, -4, 1][i % 10]; }

/* ---------------------------------------------------------------------- */
/* Statistik-Grundlagen                                                    */
/* ---------------------------------------------------------------------- */

test("Welch-Vergleich: Differenz und t mit Vorzeichen, ohne Streuung eindeutig", () => {
  const w = X.welch([1, 2, 3, 4], [11, 12, 13, 14]);
  assert.equal(w.diff, 10);
  assert.ok(w.t > 10);
  assert.equal(X.welch([5, 5, 5], [5, 5, 5]).t, 0);
  assert.equal(X.welch([5, 5, 5], [7, 7, 7]).t, Infinity);
  assert.equal(X.welch([], [1]), null);
  assert.equal(X.quantile([1, 2, 3, 4, 5], 0.25), 2);
});

/* ---------------------------------------------------------------------- */
/* 1 · Rhythmus                                                            */
/* ---------------------------------------------------------------------- */

test("Rhythmus: Klassen zu 30 min, Mittelwerte ohne Nachtschicht, Nacht trotzdem auf der Uhr", () => {
  const recs = {
    "2026-10-05": work("2026-10-05", "07:40", "17:00"),
    "2026-10-06": work("2026-10-06", "08:10", "17:20", { breaks: [{ id: "m", start: "11:50", end: "12:40" }] }),
    "2026-10-07": { date: "2026-10-07", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30" }] }
  };
  const rh = X.rhythm(range(recs, "2026-10-05", "2026-10-07"));
  assert.equal(rh.n.arrive, 3);
  assert.equal(rh.n.leave, 3);
  assert.equal(rh.n.lunch, 2, "die Nachtpause um 02:00 ist kein Mittag");
  assert.equal(rh.bins.arrive[15], 1, "07:40 liegt in 07:30–08:00");
  assert.equal(rh.bins.arrive[16], 1, "08:10 liegt in 08:00–08:30");
  assert.equal(rh.bins.arrive[44], 1, "22:00 liegt in 22:00–22:30");
  assert.equal(rh.bins.leave[12], 1, "06:00 am Folgetag landet bei 06:00");
  assert.equal(rh.bins.lunch[23], 1, "11:50 liegt in 11:30–12:00");
  assert.equal(rh.nights, 1);
  assert.equal(rh.avg.arrive, 475, "Ø 07:55 nur aus den Tagschichten");
  assert.equal(rh.avg.leave, 1030);
  assert.equal(rh.avg.lunch, 715);
  assert.equal(rh.regular, 2);
});

test("Rhythmus: laufender Tag zählt beim Kommen, aber noch nicht beim Gehen", () => {
  const recs = { [TODAY]: { date: TODAY, start: "07:42", end: "", breaks: [] } };
  const rh = X.rhythm(range(recs, TODAY, TODAY));
  assert.equal(rh.n.arrive, 1);
  assert.equal(rh.n.leave, 0);
});

test("Aussage Wochentag: montags klar früher als freitags — mit Stichprobe", () => {
  const recs = workdays("2026-06-01", "2026-08-28", (iso, i, wd) => {
    const start = (wd === 1 ? 7 * 60 : wd === 5 ? 7 * 60 + 30 : 7 * 60 + 15) + jitter(i);
    return work(iso, hm(start), hm(start + 510));
  });
  const facts = X.rhythm(range(recs, "2026-06-01", "2026-08-28")).facts;
  const f = facts.find((x) => x.id === "weekday" && x.series === "arrive");
  assert.ok(f, "Aussage zum Kommen erwartet");
  assert.equal(f.early, 1);
  assert.equal(f.late, 5);
  assert.ok(f.minutes >= 25 && f.minutes <= 35, "≈ 30 min: " + f.minutes);
  assert.equal(f.n.length, 2);
  assert.ok(f.n[0] >= 12 && f.n[1] >= 12);
});

test("Keine Aussage aus drei Montagen oder aus Rauschen", () => {
  const few = workdays("2026-10-05", "2026-10-23", (iso, i, wd) => {
    const start = (wd === 1 ? 7 * 60 : 8 * 60) + jitter(i);
    return work(iso, hm(start), hm(start + 510));
  });
  const facts = X.rhythm(range(few, "2026-10-05", "2026-10-23")).facts;
  assert.ok(!facts.some((x) => x.id === "weekday"), "nur 3 Montage: zu wenig Daten");

  const noise = workdays("2026-03-02", "2026-08-28", (iso, i) => {
    const start = 7 * 60 + 30 + jitter(i * 7 + 3);
    return work(iso, hm(start), hm(start + 510 + jitter(i * 3)));
  });
  const f2 = X.rhythm(range(noise, "2026-03-02", "2026-08-28")).facts;
  assert.ok(!f2.some((x) => x.id === "weekday" || x.id === "trend" || x.id === "longest"), JSON.stringify(f2));
});

test("Aussage Verlauf: seit August später gehen", () => {
  const recs = workdays("2026-05-04", "2026-10-09", (iso, i) => {
    const later = iso >= "2026-08-01" ? 15 : 0;
    const end = 17 * 60 + later + jitter(i);
    return work(iso, "07:30", hm(end));
  });
  const facts = X.rhythm(range(recs, "2026-05-04", "2026-10-09")).facts;
  const f = facts.find((x) => x.id === "trend");
  assert.ok(f, JSON.stringify(facts));
  assert.equal(f.series, "leave");
  assert.equal(f.since, "2026-08-01");
  assert.ok(f.minutes >= 12 && f.minutes <= 18, String(f.minutes));
});

test("Aussage Homeoffice: länger arbeiten an Homeoffice-Tagen", () => {
  const recs = workdays("2026-08-03", "2026-10-09", (iso, i, wd) => {
    const home = wd === 2 || wd === 4;
    const len = 480 + (home ? 25 : 0) + jitter(i);
    return work(iso, "08:00", hm(8 * 60 + 30 + len), { location: home ? "home" : "office" });
  });
  const f = X.rhythm(range(recs, "2026-08-03", "2026-10-09")).facts.find((x) => x.id === "home");
  assert.ok(f);
  assert.ok(f.minutes >= 20 && f.minutes <= 30, String(f.minutes));
  assert.deepEqual(f.n, [20, 30]);
});

test("Aussage längste Tage und Mittagsfenster; höchstens vier, nach Stärke", () => {
  const recs = workdays("2026-03-02", "2026-09-25", (iso, i, wd) => {
    const len = 480 + (wd === 2 ? 40 : 0) + jitter(i);
    const lunch = 12 * 60 + jitter(i * 3);
    return work(iso, "07:30", hm(7 * 60 + 30 + 30 + len), { breaks: [{ id: "m", start: hm(lunch), end: hm(lunch + 30) }] });
  });
  const facts = X.rhythm(range(recs, "2026-03-02", "2026-09-25")).facts;
  const longest = facts.find((x) => x.id === "longest");
  assert.ok(longest);
  assert.equal(longest.weekday, 2);
  const lunch = facts.find((x) => x.id === "lunch");
  assert.ok(lunch);
  assert.ok(lunch.from <= 12 * 60 && lunch.to >= 12 * 60 && lunch.to - lunch.from <= 15);
  assert.ok(facts.length <= 4);
  for (let i = 1; i < facts.length; i++) assert.ok(facts[i - 1].strength >= facts[i].strength);
  assert.equal(facts[facts.length - 1].id, "lunch", "Beschreibung kommt nach den Unterschieden");
});

test("Vergleiche ignorieren halbe Ferientage, Samstage und Nachtschichten", () => {
  const s = settings();
  assert.equal(X.isRegular(day(work("2026-10-07", "07:30", "17:00"), s)), true);
  assert.equal(X.isRegular(day({ date: "2026-10-08", type: "vacation", absenceFactor: 0.5, start: "07:30", end: "11:45", breaks: [] }, s)), false);
  assert.equal(X.isRegular(day(work("2026-10-10", "09:00", "13:00"), s)), false, "Samstag");
  assert.equal(X.isRegular(day({ date: "2026-10-07", start: "22:00", end: "06:00", breaks: [] }, s)), false);
});

/* ---------------------------------------------------------------------- */
/* 2 · Saldo-Prognose                                                      */
/* ---------------------------------------------------------------------- */

test("Korridor: Standard −5 h … +20 h, aus, ungültig → Standard", () => {
  assert.deepEqual(X.comfortBand({}), { min: -300, max: 1200 });
  assert.deepEqual(X.comfortBand({ comfortBand: { min: -120, max: 600 } }), { min: -120, max: 600 });
  assert.equal(X.comfortBand({ comfortBand: { min: -120, max: 600, enabled: false } }), null);
  assert.deepEqual(X.comfortBand({ comfortBand: { min: 600, max: 60 } }), { min: -300, max: 1200 });
});

test("Prognose: Ø der letzten 20 Arbeitstage × verbleibende Arbeitstage ohne Feiertage und Absenzen", () => {
  // 30 Arbeitstage bis gestern, die letzten 20 je +15 min (davor −30)
  const past = {};
  let n = 0;
  T.rangeDays("2026-08-24", "2026-10-15").forEach((iso) => {
    const wd = T.weekdayOf(iso);
    if (wd === 0 || wd === 6) return;
    n++;
    past[iso] = { date: iso, start: "07:30", end: "", breaks: [{ id: "m", start: "12:00", end: "12:30" }] };
  });
  const keys = Object.keys(past).sort();
  keys.forEach((iso, i) => {
    const plus = i >= keys.length - 20 ? 15 : -30;
    past[iso].end = hm(7 * 60 + 30 + 30 + 504 + plus);
  });
  // Zukunft: halber Ferientag, ganzer Ferientag, Feiertag (manuell)
  const plan = Object.assign({}, past, {
    [TODAY]: { date: TODAY, start: "07:42", end: "", breaks: [] },
    "2026-10-20": { date: "2026-10-20", type: "vacation", absenceFactor: 0.5, start: "", end: "", breaks: [] },
    "2026-10-21": { date: "2026-10-21", type: "vacation", start: "", end: "", breaks: [] },
    "2026-10-22": { date: "2026-10-22", type: "holiday", start: "", end: "", breaks: [] }
  });
  const s = settings({ comfortBand: { min: -300, max: 300 } });
  const recent = range(plan, "2026-07-01", TODAY, s);
  const future = range(plan, TODAY, "2026-12-31", s);
  const p = X.projection({ balance: 100, recent, future, today: TODAY, settings: s });
  assert.equal(p.ok, true);
  assert.equal(p.n, 20);
  assert.equal(p.avg, 15);
  // Oktober ab heute: 16., 19., 20. (½), 23., 26.–30. = 8.5 Tage
  assert.equal(p.monthEnd.days, 8.5);
  assert.equal(p.monthEnd.value, 100 + Math.round(15 * 8.5));
  // Nov 21 + Dez 23 Werktage
  assert.equal(p.yearEnd.days, 8.5 + 21 + 23);
  assert.equal(p.yearEnd.value, Math.round(100 + 15 * (8.5 + 44)));
  assert.equal(p.history[p.history.length - 1].value, 100, "Verlauf endet beim wahren Kontostand");
  assert.equal(p.history[p.history.length - 1].date, TODAY);
  assert.equal(p.path[p.path.length - 1].date, "2026-12-31");
  // Korridor bis +5:00 hält Ende Oktober (+3:48), Ende Dezember nicht mehr
  assert.equal(p.status, "inside");
  assert.equal(p.hint.at, "year");
  assert.equal(p.hint.side, "above");
  assert.equal(p.hint.limit, 300);
  assert.equal(p.hint.perDay, Math.ceil((p.yearEnd.value - 300) / p.yearEnd.days));
});

test("Prognose: zu wenig Arbeitstage → ehrlich keine Zahl", () => {
  const recs = workdays("2026-10-05", "2026-10-15", (iso) => work(iso, "07:30", "17:00"));
  const s = settings();
  const p = X.projection({ balance: 0, recent: range(recs, "2026-07-01", TODAY, s), future: range(recs, TODAY, "2026-12-31", s), today: TODAY, settings: s });
  assert.equal(p.ok, false);
  assert.equal(p.reason, "data");
  assert.equal(p.n, 9);
  assert.equal(p.need, 10);
});

test("Prognose: Stand schon ausserhalb → Hinweis „jetzt“, Kappung wird beachtet", () => {
  const recs = workdays("2026-09-01", "2026-10-15", (iso) => work(iso, "07:30", hm(7 * 60 + 30 + 30 + 504 + 30)));
  const s = settings({ capPlusMinutes: 1500 });
  const p = X.projection({ balance: 1400, recent: range(recs, "2026-07-01", TODAY, s), future: range(recs, TODAY, "2026-12-31", s), today: TODAY, settings: s });
  assert.equal(p.hint.at, "now");
  assert.equal(p.hint.side, "above");
  assert.equal(p.yearEnd.value, 1500, "Kappung");
  assert.equal(p.capped, true);
});

/* ---------------------------------------------------------------------- */
/* 3 · Überzeit nach ArG                                                    */
/* ---------------------------------------------------------------------- */

test("Überzeit: Wochen über 45 h zählen, Kontingent 170 h; 50 h → 140 h", () => {
  // KW 37: 5 × 9 h 30 netto = 47 h 30 → 2 h 30 Überzeit; KW 38: 5 × 8 h 24 = 42 h → keine
  const long = [{ id: "m", start: "12:00", end: "13:00" }];       // über 9 h braucht es 60 min
  const recs = Object.assign(
    workdays("2026-09-07", "2026-09-11", (iso) => work(iso, "07:00", "17:30", { breaks: long })),
    workdays("2026-09-14", "2026-09-18", (iso) => work(iso, "07:30", "16:24"))
  );
  const days = range(recs, "2025-12-29", "2026-12-31");
  const ot = X.overtimeYear(days, 2026, { maxWeekly: 45 * 60, today: TODAY });
  assert.equal(ot.total, 150);
  assert.equal(ot.weeksOver, 1);
  assert.equal(ot.cap, 170 * 60);
  assert.equal(ot.remaining, 170 * 60 - 150);
  assert.equal(ot.warn, false);
  const w37 = ot.weeks.find((w) => w.monday === "2026-09-07");
  assert.equal(w37.worked, 5 * 570);
  assert.equal(w37.excess, 150);

  const ot50 = X.overtimeYear(days, 2026, { maxWeekly: 50 * 60, today: TODAY });
  assert.equal(ot50.total, 0);
  assert.equal(ot50.cap, 140 * 60);
  assert.equal(X.yearlyCap(48 * 60), 140 * 60);
});

test("Überzeit: Warnung ab 80 % des Jahreskontingents, laufender Tag zählt noch nicht", () => {
  // 30 Wochen mit je 6 Tagen à 8 h 30 = 51 h → 6 h Überzeit je Woche = 180 h
  const recs = {};
  T.rangeDays("2026-01-05", "2026-08-01").forEach((iso) => {
    if (T.weekdayOf(iso) === 0) return;
    recs[iso] = work(iso, "07:00", "16:00");
  });
  const ot = X.overtimeYear(range(recs, "2025-12-29", "2026-12-31"), 2026, { maxWeekly: 45 * 60, today: TODAY });
  assert.equal(ot.weeksOver, 30);
  assert.equal(ot.total, 30 * 6 * 60);
  assert.equal(ot.warn, true);
  assert.equal(ot.over, true);
  assert.equal(ot.remaining, 0);

  const long = [{ id: "m", start: "12:00", end: "13:00" }];
  const live = Object.assign(
    workdays("2026-10-12", "2026-10-15", (iso) => work(iso, "06:00", "17:30", { breaks: long })),
    { [TODAY]: { date: TODAY, start: "05:00", end: "", breaks: [] } }
  );
  const ot2 = X.overtimeYear(range(live, "2026-10-12", "2026-10-18"), 2026, { maxWeekly: 45 * 60, today: TODAY });
  assert.equal(ot2.weeks[0].worked, 4 * 630);
  assert.equal(ot2.total, 0, "42 h ohne den laufenden Tag (mit ihm wären es über 45 h)");
});

test("Überzeit: Woche über den Jahreswechsel gehört zu ihrem ISO-Jahr", () => {
  // Mo 29.12.2025 – So 4.1.2026 ist KW 1/2026
  const recs = {};
  ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03"].forEach((iso) => {
    recs[iso] = work(iso, "07:00", "16:00");          // 8 h 30 netto, 6 Tage = 51 h
  });
  const days = range(recs, "2025-12-29", "2026-01-04");
  assert.equal(X.overtimeYear(days, 2026, { maxWeekly: 45 * 60 }).total, 360);
  assert.equal(X.overtimeYear(days, 2025, { maxWeekly: 45 * 60 }).total, 0);
});

/* ---------------------------------------------------------------------- */
/* 4 · Zuschlagszeiten                                                     */
/* ---------------------------------------------------------------------- */

test("Nachtstunden 23–06 über Mitternacht, Pause abgezogen", () => {
  const r = day({ date: "2026-06-05", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30" }] });
  const p = X.premiumOfDay(r);
  assert.equal(Math.round(p.night), 390, "7 h Nachtfenster − 30 min Pause");
  assert.equal(p.sunday, 0);
});

test("Zeitumstellung im Frühling: Nacht Sa→So hat nur 6 echte Stunden und ist Sonntagsarbeit ab 23 Uhr", () => {
  // 29.3.2026: 02:00 → 03:00. Pause 03:00–03:15 nach der Umstellung.
  const r = day({ date: "2026-03-28", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "03:00", end: "03:15" }] });
  assert.equal(r.presence, 420);
  assert.equal(r.net, 405);
  const p = X.premiumOfDay(r);
  assert.equal(Math.round(p.night), 345, "6 h − 15 min");
  assert.equal(Math.round(p.sunday), 345, "Sonntag beginnt Samstag 23 Uhr (ArG Art. 18)");
});

test("Zeitumstellung im Herbst: Nacht hat 8 echte Stunden", () => {
  const r = day({ date: "2026-10-24", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "01:00", end: "01:30" }] });
  assert.equal(r.net, 510);
  const p = X.premiumOfDay(r);
  assert.equal(Math.round(p.night), 450, "8 h − 30 min");
  assert.equal(Math.round(p.sunday), 450);
});

test("Sonntagsarbeit endet Sonntag 23 Uhr, Nacht beginnt 23 Uhr", () => {
  const sun = day(work("2026-10-18", "08:00", "12:00", { breaks: [] }));
  assert.equal(Math.round(X.premiumOfDay(sun).sunday), 240);
  const late = day({ date: "2026-10-18", start: "20:00", end: "02:00", breaks: [] });
  const p = X.premiumOfDay(late);
  // 6 h Anwesenheit, Arbeitszeit > 5 h 30 → 15 min Pflichtpause automatisch abgezogen
  assert.equal(late.net, 345);
  const k = 345 / 360;
  assert.equal(Math.round(p.sunday), Math.round(180 * k), "20–23 Uhr");
  assert.equal(Math.round(p.night), Math.round(180 * k), "23–02 Uhr");
});

test("Feiertag zählt von 23 Uhr am Vortag; auf einem Sonntag nur als Sonntag", () => {
  const holidayOf = (iso) => (iso === "2026-08-01" || iso === "2026-11-01" ? { name: "x" } : null);
  const sat = day(work("2026-08-01", "08:00", "12:00", { breaks: [] }));
  const p = X.premiumOfDay(sat, holidayOf);
  assert.equal(Math.round(p.holiday), 240);
  assert.equal(p.sunday, 0);
  const eve = day({ date: "2026-07-31", start: "21:00", end: "01:00", breaks: [] });
  assert.equal(Math.round(X.premiumOfDay(eve, holidayOf).holiday), 120, "31.7. 23 Uhr bis 1 Uhr");
  const sunHoliday = day(work("2026-11-01", "08:00", "12:00", { breaks: [] }));
  const q = X.premiumOfDay(sunHoliday, holidayOf);
  assert.equal(Math.round(q.sunday), 240);
  assert.equal(q.holiday, 0, "nicht doppelt");
});

test("Zuschläge über einen Zeitraum: Summen und betroffene Tage, Zukunft nicht", () => {
  const recs = {
    "2026-06-05": { date: "2026-06-05", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30" }] },
    "2026-10-11": work("2026-10-11", "08:00", "12:00", { breaks: [] }),
    "2026-10-18": work("2026-10-18", "08:00", "12:00", { breaks: [] })
  };
  const tot = X.premiums(range(recs, "2026-06-01", "2026-10-31"), { today: TODAY });
  assert.equal(tot.night, 390);
  assert.equal(tot.nightDays, 1);
  assert.equal(tot.sunday, 240);
  assert.equal(tot.sundayDays, 1);
  assert.equal(tot.holiday, 0);
});

test("Arbeitsort: Anteil Homeoffice und Obergrenze", () => {
  const recs = workdays("2026-10-05", "2026-10-15", (iso, i) => work(iso, "08:00", "17:00", { location: i % 3 === 0 ? "home" : (i === 1 ? "field" : "office") }));
  const loc = X.locations(range(recs, "2026-10-01", TODAY), { today: TODAY, limit: 30 });
  assert.equal(loc.total, 9);
  assert.equal(loc.counts.home, 3);
  assert.equal(loc.counts.field, 1);
  assert.equal(loc.counts.office, 5);
  assert.equal(Math.round(loc.share * 100), 33);
  assert.equal(loc.limit, 30);
  assert.equal(loc.over, true);
  assert.equal(X.locations([], { limit: 30 }).over, false);
  assert.equal(X.homeLimit(""), null);
  assert.equal(X.homeLimit(0), null);
  assert.equal(X.homeLimit(140), 100);
});

/* ---------------------------------------------------------------------- */
/* Oberfläche: Texte in vier Sprachen                                      */
/* ---------------------------------------------------------------------- */

const I = require("../assets/js/ui/i18n.js");
const added = [];
const origAdd = I.add;
I.add = function (dicts) { added.push(dicts); return origAdd(dicts); };
global.self = { ZK: { I18n: I, Time: T, Insights: X, Dom: {} } };
require("../assets/js/ui/ext.js");
require("../assets/js/ui/features/insights.js");
I.add = origAdd;
const UI = global.self.ZK.InsightsUI;
const fmt = (m) => T.formatDuration(m);
const signed = (m) => T.formatSigned(m);

test("Erkenntnisse-Texte: jeder Schlüssel in de, en, fr und it, Schweizer Rechtschreibung", () => {
  assert.equal(added.length, 1);
  const dicts = added[0];
  const keys = (lang) => Object.keys(dicts[lang]).sort();
  ["en", "fr", "it"].forEach((lang) => assert.deepEqual(keys(lang), keys("de"), "Schlüssel in " + lang));
  // Platzhalter stimmen in allen Sprachen überein
  const ph = (v) => (String(v).match(/\{\w+\}/g) || []).sort().join();
  Object.keys(dicts.de).forEach((k) => {
    assert.ok(!/ß/.test(dicts.de[k]), k);
    ["de", "en", "fr", "it"].forEach((lang) => assert.ok(String(dicts[lang][k]).trim(), lang + ":" + k));
    ["en", "fr", "it"].forEach((lang) => assert.equal(ph(dicts[lang][k]), ph(dicts.de[k]), lang + ":" + k));
  });
  assert.ok(global.self.ZK.Ext.list("stats.top").some((d) => d.id === "insights"));
  assert.ok(global.self.ZK.Ext.list("settings.sections").some((d) => d.id === "insights"));
});

test("Aussagen als Sätze: Wochentage und Monate richtig eingebettet", () => {
  const wd = { id: "weekday", series: "arrive", early: 1, late: 5, minutes: 18, n: [12, 11] };
  const trend = { id: "trend", series: "leave", since: "2026-08-01", minutes: 12, n: [40, 30] };
  const home = { id: "home", minutes: -24, n: [20, 30] };
  const longest = { id: "longest", weekday: 2, avg: 532, minutes: 14, n: [30, 120] };
  const lunch = { id: "lunch", from: 715, to: 745, n: [80] };
  I.setLang("de");
  assert.equal(UI.factText(wd, fmt, TODAY), "Du startest montags im Schnitt 18 min früher als freitags.");
  assert.equal(UI.factText(trend, fmt, TODAY), "Seit August gehst du im Schnitt 12 min später.");
  assert.equal(UI.factText(Object.assign({}, trend, { since: "2025-12-01", minutes: -9 }), fmt, TODAY), "Seit Dezember 2025 gehst du im Schnitt 9 min früher.");
  assert.equal(UI.factText(home, fmt, TODAY), "An Homeoffice-Tagen arbeitest du im Schnitt 24 min kürzer.");
  assert.equal(UI.factText(longest, fmt, TODAY), "Deine längsten Tage sind dienstags: Ø 8 h 52 min, 14 min mehr als an den übrigen Tagen.");
  assert.equal(UI.factText(lunch, fmt, TODAY), "Die Hälfte deiner Mittagspausen beginnt zwischen 11:55 und 12:25.");
  assert.equal(UI.nText(wd), "n = 12 / 11");
  I.setLang("fr");
  assert.equal(UI.factText(wd, fmt, TODAY), "En moyenne, vous commencez 18 min plus tôt le lundi que le vendredi.");
  assert.equal(UI.factText(trend, fmt, TODAY), "Depuis août, vous partez en moyenne 12 min plus tard.");
  I.setLang("it");
  assert.equal(UI.factText(wd, fmt, TODAY), "In media inizi 18 min prima il lunedì che il venerdì.");
  assert.equal(UI.factText(longest, fmt, TODAY), "Le tue giornate più lunghe sono il martedì: in media 8 h 52 min, 14 min in più degli altri giorni.");
  I.setLang("en");
  assert.equal(UI.factText(home, fmt, TODAY), "On home-office days you work 24 min less on average.");
  I.setLang("de");
});

test("Korridor-Hinweis: jetzt oder bis zu einem Datum, mit Korrektur pro Arbeitstag", () => {
  I.setLang("de");
  assert.equal(UI.hintText(null, fmt, signed), "");
  assert.equal(UI.hintText({ at: "now", side: "above", value: 1500, limit: 1200 }, fmt, signed),
    "Dein Saldo liegt schon über deinem Wohlfühl-Korridor (bis +20:00). Vielleicht ein guter Moment für einen freien Tag?");
  const h = UI.hintText({ at: "month", side: "below", value: -420, limit: -300, date: "2026-10-31", perDay: 12 }, fmt, signed);
  assert.equal(h, "Bei diesem Tempo fällst du bis zum 31. Oktober unter den Korridor (−7:00). Rund 12 min mehr pro Arbeitstag hält dich drin.");
});

/* ---------------------------------------------------------------------- */
/* Eine Definition: Kennzahlen der Statistik = Erkenntnisse = Rückblick    */
/* ---------------------------------------------------------------------- */

test("Ø Kommen/Gehen der Erkenntnisse = Ø Beginn/Feierabend der Statistik, auch mit Nachtschicht", () => {
  const recs = workdays("2026-06-01", "2026-07-31", (iso, i) => work(iso, hm(450 + jitter(i) * 3), hm(1020 + jitter(i + 3) * 2)));
  recs["2026-06-05"] = { date: "2026-06-05", start: "22:00", end: "06:00", breaks: [{ id: "n", start: "02:00", end: "02:30" }] };
  const r = E.computeRange("2026-06-01", "2026-07-31", (iso) => recs[iso], settings(), NOW);
  const rh = X.rhythm(r.days);
  assert.equal(rh.avg.arrive, r.totals.avgStart);
  assert.equal(rh.avg.leave, r.totals.avgEnd);
  assert.equal(rh.nights, r.totals.nightShifts);
  assert.equal(rh.nights, 1);
  assert.ok(r.totals.avgStart < 8 * 60, "die Nacht zieht den Schnitt nicht Richtung Abend");
});

test("Wechselnde Schichten: weder Statistik noch Erkenntnisse nennen einen Schnitt", () => {
  const recs = workdays("2026-09-07", "2026-10-02", (iso, i, wd) => {
    const late = Math.floor(i / 5) % 2 === 1;
    return work(iso, late ? "14:00" : "06:00", late ? "22:30" : "14:30", { breaks: [] });
  });
  const r = E.computeRange("2026-09-07", "2026-10-02", (iso) => recs[iso], settings(), NOW);
  const rh = X.rhythm(r.days);
  assert.equal(r.totals.shiftWork, true);
  assert.equal(rh.shifts, true);
  assert.equal(rh.avg.arrive, null);
  assert.equal(rh.avg.leave, null);
  assert.ok(rh.n.arrive > 0, "die Uhr zeigt die Verteilung trotzdem");
});

test("Wochentagsprofil: volle Arbeitstage, genug Tage je Wochentag, Montag zuerst bei Gleichstand", () => {
  const recs = workdays("2026-06-01", "2026-08-28", (iso, i, wd) =>
    work(iso, "08:00", wd === 3 ? "17:45" : "17:00"));
  // Halbe Ferientage am Mittwoch und Kurstage am Donnerstag zählen nicht
  recs["2026-06-10"] = Object.assign(work("2026-06-10", "13:00", "17:00", { breaks: [] }), { type: "vacation", absenceFactor: 0.5 });
  ["2026-06-11", "2026-06-18", "2026-06-25"].forEach((d) => { recs[d] = Object.assign(work(d, "07:00", "20:00"), { type: "training" }); });
  recs["2026-06-13"] = work("2026-06-13", "08:00", "18:00");      // Samstagseinsatz
  const days = E.computeRange("2026-06-01", "2026-08-28", (iso) => recs[iso], settings(), NOW).days;
  const p = X.weekdayProfile(days);
  assert.equal(p.top, 3, "Mittwoch");
  assert.equal(p.days[6].count, 0, "Samstag ohne Soll ist kein voller Arbeitstag");
  assert.ok(p.eligible.indexOf(6) < 0);
  assert.equal(p.days[4].count, 13 - 3, "Kurstage fehlen");
  const longest = X.rhythm(days).facts.find((f) => f.id === "longest");
  assert.ok(longest, "Aussage erwartet");
  assert.equal(longest.weekday, p.top);
});
