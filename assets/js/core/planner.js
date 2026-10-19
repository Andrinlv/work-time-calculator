/* ==========================================================================
   ZEITKONTO — Planung, Schnellerfassung und Prüfung
   --------------------------------------------------------------------------
   Alles, was vorausdenkt statt nur zurückzurechnen:

     · Schnellerfassung   „gestern 7:45-16:30 p30“ → fertiger Tageseintrag
     · Gleitzeit-Planer   Zielsaldo bis Datum → was pro Tag nötig ist
     · Kompensation       wie viele freie Tage im Konto stecken
     · Brückentage        wo wenige Ferientage viele freie Tage ergeben
     · Monatscheck        was vor dem Abschluss noch zu klären ist

   Wieder ausschliesslich reine Funktionen — die Oberfläche liegt in
   ui/views/tools.js.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Planner = factory(root.ZK.Time, root.ZK.Rules);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R) {
  "use strict";

  /* ==================================================================== */
  /* 1 · SCHNELLERFASSUNG                                                  */
  /* ==================================================================== */

  /* Wortschatz in allen vier Sprachen — klein geschrieben, gerader Apostroph.
     Akzente gibt es jeweils auch ohne, weil Handytastaturen sie gern weglassen. */
  var RELATIVE_DAYS = {
    heute: 0, today: 0, "aujourd'hui": 0, oggi: 0,
    gestern: -1, yesterday: -1, hier: -1, ieri: -1,
    vorgestern: -2, "avant-hier": -2, altroieri: -2, "l'altroieri": -2,
    morgen: 1, tomorrow: 1, demain: 1, domani: 1,
    "übermorgen": 2, uebermorgen: 2, "après-demain": 2, "apres-demain": 2, dopodomani: 2
  };

  var TYPE_WORDS = {
    ferien: "vacation", urlaub: "vacation", vacation: "vacation", vacances: "vacation",
    ferie: "vacation", vacanza: "vacation", vacanze: "vacation",
    krank: "sick", krankheit: "sick", sick: "sick", ill: "sick", malade: "sick", maladie: "sick",
    malattia: "sick", malato: "sick", malata: "sick",
    unfall: "accident", accident: "accident", infortunio: "accident",
    "militär": "military", militaer: "military", wk: "military", zivilschutz: "military",
    zivildienst: "military", military: "military", militaire: "military", militare: "military",
    komp: "comp", kompensation: "comp", zeitausgleich: "comp", gleittag: "comp", compensation: "comp",
    "récupération": "comp", recuperation: "comp", compensazione: "comp", recupero: "comp",
    kurs: "training", weiterbildung: "training", schulung: "training", training: "training",
    course: "training", formation: "training", cours: "training", formazione: "training", corso: "training",
    feiertag: "holiday", holiday: "holiday", "férié": "holiday", festivo: "holiday",
    frei: "free", free: "free", libre: "free", libero: "free",
    unbezahlt: "unpaid", unpaid: "unpaid"
  };

  var HALF_WORDS = ["halbtag", "halb", "½", "1/2", "half", "halfday", "demi", "mezza", "mezzagiornata"];

  var LOCATION_WORDS = {
    homeoffice: "home", "home-office": "home", home: "home", ho: "home", remote: "home",
    "télétravail": "home", teletravail: "home", telelavoro: "home", smartworking: "home",
    "büro": "office", buero: "office", office: "office", betrieb: "office", bureau: "office", ufficio: "office",
    aussendienst: "field", field: "field", terrain: "field", esterno: "field",
    unterwegs: "travel", reise: "travel", travel: "travel", "déplacement": "travel",
    deplacement: "travel", trasferta: "travel", viaggio: "travel"
  };

  /* Mehrwortige Begriffe werden vor dem Zerlegen zu einem Wort */
  var PHRASES = [
    ["halber tag", "halbtag"], ["half day", "halfday"], ["half-day", "halfday"],
    ["demi-journée", "demi"], ["demi journée", "demi"], ["demi-journee", "demi"], ["demi journee", "demi"],
    ["mezza giornata", "mezza"], ["mezza-giornata", "mezza"],
    ["l'altro ieri", "altroieri"], ["altro ieri", "altroieri"],
    ["home office", "homeoffice"], ["smart working", "smartworking"],
    ["jour férié", "férié"], ["giorno festivo", "festivo"],
    ["congé non payé", "unbezahlt"], ["non payé", "unbezahlt"], ["non paye", "unbezahlt"], ["sans solde", "unbezahlt"],
    ["non pagato", "unbezahlt"], ["non retribuito", "unbezahlt"],
    ["service militaire", "militaire"], ["service civil", "militaire"],
    ["servizio militare", "militare"], ["servizio civile", "militare"],
    ["fino alle", "-"], ["fino al", "-"], ["fino a", "-"], ["jusqu'à", "-"], ["jusqu'au", "-"]
  ];

  /* Bindewörter zwischen zwei Angaben („8 bis 17“, „du 12.10. au 16.10.“) */
  var CONNECTORS = ["bis", "to", "till", "until", "au", "à", "a", "al", "alle"];
  /* Füllwörter, die nichts beitragen („von 8 Uhr bis 17 Uhr“, „dalle 8 alle 17“) */
  var FILLERS = ["von", "vom", "ab", "am", "um", "uhr", "from", "on", "at", "de", "du", "des", "dès",
    "le", "la", "dalle", "dal", "dalla", "dai", "da", "il", "lo"];
  var BREAK_WORDS = /^(pausen|pause|pausa|break|p)(.*)$/;
  var MINUTE_UNITS = ["min", "mins", "minute", "minuten", "minutes", "minuti", "m", "'"];

  /** Längster Zeitraum, der sich mit einer Zeile eintragen lässt. */
  var MAX_RANGE = 62;
  /** Längste plausible Anwesenheit einer einzelnen Zeitspanne. */
  var MAX_SPAN = 16 * 60;

  /**
   * Liest eine Zeile wie „gestern 7:45-16:30 p30“ oder „12.10.-16.10. ferien“
   * und erklärt, was daraus wird — oder genau, woran es scheitert.
   *
   * Erkannt werden, in beliebiger Reihenfolge und in allen vier Sprachen:
   *   · ein Datum oder Zeitraum   heute · gestern · 12.10. · 12.10.2026 · 2026-10-12
   *                               12.10.-16.10. · 12.-16.10. · 28.12.-2.1.
   *   · eine Zeitspanne           8-17 · 7:45-16:30 · 0745-1630 · 7.45-16.30 · 7h45-16h30
   *                               zwei Spannen „8-12 13-17“ ergeben die Pause dazwischen
   *   · eine Pause                p30 · pause 45 · 30min · pausa 0:45 · eine nackte Zahl nach der Spanne
   *   · eine Tagesart             ferien · krank · vacances · malattia … (+ halbtag / demi / mezza)
   *   · ein Arbeitsort            homeoffice · büro · télétravail · trasferta …
   *   · eine Notiz                in Anführungszeichen: "Kundentermin Basel"
   *
   * Nie wird stillschweigend geraten: ein unlesbarer Zeitraum ergibt einen
   * Fehler statt des heutigen Tages.
   *
   * @returns {Object} { ok, error:{code, token, …}|null, dates, dateKind, start, end,
   *                     breakMinutes, breakStart, type, factor, location, note }
   */
  function analyzeQuickEntry(input, today) {
    var base = today || T.todayISO();
    var out = {
      ok: false, error: null, dates: [], dateKind: "default",
      start: null, end: null, breakMinutes: null, breakStart: null,
      type: null, factor: 1, location: null, note: null
    };
    if (input === null || input === undefined) return fail(out, "empty");

    /* Notiz zuerst herauslösen, damit ihr Inhalt nicht mitgelesen wird */
    var raw = String(input);
    var noteMatch = /["„“”«»]([^"„“”«»]*)["„“”«»]?/.exec(raw);
    if (noteMatch) {
      out.note = noteMatch[1].trim() || null;
      raw = raw.replace(noteMatch[0], " ");
    }

    var tokens = tokenize(raw);
    if (!tokens.length) return out.note ? fail(out, "missing-what") : fail(out, "empty");

    var seen = !!out.note;
    var unknown = [];
    var dateItems = [];      // { kind: "relative"|"single"|"range", … }
    var spans = [];          // { a, b, token }
    var ambiguous = [];      // „12.10-16.10“: Datumsbereich oder Uhrzeit?
    var looseDates = [];     // „12.10“ allein
    var singleTimes = [];    // „7:45“ allein
    var bare = [];           // nackte Zahlen — vielleicht die Pause
    var danglingBreak = null;

    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var next = tokens[i + 1];

      if (TYPE_WORDS[tok]) {
        if (out.type && out.type !== TYPE_WORDS[tok]) return fail(out, "multi-type", { token: tok });
        out.type = TYPE_WORDS[tok]; seen = true; continue;
      }
      if (HALF_WORDS.indexOf(tok) >= 0) { out.factor = 0.5; seen = true; continue; }
      if (Object.prototype.hasOwnProperty.call(RELATIVE_DAYS, tok)) {
        dateItems.push({ kind: "relative", offset: RELATIVE_DAYS[tok], token: tok }); seen = true; continue;
      }
      if (LOCATION_WORDS[tok]) { out.location = LOCATION_WORDS[tok]; seen = true; continue; }

      /* ---- Pause ---------------------------------------------------- */
      var bw = BREAK_WORDS.exec(tok);
      var brkMin = null;
      /* „pause 12-12:30“: Pause mit Uhrzeit */
      var brkSpan = bw ? /^([\d:.h]+)-([\d:.h]+)$/.exec(bw[2] || next || "") : null;
      if (brkSpan && timeShape(brkSpan[1]) && timeShape(brkSpan[2])) {
        var bFrom = readTime(brkSpan[1]), bTo = readTime(brkSpan[2]);
        if (bFrom === null || bTo === null || bTo % T.DAY === bFrom % T.DAY) {
          return fail(out, "bad-time", { token: bw[2] || next });
        }
        if (out.breakMinutes !== null) return fail(out, "multi-break", { token: tok });
        out.breakStart = T.formatHHMM(bFrom);
        out.breakMinutes = T.onTimeline(bTo % T.DAY, bFrom % T.DAY) - bFrom % T.DAY;
        if (!bw[2]) i++;
        seen = true; continue;
      }
      if (bw && bw[2] === "") {
        if (next !== undefined && parseBreakToken(next) !== null) { brkMin = parseBreakToken(next); i++; }
        else if (next !== undefined && /^\d{1,3}$/.test(next) && MINUTE_UNITS.indexOf(tokens[i + 2]) >= 0) {
          brkMin = +next; i += 2;
        } else { danglingBreak = tok; seen = true; continue; }
      } else if (bw && parseBreakToken(bw[2]) !== null) {
        brkMin = parseBreakToken(bw[2]);
      } else if (/^\d{1,3}(min|mins|minute|minuten|minutes|minuti|m|')$/.test(tok)) {
        brkMin = parseInt(tok, 10);
      } else if (/^\d{1,3}$/.test(tok) && MINUTE_UNITS.indexOf(next) >= 0) {
        brkMin = +tok; i++;
      }
      if (brkMin !== null) {
        if (out.breakMinutes !== null) return fail(out, "multi-break", { token: tok });
        out.breakMinutes = brkMin; seen = true; continue;
      }

      /* ---- ISO-Datum und -Bereich ------------------------------------ */
      var isoRange = /^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/.exec(tok);
      if (isoRange) {
        dateItems.push({ kind: "range", a: isoShape(isoRange[1]), b: isoShape(isoRange[2]), token: tok });
        seen = true; continue;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) {
        dateItems.push({ kind: "single", a: isoShape(tok), token: tok }); seen = true; continue;
      }

      /* ---- Paare mit Bindestrich: Zeitspanne oder Datumsbereich ------- */
      if (tok.indexOf("-") >= 0) {
        var parts = tok.split("-");
        var a = parts[0], b = parts[1];
        if (parts.length !== 2) { unknown.push(tok); continue; }
        if (!a || !b) {
          if (timeShape(a || b) || dateShape(a || b)) return fail(out, "open-range", { token: tok });
          unknown.push(tok); continue;
        }
        var da = dateShape(a), db = dateShape(b);
        var ta = timeShape(a), tb = timeShape(b);
        if (da && db && (da.strict || db.strict || !ta || !tb)) {
          dateItems.push({ kind: "range", a: da, b: db, token: tok }); seen = true; continue;
        }
        if (da && db) { ambiguous.push({ a: a, b: b, da: da, db: db, token: tok }); seen = true; continue; }
        if (ta && tb) { spans.push({ a: a, b: b, token: tok }); seen = true; continue; }
        unknown.push(tok); continue;
      }

      /* ---- Einzelne Angaben ------------------------------------------ */
      var ds = dateShape(tok);
      if (ds && ds.strict && !ds.dayOnly) { dateItems.push({ kind: "single", a: ds, token: tok }); seen = true; continue; }
      if (ds && !ds.strict) { looseDates.push({ ds: ds, token: tok }); seen = true; continue; }
      if (/^\d{1,3}$/.test(tok)) { bare.push(tok); continue; }
      if (timeShape(tok)) { singleTimes.push(tok); seen = true; continue; }
      unknown.push(tok);
    }

    /* „12.10“ ohne Schlusspunkt ist ein Datum — ausser es gibt schon eines */
    looseDates.forEach(function (l) {
      if (!dateItems.length) dateItems.push({ kind: "single", a: l.ds, token: l.token });
      else if (timeShape(l.token)) singleTimes.push(l.token);
      else unknown.push(l.token);
    });

    /* „12.10-16.10“: mit anderer Zeitspanne oder Abwesenheit ein Zeitraum,
       mit schon genanntem Datum eine Uhrzeit. */
    ambiguous.forEach(function (amb) {
      var absence = out.type && R.dayType(out.type).stampable === false;
      if (spans.length || (!dateItems.length && absence)) {
        dateItems.push({ kind: "range", a: amb.da, b: amb.db, token: amb.token });
      } else {
        spans.push({ a: amb.a, b: amb.b, token: amb.token });
      }
    });

    /* Eine nackte Zahl nach einer Zeitspanne ist die Pause („8-17 30“) */
    if (bare.length === 1 && spans.length && out.breakMinutes === null) {
      out.breakMinutes = +bare[0];
      seen = true;
      bare = [];
    }
    bare.forEach(function (n) { unknown.push(n); });

    if (unknown.length) return fail(out, seen ? "unknown" : "unreadable", { token: unknown[0] });
    if (danglingBreak && out.breakMinutes === null) return fail(out, "break-missing", { token: danglingBreak });
    if (singleTimes.length) return fail(out, "single-time", { token: singleTimes[0] });
    if (dateItems.length > 1) return fail(out, "multi-date", { token: dateItems[1].token });
    if (spans.length > 2) return fail(out, "multi-span", { token: spans[2].token });

    /* ---- Datum auflösen ------------------------------------------------ */
    if (dateItems.length) {
      var res = resolveDates(dateItems[0], base);
      if (res.error) return fail(out, res.error.code, res.error);
      out.dates = res.dates;
      out.dateKind = dateItems[0].kind;
    } else {
      out.dates = [base];
    }

    /* ---- Zeitspanne(n) ------------------------------------------------- */
    if (spans.length) {
      var first = readSpan(spans[0]);
      if (first.error) return fail(out, first.error.code, first.error);
      var startMin = first.start;
      var endTl = first.endTl;

      if (spans.length === 2) {
        var second = readSpan(spans[1]);
        if (second.error) return fail(out, second.error.code, second.error);
        var gapFrom = endTl;
        var gapTo = T.onTimeline(second.start, startMin);
        var secondEnd = gapTo + (second.endTl - second.start);
        if (gapTo < gapFrom || secondEnd - startMin > MAX_SPAN) {
          return fail(out, "multi-span", { token: spans[1].token });
        }
        if (gapTo > gapFrom) {
          if (out.breakMinutes !== null) return fail(out, "break-conflict", { token: spans[1].token });
          out.breakMinutes = gapTo - gapFrom;
          out.breakStart = T.formatHHMM(gapFrom);
        }
        endTl = secondEnd;
      }

      out.start = T.formatHHMM(startMin);
      out.end = T.formatHHMM(endTl);
      var presence = endTl - startMin;
      if (out.breakStart) {
        var bStartTl = T.onTimeline(T.parseHHMM(out.breakStart), startMin);
        if (bStartTl + out.breakMinutes > endTl) return fail(out, "break-outside", { token: out.breakStart });
      }
      if (out.breakMinutes !== null && out.breakMinutes >= presence) {
        return fail(out, "break-too-long", { minutes: out.breakMinutes, presence: presence });
      }
    }

    /* ---- Reicht das für einen Eintrag? ---------------------------------- */
    if (!out.start && !out.type) {
      if (!seen) return fail(out, "unreadable");
      if (out.factor !== 1) return fail(out, "half-type");
      if (dateItems.length) return fail(out, "only-date");
      if (out.breakMinutes !== null) return fail(out, "only-break");
      return fail(out, "missing-what");
    }
    if (out.factor !== 1 && !out.type) return fail(out, "half-type");
    /* Ganzer Ferien- oder Krankheitstag mit Arbeitszeit widerspricht sich —
       gemeint ist meist ein halber Tag. */
    if (out.type && out.start && out.factor >= 1 && R.dayType(out.type).stampable === false) {
      return fail(out, "absence-times", { type: out.type });
    }

    out.ok = true;
    return out;
  }

  /** Wie früher: das Ergebnis, wenn es brauchbar ist, sonst null. */
  function parseQuickEntry(input, today) {
    var r = analyzeQuickEntry(input, today);
    return r.ok ? r : null;
  }

  function fail(out, code, extra) {
    out.ok = false;
    out.error = Object.assign({ code: code }, extra || {});
    return out;
  }

  /** Text in Wörter zerlegen; Bindewörter werden zu „-“, Füllwörter fallen weg. */
  function tokenize(raw) {
    var text = " " + String(raw).toLowerCase()
      .replace(/[’`´]/g, "'")
      .replace(/[–—−]/g, "-")
      .replace(/[,;]+/g, " ")
      .replace(/\s+/g, " ") + " ";
    PHRASES.forEach(function (p) {
      text = text.split(" " + p[0] + " ").join(" " + p[1] + " ");
    });
    var words = [];
    text.split(" ").forEach(function (w) {
      if (!w || FILLERS.indexOf(w) >= 0) return;
      words.push(CONNECTORS.indexOf(w) >= 0 ? "-" : w);
    });
    var joined = words.join(" ").replace(/\s*-\s*/g, "-").trim();
    return joined ? joined.split(" ") : [];
  }

  /** Pausendauer: „30“, „30min“, „45'“, „1h“, „1h15“, „0:45“. */
  function parseBreakToken(s) {
    if (s === undefined || s === null) return null;
    var m = /^(\d{1,3})(?:min|mins|minute|minuten|minutes|minuti|m|')?$/.exec(s);
    if (m) return +m[1];
    m = /^(\d{1,2})h(\d{2})?$/.exec(s);
    if (m && (!m[2] || +m[2] < 60)) return +m[1] * 60 + (m[2] ? +m[2] : 0);
    m = /^(\d{1,2})[:.](\d{2})$/.exec(s);
    if (m && +m[2] < 60) return +m[1] * 60 + +m[2];
    return null;
  }

  /** Sieht der Text wie eine Uhrzeit aus? (Ob sie gültig ist, prüft readTime.) */
  function timeShape(s) {
    return /^(\d{1,4}|\d{1,2}[:.h]\d{2}h?|\d{1,2}h)$/.test(String(s || ""));
  }

  /** „8“, „0745“, „745“, „7:45“, „7.45“, „7h45“, „16h“ → Minuten, sonst null. */
  function readTime(s) {
    var m = /^(\d{1,2})(?:[:.h](\d{2}))?h?$/.exec(s);
    if (!m) m = /^(\d)(\d{2})$/.exec(s);
    if (!m) m = /^(\d{2})(\d{2})$/.exec(s);
    if (!m) return null;
    var h = +m[1], min = m[2] ? +m[2] : 0;
    if (h === 24 && min === 0) return T.DAY;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function readSpan(span) {
    var s = readTime(span.a);
    if (s === null) return { error: { code: "bad-time", token: span.a } };
    var e = readTime(span.b);
    if (e === null) return { error: { code: "bad-time", token: span.b } };
    if (s === T.DAY) s = 0;
    var endTl = T.onTimeline(e % T.DAY, s);
    /* „8 to 5“: über Nacht wären das 21 Stunden — gemeint ist 17 Uhr */
    if (endTl - s > MAX_SPAN && e < 13 * 60 && e + 12 * 60 > s) endTl = e + 12 * 60;
    if (endTl === s) return { error: { code: "span-empty", token: span.token } };
    if (endTl - s > MAX_SPAN) return { error: { code: "span-long", token: span.token, minutes: endTl - s } };
    return { start: s, endTl: endTl };
  }

  /**
   * Form eines Datums: { d, m, y, strict, dayOnly } oder null.
   * „Strikt“ ist alles, was nur ein Datum sein kann (Schlusspunkt, Jahr,
   * Schrägstrich); „12.10“ ohne Punkt könnte auch 12:10 Uhr heissen.
   */
  function dateShape(s) {
    s = String(s || "");
    var m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/.exec(s);
    if (m) return { d: +m[1], m: +m[2], y: m[3] ? +m[3] : null, strict: true };
    m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(s);
    if (m) return { d: +m[1], m: +m[2], y: m[3] ? +m[3] : null, strict: true };
    m = /^(\d{1,2})\.$/.exec(s);
    if (m && +m[1] >= 1 && +m[1] <= 31) return { d: +m[1], m: null, y: null, strict: true, dayOnly: true };
    m = /^(\d{1,2})\.(\d{1,2})$/.exec(s);
    if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) {
      return { d: +m[1], m: +m[2], y: null, strict: false };
    }
    return null;
  }

  function isoShape(iso) {
    return { d: +iso.slice(8, 10), m: +iso.slice(5, 7), y: +iso.slice(0, 4), strict: true, token: iso };
  }

  function fullYear(y) { return y < 100 ? 2000 + y : y; }

  function isoOf(y, m, d) {
    var s = y + "-" + T.pad2(m) + "-" + T.pad2(d);
    return T.isValidISO(s) ? s : null;
  }

  /** Jahr eines Datums ohne Jahresangabe: rund um den Jahreswechsel das nähere. */
  function guessYear(month, base) {
    var y = T.yearOf(base), bm = +String(base).slice(5, 7);
    if (bm >= 11 && month <= 2) return y + 1;
    if (bm <= 2 && month >= 11) return y - 1;
    return y;
  }

  function resolveDates(item, base) {
    if (item.kind === "relative") return { dates: [T.addDays(base, item.offset)] };

    if (item.kind === "single") {
      var a = item.a;
      var iso = isoOf(a.y ? fullYear(a.y) : guessYear(a.m, base), a.m, a.d);
      if (!iso) return { error: { code: "bad-date", token: item.token } };
      return { dates: [iso] };
    }

    /* Zeitraum */
    var A = item.a, B = item.b;
    var tokA = item.token.split("-")[0], tokB = item.token.split("-").slice(1).join("-");
    if (A.token) { tokA = A.token; tokB = B.token; }
    if (B.dayOnly) return { error: { code: "bad-date", token: tokB } };
    if (A.dayOnly) A = { d: A.d, m: B.m, y: B.y };

    var ya = A.y ? fullYear(A.y) : null;
    var yb = B.y ? fullYear(B.y) : null;
    if (ya === null && yb === null) { ya = guessYear(A.m, base); yb = ya; }
    else if (ya === null) ya = yb;
    else if (yb === null) yb = ya;

    var from = isoOf(ya, A.m, A.d);
    if (!from) return { error: { code: "bad-date", token: tokA } };
    var to = isoOf(yb, B.m, B.d);
    if (!to) return { error: { code: "bad-date", token: tokB } };

    /* „28.12.-2.1.“ geht über den Jahreswechsel — ohne Jahr eindeutig */
    if (to < from && A.m > B.m) {
      if (!B.y) to = isoOf(yb + 1, B.m, B.d);
      else if (!A.y) from = isoOf(ya - 1, A.m, A.d);
      if (to && from && T.diffDays(from, to) + 1 > MAX_RANGE) to = null;
    }
    if (!from || !to || to < from) {
      return { error: { code: "range-backwards", token: item.token } };
    }
    var n = T.diffDays(from, to) + 1;
    if (n > MAX_RANGE) return { error: { code: "range-too-long", token: item.token, days: n, max: MAX_RANGE } };
    return { dates: T.rangeDays(from, to) };
  }

  /** „12.8.“, „12.08.2026“, „2026-08-12“ → ISO, sonst null. */
  function parseDateToken(token, base) {
    var s = String(token).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return T.isValidISO(s) ? s : null;
    var shape = dateShape(s);
    if (!shape || shape.dayOnly) return null;
    var b = base || T.todayISO();
    return isoOf(shape.y ? fullYear(shape.y) : T.yearOf(b), shape.m, shape.d);
  }

  /* -------------------------------------------------------------------- */
  /* Vom Parse-Ergebnis zum Speicherauftrag                                */
  /* -------------------------------------------------------------------- */

  /** Trägt der Datensatz schon etwas, das man versehentlich überschreiben könnte? */
  function hasContent(rec) {
    if (!rec) return false;
    return !!(String(rec.start || "").trim() || String(rec.end || "").trim() || rec.type ||
      (rec.breaks && rec.breaks.length) || String(rec.note || "").trim() ||
      (rec.targetOverride !== null && rec.targetOverride !== undefined));
  }

  /**
   * Pause in die Zeitspanne legen: auf die gewohnte Mittagspause, wenn sie
   * hineinpasst, sonst mittig — nie ausserhalb, sonst zählt sie nicht.
   */
  function placeBreak(parsed, date, opts) {
    var minutes = parsed.breakMinutes;
    if (!minutes || !parsed.start) return null;
    var s = T.parseHHMM(parsed.start);
    var e = T.onTimeline(T.parseHHMM(parsed.end) % T.DAY, s);
    var bs = null;
    if (parsed.breakStart) {
      bs = T.onTimeline(T.parseHHMM(parsed.breakStart), s);
    } else {
      var lunch = opts.lunch && T.parseHHMM(opts.lunch.start);
      if (lunch !== null && lunch !== undefined) {
        var l = T.onTimeline(lunch, s);
        if (l >= s && l + minutes <= e) bs = l;
      }
      if (bs === null) bs = s + Math.max(0, Math.round((e - s - minutes) / 2));
    }
    return {
      id: "q" + date.replace(/-/g, ""),
      label: opts.breakLabel || "Pause",
      start: T.formatHHMM(bs),
      end: T.formatHHMM(bs + minutes),
      paid: false
    };
  }

  /** Bestehende Pausen behalten, soweit sie in der neuen Spanne liegen. */
  function keepBreaksInside(breaks, start, end) {
    var s = T.parseHHMM(start);
    var e = T.parseHHMM(end);
    if (s === null || e === null) return (breaks || []).slice();
    var eTl = T.onTimeline(e % T.DAY, s);
    return (breaks || []).filter(function (b) {
      var bs = T.parseHHMM(b.start);
      if (bs === null) return false;
      return T.onTimeline(bs, s) < eTl;
    }).map(function (b) { return Object.assign({}, b); });
  }

  /**
   * Was an einem Tag geändert wird. Alles, was die Eingabe nicht nennt —
   * Pausen, Notiz, Arbeitsort —, bleibt wie es war.
   */
  function mergeQuickDay(before, parsed, date, opts) {
    var prev = before || {};
    var patch = {};

    if (parsed.type) {
      patch.type = parsed.type;
      patch.absenceFactor = parsed.factor;
      /* Ganztägige Abwesenheit ohne Zeiten: Stempel und Pausen räumen */
      if (!parsed.start && parsed.factor >= 1) {
        patch.start = ""; patch.end = ""; patch.breaks = [];
      }
    } else if (parsed.start && prev.type && R.dayType(prev.type).stampable === false &&
               !(prev.absenceFactor < 1)) {
      /* Zeiten auf einem ganzen Ferientag: aus der Abwesenheit wird Arbeit */
      patch.type = null;
      patch.absenceFactor = 1;
    }

    if (parsed.start) {
      patch.start = parsed.start;
      patch.end = parsed.end;
      var brk = placeBreak(parsed, date, opts);
      if (brk) patch.breaks = [brk];
      else if (parsed.breakMinutes === 0) patch.breaks = [];
      else patch.breaks = keepBreaksInside(prev.breaks, parsed.start, parsed.end);
    }
    if (parsed.location) patch.location = parsed.location;
    if (parsed.note) patch.note = parsed.note;
    return patch;
  }

  function sameDay(a, b) {
    function norm(r) {
      r = r || {};
      return JSON.stringify([
        r.type || null, r.absenceFactor === undefined || r.absenceFactor === null ? 1 : r.absenceFactor,
        r.start || "", r.end || "", String(r.note || ""), r.location || "office",
        (r.breaks || []).map(function (x) { return [x.start || "", x.end || "", !!x.paid]; })
      ]);
    }
    return norm(a) === norm(b);
  }

  /**
   * Plant eine Schnellerfassung Tag für Tag, ohne etwas zu speichern.
   *
   * @param {Object} parsed  Ergebnis von analyzeQuickEntry (ok)
   * @param {Object} opts {
   *   getRecord(iso) -> Datensatz|null   was heute gespeichert ist
   *   dayOff(iso)    -> null|"weekend"|"holiday"   freie Tage in Zeiträumen überspringen
   *   lunch          { start, end }      gewohnte Mittagspause
   *   breakLabel
   * }
   * @returns {Object} { days:[{ date, status, reason, before, after, patch }],
   *                     fresh, occupied, unchanged, skipped, error }
   *   status: "new" (leer) · "occupied" (erfasst, würde sich ändern) ·
   *           "same" (schon genau so erfasst) · "skipped" (freier Tag im Zeitraum)
   */
  function planQuickEntry(parsed, opts) {
    opts = opts || {};
    var getRecord = opts.getRecord || function () { return null; };
    var plan = { days: [], fresh: 0, occupied: 0, unchanged: 0, skipped: 0, error: null };
    if (!parsed || !parsed.dates || !parsed.dates.length) return plan;
    var isRange = parsed.dates.length > 1;

    parsed.dates.forEach(function (date) {
      var before = getRecord(date) || null;
      var entry = { date: date, status: "new", reason: null, before: before, after: null, patch: null };

      /* In Zeiträumen zählen nur Arbeitstage — sonst würden Wochenenden
         und Feiertage als Ferien verbucht. Ein einzeln genannter Tag gilt. */
      var off = isRange && opts.dayOff ? opts.dayOff(date) : null;
      if (off) {
        entry.status = "skipped";
        entry.reason = off;
        plan.skipped++;
        plan.days.push(entry);
        return;
      }

      entry.patch = mergeQuickDay(before, parsed, date, opts);
      entry.after = Object.assign({ date: date }, before || {}, entry.patch);
      if (!hasContent(before)) { entry.status = "new"; plan.fresh++; }
      else if (sameDay(before, entry.after)) { entry.status = "same"; plan.unchanged++; }
      else { entry.status = "occupied"; plan.occupied++; }
      plan.days.push(entry);
    });

    if (!plan.fresh && !plan.occupied && !plan.unchanged) plan.error = "no-workday";
    return plan;
  }

  /** Speicherauftrag aus einem Plan: leere Tage immer, erfasste nur auf Wunsch. */
  function selectQuickPatch(plan, overwrite) {
    var patch = Object.create(null);
    (plan && plan.days || []).forEach(function (d) {
      if (d.status === "new" || (overwrite && d.status === "occupied")) patch[d.date] = d.patch;
    });
    return patch;
  }

  /**
   * Wandelt ein Parse-Ergebnis in Speicher-Aufträge um (alle Tage, ohne
   * Rücksicht auf Bestehendes — die Oberfläche entscheidet über planQuickEntry).
   */
  function quickEntryToPatch(parsed, opts) {
    var patch = Object.create(null);
    if (!parsed) return patch;
    planQuickEntry(parsed, opts).days.forEach(function (d) {
      if (d.patch) patch[d.date] = d.patch;
    });
    return patch;
  }

  /* ==================================================================== */
  /* 2 · GLEITZEIT-PLANER                                                  */
  /* ==================================================================== */

  /**
   * Verteilt die Differenz zwischen jetzigem und gewünschtem Saldo auf die
   * verbleibenden Arbeitstage — innerhalb dessen, was ein Tag hergibt:
   * nicht weniger als nichts (bzw. das heute schon Gearbeitete) und nicht
   * mehr als das Tagesmaximum.
   *
   * @param {Number} balanceNow    aktueller Saldo in Minuten
   * @param {Number} targetBalance gewünschter Saldo am Stichtag
   * @param {Array}  workdays      [{ date, target, min?, max? }] nur Tage mit Soll > 0
   * @param {Object} opts          { maxNet: 600, strainedNet: 540 }
   * @returns {Object} { feasible, reason, delta, perDay, dayCount, days:[{ date, target,
   *                     plannedNet, deltaPerDay }], strained, needNet, achievable, shortfall }
   */
  function distributeBalance(balanceNow, targetBalance, workdays, opts) {
    opts = opts || {};
    var maxNet = opts.maxNet > 0 ? opts.maxNet : 600;
    var strainedNet = opts.strainedNet > 0 ? opts.strainedNet : 540;
    var days = (workdays || []).filter(function (d) { return d.target > 0; });
    var delta = Math.round((targetBalance || 0) - (balanceNow || 0));

    if (!days.length) {
      return { feasible: false, perDay: 0, delta: delta, dayCount: 0, days: [], reason: "no-days" };
    }

    var bounds = days.map(function (d) {
      var lo = Math.max(0, Math.round(d.min || 0));
      var hi = Math.max(lo, d.max !== undefined && d.max !== null ? d.max : maxNet);
      return { lo: lo, hi: hi };
    });
    var minDelta = 0, maxDelta = 0, targetSum = 0;
    days.forEach(function (d, i) {
      minDelta += bounds[i].lo - d.target;
      maxDelta += bounds[i].hi - d.target;
      targetSum += d.target;
    });
    var perDay = Math.round(delta / days.length);
    var needNet = Math.round((targetSum + delta) / days.length);

    /* Unmöglich: jeder Tag am Anschlag, und es reicht trotzdem nicht */
    if (delta < minDelta || delta > maxDelta) {
      var low = delta < minDelta;
      var capped = days.map(function (d, i) {
        var net = low ? bounds[i].lo : bounds[i].hi;
        return { date: d.date, target: d.target, plannedNet: net, deltaPerDay: net - d.target };
      });
      var achievable = low ? minDelta : maxDelta;
      return {
        feasible: false,
        reason: low ? "too-much-plus" : "over-max",
        delta: delta,
        perDay: perDay,
        needNet: needNet,
        maxNet: maxNet,
        achievable: achievable,
        shortfall: delta - achievable,
        dayCount: days.length,
        days: capped,
        strained: false
      };
    }

    /* Gleichmässig verteilen; wer an eine Grenze stösst, wird dort
       festgehalten, der Rest verteilt sich auf die übrigen Tage. */
    var fixed = days.map(function () { return null; });
    for (var round = 0; round <= days.length; round++) {
      var open = [], fixedSum = 0;
      days.forEach(function (d, i) {
        if (fixed[i] === null) open.push(i);
        else fixedSum += fixed[i] - d.target;
      });
      if (!open.length) break;
      var share = (delta - fixedSum) / open.length;
      var changed = false;
      open.forEach(function (i) {
        var want = days[i].target + share;
        if (want < bounds[i].lo) { fixed[i] = bounds[i].lo; changed = true; }
        else if (want > bounds[i].hi) { fixed[i] = bounds[i].hi; changed = true; }
      });
      if (!changed) break;
    }

    var planned = days.map(function (d, i) {
      return { date: d.date, target: d.target, plannedNet: fixed[i], deltaPerDay: 0, open: fixed[i] === null };
    });
    var openDays = planned.filter(function (p) { return p.open; });
    var fixedTotal = planned.reduce(function (a, p) { return a + (p.open ? 0 : p.plannedNet - p.target); }, 0);
    var rest = delta - fixedTotal;
    if (openDays.length) {
      var base = Math.floor(rest / openDays.length);
      var extra = rest - base * openDays.length;      // 0 … n−1 Minuten Rundungsrest
      openDays.forEach(function (p, k) {
        /* Rundungsrest auf die letzten Tage, damit die Summe exakt stimmt */
        var add = base + (k >= openDays.length - extra ? 1 : 0);
        p.plannedNet = p.target + add;
      });
    }
    planned.forEach(function (p) {
      p.deltaPerDay = p.plannedNet - p.target;
      delete p.open;
    });

    return {
      feasible: true,
      reason: null,
      delta: delta,
      perDay: perDay,
      needNet: needNet,
      maxNet: maxNet,
      dayCount: days.length,
      days: planned,
      /* Über neun Stunden netto am Tag ist machbar, aber sportlich */
      strained: planned.some(function (p) { return p.plannedNet > strainedNet; })
    };
  }

  /**
   * Wie viele ganze freie Tage stecken im Konto?
   * @returns {{ days: Number, rest: Number, dayTarget: Number }}
   */
  function compensationDays(balanceMinutes, dayTargetMinutes) {
    var target = dayTargetMinutes > 0 ? dayTargetMinutes : 504;
    if (balanceMinutes <= 0) return { days: 0, rest: Math.max(0, balanceMinutes), dayTarget: target };
    return {
      days: Math.floor(balanceMinutes / target),
      rest: balanceMinutes % target,
      dayTarget: target
    };
  }

  /**
   * Gehen-Zeit, um an einem einzelnen Tag einen gewünschten Tagessaldo zu
   * erreichen. Berücksichtigt die Pausenstaffel über denselben Fixpunkt wie
   * die Engine (R.presenceForNet); optional roundStep / roundMode wie in
   * den Einstellungen, damit die Rundung das Ziel nicht unterläuft.
   */
  function leaveTimeForBalance(opts) {
    var startTod = T.parseHHMM(opts.start);
    if (startTod === null) return null;

    var target = opts.target || 0;
    var credited = opts.credited || 0;
    var wanted = Math.max(0, target - credited + (opts.wantBalance || 0));
    // Derselbe Löser wie in der Engine: Staffel auf die Arbeitszeit, Rundung inklusive.
    var gross = R.presenceForNet(wanted, {
      breakRuleset: opts.breakRuleset || "ch",
      customBreakTiers: opts.customBreakTiers,
      autoDeductBreak: opts.autoDeductBreak !== false,
      roundStep: opts.roundStep || 0,
      roundMode: opts.roundMode
    }, { unpaid: opts.breakMinutes || 0, paid: 0 }).gross;
    return { minutes: startTod + gross, text: T.formatHHMM(startTod + gross), dayOffset: T.dayOffsetOf(startTod + gross) };
  }

  /* ==================================================================== */
  /* 3 · BRÜCKENTAGE                                                       */
  /* ==================================================================== */

  /**
   * Sucht Zeiträume, in denen wenige Ferientage viele freie Tage ergeben.
   *
   * @param {Object} opts {
   *   from, to,                  Zeitraum
   *   isHoliday(iso) -> Boolean,
   *   isWorkday(iso) -> Boolean, (Wochenarbeitstage laut Modell)
   *   maxVacation,               höchstens so viele Ferientage je Vorschlag
   *   minRatio                   Mindestverhältnis freie Tage / Ferientage
   * }
   * @returns {Array} [{ from, to, totalDays, vacationDays, dates, ratio, holidays }]
   */
  function bridgeDays(opts) {
    opts = opts || {};
    var maxVacation = opts.maxVacation || 4;
    var minRatio = opts.minRatio || 2;
    var maxLength = opts.maxLength || 16;
    var isHoliday = opts.isHoliday || function () { return false; };
    var isWorkday = opts.isWorkday || function () { return true; };

    var all = T.rangeDays(opts.from, opts.to);
    if (!all.length) return [];

    /* Vorberechnen: ist der Tag ohnehin frei? */
    var free = all.map(function (iso) { return !isWorkday(iso) || isHoliday(iso); });

    var candidates = [];

    for (var i = 0; i < all.length; i++) {
      if (!free[i]) continue;                       // sinnvoll ist nur ein freier Beginn
      for (var len = 3; len <= maxLength && i + len <= all.length; len++) {
        var j = i + len - 1;
        if (!free[j]) continue;                     // und ein freies Ende

        var needed = [];
        for (var k = i; k <= j; k++) if (!free[k]) needed.push(all[k]);
        /* Noch komplett frei (Wochenende + Feiertag): weiter verlängern —
           erst danach kommen die Tage, um die es geht. */
        if (!needed.length) continue;
        if (needed.length > maxVacation) break;

        var ratio = len / needed.length;
        if (ratio < minRatio) continue;

        var holidaysInside = [];
        for (var h = i; h <= j; h++) {
          if (isWorkday(all[h]) && isHoliday(all[h])) holidaysInside.push(all[h]);
        }
        if (!holidaysInside.length) continue;       // ohne Feiertag ist es keine Brücke

        candidates.push({
          from: all[i], to: all[j],
          totalDays: len,
          vacationDays: needed.length,
          dates: needed,
          holidays: holidaysInside,
          ratio: Math.round(ratio * 100) / 100
        });
      }
    }

    /* Beste zuerst, dann überschneidungsfrei auswählen */
    candidates.sort(function (a, b) {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (b.totalDays !== a.totalDays) return b.totalDays - a.totalDays;
      return a.from < b.from ? -1 : 1;
    });

    var chosen = [];
    candidates.forEach(function (c) {
      var overlaps = chosen.some(function (x) { return !(c.to < x.from || c.from > x.to); });
      if (!overlaps) chosen.push(c);
    });

    chosen.sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    return chosen;
  }

  /* ==================================================================== */
  /* 4 · MONATSCHECK                                                       */
  /* ==================================================================== */

  var AUDIT_CODES = [
    "gap", "incomplete", "break-auto", "break-short", "over-daily-max",
    "rest-short", "invalid", "absence-with-times", "no-break", "long-day"
  ];

  /**
   * Fasst zusammen, was vor einem Monatsabschluss noch zu klären ist.
   * Jeder Tag zählt je Ursache genau einmal: ein vergessenes Gehen ist
   * „angefangen, nie beendet“ — nicht zusätzlich Lücke und unlesbar.
   *
   * @param {Array}  dayResults  Ergebnisse aus Engine.computeRange().days
   * @param {String} today
   * @param {Object} opts        { since } — vor diesem Tag gibt es keine Lücken
   *                             (erster Eintrag bzw. Kontobeginn)
   */
  function auditRange(dayResults, today, opts) {
    var now = today || T.todayISO();
    var since = opts && opts.since ? opts.since : null;
    var groups = Object.create(null);
    var counted = Object.create(null);

    function add(code, date, extra) {
      if (counted[code + "|" + date]) return;
      counted[code + "|" + date] = true;
      if (!groups[code]) groups[code] = { code: code, dates: [], count: 0, level: levelOf(code) };
      groups[code].count++;
      if (groups[code].dates.length < 60) groups[code].dates.push(Object.assign({ date: date }, extra || {}));
    }

    (dayResults || []).forEach(function (r) {
      if (r.incomplete) add("incomplete", r.date);
      else if (r.target > 0 && !r.recorded && r.date < now && !(since && r.date < since)) add("gap", r.date);

      r.warnings.forEach(function (w) {
        if (w.code === "missing-end") return;          // steckt schon in „incomplete“
        if (w.code === "break-auto") add("break-auto", r.date, { minutes: w.minutes });
        else if (w.code === "break-short") add("break-short", r.date, { minutes: w.minutes });
        else if (w.code === "over-daily-max") add("over-daily-max", r.date, { minutes: w.minutes });
        else if (w.code === "rest-short") add("rest-short", r.date, { minutes: w.minutes });
        else if (w.code === "no-break") add("no-break", r.date);
        else if (w.code === "absence-with-times") add("absence-with-times", r.date, { minutes: w.minutes });
        else if (w.level === "error") add("invalid", r.date);
      });
    });

    var list = AUDIT_CODES.map(function (code) { return groups[code]; }).filter(Boolean);
    var errors = list.filter(function (g) { return g.level === "error"; })
      .reduce(function (a, g) { return a + g.count; }, 0);

    return {
      issues: list,
      total: list.reduce(function (a, g) { return a + g.count; }, 0),
      errors: errors,
      clean: list.length === 0
    };
  }

  function levelOf(code) {
    if (code === "gap" || code === "incomplete" || code === "invalid") return "error";
    if (code === "no-break") return "info";
    return "warn";
  }

  /* ==================================================================== */
  /* 5 · PROGNOSE                                                          */
  /* ==================================================================== */

  /**
   * Fortschreibung des Saldos bis zum Stichtag, wenn ab jetzt exakt nach
   * Soll gearbeitet wird — also: was bleibt am Monatsende stehen?
   */
  function forecast(balanceNow, remainingWorkdays, averageDelta) {
    var delta = averageDelta || 0;
    return {
      balance: Math.round(balanceNow + delta * remainingWorkdays),
      remainingWorkdays: remainingWorkdays,
      perDay: Math.round(delta)
    };
  }

  return {
    RELATIVE_DAYS: RELATIVE_DAYS,
    TYPE_WORDS: TYPE_WORDS,
    AUDIT_CODES: AUDIT_CODES,
    LOCATION_WORDS: LOCATION_WORDS,
    MAX_RANGE: MAX_RANGE,
    analyzeQuickEntry: analyzeQuickEntry,
    parseQuickEntry: parseQuickEntry,
    parseDateToken: parseDateToken,
    planQuickEntry: planQuickEntry,
    selectQuickPatch: selectQuickPatch,
    hasContent: hasContent,
    quickEntryToPatch: quickEntryToPatch,
    distributeBalance: distributeBalance,
    compensationDays: compensationDays,
    leaveTimeForBalance: leaveTimeForBalance,
    bridgeDays: bridgeDays,
    auditRange: auditRange,
    forecast: forecast
  };
});
