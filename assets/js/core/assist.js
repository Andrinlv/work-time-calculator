/* ==========================================================================
   ZEITKONTO — Lückenhilfe
   --------------------------------------------------------------------------
   „Vergessen zu stempeln? Zeitkonto merkt es und schlägt deine üblichen
   Zeiten vor.“ Hier steckt alles ohne DOM:

     · Übliche Zeiten   Läuft der Schichtplan, ist die geplante Schicht des
                        Tages das Übliche (Kommen, Gehen, Pause, bezahlt
                        oder nicht) — ein laut Plan freier Tag bekommt
                        keinen erfundenen Arbeitstag. Sonst der Median von
                        Kommen, Gehen und Mittag aus den letzten acht
                        erfassten Arbeitstagen mit demselben Wochentag
                        (sonst aus den letzten Arbeitstagen, sonst aus der
                        Schichtvorlage). Nachtschicht-Leute bekommen Nacht-
                        zeiten, sobald die jüngsten Tage Nächte waren.
     · Erkennen         Kommen vergessen, Pause offen, Gehen vergessen,
                        vergangene Tage ohne Gehen, Arbeitstage ohne Eintrag.
     · Vorschläge       fertige Patches, die die Engine ohne Pausen-Warnung
                        rechnet — die Oberfläche speichert sie nur noch.

   Grundsätze: Erfasstes wird nie überschrieben, der laufende Tag gilt nie
   als Fehler, und jeder Hinweis lässt sich für den Tag ausblenden.
   ========================================================================== */
