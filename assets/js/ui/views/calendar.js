/* ==========================================================================
   ZEITKONTO — Ansicht „Kalender“
   --------------------------------------------------------------------------
   Monatsraster mit Schnellbearbeitung im Dialog und einer Massenaktion für
   Ferien, Krankheit oder Kompensation über einen ganzen Zeitraum.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).calendar = { render: render };

  /* ==================================================================== */
  /* Schnellbearbeitung eines Tages (auch von der Wochenansicht genutzt)   */
  /* ==================================================================== */
  ZK.DayModal = { open: openDayModal };

  function openDayModal(App, iso, onDone) {
    var rec = App.record(iso);
    var body = D.el("div.col");

    /* Zeiten */
    var times = D.el("div.grid-2");
    var startWrap = field(I.t("day.clockIn"));
    var endWrap = field(I.t("day.clockOut"));
    startWrap.input.value = rec.start || "";
    endWrap.input.value = rec.end || "";
    D.attachTimeInput(startWrap.input, refresh);
    D.attachTimeInput(endWrap.input, refresh);
    times.appendChild(startWrap.wrap);
    times.appendChild(endWrap.wrap);
    body.appendChild(times);

    /* Pausen als reine Minutenzahl — im Schnellmodus reicht das */
    var breakWrap = field(I.t("day.breaks") + " (" + I.t("common.min") + ")");
    breakWrap.input.classList.remove("time");
    breakWrap.input.value = String(sumBreaks(rec));
    breakWrap.input.addEventListener("input", refresh);
    body.appendChild(breakWrap.wrap);

    /* Tagesart */
    body.appendChild(D.el("div.section-title", { text: I.t("day.type"), style: { marginTop: "6px", marginBottom: "0" } }));
    var chips = D.el("div.chipset");
    var chosenType = rec.type || null;
    ["work", "vacation", "comp", "sick", "holiday", "training", "military", "unpaid", "free"].forEach(function (key) {
      var meta = R.dayType(key);
      var chip = D.el("button.chip", {
        type: "button", "data-type": key,
        html: '<i class="swatch" style="--c:' + meta.color + '"></i><span>' + D.esc(I.t("type." + key)) + "</span>"
      });
      chip.addEventListener("click", function () {
        chosenType = chosenType === key ? null : key;
        markChips();
        refresh();
      });
      chips.appendChild(chip);
    });
    body.appendChild(chips);

    /* Notiz */
    var noteWrap = D.el("div.field");
    noteWrap.appendChild(D.el("label", { text: I.t("day.note") }));
    var note = D.el("textarea.textarea", { rows: 2, placeholder: I.t("day.notePlaceholder") });
    note.value = rec.note || "";
    noteWrap.appendChild(note);
    body.appendChild(noteWrap);

    var preview = D.el("div.grid-2.mt-2");
    body.appendChild(preview);

    var openFull = D.el("button.btn.left", { type: "button", html: D.icon("external") + "<span>" + D.esc(I.t("cmd.open")) + "</span>" });
    var del = D.el("button.btn.ghost", { type: "button", html: D.icon("trash") + "<span>" + D.esc(I.t("common.delete")) + "</span>" });
    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var save = D.el("button.btn.primary", { type: "button", text: I.t("common.save") });

    var m = D.modal({
      title: I.formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      sub: I.t("week.kw", { n: T.isoWeek(iso) }) + (App.holiday(iso) ? " · " + App.holiday(iso).name : ""),
      body: body,
      footer: [openFull, del, cancel, save]
    });

    openFull.addEventListener("click", function () { m.close(); App.setDate(iso, { view: "today" }); });
    cancel.addEventListener("click", function () { m.close(); });
    del.addEventListener("click", function () {
      m.close();
      App.clearDay(iso);
      D.toast(I.t("toast.dayCleared"), { action: { label: I.t("common.undo"), onClick: function () { App.undo(); } } });
      if (onDone) onDone();
    });
    save.addEventListener("click", function () {
      App.saveDay(iso, buildPatch());
      m.close();
      if (onDone) onDone();
    });

    markChips();
    refresh();

    function markChips() {
      D.qsa(".chip", chips).forEach(function (c) {
        c.setAttribute("aria-pressed", c.dataset.type === chosenType ? "true" : "false");
      });
    }

    function buildPatch() {
      var minutes = parseInt(breakWrap.input.value, 10) || 0;
      var breaks = rec.breaks || [];
      var current = sumBreaks(rec);
      if (minutes !== current) {
        // Als eine Pause direkt nach der Tagesmitte ablegen — nachvollziehbar
        var startMin = T.parseHHMM(startWrap.input.value);
        var endMin = T.parseHHMM(endWrap.input.value);
        if (startMin !== null && minutes > 0) {
          var mid = endMin !== null
            ? startMin + Math.round((T.onTimeline(endMin, startMin) - startMin - minutes) / 2)
            : startMin + 240;
          breaks = [{
            id: "qb" + Date.now().toString(36),
            label: I.t("day.lunch"),
            start: T.formatHHMM(mid),
            end: T.formatHHMM(mid + minutes),
            paid: false
          }];
        } else if (minutes === 0) {
          breaks = [];
        }
      }
      return {
        start: startWrap.input.value,
        end: endWrap.input.value,
        breaks: breaks,
        type: chosenType,
        note: note.value
      };
    }

    function refresh() {
      var res = ZK.Engine.computeDay(
        Object.assign({}, rec, buildPatch(), { date: iso }),
        { settings: App.settings(), holiday: App.holiday(iso), isToday: iso === T.todayISO() }
      );
      D.clear(preview);
      preview.appendChild(miniKpi(I.t("day.net"), App.fmt(res.net)));
      preview.appendChild(miniKpi(I.t("day.balance"), App.fmtSigned(res.balance), res.balance > 0 ? "plus" : res.balance < 0 ? "minus" : ""));
    }

    function field(label) {
      var wrap = D.el("div.field");
      wrap.appendChild(D.el("label", { text: label }));
      var input = D.el("input.input.time", { type: "text", placeholder: "HH:MM" });
      wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }

    function miniKpi(title, value, tone) {
      var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
      node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
        '<div class="k-val mono' + (tone ? " tone-" + tone : "") + '">' + D.esc(value) + "</div>";
      return node;
    }

    function sumBreaks(record) {
      var anchor = T.parseHHMM(record.start) || 0;
      return (record.breaks || []).reduce(function (sum, b) {
        var s = T.parseHHMM(b.start), e = T.parseHHMM(b.end);
        return sum + (s === null || e === null ? 0 : T.intervalMinutes(s, e, anchor));
      }, 0);
    }
  }

  /* ==================================================================== */
  /* Monatsansicht                                                         */
  /* ==================================================================== */
  function render(host, App) {
    var monthKey = App.calendarMonth || T.monthKey(App.date);
    var first = monthKey + "-01";
    var monthDate = T.fromISO(first);
    if (!monthDate) { monthKey = T.monthKey(T.todayISO()); first = monthKey + "-01"; monthDate = T.fromISO(first); }
    var last = T.endOfMonth(first);
    var s = App.settings();
    var firstDay = s.firstDayOfWeek === 0 ? 0 : 1;

    /* ---- Kopf ---- */
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.monthName(monthDate.getMonth()) + " " + monthDate.getFullYear() }));
    left.appendChild(D.el("p.lede", { text: I.t("cal.lede") }));
    head.appendChild(left);

    var controls = D.el("div.row.tight");
    var prev = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.back"), html: D.icon("left") });
    prev.addEventListener("click", function () { App.calendarMonth = T.monthKey(T.addMonths(first, -1)); App.renderChrome(); App.renderView(); });
    var next = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.next"), html: D.icon("right") });
    next.addEventListener("click", function () { App.calendarMonth = T.monthKey(T.addMonths(first, 1)); App.renderChrome(); App.renderView(); });
    var todayBtn = D.el("button.btn.sm", { type: "button", text: I.t("cal.jumpToday") });
    todayBtn.addEventListener("click", function () {
      App.calendarMonth = T.monthKey(T.todayISO());
      App.date = T.todayISO();
      App.renderChrome(); App.renderView();
    });
    var bulkBtn = D.el("button.btn.sm", { type: "button", html: D.icon("grid") + "<span>" + D.esc(I.t("cal.bulk")) + "</span>" });
    bulkBtn.addEventListener("click", function () { openBulk(App, first, last); });

    controls.appendChild(prev);
    controls.appendChild(next);
    controls.appendChild(todayBtn);
    controls.appendChild(bulkBtn);
    head.appendChild(controls);
    host.appendChild(head);

    /* ---- Monatssummen ---- */
    var range = App.range(first, last);
    var t = range.totals;
    var quota = ZK.Engine.quotaUsage(App.store.allDays(), monthDate.getFullYear(), s);

    var kpis = D.el("div.grid-4.mb-4.stagger");
    kpiInto(kpis, I.t("cal.monthBalance"), App.fmtSigned(t.balance), t.recordedDays + " " + I.t("stats.recordedDays").toLowerCase(),
      t.balance > 0 ? "plus" : t.balance < 0 ? "minus" : "");
    kpiInto(kpis, I.t("cal.monthTarget"), App.fmt(t.target), I.t("common.total"));
    kpiInto(kpis, I.t("cal.monthActual"), App.fmt(t.net + t.credited),
      App.fmt(t.net) + " " + I.t("day.net").toLowerCase() + (t.credited ? " + " + App.fmt(t.credited) + " " + I.t("day.credited").toLowerCase() : ""));
    kpiInto(kpis, I.t("stats.vacationLeft"), String(quota.vacationLeft),
      quota.vacation + " / " + quota.vacationEntitlement + " " + I.t("common.days"),
      quota.vacationLeft < 0 ? "minus" : "");
    host.appendChild(kpis);

    if (t.gapDays > 0) {
      var gapNote = D.el("div.notice.warn.mb-4");
      gapNote.innerHTML = D.icon("alert") +
        "<div><strong>" + D.esc(t.gapDays + " " + I.t("stats.gaps")) + "</strong>" +
        '<div class="sub">' + D.esc(I.t("stats.gapsHint")) + "</div></div>";
      host.appendChild(gapNote);
    }

    /* ---- Raster ---- */
    var cal = D.el("div.cal.mb-3");
    var dow = D.el("div.cal-dow");
    for (var i = 0; i < 7; i++) {
      dow.appendChild(D.el("div", { text: I.weekdayName((firstDay + i) % 7, "short") }));
    }
    cal.appendChild(dow);

    var grid = D.el("div.cal-grid");
    var gridStart = T.startOfWeek(first, firstDay);
    var gridEnd = T.startOfWeek(T.addDays(last, 7 - 1), firstDay);
    var days = T.rangeDays(gridStart, T.addDays(gridEnd, -1));
    // sicherstellen, dass der letzte Monatstag enthalten ist
    while (days[days.length - 1] < last) days = days.concat(T.rangeDays(T.addDays(days[days.length - 1], 1), T.addDays(days[days.length - 1], 7)));

    days.forEach(function (iso) {
      grid.appendChild(buildCell(App, iso, monthKey));
    });
    cal.appendChild(grid);
    host.appendChild(cal);

    /* ---- Legende ---- */
    var legend = D.el("div.cal-legend");
    ["work", "vacation", "comp", "sick", "holiday", "training", "free"].forEach(function (key) {
      var meta = R.dayType(key);
      legend.appendChild(D.el("span", {
        html: '<i style="--c:' + meta.color + '"></i>' + D.esc(I.t("type." + key))
      }));
    });
    host.appendChild(legend);

    function buildCell(App, iso, monthKey) {
      var res = App.day(iso);
      var inMonth = T.monthKey(iso) === monthKey;
      var isToday = iso === T.todayISO();
      var wd = T.weekdayOf(iso);
      var weekend = wd === 0 || wd === 6;

      var cell = D.el("button.cal-cell", {
        type: "button",
        class: (inMonth ? "" : "other ") + (weekend ? "weekend " : "") + (isToday ? "today " : "") + (iso === App.date ? "selected" : ""),
        "aria-label": I.formatDate(iso) + ": " + App.fmtSigned(res.balance)
      });

      if (res.type !== "work" || res.holiday) {
        cell.appendChild(D.el("span.type-strip", { style: { "--c": res.typeMeta.color } }));
      }

      var top = D.el("span.d");
      top.appendChild(D.el("span", { text: String(T.fromISO(iso).getDate()) }));
      if (T.isoWeekdayOf(iso) === 1) top.appendChild(D.el("span.kw", { text: "KW" + T.isoWeek(iso) }));
      cell.appendChild(top);

      if (res.note) cell.appendChild(D.el("span.note-dot", { "data-tip": res.note.slice(0, 90) }));

      // Nur bewusst gesetzte Tagesarten und Feiertage bekommen ein Kürzel.
      // Ein Wochenende ist schon durch Spalte und Hintergrund erkennbar —
      // ein zusätzliches „Arbeitsfrei“ wäre nur Lärm.
      var record = App.record(iso);
      var explicitType = !!record.type;
      var fromOutlook = record.source === "outlook";
      if (explicitType && res.type !== "work") {
        cell.appendChild(D.el("span.flag", {
          text: (fromOutlook ? "◇ " : "") +
            I.t("type." + res.type) + (res.absenceFactor < 1 ? " " + Math.round(res.absenceFactor * 100) + "%" : ""),
          style: { "--c": res.typeMeta.color },
          "data-tip": fromOutlook ? I.t("ol.fromCalendar") : null
        }));
      } else if (res.holiday) {
        cell.appendChild(D.el("span.flag", {
          text: res.holiday.names[I.getLang()] || res.holiday.name,
          style: { "--c": "var(--type-holiday)" }
        }));
      }

      if (res.complete) {
        cell.appendChild(D.el("span.times", { text: res.start + "–" + res.end }));
        var barWrap = D.el("span.mini-bar");
        var neededNet = Math.max(1, res.target - res.credited);
        barWrap.appendChild(D.el("i", {
          style: {
            width: Math.min(100, (res.net / neededNet) * 100) + "%",
            background: res.balance >= 0 ? "var(--chart-plus)" : "var(--chart-mark)"
          }
        }));
        cell.appendChild(barWrap);
      }

      if (res.recorded && (res.balance !== 0 || res.complete)) {
        cell.appendChild(D.el("span.bal", {
          class: res.balance > 0 ? "tone-plus" : res.balance < 0 ? "tone-minus" : "tone-mute",
          text: App.fmtSigned(res.balance)
        }));
      } else if (inMonth && res.target > 0 && iso < T.todayISO()) {
        cell.appendChild(D.el("span.bal.tone-mute", { text: "—", "data-tip": I.t("stats.gaps") }));
      }

      cell.addEventListener("click", function () {
        App.date = iso;
        openDayModal(App, iso, function () { App.renderChrome(); App.renderView(); });
      });
      return cell;
    }
  }

  function kpiInto(host, title, value, sub, tone) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone ? " tone-" + tone : "") + '">' + D.esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + D.esc(sub) + "</div>" : "");
    host.appendChild(node);
  }

  /* ==================================================================== */
  /* Massenaktion für einen Zeitraum                                       */
  /* ==================================================================== */
  function openBulk(App, defFrom, defTo) {
    var body = D.el("div.col");
    body.appendChild(D.el("p.muted", { text: I.t("cal.bulkLede"), style: { fontSize: "13px" } }));

    var rangeRow = D.el("div.grid-2");
    var fromField = dateField(I.t("common.from"), defFrom);
    var toField = dateField(I.t("common.to"), defTo);
    rangeRow.appendChild(fromField.wrap);
    rangeRow.appendChild(toField.wrap);
    body.appendChild(rangeRow);

    body.appendChild(D.el("div.section-title", { text: I.t("day.type"), style: { marginBottom: "0", marginTop: "6px" } }));
    var chips = D.el("div.chipset");
    var chosen = "vacation";
    ["vacation", "comp", "sick", "military", "training", "unpaid", "free"].forEach(function (key) {
      var meta = R.dayType(key);
      var chip = D.el("button.chip", {
        type: "button", "data-type": key,
        html: '<i class="swatch" style="--c:' + meta.color + '"></i><span>' + D.esc(I.t("type." + key)) + "</span>"
      });
      chip.addEventListener("click", function () { chosen = key; mark(); });
      chips.appendChild(chip);
    });
    body.appendChild(chips);

    var factorRow = D.el("div.field.mt-3");
    factorRow.appendChild(D.el("label", { text: I.t("day.factor") }));
    var factor = D.el("select.select");
    [[1, "100 %"], [0.5, "50 % · " + I.t("day.halfDay")]].forEach(function (o) {
      factor.appendChild(D.el("option", { value: o[0], text: o[1] }));
    });
    factorRow.appendChild(factor);
    body.appendChild(factorRow);

    var skipWrap = D.el("label.switch.mt-3");
    var skip = D.el("input", { type: "checkbox", checked: true });
    skipWrap.appendChild(skip);
    skipWrap.appendChild(D.el("span.track"));
    skipWrap.appendChild(D.el("span.lbl", { text: I.t("cal.bulkSkipFree") }));
    body.appendChild(skipWrap);

    var summary = D.el("div.notice.info.mt-4");
    body.appendChild(summary);

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var apply = D.el("button.btn.primary", { type: "button", text: I.t("cal.bulkApply") });

    var m = D.modal({ title: I.t("cal.bulk"), body: body, footer: [cancel, apply] });
    cancel.addEventListener("click", function () { m.close(); });

    [fromField.input, toField.input, factor, skip].forEach(function (n) {
      n.addEventListener("change", refresh);
    });

    apply.addEventListener("click", function () {
      var list = targets();
      if (!list.length) return;
      var patch = {};
      list.forEach(function (iso) {
        patch[iso] = { type: chosen, absenceFactor: parseFloat(factor.value), start: "", end: "", breaks: [] };
      });
      App.store.setDays(patch, { label: "bulk" });
      App.afterChange();
      m.close();
      D.toast(I.tn("cal.bulkDone", list.length), {
        tone: "plus",
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
    });

    mark();
    refresh();

    function mark() {
      D.qsa(".chip", chips).forEach(function (c) {
        c.setAttribute("aria-pressed", c.dataset.type === chosen ? "true" : "false");
      });
      refresh();
    }

    function targets() {
      var from = fromField.input.value, to = toField.input.value;
      if (!T.isValidISO(from) || !T.isValidISO(to) || from > to) return [];
      return T.rangeDays(from, to).filter(function (iso) {
        if (!skip.checked) return true;
        var res = App.day(iso);
        return res.baseTarget > 0 && !res.holiday;
      });
    }

    function refresh() {
      var list = targets();
      var credit = list.reduce(function (sum, iso) {
        var res = App.day(iso);
        return sum + Math.round(res.baseTarget * parseFloat(factor.value));
      }, 0);
      summary.innerHTML = D.icon("info") +
        "<div><strong>" + D.esc(I.tn("cal.bulkDone", list.length)) + "</strong>" +
        '<div class="sub">' + D.esc(I.t("day.credited") + " " + App.fmt(credit)) + "</div></div>";
      apply.disabled = list.length === 0;
    }

    function dateField(label, value) {
      var wrap = D.el("div.field");
      wrap.appendChild(D.el("label", { text: label }));
      var input = D.el("input.input", { type: "date", value: value });
      wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }
  }
})(typeof self !== "undefined" ? self : this);
