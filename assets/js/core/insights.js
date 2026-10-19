/* ==========================================================================
   ZEITKONTO — Erkenntnisse
   --------------------------------------------------------------------------
   Reine Rechenhilfen für den Abschnitt „Erkenntnisse“ der Statistik:

     rhythm()      Kommen, Mittag und Gehen über 24 Stunden plus kurze
                   Aussagen („freitags gehst du 40 min früher“)
     projection()  Saldo am Monats- und Jahresende beim heutigen Tempo,
                   gemessen am Wohlfühl-Korridor
     overtimeYear() Überzeit nach ArG Art. 12/13: Wochenarbeitszeit über
                   dem gesetzlichen Höchstmass, gegen das Jahreskontingent
     premiums()    Nacht-, Sonntags- und Feiertagsstunden (ArG-Fenster)
     locations()   Arbeitstage nach Ort, Anteil Homeoffice

   Grundsatz: Eine Aussage erscheint nur, wenn genug Tage dahinterstehen —
   eine Mindestzahl je Gruppe UND ein Unterschied, der deutlich über dem
   Alltagsrauschen liegt (Welch-t). Lieber „zu wenig Daten“ als eine
   Behauptung aus drei Montagen. Wo mehrere Vergleiche gesucht werden
   (welcher Wochentag, ab welchem Monat), gilt eine strengere Schwelle.

   Eingabe sind immer berechnete Tage (Engine.computeDay/computeRange).
   Zeiten sind Minuten ab 00:00; Zeitachsen über Mitternacht (> 1440)
   wie in der Engine.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./engine.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Insights = factory(root.ZK.Time, root.ZK.Engine);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, E) {
  "use strict";

  var DAY = 1440;

  /* Mindestens so viele Tage je Vergleichsgruppe */
  var MIN = { weekday: 4, location: 5, trend: 8, lunch: 8, projection: 10 };
  /* Kleinere Unterschiede (Minuten) sind Alltag, keine Erkenntnis */
  var MIN_DIFF = 10;
  /* t-Schwellen: ein einzelner Vergleich ≈ 95 %; bei einer Suche über
     viele Paare oder Monate deutlich strenger (grob nach Bonferroni). */
  var T_SINGLE = 2;
  var T_SEARCH = 3;

  /* Lage der Pausen, die als Mittag gelten (Beginn zwischen 10 und 15 Uhr) */
  var LUNCH_FROM = 10 * 60, LUNCH_TO = 15 * 60;
  /* Rhythmus-Uhr: Klassen zu 30 Minuten */
  var BIN = 30;

  /* ArG: Nacht 23–06; Sonntag und gleichgestellte Feiertage von 23 Uhr
     am Vortag bis 23 Uhr (Art. 16, 18, 20a). */
  var NIGHT_START = 23 * 60, NIGHT_END = 6 * 60;

  var DEFAULT_BAND = { min: -5 * 60, max: 20 * 60 };
  var DEFAULT_MAX_WEEKLY = 45 * 60;

  /* ------------------------------------------------------------------ */
  /* Kleine Statistik                                                    */
  /* ------------------------------------------------------------------ */

  function mean(list) {
    if (!list.length) return null;
    var s = 0;
    for (var i = 0; i < list.length; i++) s += list[i];
    return s / list.length;
  }

  function variance(list, m) {
    if (list.length < 2) return 0;
    var s = 0;
    for (var i = 0; i < list.length; i++) s += (list[i] - m) * (list[i] - m);
    return s / (list.length - 1);
  }

  /**
   * Welch-Vergleich zweier Stichproben: diff = Mittel(b) − Mittel(a),
   * t = diff / Standardfehler. Ohne Streuung (alle Werte gleich) ist ein
   * Unterschied eindeutig: t = ±Infinity.
   */
  function welch(a, b) {
    var ma = mean(a), mb = mean(b);
    if (ma === null || mb === null) return null;
    var se = Math.sqrt(variance(a, ma) / a.length + variance(b, mb) / b.length);
    var diff = mb - ma;
    var t = se > 0 ? diff / se : (diff === 0 ? 0 : (diff > 0 ? Infinity : -Infinity));
    return { ma: ma, mb: mb, diff: diff, t: t, na: a.length, nb: b.length };
  }

  /** Quantil (lineare Interpolation) einer sortierten Liste. */
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function round5(v) { return Math.round(v / 5) * 5; }

  /** Tageszeit 0…1439, auch für Zeitachsen über Mitternacht. */
  function tod(min) { return ((Math.round(min) % DAY) + DAY) % DAY; }

  /* ------------------------------------------------------------------ */
  /* Tagesauswahl                                                        */
  /* ------------------------------------------------------------------ */

  /** Gearbeitet (netto > 0) und mit Beginn — gehört auf die Uhr. */
  function isWorked(r) {
    return !!r && r.net > 0 && r.startTod !== null && r.startTod !== undefined;
  }

  /** Nachtschicht: Ende (oder jetzt) liegt am Folgetag. */
  function isNight(r) {
    return r.endTl !== null && r.endTl !== undefined && r.endTl > DAY;
  }

  /**
   * „Normaler“ Arbeitstag für Vergleiche: ganz gearbeitet, mit Soll, keine
   * Teilabsenz, keine Nachtschicht. Ein halber Ferientag oder ein
   * Samstagseinsatz würde jeden Wochentags-Vergleich verzerren.
   */
  function isRegular(r) {
    return isWorked(r) && r.type === "work" && r.target > 0 && !isNight(r);
  }

  /** Abgerechnet: erfasst, nicht laufend, nicht unvollständig. */
  function isSettled(r) {
    return !!r && r.recorded && !r.running && !r.provisional && !r.incomplete;
  }

  /** Die Hauptpause eines Tages, wenn sie in der Mittagszeit beginnt. */
  function lunchOf(r) {
    var best = null;
    (r.breaks || []).forEach(function (b) {
      if (b.open) return;
      var len = b.end - b.start;
      if (len < 15) return;
      if (!best || len > best.end - best.start) best = b;
    });
    if (!best) return null;
    var start = tod(best.start);
    return start >= LUNCH_FROM && start <= LUNCH_TO ? start : null;
  }

  /* ------------------------------------------------------------------ */
  /* 1 · Rhythmus                                                        */
  /* ------------------------------------------------------------------ */

  function emptyBins() {
    var out = [];
    for (var i = 0; i < DAY / BIN; i++) out.push(0);
    return out;
  }

  /**
   * Verteilung von Kommen, Mittag und Gehen über 24 Stunden, Mittelwerte
   * und die Aussagen. Ø Kommen und Ø Gehen kommen aus Engine.clockAverages
   * — dieselben Zahlen wie die Kennzahlen der Statistik und der Rückblick:
   * ohne Nachtschichten (`nights`), bei wechselnden Schichten keine
   * (`shifts`, die Uhr zeigt dann nur die Verteilung).
   * @param {Array} days  berechnete Tage des Zeitraums
   * @returns {{ bins, n, avg, nights, shifts, facts, regular }}
   */
  function rhythm(days) {
    var bins = { arrive: emptyBins(), lunch: emptyBins(), leave: emptyBins() };
    var n = { arrive: 0, lunch: 0, leave: 0 };
    var lunches = [];

    (days || []).forEach(function (r) {
      if (!isWorked(r)) return;
      var night = isNight(r);
      bins.arrive[Math.floor(tod(r.startTod) / BIN)]++;
      n.arrive++;
      var l = lunchOf(r);
      if (l !== null) {
        bins.lunch[Math.floor(l / BIN)]++;
        n.lunch++;
        if (!night) lunches.push(l);
      }
      if (r.complete && r.endTl !== null) {
        bins.leave[Math.floor(tod(r.endTl) / BIN)]++;
        n.leave++;
      }
    });

    var clock = E.clockAverages(days);
    var avg = {
      arrive: clock.avgStart,
      lunch: clock.shifts ? null : roundOrNull(mean(lunches)),
      leave: clock.avgEnd
    };
    var regular = (days || []).filter(isRegular);
    return {
      bins: bins, binMinutes: BIN, n: n, avg: avg, nights: clock.nights, shifts: clock.shifts,
      regular: regular.length,
      facts: rhythmFacts(regular, days)
    };
  }

  function roundOrNull(v) { return v === null ? null : Math.round(v); }

  /**
   * Aussagen aus normalen Arbeitstagen. Jede trägt ihre Stichprobe (n)
   * und eine Stärke (|t|), nach der sortiert wird. Höchstens vier.
   * Formen:
   *   { id: "weekday", series: "arrive"|"leave", early, late, minutes, n: [a, b] }
   *   { id: "trend", series, since: "YYYY-MM-01", minutes (± später/früher), n }
   *   { id: "home", minutes (± länger/kürzer im Homeoffice), n: [home, office] }
   *   { id: "longest", weekday, avg, minutes, n: [tag, übrige] }
   *   { id: "lunch", from, to, n }
   */
  function rhythmFacts(regular, days) {
    var facts = [];

    ["arrive", "leave"].forEach(function (series) {
      var f = weekdayFact(regular, series);
      if (f) facts.push(f);
    });
    var trend = null;
    ["arrive", "leave"].forEach(function (series) {
      var f = trendFact(regular, series);
      if (f && (!trend || Math.abs(f.t) > Math.abs(trend.t))) trend = f;
    });
    if (trend) facts.push(trend);
    var home = homeFact(regular);
    if (home) facts.push(home);
    var longest = longestFact(days || regular);
    if (longest) facts.push(longest);
    var lunch = lunchFact(regular);
    if (lunch) facts.push(lunch);

    facts.sort(function (a, b) { return b.strength - a.strength; });
    return facts.slice(0, 4);
  }

  function valueOf(r, series) {
    if (series === "arrive") return r.startTod;
    if (series === "leave") return r.complete ? r.endTl : null;
    return r.net;
  }

  function byWeekday(regular, series) {
    var g = [[], [], [], [], [], [], []];
    regular.forEach(function (r) {
      var v = valueOf(r, series);
      if (v !== null && v !== undefined) g[r.weekday].push(v);
    });
    return g;
  }

  /** Welche zwei Wochentage liegen am weitesten auseinander — belastbar? */
  function weekdayFact(regular, series) {
    var g = byWeekday(regular, series);
    var best = null;
    for (var a = 0; a < 7; a++) {
      if (g[a].length < MIN.weekday) continue;
      for (var b = 0; b < 7; b++) {
        if (a === b || g[b].length < MIN.weekday) continue;
        var w = welch(g[a], g[b]);       // diff > 0: b später als a
        if (w.diff < MIN_DIFF || w.t < T_SEARCH) continue;
        if (!best || w.diff > best.w.diff) best = { a: a, b: b, w: w };
      }
    }
    if (!best) return null;
    return {
      id: "weekday", series: series,
      early: best.a, late: best.b,
      minutes: Math.round(best.w.diff),
      n: [best.w.na, best.w.nb],
      t: best.w.t, strength: Math.min(50, Math.abs(best.w.t))
    };
  }

  /** Seit welchem Monatsersten hat sich die Zeit klar verschoben? */
  function trendFact(regular, series) {
    var pts = [];
    regular.forEach(function (r) {
      var v = valueOf(r, series);
      if (v !== null && v !== undefined) pts.push({ date: r.date, v: v });
    });
    if (pts.length < MIN.trend * 2) return null;
    pts.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    var months = [];
    pts.forEach(function (p) {
      var m = p.date.slice(0, 7) + "-01";
      if (m > pts[0].date && months.indexOf(m) < 0) months.push(m);
    });
    var best = null;
    months.forEach(function (m) {
      var before = [], after = [];
      pts.forEach(function (p) { (p.date < m ? before : after).push(p.v); });
      if (before.length < MIN.trend || after.length < MIN.trend) return;
      var w = welch(before, after);
      if (Math.abs(w.diff) < MIN_DIFF || Math.abs(w.t) < T_SEARCH) return;
      if (!best || Math.abs(w.t) > Math.abs(best.w.t)) best = { m: m, w: w };
    });
    if (!best) return null;
    return {
      id: "trend", series: series, since: best.m,
      minutes: Math.round(best.w.diff),
      n: [best.w.na, best.w.nb],
      t: best.w.t, strength: Math.min(50, Math.abs(best.w.t))
    };
  }

  /** Netto im Homeoffice gegenüber Betrieb (ein einzelner Vergleich). */
  function homeFact(regular) {
    var home = [], office = [];
    regular.forEach(function (r) {
      if (!r.complete) return;
      if (r.location === "home") home.push(r.net);
      else if (!r.location || r.location === "office") office.push(r.net);
    });
    if (home.length < MIN.location || office.length < MIN.location) return null;
    var w = welch(office, home);
    if (Math.abs(w.diff) < MIN_DIFF || Math.abs(w.t) < T_SINGLE) return null;
    return {
      id: "home", minutes: Math.round(w.diff), n: [home.length, office.length],
      t: w.t, strength: Math.min(50, Math.abs(w.t))
    };
  }

  /* ------------------------------------------------------------------ */
  /* Längster Wochentag — eine Definition für Erkenntnisse und Rückblick  */
  /* ------------------------------------------------------------------ */

  /**
   * Voller Arbeitstag für Netto-Vergleiche nach Wochentag: abgeschlossen,
   * Tagesart Arbeit mit Soll. Ein halber Ferientag, ein Kurstag oder ein
   * Samstagseinsatz ohne Soll würde den Schnitt seines Wochentags
   * verzerren. Nachtschichten zählen — es geht um die Länge, nicht die Lage.
   */
  function isFullWorkday(r) {
    return isWorked(r) && !!r.complete && r.type === "work" && r.target > 0;
  }

  /* Montag zuerst: Gleichstände bleiben nicht am Sonntag hängen */
  var WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

  /**
   * Ø netto je Wochentag über volle Arbeitstage — Grundlage für „deine
   * längsten Tage“ (Erkenntnisse) und „Lieblingstag“ (Jahresrückblick).
   * Ein Wochentag kommt nur mit genug Tagen in Frage: mindestens
   * MIN.weekday und ein Viertel des häufigsten Wochentags.
   * → { days: [{ weekday, count, total, avg, values }] (0 = So),
   *     eligible: [Wochentag, …] (Montag zuerst), top, bottom }
   */
  function weekdayProfile(days) {
    var list = [];
    for (var d = 0; d < 7; d++) list.push({ weekday: d, count: 0, total: 0, avg: 0, values: [] });
    (days || []).forEach(function (r) {
      if (!isFullWorkday(r)) return;
      var w = list[r.weekday];
      w.count++;
      w.total += r.net;
      w.values.push(r.net);
    });
    var maxCount = 0;
    list.forEach(function (w) {
      w.avg = w.count ? Math.round(w.total / w.count) : 0;
      if (w.count > maxCount) maxCount = w.count;
    });
    var minCount = Math.max(MIN.weekday, Math.ceil(maxCount / 4));
    var eligible = WEEK_ORDER.filter(function (wd) { return list[wd].count >= minCount; });
    var top = null, bottom = null;
    eligible.forEach(function (wd) {
      var m = list[wd].total / list[wd].count;
      if (top === null || m > list[top].total / list[top].count) top = wd;
      if (bottom === null || m < list[bottom].total / list[bottom].count) bottom = wd;
    });
    return { days: list, eligible: eligible, top: top, bottom: eligible.length > 1 ? bottom : null };
  }

  /** Der Wochentag mit den längsten Tagen — klar länger als der Rest? */
  function longestFact(days) {
    var p = weekdayProfile(days);
    if (p.eligible.length < 3) return null;
    var top = p.top;
    var rest = [];
    p.eligible.forEach(function (d) { if (d !== top) rest = rest.concat(p.days[d].values); });
    var w = welch(rest, p.days[top].values);
    if (w.diff < MIN_DIFF || w.t < T_SEARCH) return null;
    return {
      id: "longest", weekday: top, avg: Math.round(w.mb), minutes: Math.round(w.diff),
      n: [w.nb, w.na], t: w.t, strength: Math.min(50, Math.abs(w.t))
    };
  }

  /** Die mittlere Hälfte der Mittagspausen — nur wenn sie eng beieinander liegt. */
  function lunchFact(regular) {
    var list = [];
    regular.forEach(function (r) { var l = lunchOf(r); if (l !== null) list.push(l); });
    if (list.length < MIN.lunch) return null;
    list.sort(function (a, b) { return a - b; });
    var q1 = round5(quantile(list, 0.25)), q3 = round5(quantile(list, 0.75));
    if (q3 - q1 > 60) return null;
    if (q3 === q1) q3 = q1 + 5;
    // Schwach gewichtet: eine Beschreibung, kein Unterschied
    return { id: "lunch", from: q1, to: q3, n: [list.length], strength: 1 };
  }

  /* ------------------------------------------------------------------ */
  /* 2 · Saldo-Prognose & Korridor                                       */
  /* ------------------------------------------------------------------ */

  /** Wohlfühl-Korridor aus den Einstellungen; null = ausgeschaltet. */
  function comfortBand(settings) {
    var b = settings && settings.comfortBand;
    if (b === false || (b && b.enabled === false)) return null;
    var min = b && isFinite(b.min) && b.min !== null ? Math.round(+b.min) : DEFAULT_BAND.min;
    var max = b && isFinite(b.max) && b.max !== null ? Math.round(+b.max) : DEFAULT_BAND.max;
    if (!(min < max)) return { min: DEFAULT_BAND.min, max: DEFAULT_BAND.max };
    return { min: min, max: max };
  }

  /**
   * Wie viel ein künftiger Tag zur Prognose beiträgt: ein Arbeitstag ganz,
   * ein halber Ferientag zur Hälfte, Feiertage, Wochenenden und geplante
   * Absenzen gar nicht.
   */
  function workWeight(r) {
    if (!r || !(r.target > 0) && !(r.baseTarget > 0)) return 0;
    if (r.type === "work") return r.target > 0 ? 1 : 0;
    var f = r.absenceFactor === undefined || r.absenceFactor === null ? 1 : r.absenceFactor;
    if (r.typeMeta && r.typeMeta.credits && f < 1 && r.baseTarget > 0) return Math.round((1 - f) * 100) / 100;
    return 0;
  }

  function clampCaps(v, settings) {
    var s = settings || {};
    var capped = false;
    if (s.capPlusMinutes !== null && s.capPlusMinutes !== undefined && v > s.capPlusMinutes) { v = s.capPlusMinutes; capped = true; }
    if (s.capMinusMinutes !== null && s.capMinusMinutes !== undefined && v < -Math.abs(s.capMinusMinutes)) { v = -Math.abs(s.capMinusMinutes); capped = true; }
    return { v: v, capped: capped };
  }

  /**
   * Prognose: Ø-Saldo der letzten `sample` abgerechneten Arbeitstage ×
   * verbleibende Arbeitstage, geplante Absenzen und Feiertage zählen nicht.
   * @param {Object} o {
   *   balance   abgerechneter Kontostand heute (Minuten),
   *   recent    berechnete Tage bis heute (aufsteigend),
   *   future    berechnete Tage ab heute bis zum Jahresende (aufsteigend),
   *   today, settings, sample (20), history (56 Tage Verlauf) }
   * @returns {{ ok, reason?, n, need?, avg, basisFrom, basisTo, path, monthEnd,
   *             yearEnd, band, status, hint }}
   */
  function projection(o) {
    o = o || {};
    var today = o.today;
    var sampleSize = o.sample || 20;
    var settings = o.settings || {};
    var band = comfortBand(settings);
    var recent = (o.recent || []).filter(function (r) { return r.date <= today; });

    var basis = recent.filter(function (r) {
      return isSettled(r) && r.type === "work" && r.target > 0;
    }).slice(-sampleSize);

    var out = { ok: false, n: basis.length, need: MIN.projection, band: band, balance: o.balance || 0 };
    if (basis.length < MIN.projection) { out.reason = "data"; return out; }

    var sum = 0;
    basis.forEach(function (r) { sum += r.balance || 0; });
    var avg = sum / basis.length;
    out.ok = true;
    out.avg = Math.round(avg);
    out.basisFrom = basis[0].date;
    out.basisTo = basis[basis.length - 1].date;

    /* Verlauf rückwärts vom wahren Kontostand: so endet die Linie genau
       dort, wo das Konto heute steht (auch mit Lücken-Minus oder Kappung). */
    var histDays = o.history || 56;
    var histFrom = T.addDays(today, -histDays);
    var past = [];
    var v = out.balance;
    for (var i = recent.length - 1; i >= 0; i--) {
      var r = recent[i];
      if (r.date < histFrom) break;
      past.push({ date: r.date, value: v });
      if (isSettled(r)) v -= r.balance || 0;
    }
    past.reverse();
    if (!past.length || past[past.length - 1].date !== today) past.push({ date: today, value: out.balance });

    var monthEnd = T.endOfMonth(today);
    var yearEnd = T.yearOf(today) + "-12-31";
    var proj = [];
    var cur = out.balance, capped = false;
    var remMonth = 0, remYear = 0;
    var month = Math.round(cur);
    (o.future || []).forEach(function (r) {
      if (r.date < today || r.date > yearEnd) return;
      // Heute schon abgeschlossen? Dann steckt der Tag bereits im Konto.
      var w = r.date === today && isSettled(r) ? 0 : workWeight(r);
      if (w) {
        var c = clampCaps(cur + avg * w, settings);
        cur = c.v;
        capped = capped || c.capped;
        remYear += w;
        if (r.date <= monthEnd) remMonth += w;
      }
      if (r.date <= monthEnd) month = Math.round(cur);
      if (r.date === today) return;
      proj.push({ date: r.date, value: Math.round(cur), projected: true });
    });

    out.history = past;
    out.path = proj;
    out.capped = capped;
    out.monthEnd = { date: monthEnd, value: month, days: round2(remMonth) };
    out.yearEnd = { date: yearEnd, value: Math.round(cur), days: round2(remYear) };
    out.status = band ? bandStatus(out.balance, band) : null;
    out.hint = band ? bandHint(out, band) : null;
    return out;
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  function bandStatus(value, band) {
    if (value > band.max) return "above";
    if (value < band.min) return "below";
    return "inside";
  }

  /**
   * Sanfter Hinweis, sobald Stand oder Prognose den Korridor verlassen —
   * mit der Korrektur pro Arbeitstag, die bis dahin genügen würde.
   * → { at: "now"|"month"|"year", side, value, limit, date?, perDay? }
   */
  function bandHint(p, band) {
    var now = bandStatus(p.balance, band);
    if (now !== "inside") {
      return { at: "now", side: now, value: p.balance, limit: now === "above" ? band.max : band.min };
    }
    var checks = [["month", p.monthEnd]];
    if (p.yearEnd.date !== p.monthEnd.date) checks.push(["year", p.yearEnd]);
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i][1];
      var side = bandStatus(c.value, band);
      if (side === "inside") continue;
      var limit = side === "above" ? band.max : band.min;
      var perDay = c.days > 0 ? Math.ceil(Math.abs(c.value - limit) / c.days) : null;
      return { at: checks[i][0], side: side, value: c.value, limit: limit, date: c.date, perDay: perDay };
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 3 · Überzeit nach ArG                                              */
  /* ------------------------------------------------------------------ */

  /** Jahreskontingent Überzeit: 170 h bei 45 h Höchstarbeitszeit, sonst 140 h. */
  function yearlyCap(maxWeekly) {
    return (maxWeekly || DEFAULT_MAX_WEEKLY) <= DEFAULT_MAX_WEEKLY ? 170 * 60 : 140 * 60;
  }

  /**
   * Überzeit eines Kalenderjahres: je Woche (Mo–So) die Arbeitszeit über
   * dem Höchstmass. Gewertet wird nur tatsächlich gearbeitete Zeit (netto,
   * bezahlte Pausen inklusive) — Ferien-Gutschriften sind keine Arbeit.
   * Eine Woche gehört zu ihrem ISO-Wochenjahr; laufende Tage zählen noch
   * nicht. `days` sollte ganze Wochen enthalten (Montag vor dem 1.1. bis
   * 31.12.), sonst fehlt der Anfang der ersten Woche.
   * @returns {{ year, maxWeekly, cap, total, weeksOver, weeks, used, remaining, warn, over }}
   */
  function overtimeYear(days, year, opts) {
    opts = opts || {};
    var maxWeekly = opts.maxWeekly || DEFAULT_MAX_WEEKLY;
    var today = opts.today || "9999-12-31";
    var map = {}, order = [];
    (days || []).forEach(function (r) {
      if (!r || r.date > today) return;
      var mon = T.startOfWeek(r.date, 1);
      if (T.isoWeekYear(mon) !== year) return;
      if (!map[mon]) { map[mon] = { monday: mon, worked: 0, days: 0 }; order.push(mon); }
      if (r.running || r.provisional || !(r.net > 0)) return;
      map[mon].worked += r.net;
      map[mon].days++;
    });
    order.sort();
    var total = 0, weeksOver = 0;
    var weeks = order.map(function (k) {
      var w = map[k];
      w.excess = Math.max(0, w.worked - maxWeekly);
      if (w.excess > 0) { total += w.excess; weeksOver++; }
      return w;
    });
    var cap = yearlyCap(maxWeekly);
    return {
      year: year, maxWeekly: maxWeekly, cap: cap,
      total: total, weeksOver: weeksOver, weeks: weeks,
      used: cap > 0 ? total / cap : 0,
      remaining: Math.max(0, cap - total),
      warn: total > cap * 0.8,
      over: total > cap
    };
  }

  /* ------------------------------------------------------------------ */
  /* 4 · Zuschlagszeiten & Arbeitsort                                    */
  /* ------------------------------------------------------------------ */

  function overlap(a1, a2, b1, b2) {
    var s = Math.max(a1, b1), e = Math.min(a2, b2);
    return e > s ? [s, e] : null;
  }

  /**
   * Nacht-, Sonntags- und Feiertagsminuten eines Tages aus seinen
   * Arbeitssegmenten (Wanduhr-Zeitachse ab 00:00 des Tages). Gezählt wird
   * in echten Minuten: In der Nacht der Zeitumstellung hat 23–06 nur sechs
   * bzw. acht Stunden. Was die Engine zusätzlich abzieht (fehlende
   * Pflichtpause), kürzt alle Anteile im selben Verhältnis.
   * Feiertage auf einem Sonntag zählen als Sonntag (nicht doppelt).
   * @param {Function} holidayOf  iso → Feiertag | null
   */
  function premiumOfDay(r, holidayOf) {
    var out = { night: 0, sunday: 0, holiday: 0 };
    if (!r || !(r.net > 0) || !r.segments || !r.segments.length) return out;
    var axis = T.dstAxis(r.date);
    function real(x) { return axis ? axis.toReal(x) : x; }
    var work = r.segments.filter(function (s) { return s.kind === "work" && s.end > s.start; });
    var total = 0, last = 0;
    work.forEach(function (s) { total += real(s.end) - real(s.start); last = Math.max(last, s.end); });
    if (total <= 0) return out;
    var k = Math.min(1, r.net / total);

    var span = Math.floor(last / DAY) + 1;
    var nights = [], sundays = [], holidays = [];
    for (var j = -1; j <= span; j++) nights.push([j * DAY + NIGHT_START, (j + 1) * DAY + NIGHT_END]);
    for (var d = 0; d <= span; d++) {
      var iso = T.addDays(r.date, d);
      var win = [d * DAY - 60, d * DAY + NIGHT_START];
      if (T.weekdayOf(iso) === 0) sundays.push(win);
      else if (holidayOf && holidayOf(iso)) holidays.push(win);
    }
    function sum(wins) {
      var m = 0;
      work.forEach(function (s) {
        wins.forEach(function (w) {
          var o = overlap(s.start, s.end, w[0], w[1]);
          if (o) m += real(o[1]) - real(o[0]);
        });
      });
      return m * k;
    }
    out.night = sum(nights);
    out.sunday = sum(sundays);
    out.holiday = sum(holidays);
    return out;
  }

  /**
   * Summen über einen Zeitraum, dazu die Zahl der betroffenen Tage.
   * @param {Object} opts { holidayOf(iso), today }
   */
  function premiums(days, opts) {
    opts = opts || {};
    var today = opts.today || "9999-12-31";
    var tot = { night: 0, sunday: 0, holiday: 0, nightDays: 0, sundayDays: 0, holidayDays: 0, net: 0 };
    (days || []).forEach(function (r) {
      if (!r || r.date > today || !(r.net > 0)) return;
      tot.net += r.net;
      var p = premiumOfDay(r, opts.holidayOf);
      ["night", "sunday", "holiday"].forEach(function (k) {
        if (p[k] >= 0.5) { tot[k] += p[k]; tot[k + "Days"]++; }
      });
    });
    tot.night = Math.round(tot.night);
    tot.sunday = Math.round(tot.sunday);
    tot.holiday = Math.round(tot.holiday);
    return tot;
  }

  /**
   * Gearbeitete Tage nach Ort und Anteil Homeoffice.
   * @param {Object} opts { today, limit (Prozent oder null) }
   */
  function locations(days, opts) {
    opts = opts || {};
    var today = opts.today || "9999-12-31";
    var counts = { office: 0, home: 0, field: 0, travel: 0 };
    var total = 0;
    (days || []).forEach(function (r) {
      if (!r || r.date > today || !(r.net > 0)) return;
      var loc = counts[r.location] !== undefined ? r.location : "office";
      counts[loc]++;
      total++;
    });
    var limit = homeLimit(opts.limit);
    var share = total ? counts.home / total : 0;
    return {
      total: total, counts: counts, share: share,
      limit: limit,
      over: limit !== null && total > 0 && share * 100 > limit + 1e-9
    };
  }

  /** Obergrenze Homeoffice in Prozent (1–100) oder null. */
  function homeLimit(v) {
    if (v === null || v === undefined || v === "" || v === false) return null;
    var n = +v;
    if (!isFinite(n) || n <= 0) return null;
    return Math.min(100, Math.round(n));
  }

  return {
    MIN: MIN,
    MIN_DIFF: MIN_DIFF,
    T_SINGLE: T_SINGLE,
    T_SEARCH: T_SEARCH,
    BIN: BIN,
    DEFAULT_BAND: DEFAULT_BAND,
    DEFAULT_MAX_WEEKLY: DEFAULT_MAX_WEEKLY,
    mean: mean,
    welch: welch,
    quantile: quantile,
    isRegular: isRegular,
    isFullWorkday: isFullWorkday,
    weekdayProfile: weekdayProfile,
    isSettled: isSettled,
    lunchOf: lunchOf,
    rhythm: rhythm,
    rhythmFacts: rhythmFacts,
    comfortBand: comfortBand,
    workWeight: workWeight,
    projection: projection,
    yearlyCap: yearlyCap,
    overtimeYear: overtimeYear,
    premiumOfDay: premiumOfDay,
    premiums: premiums,
    locations: locations,
    homeLimit: homeLimit
  };
});