(function (root, factory) {
  /* Der Schichtplan wird erst beim Rechnen geholt: im Browser lädt
     core/rota.js nach dieser Datei. */
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"), require("./engine.js"),
      function () { return require("./rota.js"); });
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Assist = factory(root.ZK.Time, root.ZK.Rules, root.ZK.Engine,
      function () { return root.ZK.Rota || null; });
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R, E, rotaApi) {
  "use strict";

  var SAMPLE_LIMIT = 8;          // so viele gleiche Wochentage zählen
  var MIN_WEEKDAY = 3;           // darunter ist der Wochentag zu dünn belegt
  var LOOKBACK = 182;            // ein halbes Jahr zurück
  var SCAN_DAYS = 31;            // so weit zurück wird nach Lücken gesucht
  var KEEP_DISMISSED = 45;       // ältere Ausblendungen werden aufgeräumt
  var LATE_START = 45;           // Kommen vergessen: üblich + 45 min
  var OPEN_BREAK = 90;           // Pause offen: länger als 90 min
  var LATE_END = 120;            // Gehen vergessen: üblich + 2 h
  var LONG_DAY = 12 * 60;        // … oder mehr als 12 h anwesend
  var START_SLACK = 30;          // so weit darf Kommen vom Üblichen abweichen,
                                 // bevor sich auch das Gehen mitverschiebt
  var MIN_SAMPLE = 180;          // kürzere Tage taugen nicht als Vorbild

  /* Warnungen, die ein Vorschlag nie auslösen darf (Ruhezeit und Tages-
     maximum hängen am Verhalten, nicht an der Erfassung). */
  var RECORD_CODES = ["invalid-start", "invalid-end", "invalid-break", "break-auto", "break-short",
    "break-outside", "break-overlap", "missing-end", "presence-implausible", "absence-with-times"];

  var PRIORITY = { "break": 1, leave: 2, "in": 3, end: 4, gap: 5, gaps: 6 };

  /* ------------------------------------------------------------------ */
  /* Kleinkram                                                           */
  /* ------------------------------------------------------------------ */

  function median(list) {
    var a = list.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  }

  function stepOf(s) { return s && s.roundStep > 1 ? s.roundStep : 0; }

  /** Auf das Rundungsraster der Einstellungen (nächstliegend). */
  function roundTo(min, s) {
    var step = stepOf(s);
    return step ? Math.round(min / step) * step : Math.round(min);
  }
  function floorTo(min, s) {
    var step = stepOf(s);
    return step ? Math.floor(min / step) * step : Math.floor(min);
  }

  function fmt(min) { return T.formatHHMM(min); }

  function isEnabled(s) { return !s || s.assist !== false; }

  /** Trägt der Datensatz schon etwas, das man überschreiben könnte? */
  function hasContent(rec) {
    if (!rec) return false;
    return !!(String(rec.start || "").trim() || String(rec.end || "").trim() || rec.type ||
      (rec.breaks && rec.breaks.length) || String(rec.note || "").trim() ||
      (rec.targetOverride !== null && rec.targetOverride !== undefined));
  }

  function isOpenBreak(b) {
    return !!b && T.parseHHMM(b.start) !== null && !String(b.end || "").trim();
  }

  function computeAt(rec, iso, s, now) {
    var today = T.todayISO(now);
    return E.computeDay(rec || { date: iso }, { settings: s, now: now, isToday: iso === today });
  }

  /**
   * Ab wann fehlende Arbeitstage als Lücke gelten — dieselbe Lesart wie
   * ZK.CalWeek.trackingStart: erster eigener Eintrag bzw. App-Start,
   * frühestens Kontobeginn. Ohne eigenen Eintrag gibt es keine Lücken.
   */
  function trackingStartOf(days, s, meta) {
    var first = null;
    Object.keys(days || {}).forEach(function (iso) {
      var rec = days[iso];
      if (!rec || rec.source === "outlook" || !T.isValidISO(iso)) return;
      if (first === null || iso < first) first = iso;
    });
    if (!first) return null;
    var created = null;
    if (meta && meta.createdAt) {
      var d = new Date(meta.createdAt);
      if (!isNaN(d.getTime())) created = T.todayISO(d);
    }
    var begin = created && created < first ? created : first;
    var from = s && s.carryOverFrom && T.isValidISO(s.carryOverFrom) ? s.carryOverFrom : null;
    if (from && from > begin) begin = from;
    return begin;
  }

  /* ------------------------------------------------------------------ */
  /* 1 · Übliche Zeiten                                                  */
  /* ------------------------------------------------------------------ */
  /*
     Ein Vorbild-Tag wird auf eine eigene Achse gelegt: Tagschichten ab
     Mitternacht, Nachtschichten so, dass 22:00 und 00:30 nebeneinander
     liegen (00:30 → 24:30). Nur so ergibt ein Median über Nächte Sinn.
  */
  function mainBreak(rec, startTod, shift, start, end) {
    var best = null;
    (rec.breaks || []).forEach(function (b) {
      if (!b || b.paid) return;
      var bs = T.parseHHMM(b.start), be = T.parseHHMM(b.end);
      if (bs === null || be === null) return;
      var s1 = T.onTimeline(bs, startTod) + shift;
      var e1 = T.onTimeline(be, startTod) + shift;
      if (e1 < s1) e1 += T.DAY;
      if (s1 <= start || e1 >= end || e1 <= s1) return;
      if (!best || e1 - s1 > best.end - best.start) best = { start: s1, end: e1 };
    });
    return best;
  }

  function sampleOf(iso, rec, s, now) {
    var res = E.computeDay(rec, { settings: s, now: now, isToday: false });
    if (!res.complete || res.type !== "work" || res.hasError) return null;
    if (res.presence < MIN_SAMPLE || res.presence > 16 * 60) return null;
    var night = res.startTod >= 18 * 60 || res.startTod < 4 * 60;
    var shift = night && res.startTod < 12 * 60 ? T.DAY : 0;
    var start = res.startTod + shift;
    var end = start + (res.endTl - res.startTl);
    return {
      date: iso,
      weekday: res.weekday,
      night: night,
      start: start,
      end: end,
      lunch: mainBreak(rec, res.startTod, shift, start, end)
    };
  }

  /**
   * Vorbild-Tage, jüngste zuerst: abgeschlossene Arbeitstage vor `before`
   * (ohne Absenzen, Fehler und Kurztage), höchstens ein halbes Jahr zurück.
   */
  function collectSamples(days, s, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var before = opts.before || T.todayISO(now);
    var limit = T.addDays(before, -LOOKBACK);
    var out = [];
    Object.keys(days || {}).sort().reverse().forEach(function (iso) {
      if (iso >= before || iso < limit || !T.isValidISO(iso)) return;
      var smp = sampleOf(iso, days[iso], s, now);
      if (smp) out.push(smp);
    });
    return out;
  }

  /** Vorlage als letzte Rückfallebene: „Büro“, sonst die erste, sonst 08:00–17:00. */
  function fromTemplate(s, weekday) {
    var list = (s && s.shiftTemplates) || [];
    var tpl = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === "office") { tpl = list[i]; break; }
    }
    if (!tpl) {
      for (var j = 0; j < list.length; j++) {
        if (list[j] && T.parseHHMM(list[j].start) !== null && T.parseHHMM(list[j].end) !== null) { tpl = list[j]; break; }
      }
    }
    var st = tpl ? T.parseHHMM(tpl.start) : null;
    var en = tpl ? T.parseHHMM(tpl.end) : null;
    var source = "template";
    if (st === null || en === null) { st = 8 * 60; en = 17 * 60; source = "default"; tpl = null; }
    var night = st >= 18 * 60 || st < 4 * 60;
    var shift = night && st < 12 * 60 ? T.DAY : 0;
    var start = st + shift;
    var end = T.onTimeline(en, st) + shift;
    var lunch = null;
    var ls = tpl ? T.parseHHMM(tpl.breakStart) : null;
    var le = tpl ? T.parseHHMM(tpl.breakEnd) : null;
    if ((ls === null || le === null) && s && s.defaultLunch) {
      ls = T.parseHHMM(s.defaultLunch.start);
      le = T.parseHHMM(s.defaultLunch.end);
    }
    if (ls !== null && le !== null) {
      var a = T.onTimeline(ls, st) + shift;
      var b = T.onTimeline(le, st) + shift;
      if (b < a) b += T.DAY;
      if (a > start && b < end && b > a) lunch = { start: a, end: b };
    }
    return finish({
      start: start, end: end, lunch: lunch, n: 0, source: source, night: night, weekday: weekday,
      template: tpl ? { id: tpl.id || null, name: tpl.name || "", nameKey: tpl.nameKey || null } : null
    }, s);
  }

  /** Raster der Einstellungen anwenden, Mittag in der Spanne halten, Texte setzen. */
  function finish(typ, s) {
    typ.start = roundTo(typ.start, s);
    typ.end = roundTo(typ.end, s);
    if (typ.end <= typ.start + 60) typ.end = typ.start + 8 * 60;
    if (typ.lunch) {
      var ls = roundTo(typ.lunch.start, s);
      var le = roundTo(typ.lunch.end, s);
      if (le <= ls) le = ls + Math.max(stepOf(s), 15);
      typ.lunch = (ls > typ.start && le < typ.end) ? { start: ls, end: le } : null;
    }
    return withText(typ);
  }

  function withText(typ) {
    typ.text = {
      start: fmt(typ.start),
      end: fmt(typ.end),
      lunchStart: typ.lunch ? fmt(typ.lunch.start) : null,
      lunchEnd: typ.lunch ? fmt(typ.lunch.end) : null
    };
    return typ;
  }

  /**
   * Die geplante Schicht als übliche Zeiten (source "plan"). Gleiche Achse
   * wie die Vorbild-Tage (Nacht ab 00:00 bis 04:00 liegt über 1440); die
   * Zeiten gelten genau wie geplant — ohne Rundungsraster.
   *   entry: Rota.dayPlan mit Schicht
   */
  function fromPlan(entry, weekday) {
    var Rota = rotaApi();
    var st = Rota.shiftTimes(entry.tpl);
    var night = st.start >= 18 * 60 || st.start < 4 * 60;
    var shift = night && st.start < 12 * 60 ? T.DAY : 0;
    var lunch = null;
    if (st.breakStart !== null && st.breakStart > st.start && st.breakEnd < st.end) {
      lunch = { start: st.breakStart + shift, end: st.breakEnd + shift };
    }
    var tpl = entry.tpl;
    return withText({
      start: st.start + shift, end: st.end + shift, lunch: lunch, lunchPaid: !!(lunch && st.paid),
      n: 0, source: "plan", plan: entry.source, night: night, weekday: weekday,
      template: { id: tpl.id || null, name: tpl.name || "", nameKey: tpl.nameKey || null }
    });
  }

  /**
   * Was der Schichtplan für `iso` vorsieht:
   *   null            kein Plan (ausgeschaltet, Vorlage gelöscht, Ferien …) → Gewohnheit
   *   { free: true }  laut Plan frei (auch Feiertag, an dem der Rhythmus pausiert)
   *   { typ }         die geplante Schicht als übliche Zeiten
   */
  function plannedFor(iso, s, rec, holiday) {
    var Rota = rotaApi();
    if (!Rota || !s || !Rota.isActive(s.rota)) return null;
    var e = Rota.dayPlanOf(s, iso, rec, holiday);
    if (Rota.hasShift(e)) return { typ: fromPlan(e, T.weekdayOf(iso)) };
    if (e.free || e.off === "holiday") return { free: true };
    return null;
  }

  /**
   * Übliche Zeiten für einen Wochentag aus vorbereiteten Vorbild-Tagen.
   * → { start, end, lunch:{start,end}|null, n, source, night, weekday, text }
   *   start/end/lunch in Minuten auf der Achse des Vorbilds (Nacht: 22:00 =
   *   1320, Gehen 06:00 = 1800); n = Anzahl Vorbild-Tage (Vertrauen);
   *   source: "weekday" | "recent" | "template" | "default".
   */
  function typicalFromSamples(samples, weekday, s) {
    samples = samples || [];
    var recent = samples.slice(0, SAMPLE_LIMIT);
    var nights = recent.filter(function (x) { return x.night; }).length;
    var night = recent.length > 0 && nights * 2 > recent.length;
    var pool = samples.filter(function (x) { return x.night === night; });
    var same = pool.filter(function (x) { return x.weekday === weekday; }).slice(0, SAMPLE_LIMIT);
    var use, source;
    if (same.length >= MIN_WEEKDAY) { use = same; source = "weekday"; }
    else if (pool.length) { use = pool.slice(0, SAMPLE_LIMIT); source = "recent"; }
    else return fromTemplate(s, weekday);

    var start = median(use.map(function (x) { return x.start; }));
    var end = median(use.map(function (x) { return x.end; }));
    if (end <= start + 60) end = start + median(use.map(function (x) { return x.end - x.start; }));
    var withLunch = use.filter(function (x) { return x.lunch; });
    var lunch = null;
    if (withLunch.length && withLunch.length * 2 >= use.length) {
      var ls = median(withLunch.map(function (x) { return x.lunch.start; }));
      var dur = median(withLunch.map(function (x) { return x.lunch.end - x.lunch.start; }));
      lunch = { start: ls, end: ls + dur };
    }
    return finish({ start: start, end: end, lunch: lunch, n: use.length, source: source, night: night, weekday: weekday, template: null }, s);
  }

  /**
   * Übliche Zeiten für den Tag opts.date — läuft der Schichtplan, die dort
   * geplante Schicht (an einem laut Plan freien Tag der Median mit
   * planFree: true). Mit opts.weekday nur der Median dieses Wochentags.
   * opts: { date, weekday, before (exklusiv, Standard heute), now }
   */
  function typicalTimes(days, s, opts) {
    opts = opts || {};
    var samples = collectSamples(days, s, opts);
    if (typeof opts.weekday === "number") return typicalFromSamples(samples, opts.weekday, s);
    return typicalSource(days, s, { now: opts.now, samples: samples })(opts.date || T.todayISO(opts.now));
  }

  /* ------------------------------------------------------------------ */
  /* 2 · Vorschläge bauen                                                */
  /* ------------------------------------------------------------------ */

  /** Uhrzeit der üblichen Achse auf die Achse eines Tages mit Kommen `startTod`. */
  function onDay(typTl, startTod) {
    return T.onTimeline(((typTl % T.DAY) + T.DAY) % T.DAY, startTod);
  }

  function lunchDur(typ) { return typ.lunch ? typ.lunch.end - typ.lunch.start : 30; }

  /** paid: nur die bezahlte Pause einer geplanten Schicht */
  function newBreak(opts, idx, start, end, paid) {
    return {
      id: "a" + (opts.idBase || Date.now().toString(36)) + (idx || 0),
      label: opts.breakLabel || "",
      start: fmt(start),
      end: fmt(end),
      paid: !!paid
    };
  }

  /** Pausen eines Tages als Intervalle auf der Achse ab `startTod`. */
  function intervalsOf(breaks, startTod) {
    var out = [];
    (breaks || []).forEach(function (b, i) {
      var bs = T.parseHHMM(b && b.start), be = T.parseHHMM(b && b.end);
      if (bs === null || be === null) return;
      var s1 = T.onTimeline(bs, startTod);
      var e1 = T.onTimeline(be, startTod);
      if (e1 < s1) e1 += T.DAY;
      if (e1 > s1) out.push({ start: s1, end: e1, idx: i, paid: !!b.paid });
    });
    return out;
  }

  function overlapsAny(list, a, b, skip) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].idx === skip) continue;
      if (a < list[i].end && b > list[i].start) return true;
    }
    return false;
  }

  /**
   * Ergänzt fehlende Pflichtpause, damit die Engine nichts abziehen muss:
   * zuerst die längste Pause verlängern, sonst die übliche Mittagspause
   * einfügen, sonst die Pause in die längste Arbeitsstrecke legen.
   * Verändert `breaks`; liefert true, wenn etwas ergänzt wurde.
   */
  function ensureLegalBreak(breaks, startTod, endTl, typ, s, opts) {
    var presence = endTl - startTod;
    var req = R.minBreakFor(presence, s.breakRuleset, s.customBreakTiers);
    if (req <= 0) return false;
    var list = intervalsOf(breaks, startTod);
    var inside = T.clipIntervals(T.mergeIntervals(list), startTod, endTl);
    var short = req - Math.round(T.totalOf(inside));
    if (short <= 0) return false;
    function fits(a, b, skip) { return a > startTod && b < endTl && b > a && !overlapsAny(list, a, b, skip); }

    var unpaid = list.filter(function (x) { return !x.paid && x.start > startTod && x.end < endTl; })
      .sort(function (x, y) { return (y.end - y.start) - (x.end - x.start); });
    if (unpaid.length) {
      var lg = unpaid[0];
      if (fits(lg.start, lg.end + short, lg.idx)) { breaks[lg.idx].end = fmt(lg.end + short); return true; }
      if (fits(lg.start - short, lg.end, lg.idx)) { breaks[lg.idx].start = fmt(lg.start - short); return true; }
    }
    var dur = list.length ? short : Math.max(lunchDur(typ), short);
    if (typ.lunch) {
      var ls = onDay(typ.lunch.start, startTod);
      /* Die Pause der geplanten Schicht kommt so, wie sie geplant ist (auch bezahlt) */
      var asPlanned = !!typ.lunchPaid && dur === lunchDur(typ);
      if (fits(ls, ls + dur)) { breaks.push(newBreak(opts, breaks.length, ls, ls + dur, asPlanned)); return true; }
    }
    /* Längste freie Strecke zwischen Kommen, Pausen und Gehen */
    var edges = [startTod];
    inside.forEach(function (x) { edges.push(x.start, x.end); });
    edges.push(endTl);
    var best = null;
    for (var i = 0; i + 1 < edges.length; i += 2) {
      var gap = edges[i + 1] - edges[i];
      if (!best || gap > best.len) best = { from: edges[i], len: gap };
    }
    if (best && best.len > dur + 2) {
      var at = best.from + Math.round((best.len - dur) / 2);
      breaks.push(newBreak(opts, breaks.length, at, at + dur));
      return true;
    }
    return false;
  }

  /**
   * Ganzer Tag „wie üblich“: Kommen, Gehen und Mittag. Die Pause genügt dem
   * Gesetz für die ganze Anwesenheit (R.minBreakFor) — fehlt eine übliche
   * Mittagspause, kommt die Pflichtpause an die gewohnte Mittagszeit.
   * → { start, end, breaks }
   */
  function buildDay(typ, s, opts) {
    opts = opts || {};
    var st = typ.start % T.DAY;
    var endTl = st + (typ.end - typ.start);
    var breaks = [];
    if (typ.lunch) {
      var ls = onDay(typ.lunch.start, st);
      var le = ls + lunchDur(typ);
      if (ls > st && le < endTl) breaks.push(newBreak(opts, 0, ls, le, typ.lunchPaid));
    }
    if (!breaks.length && s.defaultLunch) {
      var req = R.minBreakFor(endTl - st, s.breakRuleset, s.customBreakTiers);
      var dl = T.parseHHMM(s.defaultLunch.start);
      if (req > 0 && dl !== null) {
        var a = T.onTimeline(dl, st);
        if (a > st && a + req < endTl) breaks.push(newBreak(opts, 0, a, a + req));
      }
    }
    ensureLegalBreak(breaks, st, endTl, typ, s, opts);
    return { start: fmt(st), end: fmt(endTl), breaks: breaks };
  }

  /**
   * Wann eine offene Pause enden soll: zum üblichen Mittagsende — liegt das
   * nicht nach ihrem Beginn, nach der üblichen Pausenlänge. Nie nach `cap`.
   */
  function breakEndFor(typ, startTod, openTl, cap, s) {
    var end = typ.lunch ? onDay(typ.lunch.end, startTod) : null;
    if (end === null || end <= openTl + 5) end = openTl + lunchDur(typ);
    end = roundTo(end, s);
    if (end > cap) end = cap;
    if (end <= openTl) end = Math.min(cap, openTl + 1);
    return end;
  }

  /**
   * Gehen „wie üblich“ für einen Tag mit Kommen, aber ohne Gehen. Kam
   * jemand deutlich früher oder später als sonst, verschiebt sich das
   * Gehen um denselben Betrag (übliche Tageslänge). Passt das nicht zu den
   * erfassten Pausen, rechnet R.presenceForNet das Gehen vom Soll aus.
   * Eine offene Pause wird geschlossen — oder, lag sie nach dem üblichen
   * Gehen, als vergessenes Gehen gelesen. Fehlt die Pflichtpause, wird sie
   * ergänzt. opts: { nowTl (Obergrenze für laufende Tage), target, breakLabel, idBase }
   * → { end, endTl, breaks, breaksChanged, addedBreak, closedBreak, droppedBreak } | null
   */
  function completeEnd(rec, typ, s, opts) {
    opts = opts || {};
    var startTod = T.parseHHMM(rec && rec.start);
    if (startTod === null) return null;
    var shift = typ.night && startTod < 12 * 60 ? T.DAY : 0;
    var recStart = startTod + shift;
    var endTl = (Math.abs(recStart - typ.start) <= START_SLACK ? typ.end : recStart + (typ.end - typ.start)) - shift;
    var cap = typeof opts.nowTl === "number" ? opts.nowTl : Infinity;

    var breaks = (rec.breaks || []).map(function (b) { return Object.assign({}, b); });
    var openIdx = -1;
    for (var i = 0; i < breaks.length; i++) if (isOpenBreak(breaks[i])) { openIdx = i; break; }
    var closed = intervalsOf(breaks, startTod);
    var lastEnd = closed.length ? Math.max.apply(null, closed.map(function (x) { return x.end; })) : null;
    var info = { breaksChanged: false, addedBreak: false, closedBreak: false, droppedBreak: false };

    var openTl = openIdx >= 0 ? T.onTimeline(T.parseHHMM(breaks[openIdx].start), startTod) : null;
    if (openTl !== null && openTl >= Math.min(endTl, cap)) {
      /* „Pause“ gedrückt und gegangen: die Pause war das Gehen */
      endTl = openTl;
      breaks.splice(openIdx, 1);
      openIdx = -1;
      info.droppedBreak = info.breaksChanged = true;
    }

    var needLater = (lastEnd !== null && endTl <= lastEnd) || endTl <= startTod + 30;
    if (needLater) {
      var unpaid = T.mergeIntervals(closed.filter(function (x) { return !x.paid; }));
      var all = T.mergeIntervals(closed);
      var hasPaid = closed.some(function (x) { return x.paid; });
      var sol = R.presenceForNet(opts.target || 0, s, function (g) {
        var u = T.totalOf(T.clipIntervals(unpaid, startTod, startTod + g));
        var a = T.totalOf(T.clipIntervals(all, startTod, startTod + g));
        return { unpaid: u, paid: Math.max(0, a - u), hasPaid: hasPaid };
      });
      endTl = Math.max(startTod + sol.gross, lastEnd !== null ? lastEnd + 1 : startTod + 31);
    }
    // Das Schichtende laut Plan gilt genau so, wie es geplant ist
    if (!(typ.source === "plan" && !needLater && endTl === typ.end - shift)) endTl = roundTo(endTl, s);
    if (endTl > cap) endTl = floorTo(cap, s);
    if (lastEnd !== null && endTl < lastEnd) return null;
    if (endTl <= startTod) return null;

    if (openIdx >= 0) {
      breaks[openIdx].end = fmt(breakEndFor(typ, startTod, openTl, endTl, s));
      info.closedBreak = info.breaksChanged = true;
    }
    if (ensureLegalBreak(breaks, startTod, endTl, typ, s, opts)) info.addedBreak = info.breaksChanged = true;
    return Object.assign(info, { end: fmt(endTl), endTl: endTl, breaks: breaks });
  }

  /** Datensatz nach dem Vorschlag und was die Engine daran bemängelt. */
  function check(rec, patch, iso, s, now) {
    var after = Object.assign({ date: iso }, rec || {}, patch || {});
    var res = computeAt(after, iso, s, now);
    var issues = res.warnings.filter(function (w) { return RECORD_CODES.indexOf(w.code) >= 0; })
      .map(function (w) { return w.code; });
    return { after: after, res: res, issues: issues };
  }

  /* ------------------------------------------------------------------ */
  /* 3 · Erkennen                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Vergangene Tage im Zeitraum, die etwas brauchen:
   *   incomplete  Kommen ohne Gehen (Engine: missing-end), nicht laufend
   *   gaps        Arbeitstag mit Soll ohne jede Erfassung ab Erfassungsbeginn
   * Feiertage und Absenzen gelten als erfasst, freie Tage haben kein Soll.
   * opts: { from, to, now, active, trackingStart }
   */
  function scan(days, s, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var today = T.todayISO(now);
    var yesterday = T.addDays(today, -1);
    var to = opts.to && opts.to < yesterday ? opts.to : yesterday;
    var from = opts.from || T.addDays(today, -SCAN_DAYS);
    var start = opts.trackingStart === undefined ? trackingStartOf(days, s, null) : opts.trackingStart;
    var out = { incomplete: [], gaps: [] };
    T.rangeDays(from, to).forEach(function (iso) {
      if (iso === opts.active) return;
      var rec = days ? days[iso] : null;
      var res = computeAt(rec, iso, s, now);
      if (res.running) return;
      if (res.incomplete) { out.incomplete.push(iso); return; }
      if (start && iso >= start && res.target > 0 && !res.recorded && !hasContent(rec)) out.gaps.push(iso);
    });
    return out;
  }

  /**
   * Übliche Zeiten je Tag → function (iso, res) → typical. Zuerst der
   * Schichtplan, sonst der Median je Wochentag (ein Durchlauf sammelt die
   * Vorbilder nur einmal). An einem laut Plan freien Tag kommt der Median
   * mit planFree: true — er taugt dann nur noch für Tage, an denen trotzdem
   * gestempelt wurde (Gehen ergänzen), nicht für einen erfundenen Arbeitstag.
   *   res: Engine-Ergebnis des Tages (liefert den Feiertag), sonst wird gerechnet
   */
  function typicalSource(days, s, opts) {
    var now = opts.now || new Date();
    var samples = opts.samples || collectSamples(days, s, { before: T.todayISO(now), now: now });
    var memo = {};
    var Rota = rotaApi();
    var rotaOn = !!(Rota && s && Rota.isActive(s.rota));
    function usual(iso) {
      var wd = T.weekdayOf(iso);
      if (!memo[wd]) memo[wd] = typicalFromSamples(samples, wd, s);
      return memo[wd];
    }
    return function (iso, res) {
      if (!rotaOn) return usual(iso);
      var rec = days ? days[iso] || null : null;
      var p = plannedFor(iso, s, rec, (res || computeAt(rec, iso, s, now)).holiday);
      if (p && p.typ) return p.typ;
      return p && p.free ? Object.assign({}, usual(iso), { planFree: true }) : usual(iso);
    };
  }

  /** Endet die geplante Schicht erst nach `now`? (Nachtschicht von gestern läuft noch) */
  function planEndsAfter(iso, typ, now) {
    if (!typ || typ.source !== "plan") return false;
    var d = T.fromISO(iso);
    var shift = typ.night && typ.start >= T.DAY ? T.DAY : 0;
    var end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, typ.end - shift);
    return end.getTime() > now.getTime();
  }

  /**
   * Vorschläge für vergangene Tage: Gehen ergänzen bzw. ganzen Tag füllen.
   * Ein laut Schichtplan freier Tag wird nie als Arbeitstag gefüllt, eine
   * geplante Schicht, die noch läuft (Nacht von gestern), auch nicht.
   * → [{ date, kind: "end"|"day", patch, start, end, breaks, typical, issues }]
   */
  function planFill(days, s, dates, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var typicalFor = opts.typicalFor || typicalSource(days, s, opts);
    var out = [];
    (dates || []).forEach(function (iso) {
      var rec = days ? days[iso] : null;
      var res = computeAt(rec, iso, s, now);
      var typ = typicalFor(iso, res);
      var base = { breakLabel: opts.breakLabel, idBase: iso.replace(/-/g, "") };
      var entry = null;
      if (res.incomplete) {
        var ce = completeEnd(rec, typ, s, Object.assign(base, { target: Math.max(0, res.target - res.credited) }));
        if (!ce) return;
        var p = { end: ce.end };
        if (ce.breaksChanged) p.breaks = ce.breaks;
        entry = { date: iso, kind: "end", patch: p, start: rec.start, end: ce.end, breaks: ce.breaks, addedBreak: ce.addedBreak, typical: typ };
      } else if (res.target > 0 && !res.recorded && !hasContent(rec) && !typ.planFree && !planEndsAfter(iso, typ, now)) {
        var day = buildDay(typ, s, base);
        entry = { date: iso, kind: "day", patch: { start: day.start, end: day.end, breaks: day.breaks }, start: day.start, end: day.end, breaks: day.breaks, typical: typ };
      }
      if (!entry) return;
      var c = check(rec, entry.patch, iso, s, now);
      entry.issues = c.issues;
      entry.net = c.res.net;
      entry.balance = c.res.balance;
      out.push(entry);
    });
    return out;
  }

  function keyOf(sug) {
    return sug.code === "end" || sug.code === "gap" ? sug.code + ":" + sug.date : sug.code;
  }

  /**
   * Was gerade zu sagen ist — sortiert nach Dringlichkeit:
   *   break  Pause seit mehr als 90 min offen        (laufender Tag)
   *   leave  Gehen vergessen: üblich + 2 h / > 12 h   (laufender Tag)
   *   in     Kommen vergessen: üblich + 45 min        (heute, Arbeitstag)
   *   end    vergangener Tag ohne Gehen               (letzte 31 Tage)
   *   gaps   Arbeitstage ohne Eintrag                 (letzte 31 Tage)
   * opts: { now, active (App.activeStampDate), trackingStart, dismissed,
   *         breakLabel, includeDismissed }
   * Jeder Vorschlag: { code, key, date, priority, typical, patch, … }
   */
  function detect(days, s, opts) {
    opts = opts || {};
    if (!isEnabled(s)) return [];
    var now = opts.now || new Date();
    var today = T.todayISO(now);
    var nowMin = T.nowMinutes(now);
    var active = opts.active || E.activeShiftDate(function (iso) { return days ? days[iso] || null : null; }, now);
    var typicalFor = typicalSource(days, s, { now: now, samples: opts.samples });
    var label = opts.breakLabel;
    var out = [];

    /* ---- Der laufende Tag ---- */
    var recA = days ? days[active] : null;
    var resA = computeAt(recA, active, s, now);
    if (resA.running) {
      var typA = typicalFor(active, resA);
      var nowTl = nowMin + (resA.overnight ? T.DAY : 0);

      /* (e) Gehen vergessen — kam jemand spät, gilt das verschobene
         übliche Gehen als Massstab */
      var ce = completeEnd(recA, typA, s, {
        nowTl: nowTl, target: Math.max(0, resA.target - resA.credited), breakLabel: label, idBase: active.replace(/-/g, "")
      });
      var shiftA = typA.night && resA.startTod < 12 * 60 ? T.DAY : 0;
      var recStart = resA.startTod + shiftA;
      var expected = (Math.abs(recStart - typA.start) <= START_SLACK ? typA.end : recStart + (typA.end - typA.start)) - shiftA;
      var leave = null;
      if (ce && (resA.presence > LONG_DAY || nowTl > expected + LATE_END) && ce.endTl < nowTl) {
        var lp = { end: ce.end };
        if (ce.breaksChanged) lp.breaks = ce.breaks;
        leave = {
          code: "leave", date: active, start: recA.start, presence: resA.presence, end: ce.end,
          addedBreak: ce.addedBreak, closedBreak: ce.closedBreak, droppedBreak: ce.droppedBreak, typical: typA, patch: lp
        };
      }

      /* (b) Pause offen — ausser „Pause“ war in Wahrheit das Gehen */
      var ob = resA.openBreak;
      if (ob && ob.minutes > OPEN_BREAK && !(leave && leave.droppedBreak)) {
        var obTl = typeof ob.startTl === "number" ? ob.startTl : T.onTimeline(T.parseHHMM(ob.start), resA.startTod);
        var bEnd = breakEndFor(typA, resA.startTod, obTl, nowTl, s);
        if (bEnd > obTl && bEnd < nowTl) {
          var brs = (recA.breaks || []).map(function (b) { return Object.assign({}, b); });
          for (var i = 0; i < brs.length; i++) {
            if (isOpenBreak(brs[i])) { brs[i].end = fmt(bEnd); break; }
          }
          out.push({ code: "break", date: active, since: ob.start, minutes: ob.minutes, end: fmt(bEnd), typical: typA, patch: { breaks: brs } });
        }
      }
      if (leave) out.push(leave);
    } else if (active === today) {
      /* ---- Heute noch nicht gekommen ---- */
      var recT = days ? days[today] : null;
      var hasEnd = !!(recT && String(recT.end || "").trim());
      if (resA.startTod === null && !hasEnd && resA.type === "work" && resA.target > 0 && resA.credited === 0) {
        /* Mit Schichtplan zählt der geplante Beginn; laut Plan frei: kein Hinweis */
        var typT = typicalFor(today, resA);
        if (!typT.planFree && typT.start < T.DAY && nowMin > typT.start + LATE_START) {
          var noBreaks = !(recT && recT.breaks && recT.breaks.length);
          var full = noBreaks && typT.end < T.DAY && nowMin >= typT.end;
          var patch, lunch = null;
          if (full) {
            var d = buildDay(typT, s, { breakLabel: label, idBase: today.replace(/-/g, "") });
            patch = { start: d.start, end: d.end, breaks: d.breaks };
          } else {
            patch = { start: typT.text.start };
            /* Der Mittag ist vorbei und nicht erfasst: der übliche kommt mit */
            if (noBreaks && typT.lunch && nowMin >= typT.lunch.end) {
              lunch = { start: typT.text.lunchStart, end: typT.text.lunchEnd };
              patch.breaks = [newBreak({ breakLabel: label, idBase: today.replace(/-/g, "") }, 0, typT.lunch.start, typT.lunch.end, typT.lunchPaid)];
            }
          }
          out.push({ code: "in", date: today, start: typT.text.start, end: typT.text.end, fullDay: full, lunch: lunch, typical: typT, patch: patch });
        }
      }
    }

    /* ---- Vergangene Tage ---- */
    var found = scan(days, s, { now: now, active: active, trackingStart: opts.trackingStart, from: T.addDays(today, -SCAN_DAYS) });
    var plan = planFill(days, s, found.incomplete.concat(found.gaps), { now: now, typicalFor: typicalFor, breakLabel: label });
    plan.filter(function (p) { return p.kind === "end"; }).forEach(function (p) {
      out.push({ code: "end", date: p.date, start: p.start, end: p.end, addedBreak: p.addedBreak, typical: p.typical, patch: p.patch, plan: [p] });
    });
    var gaps = plan.filter(function (p) { return p.kind === "day"; });
    if (gaps.length) out.push({ code: "gaps", date: today, dates: gaps.map(function (p) { return p.date; }), plan: gaps });

    return finishList(out, s, today, opts);
  }

  /**
   * Vorschläge zu genau einem vergangenen Tag (Ansicht „Heute“ auf einem
   * früheren Datum): Gehen ergänzen oder den leeren Tag wie üblich füllen.
   */
  function detectDay(days, s, iso, opts) {
    opts = opts || {};
    if (!isEnabled(s)) return [];
    var now = opts.now || new Date();
    var today = T.todayISO(now);
    var active = opts.active || E.activeShiftDate(function (d) { return days ? days[d] || null : null; }, now);
    if (iso >= today || iso === active) return detect(days, s, opts);
    var start = opts.trackingStart === undefined ? trackingStartOf(days, s, null) : opts.trackingStart;
    var res = computeAt(days ? days[iso] : null, iso, s, now);
    var isGap = !!start && iso >= start && res.target > 0 && !res.recorded && !hasContent(days ? days[iso] : null);
    if (!res.incomplete && !isGap) return [];
    var plan = planFill(days, s, [iso], { now: now, samples: opts.samples, breakLabel: opts.breakLabel });
    var out = plan.map(function (p) {
      return p.kind === "end"
        ? { code: "end", date: iso, start: p.start, end: p.end, addedBreak: p.addedBreak, typical: p.typical, patch: p.patch, plan: [p] }
        : { code: "gap", date: iso, start: p.start, end: p.end, typical: p.typical, patch: p.patch, plan: [p] };
    });
    return finishList(out, s, today, opts);
  }

  function finishList(out, s, today, opts) {
    var dismissed = opts.dismissed !== undefined ? opts.dismissed : (s && s.assistDismissed);
    out.forEach(function (x) {
      x.key = keyOf(x);
      x.priority = PRIORITY[x.code] || 9;
      x.dismissed = isDismissed(dismissed, today, x.key);
    });
    if (!opts.includeDismissed) out = out.filter(function (x) { return !x.dismissed; });
    return out.sort(function (a, b) {
      return a.priority - b.priority || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 4 · Für heute ausblenden                                            */
  /* ------------------------------------------------------------------ */
  /* settings.assistDismissed = { "2026-10-16": ["in", "end:2026-10-14"] } —
     gilt nur für den Tag, an dem ausgeblendet wurde. */

  function pruneDismissed(map, today) {
    var out = {};
    var oldest = T.addDays(today, -KEEP_DISMISSED);
    Object.keys(map || {}).forEach(function (iso) {
      if (!T.isValidISO(iso) || iso < oldest || iso > today) return;
      var list = Array.isArray(map[iso]) ? map[iso] : [];
      var seen = {};
      list = list.filter(function (k) {
        if (typeof k !== "string" || !k || seen[k]) return false;
        seen[k] = true;
        return true;
      });
      if (list.length) out[iso] = list;
    });
    return out;
  }

  function dismiss(map, today, key) {
    var out = pruneDismissed(map, today);
    var list = (out[today] || []).slice();
    if (list.indexOf(key) < 0) list.push(key);
    out[today] = list;
    return out;
  }

  function undismiss(map, today, key) {
    var out = pruneDismissed(map, today);
    if (!out[today]) return out;
    out[today] = key ? out[today].filter(function (k) { return k !== key; }) : [];
    if (!out[today].length) delete out[today];
    return out;
  }

  function isDismissed(map, today, key) {
    return !!(map && Array.isArray(map[today]) && map[today].indexOf(key) >= 0);
  }

  return {
    SAMPLE_LIMIT: SAMPLE_LIMIT,
    MIN_WEEKDAY: MIN_WEEKDAY,
    SCAN_DAYS: SCAN_DAYS,
    KEEP_DISMISSED: KEEP_DISMISSED,
    LATE_START: LATE_START,
    OPEN_BREAK: OPEN_BREAK,
    LATE_END: LATE_END,
    LONG_DAY: LONG_DAY,
    RECORD_CODES: RECORD_CODES,
    median: median,
    isEnabled: isEnabled,
    hasContent: hasContent,
    trackingStartOf: trackingStartOf,
    collectSamples: collectSamples,
    typicalFromSamples: typicalFromSamples,
    typicalTimes: typicalTimes,
    buildDay: buildDay,
    completeEnd: completeEnd,
    ensureLegalBreak: ensureLegalBreak,
    check: check,
    scan: scan,
    planFill: planFill,
    detect: detect,
    detectDay: detectDay,
    keyOf: keyOf,
    pruneDismissed: pruneDismissed,
    dismiss: dismiss,
    undismiss: undismiss,
    isDismissed: isDismissed
  };
});
