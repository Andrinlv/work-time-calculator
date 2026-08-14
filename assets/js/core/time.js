/* ==========================================================================
   ZEITKONTO — Zeit-Grundlagen
   --------------------------------------------------------------------------
   Reine Funktionen ohne Seiteneffekte. Das Modul läuft im Browser (globales
   `ZK.Time`) und in Node (`require`), damit die Tests dieselbe Logik prüfen,
   die auch im UI rechnet.

   Grundprinzip Zeitachse: Alle Uhrzeiten eines Tages werden auf eine
   Zeitachse projiziert, die beim Arbeitsbeginn verankert ist. Eine Uhrzeit
   "kleiner" als der Beginn gilt als Folgetag — damit funktionieren
   Nachtschichten ohne Sonderfälle.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ZK = root.ZK || {}; root.ZK.Time = factory(); }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var DAY = 1440;          // Minuten pro Tag
  var HOUR = 60;

  /* ------------------------------------------------------------------ */
  /* Uhrzeiten                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Tolerantes Parsen einer Tageszeit zu Minuten seit Mitternacht.
   * Akzeptiert: "07:50", "7:50", "0750", "750", "7", "07.50", "7h50".
   * Gibt `null` zurück, wenn nichts Sinnvolles gelesen werden kann.
   */
  function parseHHMM(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim();
    if (!s) return null;

    var sep = /^(\d{1,2})\s*[:.\-hH]\s*(\d{1,2})$/.exec(s);
    if (sep) return finalize(+sep[1], +sep[2]);

    var digits = s.replace(/\D/g, "");
    if (!digits || digits.length > 4) return null;
    if (digits.length <= 2) return finalize(+digits, 0);
    if (digits.length === 3) return finalize(+digits.slice(0, 1), +digits.slice(1));
    return finalize(+digits.slice(0, 2), +digits.slice(2));

    function finalize(h, m) {
      if (!isFinite(h) || !isFinite(m)) return null;
      if (h === 24 && m === 0) return DAY;          // 24:00 = Tagesende
      if (h < 0 || h > 23 || m < 0 || m > 59) return null;
      return h * HOUR + m;
    }
  }

  /** Strikte Prüfung: nur exakt "HH:MM" im 24-Stunden-Format. */
  function isStrictHHMM(value) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
  }

  /** Minuten seit Mitternacht -> "HH:MM" (Tagesüberlauf wird abgeschnitten). */
  function formatHHMM(minutes) {
    if (minutes === null || minutes === undefined || !isFinite(minutes)) return "--:--";
    var m = ((Math.round(minutes) % DAY) + DAY) % DAY;
    return pad2(Math.floor(m / HOUR)) + ":" + pad2(m % HOUR);
  }

  /** Wie viele Tage über Mitternacht hinaus liegt der Zeitpunkt? */
  function dayOffsetOf(minutes) {
    if (minutes === null || minutes === undefined || !isFinite(minutes)) return 0;
    return Math.floor(Math.round(minutes) / DAY);
  }

  /** Zeitpunkt auf die bei `anchor` verankerte Zeitachse projizieren. */
  function onTimeline(timeOfDay, anchor) {
    if (timeOfDay === null || anchor === null) return null;
    return timeOfDay < anchor ? timeOfDay + DAY : timeOfDay;
  }

  /* ------------------------------------------------------------------ */
  /* Dauern                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Dauer formatieren.
   * style: "hm" -> "8h 24m" | "clock" -> "8:24" | "decimal" -> "8.40"
   * Negative Werte behalten das Vorzeichen.
   */
  function formatDuration(minutes, style, opts) {
    if (minutes === null || minutes === undefined || !isFinite(minutes)) return "–";
    opts = opts || {};
    var v = Math.round(minutes);
    var sign = v < 0 ? "-" : (opts.forceSign && v > 0 ? "+" : "");
    var abs = Math.abs(v);
    var h = Math.floor(abs / HOUR);
    var m = abs % HOUR;

    if (style === "decimal") return sign + (abs / HOUR).toFixed(2).replace(".", opts.comma ? "," : ".") + (opts.unit === false ? "" : " h");
    if (style === "clock") return sign + h + ":" + pad2(m);
    if (h === 0) return sign + m + " min";
    if (m === 0) return sign + h + " h";
    return sign + h + " h " + m + " min";
  }

  /** Kurzform für enge Layouts: "8:24" bzw. "+0:35" / "-1:10". */
  function formatSigned(minutes, style) {
    if (minutes === null || minutes === undefined || !isFinite(minutes)) return "–";
    var v = Math.round(minutes);
    var sign = v > 0 ? "+" : (v < 0 ? "−" : "±");
    var abs = Math.abs(v);
    if (style === "decimal") return sign + (abs / HOUR).toFixed(2) + " h";
    return sign + Math.floor(abs / HOUR) + ":" + pad2(abs % HOUR);
  }

  /**
   * Dauer aus Text lesen: "8:24", "8.4", "8,4", "8h24", "504m", "504".
   * Werte ohne Trenner werden als Stunden interpretiert, wenn sie klein sind,
   * sonst als Minuten (z. B. "504" -> 504 Minuten, "8" -> 480 Minuten).
   */
  function parseDuration(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim().toLowerCase().replace(",", ".");
    if (!s) return null;

    var clock = /^(-?)(\d+)\s*[:h]\s*(\d{1,2})\s*m?$/.exec(s);
    if (clock) {
      var mm = +clock[3];
      if (mm > 59) return null;
      var total = (+clock[2]) * HOUR + mm;
      return clock[1] ? -total : total;
    }
    var onlyMin = /^(-?\d+(?:\.\d+)?)\s*(?:m|min)$/.exec(s);
    if (onlyMin) return Math.round(+onlyMin[1]);

    var onlyHour = /^(-?\d+(?:\.\d+)?)\s*h$/.exec(s);
    if (onlyHour) return Math.round(+onlyHour[1] * HOUR);

    var plain = /^-?\d+(?:\.\d+)?$/.exec(s);
    if (plain) {
      var n = +s;
      if (s.indexOf(".") >= 0) return Math.round(n * HOUR);   // "8.4" = 8,4 Stunden
      return Math.abs(n) <= 24 ? Math.round(n * HOUR) : Math.round(n);
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Intervalle                                                          */
  /* ------------------------------------------------------------------ */

  /** Dauer zwischen zwei Tageszeiten auf der bei `anchor` verankerten Achse. */
  function intervalMinutes(startTod, endTod, anchor) {
    if (startTod === null || endTod === null || anchor === null) return 0;
    var s = onTimeline(startTod, anchor);
    var e = onTimeline(endTod, anchor);
    if (e < s) e += DAY;
    return Math.max(0, e - s);
  }

  /**
   * Überlappende Intervalle zusammenfassen — verhindert, dass sich
   * doppelt erfasste Pausen doppelt von der Arbeitszeit abziehen.
   * Erwartet [{start, end}] auf einer gemeinsamen Zeitachse.
   */
  function mergeIntervals(list) {
    var items = (list || [])
      .filter(function (i) { return i && isFinite(i.start) && isFinite(i.end) && i.end > i.start; })
      .map(function (i) { return { start: i.start, end: i.end, ref: i.ref }; })
      .sort(function (a, b) { return a.start - b.start; });

    var out = [];
    for (var i = 0; i < items.length; i++) {
      var last = out[out.length - 1];
      if (last && items[i].start <= last.end) {
        last.end = Math.max(last.end, items[i].end);
        last.merged = true;
      } else {
        out.push({ start: items[i].start, end: items[i].end, ref: items[i].ref });
      }
    }
    return out;
  }

  /** Intervalle auf ein Fenster beschneiden. */
  function clipIntervals(list, from, to) {
    var out = [];
    (list || []).forEach(function (i) {
      var s = Math.max(i.start, from);
      var e = Math.min(i.end, to);
      if (e > s) out.push({ start: s, end: e, ref: i.ref, clipped: (s !== i.start || e !== i.end) });
    });
    return out;
  }

  function totalOf(list) {
    return (list || []).reduce(function (sum, i) { return sum + (i.end - i.start); }, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Rundung                                                             */
  /* ------------------------------------------------------------------ */

  /** step in Minuten (0 = keine Rundung), mode: "nearest" | "up" | "down". */
  function roundMinutes(minutes, step, mode) {
    if (!step || step <= 1) return Math.round(minutes);
    var q = minutes / step;
    if (mode === "up") return Math.ceil(q) * step;
    if (mode === "down") return Math.floor(q) * step;
    return Math.round(q) * step;
  }

  /* ------------------------------------------------------------------ */
  /* Kalender-Datumsfunktionen (lokal, ohne Zeitzonenfallen)            */
  /* ------------------------------------------------------------------ */

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /** Date -> "YYYY-MM-DD" in lokaler Zeit. */
  function toISO(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  /** "YYYY-MM-DD" -> Date (lokale Mitternacht). Ungültiges gibt null. */
  function fromISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  }

  function isValidISO(iso) { return fromISO(iso) !== null; }

  function todayISO(now) { return toISO(now || new Date()); }

  function addDays(iso, delta) {
    var d = fromISO(iso);
    if (!d) return iso;
    d.setDate(d.getDate() + delta);
    return toISO(d);
  }

  function addMonths(iso, delta) {
    var d = fromISO(iso);
    if (!d) return iso;
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
    return toISO(d);
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  /** 0 = Sonntag … 6 = Samstag (wie Date#getDay). */
  function weekdayOf(iso) {
    var d = fromISO(iso);
    return d ? d.getDay() : null;
  }

  /** 1 = Montag … 7 = Sonntag (ISO-8601). */
  function isoWeekdayOf(iso) {
    var w = weekdayOf(iso);
    return w === null ? null : (w === 0 ? 7 : w);
  }

  /** Montag (oder Sonntag bei firstDay=0) der Woche. */
  function startOfWeek(iso, firstDay) {
    var d = fromISO(iso);
    if (!d) return iso;
    var fd = firstDay === 0 ? 0 : 1;
    var diff = (d.getDay() - fd + 7) % 7;
    d.setDate(d.getDate() - diff);
    return toISO(d);
  }

  function startOfMonth(iso) { return String(iso).slice(0, 8) + "01"; }
  function endOfMonth(iso) {
    var d = fromISO(iso);
    if (!d) return iso;
    return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  function monthKey(iso) { return String(iso).slice(0, 7); }
  function yearOf(iso) { return +String(iso).slice(0, 4); }

  /** ISO-8601-Kalenderwoche. */
  function isoWeek(iso) {
    var d = fromISO(iso);
    if (!d) return null;
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var week1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(
      ((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  }

  function isoWeekYear(iso) {
    var d = fromISO(iso);
    if (!d) return null;
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    return t.getFullYear();
  }

  /** Alle Tage von `from` bis `to` inklusive. */
  function rangeDays(from, to) {
    var out = [];
    var a = fromISO(from), b = fromISO(to);
    if (!a || !b || a > b) return out;
    var guard = 0;
    var cur = from;
    while (guard++ < 20000) {
      out.push(cur);
      if (cur === to) break;
      cur = addDays(cur, 1);
    }
    return out;
  }

  function diffDays(from, to) {
    var a = fromISO(from), b = fromISO(to);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }

  /** Minuten seit Mitternacht für "jetzt". */
  function nowMinutes(now) {
    var d = now || new Date();
    return d.getHours() * HOUR + d.getMinutes();
  }

  function nowMinutesFloat(now) {
    var d = now || new Date();
    return d.getHours() * HOUR + d.getMinutes() + d.getSeconds() / 60;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  return {
    DAY: DAY,
    HOUR: HOUR,
    pad2: pad2,
    parseHHMM: parseHHMM,
    isStrictHHMM: isStrictHHMM,
    formatHHMM: formatHHMM,
    dayOffsetOf: dayOffsetOf,
    onTimeline: onTimeline,
    formatDuration: formatDuration,
    formatSigned: formatSigned,
    parseDuration: parseDuration,
    intervalMinutes: intervalMinutes,
    mergeIntervals: mergeIntervals,
    clipIntervals: clipIntervals,
    totalOf: totalOf,
    roundMinutes: roundMinutes,
    toISO: toISO,
    fromISO: fromISO,
    isValidISO: isValidISO,
    todayISO: todayISO,
    addDays: addDays,
    addMonths: addMonths,
    daysInMonth: daysInMonth,
    weekdayOf: weekdayOf,
    isoWeekdayOf: isoWeekdayOf,
    startOfWeek: startOfWeek,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    monthKey: monthKey,
    yearOf: yearOf,
    isoWeek: isoWeek,
    isoWeekYear: isoWeekYear,
    rangeDays: rangeDays,
    diffDays: diffDays,
    nowMinutes: nowMinutes,
    nowMinutesFloat: nowMinutesFloat,
    clamp: clamp
  };
});
