/* ==========================================================================
   ZEITKONTO — Jahresrückblick & Momente
   --------------------------------------------------------------------------
   Reine Rechnungen für den Rückblick („Dein Jahr in neun Bildern“) und für
   die kleinen Hinweise auf „Heute“. Gerechnet wird ausschliesslich mit der
   Engine und mit denselben Definitionen wie in der Statistik — eine Zahl
   im Rückblick darf nie anders lauten als dort:
     · Netto, gearbeitete Tage, Ø pro Tag, Ø Beginn und Feierabend
       (Engine.clockAverages: ohne Nachtschichten, keine bei wechselnden
       Schichten), frühester Beginn, spätester Feierabend und längster
       Tag: computeRange() vom 1.1. bis heute (vergangene Jahre bis
       31.12.), wie „Statistik · Jahr“
     · Lieblingstag: Insights.weekdayProfile, wie „deine längsten Tage“
       in den Erkenntnissen
     · erfasste Tage: nur Tage mit eigenem Eintrag (ein automatischer
       Feiertag ist keine Erfassung)
     · Ferientage: quotaUsage().vacationTaken („bezogen“ im Kontingent)
     · Zeitkonto: accountBalance() abgerechnet — ein laufender Tag zählt
       nicht, abgeschlossene Monate zählen eingefroren (ZK.Closing), wie in
       Kopfzeile und Statistik; Monatssaldi ebenso
     · Serie: wie bei den Erfolgen — Arbeitstage mit Erfassung; freie Tage
       und Feiertage ohne Eintrag unterbrechen nicht
   Krankheitstage stehen bewusst nirgends: Ein Rückblick zum Teilen soll
   nichts Persönliches über die Gesundheit erzählen.
   ========================================================================== */
