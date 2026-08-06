/* ==========================================================================
   ZEITKONTO — Feiertage
   --------------------------------------------------------------------------
   Schwerpunkt Schweiz (alle 26 Kantone), dazu Deutschland, Österreich und
   Frankreich. Regionale Abweichungen sind unvermeidlich — jeder Tag lässt
   sich in der App manuell überschreiben.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ZK = root.ZK || {}; root.ZK.Holidays = factory(); }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var CH_CANTONS = [
    ["ZH", "Zürich"], ["BE", "Bern"], ["LU", "Luzern"], ["UR", "Uri"], ["SZ", "Schwyz"],
    ["OW", "Obwalden"], ["NW", "Nidwalden"], ["GL", "Glarus"], ["ZG", "Zug"], ["FR", "Freiburg"],
    ["SO", "Solothurn"], ["BS", "Basel-Stadt"], ["BL", "Basel-Landschaft"], ["SH", "Schaffhausen"],
    ["AR", "Appenzell Ausserrhoden"], ["AI", "Appenzell Innerrhoden"], ["SG", "St. Gallen"],
    ["GR", "Graubünden"], ["AG", "Aargau"], ["TG", "Thurgau"], ["TI", "Tessin"], ["VD", "Waadt"],
    ["VS", "Wallis"], ["NE", "Neuenburg"], ["GE", "Genf"], ["JU", "Jura"]
  ];

  var REGIONS = [{ key: "none", label: "Keine Feiertage", group: "—" }]
    .concat(CH_CANTONS.map(function (c) {
      return { key: "CH-" + c[0], label: "Schweiz · " + c[1], group: "Schweiz" };
    }))
    .concat([
      { key: "DE",    label: "Deutschland (bundesweit)", group: "Deutschland" },
      { key: "DE-BW", label: "Deutschland · Baden-Württemberg", group: "Deutschland" },
      { key: "DE-BY", label: "Deutschland · Bayern", group: "Deutschland" },
      { key: "DE-NW", label: "Deutschland · Nordrhein-Westfalen", group: "Deutschland" },
      { key: "DE-BE", label: "Deutschland · Berlin", group: "Deutschland" },
      { key: "AT",    label: "Österreich", group: "Österreich" },
      { key: "FR",    label: "Frankreich", group: "Frankreich" },
      { key: "FR-AM", label: "Frankreich · Elsass-Mosel", group: "Frankreich" }
    ]);

  /* ------------------------------------------------------------------ */
  /* Osterdatum (Gregorianisch, Algorithmus nach Meeus/Jones/Butcher)   */
  /* ------------------------------------------------------------------ */
  function easterOf(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function iso(d) {
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function shift(date, days) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }
  /** n-ter Wochentag eines Monats (weekday 0=So). n ab 1. */
  function nthWeekday(year, monthIndex, weekday, n) {
    var d = new Date(year, monthIndex, 1);
    var delta = (weekday - d.getDay() + 7) % 7;
    d.setDate(1 + delta + (n - 1) * 7);
    return d;
  }
  /** Erster `weekday` nach einem Datum (exklusiv). */
  function nextWeekday(date, weekday) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    do { d.setDate(d.getDate() + 1); } while (d.getDay() !== weekday);
    return d;
  }

  var ALL_CH = CH_CANTONS.map(function (c) { return c[0]; });
  function except(list) {
    return ALL_CH.filter(function (c) { return list.indexOf(c) < 0; });
  }

  /* ------------------------------------------------------------------ */
  /* Schweizer Feiertage                                                 */
  /* ------------------------------------------------------------------ */
  var CH_DEFS = [
    { id: "neujahr",      de: "Neujahr", fr: "Nouvel An", it: "Capodanno", en: "New Year's Day", fixed: [1, 1], cantons: null },
    { id: "berchtold",    de: "Berchtoldstag", fr: "Saint-Berchtold", it: "San Berchtoldo", en: "Berchtold's Day", fixed: [1, 2],
      cantons: ["ZH", "BE", "LU", "OW", "NW", "GL", "ZG", "FR", "SO", "SH", "AG", "TG", "VD", "NE", "JU"] },
    { id: "dreikoenige",  de: "Heilige Drei Könige", fr: "Épiphanie", it: "Epifania", en: "Epiphany", fixed: [1, 6], cantons: ["UR", "SZ", "TI", "GR"] },
    { id: "ne_republik",  de: "Jahrestag der Republik", fr: "Instauration de la République", it: "Repubblica", en: "Republic Day", fixed: [3, 1], cantons: ["NE"] },
    { id: "josef",        de: "St. Josef", fr: "Saint-Joseph", it: "San Giuseppe", en: "St Joseph's Day", fixed: [3, 19], cantons: ["UR", "SZ", "NW", "ZG", "GR", "TI", "VS"] },
    { id: "naefels",      de: "Näfelser Fahrt", fr: "Näfelser Fahrt", it: "Näfelser Fahrt", en: "Näfels Pilgrimage", calc: "naefels", cantons: ["GL"] },
    { id: "karfreitag",   de: "Karfreitag", fr: "Vendredi saint", it: "Venerdì santo", en: "Good Friday", easter: -2, cantons: except(["VS", "TI"]) },
    { id: "ostermontag",  de: "Ostermontag", fr: "Lundi de Pâques", it: "Lunedì di Pasqua", en: "Easter Monday", easter: 1, cantons: except(["VS"]) },
    { id: "tagderarbeit", de: "Tag der Arbeit", fr: "Fête du travail", it: "Festa del lavoro", en: "Labour Day", fixed: [5, 1],
      cantons: ["ZH", "BS", "BL", "SH", "TG", "TI", "NE", "JU", "AG", "SO", "FR"] },
    { id: "auffahrt",     de: "Auffahrt", fr: "Ascension", it: "Ascensione", en: "Ascension Day", easter: 39, cantons: null },
    { id: "pfingstmontag",de: "Pfingstmontag", fr: "Lundi de Pentecôte", it: "Lunedì di Pentecoste", en: "Whit Monday", easter: 50, cantons: except(["VS"]) },
    { id: "fronleichnam", de: "Fronleichnam", fr: "Fête-Dieu", it: "Corpus Domini", en: "Corpus Christi", easter: 60,
      cantons: ["LU", "UR", "SZ", "OW", "NW", "ZG", "FR", "SO", "AI", "JU", "TI", "VS", "AG", "GR"] },
    { id: "ju_unabh",     de: "Fest der Unabhängigkeit", fr: "Fête de l'indépendance", it: "Festa dell'indipendenza", en: "Independence Day", fixed: [6, 23], cantons: ["JU"] },
    { id: "peterpaul",    de: "Peter und Paul", fr: "Saints Pierre et Paul", it: "Santi Pietro e Paolo", en: "Sts Peter and Paul", fixed: [6, 29], cantons: ["TI"] },
    { id: "bundesfeier",  de: "Bundesfeier", fr: "Fête nationale", it: "Festa nazionale", en: "Swiss National Day", fixed: [8, 1], cantons: null },
    { id: "himmelfahrt",  de: "Mariä Himmelfahrt", fr: "Assomption", it: "Assunzione", en: "Assumption Day", fixed: [8, 15],
      cantons: ["LU", "UR", "SZ", "OW", "NW", "ZG", "FR", "SO", "AI", "AG", "TI", "VS", "JU", "GR"] },
    { id: "jeune_ge",     de: "Genfer Bettag", fr: "Jeûne genevois", it: "Digiuno ginevrino", en: "Geneva Fast", calc: "jeuneGE", cantons: ["GE"] },
    { id: "bettag_vd",    de: "Bettagsmontag", fr: "Lundi du Jeûne fédéral", it: "Lunedì del digiuno", en: "Federal Fast Monday", calc: "bettagMontag", cantons: ["VD"] },
    { id: "bruderklaus",  de: "Bruderklausenfest", fr: "Saint-Nicolas de Flüe", it: "San Nicolao", en: "St Nicholas of Flüe", fixed: [9, 25], cantons: ["OW"] },
    { id: "allerheiligen",de: "Allerheiligen", fr: "Toussaint", it: "Ognissanti", en: "All Saints' Day", fixed: [11, 1],
      cantons: ["LU", "UR", "SZ", "OW", "NW", "GL", "ZG", "FR", "SO", "AI", "SG", "AG", "TI", "VS", "JU", "GR"] },
    { id: "empfaengnis",  de: "Mariä Empfängnis", fr: "Immaculée Conception", it: "Immacolata", en: "Immaculate Conception", fixed: [12, 8],
      cantons: ["LU", "UR", "SZ", "OW", "NW", "ZG", "FR", "AI", "AG", "TI", "VS", "GR"] },
    { id: "weihnachten",  de: "Weihnachten", fr: "Noël", it: "Natale", en: "Christmas Day", fixed: [12, 25], cantons: null },
    { id: "stephan",      de: "Stephanstag", fr: "Saint-Étienne", it: "Santo Stefano", en: "St Stephen's Day", fixed: [12, 26],
      cantons: except(["GE", "VS", "JU", "NE"]) },
    { id: "ge_restauration", de: "Wiederherstellung der Republik", fr: "Restauration de la République", it: "Restaurazione", en: "Restoration Day", fixed: [12, 31], cantons: ["GE"] }
  ];

  /* ------------------------------------------------------------------ */
  /* Deutschland, Österreich, Frankreich                                 */
  /* ------------------------------------------------------------------ */
  var DE_DEFS = [
    { id: "de_neujahr", de: "Neujahr", en: "New Year's Day", fixed: [1, 1], states: null },
    { id: "de_koenige", de: "Heilige Drei Könige", en: "Epiphany", fixed: [1, 6], states: ["BW", "BY"] },
    { id: "de_karfreitag", de: "Karfreitag", en: "Good Friday", easter: -2, states: null },
    { id: "de_ostermontag", de: "Ostermontag", en: "Easter Monday", easter: 1, states: null },
    { id: "de_maifeiertag", de: "Tag der Arbeit", en: "Labour Day", fixed: [5, 1], states: null },
    { id: "de_himmelfahrt", de: "Christi Himmelfahrt", en: "Ascension Day", easter: 39, states: null },
    { id: "de_pfingstmontag", de: "Pfingstmontag", en: "Whit Monday", easter: 50, states: null },
    { id: "de_fronleichnam", de: "Fronleichnam", en: "Corpus Christi", easter: 60, states: ["BW", "BY", "NW"] },
    { id: "de_frauentag", de: "Internationaler Frauentag", en: "International Women's Day", fixed: [3, 8], states: ["BE"] },
    { id: "de_himmelfahrtmaria", de: "Mariä Himmelfahrt", en: "Assumption Day", fixed: [8, 15], states: ["BY"] },
    { id: "de_einheit", de: "Tag der Deutschen Einheit", en: "German Unity Day", fixed: [10, 3], states: null },
    { id: "de_allerheiligen", de: "Allerheiligen", en: "All Saints' Day", fixed: [11, 1], states: ["BW", "BY", "NW"] },
    { id: "de_weihnacht1", de: "1. Weihnachtstag", en: "Christmas Day", fixed: [12, 25], states: null },
    { id: "de_weihnacht2", de: "2. Weihnachtstag", en: "Boxing Day", fixed: [12, 26], states: null }
  ];

  var AT_DEFS = [
    { id: "at_neujahr", de: "Neujahr", fixed: [1, 1] },
    { id: "at_koenige", de: "Heilige Drei Könige", fixed: [1, 6] },
    { id: "at_ostermontag", de: "Ostermontag", easter: 1 },
    { id: "at_staatsfeiertag", de: "Staatsfeiertag", fixed: [5, 1] },
    { id: "at_himmelfahrt", de: "Christi Himmelfahrt", easter: 39 },
    { id: "at_pfingstmontag", de: "Pfingstmontag", easter: 50 },
    { id: "at_fronleichnam", de: "Fronleichnam", easter: 60 },
    { id: "at_maria", de: "Mariä Himmelfahrt", fixed: [8, 15] },
    { id: "at_national", de: "Nationalfeiertag", fixed: [10, 26] },
    { id: "at_allerheiligen", de: "Allerheiligen", fixed: [11, 1] },
    { id: "at_empfaengnis", de: "Mariä Empfängnis", fixed: [12, 8] },
    { id: "at_christtag", de: "Christtag", fixed: [12, 25] },
    { id: "at_stefani", de: "Stefanitag", fixed: [12, 26] }
  ];

  var FR_DEFS = [
    { id: "fr_jour_an", de: "Neujahr", fr: "Jour de l'An", fixed: [1, 1] },
    { id: "fr_paques", de: "Ostermontag", fr: "Lundi de Pâques", easter: 1 },
    { id: "fr_travail", de: "Tag der Arbeit", fr: "Fête du Travail", fixed: [5, 1] },
    { id: "fr_victoire", de: "Tag des Sieges 1945", fr: "Victoire 1945", fixed: [5, 8] },
    { id: "fr_ascension", de: "Christi Himmelfahrt", fr: "Ascension", easter: 39 },
    { id: "fr_pentecote", de: "Pfingstmontag", fr: "Lundi de Pentecôte", easter: 50 },
    { id: "fr_nationale", de: "Nationalfeiertag", fr: "Fête nationale", fixed: [7, 14] },
    { id: "fr_assomption", de: "Mariä Himmelfahrt", fr: "Assomption", fixed: [8, 15] },
    { id: "fr_toussaint", de: "Allerheiligen", fr: "Toussaint", fixed: [11, 1] },
    { id: "fr_armistice", de: "Waffenstillstand 1918", fr: "Armistice 1918", fixed: [11, 11] },
    { id: "fr_noel", de: "Weihnachten", fr: "Noël", fixed: [12, 25] }
  ];

  var FR_AM_EXTRA = [
    { id: "fr_vendredi", de: "Karfreitag", fr: "Vendredi saint", easter: -2 },
    { id: "fr_saint_etienne", de: "Stephanstag", fr: "Saint Étienne", fixed: [12, 26] }
  ];

  /* ------------------------------------------------------------------ */
  /* Berechnung                                                          */
  /* ------------------------------------------------------------------ */
  var CALCS = {
    naefels: function (year) { return nthWeekday(year, 3, 4, 1); },          // 1. Donnerstag im April
    jeuneGE: function (year) {                                               // Do nach 1. Sonntag im September
      return nextWeekday(nthWeekday(year, 8, 0, 1), 4);
    },
    bettagMontag: function (year) {                                          // Mo nach 3. Sonntag im September
      return shift(nthWeekday(year, 8, 0, 3), 1);
    }
  };

  function dateOf(def, year) {
    if (def.fixed) return new Date(year, def.fixed[0] - 1, def.fixed[1]);
    if (typeof def.easter === "number") return shift(easterOf(year), def.easter);
    if (def.calc && CALCS[def.calc]) return CALCS[def.calc](year);
    return null;
  }

  var cache = Object.create(null);

  /**
   * Alle Feiertage eines Jahres für eine Region.
   * @returns {Object} Map "YYYY-MM-DD" -> { id, name, names }
   */
  function forYear(year, region) {
    var key = year + "|" + region;
    if (cache[key]) return cache[key];

    var out = Object.create(null);
    var defs = [];
    var filter = null;

    if (!region || region === "none") {
      cache[key] = out;
      return out;
    }
    if (region.indexOf("CH") === 0) {
      var canton = region.split("-")[1];
      defs = CH_DEFS;
      filter = function (d) { return !d.cantons || (canton && d.cantons.indexOf(canton) >= 0); };
    } else if (region.indexOf("DE") === 0) {
      var state = region.split("-")[1] || null;
      defs = DE_DEFS;
      filter = function (d) { return !d.states || (state && d.states.indexOf(state) >= 0); };
    } else if (region === "AT") {
      defs = AT_DEFS;
    } else if (region === "FR") {
      defs = FR_DEFS;
    } else if (region === "FR-AM") {
      defs = FR_DEFS.concat(FR_AM_EXTRA);
    }

    defs.forEach(function (def) {
      if (filter && !filter(def)) return;
      var d = dateOf(def, year);
      if (!d) return;
      out[iso(d)] = {
        id: def.id,
        name: def.de,
        names: { de: def.de, fr: def.fr || def.de, it: def.it || def.de, en: def.en || def.de }
      };
    });

    cache[key] = out;
    return out;
  }

  /** Einzelner Tag — oder null. */
  function lookup(isoDate, region) {
    if (!isoDate) return null;
    var year = +String(isoDate).slice(0, 4);
    if (!year) return null;
    return forYear(year, region)[isoDate] || null;
  }

  /** Feiertage in einem Zeitraum, sortiert. */
  function between(fromISO, toISO, region) {
    var y1 = +String(fromISO).slice(0, 4);
    var y2 = +String(toISO).slice(0, 4);
    var out = [];
    for (var y = y1; y <= y2; y++) {
      var map = forYear(y, region);
      Object.keys(map).forEach(function (d) {
        if (d >= fromISO && d <= toISO) out.push({ date: d, holiday: map[d] });
      });
    }
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  return {
    REGIONS: REGIONS,
    CH_CANTONS: CH_CANTONS,
    easterOf: easterOf,
    forYear: forYear,
    lookup: lookup,
    between: between
  };
});
