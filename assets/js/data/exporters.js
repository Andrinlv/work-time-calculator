/* ==========================================================================
   ZEITKONTO — Export-Formate
   --------------------------------------------------------------------------
   CSV (Excel-freundlich), JSON (vollständige Sicherung), ICS (Kalender)
   und eine Textzusammenfassung fürs schnelle Kopieren.

   Die CSV-Datei der App lässt sich verlustfrei wieder einlesen: Tagesart,
   Anteil (Halbtage), echte Pausenzeiten, Ort und mehrzeilige Notizen
   kommen so zurück, wie sie hinausgingen — der Saldo bleibt derselbe.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../core/time.js"), require("../core/rules.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Exporters = factory(root.ZK.Time, root.ZK.Rules);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R) {
  "use strict";

  var DOW_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  /* Texte von Textzusammenfassung und Kalenderdatei. Deutsch, solange die
     Oberfläche nichts anderes mitgibt (opts.text, gleiche Schlüssel). */
  var TEXT_DE = {
    title: "ZEITKONTO · {from} bis {to}",
    net: "Netto",
    target: "Soll",
    actual: "Ist",
    balance: "Saldo",
    breaks: "Pausen",
    days: "Tage",
    daysLine: "{recorded} erfasst · {worked} gearbeitet",
    netOf: "{v} netto"
  };

  function textOf(opts) {
    var out = {};
    var own = (opts && opts.text) || {};
    Object.keys(TEXT_DE).forEach(function (k) { out[k] = own[k] ? String(own[k]) : TEXT_DE[k]; });
    return out;
  }

  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] === undefined || vars[k] === null ? m : String(vars[k]);
    });
  }

  /** Feiertagsname in der Sprache der Oberfläche (opts.lang), sonst Deutsch. */
  function holidayName(h, lang) {
    if (!h) return "";
    return (lang && h.names && h.names[lang]) || h.name || "";
  }

  /* ------------------------------------------------------------------ */
  /* CSV                                                                 */
  /* ------------------------------------------------------------------ */

  /* Spalten der App-CSV in fester Reihenfolge. Neue Spalten nur hinten
     anfügen — bestehende Auswertungen in Excel zählen auf die Position. */
  var CSV_COLUMNS = [
    ["date", "Datum"], ["weekday", "Wochentag"], ["week", "KW"], ["type", "Art"], ["location", "Ort"],
    ["start", "Kommen"], ["end", "Gehen"], ["presence", "Anwesenheit (h:mm)"], ["breaks", "Pausen (min)"],
    ["requiredBreak", "Pflichtpause (min)"], ["autoBreak", "Autom. Abzug (min)"], ["net", "Netto (h:mm)"],
    ["netDecimal", "Netto (dezimal)"], ["target", "Soll (h:mm)"], ["credited", "Gutschrift (h:mm)"],
    ["balance", "Saldo (h:mm)"], ["balanceMin", "Saldo (min)"], ["holiday", "Feiertag"], ["note", "Notiz"],
    ["hints", "Hinweise"], ["factor", "Anteil"], ["breakTimes", "Pausenzeiten (* bezahlt)"]
  ];

  /* Zellen, die eine Tabellenkalkulation als Formel lesen würde. Auch
     „'=…“ wird maskiert, damit das Einlesen genau ein Apostroph entfernt
     und Notizen, die selbst mit „'“ beginnen, unverändert zurückkommen. */
  var FORMULA_START = /^'*[=+\-@\t\r]/;

  function csvCell(value, delim, text) {
    var s = value === null || value === undefined ? "" : String(value);
    if (text && FORMULA_START.test(s)) s = "'" + s;
    if (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Gegenstück zu csvCell: den Schutz-Apostroph wieder entfernen.
      Gilt für jede Textzelle — auch Kommen, Gehen und Pausenzeiten, die
      aus einer eingelesenen Sicherung beliebigen Text tragen können. */
  function unescapeText(s) {
    return FORMULA_START.test(s) && s.charAt(0) === "'" ? s.slice(1) : s;
  }

  function percent(f) {
    return Math.round(f * 100) + " %";
  }

  /** Pausen als „12:00-12:30, 15:00-15:10*“ (Stern = bezahlt). */
  function formatBreakTimes(list) {
    return (list || []).map(function (b) {
      var s = typeof b.start === "number" ? T.formatHHMM(b.start) : String(b.start || "");
      var e = typeof b.end === "number" ? T.formatHHMM(b.end) : String(b.end || "");
      if (!s || !e || s === "--:--" || e === "--:--") return "";
      return s + "-" + e + (b.paid ? "*" : "");
    }).filter(Boolean).join(", ");
  }

  /**
   * @param {Array} dayResults  Ergebnisse aus Engine.computeRange().days
   * @param {Object} opts       {
   *   delimiter, bom, decimalComma, onlyRecorded,
   *   labels          Tagesart -> Bezeichnung
   *   headers         Spalten-ID -> Überschrift (sonst Deutsch, siehe CSV_COLUMNS)
   *   weekdays        7 Kurznamen ab Sonntag (sonst Deutsch)
   *   locationLabels  Ort -> Bezeichnung (sonst der Schlüssel)
   *   hintLabels      Hinweis-Code -> kurzer Text (sonst der Code); mehrere
   *                   Hinweise eines Tages stehen mit „ · “ getrennt
   *   lang            Sprache der Feiertagsnamen (sonst Deutsch)
   *   getRecord       (iso) => gespeicherter Tag; liefert Pausen samt bezahlten
   * }
   * Jede Zelle, die Text aus Eingaben oder Bezeichnungen trägt, wird gegen
   * Formeln geschützt („'=…“) — auch Kommen, Gehen und Pausenzeiten: Eine
   * eingelesene Sicherung kann dort beliebigen Text ablegen. Der Import
   * entfernt den Apostroph wieder.
   */
  function toCSV(dayResults, opts) {
    opts = opts || {};
    var d = opts.delimiter || ";";
    var labels = opts.labels || {};
    var headers = opts.headers || {};
    var weekdays = opts.weekdays || DOW_DE;
    var locLabels = opts.locationLabels || {};
    var hintLabels = opts.hintLabels || {};
    var decimalComma = opts.decimalComma !== false;

    var lines = [CSV_COLUMNS.map(function (c) { return csvCell(headers[c[0]] || c[1], d, true); }).join(d)];

    dayResults.forEach(function (r) {
      if (opts.onlyRecorded && !r.recorded) return;
      var dec = (r.net / 60).toFixed(2);
      if (decimalComma) dec = dec.replace(".", ",");
      var record = opts.getRecord ? opts.getRecord(r.date) : null;
      var breakList = record && Array.isArray(record.breaks) && r.start ? record.breaks : r.breaks;
      var credits = !!(r.typeMeta && r.typeMeta.credits);
      var row = [
        [r.date],
        [weekdays[r.weekday], true],
        [r.isoWeek],
        [labels[r.type] || r.type, true],
        [locLabels[r.location] || r.location || "", true],
        [r.start || "", true],
        [r.end || "", true],
        [T.formatDuration(r.presence, "clock")],
        [r.breakTotal],
        [r.requiredBreak],
        [r.autoDeducted],
        [T.formatDuration(r.net, "clock")],
        [dec],
        [T.formatDuration(r.target, "clock")],
        [T.formatDuration(r.credited, "clock")],
        [T.formatSigned(r.balance, "clock")],
        [r.balance],
        [holidayName(r.holiday, opts.lang), true],
        [r.note || "", true],
        [hintsOf(r.warnings, hintLabels), true],
        [credits && r.absenceFactor !== undefined ? percent(r.absenceFactor) : ""],
        [r.start ? formatBreakTimes(breakList) : "", true]
      ];
      lines.push(row.map(function (c) { return csvCell(c[0], d, c[1]); }).join(d));
    });

    var body = lines.join("\r\n");
    return (opts.bom === false ? "" : "﻿") + body;
  }

  /** Hinweise eines Tages lesbar: „Pflichtpause ergänzt · Ruhezeit zu kurz“ (jeder Text einmal). */
  function hintsOf(warnings, hintLabels) {
    var seen = {};
    var out = [];
    (warnings || []).forEach(function (w) {
      var text = Object.prototype.hasOwnProperty.call(hintLabels, w.code) && hintLabels[w.code] ? String(hintLabels[w.code]) : w.code;
      if (seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out.join(" · ");
  }

  /* ------------------------------------------------------------------ */
  /* ICS (iCalendar)                                                     */
  /* ------------------------------------------------------------------ */

  function icsEscape(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  /**
   * Lokale Wanduhrzeit ohne Zeitzone („floating“). Bewusst ohne
   * Date-Arithmetik: an Tagen der Zeitumstellung würde setMinutes() die
   * Uhrzeit um eine Stunde verschieben.
   */
  function icsStamp(iso, minutes) {
    if (!T.fromISO(iso)) return null;
    var m = Math.round(minutes);
    var offset = Math.floor(m / T.DAY);
    var date = offset ? T.addDays(iso, offset) : iso;
    var tod = m - offset * T.DAY;
    return String(date).replace(/-/g, "") + "T" + T.pad2(Math.floor(tod / 60)) + T.pad2(tod % 60) + "00";
  }

  function icsDate(iso) { return String(iso).replace(/-/g, ""); }

  /**
   * Kalenderdatei: Arbeitsblöcke als Termine, Abwesenheiten als Ganztages-Einträge.
   * opts: { labels, calendarName, text (siehe TEXT_DE) }
   */
  function toICS(dayResults, opts) {
    opts = opts || {};
    var labels = opts.labels || {};
    var tx = textOf(opts);
    var now = new Date();
    var stamp = now.getUTCFullYear() + T.pad2(now.getUTCMonth() + 1) + T.pad2(now.getUTCDate()) +
      "T" + T.pad2(now.getUTCHours()) + T.pad2(now.getUTCMinutes()) + T.pad2(now.getUTCSeconds()) + "Z";

    var out = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Zeitkonto//Arbeitszeit//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEscape(opts.calendarName || "Zeitkonto")
    ];

    dayResults.forEach(function (r) {
      if (!r.recorded) return;
      // Ein Termin je Tag: die UID hängt nur am Datum, nicht am Exportzeitraum —
      // erneutes Einlesen aktualisiert den Termin, statt ihn zu verdoppeln.
      var uid = "zk-" + r.date + "@zeitkonto";

      if (r.complete && r.startTl !== null && r.endTl !== null && r.endTl > r.startTl) {
        out.push(
          "BEGIN:VEVENT",
          "UID:" + uid,
          "DTSTAMP:" + stamp,
          "DTSTART:" + icsStamp(r.date, r.startTl),
          "DTEND:" + icsStamp(r.date, r.endTl),
          "SUMMARY:" + icsEscape((labels[r.type] || r.type) + " · " + fill(tx.netOf, { v: T.formatDuration(r.net, "clock") })),
          "DESCRIPTION:" + icsEscape(
            tx.net + " " + T.formatDuration(r.net, "clock") +
            " · " + tx.target + " " + T.formatDuration(r.target, "clock") +
            " · " + tx.balance + " " + T.formatSigned(r.balance, "clock") +
            " · " + tx.breaks + " " + r.breakTotal + " min" +
            (r.note ? "\n" + r.note : "")
          ),
          "CATEGORIES:" + icsEscape(labels[r.type] || r.type),
          "END:VEVENT"
        );
      } else if (r.credited > 0 || r.type === "comp") {
        out.push(
          "BEGIN:VEVENT",
          "UID:" + uid,
          "DTSTAMP:" + stamp,
          "DTSTART;VALUE=DATE:" + icsDate(r.date),
          "DTEND;VALUE=DATE:" + icsDate(T.addDays(r.date, 1)),
          "SUMMARY:" + icsEscape(labels[r.type] || r.type),
          "TRANSP:TRANSPARENT",
          "END:VEVENT"
        );
      }
    });

    out.push("END:VCALENDAR");
    return out.map(foldLine).join("\r\n");
  }

  function utf8Length(code) {
    return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }

  /**
   * RFC 5545: Zeilen auf 75 Oktette falten — gezählt in UTF-8, nicht in
   * JavaScript-Zeichen, und nie mitten in einem Zeichen (Emoji bestehen
   * aus zwei UTF-16-Einheiten). Folgezeilen beginnen mit einem Leerzeichen.
   */
  function foldLine(line) {
    var parts = [];
    var cur = "";
    var bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var code = line.charCodeAt(i);
      var ch = line.charAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < line.length) {
        var low = line.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          ch = line.slice(i, i + 2);
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      var len = utf8Length(code);
      if (bytes + len > 75) {
        parts.push(cur);
        cur = " ";
        bytes = 1;
      }
      cur += ch;
      bytes += len;
    }
    parts.push(cur);
    return parts.join("\r\n");
  }

  /* ------------------------------------------------------------------ */
  /* Textzusammenfassung                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Textzusammenfassung zum Kopieren.
   * opts: { labels, weekdays (7 Kurznamen ab Sonntag), text (siehe TEXT_DE),
   *         formatDate(iso) für Titel und Zeilen — sonst ISO }
   */
  function toText(range, opts) {
    opts = opts || {};
    var labels = opts.labels || {};
    var weekdays = opts.weekdays || DOW_DE;
    var tx = textOf(opts);
    var date = typeof opts.formatDate === "function" ? opts.formatDate : function (iso) { return iso; };
    var t = range.totals;
    var lines = [];
    lines.push(fill(tx.title, { from: date(range.from), to: date(range.to) }));
    lines.push("".padEnd(46, "-"));
    range.days.forEach(function (r) {
      if (!r.recorded) return;
      lines.push(
        date(r.date) + "  " + weekdays[r.weekday] + "  " +
        (r.start || "--:--") + "–" + (r.end || "--:--") + "  " +
        tx.net + " " + pad(T.formatDuration(r.net, "clock"), 6) +
        "  " + tx.balance + " " + pad(T.formatSigned(r.balance, "clock"), 7) +
        (r.type !== "work" ? "  [" + (labels[r.type] || r.type) + "]" : "")
      );
    });
    lines.push("".padEnd(46, "-"));
    // Bezeichnungen bündig — „Soll“ ist kürzer als „Temps dû“
    var width = Math.max(8, tx.target.length, tx.actual.length, tx.balance.length, tx.days.length) + 1;
    lines.push(pad(tx.target, width) + T.formatDuration(t.target, "clock"));
    lines.push(pad(tx.actual, width) + T.formatDuration(t.net + t.credited, "clock"));
    lines.push(pad(tx.balance, width) + T.formatSigned(t.balance, "clock"));
    lines.push(pad(tx.days, width) + fill(tx.daysLine, { recorded: t.recordedDays, worked: t.workedDays }));
    return lines.join("\n");
  }

  function pad(s, n) {
    s = String(s);
    while (s.length < n) s += " ";
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* CSV-Import                                                          */
  /* ------------------------------------------------------------------ */

  /*
     Spaltenerkennung: je Feld eine Liste von Namen in allen vier Sprachen,
     in Prioritätsreihenfolge. Zuerst zählt die exakte Überschrift (auch ohne
     Klammerzusatz wie „(min)“), dann ein ganzes Wort darin — nie ein
     Wortteil, sonst wird aus „Start“ die Spalte „Art“ und aus „Wochentag“
     das Datum. Eine Spalte gehört höchstens einem Feld.
  */
  var CSV_FIELDS = [
    ["date", ["datum", "date", "data", "tag", "day", "jour", "giorno"]],
    ["breakTimes", ["pausenzeiten", "break times", "heures de pause", "orari pause"]],
    ["start", ["kommen", "start", "beginn", "von", "clock-in", "clock in", "check-in", "arrivée", "arrivee", "début", "debut", "entrata", "inizio", "in"]],
    ["end", ["gehen", "ende", "end", "bis", "clock-out", "clock out", "check-out", "départ", "depart", "fin", "uscita", "fine", "out"]],
    ["brk", ["pausen", "pause", "pausen (min)", "break", "breaks", "pauses", "pausa", "pause (min)"]],
    ["type", ["art", "tagesart", "typ", "type", "kategorie", "category", "tipo", "type de jour", "tipo di giorno"]],
    ["location", ["ort", "arbeitsort", "standort", "location", "lieu", "luogo"]],
    ["factor", ["anteil", "faktor", "factor", "share", "part", "taux", "quota"]],
    ["note", ["notiz", "notizen", "note", "notes", "bemerkung", "kommentar", "comment", "remarque", "nota"]]
  ];

  function headerForms(h) {
    var full = String(h || "").replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");
    var base = full.replace(/\s*\(.*\)\s*$/, "").trim();
    return { full: full, base: base };
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /**
   * @param {Array} header   Überschriften
   * @param {Array} extra    zusätzliche Namenslisten {feld: [namen]} (z. B. übersetzte Überschriften)
   */
  function detectColumns(header, extra) {
    var forms = header.map(headerForms);
    var used = {};
    var idx = {};
    CSV_FIELDS.forEach(function (field) {
      var key = field[0];
      var names = field[1].slice();
      (extra || []).forEach(function (map) {
        if (map && map[key]) names.unshift(String(map[key]).toLowerCase());
      });
      idx[key] = -1;
      // 1. exakte Überschrift
      for (var n = 0; n < names.length && idx[key] < 0; n++) {
        for (var i = 0; i < forms.length; i++) {
          if (used[i]) continue;
          if (forms[i].full === names[n] || forms[i].base === names[n]) { idx[key] = i; break; }
        }
      }
      // 2. ganzes Wort (nur bei Namen ab 4 Zeichen — „in“ oder „von“ wären zu beliebig)
      for (var n2 = 0; n2 < names.length && idx[key] < 0; n2++) {
        if (names[n2].length < 4) continue;
        var re = new RegExp("(^|[^\\wäöüéèàçâêîôû])" + escapeRe(names[n2]) + "($|[^\\wäöüéèàçâêîôû])");
        for (var j = 0; j < forms.length; j++) {
          if (used[j]) continue;
          if (re.test(forms[j].full)) { idx[key] = j; break; }
        }
      }
      if (idx[key] >= 0) used[idx[key]] = true;
    });
    idx.brkUnit = idx.brk >= 0 && /\((h|std|stunden|hours|heures|ore)\)/.test(forms[idx.brk].full) ? "h" : "min";
    return idx;
  }

  /**
   * Zerlegt den ganzen Text mit einem einzigen Automaten — Trennzeichen
   * und Zeilenumbrüche innerhalb von Anführungszeichen gehören zur Zelle.
   */
  function parseRows(text, delim) {
    var rows = [];
    var row = [];
    var cur = "";
    var inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += c;
      } else if (c === '"') {
        inQ = true;
      } else if (c === delim) {
        row.push(cur); cur = "";
      } else if (c === "\r" || c === "\n") {
        if (c === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(cur); rows.push(row);
        row = []; cur = "";
      } else {
        cur += c;
      }
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (cell) { return String(cell).trim(); }); });
  }

  /** Trennzeichen der Kopfzeile (ausserhalb von Anführungszeichen gezählt). */
  function detectDelimiter(text) {
    var counts = { ";": 0, ",": 0, "\t": 0 };
    var inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === '"') inQ = !inQ;
      else if (!inQ && (c === "\n" || c === "\r")) break;
      else if (!inQ && counts[c] !== undefined) counts[c]++;
    }
    return [";", ",", "\t"].sort(function (a, b) { return counts[b] - counts[a]; })[0];
  }

  /** Pausendauer: „30“, „45 min“, „1:00“, „0,5 h“. Reine Zahlen sind Minuten. */
  function parseBreakMinutes(value, unit) {
    var s = String(value || "").trim();
    if (!s) return null;
    var mins;
    if (/^\d+$/.test(s)) mins = unit === "h" ? +s * 60 : +s;
    else if (/^\d+[.,]\d+$/.test(s) && unit !== "h" && +s.replace(",", ".") >= 5) mins = Math.round(+s.replace(",", "."));
    else mins = T.parseDuration(s);
    if (mins === null || !isFinite(mins) || mins < 0 || mins >= T.DAY) return null;
    return Math.round(mins);
  }

  /** „12:00-12:30, 15:00-15:10*“ → Pausenliste. */
  function parseBreakTimes(value) {
    var out = [];
    String(value || "").split(/[,;\/|]+|\s{2,}/).forEach(function (part) {
      var m = /(\d{1,2}[:.h]\d{2})\s*[-–—]\s*(\d{1,2}[:.h]\d{2})\s*(\*)?/.exec(part.trim());
      if (!m) return;
      var s = T.parseHHMM(m[1]), e = T.parseHHMM(m[2]);
      if (s === null || e === null) return;
      out.push({ start: T.formatHHMM(s), end: T.formatHHMM(e), paid: !!m[3] });
    });
    return out;
  }

  /** „50 %“, „0,5“, „½“ → 0.5 */
  function parseFactor(value) {
    var s = String(value || "").trim().replace(",", ".");
    if (!s) return null;
    if (s === "½") return 0.5;
    var pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
    var f = pct ? +pct[1] / 100 : (/^\d+(?:\.\d+)?$/.test(s) ? +s : NaN);
    if (!isFinite(f)) return null;
    if (f > 1 && f <= 100) f = f / 100;
    return f >= 0 && f <= 1 ? Math.round(f * 100) / 100 : null;
  }

  /**
   * Sehr toleranter CSV-Import: erkennt Trennzeichen und Spalten automatisch.
   * @param {Object} opts  { headers: [ {feld: Überschrift}, … ] } zusätzliche (übersetzte) Überschriften
   * @returns {{rows, delimiter, columns, error?, code?}}
   */
  function parseCSV(text, opts) {
    opts = opts || {};
    var clean = String(text || "").replace(/^﻿/, "");
    if (!clean.trim()) return { rows: [], error: "Datei ist leer", code: "empty" };
    var delim = detectDelimiter(clean);
    var table = parseRows(clean, delim);
    if (!table.length) return { rows: [], error: "Datei ist leer", code: "empty" };

    var idx = detectColumns(table[0], opts.headers);
    if (idx.date < 0) return { rows: [], error: "Spalte „Datum“ nicht gefunden", code: "no-date", columns: idx };

    function cell(cells, key) {
      return idx[key] >= 0 && cells[idx[key]] !== undefined ? String(cells[idx[key]]) : "";
    }

    var rows = [];
    for (var i = 1; i < table.length; i++) {
      var cells = table[i];
      var iso = normalizeDate(cell(cells, "date"));
      if (!iso) continue;
      var row = { date: iso, breaks: [] };
      var start = unescapeText(cell(cells, "start").trim());
      var end = unescapeText(cell(cells, "end").trim());
      if (start) { var st = T.parseHHMM(start); if (st !== null) row.start = T.formatHHMM(st); }
      if (end) { var en = T.parseHHMM(end); if (en !== null) row.end = T.formatHHMM(en); }
      var note = cell(cells, "note");
      if (note) row.note = unescapeText(note);
      var type = unescapeText(cell(cells, "type").trim());
      if (type) row.typeHint = type.toLowerCase();
      var loc = unescapeText(cell(cells, "location").trim());
      if (loc) row.locationHint = loc.toLowerCase();
      var factor = parseFactor(cell(cells, "factor"));
      if (factor !== null) row.factor = factor;
      var mins = parseBreakMinutes(cell(cells, "brk"), idx.brkUnit);
      if (mins) row.breakMinutes = mins;
      if (idx.breakTimes >= 0) row.breakTimes = parseBreakTimes(unescapeText(cell(cells, "breakTimes").trim()));
      rows.push(row);
    }
    return { rows: rows, delimiter: delim, columns: idx };
  }

  /* Gängige Wörter für Tagesarten — ergänzt die übersetzten Bezeichnungen. */
  var TYPE_WORDS = {
    arbeit: "work", work: "work", travail: "work", lavoro: "work",
    ferien: "vacation", urlaub: "vacation", vacances: "vacation", vacanze: "vacation", ferie: "vacation",
    krank: "sick", krankheit: "sick", sick: "sick", malade: "sick", maladie: "sick", malattia: "sick",
    unfall: "accident", accident: "accident", infortunio: "accident",
    "militär": "military", militaer: "military", "zivilschutz": "military",
    kompensation: "comp", zeitausgleich: "comp", compensation: "comp", compensazione: "comp",
    weiterbildung: "training", schulung: "training", training: "training", formation: "training", formazione: "training",
    feiertag: "holiday", "jour férié": "holiday", festivo: "holiday",
    unbezahlt: "unpaid", unpaid: "unpaid",
    frei: "free", arbeitsfrei: "free"
  };

  /** Bezeichnungs-Listen ({schlüssel: text} je Sprache) zu text → schlüssel. */
  function reverseLabels(list, keys) {
    var out = {};
    (keys || []).forEach(function (k) { out[String(k).toLowerCase()] = k; });
    (Array.isArray(list) ? list : (list ? [list] : [])).forEach(function (map) {
      Object.keys(map || {}).forEach(function (k) {
        if (map[k]) out[String(map[k]).trim().toLowerCase()] = k;
      });
    });
    return out;
  }

  /**
   * Übersetzt eingelesene CSV-Zeilen in Speicher-Aufträge für setDays().
   * Es werden nur Felder gesetzt, für die die Datei eine Spalte hat; Zeilen
   * ohne eigene Angabe (leere Wochenenden, automatische Feiertage) legen
   * keinen Eintrag an.
   *
   * @param {Object} parsed  Ergebnis von parseCSV()
   * @param {Object} opts    {
   *   getDay(iso)      bestehender Eintrag oder null
   *   autoType(iso)    Tagesart, die die App ohne Angabe ableitet ("work"|"free"|"holiday")
   *   typeLabels       [{work: "Arbeit", …}, {work: "Work", …}] (alle Sprachen)
   *   locationLabels   [{office: "Betrieb", …}, …]
   *   breakLabel       Bezeichnung für eine aus „Pausen (min)“ gebildete Pause
   *   lunch            gewohnte Mittagspause { start } — dorthin, wenn sie in die Spanne passt
   * }
   * @returns {{days, added, updated, skipped, unknownTypes}}
   */
  function csvRowsToDays(parsed, opts) {
    opts = opts || {};
    var cols = parsed.columns || {};
    var has = function (k) { return cols[k] !== undefined && cols[k] >= 0; };
    var typeKeys = Object.keys(R.DAY_TYPES);
    var typeMap = reverseLabels(opts.typeLabels, typeKeys);
    Object.keys(TYPE_WORDS).forEach(function (w) { if (!typeMap[w]) typeMap[w] = TYPE_WORDS[w]; });
    var locMap = reverseLabels(opts.locationLabels, R.LOCATIONS);
    var getDay = opts.getDay || function () { return null; };
    // Ohne Kalenderwissen gelten Arbeit und Arbeitsfrei als abgeleitet
    var autoType = opts.autoType || function (iso, t) { return t === "work" || t === "free" ? t : null; };

    var days = {};
    var added = 0, updated = 0, skipped = 0, unknownTypes = 0;

    (parsed.rows || []).forEach(function (row) {
      var iso = row.date;
      var existing = getDay(iso);
      var patch = {};

      /* Tagesart: nur wenn sie von der automatischen abweicht, wird sie fest gesetzt */
      if (has("type") && row.typeHint) {
        var t = typeMap[row.typeHint];
        if (!t) { unknownTypes++; }
        else patch.type = t === autoType(iso, t) ? null : t;
      } else if (has("type")) {
        patch.type = null;
      }
      if (row.factor !== undefined && patch.type) patch.absenceFactor = row.factor;
      else if (patch.type && R.DAY_TYPES[patch.type] && R.DAY_TYPES[patch.type].credits) patch.absenceFactor = 1;

      if (has("start")) patch.start = row.start || "";
      if (has("end")) patch.end = row.end || "";
      if (has("note")) patch.note = row.note || "";
      if (has("location") && row.locationHint && locMap[row.locationHint]) patch.location = locMap[row.locationHint];

      /* Pausen: echte Zeiten, sonst eine Pause aus der Dauer in der Mitte des Tages */
      var startMin = T.parseHHMM(row.start);
      var endMin = T.parseHHMM(row.end);
      if (has("breakTimes") && (row.breakTimes || []).length) {
        patch.breaks = row.breakTimes.map(function (b, i) {
          return { id: "csv" + i + "_" + iso, label: "", start: b.start, end: b.end, paid: !!b.paid };
        });
      } else if (row.breakMinutes && startMin !== null) {
        var keep = existing && Array.isArray(existing.breaks) && existing.start === row.start &&
          unpaidMinutes(existing.breaks) === row.breakMinutes;
        if (!keep) {
          // Auf die gewohnte Mittagspause, wenn sie in die Spanne passt, sonst
          // mittig — nie ausserhalb, sonst zählt sie nicht (wie die Schnellerfassung)
          var span = endMin === null ? 8 * 60 : T.onTimeline(endMin, startMin) - startMin;
          var at = startMin + Math.max(0, Math.round((span - row.breakMinutes) / 2));
          var lunch = opts.lunch ? T.parseHHMM(opts.lunch.start) : null;
          if (lunch !== null) {
            var l = T.onTimeline(lunch, startMin);
            if (l >= startMin && l + row.breakMinutes <= startMin + span) at = l;
          }
          patch.breaks = [{ id: "csv0_" + iso, label: opts.breakLabel || "", start: T.formatHHMM(at), end: T.formatHHMM(at + row.breakMinutes), paid: false }];
        }
      } else if (has("brk") || has("breakTimes")) {
        patch.breaks = [];
      }

      /* Trägt die Zeile überhaupt etwas? Leere Zeilen (Wochenende, automatischer
         Feiertag) legen nichts an und leeren auch keinen erfassten Tag — eine
         ältere Datei soll keine neueren Eingaben löschen. */
      var informative = !!(patch.type || patch.start || patch.end || patch.note ||
        (patch.breaks && patch.breaks.length));
      if (!informative || (existing && sameAs(existing, patch))) { skipped++; return; }
      days[iso] = patch;
      if (existing) updated++; else added++;
    });

    return { days: days, added: added, updated: updated, skipped: skipped, unknownTypes: unknownTypes };
  }

  function unpaidMinutes(breaks) {
    var total = 0;
    (breaks || []).forEach(function (b) {
      if (b.paid) return;
      var s = T.parseHHMM(b.start), e = T.parseHHMM(b.end);
      if (s === null || e === null) return;
      total += e >= s ? e - s : e + T.DAY - s;
    });
    return total;
  }

  function sameAs(record, patch) {
    return Object.keys(patch).every(function (k) {
      var a = record[k], b = patch[k];
      if (k === "type") return (a || null) === (b || null);
      if (k === "breaks") {
        var x = (a || []).map(function (i) { return i.start + "-" + i.end + (i.paid ? "*" : ""); }).join(",");
        var y = (b || []).map(function (i) { return i.start + "-" + i.end + (i.paid ? "*" : ""); }).join(",");
        return x === y;
      }
      if (k === "absenceFactor") return Number(a === undefined ? 1 : a) === Number(b);
      return (a === undefined || a === null ? "" : a) === (b === undefined || b === null ? "" : b);
    });
  }

  /** Akzeptiert 2026-08-06, 06.08.2026, 6/8/2026. */
  function normalizeDate(value) {
    var s = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return T.isValidISO(s) ? s : null;
    var m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/.exec(s);
    if (!m) return null;
    var y = +m[3];
    if (y < 100) y += 2000;
    var iso = y + "-" + T.pad2(+m[2]) + "-" + T.pad2(+m[1]);
    return T.isValidISO(iso) ? iso : null;
  }

  return {
    CSV_COLUMNS: CSV_COLUMNS,
    TEXT_DE: TEXT_DE,
    toCSV: toCSV,
    toICS: toICS,
    toText: toText,
    parseCSV: parseCSV,
    csvRowsToDays: csvRowsToDays,
    parseBreakMinutes: parseBreakMinutes,
    foldLine: foldLine,
    normalizeDate: normalizeDate
  };
});