(function (root, factory) {
  /* Den Monatsabschluss erst beim Rechnen holen: closing.js lädt nach dieser Datei */
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"), require("./engine.js"), require("./planner.js"),
      function () { return require("./closing.js"); }, require("./insights.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Review = factory(root.ZK.Time, root.ZK.Rules, root.ZK.Engine, root.ZK.Planner, function () { return root.ZK.Closing; }, root.ZK.Insights);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R, E, P, closing, X) {
  "use strict";

  /* Ab so vielen erfassten Tagen lohnt sich ein Rückblick. */
  var MIN_DAYS = 20;

  /* Vergleiche zum Schmunzeln — bewusst gerundet („rund“):
     Luzern–Lugano mit dem Zug knapp 2 Stunden, Glacier Express
     Zermatt–St. Moritz rund 8 Stunden, die Schweiz von West nach Ost
     rund 350 km, zu Fuss 5 km/h. */
  var COMPARE = { lugano: 120, glacier: 480, walkKmh: 5, swissKm: 350 };

  var LOCATIONS = ["office", "home", "field", "travel"];

  /* ------------------------------------------------------------------ */
  /* Hilfen                                                              */
  /* ------------------------------------------------------------------ */

  function todayOf(now) { return T.todayISO(now); }

  /* Abgeschlossene Monate zählen eingefroren — wie Kopfzeile, Kalender und
     Statistik (ZK.Closing). Ohne closing.js rechnet die Engine allein. */
  function closingOf() {
    var C = closing ? closing() : null;
    return C && C.accountBalance ? C : null;
  }

  function accountOf(records, s, upto, now) {
    var C = closingOf();
    return (C ? C.accountBalance : E.accountBalance)(records, s, upto, now).minutes;
  }

  /** Saldo eines Zeitraums aus der Summe der Tagessaldi (`live`). */
  function periodOf(records, s, from, to, live, now) {
    var C = closingOf();
    return C && C.periodBalance ? C.periodBalance(records, s, from, to, live, now) : live;
  }

  /** Jeder Tag höchstens einmal gerechnet (Serien, Brücken, Momente). */
  function dayMemo(records, s, now) {
    var today = todayOf(now);
    var memo = Object.create(null);
    return function (iso) {
      if (!memo[iso]) memo[iso] = E.computeDay(records[iso] || { date: iso }, { settings: s, now: now, isToday: iso === today });
      return memo[iso];
    };
  }

  /**
   * Status eines Tages für Serien — dieselbe Lesart wie die Erfolge
   * (Achievements.buildStats):
   *   "skip"    zählt nicht und unterbricht nicht (arbeitsfrei, Zukunft,
   *             Feiertag ohne eigenen Eintrag, heute noch offen)
   *   "done"    erfasst
   *   "missing" Arbeitstag ohne Erfassung — unterbricht
   */
  function statusFn(records, day, today) {
    return function (iso) {
      if (iso > today) return "skip";
      var r = day(iso);
      if (r.target <= 0) return "skip";
      var rec = records[iso];
      var own = !!rec && (r.complete || r.running || !!(rec.type && R.DAY_TYPES[rec.type]) || !!r.note ||
        (rec.targetOverride !== null && rec.targetOverride !== undefined));
      if (r.type === "holiday" && !own) return "skip";
      if (rec && r.recorded) return "done";
      return iso === today ? "skip" : "missing";
    };
  }

  /** Serien in [from, to] → { runs: [{days, from, to}], open } (open: die letzte läuft noch). */
  function streakRuns(status, from, to) {
    var runs = [];
    var cur = null;
    T.rangeDays(from, to).forEach(function (iso) {
      var st = status(iso);
      if (st === "done") {
        if (!cur) cur = { days: 0, from: iso, to: iso };
        cur.days++;
        cur.to = iso;
      } else if (st === "missing") {
        if (cur) runs.push(cur);
        cur = null;
      }
    });
    if (cur) runs.push(cur);
    return { runs: runs, open: !!cur };
  }

  /** Wird an diesem Tag gearbeitet (Soll, kein Feiertag, keine ganztägige Absenz)? */
  function works(r) {
    if (!r || r.target <= 0 || r.type === "holiday") return false;
    if (r.type === "work" || r.type === "training") return true;   // auch bewusst an einem Feiertag
    return r.absenceFactor < 1 && !r.holiday;   // halbe Absenz: die andere Hälfte wird gearbeitet
  }

  /** Voller Ferientag, der Kontingent kostet (Arbeitstag ohne Feiertag). */
  function isVacation(r) {
    return !!r && r.type === "vacation" && r.absenceFactor >= 1 && r.baseTarget > 0 && !r.holiday;
  }

  /* Mit dem Arbeitsmodell, das am Stichtag galt (Pensum ab Stichtag) */
  function averageDayTarget(s, iso) {
    var m = R.modelFor(iso, s);
    var targets = (m.weeklyTargets || []).filter(function (v) { return v > 0; });
    if (!targets.length) return 0;
    return Math.round(R.weeklyTargetMinutes(m) / targets.length);
  }

  /* ------------------------------------------------------------------ */
  /* Welche Jahre haben Daten?                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Erfasste Tage je Jahr (bis heute; Geplantes zählt nicht).
   * @returns {Array} [{ year, days }] — neuestes Jahr zuerst
   */
  function yearsWithData(records, settings, now) {
    var s = settings || R.defaultSettings();
    records = records || {};
    var today = todayOf(now);
    var count = {};
    Object.keys(records).forEach(function (iso) {
      if (iso > today || !T.isValidISO(iso)) return;
      var r = E.computeDay(records[iso], { settings: s, now: now, isToday: iso === today });
      if (!r.recorded) return;
      var y = T.yearOf(iso);
      count[y] = (count[y] || 0) + 1;
    });
    return Object.keys(count).map(function (y) { return { year: +y, days: count[y] }; })
      .sort(function (a, b) { return b.year - a.year; });
  }

  /* ------------------------------------------------------------------ */
  /* Beste Brücke                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Freie Tage am Stück pro bezogenem Ferientag. Ein Block ist eine
   * ununterbrochene Folge freier Tage (Wochenende, Feiertag, voller
   * Ferientag bis heute) mit mindestens einem Ferientag; er gehört dem
   * Jahr seines ersten Ferientags. Kompensation, Krankheit und halbe
   * Ferientage unterbrechen — sie sind keine „gekauften“ freien Tage.
   */
  function bestBridge(day, year, today) {
    var first = year + "-01-01";
    var last = year + "-12-31";
    var scanTo = (last < today ? last : today);
    var from = T.addDays(first, -16);
    var to = T.addDays(scanTo, 16);

    function kind(iso) {
      var r = day(iso);
      if (r.net > 0) return null;                                   // gearbeitet
      if (r.holiday || r.type === "holiday") return r.baseTarget > 0 ? "hol" : "free";
      if (r.baseTarget <= 0) return "free";                         // Wochenende
      if (r.type === "vacation") return (iso <= today && r.absenceFactor >= 1) ? "vac" : null;
      if (r.type === "free" && r.target <= 0) return "free";        // bewusst arbeitsfrei
      return null;
    }

    var best = null;
    var run = null;
    function close() {
      if (!run || !run.vacation || !run.firstVac || T.yearOf(run.firstVac) !== year) { run = null; return; }
      var ratio = run.days / run.vacation;
      var cand = { from: run.from, to: run.to, days: run.days, vacation: run.vacation, holidays: run.holidays, ratio: Math.round(ratio * 100) / 100 };
      if (!best || cand.ratio > best.ratio || (cand.ratio === best.ratio && cand.days > best.days)) best = cand;
      run = null;
    }
    T.rangeDays(from, to).forEach(function (iso) {
      var k = kind(iso);
      if (!k) { close(); return; }
      if (!run) run = { from: iso, to: iso, days: 0, vacation: 0, holidays: [], firstVac: null };
      run.to = iso;
      run.days++;
      if (k === "vac") {
        run.vacation++;
        if (!run.firstVac) run.firstVac = iso;
      }
      if (k === "hol") run.holidays.push(iso);
    });
    close();
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Jahreskennzahlen                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Alles, was der Rückblick eines Jahres zeigt.
   * @param {Object} records   Tageseinträge { iso: record }
   * @param {Object} settings
   * @param {Number} year
   * @param {Date}   [now]
   */
  function yearStats(records, settings, year, now) {
    var s = settings || R.defaultSettings();
    records = records || {};
    now = now || new Date();
    var today = todayOf(now);
    var from = year + "-01-01";
    var end = year + "-12-31";
    var until = end < today ? end : today;

    var st = {
      year: year,
      from: from,
      to: end,
      until: until,
      partial: until < end,
      empty: true,
      recordedDays: 0,
      workedDays: 0,
      totalNet: 0,
      avgNet: 0,
      totalBreak: 0,
      avgStart: null,
      avgEnd: null,
      earliest: null,       // { minutes, date }
      latest: null,         // { minutes (Zeitachse, > 1440 = Folgetag), date }
      longest: null,        // { minutes, date }
      earlyStarts: 0,       // Beginn vor 07:00
      lateEnds: 0,          // Feierabend ab 19:00 (auch am Folgetag)
      weekdays: [],         // 0 = So … 6 = Sa: { weekday, count, total, avg } — volle Arbeitstage
      favoriteWeekday: null,
      shortestWeekday: null,
      months: [],           // 0 … 11: { month, net, credited, value, target, balance, days, future }
      busiestMonth: null,
      locations: { office: 0, home: 0, field: 0, travel: 0 },
      homeShare: 0,
      streak: null,         // { days, from, to }
      vacationTaken: 0,
      vacationPlanned: 0,
      vacationEntitlement: 0,
      bridge: null,
      balanceStart: 0,
      balanceEnd: 0,
      balanceDelta: 0,
      dayTarget: averageDayTarget(s, until),
      balanceDays: 0,
      compare: { lugano: 0, glacier: 0, crossings: 0, km: 0 }
    };
    var m;
    for (m = 0; m < 12; m++) {
      st.months.push({ month: m, net: 0, credited: 0, value: 0, target: 0, balance: 0, days: 0, future: (year + "-" + (m < 9 ? "0" : "") + (m + 1) + "-01") > until });
    }
    for (m = 0; m < 7; m++) st.weekdays.push({ weekday: m, count: 0, total: 0, avg: 0 });
    if (from > today) return st;     // Jahr hat noch nicht begonnen

    var range = E.computeRange(from, until, function (iso) { return records[iso]; }, s, now);
    var totals = range.totals;
    st.totalNet = totals.net;
    st.avgNet = totals.avgNet;
    st.workedDays = totals.workedDays;
    st.totalBreak = totals.breakTotal;
    st.avgStart = totals.avgStart;
    st.avgEnd = totals.avgEnd;

    range.days.forEach(function (r) {
      if (r.recorded && records[r.date]) st.recordedDays++;
      var mo = st.months[+r.date.slice(5, 7) - 1];
      mo.net += r.net || 0;
      mo.credited += r.credited || 0;
      mo.target += r.target || 0;
      mo.balance += r.balance || 0;
      if (!(r.net > 0)) return;

      mo.days++;
      // Gleiche Reihenfolge wie Engine/Statistik: der erste Tag gewinnt bei Gleichstand
      if (!st.longest || r.net > st.longest.minutes) st.longest = { minutes: r.net, date: r.date };
      if (r.startTod !== null && (!st.earliest || r.startTod < st.earliest.minutes)) st.earliest = { minutes: r.startTod, date: r.date };
      if (r.endTl !== null && (!st.latest || r.endTl > st.latest.minutes)) st.latest = { minutes: r.endTl, date: r.date };
      if (r.startTod !== null && r.startTod < 7 * 60) st.earlyStarts++;
      // Zeitachse: eine Nachtschicht bis 06:00 (+1) ist auch ein später Feierabend
      if (r.endTl !== null && r.endTl >= 19 * 60) st.lateEnds++;
      var loc = LOCATIONS.indexOf(r.location) >= 0 ? r.location : "office";
      st.locations[loc]++;
    });
    st.empty = st.recordedDays === 0;

    /* Wochentage: Ø netto voller Arbeitstage — dieselbe Grundlage wie
       „deine längsten Tage“ in den Erkenntnissen. Ein Samstagseinsatz, ein
       halber Ferientag oder ein Kurstag soll weder Lieblings- noch
       kürzester Tag werden; nur Wochentage mit genug Tagen kommen in Frage. */
    var profile = X.weekdayProfile(range.days);
    st.weekdays.forEach(function (w) {
      var p = profile.days[w.weekday];
      w.count = p.count;
      w.total = p.total;
      w.avg = p.avg;
    });
    st.favoriteWeekday = profile.top === null ? null : st.weekdays[profile.top];
    st.shortestWeekday = profile.bottom === null ? null : st.weekdays[profile.bottom];

    st.months.forEach(function (mo) {
      var first = year + "-" + (mo.month < 9 ? "0" : "") + (mo.month + 1) + "-01";
      if (!mo.future) mo.balance = periodOf(records, s, first, T.endOfMonth(first), mo.balance, now);
      mo.value = mo.net + mo.credited;
      if (mo.net > 0 && (!st.busiestMonth || mo.net > st.busiestMonth.net)) st.busiestMonth = mo;
    });

    st.homeShare = st.workedDays ? st.locations.home / st.workedDays : 0;

    /* Serie: die längste innerhalb des Jahres */
    var day = dayMemo(records, s, now);
    var runs = streakRuns(statusFn(records, day, today), from, until).runs;
    runs.forEach(function (run) {
      if (!st.streak || run.days > st.streak.days) st.streak = run;
    });

    /* Ferien wie im Kontingent */
    var quota = E.quotaUsage(records, year, s, now);
    st.vacationTaken = quota.vacationTaken;
    st.vacationPlanned = quota.vacationPlanned;
    st.vacationEntitlement = quota.vacationEntitlement;
    st.bridge = bestBridge(day, year, today);

    /* Zeitkonto: abgerechnet am Jahresende (bzw. heute) und am Vorjahresende */
    st.balanceEnd = accountOf(records, s, until, now);
    st.balanceStart = accountOf(records, s, (year - 1) + "-12-31", now);
    st.balanceDelta = st.balanceEnd - st.balanceStart;
    st.balanceDays = st.dayTarget > 0 ? Math.floor(Math.abs(st.balanceEnd) / st.dayTarget * 2) / 2 : 0;

    st.compare = compare(st.totalNet);
    return st;
  }

  /** Vergleiche zum Schmunzeln (abgerundet — „mindestens so oft“). */
  function compare(totalNet) {
    var hours = Math.max(0, totalNet || 0) / 60;
    var km = hours * COMPARE.walkKmh;
    return {
      lugano: Math.floor(Math.max(0, totalNet || 0) / COMPARE.lugano),
      glacier: Math.floor(Math.max(0, totalNet || 0) / COMPARE.glacier),
      crossings: Math.floor(km / COMPARE.swissKm),
      km: Math.round(km)
    };
  }

  /** Erfasste Tage eines Jahres (für die Schwelle „Rückblick lohnt sich“). */
  function recordedDays(records, settings, year, now) {
    var hit = yearsWithData(records, settings, now).filter(function (y) { return y.year === year; })[0];
    return hit ? hit.days : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Momente — höchstens eine Zeile pro Tag                              */
  /* ------------------------------------------------------------------ */

  /* Neuer Rekord: die laufende Serie hat die bisher beste eben übertroffen.
     Nur am Tag des Rekords (und solange heute noch offen ist), nicht an
     jedem weiteren Tag — sonst wird es zur Dauerschleife. */
  function recordMoment(records, day, today) {
    var keys = Object.keys(records).filter(function (k) { return k <= today; }).sort();
    if (!keys.length) return null;
    var res = streakRuns(statusFn(records, day, today), keys[0], today);
    if (!res.open || !res.runs.length) return null;
    var cur = res.runs[res.runs.length - 1];
    var before = 0;
    res.runs.slice(0, -1).forEach(function (r) { if (r.days > before) before = r.days; });
    if (before < 5 || cur.days !== before + 1) return null;
    return { kind: "record", key: "st:" + cur.from, vars: { days: cur.days, previous: before } };
  }

  /* Ferien-Countdown: Ferien (mind. zwei Ferientage am Stück) beginnen
     nach höchstens vier weiteren Arbeitstagen. */
  function vacationMoment(day, today) {
    var start = null;
    for (var i = 1; i <= 21 && !start; i++) {
      var iso = T.addDays(today, i);
      if (isVacation(day(iso))) start = iso;
    }
    if (!start) return null;
    var vac = 0;
    for (var d = start, g = 0; g < 60; g++, d = T.addDays(d, 1)) {
      var r = day(d);
      if (works(r)) break;
      if (isVacation(r)) vac++;
    }
    if (vac < 2) return null;
    var n = 0;
    for (var x = T.addDays(today, 1); x < start; x = T.addDays(x, 1)) if (works(day(x))) n++;
    if (n > 4) return null;
    if (n === 0 && !works(day(today))) return null;   // Ferien haben faktisch schon begonnen
    return { kind: "vacation", key: "vac:" + start, vars: { n: n, start: start, days: vac } };
  }

  /* Langes Wochenende: ein freier Abschnitt von mind. drei Tagen, der in
     den nächsten vier Tagen beginnt und mehr ist als ein gewöhnliches
     Wochenende (Feiertag, Gleittag oder ein einzelner Ferientag). */
  function weekendMoment(day, today) {
    for (var i = 1; i <= 4; i++) {
      var iso = T.addDays(today, i);
      if (works(day(iso)) || !works(day(T.addDays(iso, -1)))) continue;
      var len = 0, extra = 0, vac = 0, holiday = null;
      for (var d = iso, g = 0; g < 30; g++, d = T.addDays(d, 1)) {
        var r = day(d);
        if (works(r)) break;
        len++;
        if (r.baseTarget > 0) extra++;
        if (isVacation(r)) vac++;
        if (!holiday && r.holiday && r.baseTarget > 0) holiday = d;
      }
      if (len >= 3 && extra >= 1 && vac <= 1) {
        return { kind: "weekend", key: "lw:" + iso, vars: { days: len, start: iso, holiday: holiday } };
      }
      return null;    // nur der nächste freie Abschnitt zählt
    }
    return null;
  }

  /* Brückentag in Sicht: ein einzelner Arbeitstag zwischen Feiertag und
     Wochenende in den nächsten zwei Wochen, noch ohne Eintrag. */
  function bridgeMoment(records, day, today) {
    if (!P || !P.bridgeDays) return null;
    var list = P.bridgeDays({
      from: T.addDays(today, 1),
      to: T.addDays(today, 24),
      maxVacation: 1,
      minRatio: 3,
      isHoliday: function (iso) { var r = day(iso); return !!r.holiday || r.type === "holiday"; },
      isWorkday: function (iso) { return day(iso).baseTarget > 0; }
    });
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var date = b.dates[0];
      var lead = T.diffDays(today, date);
      if (lead < 1 || lead > 14 || records[date]) continue;
      return { kind: "bridge", key: "br:" + date, vars: { date: date, days: b.totalDays, holiday: b.holidays[0] || null } };
    }
    return null;
  }

  /* Neuer Monat: am ersten Arbeitstag, mit dem Saldo des Vormonats
     (abgerechnet, wie die Monatssäule in der Statistik). */
  function monthMoment(records, s, now, day, today) {
    if (!works(day(today))) return null;
    var first = T.startOfMonth(today);
    for (var d = first; d < today; d = T.addDays(d, 1)) if (works(day(d))) return null;
    var prevEnd = T.addDays(first, -1);
    var prevStart = T.startOfMonth(prevEnd);
    var range = E.computeRange(prevStart, prevEnd, function (iso) { return records[iso]; }, s, now);
    var own = range.days.filter(function (r) { return r.recorded && records[r.date]; }).length;
    if (!own) return null;
    var balance = periodOf(records, s, prevStart, prevEnd, range.totals.balance, now);
    return { kind: "month", key: "mo:" + T.monthKey(today), vars: { month: prevStart, balance: balance } };
  }

  var MOMENT_ORDER = ["record", "vacation", "weekend", "bridge", "month"];

  /**
   * Der Moment des Tages — oder null.
   * @param {Object} opts { records, settings, now }
   *   settings.moments = { enabled, dismissed: { key: "YYYY-MM-DD" } }
   * Wurde heute schon ein Moment weggeklickt, bleibt es für heute still.
   */
  function moment(opts) {
    opts = opts || {};
    var records = opts.records || {};
    var s = opts.settings || R.defaultSettings();
    var now = opts.now || new Date();
    var cfg = s.moments || {};
    if (cfg.enabled === false) return null;
    var today = todayOf(now);
    var dismissed = cfg.dismissed || {};
    var keys = Object.keys(dismissed);
    for (var i = 0; i < keys.length; i++) if (dismissed[keys[i]] === today) return null;

    var day = dayMemo(records, s, now);
    var finders = {
      record: function () { return recordMoment(records, day, today); },
      vacation: function () { return vacationMoment(day, today); },
      weekend: function () { return weekendMoment(day, today); },
      bridge: function () { return bridgeMoment(records, day, today); },
      month: function () { return monthMoment(records, s, now, day, today); }
    };
    for (var k = 0; k < MOMENT_ORDER.length; k++) {
      var m = finders[MOMENT_ORDER[k]]();
      if (m && !dismissed[m.key]) return m;
    }
    return null;
  }

  /**
   * Weggeklickte Momente merken; Einträge, die älter als ein halbes Jahr
   * sind, fallen heraus (die Anlässe sind längst vorbei).
   */
  function dismiss(cfg, key, today) {
    var out = { enabled: !cfg || cfg.enabled !== false, dismissed: {} };
    var old = (cfg && cfg.dismissed) || {};
    var limit = T.addDays(today, -183);
    Object.keys(old).forEach(function (k) { if (old[k] >= limit) out.dismissed[k] = old[k]; });
    out.dismissed[key] = today;
    return out;
  }

  return {
    MIN_DAYS: MIN_DAYS,
    COMPARE: COMPARE,
    yearsWithData: yearsWithData,
    recordedDays: recordedDays,
    yearStats: yearStats,
    compare: compare,
    moment: moment,
    dismiss: dismiss,
    _works: works,
    _streakRuns: function (records, settings, from, to, now) {
      var day = dayMemo(records || {}, settings || R.defaultSettings(), now);
      return streakRuns(statusFn(records || {}, day, todayOf(now)), from, to);
    }
  };
});
