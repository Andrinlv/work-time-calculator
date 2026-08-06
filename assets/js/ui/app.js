/* ==========================================================================
   ZEITKONTO — Anwendungskern
   --------------------------------------------------------------------------
   Hält den Zustand, verteilt ihn an die Ansichten und kümmert sich um alles,
   was nicht in eine einzelne Ansicht gehört: Navigation, Tastatur,
   Befehlspalette, Design, Erinnerungen, Installation, Serviceworker.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom;
  var T = ZK.Time;
  var R = ZK.Rules;
  var H = ZK.Holidays;
  var E = ZK.Engine;
  var I = ZK.I18n;

  var APP_VERSION = "1.0.0";

  ZK.Views = ZK.Views || {};

  var VIEW_ORDER = [
    { key: "today",        icon: "clock",        group: "time",    kbd: "1" },
    { key: "calendar",     icon: "calendarDays", group: "time",    kbd: "2" },
    { key: "week",         icon: "week",         group: "time",    kbd: "3" },
    { key: "stats",        icon: "chart",        group: "insight", kbd: "4" },
    { key: "reports",      icon: "report",       group: "insight", kbd: "5" },
    { key: "achievements", icon: "trophy",       group: "insight", kbd: "6" },
    { key: "settings",     icon: "settings",     group: "system",  kbd: "," }
  ];

  var store = ZK.Store.createStore({ defaultSettings: R.defaultSettings });

  var App = {
    version: APP_VERSION,
    store: store,
    view: "today",
    date: T.todayISO(),
    calendarMonth: T.monthKey(T.todayISO()),
    weekAnchor: T.todayISO(),
    tickers: [],
    deferredInstall: null,
    booted: false
  };

  /* ================================================================== */
  /* Zugriffshelfer für die Ansichten                                    */
  /* ================================================================== */

  App.settings = function () { return store.getSettings(); };
  App.t = function (key, vars) { return I.t(key, vars); };

  App.record = function (iso) { return store.getDayOrEmpty(iso); };
  App.hasRecord = function (iso) { return !!store.getDay(iso); };

  App.holiday = function (iso) {
    var s = App.settings();
    return s.autoHolidays === false ? null : H.lookup(iso, s.holidayRegion);
  };

  App.day = function (iso) {
    var prev = store.getDay(T.addDays(iso, -1));
    var prevRes = prev ? E.computeDay(prev, { settings: App.settings() }) : null;
    return E.computeDay(store.getDayOrEmpty(iso), {
      settings: App.settings(),
      holiday: App.holiday(iso),
      prevEndTl: prevRes && prevRes.complete ? prevRes.endTl : null,
      isToday: iso === T.todayISO()
    });
  };

  App.range = function (from, to) {
    return E.computeRange(from, to, function (iso) { return store.getDay(iso); }, App.settings());
  };

  App.accountBalance = function (upto) {
    return E.accountBalance(store.allDays(), App.settings(), upto);
  };

  App.saveDay = function (iso, patch, opts) {
    store.setDay(iso, patch, opts);
    App.afterChange();
  };

  App.clearDay = function (iso) {
    store.deleteDay(iso);
    App.afterChange();
  };

  App.afterChange = function () {
    App.renderChrome();
    App.renderView();
    App.scheduleReminder();
    scheduleAchievementCheck();
  };

  /**
   * Speichern ohne die Ansicht neu zu zeichnen — nötig, solange der Cursor
   * in einem Eingabefeld steht. Die Kopfzeile folgt verzögert nach.
   */
  var chromeSoon = null;
  App.saveDayQuiet = function (iso, patch) {
    store.setDay(iso, patch);
    clearTimeout(chromeSoon);
    chromeSoon = setTimeout(function () {
      App.renderChrome();
      App.scheduleReminder();
      scheduleAchievementCheck();
    }, 400);
  };

  /* ---- Formatierung ------------------------------------------------- */
  App.fmt = function (minutes) {
    return T.formatDuration(minutes, App.settings().durationStyle || "hm", { comma: I.getLang() !== "en" });
  };
  App.fmtSigned = function (minutes) {
    var style = App.settings().durationStyle;
    return T.formatSigned(minutes, style === "decimal" ? "decimal" : "clock");
  };
  App.typeLabel = function (key) { return I.t("type." + key); };
  App.locLabel = function (key) { return I.t("loc." + key); };

  App.toneOf = function (minutes) {
    if (minutes > 0) return "plus";
    if (minutes < 0) return "minus";
    return "";
  };

  /* ================================================================== */
  /* Navigation                                                          */
  /* ================================================================== */

  App.go = function (view, opts) {
    if (!ZK.Views[view]) view = "today";
    var changed = App.view !== view;
    App.view = view;
    if (opts && opts.date) App.date = opts.date;
    writeHash();
    closeNav();
    App.renderChrome();
    App.renderView();
    if (changed) {
      var main = D.qs(".main");
      if (main) main.scrollTop = 0;
    }
  };

  App.setDate = function (iso, opts) {
    if (!T.isValidISO(iso)) return;
    App.date = iso;
    App.calendarMonth = T.monthKey(iso);
    App.weekAnchor = iso;
    writeHash();
    if (opts && opts.view) App.go(opts.view);
    else { App.renderChrome(); App.renderView(); }
  };

  App.shiftDate = function (delta) { App.setDate(T.addDays(App.date, delta)); };

  function writeHash() {
    var next = "#/" + App.view + "/" + App.date;
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function readHash() {
    var m = /^#\/([a-z]+)(?:\/(\d{4}-\d{2}-\d{2}))?/.exec(location.hash || "");
    if (!m) return;
    if (ZK.Views[m[1]]) App.view = m[1];
    if (m[2] && T.isValidISO(m[2])) {
      App.date = m[2];
      App.calendarMonth = T.monthKey(m[2]);
      App.weekAnchor = m[2];
    }
  }

  /* ================================================================== */
  /* Design & Sprache                                                    */
  /* ================================================================== */

  var mediaDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  App.applyTheme = function () {
    var pref = App.settings().theme || "auto";
    var effective = pref === "auto" ? (mediaDark && mediaDark.matches ? "dark" : "light") : pref;
    document.documentElement.setAttribute("data-theme", effective);
    var meta = D.qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective === "dark" ? "#171512" : "#F4F2EF");
    App.effectiveTheme = effective;
  };

  App.toggleTheme = function () {
    var next = App.effectiveTheme === "dark" ? "light" : "dark";
    store.updateSettings({ theme: next });
    App.applyTheme();
    App.renderChrome();
    App.renderView();
  };

  App.applyDensity = function () {
    var s = App.settings();
    document.documentElement.setAttribute("data-density", s.density || "normal");
    document.documentElement.setAttribute("data-contrast", s.contrast || "normal");
  };

  App.applyLanguage = function (lang) {
    I.setLang(lang || App.settings().lang || "de");
    document.documentElement.lang = I.getLang();
    document.title = I.t("app.name") + " · " + I.t("app.tagline");
  };

  /* ================================================================== */
  /* Kopfzeile & Navigation zeichnen                                     */
  /* ================================================================== */

  App.renderChrome = function () {
    renderNav();
    renderHeader();
  };

  function renderNav() {
    var nav = D.qs("#nav");
    var tabbar = D.qs("#tabbar");
    if (!nav) return;
    D.clear(nav);

    var groups = [
      { key: "time", label: I.t("nav.section.time") },
      { key: "insight", label: I.t("nav.section.insight") },
      { key: "system", label: I.t("nav.section.system") }
    ];

    groups.forEach(function (g) {
      nav.appendChild(D.el("div.nav-group-label", { text: g.label }));
      VIEW_ORDER.filter(function (v) { return v.group === g.key; }).forEach(function (v) {
        var btn = D.el("button.nav-item", {
          type: "button",
          "aria-current": App.view === v.key ? "page" : null,
          html: D.icon(v.icon) + "<span>" + D.esc(I.t("nav." + v.key)) + "</span>" +
            '<kbd>' + D.esc(v.kbd) + "</kbd>"
        });
        btn.addEventListener("click", function () { App.go(v.key); });
        nav.appendChild(btn);
      });
    });

    var diag = store.diagnostics();
    nav.appendChild(D.el("div.nav-foot", {
      html: "<b>" + D.esc(I.t("app.name")) + "</b> " + APP_VERSION + "<br>" +
        D.esc(diag.days) + " " + D.esc(I.t("common.days")) + " · " +
        (diag.volatile ? "⚠ nur im Speicher" : Math.round(diag.bytes / 1024) + " KB") +
        "<br><span style='opacity:.8'>" + D.esc(I.t("set.dataHint").split(".")[0]) + ".</span>"
    }));

    if (tabbar) {
      D.clear(tabbar);
      ["today", "calendar", "week", "stats", "settings"].forEach(function (key) {
        var v = VIEW_ORDER.filter(function (x) { return x.key === key; })[0];
        var btn = D.el("button.tab", {
          type: "button",
          "aria-current": App.view === key ? "page" : null,
          html: D.icon(v.icon) + "<span>" + D.esc(I.t("nav." + key)) + "</span>"
        });
        btn.addEventListener("click", function () { App.go(key); });
        tabbar.appendChild(btn);
      });
    }
  }

  function renderHeader() {
    var header = D.qs("#header");
    if (!header) return;
    D.clear(header);

    // Menü (nur mobil sichtbar)
    var menuBtn = D.el("button.btn.ghost.icon.only-mobile", {
      type: "button", "aria-label": I.t("nav.menu"), html: D.icon("menu")
    });
    menuBtn.addEventListener("click", openNav);
    header.appendChild(menuBtn);

    var title = D.el("div.header-title", {
      html: '<span class="s">' + D.esc(I.t("nav." + App.view)) + "</span>" +
        '<span class="h">' + D.esc(headerHeadline()) + "</span>"
    });
    header.appendChild(title);
    header.appendChild(D.el("div.spacer"));

    // Uhr
    var clock = D.el("span.clock-pill.mono#liveClock", { "aria-label": I.t("common.now") });
    header.appendChild(clock);

    // Saldo
    var bal = App.accountBalance();
    var pill = D.el("button.saldo-pill" + (bal.minutes ? "." + App.toneOf(bal.minutes) : ""), {
      type: "button",
      "data-tip": I.t("set.account"),
      html: '<span class="lbl">' + D.esc(I.t("day.balance").split(" ")[0]) + "</span>" +
        '<span class="val mono">' + D.esc(App.fmtSigned(bal.minutes)) + "</span>"
    });
    pill.addEventListener("click", function () { App.go("stats"); });
    header.appendChild(pill);

    // Aktionen
    var search = D.el("button.btn.ghost.icon", {
      type: "button", "aria-label": I.t("cmd.placeholder"),
      "data-tip": I.t("kbd.palette") + " · Ctrl+K", html: D.icon("search")
    });
    search.addEventListener("click", openPalette);
    header.appendChild(search);

    var themeBtn = D.el("button.btn.ghost.icon", {
      type: "button", "aria-label": I.t("set.theme"),
      "data-tip": I.t("kbd.theme"),
      html: D.icon(App.effectiveTheme === "dark" ? "sun" : "moon")
    });
    themeBtn.addEventListener("click", App.toggleTheme);
    header.appendChild(themeBtn);

    startClock();
  }

  function headerHeadline() {
    if (App.view === "today") {
      return I.formatDate(App.date, { weekday: "long", day: "numeric", month: "long" });
    }
    if (App.view === "calendar") {
      var d = T.fromISO(App.calendarMonth + "-01");
      return d ? I.monthName(d.getMonth()) + " " + d.getFullYear() : "";
    }
    if (App.view === "week") {
      return I.t("week.kw", { n: T.isoWeek(App.weekAnchor) }) + " · " + T.isoWeekYear(App.weekAnchor);
    }
    return I.t(App.view === "settings" ? "set.title" : App.view === "stats" ? "stats.title" :
      App.view === "reports" ? "report.title" : "ach.title");
  }

  function openNav() {
    var nav = D.qs("#nav");
    if (!nav) return;
    nav.classList.add("open");
    var scrim = D.el("div.nav-scrim");
    scrim.addEventListener("click", closeNav);
    document.body.appendChild(scrim);
  }

  function closeNav() {
    var nav = D.qs("#nav");
    if (nav) nav.classList.remove("open");
    var scrim = D.qs(".nav-scrim");
    if (scrim && scrim.parentNode) scrim.parentNode.removeChild(scrim);
  }

  /* ---- Uhr ---------------------------------------------------------- */
  var clockTimer = null;

  function startClock() {
    // Die Kopfzeile wird neu aufgebaut, also immer sofort einmal setzen —
    // sonst bleibt die Uhr bis zum nächsten Sekundentakt leer.
    if (!clockTimer) clockTimer = setInterval(tick, 1000);
    tick();
  }

  function tick() {
    var node = D.qs("#liveClock");
    if (node) {
      var now = new Date();
      var text = T.pad2(now.getHours()) + ":" + T.pad2(now.getMinutes());
      node.innerHTML = App.settings().showSeconds === false
        ? D.esc(text)
        : D.esc(text) + '<span class="sec">:' + T.pad2(now.getSeconds()) + "</span>";
    }
    App.tickers.forEach(function (fn) { try { fn(); } catch (e) { /* Ticker isolieren */ } });
  }

  App.onTick = function (fn) {
    App.tickers.push(fn);
    return function () {
      var i = App.tickers.indexOf(fn);
      if (i >= 0) App.tickers.splice(i, 1);
    };
  };

  App.clearTickers = function () { App.tickers.length = 0; };

  /* ================================================================== */
  /* Ansicht zeichnen                                                    */
  /* ================================================================== */

  App.renderView = function () {
    var host = D.qs("#viewHost");
    if (!host) return;
    App.clearTickers();
    ZK.Charts.hideTip();
    D.clear(host);
    var view = ZK.Views[App.view] || ZK.Views.today;
    var node = D.el("div.view.anim-rise");
    host.appendChild(node);
    try {
      view.render(node, App);
    } catch (err) {
      node.innerHTML = '<div class="notice minus">' + D.icon("alert") +
        "<div><strong>Diese Ansicht konnte nicht gezeichnet werden.</strong>" +
        "<div class='sub'>" + D.esc(err && err.message ? err.message : String(err)) + "</div></div></div>";
      if (root.console) console.error(err);
    }
  };

  /* ================================================================== */
  /* Befehlspalette                                                      */
  /* ================================================================== */

  var paletteOpen = false;

  function buildCommands() {
    var cmds = [];
    VIEW_ORDER.forEach(function (v) {
      cmds.push({
        group: I.t("cmd.group.nav"),
        icon: v.icon,
        label: I.t("nav." + v.key),
        kbd: v.kbd,
        run: function () { App.go(v.key); }
      });
    });

    var actions = [
      { icon: "clock", label: I.t("common.today"), sub: I.formatDate(T.todayISO()), run: function () { App.setDate(T.todayISO(), { view: "today" }); } },
      { icon: "play", label: I.t("day.stampIn"), run: function () { App.stamp("in"); } },
      { icon: "stop", label: I.t("day.stampOut"), run: function () { App.stamp("out"); } },
      { icon: "coffee", label: I.t("day.startBreak"), run: function () { App.stamp("break"); } },
      { icon: "copy", label: I.t("day.copyPrevious"), run: function () { App.copyPreviousDay(); } },
      { icon: "trash", label: I.t("day.clearDay"), run: function () { App.confirmClearDay(); } },
      { icon: App.effectiveTheme === "dark" ? "sun" : "moon", label: I.t("set.theme"), kbd: "T", run: App.toggleTheme },
      { icon: "download", label: I.t("set.exportAll"), run: function () { App.exportJSON(); } },
      { icon: "printer", label: I.t("report.printNow"), run: function () { App.go("reports"); setTimeout(function () { window.print(); }, 350); } },
      { icon: "keyboard", label: I.t("kbd.title"), kbd: "?", run: showShortcuts },
      { icon: "refresh", label: I.t("common.undo"), kbd: "Ctrl+Z", run: function () { App.undo(); } }
    ];
    actions.forEach(function (a) { a.group = I.t("cmd.group.actions"); cmds.push(a); });

    return cmds;
  }

  function openPalette() {
    if (paletteOpen) return;
    paletteOpen = true;

    var scrim = D.el("div.palette-scrim");
    var box = D.el("div.palette", { role: "dialog", "aria-modal": "true", "aria-label": I.t("cmd.placeholder") });
    var inputWrap = D.el("div.palette-input", { html: D.icon("search") });
    var input = D.el("input", { type: "text", placeholder: I.t("cmd.placeholder"), "aria-label": I.t("common.search") });
    inputWrap.appendChild(input);
    var list = D.el("div.palette-list", { role: "listbox" });
    box.appendChild(inputWrap);
    box.appendChild(list);
    scrim.appendChild(box);
    document.body.appendChild(scrim);

    var all = buildCommands();
    var filtered = all;
    var index = 0;

    function dateCommands(query) {
      var out = [];
      var iso = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(query) && T.isValidISO(query)) iso = query;
      else {
        var m = /^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?$/.exec(query.trim());
        if (m) {
          var year = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
          var candidate = year + "-" + T.pad2(+m[2]) + "-" + T.pad2(+m[1]);
          if (T.isValidISO(candidate)) iso = candidate;
        }
      }
      if (iso) {
        out.push({
          group: I.t("cmd.group.jump"), icon: "calendar",
          label: I.t("cmd.jumpTo", { date: I.formatDate(iso) }),
          run: function () { App.setDate(iso, { view: "today" }); }
        });
      }
      return out;
    }

    function score(cmd, q) {
      var label = cmd.label.toLowerCase();
      if (label.indexOf(q) === 0) return 0;
      if (label.indexOf(q) > 0) return 1;
      // lockere Zeichenfolge-Suche
      var pos = 0;
      for (var i = 0; i < q.length; i++) {
        pos = label.indexOf(q[i], pos);
        if (pos < 0) return null;
        pos++;
      }
      return 2;
    }

    function draw() {
      D.clear(list);
      if (!filtered.length) {
        list.appendChild(D.el("div.palette-empty", { text: I.t("cmd.noResults") }));
        return;
      }
      var lastGroup = null;
      filtered.forEach(function (cmd, i) {
        if (cmd.group !== lastGroup) {
          list.appendChild(D.el("div.palette-group", { text: cmd.group }));
          lastGroup = cmd.group;
        }
        var btn = D.el("button.palette-item", {
          type: "button", role: "option",
          "aria-selected": i === index ? "true" : "false",
          html: D.icon(cmd.icon || "right") +
            "<span>" + D.esc(cmd.label) +
            (cmd.sub ? '<span class="sub"> · ' + D.esc(cmd.sub) + "</span>" : "") + "</span>" +
            (cmd.kbd ? "<kbd>" + D.esc(cmd.kbd) + "</kbd>" : "")
        });
        btn.addEventListener("click", function () { close(); cmd.run(); });
        btn.addEventListener("mousemove", function () {
          if (index === i) return;
          index = i;
          D.qsa(".palette-item", list).forEach(function (n, k) { n.setAttribute("aria-selected", k === i ? "true" : "false"); });
        });
        list.appendChild(btn);
      });
    }

    function filter() {
      var q = input.value.trim().toLowerCase();
      if (!q) { filtered = all; index = 0; draw(); return; }
      var dates = dateCommands(input.value);
      var scored = all.map(function (c) { return { c: c, s: score(c, q) }; })
        .filter(function (x) { return x.s !== null; })
        .sort(function (a, b) { return a.s - b.s; })
        .map(function (x) { return x.c; });
      filtered = dates.concat(scored);
      index = 0;
      draw();
    }

    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); index = Math.min(filtered.length - 1, index + 1); draw(); scrollToActive(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); index = Math.max(0, index - 1); draw(); scrollToActive(); }
      else if (e.key === "Enter") { e.preventDefault(); if (filtered[index]) { var cmd = filtered[index]; close(); cmd.run(); } }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });

    function scrollToActive() {
      var active = list.querySelector('[aria-selected="true"]');
      if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }

    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) close(); });

    function close() {
      paletteOpen = false;
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
    }

    draw();
    setTimeout(function () { input.focus(); }, 30);
  }

  App.openPalette = openPalette;

  /* ================================================================== */
  /* Stempeluhr — von überall aufrufbar                                  */
  /* ================================================================== */

  App.stamp = function (kind) {
    var iso = T.todayISO();
    if (App.date !== iso) App.setDate(iso);
    var rec = store.getDayOrEmpty(iso);
    var nowStr = T.formatHHMM(T.nowMinutes());

    if (kind === "in") {
      if (rec.start) { D.toast(App.t("day.clockIn") + ": " + rec.start, { tone: "warn" }); return; }
      App.saveDay(iso, { start: nowStr });
      D.toast(I.t("toast.stampedIn", { time: nowStr }), { icon: "play" });
      return;
    }

    if (kind === "out") {
      if (!rec.start) { App.stamp("in"); return; }
      App.saveDay(iso, { end: nowStr });
      var res = App.day(iso);
      D.toast(I.t("toast.stampedOut", { time: nowStr }), {
        icon: "stop",
        sub: I.t("day.net") + " " + App.fmt(res.net) + " · " + I.t("day.balance") + " " + App.fmtSigned(res.balance),
        tone: res.balance >= 0 ? "plus" : undefined
      });
      return;
    }

    if (kind === "break") {
      var breaks = (rec.breaks || []).slice();
      var open = null;
      for (var i = 0; i < breaks.length; i++) {
        if (breaks[i].start && !breaks[i].end) { open = i; break; }
      }
      if (open !== null) {
        breaks[open] = Object.assign({}, breaks[open], { end: nowStr });
        App.saveDay(iso, { breaks: breaks });
        var mins = T.intervalMinutes(T.parseHHMM(breaks[open].start), T.parseHHMM(nowStr), T.parseHHMM(rec.start || breaks[open].start));
        D.toast(I.t("toast.breakEnded", { v: App.fmt(mins) }), { icon: "coffee" });
      } else {
        if (!rec.start) App.stamp("in");
        breaks.push({ id: "b" + Date.now(), label: I.t("day.break"), start: nowStr, end: "", paid: false });
        App.saveDay(iso, { breaks: breaks });
        D.toast(I.t("toast.breakStarted"), { icon: "coffee", tone: "warn" });
      }
    }
  };

  App.copyPreviousDay = function () {
    var iso = App.date;
    var cursor = iso;
    for (var i = 0; i < 14; i++) {
      cursor = T.addDays(cursor, -1);
      var prev = store.getDay(cursor);
      if (prev && prev.start && prev.end) {
        App.saveDay(iso, {
          start: prev.start,
          end: prev.end,
          breaks: (prev.breaks || []).map(function (b) {
            return { id: "b" + Math.random().toString(36).slice(2, 8), label: b.label, start: b.start, end: b.end, paid: b.paid };
          }),
          location: prev.location,
          type: prev.type === "work" || !prev.type ? null : prev.type
        });
        D.toast(I.t("toast.copied"), { sub: I.formatDate(cursor) });
        return;
      }
    }
    D.toast(I.t("common.empty"), { tone: "warn" });
  };

  App.confirmClearDay = function () {
    D.confirmDialog({
      title: I.t("day.clearDay"),
      message: I.formatDate(App.date),
      okLabel: I.t("common.delete"),
      cancelLabel: I.t("common.cancel"),
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      App.clearDay(App.date);
      D.toast(I.t("toast.dayCleared"), {
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
    });
  };

  App.undo = function () {
    if (!store.canUndo()) return;
    store.undo();
    App.applyTheme();
    App.applyDensity();
    App.applyLanguage();
    App.afterChange();
    D.toast(I.t("toast.undone"));
  };

  App.redo = function () {
    if (!store.canRedo()) return;
    store.redo();
    App.afterChange();
    D.toast(I.t("toast.redone"));
  };

  /* ================================================================== */
  /* Export                                                              */
  /* ================================================================== */

  App.exportJSON = function () {
    var data = store.exportState();
    D.download("zeitkonto-" + T.todayISO() + ".json", JSON.stringify(data, null, 2), "application/json");
    markExport();
    D.toast(I.t("toast.exported"), { sub: "JSON" });
  };

  function markExport() {
    var a = store.getAchievements();
    a.exports = (a.exports || 0) + 1;
    store.saveAchievements(a);
    scheduleAchievementCheck();
  }
  App.markExport = markExport;

  /* ================================================================== */
  /* Erfolge                                                             */
  /* ================================================================== */

  var achTimer = null;

  function scheduleAchievementCheck() {
    clearTimeout(achTimer);
    achTimer = setTimeout(App.checkAchievements, 500);
  }

  App.buildAchievements = function () {
    var stats = ZK.Achievements.buildStats(store.allDays(), App.settings());
    var saved = store.getAchievements();
    return ZK.Achievements.evaluate(stats, saved.earned, { exports: saved.exports || 0 });
  };

  App.checkAchievements = function () {
    var result = App.buildAchievements();
    var saved = store.getAchievements();
    if (!result.fresh.length && saved.xp === result.xp) return result;

    saved.earned = result.earned;
    saved.xp = result.xp;
    store.saveAchievements(saved);

    result.fresh.forEach(function (b, i) {
      setTimeout(function () {
        var meta = I.badge(b.id);
        D.toast(I.t("ach.newBadge") + " " + b.emoji + " " + meta.name, {
          sub: meta.desc + " · +" + b.xp + " XP",
          tone: "plus",
          icon: "trophy",
          duration: 5200,
          action: { label: I.t("nav.achievements"), onClick: function () { App.go("achievements"); } }
        });
        if (App.settings().confetti !== false) D.confetti({ count: 70 });
      }, i * 900);
    });
    return result;
  };

  /* ================================================================== */
  /* Erinnerung an den Feierabend                                        */
  /* ================================================================== */

  var reminderTimer = null;
  var reminderFiredFor = null;

  App.scheduleReminder = function () {
    clearTimeout(reminderTimer);
    var s = App.settings();
    if (!s.reminderEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    var iso = T.todayISO();
    var res = App.day(iso);
    if (!res.running || res.recommendedLeaveTl === null) return;

    var lead = s.reminderLeadMinutes || 10;
    var fireAt = res.recommendedLeaveTl - lead;
    var nowMin = T.nowMinutesFloat();
    var deltaMin = fireAt - nowMin;
    if (deltaMin <= 0 || deltaMin > 16 * 60) return;
    if (reminderFiredFor === iso) return;

    reminderTimer = setTimeout(function () {
      reminderFiredFor = iso;
      try {
        new Notification(I.t("app.name"), {
          body: I.t("toast.goalReached") + " " + I.t("day.recommendedLeave") + " " + res.recommendedLeave,
          tag: "zeitkonto-feierabend"
        });
      } catch (e) { /* Benachrichtigung ist optional */ }
      D.toast(I.t("toast.goalReached"), { tone: "plus", icon: "bell" });
    }, deltaMin * 60 * 1000);
  };

  App.requestNotifications = function () {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported");
    return Notification.requestPermission().then(function (p) {
      App.scheduleReminder();
      return p;
    });
  };

  /* ================================================================== */
  /* Tastatur                                                            */
  /* ================================================================== */

  function isTyping(e) {
    var n = e.target;
    return n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable);
  }

  function onKeydown(e) {
    var mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); App.undo(); return; }
    if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); App.redo(); return; }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); store.flush(); D.toast(I.t("toast.saved")); return; }
    if (mod && e.key.toLowerCase() === "p") return; // Drucken dem Browser überlassen

    if (isTyping(e) || mod || e.altKey) return;

    switch (e.key) {
      case "?": e.preventDefault(); showShortcuts(); break;
      case "t": case "T": e.preventDefault(); App.toggleTheme(); break;
      case "h": case "H": e.preventDefault(); App.setDate(T.todayISO(), { view: "today" }); break;
      case "ArrowLeft": if (App.view === "today") { e.preventDefault(); App.shiftDate(-1); } break;
      case "ArrowRight": if (App.view === "today") { e.preventDefault(); App.shiftDate(1); } break;
      case " ": if (App.view === "today") { e.preventDefault(); App.stamp(App.day(T.todayISO()).running ? "out" : "in"); } break;
      case "b": case "B": e.preventDefault(); App.stamp("break"); break;
      case ",": e.preventDefault(); App.go("settings"); break;
      case "1": App.go("today"); break;
      case "2": App.go("calendar"); break;
      case "3": App.go("week"); break;
      case "4": App.go("stats"); break;
      case "5": App.go("reports"); break;
      case "6": App.go("achievements"); break;
    }
  }

  function showShortcuts() {
    var rows = [
      ["Ctrl / ⌘ + K", I.t("kbd.palette")],
      ["Space", I.t("kbd.stamp")],
      ["B", I.t("day.startBreak") + " / " + I.t("day.endBreak")],
      ["←  →", I.t("kbd.prevDay") + " / " + I.t("kbd.nextDay")],
      ["H", I.t("kbd.today")],
      ["T", I.t("kbd.theme")],
      ["1 – 6", I.t("cmd.group.nav")],
      [",", I.t("nav.settings")],
      ["Ctrl / ⌘ + Z", I.t("common.undo")],
      ["Ctrl / ⌘ + S", I.t("kbd.save")],
      ["?", I.t("kbd.help")]
    ];
    var body = D.el("div", { style: { display: "flex", flexDirection: "column", gap: "2px" } });
    rows.forEach(function (r) {
      body.appendChild(D.el("div", {
        style: { display: "flex", justifyContent: "space-between", gap: "20px", padding: "9px 0", borderBottom: "1px solid var(--line-faint)" },
        html: '<span style="font-size:13px;font-weight:650">' + D.esc(r[1]) + "</span>" +
          '<kbd style="font-family:var(--font-mono);font-size:11px;padding:3px 7px;border-radius:6px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink-2);white-space:nowrap">' +
          D.esc(r[0]) + "</kbd>"
      }));
    });
    D.modal({ title: I.t("kbd.title"), body: body, size: "slim" });
  }
  App.showShortcuts = showShortcuts;

  /* ================================================================== */
  /* Installation & Serviceworker                                        */
  /* ================================================================== */

  function setupInstall() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      App.deferredInstall = e;
      if (App.view === "settings") App.renderView();
    });
    window.addEventListener("appinstalled", function () {
      App.deferredInstall = null;
      D.toast(I.t("set.install"), { tone: "plus", sub: I.t("common.finish") });
    });
  }

  App.promptInstall = function () {
    if (!App.deferredInstall) return Promise.resolve(false);
    App.deferredInstall.prompt();
    return App.deferredInstall.userChoice.then(function (choice) {
      App.deferredInstall = null;
      return choice && choice.outcome === "accepted";
    });
  };

  App.canInstall = function () { return !!App.deferredInstall; };

  App.isStandalone = function () {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  };

  function setupServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;   // lokal geöffnete Datei braucht keinen SW
    if (root.ZK_SINGLE_FILE) return;             // die Einzeldatei trägt alles schon in sich
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      reg.addEventListener("updatefound", function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", function () {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            D.toast(I.t("toast.updateReady"), {
              icon: "refresh",
              duration: 12000,
              action: { label: I.t("toast.reload"), onClick: function () { location.reload(); } }
            });
          }
        });
      });
    }).catch(function () { /* ohne Serviceworker läuft die App trotzdem */ });
  }

  /* ================================================================== */
  /* Erstkonfiguration                                                   */
  /* ================================================================== */

  App.runOnboarding = function (force) {
    var meta = store.getMeta();
    if (meta.onboarded && !force) return;
    ZK.Onboarding.open(App, function () {
      store.updateMeta({ onboarded: true });
      App.applyTheme();
      App.applyDensity();
      App.applyLanguage();
      App.afterChange();
    });
  };

  /* ================================================================== */
  /* Start                                                               */
  /* ================================================================== */

  App.boot = function () {
    store.load();

    var s = store.getSettings();
    if (!s.lang) store.updateSettings({ lang: I.detect() });

    App.applyLanguage(store.getSettings().lang);
    App.applyTheme();
    App.applyDensity();

    readHash();

    if (mediaDark && mediaDark.addEventListener) {
      mediaDark.addEventListener("change", function () {
        if (App.settings().theme === "auto") { App.applyTheme(); App.renderChrome(); App.renderView(); }
      });
    }

    window.addEventListener("hashchange", function () {
      readHash();
      App.renderChrome();
      App.renderView();
    });

    document.addEventListener("keydown", onKeydown);

    window.addEventListener("beforeunload", function () { store.flush(); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") store.flush();
      else { App.renderChrome(); if (App.view === "today") App.renderView(); }
    });

    window.addEventListener("online", function () { D.toast(I.t("common.ok"), { tone: "plus", sub: "Online" }); });
    window.addEventListener("offline", function () { D.toast(I.t("toast.offline"), { tone: "warn" }); });

    store.subscribe(function (evt) {
      if (evt.type === "error") D.toast(I.t("toast.storageFull"), { tone: "minus", duration: 9000 });
    });

    var resizeRedraw = D.debounce(function () {
      if (["stats", "week", "reports"].indexOf(App.view) >= 0) App.renderView();
    }, 260);
    window.addEventListener("resize", resizeRedraw);

    setupInstall();
    setupServiceWorker();

    App.renderChrome();
    App.renderView();
    App.booted = true;

    var boot = D.qs("#boot");
    if (boot) {
      boot.classList.add("done");
      setTimeout(function () { if (boot.parentNode) boot.parentNode.removeChild(boot); }, 450);
    }

    setTimeout(function () {
      App.runOnboarding();
      App.checkAchievements();
      App.scheduleReminder();
      store.makeBackup();
    }, 320);
  };

  ZK.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { App.boot(); });
  } else {
    App.boot();
  }
})(typeof self !== "undefined" ? self : this);
