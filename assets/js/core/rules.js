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
     Staffeln beziehen sich auf die Brutto-Anwesenheit eines Tages.
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

  /**
   * Gesetzlich erforderliche Pause für eine Brutto-Anwesenheit.
   * `custom` erlaubt eigene Staffeln (Array wie in BREAK_RULESETS).
   */
  function requiredBreak(grossMinutes, rulesetKey, customTiers) {
    var tiers = rulesetKey === "custom"
      ? (customTiers || [])
      : ((BREAK_RULESETS[rulesetKey] || BREAK_RULESETS.ch).tiers);
    var required = 0;
    for (var i = 0; i < tiers.length; i++) {
      if (grossMinutes > tiers[i].over) required = Math.max(required, tiers[i].require);
    }
    return required;
  }

  /** Nächste Pausenstufe (für den Hinweis „ab 07:15 brauchst du 30 min“). */
  function nextBreakTier(grossMinutes, rulesetKey, customTiers) {
    var tiers = (rulesetKey === "custom" ? (customTiers || []) : ((BREAK_RULESETS[rulesetKey] || BREAK_RULESETS.ch).tiers))
      .slice()
      .sort(function (a, b) { return a.over - b.over; });
    for (var i = 0; i < tiers.length; i++) {
      if (grossMinutes <= tiers[i].over) return tiers[i];
    }
    return null;
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
      maxWeeklyMinutes: 50 * 60,

      /* Schichtvorlagen — ein Klick statt vier Felder.
         Frei erweiterbar; die mitgelieferten decken einen Zweischichtbetrieb
         mit Bürozeiten ab. */
      shiftTemplates: [
        { id: "office", name: "Büro",        start: "08:00", end: "17:00", breakStart: "12:00", breakEnd: "12:30" },
        { id: "early",  name: "Frühschicht", start: "06:00", end: "14:30", breakStart: "09:00", breakEnd: "09:30" },
        { id: "late",   name: "Spätschicht", start: "14:00", end: "22:30", breakStart: "18:00", breakEnd: "18:30" },
        { id: "night",  name: "Nachtschicht", start: "22:00", end: "06:00", breakStart: "02:00", breakEnd: "02:30" }
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
    return Math.round(sum * ((s.workloadPercent || 100) / 100));
  }

  return {
    DAY_TYPES: DAY_TYPES,
    DAY_TYPE_ORDER: DAY_TYPE_ORDER,
    LOCATIONS: LOCATIONS,
    BREAK_RULESETS: BREAK_RULESETS,
    MODEL_PRESETS: MODEL_PRESETS,
    dayType: dayType,
    requiredBreak: requiredBreak,
    nextBreakTier: nextBreakTier,
    weeklyPreset: weeklyPreset,
    defaultSettings: defaultSettings,
    baseTargetFor: baseTargetFor,
    weeklyTargetMinutes: weeklyTargetMinutes
  };
});
