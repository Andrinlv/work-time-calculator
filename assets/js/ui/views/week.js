/* ==========================================================================
   ZEITKONTO — Ansicht „Woche“
   --------------------------------------------------------------------------
   Sieben Zeilen, ein gemeinsamer Zeitmassstab. Man sieht sofort, an welchen
   Tagen früh angefangen wurde und wo Pausen fehlen.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).week = { render: render };

  function render(host, App) {
    var s = App.settings();
    var firstDay = s.firstDayOfWeek === 0 ? 0 : 1;
    var start = T.startOfWeek(App.weekAnchor || App.date, firstDay);
    var end = T.addDays(start, 6);
    var range = App.range(start, end);
    var totals = range.totals;
    var weekTarget = R.weeklyTargetMinutes(s);

    /* ---- Kopf ---- */
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", {
      text: I.t("week.kw", { n: T.isoWeek(start) }) + " · " + I.formatDate(start, { day: "2-digit", month: "short" }) +
        " – " + I.formatDate(end, { day: "2-digit", month: "short", year: "numeric" })
    }));
    left.appendChild(D.el("p.lede", { text: I.t("week.lede") }));
    head.appendChild(left);

    var controls = D.el("div.row.tight");
    var prev = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.back"), html: D.icon("left") });
    prev.addEventListener("click", function () { App.weekAnchor = T.addDays(start, -7); App.renderChrome(); App.renderView(); });
    var next = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.next"), html: D.icon("right") });
    next.addEventListener("click", function () { App.weekAnchor = T.addDays(start, 7); App.renderChrome(); App.renderView(); });
    var now = D.el("button.btn.sm", { type: "button", text: I.t("common.today") });
    now.addEventListener("click", function () { App.weekAnchor = T.todayISO(); App.renderChrome(); App.renderView(); });
    controls.appendChild(prev);
    controls.appendChild(next);
    controls.appendChild(now);
    head.appendChild(controls);
    host.appendChild(head);

    /* ---- Kennzahlen ---- */
    var kpis = D.el("div.grid-4.mb-4.stagger");
    kpi(kpis, I.t("week.total"), App.fmt(totals.net + totals.credited),
      App.fmt(totals.net) + " " + I.t("day.net").toLowerCase());
    kpi(kpis, I.t("week.target"), App.fmt(totals.target), I.t("set.weeklyTotal") + " " + App.fmt(weekTarget));
    kpi(kpis, I.t("day.balance"), App.fmtSigned(totals.balance),
      totals.recordedDays + " " + I.t("stats.recordedDays").toLowerCase(),
      totals.balance > 0 ? "plus" : totals.balance < 0 ? "minus" : "");
    kpi(kpis, I.t("day.breakTotal"), App.fmt(totals.breakTotal),
      totals.autoDeducted ? "+" + App.fmt(totals.autoDeducted) + " " + I.t("day.autoDeducted").toLowerCase() : "");
    host.appendChild(kpis);

    if (s.maxWeeklyMinutes && totals.net > s.maxWeeklyMinutes) {
      var warn = D.el("div.notice.warn.mb-4");
      warn.innerHTML = D.icon("alert") + "<div><strong>" +
        D.esc(I.t("warn.over-daily-max", { v: App.fmt(totals.net - s.maxWeeklyMinutes) })) +
        "</strong><div class='sub'>" + D.esc(I.t("set.compliance")) + " · " + D.esc(App.fmt(s.maxWeeklyMinutes)) + "</div></div>";
      host.appendChild(warn);
    }

    /* ---- Zeitmassstab ---- */
    var from = 5 * 60, to = 21 * 60;
    range.days.forEach(function (r) {
      if (r.startTl !== null) from = Math.min(from, Math.floor(r.startTl / 60) * 60);
      if (r.endTl !== null) to = Math.max(to, Math.ceil(r.endTl / 60) * 60);
    });
    var span = Math.max(120, to - from);
    function pct(v) { return ((v - from) / span) * 100; }

    var card = D.el("section.card.pad-0");
    var scaleHead = D.el("div", {
      style: {
        display: "grid", gridTemplateColumns: "132px minmax(0,1fr) 96px 96px",
        gap: "12px", padding: "10px 16px", borderBottom: "1px solid var(--line)",
        background: "var(--surface-2)", fontSize: "10px", fontWeight: "800",
        letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink-3)"
      }
    });
    scaleHead.appendChild(D.el("div", { text: I.t("common.day") }));
    var scale = D.el("div", { style: { position: "relative", height: "14px" } });
    for (var h = Math.ceil(from / 60) * 60; h <= to; h += 120) {
      scale.appendChild(D.el("span", {
        text: T.formatHHMM(h),
        style: { position: "absolute", left: pct(h) + "%", transform: "translateX(-50%)", fontSize: "9px" }
      }));
    }
    scaleHead.appendChild(scale);
    scaleHead.appendChild(D.el("div", { text: I.t("day.net"), style: { textAlign: "right" } }));
    scaleHead.appendChild(D.el("div", { text: I.t("day.balance"), style: { textAlign: "right" } }));
    card.appendChild(scaleHead);

    range.days.forEach(function (res) {
      var row = D.el("div.week-row" + (res.date === T.todayISO() ? ".today" : ""));

      var label = D.el("div.wd");
      label.appendChild(D.el("span", { text: I.weekdayName(res.weekday, "long") }));
      var sub = I.formatDate(res.date, { day: "2-digit", month: "2-digit" });
      if (res.holiday) sub += " · " + res.holiday.name;
      else if (res.type !== "work") sub += " · " + I.t("type." + res.type);
      label.appendChild(D.el("small", { text: sub }));
      row.appendChild(label);

      var track = D.el("div.track");
      if (res.segments.length) {
        res.segments.forEach(function (seg) {
          track.appendChild(D.el("div.seg." + (seg.kind === "break" ? "brk" : "work"), {
            style: { left: pct(seg.start) + "%", width: Math.max(0.4, pct(seg.end) - pct(seg.start)) + "%" },
            "data-tip": (seg.kind === "break" ? I.t("day.break") : I.t("day.work")) + " " +
              T.formatHHMM(seg.start) + "–" + T.formatHHMM(seg.end)
          }));
        });
        if (res.recommendedLeaveTl !== null && res.recommendedLeaveTl >= from && res.recommendedLeaveTl <= to) {
          track.appendChild(D.el("div.target-mark", {
            style: { left: pct(res.recommendedLeaveTl) + "%" },
            "data-tip": I.t("day.recommendedLeave") + " " + res.recommendedLeave
          }));
        }
      } else if (res.credited > 0) {
        track.appendChild(D.el("div.seg", {
          style: {
            left: "0%", width: "100%", background: res.typeMeta.color, opacity: ".28",
            borderRadius: "4px"
          },
          "data-tip": I.t("type." + res.type)
        }));
      }
      row.appendChild(track);

      row.appendChild(D.el("div.num", { text: res.recorded ? App.fmt(res.net) : "–" }));
      row.appendChild(D.el("div.num", {
        class: res.balance > 0 ? "tone-plus" : res.balance < 0 ? "tone-minus" : "tone-mute",
        text: res.recorded ? App.fmtSigned(res.balance) : "–"
      }));

      row.addEventListener("click", function () {
        ZK.DayModal.open(App, res.date, function () { App.renderChrome(); App.renderView(); });
      });
      card.appendChild(row);
    });

    host.appendChild(card);

    /* ---- Tagesvergleich als Balken ---- */
    var chartCard = D.el("section.card.mt-4");
    chartCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("stats.weeklyHours")) + "</h2>" }));
    var chartHost = D.el("div");
    chartCard.appendChild(chartHost);
    host.appendChild(chartCard);

    ZK.Charts.bars(chartHost, range.days.map(function (r) {
      return {
        label: I.weekdayName(r.weekday, "short"),
        title: I.formatDate(r.date, { weekday: "long", day: "numeric", month: "long" }),
        value: r.net + r.credited,
        sub: I.t("day.target") + " " + App.fmt(r.target),
        color: r.type !== "work" ? "var(--chart-mark-2)" : "var(--chart-mark)"
      };
    }), {
      height: 210,
      reference: Math.round(weekTarget / (s.workdays || [1, 2, 3, 4, 5]).length),
      referenceLabel: I.t("day.target"),
      valueFormat: function (v) { return App.fmt(v); },
      tickFormat: function (v) { return T.formatDuration(v, "clock"); },
      emptyText: I.t("stats.needData")
    });
  }

  function kpi(host, title, value, sub, tone) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone ? " tone-" + tone : "") + '">' + D.esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + D.esc(sub) + "</div>" : "");
    host.appendChild(node);
  }
})(typeof self !== "undefined" ? self : this);
