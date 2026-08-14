/* ==========================================================================
   ZEITKONTO — Ansicht „Statistik“
   --------------------------------------------------------------------------
   Jede Grafik beantwortet genau eine Frage. Kein Diagramm hat zwei Skalen,
   Plus und Minus tragen immer Vorzeichen, Lage und Schraffur zusätzlich zur
   Farbe.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).stats = { render: render };

  var periodState = "month";

  function render(host, App) {
    var s = App.settings();
    var today = T.todayISO();
    var allDays = App.store.allDays();
    var keys = Object.keys(allDays).sort();

    /* ---- Zeitraum bestimmen ---- */
    var period = resolvePeriod(periodState, App, keys);

    /* ---- Kopf ---- */
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("stats.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("stats.lede") }));
    head.appendChild(left);

    var seg = D.el("div.segmented", { role: "group", "aria-label": I.t("stats.period") });
    [
      ["month", I.t("common.month")],
      ["quarter", "90 " + I.t("common.days")],
      ["year", I.t("common.year")],
      ["all", I.t("common.all")]
    ].forEach(function (opt) {
      var btn = D.el("button", { type: "button", text: opt[1], "aria-pressed": periodState === opt[0] ? "true" : "false" });
      btn.addEventListener("click", function () { periodState = opt[0]; App.renderView(); });
      seg.appendChild(btn);
    });
    head.appendChild(seg);
    host.appendChild(head);

    if (!keys.length) {
      host.appendChild(emptyCard(I.t("stats.needData")));
      return;
    }

    var range = App.range(period.from, period.to);
    var totals = range.totals;
    var account = App.accountBalance(period.to);

    /* ---- Kennzahlen ---- */
    var kpis = D.el("div.grid-4.mb-5.stagger");
    kpi(kpis, I.t("set.account"), App.fmtSigned(account.minutes),
      account.days + " " + I.t("stats.recordedDays").toLowerCase(),
      account.minutes > 0 ? "plus" : account.minutes < 0 ? "minus" : "");
    kpi(kpis, I.t("stats.avgNet"), App.fmt(totals.avgNet), totals.workedDays + " " + I.t("stats.workedDays").toLowerCase());
    kpi(kpis, I.t("stats.avgStart"), totals.avgStart === null ? "–" : T.formatHHMM(totals.avgStart),
      totals.earliestStart === null ? "" : I.t("common.min") + " " + T.formatHHMM(totals.earliestStart));
    kpi(kpis, I.t("stats.avgEnd"), totals.avgEnd === null ? "–" : T.formatHHMM(totals.avgEnd),
      totals.latestEnd === null ? "" : "max " + T.formatHHMM(totals.latestEnd));
    host.appendChild(kpis);

    var kpis2 = D.el("div.grid-4.mb-5.stagger");
    kpi(kpis2, I.t("stats.longestDay"), App.fmt(totals.longestDay), "");
    kpi(kpis2, I.t("stats.overtimeDays"), String(totals.overtimeDays), I.t("stats.undertimeDays") + " " + totals.undertimeDays);
    kpi(kpis2, I.t("day.breakTotal"), App.fmt(totals.breakTotal),
      totals.autoDeducted ? "+" + App.fmt(totals.autoDeducted) + " " + I.t("day.autoDeducted").toLowerCase() : I.t("warn.allGood"));
    kpi(kpis2, I.t("stats.recordedDays"), String(totals.recordedDays),
      totals.gapDays ? totals.gapDays + " " + I.t("stats.gaps").toLowerCase() : I.t("stats.noGaps"),
      totals.gapDays ? "warn" : "");
    host.appendChild(kpis2);

    /* ================================================================ */
    /* 1 · Saldo-Verlauf                                                 */
    /* ================================================================ */
    var trendCard = card(I.t("stats.balanceTrend"),
      I.t("set.carryOver") + " " + App.fmtSigned(s.carryOverMinutes || 0));
    var trendHost = D.el("div");
    trendCard.body.appendChild(trendHost);
    host.appendChild(trendCard.node);

    var trendPoints = buildTrend(range, App, period);
    ZK.Charts.balanceArea(trendHost, trendPoints, {
      height: 240,
      valueLabel: I.t("set.account"),
      plusLabel: I.t("day.balance") + " +",
      minusLabel: I.t("day.balance") + " −",
      emptyText: I.t("stats.needData")
    });

    /* ================================================================ */
    /* 2 · Stunden pro Woche                                             */
    /* ================================================================ */
    var weekly = groupByWeek(range.days);
    if (weekly.length) {
      var weekCard = card(I.t("stats.weeklyHours"), I.t("week.target") + " " + App.fmt(R.weeklyTargetMinutes(s)));
      var weekHost = D.el("div");
      weekCard.body.appendChild(weekHost);
      host.appendChild(weekCard.node);

      ZK.Charts.bars(weekHost, weekly.slice(-18).map(function (w) {
        return {
          label: "KW" + w.week,
          title: I.t("week.kw", { n: w.week }) + " · " + w.year,
          value: w.net + w.credited,
          sub: I.t("day.balance") + " " + App.fmtSigned(w.balance)
        };
      }), {
        height: 220,
        reference: R.weeklyTargetMinutes(s),
        referenceLabel: I.t("week.target"),
        valueFormat: function (v) { return App.fmt(v); },
        tickFormat: function (v) { return Math.round(v / 60) + " h"; }
      });
    }

    /* ================================================================ */
    /* 3 · Durchschnitt nach Wochentag                                   */
    /* ================================================================ */
    var dowCard = card(I.t("stats.dayOfWeek"));
    var dowHost = D.el("div");
    dowCard.body.appendChild(dowHost);
    host.appendChild(dowCard.node);

    var byDow = [0, 1, 2, 3, 4, 5, 6].map(function (wd) {
      var list = range.days.filter(function (r) { return r.weekday === wd && r.net > 0; });
      var avg = list.length ? Math.round(list.reduce(function (a, r) { return a + r.net; }, 0) / list.length) : 0;
      return { wd: wd, label: I.weekdayName(wd, "short"), title: I.weekdayName(wd, "long"), value: avg, count: list.length };
    });
    var ordered = (s.firstDayOfWeek === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]).map(function (wd) {
      return byDow[wd];
    });
    ZK.Charts.bars(dowHost, ordered.map(function (d) {
      return { label: d.label, title: d.title, value: d.value, sub: d.count + " " + I.t("common.days") };
    }), {
      height: 200,
      valueFormat: function (v) { return App.fmt(v); },
      tickFormat: function (v) { return T.formatDuration(v, "clock"); },
      emptyText: I.t("stats.needData")
    });

    /* ================================================================ */
    /* 4 · Ankunft & Feierabend                                          */
    /* ================================================================ */
    var arrivalCard = card(I.t("stats.arrival"), I.t("common.average"));
    var arrivalHost = D.el("div");
    arrivalCard.body.appendChild(arrivalHost);
    host.appendChild(arrivalCard.node);

    ZK.Charts.rangeBars(arrivalHost, ordered.map(function (d) {
      var list = range.days.filter(function (r) { return r.weekday === d.wd && r.complete && r.net > 0; });
      if (!list.length) return { label: d.label, from: null, to: null };
      var avgStart = Math.round(list.reduce(function (a, r) { return a + r.startTod; }, 0) / list.length);
      var avgEnd = Math.round(list.reduce(function (a, r) { return a + (r.endTl % T.DAY); }, 0) / list.length);
      return {
        label: d.label, title: d.title,
        from: avgStart, to: Math.max(avgStart + 30, avgEnd),
        sub: list.length + " " + I.t("common.days")
      };
    }), { height: 210, emptyText: I.t("stats.needData") });

    /* ================================================================ */
    /* 5 · Pausen-Disziplin + Tagesarten                                 */
    /* ================================================================ */
    var pair = D.el("div.grid-2.mb-4");

    var breakCard = card(I.t("stats.breakCompliance"));
    var withBreakDuty = range.days.filter(function (r) { return r.requiredBreak > 0; });
    var compliant = withBreakDuty.filter(function (r) { return r.breakTotal >= r.requiredBreak; }).length;
    var ratio = withBreakDuty.length ? compliant / withBreakDuty.length : 1;

    var ringRow = D.el("div", { style: { display: "grid", gridTemplateColumns: "128px minmax(0,1fr)", gap: "18px", alignItems: "center" } });
    var ringHost = D.el("div", { style: { position: "relative" } });
    ringRow.appendChild(ringHost);
    var ringText = D.el("div");
    ringText.innerHTML =
      '<div style="font-size:30px;font-weight:850;letter-spacing:-.03em">' + Math.round(ratio * 100) + "%</div>" +
      '<div style="font-size:12px;color:var(--ink-3);font-weight:650;line-height:1.5">' +
      D.esc(compliant + " / " + withBreakDuty.length + " " + I.t("common.days") + " " + I.t("stats.compliant")) + "<br>" +
      D.esc(I.t("day.autoDeducted") + ": " + App.fmt(totals.autoDeducted)) + "</div>";
    ringRow.appendChild(ringText);
    breakCard.body.appendChild(ringRow);
    ZK.Charts.ring(ringHost, {
      size: 128, stroke: 13, value: ratio,
      color: ratio >= 0.9 ? "var(--chart-plus)" : ratio >= 0.6 ? "var(--chart-mark)" : "var(--chart-minus)",
      ariaLabel: Math.round(ratio * 100) + "% " + I.t("stats.compliant")
    });
    pair.appendChild(breakCard.node);

    var typeCard = card(I.t("stats.distribution"));
    var typeHost = D.el("div");
    typeCard.body.appendChild(typeHost);
    pair.appendChild(typeCard.node);
    host.appendChild(pair);

    var typeCounts = {};
    range.days.forEach(function (r) {
      if (!r.recorded) return;
      typeCounts[r.type] = (typeCounts[r.type] || 0) + (r.type === "work" ? 1 : r.absenceFactor);
    });
    ZK.Charts.rankedBars(typeHost, Object.keys(typeCounts).map(function (k) {
      return { label: I.t("type." + k), value: Math.round(typeCounts[k] * 100) / 100, color: R.dayType(k).color };
    }), {
      valueFormat: function (v) { return v + " " + I.t("common.days"); },
      emptyText: I.t("stats.needData")
    });

    /* ================================================================ */
    /* 6 · Jahresübersicht                                               */
    /* ================================================================ */
    var year = T.yearOf(period.to);
    var heatCard = card(I.t("stats.heatmap"), String(year));
    var heatHost = D.el("div");
    heatCard.body.appendChild(heatHost);
    host.appendChild(heatCard.node);

    ZK.Charts.heatmap(heatHost, buildHeatCells(App, year), {
      minusLabel: I.t("day.balance") + " −",
      plusLabel: I.t("day.balance") + " +",
      zeroLabel: I.t("common.empty"),
      notRecorded: I.t("common.empty"),
      onSelect: function (cell) {
        if (cell.date) ZK.DayModal.open(App, cell.date, function () { App.renderChrome(); App.renderView(); });
      }
    });

    /* ================================================================ */
    /* 7 · Kontingente & Lücken                                          */
    /* ================================================================ */
    var bottom = D.el("div.grid-2.mt-4");

    var quota = ZK.Engine.quotaUsage(App.store.allDays(), year, s);
    var quotaCard = card(I.t("stats.quota"), String(year));
    var quotaBody = D.el("div.col", { style: { gap: "12px" } });
    quotaBody.appendChild(quotaRow(I.t("stats.vacationUsed"), quota.vacation, quota.vacationEntitlement, "var(--type-vacation)"));
    quotaBody.appendChild(quotaRow(I.t("stats.sickDays"), quota.sick, null, "var(--type-sick)"));
    quotaBody.appendChild(quotaRow(I.t("stats.compDays"), quota.comp, null, "var(--type-comp)"));
    quotaBody.appendChild(quotaRow(I.t("type.holiday"), quota.holiday, null, "var(--type-holiday)"));
    quotaCard.body.appendChild(quotaBody);
    bottom.appendChild(quotaCard.node);

    var gapCard = card(I.t("stats.gaps"), String(totals.gapDays));
    if (!totals.gapDays) {
      var ok = D.el("div.notice.plus");
      ok.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("stats.noGaps")) + "</strong></div>";
      gapCard.body.appendChild(ok);
    } else {
      gapCard.body.appendChild(D.el("p.muted", { text: I.t("stats.gapsHint"), style: { fontSize: "12px", marginBottom: "10px" } }));
      var list = D.el("div.chipset");
      totals.gaps.slice(0, 40).forEach(function (iso) {
        var chip = D.el("button.chip", { type: "button", text: I.formatDate(iso, { day: "2-digit", month: "2-digit", year: "2-digit" }) });
        chip.addEventListener("click", function () {
          ZK.DayModal.open(App, iso, function () { App.renderChrome(); App.renderView(); });
        });
        list.appendChild(chip);
      });
      gapCard.body.appendChild(list);
      if (totals.gaps.length > 40) {
        gapCard.body.appendChild(D.el("p.muted", { text: "+ " + (totals.gaps.length - 40), style: { fontSize: "12px", marginTop: "8px" } }));
      }
    }
    bottom.appendChild(gapCard.node);
    host.appendChild(bottom);

    /* ================================================================ */
    /* Hilfen                                                            */
    /* ================================================================ */

    function quotaRow(label, used, total, color) {
      var row = D.el("div");
      var head = D.el("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", marginBottom: "5px" } });
      head.appendChild(D.el("span", { text: label }));
      head.appendChild(D.el("span.mono", { text: total ? used + " / " + total : String(used) }));
      row.appendChild(head);
      var bar = D.el("div.bar");
      bar.appendChild(D.el("i", {
        style: {
          width: (total ? Math.min(100, (used / Math.max(1, total)) * 100) : Math.min(100, used * 4)) + "%",
          background: color
        }
      }));
      row.appendChild(bar);
      return row;
    }
  }

  /* -------------------------------------------------------------------- */
  function resolvePeriod(mode, App, keys) {
    var today = T.todayISO();
    if (mode === "month") return { from: T.startOfMonth(today), to: T.endOfMonth(today), grain: "day" };
    if (mode === "quarter") return { from: T.addDays(today, -89), to: today, grain: "day" };
    if (mode === "year") return { from: T.yearOf(today) + "-01-01", to: T.yearOf(today) + "-12-31", grain: "week" };
    var from = keys.length ? keys[0] : today;
    var to = keys.length ? (keys[keys.length - 1] > today ? keys[keys.length - 1] : today) : today;
    return { from: from, to: to, grain: T.diffDays(from, to) > 180 ? "week" : "day" };
  }

  /** Kumulierter Kontostand als Punktreihe. Lange Zeiträume werden auf Wochen verdichtet. */
  function buildTrend(range, App, period) {
    var s = App.settings();
    var running = s.carryOverMinutes || 0;
    // Startwert: alles vor dem Zeitraum bereits berücksichtigen
    var before = App.accountBalance(T.addDays(period.from, -1));
    running = before.minutes;

    var points = [];
    var weekBucket = null;

    range.days.forEach(function (r) {
      running += r.balance;
      if (period.grain === "week") {
        var wk = T.isoWeekYear(r.date) + "-" + T.pad2(T.isoWeek(r.date));
        if (!weekBucket || weekBucket.key !== wk) {
          weekBucket = { key: wk, label: "KW" + T.isoWeek(r.date), title: I.t("week.kw", { n: T.isoWeek(r.date) }) + " · " + T.isoWeekYear(r.date), value: running };
          points.push(weekBucket);
        } else {
          weekBucket.value = running;
        }
      } else {
        points.push({
          label: I.formatDate(r.date, { day: "2-digit", month: "2-digit" }),
          title: I.formatDate(r.date, { weekday: "short", day: "numeric", month: "long" }),
          value: running
        });
      }
    });
    return points;
  }

  function groupByWeek(days) {
    var map = {};
    var order = [];
    days.forEach(function (r) {
      var key = T.isoWeekYear(r.date) + "-" + T.pad2(T.isoWeek(r.date));
      if (!map[key]) {
        map[key] = { key: key, week: T.isoWeek(r.date), year: T.isoWeekYear(r.date), net: 0, credited: 0, balance: 0, target: 0 };
        order.push(key);
      }
      map[key].net += r.net;
      map[key].credited += r.credited;
      map[key].balance += r.balance;
      map[key].target += r.target;
    });
    return order.map(function (k) { return map[k]; }).filter(function (w) { return w.target > 0 || w.net > 0; });
  }

  function buildHeatCells(App, year) {
    var start = T.startOfWeek(year + "-01-01", 1);
    var end = year + "-12-31";
    var cells = [];
    var cursor = start;
    var guard = 0;
    while (cursor <= end && guard++ < 400) {
      var inYear = T.yearOf(cursor) === year;
      if (!inYear && cursor < year + "-01-01") {
        cells.push({ blank: true });
      } else {
        var res = App.day(cursor);
        cells.push({
          date: cursor,
          label: I.formatDate(cursor, { weekday: "short", day: "numeric", month: "short" }),
          value: res.recorded ? res.balance : null,
          sub: res.recorded ? (App.fmt(res.net) + " " + I.t("day.net").toLowerCase()) : ""
        });
      }
      cursor = T.addDays(cursor, 1);
    }
    return cells;
  }

  function card(title, meta) {
    var node = D.el("section.card.mb-4");
    var head = D.el("div.card-head");
    head.innerHTML = "<h2>" + D.esc(title) + "</h2>";
    if (meta) head.appendChild(D.el("div.actions", { html: '<span class="tag">' + D.esc(meta) + "</span>" }));
    node.appendChild(head);
    var body = D.el("div");
    node.appendChild(body);
    return { node: node, body: body };
  }

  function kpi(host, title, value, sub, tone) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone === "plus" ? " tone-plus" : tone === "minus" ? " tone-minus" : "") + '">' + D.esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + D.esc(sub) + "</div>" : "");
    host.appendChild(node);
  }

  function emptyCard(message) {
    var node = D.el("section.card");
    var box = D.el("div.empty");
    box.innerHTML = '<div class="rings"><i></i><i></i></div><h3>' + D.esc(message) + "</h3>";
    node.appendChild(box);
    return node;
  }
})(typeof self !== "undefined" ? self : this);
