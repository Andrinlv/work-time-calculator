/* ==========================================================================
   ZEITKONTO — Ansicht „Werkzeuge“
   --------------------------------------------------------------------------
   Vier Dinge, die vorausdenken statt nur zurückzurechnen:

     · Schnellerfassung   eine Zeile tippen statt vier Felder ausfüllen
     · Gleitzeit-Planer   was pro Tag nötig ist, um ein Ziel zu erreichen
     · Brückentage        wo wenige Ferientage viele freie Tage ergeben
     · Monatscheck        was vor dem Abschluss noch offen ist

   Die Schnellerfassung gibt es auch in der Befehlspalette; beide nutzen
   ZK.QuickEntry aus dieser Datei, damit Vorschau und Schutz vor dem
   Überschreiben überall gleich arbeiten.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, H = ZK.Holidays, I = ZK.I18n;
  var P = ZK.Planner;

  (ZK.Views = ZK.Views || {}).tools = { render: render };

  /* Zustand, der Neuzeichnungen überlebt */
  var checkMonth = null;
  var bridgeYear = null;
  var plannerUntil = null;
  var plannerTarget = "±0:00";
  var refocusQuick = false;   // nach dem Eintragen zurück ins Eingabefeld
  var pendingDraft = null;    // Text aus der Befehlspalette, der hier weiterbearbeitet wird
  var quickDraft = "";        // angefangene Eingabe übersteht ein Neuzeichnen von aussen

  function render(host, App) {
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("tools.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("tools.lede") }));
    head.appendChild(left);
    host.appendChild(head);

    var grid = D.el("div.grid-2");
    host.appendChild(grid);

    var quick = quickEntryCard(App);
    grid.appendChild(quick.card);
    grid.appendChild(plannerCard(App));
    host.appendChild(bridgeCard(App));
    host.appendChild(auditCard(App));

    /* Nach einer Schnellerfassung geht es ohne Einblenden und mit dem
       Cursor im Feld weiter — sonst landen weitere Tasten als Kürzel
       (Thema, Stempeln, Ansicht wechseln) im Leeren. */
    if (refocusQuick) {
      refocusQuick = false;
      host.classList.remove("anim-rise");
      try { quick.input.focus({ preventScroll: true }); } catch (e) { quick.input.focus(); }
    }
  }

  /* ==================================================================== */
  /* Schnellerfassung — gemeinsame Helfer (auch für die Befehlspalette)    */
  /* ==================================================================== */

  /* Beispiele in der Sprache der Oberfläche — nur zum Einfüllen */
  var EXAMPLE_WORDS = {
    de: { yesterday: "gestern", tomorrow: "morgen", vacation: "ferien", sick: "krank", home: "homeoffice", half: "halbtag" },
    en: { yesterday: "yesterday", tomorrow: "tomorrow", vacation: "vacation", sick: "sick", home: "home", half: "half" },
    fr: { yesterday: "hier", tomorrow: "demain", vacation: "vacances", sick: "malade", home: "télétravail", half: "demi" },
    it: { yesterday: "ieri", tomorrow: "domani", vacation: "ferie", sick: "malattia", home: "telelavoro", half: "mezza" }
  };

  function exampleList() {
    var w = EXAMPLE_WORDS[I.getLang()] || EXAMPLE_WORDS.de;
    /* Der Zeitraum liegt in der nächsten Woche, damit er nichts Erfasstes trifft */
    var today = T.todayISO();
    var monday = T.addDays(today, ((8 - T.weekdayOf(today)) % 7) || 7);
    var friday = T.addDays(monday, 4);
    var dm = function (iso) { return +iso.slice(8, 10) + "." + +iso.slice(5, 7) + "."; };
    return [
      "8-17 30",
      w.yesterday + " 7:45-16:30 p45",
      dm(monday) + "-" + dm(friday) + " " + w.vacation,
      w.tomorrow + " 6-14:30 " + w.home,
      w.sick
    ];
  }

  /** Notiz in den Anführungszeichen der jeweiligen Sprache */
  function quote(text) {
    var q = { de: ["„", "“"], en: ["“", "”"], fr: ["« ", " »"], it: ["«", "»"] }[I.getLang()] || ["„", "“"];
    return q[0] + text + q[1];
  }

  function shortDate(iso) {
    return I.weekdayName(T.weekdayOf(iso), "short") + " " + I.formatDate(iso, { day: "2-digit", month: "2-digit" });
  }

  function breakTotal(breaks) {
    return (breaks || []).reduce(function (sum, b) {
      var s = T.parseHHMM(b.start), e = T.parseHHMM(b.end);
      if (s === null || e === null) return sum;
      return sum + T.intervalMinutes(s, e, s);
    }, 0);
  }

  function typeText(rec) {
    var label = I.t("type." + rec.type);
    return rec.absenceFactor !== undefined && rec.absenceFactor !== null && rec.absenceFactor < 1 ? label + " ½" : label;
  }

  /** Wie der Tag heute dasteht: „leer“, „07:42–16:30 erfasst“, „Ferien“ … */
  function describeBefore(App, rec, iso) {
    if (!P.hasContent(rec)) return I.t("tools.qeEmpty");
    var parts = [];
    if (rec.type && rec.type !== "work") parts.push(typeText(rec));
    var s = String(rec.start || "").trim(), e = String(rec.end || "").trim();
    if (s && e) parts.push(I.t("tools.qeRecorded", { v: s + "–" + e }));
    else if (s && iso === T.todayISO()) parts.push(I.t("tools.qeRunning", { v: s }));
    else if (s) parts.push(I.t("tools.qeOpen", { v: s }));
    if (!parts.length) parts.push(String(rec.note || "").trim() ? I.t("tools.qeNoteOnly") : I.t("type.work"));
    return parts.join(" · ");
  }

  /** Wie der Tag danach aussieht — nur das, was die Eingabe bestimmt. */
  function describeAfter(App, after, parsed) {
    var parts = [];
    if (after.type && after.type !== "work") parts.push(typeText(after));
    if (after.start && after.end) {
      parts.push(after.start + "–" + after.end);
      var b = breakTotal(after.breaks);
      if (b > 0) parts.push(I.t("tools.qeBreak", { v: App.fmt(b) }));
      else if (parsed.breakMinutes === 0) parts.push(I.t("tools.qeNoBreak"));
    }
    if (parsed.location) parts.push(I.t("loc." + parsed.location));
    if (parsed.note) parts.push(quote(parsed.note));
    return parts.join(" · ") || I.t("tools.qeEmpty");
  }

  /** Kurzfassung einer Eingabe für Palette und „So gelesen“. */
  function summary(App, parsed) {
    var parts = [];
    var dates = parsed.dates;
    if (dates.length === 1) parts.push(shortDate(dates[0]));
    else {
      parts.push(I.formatDate(dates[0], { day: "2-digit", month: "2-digit" }) + "–" +
        I.formatDate(dates[dates.length - 1], { day: "2-digit", month: "2-digit" }));
    }
    if (parsed.type) parts.push(typeText({ type: parsed.type, absenceFactor: parsed.factor }));
    if (parsed.start) parts.push(parsed.start + "–" + parsed.end);
    if (parsed.breakMinutes > 0) parts.push(I.t("tools.qeBreak", { v: App.fmt(parsed.breakMinutes) }));
    else if (parsed.breakMinutes === 0) parts.push(I.t("tools.qeNoBreak"));
    if (parsed.location) parts.push(I.t("loc." + parsed.location));
    if (parsed.note) parts.push(quote(parsed.note));
    return parts.join(" · ");
  }

  function analyze(text) {
    return P.analyzeQuickEntry(text, T.todayISO());
  }

  function isLocked(App, iso) {
    return !!(App.store && App.store.isLocked && App.store.isLocked(iso));
  }

  /**
   * Tage abgeschlossener Monate: Die Vorschau zeigt sie als „abgeschlossen“,
   * gespeichert wird dort nichts — sie zählen weder als neu noch als zu
   * ersetzen. Liegt alles Eintragbare in solchen Monaten: Fehler „locked“.
   */
  function lockPlan(thePlan, locked) {
    thePlan.locked = 0;
    if (!locked) return thePlan;
    thePlan.days.forEach(function (d) {
      if (d.status === "skipped" || !locked(d.date)) return;
      if (d.status === "new") thePlan.fresh--;
      else if (d.status === "occupied") thePlan.occupied--;
      else if (d.status === "same") thePlan.unchanged--;
      d.status = "locked";
      d.reason = "locked";
      thePlan.locked++;
    });
    if (thePlan.locked && !thePlan.fresh && !thePlan.occupied && !thePlan.unchanged) thePlan.error = "locked";
    return thePlan;
  }

  function plan(App, parsed) {
    var s = App.settings();
    return lockPlan(P.planQuickEntry(parsed, {
      getRecord: function (iso) { return App.store.getDay(iso); },
      dayOff: function (iso) {
        if (App.holiday(iso)) return "holiday";
        return App.day(iso).baseTarget > 0 ? null : "weekend";
      },
      lunch: s.defaultLunch,
      breakLabel: I.t("day.lunch")
    }), function (iso) { return isLocked(App, iso); });
  }

  /** Fehlermeldung zu einem Lesefehler, mit dem Stichwort der eigenen Sprache. */
  function errorText(App, error) {
    if (!error) return "";
    var w = EXAMPLE_WORDS[I.getLang()] || EXAMPLE_WORDS.de;
    var vars = {
      token: error.token || "",
      n: error.days || 0,
      max: error.max || P.MAX_RANGE,
      v: error.minutes !== undefined ? App.fmt(error.minutes) : "",
      p: error.presence !== undefined ? App.fmt(error.presence) : "",
      vac: w.vacation,
      half: w.half
    };
    if (error.code === "unreadable" || error.code === "empty") return I.t("tools.quickUnreadable");
    return I.t("tools.qeErr." + error.code, vars);
  }

  /** Vorschau: je Tag der jetzige Stand und was sich ändert. */
  function renderRows(App, thePlan, parsed, overwrite, limit) {
    var wrap = D.el("div.qe-list");
    var max = limit || 8;
    var s = App.settings();
    thePlan.days.slice(0, max).forEach(function (d) {
      var kind = d.status === "new" ? "new"
        : d.status === "occupied" ? (overwrite ? "over" : "kept")
        : d.status === "same" ? "same" : d.status === "locked" ? "locked" : "skip";
      var row = D.el("div.qe-row.is-" + (kind === "locked" ? "skip.is-locked" : kind));

      var top = D.el("div.qe-top");
      top.appendChild(D.el("b.qe-date", { text: shortDate(d.date) }));
      var tagTone = { "new": "plus", over: "warn", kept: "", same: "plus", skip: "", locked: "" }[kind];
      var tagText = {
        "new": I.t("tools.qeStatusNew"), over: I.t("tools.qeStatusOver"), kept: I.t("tools.qeStatusKept"),
        same: I.t("tools.qeStatusSame"), skip: I.t("tools.qeStatusSkip"), locked: I.t("lock.status")
      }[kind];
      top.appendChild(D.el("span.tag" + (tagTone ? "." + tagTone : ""), { text: tagText }));
      row.appendChild(top);

      /* Saldo des Tages, wie er nach dem Eintragen dastünde */
      if (kind !== "skip" && kind !== "locked") {
        var rec = (kind === "kept" || kind === "same") ? (d.before || {}) : d.after;
        var res = ZK.Engine.computeDay(Object.assign({}, App.record(d.date), rec), {
          settings: s, holiday: App.holiday(d.date), isToday: d.date === T.todayISO()
        });
        row.appendChild(D.el("span.qe-bal.mono" + (res.balance > 0 ? ".tone-plus" : res.balance < 0 ? ".tone-minus" : ""), {
          text: App.fmtSigned(res.balance)
        }));
      }

      var change = D.el("div.qe-change");
      if (kind === "locked") {
        change.appendChild(D.el("span.qe-before", { text: I.t("lock.dayHint") }));
      } else if (kind === "skip") {
        var h = App.holiday(d.date);
        change.appendChild(D.el("span.qe-before", {
          text: d.reason === "holiday" && h ? (h.names && h.names[I.getLang()]) || h.name : I.t("tools.qeDayOff")
        }));
      } else if (kind === "same") {
        change.appendChild(D.el("span.qe-after", { text: describeAfter(App, d.after, parsed) }));
      } else {
        change.appendChild(D.el("span.qe-before", { text: describeBefore(App, d.before, d.date) }));
        /* Pfeil und neuer Stand bleiben beim Umbruch zusammen */
        var to = D.el("span.qe-to");
        to.appendChild(D.el("span.qe-arrow", { html: D.icon("right"), "aria-hidden": "true" }));
        to.appendChild(D.el("span.qe-after", { text: describeAfter(App, d.after, parsed) }));
        change.appendChild(to);
      }
      row.appendChild(change);
      wrap.appendChild(row);
    });
    if (thePlan.days.length > max) {
      wrap.appendChild(D.el("p.qe-more", { text: I.tn("tools.qeMore", thePlan.days.length - max) }));
    }
    return wrap;
  }

  /**
   * Speichern, neu zeichnen, Rückgängig anbieten.
   * @returns {Number} Anzahl geschriebener Tage
   */
  function apply(App, thePlan, overwrite, opts) {
    var patch = P.selectQuickPatch(thePlan, overwrite);
    if (!Object.keys(patch).length) return 0;
    var replaced = overwrite ? thePlan.occupied : 0;
    /* Gezählt wird, was der Speicher angenommen hat — einen abgeschlossenen
       Monat meldet er selbst (Sperrmeldung) */
    var n = App.store.setDays(patch, { label: "quick" }).written;
    if (!n) return 0;
    if (opts && opts.beforeRender) opts.beforeRender();
    App.afterChange();
    D.toast(I.tn("tools.quickDone", n), {
      tone: "plus",
      icon: "zap",
      sub: replaced ? I.tn("tools.qeReplaced", replaced) : (thePlan.occupied ? I.tn("tools.qeKeptCount", thePlan.occupied) : ""),
      action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
    });
    return n;
  }

  /** Prüfdialog, wenn eine Eingabe erfasste Tage trifft (Befehlspalette). */
  function review(App, parsed, thePlan) {
    var body = D.el("div.col", { style: { gap: "12px" } });
    body.appendChild(D.el("p.qe-read", { text: summary(App, parsed) }));
    /* Die Vorschau zeigt, was der Knopf „überschreiben“ bewirken würde */
    body.appendChild(renderRows(App, thePlan, parsed, true, 31));
    var note = D.el("div.notice.warn");
    note.innerHTML = D.icon("alert") + "<div>" + D.esc(I.tn("tools.qeReviewHint", thePlan.occupied)) +
      "<div class='sub'>" + D.esc(I.t("tools.qeOverwriteHint")) + "</div></div>";
    body.appendChild(note);

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var onlyNew = thePlan.fresh
      ? D.el("button.btn", { type: "button", text: I.tn("tools.qeOnlyNew", thePlan.fresh) })
      : null;
    var over = D.el("button.btn.warn", { type: "button", text: I.tn("tools.qeOverwrite", thePlan.occupied) });
    var m = D.modal({ title: I.t("tools.qeReviewTitle"), body: body, footer: [cancel, onlyNew, over] });
    cancel.addEventListener("click", function () { m.close(); });
    if (onlyNew) onlyNew.addEventListener("click", function () { m.close(); apply(App, thePlan, false); });
    over.addEventListener("click", function () { m.close(); apply(App, thePlan, true); });
  }

  /** Eingabe in die Werkzeuge mitnehmen, um sie dort zu korrigieren. */
  function openInTools(App, text) {
    pendingDraft = String(text || "");
    refocusQuick = true;
    if (App.view === "tools") App.renderView();
    else App.go("tools");
  }

  ZK.QuickEntry = {
    analyze: analyze,
    plan: plan,
    lockPlan: lockPlan,
    summary: summary,
    errorText: errorText,
    renderRows: renderRows,
    apply: apply,
    review: review,
    openInTools: openInTools
  };

  /* ==================================================================== */
  /* 1 · Schnellerfassung                                                  */
  /* ==================================================================== */

  function quickEntryCard(App) {
    var card = D.el("section.card.qe-card");
    card.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("tools.quick")) + "</h2>" }));
    card.appendChild(D.el("p.muted.qe-hint", { text: I.t("tools.quickHint") }));

    var input = D.el("input.input.mono", {
      type: "text", placeholder: I.t("tools.quickPlaceholder"),
      autocomplete: "off", spellcheck: "false", enterkeyhint: "done",
      "aria-label": I.t("tools.quick"), "aria-describedby": "qePreview"
    });
    card.appendChild(input);

    var preview = D.el("div.qe-preview#qePreview", { "aria-live": "polite" });
    card.appendChild(preview);

    var applyBtn = D.el("button.btn.primary.block.mt-3", {
      type: "button", text: I.t("common.apply"), disabled: true
    });
    card.appendChild(applyBtn);

    var examples = D.el("div.chipset.mt-4");
    exampleList().forEach(function (ex) {
      var chip = D.el("button.chip.mono", { type: "button", text: ex });
      /* Beispiele füllen nur das Feld — eingetragen wird erst auf Wunsch */
      chip.addEventListener("click", function () {
        input.value = ex;
        quickDraft = ex;
        overwrite = false;
        update(true);
        input.focus();
      });
      examples.appendChild(chip);
    });
    card.appendChild(examples);

    var parsed = null;
    var thePlan = null;
    var overwrite = false;
    var errTimer = null;

    input.addEventListener("input", function () {
      overwrite = false;
      quickDraft = input.value;
      update(false);
    });
    if (pendingDraft !== null) { quickDraft = pendingDraft; pendingDraft = null; }
    if (quickDraft) {
      input.value = quickDraft;
      setTimeout(function () { update(true); }, 0);
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!applyBtn.disabled) commit();
        else update(true);   // Fehler sofort zeigen statt nach der Tipp-Pause
      }
      else if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; quickDraft = ""; update(true); }
    });
    applyBtn.addEventListener("click", commit);

    function setButton(label, enabled, tone) {
      applyBtn.textContent = label;
      applyBtn.disabled = !enabled;
      applyBtn.classList.toggle("primary", tone !== "warn");
      applyBtn.classList.toggle("warn", tone === "warn");
    }

    function showError(error) {
      D.clear(preview);
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
      var msg = D.el("div.qe-msg.err", { role: "alert" });
      msg.innerHTML = D.icon("alert") + "<span>" + D.esc(errorText(App, error)) + "</span>";
      preview.appendChild(msg);
    }

    /**
     * Vorschau neu aufbauen. Fehler erscheinen erst nach einer kurzen
     * Tipp-Pause — „8-“ ist auf dem Weg zu „8-17“ noch kein Fehler.
     */
    function update(immediate) {
      clearTimeout(errTimer);
      var text = input.value.trim();
      var res = analyze(input.value);
      parsed = res.ok ? res : null;
      thePlan = parsed ? plan(App, parsed) : null;

      if (!text) {
        D.clear(preview);
        input.classList.remove("invalid");
        input.removeAttribute("aria-invalid");
        setButton(I.t("common.apply"), false);
        return;
      }

      if (!parsed || thePlan.error) {
        setButton(I.t("common.apply"), false);
        var error = parsed ? { code: thePlan.error } : res.error;
        if (immediate) showError(error);
        else {
          D.clear(preview);
          input.classList.remove("invalid");
          input.removeAttribute("aria-invalid");
          errTimer = setTimeout(function () { showError(error); }, 450);
        }
        return;
      }

      input.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
      D.clear(preview);
      preview.appendChild(D.el("p.qe-read", {
        html: "<span>" + D.esc(I.t("tools.qeRead")) + "</span> " + D.esc(summary(App, parsed))
      }));
      preview.appendChild(renderRows(App, thePlan, parsed, overwrite, 8));

      if (thePlan.skipped) {
        preview.appendChild(D.el("p.qe-more", { text: I.tn("tools.qeSkipped", thePlan.skipped) }));
      }
      if (thePlan.locked) {
        preview.appendChild(D.el("p.qe-more", { text: I.tn("lock.skipped", thePlan.locked) }));
      }

      /* Erfasste Tage nur auf ausdrücklichen Wunsch ersetzen */
      if (thePlan.occupied) {
        var sw = D.el("label.switch.qe-over");
        var box = D.el("input", { type: "checkbox" });
        box.checked = overwrite;
        sw.appendChild(box);
        sw.appendChild(D.el("span.track"));
        sw.appendChild(D.el("span.lbl", {
          html: D.esc(I.tn("tools.qeOverwrite", thePlan.occupied)) +
            "<small>" + D.esc(I.t("tools.qeOverwriteHint")) + "</small>"
        }));
        box.addEventListener("change", function () {
          overwrite = box.checked;
          update(true);
          var again = preview.querySelector(".qe-over input");
          if (again) again.focus();
        });
        preview.appendChild(sw);
      }

      var writes = thePlan.fresh + (overwrite ? thePlan.occupied : 0);
      if (overwrite && thePlan.occupied) {
        setButton(thePlan.fresh
          ? I.tn("tools.qeApplyOver", thePlan.occupied, { t: writes })
          : I.tn("tools.qeOverwrite", thePlan.occupied), true, "warn");
      } else if (thePlan.fresh) {
        setButton(I.tn("tools.qeApply", thePlan.fresh), true);
      } else if (thePlan.occupied) {
        setButton(I.t("tools.qeNothing"), false);
      } else {
        setButton(I.t("tools.qeSame"), false);
      }
    }

    function commit() {
      if (!parsed || !thePlan || thePlan.error) return;
      var p = thePlan, ow = overwrite;
      parsed = null; thePlan = null; overwrite = false;
      var n = apply(App, p, ow, {
        beforeRender: function () { refocusQuick = true; input.value = ""; quickDraft = ""; }
      });
      if (!n) { refocusQuick = false; update(true); }
    }

    return { card: card, input: input };
  }

  /* ==================================================================== */
  /* 2 · Gleitzeit-Planer                                                  */
  /* ==================================================================== */

  /** „+5:00“, „−2:30“, „±0“, „7.5“ → Minuten mit Vorzeichen, sonst null. */
  function parseTargetBalance(text) {
    var raw = String(text || "").trim().replace(/[−–]/g, "-").replace("±", "").replace(/\s+/g, "");
    if (!raw) return 0;
    var neg = raw.charAt(0) === "-";
    var mins = T.parseDuration(raw.replace(/^[+\-]/, ""));
    if (mins === null || !isFinite(mins)) return null;
    return neg ? -Math.abs(mins) : Math.abs(mins);
  }

  function plannerCard(App) {
    var card = D.el("section.card");
    card.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("tools.planner")) + "</h2>" }));

    var s = App.settings();
    var today = T.todayISO();
    var balance = App.accountBalance().minutes;
    var dayTarget = R.baseTargetFor(today, s, 2) || 504;
    var comp = P.compensationDays(balance, dayTarget);

    /* Kopfzahlen */
    var kpis = D.el("div.grid-2.mb-4");
    kpiInto(kpis, I.t("set.account"), App.fmtSigned(balance), "",
      balance > 0 ? "plus" : balance < 0 ? "minus" : "");
    kpiInto(kpis, I.t("tools.compDays"), String(comp.days),
      comp.rest ? "+ " + App.fmt(comp.rest) : "", comp.days > 0 ? "plus" : "");
    card.appendChild(kpis);

    if (comp.days > 0) {
      var hint = D.el("div.notice.plus.mb-4");
      hint.innerHTML = D.icon("zap") + "<div>" +
        D.esc(I.tn("tools.compHint", comp.days, { h: App.fmt(comp.dayTarget) })) + "</div>";
      card.appendChild(hint);
    }

    /* Zieleingabe */
    if (!plannerUntil || plannerUntil < today) plannerUntil = T.endOfMonth(today);
    var row = D.el("div.grid-2");
    var untilField = D.el("div.field");
    untilField.appendChild(D.el("label", { text: I.t("tools.until"), "for": "plUntil" }));
    var until = D.el("input.input#plUntil", { type: "date", value: plannerUntil, min: today });
    untilField.appendChild(until);
    row.appendChild(untilField);

    var targetField = D.el("div.field");
    targetField.appendChild(D.el("label", { text: I.t("tools.targetBalance"), "for": "plTarget" }));
    var target = D.el("input.input.mono#plTarget", {
      type: "text", value: plannerTarget, inputmode: "text", autocomplete: "off",
      style: { textAlign: "right" }
    });
    targetField.appendChild(target);
    var targetHint = D.el("div.hint.err", { text: I.t("tools.targetInvalid"), hidden: true });
    targetField.appendChild(targetHint);
    row.appendChild(targetField);
    card.appendChild(row);

    var out = D.el("div.mt-4", { "aria-live": "polite" });
    card.appendChild(out);

    until.addEventListener("change", recompute);
    target.addEventListener("change", recompute);
    target.addEventListener("input", D.debounce(recompute, 300));
    recompute();

    function recompute() {
      D.clear(out);
      var to = until.value;
      if (!T.isValidISO(to) || to < today) {
        out.appendChild(D.el("p.muted", { text: I.t("tools.pickFuture"), style: { fontSize: "12.5px" } }));
        return;
      }
      plannerUntil = to;

      var wanted = parseTargetBalance(target.value);
      var bad = wanted === null;
      target.classList.toggle("invalid", bad);
      target.setAttribute("aria-invalid", bad ? "true" : "false");
      targetHint.hidden = !bad;
      if (bad) return;
      plannerTarget = target.value;

      /* Heute zählt mit, solange der Tag nicht abgeschlossen ist — das
         bisher Gearbeitete ist dann die Untergrenze, nicht ein Minus. */
      var days = [];
      var base = balance;
      var todayRes = App.day(today);
      var todayOpen = todayRes.target > 0 && todayRes.credited === 0 && !todayRes.complete &&
        todayRes.typeMeta.stampable !== false && todayRes.type !== "holiday";
      if (todayOpen) {
        base = App.accountBalance(T.addDays(today, -1)).minutes;
        days.push({ date: today, target: todayRes.target, min: todayRes.net, today: true });
      }
      T.rangeDays(T.addDays(today, 1), to).forEach(function (iso) {
        var res = App.day(iso);
        if (res.target > 0 && res.credited === 0 && !res.recorded) {
          days.push({ date: iso, target: res.target });
        }
      });

      var maxNet = s.maxDailyMinutes || 600;
      var thePlan = P.distributeBalance(base, wanted, days, { maxNet: maxNet });

      if (thePlan.reason === "no-days") {
        var none = D.el("div.notice.warn");
        none.innerHTML = D.icon("alert") + "<div>" + D.esc(I.t("tools.noWorkdays")) + "</div>";
        out.appendChild(none);
        return;
      }

      var dateText = I.formatDate(to, { day: "2-digit", month: "2-digit" });
      if (!thePlan.feasible) {
        var no = D.el("div.notice.minus");
        var why = thePlan.reason === "too-much-plus"
          ? I.t("tools.infeasiblePlus", { date: dateText, rest: App.fmt(Math.abs(thePlan.shortfall)) })
          : I.t("tools.infeasibleMax", {
            need: App.fmt(thePlan.needNet), max: App.fmt(maxNet),
            date: dateText, best: App.fmtSigned(base + thePlan.achievable)
          });
        no.innerHTML = D.icon("alert") + "<div><strong>" + D.esc(I.t("tools.infeasible")) + "</strong>" +
          "<div class='sub'>" + D.esc(why) + "</div></div>";
        out.appendChild(no);
        return;
      }

      /* Typischer Tag: der erste künftige, nicht der angebrochene heutige */
      var typical = thePlan.days.filter(function (d) { return d.date !== today; })[0] || thePlan.days[0];
      var summaryBox = D.el("div.notice." + (thePlan.strained ? "warn" : "info"));
      summaryBox.innerHTML = D.icon(thePlan.strained ? "alert" : "info") +
        "<div><strong>" + D.esc(I.tn("tools.perDay", thePlan.dayCount, {
          v: T.formatSigned(thePlan.perDay, "clock"), n: thePlan.dayCount
        })) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("tools.perDayHint", { net: App.fmt(typical.plannedNet) })) +
        (thePlan.strained ? " · " + D.esc(I.t("tools.strained")) : "") + "</div></div>";
      out.appendChild(summaryBox);

      /* Beispiel-Gehenzeit: heute mit echtem Start, sonst ein üblicher Tag */
      var lunch = s.defaultLunch || { start: "12:00", end: "12:30" };
      var lunchLen = T.intervalMinutes(T.parseHHMM(lunch.start), T.parseHHMM(lunch.end), T.parseHHMM(lunch.start)) || 30;
      var first = thePlan.days[0];
      var useToday = first.date === today && todayRes.startTod !== null;
      var leave = P.leaveTimeForBalance({
        start: useToday ? todayRes.start : "08:00",
        target: first.target,
        wantBalance: first.deltaPerDay,
        breakMinutes: useToday ? Math.max(todayRes.breakTotal, 0) : lunchLen,
        breakRuleset: s.breakRuleset,
        customBreakTiers: s.customBreakTiers,
        autoDeductBreak: s.autoDeductBreak,
        roundStep: s.roundStep,
        roundMode: s.roundMode
      });
      if (!useToday && first.date === today) {
        leave = P.leaveTimeForBalance({
          start: "08:00", target: typical.target, wantBalance: typical.deltaPerDay, breakMinutes: lunchLen,
          breakRuleset: s.breakRuleset, customBreakTiers: s.customBreakTiers, autoDeductBreak: s.autoDeductBreak,
          roundStep: s.roundStep, roundMode: s.roundMode
        });
      }
      if (leave) {
        var ex = D.el("p.muted.mt-3.pl-example");
        ex.appendChild(document.createTextNode(I.t(useToday ? "tools.exampleToday" : "tools.exampleDay", {
          start: useToday ? todayRes.start : "08:00", leave: leave.text
        })));
        if (leave.dayOffset > 0) {
          ex.appendChild(document.createTextNode(" "));
          ex.appendChild(D.el("span.tag.warn", {
            text: I.t(leave.dayOffset > 1 ? "day.nextDays" : "day.nextDay", { n: leave.dayOffset })
          }));
        }
        out.appendChild(ex);
      }
    }

    return card;
  }

  /* ==================================================================== */
  /* 3 · Brückentage                                                       */
  /* ==================================================================== */

  function bridgeCard(App) {
    var card = D.el("section.card.mt-4");
    var s = App.settings();
    var today = T.todayISO();
    var thisYear = T.yearOf(today);
    if (!bridgeYear || bridgeYear < thisYear) bridgeYear = thisYear;

    var head = D.el("div.card-head");
    head.innerHTML = "<h2>" + D.esc(I.t("tools.bridges")) + "</h2>";
    var actions = D.el("div.actions");
    var yearSel = D.el("select.select", { style: { minWidth: "110px" }, "aria-label": I.t("tools.bridges") });
    [thisYear, thisYear + 1].forEach(function (y) {
      yearSel.appendChild(D.el("option", { value: y, text: String(y), selected: y === bridgeYear }));
    });
    actions.appendChild(yearSel);
    head.appendChild(actions);
    card.appendChild(head);

    card.appendChild(D.el("p.muted", {
      text: I.t("tools.bridgesHint"), style: { fontSize: "12.5px", marginBottom: "14px" }
    }));

    var list = D.el("div.bridge-list");
    card.appendChild(list);

    yearSel.addEventListener("change", function () { bridgeYear = +yearSel.value; draw(bridgeYear); });
    draw(bridgeYear);

    function holidayMap(y) {
      if (s.autoHolidays === false) return {};
      var map = {};
      [y - 1, y, y + 1].forEach(function (yy) { Object.assign(map, H.forYear(yy, s.holidayRegion)); });
      return map;
    }

    function draw(y) {
      D.clear(list);
      var holidays = holidayMap(y);

      /* Über den Jahreswechsel suchen (Weihnachten → Neujahr), aber nur
         Vorschläge zeigen, die in diesem Jahr beginnen — und keine, die
         schon vorbei sind. */
      var from = (y - 1) + "-12-01";
      var tomorrow = T.addDays(today, 1);
      if (from < tomorrow) from = tomorrow;
      var bridges = P.bridgeDays({
        from: from,
        to: (y + 1) + "-01-10",
        isHoliday: function (iso) { return !!holidays[iso]; },
        isWorkday: function (iso) { return R.baseTargetFor(iso, s, T.weekdayOf(iso)) > 0; }
      }).filter(function (b) { return T.yearOf(b.from) === y; });

      if (!bridges.length) {
        var empty = D.el("div.empty");
        empty.innerHTML = '<div class="rings"><i></i><i></i></div><p>' +
          D.esc(I.t(y === thisYear ? "tools.noBridgesLeft" : "tools.noBridges")) + "</p>";
        list.appendChild(empty);
        return;
      }

      bridges.forEach(function (b) {
        var row = D.el("div.bridge-row");

        var names = b.holidays.map(function (iso) {
          var h = holidays[iso];
          return h ? (h.names && h.names[I.getLang()]) || h.name : "";
        }).filter(Boolean).join(", ");

        var info = D.el("div.bridge-info");
        info.innerHTML =
          "<div class='bridge-head'>" +
          D.esc(I.tn("tools.bridgeHeadline", b.vacationDays, { v: b.vacationDays, t: b.totalDays })) + "</div>" +
          "<div class='bridge-when'>" +
          D.esc(I.formatDate(b.from, { day: "2-digit", month: "short" })) + " – " +
          D.esc(I.formatDate(b.to, { day: "2-digit", month: "short", year: "numeric" })) +
          (names ? " · " + D.esc(names) : "") + "</div>" +
          "<div class='bridge-dates mono'>" +
          D.esc(b.dates.map(function (d) {
            return I.formatDate(d, { day: "2-digit", month: "2-digit" });
          }).join(" · ")) + "</div>";
        row.appendChild(info);

        var side = D.el("div.bridge-side");
        side.appendChild(D.el("span.tag.plus", { text: "×" + b.ratio }));
        var booked = b.dates.filter(function (iso) {
          var r = App.store.getDay(iso);
          return r && r.type === "vacation";
        }).length;
        if (booked === b.dates.length) {
          side.appendChild(D.el("span.tag.info", { html: D.icon("check") + D.esc(I.t("tools.bridgeBooked")) }));
        } else {
          var take = D.el("button.btn.sm", { type: "button", text: I.t("tools.takeBridge") });
          take.addEventListener("click", function () { confirmBridge(App, b, names); });
          side.appendChild(take);
        }
        row.appendChild(side);

        list.appendChild(row);
      });
    }

    return card;
  }

  function confirmBridge(App, bridge, names) {
    /* Erfasste Tage bleiben, wie sie sind — gebucht werden nur leere */
    var recorded = bridge.dates.filter(function (iso) { return P.hasContent(App.store.getDay(iso)); });
    // Abgeschlossene Monate nehmen nichts mehr an — dort wird nichts gebucht
    var free = bridge.dates.filter(function (iso) { return recorded.indexOf(iso) < 0 && !isLocked(App, iso); });

    var body = D.el("div.col");
    body.appendChild(D.el("p", {
      style: { fontSize: "13.5px", lineHeight: "1.6" },
      html: D.esc(I.tn("tools.bridgeConfirm", free.length, { v: free.length, t: bridge.totalDays })) +
        (names ? "<br><span class='muted'>" + D.esc(names) + "</span>" : "")
    }));

    var chips = D.el("div.chipset");
    bridge.dates.forEach(function (iso) {
      var taken = recorded.indexOf(iso) >= 0;
      var rec = taken ? App.store.getDay(iso) : null;
      chips.appendChild(D.el("span.tag" + (taken ? ".info" : ""), {
        text: shortDate(iso) + (taken ? " · " + (rec.type ? typeText(rec) : I.t("tools.qeStatusKept")) : "")
      }));
    });
    body.appendChild(chips);

    if (recorded.length) {
      var info = D.el("div.notice.info");
      info.innerHTML = D.icon("info") + "<div>" +
        D.esc(I.tn("tools.bridgeSkipRecorded", recorded.length)) + "</div>";
      body.appendChild(info);
    }

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var ok = D.el("button.btn.primary", {
      type: "button", disabled: !free.length,
      text: free.length ? I.tn("tools.bridgeApply", free.length) : I.t("tools.qeNothing")
    });
    var m = D.modal({ title: I.t("tools.bridges"), body: body, size: "slim", footer: [cancel, ok] });

    cancel.addEventListener("click", function () { m.close(); });
    ok.addEventListener("click", function () {
      if (!free.length) return;
      var patch = {};
      free.forEach(function (iso) {
        patch[iso] = { type: "vacation", absenceFactor: 1, start: "", end: "", breaks: [] };
      });
      var written = App.store.setDays(patch, { label: "bridge" }).written;
      App.afterChange();
      m.close();
      if (!written) return;
      D.toast(I.tn("tools.bridgeDone", written), {
        tone: "plus", icon: "umbrella",
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
      if (App.settings().confetti !== false) D.confetti({ count: 60 });
    });
  }

  /* ==================================================================== */
  /* 4 · Monatscheck                                                       */
  /* ==================================================================== */

  /** Ab wann gibt es überhaupt etwas zu prüfen? Erster Eintrag bzw. Kontobeginn. */
  function auditSince(App) {
    var keys = Object.keys(App.store.allDays() || {}).filter(function (k) {
      return P.hasContent(App.store.getDay(k));
    }).sort();
    var first = keys.length ? keys[0] : null;
    var from = App.settings().carryOverFrom || null;
    if (first && from && from > first) return from;
    return first;
  }

  function auditCard(App) {
    var card = D.el("section.card.mt-4");
    var today = T.todayISO();
    var current = T.monthKey(today);
    var since = auditSince(App);
    var firstMonth = since ? T.monthKey(since) : current;
    if (!checkMonth || checkMonth > current || checkMonth < firstMonth) checkMonth = current;

    var head = D.el("div.card-head");
    head.innerHTML = "<h2>" + D.esc(I.t("tools.audit")) + "</h2>";
    var actions = D.el("div.actions");
    var monthSel = D.el("select.select", { style: { minWidth: "150px" }, "aria-label": I.t("tools.audit") });
    for (var i = 0; i < 12; i++) {
      var mk = T.monthKey(T.addMonths(T.startOfMonth(today), -i));
      if (mk < firstMonth) break;
      var d = T.fromISO(mk + "-01");
      monthSel.appendChild(D.el("option", {
        value: mk, text: I.monthName(d.getMonth()) + " " + d.getFullYear(),
        selected: mk === checkMonth
      }));
    }
    actions.appendChild(monthSel);
    head.appendChild(actions);
    card.appendChild(head);

    var body = D.el("div");
    card.appendChild(body);

    monthSel.addEventListener("change", function () {
      checkMonth = monthSel.value;
      draw();
    });
    draw();

    function draw() {
      D.clear(body);
      var first = checkMonth + "-01";
      var range = App.range(first, T.endOfMonth(first));
      var audit = P.auditRange(range.days, today, { since: since || today });

      /* Ein abgeschlossener Monat zählt mit seinem eingefrorenen Saldo — wie im Kalender */
      var monthBal = ZK.Closing
        ? ZK.Closing.periodBalance(App.store.allDays(), App.settings(), first, T.endOfMonth(first), range.totals.balance)
        : range.totals.balance;
      var kpis = D.el("div.grid-3.mb-4");
      kpiInto(kpis, I.t("cal.monthBalance"), App.fmtSigned(monthBal), "",
        monthBal > 0 ? "plus" : monthBal < 0 ? "minus" : "");
      kpiInto(kpis, I.t("stats.recordedDays"), String(range.totals.recordedDays), "");
      kpiInto(kpis, I.t("tools.openPoints"), String(audit.total), "",
        audit.errors ? "minus" : audit.total ? "warn" : "plus");
      body.appendChild(kpis);

      if (audit.clean) {
        var ok = D.el("div.notice.plus");
        ok.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("tools.auditClean")) + "</strong>" +
          "<div class='sub'>" + D.esc(I.t("tools.auditCleanHint")) + "</div></div>";
        body.appendChild(ok);
        return;
      }

      audit.issues.forEach(function (issue) {
        var tone = issue.level === "error" ? "minus" : issue.level === "info" ? "info" : "warn";
        var block = D.el("div.notice." + tone, { style: { marginBottom: "10px", flexDirection: "column", alignItems: "stretch" } });

        var title = D.el("div", { style: { display: "flex", gap: "10px", alignItems: "flex-start" } });
        title.innerHTML = D.icon(issue.level === "info" ? "info" : "alert") +
          "<div><strong>" + D.esc(I.t("audit." + issue.code)) + " · " + issue.count + "</strong>" +
          "<div class='sub'>" + D.esc(I.t("auditHint." + issue.code)) + "</div></div>";
        block.appendChild(title);

        var chips = D.el("div.chipset", { style: { marginTop: "10px" } });
        issue.dates.slice(0, 20).forEach(function (entry) {
          var chip = D.el("button.chip", {
            type: "button",
            text: I.formatDate(entry.date, { day: "2-digit", month: "2-digit" }) +
              (entry.minutes ? " · " + App.fmt(entry.minutes) : "")
          });
          chip.addEventListener("click", function () {
            ZK.DayModal.open(App, entry.date, function () { App.renderChrome(); App.renderView(); });
          });
          chips.appendChild(chip);
        });
        if (issue.count > 20) {
          chips.appendChild(D.el("span.tag", { text: "+ " + (issue.count - 20) }));
        }
        block.appendChild(chips);
        body.appendChild(block);
      });
    }

    return card;
  }

  /* -------------------------------------------------------------------- */
  function kpiInto(host, title, value, sub, tone) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone === "plus" ? " tone-plus" : tone === "minus" ? " tone-minus" : "") + '">' +
      D.esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + D.esc(sub) + "</div>" : "");
    host.appendChild(node);
  }
})(typeof self !== "undefined" ? self : this);
