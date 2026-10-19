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
      der Nutzer bestätigt. Tage mit eigenen Stempelungen bleiben unangetastet
      — auch wenn der Tag ursprünglich aus dem Kalender kam. Geändert werden
      nur leere Tage und solche, die zuvor aus dem Kalender stammten und seither
      nicht von Hand bearbeitet wurden.

   3. KURZE TERMINE SIND KEINE ABWESENHEIT. „Ferienplanung Team“ (1 h) oder
      „Arzttermin“ (16–17 Uhr) machen keinen Ferien- oder Krankheitstag.
      Stichwörter zählen nur bei Ganztagesterminen oder Terminen, die einen
      wesentlichen Teil des Arbeitstags belegen; ein halber Tag wird zum
      Halbtag. Stichwörter greifen als ganze Wörter oder als Wortende
      („Sommerferien“), nie mitten im Wort („Konkursverfahren“ ≠ Kurs).
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

  /* Wie viel eines Tages ein Termin belegen muss, um als Abwesenheit zu
     zählen. Gemessen wird nur im üblichen Arbeitsfenster 06–20 Uhr, damit
     „Ferien ab Montag 17 Uhr“ den Montag nicht zum Ferientag macht. */
  var WORK_WINDOW = { from: 6 * 60, to: 20 * 60 };
  var MIN_ABSENCE_MINUTES = 4 * 60;
  var DEFAULT_DAY_MINUTES = 504;      // 42-h-Woche / 5 Tage
  var FULL_DAY_SHARE = 0.75;          // ab drei Vierteln des Tagessolls: ganzer Tag

  /* Von Hand bearbeitet heisst: später gespeichert als übernommen. Der
     Abgleich selbst schreibt beides im selben Augenblick. */
  var EDIT_TOLERANCE_MS = 5000;

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
   * Datum eines Ganztagestermins: immer der Datumsteil, auch wenn Graph die
   * Zeit in UTC liefert — sonst landet der Ferientag westlich von UTC einen
   * Tag zu früh.
   */
  function wallDate(graphTime) {
    if (!graphTime || !graphTime.dateTime) return null;
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(graphTime.dateTime));
    return m ? { date: m[1], minutes: 0 } : null;
  }

  /**
   * Wie viele Minuten des Arbeitsfensters ein Termin an einem Tag belegt.
   * Ganztagestermine belegen den ganzen Tag.
   */
  function coverageOn(event, date) {
    if (event.isAllDay) return WORK_WINDOW.to - WORK_WINDOW.from;
    var start = toLocalParts(event.start);
    var end = toLocalParts(event.end);
    if (!start) return 0;
    var from = date === start.date ? start.minutes : (date < start.date ? T.DAY : 0);
    var to = !end ? from : (date === end.date ? end.minutes : (date > end.date ? 0 : T.DAY));
    from = Math.max(from, WORK_WINDOW.from);
    to = Math.min(to, WORK_WINDOW.to);
    return Math.max(0, to - from);
  }

  /**
   * Alle Kalendertage, die ein Termin berührt.
   * Ganztagestermine enden laut Graph am Folgetag um 00:00 — dieses Ende
   * ist exklusiv und darf nicht als eigener Tag zählen.
   */
  function eventDays(event) {
    var start = event.isAllDay ? wallDate(event.start) : toLocalParts(event.start);
    var end = event.isAllDay ? wallDate(event.end) : toLocalParts(event.end);
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
      return k && hasKeyword(text, normalize(k));
    });

    if (hasShowAs && hasKeywords) return showAsHit || keywordHit;
    if (hasShowAs) return showAsHit;
    if (hasKeywords) return keywordHit;
    return false;
  }

  var LETTER = "a-z0-9\\u00c0-\\u024f";
  var keywordCache = Object.create(null);

  /**
   * Stichwort als ganzes Wort, als Wortende eines zusammengesetzten Worts
   * („Sommerferien“, „Zahnarzt“: mindestens vier Buchstaben davor) oder mit
   * Beugungs- bzw. Zeit-Endung („Kurse“, „Ferientag“, „Krankheitstage“).
   * Nicht aber mitten im Wort: „Konkursverfahren“, „Information“,
   * „Ferienvertretung“ sind keine Abwesenheiten.
   */
  function hasKeyword(text, kw) {
    var re = keywordCache[kw];
    if (!re) {
      var esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      re = kw.length <= 3
        ? new RegExp("(^|[^" + LETTER + "])" + esc + "($|[^" + LETTER + "])")
        : new RegExp("(^|[^" + LETTER + "]|[" + LETTER + "]{4})" + esc +
          "(s?(?:tag|tage|woche|wochen|halbtag)|e|en|n|s|es|er)?($|[^" + LETTER + "])");
      keywordCache[kw] = re;
    }
    return re.test(text);
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
    var dayMinutes = s.dayMinutes > 0 ? s.dayMinutes : DEFAULT_DAY_MINUTES;
    var byDate = Object.create(null);
    var seen = Object.create(null);

    (events || []).forEach(function (event) {
      if (!isRelevant(event, s)) return;
      // Derselbe Termin aus zwei Kalendern zählt nur einmal
      if (event.id) {
        if (seen[event.id]) return;
        seen[event.id] = true;
      }

      var text = searchableText(event);
      var rule = null;
      for (var i = 0; i < rules.length; i++) {
        if (matchRule(rules[i], event, text)) { rule = rules[i]; break; }
      }
      if (!rule) return;
      if (rule.locationOnly && s.importHomeOffice === false) return;

      var isPrivate = event.sensitivity === "private" || event.sensitivity === "confidential";
      var label = (s.copySubjectToNote !== false && !isPrivate) ? (event.subject || "") : "";
      var half = isHalfDay(text);

      eventDays(event).forEach(function (date) {
        var existing = byDate[date];

        /* Kurze Termine sind Besprechungen, keine Abwesenheit; ein halber
           Tag wird zum Halbtag. */
        var covered = coverageOn(event, date);
        if (covered < MIN_ABSENCE_MINUTES) return;
        var factor = half || (!event.isAllDay && covered < dayMinutes * FULL_DAY_SHARE) ? 0.5 : 1;

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
   * Tage eines abgeschlossenen Monats (opts.isLocked) nimmt der Speicher
   * nicht an: Was sich dort ändern würde, steht unter den geschützten Tagen
   * (reason "closed") — nie unter den Änderungen. So zählt der stille
   * Abgleich sie nicht mit und meldet sie nicht bei jedem Start erneut.
   *
   * @param {Object} mapped     Ergebnis von mapEvents()
   * @param {Function} getDay   (iso) => record | null
   * @param {Object} opts       { from, to, settings, isLocked(iso) }
   * @returns {{changes: Array, protectedDays: Array, unchanged: Number, closed: Number}}
   */
  function planSync(mapped, getDay, opts) {
    opts = opts || {};
    var from = opts.from;
    var to = opts.to;
    var changes = [];
    var protectedDays = [];
    var unchanged = 0;
    var closed = 0;

    var dates = T.rangeDays(from, to);

    dates.forEach(function (date) {
      var proposal = mapped[date] || null;
      var record = getDay(date) || null;
      var hasStamps = !!(record && (String(record.start || "").trim() || String(record.end || "").trim()));
      var fromCalendar = !!(record && (record.source === SOURCE || syncedLocationOnly(record)) && !editedByHand(record));
      var locked = !!(opts.isLocked && opts.isLocked(date));

      /* Abgeschlossener Monat: benennen statt anbieten */
      function offer(change) {
        if (!locked) { changes.push(change); return; }
        protectedDays.push({ date: date, proposal: proposal, record: summarize(record), reason: "closed", change: change });
        closed++;
      }

      /* --- Nichts im Kalender: bestehende Kalender-Einträge zurücknehmen --- */
      if (!proposal) {
        if (record && fromCalendar && !hasStamps) {
          offer({
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
        // Die übernommene Abwesenheit ist aus dem Kalender verschwunden,
        // der Homeoffice-Termin steht noch: Abwesenheit zurücknehmen, Ort setzen
        if (record && fromCalendar && record.type && !hasStamps) {
          offer({
            date: date,
            action: "clear",
            location: proposal.location,
            before: summarize(record),
            after: { location: proposal.location },
            reason: "gone"
          });
          return;
        }
        if (!record || record.location !== proposal.location) {
          offer({
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
      // Gestempelte Tage bleiben immer unberührt — auch ein Kurstag aus dem
      // Kalender, an dem man zusätzlich gestempelt hat.
      if (hasStamps) {
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

      offer({
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

    return { changes: changes, protectedDays: protectedDays, unchanged: unchanged, closed: closed };
  }

  /* Ältere Stände legten für einen Homeoffice-Termin nur { location,
     outlookSyncedAt } an, ohne Quelle. Ohne jeden eigenen Inhalt gehört so
     ein Datensatz dem Kalender — sonst bliebe er für immer liegen. */
  function syncedLocationOnly(record) {
    if (record.source || !record.outlookSyncedAt) return false;
    return !(String(record.start || "").trim() || String(record.end || "").trim() || record.type ||
      (record.breaks && record.breaks.length) || String(record.note || "").trim() ||
      (record.targetOverride !== null && record.targetOverride !== undefined));
  }

  /** Wurde ein übernommener Tag danach von Hand geändert? */
  function editedByHand(record) {
    if (!record.updatedAt || !record.outlookSyncedAt) return false;
    var edited = Date.parse(record.updatedAt);
    var synced = Date.parse(record.outlookSyncedAt);
    if (!isFinite(edited) || !isFinite(synced)) return false;
    return edited - synced > EDIT_TOLERANCE_MS;
  }

  function summarize(record) {
    if (!record) return null;
    return {
      type: record.type || null,
      factor: record.absenceFactor === undefined ? 1 : record.absenceFactor,
      start: record.start || "",
      end: record.end || "",
      location: record.location || "office",
      source: record.source || null,
      edited: record.source === SOURCE && editedByHand(record)
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
      var before = change.before || null;
      // Stempelungen gehören dem Nutzer: nie leeren, auch wenn ein Plan von
      // aussen kommt (Absicherung zusätzlich zu planSync)
      var stamped = !!(before && (String(before.start || "").trim() || String(before.end || "").trim()));
      if (change.action === "clear") {
        if (stamped) return;
        patch[change.date] = change.location
          ? { type: null, absenceFactor: 1, note: "", location: change.location, source: SOURCE, outlookSyncedAt: stamp }
          : null;
        return;
      }
      if (change.action === "location") {
        patch[change.date] = { location: change.location };
        /* Neuer Datensatz nur für den Ort: er gehört dem Kalender — so räumt
           ihn der nächste Abgleich wieder ab, und er zählt nicht als eigener
           Eintrag (Erfassungsbeginn, Lücken) */
        if (!before) patch[change.date].source = SOURCE;
        // Einen von Hand geänderten Kalendertag nicht wieder zum Kalendertag machen
        if (!(before && before.edited)) patch[change.date].outlookSyncedAt = stamp;
        return;
      }
      if (stamped) return;
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
    coverageOn: coverageOn,
    hasKeyword: hasKeyword,
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
