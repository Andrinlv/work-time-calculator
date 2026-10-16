/* ==========================================================================
   ZEITKONTO — Ansicht „Heute“
   --------------------------------------------------------------------------
   Der Arbeitsplatz der App, in zwei Teilen:

   1. ZK.TodayState — die Zustandslogik ohne DOM: In welcher Phase steckt der
      Tag, welche Stempeltaste passt, wann ist Feierabend, was zeigt der Ring,
      was ändert ein Stempel am Datensatz. Läuft auch in Node (Tests).

   2. Die Ansicht. Eingabefelder und Ergebnisbereiche werden EINMAL gebaut;
      update() schreibt danach nur noch Texte und Attribute, die sich wirklich
      geändert haben. So springt der Cursor beim Tippen nie heraus, Tooltips
      flackern nicht und kein Klick geht im Sekundentakt verloren.
   ========================================================================== */

/* ==========================================================================
   1 · ZUSTANDSLOGIK
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../core/time.js"), require("../../core/rules.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.TodayState = factory(root.ZK.Time, root.ZK.Rules);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R) {
  "use strict";

  /**
   * Was nach Gutschriften (Ferien, Halbtag …) noch gearbeitet werden muss —
   * wie in der Engine von der Gutschrift LAUT TAGESART gerechnet. res.credited
   * kann kleiner sein (ganztägige Absenz mit Stempelzeit ergänzt nur bis zum Soll).
   */
  function neededNet(res) {
    var meta = res.typeMeta || {};
    var factor = typeof res.absenceFactor === "number" ? res.absenceFactor : 1;
    var nominal = meta.credits ? Math.round((res.target || 0) * factor) : (res.credited || 0);
    return Math.max(0, (res.target || 0) - nominal);
  }

  /** „Jetzt“ auf der Zeitachse des Tages — nach Mitternacht einer Nachtschicht +24 h. */
  function nowOnTimeline(res, nowMin) {
    return nowMin + (res && res.overnight ? T.DAY : 0);
  }

  /** Darf gestempelt werden? Halbe Abwesenheiten ja: die andere Hälfte wird gearbeitet. */
  function stampable(res) {
    var meta = res.typeMeta || {};
    if (meta.stampable !== false) return true;
    return !!meta.credits && res.absenceFactor < 1;
  }

  function isOpen(b) {
    return !!b && T.parseHHMM(b.start) !== null && !String(b.end || "").trim();
  }

  /**
   * Laufende Pause als { start: "HH:MM", startTl, minutes, ref } oder null.
   * Die Engine liefert sie als res.openBreak; ein Stand ohne das Feld liest
   * sie aus dem Datensatz — aber nur an einem laufenden Tag. Sonst ist eine
   * offene Pausenzeile ein Erfassungsfehler.
   */
  function openBreak(res, rec, nowTl) {
    var ob = res ? res.openBreak : undefined;
    if (ob === null) return null;
    if (ob === undefined) {
      if (!res || !res.running) return null;
      var list = (rec && rec.breaks) || [];
      for (var i = 0; i < list.length; i++) {
        if (isOpen(list[i])) { ob = { start: list[i].start, ref: list[i].id || null }; break; }
      }
      if (!ob) return null;
    }
    var startTod = T.parseHHMM(ob.start);
    if (startTod === null) return null;
    var anchor = res.startTod === null || res.startTod === undefined ? startTod : res.startTod;
    var startTl = typeof ob.startTl === "number" ? ob.startTl : T.onTimeline(startTod, anchor);
    var minutes = typeof ob.minutes === "number" ? ob.minutes
      : (typeof nowTl === "number" ? Math.max(0, nowTl - startTl) : 0);
    return { start: T.formatHHMM(startTod), startTl: startTl, minutes: minutes, ref: ob.ref || null };
  }

  /** Pause, die in der empfohlenen Gehen-Zeit steckt (Engine-Feld oder hergeleitet). */
  function recommendedBreak(res) {
    if (typeof res.recommendedBreak === "number") return res.recommendedBreak;
    if (res.recommendedLeaveTl === null || res.recommendedLeaveTl === undefined || res.startTl === null) return null;
    return Math.max(0, res.recommendedLeaveTl - res.startTl - neededNet(res));
  }

  /**
   * Feierabend eines laufenden Tages.
   *   leaveTl   — wann das Soll erreicht ist. Liegt die Empfehlung schon hinter
   *               uns, fehlt aber wieder Zeit (eine höhere Pausenstufe greift),
   *               wird ab jetzt neu gerechnet — eine Zeit in der Vergangenheit
   *               neben „Noch 16 min“ widerspricht sich sonst.
   *   shifted   — true, wenn deshalb neu gerechnet wurde
   *   over      — Minuten über dem Soll (nur wenn erreicht)
   *   reachedTl — wann das Soll erreicht wurde: die Empfehlung selbst, sofern
   *               sie hinter uns liegt (danach abgezogene Pflichtpause lässt
   *               „over“ langsamer wachsen als die Uhr)
   */
  function leave(res, nowTl) {
    var base = res.recommendedLeaveTl === undefined ? null : res.recommendedLeaveTl;
    var info = { leaveTl: base, shifted: false, over: 0, reachedTl: null };
    if (!res.running) return info;
    if (res.remaining > 0) {
      if (base === null) {
        info.leaveTl = nowTl + res.remaining;
      } else if (nowTl >= base) {
        info.leaveTl = Math.max(base, nowTl + res.remaining);
        info.shifted = info.leaveTl > base;
      }
    } else {
      info.over = Math.max(0, res.net - neededNet(res));
      info.reachedTl = base !== null && base <= nowTl ? base : nowTl - info.over;
    }
    return info;
  }

  /**
   * Phase des Tages — bestimmt Hero, Stempelleiste und Laufstreifen.
   *   incomplete  vergangener Tag mit Kommen, aber ohne Gehen
   *   running     läuft, Soll noch nicht erreicht
   *   break       läuft, Pause offen
   *   overtime    läuft, Soll erreicht
   *   planned     heute, Gehen ist eingetragen, liegt aber noch vor uns
   *   ended       abgeschlossen
   *   comp        Kompensationstag (aus dem Gleitzeitsaldo)
   *   whatif      heute, noch nicht gekommen: „Wenn du jetzt kommst …“
   *   absence     gutgeschriebener Tag ohne Stempel (Ferien, Feiertag …)
   *   free        kein Soll (Wochenende, unbezahlt frei)
   *   pending     Arbeitstag ohne Eintrag
   * ctx: { isToday, canStamp, openBreak, nowTl }
   */
  function phase(res, ctx) {
    ctx = ctx || {};
    if (res.incomplete) return "incomplete";
    if (res.running) {
      if (ctx.openBreak) return "break";
      return res.remaining > 0 ? "running" : "overtime";
    }
    if (res.complete) {
      var ahead = ctx.isToday && res.endTl !== null && typeof ctx.nowTl === "number" && res.endTl > ctx.nowTl;
      return ahead ? "planned" : "ended";
    }
    if (res.type === "comp") return "comp";
    if (ctx.isToday && ctx.canStamp && neededNet(res) > 0) return "whatif";
    if (res.credited > 0) return "absence";
    if (res.target <= 0) return "free";
    return "pending";
  }

  /* Stempelaktionen: Beschriftung, Symbol, Farbe und was App.stamp() tut */
  var ACTIONS = {
    "in":       { kind: "in",    label: "day.stampIn",    icon: "play",   tone: "go" },
    resume:     { kind: "in",    label: "day.resume",     icon: "play",   tone: "go" },
    out:        { kind: "out",   label: "day.stampOut",   icon: "stop",   tone: "stop" },
    breakStart: { kind: "break", label: "day.startBreak", icon: "coffee", tone: "pause" },
    breakEnd:   { kind: "break", label: "day.endBreak",   icon: "play",   tone: "go" }
  };

  /**
   * Stempelleiste als Zustandsautomat: eine Hauptaktion, höchstens eine
   * Nebenaktion — nie ausgegraute Tasten. null = keine Leiste.
   * ctx: { canStamp, isToday, started }
   */
  function stampActions(ph, ctx) {
    if (!ctx || !ctx.canStamp) return null;
    switch (ph) {
      case "whatif":   return { primary: "in", secondary: null, shifts: true };
      case "running":
      case "overtime": return { primary: "out", secondary: "breakStart" };
      case "break":    return { primary: "breakEnd", secondary: "out" };
      case "planned":  return ctx.started ? { primary: "out", secondary: null } : null;
      case "ended":    return { primary: null, secondary: "resume" };
      case "free":
      case "absence":  return ctx.isToday ? { primary: null, secondary: "in" } : null;
      default:         return null;
    }
  }

  /**
   * Ringanteile (je 0…1): Gutschrift in der Farbe der Tagesart, danach die
   * Arbeit, darüber eine zweite Runde für alles über dem Soll.
   */
  function ring(res, ph) {
    var target = res.target || 0;
    if (ph === "comp") return { credit: 1, work: 0, over: 0, total: 1, reached: true };
    if (target <= 0) {
      var any = res.net > 0 ? 1 : 0;
      return { credit: 0, work: any, over: 0, total: null, reached: any > 0 };
    }
    var credit = Math.min(1, Math.max(0, (res.credited || 0) / target));
    var total = Math.max(0, ((res.net || 0) + (res.credited || 0)) / target);
    return {
      credit: credit,
      work: Math.max(0, Math.min(1, total) - credit),
      over: Math.max(0, Math.min(1, total - 1)),
      total: total,
      reached: total >= 1
    };
  }

  /**
   * Wächst die Arbeitszeit bald nicht mehr mit, obwohl das Soll erreicht ist?
   * Über einer Pausenstufe (z. B. 9 h Arbeit) zieht das Gesetz jede weitere
   * Minute als Pause ab, bis die längere Pause erfüllt ist. Gemessen am
   * ungerundeten Netto, damit eine Rundungsstufe nicht als Stillstand gilt.
   * computeAt(m) liefert das Tagesergebnis in m Minuten.
   * → { inMin } (0 = schon jetzt) oder null
   */
  function plateauAhead(res, computeAt, windowMin) {
    if (!res.running || res.remaining > 0 || typeof computeAt !== "function") return null;
    var base = typeof res.netRaw === "number" ? res.netRaw : res.net;
    var limit = windowMin || 10;
    for (var m = 1; m <= limit; m++) {
      var r = computeAt(m);
      if (!r || !r.running) return null;
      var raw = typeof r.netRaw === "number" ? r.netRaw : r.net;
      if (raw < base + m) return { inMin: m - 1 };
    }
    return null;
  }

  /**
   * Was ein Stempel am Datensatz ändert — als EIN Patch, damit „Rückgängig“
   * den ganzen Schritt zurücknimmt.
   *   kind: "in" | "out" | "break";  nowMin: Minuten seit Mitternacht
   *   opts: { breakLabel, makeId }
   * → { action: "in"|"resume"|"out"|"breakStart"|"breakEnd"|"none", patch, time, … }
   */
  function stampPatch(rec, kind, nowMin, opts) {
    opts = opts || {};
    rec = rec || {};
    var nowStr = T.formatHHMM(nowMin);
    var start = T.parseHHMM(rec.start);
    var end = T.parseHHMM(rec.end);
    var breaks = (rec.breaks || []).map(function (b) { return Object.assign({}, b); });
    var open = -1;
    for (var i = 0; i < breaks.length; i++) {
      if (isOpen(breaks[i])) { open = i; break; }
    }
    function newBreak(s, e) {
      return {
        id: opts.makeId ? opts.makeId() : "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        label: opts.breakLabel || "",
        start: s, end: e, paid: false
      };
    }

    if (kind === "in") {
      if (start === null) return { action: "in", patch: { start: nowStr }, time: nowStr };
      if (end === null) return { action: "none", reason: "in", time: rec.start };
      /* Schon gegangen und wieder da: die Lücke wird zur Pause, der Tag läuft
         weiter. Liegt Gehen noch vor uns (geplanter Tag) oder sind es mehr als
         12 h, ist es kein Weiterarbeiten. */
      var endTl = T.onTimeline(end, start);
      var nowTl = T.onTimeline(nowMin, start);
      var gap = nowTl - endTl;
      if (nowMin < start || gap < 0 || gap >= 12 * 60) return { action: "none", reason: "in", time: rec.start };
      var patch = { end: "" };
      if (gap > 0) { breaks.push(newBreak(rec.end, nowStr)); patch.breaks = breaks; }
      return { action: "resume", patch: patch, gap: gap, time: nowStr };
    }

    if (kind === "out") {
      if (start === null) return stampPatch(rec, "in", nowMin, opts);
      /* Gehen während einer Pause: die Pause endet in derselben Minute —
         sonst zählt die Pausenzeit als Arbeit. */
      var outPatch = { end: nowStr };
      if (open >= 0) {
        breaks[open].end = nowStr;
        outPatch.breaks = breaks;
      }
      return { action: "out", patch: outPatch, closedBreak: open >= 0, time: nowStr };
    }

    if (kind === "break") {
      if (open >= 0) {
        breaks[open].end = nowStr;
        var bs = T.parseHHMM(breaks[open].start);
        return {
          action: "breakEnd", patch: { breaks: breaks }, time: nowStr,
          minutes: T.intervalMinutes(bs, nowMin, start !== null ? start : bs)
        };
      }
      if (start !== null && end !== null) return { action: "none", reason: "out", time: rec.end };
      breaks.push(newBreak(nowStr, ""));
      var brPatch = { breaks: breaks };
      if (start === null) brPatch.start = nowStr;
      return { action: "breakStart", patch: brPatch, stampedIn: start === null, time: nowStr };
    }

    return { action: "none", reason: "unknown", time: nowStr };
  }

  return {
    ACTIONS: ACTIONS,
    neededNet: neededNet,
    nowOnTimeline: nowOnTimeline,
    stampable: stampable,
    openBreak: openBreak,
    recommendedBreak: recommendedBreak,
    leave: leave,
    phase: phase,
    stampActions: stampActions,
    ring: ring,
    plateauAhead: plateauAhead,
    stampPatch: stampPatch
  };
});

