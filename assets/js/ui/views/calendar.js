/* ==========================================================================
   ZEITKONTO — Ansicht „Kalender“
   --------------------------------------------------------------------------
   Monatsraster mit Schnellbearbeitung im Dialog und einer Massenaktion für
   Ferien, Krankheit oder Kompensation über einen ganzen Zeitraum.
   Die reinen Hilfen (ZK.CalWeek) teilt sich der Kalender mit der Woche.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n;

  (ZK.Views = ZK.Views || {}).calendar = { render: render };

  var TYPE_ORDER = ["work", "vacation", "comp", "sick", "accident", "holiday", "training", "military", "unpaid", "free"];

  /* Zuletzt geöffneter Tag — nur für die Markierung im Raster. Bewusst nicht
     App.date: ein kurzer Blick in einen Tag soll „Heute“ nicht verstellen. */
  var selectedISO = null;

  /* ==================================================================== */
  /* Gemeinsame Hilfen für Kalender und Woche (ohne DOM, testbar)          */
  /* ==================================================================== */

  /** Läuft der Tag noch? (Stempeluhr an — auch Nachtschicht über Mitternacht) */
  function isProvisional(res) { return !!(res && (res.provisional || res.running)); }

  /** Zwischenstand eines laufenden Tages: die Engine führt ihn im Tagessaldo,
      rechnet ihn aber nicht ins abgerechnete Konto (provisional). */
  function liveBalance(res) {
    if (!res) return 0;
    if (typeof res.balance === "number") return res.balance;
    return Math.round((res.net || 0) + (res.credited || 0) - (res.target || 0));
  }

  /** Kommen erfasst, Gehen fehlt, Tag läuft nicht mehr. */
  function isIncomplete(res) {
    if (!res || isProvisional(res)) return false;
    if (res.incomplete) return true;
    return res.startTod !== null && res.startTod !== undefined && res.endTod === null && !res.complete;
  }

  function isoOf(dateLike) {
    var d = new Date(dateLike);
    return isNaN(d.getTime()) ? null : T.todayISO(d);
  }

  /**
   * Ab wann fehlende Arbeitstage als Lücke gelten. Vor dem ersten eigenen
   * Eintrag (bzw. dem Start der App) gibt es nichts zu vermissen — sonst
   * sieht jemand gleich nach dem Einrichten elf rote Striche. Der Kontostart
   * (carryOverFrom) ist die Untergrenze. Ohne jeden eigenen Eintrag: keine Lücken.
   * Aus Outlook übernommene Abwesenheiten zählen nicht als „angefangen“, auch
   * Datensätze nicht, die nur einen Ort (Homeoffice-Termin) oder einen Plan
   * tragen — gestempelte Tage dagegen immer (wie ZK.Assist.trackingStartOf).
   */
  function trackingStart(days, settings, meta) {
    var first = null;
    Object.keys(days || {}).forEach(function (iso) {
      var rec = days[iso];
      if (!rec || !T.isValidISO(iso) || !ownEntry(rec)) return;
      if (first === null || iso < first) first = iso;
    });
    if (!first) return null;
    var created = meta && meta.createdAt ? isoOf(meta.createdAt) : null;
    var begin = created && created < first ? created : first;
    var from = settings && settings.carryOverFrom && T.isValidISO(settings.carryOverFrom) ? settings.carryOverFrom : null;
    if (from && from > begin) begin = from;
    return begin;
  }

  function ownEntry(rec) {
    if (String(rec.start || "").trim() || String(rec.end || "").trim()) return true;
    if (rec.source === "outlook") return false;
    return !!(rec.type || (rec.breaks && rec.breaks.length) || String(rec.note || "").trim() ||
      (rec.targetOverride !== null && rec.targetOverride !== undefined));
  }

  /** running | incomplete | recorded | gap | empty */
  function dayState(res, today, start) {
    if (isProvisional(res)) return "running";
    if (isIncomplete(res)) return "incomplete";
    if (res.recorded) return "recorded";
    if (res.target > 0 && res.date < today && start && res.date >= start) return "gap";
    return "empty";
  }

  /**
   * Summen über einen Zeitraum: abgeschlossener Saldo getrennt vom laufenden
   * Tag, Soll bis heute (ab Erfassungsbeginn), Lücken und offene Tage.
   * opts: { today, start, hasRecord(iso) }
   */
  function summarize(days, opts) {
    opts = opts || {};
    var today = opts.today || T.todayISO();
    var start = opts.start || null;
    var hasRecord = opts.hasRecord || function () { return true; };
    var out = {
      settled: 0, provisional: 0, runningDays: 0, running: [],
      net: 0, credited: 0, target: 0, targetToDate: 0, uncoveredTarget: 0,
      workdays: 0, recordedDays: 0, workedDays: 0, gaps: [], incomplete: []
    };
    (days || []).forEach(function (r) {
      var st = dayState(r, today, start);
      out.target += r.target || 0;
      if (r.target > 0) out.workdays++;
      // Soll bis heute: erst ab Erfassungsbeginn, ausser der Tag ist erfasst
      if (r.date <= today && (st !== "empty" || (start && r.date >= start))) out.targetToDate += r.target || 0;
      if (st === "running") {
        out.runningDays++;
        out.running.push(r.date);
        out.provisional += liveBalance(r);
      } else if (st === "recorded") {
        out.settled += r.balance || 0;
      }
      out.net += r.net || 0;
      out.credited += r.credited || 0;
      if (r.net > 0) out.workedDays++;
      if (st === "gap") { out.gaps.push(r.date); out.uncoveredTarget += r.target || 0; }
      if (st === "incomplete") { out.incomplete.push(r.date); out.uncoveredTarget += r.target || 0; }
      if ((st === "recorded" || st === "running" || st === "incomplete") && hasRecord(r.date)) out.recordedDays++;
    });
    return out;
  }

  /** Unterzeile zum Ist: nur Arbeit, nur Gutschrift oder beides */
  function actualSub(net, credited, fmt) {
    if (credited && net) return I.t("cal.actualSplit", { net: fmt(net), credit: fmt(credited) });
    return credited ? I.t("day.credited") : I.t("day.net");
  }

  function holidayName(h) {
    if (!h) return "";
    return (h.names && h.names[I.getLang()]) || h.name || "";
  }

  function kwLabel(iso) { return I.t("common.weekShort") + " " + T.isoWeek(iso); }

  function typeCode(type) { return I.t("cal.code." + type); }

  /** Anteil eines Abwesenheitstags: „50 %“ bzw. „½“ im Kürzel */
  function factorText(res, short) {
    if (!res || !res.typeMeta || !res.typeMeta.credits || !(res.absenceFactor < 1)) return "";
    if (short && res.absenceFactor === 0.5) return "½";
    return (short ? "" : " ") + Math.round(res.absenceFactor * 100) + (short ? "" : " ") + "%";
  }

  /** Überschriften beginnen gross — auch „octobre“ und „ottobre“. */
  function cap(s) {
    s = String(s || "");
    try { return s.charAt(0).toLocaleUpperCase(I.locale()) + s.slice(1); }
    catch (e) { return s.charAt(0).toUpperCase() + s.slice(1); }
  }

  function fmtNum(v) {
    try { return new Intl.NumberFormat(I.locale(), { maximumFractionDigits: 2 }).format(v); }
    catch (e) { return String(v); }
  }

  /** Blättern merkt sich der Link — ein Neuladen bleibt im gleichen Monat/der gleichen Woche. */
  function writeViewHash(App, view, iso) {
    if (App.view !== view || !T.isValidISO(iso)) return;
    var next = "#/" + view + "/" + iso;
    try { if (location.hash !== next) history.replaceState(null, "", next); } catch (e) { /* egal */ }
  }

  /** Fokus auf ein Element, ohne die Seite zu verschieben. */
  function focusQuietly(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }

  ZK.CalWeek = {
    TYPE_ORDER: TYPE_ORDER,
    isProvisional: isProvisional,
    liveBalance: liveBalance,
    isIncomplete: isIncomplete,
    trackingStart: trackingStart,
    dayState: dayState,
    summarize: summarize,
    actualSub: actualSub,
    holidayName: holidayName,
    kwLabel: kwLabel,
    typeCode: typeCode,
    factorText: factorText,
    cap: cap,
    fmtNum: fmtNum,
    writeViewHash: writeViewHash,
    focusQuietly: focusQuietly
  };

  /* ==================================================================== */
  /* Schnellbearbeitung eines Tages (auch von Woche, Statistik usw.)       */
  /* ==================================================================== */
  ZK.DayModal = { open: openDayModal };

  /**
   * @param {Object} opts  { focusEnd: true } setzt den Cursor ins Gehen-Feld
   *                       (z. B. für einen Tag ohne Gehen-Zeit)
   */
  function openDayModal(App, iso, onDone, opts) {
    opts = opts || {};
    var s = App.settings();
    var rec = App.record(iso);
    var res0 = App.day(iso);
    var holiday = App.holiday(iso);
    var origFactor = rec.absenceFactor === undefined || rec.absenceFactor === null ? 1 : rec.absenceFactor;
    var autoType = ZK.Engine.deriveType(Object.assign({}, rec, { type: null }), res0.baseTarget, holiday, s);
    var chosenType = rec.type && R.DAY_TYPES[rec.type] ? rec.type : null;
    var breaksDirty = false;

    var body = D.el("div.col.day-modal");

    /* ---- Kommen / Gehen ---- */
    var times = D.el("div.dm-times");
    var startWrap = timeField(I.t("day.clockIn"), "dm-start");
    var endWrap = timeField(I.t("day.clockOut"), "dm-end");
    startWrap.input.value = rec.start || "";
    endWrap.input.value = rec.end || "";
    D.attachTimeInput(startWrap.input, refresh);
    D.attachTimeInput(endWrap.input, refresh);
    times.appendChild(startWrap.wrap);
    times.appendChild(endWrap.wrap);
    body.appendChild(times);

    /* ---- Pausen: die echten Zeilen, nicht eine zusammengefasste Summe.
       Solange niemand daran etwas ändert, bleiben sie unangetastet. ---- */
    var brkHead = D.el("div.dm-brk-head");
    brkHead.appendChild(D.el("div.section-title", { text: I.t("day.breaks") }));
    var brkSum = D.el("span.dm-brk-sum.mono");
    brkHead.appendChild(brkSum);
    var addBreak = D.el("button.btn.sm", { type: "button", html: D.icon("plus") + "<span>" + D.esc(I.t("day.addBreak")) + "</span>" });
    brkHead.appendChild(addBreak);
    body.appendChild(brkHead);
    var brkList = D.el("div.dm-breaks");
    body.appendChild(brkList);
    var rows = [];
    (rec.breaks || []).forEach(function (b) { addRow(b, false); });

    addBreak.addEventListener("click", function () {
      var count = rows.length;
      var defaults = count === 0 && s.defaultLunch ? s.defaultLunch : { start: "", end: "" };
      breaksDirty = true;
      addRow({
        id: "b" + Date.now().toString(36),
        label: count === 0 ? I.t("day.lunch") : I.t("day.break"),
        start: defaults.start || "",
        end: defaults.end || "",
        paid: false
      }, true);
      refresh();
    });

    /* ---- Tagesart: alle Arten wie in „Heute“, die geltende ist gedrückt ---- */
    var typeHead = D.el("div.dm-type-head");
    typeHead.appendChild(D.el("div.section-title", { text: I.t("day.type") }));
    var autoTag = D.el("span.tag", { text: I.t("day.typeAuto") });
    typeHead.appendChild(autoTag);
    body.appendChild(typeHead);
    var chips = D.el("div.chipset");
    TYPE_ORDER.forEach(function (key) {
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

    /* Anteil (Halbtag) nur bei gutgeschriebenen Abwesenheiten */
    var factorRow = D.el("div.dm-factor");
    factorRow.appendChild(D.el("label", { text: I.t("day.factor"), for: "dm-factor" }));
    var factor = D.el("select.select#dm-factor");
    [[1, "100 %"], [0.75, "75 %"], [0.5, "50 % · " + I.t("day.halfDay")], [0.25, "25 %"]].forEach(function (o) {
      factor.appendChild(D.el("option", { value: o[0], text: o[1] }));
    });
    factor.value = String(origFactor);
    if (factor.value !== String(origFactor)) {
      factor.appendChild(D.el("option", { value: origFactor, text: Math.round(origFactor * 100) + " %" }));
      factor.value = String(origFactor);
    }
    factor.addEventListener("change", refresh);
    factorRow.appendChild(factor);
    body.appendChild(factorRow);

    /* ---- Notiz ---- */
    var noteWrap = D.el("div.field");
    noteWrap.appendChild(D.el("label", { text: I.t("day.note"), for: "dm-note" }));
    var note = D.el("textarea.textarea#dm-note", { rows: 2, placeholder: I.t("day.notePlaceholder") });
    note.value = rec.note || "";
    noteWrap.appendChild(note);
    body.appendChild(noteWrap);

    var issues = D.el("div.dm-issues");
    body.appendChild(issues);
    var preview = D.el("div.dm-preview");
    body.appendChild(preview);

    /* Auf Telefonen nur als Symbol — sonst bricht die Fusszeile zweizeilig um */
    var openFull = D.el("button.btn.left.dm-ic", { type: "button", "aria-label": I.t("cmd.open"), html: D.icon("external") + "<span>" + D.esc(I.t("cmd.open")) + "</span>" });
    var del = App.hasRecord(iso)
      ? D.el("button.btn.ghost.dm-ic", { type: "button", "aria-label": I.t("common.delete"), html: D.icon("trash") + "<span>" + D.esc(I.t("common.delete")) + "</span>" })
      : null;
    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var save = D.el("button.btn.primary", { type: "button", text: I.t("common.save") });

    var hName = holidayName(holiday);
    var m = D.modal({
      title: I.formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      sub: I.t("week.kw", { n: T.isoWeek(iso) }) + (hName ? " · " + hName : ""),
      body: body,
      footer: [openFull, del, cancel, save],
      focus: opts.focusEnd ? ".dm-end" : null
    });

    /* Der Dialog setzt den Fokus selbst. Ohne preventScroll sprang die Seite
       dahinter auf Telefonen beim Öffnen weg. */
    [m.box.querySelector(".modal-head .close"), endWrap.input].forEach(function (node) {
      if (!node) return;
      var orig = node.focus;
      node.focus = function () {
        try { orig.call(node, { preventScroll: true }); } catch (e) { orig.call(node); }
      };
    });

    openFull.addEventListener("click", function () { m.close(); App.setDate(iso, { view: "today" }); });
    cancel.addEventListener("click", function () { m.close(); });
    if (del) {
      del.addEventListener("click", function () {
        m.close();
        App.clearDay(iso);
        D.toast(I.t("toast.dayCleared"), { action: { label: I.t("common.undo"), onClick: function () { App.undo(); } } });
        if (onDone) onDone();
      });
    }
    save.addEventListener("click", function () {
      var patch = buildPatch();
      m.close();
      if (Object.keys(patch).length) App.saveDay(iso, patch);
      if (onDone) onDone();
    });

    markChips();
    refresh();

    /* ---------------------------------------------------------------- */

    function addRow(data, focus) {
      var row = D.el("div.dm-break");
      var label = D.el("input.input.dm-b-label", { type: "text", value: data.label || "", placeholder: I.t("day.label"), "aria-label": I.t("day.label") });
      var bs = D.el("input.input.time.dm-b-start", { type: "text", value: data.start || "", placeholder: "HH:MM", "aria-label": I.t("day.break") + " · " + I.t("day.start") });
      var be = D.el("input.input.time.dm-b-end", { type: "text", value: data.end || "", placeholder: "HH:MM", "aria-label": I.t("day.break") + " · " + I.t("day.end") });
      var dur = D.el("span.dur.mono", { text: "–" });
      var rm = D.el("button.btn.sm.ghost.icon", { type: "button", "aria-label": I.t("common.remove"), html: D.icon("x") });
      [label, bs, be, dur, rm].forEach(function (n) { row.appendChild(n); });
      var entry = { node: row, orig: data, label: label, start: bs, end: be, dur: dur };
      rows.push(entry);

      label.addEventListener("input", function () { breaksDirty = true; });
      D.attachTimeInput(bs, function () { breaksDirty = true; refresh(); });
      D.attachTimeInput(be, function () { breaksDirty = true; refresh(); });
      rm.addEventListener("click", function () {
        breaksDirty = true;
        rows.splice(rows.indexOf(entry), 1);
        if (row.parentNode) row.parentNode.removeChild(row);
        refresh();
        focusQuietly(addBreak);
      });
      brkList.appendChild(row);
      if (focus) setTimeout(function () { focusQuietly(bs); }, 30);
    }

    function collectBreaks() {
      return rows.map(function (r) {
        // Unbekannte Felder (id, bezahlt, Herkunft) bleiben erhalten
        return Object.assign({}, r.orig, {
          label: r.label.value,
          start: r.start.value.trim(),
          end: r.end.value.trim()
        });
      }).filter(function (b) { return b.start || b.end; });
    }

    function effectiveType() { return chosenType || autoType; }

    function markChips() {
      var eff = effectiveType();
      D.qsa(".chip", chips).forEach(function (c) {
        c.setAttribute("aria-pressed", c.dataset.type === eff ? "true" : "false");
      });
      autoTag.hidden = chosenType !== null;
      var meta = R.dayType(eff);
      factorRow.hidden = !meta.credits || eff === "holiday";
    }

    /** Nur was sich wirklich geändert hat — sonst bleiben z. B. Pausen unberührt. */
    function buildPatch() {
      var patch = {};
      var st = startWrap.input.value.trim(), en = endWrap.input.value.trim();
      if (st !== (rec.start || "")) patch.start = st;
      if (en !== (rec.end || "")) patch.end = en;
      if (breaksDirty) patch.breaks = collectBreaks();
      if (chosenType !== (rec.type || null)) patch.type = chosenType;
      if (!factorRow.hidden && parseFloat(factor.value) !== origFactor) patch.absenceFactor = parseFloat(factor.value);
      if (note.value !== (rec.note || "")) patch.note = note.value;
      return patch;
    }

    function refresh() {
      var draft = Object.assign({}, rec, buildPatch(), { date: iso });
      var prev = App.record(T.addDays(iso, -1));
      var prevRes = prev && prev.start ? ZK.Engine.computeDay(prev, { settings: s, isToday: false }) : null;
      var res = ZK.Engine.computeDay(draft, {
        settings: s, holiday: holiday, isToday: iso === T.todayISO(),
        prevEndTl: prevRes && prevRes.complete ? prevRes.endTl : null
      });

      /* Pausendauer je Zeile + Summe */
      var anchor = T.parseHHMM(startWrap.input.value);
      var total = 0;
      rows.forEach(function (r) {
        var a = T.parseHHMM(r.start.value), b = T.parseHHMM(r.end.value);
        if (a === null || b === null) { r.dur.textContent = "–"; return; }
        var mins = T.intervalMinutes(a, b, anchor !== null ? anchor : a);
        total += mins;
        r.dur.textContent = App.fmt(mins);
      });
      brkSum.textContent = rows.length ? App.fmt(total) : "";

      /* Fehler und offene Punkte (z. B. Gehen fehlt) direkt im Dialog */
      D.clear(issues);
      res.warnings.filter(function (w) { return w.level === "error"; }).slice(0, 2).forEach(function (w) {
        var text = I.t("warn." + w.code, { count: w.count, v: App.fmt(w.minutes || 0) });
        issues.appendChild(D.el("div.notice.warn", { html: D.icon("alert") + "<div>" + D.esc(text) + "</div>" }));
      });

      D.clear(preview);
      var prov = isProvisional(res);
      var bal = prov ? liveBalance(res) : res.balance;
      preview.appendChild(miniKpi(I.t("day.net"), App.fmt(res.net), ""));
      preview.appendChild(miniKpi(
        I.t("day.balance") + (prov ? " · " + I.t("day.provisional") : ""),
        App.fmtSigned(bal),
        prov ? "" : (bal > 0 ? "plus" : bal < 0 ? "minus" : "")
      ));
    }

    function timeField(label, cls) {
      var wrap = D.el("div.field");
      var id = cls + "-" + iso;
      wrap.appendChild(D.el("label", { text: label, for: id }));
      var input = D.el("input.input.time." + cls, { type: "text", id: id, placeholder: "HH:MM" });
      wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }

    function miniKpi(title, value, tone) {
      var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
      node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
        '<div class="k-val mono' + (tone ? " tone-" + tone : "") + '">' + D.esc(value) + "</div>";
      return node;
    }
  }

  /* ==================================================================== */
  /* Monatsansicht                                                         */
  /* ==================================================================== */
  function render(host, App) {
    var today = T.todayISO();
    var monthKey = App.calendarMonth || T.monthKey(App.date);
    var first = monthKey + "-01";
    var monthDate = T.fromISO(first);
    if (!monthDate) { monthKey = T.monthKey(today); first = monthKey + "-01"; monthDate = T.fromISO(first); }
    var last = T.endOfMonth(first);
    var s = App.settings();
    var firstDay = s.firstDayOfWeek === 0 ? 0 : 1;
    var start = trackingStart(App.store.allDays(), s, App.store.getMeta ? App.store.getMeta() : null);
    if (selectedISO && T.monthKey(selectedISO) !== monthKey) selectedISO = null;
    var selected = selectedISO || App.date;

    /* ---- Kopf ---- */
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: cap(I.monthName(monthDate.getMonth())) + " " + monthDate.getFullYear() }));
    left.appendChild(D.el("p.lede", { text: I.t("cal.lede") }));
    head.appendChild(left);

    var controls = D.el("div.row.tight");
    var prev = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.back"), html: D.icon("left") });
    prev.addEventListener("click", function () { goMonth(T.addMonths(first, -1)); });
    var next = D.el("button.btn.icon", { type: "button", "aria-label": I.t("common.next"), html: D.icon("right") });
    next.addEventListener("click", function () { goMonth(T.addMonths(first, 1)); });
    var todayBtn = D.el("button.btn.sm", { type: "button", text: I.t("common.today") });
    todayBtn.addEventListener("click", function () {
      selectedISO = null;
      App.setDate(today);
    });
    var bulkBtn = D.el("button.btn.sm", { type: "button", html: D.icon("grid") + "<span>" + D.esc(I.t("cal.bulk")) + "</span>" });
    bulkBtn.addEventListener("click", function () {
      // Vorgabe: der gewählte Tag — sonst der nächste freie Arbeitstag, nie der ganze Monat
      var anchor = selectedISO && T.monthKey(selectedISO) === monthKey ? selectedISO
        : nextFreeWorkday(T.monthKey(today) === monthKey ? today : first);
      openBulk(App, anchor, anchor);
    });

    /** Erster Arbeitstag ab `from` ohne erfasste Zeiten (höchstens drei Wochen weit). */
    function nextFreeWorkday(from) {
      for (var k = 0; k < 21; k++) {
        var iso = T.addDays(from, k);
        var r = App.day(iso);
        var rec = App.record(iso);
        if (r.baseTarget > 0 && !r.holiday && !rec.start && !rec.end && !rec.type) return iso;
      }
      return from;
    }

    controls.appendChild(prev);
    controls.appendChild(next);
    controls.appendChild(todayBtn);
    controls.appendChild(bulkBtn);
    head.appendChild(controls);
    host.appendChild(head);

    function goMonth(iso) {
      App.calendarMonth = T.monthKey(iso);
      writeViewHash(App, "calendar", T.monthKey(App.date) === App.calendarMonth ? App.date : App.calendarMonth + "-01");
      App.renderChrome();
      App.renderView();
    }

    /* ---- Daten: ein Durchlauf für das ganze Raster ---- */
    var gridStart = T.startOfWeek(first, firstDay);
    var gridEnd = T.addDays(T.startOfWeek(last, firstDay), 6);
    var all = App.range(gridStart, gridEnd).days;
    var monthDays = all.filter(function (r) { return T.monthKey(r.date) === monthKey; });
    var sum = summarize(monthDays, { today: today, start: start, hasRecord: App.hasRecord });

    /* ---- Monatssummen ---- */
    var isCurrent = monthKey === T.monthKey(today);
    var isFuture = first > today;
    var kpis = D.el("div.grid-4.cal-kpis.mb-4.stagger");
    var balNode = kpiInto(kpis, I.t("cal.monthBalance"), App.fmtSigned(sum.settled),
      sum.runningDays ? provisionalSub(sum.provisional) : I.tn("cal.recordedDays", sum.recordedDays),
      sum.settled > 0 ? "plus" : sum.settled < 0 ? "minus" : "", !!sum.runningDays);
    kpiInto(kpis, I.t("cal.monthActual"), App.fmt(sum.net + sum.credited),
      actualSub(sum.net, sum.credited, App.fmt));
    if (isFuture) {
      kpiInto(kpis, I.t("cal.monthTarget"), App.fmt(sum.target), I.tn("cal.workdays", sum.workdays));
    } else {
      kpiInto(kpis, isCurrent ? I.t("cal.targetToDate") : I.t("cal.monthTarget"), App.fmt(sum.targetToDate),
        sum.targetToDate !== sum.target ? I.t("cal.monthTargetSub", { v: App.fmt(sum.target) }) : I.tn("cal.workdays", sum.workdays));
    }
    var quota = ZK.Engine.quotaUsage(App.store.allDays(), monthDate.getFullYear(), s);
    var vacSub = typeof quota.vacationTaken === "number"
      ? I.t("cal.vacationSub", { taken: fmtNum(quota.vacationTaken), planned: fmtNum(quota.vacationPlanned || 0), total: fmtNum(quota.vacationEntitlement) })
      : fmtNum(quota.vacation) + " / " + fmtNum(quota.vacationEntitlement) + " " + I.t("common.days");
    kpiInto(kpis, I.t("stats.vacationLeft"), fmtNum(quota.vacationLeft), vacSub, quota.vacationLeft < 0 ? "minus" : "");
    host.appendChild(kpis);

    /* ---- Offene Punkte: Tage ohne Gehen-Zeit und Lücken ---- */
    if (sum.incomplete.length || sum.gaps.length) {
      var note = D.el("div.notice.warn.mb-4.cal-notice");
      note.innerHTML = D.icon("alert");
      var txt = D.el("div");
      var titles = [];
      if (sum.incomplete.length) titles.push(I.tn("cal.missingCount", sum.incomplete.length));
      if (sum.gaps.length) titles.push(I.tn("cal.gapsCount", sum.gaps.length));
      txt.appendChild(D.el("strong", { text: titles.join(" · ") }));
      var hints = [];
      if (sum.incomplete.length) hints.push(I.t("cal.missingHint"));
      if (sum.gaps.length) hints.push(I.t("stats.gapsHint"));
      if (sum.uncoveredTarget) hints.push(I.t("cal.uncoveredTarget", { v: App.fmt(sum.uncoveredTarget) }));
      txt.appendChild(D.el("div.sub", { text: hints.join(" ") }));
      var fix = D.el("div.cal-fix-list");
      sum.incomplete.concat(sum.gaps).slice(0, 6).forEach(function (iso) {
        var miss = sum.incomplete.indexOf(iso) >= 0;
        var b = D.el("button.cal-fix" + (miss ? ".miss" : ""), {
          type: "button",
          html: (miss ? D.icon("alert") : "") + "<span>" + D.esc(I.formatDate(iso, { weekday: "short", day: "numeric", month: "numeric" })) + "</span>",
          "aria-label": I.formatDate(iso, { weekday: "long", day: "numeric", month: "long" }) + ": " + (miss ? I.t("day.missingEnd") : I.t("cal.gapTip"))
        });
        b.addEventListener("click", function () { openDay(iso, miss); });
        fix.appendChild(b);
      });
      txt.appendChild(fix);
      note.appendChild(txt);
      host.appendChild(note);
    }

    if (ZK.Ext) ZK.Ext.render("calendar.top", host, { App: App, month: monthKey, from: first, to: last });

    /* ---- Raster ---- */
    var cal = D.el("div.cal.mb-3");
    var dow = D.el("div.cal-dow", { "aria-hidden": "true" });
    for (var i = 0; i < 7; i++) {
      dow.appendChild(D.el("div", { text: I.weekdayName((firstDay + i) % 7, "short") }));
    }
    cal.appendChild(dow);

    var grid = D.el("div.cal-grid");
    var liveCells = [];
    all.forEach(function (res, idx) {
      grid.appendChild(buildCell(res, idx));
    });
    cal.appendChild(grid);
    host.appendChild(cal);

    host.appendChild(buildLegend());

    /* Laufender Tag: Zwischenstand jede Minute nachführen, ohne neu zu zeichnen */
    if (liveCells.length && App.onTick) {
      var lastMinute = T.nowMinutes();
      App.onTick(function () {
        var nowM = T.nowMinutes();
        if (nowM === lastMinute) return;
        lastMinute = nowM;
        var provTotal = 0;
        liveCells.forEach(function (lc) {
          var r = App.day(lc.iso);
          if (!isProvisional(r)) return;
          var v = liveBalance(r);
          provTotal += v;
          if (lc.bal) lc.bal.textContent = App.fmtSigned(v);
          if (lc.bar) lc.bar.style.width = barPct(r) + "%";
        });
        var sub = balNode && balNode.querySelector(".k-sub .pv");
        if (sub) sub.textContent = App.fmtSigned(provTotal);
      });
    }

    function provisionalSub(v) {
      var parts = I.t("cal.provisionalSub", { v: "\u0000" }).split("\u0000");
      return D.esc(parts[0]) + '<span class="pv">' + D.esc(App.fmtSigned(v)) + "</span>" + D.esc(parts[1] || "");
    }

    function openDay(iso, focusEnd) {
      selectedISO = iso;
      D.qsa(".cal-cell.selected", grid).forEach(function (c) { c.classList.remove("selected"); });
      var cellNode = grid.querySelector('[data-date="' + iso + '"]');
      if (cellNode) cellNode.classList.add("selected");
      ZK.DayModal.open(App, iso, function () {
        // Gespeichert → Ansicht ist neu gezeichnet; Fokus zurück auf den Tag
        var again = D.qs('.cal-cell[data-date="' + iso + '"]');
        if (again && document.activeElement === document.body) focusQuietly(again);
      }, { focusEnd: focusEnd });
    }

    function barPct(r) {
      var needed = Math.max(1, r.target - r.credited);
      return Math.max(0, Math.min(100, (r.net / needed) * 100));
    }

    function buildCell(res, idx) {
      var iso = res.date;
      var inMonth = T.monthKey(iso) === monthKey;
      var isToday = iso === today;
      var wd = res.weekday;
      var weekend = wd === 0 || wd === 6;
      var st = dayState(res, today, start);
      var record = App.record(iso);
      var explicitType = !!(record.type && R.DAY_TYPES[record.type]);
      var fromOutlook = record.source === "outlook";
      var aria = [I.formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" })];
      if (isToday) aria.push(I.t("common.today"));

      var cls = [];
      if (!inMonth) cls.push("other");
      if (weekend) cls.push("weekend");
      if (isToday) cls.push("today");
      if (iso === selected) cls.push("selected");
      cls.push("is-" + st);

      var cell = D.el("button.cal-cell", {
        type: "button",
        class: cls.join(" "),
        "data-date": iso,
        "aria-current": isToday ? "date" : null
      });

      /* Kopfzeile: Tag, Notiz-Punkt, Kalenderwoche (erste Spalte) */
      var top = D.el("span.d");
      top.appendChild(D.el("span.dn", { text: String(T.fromISO(iso).getDate()) }));
      if (res.note) {
        top.appendChild(D.el("span.note-dot", { "data-tip": res.note.slice(0, 90), "aria-hidden": "true" }));
        aria.push(I.t("day.note"));
      }
      if (idx % 7 === 0) top.appendChild(D.el("span.kw", { text: kwLabel(T.addDays(iso, firstDay === 0 ? 1 : 0)), "aria-hidden": "true" }));
      cell.appendChild(top);

      /* Tagesart / Feiertag: Farbe links, Name (auf Telefonen als Kürzel) */
      var flag = null;
      if (explicitType && res.type !== "work") {
        flag = {
          long: (fromOutlook ? "◇ " : "") + I.t("type." + res.type) + factorText(res, false),
          code: (fromOutlook ? "◇" : "") + typeCode(res.type) + factorText(res, true),
          color: res.typeMeta.color,
          tip: fromOutlook ? I.t("ol.fromCalendar") : null
        };
      } else if (res.holiday) {
        flag = { long: holidayName(res.holiday), code: typeCode("holiday"), color: "var(--type-holiday)", tip: null };
      }
      if (flag) {
        cell.appendChild(D.el("span.type-strip", { style: { "--c": flag.color }, "aria-hidden": "true" }));
        var fl = D.el("span.flag", { style: { "--c": flag.color }, "data-tip": flag.tip || flag.long, "aria-hidden": "true" });
        fl.appendChild(D.el("span.fl-long", { text: flag.long }));
        fl.appendChild(D.el("span.fl-code", { text: flag.code }));
        cell.appendChild(fl);
        aria.push(flag.long.replace("◇ ", "") + (fromOutlook ? " (" + I.t("ol.fromCalendar") + ")" : ""));
      }

      if (st === "running") {
        var v = liveBalance(res);
        cell.appendChild(D.el("span.times", { text: res.start + "–…" }));
        var live = D.el("span.live-tag");
        live.appendChild(D.el("i.live-dot", { "aria-hidden": "true" }));
        live.appendChild(D.el("span.live-t", { text: I.t("day.runningShort") }));
        cell.appendChild(live);
        var lb = D.el("span.mini-bar");
        var lbi = D.el("i.live", { style: { width: barPct(res) + "%" } });
        lb.appendChild(lbi);
        cell.appendChild(lb);
        var pb = D.el("span.bal.prov", { text: App.fmtSigned(v), "data-tip": I.t("day.provisional") });
        cell.appendChild(pb);
        liveCells.push({ iso: iso, bal: pb, bar: lbi });
        aria.push(I.t("day.runningShort") + ", " + App.fmtSigned(v) + " " + I.t("day.provisional"));
      } else if (st === "incomplete") {
        cell.appendChild(D.el("span.times", { text: (res.start || "") + "–?" }));
        cell.appendChild(D.el("span.miss", {
          html: D.icon("alert") + '<span class="miss-t">' + D.esc(I.t("day.missingEnd")) + "</span>",
          "data-tip": I.t("warn.missing-end")
        }));
        aria.push(I.t("day.missingEnd"));
      } else {
        if (res.complete) {
          cell.appendChild(D.el("span.times", { text: res.start + "–" + res.end }));
          var barWrap = D.el("span.mini-bar");
          barWrap.appendChild(D.el("i." + (res.balance >= 0 ? "ok" : "below"), { style: { width: barPct(res) + "%" } }));
          cell.appendChild(barWrap);
          aria.push(res.start + "–" + res.end);
        }
        if (st === "recorded" && (res.balance !== 0 || res.complete)) {
          cell.appendChild(D.el("span.bal", {
            class: res.balance > 0 ? "tone-plus" : res.balance < 0 ? "tone-minus" : "tone-mute",
            text: App.fmtSigned(res.balance)
          }));
          aria.push(I.t("day.balance") + " " + App.fmtSigned(res.balance));
        } else if (st === "gap" && inMonth) {
          cell.appendChild(D.el("span.bal.tone-mute.gap", { text: "—", "data-tip": I.t("cal.gapTip") }));
          aria.push(I.t("cal.gapTip"));
        }
      }

      cell.setAttribute("aria-label", aria.join(", "));
      cell.addEventListener("click", function () { openDay(iso, st === "incomplete"); });
      if (ZK.Ext) ZK.Ext.decorate("calendar.cell", cell, { App: App, iso: iso, res: res });
      return cell;
    }

    /* ---- Legende: alle Tagesarten (mit Kürzel) und alle Markierungen ---- */
    function buildLegend() {
      var legend = D.el("div.cal-legend", { "aria-label": I.t("cal.legend") });
      var types = D.el("div.lg-group");
      TYPE_ORDER.forEach(function (key) {
        if (key === "work") return; // Arbeitstage tragen keine Markierung
        var meta = R.dayType(key);
        types.appendChild(D.el("span", {
          html: '<i class="lg-dot" style="--c:' + meta.color + '"></i><b class="lg-code">' + D.esc(typeCode(key)) + "</b>" + D.esc(I.t("type." + key))
        }));
      });
      legend.appendChild(types);

      var marks = D.el("div.lg-group");
      function mark(html, label) { marks.appendChild(D.el("span", { html: html + D.esc(label) })); }
      mark('<i class="lg-bar ok"></i>', I.t("day.goalReached"));
      mark('<i class="lg-bar below"></i>', I.t("cal.lgBelow"));
      mark('<i class="live-dot lg-live"></i>', I.t("day.runningShort"));
      mark('<span class="lg-miss">' + D.icon("alert") + "</span>", I.t("day.missingEnd"));
      mark('<b class="lg-gap">—</b>', I.t("cal.gapTip"));
      mark('<i class="lg-note"></i>', I.t("day.note"));
      mark('<b class="lg-ol">◇</b>', I.t("ol.fromCalendar"));
      mark('<i class="lg-today">' + T.fromISO(today).getDate() + "</i>", I.t("common.today"));
      mark('<i class="lg-sel"></i>', I.t("cal.lgSelected"));
      legend.appendChild(marks);
      return legend;
    }
  }

  function kpiInto(host, title, value, subHtml, tone, live) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone ? " tone-" + tone : "") + '">' + D.esc(value) + "</div>" +
      (subHtml ? '<div class="k-sub">' + (live ? '<i class="live-dot" aria-hidden="true"></i>' + subHtml : D.esc(subHtml)) + "</div>" : "");
    host.appendChild(node);
    return node;
  }

  /* ==================================================================== */
  /* Massenaktion für einen Zeitraum                                       */
  /* ==================================================================== */
  function openBulk(App, defFrom, defTo) {
    var body = D.el("div.col");
    body.appendChild(D.el("p.muted", { text: I.t("cal.bulkLede"), style: { fontSize: "13px" } }));

    var rangeRow = D.el("div.dm-times");
    var fromField = dateField(I.t("common.from"), defFrom, "bulk-from");
    var toField = dateField(I.t("common.to"), defTo, "bulk-to");
    rangeRow.appendChild(fromField.wrap);
    rangeRow.appendChild(toField.wrap);
    body.appendChild(rangeRow);

    body.appendChild(D.el("div.section-title", { text: I.t("day.type"), style: { marginBottom: "0", marginTop: "6px" } }));
    var chips = D.el("div.chipset");
    var chosen = "vacation";
    ["vacation", "comp", "sick", "accident", "military", "training", "unpaid", "free"].forEach(function (key) {
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
    factorRow.appendChild(D.el("label", { text: I.t("day.factor"), for: "bulk-factor" }));
    var factor = D.el("select.select#bulk-factor");
    [[1, "100 %"], [0.5, "50 % · " + I.t("day.halfDay")]].forEach(function (o) {
      factor.appendChild(D.el("option", { value: o[0], text: o[1] }));
    });
    factorRow.appendChild(factor);
    body.appendChild(factorRow);

    var skip = switchRow(I.t("cal.bulkSkipFree"), true);
    var keep = switchRow(I.t("cal.bulkSkipRecorded"), true);

    var summary = D.el("div.notice.info.mt-4");
    body.appendChild(summary);
    var conflict = D.el("div.notice.warn.mt-2");
    body.appendChild(conflict);

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var apply = D.el("button.btn.primary", { type: "button", text: I.t("cal.bulkApply") });

    var m = D.modal({ title: I.t("cal.bulk"), body: body, footer: [cancel, apply] });
    cancel.addEventListener("click", function () { m.close(); });

    [fromField.input, toField.input, factor, skip.input, keep.input].forEach(function (n) {
      n.addEventListener("change", refresh);
    });
    [fromField.input, toField.input].forEach(function (n) { n.addEventListener("input", refresh); });

    apply.addEventListener("click", function () {
      var plan = compute();
      if (!plan.list.length) return;
      var overwrite = plan.list.filter(function (iso) { return plan.timed.indexOf(iso) >= 0; });
      var go = overwrite.length
        ? D.confirmDialog({
          title: I.t("cal.bulkConfirmTitle"),
          message: I.t("cal.bulkConfirmMsg", { n: overwrite.length, undo: I.t("common.undo") }),
          okLabel: I.t("cal.bulkConfirmOk"),
          cancelLabel: I.t("common.cancel"),
          danger: true
        })
        : Promise.resolve(true);
      go.then(function (ok) {
        if (!ok) return;
        var patch = {};
        var f = factor.disabled ? 1 : parseFloat(factor.value);
        plan.list.forEach(function (iso) {
          patch[iso] = { type: chosen, absenceFactor: f, start: "", end: "", breaks: [] };
        });
        // Gemeldet wird, was der Speicher angenommen hat
        var written = App.store.setDays(patch, { label: "bulk" }).written;
        App.afterChange();
        m.close();
        if (!written) return;
        D.toast(I.tn("cal.bulkDone", written), {
          tone: "plus",
          action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
        });
      });
    });

    mark();

    function switchRow(label, on) {
      var wrap = D.el("label.switch.mt-3");
      var input = D.el("input", { type: "checkbox", checked: on });
      wrap.appendChild(input);
      wrap.appendChild(D.el("span.track"));
      wrap.appendChild(D.el("span.lbl", { text: label }));
      body.appendChild(wrap);
      return { wrap: wrap, input: input };
    }

    function mark() {
      D.qsa(".chip", chips).forEach(function (c) {
        c.setAttribute("aria-pressed", c.dataset.type === chosen ? "true" : "false");
      });
      // Anteil ergibt nur bei gutgeschriebenen Arten Sinn
      factor.disabled = !R.dayType(chosen).credits;
      refresh();
    }

    /** Welche Tage würden gesetzt — und welche davon tragen schon Zeiten? */
    function compute() {
      var from = fromField.input.value, to = toField.input.value;
      var plan = { list: [], timed: [], credit: 0, locked: 0 };
      if (!T.isValidISO(from) || !T.isValidISO(to) || from > to) return plan;
      var days = T.rangeDays(from, to);
      if (days.length > 400) return plan;
      days.forEach(function (iso) {
        var res = App.day(iso);
        if (skip.input.checked && !(res.baseTarget > 0 && !res.holiday)) return;
        // Abgeschlossene Monate nehmen nichts mehr an: übersprungen und benannt
        if (App.store.isLocked && App.store.isLocked(iso)) { plan.locked++; return; }
        var rec = App.record(iso);
        var hasTimes = !!(rec.start || rec.end || (rec.breaks || []).some(function (b) { return b.start || b.end; }));
        if (hasTimes) plan.timed.push(iso);
        if (hasTimes && keep.input.checked) return;
        plan.list.push(iso);
        plan.credit += Math.round(res.baseTarget * (factor.disabled ? 1 : parseFloat(factor.value)) * (R.dayType(chosen).credits ? 1 : 0));
      });
      return plan;
    }

    function refresh() {
      var plan = compute();
      summary.innerHTML = D.icon("info") + "<div><strong>" +
        D.esc(plan.list.length ? I.tn("cal.bulkPreview", plan.list.length) : I.t("cal.bulkNone")) + "</strong>" +
        (plan.credit ? '<div class="sub">' + D.esc(I.t("day.credited") + " " + App.fmt(plan.credit)) + "</div>" : "") +
        (plan.locked ? '<div class="sub">' + D.esc(I.tn("lock.skipped", plan.locked)) + "</div>" : "") + "</div>";
      if (plan.timed.length) {
        conflict.hidden = false;
        conflict.innerHTML = D.icon("alert") + "<div><strong>" + D.esc(I.tn("cal.bulkConflicts", plan.timed.length)) + "</strong>" +
          '<div class="sub">' + D.esc(keep.input.checked ? I.t("cal.bulkConflictsSkip") : I.t("cal.bulkConflictsOverwrite")) + "</div></div>";
      } else {
        conflict.hidden = true;
        D.clear(conflict);
      }
      keep.wrap.hidden = plan.timed.length === 0;
      apply.disabled = plan.list.length === 0;
    }

    function dateField(label, value, id) {
      var wrap = D.el("div.field");
      wrap.appendChild(D.el("label", { text: label, for: id }));
      var input = D.el("input.input", { type: "date", value: value, id: id });
      wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }
  }
})(typeof self !== "undefined" ? self : this);
