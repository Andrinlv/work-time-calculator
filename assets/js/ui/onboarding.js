/* ==========================================================================
   ZEITKONTO — Erstkonfiguration
   --------------------------------------------------------------------------
   Vier Fragen nach einer kurzen Begrüssung. Wer sie überspringt, bekommt
   sinnvolle Standardwerte und kann alles später in den Einstellungen ändern.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, H = ZK.Holidays, I = ZK.I18n;

  ZK.Onboarding = { open: open };

  var QUESTIONS = 4;   // Sprache, Arbeitsmodell, Feiertage, Startsaldo

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
      carryOverFrom: App.settings().carryOverFrom || T.startOfMonth(T.todayISO())
    };
    var workdays = App.settings().workdays || [1, 2, 3, 4, 5];

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

    var finished = false;
    function finish(apply) {
      if (finished) return;
      finished = true;
      if (apply) {
        App.store.updateSettings({
          lang: draft.lang,
          modelPreset: draft.modelPreset,
          weeklyTargets: draft.weeklyTargets,
          workloadPercent: draft.workloadPercent,
          holidayRegion: draft.holidayRegion,
          carryOverMinutes: draft.carryOverMinutes,
          carryOverFrom: draft.carryOverFrom
        });
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
      else if (step === 2) drawModel();
      else if (step === 3) drawRegion();
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
        "<p>" + D.esc(I.t("onb.welcomeText2", { n: QUESTIONS })) + "</p>";
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
