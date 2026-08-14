/* ==========================================================================
   ZEITKONTO — Ansicht „Heute“
   --------------------------------------------------------------------------
   Der Arbeitsplatz der App. Wichtig für die Architektur: die Eingabefelder
   werden EINMAL gebaut, danach aktualisiert update() nur noch die
   Ergebnisbereiche. So springt der Cursor beim Tippen nie heraus.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).today = { render: render };

  function render(host, App) {
    var iso = App.date;
    var refs = {};

    /* ---------------------------------------------------------------- */
    /* Kopf: Datumsnavigation                                            */
    /* ---------------------------------------------------------------- */
    var head = D.el("div.view-head");
    var nav = D.el("div.daynav");

    var prev = D.el("button.btn.icon", { type: "button", "aria-label": I.t("kbd.prevDay"), html: D.icon("left") });
    prev.addEventListener("click", function () { App.shiftDate(-1); });

    var dateBtn = D.el("button.date-btn", { type: "button" });
    dateBtn.innerHTML =
      '<div>' +
      '<div class="dow">' + D.esc(I.weekdayName(T.weekdayOf(iso), "long")) + " · " + I.t("week.kw", { n: T.isoWeek(iso) }) + "</div>" +
      '<div class="dt">' + D.esc(I.formatDate(iso)) + "</div>" +
      "</div>" + D.icon("calendar");
    var picker = D.el("input", { type: "date", value: iso, "aria-label": I.t("common.day"), style: { display: "none" } });
    picker.addEventListener("change", function () { if (picker.value) App.setDate(picker.value); });
    dateBtn.addEventListener("click", function () {
      picker.style.display = "";
      if (picker.showPicker) { try { picker.showPicker(); return; } catch (e) { /* Fallback unten */ } }
      picker.focus();
    });

    var next = D.el("button.btn.icon", { type: "button", "aria-label": I.t("kbd.nextDay"), html: D.icon("right") });
    next.addEventListener("click", function () { App.shiftDate(1); });

    var todayBtn = D.el("button.btn.sm", { type: "button", text: I.t("common.today") });
    todayBtn.addEventListener("click", function () { App.setDate(T.todayISO()); });

    nav.appendChild(prev);
    nav.appendChild(dateBtn);
    nav.appendChild(picker);
    nav.appendChild(next);
    if (iso !== T.todayISO()) nav.appendChild(todayBtn);

    var headActions = D.el("div.row.tight");
    var copyBtn = D.el("button.btn.sm", { type: "button", html: D.icon("copy") + "<span>" + D.esc(I.t("day.copyPrevious")) + "</span>" });
    copyBtn.addEventListener("click", function () { App.copyPreviousDay(); });
    var tplBtn = D.el("button.btn.sm", { type: "button", html: D.icon("zap") + "<span>" + D.esc(I.t("day.template")) + "</span>" });
    tplBtn.addEventListener("click", applyTemplate);
    var clearBtn = D.el("button.btn.sm.ghost", { type: "button", "aria-label": I.t("day.clearDay"), "data-tip": I.t("day.clearDay"), html: D.icon("trash") });
    clearBtn.addEventListener("click", function () { App.confirmClearDay(); });
    headActions.appendChild(tplBtn);
    headActions.appendChild(copyBtn);
    headActions.appendChild(clearBtn);

    head.appendChild(nav);
    head.appendChild(headActions);
    host.appendChild(head);

    /* ---------------------------------------------------------------- */
    /* Hero                                                              */
    /* ---------------------------------------------------------------- */
    var hero = D.el("section.hero.mb-4", { "aria-label": I.t("day.recommendedLeave") });
    var ringWrap = D.el("div.ring-wrap");
    refs.ringHost = D.el("div", { style: { width: "100%" } });
    refs.ringCenter = D.el("div.ring-center");
    ringWrap.appendChild(refs.ringHost);
    ringWrap.appendChild(refs.ringCenter);

    var heroMain = D.el("div.hero-main");
    refs.heroEyebrow = D.el("div.hero-eyebrow");
    refs.heroTime = D.el("div.hero-time.mono");
    refs.heroNote = D.el("div.hero-note");
    var heroActions = D.el("div.hero-actions.stamp-bar");

    refs.stampIn = D.el("button.stamp-btn.go", { type: "button", html: D.icon("play") + "<span>" + D.esc(I.t("day.stampIn")) + "</span>" });
    refs.stampBreak = D.el("button.stamp-btn.pause", { type: "button", html: D.icon("coffee") + "<span>" + D.esc(I.t("day.startBreak")) + "</span>" });
    refs.stampOut = D.el("button.stamp-btn.stop", { type: "button", html: D.icon("stop") + "<span>" + D.esc(I.t("day.stampOut")) + "</span>" });
    refs.stampIn.addEventListener("click", function () { App.stamp("in"); });
    refs.stampBreak.addEventListener("click", function () { App.stamp("break"); });
    refs.stampOut.addEventListener("click", function () { App.stamp("out"); });
    heroActions.appendChild(refs.stampIn);
    heroActions.appendChild(refs.stampBreak);
    heroActions.appendChild(refs.stampOut);

    refs.runningStrip = D.el("div.running-strip", { hidden: true });

    heroMain.appendChild(refs.heroEyebrow);
    heroMain.appendChild(refs.heroTime);
    heroMain.appendChild(refs.heroNote);
    heroMain.appendChild(refs.runningStrip);
    heroMain.appendChild(heroActions);

    hero.appendChild(ringWrap);
    hero.appendChild(heroMain);
    host.appendChild(hero);

    /* ---------------------------------------------------------------- */
    /* Zwei Spalten                                                      */
    /* ---------------------------------------------------------------- */
    var grid = D.el("div.grid-2");
    host.appendChild(grid);

    /* ===== Linke Spalte: Eingaben ===== */
    var inputCard = D.el("section.card");
    inputCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("day.title")) + "</h2>" }));

    var timeRow = D.el("div.grid-2.mb-4");
    refs.startInput = timeField(I.t("day.clockIn"), "08:00", true);
    refs.endInput = timeField(I.t("day.clockOut"), "17:00", false);
    timeRow.appendChild(refs.startInput.wrap);
    timeRow.appendChild(refs.endInput.wrap);
    inputCard.appendChild(timeRow);

    /* Pausen */
    var breakHead = D.el("div.row.mb-3", { style: { justifyContent: "space-between" } });
    breakHead.appendChild(D.el("div.section-title", { text: I.t("day.breaks"), style: { margin: "0" } }));
    var addBreakBtn = D.el("button.btn.sm", { type: "button", html: D.icon("plus") + "<span>" + D.esc(I.t("day.addBreak")) + "</span>" });
    addBreakBtn.addEventListener("click", function () {
      var s = App.settings();
      var rec = App.record(iso);
      var existing = (rec.breaks || []).length;
      var defaults = existing === 0 && s.defaultLunch ? s.defaultLunch : { start: "", end: "" };
      addBreakRow({
        id: "b" + Date.now().toString(36),
        label: existing === 0 ? I.t("day.lunch") : I.t("day.break"),
        start: defaults.start || "",
        end: defaults.end || "",
        paid: false
      }, true);
      persistBreaks();
      update();
    });
    breakHead.appendChild(addBreakBtn);
    inputCard.appendChild(breakHead);

    refs.breakList = D.el("div.break-rows");
    inputCard.appendChild(refs.breakList);
    refs.breakEmpty = D.el("p.muted", {
      style: { fontSize: "12px", marginTop: "4px" },
      text: I.t("day.explain", { breaks: "0 min", target: App.fmt(App.day(iso).target) })
    });
    inputCard.appendChild(refs.breakEmpty);

    /* Tagesart */
    inputCard.appendChild(D.el("div.divider", { text: I.t("day.type") }));
    refs.typeChips = D.el("div.chipset.mb-3");
    inputCard.appendChild(refs.typeChips);

    refs.factorRow = D.el("div.row.mb-3", { hidden: true });
    var factorSelect = D.el("select.select", { style: { maxWidth: "180px" } });
    [[1, "100 %"], [0.5, "50 % · " + I.t("day.halfDay")], [0.25, "25 %"], [0.75, "75 %"]].forEach(function (o) {
      factorSelect.appendChild(D.el("option", { value: o[0], text: o[1] }));
    });
    factorSelect.addEventListener("change", function () {
      App.saveDayQuiet(iso, { absenceFactor: parseFloat(factorSelect.value) });
      update();
    });
    refs.factorSelect = factorSelect;
    refs.factorRow.appendChild(D.el("span.muted", { text: I.t("day.factor"), style: { fontSize: "12px", fontWeight: "700" } }));
    refs.factorRow.appendChild(factorSelect);
    inputCard.appendChild(refs.factorRow);

    /* Ort */
    inputCard.appendChild(D.el("div.section-title", { text: I.t("day.location") }));
    refs.locChips = D.el("div.chipset.mb-4");
    R.LOCATIONS.forEach(function (loc) {
      var chip = D.el("button.chip", {
        type: "button", "data-loc": loc,
        html: D.icon(loc === "home" ? "home" : loc === "field" ? "pin" : loc === "travel" ? "plane" : "briefcase") +
          "<span>" + D.esc(I.t("loc." + loc)) + "</span>"
      });
      chip.addEventListener("click", function () {
        App.saveDayQuiet(iso, { location: loc });
        update();
      });
      refs.locChips.appendChild(chip);
    });
    inputCard.appendChild(refs.locChips);

    /* Notiz */
    var noteField = D.el("div.field");
    noteField.appendChild(D.el("label", { for: "dayNote", text: I.t("day.note") }));
    refs.note = D.el("textarea.textarea#dayNote", { placeholder: I.t("day.notePlaceholder"), rows: 2 });
    refs.note.addEventListener("input", D.debounce(function () {
      App.saveDayQuiet(iso, { note: refs.note.value });
    }, 400));
    noteField.appendChild(refs.note);
    inputCard.appendChild(noteField);

    /* Abweichende Sollzeit */
    var overrideDetails = D.el("details", { style: { marginTop: "14px" } });
    overrideDetails.appendChild(D.el("summary", {
      text: I.t("day.targetOverride"),
      style: { fontSize: "12px", fontWeight: "700", color: "var(--ink-3)", cursor: "pointer" }
    }));
    var ovWrap = D.el("div.row.mt-3");
    refs.override = D.el("input.input", { type: "text", placeholder: "z. B. 4:00", style: { maxWidth: "140px" } });
    refs.override.addEventListener("change", function () {
      var v = refs.override.value.trim();
      App.saveDayQuiet(iso, { targetOverride: v ? T.parseDuration(v) : null });
      update();
    });
    var ovClear = D.el("button.btn.sm.ghost", { type: "button", text: I.t("common.reset") });
    ovClear.addEventListener("click", function () {
      refs.override.value = "";
      App.saveDayQuiet(iso, { targetOverride: null });
      update();
    });
    ovWrap.appendChild(refs.override);
    ovWrap.appendChild(ovClear);
    overrideDetails.appendChild(ovWrap);
    inputCard.appendChild(overrideDetails);

    grid.appendChild(inputCard);

    /* ===== Rechte Spalte: Ergebnisse ===== */
    var resultCol = D.el("div.col");

    var kpiCard = D.el("section.card");
    kpiCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("nav.today")) + "</h2>" }));
    refs.kpiGrid = D.el("div.grid-2");
    kpiCard.appendChild(refs.kpiGrid);
    resultCol.appendChild(kpiCard);

    var tlCard = D.el("section.card");
    tlCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("day.timeline")) + "</h2>" }));
    refs.timeline = D.el("div.timeline");
    tlCard.appendChild(refs.timeline);
    var legend = D.el("div.tl-legend");
    legend.innerHTML =
      '<span><i style="background:var(--brand-500)"></i>' + D.esc(I.t("day.work")) + "</span>" +
      '<span><i style="background:var(--warn)"></i>' + D.esc(I.t("day.break")) + "</span>" +
      '<span><i style="background:var(--chart-plus);width:2px;height:12px;border-radius:0"></i>' + D.esc(I.t("day.recommendedLeave")) + "</span>" +
      '<span><i style="background:var(--minus);width:2px;height:12px;border-radius:0"></i>' + D.esc(I.t("common.now")) + "</span>";
    tlCard.appendChild(legend);
    resultCol.appendChild(tlCard);

    refs.warnCard = D.el("section.card");
    resultCol.appendChild(refs.warnCard);

    grid.appendChild(resultCol);

    /* ---------------------------------------------------------------- */
    /* Aufbau der Eingabefelder mit Daten                                */
    /* ---------------------------------------------------------------- */
    var rec = App.record(iso);
    refs.startInput.input.value = rec.start || "";
    refs.endInput.input.value = rec.end || "";
    refs.note.value = rec.note || "";
    refs.override.value = rec.targetOverride ? T.formatDuration(rec.targetOverride, "clock") : "";
    refs.factorSelect.value = String(rec.absenceFactor === undefined ? 1 : rec.absenceFactor);

    D.attachTimeInput(refs.startInput.input, function (value, committed) {
      App.saveDayQuiet(iso, { start: value });
      update();
      if (committed) refreshBreakDurations();
    });
    D.attachTimeInput(refs.endInput.input, function (value) {
      App.saveDayQuiet(iso, { end: value });
      update();
    });

    (rec.breaks || []).forEach(function (b) { addBreakRow(b, false); });

    buildTypeChips();
    update();

    /* Sekundentakt für laufende Tage */
    App.onTick(function () {
      var res = App.day(iso);
      if (res.running) update();
    });

    /* ================================================================ */
    /* Bausteine                                                         */
    /* ================================================================ */

    function timeField(label, placeholder, required) {
      var wrap = D.el("div.field");
      var id = "tf_" + label.replace(/\W/g, "");
      wrap.appendChild(D.el("label", {
        for: id,
        html: "<span>" + D.esc(label) + "</span><span class='tag mono'>HH:MM</span>"
      }));
      var input = D.el("input.input.time.big", {
        type: "text", id: id, placeholder: placeholder,
        "aria-required": required ? "true" : null
      });
      wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }

    function addBreakRow(data, focus) {
      var row = D.el("div.break-row", { "data-id": data.id || ("b" + Math.random().toString(36).slice(2, 8)) });

      var labelInput = D.el("input.input.break-label", { type: "text", value: data.label || "", placeholder: I.t("day.label"), "aria-label": I.t("day.label") });
      var startInput = D.el("input.input.time.break-start", { type: "text", value: data.start || "", placeholder: "HH:MM", "aria-label": I.t("day.start") });
      var endInput = D.el("input.input.time.break-end", { type: "text", value: data.end || "", placeholder: "HH:MM", "aria-label": I.t("day.end") });
      var dur = D.el("div.dur.mono", { text: "–" });
      var del = D.el("button.btn.sm.ghost", { type: "button", "aria-label": I.t("common.remove"), html: D.icon("x") });

      row.appendChild(labelInput);
      row.appendChild(startInput);
      row.appendChild(endInput);
      row.appendChild(dur);
      row.appendChild(del);

      labelInput.addEventListener("input", D.debounce(persistBreaks, 350));
      D.attachTimeInput(startInput, function () { persistBreaks(); update(); });
      D.attachTimeInput(endInput, function () { persistBreaks(); update(); });
      del.addEventListener("click", function () {
        row.style.opacity = "0";
        row.style.transform = "translateX(-10px)";
        row.style.transition = "all .18s ease";
        setTimeout(function () {
          if (row.parentNode) row.parentNode.removeChild(row);
          persistBreaks();
          update();
        }, 180);
      });

      refs.breakList.appendChild(row);
      if (focus) setTimeout(function () { startInput.focus(); }, 40);
      return row;
    }

    function collectBreaks() {
      return D.qsa(".break-row", refs.breakList).map(function (row) {
        return {
          id: row.dataset.id,
          label: D.qs(".break-label", row).value,
          start: D.qs(".break-start", row).value,
          end: D.qs(".break-end", row).value,
          paid: false
        };
      });
    }

    function persistBreaks() {
      App.saveDayQuiet(iso, { breaks: collectBreaks() });
    }

    function refreshBreakDurations() {
      var anchor = T.parseHHMM(refs.startInput.input.value);
      D.qsa(".break-row", refs.breakList).forEach(function (row) {
        var s = T.parseHHMM(D.qs(".break-start", row).value);
        var e = T.parseHHMM(D.qs(".break-end", row).value);
        var node = D.qs(".dur", row);
        if (s === null || e === null) { node.textContent = "–"; return; }
        node.textContent = App.fmt(T.intervalMinutes(s, e, anchor !== null ? anchor : s));
      });
    }

    function buildTypeChips() {
      D.clear(refs.typeChips);
      ["work", "vacation", "comp", "sick", "accident", "holiday", "training", "military", "unpaid", "free"].forEach(function (key) {
        var meta = R.dayType(key);
        var chip = D.el("button.chip", {
          type: "button", "data-type": key,
          html: '<i class="swatch" style="--c:' + meta.color + '"></i><span>' + D.esc(I.t("type." + key)) + "</span>"
        });
        chip.addEventListener("click", function () {
          var current = App.record(iso).type;
          App.saveDayQuiet(iso, { type: current === key ? null : key });
          update();
        });
        refs.typeChips.appendChild(chip);
      });
    }

    function applyTemplate() {
      var s = App.settings();
      var res = App.day(iso);
      var start = App.record(iso).start || "08:00";
      var lunch = s.defaultLunch || { start: "12:00", end: "12:30" };
      var breaks = lunch.start && lunch.end
        ? [{ id: "tpl" + Date.now().toString(36), label: I.t("day.lunch"), start: lunch.start, end: lunch.end, paid: false }]
        : [];
      var lunchMin = breaks.length ? T.intervalMinutes(T.parseHHMM(lunch.start), T.parseHHMM(lunch.end), T.parseHHMM(start)) : 0;
      var required = R.requiredBreak(res.target + lunchMin, s.breakRuleset, s.customBreakTiers);
      var effective = s.autoDeductBreak !== false ? Math.max(lunchMin, required) : lunchMin;
      var end = T.formatHHMM(T.parseHHMM(start) + res.target + effective);

      App.saveDay(iso, { start: start, end: end, breaks: breaks, type: null });
      D.toast(I.t("day.template"), { sub: start + " – " + end });
    }

    /* ================================================================ */
    /* Aktualisierung der Ergebnisse                                     */
    /* ================================================================ */
    function update() {
      var res = App.day(iso);
      var rec2 = App.record(iso);

      /* --- Chips --- */
      D.qsa(".chip", refs.typeChips).forEach(function (chip) {
        chip.setAttribute("aria-pressed", chip.dataset.type === res.type ? "true" : "false");
      });
      D.qsa(".chip", refs.locChips).forEach(function (chip) {
        chip.setAttribute("aria-pressed", chip.dataset.loc === res.location ? "true" : "false");
      });
      refs.factorRow.hidden = !res.typeMeta.credits || res.type === "holiday";

      /* --- Ring: aussen Sollerfüllung, innen Pausenpflicht --- */
      var neededNet = Math.max(0, res.target - res.credited);
      var progress = neededNet > 0 ? res.net / neededNet : (res.net > 0 ? 1 : 0);
      var breakProgress = res.requiredBreak > 0 ? Math.min(1, res.breakTotal / res.requiredBreak) : (res.breakTotal > 0 ? 1 : 0);

      ZK.Charts.ring(refs.ringHost, {
        size: 230,
        stroke: 16,
        value: progress,
        color: progress >= 1 ? "var(--chart-plus)" : "var(--chart-mark)",
        inner: { value: breakProgress, color: res.requiredBreak > 0 && res.breakTotal < res.requiredBreak ? "var(--warn)" : "var(--chart-mark-2)" },
        ariaLabel: I.t("day.progress") + " " + Math.round(progress * 100) + "%"
      });

      refs.ringCenter.innerHTML =
        '<span class="big">' + D.esc(App.fmt(res.net)) + "</span>" +
        '<span class="pct">' + Math.round(progress * 100) + "% " + D.esc(I.t("day.progress")) + "</span>" +
        '<span class="cap">' + D.esc(I.t("day.net")) + "</span>";

      /* --- Hero --- */
      var isToday = iso === T.todayISO();
      if (res.startTod === null) {
        refs.heroEyebrow.textContent = I.t("day.title");
        refs.heroTime.innerHTML = '<span>--:--</span>';
        refs.heroNote.textContent = res.target > 0 ? I.t("day.enterClockIn") : I.t("day.noTarget");
      } else if (!res.complete) {
        refs.heroEyebrow.innerHTML =
          (res.running ? '<span class="live-dot"></span>' : "") + D.esc(I.t("day.recommendedLeave"));
        refs.heroTime.innerHTML = '<span>' + D.esc(res.recommendedLeave || "--:--") + "</span>" +
          (res.recommendedLeaveDayOffset > 0
            ? '<span class="tag warn">' + D.esc(I.t(res.recommendedLeaveDayOffset > 1 ? "day.nextDays" : "day.nextDay", { n: res.recommendedLeaveDayOffset })) + "</span>"
            : "");
        refs.heroNote.innerHTML = I.t("day.explain", {
          breaks: "<b>" + D.esc(App.fmt(res.effectiveBreak)) + "</b>",
          target: "<b>" + D.esc(App.fmt(res.target)) + "</b>"
        });
      } else {
        refs.heroEyebrow.textContent = I.t("day.balance");
        refs.heroTime.innerHTML = '<span class="' + (res.balance >= 0 ? "tone-plus" : "tone-minus") + '">' +
          D.esc(App.fmtSigned(res.balance)) + "</span>" +
          '<span class="unit">' + D.esc(App.fmt(res.net)) + " / " + D.esc(App.fmt(res.target)) + "</span>";
        refs.heroNote.innerHTML = D.esc(I.t("day.presence")) + " <b>" + D.esc(App.fmt(res.presence)) + "</b> · " +
          D.esc(I.t("day.breakTotal")) + " <b>" + D.esc(App.fmt(res.breakTotal)) + "</b>" +
          (res.autoDeducted
            ? " <span class=\"tone-warn\">(+" + D.esc(App.fmt(res.autoDeducted)) + " " + D.esc(I.t("day.requiredBreak")) + ")</span>"
            : "") +
          (res.credited ? " · " + D.esc(I.t("day.credited")) + " <b>" + D.esc(App.fmt(res.credited)) + "</b>" : "");
      }

      if (res.holiday) {
        refs.heroNote.innerHTML += '<br><span class="tag info" style="margin-top:6px">' +
          D.esc(I.t("day.holidayName", { name: res.holiday.names[I.getLang()] || res.holiday.name })) + "</span>";
      }

      /* --- Laufstreifen --- */
      var openBreak = (rec2.breaks || []).filter(function (b) { return b.start && !b.end; })[0];
      if (res.running || openBreak) {
        refs.runningStrip.hidden = false;
        refs.runningStrip.classList.toggle("on-break", !!openBreak);
        var since = openBreak ? openBreak.start : res.start;
        var elapsed = openBreak
          ? T.intervalMinutes(T.parseHHMM(openBreak.start), T.nowMinutes(), T.parseHHMM(res.start || openBreak.start))
          : res.net;
        refs.runningStrip.innerHTML =
          '<span class="live-dot"></span>' +
          "<span>" + D.esc(I.t(openBreak ? "day.onBreak" : "day.running", { time: since })) + "</span>" +
          '<span class="t mono">' + D.esc(App.fmt(elapsed)) + "</span>" +
          "<span class='grow'></span>" +
          "<span>" + D.esc(res.remaining > 0
            ? I.t("day.untilGoal", { v: App.fmt(res.remaining) })
            : I.t("day.overtimeNow", { v: App.fmt(res.net - Math.max(0, res.target - res.credited)) })) + "</span>";
      } else {
        refs.runningStrip.hidden = true;
      }

      /* --- Stempeltasten --- */
      var stampable = isToday && res.typeMeta.stampable !== false;
      refs.stampIn.disabled = !stampable || !!res.startTod;
      refs.stampOut.disabled = !stampable || !res.startTod || !!res.endTod;
      refs.stampBreak.disabled = !stampable || !res.startTod || !!res.endTod;
      refs.stampBreak.innerHTML = D.icon("coffee") + "<span>" +
        D.esc(I.t(openBreak ? "day.endBreak" : "day.startBreak")) + "</span>";
      [refs.stampIn, refs.stampOut, refs.stampBreak].forEach(function (b) {
        b.style.display = stampable ? "" : "none";
      });

      /* --- Kennzahlen --- */
      D.clear(refs.kpiGrid);
      kpi(I.t("day.net"), App.fmt(res.net), res.netRaw !== res.net ? "roh " + App.fmt(res.netRaw) : App.fmt(res.presence) + " " + I.t("day.presence").toLowerCase(), "");
      kpi(I.t("day.balance"), App.fmtSigned(res.balance), I.t("day.target") + " " + App.fmt(res.target), res.balance > 0 ? "plus" : res.balance < 0 ? "minus" : "");
      kpi(I.t("day.breakTotal"), App.fmt(res.breakTotal),
        res.autoDeducted ? "+" + App.fmt(res.autoDeducted) + " " + I.t("day.autoDeducted").toLowerCase() : I.t("day.requiredBreak") + " " + App.fmt(res.requiredBreak),
        res.requiredBreak > res.breakTotal ? "warn" : "");
      kpi(I.t("day.remaining"), res.remaining > 0 ? App.fmt(res.remaining) : "✓ " + I.t("day.goalReached"),
        res.recommendedLeave ? I.t("day.recommendedLeave") + " " + res.recommendedLeave : "",
        res.remaining > 0 ? "" : "plus");

      /* --- Zeitstrahl --- */
      drawTimeline(res);

      /* --- Hinweise --- */
      drawWarnings(res);

      refreshBreakDurations();
      refs.breakEmpty.hidden = (rec2.breaks || []).length > 0;
    }

    function kpi(title, value, sub, tone) {
      var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
      node.innerHTML =
        '<div class="k-title">' + D.esc(title) + "</div>" +
        '<div class="k-val mono' + (tone === "plus" ? " tone-plus" : tone === "minus" ? " tone-minus" : "") + '">' + D.esc(value) + "</div>" +
        (sub ? '<div class="k-sub">' + D.esc(sub) + "</div>" : "");
      refs.kpiGrid.appendChild(node);
      return node;
    }

    function drawTimeline(res) {
      D.clear(refs.timeline);
      var from = 5 * 60, to = 23 * 60;
      if (res.startTl !== null) from = Math.min(from, Math.floor(res.startTl / 60) * 60);
      if (res.endTl !== null) to = Math.max(to, Math.ceil(res.endTl / 60) * 60);
      if (res.recommendedLeaveTl !== null) to = Math.max(to, Math.ceil(res.recommendedLeaveTl / 60) * 60);
      var span = Math.max(60, to - from);

      function pct(v) { return ((v - from) / span) * 100; }

      for (var h = Math.ceil(from / 60) * 60; h <= to; h += 120) {
        var mark = D.el("div.tl-hour", { style: { left: pct(h) + "%" } });
        mark.appendChild(D.el("span", { text: T.formatHHMM(h) }));
        refs.timeline.appendChild(mark);
      }

      res.segments.forEach(function (seg) {
        var node = D.el("div.tl-seg." + (seg.kind === "break" ? "brk" : "work"), {
          style: { left: pct(seg.start) + "%", width: Math.max(0.4, pct(seg.end) - pct(seg.start)) + "%" },
          "data-tip": (seg.kind === "break" ? I.t("day.break") : I.t("day.work")) + " " +
            T.formatHHMM(seg.start) + "–" + T.formatHHMM(seg.end)
        });
        refs.timeline.appendChild(node);
      });

      if (res.recommendedLeaveTl !== null && res.recommendedLeaveTl <= to) {
        refs.timeline.appendChild(D.el("div.tl-target", {
          style: { left: pct(res.recommendedLeaveTl) + "%" },
          "data-tip": I.t("day.recommendedLeave") + " " + res.recommendedLeave
        }));
      }
      if (iso === T.todayISO()) {
        var nowMin = T.nowMinutes();
        if (nowMin >= from && nowMin <= to) {
          refs.timeline.appendChild(D.el("div.tl-now", {
            style: { left: pct(nowMin) + "%" }, "data-tip": I.t("common.now")
          }));
        }
      }
      if (!res.segments.length) {
        refs.timeline.appendChild(D.el("div", {
          style: {
            position: "absolute", inset: "0", display: "grid", placeItems: "center",
            fontSize: "12px", color: "var(--ink-3)", fontWeight: "650"
          },
          text: I.t("common.empty")
        }));
      }
    }

    function drawWarnings(res) {
      D.clear(refs.warnCard);
      refs.warnCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("warn.title")) + "</h2>" }));

      if (!res.warnings.length) {
        var ok = D.el("div.notice.plus");
        ok.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("warn.allGood")) + "</strong></div>";
        refs.warnCard.appendChild(ok);
        return;
      }

      var list = D.el("div.col", { style: { gap: "8px" } });
      res.warnings.forEach(function (w) {
        var tone = w.level === "error" ? "minus" : w.level === "warn" ? "warn" : "info";
        var vars = {
          v: App.fmt(w.minutes),
          have: App.fmt(res.breakTotal),
          required: App.fmt(w.required || res.requiredBreak),
          count: w.count,
          name: w.name
        };
        var node = D.el("div.notice." + tone);
        node.innerHTML = D.icon(w.level === "info" ? "info" : "alert") +
          "<div>" + D.esc(I.t("warn." + w.code, vars)) + "</div>";
        list.appendChild(node);
      });
      refs.warnCard.appendChild(list);
    }
  }
})(typeof self !== "undefined" ? self : this);
