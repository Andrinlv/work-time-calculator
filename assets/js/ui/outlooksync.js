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
        D.toast(String(err.message || err), { tone: "minus", duration: 8000 });
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
      var plan = CS.planSync(mapped, function (iso) { return App.store.getDay(iso); }, range);
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
      var msg = String(err && err.message ? err.message : err);
      if (err && err.status === 401) msg = I.t("ol.sessionExpired");
      if (!opts.silent) D.toast(msg, { tone: "minus", duration: 9000 });
      return null;
    });
  }

  function deviceTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch (e) { return "UTC"; }
  }

  /* ------------------------------------------------------------------ */
  /* Vorschau                                                            */
  /* ------------------------------------------------------------------ */

  function showPreview(App, plan) {
    var body = D.el("div.col");

    /* Kopfzeile mit Zahlen */
    var summary = D.el("div.grid-3.mb-4");
    kpi(summary, I.t("ol.changes"), String(plan.changes.length), "", plan.changes.length ? "info" : "");
    kpi(summary, I.t("ol.unchanged"), String(plan.unchanged), "");
    kpi(summary, I.t("ol.protected"), String(plan.protectedDays.length), "", plan.protectedDays.length ? "warn" : "");
    body.appendChild(summary);

    body.appendChild(D.el("p.muted", {
      style: { fontSize: "12px", marginBottom: "10px" },
      text: I.t("ol.rangeInfo", {
        from: I.formatDate(plan.range.from, { day: "2-digit", month: "2-digit", year: "numeric" }),
        to: I.formatDate(plan.range.to, { day: "2-digit", month: "2-digit", year: "numeric" }),
        events: plan.eventCount
      })
    }));

    if (!plan.changes.length) {
      var ok = D.el("div.notice.plus");
      ok.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("ol.upToDate")) + "</strong></div>";
      body.appendChild(ok);
    } else {
      var list = D.el("div", {
        style: { maxHeight: "42vh", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }
      });
      var selected = Object.create(null);
      plan.changes.forEach(function (change, i) { selected[i] = true; });

      plan.changes.forEach(function (change, i) {
        list.appendChild(changeRow(App, change, i, selected));
      });
      body.appendChild(list);
      plan._selected = selected;
    }

    /* Geschützte Tage benennen — Vertrauen entsteht durch Sichtbarkeit */
    if (plan.protectedDays.length) {
      var warn = D.el("div.notice.warn.mt-4");
      warn.innerHTML = D.icon("lock") +
        "<div><strong>" + D.esc(I.tn("ol.protectedTitle", plan.protectedDays.length)) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("ol.protectedHint")) + "</div></div>";
      body.appendChild(warn);

      var chips = D.el("div.chipset.mt-3");
      plan.protectedDays.slice(0, 24).forEach(function (p) {
        var chip = D.el("button.chip", {
          type: "button",
          text: I.formatDate(p.date, { day: "2-digit", month: "2-digit" }) + " · " + I.t("type." + p.proposal.type)
        });
        chip.addEventListener("click", function () {
          ZK.DayModal.open(App, p.date, function () { App.renderChrome(); App.renderView(); });
        });
        chips.appendChild(chip);
      });
      body.appendChild(chips);
    }

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var apply = D.el("button.btn.primary", {
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

    cancel.addEventListener("click", function () { m.close(); });
    apply.addEventListener("click", function () {
      var chosen = plan.changes.filter(function (c, i) { return plan._selected[i]; });
      m.close();
      applyChanges(App, chosen);
    });
  }

  function changeRow(App, change, index, selected) {
    var row = D.el("label", {
      style: {
        display: "grid",
        gridTemplateColumns: "26px 92px minmax(0,1fr) auto",
        gap: "10px",
        alignItems: "center",
        padding: "9px 12px",
        borderBottom: "1px solid var(--line-faint)",
        cursor: "pointer"
      }
    });

    var box = D.el("input", { type: "checkbox", checked: true, style: { width: "16px", height: "16px" } });
    box.addEventListener("change", function () { selected[index] = box.checked; });
    row.appendChild(box);

    var wd = T.weekdayOf(change.date);
    row.appendChild(D.el("div", {
      html: "<b style='font-size:12.5px'>" + D.esc(I.weekdayName(wd, "short")) + " " +
        D.esc(I.formatDate(change.date, { day: "2-digit", month: "2-digit" })) + "</b>"
    }));

    var desc = D.el("div", { style: { minWidth: "0", fontSize: "12.5px" } });
    if (change.action === "clear") {
      desc.innerHTML = "<span class='tone-minus'>" + D.esc(I.t("ol.willClear")) + "</span>" +
        (change.before && change.before.type
          ? " <span class='muted'>(" + D.esc(I.t("type." + change.before.type)) + ")</span>" : "");
    } else if (change.action === "location") {
      desc.innerHTML = D.icon("home") + " <b>" + D.esc(I.t("loc." + change.location)) + "</b>" +
        (change.subject ? " <span class='muted'>· " + D.esc(change.subject) + "</span>" : "");
    } else {
      desc.innerHTML =
        "<b style='color:" + R.dayType(change.type).color + "'>" + D.esc(I.t("type." + change.type)) + "</b>" +
        (change.factor < 1 ? " <span class='tag'>" + Math.round(change.factor * 100) + " %</span>" : "") +
        (change.subject ? " <span class='muted'>· " + D.esc(change.subject) + "</span>" : "");
    }
    row.appendChild(desc);

    var tag = change.reason === "new" ? I.t("ol.tagNew")
      : change.reason === "update" ? I.t("ol.tagUpdate")
        : change.reason === "homeoffice" ? I.t("loc.home")
          : I.t("ol.tagRemoved");
    row.appendChild(D.el("span.tag", { text: tag }));

    return row;
  }

  function applyChanges(App, changes) {
    if (!changes.length) return;
    var stamp = new Date().toISOString();
    var patch = CS.buildPatch(changes, stamp);

    App.store.setDays(patch, { label: "outlook" });
    saveSettings(App, { lastSyncAt: stamp });
    App.afterChange();

    D.toast(I.tn("ol.applied", changes.length), {
      tone: "plus",
      icon: "calendar",
      action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
    });
  }

  function kpi(host, title, value, sub, tone) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono">' + D.esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + D.esc(sub) + "</div>" : "");
    host.appendChild(node);
  }

  /* ------------------------------------------------------------------ */
  /* Kalenderauswahl                                                     */
  /* ------------------------------------------------------------------ */

  function chooseCalendars(App) {
    var s = settingsOf(App);
    var body = D.el("div.col");
    body.appendChild(D.el("p.muted", { text: I.t("ol.calendarsHint"), style: { fontSize: "13px" } }));
    var list = D.el("div.col", { style: { gap: "6px" } });
    body.appendChild(list);
    list.appendChild(D.el("div.skeleton", { style: { height: "44px" } }));

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var save = D.el("button.btn.primary", { type: "button", text: I.t("common.save"), disabled: true });
    var m = D.modal({ title: I.t("ol.calendars"), body: body, footer: [cancel, save] });
    cancel.addEventListener("click", function () { m.close(); });

    var chosen = (s.calendarIds || ["primary"]).slice();

    ZK.Graph.listCalendars().then(function (calendars) {
      D.clear(list);
      save.disabled = false;
      calendars.forEach(function (cal) {
        var id = cal.isDefaultCalendar ? "primary" : cal.id;
        var wrap = D.el("label.switch", { style: { justifyContent: "space-between", width: "100%" } });
        var input = D.el("input", { type: "checkbox", checked: chosen.indexOf(id) >= 0 });
        input.addEventListener("change", function () {
          var at = chosen.indexOf(id);
          if (input.checked && at < 0) chosen.push(id);
          if (!input.checked && at >= 0) chosen.splice(at, 1);
        });
        wrap.appendChild(input);
        wrap.appendChild(D.el("span.track"));
        wrap.appendChild(D.el("span.lbl", {
          html: D.esc(cal.name || "—") + (cal.isDefaultCalendar ? "<small>" + D.esc(I.t("ol.defaultCalendar")) + "</small>" : "")
        }));
        list.appendChild(wrap);
      });
      if (!calendars.length) {
        list.appendChild(D.el("p.muted", { text: I.t("common.empty"), style: { fontSize: "13px" } }));
      }
    }).catch(function (err) {
      D.clear(list);
      var box = D.el("div.notice.minus");
      box.innerHTML = D.icon("alert") + "<div>" + D.esc(String(err.message || err)) + "</div>";
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
    body.appendChild(D.el("p.muted", { text: I.t("ol.rulesHint"), style: { fontSize: "13px" } }));

    rules.forEach(function (rule) {
      var card = D.el("div", {
        style: { border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "12px" }
      });

      var head = D.el("div.row", { style: { justifyContent: "space-between", marginBottom: "8px" } });
      var label = rule.locationOnly
        ? I.t("loc." + rule.locationOnly)
        : I.t("type." + rule.type);
      head.appendChild(D.el("b", {
        text: label,
        style: { fontSize: "13px", color: rule.locationOnly ? "var(--ink)" : R.dayType(rule.type).color }
      }));

      var toggle = D.el("label.switch");
      var input = D.el("input", { type: "checkbox", checked: rule.enabled !== false });
      input.addEventListener("change", function () { rule.enabled = input.checked; });
      toggle.appendChild(input);
      toggle.appendChild(D.el("span.track"));
      head.appendChild(toggle);
      card.appendChild(head);

      if (rule.showAs && rule.showAs.length) {
        card.appendChild(D.el("div", {
          style: { fontSize: "11px", color: "var(--ink-3)", marginBottom: "6px" },
          text: I.t("ol.showAsMatch", { v: rule.showAs.join(", ") })
        }));
      }

      var field = D.el("div.field");
      field.appendChild(D.el("label", { text: I.t("ol.keywords") }));
      var kw = D.el("input.input", {
        type: "text",
        value: (rule.keywords || []).join(", "),
        placeholder: I.t("ol.keywordsPlaceholder")
      });
      kw.addEventListener("change", function () {
        rule.keywords = kw.value.split(",").map(function (k) { return k.trim(); }).filter(Boolean);
      });
      field.appendChild(kw);
      card.appendChild(field);
      body.appendChild(card);
    });

    var reset = D.el("button.btn.ghost.left", { type: "button", text: I.t("common.reset") });
    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var save = D.el("button.btn.primary", { type: "button", text: I.t("common.save") });

    var m = D.modal({ title: I.t("ol.rules"), body: body, size: "wide", footer: [reset, cancel, save] });
    cancel.addEventListener("click", function () { m.close(); });
    reset.addEventListener("click", function () {
      saveSettings(App, { rules: CS.DEFAULT_RULES.map(function (r) { return Object.assign({}, r); }) });
      m.close();
      App.renderView();
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
    chooseCalendars: chooseCalendars,
    editRules: editRules,
    deviceTimeZone: deviceTimeZone
  };
})(typeof self !== "undefined" ? self : this);
