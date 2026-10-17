/* ==========================================================================
   ZEITKONTO — Zeitschieber (Karte in „Heute“)
   --------------------------------------------------------------------------
   „Zieh den Feierabend hin und her und sieh sofort, was das für deinen
   Tages- und Kontosaldo bedeutet.“ Die Rechnung steckt in ZK.WhatIf (core):
   Jede Stellung des Schiebers ist ein Entwurf des Tages mit anderem Gehen,
   durch dieselbe Engine gerechnet — was hier steht, zeigt der Tag nach dem
   Speichern genau so.

   Die Karte ist zugeklappt eine Zeile; ob sie offen ist, merkt sich das
   Gerät. Gerechnet wird erst, wenn sie offen ist. Beim Ziehen wird nichts
   neu gerechnet, nur nachgeschlagen — alle Stellungen liegen schon bereit.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n, W = ZK.WhatIf;
  if (!I) return;

  /* Texte zuerst — auch ohne DOM, damit die Tests sie prüfen können */
  I.add({
    de: {
      "wf.title": "Zeitschieber",
      "wf.sub": "Was wäre, wenn …",
      "wf.slider": "Angenommene Gehen-Zeit",
      "wf.leaveAt": "Gehst du um {time}",
      "wf.leftAt": "Wärst du um {time} gegangen",
      "wf.net": "Netto",
      "wf.day": "Tagessaldo",
      "wf.account": "Zeitkonto",
      "wf.break": "Pause",
      "wf.penalty": "+{v} Pflichtpause",
      "wf.overMax": "Über {v} Arbeitszeit",
      "wf.restShort": "Nur {v} Ruhezeit bis {time}",
      "wf.zone": "Ab {to} gilt die Pflichtpause von {req}: Zwischen {from} und {to} zählt jede weitere Minute als Pause.",
      "wf.chips": "Sprungmarken",
      "wf.chip.zeroToday": "±0 heute",
      "wf.chip.zero": "Tagessaldo ±0",
      "wf.chip.account": "Konto auf ±0",
      "wf.chip.max": "max. {v}",
      "wf.chip.rest": "{v} Ruhezeit",
      "wf.chip.current": "Eingetragen",
      "wf.apply": "So eintragen",
      "wf.applied": "Eingetragen",
      "wf.saved": "Gehen auf {time} gesetzt",
      "wf.remind": "Erinnerung um {time}",
      "wf.remindSet": "Erinnerung um {time} gestellt",
      "wf.remindOn": "Erinnerung um {time} ist gestellt.",
      "wf.remindCancel": "Aufheben",
      "wf.remindCleared": "Erinnerung aufgehoben",
      "wf.remindBody": "Es ist {time} — Zeit zu gehen.",
      "wf.legend.zone": "Pflichtpause wächst",
      "wf.legend.current": "Eingetragen",
      "wf.legend.rest": "Ruhezeit"
    },
    en: {
      "wf.title": "Time slider",
      "wf.sub": "What if …",
      "wf.slider": "Assumed clock-out time",
      "wf.leaveAt": "Leave at {time}",
      "wf.leftAt": "Had you left at {time}",
      "wf.net": "Net",
      "wf.day": "Day balance",
      "wf.account": "Time account",
      "wf.break": "Break",
      "wf.penalty": "+{v} required break",
      "wf.overMax": "Over {v} of work",
      "wf.restShort": "Only {v} of rest until {time}",
      "wf.zone": "From {to} the {req} required break applies: between {from} and {to} every extra minute counts as break.",
      "wf.chips": "Quick picks",
      "wf.chip.zeroToday": "±0 today",
      "wf.chip.zero": "Day balance ±0",
      "wf.chip.account": "Account to ±0",
      "wf.chip.max": "max. {v}",
      "wf.chip.rest": "{v} rest",
      "wf.chip.current": "Recorded",
      "wf.apply": "Use this time",
      "wf.applied": "Recorded",
      "wf.saved": "Clock-out set to {time}",
      "wf.remind": "Remind me at {time}",
      "wf.remindSet": "Reminder set for {time}",
      "wf.remindOn": "Reminder set for {time}.",
      "wf.remindCancel": "Cancel reminder",
      "wf.remindCleared": "Reminder cancelled",
      "wf.remindBody": "It's {time} — time to go.",
      "wf.legend.zone": "Required break grows",
      "wf.legend.current": "Recorded",
      "wf.legend.rest": "Rest period"
    },
    fr: {
      "wf.title": "Curseur horaire",
      "wf.sub": "Et si …",
      "wf.slider": "Heure de départ supposée",
      "wf.leaveAt": "Si vous partez à {time}",
      "wf.leftAt": "Avec un départ à {time}",
      "wf.net": "Net",
      "wf.day": "Solde du jour",
      "wf.account": "Compte temps",
      "wf.break": "Pause",
      "wf.penalty": "+{v} de pause obligatoire",
      "wf.overMax": "Plus de {v} de travail",
      "wf.restShort": "Seulement {v} de repos jusqu'à {time}",
      "wf.zone": "Dès {to}, la pause obligatoire de {req} s'applique : entre {from} et {to}, chaque minute de plus compte comme pause.",
      "wf.chips": "Raccourcis",
      "wf.chip.zeroToday": "±0 aujourd'hui",
      "wf.chip.zero": "Solde du jour ±0",
      "wf.chip.account": "Compte à ±0",
      "wf.chip.max": "max. {v}",
      "wf.chip.rest": "{v} de repos",
      "wf.chip.current": "Saisi",
      "wf.apply": "Enregistrer ainsi",
      "wf.applied": "Enregistré",
      "wf.saved": "Départ fixé à {time}",
      "wf.remind": "Rappel à {time}",
      "wf.remindSet": "Rappel prévu à {time}",
      "wf.remindOn": "Rappel prévu à {time}.",
      "wf.remindCancel": "Supprimer le rappel",
      "wf.remindCleared": "Rappel supprimé",
      "wf.remindBody": "Il est {time} — c'est l'heure de partir.",
      "wf.legend.zone": "Pause obligatoire croissante",
      "wf.legend.current": "Saisi",
      "wf.legend.rest": "Repos"
    },
    it: {
      "wf.title": "Cursore orario",
      "wf.sub": "E se …",
      "wf.slider": "Ora d'uscita ipotetica",
      "wf.leaveAt": "Se esci alle {time}",
      "wf.leftAt": "Con uscita alle {time}",
      "wf.net": "Netto",
      "wf.day": "Saldo del giorno",
      "wf.account": "Conto orario",
      "wf.break": "Pausa",
      "wf.penalty": "+{v} di pausa obbligatoria",
      "wf.overMax": "Oltre {v} di lavoro",
      "wf.restShort": "Solo {v} di riposo fino alle {time}",
      "wf.zone": "Dalle {to} vale la pausa obbligatoria di {req}: tra le {from} e le {to} ogni minuto in più conta come pausa.",
      "wf.chips": "Scelte rapide",
      "wf.chip.zeroToday": "±0 oggi",
      "wf.chip.zero": "Saldo del giorno ±0",
      "wf.chip.account": "Conto a ±0",
      "wf.chip.max": "max. {v}",
      "wf.chip.rest": "{v} di riposo",
      "wf.chip.current": "Registrato",
      "wf.apply": "Registra così",
      "wf.applied": "Registrato",
      "wf.saved": "Uscita impostata alle {time}",
      "wf.remind": "Promemoria alle {time}",
      "wf.remindSet": "Promemoria impostato per le {time}",
      "wf.remindOn": "Promemoria impostato per le {time}.",
      "wf.remindCancel": "Rimuovi promemoria",
      "wf.remindCleared": "Promemoria rimosso",
      "wf.remindBody": "Sono le {time}: è ora di andare.",
      "wf.legend.zone": "Pausa obbligatoria in aumento",
      "wf.legend.current": "Registrato",
      "wf.legend.rest": "Riposo"
    }
  });

  if (typeof document === "undefined" || !ZK.Ext || !D || !T || !W) return;

  var OPEN_KEY = "zeitkonto:whatif-open";
  var PAGE = 15;                 // Bild auf/ab: eine Viertelstunde
  var ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 12h5.5M15.5 12H21M5 8.5v7M19 8.5v7"/><rect x="9" y="5.5" width="6" height="13" rx="3"/></svg>';

  /* Gewählte Stellung — übersteht das Neuzeichnen nach jedem Speichern.
     `off` (Minuten ab Kommen) unterscheidet die doppelte Stunde im Herbst. */
  var memo = { iso: null, tl: null, off: null };
  var reminder = null;           // { iso, tl, timer }
  var onReminder = null;         // die sichtbare Karte zeichnet nach
  var scanCache = { key: null, value: null };
  var baseCache = { key: null, value: null };

  function readOpen() {
    try { return root.localStorage.getItem(OPEN_KEY) === "1"; } catch (e) { return false; }
  }
  function writeOpen(open) {
    try { root.localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch (e) { /* nur Komfort */ }
  }

  function notifyAllowed() {
    try { return typeof Notification !== "undefined" && Notification.permission === "granted"; } catch (e) { return false; }
  }

  /** Uhrzeit mit „+1“, wenn sie nach Mitternacht liegt. */
  function clock(tl) {
    var off = T.dayOffsetOf(tl);
    return T.formatHHMM(tl) + (off > 0 ? " +" + off : "");
  }

  /* ---------------------------------------------------------------------- */
  /* Erinnerung (nur solange die App offen ist — wie die Feierabend-Erinnerung) */
  /* ---------------------------------------------------------------------- */
  function clearReminder() {
    if (reminder) clearTimeout(reminder.timer);
    reminder = null;
  }

  function setReminder(App, iso, tl) {
    clearReminder();
    var d = T.fromISO(iso);
    if (!d) return false;
    var at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, tl);
    var ms = at.getTime() - Date.now();
    if (!(ms > 0) || ms > 24 * 3600 * 1000) return false;
    var time = T.formatHHMM(tl);
    reminder = {
      iso: iso, tl: tl,
      timer: setTimeout(function () {
        reminder = null;
        // Schon ausgestempelt? Dann gibt es nichts mehr zu erinnern.
        var still = true;
        try { still = App.day(iso).running; } catch (e) { /* lieber erinnern */ }
        if (!still) { if (onReminder) onReminder(); return; }
        try {
          new Notification(I.t("app.name"), { body: I.t("wf.remindBody", { time: time }), tag: "zeitkonto-whatif" });
        } catch (e) { /* Benachrichtigung ist optional */ }
        D.toast(I.t("wf.remindBody", { time: time }), { icon: "bell", duration: 12000 });
        if (onReminder) onReminder();
      }, ms)
    };
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Rechnen (zwischengespeichert je Datenstand)                              */
  /* ---------------------------------------------------------------------- */
  function baseFor(App, iso) {
    var key = App.dataRevision() + "|" + iso + "|" + T.todayISO();
    if (baseCache.key !== key) {
      baseCache = { key: key, value: W.baseBalance(App.store.allDays(), App.settings(), iso) };
    }
    return baseCache.value;
  }

  /** Läuft der Tag oder ist es heute? Dann gibt es ein „jetzt“ auf seiner Achse. */
  function liveNow(iso, c) {
    return c.res.running || iso === T.todayISO() ? c.nowTl : null;
  }

  function nextStartOf(App, iso) {
    var next = App.record(T.addDays(iso, 1));
    var tod = next ? T.parseHHMM(next.start) : null;
    return tod === null ? null : tod + T.DAY;
  }

  function scanFor(App, iso, c) {
    var nowTl = liveNow(iso, c);
    var key = [App.dataRevision(), iso, T.todayISO(), nowTl === null ? "" : nowTl].join("|");
    if (scanCache.key === key) return scanCache.value;
    var nextStartTl = nextStartOf(App, iso);
    var sc = W.scan(c.rec, {
      settings: App.settings(),
      holiday: App.holiday(iso),
      isToday: iso === T.todayISO(),
      current: c.res,
      nowTl: nowTl,
      base: baseFor(App, iso),
      nextStartTl: nextStartTl === null ? undefined : nextStartTl
    });
    if (sc) sc.nextStartTl = nextStartTl;
    scanCache = { key: key, value: sc };
    return sc;
  }

  /** Ausgangsstellung: gespeichertes Gehen, sonst ±0 — an einem laufenden Tag nie vor jetzt. */
  function defaultIndex(sc, c, iso) {
    if (sc.marks.current >= 0) return sc.marks.current;
    var zero = sc.marks.zero;
    var nowTl = liveNow(iso, c);
    if (sc.running && nowTl !== null) {
      if (zero >= 0 && sc.positions[zero] > nowTl) return zero;
      return W.clampIndex(sc, nowTl);
    }
    if (zero >= 0) return zero;
    return Math.max(0, Math.min(sc.positions.length - 1, 8 * 60 - sc.lo));
  }

  function setHidden(node, hidden) {
    hidden = !!hidden;
    if (node.hidden !== hidden) node.hidden = hidden;
  }
  function setText(node, text) {
    text = String(text);
    if (node.textContent !== text) node.textContent = text;
  }
  function setHTML(node, html) {
    if (node.__wfHtml !== html) { node.__wfHtml = html; node.innerHTML = html; }
  }
  function pct(f) { return (Math.round(f * 100000) / 1000) + "%"; }

  /* ---------------------------------------------------------------------- */
  /* Karte                                                                    */
  /* ---------------------------------------------------------------------- */
  function build(host, ctx) {
    var App = ctx.App, iso = ctx.iso;
    var open = readOpen();
    var sc = null, idx = -1, last = null;
    var brks = [];              // Pausen als [von, bis] in Minuten ab Kommen
    var chipSig = null, legendSig = null;
    var refs = {};

    var card = D.el("section.card.wf-card", { hidden: true, "aria-label": I.t("wf.title") });
    var toggle = D.el("button.wf-toggle#wfToggle", { type: "button", "aria-expanded": "false", "aria-controls": "wfBody" });
    toggle.innerHTML = '<span class="wf-ic">' + ICON + "</span>" +
      '<span class="wf-head"><span class="wf-title">' + D.esc(I.t("wf.title")) + "</span>" +
      '<span class="wf-sub">' + D.esc(I.t("wf.sub")) + "</span></span>" + D.icon("down", "wf-chev");
    card.appendChild(toggle);

    var body = D.el("div.wf-body#wfBody", { hidden: true });
    card.appendChild(body);

    /* Ablesung */
    var top = D.el("div.wf-top");
    refs.q = D.el("div.wf-q");
    refs.kpis = D.el("div.wf-kpis");
    function kpi(label) {
      var box = D.el("div.wf-kpi");
      box.appendChild(D.el("span.k", { text: label }));
      var v = D.el("b.v.mono");
      box.appendChild(v);
      refs.kpis.appendChild(box);
      return v;
    }
    refs.vNet = kpi(I.t("wf.net"));
    refs.vDay = kpi(I.t("wf.day"));
    refs.vAcc = kpi(I.t("wf.account"));
    refs.vBrk = kpi(I.t("wf.break"));
    top.appendChild(refs.q);
    top.appendChild(refs.kpis);
    body.appendChild(top);
    refs.warns = D.el("div.wf-warns");
    body.appendChild(refs.warns);

    /* Bühne: Zeitstrahl unter dem Schieber */
    var stage = D.el("div.wf-stage");
    refs.tl = D.el("div.wf-tl", { "aria-hidden": "true" });
    refs.gridLayer = D.el("div.wf-layer");
    refs.zoneLayer = D.el("div.wf-layer");
    refs.fill = D.el("div.wf-fill");
    refs.plan = D.el("div.wf-plan", { hidden: true });
    refs.brkLayer = D.el("div.wf-layer");
    refs.markLayer = D.el("div.wf-layer");
    [refs.gridLayer, refs.zoneLayer, refs.fill, refs.plan, refs.brkLayer, refs.markLayer].forEach(function (n) { refs.tl.appendChild(n); });
    refs.range = D.el("input.wf-range#wfSlider", {
      type: "range", min: "0", max: "1", step: "1", value: "0", "aria-label": I.t("wf.slider")
    });
    stage.appendChild(refs.tl);
    stage.appendChild(refs.range);
    body.appendChild(stage);
    refs.scale = D.el("div.wf-scale", { "aria-hidden": "true" });
    body.appendChild(refs.scale);

    refs.hint = D.el("p.wf-hint", { hidden: true });
    body.appendChild(refs.hint);

    var foot = D.el("div.wf-foot");
    refs.chips = D.el("div.chipset.wf-chips", { role: "group", "aria-label": I.t("wf.chips") });
    refs.act = D.el("div.wf-act");
    refs.apply = D.el("button.btn.primary.wf-apply", { type: "button", hidden: true });
    refs.done = D.el("span.wf-done", { hidden: true, html: D.icon("check") + "<span>" + D.esc(I.t("wf.applied")) + "</span>" });
    refs.remind = D.el("button.btn.wf-remind", { type: "button", hidden: true });
    refs.remindNote = D.el("span.wf-remind-note", { hidden: true });
    refs.remindOff = D.el("button.btn.ghost.wf-remind-off", { type: "button", hidden: true, text: I.t("wf.remindCancel") });
    [refs.remindNote, refs.remindOff, refs.remind, refs.done, refs.apply].forEach(function (n) { refs.act.appendChild(n); });
    foot.appendChild(refs.chips);
    foot.appendChild(refs.act);
    body.appendChild(foot);
    refs.legend = D.el("div.tl-legend.wf-legend", { "aria-hidden": "true" });
    body.appendChild(refs.legend);

    host.appendChild(card);

    /* ---- Bedienung ---------------------------------------------------- */
    toggle.addEventListener("click", function () {
      open = !open;
      writeOpen(open);
      applyOpen();
      if (open && last) refresh(last);
    });

    refs.range.addEventListener("input", function () { select(+refs.range.value, true); });
    refs.range.addEventListener("keydown", function (e) {
      if (e.key !== "PageUp" && e.key !== "PageDown") return;
      e.preventDefault();
      select(+refs.range.value + (e.key === "PageUp" ? PAGE : -PAGE), true);
    });

    refs.apply.addEventListener("click", function () {
      if (!sc || idx < 0) return;
      var p = sc.points[idx];
      memo = { iso: iso, tl: p.endTl, off: sc.lo + idx };
      App.saveDay(iso, { end: p.end });
      D.toast(I.t("wf.saved", { time: p.end }), {
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
      /* Die Ansicht ist neu gezeichnet, der Knopf weg („Eingetragen“) —
         die Tastatur bleibt auf dem Schieber */
      var again = document.getElementById("wfSlider");
      if (again) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }
    });

    refs.remind.addEventListener("click", function () {
      if (!sc || idx < 0) return;
      var p = sc.points[idx];
      if (!setReminder(App, iso, p.endTl)) return;
      D.toast(I.t("wf.remindSet", { time: p.end }), {
        icon: "bell",
        action: { label: I.t("common.undo"), onClick: function () { clearReminder(); drawAction(); } }
      });
      drawAction();
    });

    refs.remindOff.addEventListener("click", function () {
      clearReminder();
      D.toast(I.t("wf.remindCleared"), { icon: "bell" });
      drawAction();
      // Der Knopf verschwindet — der Fokus bleibt in der Karte
      try { refs.remind.focus({ preventScroll: true }); } catch (e) { /* ältere Browser */ }
    });

    onReminder = function () { if (document.contains(card)) drawAction(); };

    function applyOpen() {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      card.classList.toggle("is-open", open);
      setHidden(body, !open);
    }

    /** Alle Erweiterungen zu? Dann auch der Stapel, sonst bleibt sein Abstand stehen. */
    function syncHost() {
      if (!card.hidden) { host.hidden = false; return; }
      for (var i = 0; i < host.children.length; i++) if (!host.children[i].hidden) return;
      host.hidden = true;
    }

    function applicable(c) {
      if (!c || !c.rec || !c.res) return false;
      if (T.parseHHMM(c.rec.start) === null) return false;
      var TS = ZK.TodayState;
      return TS ? TS.stampable(c.res) : c.res.typeMeta.stampable !== false;
    }

    /* ---- Aktualisierung (jede Minute, nach jeder Änderung) ------------- */
    function refresh(c) {
      last = c;
      var show = applicable(c);
      setHidden(card, !show);
      syncHost();
      if (!show) return;
      applyOpen();
      if (!open) return;
      var next = scanFor(App, iso, c);
      if (!next) { setHidden(card, true); syncHost(); return; }
      if (next !== sc) {
        sc = next;
        drawStatic(c);
      }
      var i = -1;
      if (memo.iso === iso && memo.tl !== null) {
        var k = memo.off - sc.lo;
        i = k >= 0 && k < sc.positions.length && sc.positions[k] === memo.tl ? k : W.clampIndex(sc, memo.tl);
      }
      select(i >= 0 ? i : defaultIndex(sc, c, iso), false);
    }

    function select(i, byUser) {
      if (!sc) return;
      i = Math.max(0, Math.min(sc.positions.length - 1, Math.round(i) || 0));
      idx = i;
      if (byUser) memo = { iso: iso, tl: sc.positions[i], off: sc.lo + i };
      if (refs.range.value !== String(i)) refs.range.value = String(i);
      drawDynamic();
    }

    /* ---- Was sich nur mit dem Datenstand ändert ------------------------ */
    function drawStatic(c) {
      var n = sc.positions.length;
      refs.range.max = String(n - 1);
      var s = App.settings();
      var maxDaily = s.maxDailyMinutes || 600;

      /* Stundenraster und Skala */
      D.clear(refs.gridLayer);
      D.clear(refs.scale);
      W.hoursOf(sc).forEach(function (h) {
        var odd = (Math.floor(h.tl / 60) % 2) === 1 ? ".odd" : "";
        refs.gridLayer.appendChild(D.el("div.wf-hour" + odd, { style: { left: pct(h.at) } }));
        var lbl = D.el("span" + odd, { style: { left: pct(h.at) } });
        lbl.textContent = T.formatHHMM(h.tl);
        if (h.dayOffset > 0) lbl.appendChild(D.el("sup", { text: "+" + h.dayOffset }));
        refs.scale.appendChild(lbl);
      });

      /* Pausenstufen, in denen Mehrzeit als Pause zählt */
      D.clear(refs.zoneLayer);
      var zones = sc.zones.filter(function (z) { return z.extra > 0; });
      zones.forEach(function (z) {
        var a = z.from / (n - 1), b = z.to / (n - 1);
        refs.zoneLayer.appendChild(D.el("div.wf-zone", { style: { left: pct(a), width: pct(Math.max(0.004, b - a)) } }));
      });

      /* Pausen des Tages; eine laufende endet „jetzt“ (wie im Entwurf) */
      brks = [];
      var startTod = T.parseHHMM(c.rec.start);
      var nowTl = liveNow(iso, c);
      (c.rec.breaks || []).forEach(function (b) {
        if (!b) return;
        var bs = T.parseHHMM(b.start), be = T.parseHHMM(b.end);
        if (bs === null) return;
        var s1 = T.onTimeline(bs, startTod), e1;
        if (be === null) {
          if (!sc.running || nowTl === null || s1 > nowTl) return;
          e1 = nowTl;
        } else {
          e1 = T.onTimeline(be, startTod);
          if (e1 < s1) e1 += T.DAY;
        }
        brks.push([sc.offsetOf(s1), sc.offsetOf(e1)]);
      });
      while (refs.brkLayer.children.length < brks.length) refs.brkLayer.appendChild(D.el("div.wf-brk"));
      while (refs.brkLayer.children.length > brks.length) refs.brkLayer.removeChild(refs.brkLayer.lastChild);

      /* Marken */
      D.clear(refs.markLayer);
      var marks = sc.marks;
      function mark(cls, i) {
        if (i < 0) return;
        refs.markLayer.appendChild(D.el("div.wf-mark." + cls, { style: { left: pct(i / (n - 1)) } }));
      }
      mark("zero", marks.zero);
      mark("max", marks.max);
      mark("rest", marks.rest);
      mark("cur", marks.current);
      mark("now", marks.now);

      /* Legende: nur, was auch zu sehen ist */
      var items = [["sw work", I.t("day.work")]];
      if (brks.length) items.push(["sw brk", I.t("day.break")]);
      if (zones.length) items.push(["sw zone", I.t("wf.legend.zone")]);
      if (marks.zero >= 0) items.push(["ln zero", "±0"]);
      if (marks.current >= 0) items.push(["ln cur", I.t("wf.legend.current")]);
      if (marks.now >= 0) items.push(["ln now", I.t("common.now")]);
      if (marks.max >= 0) items.push(["ln max", I.t("wf.chip.max", { v: App.fmt(maxDaily) })]);
      if (marks.rest >= 0) items.push(["ln rest", I.t("wf.legend.rest")]);
      var lsig = JSON.stringify(items);
      if (lsig !== legendSig) {
        legendSig = lsig;
        refs.legend.innerHTML = items.map(function (it) {
          return '<span><i class="' + it[0] + '"></i>' + D.esc(it[1]) + "</span>";
        }).join("");
      }

      /* Sprungmarken — nur neu bauen, wenn sich etwas ändert (Fokus!) */
      var isToday = iso === T.todayISO();
      var defs = [
        ["zero", isToday ? I.t("wf.chip.zeroToday") : I.t("wf.chip.zero")],
        ["plus", App.fmtSigned(60)],
        ["account", I.t("wf.chip.account")],
        ["max", I.t("wf.chip.max", { v: App.fmt(maxDaily) })],
        ["rest", I.t("wf.chip.rest", { v: App.fmt((s.minRestHours || 11) * 60) })],
        ["current", I.t("wf.chip.current")]
      ].filter(function (d) { return marks[d[0]] >= 0; }).map(function (d) {
        return [d[0], d[1], marks[d[0]], clock(sc.positions[marks[d[0]]])];
      });
      var sig = JSON.stringify(defs);
      if (sig !== chipSig) {
        chipSig = sig;
        D.clear(refs.chips);
        defs.forEach(function (d) {
          var chip = D.el("button.chip.wf-chip", { type: "button", "data-key": "wf-" + d[0], "aria-pressed": "false" });
          chip.appendChild(D.el("span", { text: d[1] }));
          chip.appendChild(D.el("b.mono", { text: d[3] }));
          chip.addEventListener("click", function () { select(d[2], true); });
          chip._wfIndex = d[2];
          refs.chips.appendChild(chip);
        });
      }
      setHidden(refs.chips, !defs.length);
    }

    /* ---- Was sich mit der Stellung ändert ------------------------------ */
    function drawDynamic() {
      if (!sc || idx < 0) return;
      var n = sc.positions.length;
      var p = sc.points[idx];
      var c = last;
      var s = App.settings();
      var nowTl = c ? liveNow(iso, c) : null;
      var past = nowTl !== null ? p.endTl < nowTl : iso < T.todayISO();

      /* Frage mit grosser Uhrzeit */
      var dayTag = p.dayOffset > 0 ? I.t(p.dayOffset > 1 ? "day.nextDays" : "day.nextDay", { n: p.dayOffset }) : "";
      var tpl = D.esc(I.t(past ? "wf.leftAt" : "wf.leaveAt", { time: "\u0000" }));
      setHTML(refs.q, '<span class="wf-qt">' + tpl.replace("\u0000",
        '</span><b class="wf-time mono">' + D.esc(p.end) + "</b>" +
        (dayTag ? '<span class="tag wf-day">' + D.esc(dayTag) + "</span>" : "") + '<span class="wf-qt">') + "</span>");

      setText(refs.vNet, App.fmt(p.net));
      setText(refs.vDay, App.fmtSigned(p.balance));
      refs.vDay.className = "v mono " + App.toneOf(p.balance);
      setHidden(refs.vAcc.parentNode, p.account === null);
      if (p.account !== null) {
        setText(refs.vAcc, App.fmtSigned(p.account));
        refs.vAcc.className = "v mono " + App.toneOf(p.account);
      }
      setText(refs.vBrk, App.fmt(p.effectiveBreak));

      /* Warnungen */
      var warns = [];
      var pen = W.tierPenalty(sc, idx);
      if (pen) warns.push(["warn", "coffee", I.t("wf.penalty", { v: App.fmt(pen.minutes) })]);
      if (p.overDaily) warns.push(["minus", "alert", I.t("wf.overMax", { v: App.fmt(s.maxDailyMinutes || 600) })]);
      if (p.restShort && sc.nextStartTl !== null) {
        warns.push(["minus", "moon", I.t("wf.restShort", { v: App.fmt(Math.max(0, p.rest)), time: T.formatHHMM(sc.nextStartTl) })]);
      }
      setHTML(refs.warns, warns.map(function (w) {
        return '<span class="tag ' + w[0] + '">' + D.icon(w[1]) + D.esc(w[2]) + "</span>";
      }).join(""));

      /* Hinweis zur laufenden oder nächsten Pausenstufe */
      var z = W.zoneNear(sc, idx);
      var hint = z && z.extra > 0 ? I.t("wf.zone", {
        from: clock(sc.positions[z.from]), to: clock(sc.positions[z.to]), req: App.fmt(z.require)
      }) : "";
      setHidden(refs.hint, !hint);
      if (hint) setHTML(refs.hint, D.icon("coffee") + "<span>" + D.esc(hint) + "</span>");

      /* Zeitstrahl: Anwesenheit bis zur Stellung, Pausen darin. An einem
         laufenden Tag ist der Teil nach „jetzt“ erst geplant — heller. */
      var f = n > 1 ? idx / (n - 1) : 0;
      var nowF = sc.running && nowTl !== null ? W.fractionOf(sc, nowTl) : null;
      var split = nowF !== null && nowF < f;
      refs.fill.style.width = pct(split ? nowF : f);
      refs.fill.classList.toggle("is-split", split);
      setHidden(refs.plan, !split);
      if (split) {
        refs.plan.style.left = pct(nowF);
        refs.plan.style.width = pct(f - nowF);
      }
      var limit = sc.lo + idx;
      brks.forEach(function (b, k) {
        var node = refs.brkLayer.children[k];
        var a = Math.max(b[0], sc.lo), e = Math.min(b[1], limit);
        setHidden(node, e <= a);
        if (e <= a) return;
        var span = sc.hi - sc.lo;
        node.style.left = pct((a - sc.lo) / span);
        node.style.width = pct(Math.max(0.003, (e - a) / span));
      });

      /* Sprungmarken: die aktuelle ist gedrückt */
      for (var k = 0; k < refs.chips.children.length; k++) {
        var chip = refs.chips.children[k];
        var on = chip._wfIndex === idx ? "true" : "false";
        if (chip.getAttribute("aria-pressed") !== on) chip.setAttribute("aria-pressed", on);
      }

      /* Bildschirmleser hören beim Ziehen dieselbe Ablesung */
      var parts = [clock(p.endTl),
        I.t("wf.net") + " " + App.fmt(p.net),
        I.t("wf.day") + " " + App.fmtSigned(p.balance)];
      if (p.account !== null) parts.push(I.t("wf.account") + " " + App.fmtSigned(p.account));
      parts.push(I.t("wf.break") + " " + App.fmt(p.effectiveBreak));
      warns.forEach(function (w) { parts.push(w[2]); });
      refs.range.setAttribute("aria-valuetext", parts.join(" · "));

      drawAction();
    }

    /* ---- Eintragen bzw. Erinnerung -------------------------------------- */
    function drawAction() {
      if (!sc || idx < 0) return;
      var p = sc.points[idx];
      var c = last;
      var nowTl = c ? liveNow(iso, c) : null;
      if (!sc.running) {
        setHidden(refs.remind, true);
        setHidden(refs.remindNote, true);
        setHidden(refs.remindOff, true);
        /* Steht genau diese Zeit schon im Tag, gibt es nichts einzutragen */
        var done = sc.savedEnd !== null && sc.savedEnd === p.endTl;
        if (done && document.activeElement === refs.apply) {
          try { refs.range.focus({ preventScroll: true }); } catch (e) { /* ältere Browser */ }
        }
        setHidden(refs.apply, done);
        setHidden(refs.done, !done);
        if (!done) {
          setHTML(refs.apply, D.icon("check") + "<span>" + D.esc(I.t("wf.apply")) + '</span><span class="mono wf-apply-t">' + D.esc(clock(p.endTl)) + "</span>");
        }
        return;
      }
      setHidden(refs.apply, true);
      setHidden(refs.done, true);
      var mine = reminder && reminder.iso === iso ? reminder : null;
      setHidden(refs.remindNote, !mine);
      setHidden(refs.remindOff, !mine);
      if (mine) setText(refs.remindNote, I.t("wf.remindOn", { time: T.formatHHMM(mine.tl) }));
      var can = notifyAllowed();
      setHidden(refs.remind, !can || (mine && mine.tl === p.endTl));
      if (can) {
        refs.remind.disabled = nowTl !== null && p.endTl <= nowTl;
        setHTML(refs.remind, D.icon("bell") + "<span>" + D.esc(I.t("wf.remind", { time: p.end })) + "</span>");
      }
    }

    return { update: refresh };
  }

  ZK.Ext.register("today.cards", { id: "whatif", order: 40, render: build });
})(typeof self !== "undefined" ? self : this);
