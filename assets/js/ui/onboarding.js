/* ==========================================================================
   ZEITKONTO — Erstkonfiguration
   --------------------------------------------------------------------------
   Fünf Fragen nach einer kurzen Begrüssung. Wer sie überspringt, bekommt
   sinnvolle Standardwerte und kann alles später in den Einstellungen ändern.
   „Wie arbeitest du?“ ist freiwillig: ohne Auswahl ändert der Schritt nichts.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, H = ZK.Holidays, I = ZK.I18n;

  ZK.Onboarding = { open: open };

  var QUESTIONS = 5;   // Sprache, Arbeitsweise, Arbeitsmodell, Feiertage, Startsaldo

  /* ArG Art. 9: 45 h für Industrie, Büro- und technisches Personal (Bell-
     Produktion wie Verwaltung), 50 h für alle übrigen Betriebe. Gesetzt wird
     der Wert nur, wenn man ihn ausdrücklich einschaltet. */
  var LEGAL_MAX_WEEKLY = 45 * 60;
  var PART_TIME = [50, 60, 70, 80, 90];
  var SHIFT_PRESETS = ["early-late", "three-shift"];

  I.add({
    de: {
      "onb.welcomeText3": "Fünf kurze Fragen, dann ist dein Zeitkonto eingerichtet. Alles bleibt auf diesem Gerät.",
      "onb.step.work": "Wie arbeitest du?",
      "onb.workHint": "Freiwillig — damit Zeitkonto passend startet. Ändern lässt sich alles später.",
      "onb.work.office": "Büro",
      "onb.work.officeSub": "Feste Zeiten, Montag bis Freitag",
      "onb.work.shift": "Schicht",
      "onb.work.shiftSub": "Früh, Spät und Nacht im Wechsel",
      "onb.work.part": "Teilzeit",
      "onb.work.partSub": "Reduziertes Pensum",
      "onb.rota": "Rhythmus",
      "onb.rotaNone": "Ohne Rhythmus",
      "onb.thisWeek": "Diese Woche arbeitest du",
      "onb.maxWeekly": "Höchstarbeitszeit 45 h pro Woche",
      "onb.maxWeeklyHint": "ArG für Industrie- und Büropersonal. Bisher eingestellt: {v}.",
      "onb.partHint": "Genau einstellen kannst du ihn im nächsten Schritt."
    },
    en: {
      "onb.welcomeText3": "Five quick questions and your time account is ready. Everything stays on this device.",
      "onb.step.work": "How do you work?",
      "onb.workHint": "Optional — so Zeitkonto starts out right. You can change everything later.",
      "onb.work.office": "Office",
      "onb.work.officeSub": "Fixed hours, Monday to Friday",
      "onb.work.shift": "Shifts",
      "onb.work.shiftSub": "Rotating early, late and night shifts",
      "onb.work.part": "Part-time",
      "onb.work.partSub": "Reduced workload",
      "onb.rota": "Rotation",
      "onb.rotaNone": "No rotation",
      "onb.thisWeek": "This week you work",
      "onb.maxWeekly": "Maximum 45 h per week",
      "onb.maxWeeklyHint": "Swiss law for industrial and office staff. Currently set: {v}.",
      "onb.partHint": "You can set it exactly in the next step."
    },
    fr: {
      "onb.welcomeText3": "Cinq questions rapides et votre compte temps est prêt. Tout reste sur cet appareil.",
      "onb.step.work": "Comment travaillez-vous ?",
      "onb.workHint": "Facultatif — pour que Zeitkonto démarre au mieux. Tout reste modifiable.",
      "onb.work.office": "Bureau",
      "onb.work.officeSub": "Horaires fixes, du lundi au vendredi",
      "onb.work.shift": "Équipes",
      "onb.work.shiftSub": "Matin, soir et nuit en alternance",
      "onb.work.part": "Temps partiel",
      "onb.work.partSub": "Taux d'activité réduit",
      "onb.rota": "Rotation",
      "onb.rotaNone": "Sans rotation",
      "onb.thisWeek": "Cette semaine, vous travaillez",
      "onb.maxWeekly": "Maximum 45 h par semaine",
      "onb.maxWeeklyHint": "LTr pour le personnel industriel et de bureau. Réglage actuel : {v}.",
      "onb.partHint": "Vous pourrez l'ajuster à l'étape suivante."
    },
    it: {
      "onb.welcomeText3": "Cinque domande rapide e il tuo conto orario è pronto. Tutto resta su questo dispositivo.",
      "onb.step.work": "Come lavori?",
      "onb.workHint": "Facoltativo — così Zeitkonto parte nel modo giusto. Puoi cambiare tutto in seguito.",
      "onb.work.office": "Ufficio",
      "onb.work.officeSub": "Orari fissi, dal lunedì al venerdì",
      "onb.work.shift": "Turni",
      "onb.work.shiftSub": "Mattina, sera e notte a rotazione",
      "onb.work.part": "Tempo parziale",
      "onb.work.partSub": "Grado d'occupazione ridotto",
      "onb.rota": "Rotazione",
      "onb.rotaNone": "Senza rotazione",
      "onb.thisWeek": "Questa settimana lavori",
      "onb.maxWeekly": "Massimo 45 h a settimana",
      "onb.maxWeeklyHint": "LL per il personale industriale e d'ufficio. Impostazione attuale: {v}.",
      "onb.partHint": "Potrai regolarlo con precisione al passo successivo."
    }
  });

  /* Beschriftungen teilt sich der Assistent mit den Einstellungen */
  function labels() {
    return (ZK.Views && ZK.Views.settings && ZK.Views.settings.labels) || null;
  }

  function open(App, onFinish) {
    var step = 0;
    var startLang = App.settings().lang || I.getLang();
    var draft = {
      lang: App.settings().lang || I.detect(),
      modelPreset: App.settings().modelPreset || "42",
      weeklyTargets: (App.settings().weeklyTargets || R.weeklyPreset(42 * 60, [1, 2, 3, 4, 5])).slice(),
      workloadPercent: App.settings().workloadPercent || 100,
      holidayRegion: App.settings().holidayRegion || "CH-LU",
      carryOverMinutes: App.settings().carryOverMinutes || 0,
      carryOverFrom: App.settings().carryOverFrom || T.startOfMonth(T.todayISO()),
      /* Arbeitsweise: nur was hier ausdrücklich gewählt wird, wird gespeichert */
      work: null,              // "office" | "shift" | "part"
      rotaPreset: null,        // Rhythmus-Vorlage (nur bei Schicht)
      rotaWeek: 0,             // welche Rhythmuswoche gerade läuft
      maxWeekly: null          // Höchstarbeitszeit, nur wenn eingeschaltet
    };
    var workdays = App.settings().workdays || [1, 2, 3, 4, 5];
    /* Erneut gestartet: die bisherige Arbeitsweise vorwählen */
    var Rota = ZK.Rota;
    if (Rota && Rota.isActive(App.settings().rota)) draft.work = "shift";
    else if (draft.workloadPercent < 100) draft.work = "part";

    /* Sprache sofort zeigen — auch in der Ansicht hinter dem Dialog */
    function previewLang(code) {
      I.setLang(code);
      document.documentElement.lang = code;
      App.renderChrome();
      App.renderView();
    }

    /* Allererster Start: die Sprache des Browsers vorschlagen und gleich
       verwenden — die gespeicherte ist dann nur der Standardwert. */
    var fresh = !App.store.getMeta().onboarded && App.store.dayCount() === 0;
    if (fresh) {
      draft.lang = I.detect();
      if (draft.lang !== I.getLang()) previewLang(draft.lang);
    }

    var body = D.el("div.onb");
    var progress = D.el("div.onb-progress");
    var steps = D.el("div.onb-steps", { "aria-hidden": "true" });
    for (var i = 0; i < QUESTIONS; i++) steps.appendChild(D.el("i"));
    var stepLabel = D.el("span.onb-count");
    progress.appendChild(steps);
    progress.appendChild(stepLabel);
    var content = D.el("div.onb-content");
    body.appendChild(progress);
    body.appendChild(content);

    var skip = D.el("button.btn.ghost.left", { type: "button" });
    var back = D.el("button.btn", { type: "button" });
    var next = D.el("button.btn.primary", { type: "button" });

    var m = D.modal({
      title: I.t("onb.welcome"),
      body: body,
      footer: [skip, back, next],
      closeOnScrim: false,
      focus: ".modal-foot .btn.primary",
      onClose: function () { finish(false); }
    });
    m.box.classList.add("onb-modal");
    var titleNode = m.box.querySelector(".modal-head h2");
    var closeNode = m.box.querySelector(".modal-head .close");

    var startWorkload = draft.workloadPercent;
    var partTouched = false;   // Pensum über die Teilzeit-Knöpfe gesetzt

    /** Was „Wie arbeitest du?“ an Einstellungen ändert — nur Ausgewähltes. */
    function workPatch() {
      var out = {};
      if (draft.maxWeekly && (draft.work === "office" || draft.work === "shift")) out.maxWeeklyMinutes = draft.maxWeekly;
      if (draft.work === "shift" && draft.rotaPreset && Rota) {
        var p = Rota.preset(draft.rotaPreset);
        var ens = Rota.ensureTemplates(App.settings().shiftTemplates || [], p.ids, R.defaultSettings().shiftTemplates);
        if (ens.added.length) out.shiftTemplates = ens.templates;
        out.rota = {
          enabled: true,
          anchor: Rota.anchorForWeek(T.todayISO(), draft.rotaWeek, 1),
          cycle: p.cycle,
          name: I.t("rota.preset." + draft.rotaPreset),
          skipHolidays: Rota.normalize(App.settings().rota).skipHolidays
        };
      }
      return out;
    }

    var finished = false;
    function finish(apply) {
      if (finished) return;
      finished = true;
      if (apply) {
        var patch = {
          lang: draft.lang,
          modelPreset: draft.modelPreset,
          weeklyTargets: draft.weeklyTargets,
          workloadPercent: draft.workloadPercent,
          holidayRegion: draft.holidayRegion,
          carryOverMinutes: draft.carryOverMinutes,
          carryOverFrom: draft.carryOverFrom
        };
        Object.assign(patch, workPatch());
        App.store.updateSettings(patch);
      } else if (draft.lang !== startLang) {
        /* Die gewählte Sprache gilt sofort — auch wer den Rest überspringt */
        App.store.updateSettings({ lang: draft.lang });
      }
      if (onFinish) onFinish(apply);
    }

    skip.addEventListener("click", function () { finish(false); m.close(); });
    back.addEventListener("click", function () { if (step > 0) { step--; draw(); } });
    next.addEventListener("click", function () {
      if (step < QUESTIONS) { step++; draw(true); return; }
      finish(true);
      m.close();
      if (App.settings().confetti !== false) D.confetti({ count: 110 });
      D.toast(I.t("onb.done"), { sub: I.t("onb.doneSub"), tone: "plus", icon: "check" });
    });

    draw();

    /* ---------------------------------------------------------------- */
    /* Jeder Schritt zeichnet den ganzen Dialog neu — nach einem
       Sprachwechsel stimmen so auch Kopf, Fusszeile und Schliessen-Knopf. */
    function draw(moved) {
      titleNode.textContent = step === 0 ? I.t("onb.welcome") : I.t("onb.setupTitle");
      if (closeNode) closeNode.setAttribute("aria-label", I.t("common.close"));
      skip.textContent = I.t("onb.skip");
      back.textContent = I.t("common.back");
      next.textContent = step === 0 ? I.t("onb.startNow") : step === QUESTIONS ? I.t("common.finish") : I.t("common.next");
      back.hidden = step === 0;

      progress.hidden = step === 0;
      D.qsa("i", steps).forEach(function (n, k) { n.classList.toggle("on", k < step); });
      stepLabel.textContent = I.t("onb.stepOf", { n: step, total: QUESTIONS });

      D.clear(content);
      if (step === 0) drawWelcome();
      else if (step === 1) drawLang();
      else if (step === 2) drawWork();
      else if (step === 3) drawModel();
      else if (step === 4) drawRegion();
      else drawCarry();
      m.body.scrollTop = 0;
      if (moved) {
        var first = content.querySelector("[aria-pressed='true'], select");
        if (first) first.focus({ preventScroll: true });
      }
    }

    function drawWelcome() {
      var hero = D.el("div.onb-hero");
      hero.innerHTML =
        '<div class="rings"><i></i><i></i><i></i><i></i></div>' +
        "<h2>" + D.esc(I.t("app.name")) + "</h2>" +
        "<p>" + D.esc(I.t("onb.welcomeText3", { n: QUESTIONS })) + "</p>";
      content.appendChild(hero);

      var points = D.el("div.onb-points");
      [
        ["clock", I.t("onb.point.leave"), I.t("onb.point.leaveSub")],
        ["swap", I.t("onb.point.account"), I.t("onb.point.accountSub")],
        ["lock", I.t("onb.point.local"), I.t("onb.point.localSub")]
      ].forEach(function (p) {
        var row = D.el("div.notice");
        row.innerHTML = D.icon(p[0]) + "<div><strong>" + D.esc(p[1]) + "</strong>" +
          "<div class='sub'>" + D.esc(p[2]) + "</div></div>";
        points.appendChild(row);
      });
      content.appendChild(points);
    }

    function drawLang() {
      content.appendChild(stepTitle(I.t("onb.step.lang"), I.t("onb.langHint")));
      var chips = D.el("div.onb-langs", { role: "group", "aria-label": I.t("onb.step.lang") });
      I.LANGS.forEach(function (code) {
        var chip = D.el("button.onb-option", {
          type: "button", lang: code, "aria-pressed": draft.lang === code ? "true" : "false",
          html: "<b>" + D.esc(I.DICT[code]["lang.name"]) + "</b>" + D.icon("check")
        });
        chip.addEventListener("click", function () {
          draft.lang = code;
          previewLang(code);
          draw();
          var again = content.querySelector("[lang='" + code + "']");
          if (again) again.focus();
        });
        chips.appendChild(chip);
      });
      content.appendChild(chips);
    }

    /* Gleicher Schritt neu zeichnen, ohne dass der Dialog nach oben springt */
    function redrawStep(key) {
      var y = m.body.scrollTop;
      draw();
      m.body.scrollTop = y;
      var again = key ? content.querySelector('[data-key="' + key + '"]') : null;
      if (again) again.focus({ preventScroll: true });
    }

    function optionButton(key, title, sub, pressed) {
      return D.el("button.onb-option", {
        type: "button", "data-key": key,
        "aria-pressed": pressed ? "true" : "false",
        html: "<span class='onb-option-text'><b>" + D.esc(title) + "</b>" +
          (sub ? "<small>" + D.esc(sub) + "</small>" : "") + "</span>" + D.icon("check")
      });
    }

    function chip(key, text, pressed, onClick) {
      var c = D.el("button.chip", { type: "button", "data-key": key, "aria-pressed": pressed ? "true" : "false", text: text });
      c.addEventListener("click", function () { onClick(); redrawStep(key); });
      return c;
    }

    /* Wie arbeitest du? Büro / Schicht / Teilzeit — freiwillig */
    function drawWork() {
      content.appendChild(stepTitle(I.t("onb.step.work"), I.t("onb.workHint")));
      var list = D.el("div.onb-options", { role: "group", "aria-label": I.t("onb.step.work") });
      ["office", "shift", "part"].forEach(function (key) {
        var btn = optionButton("onb-work-" + key, I.t("onb.work." + key), I.t("onb.work." + key + "Sub"), draft.work === key);
        btn.addEventListener("click", function () {
          // Nochmals antippen hebt die Wahl auf — der Schritt bleibt freiwillig
          draft.work = draft.work === key ? null : key;
          if (draft.work !== "part" && partTouched) { draft.workloadPercent = startWorkload; partTouched = false; }
          if (draft.work !== "shift") draft.rotaPreset = null;
          redrawStep("onb-work-" + key);
        });
        list.appendChild(btn);
      });
      content.appendChild(list);

      var more = D.el("div.onb-more");
      if (draft.work === "shift" && Rota) drawShiftOptions(more);
      if (draft.work === "part") drawPartOptions(more);
      var currentMax = App.settings().maxWeeklyMinutes || 50 * 60;
      if ((draft.work === "office" || draft.work === "shift") && currentMax > LEGAL_MAX_WEEKLY) drawMaxWeekly(more, currentMax);
      if (more.children.length) content.appendChild(more);
    }

    function drawShiftOptions(more) {
      var L = labels();
      var group = D.el("div.onb-sub");
      var gid = "onb-rota-l";
      group.appendChild(D.el("div.section-title", { id: gid, text: I.t("onb.rota") }));
      var chips = D.el("div.chipset", { role: "group", "aria-labelledby": gid });
      SHIFT_PRESETS.concat([null]).forEach(function (key) {
        chips.appendChild(chip("onb-rota-" + (key || "none"), key ? I.t("rota.preset." + key) : I.t("onb.rotaNone"), draft.rotaPreset === key, function () {
          draft.rotaPreset = key;
          var p = key ? Rota.preset(key) : null;
          if (!p || draft.rotaWeek >= p.cycle.length / 7) draft.rotaWeek = 0;
        }));
      });
      group.appendChild(chips);
      more.appendChild(group);
      if (!draft.rotaPreset) return;

      /* Wo im Rhythmus stehe ich? Die Woche wählen statt ein Datum suchen */
      var weeks = Rota.weeks(Rota.preset(draft.rotaPreset).cycle) || [];
      var defaults = R.defaultSettings().shiftTemplates;
      var wgroup = D.el("div.onb-sub");
      var wid = "onb-week-l";
      wgroup.appendChild(D.el("div.section-title", { id: wid, text: I.t("onb.thisWeek") }));
      var wchips = D.el("div.chipset", { role: "group", "aria-labelledby": wid });
      weeks.forEach(function (w) {
        var tpl = Rota.findTemplate(App.settings().shiftTemplates, w.main) || Rota.findTemplate(defaults, w.main);
        var name = tpl ? (L ? L.shiftName(tpl) : tpl.name) : I.t("rota.weekN", { n: w.index + 1 });
        wchips.appendChild(chip("onb-week-" + w.index, name, draft.rotaWeek === w.index, function () { draft.rotaWeek = w.index; }));
      });
      wgroup.appendChild(wchips);
      more.appendChild(wgroup);
    }

    function drawPartOptions(more) {
      var group = D.el("div.onb-sub");
      var gid = "onb-part-l";
      group.appendChild(D.el("div.section-title", { id: gid, text: I.t("set.workload") }));
      var chips = D.el("div.chipset", { role: "group", "aria-labelledby": gid });
      PART_TIME.forEach(function (p) {
        chips.appendChild(chip("onb-part-" + p, p + " %", draft.workloadPercent === p, function () {
          draft.workloadPercent = p;
          partTouched = true;
        }));
      });
      group.appendChild(chips);
      group.appendChild(D.el("p.onb-sub-note", { text: I.t("onb.partHint") }));
      more.appendChild(group);
    }

    /* Höchstarbeitszeit: nur auf ausdrücklichen Wunsch */
    function drawMaxWeekly(more, currentMax) {
      var row = D.el("div.setting-row.is-switch.onb-max");
      var info = D.el("div.info");
      info.appendChild(D.el("b", { id: "onb-max-l", text: I.t("onb.maxWeekly") }));
      info.appendChild(D.el("span", { id: "onb-max-h", text: I.t("onb.maxWeeklyHint", { v: T.formatDuration(currentMax, "hm") }) }));
      row.appendChild(info);
      var ctl = D.el("div.ctl");
      var label = D.el("label.switch");
      var input = D.el("input", {
        type: "checkbox", "data-key": "onb-max", checked: draft.maxWeekly === LEGAL_MAX_WEEKLY,
        "aria-labelledby": "onb-max-l", "aria-describedby": "onb-max-h"
      });
      input.addEventListener("change", function () { draft.maxWeekly = input.checked ? LEGAL_MAX_WEEKLY : null; });
      label.appendChild(input);
      label.appendChild(D.el("span.track"));
      ctl.appendChild(label);
      row.appendChild(ctl);
      row.addEventListener("click", function (e) {
        if (e.target.closest("label, button, a, input")) return;
        input.click();
      });
      more.appendChild(row);
    }

    function drawModel() {
      var L = labels();
      content.appendChild(stepTitle(I.t("onb.step.model"), I.t("onb.modelHint")));

      var list = D.el("div.onb-options", { role: "group", "aria-label": I.t("onb.step.model") });
      R.MODEL_PRESETS.filter(function (p) { return p.weekly; }).forEach(function (p) {
        var btn = D.el("button.onb-option", {
          type: "button",
          "aria-pressed": draft.modelPreset === p.key ? "true" : "false",
          html: "<span class='onb-option-text'><b>" + D.esc(L ? L.preset(p) : p.label) + "</b>" +
            "<small>" + D.esc(L ? L.presetNote(p, workdays) : p.note) + "</small></span>" + D.icon("check")
        });
        btn.addEventListener("click", function () {
          draft.modelPreset = p.key;
          draft.weeklyTargets = R.weeklyPreset(p.weekly, workdays);
          D.qsa(".onb-option", list).forEach(function (n) { n.setAttribute("aria-pressed", n === btn ? "true" : "false"); });
          preview.textContent = previewText();
        });
        list.appendChild(btn);
      });
      content.appendChild(list);

      var wl = D.el("div.field.onb-workload");
      wl.appendChild(D.el("label", { text: I.t("set.workload"), "for": "onb-workload" }));
      var wrap = D.el("div.input-wrap");
      var input = D.el("input.input.mono.num", {
        type: "text", id: "onb-workload", inputmode: "numeric", autocomplete: "off",
        value: draft.workloadPercent
      });
      /* Leer oder unlesbar ändert nichts; 1–200 % */
      input.addEventListener("input", function () {
        var v = parseInt(input.value, 10);
        if (!isNaN(v) && String(v) === input.value.trim()) {
          draft.workloadPercent = Math.max(1, Math.min(200, v));
          preview.textContent = previewText();
        }
      });
      input.addEventListener("change", function () { input.value = draft.workloadPercent; });
      wrap.appendChild(input);
      wrap.appendChild(D.el("span.suffix", { text: "%", "aria-hidden": "true" }));
      wl.appendChild(wrap);
      content.appendChild(wl);

      var preview = D.el("p.onb-preview", { text: previewText(), role: "status" });
      content.appendChild(preview);

      function previewText() {
        var weekly = draft.weeklyTargets.reduce(function (a, b) { return a + b; }, 0) * (draft.workloadPercent / 100);
        var perDay = draft.weeklyTargets[workdays[0]] * (draft.workloadPercent / 100);
        return I.t("set.weeklyTotal") + ": " + T.formatDuration(Math.round(weekly), "clock") +
          " · " + I.t("day.target") + ": " + T.formatDuration(Math.round(perDay), "clock");
      }
    }

    function drawRegion() {
      var L = labels();
      content.appendChild(stepTitle(I.t("onb.step.region"), I.t("onb.regionHint")));
      var select;
      if (L) {
        select = L.regionSelect(draft.holidayRegion);
      } else {
        select = D.el("select.select");
        H.REGIONS.forEach(function (r) {
          select.appendChild(D.el("option", { value: r.key, text: r.label, selected: r.key === draft.holidayRegion }));
        });
      }
      select.setAttribute("aria-label", I.t("set.region"));
      select.addEventListener("change", function () { draft.holidayRegion = select.value; drawPreview(); });
      content.appendChild(select);

      var previewBox = D.el("div.onb-holidays");
      content.appendChild(previewBox);
      drawPreview();

      function drawPreview() {
        D.clear(previewBox);
        var list = H.between(T.todayISO(), T.addDays(T.todayISO(), 400), draft.holidayRegion).slice(0, 6);
        if (!list.length) {
          previewBox.appendChild(D.el("p.muted", { text: I.t("onb.noHolidays") }));
          return;
        }
        previewBox.appendChild(D.el("div.section-title", { text: I.t("set.holidayPreview") }));
        list.forEach(function (h) {
          previewBox.appendChild(D.el("div.holiday-line", {
            html: "<span>" + D.esc(h.holiday.names[I.getLang()] || h.holiday.name) + "</span>" +
              "<span class='mono muted'>" + D.esc(I.formatDate(h.date, { day: "2-digit", month: "short", weekday: "short" })) + "</span>"
          }));
        });
      }
    }

    function drawCarry() {
      content.appendChild(stepTitle(I.t("onb.step.carry"), I.t("set.carryOverHint")));

      var row = D.el("div.onb-carry");
      var f1 = D.el("div.field");
      f1.appendChild(D.el("label", { text: I.t("set.carryOver"), "for": "onb-carry" }));
      var carry = D.el("input.input.mono.num", {
        type: "text", id: "onb-carry", autocomplete: "off",
        value: T.formatSigned(draft.carryOverMinutes, "clock"), placeholder: "+0:00"
      });
      carry.addEventListener("change", function () {
        var raw = carry.value.trim().replace("−", "-").replace("±", "");
        var mins = raw ? T.parseDuration(raw.replace(/^[+\-]/, "")) : null;
        if (mins !== null) draft.carryOverMinutes = raw.indexOf("-") === 0 ? -Math.abs(mins) : Math.abs(mins);
        carry.value = T.formatSigned(draft.carryOverMinutes, "clock");
      });
      f1.appendChild(carry);
      row.appendChild(f1);

      var f2 = D.el("div.field");
      f2.appendChild(D.el("label", { text: I.t("set.carryOverFrom"), "for": "onb-from" }));
      var from = D.el("input.input", { type: "date", id: "onb-from", value: draft.carryOverFrom });
      from.addEventListener("change", function () { draft.carryOverFrom = from.value || null; });
      f2.appendChild(from);
      row.appendChild(f2);
      content.appendChild(row);

      var hint = D.el("div.notice.mt-5");
      hint.innerHTML = D.icon("info") + "<div><strong>" + D.esc(I.t("onb.finishTitle")) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("onb.finishHint", { finish: I.t("common.finish") })) + "</div></div>";
      content.appendChild(hint);
      /* Tastaturtipp nur, wo es eine Tastatur gibt */
      content.appendChild(D.el("p.onb-kbd.desktop-only", { text: I.t("onb.kbdHint", { key: "Ctrl / ⌘ + K" }) }));
    }

    function stepTitle(title, hint) {
      var wrap = D.el("div.onb-title");
      wrap.appendChild(D.el("h3", { text: title }));
      if (hint) wrap.appendChild(D.el("p", { text: hint }));
      return wrap;
    }
  }
})(typeof self !== "undefined" ? self : this);
