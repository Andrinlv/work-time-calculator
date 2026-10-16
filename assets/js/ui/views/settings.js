/* ==========================================================================
   ZEITKONTO — Ansicht „Einstellungen“
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, H = ZK.Holidays, I = ZK.I18n;

  /* Mehr Vorlagen passen nicht sinnvoll als Knöpfe in die Tagesansicht. */
  var MAX_SHIFTS = 8;
  /* Mindestbreite einer Kartenspalte — darunter rutschen Spalten zusammen. */
  var COL_MIN = 340;

  var uid = 0;

  /* Ältere Speicherstände kennen `nameKey` noch nicht: die mitgelieferten
     Vorlagen tragen dort ihren deutschen Namen als festen Text. Solange er
     unverändert ist, gilt die Vorlage weiterhin als übersetzbar. */
  var SHIFT_DEFAULT_NAMES = { office: "Büro", early: "Frühschicht", late: "Spätschicht", night: "Nachtschicht" };

  /* ==================================================================== */
  /* Beschriftungen aus Daten-Modulen                                      */
  /* ==================================================================== */
  /* Regelwerk und Feiertage liefern nur Schlüssel und deutsche Rohtexte —
     übersetzt wird hier, damit auch das Onboarding dieselben Texte zeigt. */

  function tOr(key, fallback, vars) {
    var v = I.t(key, vars);
    return v === key ? fallback : v;
  }

  function presetLabel(p) {
    if (!p.weekly) return I.t("set.presetCustom");
    var hours = p.weekly / 60;
    var text = String(hours);
    try { text = new Intl.NumberFormat(I.locale(), { maximumFractionDigits: 2 }).format(hours); } catch (e) { /* Fallback oben */ }
    return I.t("set.presetWeekly", { h: text });
  }

  function presetNote(p, workdays) {
    if (!p.weekly) return I.t("set.presetCustomNote");
    var days = (workdays && workdays.length) ? workdays : [1, 2, 3, 4, 5];
    var per = Math.round(p.weekly / days.length);
    return I.t("set.presetNote", { v: T.formatDuration(per, "hm"), days: dayRange(days) });
  }

  /** „Mo–Fr“ für zusammenhängende Arbeitstage, sonst „Mo, Mi, Fr“. */
  function dayRange(days) {
    var sorted = days.map(function (d) { return d === 0 ? 7 : d; }).sort(function (a, b) { return a - b; });
    var name = function (d) { return String(I.weekdayName(d % 7, "short")).replace(/\.$/, ""); };
    var contiguous = sorted.every(function (d, i) { return i === 0 || d === sorted[i - 1] + 1; });
    if (contiguous && sorted.length > 2) return name(sorted[0]) + "–" + name(sorted[sorted.length - 1]);
    return sorted.map(name).join(", ");
  }

  function rulesetLabel(key) {
    var r = R.BREAK_RULESETS[key];
    return tOr("ruleset." + key, r ? r.label : key);
  }

  function regionCountry(key) {
    return String(key).split("-")[0];
  }

  function regionGroupLabel(r) {
    return tOr("region.group." + regionCountry(r.key), r.group);
  }

  function regionLabel(r) {
    var name = I.t("region." + r.key);
    if (name === "region." + r.key) return r.label;
    return r.key.indexOf("-") > 0 ? regionGroupLabel(r) + " · " + name : name;
  }

  /** Auswahlfeld mit allen Feiertagsregionen, nach Land gruppiert. */
  function regionSelect(value) {
    var select = D.el("select.select");
    var groups = {};
    H.REGIONS.forEach(function (r) {
      var option = D.el("option", { value: r.key, text: regionLabel(r), selected: r.key === value });
      if (r.key === "none") { select.appendChild(option); return; }
      var g = regionCountry(r.key);
      if (!groups[g]) {
        groups[g] = D.el("optgroup", { label: regionGroupLabel(r) });
        select.appendChild(groups[g]);
      }
      groups[g].appendChild(option);
    });
    return select;
  }

  /** Anzeigename einer Schichtvorlage (übersetzt, solange nicht umbenannt). */
  function shiftNameKey(tpl) {
    if (!tpl) return null;
    if (tpl.nameKey) return tpl.nameKey;
    if (SHIFT_DEFAULT_NAMES[tpl.id] && tpl.name === SHIFT_DEFAULT_NAMES[tpl.id]) return "shift." + tpl.id;
    return null;
  }

  function shiftName(tpl) {
    var key = shiftNameKey(tpl);
    return key ? tOr(key, tpl.name || "") : String(tpl.name || "");
  }

  /* ==================================================================== */
  /* Reine Prüf- und Rechenfunktionen (auch in den Tests verwendet)        */
  /* ==================================================================== */

  /**
   * Zahl aus einem Eingabefeld lesen.
   * Leer oder unlesbar → { ok:false } (das Feld zeigt dann wieder den
   * gespeicherten Wert). Sonst gerundet auf `step` und begrenzt auf min/max.
   */
  function readNumber(raw, opts) {
    opts = opts || {};
    var s = String(raw === null || raw === undefined ? "" : raw).trim().replace(",", ".").replace("−", "-");
    if (!s) return { ok: false, reason: "empty" };
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return { ok: false, reason: "invalid" };
    var v = parseFloat(s);
    if (!isFinite(v)) return { ok: false, reason: "invalid" };
    var step = opts.step || 1;
    v = +(Math.round(v / step) * step).toFixed(4);
    var min = opts.min === undefined ? -Infinity : opts.min;
    var max = opts.max === undefined ? Infinity : opts.max;
    var clamped = Math.min(max, Math.max(min, v));
    return { ok: true, value: clamped, clamped: clamped !== v };
  }

  function strictTime(value) {
    return T.isStrictHHMM(value) ? T.parseHHMM(value) : null;
  }

  /**
   * Prüft eine Schichtvorlage. Ende vor Beginn heisst: über Mitternacht.
   * Fehlercodes je Feld: required | format | same | pair | order | outside.
   * @returns {{ok:Boolean, errors:Object, span:Number|null, breakMinutes:Number, net:Number|null, overnight:Boolean}}
   */
  function checkShift(tpl) {
    tpl = tpl || {};
    var errors = {};
    if (!String(tpl.name || "").trim() && !tpl.nameKey) errors.name = "required";

    var start = strictTime(tpl.start), end = strictTime(tpl.end);
    if (start === null) errors.start = String(tpl.start || "").trim() ? "format" : "required";
    if (end === null) errors.end = String(tpl.end || "").trim() ? "format" : "required";
    if (start !== null && end !== null && start === end) errors.end = "same";

    var hasBS = !!String(tpl.breakStart || "").trim(), hasBE = !!String(tpl.breakEnd || "").trim();
    var bs = strictTime(tpl.breakStart), be = strictTime(tpl.breakEnd);
    if (hasBS && bs === null) errors.breakStart = "format";
    if (hasBE && be === null) errors.breakEnd = "format";
    if (!errors.breakStart && !errors.breakEnd && hasBS !== hasBE) errors[hasBS ? "breakEnd" : "breakStart"] = "pair";

    var span = null, breakMinutes = 0;
    if (start !== null && end !== null && !errors.end) {
      span = T.intervalMinutes(start, end, start);
      if (bs !== null && be !== null && !errors.breakStart && !errors.breakEnd) {
        /* Auf der Zeitachse ab Schichtbeginn: eine Pause „vor“ dem Beginn
           landet am Folgetag und damit ausserhalb der Schicht */
        var b0 = T.onTimeline(bs, start), b1 = T.onTimeline(be, start);
        if (b0 >= start + span) errors.breakStart = "outside";
        else if (b1 <= b0) errors.breakEnd = "order";
        else if (b1 > start + span) errors.breakEnd = "outside";
        else breakMinutes = b1 - b0;
      }
    }
    var ok = !Object.keys(errors).length;
    return {
      ok: ok,
      errors: errors,
      span: span,
      breakMinutes: breakMinutes,
      net: span === null ? null : span - (tpl.breakPaid ? 0 : breakMinutes),
      overnight: start !== null && end !== null && end < start
    };
  }

  /** Gespeicherte Form einer Vorlage — nur bekannte Felder, Zeiten normiert. */
  function cleanShift(tpl) {
    var out = {
      id: String(tpl.id || ("s" + Date.now().toString(36))),
      name: String(tpl.name || "").trim(),
      start: tpl.start || "",
      end: tpl.end || "",
      breakStart: tpl.breakStart || "",
      breakEnd: tpl.breakEnd || "",
      breakPaid: !!tpl.breakPaid
    };
    var key = shiftNameKey(tpl);
    if (key) out.nameKey = key;
    return out;
  }

  /** Neuer Name aus dem Eingabefeld: bleibt übersetzbar, solange er der Übersetzung entspricht. */
  function renameShift(tpl, typed) {
    var next = Object.assign({}, tpl);
    var text = String(typed || "").trim();
    var key = shiftNameKey(tpl);
    if (key && text === tOr(key, tpl.name)) return next;
    next.name = text;
    delete next.nameKey;
    if (SHIFT_DEFAULT_NAMES[next.id] && text === SHIFT_DEFAULT_NAMES[next.id]) next.id = "s" + Date.now().toString(36);
    return next;
  }

  /** Welche Vorlage entspricht diesen Wochensollzeiten? Sonst „custom“. */
  function matchPreset(weeklyTargets, workdays) {
    var days = (workdays && workdays.length) ? workdays : [1, 2, 3, 4, 5];
    var targets = (weeklyTargets || []).join(",");
    for (var i = 0; i < R.MODEL_PRESETS.length; i++) {
      var p = R.MODEL_PRESETS[i];
      if (p.weekly && R.weeklyPreset(p.weekly, days).join(",") === targets) return p.key;
    }
    return "custom";
  }

  (ZK.Views = ZK.Views || {}).settings = {
    render: render,
    /* Für Onboarding und Tagesansicht */
    labels: {
      preset: presetLabel,
      presetNote: presetNote,
      ruleset: rulesetLabel,
      region: regionLabel,
      regionSelect: regionSelect,
      shiftName: shiftName
    },
    /* Für die Tests */
    readNumber: readNumber,
    checkShift: checkShift,
    cleanShift: cleanShift,
    renameShift: renameShift,
    matchPreset: matchPreset
  };

  /* ==================================================================== */
  /* Ansicht                                                               */
  /* ==================================================================== */

  function render(host, App) {
    var s = App.settings();

    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("set.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("set.lede") }));
    head.appendChild(left);
    var wizard = D.el("button.btn.sm", { type: "button", html: D.icon("zap") + "<span>" + D.esc(I.t("set.rerunSetup")) + "</span>" });
    wizard.addEventListener("click", function () { App.runOnboarding(true); });
    head.appendChild(wizard);
    host.appendChild(head);

    var grid = D.el("div.settings-grid");
    host.appendChild(grid);

    /* ================================================================ */
    /* Darstellung                                                       */
    /* ================================================================ */
    var look = section(I.t("set.appearance"));
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
    }).row);

    look.body.appendChild(rowSegmented(I.t("set.density"), "", [
      ["compact", I.t("set.density.compact")], ["normal", I.t("set.density.normal")], ["cozy", I.t("set.density.cozy")]
    ], s.density || "normal", function (v) {
      App.store.updateSettings({ density: v });
      App.applyDensity();
      flowSoon(grid);
    }));

    look.body.appendChild(rowSwitch(I.t("set.contrast"), I.t("set.contrastHint2"), s.contrast === "high", function (on) {
      App.store.updateSettings({ contrast: on ? "high" : "normal" });
      App.applyDensity();
    }));

    look.body.appendChild(rowSegmented(I.t("set.durationStyle"), "", [
      ["hm", I.t("set.durationStyle.hm")], ["clock", I.t("set.durationStyle.clock")], ["decimal", I.t("set.durationStyle.decimal")]
    ], s.durationStyle || "hm", function (v) {
      App.store.updateSettings({ durationStyle: v });
      App.afterChange();
    }));

    /* Die Uhr in der Kopfzeile gibt es erst ab Tablet-Breite (views.css) */
    var secondsRow = rowSwitch(I.t("set.showSeconds"), "", s.showSeconds !== false, function (on) {
      App.store.updateSettings({ showSeconds: on });
    });
    secondsRow.classList.add("needs-clock");
    look.body.appendChild(secondsRow);

    look.body.appendChild(rowSegmented(I.t("set.firstDay"), "", [
      [1, I.weekdayName(1, "long")], [0, I.weekdayName(0, "long")]
    ], s.firstDayOfWeek === 0 ? 0 : 1, function (v) {
      App.store.updateSettings({ firstDayOfWeek: +v });
      App.afterChange();
    }));
    grid.appendChild(look.node);

    /* ================================================================ */
    /* Arbeitsmodell                                                     */
    /* ================================================================ */
    var model = section(I.t("set.model"));
    var workdays = s.workdays || [1, 2, 3, 4, 5];
    var currentPreset = R.MODEL_PRESETS.filter(function (p) { return p.key === (s.modelPreset || "42"); })[0] || R.MODEL_PRESETS[0];

    var presetRow = rowSelect(I.t("set.preset"), presetNote(currentPreset, workdays), R.MODEL_PRESETS.map(function (p) {
      return [p.key, presetLabel(p)];
    }), currentPreset.key, function (v) {
      var preset = R.MODEL_PRESETS.filter(function (p) { return p.key === v; })[0];
      var patch = { modelPreset: v };
      if (preset && preset.weekly) patch.weeklyTargets = R.weeklyPreset(preset.weekly, workdays);
      App.store.updateSettings(patch);
      showPreset(v);
      refreshWeekdays();
      App.renderChrome();
    });
    model.body.appendChild(presetRow.row);

    function showPreset(key) {
      var p = R.MODEL_PRESETS.filter(function (x) { return x.key === key; })[0] || R.MODEL_PRESETS[0];
      presetRow.select.value = p.key;
      if (presetRow.hint) presetRow.hint.textContent = presetNote(p, workdays);
    }

    model.body.appendChild(rowNumber(I.t("set.workload"), I.t("set.workloadHint"), {
      min: 1, max: 200, step: 1, suffix: "%",
      read: function () { return App.settings().workloadPercent || 100; },
      write: function (v) {
        App.store.updateSettings({ workloadPercent: v });
        updateWeeklyTotal();
        App.renderChrome();
      }
    }));

    var wdRow = D.el("div.weekday-block");
    var wdTitleId = "set-wd-" + (++uid);
    wdRow.appendChild(D.el("div.weekday-head", {
      html: "<b id='" + wdTitleId + "'>" + D.esc(I.t("set.weekdayTargets")) + "</b>" +
        "<span>" + D.esc(I.t("set.weekdayHint")) + "</span>"
    }));
    var wdGrid = D.el("div.weekday-grid", { role: "group", "aria-labelledby": wdTitleId });
    var order = s.firstDayOfWeek === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
    var wdInputs = {};
    order.forEach(function (wd) {
      var field = D.el("div.field");
      field.appendChild(D.el("label", { text: I.weekdayName(wd, "short"), "for": "set-wd-" + wd + "-" + uid }));
      var input = D.el("input.input.mono", {
        type: "text",
        id: "set-wd-" + wd + "-" + uid,
        inputmode: "numeric",
        autocomplete: "off",
        value: T.formatDuration((s.weeklyTargets || [])[wd] || 0, "clock"),
        "aria-label": I.weekdayName(wd, "long")
      });
      input.addEventListener("change", function () {
        var current = (App.settings().weeklyTargets || [0, 0, 0, 0, 0, 0, 0]).slice();
        var mins = String(input.value).trim() ? T.parseDuration(input.value) : null;
        if (mins === null || mins < 0 || mins > 24 * 60) {
          /* Unlesbar oder leer: nichts speichern, alten Wert zurück */
          input.value = T.formatDuration(current[wd] || 0, "clock");
          flash(input);
          return;
        }
        current[wd] = mins;
        var preset = matchPreset(current, workdays);
        App.store.updateSettings({ weeklyTargets: current, modelPreset: preset });
        input.value = T.formatDuration(mins, "clock");
        showPreset(preset);
        updateWeeklyTotal();
        App.renderChrome();
      });
      wdInputs[wd] = input;
      field.appendChild(input);
      wdGrid.appendChild(field);
    });
    wdRow.appendChild(wdGrid);
    var weeklyTotal = D.el("p.weekday-total");
    wdRow.appendChild(weeklyTotal);
    model.body.appendChild(wdRow);
    updateWeeklyTotal();

    function refreshWeekdays() {
      var st = App.settings();
      order.forEach(function (wd) { wdInputs[wd].value = T.formatDuration((st.weeklyTargets || [])[wd] || 0, "clock"); });
      updateWeeklyTotal();
    }
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
    var breaks = section(I.t("set.breaks"));
    breaks.body.appendChild(rowSelect(I.t("set.breakRuleset"), "", Object.keys(R.BREAK_RULESETS).map(function (k) {
      return [k, rulesetLabel(k)];
    }), s.breakRuleset || "ch", function (v) {
      App.store.updateSettings({ breakRuleset: v });
      drawTiers();
      App.renderChrome();
    }).row);

    var tierList = D.el("div.tier-list");
    breaks.body.appendChild(tierList);
    drawTiers();
    function drawTiers() {
      D.clear(tierList);
      var set = R.BREAK_RULESETS[App.settings().breakRuleset || "ch"];
      tierList.hidden = !(set && set.tiers.length);
      if (tierList.hidden) return;
      set.tiers.forEach(function (t) {
        tierList.appendChild(D.el("div.tier", {
          html: "<span>" + D.esc(t.over ? I.t("set.tierOver", { v: T.formatDuration(t.over, "clock") }) : I.t("set.tierAlways")) + "</span>" +
            "<b class='mono'>" + D.esc(t.require) + " " + D.esc(I.t("common.min")) + "</b>"
        }));
      });
    }

    breaks.body.appendChild(rowSwitch(I.t("set.autoDeduct"), I.t("set.autoDeductHint"), s.autoDeductBreak !== false, function (on) {
      App.store.updateSettings({ autoDeductBreak: on });
      App.renderChrome();
    }));

    /* Standard-Mittagspause: beide leer = keine, sonst Ende nach Beginn */
    var lunch = baseRow(I.t("set.defaultLunch"), I.t("set.defaultLunchHint"), "value");
    lunch.row.classList.add("is-range");
    lunch.ctl.classList.add("time-range");
    var lunchFrom = D.el("input.input.time", { type: "text", value: (s.defaultLunch || {}).start || "", "aria-label": I.t("set.defaultLunch") + " · " + I.t("common.from"), placeholder: "12:00" });
    var lunchTo = D.el("input.input.time", { type: "text", value: (s.defaultLunch || {}).end || "", "aria-label": I.t("set.defaultLunch") + " · " + I.t("common.to"), placeholder: "12:30" });
    var lunchErr = D.el("div.row-error", { role: "status" });
    [lunchFrom, lunchTo].forEach(function (n) {
      D.attachTimeInput(n, function (value, committed) {
        if (!committed) return;
        var a = lunchFrom.value, b = lunchTo.value;
        var problem = lunchProblem(a, b);
        lunchFrom.classList.toggle("invalid", !!problem && (problem === "pair" ? !a : true));
        lunchTo.classList.toggle("invalid", !!problem && (problem === "pair" ? !b : true));
        lunchErr.textContent = problem ? I.t("set.lunchErr." + problem) : "";
        if (problem) return;
        App.store.updateSettings({ defaultLunch: { start: a, end: b } });
      });
    });
    lunch.ctl.appendChild(lunchFrom);
    lunch.ctl.appendChild(D.el("span.range-dash", { text: "–", "aria-hidden": "true" }));
    lunch.ctl.appendChild(lunchTo);
    lunch.row.firstChild.appendChild(lunchErr);
    breaks.body.appendChild(lunch.row);

    breaks.body.appendChild(rowSelect(I.t("set.roundStep"), "", [
      [0, I.t("set.roundStep.0")], [1, "1 " + I.t("common.min")], [5, "5 " + I.t("common.min")],
      [6, "6 " + I.t("common.min") + " (1/10 h)"], [10, "10 " + I.t("common.min")], [15, "15 " + I.t("common.min")]
    ], s.roundStep || 0, function (v) {
      App.store.updateSettings({ roundStep: +v });
      App.renderChrome();
    }).row);
    breaks.body.appendChild(rowSegmented(I.t("set.roundMode"), "", [
      ["nearest", I.t("set.roundMode.nearest")], ["down", I.t("set.roundMode.down")], ["up", I.t("set.roundMode.up")]
    ], s.roundMode || "nearest", function (v) {
      App.store.updateSettings({ roundMode: v });
      App.renderChrome();
    }));
    grid.appendChild(breaks.node);

    /* ================================================================ */
    /* Schichtvorlagen                                                   */
    /* ================================================================ */
    grid.appendChild(shiftSection(App).node);

    /* ================================================================ */
    /* Zeitkonto & Kontingente                                           */
    /* ================================================================ */
    var acc = section(I.t("set.account"));

    var carry = baseRow(I.t("set.carryOver"), I.t("set.carryOverHint"), "value");
    var carryInput = D.el("input.input.mono.num", {
      type: "text", inputmode: "text", autocomplete: "off",
      value: T.formatSigned(s.carryOverMinutes || 0, "clock"), "aria-labelledby": carry.labelId
    });
    carryInput.addEventListener("change", function () {
      var value = readSignedDuration(carryInput.value);
      if (value === null) {
        value = App.settings().carryOverMinutes || 0;
        flash(carryInput);
      } else {
        App.store.updateSettings({ carryOverMinutes: value });
      }
      carryInput.value = T.formatSigned(value, "clock");
      App.renderChrome();
    });
    carry.ctl.appendChild(carryInput);
    acc.body.appendChild(carry.row);

    var from = baseRow(I.t("set.carryOverFrom"), "", "value");
    var fromInput = D.el("input.input", { type: "date", value: s.carryOverFrom || "", "aria-labelledby": from.labelId });
    fromInput.addEventListener("change", function () {
      App.store.updateSettings({ carryOverFrom: fromInput.value || null });
      App.renderChrome();
    });
    from.ctl.appendChild(fromInput);
    acc.body.appendChild(from.row);

    acc.body.appendChild(rowSwitch(I.t("set.countMissing"), I.t("set.countMissingHint"), !!s.countMissingWorkdays, function (on) {
      App.store.updateSettings({ countMissingWorkdays: on });
      App.renderChrome();
    }));

    acc.body.appendChild(rowNumber(I.t("set.vacationDays"), "", {
      min: 0, max: 366, step: 0.5, suffix: I.t("common.days"),
      read: function () { return App.settings().vacationDaysPerYear || 0; },
      write: function (v) { App.store.updateSettings({ vacationDaysPerYear: v }); }
    }));
    acc.body.appendChild(rowNumber(I.t("set.vacationCarry"), I.t("set.vacationCarryHint"), {
      min: -366, max: 366, step: 0.5, suffix: I.t("common.days"),
      read: function () { return App.settings().vacationCarryDays || 0; },
      write: function (v) { App.store.updateSettings({ vacationCarryDays: v }); }
    }));
    grid.appendChild(acc.node);

    /* ================================================================ */
    /* Feiertage                                                         */
    /* ================================================================ */
    var hol = section(I.t("set.holidays"));
    var region = baseRow(I.t("set.region"), "", "choice");
    region.ctl.classList.add("has-select");
    var regionSel = regionSelect(s.holidayRegion);
    regionSel.setAttribute("aria-labelledby", region.labelId);
    regionSel.addEventListener("change", function () {
      App.store.updateSettings({ holidayRegion: regionSel.value });
      App.renderView();
      App.renderChrome();
    });
    region.ctl.appendChild(regionSel);
    hol.body.appendChild(region.row);

    hol.body.appendChild(rowSwitch(I.t("set.autoHolidays"), "", s.autoHolidays !== false, function (on) {
      App.store.updateSettings({ autoHolidays: on });
      App.renderChrome();
    }));

    var upcoming = H.between(T.todayISO(), T.addDays(T.todayISO(), 400), s.holidayRegion).slice(0, 6);
    if (upcoming.length) {
      var prev = D.el("div.holiday-preview");
      prev.appendChild(D.el("div.section-title", { text: I.t("set.holidayPreview") }));
      upcoming.forEach(function (h) {
        prev.appendChild(D.el("div.holiday-line", {
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
    var comp = section(I.t("set.compliance"));
    comp.body.appendChild(rowDuration(I.t("set.maxDaily"), "", {
      min: 60, max: 24 * 60,
      read: function () { return App.settings().maxDailyMinutes || 600; },
      write: function (v) { App.store.updateSettings({ maxDailyMinutes: v }); App.renderChrome(); }
    }));
    comp.body.appendChild(rowNumber(I.t("set.minRest"), I.t("set.minRestHint"), {
      min: 1, max: 24, step: 0.5, suffix: I.t("common.h"),
      read: function () { var v = App.settings().minRestHours; return v === null || v === undefined ? 11 : v; },
      write: function (v) { App.store.updateSettings({ minRestHours: v }); App.renderChrome(); }
    }));
    comp.body.appendChild(rowDuration(I.t("set.maxWeekly"), I.t("set.maxWeeklyHint"), {
      min: 60, max: 7 * 24 * 60,
      read: function () { return App.settings().maxWeeklyMinutes || 3000; },
      write: function (v) { App.store.updateSettings({ maxWeeklyMinutes: v }); }
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
    comp.body.appendChild(rowNumber(I.t("set.reminderLead"), I.t("set.reminderLeadHint"), {
      min: 0, max: 120, step: 1, suffix: I.t("common.min"),
      read: function () { var v = App.settings().reminderLeadMinutes; return v === null || v === undefined ? 10 : v; },
      write: function (v) { App.store.updateSettings({ reminderLeadMinutes: v }); App.scheduleReminder(); }
    }));
    comp.body.appendChild(rowSwitch(I.t("set.confetti"), "", s.confetti !== false, function (on) {
      App.store.updateSettings({ confetti: on });
      if (on) D.confetti({ count: 40 });
    }));
    comp.body.appendChild(rowSwitch(I.t("set.breakReminder"), I.t("set.breakReminderHint"), s.breakReminder !== false, function (on) {
      App.store.updateSettings({ breakReminder: on });
    }));
    comp.body.appendChild(rowSwitch(I.t("set.titleCountdown"), I.t("set.titleCountdownHint"), s.titleCountdown !== false, function (on) {
      App.store.updateSettings({ titleCountdown: on });
    }));
    comp.body.appendChild(rowNumber(I.t("set.backupReminder"), I.t("set.backupReminderHint"), {
      min: 0, max: 365, step: 1, suffix: I.t("common.days"),
      read: function () { var v = App.settings().backupReminderDays; return v === null || v === undefined ? 45 : v; },
      write: function (v) { App.store.updateSettings({ backupReminderDays: v }); }
    }));
    grid.appendChild(comp.node);

    /* ================================================================ */
    /* Installation                                                      */
    /* ================================================================ */
    var inst = section(I.t("set.install"));
    inst.body.appendChild(D.el("p.card-hint", { text: I.t("set.installHint") }));

    if (App.isStandalone()) {
      var okBox = D.el("div.notice.plus");
      okBox.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("set.installed")) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("set.installedHint")) + "</div></div>";
      inst.body.appendChild(okBox);
    } else if (App.canInstall()) {
      var btn = D.el("button.btn.primary.block", { type: "button", html: D.icon("download") + "<span>" + D.esc(I.t("set.install")) + "</span>" });
      btn.addEventListener("click", function () { App.promptInstall().then(function () { App.renderView(); }); });
      inst.body.appendChild(btn);
    } else {
      var how = installHowto();
      var hint = D.el("div.notice.info");
      hint.innerHTML = D.icon("info") +
        "<div><strong>" + D.esc(I.t(how.title)) + "</strong><div class='sub'>" + D.esc(I.t(how.text)) + "</div></div>";
      inst.body.appendChild(hint);
    }
    /* Stempel-Link für NFC-Tag, QR-Code oder Verknüpfung */
    if (location.protocol !== "file:") {
      inst.body.appendChild(D.el("div.section-title.mt-5", { text: I.t("set.stampLink") }));
      inst.body.appendChild(D.el("p.card-hint", { text: I.t("set.stampLinkHint") }));
      var linkRow = D.el("div.link-row");
      var linkInput = D.el("input.input.mono", { type: "text", readonly: true, value: App.stampLink(), "aria-label": I.t("set.stampLink") });
      linkInput.addEventListener("focus", function () { linkInput.select(); });
      var copyBtn = D.el("button.btn", { type: "button", html: D.icon("copy") + "<span>" + D.esc(I.t("common.copy")) + "</span>" });
      copyBtn.addEventListener("click", function () {
        D.copyText(linkInput.value).then(function () { D.toast(I.t("toast.linkCopied"), { icon: "check" }); });
      });
      linkRow.appendChild(linkInput);
      linkRow.appendChild(copyBtn);
      inst.body.appendChild(linkRow);
      if (isIOS()) {
        inst.body.appendChild(D.el("p.safety-hint.mt-2", { text: I.t("set.stampLinkIos") }));
      }
    }
    grid.appendChild(inst.node);

    /* ================================================================ */
    /* Daten                                                             */
    /* ================================================================ */
    var data = section(I.t("set.data"));
    data.body.appendChild(D.el("p.card-hint", { text: I.t("set.dataHint") }));

    var expBtn = D.el("button.btn.primary.block", { type: "button", html: D.icon("download") + "<span>" + D.esc(I.t("set.exportAll")) + "</span>" });
    expBtn.addEventListener("click", function () { App.exportJSON(); });
    data.body.appendChild(expBtn);

    var modeId = "set-import-" + (++uid);
    data.body.appendChild(D.el("label.section-title.mt-5", { text: I.t("set.importMode"), "for": modeId }));
    var modeSelect = D.el("select.select.mb-3", { id: modeId });
    [["merge", I.t("set.importMode.merge")], ["merge-keep", I.t("set.importMode.merge-keep")], ["replace", I.t("set.importMode.replace")]]
      .forEach(function (o) { modeSelect.appendChild(D.el("option", { value: o[0], text: o[1] })); });
    data.body.appendChild(modeSelect);

    var drop = D.el("div.dropzone", { tabindex: "0", role: "button", html: D.icon("upload") + "<span>" + D.esc(I.t("set.importDrop")) + "</span>" });
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

    /* Bezeichnungen aller vier Sprachen: eine CSV aus der französischen
       App muss sich auch in der deutschen einlesen lassen. */
    function labelsAllLangs(prefix, keys) {
      return I.LANGS.map(function (lang) {
        var dict = I.DICT[lang] || {};
        var map = {};
        keys.forEach(function (k) { if (dict[prefix + k]) map[k] = dict[prefix + k]; });
        return map;
      });
    }

    function importDone(result, count) {
      var opts = { sub: I.t("set.importResult", result), tone: count ? "plus" : "warn" };
      if (count) opts.action = { label: I.t("common.undo"), onClick: function () { App.undo(); } };
      D.toast(I.t("toast.imported"), opts);
    }

    function handleFile(file) {
      fileInput.value = "";   // dieselbe Datei lässt sich erneut wählen
      D.readFile(file).then(function (content) {
        var text = String(content || "").replace(/^﻿/, "");
        if (/\.csv$/i.test(file.name) || !/^\s*[\[{]/.test(text)) {
          var parsed = ZK.Exporters.parseCSV(text);
          if (parsed.error) {
            D.toast(I.t(parsed.code === "no-date" ? "imp.err.csvNoDate" : "imp.err.csvEmpty"), { tone: "minus", duration: 7000 });
            return;
          }
          var res = ZK.Exporters.csvRowsToDays(parsed, {
            getDay: function (iso) { return App.store.getDay(iso); },
            autoType: function (iso) { return ZK.Engine.computeDay({ date: iso }, { settings: App.settings() }).type; },
            typeLabels: labelsAllLangs("type.", Object.keys(R.DAY_TYPES)),
            locationLabels: labelsAllLangs("loc.", R.LOCATIONS),
            breakLabel: I.t("day.lunch"),
            lunch: App.settings().defaultLunch
          });
          var count = Object.keys(res.days).length;
          if (count) {
            App.store.setDays(res.days, { label: "import-csv" });
            App.afterChange();
          }
          importDone(res, count);
          return;
        }
        var json = JSON.parse(text);
        var result = App.store.importState(json, modeSelect.value);
        App.applyTheme();
        App.applyDensity();
        App.applyLanguage();
        App.afterChange();
        importDone(result, result.added + result.updated);
      }).catch(function (err) {
        var code = err && err.code;
        var key = code === "no-days" ? "imp.err.noDays"
          : code === "no-valid-days" ? "imp.err.noValid"
            : (code === "invalid" || (err && err.name === "SyntaxError")) ? "imp.err.invalid" : null;
        D.toast(key ? I.t(key) : String(err && err.message ? err.message : err), { tone: "minus", duration: 7000 });
      });
    }

    /* Datensicherheit: dauerhafter Speicher, automatische Sicherung */
    data.body.appendChild(D.el("div.section-title.mt-5", { text: I.t("set.safety") }));
    var safety = D.el("div.safety");
    data.body.appendChild(safety);
    renderSafety(safety, App);

    var diag = App.store.diagnostics();
    var diagBox = D.el("div.storage-meter.mt-4");
    diagBox.innerHTML = D.icon("info") +
      "<span>" + D.esc(I.t("set.storage")) + ": <b>" + Math.round(diag.bytes / 1024) + " KB</b> · " +
      D.esc(I.tn("common.nDays", diag.days)) + " · " + D.esc(I.t("set.schema", { v: diag.schema })) +
      (diag.volatile ? " · <b class='tone-warn'>" + D.esc(I.t("set.volatile")) + "</b>" : "") + "</span>";
    data.body.appendChild(diagBox);

    var resetBtn = D.el("button.btn.minus.block.mt-4", { type: "button", html: D.icon("trash") + "<span>" + D.esc(I.t("set.resetAll")) + "</span>" });
    resetBtn.addEventListener("click", function () {
      D.confirmDialog({
        title: I.t("set.resetAll"),
        message: I.t("set.resetConfirmKeep"),
        okLabel: I.t("common.delete"),
        cancelLabel: I.t("common.cancel"),
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        App.store.reset(true);
        App.afterChange();
        D.toast(I.t("toast.allDeleted"), {
          action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
        });
      });
    });
    data.body.appendChild(resetBtn);
    grid.appendChild(data.node);

    /* ================================================================ */
    /* Über                                                              */
    /* ================================================================ */
    var about = section(I.t("set.about"));
    about.body.innerHTML =
      '<div class="wordmark about-mark">' +
      '<span class="mark"><i></i><i></i><i></i><i></i></span><b>ZEIT</b><span>KONTO</span></div>' +
      '<p class="about-text">' + D.esc(I.t("app.tagline")) + ". " + D.esc(I.t("set.dataHint")) + "</p>" +
      '<div class="about-version"><span class="muted">' + D.esc(I.t("set.version")) + "</span><span class='mono fw-8'>" + D.esc(App.version) + "</span></div>";
    /* Tastenkürzel nur dort, wo es eine Tastatur gibt */
    var kbdBtn = D.el("button.btn.block.mt-4.desktop-only", { type: "button", html: D.icon("keyboard") + "<span>" + D.esc(I.t("kbd.title")) + "</span>" });
    kbdBtn.addEventListener("click", App.showShortcuts);
    about.body.appendChild(kbdBtn);
    grid.appendChild(about.node);

    flowColumns(grid);
    watchColumns(grid);
  }

  /* ==================================================================== */
  /* Spalten: Karten ohne Lücken verteilen                                 */
  /* ==================================================================== */
  /* Ein Raster richtet jede Zeile an der höchsten Karte aus — kurze Karten
     hinterlassen dann grosse Löcher. Stattdessen landet jede Karte (in ihrer
     Reihenfolge) in der gerade kürzesten Spalte. Neu verteilt wird nur, wenn
     sich die Spaltenzahl ändert; während man tippt, springt also nichts. */

  function flowColumns(grid, force) {
    if (!grid.isConnected) return;
    /* Reihenfolge merken; später direkt angehängte Karten kommen hinten dazu */
    var cards = grid._cards || [];
    var extra = Array.prototype.filter.call(grid.children, function (n) { return n.matches(".card") && cards.indexOf(n) < 0; });
    if (extra.length) { cards = cards.concat(extra); force = true; }
    grid._cards = cards;
    var gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
    var width = grid.clientWidth;
    if (!width) return;
    var n = Math.max(1, Math.min(3, Math.floor((width + gap) / (COL_MIN + gap))));
    if (grid._n === n && !force) return;
    grid._n = n;

    var active = document.activeElement;
    D.clear(grid);
    grid.classList.toggle("cols", n > 1);
    if (n === 1) {
      cards.forEach(function (c) { grid.appendChild(c); });
    } else {
      var cols = [];
      for (var i = 0; i < n; i++) cols.push(grid.appendChild(D.el("div.settings-col")));
      /* Höhen in Spaltenbreite messen, dann jeweils in die kürzeste Spalte */
      cards.forEach(function (c) { cols[0].appendChild(c); });
      var heights = cards.map(function (c) { return c.offsetHeight; });
      var sums = cols.map(function () { return 0; });
      cards.forEach(function (c, i) {
        var k = 0;
        for (var j = 1; j < n; j++) if (sums[j] < sums[k] - 1) k = j;
        cols[k].appendChild(c);
        sums[k] += heights[i] + gap;
      });
    }
    if (active && active !== document.activeElement && grid.contains(active)) active.focus();
  }

  var flowTimer = null;
  function flowSoon(grid) {
    clearTimeout(flowTimer);
    flowTimer = setTimeout(function () { flowColumns(grid, true); }, 60);
  }

  function watchColumns(grid) {
    if (typeof ResizeObserver === "undefined") {
      var onResize = D.debounce(function () {
        if (!grid.isConnected) { root.removeEventListener("resize", onResize); return; }
        flowColumns(grid);
      }, 120);
      root.addEventListener("resize", onResize);
      return;
    }
    var ro = new ResizeObserver(function () {
      if (!grid.isConnected) { ro.disconnect(); return; }
      flowColumns(grid);
    });
    ro.observe(grid);
  }

  /* ==================================================================== */
  /* Schichtvorlagen                                                       */
  /* ==================================================================== */

  function shiftSection(App) {
    var box = section(I.t("set.shifts"));
    box.body.appendChild(D.el("p.card-hint", { text: I.t("set.shiftsHint") }));
    var list = D.el("div.shift-list");
    box.body.appendChild(list);

    var foot = D.el("div.shift-foot");
    var addBtn = D.el("button.btn.sm", { type: "button", html: D.icon("plus") + "<span>" + D.esc(I.t("set.shiftAdd")) + "</span>" });
    var resetBtn = D.el("button.btn.sm.ghost", { type: "button", html: D.icon("refresh") + "<span>" + D.esc(I.t("set.shiftReset")) + "</span>" });
    foot.appendChild(addBtn);
    foot.appendChild(resetBtn);
    box.body.appendChild(foot);

    /* Gespeicherter Stand; ungültige Eingaben bleiben nur im Feld stehen */
    var saved = current();
    function current() {
      return (App.settings().shiftTemplates || []).map(function (t) { return cleanShift(t); });
    }
    function persist(next) {
      App.store.updateSettings({ shiftTemplates: next.map(cleanShift) });
      saved = current();
    }

    addBtn.addEventListener("click", function () {
      if (saved.length >= MAX_SHIFTS) return;
      var lunch = App.settings().defaultLunch || {};
      var next = saved.concat([{
        id: "s" + Date.now().toString(36),
        name: I.t("set.shiftNew"),
        start: "08:00",
        end: "17:00",
        breakStart: lunch.start || "12:00",
        breakEnd: lunch.end || "12:30",
        breakPaid: false
      }]);
      persist(next);
      draw({ index: next.length - 1, sel: ".shift-name" });
    });

    resetBtn.addEventListener("click", function () {
      D.confirmDialog({
        title: I.t("set.shiftReset"),
        message: I.t("set.shiftResetConfirm"),
        okLabel: I.t("common.reset"),
        cancelLabel: I.t("common.cancel")
      }).then(function (ok) {
        if (!ok) return;
        persist(R.defaultSettings().shiftTemplates);
        draw();
      });
    });

    draw();
    return box;

    function draw(focus) {
      D.clear(list);
      saved.forEach(function (tpl, i) { list.appendChild(shiftRow(tpl, i)); });
      if (!saved.length) list.appendChild(D.el("p.shift-empty", { text: I.t("set.shiftEmpty") }));
      addBtn.disabled = saved.length >= MAX_SHIFTS;
      addBtn.title = addBtn.disabled ? I.t("set.shiftMax", { n: MAX_SHIFTS }) : "";
      if (focus && list.children[focus.index]) {
        var target = list.children[focus.index].querySelector(focus.sel);
        if (target && target.disabled) target = list.children[focus.index].querySelector(".shift-tools .btn:not([disabled])");
        if (target) target.focus();
      }
    }

    function shiftRow(tpl, index) {
      var draft = Object.assign({}, tpl);
      var row = D.el("div.shift", { role: "group", "aria-label": shiftName(tpl) || I.t("set.shiftName") });

      var head = D.el("div.shift-head");
      var name = D.el("input.input.shift-name", {
        type: "text", value: shiftName(tpl), maxlength: "40", autocomplete: "off",
        "aria-label": I.t("set.shiftName"), placeholder: I.t("set.shiftName")
      });
      name.addEventListener("change", function () {
        draft = renameShift(draft, name.value);
        commit();
        row.setAttribute("aria-label", shiftName(draft) || I.t("set.shiftName"));
      });
      head.appendChild(name);

      var tools = D.el("div.shift-tools");
      var up = toolBtn("up", I.t("set.shiftUp"), index === 0);
      var down = toolBtn("down", I.t("set.shiftDown"), index === saved.length - 1);
      var del = toolBtn("trash", I.t("set.shiftRemove"), false);
      up.addEventListener("click", function () { move(index, -1, ".shift-tools .btn:first-child"); });
      down.addEventListener("click", function () { move(index, 1, ".shift-tools .btn:nth-child(2)"); });
      del.addEventListener("click", function () {
        var removed = saved[index];
        var next = saved.slice();
        next.splice(index, 1);
        persist(next);
        draw({ index: Math.min(index, next.length - 1), sel: ".shift-tools .btn:last-child" });
        if (!next.length) addBtn.focus();
        /* Gezielt wieder einsetzen statt App.undo(): der Speicher fasst
           schnelle Änderungen derselben Einstellung zu einem Schritt zusammen */
        D.toast(I.t("set.shiftRemoved", { name: shiftName(removed) }), {
          action: {
            label: I.t("common.undo"),
            onClick: function () {
              var back = current();
              back.splice(Math.min(index, back.length), 0, removed);
              App.store.updateSettings({ shiftTemplates: back });
              if (list.isConnected) { saved = current(); draw({ index: index, sel: ".shift-name" }); }
            }
          }
        });
      });
      tools.appendChild(up);
      tools.appendChild(down);
      tools.appendChild(del);
      head.appendChild(tools);
      row.appendChild(head);

      var times = D.el("div.shift-times");
      var inputs = {};
      [["start", I.t("set.shiftStart")], ["end", I.t("set.shiftEnd")],
        ["breakStart", I.t("set.shiftBreakStart")], ["breakEnd", I.t("set.shiftBreakEnd")]].forEach(function (f) {
        var field = D.el("div.field");
        var id = "shift-" + (++uid);
        field.appendChild(D.el("label", { text: f[1], "for": id }));
        var input = D.el("input.input.time", { type: "text", id: id, value: tpl[f[0]] || "", placeholder: "--:--" });
        D.attachTimeInput(input, function (value, committed) {
          if (!committed) return;
          draft[f[0]] = input.value;
          commit();
        });
        inputs[f[0]] = input;
        field.appendChild(input);
        times.appendChild(field);
      });
      row.appendChild(times);

      var meta = D.el("div.shift-meta");
      var paid = D.el("label.switch.sm");
      var paidInput = D.el("input", { type: "checkbox", checked: !!tpl.breakPaid });
      paidInput.addEventListener("change", function () { draft.breakPaid = paidInput.checked; commit(); });
      paid.appendChild(paidInput);
      paid.appendChild(D.el("span.track"));
      paid.appendChild(D.el("span.lbl", { text: I.t("set.shiftPaid") }));
      meta.appendChild(paid);
      var sum = D.el("div.shift-sum", { role: "status" });
      meta.appendChild(sum);
      row.appendChild(meta);
      describe(checkShift(draft));
      return row;

      function commit() {
        var res = checkShift(draft);
        describe(res);
        if (!res.ok) return;
        var next = saved.slice();
        next[index] = cleanShift(draft);
        persist(next);
      }

      function describe(res) {
        ["start", "end", "breakStart", "breakEnd"].forEach(function (k) {
          inputs[k].classList.toggle("invalid", !!res.errors[k]);
          inputs[k].setAttribute("aria-invalid", res.errors[k] ? "true" : "false");
        });
        name.classList.toggle("invalid", !!res.errors.name);
        sum.classList.toggle("is-error", !res.ok);
        if (!res.ok) {
          sum.textContent = I.t("set.shiftErr." + firstError(res.errors));
          return;
        }
        var fmt = function (m) { return App.fmt(m); };
        var parts = [I.t("set.shiftNet", { v: fmt(res.net) })];
        if (res.breakMinutes) parts.push(I.t(draft.breakPaid ? "set.shiftBreakPaidSum" : "set.shiftBreakSum", { v: fmt(res.breakMinutes) }));
        if (res.overnight) parts.push(I.t("set.shiftOvernight"));
        sum.textContent = parts.join(" · ");
      }
    }

    function firstError(errors) {
      var order = ["name", "start", "end", "breakStart", "breakEnd"];
      for (var i = 0; i < order.length; i++) {
        var code = errors[order[i]];
        if (!code) continue;
        if (order[i] === "name") return "name";
        if (code === "required" || code === "format") return order[i].indexOf("break") === 0 ? "breakFormat" : "time";
        return code;
      }
      return "time";
    }

    function move(index, delta, sel) {
      var to = index + delta;
      if (to < 0 || to >= saved.length) return;
      var next = saved.slice();
      var item = next.splice(index, 1)[0];
      next.splice(to, 0, item);
      persist(next);
      draw({ index: to, sel: sel });
    }

    function toolBtn(icon, label, disabled) {
      return D.el("button.btn.icon.sm.ghost", { type: "button", "aria-label": label, "data-tip": label, html: D.icon(icon), disabled: disabled });
    }
  }

  /* ==================================================================== */
  /* Outlook-Kalender                                                      */
  /* ==================================================================== */

  function outlookSection(App) {
    var OL = ZK.OutlookSync;
    var box = section(I.t("ol.title"));
    var st = OL.status(App);
    var s = st.settings;

    box.body.appendChild(D.el("p.card-hint", { text: I.t("ol.lede") }));

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
      var who = D.el("div.notice.plus.ol-account");
      who.innerHTML = D.icon("check") +
        "<div class='ol-who'><strong>" + D.esc(I.t("ol.signedInAs", { name: st.account.name || st.account.username })) + "</strong>" +
        (st.account.username ? "<div class='sub'>" + D.esc(st.account.username) + "</div>" : "") + "</div>";
      var outBtn = D.el("button.btn.sm.ghost", { type: "button", text: I.t("ol.signOut") });
      outBtn.addEventListener("click", function () { OL.signOut(App); });
      who.appendChild(outBtn);
      box.body.appendChild(who);

      var syncBtn = D.el("button.btn.primary.block.mt-3", {
        type: "button", html: D.icon("refresh") + "<span>" + D.esc(I.t("ol.syncNow")) + "</span>"
      });
      syncBtn.addEventListener("click", function () { OL.run(App); });
      box.body.appendChild(syncBtn);

      var actions = D.el("div.ol-actions");
      var calBtn = D.el("button.btn", {
        type: "button", html: D.icon("calendar") + "<span>" + D.esc(I.t("ol.chooseCalendars")) + "</span>"
      });
      calBtn.addEventListener("click", function () { OL.chooseCalendars(App); });
      actions.appendChild(calBtn);

      var ruleBtn = D.el("button.btn", {
        type: "button", html: D.icon("filter") + "<span>" + D.esc(I.t("ol.editRules")) + "</span>"
      });
      ruleBtn.addEventListener("click", function () { OL.editRules(App); });
      actions.appendChild(ruleBtn);
      box.body.appendChild(actions);

      box.body.appendChild(D.el("div.ol-last", {
        text: I.t("ol.lastSync") + ": " + (s.lastSyncAt
          ? I.formatDate(s.lastSyncAt.slice(0, 10), { day: "2-digit", month: "2-digit", year: "numeric" }) +
            " " + s.lastSyncAt.slice(11, 16)
          : I.t("ol.never"))
      }));

      /* ---- Verhalten --------------------------------------------------- */
      box.body.appendChild(rowSwitch(I.t("ol.autoSync"), I.t("ol.autoSyncHint"), s.autoSync !== false, function (on) {
        OL.saveSettings(App, { autoSync: on });
      }));
      box.body.appendChild(rowSwitch(I.t("ol.importHomeOffice"), I.t("ol.importHomeOfficeHint2", { status: OL.showAsLabel("workingElsewhere") }), s.importHomeOffice !== false, function (on) {
        OL.saveSettings(App, { importHomeOffice: on });
      }));
      box.body.appendChild(rowSwitch(I.t("ol.copySubject"), "", s.copySubjectToNote !== false, function (on) {
        OL.saveSettings(App, { copySubjectToNote: on });
      }));
      box.body.appendChild(rowSwitch(I.t("ol.ignorePrivate"), "", s.ignorePrivate !== false, function (on) {
        OL.saveSettings(App, { ignorePrivate: on });
      }));
      box.body.appendChild(rowNumber(I.t("ol.pastDays"), "", {
        min: 0, max: 3650, step: 1, suffix: I.t("common.days"),
        read: function () { return OL.settingsOf(App).pastDays; },
        write: function (v) { OL.saveSettings(App, { pastDays: v }); }
      }));
      box.body.appendChild(rowNumber(I.t("ol.futureDays"), "", {
        min: 0, max: 3650, step: 1, suffix: I.t("common.days"),
        read: function () { return OL.settingsOf(App).futureDays; },
        write: function (v) { OL.saveSettings(App, { futureDays: v }); }
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
      var uriId = "ol-uri-" + (++uid);
      uriField.appendChild(D.el("label", { text: I.t("ol.redirectUri"), "for": uriId }));
      var uriRow = D.el("div.link-row");
      var uriInput = D.el("input.input.mono", { type: "text", id: uriId, value: st.redirectUri || "", readonly: true });
      uriInput.addEventListener("focus", function () { uriInput.select(); });
      var copyBtn = D.el("button.btn.icon", {
        type: "button", "aria-label": I.t("common.copy"), "data-tip": I.t("common.copy"), html: D.icon("copy")
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
      var idId = "ol-id-" + (++uid);
      idField.appendChild(D.el("label", { text: I.t("ol.clientId"), "for": idId }));
      var idInput = D.el("input.input.mono.small-text", {
        type: "text", id: idId, value: s.clientId || "", autocomplete: "off", spellcheck: "false",
        placeholder: "00000000-0000-0000-0000-000000000000"
      });
      idInput.addEventListener("change", function () {
        OL.saveSettings(App, { clientId: idInput.value.trim() });
        App.renderView();
      });
      idField.appendChild(idInput);
      idField.appendChild(D.el("div.hint", { text: I.t("ol.clientIdHint") }));
      box.body.appendChild(idField);

      var tenantField = D.el("div.field.mb-4");
      var tenantId = "ol-tenant-" + (++uid);
      tenantField.appendChild(D.el("label", { text: I.t("ol.tenant"), "for": tenantId }));
      var tenantInput = D.el("input.input.mono.small-text", {
        type: "text", id: tenantId, value: s.tenant || "common", placeholder: "common", autocomplete: "off", spellcheck: "false"
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

    box.body.appendChild(D.el("p.card-foot", { text: I.t("ol.privacy") }));

    return box;
  }

  /* ==================================================================== */
  /* Bausteine                                                             */
  /* ==================================================================== */

  function renderSafety(host, App) {
    D.clear(host);
    var info = App.storageInfo || {};

    /* Dauerhafter Speicher */
    var persist = D.el("div.safety-row" + (info.persisted ? ".ok" : ""));
    persist.appendChild(D.el("span.safety-ic", { html: D.icon(info.persisted ? "shield" : "alert") }));
    persist.appendChild(D.el("span.safety-text", { text: info.persisted ? I.t("set.persistOn") : I.t("set.persistOff") }));
    if (!info.persisted && info.supported !== false && navigator.storage && navigator.storage.persist) {
      var protect = D.el("button.btn.sm", { type: "button", text: I.t("set.persistBtn") });
      protect.addEventListener("click", function () {
        App.requestPersistence(true).then(function (ok) {
          if (!ok) D.toast(I.t("set.persistDenied"), { tone: "warn", duration: 7000 });
          renderSafety(host, App);
        });
      });
      persist.appendChild(protect);
    }
    host.appendChild(persist);

    /* Automatische Sicherungen */
    [["", I.t("set.autoBackup")], ["prev", I.t("set.prevBackup")]].forEach(function (pair) {
      var backup = App.store.readBackup(pair[0]);
      if (!backup && pair[0] === "prev") return;
      var row = D.el("div.safety-row");
      row.appendChild(D.el("span.safety-ic", { html: D.icon("save") }));
      var label = backup
        ? I.tn("set.autoBackupAt", backup.days, { date: I.formatDate(String(backup.at).slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) + " " + String(new Date(backup.at).toTimeString()).slice(0, 5) })
        : I.t("set.autoBackupNone");
      row.appendChild(D.el("span.safety-text", { html: "<b>" + D.esc(pair[1]) + "</b><small>" + D.esc(label) + "</small>" }));
      if (backup) {
        var btn = D.el("button.btn.sm", { type: "button", text: I.t("set.restore") });
        btn.addEventListener("click", function () {
          D.confirmDialog({
            title: I.t("set.restore"),
            message: I.t("set.restoreConfirm", { date: I.formatDate(String(backup.at).slice(0, 10), { day: "numeric", month: "long", year: "numeric" }), n: backup.days }),
            okLabel: I.t("set.restore"),
            cancelLabel: I.t("common.cancel")
          }).then(function (ok) { if (ok) App.restoreBackup(pair[0]); });
        });
        row.appendChild(btn);
      }
      host.appendChild(row);
    });

    /* iPhone/iPad im Browser: Safari räumt nach sieben Tagen ohne Besuch */
    if (isIOS() && !App.isStandalone()) {
      host.appendChild(D.el("p.safety-hint", { text: I.t("set.iosHint") }));
    }

    if (App.refreshStorageInfo && !host.dataset.refreshed) {
      host.dataset.refreshed = "1";
      App.refreshStorageInfo().then(function (next) {
        if (next.persisted !== info.persisted && host.isConnected) renderSafety(host, App);
      });
    }
  }

  function isIOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  /** Passende Installationsanleitung für das Gerät. */
  function installHowto() {
    if (isIOS()) return { title: "set.installIosTitle", text: "set.installIos" };
    var touch = root.matchMedia && root.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (/Android/i.test(navigator.userAgent || "") || touch) return { title: "set.installAndroidTitle", text: "set.installAndroid" };
    return { title: "set.installDesktopTitle", text: "set.installDesktop" };
  }

  function readSignedDuration(raw) {
    var s = String(raw || "").trim().replace("−", "-").replace("±", "");
    if (!s) return null;
    var neg = s.indexOf("-") === 0;
    var mins = T.parseDuration(s.replace(/^[+\-]/, ""));
    if (mins === null) return null;
    return neg ? -Math.abs(mins) : Math.abs(mins);
  }

  function lunchProblem(a, b) {
    if (!a && !b) return null;
    if (!a || !b) return "pair";
    var s = T.parseHHMM(a), e = T.parseHHMM(b);
    if (s === null || e === null) return "pair";
    var len = T.intervalMinutes(s, e, s);
    return len > 0 && len <= 180 ? null : "order";
  }

  /** Kurzes Aufleuchten: „das habe ich so nicht übernommen“. */
  function flash(node) {
    node.classList.remove("flash");
    void node.offsetWidth;
    node.classList.add("flash");
    setTimeout(function () { node.classList.remove("flash"); }, 1400);
  }

  function section(title) {
    var node = D.el("section.card.set-card");
    node.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(title) + "</h2>" }));
    var body = D.el("div.set-body");
    node.appendChild(body);
    return { node: node, body: body };
  }

  /**
   * Eine Einstellungszeile. kind:
   *   switch — Schalter bleibt immer rechts neben dem Text
   *   choice — Auswahl/Segmente; in schmalen Karten unter dem Text in voller Breite
   *   value  — Zahl/Zeit/Datum; auf Telefonen unter dem Text in voller Breite
   */
  function baseRow(title, hint, kind) {
    var id = "set-l-" + (++uid);
    var row = D.el("div.setting-row.is-" + kind);
    var info = D.el("div.info");
    info.appendChild(D.el("b", { id: id, text: title }));
    var hintEl = null;
    if (hint) {
      hintEl = D.el("span", { id: id + "-h", text: hint });
      info.appendChild(hintEl);
    }
    row.appendChild(info);
    var ctl = D.el("div.ctl");
    row.appendChild(ctl);
    return { row: row, ctl: ctl, labelId: id, hint: hintEl, hintId: hintEl ? id + "-h" : null };
  }

  function rowSwitch(title, hint, checked, onChange) {
    var b = baseRow(title, hint, "switch");
    var label = D.el("label.switch");
    var input = D.el("input", { type: "checkbox", checked: checked, "aria-labelledby": b.labelId });
    if (b.hintId) input.setAttribute("aria-describedby", b.hintId);
    input.addEventListener("change", function () { onChange(input.checked, input); });
    label.appendChild(input);
    label.appendChild(D.el("span.track"));
    b.ctl.appendChild(label);
    /* Die ganze Zeile schaltet — nicht nur der kleine Knopf */
    b.row.addEventListener("click", function (e) {
      if (e.target.closest("label, button, a, input")) return;
      input.click();
    });
    return b.row;
  }

  function rowSelect(title, hint, options, value, onChange) {
    var b = baseRow(title, hint, "choice");
    b.ctl.classList.add("has-select");
    var select = D.el("select.select", { "aria-labelledby": b.labelId });
    if (b.hintId) select.setAttribute("aria-describedby", b.hintId);
    options.forEach(function (o) {
      select.appendChild(D.el("option", { value: o[0], text: o[1], selected: String(o[0]) === String(value) }));
    });
    select.addEventListener("change", function () { onChange(select.value); });
    b.ctl.appendChild(select);
    return { row: b.row, select: select, hint: b.hint };
  }

  function rowSegmented(title, hint, options, value, onChange) {
    var b = baseRow(title, hint, "choice");
    b.ctl.classList.add("has-seg");
    var seg = D.el("div.segmented", { role: "group", "aria-labelledby": b.labelId });
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

  /**
   * Zahlenfeld. opts: { read(), write(v), min, max, step, suffix }
   * Leer oder unlesbar stellt den gespeicherten Wert wieder her; Werte
   * ausserhalb von min/max werden begrenzt — das Feld zeigt danach immer,
   * was tatsächlich gespeichert ist.
   */
  function rowNumber(title, hint, opts) {
    var b = baseRow(title, hint, "value");
    var wrap = D.el("div.input-wrap");
    var step = opts.step || 1;
    var input = D.el("input.input.mono.num", {
      type: "text",
      inputmode: opts.min < 0 ? "text" : (step < 1 ? "decimal" : "numeric"),
      autocomplete: "off",
      value: String(opts.read()),
      "aria-labelledby": b.labelId,
      title: I.t("set.range", { min: opts.min, max: opts.max })
    });
    if (b.hintId) input.setAttribute("aria-describedby", b.hintId);

    function commit(raw) {
      var r = readNumber(raw, opts);
      if (r.ok && r.value !== opts.read()) opts.write(r.value);
      input.value = String(opts.read());
      if (!r.ok || r.clamped) flash(wrap);
    }
    input.addEventListener("change", function () { commit(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      var cur = readNumber(input.value, opts);
      var base = cur.ok ? cur.value : opts.read();
      commit(base + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1));
    });
    wrap.appendChild(input);
    if (opts.suffix) wrap.appendChild(D.el("span.suffix", { text: opts.suffix, "aria-hidden": "true" }));
    b.ctl.appendChild(wrap);
    return b.row;
  }

  /** Dauer (h:mm). opts: { read(), write(v), min, max } in Minuten. */
  function rowDuration(title, hint, opts) {
    var b = baseRow(title, hint, "value");
    var input = D.el("input.input.mono.num", {
      type: "text", inputmode: "text", autocomplete: "off",
      value: T.formatDuration(opts.read(), "clock"),
      "aria-labelledby": b.labelId,
      title: I.t("set.range", { min: T.formatDuration(opts.min, "clock"), max: T.formatDuration(opts.max, "clock") })
    });
    if (b.hintId) input.setAttribute("aria-describedby", b.hintId);
    input.addEventListener("change", function () {
      var v = String(input.value).trim() ? T.parseDuration(input.value) : null;
      var fixed = v === null;
      if (!fixed) {
        var c = Math.min(opts.max, Math.max(opts.min, v));
        fixed = c !== v;
        if (c !== opts.read()) opts.write(c);
      }
      input.value = T.formatDuration(opts.read(), "clock");
      if (fixed) flash(input);
    });
    b.ctl.appendChild(input);
    return b.row;
  }
})(typeof self !== "undefined" ? self : this);
