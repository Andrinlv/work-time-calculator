/* ==========================================================================
   ZEITKONTO — Mini-Uhr
   --------------------------------------------------------------------------
   Ein schwebendes Fenster mit Feierabend, Countdown und Stempelknopf, das
   über Outlook und Excel sichtbar bleibt (Document Picture-in-Picture,
   Chrome/Edge ab 116 auf dem Desktop). Ohne diese Schnittstelle gibt es
   keinen Knopf — nur die Palette erklärt, warum.

   1. ZK.MiniClock — Logik ohne DOM (läuft auch in Node): was die Mini-Uhr in
      welcher Phase zeigt. Phase, Stempelaktionen und Feierabend kommen aus
      ZK.TodayState, damit Mini-Uhr und „Heute“ nie verschieden ticken.
   2. Oberfläche: mount(host, App) zeichnet in JEDES Dokument — ins
      Mini-Fenster oder, für Tests, in ein gewöhnliches Element. Dazu der
      Knopf in der Kopfzeile und der Befehl in der Palette.
   ========================================================================== */

/* ==========================================================================
   1 · LOGIK
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../core/time.js"), require("../views/today.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.MiniClock = factory(root.ZK.Time, root.ZK.TodayState);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, S) {
  "use strict";

  var STRINGS = {
    de: {
      "mini.title": "Mini-Uhr",
      "mini.open": "Mini-Uhr öffnen",
      "mini.close": "Mini-Uhr schliessen",
      "mini.tip": "Mini-Uhr: Feierabend und Stempelknopf immer im Vordergrund",
      "mini.cmdSub": "Schwebendes Fenster über Outlook und Excel",
      "mini.unsupported": "Nur in Chrome/Edge auf dem Desktop verfügbar",
      "mini.failed": "Die Mini-Uhr liess sich nicht öffnen",
      "mini.left": "Noch",
      "mini.paused": "Pausiert",
      "mini.since": "Seit",
      "mini.ifNow": "Wenn du jetzt kommst",
      "mini.notStarted": "Noch nicht gestartet",
      "mini.leftAt": "Gegangen um {time}",
      "mini.plannedEnd": "Gehen um {time} eingetragen",
      "mini.noAction": "Heute nichts zu stempeln",
      "mini.progress": "Tagessoll",
      "mini.net": "Netto {v}"
    },
    en: {
      "mini.title": "Mini clock",
      "mini.open": "Open mini clock",
      "mini.close": "Close mini clock",
      "mini.tip": "Mini clock: leave time and stamp button, always on top",
      "mini.cmdSub": "Floating window above Outlook and Excel",
      "mini.unsupported": "Only available in Chrome/Edge on desktop",
      "mini.failed": "The mini clock could not be opened",
      "mini.left": "To go",
      "mini.paused": "Paused",
      "mini.since": "Since",
      "mini.ifNow": "If you start now",
      "mini.notStarted": "Not started yet",
      "mini.leftAt": "Clocked out at {time}",
      "mini.plannedEnd": "Clock-out set for {time}",
      "mini.noAction": "Nothing to stamp today",
      "mini.progress": "Daily target",
      "mini.net": "Net {v}"
    },
    fr: {
      "mini.title": "Mini-horloge",
      "mini.open": "Ouvrir la mini-horloge",
      "mini.close": "Fermer la mini-horloge",
      "mini.tip": "Mini-horloge : heure de départ et bouton de pointage, toujours au premier plan",
      "mini.cmdSub": "Fenêtre flottante au-dessus d'Outlook et d'Excel",
      "mini.unsupported": "Disponible uniquement dans Chrome/Edge sur ordinateur",
      "mini.failed": "Impossible d'ouvrir la mini-horloge",
      "mini.left": "Encore",
      "mini.paused": "En pause",
      "mini.since": "Depuis",
      "mini.ifNow": "Si vous arrivez maintenant",
      "mini.notStarted": "Pas encore commencé",
      "mini.leftAt": "Départ à {time}",
      "mini.plannedEnd": "Départ prévu à {time}",
      "mini.noAction": "Rien à pointer aujourd'hui",
      "mini.progress": "Objectif du jour",
      "mini.net": "Net {v}"
    },
    it: {
      "mini.title": "Mini-orologio",
      "mini.open": "Apri il mini-orologio",
      "mini.close": "Chiudi il mini-orologio",
      "mini.tip": "Mini-orologio: ora di uscita e pulsante di timbratura sempre in primo piano",
      "mini.cmdSub": "Finestra mobile sopra Outlook ed Excel",
      "mini.unsupported": "Disponibile solo in Chrome/Edge su desktop",
      "mini.failed": "Impossibile aprire il mini-orologio",
      "mini.left": "Ancora",
      "mini.paused": "In pausa",
      "mini.since": "Dalle",
      "mini.ifNow": "Se entri adesso",
      "mini.notStarted": "Non ancora iniziato",
      "mini.leftAt": "Uscita alle {time}",
      "mini.plannedEnd": "Uscita prevista alle {time}",
      "mini.noAction": "Niente da timbrare oggi",
      "mini.progress": "Obiettivo del giorno",
      "mini.net": "Netto {v}"
    }
  };

  /**
   * Gibt es die Mini-Uhr hier? Nur mit der Schnittstelle, mit Maus/Trackpad
   * und nicht auf dem Handy — ein halber Knopf wäre schlimmer als keiner.
   * env: { api, finePointer, mobile }
   */
  function supported(env) {
    return !!(env && env.api && env.finePointer && !env.mobile);
  }

  /**
   * Restzeit bis Feierabend. Mit Sekunden „2:17:53“, sonst auf die Minute
   * aufgerundet „2:18“ — wie der Countdown im Browser-Tab.
   */
  function formatCountdown(sec, withSeconds) {
    var s = Math.max(0, Math.round(isFinite(sec) ? sec : 0));
    if (!withSeconds) return T.formatDuration(Math.ceil(s / 60), "clock");
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h + ":" + T.pad2(m) + ":" + T.pad2(s % 60);
  }

  /* Suchwörter der Palette, unabhängig von der eingestellten Sprache */
  var WORDS = ["mini", "pip", "uhr", "clock", "horloge", "orologio", "fenster", "window",
    "fenetre", "finestra", "vordergrund", "schwebend", "picture"];

  function fold(text) {
    var s = String(text || "").toLowerCase();
    if (typeof s.normalize === "function") s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s;
  }

  /**
   * Passt die Palettensuche zur Mini-Uhr? → "strong" (eigener Treffer),
   * "weak" (nur zwei Buchstaben — hinten einreihen) oder null.
   * extra: weitere Wörter, z. B. die übersetzte Beschriftung.
   */
  function matches(query, extra) {
    var tokens = fold(query).split(/[^a-z0-9]+/).filter(Boolean);
    if (!tokens.length) return null;
    var words = WORDS.concat(fold((extra || []).join(" ")).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3; }));
    var best = null;
    tokens.forEach(function (tok) {
      if (tok.length < 2) return;
      words.forEach(function (w) {
        var hit = w.indexOf(tok) === 0 || (w.length >= 3 && tok.indexOf(w) === 0);
        if (!hit) return;
        if (tok.length >= 3) best = "strong";
        else if (!best) best = "weak";
      });
    });
    return best;
  }

  function hhmm(tod) { return T.formatHHMM(tod); }

  /**
   * Was die Mini-Uhr zeigt — fertige Texte, die Oberfläche schreibt sie nur.
   *   inp: { res, rec, nowSec (Sekunden seit Mitternacht), isToday, canStamp?,
   *          showSeconds, whatIf(nowMin) → Tagesergebnis „wenn jetzt gekommen“ }
   *   fx:  { t(key, vars), dur(min), signed(min), typeLabel(type) }
   */
  function model(inp, fx) {
    var res = inp.res, rec = inp.rec || {};
    var t = fx.t;
    var nowSec = Math.max(0, Math.floor(inp.nowSec || 0));
    var nowMin = Math.floor(nowSec / 60);
    var nowTl = S.nowOnTimeline(res, nowMin);
    var secTl = nowTl * 60 + (nowSec % 60);
    var isToday = !!inp.isToday;
    var canStamp = inp.canStamp === undefined ? S.stampable(res) : !!inp.canStamp;
    var ob = S.openBreak(res, rec, nowTl);
    var ph = S.phase(res, { isToday: isToday, canStamp: canStamp, openBreak: ob, nowTl: nowTl });
    var lv = S.leave(res, nowTl);
    var need = S.neededNet(res);
    var hasStart = res.startTl !== null && res.startTl !== undefined;
    var started = hasStart && nowTl >= res.startTl;
    var acts = S.stampActions(ph, { canStamp: canStamp, isToday: isToday, started: started });

    var m = {
      phase: ph,
      dot: "",            // "live" | "paused" | ""
      status: "", statusTone: "",
      eyebrow: "",
      big: "--:--", bigTone: "", bigWord: false, tag: "",
      sideLabel: "", side: "", sideTone: "",   // Seitenwert immer als Uhrzeit/Dauer h:mm
      net: "",
      progress: null,     // { fill, over, pct, reached }
      main: null,         // Hauptknopf { name, kind, label, icon, tone, primary }
      aux: null           // kleiner Knopf daneben (Pause starten, Gehen)
    };

    function offsetTag(tl) {
      var off = T.dayOffsetOf(tl);
      return off > 0 ? t(off > 1 ? "day.nextDays" : "day.nextDay", { n: off }) : "";
    }
    var running = t("day.running", { time: hhmm(res.startTod) });

    switch (ph) {
      case "running":
        m.dot = "live";
        m.status = running;
        m.statusTone = "plus";
        m.eyebrow = t("day.recommendedLeave");
        m.big = hhmm(lv.leaveTl);
        m.tag = offsetTag(lv.leaveTl);
        m.sideLabel = t("mini.left");
        m.side = formatCountdown(lv.leaveTl * 60 - secTl, inp.showSeconds);
        break;

      case "break":
        /* In der Pause steht der Countdown: Feierabend wandert mit jeder
           Pausenminute mit, gezeigt wird die Arbeit, die noch fehlt. */
        m.dot = "paused";
        m.status = t("day.onBreak", { time: ob.start });
        m.statusTone = "warn";
        m.eyebrow = t("day.recommendedLeave");
        m.big = hhmm(lv.leaveTl);
        m.tag = offsetTag(lv.leaveTl);
        m.sideLabel = t("mini.paused");
        m.side = res.remaining > 0 ? T.formatDuration(res.remaining, "clock") : "";
        m.sideTone = "warn";
        break;

      case "overtime":
        m.dot = "live";
        m.status = running;
        m.statusTone = "plus";
        if (need > 0) {
          m.eyebrow = t("day.goalReached");
          m.big = fx.signed(lv.over);
          m.bigTone = "plus";
          if (lv.reachedTl !== null) {
            m.sideLabel = t("mini.since");
            m.side = hhmm(lv.reachedTl);
          }
        } else {
          m.eyebrow = t("day.netShort");
          m.big = fx.dur(res.net);
        }
        break;

      case "whatif":
        var w = typeof inp.whatIf === "function" ? inp.whatIf(nowMin) : null;
        var wl = w && typeof w.recommendedLeaveTl === "number" ? w.recommendedLeaveTl : null;
        m.status = t("mini.notStarted");
        m.statusTone = "mute";
        m.eyebrow = t("mini.ifNow");
        m.big = hhmm(wl);
        m.tag = wl === null ? "" : offsetTag(wl);
        m.sideLabel = t("day.target");
        m.side = T.formatDuration(need, "clock");
        break;

      case "ended":
      case "planned":
        m.status = ph === "planned"
          ? t("mini.plannedEnd", { time: hhmm(res.endTod) })
          : t("mini.leftAt", { time: hhmm(res.endTod) });
        m.statusTone = "mute";
        m.eyebrow = t("day.balance");
        m.big = fx.signed(res.balance);
        m.bigTone = res.balance >= 0 ? "plus" : "minus";
        break;

      case "incomplete":
        m.status = t("day.missingEnd");
        m.statusTone = "minus";
        m.eyebrow = t("day.recommendedLeave");
        m.bigTone = "mute";
        break;

      case "absence":
        m.status = fx.typeLabel(res.type);
        m.statusTone = "mute";
        m.eyebrow = t("day.credited");
        m.big = fx.dur(res.credited);
        break;

      case "comp":
        m.status = fx.typeLabel(res.type);
        m.statusTone = "mute";
        m.eyebrow = t("day.balance");
        m.big = fx.signed(res.balance);
        break;

      case "free":
        m.status = t("day.noTarget");
        m.statusTone = "mute";
        m.eyebrow = t("day.type");
        m.big = fx.typeLabel(res.type);
        m.bigWord = true;
        break;

      default:
        m.status = t("mini.notStarted");
        m.statusTone = "mute";
        m.eyebrow = t("day.recommendedLeave");
        m.bigTone = "mute";
    }

    /* Fortschritt und Netto nur, sobald gestempelt ist */
    if (hasStart && ph !== "whatif") {
      var ring = S.ring(res, ph);
      if (ring.total !== null) {
        m.progress = {
          fill: Math.min(1, ring.total),
          over: Math.max(0, Math.min(1, ring.total - 1)),
          pct: Math.round(ring.total * 100),
          reached: !!ring.reached
        };
      }
      m.net = t("mini.net", { v: fx.dur(res.net) });
    }

    function act(name, primary) {
      if (!name || !S.ACTIONS[name]) return null;
      var a = S.ACTIONS[name];
      return { name: name, kind: a.kind, label: t(a.label), icon: a.icon, tone: a.tone, primary: !!primary };
    }
    /* Wie die Stempelleiste in „Heute“: eine Hauptaktion, daneben höchstens
       eine Nebenaktion. Gibt es nur die Nebenaktion (gegangen → „Weiter
       arbeiten“), wird sie zum ruhigen Hauptknopf. */
    if (acts) {
      m.main = act(acts.primary || acts.secondary, !!acts.primary);
      m.aux = acts.primary ? act(acts.secondary, false) : null;
    }
    return m;
  }

  /** Kurze Bestätigung im Mini-Fenster nach einem Stempel (step aus TodayState.stampPatch). */
  function confirmation(step, fx) {
    var t = fx.t;
    var time = step && step.time ? step.time : "";
    function done(text, tone) { return { text: text, tone: tone, icon: "check", undo: true }; }
    switch (step && step.action) {
      case "in":         return done(t("toast.stampedIn", { time: time }), "plus");
      case "resume":     return done(t("toast.resumedNoGap", { time: time }), "plus");
      case "out":        return done(t("toast.stampedOut", { time: time }), "plus");
      case "breakStart": return done(t("toast.breakStarted"), "warn");
      case "breakEnd":   return done(t("toast.breakEnded", { v: fx.dur(step.minutes || 0) }), "plus");
      default:
        // Nichts gestempelt (schon da, schon gegangen): wie „Heute“ mit der bestehenden Zeit
        return {
          text: t(step && step.reason === "out" ? "day.clockOut" : "day.clockIn") + (time ? ": " + time : ""),
          tone: "warn", icon: "alert", undo: false
        };
    }
  }

  return {
    STRINGS: STRINGS,
    SIZE: { width: 300, height: 150 },
    supported: supported,
    formatCountdown: formatCountdown,
    matches: matches,
    model: model,
    confirmation: confirmation
  };
});

