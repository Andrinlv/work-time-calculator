/* ==========================================================================
   ZEITKONTO — Outlook-Abgleich (Ablauf und Vorschau)
   --------------------------------------------------------------------------
   Verbindet Anmeldung, Graph-Abruf und Regelwerk zu einem Vorgang, den der
   Nutzer versteht und bestätigt. Grundsatz: der Abgleich schlägt vor, er
   entscheidet nicht.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n;
  var CS = ZK.CalendarSync;

  var running = false;

  /* ------------------------------------------------------------------ */
  /* Einstellungen                                                       */
  /* ------------------------------------------------------------------ */

  function settingsOf(App) {
    return Object.assign(CS.defaultSettings(), App.settings().outlook || {});
  }

  function saveSettings(App, patch) {
    var next = Object.assign(settingsOf(App), patch);
    App.store.updateSettings({ outlook: next });
    configure(App);
    return next;
  }

  /** Überträgt die gespeicherten Werte in den Anmeldeclient. */
  function configure(App) {
    var s = settingsOf(App);
    ZK.MsAuth.configure({
      clientId: (s.clientId || "").trim() || null,
      tenant: (s.tenant || "common").trim() || "common"
    });
    return s;
  }

  function status(App) {
    var s = settingsOf(App);
    return {
      settings: s,
      supported: ZK.MsAuth.isSupported(),
      configured: ZK.MsAuth.isConfigured(),
      signedIn: ZK.MsAuth.isSignedIn(),
      account: ZK.MsAuth.account(),
      redirectUri: ZK.MsAuth.defaultRedirectUri()
    };
  }

  /* ------------------------------------------------------------------ */
  /* Anmeldung                                                           */
  /* ------------------------------------------------------------------ */

  function signIn(App) {
    configure(App);
    if (!ZK.MsAuth.isSupported()) {
      D.toast(I.t("ol.needsHttps"), { tone: "warn", duration: 7000 });
      return Promise.resolve(false);
    }
    if (!ZK.MsAuth.isConfigured()) {
      D.toast(I.t("ol.needsClientId"), { tone: "warn", duration: 7000 });
      return Promise.resolve(false);
    }
    return ZK.MsAuth.signIn({ prompt: "select_account", returnTo: "#/settings/" + App.date })
      .catch(function (err) {
        D.toast(errorText(err, "ol.err.signIn"), { tone: "minus", duration: 8000 });
        return false;
      });
  }

  function signOut(App) {
    ZK.MsAuth.signOut();
    saveSettings(App, { lastSyncAt: null });
    App.afterChange();
    D.toast(I.t("ol.signedOut"));
  }

  /* ------------------------------------------------------------------ */
  /* Abgleich                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * @param {Object} opts { silent: true = ohne Vorschau nur prüfen und melden }
   */
  function run(App, opts) {
    opts = opts || {};
    if (running) return Promise.resolve(null);
    var s = configure(App);

    if (!ZK.MsAuth.isSignedIn()) {
      if (!opts.silent) D.toast(I.t("ol.notSignedIn"), { tone: "warn" });
      return Promise.resolve(null);
    }

    running = true;
    var range = CS.syncRange(s);
    var timeZone = deviceTimeZone();
    var dismiss = opts.silent ? null : D.toast(I.t("ol.fetching"), { duration: 60000, icon: "refresh" });

    var calendarIds = (s.calendarIds && s.calendarIds.length) ? s.calendarIds : ["primary"];

    return Promise.all(calendarIds.map(function (id) {
      return ZK.Graph.calendarView({
        calendarId: id,
        from: range.from,
        to: range.to,
        timeZone: timeZone
      }).catch(function (err) {
        // Ein einzelner unlesbarer Kalender darf den Rest nicht verhindern
        if (root.console) console.warn("Kalender übersprungen:", id, err.message);
        return [];
      });
    })).then(function (lists) {
      var events = [];
      var seen = Object.create(null);
      lists.forEach(function (list) {
        list.forEach(function (ev) {
          if (ev && ev.id && !seen[ev.id]) { seen[ev.id] = true; events.push(ev); }
        });
      });

      var mapped = CS.mapEvents(events, s);
      /* Abgeschlossene Monate nehmen nichts an: dort nichts anbieten und
         nichts zählen — sonst meldete jeder stille Abgleich dieselben Tage */
      var plan = CS.planSync(mapped, function (iso) { return App.store.getDay(iso); }, Object.assign({}, range, {
        isLocked: function (iso) { return !!(App.store.isLocked && App.store.isLocked(iso)); }
      }));
      plan.eventCount = events.length;
      plan.range = range;

      if (dismiss) dismiss();
      running = false;

      if (opts.silent) {
        if (plan.changes.length) {
          D.toast(I.tn("ol.changesFound", plan.changes.length), {
            icon: "calendar",
            duration: 9000,
            action: { label: I.t("common.apply"), onClick: function () { showPreview(App, plan); } }
          });
        }
        return plan;
      }

      showPreview(App, plan);
      return plan;
    }).catch(function (err) {
      running = false;
      if (dismiss) dismiss();
      if (!opts.silent) D.toast(errorText(err, "ol.err.sync"), { tone: "minus", duration: 9000 });
      return null;
    });
  }

  function deviceTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch (e) { return "UTC"; }
  }

  /* ------------------------------------------------------------------ */
  /* Texte                                                               */
  /* ------------------------------------------------------------------ */

  /** Outlook-Status („showAs“) so benannt, wie ihn Outlook selbst anzeigt. */
  function showAsLabel(value) {
    var key = "ol.showAs." + value;
    var text = I.t(key);
    return text === key ? String(value) : text;
  }

  /**
   * Verständliche Fehlermeldung statt roher Browser- oder Graph-Texte.
   * `fallbackKey` beschreibt, was gerade nicht geklappt hat.
   */
  function errorText(err, fallbackKey) {
    var status = err && err.status;
    if (status === 401) return I.t("ol.sessionExpired");
    if (status === 403) return I.t("ol.err.forbidden");
    if (status === 429) return I.t("ol.err.busy");
    if (typeof navigator !== "undefined" && navigator.onLine === false) return I.t("ol.err.offline");
    if (err && (err.name === "TypeError" || /fetch|network/i.test(String(err.message || "")))) return I.t("ol.err.network");
    return I.t(fallbackKey || "ol.err.sync") + (status ? " (HTTP " + status + ")" : "");
  }

  /* ------------------------------------------------------------------ */
  /* Vorschau                                                            */
  /* ------------------------------------------------------------------ */

  function showPreview(App, plan) {
    var body = D.el("div.ol-preview");

    /* Kopfzeile mit Zahlen — auch auf dem Telefon in einer Reihe */
    var summary = D.el("div.ol-kpis");
    kpi(summary, I.t("ol.changes"), plan.changes.length, plan.changes.length ? "info" : "");
    kpi(summary, I.t("ol.unchanged"), plan.unchanged, "");
    kpi(summary, I.t("ol.protected"), plan.protectedDays.length, plan.protectedDays.length ? "warn" : "");
    body.appendChild(summary);

    body.appendChild(D.el("p.ol-range", {
      text: I.t("ol.rangeInfo", {
        from: I.formatDate(plan.range.from, { day: "2-digit", month: "2-digit", year: "numeric" }),
        to: I.formatDate(plan.range.to, { day: "2-digit", month: "2-digit", year: "numeric" }),
        events: plan.eventCount
      })
    }));

    var selected = Object.create(null);
    var apply;
    if (!plan.changes.length) {
      var ok = D.el("div.notice.plus");
      ok.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("ol.upToDate")) + "</strong></div>";
      body.appendChild(ok);
    } else {
      /* Eine Liste ohne eigenen Rollbalken — gerollt wird nur der Dialog */
      var list = D.el("div.ol-changes");
      plan.changes.forEach(function (change, i) {
        selected[i] = true;
        list.appendChild(changeRow(change, i, selected, function () { updateApply(); }));
      });
      body.appendChild(list);
    }

    /* Geschützte Tage benennen — Vertrauen entsteht durch Sichtbarkeit:
       eigene Erfassungen und Tage abgeschlossener Monate getrennt */
    var own = plan.protectedDays.filter(function (p) { return p.reason !== "closed"; });
    var closed = plan.protectedDays.filter(function (p) { return p.reason === "closed"; });
    protectedBlock(App, body, own, "warn", I.tn("ol.protectedTitle", own.length), I.t("ol.protectedHint"));
    protectedBlock(App, body, closed, "info", I.tn("ol.closedTitle", closed.length), I.t("ol.closedHint"));

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    apply = D.el("button.btn.primary", {
      type: "button",
      text: I.t("ol.applyN", { n: plan.changes.length }),
      disabled: plan.changes.length === 0
    });

    var m = D.modal({
      title: I.t("ol.previewTitle"),
      sub: I.t("ol.previewSub"),
      body: body,
      size: "wide",
      footer: [cancel, apply]
    });
    m.box.classList.add("ol-modal");

    function chosen() {
      return plan.changes.filter(function (c, i) { return selected[i]; });
    }
    function updateApply() {
      var n = chosen().length;
      apply.textContent = I.t("ol.applyN", { n: n });
      apply.disabled = n === 0;
    }

    cancel.addEventListener("click", function () { m.close(); });
    apply.addEventListener("click", function () {
      var list = chosen();
      m.close();
      applyChanges(App, list);
    });
  }

  /** Was der Kalender an einem geschützten Tag gewollt hätte. */
  function protectedLabel(p) {
    var c = p.change;
    if (c && c.action === "clear") return I.t("ol.willClear");
    if (c && c.action === "location") return I.t("loc." + c.location);
    var type = (c && c.type) || (p.proposal && p.proposal.type);
    return type ? I.t("type." + type) : "";
  }

  function protectedBlock(App, body, list, tone, title, hint) {
    if (!list.length) return;
    var box = D.el("div.notice." + tone + ".mt-4");
    box.innerHTML = D.icon("lock") +
      "<div><strong>" + D.esc(title) + "</strong>" +
      "<div class='sub'>" + D.esc(hint) + "</div></div>";
    body.appendChild(box);

    var chips = D.el("div.chipset.mt-3");
    list.slice(0, 24).forEach(function (p) {
      var what = protectedLabel(p);
      var chip = D.el("button.chip", {
        type: "button",
        text: I.formatDate(p.date, { day: "2-digit", month: "2-digit" }) + (what ? " · " + what : "")
      });
      chip.addEventListener("click", function () {
        ZK.DayModal.open(App, p.date, function () { App.renderChrome(); App.renderView(); });
      });
      chips.appendChild(chip);
    });
    if (list.length > 24) chips.appendChild(D.el("span.tag", { text: "+ " + (list.length - 24) }));
    body.appendChild(chips);
  }

  function changeRow(change, index, selected, onToggle) {
    var row = D.el("label.ol-change");

    var box = D.el("input", { type: "checkbox", checked: true });
    box.addEventListener("change", function () {
      selected[index] = box.checked;
      row.classList.toggle("off", !box.checked);
      onToggle();
    });
    row.appendChild(box);

    var wd = T.weekdayOf(change.date);
    row.appendChild(D.el("span.ol-date", {
      text: String(I.weekdayName(wd, "short")).replace(/\.$/, "") + " " + I.formatDate(change.date, { day: "2-digit", month: "2-digit" })
    }));

    var desc = D.el("span.ol-desc");
    var subject = change.subject ? "<span class='ol-subj'>" + D.esc(change.subject) + "</span>" : "";
    if (change.action === "clear") {
      desc.innerHTML = "<b class='tone-minus'>" + D.esc(I.t("ol.willClear")) + "</b>" +
        (change.before && change.before.type
          ? "<span class='ol-subj'>" + D.esc(I.t("type." + change.before.type)) + "</span>" : "");
    } else if (change.action === "location") {
      desc.innerHTML = D.icon("home") + "<b>" + D.esc(I.t("loc." + change.location)) + "</b>" + subject;
    } else {
      desc.innerHTML =
        "<b style='color:" + R.dayType(change.type).color + "'>" + D.esc(I.t("type." + change.type)) + "</b>" +
        (change.factor < 1 ? "<span class='tag'>" + Math.round(change.factor * 100) + " %</span>" : "") +
        subject;
    }
    if (change.subject) row.title = change.subject;
    row.appendChild(desc);

    var tag = change.reason === "new" ? I.t("ol.tagNew")
      : change.reason === "update" ? I.t("ol.tagUpdate")
        : change.reason === "homeoffice" ? I.t("loc.home")
          : I.t("ol.tagRemoved");
    row.appendChild(D.el("span.tag.ol-tag", { text: tag }));

    return row;
  }

  function applyChanges(App, changes) {
    if (!changes.length) return;
    var stamp = new Date().toISOString();
    var patch = CS.buildPatch(changes, stamp);

    // Gemeldet wird, was der Speicher angenommen hat (ein gesperrter Tag meldet sich selbst)
    var written = App.store.setDays(patch, { label: "outlook" }).written;
    saveSettings(App, { lastSyncAt: stamp });
    App.afterChange();

    if (!written) return;
    D.toast(I.tn("ol.applied", written), {
      tone: "plus",
      icon: "calendar",
      action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
    });
  }

  function kpi(host, title, value, tone) {
    var node = D.el("div.ol-kpi" + (tone ? "." + tone : ""));
    node.innerHTML = '<span class="k-title">' + D.esc(title) + "</span>" +
      '<b class="k-val mono">' + D.esc(String(value)) + "</b>";
    host.appendChild(node);
  }

  /* ------------------------------------------------------------------ */
  /* Kalenderauswahl                                                     */
  /* ------------------------------------------------------------------ */

  function chooseCalendars(App) {
    var s = settingsOf(App);
    var body = D.el("div.col");
    body.appendChild(D.el("p.muted.ol-hint", { text: I.t("ol.calendarsHint") }));
    var list = D.el("div.ol-cals");
    body.appendChild(list);
    list.appendChild(D.el("div.skeleton", { style: { height: "52px" } }));
    list.appendChild(D.el("div.skeleton", { style: { height: "52px" } }));

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var save = D.el("button.btn.primary", { type: "button", text: I.t("common.save"), disabled: true });
    var m = D.modal({ title: I.t("ol.calendars"), body: body, footer: [cancel, save] });
    m.box.classList.add("ol-modal");
    cancel.addEventListener("click", function () { m.close(); });

    var chosen = (s.calendarIds || ["primary"]).slice();

    ZK.Graph.listCalendars().then(function (calendars) {
      D.clear(list);
      save.disabled = false;
      calendars.forEach(function (cal) {
        var id = cal.isDefaultCalendar ? "primary" : cal.id;
        /* Name links, Schalter rechts — wie jede Einstellungszeile */
        var row = D.el("label.ol-cal", { title: cal.name || "" });
        var text = D.el("span.ol-cal-name", {
          html: "<b>" + D.esc(cal.name || "—") + "</b>" +
            (cal.isDefaultCalendar ? "<small>" + D.esc(I.t("ol.defaultCalendar")) + "</small>" : "")
        });
        row.appendChild(text);
        var sw = D.el("span.switch");
        var input = D.el("input", { type: "checkbox", checked: chosen.indexOf(id) >= 0, "aria-label": cal.name || "—" });
        input.addEventListener("change", function () {
          var at = chosen.indexOf(id);
          if (input.checked && at < 0) chosen.push(id);
          if (!input.checked && at >= 0) chosen.splice(at, 1);
        });
        sw.appendChild(input);
        sw.appendChild(D.el("span.track"));
        row.appendChild(sw);
        list.appendChild(row);
      });
      if (!calendars.length) {
        list.appendChild(D.el("p.muted.ol-hint", { text: I.t("ol.noCalendars") }));
      }
    }).catch(function (err) {
      D.clear(list);
      var box = D.el("div.notice.minus");
      box.innerHTML = D.icon("alert") + "<div>" + D.esc(errorText(err, "ol.err.calendars")) + "</div>";
      list.appendChild(box);
    });

    save.addEventListener("click", function () {
      saveSettings(App, { calendarIds: chosen.length ? chosen : ["primary"] });
      m.close();
      App.renderView();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Regeln bearbeiten                                                   */
  /* ------------------------------------------------------------------ */

  function editRules(App) {
    var s = settingsOf(App);
    var rules = s.rules.map(function (r) { return Object.assign({}, r); });

    var body = D.el("div.col");
    body.appendChild(D.el("p.muted.ol-hint", { text: I.t("ol.rulesHint") }));
    var grid = D.el("div.ol-rules");
    body.appendChild(grid);

    rules.forEach(function (rule, i) {
      var card = D.el("div.ol-rule");
      /* Reine Statusregel (z. B. „Abwesend“ ohne Stichwort): kein Stichwortfeld */
      var statusOnly = !rule.keywords && rule.showAs && rule.showAs.length;
      var statusText = (rule.showAs || []).map(function (v) { return I.t("ol.quoted", { v: showAsLabel(v) }); }).join(", ");

      var head = D.el("label.ol-rule-head");
      var label = rule.locationOnly ? I.t("loc." + rule.locationOnly) : I.t("type." + rule.type);
      head.appendChild(D.el("b", {
        text: label,
        style: { color: rule.locationOnly ? "var(--ink)" : R.dayType(rule.type).color }
      }));
      var toggle = D.el("span.switch");
      var input = D.el("input", { type: "checkbox", checked: rule.enabled !== false, "aria-label": label });
      input.addEventListener("change", function () {
        rule.enabled = input.checked;
        card.classList.toggle("off", !input.checked);
      });
      toggle.appendChild(input);
      toggle.appendChild(D.el("span.track"));
      head.appendChild(toggle);
      card.appendChild(head);
      card.classList.toggle("off", rule.enabled === false);

      if (statusOnly) {
        card.appendChild(D.el("p.ol-rule-note", {
          text: I.t(rule.allDayOnly ? "ol.ruleStatusAllDay" : "ol.ruleStatus", { status: statusText })
        }));
      } else {
        if (statusText) {
          card.appendChild(D.el("p.ol-rule-note", { text: I.t("ol.showAsMatch", { v: statusText }) }));
        }
        var field = D.el("div.field");
        var id = "ol-kw-" + (rule.id || i);
        field.appendChild(D.el("label", { text: I.t("ol.keywords"), "for": id }));
        var kw = D.el("input.input", {
          type: "text",
          id: id,
          value: (rule.keywords || []).join(", "),
          placeholder: I.t("ol.keywordsPlaceholder")
        });
        kw.addEventListener("change", function () {
          rule.keywords = kw.value.split(",").map(function (k) { return k.trim(); }).filter(Boolean);
        });
        field.appendChild(kw);
        card.appendChild(field);
      }
      grid.appendChild(card);
    });

    var reset = D.el("button.btn.ghost.left", { type: "button", text: I.t("common.reset") });
    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var save = D.el("button.btn.primary", { type: "button", text: I.t("common.save") });

    var m = D.modal({ title: I.t("ol.rules"), body: body, size: "wide", footer: [reset, cancel, save] });
    m.box.classList.add("ol-modal");
    cancel.addEventListener("click", function () { m.close(); });
    reset.addEventListener("click", function () {
      saveSettings(App, { rules: CS.DEFAULT_RULES.map(function (r) { return Object.assign({}, r); }) });
      m.close();
      App.renderView();
      D.toast(I.t("ol.rulesReset"));
    });
    save.addEventListener("click", function () {
      saveSettings(App, { rules: rules });
      m.close();
      App.renderView();
      D.toast(I.t("common.saved"));
    });
  }

  ZK.OutlookSync = {
    settingsOf: settingsOf,
    saveSettings: saveSettings,
    configure: configure,
    status: status,
    signIn: signIn,
    signOut: signOut,
    run: run,
    showPreview: showPreview,
    chooseCalendars: chooseCalendars,
    editRules: editRules,
    showAsLabel: showAsLabel,
    errorText: errorText,
    deviceTimeZone: deviceTimeZone
  };
})(typeof self !== "undefined" ? self : this);
