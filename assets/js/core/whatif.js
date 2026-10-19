/* ==========================================================================
   ZEITKONTO — Zeitschieber („Was wäre, wenn …“)
   --------------------------------------------------------------------------
   Rechnet für eine angenommene Gehen-Zeit aus, was der Tag dann zeigen
   würde: Netto, Tagessaldo, Pflichtpause, automatisch abgezogene Minuten
   und den Kontostand danach. Gerechnet wird ausschliesslich über
   E.computeDay mit einem Entwurf des Tageseintrags — die Zahlen stimmen
   so mit dem überein, was der Tag nach dem Speichern zeigt (Rundung,
   bezahlte Pausen, Teilabsenzen, Zeitumstellung inklusive).

   Zeitachse wie in der Engine: Wanduhr-Minuten ab Mitternacht des Tages,
   nach Mitternacht > 1440 (Nachtschicht). Die Stellungen des Schiebers
   liegen dagegen in ECHTEN Minuten ab Kommen: In der Nacht der Zeit-
   umstellung fehlt so keine Stellung und es gibt keine, die es nicht gibt;
   beschriftet wird trotzdem mit der Wanduhr.

   VERTRAG FÜRS UI
   --------------------------------------------------------------------------
   scan(record, opts) → { positions[], points[], marks{}, zones[], lo, hi, … }
     positions[i]  Gehen-Zeit (Zeitachse) der Stellung i, eine echte Minute
                   je Schritt — steigend, nur in der Herbstnacht springt
                   die Uhr einmal von 03:00 auf 02:00 zurück
     points[i]     evaluate() für diese Stellung
     marks         Index der „interessanten“ Stellungen oder -1:
                   zero (Tagessaldo erreicht ±0), plus (+1 h), account
                   (Konto erreicht ±0), max (letzte Stellung bis zur
                   Tageshöchstarbeitszeit), rest (letzte Stellung mit voller
                   Ruhezeit bis zum nächsten Kommen), current (gespeichertes
                   Gehen), now (jetzt, an einem laufenden Tag)
     zones         Abschnitte, in denen jede weitere Minute als Pflichtpause
                   abgezogen wird (eine höhere Pausenstufe greift):
                   { from, to (Indizes), require, extra }
   ========================================================================== */
