/* ==========================================================================
   ZEITKONTO — Regelwerk
   --------------------------------------------------------------------------
   Tagesarten, gesetzliche Pausenregeln, Arbeitsmodelle und Standardwerte.
   Alles hier ist Daten + reine Funktionen, damit die Engine testbar bleibt.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ZK = root.ZK || {}; root.ZK.Rules = factory(); }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  /* ==================================================================== */
  /* TAGESARTEN                                                            */
  /* ==================================================================== */
  /*
     targetFactor : Anteil der Sollzeit, der für diesen Tag überhaupt gilt.
                    0 bedeutet: der Tag hat kein Soll (z. B. unbezahlt frei).
     credits      : true  -> die Sollzeit wird gutgeschrieben, ohne dass
                            gearbeitet werden muss (Ferien, Krankheit …).
                    false -> es zählt nur echte Arbeitszeit (Kompensation
                            erzeugt damit bewusst ein Minus).
     countsAsWork : true  -> die Zeit fließt in Arbeitszeit-Statistiken ein.
     usesQuota    : Kontingent, das der Tag verbraucht ("vacation" …).
  */
  var DAY_TYPES = {
    work:     { key: "work",     color: "var(--type-work)",     targetFactor: 1, credits: false, countsAsWork: true,  usesQuota: null,       stampable: true,  icon: "briefcase" },
    training: { key: "training", color: "var(--type-training)", targetFactor: 1, credits: true,  countsAsWork: true,  usesQuota: null,       stampable: true,  icon: "book" },
    vacation: { key: "vacation", color: "var(--type-vacation)", targetFactor: 1, credits: true,  countsAsWork: false, usesQuota: "vacation", stampable: false, icon: "palm" },
    holiday:  { key: "holiday",  color: "var(--type-holiday)",  targetFactor: 1, credits: true,  countsAsWork: false, usesQuota: null,       stampable: true,  icon: "star" },
    sick:     { key: "sick",     color: "var(--type-sick)",     targetFactor: 1, credits: true,  countsAsWork: false, usesQuota: "sick",     stampable: false, icon: "pulse" },
    accident: { key: "accident", color: "var(--type-accident)", targetFactor: 1, credits: true,  countsAsWork: false, usesQuota: "sick",     stampable: false, icon: "bandage" },
    military: { key: "military", color: "var(--type-military)", targetFactor: 1, credits: true,  countsAsWork: false, usesQuota: null,       stampable: false, icon: "shield" },
    comp:     { key: "comp",     color: "var(--type-comp)",     targetFactor: 1, credits: false, countsAsWork: false, usesQuota: null,       stampable: false, icon: "swap" },
    unpaid:   { key: "unpaid",   color: "var(--type-unpaid)",   targetFactor: 0, credits: false, countsAsWork: false, usesQuota: null,       stampable: false, icon: "minus" },
    free:     { key: "free",     color: "var(--type-free)",     targetFactor: 0, credits: false, countsAsWork: false, usesQuota: null,       stampable: true,  icon: "moon" }
  };

  var DAY_TYPE_ORDER = ["work", "homeoffice_hint", "vacation", "comp", "sick", "accident", "holiday", "training", "military", "unpaid", "free"]
    .filter(function (k) { return DAY_TYPES[k]; });

  function dayType(key) { return DAY_TYPES[key] || DAY_TYPES.work; }

  /* ==================================================================== */
  /* ARBEITSORTE                                                           */
  /* ==================================================================== */
  var LOCATIONS = ["office", "home", "field", "travel"];

  /* ==================================================================== */
  /* PAUSENREGELN                                                          */
  /* ==================================================================== */
  /*
     Staffeln beziehen sich auf die ARBEITSZEIT ohne Pausen — so steht es in
     ArG Art. 15, ArbZG §4 und AZG §11. Wer 5 h 40 anwesend ist, braucht
     deshalb nur 10 min Pause (Arbeitszeit dann 5 h 30, Beispiel aus der
     SECO-Wegleitung), nicht 15. Die Umrechnung auf die Anwesenheit macht
     minBreakFor(); die Engine rechnet nur noch damit.
     `over` in Minuten, `require` = Mindestpause in Minuten.
     Quelle CH: ArG Art. 15 · DE: ArbZG §4 · AT: AZG §11
     Ohne Gewähr — die Regeln lassen sich in den Einstellungen frei anpassen.
  */
  var BREAK_RULESETS = {
    ch: {
      key: "ch",
      label: "Schweiz (ArG Art. 15)",
      tiers: [
        { over: 5 * 60 + 30, require: 15 },
        { over: 7 * 60,      require: 30 },
        { over: 9 * 60,      require: 60 }
      ]
    },
    de: {
      key: "de",
      label: "Deutschland (ArbZG §4)",
      tiers: [
        { over: 6 * 60, require: 30 },
        { over: 9 * 60, require: 45 }
      ]
    },
    at: {
      key: "at",
      label: "Österreich (AZG §11)",
      tiers: [
        { over: 6 * 60, require: 30 }
      ]
    },
    fixed30: {
      key: "fixed30",
      label: "Pauschal 30 Minuten",
      tiers: [{ over: 0, require: 30 }]
    },
    none: {
      key: "none",
      label: "Keine Vorgabe",
      tiers: []
    }
  };

  /** Staffeln eines Regelwerks; eigene Staffeln werden auf Zahlen geprüft. */
  function tiersOf(rulesetKey, customTiers) {
    var raw = rulesetKey === "custom"
      ? (customTiers || [])
      : ((BREAK_RULESETS[rulesetKey] || BREAK_RULESETS.ch).tiers);
    return raw.filter(function (t) {
      return t && isFinite(t.over) && isFinite(t.require) && +t.over >= 0 && +t.require > 0;
    }).map(function (t) { return { over: +t.over, require: +t.require }; });
  }

  /**
   * Gesetzlich erforderliche Pause für eine ARBEITSZEIT (ohne Pausen).
   * `custom` erlaubt eigene Staffeln (Array wie in BREAK_RULESETS).
   */
  function requiredBreak(workMinutes, rulesetKey, customTiers) {
    var tiers = tiersOf(rulesetKey, customTiers);
    var required = 0;
    for (var i = 0; i < tiers.length; i++) {
      if (workMinutes > tiers[i].over) required = Math.max(required, tiers[i].require);
    }
    return required;
  }

  /**
   * Kleinste Pause, die bei dieser Anwesenheit (Arbeit + Pausen) genügt:
   * die kleinste Pause P mit P >= requiredBreak(anwesenheit - P).
   * Weil die Anforderung mit wachsender Pause nur sinken kann, liegt das
   * Minimum immer auf einem der Kandidaten „0“, „Stufenpause“ oder
   * „Pause, mit der die Arbeitszeit genau auf einer Schwelle landet“ —
   * also kein Iterieren und kein Pendeln zwischen zwei Stufen.
   * 5 h 40 anwesend → 10 min · 9 h 40 → 40 min (Arbeitszeit bleibt 9 h).
   */
  function minBreakFor(presenceMinutes, rulesetKey, customTiers) {
    var p = +presenceMinutes;
    if (!(p > 0)) return 0;
    var tiers = tiersOf(rulesetKey, customTiers);
    var cands = [0];
    tiers.forEach(function (t) { cands.push(t.require, p - t.over); });
    cands = cands.filter(function (c) { return c >= 0; }).sort(function (a, b) { return a - b; });
    for (var i = 0; i < cands.length; i++) {
      if (cands[i] >= requiredBreak(p - cands[i], rulesetKey, customTiers)) return Math.min(cands[i], p);
    }
    return 0;
  }

  /** Nächste Pausenstufe (für den Hinweis „ab 07:15 brauchst du 30 min“). Erwartet die Arbeitszeit. */
  function nextBreakTier(workMinutes, rulesetKey, customTiers) {
    var tiers = tiersOf(rulesetKey, customTiers).sort(function (a, b) { return a.over - b.over; });
    for (var i = 0; i < tiers.length; i++) {
      if (workMinutes <= tiers[i].over) return tiers[i];
    }
    return null;
  }

  function roundBy(minutes, step, mode) {
    if (!step || step <= 1) return Math.round(minutes);
    var q = minutes / step;
    if (mode === "up") return Math.ceil(q) * step;
    if (mode === "down") return Math.floor(q) * step;
    return Math.round(q) * step;
  }

  /**
   * Netto einer Anwesenheit nach Pausenrecht.
   * @param {Number} presence  Anwesenheit in Minuten
   * @param {Object} br        { unpaid, paid } erfasste Pausenminuten innerhalb der Anwesenheit
   * @param {Object} s         { breakRuleset, customBreakTiers, autoDeductBreak }
   * Bezahlte Pausen bleiben Arbeitszeit fürs Konto, zählen aber für die
   * Pflichtpause mit — eine Pause ist eine Pause, egal wer sie bezahlt.
   * Abgezogen wird nur der unbezahlte Teil plus ein allfälliges Manko.
   */
  function netOf(presence, br, s) {
    s = s || {};
    var p = Math.max(0, presence || 0);
    var unpaid = Math.max(0, (br && br.unpaid) || 0);
    var paid = Math.max(0, (br && br.paid) || 0);
    var required = p > 0 ? minBreakFor(p, s.breakRuleset, s.customBreakTiers) : 0;
    var shortfall = Math.max(0, required - unpaid - paid);
    var auto = s.autoDeductBreak !== false ? shortfall : 0;
    return {
      net: Math.max(0, p - unpaid - auto),
      required: required,
      shortfall: shortfall,
      autoDeducted: auto,
      deducted: unpaid + auto
    };
  }

  /**
   * Kleinste Anwesenheit, nach der (gerundet) mindestens `needNet` Netto
   * bleiben. Grundlage für „Gehen um …“ in Engine und Planer.
   * @param {Number} needNet
   * @param {Object} s        wie netOf, dazu roundStep / roundMode
   * @param {Object|Function} breaksAt  { unpaid, paid } fest — oder
   *        function(g) -> { unpaid, paid } innerhalb der ersten g Minuten
   *        (für Pausen, die erst später am Tag liegen).
   * @returns {{ gross, net, deducted }}
   */
  function presenceForNet(needNet, s, breaksAt) {
    s = s || {};
    var need = Math.max(0, Math.round(needNet || 0));
    var at = typeof breaksAt === "function" ? breaksAt : function () { return breaksAt || {}; };
    // Kleinstes Roh-Netto, das nach der Rundung reicht.
    var raw = need;
    if (s.roundStep > 1) {
      raw = Math.max(0, need - s.roundStep);
      while (roundBy(raw, s.roundStep, s.roundMode) < need) raw++;
    }
    /* Netto wächst mit der Anwesenheit monoton, pro Minute höchstens um 1
       (bei bezahlten Pausen um 2: die Minute zählt als Arbeit UND deckt die
       Pflichtpause). Wer um das Manko geteilt durch diese Steigung
       vorrückt, schiesst nie über das Minimum hinaus. */
    var g = raw, r = null, guard = 0;
    while (guard++ < 3000) {
      var b = at(g) || {};
      r = netOf(g, b, s);
      var gap = raw - r.net;
      if (gap <= 0) break;
      g += (b.paid > 0 || b.hasPaid) ? Math.ceil(gap / 2) : gap;
    }
    return { gross: g, net: r ? r.net : 0, deducted: r ? r.deducted : 0 };
  }

  /* ==================================================================== */
  /* ARBEITSMODELLE                                                        */
  /* ==================================================================== */
  /* Sollminuten je Wochentag, Index 0 = Sonntag … 6 = Samstag. */

  function weeklyPreset(totalWeeklyMinutes, workdays) {
    var days = workdays || [1, 2, 3, 4, 5];
    var per = Math.round(totalWeeklyMinutes / days.length);
    var map = [0, 0, 0, 0, 0, 0, 0];
    days.forEach(function (d) { map[d] = per; });
    // Rundungsrest auf den ersten Arbeitstag legen, damit die Woche exakt stimmt.
    var sum = map.reduce(function (a, b) { return a + b; }, 0);
    if (sum !== totalWeeklyMinutes && days.length) map[days[0]] += (totalWeeklyMinutes - sum);
    return map;
  }

  var MODEL_PRESETS = [
    { key: "42",   weekly: 42 * 60,      label: "42 h / Woche", note: "8 h 24 min · Mo–Fr" },
    { key: "41",   weekly: 41 * 60,      label: "41 h / Woche", note: "8 h 12 min · Mo–Fr" },
    { key: "40",   weekly: 40 * 60,      label: "40 h / Woche", note: "8 h 00 min · Mo–Fr" },
    { key: "42.5", weekly: 42 * 60 + 30, label: "42.5 h / Woche", note: "8 h 30 min · Mo–Fr" },
    { key: "38.5", weekly: 38 * 60 + 30, label: "38.5 h / Woche", note: "7 h 42 min · Mo–Fr" },
    { key: "custom", weekly: null, label: "Individuell", note: "Pro Wochentag frei einstellbar" }
  ];

  /* ==================================================================== */
  /* STANDARDEINSTELLUNGEN                                                 */
  /* ==================================================================== */
  function defaultSettings() {
    return {
      /* Darstellung */
      lang: "de",
      theme: "auto",              // auto | light | dark
      density: "normal",          // compact | normal | cozy
      contrast: "normal",
      durationStyle: "hm",        // hm | clock | decimal
      firstDayOfWeek: 1,
      showSeconds: true,

      /* Arbeitsmodell */
      modelPreset: "42",
      weeklyTargets: weeklyPreset(42 * 60, [1, 2, 3, 4, 5]),
      workloadPercent: 100,
      workdays: [1, 2, 3, 4, 5],

      /* Pausen */
      breakRuleset: "ch",
      customBreakTiers: [{ over: 330, require: 15 }, { over: 420, require: 30 }, { over: 540, require: 60 }],
      autoDeductBreak: true,      // fehlende Pflichtpause automatisch abziehen
      defaultLunch: { start: "12:00", end: "12:30" },

      /* Rundung */
      roundStep: 0,               // 0 | 1 | 5 | 6 | 10 | 15
      roundMode: "nearest",       // nearest | up | down

      /* Konto */
      carryOverMinutes: 0,
      carryOverFrom: null,        // ab welchem Datum das Konto zählt
      capPlusMinutes: null,       // optionale Kappung des Gleitzeitsaldos
      capMinusMinutes: null,
      countMissingWorkdays: false,// nicht erfasste Arbeitstage als Minus werten

      /* Kontingente */
      vacationDaysPerYear: 25,
      vacationCarryDays: 0,

      /* Feiertage */
      holidayRegion: "CH-LU",
      autoHolidays: true,

      /* Compliance */
      maxDailyMinutes: 600,       // Warnung ab 10 h
      minRestHours: 11,           // Ruhezeit zwischen zwei Tagen
      maxWeeklyMinutes: 45 * 60, // ArG Art. 9: 45 h Industrie/Büro (50 h übrige) — auch Basis der Überzeit

      /* Schichtvorlagen — ein Klick statt vier Felder.
         Frei erweiterbar; die mitgelieferten decken einen Zweischichtbetrieb
         mit Bürozeiten ab. */
      shiftTemplates: [
        { id: "office", name: "Büro",        nameKey: "shift.office", start: "08:00", end: "17:00", breakStart: "12:00", breakEnd: "12:30" },
        { id: "early",  name: "Frühschicht", nameKey: "shift.early",  start: "06:00", end: "14:30", breakStart: "09:00", breakEnd: "09:30" },
        { id: "late",   name: "Spätschicht", nameKey: "shift.late",   start: "14:00", end: "22:30", breakStart: "18:00", breakEnd: "18:30" },
        { id: "night",  name: "Nachtschicht", nameKey: "shift.night", start: "22:00", end: "06:00", breakStart: "02:00", breakEnd: "02:30" }
      ],

      /* Komfort */
      breakReminder: true,        // erinnert, bevor die Pflichtpause fällig wird
      titleCountdown: true,       // Feierabend im Browser-Tab
      backupReminderDays: 45,     // Hinweis, wenn so lange nicht gesichert wurde
      lastExportAt: null,
      reminderEnabled: false,
      reminderLeadMinutes: 10,
      autoStampOnOpen: false,
      confetti: true,
      soundEnabled: false
    };
  }

  /** Effektive Tages-Sollzeit vor Anwendung der Tagesart. */
  function baseTargetFor(iso, settings, weekdayIndex) {
    var s = settings || defaultSettings();
    var targets = s.weeklyTargets || weeklyPreset(42 * 60, [1, 2, 3, 4, 5]);
    var raw = targets[weekdayIndex] || 0;
    var pct = (s.workloadPercent === null || s.workloadPercent === undefined) ? 100 : s.workloadPercent;
    return Math.round(raw * (pct / 100));
  }

  /** Wochensoll (100 % Pensum-bereinigt). */
  function weeklyTargetMinutes(settings) {
    var s = settings || defaultSettings();
    var sum = (s.weeklyTargets || []).reduce(function (a, b) { return a + (b || 0); }, 0);
    // 0 % heisst 0 — gleiche Lesart wie baseTargetFor (früher galt 0 als 100 %).
    var pct = (s.workloadPercent === null || s.workloadPercent === undefined) ? 100 : s.workloadPercent;
    return Math.round(sum * (pct / 100));
  }

  return {
    DAY_TYPES: DAY_TYPES,
    DAY_TYPE_ORDER: DAY_TYPE_ORDER,
    LOCATIONS: LOCATIONS,
    BREAK_RULESETS: BREAK_RULESETS,
    MODEL_PRESETS: MODEL_PRESETS,
    dayType: dayType,
    requiredBreak: requiredBreak,
    minBreakFor: minBreakFor,
    netOf: netOf,
    presenceForNet: presenceForNet,
    nextBreakTier: nextBreakTier,
    weeklyPreset: weeklyPreset,
    defaultSettings: defaultSettings,
    baseTargetFor: baseTargetFor,
    weeklyTargetMinutes: weeklyTargetMinutes
  };
});
