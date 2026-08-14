/* ==========================================================================
   ZEITKONTO — Export-Formate
   --------------------------------------------------------------------------
   CSV (Excel-freundlich), JSON (vollständige Sicherung), ICS (Kalender)
   und eine Textzusammenfassung fürs schnelle Kopieren.
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

  /* ------------------------------------------------------------------ */
  /* CSV                                                                 */
  /* ------------------------------------------------------------------ */

  function csvCell(value, delim) {
    var s = value === null || value === undefined ? "" : String(value);
    if (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * @param {Array} dayResults  Ergebnisse aus Engine.computeRange().days
   * @param {Object} opts       { delimiter, bom, decimal, labels }
   */
  function toCSV(dayResults, opts) {
    opts = opts || {};
    var d = opts.delimiter || ";";
    var labels = opts.labels || {};
    var decimalComma = opts.decimalComma !== false;

    var header = [
      "Datum", "Wochentag", "KW", "Art", "Ort", "Kommen", "Gehen",
      "Anwesenheit (h:mm)", "Pausen (min)", "Pflichtpause (min)", "Autom. Abzug (min)",
      "Netto (h:mm)", "Netto (dezimal)", "Soll (h:mm)", "Gutschrift (h:mm)",
      "Saldo (h:mm)", "Saldo (min)", "Feiertag", "Notiz", "Hinweise"
    ];

    var lines = [header.map(function (h) { return csvCell(h, d); }).join(d)];

    dayResults.forEach(function (r) {
      if (opts.onlyRecorded && !r.recorded) return;
      var dec = (r.net / 60).toFixed(2);
      if (decimalComma) dec = dec.replace(".", ",");
      var row = [
        r.date,
        DOW_DE[r.weekday],
        r.isoWeek,
        labels[r.type] || r.type,
        r.location || "",
        r.start || "",
        r.end || "",
        T.formatDuration(r.presence, "clock"),
        r.breakTotal,
        r.requiredBreak,
        r.autoDeducted,
        T.formatDuration(r.net, "clock"),
        dec,
        T.formatDuration(r.target, "clock"),
        T.formatDuration(r.credited, "clock"),
        T.formatSigned(r.balance, "clock"),
        r.balance,
        r.holiday ? r.holiday.name : "",
        r.note || "",
        r.warnings.map(function (w) { return w.code; }).join(" ")
      ];
      lines.push(row.map(function (c) { return csvCell(c, d); }).join(d));
    });

    var body = lines.join("\r\n");
    return (opts.bom === false ? "" : "﻿") + body;
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

  function icsStamp(iso, minutes) {
    var base = T.fromISO(iso);
    if (!base) return null;
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setMinutes(d.getMinutes() + Math.round(minutes));
    return d.getFullYear() + T.pad2(d.getMonth() + 1) + T.pad2(d.getDate()) +
      "T" + T.pad2(d.getHours()) + T.pad2(d.getMinutes()) + "00";
  }

  function icsDate(iso) { return String(iso).replace(/-/g, ""); }

  /** Kalenderdatei: Arbeitsblöcke als Termine, Abwesenheiten als Ganztages-Einträge. */
  function toICS(dayResults, opts) {
    opts = opts || {};
    var labels = opts.labels || {};
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

    dayResults.forEach(function (r, idx) {
      if (!r.recorded) return;
      var uid = "zk-" + r.date + "-" + idx + "@zeitkonto";

      if (r.complete && r.startTl !== null && r.endTl !== null && r.endTl > r.startTl) {
        out.push(
          "BEGIN:VEVENT",
          "UID:" + uid,
          "DTSTAMP:" + stamp,
          "DTSTART:" + icsStamp(r.date, r.startTl),
          "DTEND:" + icsStamp(r.date, r.endTl),
          "SUMMARY:" + icsEscape((labels[r.type] || r.type) + " · " + T.formatDuration(r.net, "clock") + " netto"),
          "DESCRIPTION:" + icsEscape(
            "Netto " + T.formatDuration(r.net, "clock") +
            " · Soll " + T.formatDuration(r.target, "clock") +
            " · Saldo " + T.formatSigned(r.balance, "clock") +
            " · Pausen " + r.breakTotal + " min" +
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

  /** RFC 5545: Zeilen auf 75 Oktette falten. */
  function foldLine(line) {
    if (line.length <= 74) return line;
    var parts = [line.slice(0, 74)];
    var rest = line.slice(74);
    while (rest.length > 73) {
      parts.push(" " + rest.slice(0, 73));
      rest = rest.slice(73);
    }
    if (rest) parts.push(" " + rest);
    return parts.join("\r\n");
  }

  /* ------------------------------------------------------------------ */
  /* Textzusammenfassung                                                 */
  /* ------------------------------------------------------------------ */

  function toText(range, opts) {
    opts = opts || {};
    var labels = opts.labels || {};
    var t = range.totals;
    var lines = [];
    lines.push("ZEITKONTO · " + range.from + " bis " + range.to);
    lines.push("".padEnd(46, "-"));
    range.days.forEach(function (r) {
      if (!r.recorded) return;
      lines.push(
        r.date + "  " + DOW_DE[r.weekday] + "  " +
        (r.start || "--:--") + "–" + (r.end || "--:--") + "  " +
        "Netto " + pad(T.formatDuration(r.net, "clock"), 6) +
        "  Saldo " + pad(T.formatSigned(r.balance, "clock"), 7) +
        (r.type !== "work" ? "  [" + (labels[r.type] || r.type) + "]" : "")
      );
    });
    lines.push("".padEnd(46, "-"));
    lines.push("Soll     " + T.formatDuration(t.target, "clock"));
    lines.push("Ist      " + T.formatDuration(t.net + t.credited, "clock"));
    lines.push("Saldo    " + T.formatSigned(t.balance, "clock"));
    lines.push("Tage     " + t.recordedDays + " erfasst · " + t.workedDays + " gearbeitet");
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

  /**
   * Sehr toleranter CSV-Import: erkennt Trennzeichen automatisch und sucht
   * die Spalten Datum / Kommen / Gehen / Pause anhand der Kopfzeile.
   */
  function parseCSV(text) {
    var clean = String(text || "").replace(/^﻿/, "");
    var lines = clean.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { rows: [], error: "Datei ist leer" };

    var delim = [";", ",", "\t"].map(function (d) {
      return { d: d, n: lines[0].split(d).length };
    }).sort(function (a, b) { return b.n - a.n; })[0].d;

    var header = splitCSVLine(lines[0], delim).map(function (h) { return h.trim().toLowerCase(); });
    var idx = {
      date:  findCol(header, ["datum", "date", "tag"]),
      start: findCol(header, ["kommen", "start", "von", "beginn", "clock-in"]),
      end:   findCol(header, ["gehen", "ende", "bis", "end", "clock-out"]),
      brk:   findCol(header, ["pause", "pausen", "break"]),
      type:  findCol(header, ["art", "typ", "type", "kategorie"]),
      note:  findCol(header, ["notiz", "note", "bemerkung", "kommentar"])
    };
    if (idx.date < 0) return { rows: [], error: "Spalte „Datum“ nicht gefunden" };

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = splitCSVLine(lines[i], delim);
      var iso = normalizeDate(cells[idx.date]);
      if (!iso) continue;
      var row = { date: iso, breaks: [] };
      if (idx.start >= 0 && cells[idx.start]) row.start = T.formatHHMM(T.parseHHMM(cells[idx.start]));
      if (idx.end >= 0 && cells[idx.end]) row.end = T.formatHHMM(T.parseHHMM(cells[idx.end]));
      if (idx.note >= 0 && cells[idx.note]) row.note = cells[idx.note];
      if (idx.type >= 0 && cells[idx.type]) row.typeHint = cells[idx.type].trim().toLowerCase();
      if (idx.brk >= 0 && cells[idx.brk]) {
        var mins = parseInt(String(cells[idx.brk]).replace(/\D/g, ""), 10);
        if (mins > 0) row.breakMinutes = mins;
      }
      if (row.start === "--:--") delete row.start;
      if (row.end === "--:--") delete row.end;
      rows.push(row);
    }
    return { rows: rows, delimiter: delim, columns: idx };
  }

  function splitCSVLine(line, delim) {
    var out = [], cur = "", inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function findCol(header, names) {
    for (var i = 0; i < header.length; i++) {
      for (var j = 0; j < names.length; j++) {
        if (header[i].indexOf(names[j]) >= 0) return i;
      }
    }
    return -1;
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
    toCSV: toCSV,
    toICS: toICS,
    toText: toText,
    parseCSV: parseCSV,
    normalizeDate: normalizeDate
  };
});
