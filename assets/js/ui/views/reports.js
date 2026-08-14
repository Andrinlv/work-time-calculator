/* ==========================================================================
   ZEITKONTO — Ansicht „Berichte & Export“
   --------------------------------------------------------------------------
   Ein Blatt, das man ausdrucken und unterschreiben kann, plus alle
   Rohdatenformate für Lohnbuchhaltung, Excel oder ein anderes System.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).reports = { render: render };

  var state = { from: null, to: null };

  function render(host, App) {
    var s = App.settings();
    var today = T.todayISO();
    if (!state.from) {
      state.from = T.startOfMonth(App.date || today);
      state.to = T.endOfMonth(App.date || today);
    }

    /* ---- Kopf ---- */
    var head = D.el("div.view-head.no-print");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("report.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("report.lede") }));
    head.appendChild(left);
    host.appendChild(head);

    /* ---- Steuerung ---- */
    var controls = D.el("section.card.mb-4.no-print");
    var row = D.el("div.grid-4");

    var fromField = dateField(I.t("common.from"), state.from, function (v) { state.from = v; App.renderView(); });
    var toField = dateField(I.t("common.to"), state.to, function (v) { state.to = v; App.renderView(); });
    row.appendChild(fromField);
    row.appendChild(toField);

    var nameField = D.el("div.field");
    nameField.appendChild(D.el("label", { text: I.t("report.employee") }));
    var nameInput = D.el("input.input", { type: "text", placeholder: I.t("report.employeePlaceholder"), value: s.employeeName || "" });
    nameInput.addEventListener("change", function () { App.store.updateSettings({ employeeName: nameInput.value }); App.renderView(); });
    nameField.appendChild(nameInput);
    row.appendChild(nameField);

    var quick = D.el("div.field");
    quick.appendChild(D.el("label", { text: I.t("stats.period") }));
    var quickSel = D.el("select.select");
    quickSel.appendChild(D.el("option", { value: "", text: "—" }));
    for (var i = 0; i < 14; i++) {
      var m = T.addMonths(T.startOfMonth(today), -i);
      var d = T.fromISO(m);
      quickSel.appendChild(D.el("option", { value: m, text: I.monthName(d.getMonth()) + " " + d.getFullYear() }));
    }
    quickSel.appendChild(D.el("option", { value: "year", text: T.yearOf(today) }));
    quickSel.appendChild(D.el("option", { value: "all", text: I.t("report.rangeAll") }));
    quickSel.addEventListener("change", function () {
      var v = quickSel.value;
      if (!v) return;
      if (v === "year") { state.from = T.yearOf(today) + "-01-01"; state.to = T.yearOf(today) + "-12-31"; }
      else if (v === "all") {
        var keys = Object.keys(App.store.allDays()).sort();
        state.from = keys[0] || T.startOfMonth(today);
        state.to = keys[keys.length - 1] || today;
      } else { state.from = v; state.to = T.endOfMonth(v); }
      App.renderView();
    });
    quick.appendChild(quickSel);
    row.appendChild(quick);

    controls.appendChild(row);

    var actions = D.el("div.row.mt-4");
    var range = App.range(state.from, state.to);

    actions.appendChild(button(I.t("report.printNow"), "printer", "primary", function () { window.print(); }));
    actions.appendChild(button(I.t("report.exportCsv"), "download", "", function () {
      var csv = ZK.Exporters.toCSV(range.days, { labels: I.typeLabels(), onlyRecorded: false });
      D.download("zeitkonto_" + state.from + "_" + state.to + ".csv", csv, "text/csv");
      App.markExport();
      D.toast(I.t("toast.exported"), { sub: "CSV" });
    }));
    actions.appendChild(button(I.t("report.exportIcs"), "calendar", "", function () {
      var ics = ZK.Exporters.toICS(range.days, { labels: I.typeLabels(), calendarName: I.t("app.name") });
      D.download("zeitkonto_" + state.from + "_" + state.to + ".ics", ics, "text/calendar");
      App.markExport();
      D.toast(I.t("toast.exported"), { sub: "ICS" });
    }));
    actions.appendChild(button(I.t("report.exportJson"), "save", "", function () { App.exportJSON(); }));
    actions.appendChild(button(I.t("report.exportText"), "copy", "ghost", function () {
      var txt = ZK.Exporters.toText(range, { labels: I.typeLabels() });
      D.copyText(txt).then(function () { D.toast(I.t("common.copied")); })
        .catch(function () { D.toast(I.t("common.copy"), { tone: "warn" }); });
    }));
    controls.appendChild(actions);
    host.appendChild(controls);

    /* ---- Berichtsblatt ---- */
    var sheet = D.el("section.report-sheet");

    var sheetHead = D.el("div.report-head");
    var brand = D.el("div");
    brand.innerHTML =
      '<div class="wordmark" style="font-size:17px;margin-bottom:8px">' +
      '<span class="mark"><i></i><i></i><i></i><i></i></span>' +
      "<b>ZEIT</b><span>KONTO</span></div>" +
      "<h2>" + D.esc(I.t("report.monthly")) + "</h2>" +
      '<div style="font-size:13px;color:var(--ink-3);margin-top:4px">' +
      D.esc(I.t("report.employee")) + ": <b style=\"color:var(--ink)\">" +
      D.esc(s.employeeName || "—") + "</b></div>";
    sheetHead.appendChild(brand);

    var meta = D.el("div.meta");
    meta.innerHTML =
      "<div>" + D.esc(I.t("report.period")) + "<br><b style='color:var(--ink);font-size:14px'>" +
      D.esc(I.formatDate(state.from) + " – " + I.formatDate(state.to)) + "</b></div>" +
      "<div style='margin-top:8px'>" + D.esc(I.t("report.created")) + " " + D.esc(I.formatDate(today)) + "</div>";
    sheetHead.appendChild(meta);
    sheet.appendChild(sheetHead);

    /* Summen */
    var carryIn = App.accountBalance(T.addDays(state.from, -1));
    var carryOut = App.accountBalance(state.to);
    var t = range.totals;

    var sums = D.el("div.grid-4.mb-5");
    sumBox(sums, I.t("report.carryIn"), App.fmtSigned(carryIn.minutes));
    sumBox(sums, I.t("cal.monthTarget"), App.fmt(t.target));
    sumBox(sums, I.t("cal.monthActual"), App.fmt(t.net + t.credited));
    sumBox(sums, I.t("report.carryOut"), App.fmtSigned(carryOut.minutes), carryOut.minutes >= 0 ? "plus" : "minus");
    sheet.appendChild(sums);

    // Ohne diesen Hinweis wirkt „Soll 176 h / Ist 33 h / Saldo −0:33“ widersprüchlich.
    if (t.gapDays > 0) {
      var dutyDays = range.days.filter(function (r) { return r.target > 0; }).length;
      var gapNote = D.el("div.notice.warn.mb-5");
      gapNote.innerHTML = D.icon("info") + "<div>" +
        D.esc(I.t("report.gapNote", { gaps: t.gapDays, days: dutyDays })) + "</div>";
      sheet.appendChild(gapNote);
    }

    /* Tabelle */
    var wrap = D.el("div.table-wrap");
    var table = D.el("table.data");
    var thead = D.el("thead");
    var hrow = D.el("tr");
    [
      I.t("common.day"), I.t("day.type"), I.t("day.clockIn"), I.t("day.clockOut"),
      I.t("day.breaks"), I.t("day.net"), I.t("day.target"), I.t("day.balance"), I.t("day.note")
    ].forEach(function (h, i) {
      hrow.appendChild(D.el("th", { text: h, class: i >= 2 && i <= 7 ? "num" : "" }));
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = D.el("tbody");
    var shown = 0;
    range.days.forEach(function (r) {
      if (!r.recorded && r.target === 0) return;
      shown++;
      var wd = r.weekday;
      var tr = D.el("tr", {
        class: (wd === 0 || wd === 6 ? "is-weekend " : "") + (r.date === today ? "is-today" : "")
      });
      tr.appendChild(D.el("td", {
        html: "<b>" + D.esc(I.weekdayName(wd, "short")) + "</b> " +
          D.esc(I.formatDate(r.date, { day: "2-digit", month: "2-digit" }))
      }));
      tr.appendChild(D.el("td", {
        html: r.type === "work" && !r.holiday
          ? '<span class="muted">—</span>'
          : '<span class="tag" style="color:' + r.typeMeta.color + ';border-color:' + r.typeMeta.color + '33">' +
            D.esc(r.holiday && r.type === "holiday" ? r.holiday.name : I.t("type." + r.type)) + "</span>"
      }));
      tr.appendChild(D.el("td.num", { text: r.start || "–" }));
      tr.appendChild(D.el("td.num", { text: r.end || "–" }));
      tr.appendChild(D.el("td.num", { text: r.effectiveBreak ? App.fmt(r.effectiveBreak) : "–" }));
      tr.appendChild(D.el("td.num", { html: "<b>" + D.esc(r.recorded ? App.fmt(r.net) : "–") + "</b>" }));
      tr.appendChild(D.el("td.num", { text: r.target ? App.fmt(r.target) : "–" }));
      tr.appendChild(D.el("td.num", {
        class: r.balance > 0 ? "tone-plus" : r.balance < 0 ? "tone-minus" : "",
        text: r.recorded ? App.fmtSigned(r.balance) : "–"
      }));
      tr.appendChild(D.el("td", {
        text: r.note || "",
        style: { whiteSpace: "normal", maxWidth: "220px", fontSize: "12px", color: "var(--ink-3)" }
      }));
      tr.addEventListener("click", function () {
        ZK.DayModal.open(App, r.date, function () { App.renderChrome(); App.renderView(); });
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var tfoot = D.el("tfoot");
    var frow = D.el("tr");
    frow.appendChild(D.el("td", { text: I.t("common.total"), colspan: 4 }));
    // dieselbe Kennzahl wie in den Tageszeilen: die tatsächlich abgezogene Pause
    frow.appendChild(D.el("td.num", { text: App.fmt(t.effectiveBreak) }));
    frow.appendChild(D.el("td.num", { text: App.fmt(t.net + t.credited) }));
    frow.appendChild(D.el("td.num", { text: App.fmt(t.target) }));
    frow.appendChild(D.el("td.num", {
      class: t.balance > 0 ? "tone-plus" : t.balance < 0 ? "tone-minus" : "",
      text: App.fmtSigned(t.balance)
    }));
    frow.appendChild(D.el("td", { text: "" }));
    tfoot.appendChild(frow);
    table.appendChild(tfoot);

    wrap.appendChild(table);
    sheet.appendChild(wrap);

    if (!shown) {
      sheet.appendChild(D.el("div.empty", { html: '<div class="rings"><i></i><i></i></div><p>' + D.esc(I.t("common.empty")) + "</p>" }));
    }

    /* Unterschriften */
    var sign = D.el("div.report-sign");
    sign.appendChild(D.el("div", { text: I.t("report.signEmployee") }));
    sign.appendChild(D.el("div", { text: I.t("report.signSupervisor") }));
    sheet.appendChild(sign);

    host.appendChild(sheet);
  }

  function sumBox(host, title, value, tone) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone ? " tone-" + tone : "") + '">' + D.esc(value) + "</div>";
    host.appendChild(node);
  }

  function dateField(label, value, onChange) {
    var wrap = D.el("div.field");
    wrap.appendChild(D.el("label", { text: label }));
    var input = D.el("input.input", { type: "date", value: value });
    input.addEventListener("change", function () { if (input.value) onChange(input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function button(label, iconName, variant, onClick) {
    var btn = D.el("button.btn" + (variant ? "." + variant : ""), {
      type: "button",
      html: D.icon(iconName) + "<span>" + D.esc(label) + "</span>"
    });
    btn.addEventListener("click", onClick);
    return btn;
  }
})(typeof self !== "undefined" ? self : this);
