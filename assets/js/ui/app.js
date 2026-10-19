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

  var APP_VERSION = "1.2.0";

  ZK.Views = ZK.Views || {};

  var VIEW_ORDER = [
    { key: "today",        icon: "clock",        group: "time",    kbd: "1" },
    { key: "calendar",     icon: "calendarDays", group: "time",    kbd: "2" },
    { key: "week",         icon: "week",         group: "time",    kbd: "3" },
    { key: "stats",        icon: "chart",        group: "insight", kbd: "4" },
    { key: "reports",      icon: "report",       group: "insight", kbd: "5" },
    { key: "achievements", icon: "trophy",       group: "insight", kbd: "6" },
    { key: "tools",        icon: "zap",          group: "insight", kbd: "7" },
    { key: "settings",     icon: "settings",     group: "system",  kbd: "," }
  ];

  var store = ZK.Store.createStore({ defaultSettings: R.defaultSettings });
  // Monatsabschluss: Tage eines abgeschlossenen Monats nimmt der Store nicht mehr an
  if (ZK.Closing && store.setGuard) store.setGuard(ZK.Closing.guard, { prefix: ZK.Closing.PREFIX });

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

  /** Tag, auf den Stempeltasten wirken (Nachtschicht: ggf. der Vortag). */
  App.activeStampDate = function () {
    return E.activeShiftDate(function (iso) { return store.getDay(iso); });
  };

  /** opts geht an E.computeRange — { since: Erfassungsbeginn } für die Lücken. */
  App.range = function (from, to, opts) {
    return E.computeRange(from, to, function (iso) { return store.getDay(iso); }, App.settings(), undefined, opts);
  };

  /* ---- Kontostand, je Datenstand nur einmal gerechnet ----------------
     accountBalance() geht über alle erfassten Tage; Kopfzeile, Statistik
     und Berichte fragen ihn bei jedem Zeichnen ab. Der Zwischenspeicher
     gilt, bis der Store eine Änderung meldet, der Tag wechselt oder eine
     Minute vergeht (ein laufender Tag ändert sich minütlich). */
  var dataRev = 0;
  var balanceCache = { stamp: null, values: {} };

  store.subscribe(function (evt) {
    if (evt && (evt.type === "error" || evt.type === "achievements")) return;
    dataRev++;
  });

  /** Zähler, der bei jeder Daten- oder Einstellungsänderung steigt —
      der des Stores (zählt auch Übernahmen aus anderen Fenstern) plus ein
      eigener für Laden und ältere Store-Stände ohne rev(). */
  App.dataRevision = function () {
    return (typeof store.rev === "function" ? store.rev() : 0) + "/" + dataRev;
  };

  /**
   * @param {String} [upto]  einschliesslich, Standard heute
   * @param {Object} [opts]  wird an E.accountBalance weitergereicht
   *                         (z. B. { includeRunning: true })
   * Abgeschlossene Monate zählen mit ihrem eingefrorenen Saldo (ZK.Closing).
   */
  App.accountBalance = function (upto, opts) {
    var now = new Date();
    var stamp = App.dataRevision() + "|" + T.todayISO(now) + "|" + now.getHours() + ":" + now.getMinutes();
    if (balanceCache.stamp !== stamp) balanceCache = { stamp: stamp, values: {} };
    var key = (upto || "") + "|" + (opts && opts.includeRunning ? "run" : "");
    if (!balanceCache.values[key]) {
      balanceCache.values[key] = (ZK.Closing ? ZK.Closing.accountBalance : E.accountBalance)(store.allDays(), App.settings(), upto, undefined, opts);
    }
    return Object.assign({}, balanceCache.values[key]);
  };

  /**
   * Zeitkonto für die Kopfzeile: nur abgeschlossene Tage. Ein laufender
   * Tag steht im Saldo mit „bisher gearbeitet minus volles Soll“ — beim
   * Einstempeln fiele das Konto sonst um das ganze Tagessoll. Der laufende
   * Tag kommt deshalb getrennt als `live` zurück. Gerechnet wird bis zum
   * Vortag des laufenden Tags; das stimmt mit und ohne die neuere
   * Engine-Option (laufenden Tag ausschliessen) überein.
   * → { minutes, live: Minuten | null, liveDate: ISO | null, overnight }
   */
  App.settledBalance = function () {
    var active = App.activeStampDate();
    var res = App.day(active);
    if (!res.running) return { minutes: App.accountBalance().minutes, live: null, liveDate: null, overnight: false };
    return {
      minutes: App.accountBalance(T.addDays(active, -1)).minutes,
      live: res.balance,
      liveDate: active,
      overnight: !!res.overnight
    };
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

  /* Nur eigene Einträge von ZK.Views sind Ansichten — „#/constructor“ oder
     „#/toString“ fänden sonst Object.prototype und hielten den Start an. */
  function isView(key) {
    return typeof key === "string" && Object.prototype.hasOwnProperty.call(ZK.Views, key) &&
      !!ZK.Views[key] && typeof ZK.Views[key].render === "function";
  }

  App.go = function (view, opts) {
    if (!isView(view)) view = "today";
    var fromDrawer = navIsOpen();
    App.view = view;
    if (opts && opts.date) App.date = opts.date;
    writeHash();
    closeNav();
    App.renderChrome();
    App.renderView();   // springt bei einem Ansichtswechsel selbst nach oben
    // Aus der Schublade gewählt: der Fokus gehört jetzt dem Inhalt, nicht
    // einem Knopf in der gerade zugeklappten Schublade
    if (fromDrawer) {
      var host = D.qs("#viewHost");
      if (host) { try { host.focus({ preventScroll: true }); } catch (e) { host.focus(); } }
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

  /** → true, wenn die Adresse den angezeigten Tag (App.date) festlegt */
  function readHash() {
    var m = /^#\/([a-z]+)(?:\/(\d{4}-\d{2}-\d{2}))?/.exec(location.hash || "");
    if (!m) return false;
    if (isView(m[1])) App.view = m[1];
    if (!m[2] || !T.isValidISO(m[2])) return false;
    /* Kalender und Woche schreiben ihre Blätterposition in die Adresse.
       Die gilt nur für sie — sonst öffnete „Heute“ nach dem Neuladen auf
       dem zuletzt angesehenen Monat. Nur #/today/<Datum> setzt den Tag. */
    if (m[1] === "calendar") App.calendarMonth = T.monthKey(m[2]);
    else if (m[1] === "week") App.weekAnchor = m[2];
    else {
      App.date = m[2];
      App.calendarMonth = T.monthKey(m[2]);
      App.weekAnchor = m[2];
      return true;
    }
    return false;
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
    /* Kopfzeile und Navigation werden komplett neu aufgebaut. Wer gerade
       einen ihrer Knöpfe bedient (Tastatur), behält trotzdem den Fokus. */
    var memos = ["#header", "#nav", "#tabbar"].map(function (sel) { return memoFocus(D.qs(sel)); });
    renderNav();
    renderHeader();
    memos.forEach(restoreFocusMemo);
  };

  /* Die Speicherdiagnose liest den ganzen localStorage-Text — nur einmal
     je Datenstand, nicht bei jedem Zeichnen der Navigation. */
  var diagCache = { rev: -1, value: null };
  function diagnostics() {
    var rev = App.dataRevision();
    if (diagCache.rev !== rev || !diagCache.value) diagCache = { rev: rev, value: store.diagnostics() };
    return diagCache.value;
  }

  /* Die Tableiste hat Platz für vier Ansichten plus „Mehr“. Alles andere
     (Berichte, Erfolge, Werkzeuge, Einstellungen) liegt in der Schublade;
     „Mehr“ öffnet sie und ist aktiv, solange eine dieser Ansichten offen ist. */
  var TAB_VIEWS = ["today", "calendar", "week", "stats"];
  var IS_MAC = /Mac|iPhone|iPad|iPod/.test((navigator.platform || "") + " " + (navigator.userAgent || ""));

  function renderNav() {
    var nav = D.qs("#nav");
    var tabbar = D.qs("#tabbar");
    if (!nav) return;
    D.clear(nav);
    nav.setAttribute("aria-label", I.t("nav.main"));

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
          "data-key": "nav-" + v.key,
          "aria-current": App.view === v.key ? "page" : null,
          html: D.icon(v.icon) + "<span>" + D.esc(I.t("nav." + v.key)) + "</span>" +
            '<kbd aria-hidden="true">' + D.esc(v.kbd) + "</kbd>"
        });
        btn.addEventListener("click", function () { App.go(v.key); });
        nav.appendChild(btn);
      });
    });

    // Auf sehr schmalen Handys fehlt der Knopf in der Kopfzeile — dann hier
    var themeItem = D.el("button.nav-item.nav-theme", {
      type: "button", "data-key": "nav-theme",
      html: D.icon(App.effectiveTheme === "dark" ? "sun" : "moon") + "<span>" + D.esc(I.t("kbd.theme")) + "</span>"
    });
    themeItem.addEventListener("click", App.toggleTheme);
    nav.appendChild(themeItem);

    var diag = diagnostics();
    nav.appendChild(D.el("div.nav-foot", {
      html: "<b>" + D.esc(I.t("app.name")) + "</b> " + APP_VERSION + "<br>" +
        D.esc(I.tn("nav.daysStored", diag.days)) + " · " +
        (diag.volatile ? "⚠ " + D.esc(I.t("nav.volatile")) : Math.round(diag.bytes / 1024) + " KB") +
        "<br><span>" + D.esc(I.t("nav.privacy")) + "</span>"
    }));

    if (tabbar) {
      D.clear(tabbar);
      tabbar.setAttribute("aria-label", I.t("nav.views"));
      TAB_VIEWS.forEach(function (key) {
        var v = VIEW_ORDER.filter(function (x) { return x.key === key; })[0];
        var btn = D.el("button.tab", {
          type: "button",
          "data-key": "tab-" + key,
          "aria-current": App.view === key ? "page" : null,
          html: D.icon(v.icon) + "<span>" + D.esc(I.t("nav." + key)) + "</span>"
        });
        btn.addEventListener("click", function () { App.go(key); });
        tabbar.appendChild(btn);
      });
      var inMore = TAB_VIEWS.indexOf(App.view) < 0;
      var more = D.el("button.tab.tab-more", {
        type: "button",
        "data-key": "tab-more",
        "aria-current": inMore ? "page" : null,
        "aria-controls": "nav",
        "aria-expanded": navIsOpen() ? "true" : "false",
        "aria-label": inMore ? I.t("nav.more") + ": " + I.t("nav." + App.view) : I.t("nav.more"),
        html: D.icon("grid") + "<span>" + D.esc(I.t("nav.more")) + "</span>"
      });
      more.addEventListener("click", function () { openNav(); });
      tabbar.appendChild(more);
    }
  }

  function renderHeader() {
    var header = D.qs("#header");
    if (!header) return;
    D.clear(header);

    // Menü (nur mobil sichtbar)
    var menuBtn = D.el("button.btn.ghost.icon.only-mobile", {
      type: "button", "data-key": "hdr-menu", "aria-label": I.t("nav.menu"),
      "aria-controls": "nav", "aria-expanded": navIsOpen() ? "true" : "false",
      html: D.icon("menu")
    });
    menuBtn.addEventListener("click", function () { openNav(); });
    header.appendChild(menuBtn);

    /* Wo der Titel nur den Namen der Ansicht wiederholt (Statistik,
       Einstellungen …), steht darüber der Bereich statt zweimal dasselbe;
       mobil zeigt die Kopfzeile dann den Titel. */
    var eyebrow = headerEyebrow(), headline = headerHeadline();
    var dup = eyebrow.toLocaleLowerCase() === headline.toLocaleLowerCase();
    if (dup) eyebrow = sectionLabel(App.view) || eyebrow;
    var title = D.el("div.header-title" + (dup ? ".dup" : ""), {
      html: '<span class="s">' + D.esc(eyebrow) + "</span>" +
        '<span class="h">' + D.esc(headline) + "</span>"
    });
    header.appendChild(title);
    header.appendChild(D.el("div.spacer"));

    // Uhr
    var clock = D.el("span.clock-pill.mono#liveClock", { "aria-label": I.t("common.now") });
    header.appendChild(clock);

    // Zeitkonto
    var pill = D.el("button.saldo-pill", { type: "button", "data-key": "hdr-saldo" });
    fillSaldoPill(pill, App.settledBalance());
    pill.addEventListener("click", function () { App.go("stats"); });
    header.appendChild(pill);

    // Aktionen
    if (ZK.Ext) ZK.Ext.render("header.actions", header, { App: App });

    var search = D.el("button.btn.ghost.icon", {
      type: "button", "data-key": "hdr-search", "aria-label": I.t("cmd.placeholder"),
      "data-tip": I.t("kbd.palette") + (IS_MAC ? " · ⌘K" : " · Ctrl+K"), html: D.icon("search")
    });
    search.addEventListener("click", openPalette);
    header.appendChild(search);

    var themeBtn = D.el("button.btn.ghost.icon.hdr-theme", {
      type: "button", "data-key": "hdr-theme", "aria-label": I.t("set.theme"),
      "data-tip": I.t("kbd.theme"),
      html: D.icon(App.effectiveTheme === "dark" ? "sun" : "moon")
    });
    themeBtn.addEventListener("click", App.toggleTheme);
    header.appendChild(themeBtn);

    startClock();
  }

  /** Beschriftung, Wert und Erklärung der Saldo-Pille — auch für das minütliche Nachführen. */
  function fillSaldoPill(pill, bal) {
    var value = App.fmtSigned(bal.minutes);
    var live = bal.live === null ? "" : App.fmtSigned(bal.live);
    var liveText = live ? I.t(bal.overnight ? "balance.liveShift" : "balance.live", { v: live }) : "";
    pill.className = "saldo-pill" + (bal.minutes ? " " + App.toneOf(bal.minutes) : "");
    pill.setAttribute("data-sig", bal.minutes + "|" + live + "|" + I.getLang());
    pill.setAttribute("data-tip", I.t("balance.account") + ": " + I.t("balance.tipSettled") +
      (live ? " · " + I.t("balance.tipLive", { v: live }) : ""));
    pill.setAttribute("aria-label", I.t("balance.account") + " " + value + (liveText ? ", " + liveText : ""));
    pill.innerHTML =
      '<span class="lbl"><span class="l-full">' + D.esc(I.t("balance.account")) + "</span>" +
      '<span class="l-short">' + D.esc(I.t("balance.accountShort")) + "</span></span>" +
      '<span class="val mono">' + D.esc(value) + "</span>" +
      (liveText ? '<span class="live">' + D.esc(liveText) + "</span>" : "");
  }

  /** Läuft ein Tag, ändert sich der Live-Teil minütlich — ohne die Kopfzeile neu zu bauen. */
  function refreshSaldoPill() {
    var pill = D.qs('#header [data-key="hdr-saldo"]');
    if (!pill) return;
    var bal = App.settledBalance();
    var sig = bal.minutes + "|" + (bal.live === null ? "" : App.fmtSigned(bal.live)) + "|" + I.getLang();
    if (pill.getAttribute("data-sig") !== sig) fillSaldoPill(pill, bal);
  }

  /* Über dem Titel: der Name der Ansicht. In „Heute“ nur, wenn auch heute
     angezeigt wird — sonst stünde „Heute“ über einem anderen Datum. */
  function headerEyebrow() {
    if (App.view !== "today") return I.t("nav." + App.view);
    var today = T.todayISO();
    if (App.date === today) return I.t("nav.today");
    if (App.date === T.addDays(today, -1)) return I.t("common.yesterday");
    if (App.date === T.addDays(today, 1)) return I.t("common.tomorrow");
    return I.t("hdr.day");
  }

  function sectionLabel(view) {
    var v = VIEW_ORDER.filter(function (x) { return x.key === view; })[0];
    return v ? I.t("nav.section." + v.group) : "";
  }

  /* Französisch und Italienisch schreiben Wochentage klein — als Titel
     beginnt die Zeile trotzdem gross. */
  function capFirst(text) {
    var s = String(text || "");
    return s ? s.charAt(0).toLocaleUpperCase(I.locale()) + s.slice(1) : s;
  }

  function headerHeadline() {
    if (App.view === "today") {
      return capFirst(I.formatDate(App.date, { weekday: "long", day: "numeric", month: "long" }));
    }
    if (App.view === "calendar") {
      var d = T.fromISO(App.calendarMonth + "-01");
      return d ? capFirst(I.monthName(d.getMonth())) + " " + d.getFullYear() : "";
    }
    if (App.view === "week") {
      return I.t("week.kw", { n: T.isoWeek(App.weekAnchor) }) + " · " + T.isoWeekYear(App.weekAnchor);
    }
    /* Tabelle statt Bedingungskette: eine neue Ansicht ohne Eintrag fiele
       sonst still auf einen fremden Titel zurück. */
    var TITLES = {
      stats: "stats.title",
      reports: "report.title",
      achievements: "ach.title",
      tools: "tools.title",
      settings: "set.title"
    };
    return I.t(TITLES[App.view] || ("nav." + App.view));
  }

  /* ---- Schublade (mobil) ------------------------------------------- */
  var navReturnFocus = null;

  function navIsOpen() {
    var nav = D.qs("#nav");
    return !!(nav && nav.classList.contains("open"));
  }

  function setNavExpanded(open) {
    D.qsa('[aria-controls="nav"]').forEach(function (b) { b.setAttribute("aria-expanded", open ? "true" : "false"); });
  }

  function openNav() {
    var nav = D.qs("#nav");
    if (!nav || navIsOpen()) return;
    D.hideTip();
    navReturnFocus = document.activeElement;
    nav.classList.add("open");
    document.body.classList.add("nav-open");
    /* Der Schleier gehört in denselben Stapelkontext wie die Schublade
       (.app hat z-index) — am Ende von <body> lag er über ihr. */
    var scrim = D.el("div.nav-scrim", { "aria-hidden": "true" });
    scrim.addEventListener("click", function () { closeNav(true); });
    nav.parentNode.insertBefore(scrim, nav);
    setNavExpanded(true);
    var target = D.qs('.nav-item[aria-current="page"]', nav) || D.qs(".nav-item", nav);
    if (target) {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
  }

  /** @param {Boolean} restoreFocus  zurück zum auslösenden Knopf (Escape, Schleier) */
  function closeNav(restoreFocus) {
    var nav = D.qs("#nav");
    var wasOpen = navIsOpen();
    if (nav) nav.classList.remove("open");
    document.body.classList.remove("nav-open");
    D.qsa(".nav-scrim").forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); });
    setNavExpanded(false);
    if (wasOpen && restoreFocus === true) {
      var back = navReturnFocus && document.contains(navReturnFocus) && navReturnFocus !== document.body
        ? navReturnFocus : D.qs('#header [data-key="hdr-menu"]');
      if (back) { try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); } }
    }
    if (wasOpen) navReturnFocus = null;
  }

  /** Tab bleibt in der offenen Schublade. */
  function trapNavFocus(e) {
    var nav = D.qs("#nav");
    var items = D.qsa("button, [href], input, select, [tabindex]:not([tabindex='-1'])", nav)
      .filter(function (n) { return !n.disabled && n.getClientRects().length > 0; });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    var active = document.activeElement;
    if (!nav.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
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
    updateTitle();
    checkBreakDue();
    var minute = Math.floor(Date.now() / 60000);
    if (minute !== saldoMinute) { saldoMinute = minute; refreshSaldoPill(); }
  }
  var saldoMinute = null;

  /* ---- Feierabend im Browser-Tab ----------------------------------- */
  /* Der Grundtitel wird jedes Mal neu gebildet statt gespeichert — sonst
     bliebe er nach einem Sprachwechsel in der alten Sprache stehen. */
  function updateTitle() {
    var baseTitle = I.t("app.name") + " · " + I.t("app.tagline");
    var s = App.settings();
    if (s.titleCountdown === false) {
      if (document.title !== baseTitle) document.title = baseTitle;
      return;
    }
    var res = App.day(App.activeStampDate());
    if (!res.running || res.recommendedLeaveTl === null) {
      if (document.title !== baseTitle) document.title = baseTitle;
      return;
    }
    // Gleiche Rechnung wie der Hero in „Heute“: ist das Soll erreicht, zählt
    // die Zeit darüber — nicht der Abstand zu einer überholten Empfehlung
    var nowTl = T.nowMinutes() + (res.overnight ? T.DAY : 0);
    var lv = ZK.TodayState.leave(res, nowTl);
    var text = res.remaining > 0
      ? T.formatHHMM(lv.leaveTl) + " · " + T.formatDuration(lv.leaveTl - nowTl, "clock")
      : "✓ " + T.formatSigned(lv.over, "clock");
    document.title = text + " — " + I.t("app.name");
  }

  /* ---- Erinnerung, bevor die Pflichtpause fällig wird ---------------- */
  var breakWarnedAt = null;

  function checkBreakDue() {
    var s = App.settings();
    if (s.breakReminder === false) return;

    var iso = App.activeStampDate();
    var res = App.day(iso);
    if (!res.running) { breakWarnedAt = null; return; }

    if (res.openBreak) return;                         // gerade in der Pause
    /* Die Staffeln gelten für die Arbeitszeit (ohne Pausen), und jede
       Pause zählt mit, auch eine bezahlte (legalBreak). */
    var worked = res.workingTime !== undefined ? res.workingTime : res.presence;
    var tier = R.nextBreakTier(worked, s.breakRuleset, s.customBreakTiers);
    if (!tier) return;
    if ((res.legalBreak !== undefined ? res.legalBreak : res.breakTotal) >= tier.require) return;   // Pause ist schon erfasst

    var minutesToTier = tier.over - worked;
    if (minutesToTier > 10 || minutesToTier < 0) return;
    if (breakWarnedAt === tier.over) return;         // je Stufe nur einmal
    breakWarnedAt = tier.over;

    // Ist das Fenster nicht vorne, zusätzlich als Systembenachrichtigung
    if (!pageInFront() && ZK.BreakTimer) {
      App.notify(ZK.BreakTimer.notice("breakDue", {
        iso: iso, now: Date.now(), inMin: minutesToTier, req: tier.require
      }, { t: I.t, dur: function (m) { return T.formatDuration(m, "hm"); } }));
    }
    D.toast(I.t("toast.breakDue", {
      v: T.formatDuration(Math.max(1, minutesToTier), "hm"),
      req: T.formatDuration(tier.require, "hm")
    }), {
      tone: "warn", icon: "coffee", duration: 12000,
      action: { label: I.t("day.startBreak"), onClick: function () { App.stamp("break"); } }
    });
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

  /* Jede Speicherung zeichnet die ganze Ansicht neu. Damit das nicht
     auffällt, gilt für ein Neuzeichnen DERSELBEN Ansicht: keine
     Einflug-Animation, Scrollposition, Fokus (samt Cursor), offene
     <details> und innere Scrollbereiche bleiben. Nur ein echter
     Ansichtswechsel animiert und springt nach oben.
     App.renderMode verrät den Ansichten, welcher Fall gerade vorliegt
     („enter“ | „refresh“), etwa um Zahlen nicht erneut hochzuzählen. */
  var renderedView = null;
  var KEEP_SCROLL = ".table-wrap, [data-keep-scroll]";
  var FOCUS_SEL = "a[href], button, input, select, textarea, summary, [tabindex]";

  App.renderMode = "enter";

  var flushingView = false;

  App.renderView = function () {
    var host = D.qs("#viewHost");
    if (!host || flushingView) return;
    /* Angefangene Eingaben der alten Ansicht (Notiz, Pausenbezeichnung)
       zuerst sichern — vor dem Abriss, auch beim Wechsel der Ansicht.
       Löst das Sichern selbst ein Neuzeichnen aus, übernimmt das dieser
       Aufruf hier. */
    var leaving = renderedView && isView(renderedView) ? ZK.Views[renderedView] : null;
    if (leaving && typeof leaving.flush === "function") {
      flushingView = true;
      try { leaving.flush(); } catch (e) { if (root.console) console.error(e); }
      finally { flushingView = false; }
    }
    var key = isView(App.view) ? App.view : "today";
    var refresh = renderedView === key && !!host.firstChild;
    var firstEver = renderedView === null;
    renderedView = key;

    var keep = null;
    if (refresh) {
      keep = {
        y: window.pageYOffset || document.documentElement.scrollTop || 0,
        focus: memoFocus(host),
        intent: focusIntent && Date.now() - focusIntent.at < 600 ? focusIntent : null,
        details: memoDetails(host),
        scrollers: D.qsa(KEEP_SCROLL, host).map(function (n) { return [n.scrollLeft, n.scrollTop]; })
      };
    }

    App.clearTickers();
    ZK.Charts.hideTip();
    D.hideTip();
    D.clear(host);
    var node = D.el("div.view" + (refresh ? ".is-refresh" : ".anim-rise"));
    host.appendChild(node);
    App.renderMode = refresh ? "refresh" : "enter";
    try {
      ZK.Views[key].render(node, App);
    } catch (err) {
      node.innerHTML = '<div class="notice minus">' + D.icon("alert") +
        "<div><strong>" + D.esc(I.t("app.viewError")) + "</strong>" +
        "<div class='sub'>" + D.esc(err && err.message ? err.message : String(err)) + "</div></div></div>";
      if (root.console) console.error(err);
    }
    App.renderMode = "enter";

    if (keep) {
      restoreDetails(host, keep.details);
      D.qsa(KEEP_SCROLL, host).forEach(function (n, i) {
        var s = keep.scrollers[i];
        if (s) { n.scrollLeft = s[0]; n.scrollTop = s[1]; }
      });
      // Diagramme messen beim Aufbau — dabei kann der Browser kurz nach oben springen
      if (Math.abs((window.pageYOffset || 0) - keep.y) > 1) scrollToY(keep.y);
      if (keep.focus) restoreFocusMemo(keep.focus);
      else if (keep.intent) followFocusIntent(keep.intent, host);
    } else if (!firstEver) {
      scrollToY(0);
    }
  };

  /** Sofort scrollen — html hat scroll-behavior:smooth, das soll hier nicht greifen. */
  function scrollToY(y) {
    try {
      window.scrollTo({ top: y, left: 0, behavior: "instant" });
    } catch (e) {
      // Ältere Browser ohne Optionsobjekt: Glätten kurz abschalten
      var html = document.documentElement;
      var before = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      void html.offsetHeight;
      window.scrollTo(0, y);
      html.style.scrollBehavior = before;
    }
  }

  /* ---- Fokus über ein Neuzeichnen retten -----------------------------
     Gesucht wird das „gleiche“ Element: zuerst über id, data-key oder
     name, sonst über die Position unter gleichartigen Elementen — bei
     Knöpfen nur, wenn auch die Beschriftung passt. */
  function labelOf(n) {
    return String(n.getAttribute("aria-label") || n.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  /** Erste Klasse des Elternelements — Zusatzklassen wie „single“ wechseln */
  function groupOf(n, scope) {
    var p = n.parentElement;
    if (!p || p === scope) return "";
    return String(p.className || "").split(/\s+/)[0] || "";
  }

  function memoFocus(scope, el) {
    var a = el || document.activeElement;
    if (!scope || !a || a === scope || !scope.contains(a)) return null;
    var same = D.qsa(FOCUS_SEL, scope).filter(function (n) { return n.tagName === a.tagName; });
    var memo = {
      scope: scope, tag: a.tagName, id: a.id || "", key: a.getAttribute("data-key") || "",
      name: a.getAttribute("name") || "", type: a.type || "", label: labelOf(a),
      index: same.indexOf(a), sel: null,
      group: groupOf(a, scope)
    };
    try {
      if (typeof a.selectionStart === "number" && a.selectionStart !== null) memo.sel = [a.selectionStart, a.selectionEnd];
    } catch (e) { /* Feldtyp ohne Cursor */ }
    return memo;
  }

  /* Ein Feld meldet seine Änderung erst beim Verlassen (change) — also
     genau dann, wenn Tab oder ein Klick den Fokus schon weiterreicht. Wird
     dabei neu gezeichnet, ist das Ziel weg und der Fokus landet auf <body>.
     Deshalb merken wir uns die Absicht (Tab vorwärts/rückwärts, Klick auf
     ein Element) und führen sie im neu gezeichneten Inhalt aus. */
  var focusIntent = null;

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") { focusIntent = null; return; }
    var host = D.qs("#viewHost");
    var from = memoFocus(host);
    focusIntent = from ? { at: Date.now(), from: from, step: e.shiftKey ? -1 : 1 } : null;
  }, true);

  document.addEventListener("pointerdown", function (e) {
    var host = D.qs("#viewHost");
    var t = e.target && e.target.closest ? e.target.closest(FOCUS_SEL) : null;
    var to = t ? memoFocus(host, t) : null;
    focusIntent = to ? { at: Date.now(), to: to } : null;
  }, true);

  function tabbables(scope) {
    return D.qsa(FOCUS_SEL, scope).filter(function (n) {
      return n.tabIndex >= 0 && !n.disabled && n.getClientRects().length > 0;
    });
  }

  function followFocusIntent(intent, host) {
    var target = null;
    if (intent.to) target = findFocus(intent.to);
    else if (intent.from) {
      var origin = findFocus(intent.from);
      var list = tabbables(host);
      var i = origin ? list.indexOf(origin) : -1;
      if (i >= 0) target = list[i + intent.step] || null;
    }
    focusIntent = null;
    if (!target) return;
    var apply = function () {
      var a = document.activeElement;
      if (a && a !== document.body && a !== document.documentElement && document.contains(a)) return;
      if (!document.contains(target)) return;
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    };
    apply();
    // Der Browser setzt seinen eigenen (verschwundenen) Fokus erst danach um
    setTimeout(apply, 0);
  }

  function cssValue(v) {
    return root.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\#.:\[\]]/g, "\\$&");
  }

  function findFocus(memo) {
    var scope = memo.scope, n = null;
    function q(sel) { try { return scope.querySelector(sel); } catch (e) { return null; } }
    if (memo.id) n = q("#" + cssValue(memo.id));
    if (!n && memo.key) n = q('[data-key="' + cssValue(memo.key) + '"]');
    if (!n && memo.name) n = q(memo.tag.toLowerCase() + '[name="' + cssValue(memo.name) + '"]');
    if (n) return n;
    var same = D.qsa(FOCUS_SEL, scope).filter(function (x) { return x.tagName === memo.tag; });
    var field = /^(INPUT|SELECT|TEXTAREA)$/.test(memo.tag);
    var cand = same[memo.index];
    if (cand && (field ? (cand.type || "") === memo.type : labelOf(cand) === memo.label)) return cand;
    if (field) return null;
    var best = null, dist = Infinity;
    if (memo.label) {
      same.forEach(function (x, i) {
        if (labelOf(x) === memo.label && Math.abs(i - memo.index) < dist) { best = x; dist = Math.abs(i - memo.index); }
      });
    }
    /* Der Knopf heisst jetzt anders (aus „Gehen“ wurde „Weiterarbeiten“):
       dann wenigstens in derselben Gruppe bleiben, statt den Fokus zu verlieren. */
    if (!best && memo.group) {
      same.forEach(function (x, i) {
        if (x.disabled || groupOf(x, scope) !== memo.group) return;
        if (Math.abs(i - memo.index) < dist) { best = x; dist = Math.abs(i - memo.index); }
      });
    }
    return best;
  }

  function restoreFocusMemo(memo) {
    if (!memo) return;
    var a = document.activeElement;
    // Hat schon jemand anderes den Fokus gesetzt (Dialog, Ansicht), bleibt er dort
    if (a && a !== document.body && a !== document.documentElement && document.contains(a)) return;
    var n = findFocus(memo);
    if (!n || n.disabled || !n.getClientRects().length) return;
    try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
    if (memo.sel && n.setSelectionRange && /^(INPUT|TEXTAREA)$/.test(n.tagName)) {
      try { n.setSelectionRange(memo.sel[0], memo.sel[1]); } catch (e) { /* Feldtyp ohne Cursor */ }
    }
  }

  function memoDetails(scope) {
    return D.qsa("details", scope).map(function (d) {
      var s = d.querySelector("summary");
      return { label: s ? labelOf(s) : "", open: d.open };
    });
  }

  function restoreDetails(scope, list) {
    if (!list.length) return;
    var used = {};
    D.qsa("details", scope).forEach(function (d) {
      var s = d.querySelector("summary");
      var label = s ? labelOf(s) : "";
      for (var i = 0; i < list.length; i++) {
        if (used[i] || list[i].label !== label) continue;
        used[i] = true;
        if (d.open !== list[i].open) d.open = list[i].open;
        return;
      }
    });
  }


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
      { icon: "calendar", label: I.t("ol.syncNow"), sub: I.t("ol.title"), run: function () { App.syncOutlook(); } },
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
    /* Wohin der Fokus nach dem Schliessen zurückkehrt (z. B. ins Feld der Schnellerfassung) */
    var returnFocus = document.activeElement;

    /* Schnellerfassung und Notizsuche direkt aus der Palette */
    function smartCommands(query) {
      var out = [];
      var raw = String(query || "").trim();
      if (!raw) return out;

      /* „gestern 7:45-16:30 p30“ eintragen — nie stillschweigend über
         Erfasstes: trifft die Eingabe erfasste Tage, öffnet Enter erst
         die Prüfung mit Vorher/Nachher. */
      var Q = ZK.QuickEntry;
      if (Q) {
        var qa = Q.analyze(raw);
        /* Ein blosses Stichwort („ferien“) rangiert hinter echten Befehlen */
        var late = !qa.start && qa.dateKind === "default";
        if (qa.ok) {
          var qp = Q.plan(App, qa);
          if (!qp.error && (qp.fresh || qp.occupied)) {
            var needsReview = qp.occupied > 0;
            out.push({
              group: I.t("tools.quick"),
              icon: "zap",
              label: I.t("cmd.quickEntry", { v: Q.summary(App, qa) }),
              sub: needsReview ? I.tn("cmd.qeConfirm", qp.occupied) : (qp.skipped ? I.tn("tools.qeSkipped", qp.skipped) : ""),
              warn: needsReview,
              late: late,
              run: function () {
                if (needsReview) Q.review(App, qa, qp);
                else Q.apply(App, qp, false);
              }
            });
          }
        } else if (qa.error && /\d/.test(raw) &&
                   ["empty", "unreadable", "unknown", "only-date"].indexOf(qa.error.code) < 0) {
          /* Sieht nach Schnellerfassung aus, ist aber nicht lesbar: sagen,
             warum, und zum Korrigieren in die Werkzeuge springen. */
          out.push({
            group: I.t("tools.quick"),
            icon: "alert",
            label: Q.errorText(App, qa.error),
            warn: true,
            late: true,
            run: function () { Q.openInTools(App, raw); }
          });
        }
      }

      /* Notizen durchsuchen */
      if (raw.length >= 3) {
        var needle = raw.toLowerCase();
        var days = store.allDays();
        Object.keys(days).sort().reverse().forEach(function (iso) {
          if (out.length > 8) return;
          var note = String(days[iso].note || "");
          if (!note || note.toLowerCase().indexOf(needle) < 0) return;
          out.push({
            group: I.t("cmd.noteSearch"),
            icon: "search",
            label: I.formatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" }),
            sub: note.slice(0, 60),
            run: function () { App.setDate(iso, { view: "today" }); }
          });
        });
      }

      return out;
    }

    function dateCommands(query) {
      var out = [];
      var iso = null;
      var q = query.trim().toLowerCase();
      /* „12.10.“, „12.10“, „12/10“, „12.10.2026“, ISO — und „gestern“, „demain“ … */
      if (ZK.Planner) {
        iso = ZK.Planner.parseDateToken(q, T.todayISO());
        var rel = ZK.Planner.RELATIVE_DAYS;
        if (!iso && Object.prototype.hasOwnProperty.call(rel, q.replace(/[’`´]/g, "'"))) {
          iso = T.addDays(T.todayISO(), rel[q.replace(/[’`´]/g, "'")]);
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
        /* Antworten (answer: true) zweizeilig: fett die Antwort, darunter der Zusammenhang */
        var answer = !!cmd.answer;
        var btn = D.el("button.palette-item" + (cmd.warn && !cmd.sub ? ".warn" : "") +
          (answer ? ".answer" + (cmd.tone ? ".is-" + cmd.tone : "") : ""), {
          type: "button", role: "option",
          "aria-selected": i === index ? "true" : "false",
          html: D.icon(cmd.icon || "right") +
            (answer
              ? '<span class="pa-text"><b>' + D.esc(cmd.label) + "</b>" +
                (cmd.sub ? '<span class="sub">' + D.esc(cmd.sub) + "</span>" : "") + "</span>"
              : "<span>" + D.esc(cmd.label) +
                (cmd.sub ? '<span class="sub' + (cmd.warn ? " warn" : "") + '"> · ' + D.esc(cmd.sub) + "</span>" : "") + "</span>") +
            (cmd.kbd ? "<kbd>" + D.esc(cmd.kbd) + "</kbd>" : "")
        });
        btn.addEventListener("click", function () { choose(cmd); });
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
      if (!q) {
        /* Leer: alle Befehle; Erweiterungen dürfen hinten Vorschläge (late) anhängen */
        var hints = ZK.Ext ? ZK.Ext.collect("palette.commands", "", { App: App }).filter(function (c) { return c && c.late; }) : [];
        filtered = all.concat(hints); index = 0; draw(); return;
      }
      var dates = dateCommands(input.value);
      var smart = smartCommands(input.value);
      if (ZK.Ext) smart = smart.concat(ZK.Ext.collect("palette.commands", input.value, { App: App }));
      var scored = all.map(function (c) { return { c: c, s: score(c, q) }; })
        .filter(function (x) { return x.s !== null; })
        .sort(function (a, b) { return a.s - b.s; })
        .map(function (x) { return x.c; });
      /* Antworten auf Fragen stehen zuoberst, noch vor dem Datumssprung */
      var top = function (c) { return c.answer && !c.late; };
      filtered = smart.filter(top)
        .concat(dates)
        .concat(smart.filter(function (c) { return !c.late && !top(c); }))
        .concat(scored)
        .concat(smart.filter(function (c) { return c.late; }));
      index = 0;
      draw();
    }

    /* Ein Eintrag mit `fill` setzt nur den Suchtext ein (z. B. eine Beispielfrage) */
    function choose(cmd) {
      if (typeof cmd.fill === "string") {
        input.value = cmd.fill;
        filter();
        input.focus();
        return;
      }
      close();
      cmd.run();
    }

    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); index = Math.min(filtered.length - 1, index + 1); draw(); scrollToActive(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); index = Math.max(0, index - 1); draw(); scrollToActive(); }
      else if (e.key === "Enter") { e.preventDefault(); if (filtered[index]) choose(filtered[index]); }
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
      if (returnFocus && returnFocus !== document.body && returnFocus.focus && document.contains(returnFocus)) {
        try { returnFocus.focus({ preventScroll: true }); } catch (e) { /* Fokus ist Kür */ }
      }
    }

    filter();
    setTimeout(function () { input.focus(); }, 30);
  }

  App.openPalette = openPalette;

  /* ================================================================== */
  /* Stempeluhr — von überall aufrufbar                                  */
  /* ================================================================== */

  /* Was ein Stempel ändert, rechnet ZK.TodayState.stampPatch() (getestet);
     hier wird nur gespeichert und gemeldet. Jeder Stempel ist EIN Schritt,
     den „Rückgängig“ im Toast vollständig zurücknimmt. */
  App.stamp = function (kind) {
    // Angefangene Notiz/Pausenbezeichnung zuerst sichern — sonst träfe
    // „Rückgängig“ den Text statt des Stempels
    if (ZK.Views.today && ZK.Views.today.flush) ZK.Views.today.flush();
    var iso = App.activeStampDate();
    if (App.date !== iso) App.setDate(iso);
    var rec = store.getDayOrEmpty(iso);
    var step = ZK.TodayState.stampPatch(rec, kind, T.nowMinutes(), { breakLabel: I.t("day.break") });
    var undo = { label: I.t("common.undo"), onClick: function () { App.undo(); } };

    if (step.action === "none") {
      D.toast(I.t(step.reason === "out" ? "day.clockOut" : "day.clockIn") + ": " + step.time, { tone: "warn" });
      return;
    }
    App.saveDay(iso, step.patch, { label: "stamp" });

    if (step.action === "in") {
      D.toast(I.t("toast.stampedIn", { time: step.time }), { icon: "play", action: undo });
    } else if (step.action === "resume") {
      D.toast(step.gap > 0
        ? I.t("toast.resumed", { time: step.time, v: App.fmt(step.gap) })
        : I.t("toast.resumedNoGap", { time: step.time }), { icon: "play", action: undo });
    } else if (step.action === "out") {
      var res = App.day(iso);
      D.toast(I.t("toast.stampedOut", { time: step.time }), {
        icon: "stop",
        sub: (step.closedBreak ? I.t("toast.breakClosed") + " · " : "") +
          I.t("day.net") + " " + App.fmt(res.net) + " · " + I.t("day.balance") + " " + App.fmtSigned(res.balance),
        tone: res.balance >= 0 ? "plus" : undefined,
        action: undo
      });
    } else if (step.action === "breakEnd") {
      D.toast(I.t("toast.breakEnded", { v: App.fmt(step.minutes) }), { icon: "coffee", action: undo });
    } else if (step.action === "breakStart") {
      D.toast(I.t("toast.breakStarted"), {
        icon: "coffee", tone: "warn", action: undo,
        sub: step.stampedIn ? I.t("toast.stampedIn", { time: step.time }) : undefined
      });
    }
  };

  /** Ein Knopf für alles: Kommen → (Pause beenden) → Gehen → wieder Kommen. */
  App.stampSmart = function () {
    var iso = App.activeStampDate();
    var rec = store.getDayOrEmpty(iso);
    if (!rec.start || rec.end) return App.stamp("in");
    var onBreak = (rec.breaks || []).some(function (b) { return b.start && !b.end; });
    return App.stamp(onBreak ? "break" : "out");
  };

  /* ---- Direktlinks: #/stamp, #/stamp/in|out|break ---------------------
     Für Home-Bildschirm-Verknüpfungen, NFC-Tags am Arbeitsplatz oder
     Kurzbefehle. Der Link verschwindet nach dem Ausführen aus der Adresse,
     damit ein Neuladen nicht ein zweites Mal stempelt; NFC-Leser, die
     doppelt auslösen, fängt eine kurze Sperre ab. */
  var LINK_LOCK_KEY = "zeitkonto:link-lock";

  function takeLinkAction() {
    var m = /^#\/stamp(?:\/(in|out|break|toggle))?\/?$/.exec(location.hash || "");
    if (!m) return null;
    try { history.replaceState(null, "", location.pathname + location.search + "#/today"); }
    catch (e) { location.hash = "#/today"; }
    App.view = "today";
    return m[1] || "toggle";
  }

  App.runLinkAction = function (kind) {
    var now = Date.now(), last = 0;
    try { last = +localStorage.getItem(LINK_LOCK_KEY) || 0; } catch (e) { last = 0; }
    if (now - last < 15000 && now >= last) return false;
    try { localStorage.setItem(LINK_LOCK_KEY, String(now)); } catch (e) { /* ohne Sperre weiter */ }
    App.setDate(App.activeStampDate(), { view: "today" });
    if (kind === "toggle") App.stampSmart();
    else App.stamp(kind);
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* egal */ } }
    return true;
  };

  App.stampLink = function (kind) {
    return location.href.split("#")[0] + "#/stamp" + (kind && kind !== "toggle" ? "/" + kind : "");
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
    if (store.undo() === false) return;   // gesperrt (abgeschlossener Monat) — der Store meldet es
    App.applyTheme();
    App.applyDensity();
    App.applyLanguage();
    App.afterChange();
    D.toast(I.t("toast.undone"));
  };

  App.redo = function () {
    if (!store.canRedo()) return;
    if (store.redo() === false) return;
    // Wie beim Rückgängigmachen: Einstellungen wirken erst, wenn sie angewendet sind
    App.applyTheme();
    App.applyDensity();
    App.applyLanguage();
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
    store.updateSettings({ lastExportAt: new Date().toISOString() });
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

  /* Die Kennzahlen laufen über alle Tage. Je Datenstand (und Minute, wegen
     des laufenden Tages) nur einmal rechnen — die Ansicht „Erfolge“ und die
     Prüfung nach dem Speichern teilen sich das Ergebnis. */
  var achRev = 0;
  var achMemo = null;
  store.subscribe(function (evt) { if (!evt || evt.type !== "achievements") achRev++; });

  App.buildAchievements = function () {
    var key = achRev + "|" + T.todayISO() + "|" + Math.floor(Date.now() / 60000);
    if (!achMemo || achMemo.key !== key) {
      achMemo = { key: key, stats: ZK.Achievements.buildStats(store.allDays(), App.settings()) };
    }
    var saved = store.getAchievements();
    var result = ZK.Achievements.evaluate(achMemo.stats, saved.earned, { exports: saved.exports || 0 });
    result.stats = achMemo.stats;
    return result;
  };

  App.checkAchievements = function () {
    var result = App.buildAchievements();
    var saved = store.getAchievements();
    if (!result.fresh.length && saved.xp === result.xp) return result;

    saved.earned = result.earned;
    saved.xp = result.xp;
    store.saveAchievements(saved);

    /* Mehrere Abzeichen auf einmal (alte Daten, Import, Schnellerfassung):
       eine Sammelmeldung und ein Konfetti — nicht ein Dutzend Meldungen im
       Sekundentakt, die das Handy minutenlang zudecken. */
    var fresh = result.fresh;
    if (fresh.length) {
      var openBadges = { label: I.t("nav.achievements"), onClick: function () { App.go("achievements"); } };
      if (fresh.length === 1) {
        var meta = I.badge(fresh[0].id);
        D.toast(I.t("ach.newBadge") + " " + fresh[0].emoji + " " + meta.name, {
          sub: meta.desc + " · +" + fresh[0].xp + " XP",
          tone: "plus", icon: "trophy", duration: 5200, action: openBadges
        });
      } else {
        var xp = fresh.reduce(function (sum, b) { return sum + (b.xp || 0); }, 0);
        var emojis = fresh.slice(0, 5).map(function (b) { return b.emoji; }).join(" ");
        D.toast(I.t("ach.newBadges", { n: fresh.length }), {
          sub: emojis + (fresh.length > 5 ? " …" : "") + " · +" + xp + " XP",
          tone: "plus", icon: "trophy", duration: 6500, action: openBadges
        });
      }
      if (App.settings().confetti !== false) D.confetti({ count: fresh.length > 1 ? 90 : 70 });
    }
    return result;
  };

  /* ================================================================== */
  /* Erinnerungen und Benachrichtigungen                                 */
  /* ================================================================== */

  var LEAVE_TAG = "zeitkonto-feierabend";
  var reminderTimer = null;
  var reminderFiredFor = null;
  var reminderSnooze = null;     // { iso, at } nach „+15 min“
  var reminderToast = null;
  var reminderShown = false;     // Systembenachrichtigung steht noch

  App.scheduleReminder = function () {
    clearTimeout(reminderTimer);
    reminderTimer = null;
    // Der Pausen-Timer hängt am selben Takt: nach jeder Änderung abgleichen
    if (ZK.BreakTimer && ZK.BreakTimer.sync) {
      try { ZK.BreakTimer.sync(App); } catch (e) { if (root.console) console.error(e); }
    }
    var s = App.settings();
    var iso = App.activeStampDate();
    var res = App.day(iso);
    if (!res.running) endLeaveReminder();          // gegangen: Erinnerung erledigt
    if (!s.reminderEnabled) return;
    if (!res.running || res.recommendedLeaveTl === null) return;

    var delay;
    if (reminderSnooze && reminderSnooze.iso === iso) {
      delay = Math.max(0, reminderSnooze.at - Date.now());
    } else {
      if (reminderFiredFor === iso) return;
      // 0 heisst „genau zur Zeit“, nur ein fehlender Wert fällt auf 10 zurück
      var lead = s.reminderLeadMinutes == null ? 10 : s.reminderLeadMinutes;
      var fireAt = res.recommendedLeaveTl - lead;
      var nowMin = T.nowMinutesFloat() + (res.overnight ? T.DAY : 0);
      var deltaMin = fireAt - nowMin;
      if (deltaMin <= 0 || deltaMin > 16 * 60) return;
      delay = deltaMin * 60 * 1000;
    }
    reminderTimer = setTimeout(function () { fireLeaveReminder(iso); }, delay);
  };

  /* Ohne Erlaubnis für Systembenachrichtigungen bleibt die Meldung in der
     App. Gerechnet wird beim Auslösen neu — eine Pause dazwischen schiebt
     den Feierabend. */
  function fireLeaveReminder(iso) {
    reminderTimer = null;
    reminderFiredFor = iso;
    reminderSnooze = null;
    var res = App.day(iso);
    if (!res.running || res.recommendedLeaveTl === null) return;
    var nowTl = T.nowMinutesFloat() + (res.overnight ? T.DAY : 0);
    var leaveTl = ZK.TodayState.leave(res, nowTl).leaveTl;
    var inMin = Math.max(0, Math.ceil(leaveTl - nowTl));
    var leave = T.formatHHMM(leaveTl);
    var front = pageInFront();

    if (App.settings().soundEnabled && ZK.BreakTimer && ZK.BreakTimer.chime) ZK.BreakTimer.chime();
    if (!front && ZK.BreakTimer) {
      reminderShown = true;
      App.notify(ZK.BreakTimer.notice("leave", { iso: iso, now: Date.now(), leave: leave, inMin: inMin }, { t: I.t, dur: App.fmt }));
    }
    if (reminderToast) reminderToast();
    reminderToast = D.toast(I.t("day.recommendedLeave") + " " + leave, {
      sub: inMin > 0 ? I.t("bt.leaveSoon", { v: App.fmt(inMin) }) : I.t("toast.goalReached"),
      tone: "plus", icon: "bell", duration: 15000,
      sticky: !front,              // wer gerade woanders ist, findet sie bei der Rückkehr
      action: { label: I.t("day.stampOut"), onClick: function () { App.stamp("out"); } },
      onDismiss: function () { reminderToast = null; }
    });
  }

  function endLeaveReminder() {
    reminderSnooze = null;
    if (reminderToast) { reminderToast(); reminderToast = null; }
    if (reminderShown) { reminderShown = false; App.closeNotice(LEAVE_TAG); }
  }

  /** „+15 min“ an der Feierabend-Erinnerung */
  function snoozeLeave(iso, minutes) {
    reminderSnooze = { iso: iso, at: Date.now() + minutes * 60000 };
    if (reminderToast) { reminderToast(); reminderToast = null; }
    App.scheduleReminder();
    D.toast(I.t("bt.snoozed", { n: minutes }), { icon: "bell" });
  }

  /* ---- Systembenachrichtigungen ---------------------------------------
     Chrome auf Android kennt new Notification() nicht („Illegal
     constructor“): dort geht es nur über den Serviceworker
     (registration.showNotification) — der trägt auch die Knöpfe „Gehen
     stempeln“ und „+15 min“, und sw.js reicht einen Klick hierher zurück.
     Ohne Serviceworker auf dem Desktop die klassische Notification (ohne
     Knöpfe), sonst bleibt es bei der Meldung in der App. Ohne Push-Server
     gilt alles nur, solange die App offen ist (auch im Hintergrund-Tab). */
  var pageNotices = {};

  function swActive() {
    // Firefox im privaten Fenster wirft schon beim Zugriff
    try { return "serviceWorker" in navigator && !!navigator.serviceWorker.controller; } catch (e) { return false; }
  }

  /** Sieht man das Fenster gerade? Dann genügt die Meldung in der App. */
  function pageInFront() {
    if (document.visibilityState && document.visibilityState !== "visible") return false;
    try { return typeof document.hasFocus !== "function" || document.hasFocus(); } catch (e) { return true; }
  }

  /**
   * n: { tag, title, body, actions: [{ action, title }], data } — siehe
   * ZK.BreakTimer.notice. → Promise<"sw" | "page" | "none">
   */
  App.notify = function (n) {
    var api = typeof Notification !== "undefined";
    var via = !ZK.BreakTimer ? "none" : ZK.BreakTimer.channel({
      api: api,
      permission: api ? Notification.permission : "unsupported",
      sw: swActive(),
      mobile: !!((navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""))
    });
    var opts = {
      body: n.body || "", tag: n.tag, renotify: true, data: n.data || {},
      icon: "assets/icons/icon-192.png", lang: I.getLang()
    };
    if (via === "sw") {
      opts.actions = n.actions || [];
      return navigator.serviceWorker.ready
        .then(function (reg) { return reg.showNotification(n.title, opts); })
        .then(function () { return "sw"; }, function () { return "none"; });
    }
    if (via === "page") {
      try {
        var note = new Notification(n.title, opts);
        pageNotices[n.tag] = note;
        note.onclick = function () {
          try { root.focus(); } catch (e) { /* egal */ }
          note.close();
          App.handleNotificationAction("", n.data);
        };
        return Promise.resolve("page");
      } catch (e) { /* Android ohne Serviceworker: „Illegal constructor“ */ }
    }
    return Promise.resolve("none");
  };

  /** Erledigte Benachrichtigung zurückziehen (Pause beendet, gegangen). */
  App.closeNotice = function (tag) {
    var note = pageNotices[tag];
    if (note) {
      delete pageNotices[tag];
      try { note.close(); } catch (e) { /* schon zu */ }
    }
    if (!swActive()) return;
    navigator.serviceWorker.ready
      .then(function (reg) { return reg.getNotifications ? reg.getNotifications({ tag: tag }) : []; })
      .then(function (list) { list.forEach(function (x) { x.close(); }); })
      .catch(function () { /* nichts zu schliessen */ });
  };

  /**
   * Knopf oder Klick aus einer Benachrichtigung. Erst prüfen, ob er noch
   * passt (ZK.BreakTimer.route) — eine alte Meldung darf nicht stempeln.
   * info: { kind, date } aus der Benachrichtigung.
   */
  App.handleNotificationAction = function (action, info) {
    info = info || {};
    var iso = App.activeStampDate();
    var res = App.day(iso);
    var BT = ZK.BreakTimer;
    var r = BT ? BT.route(action, info, { date: iso, running: !!res.running, onBreak: !!(res.running && res.openBreak) }) : { open: true };
    if (r.snooze) {
      // „+15 min“ holt die App nicht nach vorne und wechselt keine Ansicht
      if (r.kind === "break") { if (BT.snoozeBreak) BT.snoozeBreak(r.snooze); }
      else snoozeLeave(iso, r.snooze);
      return;
    }
    if (App.view !== "today" || App.date !== iso) App.setDate(iso, { view: "today" });
    if (r.stamp) App.stamp(r.stamp);               // mit „Rückgängig“ in der Meldung
    else if (r.skip) D.toast(I.t("bt.skip." + r.skip), { tone: "warn", icon: "info" });
  };

  /* Nachrichten von sw.js: ein Knopf in einer Benachrichtigung wurde
     gedrückt. Ein frisch geöffnetes Fenster startet erst noch. */
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener("message", function (e) {
        var d = e.data;
        if (!d || d.type !== "notification-action") return;
        (function run() {
          if (!App.booted) { setTimeout(run, 120); return; }
          App.handleNotificationAction(String(d.action || ""), { kind: d.kind, date: d.date });
        })();
      });
    }
  } catch (e) { /* ohne Serviceworker keine Knöpfe — die Meldungen in der App bleiben */ }

  /* ================================================================== */
  /* Outlook                                                             */
  /* ================================================================== */

  /**
   * Stiller Abgleich beim Start. Höchstens alle vier Stunden, damit ein
   * Neuladen der Seite nicht jedes Mal eine Anfrage auslöst.
   */
  App.autoSyncOutlook = function () {
    if (!ZK.OutlookSync || !ZK.MsAuth) return;
    var s = ZK.OutlookSync.settingsOf(App);
    if (s.autoSync === false) return;
    if (!ZK.MsAuth.isConfigured() || !ZK.MsAuth.isSignedIn()) return;

    if (s.lastSyncAt) {
      var age = Date.now() - new Date(s.lastSyncAt).getTime();
      if (isFinite(age) && age < 4 * 60 * 60 * 1000) return;
    }
    ZK.OutlookSync.run(App, { silent: true });
  };

  App.syncOutlook = function () {
    if (!ZK.OutlookSync) return;
    ZK.OutlookSync.run(App);
  };

  /**
   * Erinnert daran, eine Sicherung zu ziehen. Der lokale Speicher ist die
   * einzige Kopie — wer Browserdaten löscht, löscht das Zeitkonto mit.
   */
  App.checkBackupReminder = function () {
    var s = App.settings();
    // 0 heisst „nie erinnern“, nur ein fehlender Wert fällt auf 45 zurück
    var afterDays = s.backupReminderDays == null ? 45 : s.backupReminderDays;
    if (!afterDays) return;
    if (store.dayCount() < 15) return;

    var last = s.lastExportAt ? new Date(s.lastExportAt).getTime() : null;
    var reference = last || new Date(store.getMeta().createdAt || Date.now()).getTime();
    var days = Math.floor((Date.now() - reference) / 86400000);
    if (!isFinite(days) || days < afterDays) return;

    D.toast(I.t("toast.backupDue", { n: days }), {
      tone: "warn", icon: "save", duration: 14000,
      action: { label: I.t("toast.backupAction"), onClick: function () { App.exportJSON(); } }
    });
  };

  App.requestNotifications = function () {
    if (typeof Notification === "undefined" || !Notification.requestPermission) return Promise.resolve("unsupported");
    return new Promise(function (resolve) {
      var done = false;
      function finish(p) {
        if (done) return;
        done = true;
        App.scheduleReminder();
        resolve(p || Notification.permission);
      }
      try {
        // Ältere Safari kennen nur den Rückruf, neuere Browser nur das Promise
        var r = Notification.requestPermission(finish);
        if (r && typeof r.then === "function") r.then(finish, function () { finish("denied"); });
      } catch (e) { finish("denied"); }
    });
  };

  /* ================================================================== */
  /* Tastatur                                                            */
  /* ================================================================== */

  /**
   * Steht der Cursor in einem Feld, in dem Tasten Text bedeuten? Ohne
   * Ereignis zählt das fokussierte Element (auch für den Abgleich mit
   * anderen Fenstern, der dann nicht neu zeichnet). Häkchen und Knöpfe
   * zählen nicht, Schieberegler schon (Pfeiltasten).
   */
  function isTyping(e) {
    var n = e && e.target && e.target.nodeType === 1 ? e.target : document.activeElement;
    if (!n) return false;
    if (n.isContentEditable || n.tagName === "TEXTAREA" || n.tagName === "SELECT") return true;
    if (n.tagName !== "INPUT") return false;
    return !/^(checkbox|radio|button|submit|reset|color|file|image)$/i.test(n.type || "text");
  }

  /** Dialog oder Befehlspalette offen? Dann gehören die Tasten ihnen. */
  function overlayOpen() {
    return !!D.qs(".modal-scrim, .palette-scrim");
  }

  /* Die Leertaste stempelt nur, wenn nichts Bedienbares den Fokus hat —
     auf einem Knopf, Chip oder Link muss sie diesen auslösen dürfen. */
  function spaceIsFree(e) {
    var t = e.target;
    return !t || t === document.body || t === document.documentElement || t.id === "viewHost";
  }

  /* Pfeiltasten blättern Tage — ausser in Bedienelementen, die sie selbst
     brauchen (Auswahlgruppen, Listen, Raster, waagrecht scrollende Tabellen). */
  function arrowsAreFree(e) {
    var t = e.target;
    if (!t || !t.closest) return true;
    return !t.closest('[role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"], [role="slider"], [role="grid"], .table-wrap');
  }

  function onKeydown(e) {
    var mod = e.metaKey || e.ctrlKey;
    var key = String(e.key || "").toLowerCase();
    var typing = isTyping(e);

    if (navIsOpen()) {
      if (e.key === "Escape") { e.preventDefault(); closeNav(true); return; }
      if (e.key === "Tab") { trapNavFocus(e); return; }
    }

    if (mod && key === "s") { e.preventDefault(); store.flush(); D.toast(I.t("toast.saved")); return; }
    if (mod && key === "p") return; // Drucken dem Browser überlassen
    if (e.defaultPrevented || e.isComposing || overlayOpen() || navIsOpen()) return;

    if (mod && key === "k") { e.preventDefault(); openPalette(); return; }
    // In Textfeldern gehört Ctrl+Z dem Feld selbst (Tippfehler zurücknehmen)
    if (mod && key === "z" && !e.shiftKey) { if (typing) return; e.preventDefault(); App.undo(); return; }
    if (mod && (key === "y" || (key === "z" && e.shiftKey))) { if (typing) return; e.preventDefault(); App.redo(); return; }

    if (typing || mod || e.altKey) return;

    switch (e.key) {
      case "?": e.preventDefault(); showShortcuts(); break;
      case "t": case "T": if (!e.repeat) { e.preventDefault(); App.toggleTheme(); } break;
      case "h": case "H": e.preventDefault(); App.setDate(T.todayISO(), { view: "today" }); break;
      case "ArrowLeft": if (App.view === "today" && arrowsAreFree(e)) { e.preventDefault(); App.shiftDate(-1); } break;
      case "ArrowRight": if (App.view === "today" && arrowsAreFree(e)) { e.preventDefault(); App.shiftDate(1); } break;
      case " ":
        if (App.view === "today" && spaceIsFree(e)) {
          e.preventDefault();
          if (!e.repeat) App.stamp(App.day(App.activeStampDate()).running ? "out" : "in");
        }
        break;
      case "b": case "B": if (!e.repeat) { e.preventDefault(); App.stamp("break"); } break;
      case ",": e.preventDefault(); App.go("settings"); break;
      case "1": App.go("today"); break;
      case "2": App.go("calendar"); break;
      case "3": App.go("week"); break;
      case "4": App.go("stats"); break;
      case "5": App.go("reports"); break;
      case "6": App.go("achievements"); break;
      case "7": App.go("tools"); break;
    }
  }

  function showShortcuts() {
    var inToday = I.t("kbd.inToday");
    var rows = [
      ["Ctrl / ⌘ + K", I.t("kbd.palette")],
      [I.t("kbd.space"), I.t("kbd.stamp"), inToday],
      ["B", I.t("day.startBreak") + " / " + I.t("day.endBreak")],
      ["←  →", I.t("kbd.prevDay") + " / " + I.t("kbd.nextDay"), inToday],
      ["H", I.t("kbd.today")],
      ["T", I.t("kbd.theme")],
      ["1 – 7", I.t("cmd.group.nav")],
      [",", I.t("nav.settings")],
      ["Ctrl / ⌘ + Z", I.t("common.undo")],
      ["Ctrl + Y · ⇧ ⌘ Z", I.t("common.redo")],
      ["Ctrl / ⌘ + S", I.t("kbd.save")],
      ["Esc", I.t("kbd.close")],
      ["?", I.t("kbd.help")]
    ];
    var body = D.el("div.kbd-list");
    rows.forEach(function (r) {
      body.appendChild(D.el("div.kbd-row", {
        html: "<span>" + D.esc(r[1]) + (r[2] ? "<small>" + D.esc(r[2]) + "</small>" : "") + "</span>" +
          "<kbd>" + D.esc(r[0]) + "</kbd>"
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

  /* ================================================================== */
  /* Mehrere Fenster                                                     */
  /* ================================================================== */

  /* Ein anderes Fenster hat gespeichert. Während jemand hier tippt, wird
     nicht neu gezeichnet (das würde Fokus und Cursor stehlen) — das holt
     der nächste Fokuswechsel nach. */
  var externalPending = false;
  /* isTyping() steht oben bei der Tastatur — ohne Ereignis prüft es das
     fokussierte Element. */

  function onExternalChange(evt) {
    if (evt.newer) warnNewerVersion();
    if (evt.settings) { App.applyLanguage(); App.applyTheme(); App.applyDensity(); }
    if (isTyping()) { externalPending = true; return; }
    externalPending = false;
    App.renderChrome();
    App.renderView();
    D.toast(I.t("toast.otherWindow"), { icon: "refresh", duration: 2600 });
  }

  document.addEventListener("focusout", function () {
    if (!externalPending) return;
    setTimeout(function () {
      if (!externalPending || isTyping()) return;
      externalPending = false;
      App.renderChrome();
      App.renderView();
    }, 0);
  });

  var newerWarned = false;
  function warnNewerVersion() {
    if (newerWarned) return;
    newerWarned = true;
    D.toast(I.t("toast.newerVersion"), {
      tone: "warn", icon: "refresh", duration: 15000,
      action: { label: I.t("toast.reload"), onClick: function () { store.flush(); location.reload(); } }
    });
  }

  /* ================================================================== */
  /* Dauerhafter Speicher                                                */
  /* ================================================================== */

  /* Ohne diese Zusage darf der Browser localStorage bei Speichermangel
     räumen. Chrome, Edge und Safari entscheiden still; Firefox fragt den
     Nutzer — dort nur auf ausdrücklichen Klick in den Einstellungen. */
  App.storageInfo = { supported: false, persisted: false };

  App.refreshStorageInfo = function () {
    if (!(navigator.storage && navigator.storage.persisted)) return Promise.resolve(App.storageInfo);
    App.storageInfo.supported = true;
    return navigator.storage.persisted().then(function (p) {
      App.storageInfo.persisted = !!p;
      return App.storageInfo;
    }).catch(function () { return App.storageInfo; });
  };

  App.requestPersistence = function (userInitiated) {
    if (!(navigator.storage && navigator.storage.persist)) return Promise.resolve(false);
    var prompts = /firefox/i.test(navigator.userAgent || "");
    if (prompts && !userInitiated) return Promise.resolve(false);
    return navigator.storage.persist().then(function (ok) {
      App.storageInfo.supported = true;
      App.storageInfo.persisted = !!ok;
      return !!ok;
    }).catch(function () { return false; });
  };

  /* ================================================================== */
  /* Beschädigte Daten                                                   */
  /* ================================================================== */

  App.restoreBackup = function (which) {
    var backup = store.readBackup(which);
    if (!backup || !backup.data) return false;
    store.importState(backup.data, "replace");
    store.updateMeta({ recoveredFromCorruption: false, onboarded: true });
    App.applyTheme(); App.applyDensity(); App.applyLanguage();
    App.afterChange();
    D.toast(I.t("toast.restored"), {
      tone: "plus", icon: "check",
      action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
    });
    return true;
  };

  function offerRecovery() {
    var which = store.readBackup() ? "" : "prev";
    var backup = store.readBackup(which);
    var body = D.el("div");
    body.appendChild(D.el("p", { text: I.t("recover.text"), style: { marginBottom: "12px", lineHeight: "1.55" } }));
    body.appendChild(D.el("p.muted", {
      text: backup ? I.t("recover.backup", { date: I.formatDate(backup.at.slice(0, 10), { day: "numeric", month: "long", year: "numeric" }), n: backup.days })
        : I.t("recover.noBackup"),
      style: { lineHeight: "1.55" }
    }));
    var fresh = D.el("button.btn", { type: "button", text: I.t("recover.fresh") });
    var download = D.el("button.btn", { type: "button", html: D.icon("download") + "<span>" + D.esc(I.t("recover.download")) + "</span>" });
    var footer = [fresh, download];
    var restore = null;
    if (backup) {
      restore = D.el("button.btn.primary", { type: "button", html: D.icon("refresh") + "<span>" + D.esc(I.t("recover.restore")) + "</span>" });
      footer.push(restore);
    }
    var m = D.modal({ title: I.t("recover.title"), body: body, footer: footer, size: "slim" });
    fresh.addEventListener("click", function () {
      store.updateMeta({ recoveredFromCorruption: false });
      m.close();
      App.runOnboarding();
    });
    download.addEventListener("click", function () {
      D.download("zeitkonto-rohdaten.txt", store.readCorrupt() || "", "text/plain");
    });
    if (restore) restore.addEventListener("click", function () { m.close(); App.restoreBackup(which); });
  }

  /* ---- Speicher voll ------------------------------------------------
     Solange der Browser nichts mehr annimmt, gehen neue Eingaben beim
     Schliessen verloren. Das darf nicht nach ein paar Sekunden
     verschwinden: die Warnung bleibt stehen, bis wieder Platz ist oder
     man sie wegklickt, und bietet direkt den Export an. */
  var storageFullDismiss = null;

  function showStorageFull() {
    if (storageFullDismiss) return;
    storageFullDismiss = D.toast(I.t("toast.storageFull"), {
      sub: I.t("toast.storageFullSub"),
      tone: "minus", icon: "alert", sticky: true,
      action: { label: I.t("set.exportAll"), onClick: function () { App.exportJSON(); } },
      onDismiss: function () { storageFullDismiss = null; }
    });
  }

  function setupServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;   // lokal geöffnete Datei braucht keinen SW
    if (root.ZK_SINGLE_FILE) return;             // die Einzeldatei trägt alles schon in sich
    /* Eine neue Version kann auf drei Wegen auftauchen: während register()
       noch läuft (der neue Worker ist dann schon installiert oder hat dank
       skipWaiting bereits übernommen), später über updatefound, oder als
       Wechsel des steuernden Workers. Wer zuerst kommt, meldet — einmal.
       Beim allerersten Besuch gab es keinen alten Worker, also nichts zu melden. */
    var hadController = !!navigator.serviceWorker.controller;
    var announced = false;
    function announceUpdate() {
      if (announced || !hadController) return;
      announced = true;
      // Wird die App das nächste Mal verlassen, lädt sie still die neue Version
      App.updateReady = true;
      D.toast(I.t("toast.updateReady"), {
        icon: "refresh",
        duration: 12000,
        action: { label: I.t("toast.reload"), onClick: function () { store.flush(); location.reload(); } }
      });
    }
    function watchWorker(sw) {
      if (!sw) return;
      if (sw.state === "installed" || sw.state === "activating" || sw.state === "activated") { announceUpdate(); return; }
      sw.addEventListener("statechange", function () {
        if (sw.state === "installed" || sw.state === "activated") announceUpdate();
      });
    }
    navigator.serviceWorker.addEventListener("controllerchange", announceUpdate);
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      if (reg.waiting) announceUpdate();
      else if (reg.installing) watchWorker(reg.installing);
      reg.addEventListener("updatefound", function () { watchWorker(reg.installing); });
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
    dataRev++;

    /* Erster Start: Die Standardeinstellungen tragen schon „de“, ohne dass
       das jemand gewählt hat. Solange weder die Einrichtung durchlaufen
       noch ein Tag erfasst ist, gilt deshalb die Sprache des Browsers —
       auch für die Einrichtung selbst. */
    var s = store.getSettings();
    var firstRun = !store.getMeta().onboarded && store.dayCount() === 0;
    if (!s.lang || firstRun) {
      var detected = I.detect();
      if (detected !== s.lang) store.updateSettings({ lang: detected });
    }

    App.applyLanguage(store.getSettings().lang);
    App.applyTheme();
    App.applyDensity();

    /* Rückkehr von der Microsoft-Anmeldung zuerst abfangen: handleRedirect()
       räumt die Adresszeile sofort auf, deshalb liest readHash() danach
       bereits das wiederhergestellte Ziel. */
    var authFlow = null;
    if (ZK.OutlookSync && ZK.MsAuth) {
      ZK.OutlookSync.configure(App);
      if (ZK.MsAuth.hasRedirect()) authFlow = ZK.MsAuth.handleRedirect();
    }

    var linkAction = takeLinkAction();
    var dateFromHash = readHash();
    // Läuft eine Nachtschicht vom Vortag, zeigt „Heute“ diese Schicht
    if (!dateFromHash && App.activeStampDate() !== App.date) App.date = App.activeStampDate();

    if (mediaDark && mediaDark.addEventListener) {
      mediaDark.addEventListener("change", function () {
        if (App.settings().theme === "auto") { App.applyTheme(); App.renderChrome(); App.renderView(); }
      });
    }

    window.addEventListener("hashchange", function () {
      var action = takeLinkAction();
      if (!action) readHash();
      App.renderChrome();
      App.renderView();
      if (action) App.runLinkAction(action);
    });

    document.addEventListener("keydown", onKeydown);

    window.addEventListener("beforeunload", function () { store.flush(); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        store.flush();
        // Neue Version im Hintergrund übernehmen: gespeichert ist alles,
        // Ansicht und Datum stehen in der Adresse — der Wechsel ist unsichtbar.
        if (App.updateReady && !isTyping()) { App.updateReady = false; location.reload(); }
      }
      else { App.renderChrome(); if (App.view === "today") App.renderView(); }
    });

    window.addEventListener("online", function () { D.toast(I.t("toast.online"), { tone: "plus", icon: "check" }); });
    window.addEventListener("offline", function () { D.toast(I.t("toast.offline"), { tone: "warn" }); });

    store.subscribe(function (evt) {
      if (evt.type === "error") {
        if (evt.quota || (store.isFull && store.isFull())) showStorageFull();
        else D.toast(I.t("toast.storageFull"), { tone: "minus", duration: 9000 });
      } else if (storageFullDismiss && store.isFull && !store.isFull()) {
        // Wieder Platz: die Warnung hat sich erledigt
        storageFullDismiss();
        storageFullDismiss = null;
      }
      if (evt.type === "external") onExternalChange(evt);
      if (evt.type === "locked" && ZK.ClosingUI) ZK.ClosingUI.onLocked(App, evt);
    });
    if (store.isNewerSchema()) warnNewerVersion();
    if (store.isFull && store.isFull()) setTimeout(showStorageFull, 400);

    /* Diagramme skalieren über viewBox von selbst. Neu gezeichnet wird nur,
       wenn sich die Breite ändert — nicht, wenn auf dem Handy die
       Adressleiste ein- und ausfährt oder die Tastatur aufgeht. */
    var lastWidth = window.innerWidth;
    var resizeRedraw = D.debounce(function () {
      var w = window.innerWidth;
      if (w === lastWidth) return;
      lastWidth = w;
      if (w > 1000 && navIsOpen()) closeNav(false);
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

    if (authFlow) {
      authFlow.then(function (result) {
        if (!result) return;
        App.renderChrome();
        App.renderView();
        D.toast(I.t("ol.signedInAs", { name: (result.account && result.account.name) || "" }), {
          tone: "plus", icon: "check"
        });
        // Direkt nach dem Verbinden lohnt sich der erste Abgleich
        setTimeout(function () { ZK.OutlookSync.run(App); }, 500);
      }).catch(function (err) {
        D.toast(String(err && err.message ? err.message : err), { tone: "minus", duration: 9000 });
      });
    }

    if (linkAction) setTimeout(function () { App.runLinkAction(linkAction); }, 60);

    setTimeout(function () {
      if (store.dayCount() > 0) App.requestPersistence(false);
      else App.refreshStorageInfo();
      if (store.getMeta().recoveredFromCorruption) offerRecovery();
      else App.runOnboarding();
      App.checkAchievements();
      App.scheduleReminder();
      store.makeBackup();
      App.autoSyncOutlook();
      App.checkBackupReminder();
    }, 320);
  };

  ZK.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { App.boot(); });
  } else {
    App.boot();
  }
})(typeof self !== "undefined" ? self : this);
