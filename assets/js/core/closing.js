/* ==========================================================================
   ZEITKONTO — Monatsabschluss und Lohnmeldung (reine Logik)
   --------------------------------------------------------------------------
   Ein abgeschlossener Monat ist eingefroren: Der Store nimmt für seine Tage
   keine Änderungen mehr an, und das Zeitkonto rechnet für ihn mit dem
   Saldo, der beim Abschluss galt — auch wenn später das Arbeitsmodell oder
   die Pausenregel ändert. Was einmal gemeldet wurde, verschiebt sich so
   nicht mehr still.

   Ablage: je Monat ein eigener Einstellungsschlüssel „closing:2026-09“.
   Einstellungen werden über Fenster hinweg je Schlüssel zusammengeführt —
   schliessen zwei Fenster verschiedene Monate ab, bleiben so beide stehen
   (ein gemeinsames Objekt würde das zuletzt gespeicherte gewinnen lassen).
   Export, Import und Rückgängig behandeln die Schlüssel wie jede andere
   Einstellung.

   Momentaufnahme (v: 1):
     at        Zeitpunkt des Abschlusses (ISO)
     balance   Beitrag des Monats zum Zeitkonto (min) — eingefroren
     days      { "01": min, … } derselbe Beitrag je Tag (nur ≠ 0), damit
               auch ein Stichtag mitten im Monat eingefroren rechnet
     account   Zeitkonto am Monatsende beim Abschluss (min)
     net, target, credited, recordedDays
     vacationDays, sickDays, accidentDays, militaryDays, holidayDays
     absence   { vacation, sick, accident, military, holiday, training } Gutschrift (min)
     nightMinutes, sundayMinutes (inkl. Feiertagsarbeit), holidayWorkMinutes,
     overtime (Überzeit nach ArG, min) — Zuschlagsfenster wie die Statistik
     (ZK.Insights.premiumOfDay), damit beide dieselben Stunden nennen
     issues    offene Punkte des Monatschecks, die beim Abschluss bestätigt wurden
     checksum  Prüfsumme der Tagesdaten — verrät spätere Abweichungen
               (z. B. ein Import im Modus „ersetzen“)
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"), require("./holidays.js"),
      require("./engine.js"), require("./planner.js"), require("./insights.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Closing = factory(root.ZK.Time, root.ZK.Rules, root.ZK.Holidays, root.ZK.Engine, root.ZK.Planner, root.ZK.Insights);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R, H, E, P, X) {
  "use strict";

  var PREFIX = "closing:";
  var VERSION = 1;

  /* Lohnarten in der Reihenfolge der Meldung. Die Codes sind neutrale
     Platzhalter — jede Firma trägt ihre eigenen ein (Einstellungen). */
  var WAGE_TYPES = ["normal", "flex", "overtime", "night", "sunday", "holiday", "vacation", "sick", "accident", "military"];
  var DEFAULT_CODES = {
    normal: "NORM", flex: "FLEX", overtime: "OT", night: "NIGHT", sunday: "SUN",
    holiday: "HOL", vacation: "VAC", sick: "SICK", accident: "ACC", military: "MIL"
  };
  /* Abwesenheiten mit eigener Lohnart (Gutschrift + Tage) */
  var ABSENCES = ["holiday", "vacation", "sick", "accident", "military"];


  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function minISO(a, b) { return a < b ? a : b; }
  function maxISO(a, b) { return a > b ? a : b; }

  /* ------------------------------------------------------------------ */
  /* Schlüssel und Abfragen                                              */
  /* ------------------------------------------------------------------ */

  function keyOf(month) { return PREFIX + month; }
  function monthOf(iso) { return String(iso || "").slice(0, 7); }

  /** Nur eine vollständige Momentaufnahme zählt — Unbrauchbares sperrt nichts. */
  function isSnapshot(c) {
    return !!c && typeof c === "object" && !Array.isArray(c) &&
      typeof c.at === "string" && isNum(c.balance) && !!c.days && typeof c.days === "object";
  }

  function get(settings, month) {
    var c = settings ? settings[PREFIX + month] : null;
    return isSnapshot(c) ? c : null;
  }

  function isLocked(settings, iso) { return !!get(settings, monthOf(iso)); }

  /** Signatur für store.setGuard(fn): (iso, settings) → gesperrt? */
  function guard(iso, settings) { return isLocked(settings, iso); }

  /** Alle Abschlüsse, aufsteigend nach Monat: [{ month, snap }] */
  function list(settings) {
    var out = [];
    Object.keys(settings || {}).forEach(function (k) {
      if (k.indexOf(PREFIX) !== 0) return;
      var month = k.slice(PREFIX.length);
      if (!/^\d{4}-\d{2}$/.test(month)) return;
      var snap = get(settings, month);
      if (snap) out.push({ month: month, snap: snap });
    });
    return out.sort(function (a, b) { return a.month < b.month ? -1 : a.month > b.month ? 1 : 0; });
  }

  /** Ganzer Kalendermonat? → "2026-09" oder null */
  function wholeMonth(from, to) {
    if (!from || !to || from !== T.startOfMonth(from) || to !== T.endOfMonth(from)) return null;
    return monthOf(from);
  }

  /** Abschliessen lässt sich nur ein Monat, der ganz vorbei ist. */
  function isPastMonth(month, today) {
    return T.endOfMonth(month + "-01") < (today || T.todayISO());
  }

  /* ------------------------------------------------------------------ */
  /* Prüfsumme                                                           */
  /* ------------------------------------------------------------------ */

  /** JSON mit sortierten Schlüsseln — gleiche Daten ergeben gleichen Text. */
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  /* FNV-1a, 32 Bit: kein Schutz gegen Absicht, aber gegen Versehen. */
  function fnv(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0;
    }
    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }

  /** Prüfsumme aller Tageseinträge eines Monats (ohne Speicherzeitpunkt). */
  function checksum(records, month) {
    var parts = [];
    Object.keys(records || {}).sort().forEach(function (iso) {
      if (monthOf(iso) !== month || !records[iso]) return;
      var copy = Object.assign({}, records[iso]);
      delete copy.updatedAt;
      parts.push(iso + "=" + stable(copy));
    });
    return fnv(parts.join("\n"));
  }

  function isStale(snap, records, month) {
    return !!snap && typeof snap.checksum === "string" && snap.checksum !== checksum(records, month);
  }

  /* ------------------------------------------------------------------ */
  /* Beitrag einzelner Tage zum Zeitkonto                                */
  /* ------------------------------------------------------------------ */

  /**
   * Was jeder Tag von `from` bis `to` zum Zeitkonto beiträgt — genau so
   * gerechnet wie E.accountBalance (die Tests halten beide beisammen):
   * erfasste, abgerechnete Tage mit ihrem Saldo; bei „nicht erfasste
   * Arbeitstage als Minus“ zusätzlich die Lücken bis gestern.
   * → { iso: Minuten } (nur Tage ≠ 0)
   */
  function dayContributions(records, settings, from, to, now, opts) {
    var s = settings || {};
    records = records || {};
    var includeRunning = !!(opts && opts.includeRunning === true);
    var today = T.todayISO(now);
    var start = s.carryOverFrom || null;
    var out = {};
    function add(iso, v) {
      if (!v) return;
      out[iso] = (out[iso] || 0) + v;
      if (!out[iso]) delete out[iso];
    }

    Object.keys(records).sort().forEach(function (iso) {
      if (iso < from || iso > to) return;
      if (start && iso < start) return;
      var res = E.computeDay(records[iso], { settings: s, now: now, isToday: iso === today });
      if (!res.recorded) return;
      if (res.running && !includeRunning) return;
      add(iso, res.balance);
    });

    if (s.countMissingWorkdays) {
      var scan = start || firstKey(records);
      if (scan) {
        T.rangeDays(maxISO(scan, from), minISO(to, T.addDays(today, -1))).forEach(function (iso) {
          var res = E.computeDay(records[iso] || { date: iso }, { settings: s, now: now, isToday: false });
          if (res.recorded || res.incomplete || res.running) return;
          if (res.target > 0) add(iso, -Math.max(0, res.target - res.credited));
        });
      }
    }
    return out;
  }

  function firstKey(obj) {
    var keys = Object.keys(obj || {}).sort();
    return keys.length ? keys[0] : null;
  }

  function sumValues(map) {
    return Object.keys(map).reduce(function (a, k) { return a + map[k]; }, 0);
  }

  /** Beitrag des Monats nach heutigem Stand (zum Vergleich mit dem eingefrorenen). */
  function liveMonthBalance(records, settings, month, now) {
    var first = month + "-01";
    return sumValues(dayContributions(records, settings, first, T.endOfMonth(first), now));
  }

  /** Eingefrorener Beitrag eines Tages (0, wenn der Tag nichts beitrug). */
  function frozenDay(snap, iso) {
    if (!snap || !snap.days) return 0;
    var v = snap.days[String(iso).slice(8, 10)];
    return isNum(v) ? v : 0;
  }

  function applyCaps(total, s) {
    if (s.capPlusMinutes !== null && s.capPlusMinutes !== undefined && total > s.capPlusMinutes) total = s.capPlusMinutes;
    if (s.capMinusMinutes !== null && s.capMinusMinutes !== undefined && total < -Math.abs(s.capMinusMinutes)) total = -Math.abs(s.capMinusMinutes);
    return total;
  }

  /**
   * Abweichung je Tag: eingefrorener minus neu gerechneter Beitrag, nur für
   * Tage abgeschlossener Monate zwischen `from` und `to` (nur ≠ 0). Wer
   * Tagessaldi aufsummiert (Verlauf in der Statistik, Saldo eines Zeitraums),
   * zählt diese Werte dazu und landet so beim selben Zeitkonto wie die
   * Kopfzeile. → { iso: Minuten }
   */
  function dayDeltas(records, settings, from, to, now, opts) {
    var s = settings || {};
    var start = s.carryOverFrom || null;
    var out = {};
    list(s).forEach(function (c) {
      var first = maxISO(c.month + "-01", from);
      var last = minISO(T.endOfMonth(c.month + "-01"), to);
      if (first > last) return;
      var live = dayContributions(records, s, first, last, now, opts);
      var frozen = {};
      Object.keys(c.snap.days || {}).forEach(function (dd) {
        var iso = c.month + "-" + dd;
        if (iso < first || iso > last || (start && iso < start) || !isNum(c.snap.days[dd])) return;
        frozen[iso] = c.snap.days[dd];
      });
      Object.keys(Object.assign({}, live, frozen)).forEach(function (iso) {
        var d = (frozen[iso] || 0) - (live[iso] || 0);
        if (d) out[iso] = d;
      });
    });
    return out;
  }

  /** Summe von dayDeltas() — um so viel weicht ein Zeitraum eingefroren ab. */
  function frozenDelta(records, settings, from, to, now, opts) {
    return sumValues(dayDeltas(records, settings, from, to, now, opts));
  }

  /**
   * Saldo eines Zeitraums, wie ihn die Ansichten zeigen (`live` = Summe der
   * Tagessaldi, z. B. range.totals.balance): ein ganzer abgeschlossener
   * Monat mit seinem eingefrorenen Monatssaldo — wie Kalender, Rapport und
   * Lohnmeldung —, sonst `live` plus die Abweichung abgeschlossener Tage.
   */
  function periodBalance(records, settings, from, to, live, now) {
    var snap = get(settings, wholeMonth(from, to));
    if (snap) return snap.balance;
    return Math.round((live || 0) + frozenDelta(records, settings, from, to, now));
  }

  /**
   * Zeitkonto wie E.accountBalance — abgeschlossene Monate zählen aber mit
   * ihrem eingefrorenen Beitrag statt mit dem neu gerechneten. Gleiche
   * Signatur und gleiches Ergebnis-Objekt, dazu:
   *   frozenDelta   eingefroren minus neu gerechnet (0 = keine Abweichung)
   *   closedMonths  wie viele Abschlüsse bis zum Stichtag eingerechnet sind
   * Das ist die eine Quelle fürs Zeitkonto: Kopfzeile, Statistik, Fragen,
   * Zeitschieber, Rückblick und die Vorschau beim Modellwechsel rechnen
   * alle hierüber (bzw. über App.accountBalance), nie direkt mit der Engine.
   */
  function accountBalance(records, settings, uptoISO, now, opts) {
    var s = settings || {};
    var closed = list(s);
    if (!closed.length) return E.accountBalance(records, settings, uptoISO, now, opts);

    var upto = uptoISO || T.todayISO(now);
    // Kappung erst ganz am Schluss — sonst wirkte sie auf den Zwischenstand
    var raw = E.accountBalance(records, Object.assign({}, s, { capPlusMinutes: null, capMinusMinutes: null }), uptoISO, now, opts);
    var count = closed.filter(function (c) { return c.month + "-01" <= upto; }).length;
    var delta = count ? frozenDelta(records, s, closed[0].month + "-01", upto, now, opts) : 0;

    return Object.assign({}, raw, {
      minutes: Math.round(applyCaps(raw.minutes + delta, s)),
      provisionalMinutes: Math.round(applyCaps(raw.provisionalMinutes + delta, s)),
      frozenDelta: Math.round(delta),
      closedMonths: count
    });
  }

  /* ------------------------------------------------------------------ */
  /* Monatscheck                                                         */
  /* ------------------------------------------------------------------ */

  /** Ab wann der Monatscheck Lücken meldet — wie der Monatscheck in „Werkzeuge“. */
  function auditSince(records, settings) {
    var keys = Object.keys(records || {}).filter(function (k) { return P.hasContent(records[k]); }).sort();
    var first = keys.length ? keys[0] : null;
    var from = (settings && settings.carryOverFrom) || null;
    if (first && from && from > first) return from;
    return first;
  }

  /**
   * Darf der Monat abgeschlossen werden?
   * → { audit, running, clean, total, errors }
   * clean = Monatscheck ohne Befund; ein laufender Tag verhindert den
   * Abschluss ganz (er wäre sonst gesperrt, bevor man ausstempeln kann).
   */
  function check(dayResults, today, since) {
    var audit = P.auditRange(dayResults || [], today, { since: since || today });
    var running = (dayResults || []).filter(function (r) { return r.running; }).length;
    return { audit: audit, running: running, clean: audit.clean && !running, total: audit.total, errors: audit.errors };
  }

  /* ------------------------------------------------------------------ */
  /* Lohnrelevante Minuten                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Zuschlagsminuten eines Tages nach ArG — dieselbe Rechnung wie die
   * Statistik: Nacht 23–06, Sonntag von Samstag 23 Uhr bis Sonntag 23 Uhr,
   * Feiertage wie Sonntage (Art. 20a); ein Feiertag am Sonntag zählt einmal.
   * → { night, sunday, holiday } in Minuten (ungerundet)
   */
  function premiumsOf(r, settings) {
    var s = settings || {};
    if (!X || !X.premiumOfDay) return { night: 0, sunday: 0, holiday: 0 };
    return X.premiumOfDay(r, function (iso) {
      return s.autoHolidays === false || !H ? null : H.lookup(iso, s.holidayRegion);
    });
  }

  /**
   * Überzeit nach ArG: Arbeitszeit über der wöchentlichen Höchstarbeitszeit.
   * Gezählt wird chronologisch je Kalenderwoche (Mo–So); die Minuten über
   * der Grenze fallen auf den Tag, an dem sie anfallen — so gehört eine
   * Woche über den Monatswechsel richtig zu beiden Monaten.
   * @param {Number|Function} maxWeekly  Minuten oder (Montag) → Minuten,
   *                          wenn das Arbeitsmodell die Grenze je Woche kennt
   * → { iso: Minuten }
   */
  function overtimeByDay(dayResults, maxWeekly, today) {
    var out = {};
    var limitOf = typeof maxWeekly === "function" ? maxWeekly : function () { return maxWeekly; };
    var weeks = {};
    (dayResults || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (r) {
      if ((today && r.date > today) || r.running || r.provisional || !(r.net > 0)) return;
      var wk = T.startOfWeek(r.date, 1);
      var limit = limitOf(wk);
      if (!isNum(limit) || limit <= 0) return;
      var before = weeks[wk] || 0;
      var after = before + r.net;
      weeks[wk] = after;
      var over = Math.max(0, after - Math.max(before, limit));
      if (over > 0) out[r.date] = over;
    });
    return out;
  }

  /** Wöchentliche Höchstarbeitszeit, wie sie das Arbeitsmodell dieser Woche vorgibt. */
  function weeklyLimit(settings) {
    var s = settings || {};
    return function (monday) {
      var m = R && R.modelFor ? R.modelFor(monday, s) : null;
      return m && isNum(m.maxWeeklyMinutes) ? m.maxWeeklyMinutes : s.maxWeeklyMinutes;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Momentaufnahme                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Unter welcher Lohnart ein Tag gemeldet wird. Ferien, Krankheit, Unfall
   * oder Militär auf einem Feiertag (Arbeitstag laut Modell) sind ein
   * bezahlter Feiertag — so zählt sie auch das Kontingent (E.quotaUsage):
   * wer über Auffahrt Ferien einträgt, bezahlt den Feiertag nicht mit
   * einem Ferientag, und die Lohnbuchhaltung zieht ihn nicht ab.
   */
  function payrollKind(r) {
    if (r.holiday && r.baseTarget > 0 && r.type !== "holiday" && ABSENCES.indexOf(r.type) >= 0) return "holiday";
    return r.type;
  }

  /**
   * Friert einen Monat ein.
   * @param {Object} records   alle Tageseinträge (store.allDays())
   * @param {Object} settings  aktuelle Einstellungen
   * @param {String} month     "2026-09"
   * @param {Object} [opts]    { now: Date, at: ISO, issues: Zahl }
   */
  function buildSnapshot(records, settings, month, opts) {
    opts = opts || {};
    var s = settings || {};
    var now = opts.now || new Date();
    var today = T.todayISO(now);
    var first = month + "-01";
    var last = T.endOfMonth(first);
    var getRecord = function (iso) { return records ? records[iso] : undefined; };

    // Ganze Wochen um den Monat — für die Überzeit über den Monatswechsel
    var range = E.computeRange(T.startOfWeek(first, 1), T.addDays(T.startOfWeek(last, 1), 6), getRecord, s, now);
    var days = range.days.filter(function (r) { return monthOf(r.date) === month; });
    var ot = overtimeByDay(range.days, weeklyLimit(s), today);

    var contributions = dayContributions(records, s, first, last, now);
    var dayMap = {};
    Object.keys(contributions).forEach(function (iso) { dayMap[iso.slice(8, 10)] = contributions[iso]; });

    var snap = {
      v: VERSION,
      at: opts.at || new Date(now.getTime ? now.getTime() : Date.now()).toISOString(),
      balance: sumValues(contributions),
      days: dayMap,
      account: accountBalance(records, s, last, now).minutes,
      net: 0, target: 0, credited: 0, recordedDays: 0,
      vacationDays: 0, sickDays: 0, accidentDays: 0, militaryDays: 0, holidayDays: 0,
      absence: { vacation: 0, sick: 0, accident: 0, military: 0, holiday: 0, training: 0 },
      nightMinutes: 0, sundayMinutes: 0, holidayWorkMinutes: 0, overtime: 0,
      issues: isNum(opts.issues) ? opts.issues : 0,
      checksum: checksum(records, month)
    };

    days.forEach(function (r) {
      if (r.date > today || r.running || r.provisional) return;
      snap.target += r.target || 0;
      snap.net += r.net || 0;
      snap.credited += r.credited || 0;
      if (r.recorded) snap.recordedDays++;
      var kind = payrollKind(r);
      if (has(snap.absence, kind)) snap.absence[kind] += r.credited || 0;
      if (ABSENCES.indexOf(kind) >= 0 && r.target > 0) {
        // Ein Feiertag ist ein Tag — wie im Kontingent, auch als halbe Absenz
        snap[kind + "Days"] += kind === "holiday" ? 1 : (isNum(r.absenceFactor) ? r.absenceFactor : 1);
      }
      if (r.net > 0) {
        var p = premiumsOf(r, s);
        snap.nightMinutes += p.night;
        snap.sundayMinutes += p.sunday + p.holiday;
        snap.holidayWorkMinutes += p.holiday;
      }
      if (ot[r.date]) snap.overtime += ot[r.date];
    });
    ABSENCES.forEach(function (k) { snap[k + "Days"] = Math.round(snap[k + "Days"] * 100) / 100; });
    ["nightMinutes", "sundayMinutes", "holidayWorkMinutes"].forEach(function (k) { snap[k] = Math.round(snap[k]); });
    return snap;
  }

  /* ------------------------------------------------------------------ */
  /* Lohnmeldung                                                         */
  /* ------------------------------------------------------------------ */

  /** Codes aus den Einstellungen, ergänzt um die Platzhalter. */
  function codesOf(settings) {
    var own = settings && settings.payrollCodes && typeof settings.payrollCodes === "object" ? settings.payrollCodes : {};
    var out = {};
    WAGE_TYPES.forEach(function (k) {
      out[k] = typeof own[k] === "string" ? own[k].trim() : DEFAULT_CODES[k];
    });
    return out;
  }

  /**
   * Eine Zeile je Lohnart aus der Momentaufnahme.
   * Normalstunden = gearbeitete Zeit (Netto) plus Kursgutschrift; Nacht,
   * Sonntag (inkl. Feiertagsarbeit) und Überzeit sind Teilmengen davon
   * (Zuschlagsbasis). Feiertage = bezahlte Feiertage (Gutschrift).
   * Überstunden/Gleitzeit = eingefrorener Monatssaldo (auch negativ).
   * Lohnarten ohne Code werden nicht gemeldet, Abwesenheiten ohne Tage
   * und Zuschläge ohne Minuten ebenfalls nicht.
   * → [{ key, code, minutes, days }]
   */
  function payrollRows(snap, codes) {
    if (!snap) return [];
    codes = codes || DEFAULT_CODES;
    var abs = snap.absence || {};
    var values = {
      normal: { minutes: (snap.net || 0) + (abs.training || 0), days: null },
      flex: { minutes: snap.balance || 0, days: null },
      overtime: { minutes: snap.overtime || 0, days: null },
      night: { minutes: snap.nightMinutes || 0, days: null },
      sunday: { minutes: snap.sundayMinutes || 0, days: null }
    };
    ABSENCES.forEach(function (k) {
      values[k] = { minutes: abs[k] || 0, days: snap[k + "Days"] || 0 };
    });
    var rows = [];
    WAGE_TYPES.forEach(function (k) {
      var code = codes[k] === undefined ? DEFAULT_CODES[k] : String(codes[k] || "").trim();
      if (!code) return;
      var v = values[k];
      var always = k === "normal" || k === "flex";
      if (!always && !v.minutes && !v.days) return;
      rows.push({ key: k, code: code, minutes: Math.round(v.minutes), days: v.days });
    });
    return rows;
  }

  /* CSV wie ZK.Exporters: BOM, Semikolon, Dezimalkomma, CRLF — und Texte,
     die eine Tabellenkalkulation als Formel läse, mit Apostroph geschützt. */
  var FORMULA_START = /^'*[=+\-@\t\r]/;

  function csvCell(value, delim, text) {
    var s = value === null || value === undefined ? "" : String(value);
    if (text && FORMULA_START.test(s)) s = "'" + s;
    if (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function decimal(v, places, comma) {
    var s = (Math.round(v * Math.pow(10, places)) / Math.pow(10, places)).toFixed(places);
    if (s === "-" + (0).toFixed(places)) s = (0).toFixed(places);
    return comma ? s.replace(".", ",") : s;
  }

  var CSV_COLUMNS = ["employeeId", "employee", "period", "code", "label", "hours", "minutes", "days"];
  var CSV_HEADERS = {
    employeeId: "Personalnummer", employee: "Name", period: "Periode", code: "Lohnart",
    label: "Bezeichnung", hours: "Stunden", minutes: "Minuten", days: "Tage"
  };

  /**
   * @param {Array}  rows  aus payrollRows()
   * @param {Object} meta  { employeeId, employee, period }
   * @param {Object} opts  { headers, labels, delimiter, bom, decimalComma }
   */
  function payrollCSV(rows, meta, opts) {
    opts = opts || {};
    meta = meta || {};
    var d = opts.delimiter || ";";
    var comma = opts.decimalComma !== false;
    var headers = opts.headers || {};
    var labels = opts.labels || {};
    var lines = [CSV_COLUMNS.map(function (c) { return csvCell(headers[c] || CSV_HEADERS[c], d, true); }).join(d)];
    (rows || []).forEach(function (r) {
      lines.push([
        [meta.employeeId || "", true],
        [meta.employee || "", true],
        [meta.period || ""],
        [r.code, true],
        [labels[r.key] || r.key, true],
        [decimal(r.minutes / 60, 2, comma)],
        [r.minutes],
        [r.days === null || r.days === undefined ? "" : decimal(r.days, 2, comma)]
      ].map(function (c) { return csvCell(c[0], d, c[1]); }).join(d));
    });
    return (opts.bom === false ? "" : "﻿") + lines.join("\r\n");
  }

  return {
    PREFIX: PREFIX,
    VERSION: VERSION,
    WAGE_TYPES: WAGE_TYPES,
    DEFAULT_CODES: DEFAULT_CODES,
    keyOf: keyOf,
    monthOf: monthOf,
    isSnapshot: isSnapshot,
    get: get,
    isLocked: isLocked,
    guard: guard,
    list: list,
    wholeMonth: wholeMonth,
    isPastMonth: isPastMonth,
    checksum: checksum,
    isStale: isStale,
    dayContributions: dayContributions,
    liveMonthBalance: liveMonthBalance,
    frozenDay: frozenDay,
    dayDeltas: dayDeltas,
    frozenDelta: frozenDelta,
    periodBalance: periodBalance,
    accountBalance: accountBalance,
    auditSince: auditSince,
    check: check,
    premiumsOf: premiumsOf,
    overtimeByDay: overtimeByDay,
    payrollKind: payrollKind,
    buildSnapshot: buildSnapshot,
    codesOf: codesOf,
    payrollRows: payrollRows,
    payrollCSV: payrollCSV
  };
});
