/* ==========================================================================
   ZEITKONTO — Ansicht „Werkzeuge“
   --------------------------------------------------------------------------
   Vier Dinge, die vorausdenken statt nur zurückzurechnen:

     · Schnellerfassung   eine Zeile tippen statt vier Felder ausfüllen
     · Gleitzeit-Planer   was pro Tag nötig ist, um ein Ziel zu erreichen
     · Brückentage        wo wenige Ferientage viele freie Tage ergeben
     · Monatscheck        was vor dem Abschluss noch offen ist
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, H = ZK.Holidays, I = ZK.I18n;
  var P = ZK.Planner;

  (ZK.Views = ZK.Views || {}).tools = { render: render };

  var checkMonth = null;   // bleibt über Neuzeichnungen erhalten

  function render(host, App) {
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("tools.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("tools.lede") }));
    head.appendChild(left);
    host.appendChild(head);

    var grid = D.el("div.grid-2");
    host.appendChild(grid);

    grid.appendChild(quickEntryCard(App));
    grid.appendChild(plannerCard(App));
    host.appendChild(bridgeCard(App));
    host.appendChild(auditCard(App));
  }

  /* ==================================================================== */
  /* 1 · Schnellerfassung                                                  */
  /* ==================================================================== */

  function quickEntryCard(App) {
    var card = D.el("section.card");
    card.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("tools.quick")) + "</h2>" }));
    card.appendChild(D.el("p.muted", {
      text: I.t("tools.quickHint"), style: { fontSize: "12.5px", marginBottom: "12px" }
    }));

    var input = D.el("input.input.mono", {
      type: "text", placeholder: I.t("tools.quickPlaceholder"),
      autocomplete: "off", spellcheck: "false"
    });
    card.appendChild(input);

    var preview = D.el("div.mt-3");
    card.appendChild(preview);

    var apply = D.el("button.btn.primary.block.mt-3", {
      type: "button", text: I.t("common.apply"), disabled: true
    });
    card.appendChild(apply);

    var examples = D.el("div.chipset.mt-4");
    [
      "8-17 30",
      "gestern 7:45-16:30 p45",
      "12.8.-16.8. ferien",
      "krank",
      "morgen 6-14:30"
    ].forEach(function (ex) {
      var chip = D.el("button.chip", { type: "button", text: ex });
      chip.addEventListener("click", function () {
        input.value = ex;
        update();
        input.focus();
      });
      examples.appendChild(chip);
    });
    card.appendChild(examples);

    var parsed = null;

    input.addEventListener("input", update);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && parsed) { e.preventDefault(); commit(); }
    });
    apply.addEventListener("click", commit);

    function update() {
      parsed = P.parseQuickEntry(input.value, T.todayISO());
      D.clear(preview);
      apply.disabled = !parsed;
      input.classList.toggle("invalid", !!input.value.trim() && !parsed);

      if (!parsed) {
        if (input.value.trim()) {
          preview.appendChild(D.el("div.hint.err", { text: I.t("tools.quickUnreadable") }));
        }
        return;
      }

      var list = D.el("div.col", { style: { gap: "6px" } });
      parsed.dates.slice(0, 8).forEach(function (date) {
        var patch = P.quickEntryToPatch(parsed)[date];
        var res = ZK.Engine.computeDay(
          Object.assign({}, App.record(date), patch),
          { settings: App.settings(), holiday: App.holiday(date), isToday: date === T.todayISO() }
        );
        var row = D.el("div", {
          style: {
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: "10px", padding: "7px 10px", borderRadius: "var(--r-sm)",
            background: "var(--surface-2)", fontSize: "12.5px"
          }
        });
        row.innerHTML =
          "<span><b>" + D.esc(I.weekdayName(T.weekdayOf(date), "short")) + " " +
          D.esc(I.formatDate(date, { day: "2-digit", month: "2-digit" })) + "</b>" +
          (parsed.type ? " · <span style='color:" + R.dayType(parsed.type).color + "'>" +
            D.esc(I.t("type." + parsed.type)) + "</span>" : "") +
          (parsed.start ? " · <span class='mono'>" + D.esc(parsed.start) + "–" + D.esc(parsed.end || "?") + "</span>" : "") +
          "</span>" +
          "<span class='mono fw-8 " + (res.balance > 0 ? "tone-plus" : res.balance < 0 ? "tone-minus" : "") + "'>" +
          D.esc(App.fmtSigned(res.balance)) + "</span>";
        list.appendChild(row);
      });
      if (parsed.dates.length > 8) {
        list.appendChild(D.el("p.muted", { text: "+ " + (parsed.dates.length - 8), style: { fontSize: "12px" } }));
      }
      preview.appendChild(list);
      apply.textContent = I.tn("tools.quickApply", parsed.dates.length);
    }

    function commit() {
      if (!parsed) return;
      var patch = P.quickEntryToPatch(parsed, { breakLabel: I.t("day.lunch") });
      App.store.setDays(patch, { label: "quick" });
      App.afterChange();
      D.toast(I.tn("tools.quickDone", parsed.dates.length), {
        tone: "plus",
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
      input.value = "";
      parsed = null;
      update();
    }

    return card;
  }

  /* ==================================================================== */
  /* 2 · Gleitzeit-Planer                                                  */
  /* ==================================================================== */

  function plannerCard(App) {
    var card = D.el("section.card");
    card.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("tools.planner")) + "</h2>" }));

    var balance = App.accountBalance().minutes;
    var dayTarget = R.baseTargetFor(T.todayISO(), App.settings(), 2) || 504;
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
    var row = D.el("div.grid-2");
    var untilField = D.el("div.field");
    untilField.appendChild(D.el("label", { text: I.t("tools.until") }));
    var until = D.el("input.input", { type: "date", value: T.endOfMonth(T.todayISO()) });
    untilField.appendChild(until);
    row.appendChild(untilField);

    var targetField = D.el("div.field");
    targetField.appendChild(D.el("label", { text: I.t("tools.targetBalance") }));
    var target = D.el("input.input.mono", { type: "text", value: "±0:00", style: { textAlign: "right" } });
    targetField.appendChild(target);
    row.appendChild(targetField);
    card.appendChild(row);

    var out = D.el("div.mt-4");
    card.appendChild(out);

    [until, target].forEach(function (n) { n.addEventListener("change", recompute); });
    recompute();

    function recompute() {
      D.clear(out);
      var to = until.value;
      if (!T.isValidISO(to) || to < T.todayISO()) {
        out.appendChild(D.el("p.muted", { text: I.t("tools.pickFuture"), style: { fontSize: "12.5px" } }));
        return;
      }

      var raw = target.value.trim().replace("−", "-").replace("±", "");
      var neg = raw.indexOf("-") === 0;
      var mins = T.parseDuration(raw.replace(/^[+\-]/, "")) || 0;
      var wanted = neg ? -Math.abs(mins) : Math.abs(mins);

      /* Nur künftige Arbeitstage ohne bereits erfasste Abwesenheit */
      var days = [];
      T.rangeDays(T.addDays(T.todayISO(), 1), to).forEach(function (iso) {
        var res = App.day(iso);
        if (res.target > 0 && res.credited === 0 && !res.recorded) {
          days.push({ date: iso, target: res.target });
        }
      });

      var plan = P.distributeBalance(balance, wanted, days);
      if (!plan.feasible) {
        var none = D.el("div.notice.warn");
        none.innerHTML = D.icon("alert") + "<div>" + D.esc(I.t("tools.noWorkdays")) + "</div>";
        out.appendChild(none);
        return;
      }

      var summary = D.el("div.notice." + (plan.strained ? "warn" : "info"));
      summary.innerHTML = D.icon(plan.strained ? "alert" : "info") +
        "<div><strong>" + D.esc(I.t("tools.perDay", {
          v: T.formatSigned(plan.perDay, "clock"), n: plan.dayCount
        })) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("tools.perDayHint", {
          net: App.fmt(plan.days[0].plannedNet)
        })) + (plan.strained ? " · " + D.esc(I.t("tools.strained")) : "") + "</div></div>";
      out.appendChild(summary);

      /* Beispiel-Gehenzeit für den ersten geplanten Tag */
      var first = plan.days[0];
      var s = App.settings();
      var leave = P.leaveTimeForBalance({
        start: (s.defaultLunch && "08:00") || "08:00",
        target: first.target,
        wantBalance: first.deltaPerDay,
        breakMinutes: 30,
        breakRuleset: s.breakRuleset,
        customBreakTiers: s.customBreakTiers,
        autoDeductBreak: s.autoDeductBreak
      });
      if (leave) {
        out.appendChild(D.el("p.muted.mt-3", {
          style: { fontSize: "12.5px" },
          html: D.esc(I.t("tools.exampleDay", { start: "08:00", leave: leave.text }))
        }));
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
    var year = T.yearOf(App.date || T.todayISO());

    var head = D.el("div.card-head");
    head.innerHTML = "<h2>" + D.esc(I.t("tools.bridges")) + "</h2>";
    var actions = D.el("div.actions");
    var yearSel = D.el("select.select", { style: { minWidth: "110px" } });
    [year, year + 1].forEach(function (y) {
      yearSel.appendChild(D.el("option", { value: y, text: String(y) }));
    });
    actions.appendChild(yearSel);
    head.appendChild(actions);
    card.appendChild(head);

    card.appendChild(D.el("p.muted", {
      text: I.t("tools.bridgesHint"), style: { fontSize: "12.5px", marginBottom: "14px" }
    }));

    var list = D.el("div.col", { style: { gap: "10px" } });
    card.appendChild(list);

    yearSel.addEventListener("change", function () { draw(+yearSel.value); });
    draw(year);

    function draw(y) {
      D.clear(list);
      var holidays = s.autoHolidays === false ? {} : H.forYear(y, s.holidayRegion);
      var targets = s.weeklyTargets || [];

      var bridges = P.bridgeDays({
        from: y + "-01-01",
        to: y + "-12-31",
        isHoliday: function (iso) { return !!holidays[iso]; },
        isWorkday: function (iso) { return (targets[T.weekdayOf(iso)] || 0) > 0; }
      });

      if (!bridges.length) {
        var empty = D.el("div.empty");
        empty.innerHTML = '<div class="rings"><i></i><i></i></div><p>' + D.esc(I.t("tools.noBridges")) + "</p>";
        list.appendChild(empty);
        return;
      }

      bridges.forEach(function (b) {
        var row = D.el("div", {
          style: {
            display: "grid", gridTemplateColumns: "minmax(0,1fr) auto",
            gap: "12px", alignItems: "center", padding: "13px 15px",
            border: "1px solid var(--line)", borderRadius: "var(--r-md)",
            background: "var(--surface-2)"
          }
        });

        var names = b.holidays.map(function (iso) {
          var h = holidays[iso];
          return h ? (h.names[I.getLang()] || h.name) : "";
        }).filter(Boolean).join(", ");

        var info = D.el("div", { style: { minWidth: "0" } });
        info.innerHTML =
          "<div style='font-size:14px;font-weight:800;letter-spacing:-.02em'>" +
          D.esc(I.tn("tools.bridgeHeadline", b.vacationDays, { v: b.vacationDays, t: b.totalDays })) + "</div>" +
          "<div style='font-size:12px;color:var(--ink-3);margin-top:3px'>" +
          D.esc(I.formatDate(b.from, { day: "2-digit", month: "short" })) + " – " +
          D.esc(I.formatDate(b.to, { day: "2-digit", month: "short", year: "numeric" })) +
          (names ? " · " + D.esc(names) : "") + "</div>" +
          "<div style='font-size:11px;color:var(--ink-3);margin-top:4px' class='mono'>" +
          D.esc(b.dates.map(function (d) {
            return I.formatDate(d, { day: "2-digit", month: "2-digit" });
          }).join(" · ")) + "</div>";
        row.appendChild(info);

        var right = D.el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
        right.appendChild(D.el("span.tag.plus", { text: "×" + b.ratio }));
        var take = D.el("button.btn.sm", { type: "button", text: I.t("tools.takeBridge") });
        take.addEventListener("click", function () { confirmBridge(App, b, names); });
        right.appendChild(take);
        row.appendChild(right);

        list.appendChild(row);
      });
    }

    return card;
  }

  function confirmBridge(App, bridge, names) {
    var body = D.el("div.col");
    body.appendChild(D.el("p", {
      style: { fontSize: "13.5px", lineHeight: "1.6" },
      html: D.esc(I.t("tools.bridgeConfirm", { v: bridge.vacationDays, t: bridge.totalDays })) +
        (names ? "<br><span class='muted'>" + D.esc(names) + "</span>" : "")
    }));

    var chips = D.el("div.chipset");
    bridge.dates.forEach(function (iso) {
      chips.appendChild(D.el("span.tag", {
        text: I.weekdayName(T.weekdayOf(iso), "short") + " " +
          I.formatDate(iso, { day: "2-digit", month: "2-digit" })
      }));
    });
    body.appendChild(chips);

    /* Tage, die schon etwas enthalten, ausdrücklich benennen */
    var occupied = bridge.dates.filter(function (iso) { return App.hasRecord(iso); });
    if (occupied.length) {
      var warn = D.el("div.notice.warn");
      warn.innerHTML = D.icon("alert") + "<div>" +
        D.esc(I.tn("tools.bridgeOccupied", occupied.length)) + "</div>";
      body.appendChild(warn);
    }

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var ok = D.el("button.btn.primary", { type: "button", text: I.t("tools.takeBridge") });
    var m = D.modal({ title: I.t("tools.bridges"), body: body, size: "slim", footer: [cancel, ok] });

    cancel.addEventListener("click", function () { m.close(); });
    ok.addEventListener("click", function () {
      var patch = {};
      bridge.dates.forEach(function (iso) {
        patch[iso] = { type: "vacation", absenceFactor: 1, start: "", end: "", breaks: [] };
      });
      App.store.setDays(patch, { label: "bridge" });
      App.afterChange();
      m.close();
      D.toast(I.tn("tools.bridgeDone", bridge.dates.length), {
        tone: "plus", icon: "umbrella",
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
      if (App.settings().confetti !== false) D.confetti({ count: 60 });
    });
  }

  /* ==================================================================== */
  /* 4 · Monatscheck                                                       */
  /* ==================================================================== */

  function auditCard(App) {
    var card = D.el("section.card.mt-4");
    if (!checkMonth) checkMonth = T.monthKey(T.todayISO());

    var head = D.el("div.card-head");
    head.innerHTML = "<h2>" + D.esc(I.t("tools.audit")) + "</h2>";
    var actions = D.el("div.actions");
    var monthSel = D.el("select.select", { style: { minWidth: "150px" } });
    for (var i = 0; i < 12; i++) {
      var mk = T.monthKey(T.addMonths(T.startOfMonth(T.todayISO()), -i));
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
      var audit = P.auditRange(range.days, T.todayISO());

      var kpis = D.el("div.grid-3.mb-4");
      kpiInto(kpis, I.t("cal.monthBalance"), App.fmtSigned(range.totals.balance), "",
        range.totals.balance > 0 ? "plus" : range.totals.balance < 0 ? "minus" : "");
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
        title.innerHTML = D.icon(issue.level === "error" ? "alert" : issue.level === "info" ? "info" : "alert") +
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