/* ==========================================================================
   2 · ANSICHT
   ========================================================================== */
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;   // in Node nur die Logik oben
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n, S = ZK.TodayState;
  var SVG_NS = "http://www.w3.org/2000/svg";

  (ZK.Views = ZK.Views || {}).today = { render: render, flush: flushPending };

  /* ---------------------------------------------------------------------- */
  /* Verzögerte Eingaben (Notiz, Pausenbezeichnung)                          */
  /* ---------------------------------------------------------------------- */
  /* Getippt wird verzögert gespeichert — aber nichts darf verloren gehen:
     beim Verlassen des Felds, beim Schliessen/Neuladen der Seite, vor jedem
     Stempel und vor dem nächsten Aufbau der Ansicht wird sofort gesichert. */
  var pending = [];
  var activeApp = null;
  var lifecycleBound = false;

  function deferred(fn, wait) {
    var timer = null;
    function run() {
      timer = null;
      var i = pending.indexOf(api);
      if (i >= 0) pending.splice(i, 1);
      fn();
    }
    function api() {
      clearTimeout(timer);
      timer = setTimeout(run, wait);
      if (pending.indexOf(api) < 0) pending.push(api);
    }
    api.flush = function () { if (timer !== null) { clearTimeout(timer); run(); } };
    api.cancel = function () {
      clearTimeout(timer);
      timer = null;
      var i = pending.indexOf(api);
      if (i >= 0) pending.splice(i, 1);
    };
    return api;
  }

  function flushPending() {
    pending.slice().forEach(function (fn) { fn.flush(); });
  }

  function bindLifecycle() {
    if (lifecycleBound) return;
    lifecycleBound = true;
    function saveNow() {
      flushPending();
      if (activeApp && activeApp.store && activeApp.store.flush) activeApp.store.flush();
    }
    root.addEventListener("pagehide", saveNow);
    root.addEventListener("beforeunload", saveNow);
    document.addEventListener("visibilitychange", function () {
      var hidden = document.visibilityState === "hidden";
      // Der pulsierende Punkt ruht, solange niemand hinsieht
      document.documentElement.classList.toggle("zk-hidden", hidden);
      if (hidden) saveNow();
    });
    // Ctrl/⌘+S („Speichern erzwingen“) soll auch angefangene Eingaben erfassen
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key || "").toLowerCase() === "s") flushPending();
    }, true);
  }

  /* ---------------------------------------------------------------------- */
  /* Kleine DOM-Helfer: nur schreiben, was sich geändert hat                 */
  /* ---------------------------------------------------------------------- */
  function setText(node, value) {
    value = value === null || value === undefined ? "" : String(value);
    if (node.textContent !== value) node.textContent = value;
  }
  function setHTML(node, html) {
    if (node.__zkHtml !== html) { node.__zkHtml = html; node.innerHTML = html; }
  }
  function setHidden(node, hidden) {
    hidden = !!hidden;
    if (node.hidden !== hidden) node.hidden = hidden;
  }
  function setAttr(node, name, value) {
    value = String(value);
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function setClassName(node, cls) {
    if (node.getAttribute("class") !== cls) node.setAttribute("class", cls);
  }
  function setStyle(node, prop, value) {
    if (node.style[prop] !== value) node.style[prop] = value;
  }
  function setVar(node, name, value) {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  function render(host, App) {
    flushPending();
    activeApp = App;
    bindLifecycle();

    var iso = App.date;
    var refs = {};
    var shown = {};          // zuletzt gezeichnete Schlüssel (Stempelleiste, Stunden, Hinweise)
    var shifts = App.settings().shiftTemplates || [];

    /* ---------------------------------------------------------------- */
    /* Kopf: Datumsnavigation                                            */
    /* ---------------------------------------------------------------- */
    var head = D.el("div.view-head.today-head");
    var nav = D.el("div.daynav");

    var prev = D.el("button.btn.icon", { type: "button", "aria-label": I.t("kbd.prevDay"), html: D.icon("left") });
    prev.addEventListener("click", function () { App.shiftDate(-1); });

    /* Das native Datumsfeld liegt unsichtbar über der Schaltfläche: moderne
       Browser öffnen es per showPicker(), ältere bekommen den Tipp direkt. */
    var pick = D.el("div.date-pick");
    var weekday = T.weekdayOf(iso);
    var dateBtn = D.el("button.date-btn", { type: "button" });
    dateBtn.innerHTML =
      '<span class="db-text">' +
      '<span class="dow"><span class="l">' + D.esc(I.weekdayName(weekday, "long")) + " · " + D.esc(I.t("week.kw", { n: T.isoWeek(iso) })) + "</span>" +
      '<span class="s">' + D.esc(I.weekdayName(weekday, "long")) + "</span></span>" +
      '<span class="dt"><span class="l">' + D.esc(I.formatDate(iso)) + "</span>" +
      '<span class="s">' + D.esc(I.formatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" })) + "</span></span>" +
      "</span>" + D.icon("calendar");
    var picker = D.el("input.date-input", { type: "date", value: iso, tabindex: "-1", "aria-label": I.t("common.day") });
    picker.addEventListener("change", function () {
      if (picker.value && picker.value !== iso) App.setDate(picker.value);
    });
    var canShowPicker = typeof picker.showPicker === "function";
    if (!canShowPicker) pick.classList.add("tap-native");
    dateBtn.addEventListener("click", function () {
      if (canShowPicker) {
        try { picker.showPicker(); return; } catch (e) { /* weiter mit Fokus */ }
      }
      try { picker.focus(); picker.click(); } catch (e2) { /* kein Datumswähler verfügbar */ }
    });
    pick.appendChild(dateBtn);
    pick.appendChild(picker);

    var next = D.el("button.btn.icon", { type: "button", "aria-label": I.t("kbd.nextDay"), html: D.icon("right") });
    next.addEventListener("click", function () { App.shiftDate(1); });

    nav.appendChild(prev);
    nav.appendChild(pick);
    nav.appendChild(next);
    if (iso !== T.todayISO()) {
      var todayBtn = D.el("button.btn.sm.today-btn", { type: "button", text: I.t("common.today") });
      todayBtn.addEventListener("click", function () { App.setDate(T.todayISO()); });
      nav.appendChild(todayBtn);
    }

    var headActions = D.el("div.row.tight.head-actions");
    var tplBtn = D.el("button.btn.sm", {
      type: "button", "aria-label": I.t("day.template"),
      html: D.icon("zap") + '<span class="lbl-long">' + D.esc(I.t("day.template")) + "</span>" +
        '<span class="lbl-short">' + D.esc(I.t("day.templateShort")) + "</span>"
    });
    tplBtn.addEventListener("click", applyTemplate);
    var copyBtn = D.el("button.btn.sm", {
      type: "button", "aria-label": I.t("day.copyPrevious"),
      html: D.icon("copy") + '<span class="lbl-long">' + D.esc(I.t("day.copyPrevious")) + "</span>" +
        '<span class="lbl-short">' + D.esc(I.t("day.copyPreviousShort")) + "</span>"
    });
    copyBtn.addEventListener("click", function () { flushPending(); App.copyPreviousDay(); });
    var clearBtn = D.el("button.btn.sm.ghost.clear-day", { type: "button", "aria-label": I.t("day.clearDay"), "data-tip": I.t("day.clearDay"), html: D.icon("trash") });
    clearBtn.addEventListener("click", function () { flushPending(); App.confirmClearDay(); });
    headActions.appendChild(tplBtn);
    headActions.appendChild(copyBtn);
    headActions.appendChild(clearBtn);

    head.appendChild(nav);
    head.appendChild(headActions);
    host.appendChild(head);

    /* ---------------------------------------------------------------- */
    /* Hero                                                              */
    /* ---------------------------------------------------------------- */
    var hero = D.el("section.hero.mb-4", { "aria-label": I.t("day.title") });

    var ringWrap = D.el("div.ring-wrap");
    refs.ring = buildRing(230, 16);
    refs.ringCenter = D.el("div.ring-center");
    refs.ringBig = D.el("span.big");
    refs.ringPct = D.el("span.pct");
    refs.ringCap = D.el("span.cap");
    refs.ringCenter.appendChild(refs.ringBig);
    refs.ringCenter.appendChild(refs.ringPct);
    refs.ringCenter.appendChild(refs.ringCap);
    ringWrap.appendChild(refs.ring.svg);
    ringWrap.appendChild(refs.ringCenter);

    var heroMain = D.el("div.hero-main");
    refs.heroEyebrow = D.el("div.hero-eyebrow");
    refs.ebDot = D.el("span.hero-dot", { hidden: true });
    refs.ebText = D.el("span.eb-text");
    refs.heroEyebrow.appendChild(refs.ebDot);
    refs.heroEyebrow.appendChild(refs.ebText);

    refs.heroTime = D.el("div.hero-time");
    refs.htMain = D.el("span.ht-main.mono");
    refs.htUnit = D.el("span.unit", { hidden: true });
    refs.htTag = D.el("span.tag.warn", { hidden: true });
    refs.heroTime.appendChild(refs.htMain);
    refs.heroTime.appendChild(refs.htTag);
    refs.heroTime.appendChild(refs.htUnit);

    refs.heroNote = D.el("div.hero-note", { "aria-live": "polite" });

    /* Vergangener Tag ohne Gehen: direkt hier nachtragen */
    refs.fix = D.el("div.hero-fix", { hidden: true });
    refs.fixInput = D.el("input.input.time", { type: "text", placeholder: "--:--", "aria-label": I.t("day.clockOut") });
    D.attachTimeInput(refs.fixInput, null);
    var fixBtn = D.el("button.btn.primary", { type: "button", html: D.icon("check") + "<span>" + D.esc(I.t("day.setEnd")) + "</span>" });
    fixBtn.addEventListener("click", commitFix);
    refs.fixInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); refs.fixInput.blur(); commitFix(); }
    });
    refs.fix.appendChild(refs.fixInput);
    refs.fix.appendChild(fixBtn);

    /* Heute, während die Nachtschicht vom Vortag noch läuft */
    refs.shiftLink = D.el("button.btn.sm.shift-link", { type: "button", hidden: true, html: D.icon("left") + "<span>" + D.esc(I.t("day.toShift")) + "</span>" });
    refs.shiftLink.addEventListener("click", function () {
      if (App.activeStampDate) App.setDate(App.activeStampDate());
    });

    refs.strip = D.el("div.running-strip", { hidden: true });
    refs.stripDot = D.el("span.live-dot");
    refs.stripLabel = D.el("span.rs-label");
    refs.stripTime = D.el("span.t.mono");
    refs.stripRight = D.el("span.rs-right");
    refs.strip.appendChild(refs.stripDot);
    refs.strip.appendChild(refs.stripLabel);
    refs.strip.appendChild(refs.stripTime);
    refs.strip.appendChild(refs.stripRight);

    refs.stampBar = D.el("div.hero-actions.stamp-bar", { hidden: true });
    refs.shiftQuick = D.el("div.shift-quick", { hidden: true });

    heroMain.appendChild(refs.heroEyebrow);
    heroMain.appendChild(refs.heroTime);
    heroMain.appendChild(refs.heroNote);
    heroMain.appendChild(refs.fix);
    heroMain.appendChild(refs.shiftLink);
    heroMain.appendChild(refs.strip);
    heroMain.appendChild(refs.stampBar);
    heroMain.appendChild(refs.shiftQuick);

    hero.appendChild(ringWrap);
    hero.appendChild(heroMain);
    host.appendChild(hero);

    /* ---------------------------------------------------------------- */
    /* Zwei Spalten                                                      */
    /* ---------------------------------------------------------------- */
    var grid = D.el("div.grid-2");
    host.appendChild(grid);

    /* ===== Linke Spalte: Eingaben ===== */
    var inputCard = D.el("section.card.day-input");
    inputCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("day.title")) + "</h2>" }));

    /* Schichtvorlagen — ein Klick füllt Kommen, Gehen und Pause */
    if (shifts.length) {
      var shiftRow = D.el("div.chipset.mb-4");
      shifts.forEach(function (tpl) { shiftRow.appendChild(shiftChip(tpl)); });
      inputCard.appendChild(shiftRow);
    }

    var timeRow = D.el("div.grid-2.mb-4.time-row");
    refs.startInput = timeField(I.t("day.clockIn"), true);
    refs.endInput = timeField(I.t("day.clockOut"), false);
    timeRow.appendChild(refs.startInput.wrap);
    timeRow.appendChild(refs.endInput.wrap);
    inputCard.appendChild(timeRow);

    /* Pausen */
    var breakHead = D.el("div.row.mb-3", { style: { justifyContent: "space-between" } });
    breakHead.appendChild(D.el("div.section-title", { text: I.t("day.breaks"), style: { margin: "0" } }));
    var addBreakBtn = D.el("button.btn.sm", { type: "button", html: D.icon("plus") + "<span>" + D.esc(I.t("day.addBreak")) + "</span>" });
    addBreakBtn.addEventListener("click", function () {
      var s = App.settings();
      var existing = D.qsa(".break-row", refs.breakList).length;
      var defaults = existing === 0 && s.defaultLunch ? s.defaultLunch : { start: "", end: "" };
      addBreakRow({
        id: "b" + Date.now().toString(36),
        label: existing === 0 ? I.t("day.lunch") : I.t("day.break"),
        start: defaults.start || "",
        end: defaults.end || "",
        paid: false
      }, true);
      persistBreaks();
      update();
    });
    breakHead.appendChild(addBreakBtn);
    inputCard.appendChild(breakHead);

    refs.breakList = D.el("div.break-rows");
    inputCard.appendChild(refs.breakList);
    refs.breakEmpty = D.el("p.muted.break-empty");
    inputCard.appendChild(refs.breakEmpty);

    /* Tagesart */
    inputCard.appendChild(D.el("div.divider", { text: I.t("day.type") }));
    refs.typeChips = D.el("div.chipset.mb-3.type-chips");
    inputCard.appendChild(refs.typeChips);

    refs.factorRow = D.el("div.row.mb-3", { hidden: true });
    var factorSelect = D.el("select.select", { style: { maxWidth: "180px" }, "aria-label": I.t("day.factor") });
    [[1, "100 %"], [0.5, "50 % · " + I.t("day.halfDay")], [0.25, "25 %"], [0.75, "75 %"]].forEach(function (o) {
      factorSelect.appendChild(D.el("option", { value: o[0], text: o[1] }));
    });
    factorSelect.addEventListener("change", function () {
      App.saveDayQuiet(iso, { absenceFactor: parseFloat(factorSelect.value) });
      update();
    });
    refs.factorSelect = factorSelect;
    refs.factorRow.appendChild(D.el("span.muted", { text: I.t("day.factor"), style: { fontSize: "12px", fontWeight: "700" } }));
    refs.factorRow.appendChild(factorSelect);
    inputCard.appendChild(refs.factorRow);

    /* Ort */
    inputCard.appendChild(D.el("div.section-title", { text: I.t("day.location") }));
    refs.locChips = D.el("div.chipset.mb-4");
    R.LOCATIONS.forEach(function (loc) {
      var chip = D.el("button.chip", {
        type: "button", "data-loc": loc,
        html: D.icon(loc === "home" ? "home" : loc === "field" ? "pin" : loc === "travel" ? "plane" : "briefcase") +
          "<span>" + D.esc(I.t("loc." + loc)) + "</span>"
      });
      chip.addEventListener("click", function () {
        App.saveDayQuiet(iso, { location: loc });
        update();
      });
      refs.locChips.appendChild(chip);
    });
    inputCard.appendChild(refs.locChips);

    /* Notiz */
    var noteField = D.el("div.field");
    noteField.appendChild(D.el("label", { for: "dayNote", text: I.t("day.note") }));
    refs.note = D.el("textarea.textarea#dayNote", { placeholder: I.t("day.notePlaceholder"), rows: 2 });
    var saveNote = deferred(function () {
      App.saveDayQuiet(iso, { note: refs.note.value });
    }, 400);
    refs.note.addEventListener("input", saveNote);
    refs.note.addEventListener("blur", saveNote.flush);
    noteField.appendChild(refs.note);
    inputCard.appendChild(noteField);

    /* Abweichende Sollzeit */
    var overrideDetails = D.el("details", { style: { marginTop: "14px" } });
    overrideDetails.appendChild(D.el("summary", {
      text: I.t("day.targetOverride"),
      style: { fontSize: "12px", fontWeight: "700", color: "var(--ink-3)", cursor: "pointer" }
    }));
    var ovWrap = D.el("div.row.mt-3");
    refs.override = D.el("input.input", { type: "text", placeholder: I.t("day.overridePlaceholder"), "aria-label": I.t("day.targetOverride"), style: { maxWidth: "140px" } });
    refs.override.addEventListener("change", function () {
      var v = refs.override.value.trim();
      App.saveDayQuiet(iso, { targetOverride: v ? T.parseDuration(v) : null });
      update();
    });
    var ovClear = D.el("button.btn.sm.ghost", { type: "button", text: I.t("common.reset") });
    ovClear.addEventListener("click", function () {
      refs.override.value = "";
      App.saveDayQuiet(iso, { targetOverride: null });
      update();
    });
    ovWrap.appendChild(refs.override);
    ovWrap.appendChild(ovClear);
    overrideDetails.appendChild(ovWrap);
    inputCard.appendChild(overrideDetails);

    grid.appendChild(inputCard);

    /* ===== Rechte Spalte: Ergebnisse ===== */
    var resultCol = D.el("div.col");

    var kpiCard = D.el("section.card");
    kpiCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("nav.today")) + "</h2>" }));
    refs.kpiGrid = D.el("div.grid-2");
    kpiCard.appendChild(refs.kpiGrid);
    refs.kpis = [kpiNode(), kpiNode(), kpiNode(), kpiNode()];
    resultCol.appendChild(kpiCard);

    var tlCard = D.el("section.card");
    tlCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("day.timeline")) + "</h2>" }));
    refs.timeline = D.el("div.timeline");
    refs.tlHours = D.el("div.tl-layer");
    refs.tlSegLayer = D.el("div.tl-layer");
    refs.tlSegs = [];
    refs.tlStart = D.el("div.tl-start", { hidden: true });
    refs.tlTarget = D.el("div.tl-target", { hidden: true });
    refs.tlNow = D.el("div.tl-now", { hidden: true, "data-tip": I.t("common.now") });
    refs.tlEmpty = D.el("div.tl-empty", { hidden: true, text: I.t("common.empty") });
    [refs.tlHours, refs.tlSegLayer, refs.tlStart, refs.tlTarget, refs.tlNow, refs.tlEmpty].forEach(function (n) {
      refs.timeline.appendChild(n);
    });
    tlCard.appendChild(refs.timeline);
    var legend = D.el("div.tl-legend");
    legend.innerHTML =
      '<span><i style="background:var(--brand-500)"></i>' + D.esc(I.t("day.work")) + "</span>" +
      '<span><i style="background:var(--warn)"></i>' + D.esc(I.t("day.break")) + "</span>" +
      '<span><i style="background:var(--chart-plus);width:2px;height:12px;border-radius:0"></i>' + D.esc(I.t("day.recommendedLeave")) + "</span>" +
      '<span><i style="background:var(--minus);width:2px;height:12px;border-radius:0"></i>' + D.esc(I.t("common.now")) + "</span>";
    tlCard.appendChild(legend);
    resultCol.appendChild(tlCard);

    refs.warnCard = D.el("section.card");
    resultCol.appendChild(refs.warnCard);

    grid.appendChild(resultCol);

    /* ---------------------------------------------------------------- */
    /* Eingabefelder mit Daten füllen                                    */
    /* ---------------------------------------------------------------- */
    var rec = App.record(iso);
    var breakSource = {};    // Zeilen-Id → gespeicherte Pause (unbekannte Felder bleiben erhalten)
    refs.startInput.input.value = rec.start || "";
    refs.endInput.input.value = rec.end || "";
    refs.note.value = rec.note || "";
    refs.override.value = rec.targetOverride ? T.formatDuration(rec.targetOverride, "clock") : "";
    refs.factorSelect.value = String(rec.absenceFactor === undefined ? 1 : rec.absenceFactor);

    D.attachTimeInput(refs.startInput.input, function (value, committed) {
      App.saveDayQuiet(iso, { start: value });
      update();
      if (committed) refreshBreakDurations();
    });
    D.attachTimeInput(refs.endInput.input, function (value) {
      App.saveDayQuiet(iso, { end: value });
      update();
    });

    var saveLabels = deferred(persistBreaks, 350);
    (rec.breaks || []).forEach(function (b) { addBreakRow(b, false); });

    buildTypeChips();
    update();

    /* Takt: angezeigt wird minutengenau, also nur bei neuer Minute rechnen */
    var tickKey = minuteKey();
    App.onTick(function () {
      var key = minuteKey();
      if (key === tickKey) return;
      tickKey = key;
      update();
    });

    /* ================================================================ */
    /* Bausteine                                                         */
    /* ================================================================ */

    function minuteKey() { return T.todayISO() + " " + T.nowMinutes(); }

    /** Pausen, die fürs Gesetz zählen (bezahlte und unbezahlte). */
    function legalBreakOf(res) {
      return typeof res.legalBreak === "number" ? res.legalBreak : res.breakTotal + (res.paidBreakTotal || 0);
    }

    /** Anzeigename einer Schichtvorlage — wie in den Einstellungen (übersetzt,
        auch bei älteren Daten ohne nameKey, solange nicht umbenannt). */
    function shiftName(tpl) {
      var labels = ZK.Views.settings && ZK.Views.settings.labels;
      if (labels && labels.shiftName) return labels.shiftName(tpl);
      var key = tpl.nameKey;
      return key && I.t(key) !== key ? I.t(key) : tpl.name;
    }

    function shiftChip(tpl, small) {
      var chip = D.el("button.chip" + (small ? ".sm" : ""), {
        type: "button",
        "data-tip": tpl.start + "–" + tpl.end,
        html: D.icon("zap") + "<span>" + D.esc(shiftName(tpl)) + "</span>"
      });
      chip.addEventListener("click", function () { applyShift(tpl); });
      return chip;
    }

    function timeField(label, required) {
      var wrap = D.el("div.field");
      var id = "tf_" + label.replace(/\W/g, "");
      wrap.appendChild(D.el("label", {
        for: id,
        html: "<span>" + D.esc(label) + "</span><span class='tag mono'>HH:MM</span>"
      }));
      var input = D.el("input.input.time.big", {
        type: "text", id: id, placeholder: "--:--",
        "aria-required": required ? "true" : null
      });
      wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }

    function buildRing(size, stroke) {
      var r1 = (size - stroke) / 2;
      var r2 = r1 - stroke - 6;
      var c1 = 2 * Math.PI * r1;
      var c2 = 2 * Math.PI * r2;
      var svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 " + size + " " + size);
      svg.setAttribute("class", "chart hero-ring");
      svg.setAttribute("role", "img");
      function circle(r, width, cls, circ) {
        var n = document.createElementNS(SVG_NS, "circle");
        n.setAttribute("cx", size / 2);
        n.setAttribute("cy", size / 2);
        n.setAttribute("r", r);
        n.setAttribute("fill", "none");
        n.setAttribute("class", cls);
        n.setAttribute("stroke-width", width);
        if (circ) {
          n.setAttribute("stroke-dasharray", circ.toFixed(1));
          n.setAttribute("stroke-dashoffset", circ.toFixed(1));
        }
        svg.appendChild(n);
        return n;
      }
      circle(r1, stroke, "ring-track");
      var credit = circle(r1, stroke, "ring-arc is-empty", c1);
      var work = circle(r1, stroke, "ring-arc is-empty", c1);
      var over = circle(r1, stroke, "ring-arc ring-over is-empty", c1);
      circle(r2, stroke - 5, "ring-track");
      var brk = circle(r2, stroke - 5, "ring-arc is-empty", c2);
      return { svg: svg, credit: credit, work: work, over: over, brk: brk, c1: c1, c2: c2 };
    }

    /** Bogen setzen: Anteil `frac`, beginnend bei `startFrac` (je 0…1). */
    function setArc(node, circ, frac, startFrac, color) {
      frac = Math.max(0, Math.min(1, frac || 0));
      setAttr(node, "stroke-dashoffset", (circ * (1 - frac)).toFixed(1));
      setStyle(node, "transform", "rotate(" + round3(-90 + (startFrac || 0) * 360) + "deg)");
      if (color) setStyle(node, "stroke", color);
      // Runde Linienenden zeichnen auch bei Länge 0 einen Punkt
      node.classList.toggle("is-empty", frac < 0.002);
    }

    function kpiNode() {
      var node = D.el("div.kpi");
      var t = D.el("div.k-title"), v = D.el("div.k-val.mono"), s = D.el("div.k-sub");
      node.appendChild(t);
      node.appendChild(v);
      node.appendChild(s);
      refs.kpiGrid.appendChild(node);
      return { node: node, t: t, v: v, s: s };
    }

    function setKpi(k, title, value, sub, tone, wordy) {
      setText(k.t, title);
      setText(k.v, value);
      setText(k.s, sub);
      setHidden(k.s, !sub);
      setClassName(k.node, "kpi" + (tone ? " accent-" + tone : ""));
      setClassName(k.v, "k-val " + (wordy ? "k-word" : "mono") +
        (tone === "plus" ? " tone-plus" : tone === "minus" ? " tone-minus" : ""));
    }

    function addBreakRow(data, focus) {
      var id = data.id || ("b" + Math.random().toString(36).slice(2, 8));
      breakSource[id] = data;
      var row = D.el("div.break-row", { "data-id": id });

      var labelInput = D.el("input.input.break-label", { type: "text", value: data.label || "", placeholder: I.t("day.label"), "aria-label": I.t("day.label") });
      var startInput = D.el("input.input.time.break-start", { type: "text", value: data.start || "", placeholder: "--:--", "aria-label": I.t("day.start") });
      var endInput = D.el("input.input.time.break-end", { type: "text", value: data.end || "", placeholder: "--:--", "aria-label": I.t("day.end") });
      var dur = D.el("div.dur.mono", { text: "–" });
      var paid = D.el("button.paid-toggle", {
        type: "button",
        "aria-pressed": data.paid ? "true" : "false",
        "data-tip": I.t("day.paidHint"),
        html: D.icon("check") + "<span>" + D.esc(I.t("day.paid")) + "</span>"
      });
      var del = D.el("button.btn.sm.ghost.del", { type: "button", "aria-label": I.t("common.remove"), html: D.icon("x") });

      row.appendChild(labelInput);
      row.appendChild(startInput);
      row.appendChild(endInput);
      row.appendChild(dur);
      row.appendChild(paid);
      row.appendChild(del);

      labelInput.addEventListener("input", saveLabels);
      labelInput.addEventListener("blur", saveLabels.flush);
      D.attachTimeInput(startInput, function () { persistBreaks(); update(); });
      D.attachTimeInput(endInput, function () { persistBreaks(); update(); });
      paid.addEventListener("click", function () {
        paid.setAttribute("aria-pressed", paid.getAttribute("aria-pressed") === "true" ? "false" : "true");
        persistBreaks();
        update();
      });
      del.addEventListener("click", function () {
        row.style.opacity = "0";
        row.style.transform = "translateX(-10px)";
        row.style.transition = "all .18s ease";
        setTimeout(function () {
          if (row.parentNode) row.parentNode.removeChild(row);
          persistBreaks();
          update();
        }, 180);
      });

      refs.breakList.appendChild(row);
      if (focus) setTimeout(function () { startInput.focus(); }, 40);
      return row;
    }

    function collectBreaks() {
      return D.qsa(".break-row", refs.breakList).map(function (row) {
        var id = row.dataset.id;
        return Object.assign({}, breakSource[id] || {}, {
          id: id,
          label: D.qs(".break-label", row).value,
          start: D.qs(".break-start", row).value,
          end: D.qs(".break-end", row).value,
          paid: D.qs(".paid-toggle", row).getAttribute("aria-pressed") === "true"
        });
      });
    }

    function persistBreaks() {
      saveLabels.cancel();
      App.saveDayQuiet(iso, { breaks: collectBreaks() });
    }

    function refreshBreakDurations() {
      var anchor = T.parseHHMM(refs.startInput.input.value);
      D.qsa(".break-row", refs.breakList).forEach(function (row) {
        var s = T.parseHHMM(D.qs(".break-start", row).value);
        var e = T.parseHHMM(D.qs(".break-end", row).value);
        var node = D.qs(".dur", row);
        if (s === null || e === null) { setText(node, "–"); return; }
        setText(node, App.fmt(T.intervalMinutes(s, e, anchor !== null ? anchor : s)));
      });
    }

    function buildTypeChips() {
      D.clear(refs.typeChips);
      ["work", "vacation", "comp", "sick", "accident", "holiday", "training", "military", "unpaid", "free"].forEach(function (key) {
        var meta = R.dayType(key);
        var chip = D.el("button.chip", {
          type: "button", "data-type": key,
          html: '<i class="swatch" style="--c:' + meta.color + '"></i><span>' + D.esc(I.t("type." + key)) + "</span>"
        });
        chip.addEventListener("click", function () {
          var current = App.record(iso).type;
          App.saveDayQuiet(iso, { type: current === key ? null : key });
          update();
        });
        refs.typeChips.appendChild(chip);
      });
    }

    /** Schichtvorlage auf den angezeigten Tag übertragen. */
    function applyShift(tpl) {
      flushPending();
      var breaks = [];
      if (tpl.breakStart && tpl.breakEnd) {
        breaks.push({
          id: "sh" + Date.now().toString(36),
          label: I.t("day.break"),
          start: tpl.breakStart,
          end: tpl.breakEnd,
          paid: !!tpl.breakPaid
        });
      }
      App.saveDay(iso, { start: tpl.start, end: tpl.end, breaks: breaks, type: null });
      D.toast(shiftName(tpl), {
        sub: tpl.start + " – " + tpl.end,
        icon: "zap",
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
    }

    function applyTemplate() {
      flushPending();
      var s = App.settings();
      var start = App.record(iso).start || "08:00";
      var lunch = s.defaultLunch || { start: "12:00", end: "12:30" };
      var breaks = lunch.start && lunch.end
        ? [{ id: "tpl" + Date.now().toString(36), label: I.t("day.lunch"), start: lunch.start, end: lunch.end, paid: false }]
        : [];
      /* Gehen = kleinste Anwesenheit, nach der das Soll netto erreicht ist —
         derselbe Löser wie in der Engine, inkl. Pausenstaffel und Rundung.
         Das Mittag zählt, soweit es in dieser Anwesenheit liegt. */
      var startMin = T.parseHHMM(start);
      var ls = breaks.length ? T.onTimeline(T.parseHHMM(lunch.start), startMin) : null;
      var le = breaks.length ? T.onTimeline(T.parseHHMM(lunch.end), startMin) : null;
      if (le !== null && le < ls) le += T.DAY;
      // Die Vorlage setzt die Tagesart zurück — also das Soll eines normalen Tages
      var plain = ZK.Engine.computeDay(Object.assign({}, App.record(iso), { type: null, start: "", end: "", breaks: [] }), {
        settings: s, holiday: App.holiday(iso), isToday: false
      });
      var sol = R.presenceForNet(S.neededNet(plain), s, function (g) {
        var inside = ls === null ? 0 : Math.max(0, Math.min(le, startMin + g) - Math.max(ls, startMin));
        return { unpaid: inside, paid: 0 };
      });
      var end = T.formatHHMM(startMin + sol.gross);

      App.saveDay(iso, { start: start, end: end, breaks: breaks, type: null });
      D.toast(I.t("day.template"), {
        sub: start + " – " + end,
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
    }

    /** Gehen für einen vergangenen, unvollständigen Tag nachtragen. */
    function commitFix() {
      var mins = T.parseHHMM(refs.fixInput.value);
      if (mins === null) {
        refs.fixInput.classList.add("invalid");
        refs.fixInput.focus();
        return;
      }
      var value = T.formatHHMM(mins);
      App.saveDay(iso, { end: value });
      D.toast(I.t("toast.saved"), {
        sub: I.t("day.clockOut") + " " + value,
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
    }

    /** Was wäre, wenn jetzt gestempelt würde? (gleiche Engine, Kommen = jetzt) */
    function whatIf(nowMin) {
      var draft = Object.assign({}, App.record(iso), { start: T.formatHHMM(nowMin), end: "" });
      return ZK.Engine.computeDay(draft, { settings: App.settings(), holiday: App.holiday(iso), isToday: true });
    }

    /** Tagesergebnis in `offset` Minuten — für die Warnung vor der nächsten Pausenstufe. */
    function dayAt(offset) {
      return ZK.Engine.computeDay(App.record(iso), {
        settings: App.settings(),
        holiday: App.holiday(iso),
        isToday: iso === T.todayISO(),
        now: new Date(Date.now() + offset * 60000)
      });
    }

    /* ================================================================ */
    /* Aktualisierung                                                    */
    /* ================================================================ */
    function update() {
      var res = App.day(iso);
      var rec2 = App.record(iso);
      var nowMin = T.nowMinutes();
      var todayIso = T.todayISO();
      var active = App.activeStampDate ? App.activeStampDate() : todayIso;
      var nowTl = S.nowOnTimeline(res, nowMin);
      var ob = S.openBreak(res, rec2, nowTl);
      var c = {
        res: res,
        rec: rec2,
        ob: ob,
        nowMin: nowMin,
        nowTl: nowTl,
        isToday: iso === todayIso,
        active: active,
        canStamp: iso === active && S.stampable(res),
        need: S.neededNet(res)
      };
      c.ph = S.phase(res, { isToday: c.isToday, canStamp: c.canStamp, openBreak: ob, nowTl: nowTl });
      c.lv = S.leave(res, nowTl);

      updateChips(res);
      updateRing(c);
      updateHero(c);
      updateStrip(c);
      updateStamp(c);
      updateKpis(c);
      updateTimeline(c);
      updateWarnings(c);
      refreshBreakDurations();
      updateInputs(c);
    }

    function updateChips(res) {
      D.qsa(".chip", refs.typeChips).forEach(function (chip) {
        setAttr(chip, "aria-pressed", chip.dataset.type === res.type ? "true" : "false");
      });
      D.qsa(".chip", refs.locChips).forEach(function (chip) {
        setAttr(chip, "aria-pressed", chip.dataset.loc === res.location ? "true" : "false");
      });
      setHidden(refs.factorRow, !res.typeMeta.credits || res.type === "holiday");
    }

    /* --- Ring: aussen Sollerfüllung (Gutschrift + Arbeit), innen Pausen --- */
    function updateRing(c) {
      var res = c.res;
      var p = S.ring(res, c.ph);
      var rg = refs.ring;
      var typeColor = res.typeMeta && res.typeMeta.color ? res.typeMeta.color : "var(--chart-mark)";
      setArc(rg.credit, rg.c1, p.credit, 0, typeColor);
      setArc(rg.work, rg.c1, p.work, p.credit, p.reached ? "var(--chart-plus)" : "var(--chart-mark)");
      setArc(rg.over, rg.c1, p.over, 0, null);

      // Innen: erfasste Pause (bezahlte zählen fürs Gesetz mit) gegenüber
      // der Pause, die der Tag verlangt
      var legal = legalBreakOf(res);
      var recBreak = res.running ? S.recommendedBreak(res) : null;
      var want = Math.max(res.requiredBreak || 0, recBreak || 0);
      var brkProgress = want > 0 ? Math.min(1, legal / want) : (legal > 0 ? 1 : 0);
      setArc(rg.brk, rg.c2, brkProgress, 0,
        res.requiredBreak > 0 && legal < res.requiredBreak ? "var(--warn)" : "var(--chart-mark-2)");

      var pctValue = p.total === null ? null : Math.round(p.total * 100);
      setAttr(rg.svg, "aria-label", I.t("day.progress") + " " + (pctValue === null ? "–" : pctValue + " %"));

      var big, cap;
      if (c.ph === "comp") {
        big = App.fmt(res.target);
        cap = I.t("type.comp");
      } else if (res.credited > 0) {
        big = App.fmt(res.net + res.credited);
        cap = res.net > 0 ? I.t("day.inclCredit") : I.t("day.credited");
      } else {
        big = App.fmt(res.net);
        cap = I.t("day.netShort");
      }
      setText(refs.ringBig, big);
      refs.ringBig.classList.toggle("long", big.length > 9);
      var showPct = pctValue !== null && c.ph !== "comp";
      setHTML(refs.ringPct, showPct
        ? "<b>" + pctValue + " %</b> <span class=\"pl\">" + D.esc(I.t("day.progress")) + "</span>"
        : "");
      setHidden(refs.ringPct, !showPct);
      setText(refs.ringCap, cap);
    }

    /* --- Hero --- */
    function heroModel(c) {
      var res = c.res;
      var m = { eyebrow: "", dot: "", dotColor: "", tone: "", time: "--:--", timeTone: "", word: false, dur: false, unit: "", tag: "", note: "", fix: false, link: false };
      function b(v) { return "<b>" + D.esc(v) + "</b>"; }
      // Bezeichnung und Wert bleiben auf einer Zeile
      function pair(label, value) { return D.esc(label) + "&nbsp;" + b(value); }
      function explain(brk, need) {
        return brk === null || brk === undefined ? "" : I.t("day.explain", { breaks: b(App.fmt(brk)), target: b(App.fmt(need)) });
      }
      function offsetTag(off) {
        return off > 0 ? I.t(off > 1 ? "day.nextDays" : "day.nextDay", { n: off }) : "";
      }
      var typeName = App.typeLabel(res.type) +
        (res.typeMeta.credits && res.absenceFactor < 1 ? " · " + Math.round(res.absenceFactor * 100) + " %" : "");
      var holidayName = res.holiday ? (res.holiday.names && res.holiday.names[I.getLang()]) || res.holiday.name : "";

      switch (c.ph) {
        case "whatif":
          var w = whatIf(c.nowMin);
          m.eyebrow = I.t("day.whatIf");
          m.time = w.recommendedLeave || "--:--";
          m.tag = offsetTag(w.recommendedLeaveDayOffset);
          m.note = explain(S.recommendedBreak(w), c.need);
          if (res.credited > 0) {
            m.note += " " + D.esc(typeName) + ": " + b(App.fmt(res.credited)) + " " + D.esc(I.t("day.creditedUnit")) + ".";
          }
          break;

        case "running":
        case "break":
          m.eyebrow = I.t("day.recommendedLeave");
          m.dot = c.ph === "break" ? "break" : "live";
          m.time = c.lv.leaveTl === null ? "--:--" : T.formatHHMM(c.lv.leaveTl);
          m.tag = c.lv.leaveTl === null ? "" : offsetTag(T.dayOffsetOf(c.lv.leaveTl));
          m.note = c.lv.shifted
            ? I.t("day.tierShift", { req: b(App.fmt(res.requiredBreak)), time: b(m.time) })
            : explain(S.recommendedBreak(res), c.need);
          break;

        case "overtime":
          m.eyebrow = I.t(c.need > 0 ? "day.goalReached" : "day.noTarget");
          m.dot = "plus";
          m.time = App.fmtSigned(c.lv.over);
          m.timeTone = "plus";
          m.unit = c.need > 0 && c.lv.reachedTl !== null ? I.t("day.sinceTime", { time: T.formatHHMM(c.lv.reachedTl) }) : "";
          var plateau = S.plateauAhead(res, dayAt, 10);
          var st = App.settings();
          var tier = plateau ? R.nextBreakTier(typeof res.workingTime === "number" ? res.workingTime : res.net, st.breakRuleset, st.customBreakTiers) : null;
          m.note = tier
            ? '<span class="tone-warn">' + I.t(plateau.inMin > 0 ? "day.tierAhead" : "day.breakPlateau", {
              v: b(App.fmt(plateau.inMin)), after: b(App.fmt(tier.over)), req: b(App.fmt(tier.require))
            }) + "</span>"
            : D.esc(I.t("day.canLeave"));
          break;

        case "ended":
        case "planned":
          m.eyebrow = I.t("day.balance") + (res.credited > 0 ? " · " + typeName : "");
          m.time = App.fmtSigned(res.balance);
          m.timeTone = res.balance >= 0 ? "plus" : "minus";
          m.unit = App.fmt(res.net + res.credited) + " / " + App.fmt(res.target);
          m.note = pair(I.t("day.presence"), App.fmt(res.presence)) + " · " +
            pair(I.t("day.breakTotal"), App.fmt(res.breakTotal)) +
            (res.autoDeducted
              ? ' <span class="tone-warn">(+' + D.esc(App.fmt(res.autoDeducted)).replace(/ /g, "&nbsp;") + " " + D.esc(I.t("day.requiredBreak")) + ")</span>"
              : "") +
            (res.credited ? " · " + pair(I.t("day.credited"), App.fmt(res.credited)) : "");
          break;

        case "incomplete":
          m.eyebrow = I.t("day.missingEnd");
          m.dot = "minus";
          m.tone = "minus";
          m.timeTone = "mute";
          m.note = D.esc(I.t("day.missingEndHint", { time: res.start }));
          m.fix = true;
          break;

        case "absence":
          m.eyebrow = res.type === "holiday" && holidayName ? typeName + " · " + holidayName : typeName;
          m.dot = "type";
          m.dotColor = res.typeMeta.color;
          m.time = App.fmt(res.credited);
          m.dur = true;
          m.unit = I.t("day.creditedUnit");
          m.note = c.need > 0 ? D.esc(I.t("day.untilGoal", { v: App.fmt(c.need) })) : "";
          break;

        case "comp":
          m.eyebrow = typeName;
          m.dot = "type";
          m.dotColor = res.typeMeta.color;
          m.time = App.fmtSigned(res.balance);
          m.unit = I.t("day.compUnit");
          break;

        case "free":
          m.eyebrow = I.t("day.type");
          m.word = true;
          m.time = App.typeLabel(res.type);
          m.note = D.esc(I.t("day.noTarget"));
          break;

        default:
          m.eyebrow = I.t("day.title");
          m.timeTone = "mute";
          if (c.isToday && c.active !== iso) {
            m.note = D.esc(I.t("day.shiftRunning", { time: App.record(c.active).start || "" }));
            m.link = true;
          } else {
            m.note = D.esc(I.t(res.target > 0 ? "day.enterClockIn" : "day.noTarget"));
          }
      }

      if (res.holiday && !(c.ph === "absence" && res.type === "holiday")) {
        m.note += (m.note ? "<br>" : "") + '<span class="tag info">' + D.esc(I.t("day.holidayName", { name: holidayName })) + "</span>";
      }
      return m;
    }

    function updateHero(c) {
      var m = heroModel(c);
      setAttr(hero, "data-state", c.ph);
      setText(refs.ebText, m.eyebrow);
      setHidden(refs.ebDot, !m.dot);
      setClassName(refs.ebDot, "hero-dot" + (m.dot ? " " + m.dot : ""));
      if (m.dotColor) setVar(refs.ebDot, "--c", m.dotColor);
      setClassName(refs.heroEyebrow, "hero-eyebrow" + (m.tone ? " tone-" + m.tone : ""));

      setText(refs.htMain, m.time);
      setClassName(refs.htMain, "ht-main" + (m.word ? " word" : " mono") + (m.dur ? " dur" : "") + (m.timeTone ? " tone-" + m.timeTone : ""));
      setText(refs.htUnit, m.unit);
      setHidden(refs.htUnit, !m.unit);
      setText(refs.htTag, m.tag);
      setHidden(refs.htTag, !m.tag);

      setHTML(refs.heroNote, m.note);
      setHidden(refs.heroNote, !m.note);
      setHidden(refs.fix, !m.fix);
      setHidden(refs.shiftLink, !m.link);
    }

    /* --- Laufstreifen: Status eines laufenden Tages --- */
    function updateStrip(c) {
      var res = c.res;
      setHidden(refs.strip, !res.running);
      if (!res.running) return;
      var onBreak = c.ph === "break";
      setClassName(refs.strip, "running-strip" + (onBreak ? " on-break" : ""));
      setClassName(refs.stripDot, "live-dot" + (onBreak ? " paused" : ""));
      if (onBreak) {
        setText(refs.stripLabel, I.t("day.breakSince", { time: c.ob.start }));
        setText(refs.stripTime, App.fmt(c.ob.minutes));
        setText(refs.stripRight, I.t("day.countdownPaused") +
          (res.remaining > 0 ? " · " + I.t("day.untilGoal", { v: App.fmt(res.remaining) }) : ""));
      } else {
        setText(refs.stripLabel, I.t("day.running", { time: res.start }));
        setText(refs.stripTime, App.fmt(res.net));
        setText(refs.stripRight, res.remaining > 0
          ? I.t("day.untilGoal", { v: App.fmt(res.remaining) })
          : (c.need > 0 ? I.t("day.goalReached") + " · " + App.fmtSigned(c.lv.over) : I.t("day.noTarget")));
      }
    }

    /* --- Stempelleiste: nur bei Zustandswechsel neu aufbauen --- */
    function updateStamp(c) {
      var started = c.res.startTl !== null && c.nowTl >= c.res.startTl;
      var acts = S.stampActions(c.ph, { canStamp: c.canStamp, isToday: c.isToday, started: started });
      var key = acts ? (acts.primary || "") + "|" + (acts.secondary || "") + "|" + (acts.shifts ? "s" : "") : "";
      if (shown.stamp === key) return;
      shown.stamp = key;

      D.clear(refs.stampBar);
      D.clear(refs.shiftQuick);
      setHidden(refs.stampBar, !acts);
      var withShifts = !!(acts && acts.shifts && shifts.length);
      setHidden(refs.shiftQuick, !withShifts);
      if (!acts) return;

      if (acts.primary) refs.stampBar.appendChild(stampButton(acts.primary, true));
      if (acts.secondary) refs.stampBar.appendChild(stampButton(acts.secondary, false));
      refs.stampBar.classList.toggle("single", !(acts.primary && acts.secondary));

      if (withShifts) {
        refs.shiftQuick.appendChild(D.el("span.sq-label", { text: I.t("day.orShift") }));
        shifts.forEach(function (tpl) { refs.shiftQuick.appendChild(shiftChip(tpl, true)); });
      }
    }

    function stampButton(name, primary) {
      var a = S.ACTIONS[name];
      var btn = D.el("button.stamp-btn." + (primary ? "primary." + a.tone : "secondary.k-" + a.tone), {
        type: "button",
        "data-act": name,
        html: D.icon(a.icon) + "<span>" + D.esc(I.t(a.label)) + "</span>"
      });
      btn.addEventListener("click", function () { App.stamp(a.kind); });
      return btn;
    }

    /* --- Kennzahlen: vier feste Karten, nur Inhalte ändern sich --- */
    function updateKpis(c) {
      var res = c.res;
      var provisional = res.provisional !== undefined ? !!res.provisional : !!res.running;
      var k = refs.kpis;
      setKpi(k[0], I.t("day.net"), App.fmt(res.net),
        res.netRaw !== res.net ? I.t("day.raw", { v: App.fmt(res.netRaw) }) : I.t("day.presenceOf", { v: App.fmt(res.presence) }), "");
      setKpi(k[1], I.t("day.balance"), App.fmtSigned(res.balance),
        (provisional ? I.t("day.provisional") + " · " : "") + I.t("day.target") + " " + App.fmt(res.target),
        provisional ? "" : (res.balance > 0 ? "plus" : res.balance < 0 ? "minus" : ""));
      setKpi(k[2], I.t("day.breakTotal"), App.fmt(res.breakTotal),
        (res.autoDeducted
          ? I.t("day.autoDeductedOf", { v: App.fmt(res.autoDeducted) })
          : I.t("day.requiredBreak") + " " + App.fmt(res.requiredBreak)) +
        (res.paidBreakTotal ? " · " + App.fmt(res.paidBreakTotal) + " " + I.t("day.paid") : ""),
        res.requiredBreak > legalBreakOf(res) ? "warn" : "");
      var showLeave = c.need > 0 && c.lv.leaveTl !== null && !res.incomplete;
      setKpi(k[3], I.t("day.remaining"),
        res.remaining > 0 ? App.fmt(res.remaining) : "✓ " + I.t("day.goalReached"),
        showLeave ? I.t("day.recommendedLeave") + " " + T.formatHHMM(c.lv.leaveTl) : "",
        res.remaining > 0 ? "" : "plus", res.remaining <= 0);
    }

    /* --- Zeitstrahl: Knoten bleiben, nur Lage und Breite wandern --- */
    function updateTimeline(c) {
      var res = c.res;
      var showNow = c.isToday || res.running;
      var from = 5 * 60, to = 23 * 60;
      if (res.startTl !== null) from = Math.min(from, Math.floor(res.startTl / 60) * 60);
      if (res.endTl !== null) to = Math.max(to, Math.ceil(res.endTl / 60) * 60);
      if (c.lv.leaveTl !== null) to = Math.max(to, Math.ceil(c.lv.leaveTl / 60) * 60);
      if (res.running) to = Math.max(to, Math.ceil(c.nowTl / 60) * 60);
      var span = Math.max(60, to - from);
      function pct(v) { return round3(((v - from) / span) * 100); }

      var hourKey = from + "-" + to;
      if (shown.hours !== hourKey) {
        shown.hours = hourKey;
        D.clear(refs.tlHours);
        for (var h = Math.ceil(from / 60) * 60; h <= to; h += 120) {
          var mark = D.el("div.tl-hour", { style: { left: pct(h) + "%" } });
          mark.appendChild(D.el("span", { text: T.formatHHMM(h) }));
          refs.tlHours.appendChild(mark);
        }
      }

      var segs = res.segments.slice();
      // Laufende Pause, die die Engine (noch) nicht als Segment liefert
      if (c.ob && c.nowTl > c.ob.startTl && !segs.some(function (sg) {
        return sg.kind === "break" && sg.start <= c.ob.startTl && sg.end >= c.nowTl - 1;
      })) {
        segs.push({ kind: "break", start: c.ob.startTl, end: c.nowTl });
      }
      // Unvollständiger Tag: wenigstens die bekannten Pausen zeigen
      if (res.incomplete && res.startTod !== null) {
        (c.rec.breaks || []).forEach(function (bk) {
          var bs = T.parseHHMM(bk.start), be = T.parseHHMM(bk.end);
          if (bs === null || be === null) return;
          var s1 = T.onTimeline(bs, res.startTod), e1 = T.onTimeline(be, res.startTod);
          if (e1 < s1) e1 += T.DAY;
          segs.push({ kind: "break", start: s1, end: e1 });
        });
      }

      while (refs.tlSegs.length < segs.length) {
        var node = D.el("div.tl-seg");
        refs.tlSegLayer.appendChild(node);
        refs.tlSegs.push(node);
      }
      while (refs.tlSegs.length > segs.length) {
        var gone = refs.tlSegs.pop();
        if (gone.parentNode) gone.parentNode.removeChild(gone);
      }
      segs.forEach(function (seg, i) {
        var n = refs.tlSegs[i];
        setClassName(n, "tl-seg " + (seg.kind === "break" ? "brk" : "work"));
        setStyle(n, "left", pct(seg.start) + "%");
        setStyle(n, "width", Math.max(0.4, round3(pct(seg.end) - pct(seg.start))) + "%");
        setAttr(n, "data-tip", (seg.kind === "break" ? I.t("day.break") : I.t("day.work")) + " " +
          T.formatHHMM(seg.start) + "–" + T.formatHHMM(seg.end));
      });

      var showStart = res.incomplete && res.startTl !== null;
      setHidden(refs.tlStart, !showStart);
      if (showStart) {
        setStyle(refs.tlStart, "left", pct(res.startTl) + "%");
        setAttr(refs.tlStart, "data-tip", I.t("day.clockIn") + " " + res.start);
      }

      var showTarget = c.need > 0 && c.lv.leaveTl !== null && c.lv.leaveTl <= to && !res.incomplete;
      setHidden(refs.tlTarget, !showTarget);
      if (showTarget) {
        setStyle(refs.tlTarget, "left", pct(c.lv.leaveTl) + "%");
        setAttr(refs.tlTarget, "data-tip", I.t("day.recommendedLeave") + " " + T.formatHHMM(c.lv.leaveTl));
      }

      var nowPos = res.running ? c.nowTl : c.nowMin;
      var nowVisible = showNow && nowPos >= from && nowPos <= to;
      setHidden(refs.tlNow, !nowVisible);
      if (nowVisible) setStyle(refs.tlNow, "left", pct(nowPos) + "%");

      setHidden(refs.tlEmpty, segs.length > 0 || showStart);
    }

    /* --- Hinweise: nur neu zeichnen, wenn sich etwas ändert --- */
    function updateWarnings(c) {
      var res = c.res;
      var list = res.warnings;
      // Engine ohne openBreak-Feld meldet die laufende Pause als unvollständige Zeile
      if (c.ob && res.running && res.openBreak === undefined) {
        list = list.filter(function (w) { return !(w.code === "invalid-break" && (w.count || 1) <= 1); });
      }
      var texts = list.map(function (w) {
        return {
          tone: w.level === "error" ? "minus" : w.level === "warn" ? "warn" : "info",
          icon: w.level === "info" ? "info" : "alert",
          text: I.t("warn." + w.code, {
            v: App.fmt(w.minutes),
            have: App.fmt(res.breakTotal),
            required: App.fmt(w.required || res.requiredBreak),
            count: w.count,
            name: w.name,
            type: w.type ? App.typeLabel(w.type) : ""
          })
        };
      });
      var key = JSON.stringify(texts);
      if (shown.warnings === key) return;
      shown.warnings = key;

      D.clear(refs.warnCard);
      refs.warnCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("warn.title")) + "</h2>" }));
      if (!texts.length) {
        var ok = D.el("div.notice.plus");
        ok.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("warn.allGood")) + "</strong></div>";
        refs.warnCard.appendChild(ok);
        return;
      }
      var box = D.el("div.col", { style: { gap: "8px" } });
      texts.forEach(function (t) {
        var node = D.el("div.notice." + t.tone);
        node.innerHTML = D.icon(t.icon) + "<div>" + D.esc(t.text) + "</div>";
        box.appendChild(node);
      });
      refs.warnCard.appendChild(box);
    }

    /* --- Eingabekarte: Platzhalter und Pausenhinweis passen sich an --- */
    function updateInputs(c) {
      var res = c.res;
      setAttr(refs.endInput.input, "placeholder", res.running ? I.t("day.endRunning") : "--:--");

      D.qsa(".break-row", refs.breakList).forEach(function (row) {
        var isOpenRow = !!(c.ob && c.ob.ref && c.ob.ref === row.dataset.id);
        setAttr(D.qs(".break-end", row), "placeholder", isOpenRow ? I.t("day.endRunning") : "--:--");
        if (isOpenRow) setText(D.qs(".dur", row), App.fmt(c.ob.minutes));
      });

      var hasRows = D.qsa(".break-row", refs.breakList).length > 0;
      // Ohne Stempel nur an Arbeitstagen; abgeschlossen nur, wenn eine Pause Pflicht war
      var relevant = res.startTod !== null
        ? !(res.complete && !res.requiredBreak)
        : (res.target > 0 && !res.credited && res.type !== "comp");
      setHidden(refs.breakEmpty, hasRows || !relevant);
      if (!hasRows && relevant) {
        var s = App.settings();
        var tier = R.nextBreakTier(0, s.breakRuleset, s.customBreakTiers);
        setText(refs.breakEmpty, tier
          ? I.t("day.noBreakYet", { after: App.fmt(tier.over), req: App.fmt(tier.require) })
          : I.t("day.noBreakYetNone"));
      }
    }
  }
})(typeof self !== "undefined" ? self : this);
