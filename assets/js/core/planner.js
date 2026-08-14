/* ==========================================================================
   ZEITKONTO — Planung, Schnellerfassung und Prüfung
   --------------------------------------------------------------------------
   Alles, was vorausdenkt statt nur zurückzurechnen:

     · Schnellerfassung   „gestern 7:45-16:30 p30“ → fertiger Tageseintrag
     · Gleitzeit-Planer   Zielsaldo bis Datum → was pro Tag nötig ist
     · Kompensation       wie viele freie Tage im Konto stecken
     · Brückentage        wo wenige Ferientage viele freie Tage ergeben
     · Monatscheck        was vor dem Abschluss noch zu klären ist

   Wieder ausschliesslich reine Funktionen — die Oberfläche liegt in
   ui/views/tools.js.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Planner = factory(root.ZK.Time, root.ZK.Rules);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R) {
  "use strict";

  /* ==================================================================== */
  /* 1 · SCHNELLERFASSUNG                                                  */
  /* ==================================================================== */

  var RELATIVE_DAYS = {
    heute: 0, today: 0, "aujourd'hui": 0, oggi: 0,
    gestern: -1, yesterday: -1, hier: -1, ieri: -1,
    vorgestern: -2,
    morgen: 1, tomorrow: 1, demain: 1, domani: 1,
    übermorgen: 2, uebermorgen: 2
  };

  var TYPE_WORDS = {
    ferien: "vacation", urlaub: "vacation", vacation: "vacation", vacances: "vacation", ferie: "vacation",
    krank: "sick", sick: "sick", malade: "sick", malattia: "sick",
    unfall: "accident", accident: "accident",
    militär: "military", militaer: "military", wk: "military",
    komp: "comp", kompensation: "comp", zeitausgleich: "comp", compensation: "comp",
    kurs: "training", weiterbildung: "training", training: "training", formation: "training",
    feiertag: "holiday", holiday: "holiday",
    frei: "free", unbezahlt: "unpaid"
  };

  /**
   * Liest eine Zeile wie „gestern 7:45-16:30 p30“ oder „12.8.-16.8. ferien“.
   *
   * Erkannt werden, in beliebiger Reihenfolge:
   *   · ein Datum oder Datumsbereich (relativ, TT.MM[.JJJJ] oder ISO)
   *   · eine Zeitspanne  8-17 · 08:00-17:00 · 0800-1700
   *   · eine Pausendauer  p30 · 30min · pause 30
   *   · ein Stichwort für die Tagesart
   *
   * @returns {Object|null} { dates, start, end, breakMinutes, type, factor }
   */
  function parseQuickEntry(input, today) {
    if (!input) return null;
    var base = today || T.todayISO();
    var text = String(input).trim().toLowerCase().replace(/\s+/g, " ");
    if (!text) return null;

    var result = { dates: [], start: null, end: null, breakMinutes: null, type: null, factor: 1 };
    var rest = text;

    /* ---- Tagesart --------------------------------------------------- */
    Object.keys(TYPE_WORDS).forEach(function (word) {
      if (result.type) return;
      var re = new RegExp("(^|\\s)" + escapeRe(word) + "(\\s|$)");
      if (re.test(rest)) {
        result.type = TYPE_WORDS[word];
        rest = rest.replace(re, " ");
      }
    });
    if (/(^|\s)(halbtag|halber tag|½|1\/2|half)(\s|$)/.test(rest)) {
      result.factor = 0.5;
      rest = rest.replace(/(^|\s)(halbtag|halber tag|½|1\/2|half)(\s|$)/, " ");
    }

    /* ---- Datumsbereich ---------------------------------------------- */
    var rangeMatch = /(\d{1,2}\.\d{1,2}\.?(?:\d{2,4})?|\d{4}-\d{2}-\d{2})\s*(?:-|–|bis|to|au|a)\s*(\d{1,2}\.\d{1,2}\.?(?:\d{2,4})?|\d{4}-\d{2}-\d{2})/
      .exec(rest);
    if (rangeMatch) {
      var a = parseDateToken(rangeMatch[1], base);
      var b = parseDateToken(rangeMatch[2], base);
      if (a && b && a <= b) {
        result.dates = T.rangeDays(a, b);
        rest = rest.replace(rangeMatch[0], " ");
      }
    }

    /* ---- Einzeldatum ------------------------------------------------- */
    if (!result.dates.length) {
      var relWord = Object.keys(RELATIVE_DAYS).filter(function (w) {
        return new RegExp("(^|\\s)" + escapeRe(w) + "(\\s|$)").test(rest);
      })[0];
      if (relWord) {
        result.dates = [T.addDays(base, RELATIVE_DAYS[relWord])];
        rest = rest.replace(new RegExp("(^|\\s)" + escapeRe(relWord) + "(\\s|$)"), " ");
      } else {
        var single = /(^|\s)(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.?(?:\d{2,4})?)(\s|$)/.exec(rest);
        if (single) {
          var iso = parseDateToken(single[2], base);
          if (iso) {
            result.dates = [iso];
            rest = rest.replace(single[0], " ");
          }
        }
      }
    }
    if (!result.dates.length) result.dates = [base];

    /* ---- Zeitspanne -------------------------------------------------- */
    var span = /(\d{1,2}(?::\d{2})?|\d{3,4})\s*(?:-|–|bis|to|à)\s*(\d{1,2}(?::\d{2})?|\d{3,4})/.exec(rest);
    if (span) {
      var s = T.parseHHMM(span[1]);
      var e = T.parseHHMM(span[2]);
      if (s !== null && e !== null) {
        result.start = T.formatHHMM(s);
        result.end = T.formatHHMM(e);
        rest = rest.replace(span[0], " ");
      }
    }

    /* ---- Pause ------------------------------------------------------- */
    var brk = /(?:^|\s)(?:p|pause|break|pausa)\s*(\d{1,3})(?:\s*min)?(?:\s|$)/.exec(rest);
    if (!brk) brk = /(?:^|\s)(\d{1,3})\s*(?:min|minuten|minutes)(?:\s|$)/.exec(rest);
    if (!brk && result.start) brk = /(?:^|\s)(\d{1,3})(?:\s|$)/.exec(rest);
    if (brk) {
      var minutes = parseInt(brk[1], 10);
      if (minutes >= 0 && minutes <= 600) result.breakMinutes = minutes;
    }

    var usable = result.start || result.type || result.breakMinutes !== null;
    return usable ? result : null;
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /** „12.8.“, „12.08.2026“, „2026-08-12“ → ISO, sonst null. */
  function parseDateToken(token, base) {
    var s = String(token).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return T.isValidISO(s) ? s : null;

    var m = /^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/.exec(s);
    if (!m) return null;
    var year = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : T.yearOf(base || T.todayISO());
    var iso = year + "-" + T.pad2(+m[2]) + "-" + T.pad2(+m[1]);
    return T.isValidISO(iso) ? iso : null;
  }

  /** Wandelt ein Parse-Ergebnis in Speicher-Aufträge um. */
  function quickEntryToPatch(parsed, opts) {
    if (!parsed) return {};
    opts = opts || {};
    var patch = Object.create(null);

    parsed.dates.forEach(function (date) {
      var day = { date: date };
      if (parsed.type) {
        day.type = parsed.type;
        day.absenceFactor = parsed.factor;
        if (!parsed.start) { day.start = ""; day.end = ""; day.breaks = []; }
      }
      if (parsed.start) {
        day.start = parsed.start;
        day.end = parsed.end || "";
        if (parsed.breakMinutes) {
          var startMin = T.parseHHMM(parsed.start) || 0;
          var mid = startMin + 240;
          day.breaks = [{
            id: "q" + date.replace(/-/g, ""),
            label: opts.breakLabel || "Pause",
            start: T.formatHHMM(mid),
            end: T.formatHHMM(mid + parsed.breakMinutes),
            paid: false
          }];
        } else if (parsed.breakMinutes === 0) {
          day.breaks = [];
        }
      }
      patch[date] = day;
    });
    return patch;
  }

  /* ==================================================================== */
  /* 2 · GLEITZEIT-PLANER                                                  */
  /* ==================================================================== */

  /**
   * Verteilt die Differenz zwischen jetzigem und gewünschtem Saldo auf die
   * verbleibenden Arbeitstage.
   *
   * @param {Number} balanceNow    aktueller Saldo in Minuten
   * @param {Number} targetBalance gewünschter Saldo am Stichtag
   * @param {Array}  workdays      [{ date, target }] nur Tage mit Soll > 0
   */
  function distributeBalance(balanceNow, targetBalance, workdays) {
    var days = (workdays || []).filter(function (d) { return d.target > 0; });
    var delta = Math.round((targetBalance || 0) - (balanceNow || 0));

    if (!days.length) {
      return { feasible: false, perDay: 0, delta: delta, days: [], reason: "no-days" };
    }

    var perDay = Math.round(delta / days.length);
    var planned = days.map(function (d) {
      return {
        date: d.date,
        target: d.target,
        plannedNet: Math.max(0, d.target + perDay),
        deltaPerDay: perDay
      };
    });

    /* Rundungsrest auf den letzten Tag legen, damit die Summe exakt stimmt */
    var sum = planned.reduce(function (a, p) { return a + (p.plannedNet - p.target); }, 0);
    var restMinutes = delta - sum;
    if (restMinutes !== 0) {
      var last = planned[planned.length - 1];
      last.plannedNet = Math.max(0, last.plannedNet + restMinutes);
      last.deltaPerDay += restMinutes;
    }

    return {
      feasible: true,
      delta: delta,
      perDay: perDay,
      dayCount: days.length,
      days: planned,
      /* Wenn ein geplanter Tag über zehn Stunden ginge, ist der Plan sportlich */
      strained: planned.some(function (p) { return p.plannedNet > 600; })
    };
  }

  /**
   * Wie viele ganze freie Tage stecken im Konto?
   * @returns {{ days: Number, rest: Number, dayTarget: Number }}
   */
  function compensationDays(balanceMinutes, dayTargetMinutes) {
    var target = dayTargetMinutes > 0 ? dayTargetMinutes : 504;
    if (balanceMinutes <= 0) return { days: 0, rest: Math.max(0, balanceMinutes), dayTarget: target };
    return {
      days: Math.floor(balanceMinutes / target),
      rest: balanceMinutes % target,
      dayTarget: target
    };
  }

  /**
   * Gehen-Zeit, um an einem einzelnen Tag einen gewünschten Tagessaldo zu
   * erreichen. Berücksichtigt die Pausenstaffel über denselben Fixpunkt wie
   * die Engine.
   */
  function leaveTimeForBalance(opts) {
    var startTod = T.parseHHMM(opts.start);
    if (startTod === null) return null;

    var target = opts.target || 0;
    var credited = opts.credited || 0;
    var wanted = Math.max(0, target - credited + (opts.wantBalance || 0));
    var breakTotal = opts.breakMinutes || 0;
    var ruleset = opts.breakRuleset || "ch";
    var tiers = opts.customBreakTiers;
    var autoDeduct = opts.autoDeductBreak !== false;

    var gross = wanted + breakTotal;
    for (var i = 0; i < 6; i++) {
      var required = R.requiredBreak(gross, ruleset, tiers);
      var effective = autoDeduct ? Math.max(breakTotal, required) : breakTotal;
      var next = wanted + effective;
      if (next === gross) break;
      gross = next;
    }
    return { minutes: startTod + gross, text: T.formatHHMM(startTod + gross), dayOffset: T.dayOffsetOf(startTod + gross) };
  }

  /* ==================================================================== */
  /* 3 · BRÜCKENTAGE                                                       */
  /* ==================================================================== */

  /**
   * Sucht Zeiträume, in denen wenige Ferientage viele freie Tage ergeben.
   *
   * @param {Object} opts {
   *   from, to,                  Zeitraum
   *   isHoliday(iso) -> Boolean,
   *   isWorkday(iso) -> Boolean, (Wochenarbeitstage laut Modell)
   *   maxVacation,               höchstens so viele Ferientage je Vorschlag
   *   minRatio                   Mindestverhältnis freie Tage / Ferientage
   * }
   * @returns {Array} [{ from, to, totalDays, vacationDays, dates, ratio, holidays }]
   */
  function bridgeDays(opts) {
    opts = opts || {};
    var maxVacation = opts.maxVacation || 4;
    var minRatio = opts.minRatio || 2;
    var maxLength = opts.maxLength || 16;
    var isHoliday = opts.isHoliday || function () { return false; };
    var isWorkday = opts.isWorkday || function () { return true; };

    var all = T.rangeDays(opts.from, opts.to);
    if (!all.length) return [];

    /* Vorberechnen: ist der Tag ohnehin frei? */
    var free = all.map(function (iso) { return !isWorkday(iso) || isHoliday(iso); });

    var candidates = [];

    for (var i = 0; i < all.length; i++) {
      if (!free[i]) continue;                       // sinnvoll ist nur ein freier Beginn
      for (var len = 3; len <= maxLength && i + len <= all.length; len++) {
        var j = i + len - 1;
        if (!free[j]) continue;                     // und ein freies Ende

        var needed = [];
        for (var k = i; k <= j; k++) if (!free[k]) needed.push(all[k]);
        if (!needed.length) break;                  // schon komplett frei
        if (needed.length > maxVacation) break;

        var ratio = len / needed.length;
        if (ratio < minRatio) continue;

        var holidaysInside = [];
        for (var h = i; h <= j; h++) {
          if (isWorkday(all[h]) && isHoliday(all[h])) holidaysInside.push(all[h]);
        }
        if (!holidaysInside.length) continue;       // ohne Feiertag ist es keine Brücke

        candidates.push({
          from: all[i], to: all[j],
          totalDays: len,
          vacationDays: needed.length,
          dates: needed,
          holidays: holidaysInside,
          ratio: Math.round(ratio * 100) / 100
        });
      }
    }

    /* Beste zuerst, dann überschneidungsfrei auswählen */
    candidates.sort(function (a, b) {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (b.totalDays !== a.totalDays) return b.totalDays - a.totalDays;
      return a.from < b.from ? -1 : 1;
    });

    var chosen = [];
    candidates.forEach(function (c) {
      var overlaps = chosen.some(function (x) { return !(c.to < x.from || c.from > x.to); });
      if (!overlaps) chosen.push(c);
    });

    chosen.sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    return chosen;
  }

  /* ==================================================================== */
  /* 4 · MONATSCHECK                                                       */
  /* ==================================================================== */

  var AUDIT_CODES = [
    "gap", "incomplete", "break-auto", "break-short", "over-daily-max",
    "rest-short", "invalid", "no-break", "long-day"
  ];

  /**
   * Fasst zusammen, was vor einem Monatsabschluss noch zu klären ist.
   * @param {Array} dayResults  Ergebnisse aus Engine.computeRange().days
   * @param {String} today
   */
  function auditRange(dayResults, today) {
    var now = today || T.todayISO();
    var groups = Object.create(null);

    function add(code, date, extra) {
      if (!groups[code]) groups[code] = { code: code, dates: [], count: 0, level: levelOf(code) };
      groups[code].count++;
      if (groups[code].dates.length < 60) groups[code].dates.push(Object.assign({ date: date }, extra || {}));
    }

    (dayResults || []).forEach(function (r) {
      if (r.target > 0 && !r.recorded && r.date < now) add("gap", r.date);
      if (r.incomplete) add("incomplete", r.date);

      r.warnings.forEach(function (w) {
        if (w.code === "break-auto") add("break-auto", r.date, { minutes: w.minutes });
        else if (w.code === "break-short") add("break-short", r.date, { minutes: w.minutes });
        else if (w.code === "over-daily-max") add("over-daily-max", r.date, { minutes: w.minutes });
        else if (w.code === "rest-short") add("rest-short", r.date, { minutes: w.minutes });
        else if (w.code === "no-break") add("no-break", r.date);
        else if (w.level === "error") add("invalid", r.date);
      });
    });

    var list = AUDIT_CODES.map(function (code) { return groups[code]; }).filter(Boolean);
    var errors = list.filter(function (g) { return g.level === "error"; })
      .reduce(function (a, g) { return a + g.count; }, 0);

    return {
      issues: list,
      total: list.reduce(function (a, g) { return a + g.count; }, 0),
      errors: errors,
      clean: list.length === 0
    };
  }

  function levelOf(code) {
    if (code === "gap" || code === "incomplete" || code === "invalid") return "error";
    if (code === "no-break") return "info";
    return "warn";
  }

  /* ==================================================================== */
  /* 5 · PROGNOSE                                                          */
  /* ==================================================================== */

  /**
   * Fortschreibung des Saldos bis zum Stichtag, wenn ab jetzt exakt nach
   * Soll gearbeitet wird — also: was bleibt am Monatsende stehen?
   */
  function forecast(balanceNow, remainingWorkdays, averageDelta) {
    var delta = averageDelta || 0;
    return {
      balance: Math.round(balanceNow + delta * remainingWorkdays),
      remainingWorkdays: remainingWorkdays,
      perDay: Math.round(delta)
    };
  }

  return {
    RELATIVE_DAYS: RELATIVE_DAYS,
    TYPE_WORDS: TYPE_WORDS,
    AUDIT_CODES: AUDIT_CODES,
    parseQuickEntry: parseQuickEntry,
    parseDateToken: parseDateToken,
    quickEntryToPatch: quickEntryToPatch,
    distributeBalance: distributeBalance,
    compensationDays: compensationDays,
    leaveTimeForBalance: leaveTimeForBalance,
    bridgeDays: bridgeDays,
    auditRange: auditRange,
    forecast: forecast
  };
});
