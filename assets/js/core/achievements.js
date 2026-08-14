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
    var keys = Object.keys(records || {}).sort();

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

    var byWeek = {};
    var byMonth = {};

    keys.forEach(function (iso) {
      var r = E.computeDay(records[iso], { settings: s, now: now, isToday: iso === today });
      if (!r.recorded) return;

      st.recordedDays++;
      st.totalNet += r.net;
      st.totalBalance += r.balance;
      st.types[r.type] = (st.types[r.type] || 0) + 1;

      if (r.net > 0) st.workedDays++;
      if (r.startTod !== null && r.startTod < 7 * 60 && r.net > 0) st.earlyBirds++;
      if (r.endTl !== null && (r.endTl % T.DAY) >= 19 * 60 && r.net > 0) st.nightOwls++;
      if (r.net > 10 * 60) st.longDays++;
      if (r.note) st.notes++;
      if (r.location === "home") st.homeOffice++;
      if (r.type === "vacation") st.vacationDays += r.absenceFactor;
      if (r.presence > 0 && r.breakTotal >= r.requiredBreak) st.breakCompliant++;
      if (r.autoDeducted === 0 && r.presence > 0) st.noAutoDeduct++;
      if (r.complete && r.recommendedLeaveTl !== null && Math.abs(r.endTl - r.recommendedLeaveTl) <= 15) st.onTimeLeaves++;

      var wk = T.isoWeekYear(iso) + "-W" + T.pad2(T.isoWeek(iso));
      (byWeek[wk] = byWeek[wk] || []).push(r);
      var mk = T.monthKey(iso);
      (byMonth[mk] = byMonth[mk] || []).push(r);
    });

    st.distinctMonths = Object.keys(byMonth).length;

    /* Perfekte Woche: alle Arbeitstage der Woche erfasst und Saldo ≥ 0 */
    Object.keys(byWeek).forEach(function (wk) {
      var days = byWeek[wk];
      var targetDays = days.filter(function (d) { return d.target > 0; });
      if (!targetDays.length) return;
      var allRecorded = targetDays.every(function (d) { return d.recorded; });
      var weekBalance = days.reduce(function (a, d) { return a + d.balance; }, 0);
      if (allRecorded && targetDays.length >= 4 && weekBalance >= 0) st.perfectWeeks++;
    });

    /* Vollständiger Monat + „Zen“-Monat (Saldo nahe null) */
    Object.keys(byMonth).forEach(function (mk) {
      var days = byMonth[mk];
      var monthStart = mk + "-01";
      var all = T.rangeDays(monthStart, T.endOfMonth(monthStart));
      var needed = 0, have = 0;
      all.forEach(function (iso) {
        var r = E.computeDay(records[iso] || { date: iso }, { settings: s, now: now });
        if (r.target > 0) {
          needed++;
          if (records[iso]) have++;
        }
      });
      if (needed > 0 && have === needed) st.completeMonths++;
      var bal = days.reduce(function (a, d) { return a + d.balance; }, 0);
      if (needed > 0 && have === needed && Math.abs(bal) <= 60) st.zenMonths++;
    });

    /* Serie: aufeinanderfolgende Arbeitstage mit vollständiger Erfassung */
    var streak = 0, best = 0;
    var cursor = today;
    var guard = 0;
    // rückwärts laufen, freie Tage überspringen
    while (guard++ < 800) {
      var rec = records[cursor];
      var res = E.computeDay(rec || { date: cursor }, { settings: s, now: now, isToday: cursor === today });
      if (res.target > 0) {
        if (rec && res.recorded) streak++;
        else if (cursor !== today) break;   // heute darf noch offen sein
      }
      cursor = T.addDays(cursor, -1);
      if (st.firstDate && cursor < st.firstDate) break;
    }
    st.currentStreak = streak;

    /* Bestserie über alle Daten */
    if (st.firstDate) {
      var run = 0;
      T.rangeDays(st.firstDate, today).forEach(function (iso) {
        var r = E.computeDay(records[iso] || { date: iso }, { settings: s, now: now, isToday: iso === today });
        if (r.target <= 0) return;                 // freie Tage unterbrechen nicht
        if (records[iso] && r.recorded) { run++; if (run > best) best = run; }
        else if (iso !== today) run = 0;
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
    { id: "days100",     emoji: "🏛", xp: 90,  goal: 100, value: function (s) { return s.recordedDays; } },
    { id: "days250",     emoji: "🗿", xp: 180, goal: 250, value: function (s) { return s.recordedDays; } },
    { id: "streak5",     emoji: "🔥", xp: 30,  goal: 5,   value: function (s) { return s.bestStreak; } },
    { id: "streak20",    emoji: "🌋", xp: 70,  goal: 20,  value: function (s) { return s.bestStreak; } },
    { id: "streak60",    emoji: "☄️", xp: 150, goal: 60,  value: function (s) { return s.bestStreak; } },
    { id: "perfectWeek", emoji: "✨", xp: 35,  goal: 1,   value: function (s) { return s.perfectWeeks; } },
    { id: "perfect10",   emoji: "💫", xp: 110, goal: 10,  value: function (s) { return s.perfectWeeks; } },
    { id: "fullMonth",   emoji: "🗓", xp: 60,  goal: 1,   value: function (s) { return s.completeMonths; } },
    { id: "zenMonth",    emoji: "🧘", xp: 80,  goal: 1,   value: function (s) { return s.zenMonths; } },
    { id: "earlyBird",   emoji: "🐓", xp: 30,  goal: 10,  value: function (s) { return s.earlyBirds; } },
    { id: "nightOwl",    emoji: "🦉", xp: 30,  goal: 10,  value: function (s) { return s.nightOwls; } },
    { id: "breakPro",    emoji: "☕", xp: 45,  goal: 30,  value: function (s) { return s.breakCompliant; } },
    { id: "punctual",    emoji: "🎯", xp: 50,  goal: 15,  value: function (s) { return s.onTimeLeaves; } },
    { id: "homeOffice",  emoji: "🏡", xp: 25,  goal: 10,  value: function (s) { return s.homeOffice; } },
    { id: "vacation",    emoji: "🌴", xp: 25,  goal: 5,   value: function (s) { return s.vacationDays; } },
    { id: "marathon",    emoji: "🏃", xp: 40,  goal: 500, value: function (s) { return Math.round(s.totalNet / 60); } },
    { id: "millennium",  emoji: "⛰", xp: 120, goal: 2000,value: function (s) { return Math.round(s.totalNet / 60); } },
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
