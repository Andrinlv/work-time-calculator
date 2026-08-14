/* ==========================================================================
   ZEITKONTO — Ansicht „Einstellungen“
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, H = ZK.Holidays, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).settings = { render: render };

  function render(host, App) {
    var s = App.settings();

    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("set.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("set.lede") }));
    head.appendChild(left);
    var wizard = D.el("button.btn.sm", { type: "button", html: D.icon("zap") + "<span>" + D.esc(I.t("onb.welcome")) + "</span>" });
    wizard.addEventListener("click", function () { App.runOnboarding(true); });
    head.appendChild(wizard);
    host.appendChild(head);

    var grid = D.el("div.settings-grid");
    host.appendChild(grid);

    /* ================================================================ */
    /* Darstellung                                                       */
    /* ================================================================ */
    var look = section(I.t("set.appearance"), "sun");
    look.body.appendChild(rowSegmented(I.t("set.theme"), "", [
      ["auto", I.t("set.theme.auto")], ["light", I.t("set.theme.light")], ["dark", I.t("set.theme.dark")]
    ], s.theme || "auto", function (v) {
      App.store.updateSettings({ theme: v });
      App.applyTheme();
      App.renderChrome();
      App.renderView();
    }));

    look.body.appendChild(rowSelect(I.t("set.language"), "", I.LANGS.map(function (l) {
      return [l, I.DICT[l]["lang.name"]];
    }), s.lang || "de", function (v) {
      App.store.updateSettings({ lang: v });
      App.applyLanguage(v);
      App.afterChange();
    }));

    look.body.appendChild(rowSegmented(I.t("set.density"), "", [
      ["compact", I.t("set.density.compact")], ["normal", I.t("set.density.normal")], ["cozy", I.t("set.density.cozy")]
    ], s.density || "normal", function (v) {
      App.store.updateSettings({ density: v });
      App.applyDensity();
    }));

    look.body.appendChild(rowSwitch(I.t("set.contrast"), I.t("set.contrastHint"), s.contrast === "high", function (on) {
      App.store.updateSettings({ contrast: on ? "high" : "normal" });
      App.applyDensity();
    }));

    look.body.appendChild(rowSegmented(I.t("set.durationStyle"), "", [
      ["hm", I.t("set.durationStyle.hm")], ["clock", I.t("set.durationStyle.clock")], ["decimal", I.t("set.durationStyle.decimal")]
    ], s.durationStyle || "hm", function (v) {
      App.store.updateSettings({ durationStyle: v });
      App.afterChange();
    }));

    look.body.appendChild(rowSegmented(I.t("set.firstDay"), "", [
      [1, I.weekdayName(1, "long")], [0, I.weekdayName(0, "long")]
    ], s.firstDayOfWeek === 0 ? 0 : 1, function (v) {
      App.store.updateSettings({ firstDayOfWeek: +v });
      App.afterChange();
    }));

    look.body.appendChild(rowSwitch(I.t("set.showSeconds"), "", s.showSeconds !== false, function (on) {
      App.store.updateSettings({ showSeconds: on });
    }));
    grid.appendChild(look.node);

    /* ================================================================ */
    /* Arbeitsmodell                                                     */
    /* ================================================================ */
    var model = section(I.t("set.model"), "briefcase");

    model.body.appendChild(rowSelect(I.t("set.preset"), "", R.MODEL_PRESETS.map(function (p) {
      return [p.key, p.label + (p.note ? " · " + p.note : "")];
    }), s.modelPreset || "42", function (v) {
      var preset = R.MODEL_PRESETS.filter(function (p) { return p.key === v; })[0];
      var patch = { modelPreset: v };
      if (preset && preset.weekly) patch.weeklyTargets = R.weeklyPreset(preset.weekly, s.workdays || [1, 2, 3, 4, 5]);
      App.store.updateSettings(patch);
      App.renderView();
      App.renderChrome();
    }));

    model.body.appendChild(rowNumber(I.t("set.workload"), I.t("set.workloadHint"), s.workloadPercent || 100, "%", function (v) {
      App.store.updateSettings({ workloadPercent: Math.max(1, Math.min(200, v)) });
      App.renderView();
      App.renderChrome();
    }));

    var wdRow = D.el("div", { style: { paddingTop: "12px" } });
    wdRow.appendChild(D.el("div", {
      html: "<b style='font-size:13px;font-weight:750'>" + D.esc(I.t("set.weekdayTargets")) + "</b>" +
        "<span style='display:block;font-size:11px;color:var(--ink-3);margin:2px 0 10px'>" + D.esc(I.t("set.weekdayHint")) + "</span>"
    }));
    var wdGrid = D.el("div.weekday-grid");
    var order = s.firstDayOfWeek === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
    order.forEach(function (wd) {
      var field = D.el("div.field");
      field.appendChild(D.el("label", { text: I.weekdayName(wd, "short") }));
      var input = D.el("input.input.mono", {
        type: "text",
        value: T.formatDuration((s.weeklyTargets || [])[wd] || 0, "clock"),
        "aria-label": I.weekdayName(wd, "long")
      });
      input.addEventListener("change", function () {
        var mins = T.parseDuration(input.value);
        if (mins === null) mins = 0;
        var next = (App.settings().weeklyTargets || [0, 0, 0, 0, 0, 0, 0]).slice();
        next[wd] = Math.max(0, mins);
        App.store.updateSettings({ weeklyTargets: next, modelPreset: "custom" });
        input.value = T.formatDuration(next[wd], "clock");
        updateWeeklyTotal();
        App.renderChrome();
      });
      field.appendChild(input);
      wdGrid.appendChild(field);
    });
    wdRow.appendChild(wdGrid);
    var weeklyTotal = D.el("p.muted", { style: { fontSize: "12px", marginTop: "10px" } });
    wdRow.appendChild(weeklyTotal);
    model.body.appendChild(wdRow);
    updateWeeklyTotal();
    function updateWeeklyTotal() {
      var st = App.settings();
      weeklyTotal.innerHTML = "<b>" + D.esc(I.t("set.weeklyTotal")) + ":</b> " +
        D.esc(T.formatDuration(R.weeklyTargetMinutes(st), "clock")) +
        " · " + D.esc(I.t("set.workload")) + " " + (st.workloadPercent || 100) + " %";
    }
    grid.appendChild(model.node);

    /* ================================================================ */
    /* Pausen & Rundung                                                  */
    /* ================================================================ */
    var breaks = section(I.t("set.breaks"), "coffee");
    breaks.body.appendChild(rowSelect(I.t("set.breakRuleset"), "", Object.keys(R.BREAK_RULESETS).map(function (k) {
      return [k, R.BREAK_RULESETS[k].label];
    }), s.breakRuleset || "ch", function (v) {
      App.store.updateSettings({ breakRuleset: v });
      App.renderView();
    }));

    var tiers = R.BREAK_RULESETS[s.breakRuleset || "ch"];
    if (tiers && tiers.tiers.length) {
      var tierList = D.el("div", { style: { padding: "4px 0 12px" } });
      tiers.tiers.forEach(function (t) {
        tierList.appendChild(D.el("div", {
          style: { display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "5px 0", color: "var(--ink-3)" },
          html: "<span>&gt; " + D.esc(T.formatDuration(t.over, "clock")) + " " + D.esc(I.t("day.presence")) + "</span>" +
            "<span class='mono fw-8' style='color:var(--ink)'>" + D.esc(t.require) + " min</span>"
        }));
      });
      breaks.body.appendChild(tierList);
    }

    breaks.body.appendChild(rowSwitch(I.t("set.autoDeduct"), I.t("set.autoDeductHint"), s.autoDeductBreak !== false, function (on) {
      App.store.updateSettings({ autoDeductBreak: on });
      App.renderChrome();
    }));

    var lunchRow = D.el("div.setting-row");
    lunchRow.appendChild(D.el("div.info", {
      html: "<b>" + D.esc(I.t("set.defaultLunch")) + "</b><span>" + D.esc(I.t("day.template")) + "</span>"
    }));
    var lunchCtl = D.el("div.ctl.wide.row.tight");
    var lunchFrom = D.el("input.input.time", { type: "text", value: (s.defaultLunch || {}).start || "", style: { width: "78px" } });
    var lunchTo = D.el("input.input.time", { type: "text", value: (s.defaultLunch || {}).end || "", style: { width: "78px" } });
    [lunchFrom, lunchTo].forEach(function (n) {
      D.attachTimeInput(n, function () {
        App.store.updateSettings({ defaultLunch: { start: lunchFrom.value, end: lunchTo.value } });
      });
    });
    lunchCtl.appendChild(lunchFrom);
    lunchCtl.appendChild(D.el("span.muted", { text: "–" }));
    lunchCtl.appendChild(lunchTo);
    lunchRow.appendChild(lunchCtl);
    breaks.body.appendChild(lunchRow);

    breaks.body.appendChild(rowSelect(I.t("set.roundStep"), "", [
      [0, I.t("set.roundStep.0")], [1, "1 min"], [5, "5 min"], [6, "6 min (1/10 h)"], [10, "10 min"], [15, "15 min"]
    ], s.roundStep || 0, function (v) {
      App.store.updateSettings({ roundStep: +v });
      App.renderChrome();
    }));
    breaks.body.appendChild(rowSegmented(I.t("set.roundMode"), "", [
      ["nearest", I.t("set.roundMode.nearest")], ["down", I.t("set.roundMode.down")], ["up", I.t("set.roundMode.up")]
    ], s.roundMode || "nearest", function (v) {
      App.store.updateSettings({ roundMode: v });
      App.renderChrome();
    }));
    grid.appendChild(breaks.node);

    /* ================================================================ */
    /* Zeitkonto & Kontingente                                           */
    /* ================================================================ */
    var acc = section(I.t("set.account"), "swap");

    var carryRow = D.el("div.setting-row");
    carryRow.appendChild(D.el("div.info", {
      html: "<b>" + D.esc(I.t("set.carryOver")) + "</b><span>" + D.esc(I.t("set.carryOverHint")) + "</span>"
    }));
    var carryCtl = D.el("div.ctl.wide");
    var carryInput = D.el("input.input.mono", {
      type: "text", value: T.formatSigned(s.carryOverMinutes || 0, "clock"), style: { textAlign: "right" }
    });
    carryInput.addEventListener("change", function () {
      var raw = carryInput.value.trim().replace("−", "-");
      var neg = raw.indexOf("-") === 0;
      var mins = T.parseDuration(raw.replace(/^[+\-±]/, ""));
      if (mins === null) mins = 0;
      var value = neg ? -Math.abs(mins) : Math.abs(mins);
      App.store.updateSettings({ carryOverMinutes: value });
      carryInput.value = T.formatSigned(value, "clock");
      App.renderChrome();
    });
    carryCtl.appendChild(carryInput);
    carryRow.appendChild(carryCtl);
    acc.body.appendChild(carryRow);

    var fromRow = D.el("div.setting-row");
    fromRow.appendChild(D.el("div.info", { html: "<b>" + D.esc(I.t("set.carryOverFrom")) + "</b>" }));
    var fromCtl = D.el("div.ctl.wide");
    var fromInput = D.el("input.input", { type: "date", value: s.carryOverFrom || "" });
    fromInput.addEventListener("change", function () {
      App.store.updateSettings({ carryOverFrom: fromInput.value || null });
      App.renderChrome();
    });
    fromCtl.appendChild(fromInput);
    fromRow.appendChild(fromCtl);
    acc.body.appendChild(fromRow);

    acc.body.appendChild(rowSwitch(I.t("set.countMissing"), I.t("set.countMissingHint"), !!s.countMissingWorkdays, function (on) {
      App.store.updateSettings({ countMissingWorkdays: on });
      App.renderChrome();
    }));

    acc.body.appendChild(rowNumber(I.t("set.vacationDays"), "", s.vacationDaysPerYear || 0, I.t("common.days"), function (v) {
      App.store.updateSettings({ vacationDaysPerYear: Math.max(0, v) });
    }));
    acc.body.appendChild(rowNumber(I.t("set.vacationCarry"), "", s.vacationCarryDays || 0, I.t("common.days"), function (v) {
      App.store.updateSettings({ vacationCarryDays: v });
    }));
    grid.appendChild(acc.node);

    /* ================================================================ */
    /* Feiertage                                                         */
    /* ================================================================ */
    var hol = section(I.t("set.holidays"), "star");
    var regionSelect = D.el("select.select");
    var groups = {};
    H.REGIONS.forEach(function (r) {
      if (!groups[r.group]) {
        groups[r.group] = D.el("optgroup", { label: r.group });
        regionSelect.appendChild(groups[r.group]);
      }
      groups[r.group].appendChild(D.el("option", { value: r.key, text: r.label, selected: r.key === s.holidayRegion }));
    });
    var regionRow = D.el("div.setting-row");
    regionRow.appendChild(D.el("div.info", { html: "<b>" + D.esc(I.t("set.region")) + "</b>" }));
    var regionCtl = D.el("div.ctl.wide");
    regionCtl.appendChild(regionSelect);
    regionRow.appendChild(regionCtl);
    regionSelect.addEventListener("change", function () {
      App.store.updateSettings({ holidayRegion: regionSelect.value });
      App.renderView();
      App.renderChrome();
    });
    hol.body.appendChild(regionRow);

    hol.body.appendChild(rowSwitch(I.t("set.autoHolidays"), "", s.autoHolidays !== false, function (on) {
      App.store.updateSettings({ autoHolidays: on });
      App.renderChrome();
    }));

    var upcoming = H.between(T.todayISO(), T.addDays(T.todayISO(), 400), s.holidayRegion).slice(0, 6);
    if (upcoming.length) {
      var prev = D.el("div", { style: { paddingTop: "10px" } });
      prev.appendChild(D.el("div.section-title", { text: I.t("set.holidayPreview") }));
      upcoming.forEach(function (h) {
        prev.appendChild(D.el("div", {
          style: { display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "5px 0", borderBottom: "1px solid var(--line-faint)" },
          html: "<span>" + D.esc(h.holiday.names[I.getLang()] || h.holiday.name) + "</span>" +
            "<span class='mono muted'>" + D.esc(I.formatDate(h.date, { day: "2-digit", month: "short", weekday: "short" })) + "</span>"
        }));
      });
      hol.body.appendChild(prev);
    }
    grid.appendChild(hol.node);

    /* ================================================================ */
    /* Outlook-Kalender                                                  */
    /* ================================================================ */
    grid.appendChild(outlookSection(App).node);

    /* ================================================================ */
    /* Arbeitsschutz & Komfort                                           */
    /* ================================================================ */
    var comp = section(I.t("set.compliance"), "shield");
    comp.body.appendChild(rowDuration(I.t("set.maxDaily"), "", s.maxDailyMinutes || 600, function (v) {
      App.store.updateSettings({ maxDailyMinutes: v });
      App.renderChrome();
    }));
    comp.body.appendChild(rowNumber(I.t("set.minRest"), "", s.minRestHours || 11, I.t("set.minRestUnit"), function (v) {
      App.store.updateSettings({ minRestHours: Math.max(0, Math.min(24, v)) });
      App.renderChrome();
    }));
    comp.body.appendChild(rowDuration(I.t("stats.weeklyHours"), "", s.maxWeeklyMinutes || 3000, function (v) {
      App.store.updateSettings({ maxWeeklyMinutes: v });
    }));

    comp.body.appendChild(rowSwitch(I.t("set.reminder"), I.t("set.reminderHint"), !!s.reminderEnabled, function (on, ctl) {
      if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
        App.requestNotifications().then(function (p) {
          if (p !== "granted") {
            ctl.checked = false;
            D.toast(I.t("set.notifDenied"), { tone: "warn" });
            return;
          }
          App.store.updateSettings({ reminderEnabled: true });
          App.scheduleReminder();
        });
        return;
      }
      App.store.updateSettings({ reminderEnabled: on });
      App.scheduleReminder();
    }));
    comp.body.appendChild(rowNumber(I.t("set.reminderLead"), "", s.reminderLeadMinutes || 10, I.t("common.min"), function (v) {
      App.store.updateSettings({ reminderLeadMinutes: Math.max(0, v) });
      App.scheduleReminder();
    }));
    comp.body.appendChild(rowSwitch(I.t("set.confetti"), "", s.confetti !== false, function (on) {
      App.store.updateSettings({ confetti: on });
      if (on) D.confetti({ count: 40 });
    }));
    grid.appendChild(comp.node);

    /* ================================================================ */
    /* Installation                                                      */
    /* ================================================================ */
    var inst = section(I.t("set.install"), "download");
    inst.body.appendChild(D.el("p.muted", { text: I.t("set.installHint"), style: { fontSize: "13px", marginBottom: "12px" } }));

    if (App.isStandalone()) {
      var okBox = D.el("div.notice.plus");
      okBox.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("common.finish")) + "</strong></div>";
      inst.body.appendChild(okBox);
    } else if (App.canInstall()) {
      var btn = D.el("button.btn.primary.block", { type: "button", html: D.icon("download") + "<span>" + D.esc(I.t("set.install")) + "</span>" });
      btn.addEventListener("click", function () { App.promptInstall().then(function () { App.renderView(); }); });
      inst.body.appendChild(btn);
    } else {
      var hint = D.el("div.notice.info");
      hint.innerHTML = D.icon("info") +
        "<div><strong>Safari / iOS</strong><div class='sub'>Teilen-Symbol → „Zum Home-Bildschirm“. " +
        "Android/Chrome: Menü → „App installieren“.</div></div>";
      inst.body.appendChild(hint);
    }
    grid.appendChild(inst.node);

    /* ================================================================ */
    /* Daten                                                             */
    /* ================================================================ */
    var data = section(I.t("set.data"), "save");
    data.body.appendChild(D.el("p.muted", { text: I.t("set.dataHint"), style: { fontSize: "13px", marginBottom: "14px" } }));

    var exportRow = D.el("div.row.mb-4");
    var expBtn = D.el("button.btn.primary", { type: "button", html: D.icon("download") + "<span>" + D.esc(I.t("set.exportAll")) + "</span>" });
    expBtn.addEventListener("click", function () { App.exportJSON(); });
    exportRow.appendChild(expBtn);
    data.body.appendChild(exportRow);

    var modeSelect = D.el("select.select", { style: { marginBottom: "12px" } });
    [["merge", I.t("set.importMode.merge")], ["merge-keep", I.t("set.importMode.merge-keep")], ["replace", I.t("set.importMode.replace")]]
      .forEach(function (o) { modeSelect.appendChild(D.el("option", { value: o[0], text: o[1] })); });
    data.body.appendChild(D.el("div.section-title", { text: I.t("set.importMode") }));
    data.body.appendChild(modeSelect);

    var drop = D.el("div.dropzone", { text: I.t("set.importDrop"), tabindex: "0", role: "button" });
    var fileInput = D.el("input", { type: "file", accept: ".json,.csv,application/json,text/csv", style: { display: "none" } });
    drop.addEventListener("click", function () { fileInput.click(); });
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      drop.classList.remove("over");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    data.body.appendChild(drop);
    data.body.appendChild(fileInput);

    function handleFile(file) {
      D.readFile(file).then(function (content) {
        if (/\.csv$/i.test(file.name) || content.indexOf("{") !== 0) {
          var parsed = ZK.Exporters.parseCSV(content);
          if (parsed.error) { D.toast(parsed.error, { tone: "minus" }); return; }
          var patch = {};
          parsed.rows.forEach(function (row) {
            var rec = { date: row.date, start: row.start || "", end: row.end || "", note: row.note || "", breaks: [] };
            if (row.breakMinutes && row.start) {
              var startMin = T.parseHHMM(row.start) || 0;
              var mid = startMin + 240;
              rec.breaks = [{ id: "imp" + row.date, label: I.t("day.lunch"), start: T.formatHHMM(mid), end: T.formatHHMM(mid + row.breakMinutes), paid: false }];
            }
            patch[row.date] = rec;
          });
          App.store.setDays(patch, { label: "import-csv" });
          App.afterChange();
          D.toast(I.t("toast.imported"), { sub: parsed.rows.length + " " + I.t("common.days"), tone: "plus" });
          return;
        }
        var json = JSON.parse(content);
        var result = App.store.importState(json, modeSelect.value);
        App.applyTheme();
        App.applyDensity();
        App.applyLanguage();
        App.afterChange();
        D.toast(I.t("toast.imported"), { sub: I.t("set.importResult", result), tone: "plus" });
      }).catch(function (err) {
        D.toast(String(err && err.message ? err.message : err), { tone: "minus" });
      });
    }

    var diag = App.store.diagnostics();
    var diagBox = D.el("div.storage-meter.mt-4");
    diagBox.innerHTML = D.icon("info") +
      "<span>" + D.esc(I.t("set.storage")) + ": <b>" + Math.round(diag.bytes / 1024) + " KB</b> · " +
      D.esc(diag.days + " " + I.t("common.days")) + " · Schema v" + diag.schema +
      (diag.volatile ? " · <b style='color:var(--warn)'>nur im Arbeitsspeicher</b>" : "") + "</span>";
    data.body.appendChild(diagBox);

    var resetBtn = D.el("button.btn.minus.block.mt-4", { type: "button", html: D.icon("trash") + "<span>" + D.esc(I.t("set.resetAll")) + "</span>" });
    resetBtn.addEventListener("click", function () {
      D.confirmDialog({
        title: I.t("set.resetAll"),
        message: I.t("set.resetConfirm"),
        okLabel: I.t("common.delete"),
        cancelLabel: I.t("common.cancel"),
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        App.store.reset(true);
        App.afterChange();
        D.toast(I.t("common.reset"), {
          action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
        });
      });
    });
    data.body.appendChild(resetBtn);
    grid.appendChild(data.node);

    /* ================================================================ */
    /* Über                                                              */
    /* ================================================================ */
    var about = section(I.t("set.about"), "info");
    about.body.innerHTML =
      '<div class="wordmark" style="font-size:18px;margin-bottom:14px">' +
      '<span class="mark"><i></i><i></i><i></i><i></i></span><b>ZEIT</b><span>KONTO</span></div>' +
      '<p style="font-size:13px;line-height:1.65;color:var(--ink-2)">' +
      D.esc(I.t("app.tagline")) + ". " + D.esc(I.t("set.dataHint")) + "</p>" +
      '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line-faint)">' +
      "<span class='muted'>" + D.esc(I.t("set.version")) + "</span><span class='mono fw-8'>" + D.esc(App.version) + "</span></div>";
    var kbdBtn = D.el("button.btn.block.mt-4", { type: "button", html: D.icon("keyboard") + "<span>" + D.esc(I.t("kbd.title")) + "</span>" });
    kbdBtn.addEventListener("click", App.showShortcuts);
    about.body.appendChild(kbdBtn);
    grid.appendChild(about.node);
  }

  /* ==================================================================== */
  /* Outlook-Kalender                                                      */
  /* ==================================================================== */

  function outlookSection(App) {
    var OL = ZK.OutlookSync;
    var box = section(I.t("ol.title"), "calendar");
    var st = OL.status(App);
    var s = st.settings;

    box.body.appendChild(D.el("p.muted", {
      text: I.t("ol.lede"),
      style: { fontSize: "13px", marginBottom: "14px" }
    }));

    /* ---- Einzeldatei kann kein OAuth --------------------------------- */
    if (!st.supported) {
      var blocked = D.el("div.notice.warn");
      blocked.innerHTML = D.icon("info") +
        "<div><strong>" + D.esc(I.t("ol.needsHttps")) + "</strong></div>";
      box.body.appendChild(blocked);
      return box;
    }

    /* ---- Verbindung --------------------------------------------------- */
    if (st.signedIn && st.account) {
      var who = D.el("div.notice.plus.mb-4");
      who.innerHTML = D.icon("check") +
        "<div><strong>" + D.esc(I.t("ol.signedInAs", { name: st.account.name || st.account.username })) + "</strong>" +
        (st.account.username ? "<div class='sub'>" + D.esc(st.account.username) + "</div>" : "") + "</div>";
      box.body.appendChild(who);

      var actions = D.el("div.row.mb-4");
      var syncBtn = D.el("button.btn.primary", {
        type: "button", html: D.icon("refresh") + "<span>" + D.esc(I.t("ol.syncNow")) + "</span>"
      });
      syncBtn.addEventListener("click", function () { OL.run(App); });
      actions.appendChild(syncBtn);

      var calBtn = D.el("button.btn.sm", {
        type: "button", html: D.icon("calendar") + "<span>" + D.esc(I.t("ol.chooseCalendars")) + "</span>"
      });
      calBtn.addEventListener("click", function () { OL.chooseCalendars(App); });
      actions.appendChild(calBtn);

      var ruleBtn = D.el("button.btn.sm", {
        type: "button", html: D.icon("filter") + "<span>" + D.esc(I.t("ol.editRules")) + "</span>"
      });
      ruleBtn.addEventListener("click", function () { OL.editRules(App); });
      actions.appendChild(ruleBtn);

      var outBtn = D.el("button.btn.sm.ghost", { type: "button", text: I.t("ol.signOut") });
      outBtn.addEventListener("click", function () { OL.signOut(App); });
      actions.appendChild(outBtn);
      box.body.appendChild(actions);

      box.body.appendChild(D.el("div", {
        style: { fontSize: "11px", color: "var(--ink-3)", marginBottom: "8px" },
        text: I.t("ol.lastSync") + ": " + (s.lastSyncAt
          ? I.formatDate(s.lastSyncAt.slice(0, 10), { day: "2-digit", month: "2-digit", year: "numeric" }) +
            " " + s.lastSyncAt.slice(11, 16)
          : I.t("ol.never"))
      }));

      /* ---- Verhalten --------------------------------------------------- */
      box.body.appendChild(rowSwitch(I.t("ol.autoSync"), I.t("ol.autoSyncHint"), s.autoSync !== false, function (on) {
        OL.saveSettings(App, { autoSync: on });
      }));
      box.body.appendChild(rowSwitch(I.t("ol.importHomeOffice"), I.t("ol.importHomeOfficeHint"), s.importHomeOffice !== false, function (on) {
        OL.saveSettings(App, { importHomeOffice: on });
      }));
      box.body.appendChild(rowSwitch(I.t("ol.copySubject"), "", s.copySubjectToNote !== false, function (on) {
        OL.saveSettings(App, { copySubjectToNote: on });
      }));
      box.body.appendChild(rowSwitch(I.t("ol.ignorePrivate"), "", s.ignorePrivate !== false, function (on) {
        OL.saveSettings(App, { ignorePrivate: on });
      }));
      box.body.appendChild(rowNumber(I.t("ol.pastDays"), "", s.pastDays, I.t("common.days"), function (v) {
        OL.saveSettings(App, { pastDays: Math.max(0, Math.min(3650, Math.round(v))) });
      }));
      box.body.appendChild(rowNumber(I.t("ol.futureDays"), "", s.futureDays, I.t("common.days"), function (v) {
        OL.saveSettings(App, { futureDays: Math.max(0, Math.min(3650, Math.round(v))) });
      }));
    } else {
      /* ---- Einrichtung ------------------------------------------------- */
      var setup = D.el("div.notice.info.mb-4");
      setup.innerHTML = D.icon("info") +
        "<div><strong>" + D.esc(I.t("ol.setup")) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("ol.setupHint")) + "</div></div>";
      box.body.appendChild(setup);

      /* Umleitungs-URI zum Kopieren — der häufigste Stolperstein */
      var uriField = D.el("div.field.mb-3");
      uriField.appendChild(D.el("label", { text: I.t("ol.redirectUri") }));
      var uriRow = D.el("div.row.tight.nowrap");
      var uriInput = D.el("input.input.mono", {
        type: "text", value: st.redirectUri || "", readonly: true,
        style: { fontSize: "12px" }
      });
      uriInput.addEventListener("focus", function () { uriInput.select(); });
      var copyBtn = D.el("button.btn.icon", {
        type: "button", "aria-label": I.t("common.copy"), html: D.icon("copy")
      });
      copyBtn.addEventListener("click", function () {
        D.copyText(st.redirectUri || "").then(function () { D.toast(I.t("common.copied")); });
      });
      uriRow.appendChild(uriInput);
      uriRow.appendChild(copyBtn);
      uriField.appendChild(uriRow);
      uriField.appendChild(D.el("div.hint", { text: I.t("ol.redirectUriHint") }));
      box.body.appendChild(uriField);

      var idField = D.el("div.field.mb-3");
      idField.appendChild(D.el("label", { text: I.t("ol.clientId") }));
      var idInput = D.el("input.input.mono", {
        type: "text", value: s.clientId || "",
        placeholder: "00000000-0000-0000-0000-000000000000",
        style: { fontSize: "12px" }
      });
      idInput.addEventListener("change", function () {
        OL.saveSettings(App, { clientId: idInput.value.trim() });
        App.renderView();
      });
      idField.appendChild(idInput);
      idField.appendChild(D.el("div.hint", { text: I.t("ol.clientIdHint") }));
      box.body.appendChild(idField);

      var tenantField = D.el("div.field.mb-4");
      tenantField.appendChild(D.el("label", { text: I.t("ol.tenant") }));
      var tenantInput = D.el("input.input.mono", {
        type: "text", value: s.tenant || "common", placeholder: "common", style: { fontSize: "12px" }
      });
      tenantInput.addEventListener("change", function () {
        OL.saveSettings(App, { tenant: tenantInput.value.trim() || "common" });
      });
      tenantField.appendChild(tenantInput);
      tenantField.appendChild(D.el("div.hint", { text: I.t("ol.tenantHint") }));
      box.body.appendChild(tenantField);

      var connect = D.el("button.btn.primary.block", {
        type: "button",
        html: D.icon("external") + "<span>" + D.esc(I.t("ol.connect")) + "</span>",
        disabled: !(s.clientId || "").trim()
      });
      connect.addEventListener("click", function () { OL.signIn(App); });
      box.body.appendChild(connect);
    }

    box.body.appendChild(D.el("p.muted", {
      text: I.t("ol.privacy"),
      style: { fontSize: "11px", marginTop: "14px", lineHeight: "1.5" }
    }));

    return box;
  }

  /* ==================================================================== */
  /* Bausteine                                                             */
  /* ==================================================================== */

  function section(title, iconName) {
    var node = D.el("section.card");
    node.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(title) + "</h2>" }));
    var body = D.el("div");
    node.appendChild(body);
    return { node: node, body: body };
  }

  function baseRow(title, hint) {
    var row = D.el("div.setting-row");
    row.appendChild(D.el("div.info", {
      html: "<b>" + D.esc(title) + "</b>" + (hint ? "<span>" + D.esc(hint) + "</span>" : "")
    }));
    var ctl = D.el("div.ctl");
    row.appendChild(ctl);
    return { row: row, ctl: ctl };
  }

  function rowSwitch(title, hint, checked, onChange) {
    var b = baseRow(title, hint);
    var label = D.el("label.switch");
    var input = D.el("input", { type: "checkbox", checked: checked });
    input.addEventListener("change", function () { onChange(input.checked, input); });
    label.appendChild(input);
    label.appendChild(D.el("span.track"));
    b.ctl.appendChild(label);
    return b.row;
  }

  function rowSelect(title, hint, options, value, onChange) {
    var b = baseRow(title, hint);
    b.ctl.classList.add("wide");
    var select = D.el("select.select");
    options.forEach(function (o) {
      select.appendChild(D.el("option", { value: o[0], text: o[1], selected: String(o[0]) === String(value) }));
    });
    select.addEventListener("change", function () { onChange(select.value); });
    b.ctl.appendChild(select);
    return b.row;
  }

  function rowSegmented(title, hint, options, value, onChange) {
    var b = baseRow(title, hint);
    b.ctl.classList.add("wide");
    var seg = D.el("div.segmented");
    options.forEach(function (o) {
      var btn = D.el("button", {
        type: "button", text: o[1],
        "aria-pressed": String(o[0]) === String(value) ? "true" : "false"
      });
      btn.addEventListener("click", function () {
        D.qsa("button", seg).forEach(function (n) { n.setAttribute("aria-pressed", "false"); });
        btn.setAttribute("aria-pressed", "true");
        onChange(o[0]);
      });
      seg.appendChild(btn);
    });
    b.ctl.appendChild(seg);
    return b.row;
  }

  function rowNumber(title, hint, value, suffix, onChange) {
    var b = baseRow(title, hint);
    var wrap = D.el("div.input-wrap", { style: { maxWidth: "132px" } });
    var input = D.el("input.input.mono", { type: "number", value: value, style: { textAlign: "right" } });
    input.addEventListener("change", function () {
      var v = parseFloat(input.value);
      if (isNaN(v)) v = 0;
      onChange(v);
    });
    wrap.appendChild(input);
    if (suffix) wrap.appendChild(D.el("span.suffix", { text: suffix }));
    b.ctl.appendChild(wrap);
    return b.row;
  }

  function rowDuration(title, hint, minutes, onChange) {
    var b = baseRow(title, hint);
    var input = D.el("input.input.mono", {
      type: "text", value: T.formatDuration(minutes, "clock"),
      style: { textAlign: "right", maxWidth: "112px" }
    });
    input.addEventListener("change", function () {
      var v = T.parseDuration(input.value);
      if (v === null) v = minutes;
      input.value = T.formatDuration(v, "clock");
      onChange(v);
    });
    b.ctl.appendChild(input);
    return b.row;
  }
})(typeof self !== "undefined" ? self : this);
