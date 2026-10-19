/* ==========================================================================
   ZEITKONTO — Erfolge & Serien
   --------------------------------------------------------------------------
   Zeiterfassung ist Pflichtprogramm. Ein bisschen Spiel macht daraus eine
   Gewohnheit: Serien, Abzeichen, Stufen. Alles rein lokal berechnet, ohne
   Ranglisten und ohne Vergleich mit anderen.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"), require("./engine.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Achievements = factory(root.ZK.Time, root.ZK.Rules, root.ZK.Engine);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R, E) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Kennzahlen über den gesamten Datenbestand                           */
  /* ------------------------------------------------------------------ */
  function buildStats(records, settings, now) {
    var s = settings || R.defaultSettings();
    var today = T.todayISO(now);
    records = records || {};
    // Geplantes (Ferien im Dezember) ist noch keine Leistung: nur bis heute.
    var keys = Object.keys(records).filter(function (iso) { return iso <= today; }).sort();

    /* Jeder Tag wird höchstens einmal gerechnet — Monate, Wochen und Serien
       greifen auf denselben Zwischenspeicher zu. */
    var memo = Object.create(null);
    function day(iso) {
      if (!memo[iso]) memo[iso] = E.computeDay(records[iso] || { date: iso }, { settings: s, now: now, isToday: iso === today });
      return memo[iso];
    }
    /*
       Status eines Tages für Serien, Monate und Wochen:
         "skip"    zählt nicht und unterbricht nicht: arbeitsfrei, Zukunft,
                   ein Feiertag ohne eigenen Eintrag, oder heute noch offen
         "done"    erfasst
         "missing" Arbeitstag ohne Erfassung — unterbricht
    */
    function status(iso) {
      if (iso > today) return "skip";
      var r = day(iso);
      if (r.target <= 0) return "skip";
      var rec = records[iso];
      var own = !!rec && (r.complete || r.running || !!(rec.type && R.DAY_TYPES[rec.type]) || !!r.note ||
        (rec.targetOverride !== null && rec.targetOverride !== undefined));
      if (r.type === "holiday" && !own) return "skip";
      if (rec && r.recorded) return "done";
      return iso === today ? "skip" : "missing";
    }
    /** Arbeitstag, der noch kommt (oder heute noch offen ist): Woche/Monat sind dann nicht fertig. */
    function pending(iso) {
      if (iso < today) return false;
      var r = day(iso);
      if (r.target <= 0) return false;
      if (iso > today) return !(r.type === "holiday" && !records[iso]);
      return status(iso) === "skip" && r.type !== "holiday";
    }

    var st = {
      recordedDays: 0,
      workedDays: 0,
      totalNet: 0,
      totalBalance: 0,
      earlyBirds: 0,       // Start vor 07:00
      nightOwls: 0,        // Ende nach 19:00
      breakCompliant: 0,   // Pflichtpause selbst erfasst
      noAutoDeduct: 0,
      notes: 0,
      homeOffice: 0,
      vacationDays: 0,
      longDays: 0,         // > 10 h netto
      onTimeLeaves: 0,     // ± 15 min zur Empfehlung
      perfectWeeks: 0,
      completeMonths: 0,
      zenMonths: 0,        // Monatssaldo innerhalb ± 60 min
      currentStreak: 0,
      bestStreak: 0,
      firstDate: keys[0] || null,
      lastDate: keys[keys.length - 1] || null,
      distinctMonths: 0,
      types: {}
    };

    var weeks = {};
    var byMonth = {};

    keys.forEach(function (iso) {
      var r = day(iso);
      if (!r.recorded) return;

      st.recordedDays++;
      st.totalNet += r.net;
      if (!r.running) st.totalBalance += r.balance;   // abgerechnet, wie das Konto
      st.types[r.type] = (st.types[r.type] || 0) + 1;

      if (r.net > 0) st.workedDays++;
      if (r.startTod !== null && r.startTod < 7 * 60 && r.net > 0) st.earlyBirds++;
      if (r.endTl !== null && (r.endTl % T.DAY) >= 19 * 60 && r.net > 0) st.nightOwls++;
      if (r.net > 10 * 60) st.longDays++;
      if (r.note) st.notes++;
      if (r.location === "home") st.homeOffice++;
      if (r.type === "vacation") st.vacationDays += r.absenceFactor;
      // Bezahlte Pausen zählen fürs Gesetz mit (legalBreak).
      if (r.presence > 0 && (r.legalBreak !== undefined ? r.legalBreak : r.breakTotal) >= r.requiredBreak) st.breakCompliant++;
      if (r.autoDeducted === 0 && r.presence > 0) st.noAutoDeduct++;
      if (r.complete && r.recommendedLeaveTl !== null && Math.abs(r.endTl - r.recommendedLeaveTl) <= 15) st.onTimeLeaves++;

      weeks[T.startOfWeek(iso, 1)] = true;
      (byMonth[T.monthKey(iso)] = byMonth[T.monthKey(iso)] || []).push(r);
    });

    st.distinctMonths = Object.keys(byMonth).length;

    /* Perfekte Woche: jeder Arbeitstag der Woche (Mo–So) erfasst, kein
       Arbeitstag steht mehr aus, mindestens vier Arbeitstage und
       Wochensaldo ≥ 0. Feiertage ohne Eintrag zählen weder dafür noch
       dagegen. */
    Object.keys(weeks).forEach(function (monday) {
      var days = T.rangeDays(monday, T.addDays(monday, 6));
      if (days.some(pending)) return;              // Woche läuft noch
      var done = 0, missing = 0, bal = 0;
      days.forEach(function (iso) {
        var stt = status(iso);
        if (stt === "done") done++;
        else if (stt === "missing") missing++;
        if (day(iso).recorded) bal += day(iso).balance;
      });
      if (!missing && done >= 4 && bal >= 0) st.perfectWeeks++;
    });

    /* Vollständiger Monat + „Zen“-Monat (Saldo nahe null): kein
       Arbeitstag steht mehr aus, und jeder ist erfasst. */
    Object.keys(byMonth).forEach(function (mk) {
      var days = byMonth[mk];
      var monthStart = mk + "-01";
      var all = T.rangeDays(monthStart, T.endOfMonth(monthStart));
      if (all.some(pending)) return;
      var needed = 0, have = 0;
      all.forEach(function (iso) {
        var stt = status(iso);
        if (stt === "skip") return;
        needed++;
        if (stt === "done") have++;
      });
      if (needed > 0 && have === needed) {
        st.completeMonths++;
        var bal = days.reduce(function (a, d) { return a + d.balance; }, 0);
        if (Math.abs(bal) <= 60) st.zenMonths++;
      }
    });

    /* Serie: aufeinanderfolgende Arbeitstage mit Erfassung. Freie Tage und
       Feiertage unterbrechen nicht, heute darf noch offen sein. */
    var streak = 0, best = 0;
    var cursor = today;
    var guard = 0;
    while (guard++ < 800) {
      var stc = status(cursor);
      if (stc === "done") streak++;
      else if (stc === "missing") break;
      cursor = T.addDays(cursor, -1);
      if (!st.firstDate || cursor < st.firstDate) break;
    }
    st.currentStreak = streak;

    /* Bestserie über alle Daten */
    if (st.firstDate) {
      var run = 0;
      T.rangeDays(st.firstDate, today).forEach(function (iso) {
        var stt = status(iso);
        if (stt === "done") { run++; if (run > best) best = run; }
        else if (stt === "missing") run = 0;
      });
    }
    st.bestStreak = Math.max(best, st.currentStreak);

    return st;
  }

  /* ------------------------------------------------------------------ */
  /* Abzeichen                                                           */
  /* ------------------------------------------------------------------ */
  /* goal: Zielwert · value(st): aktueller Stand · xp: Belohnung        */

  var BADGES = [
    { id: "first",       emoji: "🚀", xp: 10,  goal: 1,   value: function (s) { return s.recordedDays; } },
    { id: "week1",       emoji: "📅", xp: 20,  goal: 5,   value: function (s) { return s.recordedDays; } },
    { id: "days30",      emoji: "📚", xp: 40,  goal: 30,  value: function (s) { return s.recordedDays; } },
    { id: "days100",     emoji: "🏛️", xp: 90,  goal: 100, value: function (s) { return s.recordedDays; } },
    { id: "days250",     emoji: "🗿", xp: 180, goal: 250, value: function (s) { return s.recordedDays; } },
    { id: "streak5",     emoji: "🔥", xp: 30,  goal: 5,   value: function (s) { return s.bestStreak; } },
    { id: "streak20",    emoji: "🌋", xp: 70,  goal: 20,  value: function (s) { return s.bestStreak; } },
    { id: "streak60",    emoji: "☄️", xp: 150, goal: 60,  value: function (s) { return s.bestStreak; } },
    { id: "perfectWeek", emoji: "✨", xp: 35,  goal: 1,   value: function (s) { return s.perfectWeeks; } },
    { id: "perfect10",   emoji: "💫", xp: 110, goal: 10,  value: function (s) { return s.perfectWeeks; } },
    { id: "fullMonth",   emoji: "🗓️", xp: 60,  goal: 1,   value: function (s) { return s.completeMonths; } },
    { id: "zenMonth",    emoji: "🧘", xp: 80,  goal: 1,   value: function (s) { return s.zenMonths; } },
    { id: "earlyBird",   emoji: "🐓", xp: 30,  goal: 10,  value: function (s) { return s.earlyBirds; } },
    { id: "nightOwl",    emoji: "🦉", xp: 30,  goal: 10,  value: function (s) { return s.nightOwls; } },
    { id: "breakPro",    emoji: "☕", xp: 45,  goal: 30,  value: function (s) { return s.breakCompliant; } },
    { id: "punctual",    emoji: "🎯", xp: 50,  goal: 15,  value: function (s) { return s.onTimeLeaves; } },
    { id: "homeOffice",  emoji: "🏡", xp: 25,  goal: 10,  value: function (s) { return s.homeOffice; } },
    { id: "vacation",    emoji: "🌴", xp: 25,  goal: 5,   value: function (s) { return s.vacationDays; } },
    { id: "marathon",    emoji: "🏃", xp: 40,  goal: 500, value: function (s) { return Math.round(s.totalNet / 60); } },
    { id: "millennium",  emoji: "⛰️", xp: 120, goal: 2000,value: function (s) { return Math.round(s.totalNet / 60); } },
    { id: "chronicler",  emoji: "✍️", xp: 25,  goal: 20,  value: function (s) { return s.notes; } },
    { id: "halfYear",    emoji: "🌗", xp: 90,  goal: 6,   value: function (s) { return s.distinctMonths; } },
    { id: "archivist",   emoji: "💾", xp: 20,  goal: 1,   value: function (s) { return s.exports || 0; } },
    { id: "balanced",    emoji: "⚖️", xp: 60,  goal: 1,   value: function (s) { return Math.abs(s.totalBalance) <= 30 && s.recordedDays >= 20 ? 1 : 0; } }
  ];

  var LEVELS = [0, 40, 110, 220, 380, 600, 900, 1300, 1800, 2500, 3400, 4500];

  function levelOf(xp) {
    var lvl = 1;
    for (var i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) lvl = i + 1;
    var floor = LEVELS[lvl - 1] || 0;
    var ceil = LEVELS[lvl] !== undefined ? LEVELS[lvl] : floor + 1200;
    return {
      level: lvl,
      xp: xp,
      floor: floor,
      ceil: ceil,
      progress: Math.min(1, (xp - floor) / Math.max(1, ceil - floor)),
      toNext: Math.max(0, ceil - xp)
    };
  }

  /**
   * Bewertet alle Abzeichen und liefert neu freigeschaltete zurück.
   * @param {Object} earnedMap  { badgeId: "YYYY-MM-DD" } aus dem Store
   */
  function evaluate(stats, earnedMap, extra) {
    var st = Object.assign({}, stats, extra || {});
    var earned = Object.assign({}, earnedMap || {});
    var list = [];
    var fresh = [];
    var xp = 0;

    BADGES.forEach(function (b) {
      var value = b.value(st) || 0;
      var done = value >= b.goal;
      if (done && !earned[b.id]) {
        earned[b.id] = T.todayISO();
        fresh.push(b);
      }
      if (earned[b.id]) xp += b.xp;
      list.push({
        id: b.id,
        emoji: b.emoji,
        xp: b.xp,
        goal: b.goal,
        value: Math.min(value, b.goal * 3),
        earned: !!earned[b.id],
        earnedAt: earned[b.id] || null,
        progress: Math.min(1, value / b.goal)
      });
    });

    list.sort(function (a, b) {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      return b.progress - a.progress;
    });

    return { badges: list, earned: earned, xp: xp, fresh: fresh, level: levelOf(xp) };
  }

  return {
    BADGES: BADGES,
    LEVELS: LEVELS,
    buildStats: buildStats,
    evaluate: evaluate,
    levelOf: levelOf
  };
});
