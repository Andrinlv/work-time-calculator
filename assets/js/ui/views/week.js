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
    var CW = ZK.CalWeek;
    var s = App.settings();
    var today = T.todayISO();
    var firstDay = s.firstDayOfWeek === 0 ? 0 : 1;
    var start = T.startOfWeek(App.weekAnchor || App.date, firstDay);
    var end = T.addDays(start, 6);
    /* Die Kalenderwoche hängt am Montag der angezeigten Woche — beginnt die
       Woche am Sonntag, gehört dieser Sonntag noch zur ISO-Vorwoche. Den
       Anker auf den Montag legen, damit Kopfzeile und Ansicht dieselbe KW zeigen. */
    var ref = T.addDays(start, firstDay === 0 ? 1 : 0);
    if (App.weekAnchor !== ref) {
      var shown = T.isoWeek(App.weekAnchor || App.date);
      App.weekAnchor = ref;
      if (shown !== T.isoWeek(ref)) App.renderChrome();
    }

    var range = App.range(start, end);
    var totals = range.totals;
    var weekTarget = R.weeklyTargetMinutes(s);
    var tStart = CW.trackingStart(App.store.allDays(), s, App.store.getMeta ? App.store.getMeta() : null);
    var sum = CW.summarize(range.days, { today: today, start: tStart, hasRecord: App.hasRecord });

    /* ---- Kopf ---- */
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", {
      text: I.t("week.kw", { n: T.isoWeek(ref) }) + " · " + I.formatDate(start, { day: "2-digit", month: "short" }) +
        " – " + I.formatDate(end, { day: "2-digit", month: "short", year: "numeric" })
    }));
    left.appendChild(D.el("p.lede", { text: I.t("week.lede") }));
    head.appendChild(left);

    var controls = D.el("div.row.tight");
    var prev = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.back"), html: D.icon("left") });
    prev.addEventListener("click", function () { goWeek(T.addDays(ref, -7)); });
    var next = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.next"), html: D.icon("right") });
    next.addEventListener("click", function () { goWeek(T.addDays(ref, 7)); });
    var now = D.el("button.btn.sm", { type: "button", text: I.t("common.today") });
    now.addEventListener("click", function () { App.setDate(today); });
    controls.appendChild(prev);
    controls.appendChild(next);
    controls.appendChild(now);
    head.appendChild(controls);
    host.appendChild(head);

    function goWeek(anchor) {
      App.weekAnchor = anchor;
      var ws = T.startOfWeek(anchor, firstDay);
      var keep = App.date >= ws && App.date <= T.addDays(ws, 6);
      CW.writeViewHash(App, "week", keep ? App.date : anchor);
      App.renderChrome();
      App.renderView();
    }

    /* ---- Kennzahlen ---- */
    var kpis = D.el("div.grid-4.week-kpis.mb-4.stagger");
    kpi(kpis, I.t("week.total"), App.fmt(sum.net + sum.credited),
      CW.actualSub(sum.net, sum.credited, App.fmt));
    kpi(kpis, I.t("week.target"), App.fmt(sum.target),
      sum.target !== weekTarget ? I.t("week.contract", { v: App.fmt(weekTarget) }) : I.tn("cal.workdays", sum.workdays));
    var balSub = sum.runningDays
      ? '<i class="live-dot" aria-hidden="true"></i>' + D.esc(I.t("cal.provisionalSub", { v: App.fmtSigned(sum.provisional) }))
      : D.esc(sum.incomplete.length ? I.tn("cal.missingCount", sum.incomplete.length)
        : sum.gaps.length ? I.tn("cal.gapsCount", sum.gaps.length)
          : I.tn("cal.recordedDays", sum.recordedDays));
    kpi(kpis, I.t("week.balance"), App.fmtSigned(sum.settled), balSub,
      sum.settled > 0 ? "plus" : sum.settled < 0 ? "minus" : "", true);
    kpi(kpis, I.t("day.breakTotal"), App.fmt(totals.breakTotal),
      totals.autoDeducted ? I.t("week.autoSub", { v: App.fmt(totals.autoDeducted) }) : "");
    host.appendChild(kpis);

    if (s.maxWeeklyMinutes && sum.net > s.maxWeeklyMinutes) {
      var warn = D.el("div.notice.warn.mb-4");
      warn.innerHTML = D.icon("alert") + "<div><strong>" +
        D.esc(I.t("warn.over-weekly-max", { v: App.fmt(sum.net - s.maxWeeklyMinutes) })) +
        "</strong><div class='sub'>" + D.esc(I.t("set.compliance") + " · " + I.t("week.maxWeeklySub", { v: App.fmt(s.maxWeeklyMinutes) })) + "</div></div>";
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

    var card = D.el("section.card.pad-0.week-table");
    var scaleHead = D.el("div.week-row.week-head", { "aria-hidden": "true" });
    scaleHead.appendChild(D.el("div.wd", { text: I.t("common.day") }));
    var scale = D.el("div.scale");
    for (var h = Math.ceil(from / 120) * 120; h <= to; h += 120) {
      var hour = (h / 60) % 24;
      var nextDay = h >= T.DAY;
      var at = pct(h);
      // Randbeschriftungen nach innen schieben, damit sie nicht über die Spur hinausragen
      var tick = D.el("span" + (((h / 60) % 6) !== 0 ? ".minor" : "") + (at < 4 ? ".edge-l" : at > 96 ? ".edge-r" : ""), { style: { left: at + "%" } });
      tick.innerHTML = '<span class="lg">' + T.formatHHMM(h) + "</span>" +
        '<span class="sh">' + T.pad2(hour) + "</span>" + (nextDay ? "<sup>+1</sup>" : "");
      scale.appendChild(tick);
    }
    scaleHead.appendChild(scale);
    scaleHead.appendChild(D.el("div.num.net", { text: I.t("week.colNet") }));
    scaleHead.appendChild(D.el("div.num.bal", { text: I.t("week.colBalance") }));
    card.appendChild(scaleHead);

    var liveRows = [];
    range.days.forEach(function (res) {
      card.appendChild(buildRow(res));
    });
    host.appendChild(card);

    /* Laufender Tag: Zwischenstand jede Minute nachführen */
    if (liveRows.length && App.onTick) {
      var lastMinute = T.nowMinutes();
      App.onTick(function () {
        var nowM = T.nowMinutes();
        if (nowM === lastMinute) return;
        lastMinute = nowM;
        liveRows.forEach(function (lr) {
          var r = App.day(lr.iso);
          if (!CW.isProvisional(r)) return;
          setDuration(lr.net, r.net);
          lr.bal.textContent = App.fmtSigned(CW.liveBalance(r));
        });
      });
    }

    function buildRow(res) {
      var st = CW.dayState(res, today, tStart);
      var isToday = res.date === today;
      var hName = CW.holidayName(res.holiday);
      var aria = [I.formatDate(res.date, { weekday: "long", day: "numeric", month: "long" })];

      var row = D.el("div.week-row", {
        class: (isToday ? "today " : "") + "is-" + st,
        role: "button",
        tabindex: "0",
        "data-date": res.date,
        "aria-current": isToday ? "date" : null
      });

      /* Beschriftung: Wochentag, Datum, Feiertag/Tagesart, Zustand */
      var label = D.el("div.wd");
      label.appendChild(D.el("span.wd-name", { text: I.weekdayName(res.weekday, "long") }));
      var small = D.el("small");
      var sub = I.formatDate(res.date, { day: "2-digit", month: "2-digit" });
      var extra = "";
      if (res.type !== "work" && res.type !== "holiday" && !(res.type === "free" && !App.record(res.date).type)) {
        extra = I.t("type." + res.type) + CW.factorText(res, false);
      } else if (hName) {
        extra = hName;
      }
      small.appendChild(D.el("span", { text: sub + (extra ? " · " + extra : "") }));
      if (extra) aria.push(extra);
      if (st === "running") {
        small.appendChild(D.el("span.wk-flag.live", {
          html: '<i class="live-dot" aria-hidden="true"></i>' + D.esc(I.t("day.runningShort"))
        }));
      } else if (st === "incomplete") {
        small.appendChild(D.el("span.wk-flag.miss", { html: D.icon("alert") + D.esc(I.t("day.missingEnd")) }));
        aria.push(I.t("day.missingEnd"));
      } else if (st === "gap") {
        small.appendChild(D.el("span.wk-flag.gap", { text: I.t("cal.gapTip") }));
        aria.push(I.t("cal.gapTip"));
      }
      label.appendChild(small);
      row.appendChild(label);

      /* Zeitstrahl */
      var track = D.el("div.track");
      if (to > T.DAY && from < T.DAY) {
        track.appendChild(D.el("div.midnight", { style: { left: pct(T.DAY) + "%" } }));
      }
      if (res.credited > 0) {
        track.appendChild(D.el("div.credit", {
          style: { "--c": res.typeMeta.color },
          "data-tip": (extra || I.t("type." + res.type)) + " · " + I.t("day.credited") + " " + App.fmt(res.credited)
        }));
      }
      res.segments.forEach(function (seg) {
        track.appendChild(D.el("div.seg." + (seg.kind === "break" ? "brk" : "work"), {
          style: { left: pct(seg.start) + "%", width: Math.max(0.4, pct(seg.end) - pct(seg.start)) + "%" },
          "data-tip": (seg.kind === "break" ? I.t("day.break") : I.t("day.work")) + " " +
            T.formatHHMM(seg.start) + "–" + T.formatHHMM(seg.end)
        }));
      });
      if (st === "running" && res.endTl !== null) {
        track.appendChild(D.el("div.now-mark", { style: { left: pct(res.endTl) + "%" } }));
      }
      if (st === "incomplete" && res.startTl !== null) {
        track.appendChild(D.el("div.start-tick", {
          style: { left: pct(res.startTl) + "%" },
          "data-tip": I.t("day.clockIn") + " " + res.start + " · " + I.t("day.missingEnd")
        }));
      }
      // Gehen-Empfehlung nur, wenn es überhaupt Soll zu leisten gab
      var needed = res.target - res.credited;
      if ((st === "running" || res.complete) && needed > 0 && res.recommendedLeaveTl !== null &&
          res.recommendedLeaveTl >= from && res.recommendedLeaveTl <= to) {
        track.appendChild(D.el("div.target-mark", {
          style: { left: pct(res.recommendedLeaveTl) + "%" },
          "data-tip": I.t("day.recommendedLeave") + " " + res.recommendedLeave
        }));
      }
      row.appendChild(track);

      /* Netto und Saldo */
      var netNode = D.el("div.num.net");
      var balNode = D.el("div.num.bal");
      if (st === "running") {
        var v = CW.liveBalance(res);
        setDuration(netNode, res.net);
        balNode.classList.add("prov");
        balNode.textContent = App.fmtSigned(v);
        balNode.setAttribute("data-tip", I.t("day.provisional"));
        liveRows.push({ iso: res.date, net: netNode, bal: balNode });
        aria.push(I.t("day.runningShort") + ", " + App.fmt(res.net) + ", " + App.fmtSigned(v) + " " + I.t("day.provisional"));
      } else if (st === "incomplete") {
        netNode.textContent = "?";
        netNode.classList.add("miss");
        balNode.textContent = "–";
        balNode.classList.add("tone-mute");
      } else {
        if (res.net > 0 || res.complete) setDuration(netNode, res.net);
        else netNode.textContent = "–";
        if (st === "recorded") {
          balNode.textContent = App.fmtSigned(res.balance);
          balNode.classList.add(res.balance > 0 ? "tone-plus" : res.balance < 0 ? "tone-minus" : "tone-mute");
          if (res.net > 0) aria.push(I.t("day.net") + " " + App.fmt(res.net));
          aria.push(I.t("day.balance") + " " + App.fmtSigned(res.balance));
        } else {
          balNode.textContent = "–";
          balNode.classList.add("tone-mute");
        }
      }
      row.appendChild(netNode);
      row.appendChild(balNode);
      row.setAttribute("aria-label", aria.join(", "));

      function open() {
        ZK.DayModal.open(App, res.date, function () {
          var again = D.qs('.week-row[data-date="' + res.date + '"]');
          if (again && document.activeElement === document.body) CW.focusQuietly(again);
        }, { focusEnd: st === "incomplete" });
      }
      row.addEventListener("click", open);
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); open(); }
      });
      return row;
    }

    /* Dauer lang („8 h 28 min“) und kurz („8:28“) — Telefone zeigen die kurze */
    function setDuration(node, minutes) {
      var style = s.durationStyle;
      node.innerHTML = '<span class="lg">' + D.esc(App.fmt(minutes)) + "</span>" +
        '<span class="sh">' + D.esc(style === "decimal" ? App.fmt(minutes) : T.formatDuration(minutes, "clock")) + "</span>";
    }

    /* ---- Tagesvergleich als Balken ---- */
    var chartCard = D.el("section.card.mt-4");
    chartCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("week.chartTitle")) + "</h2>" }));
    var chartHost = D.el("div");
    chartCard.appendChild(chartHost);
    host.appendChild(chartCard);

    ZK.Charts.bars(chartHost, range.days.map(function (r) {
      var subParts = [I.t("day.target") + " " + App.fmt(r.target)];
      if (r.credited && r.net) subParts.push(I.t("cal.actualSplit", { net: App.fmt(r.net), credit: App.fmt(r.credited) }));
      if (CW.isProvisional(r)) subParts.push(I.t("day.runningShort"));
      return {
        label: I.weekdayName(r.weekday, "short"),
        title: I.formatDate(r.date, { weekday: "long", day: "numeric", month: "long" }),
        // Am Feiertag gearbeitet: der Balken zeigt die Arbeit, die Gutschrift steht im Tooltip
        value: r.type === "holiday" && r.net > 0 ? r.net : r.net + r.credited,
        sub: subParts.join(" · "),
        color: r.type !== "work" || CW.isProvisional(r) ? "var(--chart-mark-2)" : "var(--chart-mark)"
      };
    }), {
      height: 210,
      reference: Math.round(weekTarget / ((s.workdays || [1, 2, 3, 4, 5]).length || 5)),
      referenceLabel: I.t("day.target"),
      valueFormat: function (v) { return App.fmt(v); },
      tickFormat: function (v) { return T.formatDuration(v, "clock"); },
      emptyText: I.t("stats.needData")
    });
  }

  function kpi(host, title, value, sub, tone, subIsHtml) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone ? " tone-" + tone : "") + '">' + D.esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + (subIsHtml ? sub : D.esc(sub)) + "</div>" : "");
    host.appendChild(node);
  }
})(typeof self !== "undefined" ? self : this);