(function (root, factory) {
  /* Den Monatsabschluss erst beim Rechnen holen: closing.js lädt nach dieser Datei */
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"), require("./engine.js"),
      function () { return require("./closing.js"); });
  } else {
    root.ZK = root.ZK || {};
    root.ZK.WhatIf = factory(root.ZK.Time, root.ZK.Rules, root.ZK.Engine, function () { return root.ZK.Closing; });
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R, E, closing) {
  "use strict";

  var SPAN_LO = 4 * 60;     // Schieber von Kommen + 4 h …
  var SPAN_HI = 12 * 60;    // … bis Kommen + 12 h (wo nötig erweitert)
  var SPAN_MIN = 30;        // kürzer ist kein Arbeitstag mehr
  var SPAN_MAX = 20 * 60;   // länger meldet die Engine als unplausibel
  var MARGIN = 60;          // Luft um gespeichertes Gehen, jetzt und ±0

  function isOpenRow(b) {
    return !!b && T.parseHHMM(b.start) !== null && !String(b.end || "").trim();
  }

  /**
   * Entwurf des Tageseintrags mit Gehen um `endTl`.
   * Eine laufende Pause endet bei `closeAt` (Zeitachse; an einem laufenden
   * Tag „jetzt“): Wer um 17:30 gehen will, kommt vorher aus der Pause. So
   * rechnet auch die Engine ihre Gehen-Zeit. Vorgemerkte Pausen ohne Ende
   * fallen weg — sie zählen auch heute noch nicht.
   */
  function draft(record, endTl, closeAt) {
    var rec = Object.assign({}, record || {});
    var startTod = T.parseHHMM(rec.start);
    var closed = false;
    rec.end = T.formatHHMM(endTl);
    rec.breaks = (rec.breaks || []).filter(Boolean).map(function (b) {
      return Object.assign({}, b);
    }).filter(function (b) {
      if (!isOpenRow(b)) return true;
      if (closed || typeof closeAt !== "number" || startTod === null) return false;
      var bs = T.onTimeline(T.parseHHMM(b.start), startTod);
      if (bs > closeAt) return false;
      b.end = T.formatHHMM(closeAt);
      closed = true;
      return true;
    });
    return rec;
  }

  /** Kontostand nach diesem Tag — gekappt wie in E.accountBalance. */
  function accountAfter(base, balance, s) {
    s = s || {};
    var total = base + (balance || 0);
    if (s.capPlusMinutes !== null && s.capPlusMinutes !== undefined && total > s.capPlusMinutes) total = s.capPlusMinutes;
    if (s.capMinusMinutes !== null && s.capMinusMinutes !== undefined && total < -Math.abs(s.capMinusMinutes)) {
      total = -Math.abs(s.capMinusMinutes);
    }
    return Math.round(total);
  }

  /**
   * Konto OHNE diesen Tag, ungekappt — dazu kommt der Tagessaldo eines
   * Entwurfs (accountAfter kappt danach). Der Tag wird durch einen erfassten
   * Nulltag ersetzt statt entfernt: Mit „fehlende Arbeitstage als Minus“
   * zählte er sonst als Lücke. Gerechnet wird wie im Kopfzeilen-Saldo
   * (laufende Tage zählen nicht) bis heute — bzw. bis zum Tag selbst, wenn
   * er in der Zukunft liegt.
   * → { minutes, counts }  counts = false, wenn der Tag vor dem Kontobeginn
   *   liegt und den Stand gar nicht bewegt.
   * Abgeschlossene Monate zählen eingefroren wie in der Kopfzeile
   * (ZK.Closing.accountBalance); opts.accountBalance ersetzt die Rechnung.
   */
  function baseBalance(records, settings, iso, now, opts) {
    var s = Object.assign({}, settings || R.defaultSettings(), { capPlusMinutes: null, capMinusMinutes: null });
    var copy = Object.assign({}, records || {});
    copy[iso] = { date: iso, type: "free", start: "", end: "", breaks: [] };
    var today = T.todayISO(now);
    var upto = iso > today ? iso : today;
    var counts = !(s.carryOverFrom && iso < s.carryOverFrom);
    return { minutes: accountOf(opts)(copy, s, upto, now).minutes, counts: counts };
  }

  /** Dieselbe Kontorechnung wie App.accountBalance — nie die Engine allein. */
  function accountOf(opts) {
    if (opts && typeof opts.accountBalance === "function") return opts.accountBalance;
    var C = closing ? closing() : null;
    return C && C.accountBalance ? C.accountBalance : E.accountBalance;
  }

  /**
   * Was der Tag zeigt, wenn um `endTl` gegangen wird.
   * opts: { settings, holiday, now, isToday, prevEndTl,
   *         closeAt      laufende Pause endet hier (Zeitachse)
   *         base         Ergebnis von baseBalance() oder Minuten
   *         nextStartTl  nächstes Kommen auf dieser Zeitachse (+1440) }
   */
  function evaluate(record, endTl, opts) {
    opts = opts || {};
    var s = opts.settings || R.defaultSettings();
    var res = E.computeDay(draft(record, endTl, opts.closeAt), {
      settings: s,
      holiday: opts.holiday,
      now: opts.now,
      isToday: opts.isToday,
      prevEndTl: opts.prevEndTl
    });
    return pointOf(res, endTl, opts, s);
  }

  function pointOf(res, endTl, opts, s) {
    var maxDaily = s.maxDailyMinutes || 600;
    var base = opts.base;
    var p = {
      endTl: endTl,
      end: T.formatHHMM(endTl),
      dayOffset: T.dayOffsetOf(endTl),
      presence: res.presence,
      net: res.net,
      netRaw: res.netRaw,
      balance: res.balance,
      requiredBreak: res.requiredBreak,
      autoDeducted: res.autoDeducted,
      breakTotal: res.breakTotal,
      legalBreak: res.legalBreak,
      effectiveBreak: res.effectiveBreak,
      workingTime: res.workingTime,
      account: null,
      overDaily: res.net > maxDaily,
      rest: null,
      restShort: false
    };
    if (typeof base === "number") p.account = accountAfter(base, res.balance, s);
    else if (base && typeof base.minutes === "number") {
      p.account = accountAfter(base.minutes, base.counts === false ? 0 : res.balance, s);
    }
    if (typeof opts.nextStartTl === "number") {
      // Wie die Engine (rest-short): Wanduhr, nächstes Kommen + 1440
      p.rest = opts.nextStartTl - endTl;
      p.restShort = p.rest < (s.minRestHours || 11) * 60;
    }
    return p;
  }

  /**
   * Bereich des Schiebers in Anwesenheitsminuten: Kommen + 4 h … + 12 h,
   * erweitert, bis gespeichertes Gehen, jetzt und ±0 mit etwas Luft
   * hineinpassen. Viertelstundengenau, damit die Skala ruhig bleibt.
   */
  function spanFor(marks) {
    var lo = SPAN_LO, hi = SPAN_HI;
    (marks || []).forEach(function (m) {
      if (typeof m !== "number" || !isFinite(m)) return;
      lo = Math.min(lo, m - MARGIN);
      hi = Math.max(hi, m + MARGIN);
    });
    lo = Math.max(SPAN_MIN, Math.floor(lo / 15) * 15);
    hi = Math.min(SPAN_MAX, Math.ceil(hi / 15) * 15);
    if (hi < lo + 60) hi = Math.min(SPAN_MAX, lo + 60);
    return { lo: lo, hi: hi };
  }

  /**
   * Alle Stellungen eines Tages durchrechnen.
   * opts wie evaluate, dazu { current (Engine-Ergebnis des Tages, sonst
   * selbst gerechnet), nowTl (an einem laufenden Tag) }.
   * → null, wenn der Tag kein Kommen hat.
   */
  function scan(record, opts) {
    opts = opts || {};
    var s = opts.settings || R.defaultSettings();
    var startTod = T.parseHHMM(record && record.start);
    if (!record || startTod === null) return null;
    var date = record.date;
    var axis = T.dstAxis(date);
    function real(tl) { return axis && tl !== null ? axis.toReal(tl) : tl; }
    function wall(r) { return axis && r !== null ? axis.toWall(r) : r; }

    var cur = opts.current || E.computeDay(record, {
      settings: s, holiday: opts.holiday, now: opts.now, isToday: opts.isToday, prevEndTl: opts.prevEndTl
    });
    var S = real(startTod);
    var running = !!cur.running;
    var nowTl = typeof opts.nowTl === "number" ? opts.nowTl : null;
    var closeAt = typeof opts.closeAt === "number" ? opts.closeAt : (running ? nowTl : undefined);
    var savedEnd = cur.complete && cur.endTl !== null ? cur.endTl : null;
    var leave = cur.recommendedLeaveTl === undefined ? null : cur.recommendedLeaveTl;

    /* ±0 zählt nur, wenn überhaupt Soll zu leisten ist — an einem Tag ohne
       Soll liegt es auf dem Kommen und würde den Bereich nur aufblähen. */
    var leaveAt = leave === null ? null : real(leave) - S;
    var span = spanFor([
      savedEnd === null ? null : real(savedEnd) - S,
      running && nowTl !== null ? real(nowTl) - S : null,
      leaveAt !== null && leaveAt > 0 ? leaveAt : null
    ]);

    var evalOpts = Object.assign({}, opts, { settings: s, closeAt: closeAt });
    var positions = [], points = [];
    for (var m = span.lo; m <= span.hi; m++) {
      var tl = wall(S + m);
      positions.push(tl);
      points.push(evaluate(record, tl, evalOpts));
    }

    var out = {
      date: date,
      startTl: startTod,
      lo: span.lo,
      hi: span.hi,
      positions: positions,
      points: points,
      running: running,
      savedEnd: savedEnd,
      nowTl: nowTl,
      dst: !!axis,
      /** Anwesenheit in echten Minuten bis zum Zeitpunkt tl (für die Skala). */
      offsetOf: function (tl) { return real(tl) - S; },
      /** Umkehrung: Zeitpunkt (Wanduhr) nach `off` echten Minuten. */
      timeAt: function (off) { return wall(S + off); }
    };
    out.marks = landmarks(out, s, opts);
    out.zones = zonesOf(points);
    return out;
  }

  /** Index der ersten Stellung ab `tl` (Zeitachse), sonst -1. In der
      doppelten Herbststunde ist das ihr erstes Vorkommen. */
  function indexOf(sc, tl) {
    if (!sc || typeof tl !== "number") return -1;
    var pos = sc.positions;
    for (var i = 0; i < pos.length; i++) if (pos[i] >= tl) return i;
    return -1;
  }

  /** Nächstgelegene Stellung (für Vorgaben, die ausserhalb liegen). */
  function clampIndex(sc, tl) {
    if (!sc || !sc.positions.length) return -1;
    var i = indexOf(sc, tl);
    return i < 0 ? sc.positions.length - 1 : i;
  }

  /*
     Interessante Stellungen. Gezählt wird nur ein Übergang INNERHALB des
     Bereichs: Steht der Tagessaldo schon an der ersten Stellung über null
     (Wochenendeinsatz ohne Soll), gibt es kein „±0 heute“ zu zeigen.
  */
  function landmarks(sc, s, opts) {
    var pts = sc.points;
    var n = pts.length;
    function crossing(get, level) {
      for (var i = 1; i < n; i++) {
        var a = get(pts[i - 1]), b = get(pts[i]);
        if (a === null || b === null) return -1;
        if (a < level && b >= level) return i;
      }
      return -1;
    }
    /* Letzte Stellung, die eine Grenze noch einhält — nur, wenn die
       Grenze im Bereich überschritten wird. */
    function lastWithin(ok) {
      if (!n || !ok(pts[0])) return -1;
      for (var i = 1; i < n; i++) if (!ok(pts[i])) return i - 1;
      return -1;
    }
    var maxDaily = s.maxDailyMinutes || 600;
    var marks = {
      zero: crossing(function (p) { return p.balance; }, 0),
      plus: crossing(function (p) { return p.balance; }, 60),
      account: crossing(function (p) { return p.account; }, 0),
      max: lastWithin(function (p) { return p.net <= maxDaily; }),
      rest: typeof opts.nextStartTl === "number" ? lastWithin(function (p) { return !p.restShort; }) : -1,
      current: sc.savedEnd === null ? -1 : indexOf(sc, sc.savedEnd),
      now: -1
    };
    if (sc.nowTl !== null) {
      var first = sc.positions[0], last = sc.positions[n - 1];
      if (sc.nowTl >= first && sc.nowTl <= last) marks.now = indexOf(sc, sc.nowTl);
    }
    return marks;
  }

  /*
     Pausenstufen: Wo die abgezogene Pflichtpause mit jeder Minute wächst,
     bringt längeres Bleiben nichts — die Minute zählt als Pause, bis die
     höhere Stufe erfüllt ist. Ein Abschnitt reicht von der letzten Stellung
     davor (ab hier steht das Netto still) bis zur Stellung, an der die
     Stufe erfüllt ist (ab da wächst es wieder).
  */
  function zonesOf(pts) {
    var zones = [];
    var i = 1;
    while (i < pts.length) {
      if (pts[i].autoDeducted > pts[i - 1].autoDeducted) {
        var from = i - 1;
        while (i + 1 < pts.length && pts[i + 1].autoDeducted > pts[i].autoDeducted) i++;
        zones.push({
          from: from,
          to: i,
          require: pts[i].requiredBreak,
          extra: pts[i].autoDeducted - pts[from].autoDeducted
        });
      }
      i++;
    }
    return zones;
  }

  /**
   * Zusätzlich abgezogene Pflichtpause an Stellung i durch die zuletzt
   * angebrochene Pausenstufe → { zone, minutes } oder null.
   */
  function tierPenalty(sc, i) {
    if (!sc || i < 0) return null;
    var hit = null;
    sc.zones.forEach(function (z) { if (z.from < i) hit = z; });
    if (!hit) return null;
    var minutes = sc.points[i].autoDeducted - sc.points[hit.from].autoDeducted;
    return minutes > 0 ? { zone: hit, minutes: minutes } : null;
  }

  /** Lage eines Zeitpunkts auf dem Schieber, 0 … 1 (linear in echten Minuten). */
  function fractionOf(sc, tl) {
    if (!sc || sc.hi <= sc.lo || typeof tl !== "number") return 0;
    var f = (sc.offsetOf(tl) - sc.lo) / (sc.hi - sc.lo);
    return f < 0 ? 0 : (f > 1 ? 1 : f);
  }

  /**
   * Volle Stunden für die Skala: { tl, at (0 … 1), dayOffset }. Ausgelassen
   * werden Uhrzeiten, die es in der Frühlingsnacht nicht gibt, und solche
   * direkt am Rand (die Beschriftung ragte sonst aus der Karte).
   */
  function hoursOf(sc) {
    var out = [];
    if (!sc || !sc.positions.length || sc.hi <= sc.lo) return out;
    var first = sc.positions[0], last = sc.positions[sc.positions.length - 1];
    for (var h = Math.ceil(first / 60) * 60; h <= last; h += 60) {
      var off = sc.offsetOf(h);
      if (sc.timeAt(off) !== h) continue;
      var at = (off - sc.lo) / (sc.hi - sc.lo);
      if (at < 0.03 || at > 0.97) continue;
      out.push({ tl: h, at: at, dayOffset: T.dayOffsetOf(h) });
    }
    return out;
  }

  /** Die Pausenstufe, die an Stellung i läuft oder als nächste kommt. */
  function zoneNear(sc, i) {
    if (!sc) return null;
    for (var k = 0; k < sc.zones.length; k++) {
      if (sc.zones[k].to >= i) return sc.zones[k];
    }
    return null;
  }

  return {
    SPAN_LO: SPAN_LO,
    SPAN_HI: SPAN_HI,
    draft: draft,
    evaluate: evaluate,
    accountAfter: accountAfter,
    baseBalance: baseBalance,
    spanFor: spanFor,
    scan: scan,
    indexOf: indexOf,
    clampIndex: clampIndex,
    fractionOf: fractionOf,
    hoursOf: hoursOf,
    tierPenalty: tierPenalty,
    zoneNear: zoneNear
  };
});