/* ==========================================================================
   2 · OBERFLÄCHE
   ========================================================================== */
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;   // in Node nur die Logik oben
  var ZK = root.ZK = root.ZK || {};
  var MC = ZK.MiniClock, D = ZK.Dom, T = ZK.Time, I = ZK.I18n, S = ZK.TodayState;
  if (!MC || !D || !T || !I || !S || !ZK.Ext) return;

  I.add(MC.STRINGS);

  /* Fenster mit kleinem Fenster darin — das übliche Bild für „Bild im Bild“ */
  var PIP_ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/>' +
    '<rect x="11.5" y="11" width="7" height="5.5" rx="1.2" fill="currentColor"/></svg>';

  var pip = null;   // { win, inst } solange das Mini-Fenster offen ist

  /* ---- Umgebung ---------------------------------------------------- */
  function apiOf(win) {
    var api = win && win.documentPictureInPicture;
    return api && typeof api.requestWindow === "function" ? api : null;
  }

  function envOf(win) {
    var mm = function (q) { try { return !!(win.matchMedia && win.matchMedia(q).matches); } catch (e) { return false; } };
    var nav = win.navigator || {};
    return {
      api: !!apiOf(win),
      finePointer: mm("(any-pointer: fine)"),
      mobile: !!(nav.userAgentData && nav.userAgentData.mobile)
    };
  }

  function available() { return MC.supported(envOf(root)); }

  /* ---- Kleine DOM-Helfer: Knoten im Ziel-Dokument, nur Änderungen schreiben */
  function mk(doc, spec, attrs) {
    var parts = String(spec).split(/(?=[.#])/);
    var node = doc.createElement(parts[0] || "div");
    parts.slice(1).forEach(function (p) {
      if (p[0] === ".") node.classList.add(p.slice(1));
      else if (p[0] === "#") node.id = p.slice(1);
    });
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v === true ? "" : v);
    });
    return node;
  }
  function setText(node, value) {
    value = value === null || value === undefined ? "" : String(value);
    if (node.textContent !== value) node.textContent = value;
  }
  function setHidden(node, hidden) {
    hidden = !!hidden;
    if (node.hidden !== hidden) node.hidden = hidden;
  }
  function setAttr(node, name, value) {
    value = String(value);
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function setClass(node, cls) {
    if (node.getAttribute("class") !== cls) node.setAttribute("class", cls);
  }
  function setTransform(node, value) {
    if (node.style.transform !== value) node.style.transform = value;
  }

  /* Design, Kontrast, Dichte und Sprache folgen dem Hauptfenster */
  var ROOT_ATTRS = ["data-theme", "data-contrast", "data-density", "lang"];
  function syncRoot(from, to) {
    ROOT_ATTRS.forEach(function (a) {
      var v = from.getAttribute(a);
      if (v === null) { if (to.hasAttribute(a)) to.removeAttribute(a); }
      else if (to.getAttribute(a) !== v) to.setAttribute(a, v);
    });
  }

  /**
   * Stylesheets der App ins Mini-Fenster übernehmen. Regeln werden als Text
   * kopiert (sofort da, kein zweiter Abruf, funktioniert auch in der
   * Einzeldatei); nur wo das nicht geht, ein Verweis auf dieselbe Datei.
   */
  function copyStyles(from, to) {
    Array.prototype.forEach.call(from.styleSheets, function (sheet) {
      var media = sheet.media && sheet.media.mediaText;
      var node;
      try {
        var css = Array.prototype.map.call(sheet.cssRules, function (r) { return r.cssText; }).join("\n");
        node = to.createElement("style");
        node.textContent = css;
      } catch (e) {
        if (!sheet.href) return;
        node = to.createElement("link");
        node.rel = "stylesheet";
        node.href = sheet.href;
      }
      if (media) node.media = media;
      to.head.appendChild(node);
    });
  }

  function fxFor(App) {
    return { t: I.t, dur: App.fmt, signed: App.fmtSigned, typeLabel: App.typeLabel };
  }

  /** Eingaben fürs Modell: immer der Tag, auf den Stempel wirken — nicht der angezeigte. */
  function inputFor(App) {
    var now = new Date();
    var active = App.activeStampDate();
    var res = App.day(active);
    var rec = App.record(active);
    return {
      res: res,
      rec: rec,
      nowSec: now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(),
      isToday: active === T.todayISO(now),
      canStamp: S.stampable(res),
      showSeconds: App.settings().showSeconds !== false,
      whatIf: function (nowMin) {
        var draft = Object.assign({}, rec, { start: T.formatHHMM(nowMin), end: "" });
        return ZK.Engine.computeDay(draft, { settings: App.settings(), holiday: App.holiday(active), isToday: true });
      }
    };
  }

  /* ================================================================== */
  /* Inhalt — in jedes Dokument montierbar                               */
  /* ================================================================== */

  /**
   * @param {Element} host   Ziel (body des Mini-Fensters oder ein Testelement)
   * @param {Object}  opts   { win: Fenster für die Zeitgeber, syncFrom: <html> der App, tick: false = ohne Sekundentakt }
   * → { root, update(), destroy() }
   */
  function mount(host, App, opts) {
    opts = opts || {};
    var doc = host.ownerDocument || document;
    var win = opts.win || doc.defaultView || root;
    var r = {};
    var st = { alive: true, timer: null, flash: null, flashRev: null, flashTimer: null, main: null, aux: null, changes: 0 };

    /* Eigener Änderungszähler ohne Erfolge: „Rückgängig“ in der Bestätigung
       gilt nur, solange der Stempel der letzte gespeicherte Schritt ist. */
    var unsubscribe = App.store && App.store.subscribe ? App.store.subscribe(function (evt) {
      if (evt && (evt.type === "achievements" || evt.type === "error")) return;
      st.changes++;
    }) : null;

    var box = mk(doc, "div.mini-clock", { role: "group" });
    var inner = mk(doc, "div.mc-in");
    box.appendChild(inner);

    /* Kopfzeile: Zustand links, Uhr rechts — nach dem Stempeln kurz die Bestätigung */
    r.top = mk(doc, "div.mc-top");
    r.dot = mk(doc, "span.live-dot.mc-dot", { "aria-hidden": "true" });
    r.status = mk(doc, "span.mc-status");
    r.flash = mk(doc, "span.mc-flash", { hidden: true, "aria-hidden": "true" });
    r.flashIc = mk(doc, "span.mc-flash-ic");
    r.flashText = mk(doc, "span.mc-flash-t");
    r.flash.appendChild(r.flashIc);
    r.flash.appendChild(r.flashText);
    r.undo = mk(doc, "button.mc-undo", { type: "button", hidden: true });
    r.now = mk(doc, "span.mc-now.mono");
    r.nowHm = doc.createTextNode("");
    r.nowSec = mk(doc, "span.sec");
    r.now.appendChild(r.nowHm);
    r.now.appendChild(r.nowSec);
    [r.dot, r.status, r.flash, r.undo, r.now].forEach(function (n) { r.top.appendChild(n); });
    // Ansage für Bildschirmleser — ausserhalb der Zeilen, die ein kleines Fenster ausblendet
    r.live = mk(doc, "span.sr-only", { role: "status", "aria-live": "polite" });
    box.appendChild(r.live);

    /* Feierabend gross, Countdown daneben */
    r.main = mk(doc, "div.mc-main");
    r.lead = mk(doc, "div.mc-lead");
    r.eyebrow = mk(doc, "span.mc-eyebrow");
    r.bigRow = mk(doc, "span.mc-big");
    r.big = mk(doc, "span.mc-big-v");
    r.tag = mk(doc, "span.mc-tag", { hidden: true });
    r.bigRow.appendChild(r.big);
    r.bigRow.appendChild(r.tag);
    r.lead.appendChild(r.eyebrow);
    r.lead.appendChild(r.bigRow);
    r.side = mk(doc, "div.mc-side");
    r.sideL = mk(doc, "span.mc-side-l");
    r.sideV = mk(doc, "span.mc-side-v.mono");
    r.side.appendChild(r.sideL);
    r.side.appendChild(r.sideV);
    r.main.appendChild(r.lead);
    r.main.appendChild(r.side);

    /* Dünner Balken: Anteil am Tagessoll, darüber die zweite Runde */
    r.prog = mk(doc, "div.mc-progress");
    r.bar = mk(doc, "div.mc-bar", { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" });
    r.fill = mk(doc, "i.mc-fill");
    r.over = mk(doc, "i.mc-over");
    r.bar.appendChild(r.fill);
    r.bar.appendChild(r.over);
    r.net = mk(doc, "span.mc-net");
    r.prog.appendChild(r.bar);
    r.prog.appendChild(r.net);

    /* Ein Stempelknopf wie in „Heute“, daneben klein die Nebenaktion */
    r.actions = mk(doc, "div.mc-actions");
    r.mainBtn = mk(doc, "button.stamp-btn", { type: "button" });
    r.auxBtn = mk(doc, "button.stamp-btn", { type: "button", hidden: true });
    r.none = mk(doc, "span.mc-none", { hidden: true });
    r.actions.appendChild(r.mainBtn);
    r.actions.appendChild(r.auxBtn);
    r.actions.appendChild(r.none);

    [r.top, r.main, r.prog, r.actions].forEach(function (n) { inner.appendChild(n); });
    host.appendChild(box);

    r.mainBtn.addEventListener("click", function () { if (st.main) stamp(st.main); });
    r.auxBtn.addEventListener("click", function () { if (st.aux) stamp(st.aux); });
    r.undo.addEventListener("click", function () {
      /* Nur zurücknehmen, solange der Stempel der letzte Schritt ist —
         sonst träfe „Rückgängig“ eine andere Änderung */
      if (st.flashRev !== null && st.changes === st.flashRev) {
        App.undo();
        showFlash({ text: I.t("toast.undone"), tone: "", undo: false }, null);
      }
      update();
    });

    /* Gleiches Verhalten wie die Stempelleiste in „Heute“: App.stamp()
       speichert, meldet im Hauptfenster (mit „Rückgängig“) und zeichnet
       dort neu; hier nur eine kurze Bestätigung. */
    function stamp(name) {
      var a = S.ACTIONS[name];
      if (!a) return;
      var step = S.stampPatch(App.record(App.activeStampDate()), a.kind, T.nowMinutes(), {});
      App.stamp(a.kind);
      var conf = MC.confirmation(step, fxFor(App));
      showFlash(conf, conf.undo ? st.changes : null);
      update();
    }

    function showFlash(conf, rev) {
      st.flash = conf;
      st.flashRev = rev;
      setText(r.flashText, conf.text);
      r.flashIc.innerHTML = D.icon(conf.icon || "check");
      setClass(r.flash, "mc-flash" + (conf.tone ? " tone-" + conf.tone : ""));
      // Bildschirmleser: dieselbe Meldung, unabhängig vom Sichtbaren
      r.live.textContent = conf.text;
      box.classList.remove("flashing");
      void box.offsetWidth;   // Animation neu starten
      box.classList.add("flashing");
      win.clearTimeout(st.flashTimer);
      st.flashTimer = win.setTimeout(function () { endFlash(); update(); }, rev !== null ? 6000 : 2600);
    }

    function endFlash() {
      win.clearTimeout(st.flashTimer);
      st.flash = null;
      st.flashRev = null;
      box.classList.remove("flashing");
      r.live.textContent = "";
    }

    function paintButton(btn, a, aux) {
      setHidden(btn, !a);
      if (!a) return null;
      setClass(btn, "stamp-btn " + (a.primary ? "primary " + a.tone : "secondary k-" + a.tone) + (aux ? " mc-aux" : " mc-main-btn"));
      var key = a.name + "|" + a.label;
      if (btn.__mcKey !== key) {
        btn.__mcKey = key;
        // innerHTML ersetzt nur den Inhalt — der Fokus bleibt auf dem Knopf
        btn.innerHTML = D.icon(a.icon) + (aux ? "" : "<span>" + D.esc(a.label) + "</span>");
      }
      if (aux) { setAttr(btn, "aria-label", a.label); setAttr(btn, "title", a.label); }
      else if (btn.hasAttribute("aria-label")) { btn.removeAttribute("aria-label"); btn.removeAttribute("title"); }
      return a.name;
    }

    function update() {
      if (!st.alive) return;
      if (opts.syncFrom) {
        syncRoot(opts.syncFrom, doc.documentElement);
        var title = I.t("mini.title") + " · " + I.t("app.name");
        if (doc.title !== title) doc.title = title;
      }
      var m = MC.model(inputFor(App), fxFor(App));
      var now = new Date();
      var showSec = App.settings().showSeconds !== false;

      setAttr(box, "aria-label", I.t("mini.title"));
      setAttr(box, "data-phase", m.phase);

      /* Kopfzeile. Ist der Stempel inzwischen überholt (z. B. im
         Hauptfenster zurückgenommen), endet die Bestätigung sofort. */
      if (st.flash && st.flashRev !== null && st.changes !== st.flashRev) endFlash();
      var flashing = !!st.flash;
      var canUndo = flashing && st.flashRev !== null;
      setHidden(r.flash, !flashing);
      setHidden(r.status, flashing);
      setHidden(r.dot, flashing || !m.dot);
      setClass(r.dot, "live-dot mc-dot" + (m.dot === "paused" ? " paused" : ""));
      setText(r.status, m.status);
      setClass(r.status, "mc-status" + (m.statusTone ? " tone-" + m.statusTone : ""));
      setHidden(r.undo, !canUndo);
      setText(r.undo, I.t("common.undo"));
      setHidden(r.now, canUndo);   // Platz für „Rückgängig“
      setText(r.nowHm, T.pad2(now.getHours()) + ":" + T.pad2(now.getMinutes()));
      setText(r.nowSec, showSec ? ":" + T.pad2(now.getSeconds()) : "");

      /* Feierabend und Countdown */
      setText(r.eyebrow, m.eyebrow);
      setText(r.big, m.big);
      setClass(r.bigRow, "mc-big" + (m.bigWord ? " word" : " mono") + (m.bigTone ? " tone-" + m.bigTone : ""));
      setText(r.tag, m.tag);
      setHidden(r.tag, !m.tag);
      setHidden(r.side, !m.side);
      setText(r.sideL, m.sideLabel);
      setHidden(r.sideL, !m.sideLabel);
      setText(r.sideV, m.side);
      setClass(r.sideV, "mc-side-v mono" + (m.sideTone ? " tone-" + m.sideTone : ""));

      /* Fortschritt */
      var p = m.progress;
      setHidden(r.prog, !p && !m.net);
      setHidden(r.bar, !p);
      if (p) {
        setClass(r.bar, "mc-bar" + (p.reached ? " reached" : ""));
        setTransform(r.fill, "scaleX(" + (Math.round(p.fill * 1000) / 1000) + ")");
        setTransform(r.over, "scaleX(" + (Math.round(p.over * 1000) / 1000) + ")");
        setAttr(r.bar, "aria-valuenow", Math.min(100, p.pct));
        setAttr(r.bar, "aria-valuetext", p.pct + " % " + I.t("day.progress"));
        setAttr(r.bar, "aria-label", I.t("mini.progress"));
      }
      setText(r.net, m.net);
      setHidden(r.net, !m.net);

      /* Knöpfe: Elemente bleiben, nur Beschriftung und Farbe wechseln */
      st.main = paintButton(r.mainBtn, m.main, false);
      st.aux = paintButton(r.auxBtn, m.aux, true);
      setHidden(r.none, !!m.main);
      setText(r.none, I.t("mini.noAction"));
    }

    /* Sekundentakt am Fenster der Mini-Uhr: dessen Zeitgeber bremst der
       Browser nicht, auch wenn der App-Tab im Hintergrund liegt. */
    function schedule() {
      st.timer = win.setTimeout(function () {
        if (!st.alive) return;
        update();
        schedule();
      }, 1000 - (Date.now() % 1000) + 20);
    }

    update();
    if (opts.tick !== false) schedule();

    return {
      root: box,
      update: update,
      destroy: function () {
        st.alive = false;
        if (unsubscribe) unsubscribe();
        try { win.clearTimeout(st.timer); win.clearTimeout(st.flashTimer); } catch (e) { /* Fenster schon zu */ }
        if (box.parentNode) box.parentNode.removeChild(box);
      }
    };
  }

  /* ================================================================== */
  /* Fenster öffnen und schliessen                                       */
  /* ================================================================== */

  function failed() {
    D.toast(I.t("mini.failed"), { tone: "warn" });
  }

  function attach(win, App) {
    var doc = win.document;
    copyStyles(document, doc);
    doc.body.className = "mini-pip";
    var inst = mount(doc.body, App, { win: win, syncFrom: document.documentElement });
    pip = { win: win, inst: inst };
    // Schliessen über das Fenster selbst, „Zurück zum Tab“ oder Neuladen der App
    win.addEventListener("pagehide", function () {
      inst.destroy();
      if (pip && pip.win === win) pip = null;
      syncButtons();
    });
    syncButtons();
    return win;
  }

  /** Muss direkt aus einem Klick/Tastendruck kommen (Nutzeraktivierung). */
  function open(App) {
    var api = apiOf(root);
    if (!api || !available()) {
      D.toast(I.t("mini.unsupported"), { tone: "warn", icon: "info" });
      return Promise.resolve(null);
    }
    if (pip) return Promise.resolve(pip.win);
    var req;
    try { req = api.requestWindow({ width: MC.SIZE.width, height: MC.SIZE.height }); }
    catch (e) { failed(); return Promise.resolve(null); }
    return Promise.resolve(req).then(function (win) {
      return attach(win, App);
    }, function () { failed(); return null; });
  }

  function close() {
    if (pip && pip.win) { try { pip.win.close(); } catch (e) { /* schon zu */ } }
  }

  function toggle(App) {
    if (pip) { close(); return Promise.resolve(null); }
    return open(App);
  }

  function paintToggle(btn) {
    var on = !!pip;
    setAttr(btn, "aria-pressed", on ? "true" : "false");
    setAttr(btn, "data-tip", on ? I.t("mini.close") : I.t("mini.tip"));
  }

  function syncButtons() {
    D.qsa('[data-key="hdr-mini"]').forEach(paintToggle);
  }

  /* ---- Kopfzeile ----------------------------------------------------- */
  ZK.Ext.register("header.actions", {
    id: "miniclock",
    order: 40,
    when: function () { return available(); },
    render: function (host, ctx) {
      var App = ctx.App;
      var btn = D.el("button.btn.ghost.icon.hdr-mini", {
        type: "button", "data-key": "hdr-mini", "aria-label": I.t("mini.title"), html: PIP_ICON
      });
      paintToggle(btn);
      btn.addEventListener("click", function () { toggle(App); });
      host.appendChild(btn);
      // Die Kopfzeile wird nach jeder Änderung neu gebaut — die Mini-Uhr zieht sofort nach
      if (pip) pip.inst.update();
      return null;
    }
  });

  /* ---- Befehlspalette -------------------------------------------------- */
  ZK.Ext.register("palette.commands", {
    id: "miniclock",
    collect: function (query, ctx) {
      var hit = MC.matches(query, [I.t("mini.title"), I.t("mini.open")]);
      if (!hit) return null;
      var ok = available();
      return [{
        group: I.t("cmd.group.actions"),
        icon: "clock",
        label: I.t(pip ? "mini.close" : "mini.open"),
        sub: ok ? I.t("mini.cmdSub") : I.t("mini.unsupported"),
        warn: !ok,
        late: hit !== "strong",
        run: function () {
          if (!ok) { D.toast(I.t("mini.unsupported"), { tone: "warn", icon: "info" }); return; }
          toggle(ctx.App);
        }
      }];
    }
  });

  MC.mount = mount;
  MC.open = open;
  MC.close = close;
  MC.toggle = toggle;
  MC.isOpen = function () { return !!pip; };
  MC.available = available;
  MC.copyStyles = copyStyles;
})(typeof self !== "undefined" ? self : this);
