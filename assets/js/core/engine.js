/* ==========================================================================
   ZEITKONTO — Berechnungs-Engine
   --------------------------------------------------------------------------
   Nimmt einen Tageseintrag + Einstellungen und liefert alles, was das UI
   anzeigen muss: Netto, Saldo, Pflichtpause, empfohlene Gehen-Zeit,
   Compliance-Hinweise und Segmente für den Zeitstrahl.

   Bewusste Entscheidung: Tage ohne Eintrag erzeugen standardmässig KEIN
   Minus. Fehlende Arbeitstage werden separat als "Lücken" ausgewiesen —
   ein leeres Formular soll das Zeitkonto nicht heimlich ins Minus ziehen.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"), require("./holidays.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Engine = factory(root.ZK.Time, root.ZK.Rules, root.ZK.Holidays);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R, H) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Hilfen                                                              */
  /* ------------------------------------------------------------------ */

  function emptyRecord(date) {
    return {
      date: date,
      type: null,          // null = automatisch (Feiertag / arbeitsfrei / Arbeit)
      start: "",
      end: "",
      breaks: [],
      location: "office",
      note: "",
      absenceFactor: 1,
      targetOverride: null,
      tags: []
    };
  }

  /** Welche Tagesart gilt, wenn der Nutzer nichts explizit gewählt hat? */
  function deriveType(record, baseTarget, holiday, settings) {
    if (record && record.type && R.DAY_TYPES[record.type]) return record.type;
    if (holiday && settings.autoHolidays !== false) return "holiday";
    if (!baseTarget) return "free";
    return "work";
  }

  /* ------------------------------------------------------------------ */
  /* Tagesberechnung                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * @param {Object} record   Tageseintrag (siehe emptyRecord)
   * @param {Object} ctx      { settings, holiday, prevEnd, now, isToday }
   */
  function computeDay(record, ctx) {
    ctx = ctx || {};
    var s = ctx.settings || R.defaultSettings();
    var rec = Object.assign(emptyRecord(record && record.date), record || {});
    var date = rec.date;
    var weekday = T.weekdayOf(date);
    var holiday = ctx.holiday !== undefined ? ctx.holiday
      : (s.autoHolidays !== false ? H.lookup(date, s.holidayRegion) : null);

    /* ---- Sollzeit ------------------------------------------------- */
    var baseTarget = (rec.targetOverride !== null && rec.targetOverride !== undefined)
      ? rec.targetOverride
      : R.baseTargetFor(date, s, weekday);

    var typeKey = deriveType(rec, baseTarget, holiday, s);
    var meta = R.dayType(typeKey);
    var factor = clamp01(rec.absenceFactor === undefined || rec.absenceFactor === null ? 1 : rec.absenceFactor);

    var target = Math.round(baseTarget * meta.targetFactor);
    var credited = meta.credits ? Math.round(target * factor) : 0;

    /* ---- Stempelungen --------------------------------------------- */
    var warnings = [];
    var startTod = T.parseHHMM(rec.start);
    var endTod = T.parseHHMM(rec.end);
    var startInvalid = !!(String(rec.start || "").trim()) && startTod === null;
    var endInvalid = !!(String(rec.end || "").trim()) && endTod === null;
    if (startInvalid) warnings.push({ code: "invalid-start", level: "error" });
    if (endInvalid) warnings.push({ code: "invalid-end", level: "error" });

    var now = ctx.now || new Date();
    var isToday = ctx.isToday !== undefined ? ctx.isToday : (date === T.todayISO(now));
    var running = startTod !== null && endTod === null && isToday;

    var startTl = startTod;
    var endTl = null;
    if (startTod !== null) {
      if (endTod !== null) {
        endTl = T.onTimeline(endTod, startTod);
        if (endTl === startTl) endTl = startTl; // 0-Minuten-Tag ist erlaubt
      } else if (running) {
        endTl = Math.max(startTod, T.nowMinutes(now));
      }
    }

    var presence = (startTl !== null && endTl !== null) ? Math.max(0, endTl - startTl) : 0;
    if (presence > 20 * 60) warnings.push({ code: "presence-implausible", level: "warn", minutes: presence });

    /* ---- Pausen ---------------------------------------------------- */
    var rawBreaks = [];
    var breakIssues = 0;
    (rec.breaks || []).forEach(function (b, idx) {
      var bs = T.parseHHMM(b.start);
      var be = T.parseHHMM(b.end);
      var hasText = !!(String(b.start || "").trim() || String(b.end || "").trim());
      if (bs === null || be === null) {
        if (hasText) breakIssues++;
        return;
      }
      if (startTod === null) return;
      var s1 = T.onTimeline(bs, startTod);
      var e1 = T.onTimeline(be, startTod);
      if (e1 < s1) e1 += T.DAY;
      rawBreaks.push({ start: s1, end: e1, ref: b.id || ("b" + idx), label: b.label || "", paid: !!b.paid });
    });
    if (breakIssues) warnings.push({ code: "invalid-break", level: "error", count: breakIssues });

    // Bezahlte Pausen (z. B. Kurzpausen laut GAV) werden nicht abgezogen.
    var unpaidBreaks = rawBreaks.filter(function (b) { return !b.paid; });
    var paidBreakTotal = T.totalOf(rawBreaks.filter(function (b) { return b.paid; }));

    var merged = T.mergeIntervals(unpaidBreaks);
    if (merged.some(function (m) { return m.merged; })) {
      warnings.push({ code: "break-overlap", level: "warn" });
    }

    var clipped = merged;
    if (startTl !== null && endTl !== null) {
      var before = T.totalOf(merged);
      clipped = T.clipIntervals(merged, startTl, endTl);
      if (T.totalOf(clipped) < before - 0.5) {
        warnings.push({ code: "break-outside", level: "warn", minutes: Math.round(before - T.totalOf(clipped)) });
      }
    }

    var breakTotal = Math.round(T.totalOf(clipped));

    /* ---- Pflichtpause ---------------------------------------------- */
    var required = meta.countsAsWork || presence > 0
      ? R.requiredBreak(presence, s.breakRuleset, s.customBreakTiers)
      : 0;
    var autoDeducted = 0;
    var effectiveBreak = breakTotal;

    if (presence > 0 && required > breakTotal) {
      if (s.autoDeductBreak !== false) {
        autoDeducted = required - breakTotal;
        effectiveBreak = required;
        warnings.push({ code: "break-auto", level: "warn", minutes: autoDeducted, required: required });
      } else {
        warnings.push({ code: "break-short", level: "warn", minutes: required - breakTotal, required: required });
      }
    }

    /* ---- Netto & Saldo --------------------------------------------- */
    var netRaw = Math.max(0, presence - effectiveBreak);
    var net = T.roundMinutes(netRaw, s.roundStep, s.roundMode);
    var complete = startTod !== null && endTod !== null;
    var hasStamps = startTod !== null && (endTod !== null || running);
    if (!hasStamps) { netRaw = 0; net = 0; }

    /*
       „Erfasst“ heisst: der Tag trägt eine bewusste Angabe. Das ist wichtig,
       weil nur erfasste Tage den Gleitzeitsaldo bewegen dürfen. Ein leeres
       Formular oder ein Wochenende ohne Eintrag zählt nicht.
    */
    var explicitType = !!(rec.type && R.DAY_TYPES[rec.type]);
    var hasNote = !!String(rec.note || "").trim();
    var hasOverride = rec.targetOverride !== null && rec.targetOverride !== undefined;
    var recorded = hasStamps || credited > 0 || explicitType || hasNote || hasOverride;

    /* Angefangener, aber nie beendeter Tag in der Vergangenheit: als Fehler
       melden und bewusst NICHT verrechnen — sonst rutscht das Konto wegen
       einer vergessenen Stempelung heimlich ins Minus. */
    var incomplete = startTod !== null && endTod === null && !running;
    if (incomplete) warnings.push({ code: "missing-end", level: "error" });

    var balance = Math.round(net + credited - target);
    if (!recorded || incomplete) balance = 0;

    /* ---- Empfohlene Gehen-Zeit (Fixpunkt über die Pausenstaffel) ---- */
    var neededNet = Math.max(0, target - credited);
    var recommend = null;
    if (startTl !== null && meta.stampable !== false) {
      var gross = neededNet + breakTotal;
      for (var iter = 0; iter < 6; iter++) {
        var req = R.requiredBreak(gross, s.breakRuleset, s.customBreakTiers);
        var eff = s.autoDeductBreak !== false ? Math.max(breakTotal, req) : breakTotal;
        var next = neededNet + eff;
        if (next === gross) break;
        gross = next;
      }
      // Rundung berücksichtigen: so lange verlängern, bis das gerundete Netto reicht.
      if (s.roundStep > 1) {
        var effFinal = s.autoDeductBreak !== false
          ? Math.max(breakTotal, R.requiredBreak(gross, s.breakRuleset, s.customBreakTiers))
          : breakTotal;
        var guard = 0;
        while (T.roundMinutes(gross - effFinal, s.roundStep, s.roundMode) < neededNet && guard++ < 60) gross++;
      }
      recommend = startTl + gross;
    }

    /* ---- Compliance ------------------------------------------------- */
    if (net > (s.maxDailyMinutes || 600)) {
      warnings.push({ code: "over-daily-max", level: "warn", minutes: net - (s.maxDailyMinutes || 600) });
    }
    if (ctx.prevEndTl !== null && ctx.prevEndTl !== undefined && startTl !== null) {
      // prevEndTl ist relativ zum Vortag; +1440 verschiebt ihn auf heute.
      var restMin = (startTl + T.DAY) - ctx.prevEndTl;
      if (restMin < (s.minRestHours || 11) * 60) {
        warnings.push({ code: "rest-short", level: "warn", minutes: Math.round(restMin) });
      }
    }
    if (holiday && net > 0 && typeKey !== "holiday") {
      warnings.push({ code: "worked-on-holiday", level: "info", name: holiday.name });
    }
    if (complete && presence > 0 && breakTotal === 0 && required === 0 && presence > 6 * 60) {
      warnings.push({ code: "no-break", level: "info" });
    }

    /* ---- Segmente für den Zeitstrahl -------------------------------- */
    var segments = [];
    if (startTl !== null && endTl !== null && endTl > startTl) {
      var cursor = startTl;
      clipped.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (b) {
        if (b.start > cursor) segments.push({ kind: "work", start: cursor, end: b.start });
        segments.push({ kind: "break", start: b.start, end: b.end });
        cursor = Math.max(cursor, b.end);
      });
      if (cursor < endTl) segments.push({ kind: "work", start: cursor, end: endTl });
    }

    return {
      date: date,
      weekday: weekday,
      isoWeek: T.isoWeek(date),
      holiday: holiday,
      type: typeKey,
      typeMeta: meta,
      location: rec.location || "office",
      note: rec.note || "",
      absenceFactor: factor,

      baseTarget: baseTarget,
      target: target,
      credited: credited,

      start: rec.start || "",
      end: rec.end || "",
      startTod: startTod,
      endTod: endTod,
      startTl: startTl,
      endTl: endTl,

      presence: Math.round(presence),
      breaks: clipped,
      breakTotal: breakTotal,
      paidBreakTotal: Math.round(paidBreakTotal),
      requiredBreak: required,
      autoDeducted: autoDeducted,
      effectiveBreak: Math.round(effectiveBreak),

      netRaw: Math.round(netRaw),
      net: net,
      balance: balance,
      remaining: Math.max(0, neededNet - net),
      progress: neededNet > 0 ? Math.min(2, net / neededNet) : (net > 0 ? 1 : 0),

      recommendedLeaveTl: recommend,
      recommendedLeave: recommend === null ? null : T.formatHHMM(recommend),
      recommendedLeaveDayOffset: recommend === null ? 0 : T.dayOffsetOf(recommend),

      complete: complete,
      recorded: recorded,
      incomplete: incomplete,
      running: running,
      empty: !complete && !recorded && startTod === null,
      segments: segments,
      warnings: warnings,
      hasError: warnings.some(function (w) { return w.level === "error"; })
    };
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* ------------------------------------------------------------------ */
  /* Zeitraum                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Berechnet jeden Tag eines Zeitraums und aggregiert die Summen.
   * @param {Function} getRecord  (iso) => record | undefined
   */
  function computeRange(fromISO, toISO, getRecord, settings, now) {
    var s = settings || R.defaultSettings();
    var dates = T.rangeDays(fromISO, toISO);
    var today = T.todayISO(now);
    var results = [];
    var prevEndTl = null;

    var totals = {
      target: 0, net: 0, credited: 0, balance: 0, presence: 0,
      breakTotal: 0, effectiveBreak: 0, autoDeducted: 0, overtimeDays: 0, undertimeDays: 0,
      recordedDays: 0, workedDays: 0, gapDays: 0, gaps: [],
      byType: {}, warnings: 0, errors: 0,
      earliestStart: null, latestEnd: null, longestDay: 0
    };

    dates.forEach(function (iso) {
      var rec = getRecord(iso);
      var res = computeDay(rec || { date: iso }, {
        settings: s,
        now: now,
        isToday: iso === today,
        prevEndTl: prevEndTl
      });
      results.push(res);

      prevEndTl = (res.endTl !== null && res.complete) ? res.endTl : null;

      totals.target += res.target;
      totals.net += res.net;
      totals.credited += res.credited;
      totals.balance += res.balance;
      totals.presence += res.presence;
      totals.breakTotal += res.breakTotal;
      totals.effectiveBreak += res.effectiveBreak;
      totals.autoDeducted += res.autoDeducted;
      totals.warnings += res.warnings.filter(function (w) { return w.level === "warn"; }).length;
      totals.errors += res.warnings.filter(function (w) { return w.level === "error"; }).length;

      totals.byType[res.type] = (totals.byType[res.type] || 0) + (res.typeMeta.credits || res.type !== "work" ? res.absenceFactor : 1);

      if (res.recorded) totals.recordedDays++;
      if (res.net > 0) {
        totals.workedDays++;
        if (res.net > totals.longestDay) totals.longestDay = res.net;
        if (res.startTod !== null && (totals.earliestStart === null || res.startTod < totals.earliestStart)) totals.earliestStart = res.startTod;
        if (res.endTl !== null && (totals.latestEnd === null || res.endTl > totals.latestEnd)) totals.latestEnd = res.endTl;
      }
      if (res.balance > 0) totals.overtimeDays++;
      if (res.balance < 0) totals.undertimeDays++;

      // Lücke: vergangener Arbeitstag mit Soll, aber ohne jede Erfassung
      if (res.target > 0 && !res.recorded && iso < today) {
        totals.gapDays++;
        if (totals.gaps.length < 200) totals.gaps.push(iso);
      }
    });

    totals.avgNet = totals.workedDays ? Math.round(totals.net / totals.workedDays) : 0;
    totals.avgStart = null;
    var starts = results.filter(function (r) { return r.startTod !== null && r.net > 0; });
    if (starts.length) {
      totals.avgStart = Math.round(starts.reduce(function (a, r) { return a + r.startTod; }, 0) / starts.length);
    }
    var ends = results.filter(function (r) { return r.complete && r.net > 0; });
    totals.avgEnd = ends.length
      ? Math.round(ends.reduce(function (a, r) { return a + r.endTl; }, 0) / ends.length)
      : null;

    return { days: results, totals: totals, from: fromISO, to: toISO };
  }

  /* ------------------------------------------------------------------ */
  /* Kontostand                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Gleitzeitsaldo bis einschliesslich `uptoISO`.
   * Nur erfasste Tage zählen; optional werden Lücken als Minus gewertet.
   */
  function accountBalance(records, settings, uptoISO, now) {
    var s = settings || R.defaultSettings();
    var today = T.todayISO(now);
    var upto = uptoISO || today;
    var from = s.carryOverFrom || null;
    var total = s.carryOverMinutes || 0;
    var counted = 0;
    var gaps = 0;

    Object.keys(records || {}).sort().forEach(function (iso) {
      if (iso > upto) return;
      if (from && iso < from) return;
      var res = computeDay(records[iso], { settings: s, now: now, isToday: iso === today });
      if (!res.recorded) return;
      total += res.balance;
      counted++;
    });

    if (s.countMissingWorkdays) {
      var startScan = from || firstKey(records);
      if (startScan) {
        T.rangeDays(startScan, minISO(upto, T.addDays(today, -1))).forEach(function (iso) {
          if (records && records[iso]) return;
          var res = computeDay({ date: iso }, { settings: s, now: now, isToday: false });
          if (res.target > 0) { total -= res.target; gaps++; }
        });
      }
    }

    if (s.capPlusMinutes !== null && s.capPlusMinutes !== undefined && total > s.capPlusMinutes) total = s.capPlusMinutes;
    if (s.capMinusMinutes !== null && s.capMinusMinutes !== undefined && total < -Math.abs(s.capMinusMinutes)) total = -Math.abs(s.capMinusMinutes);

    return { minutes: Math.round(total), days: counted, gapsCounted: gaps };
  }

  function firstKey(obj) {
    var keys = Object.keys(obj || {}).sort();
    return keys.length ? keys[0] : null;
  }
  function minISO(a, b) { return a < b ? a : b; }

  /* ------------------------------------------------------------------ */
  /* Kontingente                                                         */
  /* ------------------------------------------------------------------ */

  /** Verbrauchte Abwesenheitstage eines Jahres, nach Kontingent gruppiert. */
  function quotaUsage(records, year, settings) {
    var s = settings || R.defaultSettings();
    var used = { vacation: 0, sick: 0, comp: 0, holiday: 0, other: 0 };
    Object.keys(records || {}).forEach(function (iso) {
      if (+iso.slice(0, 4) !== year) return;
      var rec = records[iso];
      var res = computeDay(rec, { settings: s });
      if (res.target <= 0 && res.type !== "comp") return;
      var factor = res.absenceFactor;
      if (res.type === "vacation") used.vacation += factor;
      else if (res.type === "sick" || res.type === "accident") used.sick += factor;
      else if (res.type === "comp") used.comp += factor;
      else if (res.type === "holiday" && res.baseTarget > 0) used.holiday += 1;
      else if (res.type === "military" || res.type === "unpaid" || res.type === "training") used.other += factor;
    });
    Object.keys(used).forEach(function (k) { used[k] = Math.round(used[k] * 100) / 100; });
    used.vacationEntitlement = (s.vacationDaysPerYear || 0) + (s.vacationCarryDays || 0);
    used.vacationLeft = Math.round((used.vacationEntitlement - used.vacation) * 100) / 100;
    return used;
  }

  return {
    emptyRecord: emptyRecord,
    deriveType: deriveType,
    computeDay: computeDay,
    computeRange: computeRange,
    accountBalance: accountBalance,
    quotaUsage: quotaUsage
  };
});
