/* ==========================================================================
   ZEITKONTO — Berechnungs-Engine
   --------------------------------------------------------------------------
   Nimmt einen Tageseintrag + Einstellungen und liefert alles, was das UI
   anzeigen muss: Netto, Saldo, Pflichtpause, empfohlene Gehen-Zeit,
   Compliance-Hinweise und Segmente für den Zeitstrahl.

   Bewusste Entscheidung: Tage ohne Eintrag erzeugen standardmässig KEIN
   Minus. Fehlende Arbeitstage werden separat als "Lücken" ausgewiesen —
   ein leeres Formular soll das Zeitkonto nicht heimlich ins Minus ziehen.

   VERTRAG FÜRS UI (Ansichten verlassen sich darauf)
   --------------------------------------------------------------------------
   computeDay(record, ctx) liefert u. a.:
     provisional       true, solange der Tag läuft — Netto und Saldo sind
                       dann ein Zwischenstand, kein abgerechneter Wert.
     openBreak         { start: "HH:MM", ref, minutes, startTl } oder null:
                       eine Pause mit Beginn, aber ohne Ende an einem
                       laufenden Tag („Pause starten“). Sie zählt bis jetzt
                       als Pause, nicht als Arbeit: Netto, Saldo, Rest und
                       die Gehen-Zeit stehen still, die Gehen-Zeit rückt um
                       die Pause nach (sobald sie die Pflichtpause übersteigt).
                       An vergangenen Tagen bleibt so eine Zeile ein Fehler.
     recommendedLeave  „Gehen um“ — rechnet erfasste, laufende UND geplante
                       Pausen des Tages ein (Mittag im Voraus erfasst).
     recommendedBreak  unbezahlte Pausenminuten (erfasst oder als Pflicht-
                       pause ergänzt) zwischen Kommen und recommendedLeave —
                       für „inkl. 30 min Pause“. Bezahlte Pausen zählen als
                       Arbeitszeit und stecken nicht darin.
     requiredBreak     kleinste gesetzeskonforme Pause für die Anwesenheit;
                       die Staffeln gelten für die Arbeitszeit ohne Pausen.
     legalBreak        alle Pausen (bezahlt + unbezahlt) innerhalb der
                       Anwesenheit; konform ist legalBreak >= requiredBreak.
     workingTime       Anwesenheit minus Pausen (inkl. Manko) — darauf
                       beziehen sich R.requiredBreak / R.nextBreakTier.
   computeRange(...).totals:
     balance           abgerechnet: laufende Tage zählen NICHT mit
     provisionalBalance inkl. laufender Tage (Zwischenstand)
     runningDays       Anzahl laufender Tage im Zeitraum
   accountBalance(records, settings, uptoISO, now, opts):
     zählt einen laufenden Tag standardmässig NICHT (abgerechneter Saldo);
     opts.includeRunning === true nimmt ihn mit. Zusätzlich im Ergebnis:
     runningDays, runningMinutes, provisionalMinutes.
   quotaUsage(records, year, settings, now):
     vacation = vacationTaken (bis heute) + vacationPlanned (ab morgen).
     Absenzen auf Feiertagen oder arbeitsfreien Tagen verbrauchen nichts.
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

  /* Wie lange eine über Mitternacht laufende Schicht als „läuft noch“ gilt.
     Danach ist sie schlicht unvollständig (Gehen vergessen). */
  var OVERNIGHT_WINDOW = 16 * 60;

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
   * @param {Object} ctx      { settings, holiday, prevEndTl, now, isToday }
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
    // Gutschrift laut Tagesart; was davon effektiv gilt, entscheidet die Regel unten.
    var creditNominal = meta.credits ? Math.round(target * factor) : 0;

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
    var nowTod = T.nowMinutes(now);
    /* Nachtschicht: gestern begonnen, Mitternacht ist vorbei, noch nicht
       ausgestempelt — der Tag läuft weiter, statt als unvollständig zu gelten. */
    var overnight = startTod !== null && endTod === null && !isToday &&
      date === T.addDays(T.todayISO(now), -1) && nowTod < startTod &&
      (nowTod + T.DAY - startTod) <= OVERNIGHT_WINDOW;
    var running = startTod !== null && endTod === null && (isToday || overnight);

    var startTl = startTod;
    var endTl = null;
    if (startTod !== null) {
      if (endTod !== null) {
        endTl = T.onTimeline(endTod, startTod);
      } else if (running) {
        endTl = overnight ? nowTod + T.DAY : Math.max(startTod, nowTod);
      }
    }

    /* Gerechnet wird in echten Minuten: In der Nacht der Zeitumstellung
       dauert 22:00–06:00 nur 7 bzw. 9 Stunden. An allen anderen Tagen ist
       das dieselbe Achse (axis === null). Ausgegeben wird wieder Wanduhr. */
    var axis = startTod !== null ? T.dstAxis(date) : null;
    function real(tl) { return axis && tl !== null ? axis.toReal(tl) : tl; }
    function wall(r) { return axis && r !== null ? axis.toWall(r) : r; }

    var S = real(startTl);
    var E = real(endTl);           // bei laufendem Tag: jetzt
    var presence = (S !== null && E !== null) ? Math.max(0, E - S) : 0;
    if (presence > 20 * 60) warnings.push({ code: "presence-implausible", level: "warn", minutes: presence });

    /* ---- Pausen ---------------------------------------------------- */
    var rawBreaks = [];
    var breakIssues = 0;
    var openBreak = null;
    (rec.breaks || []).forEach(function (b, idx) {
      b = b || {};
      var bs = T.parseHHMM(b.start);
      var be = T.parseHHMM(b.end);
      var hasStart = !!String(b.start || "").trim();
      var hasEnd = !!String(b.end || "").trim();
      var ref = b.id || ("b" + idx);

      /* Laufende Pause („Pause starten“): Beginn ohne Ende an einem
         laufenden Tag. Sie dauert bis jetzt. Liegt ihr Beginn noch in der
         Zukunft, ist sie bloss vorgemerkt — kein Fehler, noch keine Pause. */
      if (running && bs !== null && !hasEnd && startTod !== null) {
        var os = real(T.onTimeline(bs, startTod));
        if (os > E) return;
        if (openBreak) { breakIssues++; return; }   // eine zweite offene Zeile ist ein Tippfehler
        openBreak = { start: T.formatHHMM(bs), ref: ref, minutes: Math.max(0, E - os), startTl: wall(os), _start: os };
        rawBreaks.push({ start: os, end: E, ref: ref, paid: !!b.paid, open: true });
        return;
      }
      if (bs === null || be === null) {
        if (hasStart || hasEnd) breakIssues++;
        return;
      }
      if (startTod === null) return;
      var s1 = T.onTimeline(bs, startTod);
      var e1 = T.onTimeline(be, startTod);
      if (e1 < s1) e1 += T.DAY;
      rawBreaks.push({ start: real(s1), end: real(e1), ref: ref, paid: !!b.paid });
    });
    if (breakIssues) warnings.push({ code: "invalid-break", level: "error", count: breakIssues });

    /* Bezahlte Pausen (z. B. Kurzpausen laut GAV) werden nicht abgezogen,
       zählen aber für die gesetzliche Pflichtpause. Überschneiden sich eine
       bezahlte und eine unbezahlte Pause, gilt die Überschneidung als
       unbezahlt. */
    var unpaidMerged = T.mergeIntervals(rawBreaks.filter(function (b) { return !b.paid; }));
    var allMerged = T.mergeIntervals(rawBreaks);
    if (allMerged.some(function (m) { return m.merged; })) {
      warnings.push({ code: "break-overlap", level: "warn" });
    }
    var hasPaid = rawBreaks.some(function (b) { return b.paid; });

    var unpaidIn = unpaidMerged;
    var allIn = allMerged;
    if (S !== null && E !== null) {
      unpaidIn = T.clipIntervals(unpaidMerged, S, E);
      allIn = T.clipIntervals(allMerged, S, E);
      /* Während der Tag läuft, ist eine Pause nach „jetzt“ geplant, nicht
         ausserhalb — gewarnt wird erst, wenn der Tag abgeschlossen ist. */
      var outside = T.totalOf(allMerged) - T.totalOf(allIn);
      if (!running && outside > 0.5) {
        warnings.push({ code: "break-outside", level: "warn", minutes: Math.round(outside) });
      }
    }

    var breakTotal = Math.round(T.totalOf(unpaidIn));
    var legalBreak = Math.round(T.totalOf(allIn));
    var paidBreakTotal = Math.max(0, legalBreak - breakTotal);

    /* ---- Pflichtpause ---------------------------------------------- */
    var legal = R.netOf(presence, { unpaid: breakTotal, paid: paidBreakTotal }, s);
    var required = presence > 0 ? legal.required : 0;
    var autoDeducted = presence > 0 ? legal.autoDeducted : 0;
    var effectiveBreak = breakTotal + autoDeducted;

    if (presence > 0 && legal.shortfall > 0) {
      if (s.autoDeductBreak !== false) {
        warnings.push({ code: "break-auto", level: "warn", minutes: autoDeducted, required: required });
      } else {
        warnings.push({ code: "break-short", level: "warn", minutes: legal.shortfall, required: required });
      }
    }

    /* ---- Netto & Saldo --------------------------------------------- */
    var netRaw = legal.net;
    var net = T.roundMinutes(netRaw, s.roundStep, s.roundMode);
    var complete = startTod !== null && endTod !== null;
    var hasStamps = startTod !== null && (endTod !== null || running);
    if (!hasStamps) { netRaw = 0; net = 0; }

    /*
       Gutschrift plus Stempelzeit — eine Regel für alle Tagesarten:
       · Teilabsenz (Faktor < 1, z. B. halber Ferientag): die Gutschrift
         deckt den abwesenden Teil, gestempelte Zeit ist der gearbeitete
         Rest und kommt obendrauf.
       · Ganztägige Gutschrift (Faktor 1: Ferien, Krankheit, Unfall,
         Militär, Kurs): Gutschrift und Stempelzeit ergänzen sich nur bis
         zum Soll, sie addieren sich nicht. Ein Kurstag 08:00–17:00 ergibt
         +6 statt +8 h 30; wer krank nach drei Stunden heimgeht, steht auf 0.
         Bei Tagesarten ohne Stempeln meldet „absence-with-times“ den
         Widerspruch, damit er im UI auffällt.
       · Feiertag: Arbeit an einem Feiertag kommt bewusst obendrauf.
    */
    var credited = creditNominal;
    if (meta.credits && typeKey !== "holiday" && factor >= 1 && net > 0) {
      credited = Math.max(0, creditNominal - net);
      if (meta.stampable === false) {
        warnings.push({ code: "absence-with-times", level: "warn", type: typeKey, minutes: net });
      }
    }

    /*
       „Erfasst“ heisst: der Tag trägt eine bewusste Angabe. Das ist wichtig,
       weil nur erfasste Tage den Gleitzeitsaldo bewegen dürfen. Ein leeres
       Formular oder ein Wochenende ohne Eintrag zählt nicht.
    */
    var explicitType = !!(rec.type && R.DAY_TYPES[rec.type]);
    var hasNote = !!String(rec.note || "").trim();
    var hasOverride = rec.targetOverride !== null && rec.targetOverride !== undefined;
    var recorded = hasStamps || creditNominal > 0 || explicitType || hasNote || hasOverride;

    /* Angefangener, aber nie beendeter Tag in der Vergangenheit: als Fehler
       melden und bewusst NICHT verrechnen — sonst rutscht das Konto wegen
       einer vergessenen Stempelung heimlich ins Minus. */
    var incomplete = startTod !== null && endTod === null && !running;
    if (incomplete) warnings.push({ code: "missing-end", level: "error" });

    var balance = Math.round(net + credited - target);
    if (!recorded || incomplete) balance = 0;

    /* ---- Empfohlene Gehen-Zeit ---------------------------------------
       Kleinste Anwesenheit, nach der das Soll netto erreicht ist. Pausen
       zählen, soweit sie bis dahin liegen: erfasste, die laufende (bis
       jetzt) und geplante später am Tag. Die Pflichtpause wird über
       R.presenceForNet ergänzt — ohne Iterieren zwischen Staffelstufen. */
    var neededNet = Math.max(0, target - creditNominal);
    var recommend = null;
    var recommendedBreak = null;
    if (S !== null && meta.stampable !== false) {
      var sol = R.presenceForNet(neededNet, s, function (g) {
        var u = T.totalOf(T.clipIntervals(unpaidMerged, S, S + g));
        var a = T.totalOf(T.clipIntervals(allMerged, S, S + g));
        return { unpaid: u, paid: Math.max(0, a - u), hasPaid: hasPaid };
      });
      recommend = wall(S + sol.gross);
      recommendedBreak = Math.round(sol.deducted);
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
    if (complete && presence > 6 * 60 && legalBreak === 0 && required === 0) {
      warnings.push({ code: "no-break", level: "info" });
    }

    /* ---- Segmente für den Zeitstrahl (Wanduhr) ----------------------- */
    var openStart = openBreak ? openBreak._start : null;
    function outBreak(i) {
      var o = { start: wall(i.start), end: wall(i.end), ref: i.ref };
      if (i.clipped) o.clipped = true;
      if (openStart !== null && i.start <= openStart && i.end >= E) o.open = true;
      return o;
    }
    var shownBreaks = unpaidIn.map(outBreak);
    var segments = [];
    if (S !== null && E !== null && E > S) {
      var cursor = S;
      unpaidIn.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (b) {
        if (b.start > cursor) segments.push({ kind: "work", start: wall(cursor), end: wall(b.start) });
        var seg = outBreak(b);
        segments.push({ kind: "break", start: seg.start, end: seg.end, open: seg.open || undefined });
        cursor = Math.max(cursor, b.end);
      });
      if (cursor < E) segments.push({ kind: "work", start: wall(cursor), end: wall(E) });
    }
    if (openBreak) delete openBreak._start;

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
      breaks: shownBreaks,
      breakTotal: breakTotal,
      paidBreakTotal: paidBreakTotal,
      legalBreak: legalBreak,
      requiredBreak: required,
      autoDeducted: autoDeducted,
      effectiveBreak: Math.round(effectiveBreak),
      workingTime: Math.max(0, Math.round(presence - legalBreak - autoDeducted)),
      openBreak: openBreak,

      netRaw: Math.round(netRaw),
      net: net,
      balance: balance,
      remaining: Math.max(0, neededNet - net),
      progress: neededNet > 0 ? Math.min(2, net / neededNet) : (net > 0 ? 1 : 0),

      recommendedLeaveTl: recommend,
      recommendedLeave: recommend === null ? null : T.formatHHMM(recommend),
      recommendedLeaveDayOffset: recommend === null ? 0 : T.dayOffsetOf(recommend),
      recommendedBreak: recommendedBreak,

      complete: complete,
      recorded: recorded,
      incomplete: incomplete,
      running: running,
      provisional: running,
      overnight: overnight,
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
   * totals.balance ist abgerechnet (ohne laufende Tage), der Zwischenstand
   * mit laufendem Tag steht in totals.provisionalBalance.
   * @param {Function} getRecord  (iso) => record | undefined
   */
  function computeRange(fromISO, toISO, getRecord, settings, now) {
    var s = settings || R.defaultSettings();
    var dates = T.rangeDays(fromISO, toISO);
    var today = T.todayISO(now);
    var results = [];
    var prevEndTl = null;

    var totals = {
      target: 0, net: 0, credited: 0, balance: 0, provisionalBalance: 0, runningDays: 0, presence: 0,
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
      totals.provisionalBalance += res.balance;
      if (res.running) totals.runningDays++;
      else totals.balance += res.balance;
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
      // Ein laufender Tag ist weder Plus- noch Minustag — er ist noch offen.
      if (!res.running && res.balance > 0) totals.overtimeDays++;
      if (!res.running && res.balance < 0) totals.undertimeDays++;

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
   * Ein laufender Tag (heute oder die Nachtschicht von gestern) ist noch
   * nicht abgerechnet: Sonst fiele das Konto beim Einstempeln um das ganze
   * Tagessoll und stiege über den Tag wieder an. Er zählt nur mit
   * opts.includeRunning === true; sein Zwischenstand steht separat in
   * runningMinutes / provisionalMinutes.
   */
  function accountBalance(records, settings, uptoISO, now, opts) {
    var s = settings || R.defaultSettings();
    opts = opts || {};
    var includeRunning = opts.includeRunning === true;
    var today = T.todayISO(now);
    var upto = uptoISO || today;
    var from = s.carryOverFrom || null;
    var total = s.carryOverMinutes || 0;
    var counted = 0;
    var gaps = 0;
    var runningDays = 0;
    var runningMinutes = 0;

    Object.keys(records || {}).sort().forEach(function (iso) {
      if (iso > upto) return;
      if (from && iso < from) return;
      var res = computeDay(records[iso], { settings: s, now: now, isToday: iso === today });
      if (!res.recorded) return;
      if (res.running) {
        runningDays++;
        runningMinutes += res.balance;
        if (!includeRunning) return;
      }
      total += res.balance;
      counted++;
    });

    /* Nicht erfasste Arbeitstage als Minus — dieselbe Lesart wie die
       Lücken in computeRange: Feiertage sind über ihre Gutschrift erfasst,
       ein leer gespeichertes Formular dagegen nicht. Unvollständige Tage
       melden sich schon als Fehler und werden nicht zusätzlich bestraft. */
    if (s.countMissingWorkdays) {
      var startScan = from || firstKey(records);
      if (startScan) {
        T.rangeDays(startScan, minISO(upto, T.addDays(today, -1))).forEach(function (iso) {
          var res = computeDay((records && records[iso]) || { date: iso }, { settings: s, now: now, isToday: false });
          if (res.recorded || res.incomplete || res.running) return;
          if (res.target > 0) { total -= Math.max(0, res.target - res.credited); gaps++; }
        });
      }
    }

    var settled = applyCaps(total, s);
    var provisional = applyCaps(total + (includeRunning ? 0 : runningMinutes), s);

    return {
      minutes: Math.round(includeRunning ? provisional : settled),
      days: counted,
      gapsCounted: gaps,
      runningDays: runningDays,
      runningMinutes: Math.round(runningMinutes),
      provisionalMinutes: Math.round(provisional)
    };
  }

  function applyCaps(total, s) {
    if (s.capPlusMinutes !== null && s.capPlusMinutes !== undefined && total > s.capPlusMinutes) total = s.capPlusMinutes;
    if (s.capMinusMinutes !== null && s.capMinusMinutes !== undefined && total < -Math.abs(s.capMinusMinutes)) total = -Math.abs(s.capMinusMinutes);
    return total;
  }

  function firstKey(obj) {
    var keys = Object.keys(obj || {}).sort();
    return keys.length ? keys[0] : null;
  }
  function minISO(a, b) { return a < b ? a : b; }

  /* ------------------------------------------------------------------ */
  /* Kontingente                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Verbrauchte Abwesenheitstage eines Jahres, nach Kontingent gruppiert.
   * Eine Absenz auf einem Feiertag oder einem arbeitsfreien Tag verbraucht
   * nichts — wer Ferien über Weihnachten einträgt, bezahlt den 25.12. nicht
   * mit einem Ferientag. `holiday` zählt die Feiertage auf Arbeitstagen,
   * auch ohne Eintrag.
   */
  function quotaUsage(records, year, settings, now) {
    var s = settings || R.defaultSettings();
    var today = T.todayISO(now);
    var used = { vacation: 0, vacationTaken: 0, vacationPlanned: 0, sick: 0, comp: 0, holiday: 0, other: 0 };
    var holidayDates = Object.create(null);

    Object.keys(records || {}).forEach(function (iso) {
      if (+iso.slice(0, 4) !== year) return;
      var res = computeDay(records[iso], { settings: s, now: now, isToday: iso === today });
      if ((res.type === "holiday" || res.holiday) && res.baseTarget > 0) holidayDates[iso] = true;
      // Nur Arbeitstage ohne Feiertag kosten Kontingent (baseTarget statt
      // target, sonst fiele „unbezahlt“ mit Soll 0 immer heraus).
      if (res.type === "holiday" || res.holiday || res.baseTarget <= 0) return;
      var factor = res.absenceFactor;
      if (res.type === "vacation") {
        used.vacation += factor;
        if (iso <= today) used.vacationTaken += factor;
        else used.vacationPlanned += factor;
      }
      else if (res.type === "sick" || res.type === "accident") used.sick += factor;
      else if (res.type === "comp") used.comp += factor;
      else if (res.type === "military" || res.type === "unpaid" || res.type === "training") used.other += factor;
    });

    if (s.autoHolidays !== false && s.holidayRegion) {
      H.between(year + "-01-01", year + "-12-31", s.holidayRegion).forEach(function (h) {
        if (holidayDates[h.date] || (records && records[h.date])) return;  // mit Eintrag: oben entschieden
        var res = computeDay({ date: h.date }, { settings: s, now: now, isToday: h.date === today });
        if (res.type === "holiday" && res.baseTarget > 0) holidayDates[h.date] = true;
      });
    }
    used.holiday = Object.keys(holidayDates).length;

    ["vacation", "vacationTaken", "vacationPlanned", "sick", "comp", "other"].forEach(function (k) {
      used[k] = Math.round(used[k] * 100) / 100;
    });
    used.vacationEntitlement = (s.vacationDaysPerYear || 0) + (s.vacationCarryDays || 0);
    used.vacationLeft = Math.round((used.vacationEntitlement - used.vacation) * 100) / 100;
    return used;
  }

  /**
   * Welcher Tag gerade „läuft“: normalerweise heute — während einer
   * Nachtschicht nach Mitternacht aber der Vortag, solange heute noch
   * nicht eingestempelt wurde. Stempeltasten und Countdown arbeiten
   * mit diesem Datum.
   * @param {Function} getRecord  iso -> Rohdatensatz | null
   */
  function activeShiftDate(getRecord, now) {
    now = now || new Date();
    var today = T.todayISO(now);
    var rt = getRecord(today);
    if (rt && T.parseHHMM(rt.start) !== null) return today;
    var y = T.addDays(today, -1);
    var ry = getRecord(y);
    if (!ry || (ry.type && R.DAY_TYPES[ry.type] && R.DAY_TYPES[ry.type].stampable === false)) return today;
    var st = T.parseHHMM(ry.start), en = T.parseHHMM(ry.end);
    var nowTod = T.nowMinutes(now);
    if (st !== null && en === null && nowTod < st && (nowTod + T.DAY - st) <= OVERNIGHT_WINDOW) return y;
    return today;
  }

  return {
    OVERNIGHT_WINDOW: OVERNIGHT_WINDOW,
    activeShiftDate: activeShiftDate,
    emptyRecord: emptyRecord,
    deriveType: deriveType,
    computeDay: computeDay,
    computeRange: computeRange,
    accountBalance: accountBalance,
    quotaUsage: quotaUsage
  };
});
