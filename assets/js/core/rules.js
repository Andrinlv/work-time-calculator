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
      modelHistory: [],           // Modell ab Stichtag — leer: obige Felder gelten für alle Tage

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

  /* ==================================================================== */
  /* ARBEITSMODELL AB STICHTAG                                             */
  /* ==================================================================== */
  /*
     settings.modelHistory = [{ from, modelPreset, weeklyTargets,
     workloadPercent, workdays, maxWeeklyMinutes? }], sortiert nach `from`.
     Ein Eintrag gilt ab `from` bis zum Tag vor dem nächsten. Tage vor dem
     ersten Eintrag rechnen mit dem ersten — der erste Abschnitt hat also
     keinen Anfang, sein Datum ist nur ein Anker.

     Den LETZTEN Abschnitt bestimmen die bekannten Felder oben in den
     Einstellungen (modelPreset, weeklyTargets …). Sie bleiben „das Modell“:
     Onboarding, ältere Sicherungen und alles, was den Verlauf nicht kennt,
     ändern damit das jüngste Modell statt ins Leere zu schreiben. Ohne
     Verlauf gilt wie bisher allein ihr Wert — für alle Tage.

     Wer ab 1. November 80 % arbeitet, verändert so weder die Sollzeiten
     noch den Saldo der Tage davor.
  */
  var DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  function isISO(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var d = new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)));
    return d.toISOString().slice(0, 10) === v;
  }

  /* Kalenderrechnung in UTC: Sommerzeit verschiebt hier nichts. */
  function isoAdd(iso, delta) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + delta));
    return d.toISOString().slice(0, 10);
  }
  function isoWeekday(iso) {
    return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay();
  }

  function pctOf(src) {
    var p = src && src.workloadPercent;
    return (p === null || p === undefined) ? 100 : p;
  }

  function cleanTargets(list) {
    if (!Array.isArray(list) || list.length !== 7) return null;
    return list.map(function (v) { return isNum(v) && v > 0 ? Math.round(v) : 0; });
  }

  function cleanDays(list) {
    if (!Array.isArray(list)) return null;
    var seen = {};
    var out = list.filter(function (d) {
      if (!isNum(d) || d < 0 || d > 6 || d !== Math.floor(d) || seen[d]) return false;
      seen[d] = true;
      return true;
    }).sort(function (a, b) { return a - b; });
    return out.length ? out : null;
  }

  /** Tage mit Soll — so sieht „Mo–Do“ aus, wenn der Freitag auf 0 steht. */
  function daysWithTarget(targets) {
    var out = [];
    (targets || []).forEach(function (v, d) { if (v > 0) out.push(d); });
    return out.length ? out : null;
  }

  function presetByKey(key) {
    for (var i = 0; i < MODEL_PRESETS.length; i++) if (MODEL_PRESETS[i].key === key) return MODEL_PRESETS[i];
    return null;
  }

  /** Welche Vorlage entspricht diesen Wochensollzeiten? Sonst „custom“. */
  function matchPreset(weeklyTargets, workdays) {
    var days = (workdays && workdays.length) ? workdays : DEFAULT_WORKDAYS;
    var key = (weeklyTargets || []).join(",");
    for (var i = 0; i < MODEL_PRESETS.length; i++) {
      var p = MODEL_PRESETS[i];
      if (p.weekly && weeklyPreset(p.weekly, days).join(",") === key) return p.key;
    }
    return "custom";
  }

  /* Ein Modell als eigenständige Kopie. `explicitMax`: nur ein Verlaufs-
     eintrag trägt eine eigene Wochenhöchstzeit — die der Einstellungen
     gehört zum Arbeitsschutz und wird nicht in den Verlauf kopiert. */
  function modelOf(src, explicitMax) {
    src = src || {};
    var targets = cleanTargets(src.weeklyTargets) || weeklyPreset(42 * 60, DEFAULT_WORKDAYS);
    var days = cleanDays(src.workdays) || DEFAULT_WORKDAYS.slice();
    var m = {
      modelPreset: typeof src.modelPreset === "string" && src.modelPreset ? src.modelPreset : matchPreset(targets, days),
      weeklyTargets: targets,
      workloadPercent: isNum(pctOf(src)) ? pctOf(src) : 100,
      workdays: days
    };
    if (explicitMax && isNum(src.maxWeeklyMinutes) && src.maxWeeklyMinutes > 0) m.maxWeeklyMinutes = src.maxWeeklyMinutes;
    return m;
  }

  function sameModel(a, b) {
    return a.workloadPercent === b.workloadPercent &&
      a.weeklyTargets.join(",") === b.weeklyTargets.join(",") &&
      a.workdays.join(",") === b.workdays.join(",") &&
      a.maxWeeklyMinutes === b.maxWeeklyMinutes;
  }

  function cleanEntry(e) {
    if (!e || typeof e !== "object" || !isISO(e.from) || !cleanTargets(e.weeklyTargets)) return null;
    var m = modelOf(e, true);
    if (!cleanDays(e.workdays)) m.workdays = daysWithTarget(m.weeklyTargets) || DEFAULT_WORKDAYS.slice();
    m.from = e.from;
    return m;
  }

  /* Bereinigter, sortierter Verlauf. computeDay fragt ihn für jeden Tag
     ab — gemerkt wird er deshalb pro Array. Der Speicher ersetzt den
     Verlauf bei jeder Änderung durch ein neues Array, er wird nie an Ort
     und Stelle verändert. */
  var histCache = { src: null, len: -1, list: [] };
  function historyOf(s) {
    var src = s && s.modelHistory;
    if (!Array.isArray(src) || !src.length) return [];
    if (histCache.src === src && histCache.len === src.length) return histCache.list;
    var byFrom = {};
    src.forEach(function (e) { var c = cleanEntry(e); if (c) byFrom[c.from] = c; });
    var list = Object.keys(byFrom).sort().map(function (k) { return byFrom[k]; });
    histCache = { src: src, len: src.length, list: list };
    return list;
  }

  /* Woher die Werte eines Tages kommen: ein Verlaufseintrag oder — für den
     letzten Abschnitt und ohne Verlauf — die Einstellungen selbst. */
  function sourceFor(iso, s) {
    var h = historyOf(s);
    if (h.length < 2 || typeof iso !== "string") return s;
    for (var i = h.length - 1; i >= 1; i--) {
      if (h[i].from <= iso) return i === h.length - 1 ? s : h[i];
    }
    return h[0];
  }

  /**
   * Arbeitsmodell, das an diesem Tag gilt (Kopie).
   * → { modelPreset, weeklyTargets, workloadPercent, workdays, maxWeeklyMinutes }
   */
  function modelFor(iso, settings) {
    var s = settings || defaultSettings();
    var src = sourceFor(iso, s);
    var m = modelOf(src, src !== s);
    if (m.maxWeeklyMinutes === undefined && s.maxWeeklyMinutes !== undefined) m.maxWeeklyMinutes = s.maxWeeklyMinutes;
    return m;
  }

  /**
   * Abschnitte des Arbeitsmodells in zeitlicher Reihenfolge:
   * [{ from, to, model, index, anchor }]. `from` des ersten ist null (gilt
   * seit jeher), `to` des letzten null (offen). `anchor` ist das
   * gespeicherte Datum des ersten Eintrags.
   */
  function modelTimeline(settings) {
    var s = settings || defaultSettings();
    var h = historyOf(s);
    if (h.length < 2) return [{ from: null, to: null, model: modelOf(s, false), index: 0, anchor: h.length ? h[0].from : null }];
    return h.map(function (e, i) {
      var last = i === h.length - 1;
      return {
        from: i === 0 ? null : e.from,
        to: last ? null : isoAdd(h[i + 1].from, -1),
        model: last ? modelOf(s, false) : modelOf(e, true),
        index: i,
        anchor: i === 0 ? e.from : null
      };
    });
  }

  /* Eine Änderung auf ein Modell anwenden. Erlaubt sind
     { workloadPercent } · { modelPreset } · { weekday, minutes } ·
     { weeklyTargets } · { workdays } — auch kombiniert. */
  function applyChange(model, change) {
    var m = modelOf(model, true);
    change = change || {};
    var p;
    if (change.weeklyTargets) {
      m.weeklyTargets = cleanTargets(change.weeklyTargets) || m.weeklyTargets;
      m.workdays = daysWithTarget(m.weeklyTargets) || m.workdays;
      m.modelPreset = matchPreset(m.weeklyTargets, m.workdays);
    }
    if (change.weekday !== undefined && change.weekday >= 0 && change.weekday <= 6 && isNum(change.minutes)) {
      m.weeklyTargets[change.weekday] = Math.max(0, Math.round(change.minutes));
      m.workdays = daysWithTarget(m.weeklyTargets) || m.workdays;
      m.modelPreset = matchPreset(m.weeklyTargets, m.workdays);
    }
    if (change.workdays) {
      var days = cleanDays(change.workdays);
      if (days) {
        p = presetByKey(m.modelPreset);
        m.weeklyTargets = p && p.weekly
          ? weeklyPreset(p.weekly, days)
          : m.weeklyTargets.map(function (v, d) { return days.indexOf(d) >= 0 ? v : 0; });
        m.workdays = days;
        m.modelPreset = matchPreset(m.weeklyTargets, m.workdays);
      }
    }
    if (change.modelPreset) {
      p = presetByKey(change.modelPreset);
      if (p && p.weekly) m.weeklyTargets = weeklyPreset(p.weekly, m.workdays);
      m.modelPreset = p ? p.key : "custom";
    }
    if (isNum(change.workloadPercent) && change.workloadPercent >= 0) m.workloadPercent = change.workloadPercent;
    return m;
  }

  function entryOf(from, m) {
    var e = {
      from: from,
      modelPreset: m.modelPreset,
      weeklyTargets: m.weeklyTargets.slice(),
      workloadPercent: m.workloadPercent,
      workdays: m.workdays.slice()
    };
    if (m.maxWeeklyMinutes !== undefined) e.maxWeeklyMinutes = m.maxWeeklyMinutes;
    return e;
  }

  /* Abschnitte → Einstellungs-Patch. Gleiche Nachbarn verschmelzen; bleibt
     nur einer übrig, ist der Verlauf leer und alles wie früher. */
  function toPatch(segs, opts) {
    var out = [];
    segs.forEach(function (g) {
      var prev = out[out.length - 1];
      if (!prev || !sameModel(prev.model, g.model)) out.push(g);
    });
    var last = out[out.length - 1].model;
    var patch = {
      modelPreset: last.modelPreset,
      weeklyTargets: last.weeklyTargets.slice(),
      workloadPercent: last.workloadPercent,
      workdays: last.workdays.slice(),
      modelHistory: []
    };
    if (out.length < 2) return patch;
    // Der erste Abschnitt gilt seit jeher; sein Anker muss nur vor dem zweiten liegen.
    var anchor = out[0].anchor || (opts && opts.since) || null;
    if (!isISO(anchor) || anchor >= out[1].from) anchor = isoAdd(out[1].from, -1);
    patch.modelHistory = out.map(function (g, i) { return entryOf(i === 0 ? anchor : g.from, g.model); });
    return patch;
  }

  function segmentsOf(s) {
    return modelTimeline(s).map(function (t) { return { from: t.from, model: t.model, anchor: t.anchor }; });
  }

  /**
   * Arbeitsmodell ab einem Stichtag ändern. Liefert den Patch für
   * updateSettings (immer alle Modellfelder samt Verlauf, damit sie beim
   * Zusammenführen mehrerer Fenster gemeinsam reisen).
   * @param {Object} change   siehe applyChange
   * @param {String|null} from  Stichtag; null = rückwirkend für alle Tage
   * @param {Object} [opts]   { since: frühester erfasster Tag — Anker,
   *                            wenn der Verlauf neu entsteht }
   * Die Änderung gilt ab `from` für alle späteren Abschnitte: die Felder
   * zeigen das jüngste Modell, und was dort steht, soll am Ende gelten.
   */
  function changeModel(settings, change, from, opts) {
    var s = settings || defaultSettings();
    var segs = segmentsOf(s);
    var start = 0;
    if (from && isISO(from)) {
      var k = 0;
      for (var i = segs.length - 1; i >= 1; i--) if (segs[i].from <= from) { k = i; break; }
      if (segs[k].from === from) start = k;
      else {
        segs.splice(k + 1, 0, { from: from, model: segs[k].model });
        start = k + 1;
      }
    }
    for (var j = start; j < segs.length; j++) segs[j] = { from: segs[j].from, model: applyChange(segs[j].model, change), anchor: segs[j].anchor };
    return toPatch(segs, opts);
  }

  /** Einen Abschnitt entfernen: der vorherige gilt weiter (beim ersten übernimmt der nächste auch die Zeit davor). */
  function removeModelEntry(settings, index, opts) {
    var segs = segmentsOf(settings || defaultSettings());
    if (segs.length < 2 || index < 0 || index >= segs.length) return null;
    var removed = segs.splice(index, 1)[0];
    if (index === 0) { segs[0].from = null; segs[0].anchor = removed.anchor; }
    return toPatch(segs, opts);
  }

  /**
   * Einen Abschnitt bearbeiten: { from?, workloadPercent?, weeklyTargets? }.
   * Der erste Abschnitt hat kein Startdatum. Fällt das neue Datum auf den
   * Beginn eines anderen Abschnitts, ersetzt es diesen — das UI fragt vorher.
   */
  function editModelEntry(settings, index, next, opts) {
    var segs = segmentsOf(settings || defaultSettings());
    var g = segs[index];
    if (!g) return null;
    next = next || {};
    var m = applyChange(g.model, { weeklyTargets: next.weeklyTargets, workloadPercent: next.workloadPercent });
    if (index > 0 && isISO(next.from) && next.from !== g.from) {
      segs.splice(index, 1);
      var pos = segs.length;
      for (var i = 1; i < segs.length; i++) if (segs[i].from >= next.from) { pos = i; break; }
      if (segs[pos] && segs[pos].from === next.from) segs[pos] = { from: next.from, model: m };
      else segs.splice(pos, 0, { from: next.from, model: m });
    } else {
      segs[index] = { from: g.from, model: m, anchor: g.anchor };
    }
    return toPatch(segs, opts);
  }

  /** Effektive Tages-Sollzeit vor Anwendung der Tagesart — mit dem Modell dieses Tages. */
  function baseTargetFor(iso, settings, weekdayIndex) {
    var s = settings || defaultSettings();
    var src = sourceFor(iso, s);
    var targets = src.weeklyTargets || weeklyPreset(42 * 60, DEFAULT_WORKDAYS);
    if (weekdayIndex === undefined && isISO(iso)) weekdayIndex = isoWeekday(iso);
    var raw = targets[weekdayIndex] || 0;
    return Math.round(raw * (pctOf(src) / 100));
  }

  /**
   * Wochensoll (Pensum-bereinigt). Ohne Datum das jüngste Modell (die
   * Felder der Einstellungen), mit Datum das Modell dieses Tages.
   */
  function weeklyTargetMinutes(settings, iso) {
    var s = settings || defaultSettings();
    var src = iso ? sourceFor(iso, s) : s;
    var sum = (src.weeklyTargets || []).reduce(function (a, b) { return a + (b || 0); }, 0);
    // 0 % heisst 0 — gleiche Lesart wie baseTargetFor (früher galt 0 als 100 %).
    return Math.round(sum * (pctOf(src) / 100));
  }

  /**
   * Vertragliches Soll eines Zeitraums, Tag für Tag mit dem jeweils
   * gültigen Modell — ohne Feiertage, Absenzen und Tagesvorgaben. Wechselt
   * das Modell mitten in der Woche, zählt jeder Tag anteilig.
   * → { minutes, days }  (days = Tage mit Soll)
   */
  function contractFor(fromISO, toISO, settings) {
    var s = settings || defaultSettings();
    var minutes = 0, days = 0;
    if (!isISO(fromISO) || !isISO(toISO)) return { minutes: 0, days: 0 };
    for (var d = fromISO, guard = 0; d <= toISO && guard < 4000; d = isoAdd(d, 1), guard++) {
      var t = baseTargetFor(d, s, isoWeekday(d));
      minutes += t;
      if (t > 0) days++;
    }
    return { minutes: minutes, days: days };
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
    weeklyTargetMinutes: weeklyTargetMinutes,
    /* Arbeitsmodell ab Stichtag */
    matchPreset: matchPreset,
    modelFor: modelFor,
    modelTimeline: modelTimeline,
    changeModel: changeModel,
    removeModelEntry: removeModelEntry,
    editModelEntry: editModelEntry,
    contractFor: contractFor
  };
});
