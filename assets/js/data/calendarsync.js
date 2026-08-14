/* ==========================================================================
   ZEITKONTO — Kalender-Abgleich
   --------------------------------------------------------------------------
   Übersetzt Outlook-Termine in Tageseinträge. Ausschliesslich reine
   Funktionen, damit die Regeln testbar sind — der Netzwerkteil steckt in
   graph.js, die Anmeldung in msauth.js.

   Zwei Dinge, die hier bewusst so gelöst sind:

   1. GANZTAGESTERMINE. Graph liefert sie als 00:00 bis 00:00 des Folgetags.
      Wer das als Zeitstempel in UTC umrechnet, verschiebt in der Schweiz
      jeden Ferientag um einen Tag nach vorne. Deshalb wird bei
      `isAllDay` ausschliesslich der Datumsteil der Wanduhrzeit gelesen und
      das Ende als exklusiv behandelt.

   2. NICHTS WIRD ÜBERSCHRIEBEN. Der Abgleich erzeugt einen Vorschlag, den
      der Nutzer bestätigt. Tage mit eigenen Stempelungen bleiben unangetastet;
      geändert werden nur leere Tage und solche, die zuvor aus dem Kalender
      stammten.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../core/time.js"), require("../core/rules.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.CalendarSync = factory(root.ZK.Time, root.ZK.Rules);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R) {
  "use strict";

  var SOURCE = "outlook";

  /* ==================================================================== */
  /* Regelwerk                                                             */
  /* ==================================================================== */
  /*
     Die Reihenfolge entscheidet: die erste passende Regel gewinnt. Deshalb
     stehen die eindeutigen Stichwörter vor der allgemeinen
     „Abwesend"-Erkennung über showAs.

     Stichwörter greifen auf Betreff UND Kategorien, in allen vier Sprachen
     der App. Alles frei änderbar — Betriebe benennen das verschieden.
  */
  var DEFAULT_RULES = [
    {
      id: "vacation", type: "vacation", enabled: true,
      keywords: ["ferien", "urlaub", "vacation", "vacances", "ferie", "congé", "holiday leave"]
    },
    {
      id: "sick", type: "sick", enabled: true,
      keywords: ["krank", "krankheit", "sick", "malade", "maladie", "malattia", "arzttermin", "arzt"]
    },
    {
      id: "accident", type: "accident", enabled: true,
      keywords: ["unfall", "accident", "infortunio"]
    },
    {
      id: "military", type: "military", enabled: true,
      keywords: ["militär", "militaer", "wk", "zivilschutz", "service militaire", "militare"]
    },
    {
      id: "comp", type: "comp", enabled: true,
      keywords: ["kompensation", "zeitausgleich", "gleittag", "compensation", "récupération", "recupero", "time off in lieu"]
    },
    {
      id: "training", type: "training", enabled: true,
      keywords: ["weiterbildung", "schulung", "kurs", "training", "formation", "corso", "seminar"]
    },
    {
      id: "holiday", type: "holiday", enabled: true,
      keywords: ["feiertag", "jour férié", "festivo", "public holiday"]
    },
    {
      id: "unpaid", type: "unpaid", enabled: true,
      keywords: ["unbezahlt", "unpaid", "non payé", "non pagato"]
    },
    {
      /* Auffangregel: als „Abwesend" markierter Ganztagestermin ohne
         erkennbares Stichwort wird als Ferien verbucht. */
      id: "oof", type: "vacation", enabled: true,
      showAs: ["oof"], allDayOnly: true
    },
    {
      /* Kein Abwesenheitstag, sondern nur der Arbeitsort. */
      id: "homeoffice", locationOnly: "home", enabled: true,
      showAs: ["workingElsewhere"],
      keywords: ["homeoffice", "home office", "télétravail", "teletravail", "telelavoro", "remote"]
    }
  ];

  /* Stichwörter, die einen halben Tag bedeuten. */
  var HALF_DAY_HINTS = [
    "halbtag", "halber tag", "½", "1/2", "half day", "half-day",
    "demi-journée", "demi journee", "mezza giornata", "vormittag", "nachmittag",
    "morgen halbtag", "matin", "après-midi", "mattina", "pomeriggio"
  ];

  function defaultSettings() {
    return {
      enabled: false,
      clientId: "",
      tenant: "common",
      calendarIds: ["primary"],
      rules: DEFAULT_RULES.map(function (r) { return Object.assign({}, r); }),
      pastDays: 60,
      futureDays: 365,
      autoSync: true,
      importHomeOffice: true,
      copySubjectToNote: true,
      ignorePrivate: true,
      lastSyncAt: null
    };
  }

  /* ==================================================================== */
  /* Zeit- und Datumsumrechnung                                            */
  /* ==================================================================== */

  /**
   * Graph liefert `{ dateTime: "2026-08-06T09:30:00.0000000", timeZone: "Europe/Zurich" }`.
   * Mit gesetztem Prefer-Header ist `dateTime` bereits Wanduhrzeit in der
   * gewünschten Zone; ohne Header kommt UTC zurück.
   *
   * @returns {{date: String, minutes: Number}} Datum und Minuten seit Mitternacht
   */
  function toLocalParts(graphTime) {
    if (!graphTime || !graphTime.dateTime) return null;
    var raw = String(graphTime.dateTime);
    var zone = String(graphTime.timeZone || "").toUpperCase();

    if (zone === "UTC" || /Z$/.test(raw)) {
      // Als UTC lesen und in die Gerätezeit umrechnen
      var d = new Date(raw.replace(/(\.\d+)?Z?$/, "") + "Z");
      if (isNaN(d.getTime())) return null;
      return { date: T.toISO(d), minutes: d.getHours() * 60 + d.getMinutes() };
    }

    // Wanduhrzeit: Zeichenkette direkt lesen, keine Zeitzonenrechnung
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw);
    if (!m) return null;
    return { date: m[1] + "-" + m[2] + "-" + m[3], minutes: (+m[4]) * 60 + (+m[5]) };
  }

  /**
   * Alle Kalendertage, die ein Termin berührt.
   * Ganztagestermine enden laut Graph am Folgetag um 00:00 — dieses Ende
   * ist exklusiv und darf nicht als eigener Tag zählen.
   */
  function eventDays(event) {
    var start = toLocalParts(event.start);
    var end = toLocalParts(event.end);
    if (!start) return [];
    if (!end) return [start.date];

    var lastDate = end.date;
    if (event.isAllDay) {
      lastDate = T.addDays(end.date, -1);
    } else if (end.minutes === 0 && end.date > start.date) {
      // Termin endet exakt um Mitternacht: der Folgetag gehört nicht dazu
      lastDate = T.addDays(end.date, -1);
    }
    if (lastDate < start.date) lastDate = start.date;

    var days = T.rangeDays(start.date, lastDate);
    return days.length ? days : [start.date];
  }

  /* ==================================================================== */
  /* Regelauswertung                                                       */
  /* ==================================================================== */

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/ /g, " ")
      .trim();
  }

  /** Betreff und Kategorien als ein durchsuchbarer Text. */
  function searchableText(event) {
    var parts = [event.subject || ""];
    if (Array.isArray(event.categories)) parts = parts.concat(event.categories);
    return normalize(parts.join(" · "));
  }

  function matchRule(rule, event, text) {
    if (rule.enabled === false) return false;
    if (rule.allDayOnly && !event.isAllDay) return false;

    var hasShowAs = Array.isArray(rule.showAs) && rule.showAs.length;
    var hasKeywords = Array.isArray(rule.keywords) && rule.keywords.length;

    var showAsHit = hasShowAs && rule.showAs.indexOf(event.showAs) >= 0;
    var keywordHit = hasKeywords && rule.keywords.some(function (k) {
      return k && text.indexOf(normalize(k)) >= 0;
    });

    if (hasShowAs && hasKeywords) return showAsHit || keywordHit;
    if (hasShowAs) return showAsHit;
    if (hasKeywords) return keywordHit;
    return false;
  }

  function isHalfDay(text) {
    return HALF_DAY_HINTS.some(function (h) { return text.indexOf(normalize(h)) >= 0; });
  }

  /** Soll dieser Termin überhaupt betrachtet werden? */
  function isRelevant(event, settings) {
    if (!event) return false;
    if (event.isCancelled) return false;
    if (event.type === "seriesMaster") return false;   // calendarView liefert die Vorkommen
    if (event.responseStatus && event.responseStatus.response === "declined") return false;
    if (settings.ignorePrivate !== false && event.sensitivity === "private" && event.showAs !== "oof") {
      // Private Termine ohne Abwesenheitsmarkierung gehen die App nichts an
      return false;
    }
    return true;
  }

  /**
   * Termine eines Zeitraums in Tagesvorschläge übersetzen.
   * @returns {Object} Map "YYYY-MM-DD" -> { type, factor, location, note, eventId, subject }
   */
  function mapEvents(events, settings) {
    var s = Object.assign(defaultSettings(), settings || {});
    var rules = s.rules && s.rules.length ? s.rules : DEFAULT_RULES;
    var byDate = Object.create(null);

    (events || []).forEach(function (event) {
      if (!isRelevant(event, s)) return;

      var text = searchableText(event);
      var rule = null;
      for (var i = 0; i < rules.length; i++) {
        if (matchRule(rules[i], event, text)) { rule = rules[i]; break; }
      }
      if (!rule) return;
      if (rule.locationOnly && s.importHomeOffice === false) return;

      var isPrivate = event.sensitivity === "private" || event.sensitivity === "confidential";
      var label = (s.copySubjectToNote !== false && !isPrivate) ? (event.subject || "") : "";
      var factor = isHalfDay(text) ? 0.5 : 1;

      eventDays(event).forEach(function (date) {
        var existing = byDate[date];

        if (rule.locationOnly) {
          byDate[date] = Object.assign({ date: date }, existing, {
            location: rule.locationOnly,
            locationEventId: event.id,
            locationSubject: label
          });
          return;
        }

        /* Mehrere Abwesenheiten am selben Tag: die erste gewinnt, weil die
           Regeln nach Eindeutigkeit sortiert sind. Halbtage addieren sich. */
        if (existing && existing.type) {
          if (existing.type === rule.type && existing.factor < 1) {
            existing.factor = Math.min(1, existing.factor + factor);
          }
          return;
        }

        byDate[date] = Object.assign({ date: date }, existing, {
          type: rule.type,
          factor: factor,
          note: label,
          eventId: event.id,
          ruleId: rule.id
        });
      });
    });

    return byDate;
  }

  /* ==================================================================== */
  /* Abgleichplan                                                          */
  /* ==================================================================== */

  /**
   * Vergleicht die Kalendervorschläge mit dem bestehenden Datenbestand und
   * liefert eine Liste von Änderungen zur Bestätigung.
   *
   * @param {Object} mapped     Ergebnis von mapEvents()
   * @param {Function} getDay   (iso) => record | null
   * @param {Object} opts       { from, to, settings }
   * @returns {{changes: Array, protectedDays: Array, unchanged: Number}}
   */
  function planSync(mapped, getDay, opts) {
    opts = opts || {};
    var from = opts.from;
    var to = opts.to;
    var changes = [];
    var protectedDays = [];
    var unchanged = 0;

    var dates = T.rangeDays(from, to);

    dates.forEach(function (date) {
      var proposal = mapped[date] || null;
      var record = getDay(date) || null;
      var hasStamps = !!(record && (String(record.start || "").trim() || String(record.end || "").trim()));
      var fromCalendar = !!(record && record.source === SOURCE);

      /* --- Nichts im Kalender: bestehende Kalender-Einträge zurücknehmen --- */
      if (!proposal) {
        if (record && fromCalendar && !hasStamps) {
          changes.push({
            date: date,
            action: "clear",
            before: summarize(record),
            after: null,
            reason: "gone"
          });
        } else {
          unchanged++;
        }
        return;
      }

      /* --- Nur der Arbeitsort ---------------------------------------- */
      if (!proposal.type && proposal.location) {
        if (!record || record.location !== proposal.location) {
          changes.push({
            date: date,
            action: "location",
            location: proposal.location,
            before: record ? summarize(record) : null,
            after: { location: proposal.location },
            subject: proposal.locationSubject || "",
            reason: "homeoffice"
          });
        } else {
          unchanged++;
        }
        return;
      }

      /* --- Eigene Erfassung hat Vorrang ------------------------------- */
      if (hasStamps && !fromCalendar) {
        protectedDays.push({ date: date, proposal: proposal, record: summarize(record) });
        return;
      }
      if (record && record.type && !fromCalendar && record.type !== proposal.type) {
        protectedDays.push({ date: date, proposal: proposal, record: summarize(record) });
        return;
      }

      /* --- Ist der Vorschlag schon umgesetzt? ------------------------- */
      var same = record &&
        record.type === proposal.type &&
        Number(record.absenceFactor === undefined ? 1 : record.absenceFactor) === Number(proposal.factor) &&
        (!proposal.location || record.location === proposal.location);
      if (same) { unchanged++; return; }

      changes.push({
        date: date,
        action: "set",
        type: proposal.type,
        factor: proposal.factor,
        location: proposal.location || null,
        subject: proposal.note || "",
        before: record ? summarize(record) : null,
        after: { type: proposal.type, factor: proposal.factor },
        reason: record ? "update" : "new"
      });
    });

    return { changes: changes, protectedDays: protectedDays, unchanged: unchanged };
  }

  function summarize(record) {
    if (!record) return null;
    return {
      type: record.type || null,
      factor: record.absenceFactor === undefined ? 1 : record.absenceFactor,
      start: record.start || "",
      end: record.end || "",
      location: record.location || "office",
      source: record.source || null
    };
  }

  /**
   * Übersetzt bestätigte Änderungen in Speicher-Aufträge.
   * @returns {Object} Map "YYYY-MM-DD" -> patch | null (null = löschen)
   */
  function buildPatch(changes, syncedAt) {
    var patch = Object.create(null);
    var stamp = syncedAt || new Date().toISOString();

    (changes || []).forEach(function (change) {
      if (change.action === "clear") {
        patch[change.date] = null;
        return;
      }
      if (change.action === "location") {
        patch[change.date] = { location: change.location, outlookSyncedAt: stamp };
        return;
      }
      patch[change.date] = {
        type: change.type,
        absenceFactor: change.factor,
        start: "",
        end: "",
        breaks: [],
        source: SOURCE,
        outlookSyncedAt: stamp,
        note: change.subject || ""
      };
      if (change.location) patch[change.date].location = change.location;
    });

    return patch;
  }

  /** Zeitraum für den Abgleich aus den Einstellungen. */
  function syncRange(settings, today) {
    var s = Object.assign(defaultSettings(), settings || {});
    var base = today || T.todayISO();
    return {
      from: T.addDays(base, -Math.abs(s.pastDays || 60)),
      to: T.addDays(base, Math.abs(s.futureDays || 365))
    };
  }

  return {
    SOURCE: SOURCE,
    DEFAULT_RULES: DEFAULT_RULES,
    HALF_DAY_HINTS: HALF_DAY_HINTS,
    defaultSettings: defaultSettings,
    toLocalParts: toLocalParts,
    eventDays: eventDays,
    searchableText: searchableText,
    matchRule: matchRule,
    isHalfDay: isHalfDay,
    isRelevant: isRelevant,
    mapEvents: mapEvents,
    planSync: planSync,
    buildPatch: buildPatch,
    syncRange: syncRange
  };
});
