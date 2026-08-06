/* ==========================================================================
   ZEITKONTO — Erstkonfiguration
   --------------------------------------------------------------------------
   Vier Fragen. Wer sie überspringt, bekommt sinnvolle Standardwerte und
   kann alles später in den Einstellungen ändern.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, H = ZK.Holidays, I = ZK.I18n;

  ZK.Onboarding = { open: open };

  function open(App, onFinish) {
    var step = 0;
    var draft = {
      lang: App.settings().lang || I.detect(),
      modelPreset: App.settings().modelPreset || "42",
      weeklyTargets: (App.settings().weeklyTargets || R.weeklyPreset(42 * 60, [1, 2, 3, 4, 5])).slice(),
      workloadPercent: App.settings().workloadPercent || 100,
      holidayRegion: App.settings().holidayRegion || "CH-LU",
      carryOverMinutes: App.settings().carryOverMinutes || 0,
      carryOverFrom: App.settings().carryOverFrom || T.startOfMonth(T.todayISO())
    };

    var body = D.el("div");
    var steps = D.el("div.onb-steps");
    for (var i = 0; i < 5; i++) steps.appendChild(D.el("i"));
    var content = D.el("div");
    body.appendChild(steps);
    body.appendChild(content);

    var skip = D.el("button.btn.ghost.left", { type: "button", text: I.t("onb.skip") });
    var back = D.el("button.btn", { type: "button", text: I.t("common.back") });
    var next = D.el("button.btn.primary", { type: "button", text: I.t("common.next") });

    var m = D.modal({
      title: I.t("onb.welcome"),
      body: body,
      footer: [skip, back, next],
      closeOnScrim: false,
      onClose: function () { finish(false); }
    });

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
      }
      if (onFinish) onFinish(apply);
    }

    skip.addEventListener("click", function () { finish(false); m.close(); });
    back.addEventListener("click", function () { if (step > 0) { step--; draw(); } });
    next.addEventListener("click", function () {
      if (step < 4) { step++; draw(); return; }
      finish(true);
      m.close();
      if (App.settings().confetti !== false) D.confetti({ count: 110 });
      D.toast(I.t("onb.done"), { tone: "plus", icon: "check" });
    });

    draw();

    /* ---------------------------------------------------------------- */
    function draw() {
      D.qsa("i", steps).forEach(function (n, i) { n.classList.toggle("on", i <= step); });
      back.style.visibility = step === 0 ? "hidden" : "";
      next.textContent = step === 4 ? I.t("common.finish") : I.t("common.next");
      D.clear(content);

      if (step === 0) drawWelcome();
      else if (step === 1) drawLang();
      else if (step === 2) drawModel();
      else if (step === 3) drawRegion();
      else drawCarry();
    }

    function drawWelcome() {
      var hero = D.el("div.onb-hero");
      hero.innerHTML =
        '<div class="rings"><i></i><i></i><i></i><i></i></div>' +
        "<h2>" + D.esc(I.t("app.name")) + "</h2>" +
        "<p>" + D.esc(I.t("onb.welcomeText")) + "</p>";
      content.appendChild(hero);

      var points = D.el("div.col", { style: { gap: "10px" } });
      [
        ["clock", I.t("day.recommendedLeave"), I.t("day.enterClockIn")],
        ["chart", I.t("set.account"), I.t("stats.lede")],
        ["lock", I.t("set.privacy"), I.t("set.dataHint")]
      ].forEach(function (p) {
        var row = D.el("div.notice");
        row.innerHTML = D.icon(p[0]) + "<div><strong>" + D.esc(p[1]) + "</strong>" +
          "<div class='sub'>" + D.esc(p[2]) + "</div></div>";
        points.appendChild(row);
      });
      content.appendChild(points);
    }

    function drawLang() {
      content.appendChild(stepTitle(I.t("onb.step.lang"), I.t("set.language")));
      var chips = D.el("div.chipset");
      I.LANGS.forEach(function (code) {
        var chip = D.el("button.chip", {
          type: "button", "aria-pressed": draft.lang === code ? "true" : "false",
          text: I.DICT[code]["lang.name"]
        });
        chip.addEventListener("click", function () {
          draft.lang = code;
          I.setLang(code);
          document.documentElement.lang = code;
          draw();
          m.box.querySelector("h2").textContent = I.t("onb.welcome");
        });
        chips.appendChild(chip);
      });
      content.appendChild(chips);
    }

    function drawModel() {
      content.appendChild(stepTitle(I.t("onb.step.model"), I.t("set.workloadHint")));

      var list = D.el("div.col", { style: { gap: "8px" } });
      R.MODEL_PRESETS.filter(function (p) { return p.weekly; }).forEach(function (p) {
        var btn = D.el("button.chip", {
          type: "button",
          style: { width: "100%", justifyContent: "space-between", padding: "13px 16px", borderRadius: "var(--r-sm)" },
          "aria-pressed": draft.modelPreset === p.key ? "true" : "false",
          html: "<span><b>" + D.esc(p.label) + "</b><br><span style='font-weight:600;opacity:.7;font-size:11px'>" +
            D.esc(p.note) + "</span></span>" + D.icon("check")
        });
        btn.addEventListener("click", function () {
          draft.modelPreset = p.key;
          draft.weeklyTargets = R.weeklyPreset(p.weekly, [1, 2, 3, 4, 5]);
          draw();
        });
        list.appendChild(btn);
      });
      content.appendChild(list);

      var wl = D.el("div.field.mt-4");
      wl.appendChild(D.el("label", { text: I.t("set.workload") }));
      var wrap = D.el("div.input-wrap");
      var input = D.el("input.input.mono", { type: "number", value: draft.workloadPercent, min: 1, max: 200, style: { textAlign: "right" } });
      input.addEventListener("input", function () {
        var v = parseInt(input.value, 10);
        draft.workloadPercent = isNaN(v) ? 100 : Math.max(1, Math.min(200, v));
        preview.textContent = previewText();
      });
      wrap.appendChild(input);
      wrap.appendChild(D.el("span.suffix", { text: "%" }));
      wl.appendChild(wrap);
      content.appendChild(wl);

      var preview = D.el("p.muted.mt-3", { style: { fontSize: "13px" }, text: previewText() });
      content.appendChild(preview);

      function previewText() {
        var weekly = draft.weeklyTargets.reduce(function (a, b) { return a + b; }, 0) * (draft.workloadPercent / 100);
        var perDay = draft.weeklyTargets[1] * (draft.workloadPercent / 100);
        return I.t("set.weeklyTotal") + ": " + T.formatDuration(Math.round(weekly), "clock") +
          " · " + I.t("day.target") + ": " + T.formatDuration(Math.round(perDay), "clock");
      }
    }

    function drawRegion() {
      content.appendChild(stepTitle(I.t("onb.step.region"), I.t("set.holidays")));
      var select = D.el("select.select");
      var groups = {};
      H.REGIONS.forEach(function (r) {
        if (!groups[r.group]) {
          groups[r.group] = D.el("optgroup", { label: r.group });
          select.appendChild(groups[r.group]);
        }
        groups[r.group].appendChild(D.el("option", {
          value: r.key, text: r.label, selected: r.key === draft.holidayRegion
        }));
      });
      select.addEventListener("change", function () { draft.holidayRegion = select.value; drawPreview(); });
      content.appendChild(select);

      var previewBox = D.el("div.mt-4");
      content.appendChild(previewBox);
      drawPreview();

      function drawPreview() {
        D.clear(previewBox);
        var list = H.between(T.todayISO(), T.addDays(T.todayISO(), 400), draft.holidayRegion).slice(0, 8);
        if (!list.length) {
          previewBox.appendChild(D.el("p.muted", { text: I.t("common.none"), style: { fontSize: "13px" } }));
          return;
        }
        previewBox.appendChild(D.el("div.section-title", { text: I.t("set.holidayPreview") }));
        list.forEach(function (h) {
          previewBox.appendChild(D.el("div", {
            style: { display: "flex", justifyContent: "space-between", fontSize: "12.5px", padding: "6px 0", borderBottom: "1px solid var(--line-faint)" },
            html: "<span>" + D.esc(h.holiday.names[I.getLang()] || h.holiday.name) + "</span>" +
              "<span class='mono muted'>" + D.esc(I.formatDate(h.date, { day: "2-digit", month: "short", weekday: "short" })) + "</span>"
          }));
        });
      }
    }

    function drawCarry() {
      content.appendChild(stepTitle(I.t("onb.step.carry"), I.t("set.carryOverHint")));

      var row = D.el("div.grid-2");
      var f1 = D.el("div.field");
      f1.appendChild(D.el("label", { text: I.t("set.carryOver") }));
      var carry = D.el("input.input.mono", {
        type: "text", value: T.formatSigned(draft.carryOverMinutes, "clock"),
        placeholder: "+0:00", style: { textAlign: "right" }
      });
      carry.addEventListener("change", function () {
        var raw = carry.value.trim().replace("−", "-");
        var neg = raw.indexOf("-") === 0;
        var mins = T.parseDuration(raw.replace(/^[+\-±]/, "")) || 0;
        draft.carryOverMinutes = neg ? -Math.abs(mins) : Math.abs(mins);
        carry.value = T.formatSigned(draft.carryOverMinutes, "clock");
      });
      f1.appendChild(carry);
      row.appendChild(f1);

      var f2 = D.el("div.field");
      f2.appendChild(D.el("label", { text: I.t("set.carryOverFrom") }));
      var from = D.el("input.input", { type: "date", value: draft.carryOverFrom });
      from.addEventListener("change", function () { draft.carryOverFrom = from.value || null; });
      f2.appendChild(from);
      row.appendChild(f2);
      content.appendChild(row);

      var done = D.el("div.notice.plus.mt-5");
      done.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("onb.done")) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("onb.doneText", { key: "Ctrl / ⌘ + K" })) + "</div></div>";
      content.appendChild(done);
    }

    function stepTitle(title, hint) {
      var wrap = D.el("div.mb-4");
      wrap.appendChild(D.el("h3", { text: title, style: { fontSize: "18px", letterSpacing: "-.02em" } }));
      if (hint) wrap.appendChild(D.el("p.muted", { text: hint, style: { fontSize: "13px", marginTop: "4px" } }));
      return wrap;
    }
  }
})(typeof self !== "undefined" ? self : this);
