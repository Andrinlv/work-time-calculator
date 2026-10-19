/* ==========================================================================
   ZEITKONTO — Ansicht „Berichte & Export“
   --------------------------------------------------------------------------
   Ein Blatt, das man ausdrucken und unterschreiben kann, plus alle
   Rohdatenformate für Lohnbuchhaltung, Excel oder ein anderes System.

   Der Rapport zeigt, was bis heute feststeht: Tage nach heute erscheinen
   nur, wenn dort schon etwas geplant ist (Ferien, Kompensation …), und
   Soll/Ist/Saldo zählen nur bis heute. Offene und laufende Tage sind
   markiert, damit die Vorgesetzte nicht über eine Lücke stolpert.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n;

  I.add({
    de: {
      "report.titleMonth": "Monatsrapport {month}",
      "report.titleYear": "Jahresrapport {year}",
      "report.titleRange": "Zeitrapport",
      "report.balanceAt": "Saldo per {date}",
      "report.targetToDate": "Soll bis heute",
      "report.actualToDate": "Ist bis heute",
      "report.toDate": "bis heute",
      "report.colType": "Art / Ort",
      "report.missingEnd": "Gehen fehlt",
      "report.running": "läuft",
      "report.planned": "geplant",
      "report.notRecorded": "nicht erfasst",
      "report.custom": "Benutzerdefiniert",
      "report.openNote": "{n} Tage sind unvollständig (Gehen fehlt) und zählen erst, wenn sie ergänzt sind.",
      "report.openNote.one": "1 Tag ist unvollständig (Gehen fehlt) und zählt erst, wenn er ergänzt ist.",
      "report.runningNote": "Heute läuft noch und ist in Soll, Ist und Saldo nicht enthalten.",
      "report.futureNote": "Tage nach heute sind nicht aufgeführt — ausser geplanten Abwesenheiten.",
      "report.summary": "Zusammenfassung",
      "report.daysByType": "Tage nach Art",
      "report.vacationYear": "Ferien {year}",
      "report.vacTaken": "Bezogen",
      "report.vacPlanned": "Geplant",
      "report.vacLeft": "Offen",
      "report.vacEntitlement": "Anspruch",
      "report.absences": "Absenzen & Arbeitszeit",
      "report.overtimeLaw": "Überzeit (über {h} h/Woche)",
      "report.gapDays": "Nicht erfasste Arbeitstage",
      "report.signDate": "Ort, Datum",
      "report.copyFailed": "Kopieren nicht möglich — der Text wird zum Markieren angezeigt.",
      "report.copyTitle": "Rapport als Text",
      "report.expandAll": "Alle Tage anzeigen",
      "report.collapseAll": "Nur Monate anzeigen",
      "csv.date": "Datum",
      "csv.weekday": "Wochentag",
      "csv.week": "KW",
      "csv.type": "Art",
      "csv.location": "Ort",
      "csv.start": "Kommen",
      "csv.end": "Gehen",
      "csv.presence": "Anwesenheit (h:mm)",
      "csv.breaks": "Pausen (min)",
      "csv.requiredBreak": "Pflichtpause (min)",
      "csv.autoBreak": "Autom. Abzug (min)",
      "csv.net": "Netto (h:mm)",
      "csv.netDecimal": "Netto (dezimal)",
      "csv.target": "Soll (h:mm)",
      "csv.credited": "Gutschrift (h:mm)",
      "csv.balance": "Saldo (h:mm)",
      "csv.balanceMin": "Saldo (min)",
      "csv.holiday": "Feiertag",
      "csv.note": "Notiz",
      "csv.hints": "Hinweise",
      "csv.factor": "Anteil",
      "csv.breakTimes": "Pausenzeiten (* bezahlt)",
      "export.title": "ZEITKONTO · {from} bis {to}",
      "export.net": "Netto",
      "export.target": "Soll",
      "export.actual": "Ist",
      "export.balance": "Saldo",
      "export.breaks": "Pausen",
      "export.days": "Tage",
      "export.daysLine": "{recorded} erfasst · {worked} gearbeitet",
      "export.netOf": "{v} netto",
      "csv.hint.invalid-start": "Kommen unlesbar",
      "csv.hint.invalid-end": "Gehen unlesbar",
      "csv.hint.presence-implausible": "Anwesenheit unplausibel",
      "csv.hint.invalid-break": "Pause unvollständig",
      "csv.hint.break-overlap": "Pausen überlappen",
      "csv.hint.break-outside": "Pause ausserhalb der Anwesenheit",
      "csv.hint.break-auto": "Pflichtpause abgezogen",
      "csv.hint.break-short": "Pflichtpause zu kurz",
      "csv.hint.missing-end": "Gehen fehlt",
      "csv.hint.over-daily-max": "Tageshöchstzeit überschritten",
      "csv.hint.rest-short": "Ruhezeit zu kurz",
      "csv.hint.worked-on-holiday": "Am Feiertag gearbeitet",
      "csv.hint.no-break": "Ohne Pause",
      "csv.hint.absence-with-times": "Abwesenheit mit Arbeitszeit"
    },
    en: {
      "report.titleMonth": "Monthly report {month}",
      "report.titleYear": "Annual report {year}",
      "report.titleRange": "Time report",
      "report.balanceAt": "Balance on {date}",
      "report.targetToDate": "Target to date",
      "report.actualToDate": "Actual to date",
      "report.toDate": "to date",
      "report.colType": "Type / place",
      "report.missingEnd": "Clock-out missing",
      "report.running": "running",
      "report.planned": "planned",
      "report.notRecorded": "not recorded",
      "report.custom": "Custom",
      "report.openNote": "{n} days are incomplete (clock-out missing) and only count once completed.",
      "report.openNote.one": "1 day is incomplete (clock-out missing) and only counts once completed.",
      "report.runningNote": "Today is still running and not yet included in target, actual and balance.",
      "report.futureNote": "Days after today are not listed — except planned absences.",
      "report.summary": "Summary",
      "report.daysByType": "Days by type",
      "report.vacationYear": "Vacation {year}",
      "report.vacTaken": "Taken",
      "report.vacPlanned": "Planned",
      "report.vacLeft": "Left",
      "report.vacEntitlement": "Entitlement",
      "report.absences": "Absences & working time",
      "report.overtimeLaw": "Excess hours (over {h} h/week)",
      "report.gapDays": "Working days not recorded",
      "report.signDate": "Place, date",
      "report.copyFailed": "Copying is not possible — the text is shown for you to select.",
      "report.copyTitle": "Report as text",
      "report.expandAll": "Show all days",
      "report.collapseAll": "Show months only",
      "csv.date": "Date",
      "csv.weekday": "Weekday",
      "csv.week": "Week",
      "csv.type": "Type",
      "csv.location": "Location",
      "csv.start": "Clock-in",
      "csv.end": "Clock-out",
      "csv.presence": "Presence (h:mm)",
      "csv.breaks": "Breaks (min)",
      "csv.requiredBreak": "Required break (min)",
      "csv.autoBreak": "Auto deduction (min)",
      "csv.net": "Net (h:mm)",
      "csv.netDecimal": "Net (decimal)",
      "csv.target": "Target (h:mm)",
      "csv.credited": "Credited (h:mm)",
      "csv.balance": "Balance (h:mm)",
      "csv.balanceMin": "Balance (min)",
      "csv.holiday": "Public holiday",
      "csv.note": "Note",
      "csv.hints": "Notices",
      "csv.factor": "Share",
      "csv.breakTimes": "Break times (* paid)",
      "export.title": "ZEITKONTO · {from} to {to}",
      "export.net": "Net",
      "export.target": "Target",
      "export.actual": "Actual",
      "export.balance": "Balance",
      "export.breaks": "Breaks",
      "export.days": "Days",
      "export.daysLine": "{recorded} recorded · {worked} worked",
      "export.netOf": "{v} net",
      "csv.hint.invalid-start": "Clock-in unreadable",
      "csv.hint.invalid-end": "Clock-out unreadable",
      "csv.hint.presence-implausible": "Implausible presence",
      "csv.hint.invalid-break": "Break incomplete",
      "csv.hint.break-overlap": "Breaks overlap",
      "csv.hint.break-outside": "Break outside presence",
      "csv.hint.break-auto": "Mandatory break deducted",
      "csv.hint.break-short": "Mandatory break too short",
      "csv.hint.missing-end": "Clock-out missing",
      "csv.hint.over-daily-max": "Daily maximum exceeded",
      "csv.hint.rest-short": "Rest period too short",
      "csv.hint.worked-on-holiday": "Worked on a public holiday",
      "csv.hint.no-break": "No break",
      "csv.hint.absence-with-times": "Absence with working time"
    },
    fr: {
      "report.titleMonth": "Rapport mensuel {month}",
      "report.titleYear": "Rapport annuel {year}",
      "report.titleRange": "Rapport de temps",
      "report.balanceAt": "Solde au {date}",
      "report.targetToDate": "Dû à ce jour",
      "report.actualToDate": "Effectif à ce jour",
      "report.toDate": "à ce jour",
      "report.colType": "Type / lieu",
      "report.missingEnd": "Départ manquant",
      "report.running": "en cours",
      "report.planned": "prévu",
      "report.notRecorded": "non saisi",
      "report.custom": "Personnalisé",
      "report.openNote": "{n} jours sont incomplets (départ manquant) et ne comptent qu’une fois complétés.",
      "report.openNote.one": "1 jour est incomplet (départ manquant) et ne compte qu’une fois complété.",
      "report.runningNote": "La journée est en cours et n’est pas encore comprise dans le dû, l’effectif et le solde.",
      "report.futureNote": "Les jours après aujourd’hui ne sont pas listés, sauf les absences prévues.",
      "report.summary": "Résumé",
      "report.daysByType": "Jours par type",
      "report.vacationYear": "Vacances {year}",
      "report.vacTaken": "Pris",
      "report.vacPlanned": "Prévus",
      "report.vacLeft": "Restants",
      "report.vacEntitlement": "Droit",
      "report.absences": "Absences et temps de travail",
      "report.overtimeLaw": "Travail supplémentaire (au-delà de {h} h/sem.)",
      "report.gapDays": "Jours ouvrés non saisis",
      "report.signDate": "Lieu, date",
      "report.copyFailed": "Copie impossible — le texte s’affiche pour être sélectionné.",
      "report.copyTitle": "Rapport en texte",
      "report.expandAll": "Afficher tous les jours",
      "report.collapseAll": "Afficher les mois seulement",
      "csv.date": "Date",
      "csv.weekday": "Jour de la semaine",
      "csv.week": "Semaine",
      "csv.type": "Type",
      "csv.location": "Lieu",
      "csv.start": "Arrivée",
      "csv.end": "Départ",
      "csv.presence": "Présence (h:mm)",
      "csv.breaks": "Pauses (min)",
      "csv.requiredBreak": "Pause obligatoire (min)",
      "csv.autoBreak": "Déduction auto. (min)",
      "csv.net": "Net (h:mm)",
      "csv.netDecimal": "Net (décimal)",
      "csv.target": "Dû (h:mm)",
      "csv.credited": "Crédité (h:mm)",
      "csv.balance": "Solde (h:mm)",
      "csv.balanceMin": "Solde (min)",
      "csv.holiday": "Jour férié",
      "csv.note": "Note",
      "csv.hints": "Remarques",
      "csv.factor": "Taux",
      "csv.breakTimes": "Heures de pause (* payées)",
      "export.title": "ZEITKONTO · du {from} au {to}",
      "export.net": "Net",
      "export.target": "Dû",
      "export.actual": "Effectif",
      "export.balance": "Solde",
      "export.breaks": "Pauses",
      "export.days": "Jours",
      "export.daysLine": "saisis : {recorded} · travaillés : {worked}",
      "export.netOf": "{v} net",
      "csv.hint.invalid-start": "Arrivée illisible",
      "csv.hint.invalid-end": "Départ illisible",
      "csv.hint.presence-implausible": "Présence peu plausible",
      "csv.hint.invalid-break": "Pause incomplète",
      "csv.hint.break-overlap": "Pauses superposées",
      "csv.hint.break-outside": "Pause hors présence",
      "csv.hint.break-auto": "Pause obligatoire déduite",
      "csv.hint.break-short": "Pause obligatoire trop courte",
      "csv.hint.missing-end": "Départ manquant",
      "csv.hint.over-daily-max": "Maximum journalier dépassé",
      "csv.hint.rest-short": "Repos trop court",
      "csv.hint.worked-on-holiday": "Travail un jour férié",
      "csv.hint.no-break": "Sans pause",
      "csv.hint.absence-with-times": "Absence avec temps de travail"
    },
    it: {
      "report.titleMonth": "Rapporto mensile {month}",
      "report.titleYear": "Rapporto annuale {year}",
      "report.titleRange": "Rapporto ore",
      "report.balanceAt": "Saldo al {date}",
      "report.targetToDate": "Dovuto a oggi",
      "report.actualToDate": "Effettivo a oggi",
      "report.toDate": "a oggi",
      "report.colType": "Tipo / luogo",
      "report.missingEnd": "Uscita mancante",
      "report.running": "in corso",
      "report.planned": "pianificato",
      "report.notRecorded": "non registrato",
      "report.custom": "Personalizzato",
      "report.openNote": "{n} giorni sono incompleti (uscita mancante) e contano solo una volta completati.",
      "report.openNote.one": "1 giorno è incompleto (uscita mancante) e conta solo una volta completato.",
      "report.runningNote": "La giornata è in corso e non è ancora inclusa in dovuto, effettivo e saldo.",
      "report.futureNote": "I giorni dopo oggi non sono elencati, tranne le assenze pianificate.",
      "report.summary": "Riepilogo",
      "report.daysByType": "Giorni per tipo",
      "report.vacationYear": "Vacanze {year}",
      "report.vacTaken": "Godute",
      "report.vacPlanned": "Pianificate",
      "report.vacLeft": "Rimanenti",
      "report.vacEntitlement": "Diritto",
      "report.absences": "Assenze e orario di lavoro",
      "report.overtimeLaw": "Lavoro straordinario (oltre {h} h/sett.)",
      "report.gapDays": "Giorni lavorativi non registrati",
      "report.signDate": "Luogo, data",
      "report.copyFailed": "Impossibile copiare — il testo viene mostrato per selezionarlo.",
      "report.copyTitle": "Rapporto come testo",
      "report.expandAll": "Mostra tutti i giorni",
      "report.collapseAll": "Mostra solo i mesi",
      "csv.date": "Data",
      "csv.weekday": "Giorno della settimana",
      "csv.week": "Settimana",
      "csv.type": "Tipo",
      "csv.location": "Luogo",
      "csv.start": "Entrata",
      "csv.end": "Uscita",
      "csv.presence": "Presenza (h:mm)",
      "csv.breaks": "Pause (min)",
      "csv.requiredBreak": "Pausa obbligatoria (min)",
      "csv.autoBreak": "Deduzione autom. (min)",
      "csv.net": "Netto (h:mm)",
      "csv.netDecimal": "Netto (decimale)",
      "csv.target": "Dovuto (h:mm)",
      "csv.credited": "Accreditato (h:mm)",
      "csv.balance": "Saldo (h:mm)",
      "csv.balanceMin": "Saldo (min)",
      "csv.holiday": "Festivo",
      "csv.note": "Nota",
      "csv.hints": "Avvisi",
      "csv.factor": "Quota",
      "csv.breakTimes": "Orari pause (* pagate)",
      "export.title": "ZEITKONTO · dal {from} al {to}",
      "export.net": "Netto",
      "export.target": "Dovuto",
      "export.actual": "Effettivo",
      "export.balance": "Saldo",
      "export.breaks": "Pause",
      "export.days": "Giorni",
      "export.daysLine": "registrati: {recorded} · lavorati: {worked}",
      "export.netOf": "{v} netto",
      "csv.hint.invalid-start": "Entrata illeggibile",
      "csv.hint.invalid-end": "Uscita illeggibile",
      "csv.hint.presence-implausible": "Presenza poco plausibile",
      "csv.hint.invalid-break": "Pausa incompleta",
      "csv.hint.break-overlap": "Pause sovrapposte",
      "csv.hint.break-outside": "Pausa fuori dalla presenza",
      "csv.hint.break-auto": "Pausa obbligatoria dedotta",
      "csv.hint.break-short": "Pausa obbligatoria troppo corta",
      "csv.hint.missing-end": "Uscita mancante",
      "csv.hint.over-daily-max": "Massimo giornaliero superato",
      "csv.hint.rest-short": "Riposo troppo breve",
      "csv.hint.worked-on-holiday": "Lavoro in un giorno festivo",
      "csv.hint.no-break": "Senza pausa",
      "csv.hint.absence-with-times": "Assenza con tempo di lavoro"
    }
  });

  /* -------------------------------------------------------------------- */
  /* Reine Hilfen (auch für die Node-Tests)                                */
  /* -------------------------------------------------------------------- */

  /** Ganzer Kalendermonat, ganzes Kalenderjahr oder freier Zeitraum? */
  function rangeKind(from, to) {
    if (from === T.startOfMonth(from) && to === T.endOfMonth(from)) return "month";
    if (from.slice(5) === "01-01" && to.slice(5) === "12-31" && from.slice(0, 4) === to.slice(0, 4)) return "year";
    return "range";
  }

  /** Von > Bis wird getauscht statt ein leeres Blatt zu zeigen. */
  function normalizeRange(from, to) {
    return from > to ? { from: to, to: from } : { from: from, to: to };
  }

  /**
   * Zeilen und Summen des Rapports. Zukunft: nur geplante Tage, und die
   * zählen nicht in Soll/Ist/Saldo — sonst stünde im Oktober ein Soll von
   * 185 h neben einem Ist von 72 h.
   * opts.since: Erfassungsbeginn (Engine.trackingStart). Ein leerer
   * Arbeitstag davor ist keine Lücke und trägt kein Soll — wie im Kalender;
   * null heisst: noch kein eigener Eintrag. Lücken nach Engine.isGap: ein
   * Tag mit Kommen ohne Gehen ist offen (sum.open), keine Lücke.
   */
  function buildRows(days, today, opts) {
    var since = opts && Object.prototype.hasOwnProperty.call(opts, "since") ? opts.since : undefined;
    var rows = [];
    var sum = { target: 0, actual: 0, balance: 0, breaks: 0, open: 0, running: 0, gaps: 0, duty: 0, future: false, net: 0 };
    days.forEach(function (r) {
      if (r.date > today) {
        sum.future = true;
        if (r.recorded) rows.push({ r: r, planned: true });
        return;
      }
      var untracked = !r.recorded && !r.incomplete && (since === null || (!!since && r.date < since));
      if (untracked) return;
      if (r.target > 0) sum.duty++;
      if (!r.recorded && r.target === 0) return;
      rows.push({ r: r, planned: false });
      if (ZK.Engine.isGap(r, today, since)) sum.gaps++;
      if (r.incomplete) sum.open++;
      // Der laufende Tag ist noch nicht abgerechnet — wie im Konto bleibt er
      // aus allen Summen draussen, sonst passt der Übertrag nicht.
      if (r.provisional || r.running) { sum.running++; return; }
      sum.target += r.target || 0;
      sum.actual += (r.net || 0) + (r.credited || 0);
      sum.net += r.net || 0;
      sum.breaks += r.effectiveBreak || 0;
      sum.balance += r.balance || 0;
    });
    return { rows: rows, sum: sum };
  }

  /** Überzeit nach ArG: Arbeitszeit pro Kalenderwoche über dem Höchstmass. */
  function overtimeLaw(days, today, maxWeekly) {
    if (!maxWeekly) return null;
    var weeks = {};
    days.forEach(function (r) {
      if (r.date > today || !r.net) return;
      var k = T.startOfWeek(r.date, 1);
      weeks[k] = (weeks[k] || 0) + r.net;
    });
    return Object.keys(weeks).reduce(function (a, k) { return a + Math.max(0, weeks[k] - maxWeekly); }, 0);
  }

  /** Zeilen nach Monat, mit Monatssummen (ohne geplante und laufende Tage). */
  function groupMonths(rows) {
    var out = [], cur = null;
    rows.forEach(function (x) {
      var k = x.r.date.slice(0, 7);
      if (!cur || cur.key !== k) {
        cur = { key: k, rows: [], target: 0, actual: 0, balance: 0, breaks: 0 };
        out.push(cur);
      }
      cur.rows.push(x);
      if (x.planned || x.r.provisional || x.r.running) return;
      cur.target += x.r.target || 0;
      cur.actual += (x.r.net || 0) + (x.r.credited || 0);
      cur.balance += x.r.balance || 0;
      cur.breaks += x.r.effectiveBreak || 0;
    });
    return out;
  }

  /* CSV in der Sprache der Oberfläche — Überschriften, Wochentage und Orte.
     Der Import erkennt die Überschriften aller vier Sprachen wieder. */
  var CSV_KEYS = ["date", "weekday", "week", "type", "location", "start", "end", "presence", "breaks",
    "requiredBreak", "autoBreak", "net", "netDecimal", "target", "credited", "balance", "balanceMin",
    "holiday", "note", "hints", "factor", "breakTimes"];

  /* Hinweise der Engine, die die CSV-Spalte „Hinweise“ in Worten zeigt */
  var HINT_CODES = ["invalid-start", "invalid-end", "presence-implausible", "invalid-break", "break-overlap",
    "break-outside", "break-auto", "break-short", "missing-end", "over-daily-max", "rest-short",
    "worked-on-holiday", "no-break", "absence-with-times"];

  function weekdayNames() {
    return [0, 1, 2, 3, 4, 5, 6].map(function (i) { return I.weekdayName(i, "short"); });
  }

  function csvOptions(getRecord) {
    var headers = {};
    CSV_KEYS.forEach(function (k) { headers[k] = I.t("csv." + k); });
    var locations = {};
    ["office", "home", "field", "travel"].forEach(function (k) { locations[k] = I.t("loc." + k); });
    var hints = {};
    HINT_CODES.forEach(function (k) { hints[k] = I.t("csv.hint." + k); });
    return {
      labels: I.typeLabels(),
      onlyRecorded: false,
      headers: headers,
      weekdays: weekdayNames(),
      locationLabels: locations,
      hintLabels: hints,
      lang: I.getLang(),
      getRecord: getRecord
    };
  }

  /** Texte für Textzusammenfassung und Kalenderdatei in der Sprache der Oberfläche. */
  function exportOptions() {
    var text = {};
    ["title", "net", "target", "actual", "balance", "breaks", "days", "daysLine", "netOf"].forEach(function (k) {
      text[k] = I.t("export." + k);
    });
    return {
      labels: I.typeLabels(),
      weekdays: weekdayNames(),
      text: text,
      calendarName: I.t("app.name"),
      formatDate: function (iso) { return I.formatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" }); }
    };
  }

  var calc = {
    rangeKind: rangeKind, normalizeRange: normalizeRange, buildRows: buildRows,
    overtimeLaw: overtimeLaw, groupMonths: groupMonths, csvOptions: csvOptions, exportOptions: exportOptions,
    HINT_CODES: HINT_CODES
  };

  (ZK.Views = ZK.Views || {}).reports = { render: render, calc: calc };

  var state = { from: null, to: null };

  /* Lange Zeiträume zeigen Monatszeilen; vor dem Drucken klappt alles
     auf, sonst fehlen die Tage auf dem Papier. */
  var flushPending = null;
  var printBound = false;
  function bindPrint() {
    if (printBound || !root.addEventListener) return;
    printBound = true;
    root.addEventListener("beforeprint", function () { if (flushPending) flushPending(); });
  }

  var openState = { key: "", months: {} };

  function render(host, App) {
    var s = App.settings();
    var today = T.todayISO();
    bindPrint();
    flushPending = null;
    host.classList.add("view-reports");
    if (!state.from) {
      state.from = T.startOfMonth(App.date || today);
      state.to = T.endOfMonth(App.date || today);
    }
    var norm = normalizeRange(state.from, state.to);
    state.from = norm.from;
    state.to = norm.to;
    var kind = rangeKind(state.from, state.to);
    var dd = { day: "2-digit", month: "2-digit", year: "numeric" };

    /* ---- Kopf ---- */
    var head = D.el("div.view-head.no-print");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("report.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("report.lede") }));
    head.appendChild(left);
    if (ZK.Ext) {
      var extActions = D.el("div.row.tight");
      ZK.Ext.render("reports.actions", extActions, { App: App, from: state.from, to: state.to, kind: kind });
      if (extActions.children.length) head.appendChild(extActions);
    }
    host.appendChild(head);

    /* ---- Steuerung ---- */
    var controls = D.el("section.card.mb-4.no-print");
    var row = D.el("div.report-controls");

    row.appendChild(dateField(I.t("common.from"), state.from, function (v) { state.from = v; App.renderView(); }));
    row.appendChild(dateField(I.t("common.to"), state.to, function (v) { state.to = v; App.renderView(); }));

    var nameField = D.el("div.field");
    nameField.appendChild(D.el("label", { text: I.t("report.employee"), for: "reportEmployee" }));
    var nameInput = D.el("input.input#reportEmployee", { type: "text", placeholder: I.t("report.employeePlaceholder"), value: s.employeeName || "" });
    nameInput.addEventListener("change", function () { App.store.updateSettings({ employeeName: nameInput.value }); App.renderView(); });
    nameField.appendChild(nameInput);
    row.appendChild(nameField);

    var quick = D.el("div.field");
    quick.appendChild(D.el("label", { text: I.t("stats.period"), for: "reportPeriod" }));
    var quickSel = D.el("select.select#reportPeriod");
    var allRange = allDataRange(App, today);
    var options = [];
    for (var i = 0; i < 14; i++) {
      var m = T.addMonths(T.startOfMonth(today), -i);
      var d = T.fromISO(m);
      options.push({ value: m, text: I.monthName(d.getMonth()) + " " + d.getFullYear(), from: m, to: T.endOfMonth(m) });
    }
    var y = T.yearOf(today);
    options.push({ value: "year", text: String(y), from: y + "-01-01", to: y + "-12-31" });
    options.push({ value: "prevYear", text: String(y - 1), from: (y - 1) + "-01-01", to: (y - 1) + "-12-31" });
    options.push({ value: "all", text: I.t("report.rangeAll"), from: allRange.from, to: allRange.to });
    var match = null;
    options.forEach(function (o) {
      var opt = D.el("option", { value: o.value, text: o.text });
      if (!match && o.from === state.from && o.to === state.to) { match = o; opt.selected = true; }
      quickSel.appendChild(opt);
    });
    // Eigener Zeitraum: die Auswahl zeigt, dass keine Vorgabe passt.
    var custom = D.el("option", { value: "custom", text: I.t("report.custom"), disabled: true });
    if (!match) custom.selected = true;
    quickSel.insertBefore(custom, quickSel.firstChild);
    quickSel.addEventListener("change", function () {
      var o = options.filter(function (x) { return x.value === quickSel.value; })[0];
      if (!o) return;
      state.from = o.from;
      state.to = o.to;
      App.renderView();
    });
    quick.appendChild(quickSel);
    row.appendChild(quick);
    controls.appendChild(row);

    /* Lücken ab Erfassungsbeginn — dieselbe Regel wie Statistik und Kalender */
    var since = ZK.Insight ? ZK.Insight.trackingStart(App)
      : ZK.Engine.trackingStart(App.store.allDays(), s, App.store.getMeta ? App.store.getMeta() : null);
    var range = ZK.Insight ? ZK.Insight.range(App, state.from, state.to) : App.range(state.from, state.to, { since: since });
    var built = buildRows(range.days, today, { since: since });
    var sum = built.sum;

    var actions = D.el("div.row.mt-4");
    actions.appendChild(button(I.t("report.printNow"), "printer", "primary", function () {
      if (flushPending) flushPending();
      window.print();
    }));
    actions.appendChild(button(I.t("report.exportCsv"), "download", "", function () {
      var csv = ZK.Exporters.toCSV(range.days, csvOptions(function (iso) { return App.store.getDay(iso); }));
      D.download("zeitkonto_" + state.from + "_" + state.to + ".csv", csv, "text/csv");
      App.markExport();
      D.toast(I.t("toast.exported"), { sub: "CSV" });
    }));
    actions.appendChild(button(I.t("report.exportIcs"), "calendar", "", function () {
      var ics = ZK.Exporters.toICS(range.days, exportOptions());
      D.download("zeitkonto_" + state.from + "_" + state.to + ".ics", ics, "text/calendar");
      App.markExport();
      D.toast(I.t("toast.exported"), { sub: "ICS" });
    }));
    actions.appendChild(button(I.t("report.exportJson"), "save", "", function () { App.exportJSON(); }));
    actions.appendChild(button(I.t("report.exportText"), "copy", "ghost", function () {
      var txt = ZK.Exporters.toText(range, exportOptions());
      D.copyText(txt).then(function () { D.toast(I.t("common.copied")); })
        .catch(function () { showText(txt); });
    }));
    controls.appendChild(actions);
    host.appendChild(controls);

    /* ---- Berichtsblatt ---- */
    var sheet = D.el("section.report-sheet");

    var title = kind === "month"
      ? I.t("report.titleMonth", { month: I.formatDate(state.from, { month: "long", year: "numeric" }) })
      : kind === "year" ? I.t("report.titleYear", { year: state.from.slice(0, 4) }) : I.t("report.titleRange");

    var sheetHead = D.el("div.report-head");
    var brand = D.el("div");
    brand.innerHTML =
      '<div class="wordmark report-mark">' +
      '<span class="mark"><i></i><i></i><i></i><i></i></span>' +
      "<b>ZEIT</b><span>KONTO</span></div>" +
      "<h2>" + D.esc(title) + "</h2>" +
      '<div class="report-who">' + D.esc(I.t("report.employee")) + ": <b>" + D.esc(s.employeeName || "—") + "</b></div>";
    sheetHead.appendChild(brand);

    var meta = D.el("div.meta");
    meta.innerHTML =
      "<div>" + D.esc(I.t("report.period")) + "<br><b>" +
      D.esc(I.formatDate(state.from, dd) + " – " + I.formatDate(state.to, dd)) + "</b></div>" +
      "<div class='report-created'>" + D.esc(I.t("report.created")) + " " + D.esc(I.formatDate(today, dd)) + "</div>";
    sheetHead.appendChild(meta);
    sheet.appendChild(sheetHead);

    /* Summen — Übertrag nur beim ganzen Monat, sonst Saldo per Stichtag */
    var dayBefore = T.addDays(state.from, -1);
    var endDate = state.to < today ? state.to : today;
    var carryIn = accountAt(App, dayBefore);
    var carryOut = accountAt(App, endDate);
    var short = { day: "2-digit", month: "2-digit", year: "numeric" };
    var inLabel = kind === "month" ? I.t("report.carryIn") : I.t("report.balanceAt", { date: I.formatDate(dayBefore, short) });
    var outLabel = kind === "month" && state.to <= today ? I.t("report.carryOut") : I.t("report.balanceAt", { date: I.formatDate(endDate, short) });

    var sums = D.el("div.report-sums.mb-5");
    sumBox(sums, inLabel, App.fmtSigned(carryIn.minutes));
    sumBox(sums, sum.future ? I.t("report.targetToDate") : I.t("cal.monthTarget"), App.fmt(sum.target));
    sumBox(sums, sum.future ? I.t("report.actualToDate") : I.t("cal.monthActual"), App.fmt(sum.actual));
    sumBox(sums, outLabel, App.fmtSigned(carryOut.minutes), carryOut.minutes > 0 ? "plus" : carryOut.minutes < 0 ? "minus" : "");
    sheet.appendChild(sums);

    // Ohne diese Hinweise wirkt „Soll 176 h / Ist 33 h / Saldo −0:33“ widersprüchlich.
    var notes = [];
    if (sum.gaps > 0) notes.push(["warn", I.tn("report.gapNote", sum.gaps, { gaps: sum.gaps, days: sum.duty })]);
    if (sum.open > 0) notes.push(["minus", I.tn("report.openNote", sum.open)]);
    var info = [];
    if (sum.running > 0) info.push(I.t("report.runningNote"));
    if (sum.future) info.push(I.t("report.futureNote"));
    if (info.length) notes.push(["info", info.join(" ")]);
    if (notes.length) {
      var noteBox = D.el("div.report-notes.mb-5");
      notes.forEach(function (n) {
        noteBox.appendChild(D.el("div.notice." + n[0], { html: D.icon(n[0] === "info" ? "info" : "alert") + "<div>" + D.esc(n[1]) + "</div>" }));
      });
      sheet.appendChild(noteBox);
    }

    /* Tabelle */
    var cols = [
      ["c-day", I.t("common.day"), ""],
      ["c-type", I.t("report.colType"), ""],
      ["c-in", I.t("day.clockIn"), "num"],
      ["c-out", I.t("day.clockOut"), "num"],
      ["c-brk", I.t("day.breaks"), "num"],
      ["c-act", I.t("cal.monthActual"), "num"],
      ["c-tgt", I.t("day.target"), "num"],
      ["c-bal", I.t("day.balance"), "num"],
      ["c-note", I.t("day.note"), ""]
    ];
    var labels = {};
    cols.forEach(function (c) { labels[c[0]] = c[1]; });

    var wrap = D.el("div.table-wrap.report-wrap");
    var table = D.el("table.data.report-table");
    var thead = D.el("thead");
    thead.innerHTML = "<tr>" + cols.map(function (c) {
      return '<th class="' + c[0] + (c[2] ? " " + c[2] : "") + '" scope="col">' + D.esc(c[1]) + "</th>";
    }).join("") + "</tr>";
    table.appendChild(thead);

    var tbody = D.el("tbody");
    table.appendChild(tbody);

    var rowCtx = { App: App, today: today, labels: labels };
    var rows = built.rows;
    var htmlRows = function (list) { return list.map(function (x) { return rowHtml(x, rowCtx); }).join(""); };

    /* Lange Zeiträume (Jahr, „Alle“) kommen als Monatszeilen mit Summen;
       ein Monat klappt auf Wunsch seine Tage auf. Tausend Tageszeilen auf
       einmal froren das Handy sekundenlang ein. Gedruckt wird alles. */
    var grouped = T.diffDays(state.from, state.to) > 62;
    var groups = grouped ? groupMonths(rows) : null;
    var rangeKey = state.from + "|" + state.to;
    if (openState.key !== rangeKey) {
      openState = { key: rangeKey, months: {} };
      if (groups && groups.length) {
        var current = endDate.slice(0, 7);
        var hit = groups.filter(function (g) { return g.key === current; })[0] || groups[groups.length - 1];
        openState.months[hit.key] = true;
      }
    }

    if (!grouped) {
      tbody.innerHTML = htmlRows(rows);
    } else {
      tbody.innerHTML = groups.map(function (g) {
        var open = !!openState.months[g.key];
        return monthRowHtml(g, open, rowCtx) + (open ? htmlRows(g.rows) : "");
      }).join("");
    }

    function toggleMonth(key, force) {
      var g = groups.filter(function (x) { return x.key === key; })[0];
      var head = tbody.querySelector('tr.month-row[data-month="' + key + '"]');
      if (!g || !head) return;
      var open = !!openState.months[key];
      var want = force === undefined ? !open : force;
      if (want === open) return;
      if (want) head.insertAdjacentHTML("afterend", htmlRows(g.rows));
      else Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-m="' + key + '"]'), function (tr) { tr.parentNode.removeChild(tr); });
      openState.months[key] = want;
      head.classList.toggle("is-open", want);
      var btn = head.querySelector(".month-toggle");
      if (btn) btn.setAttribute("aria-expanded", want ? "true" : "false");
    }

    // Ein Listener für alle Zeilen statt einem pro Tag
    tbody.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button.month-toggle") : null;
      if (btn) { toggleMonth(btn.closest("tr").getAttribute("data-month")); return; }
      var tr = e.target.closest ? e.target.closest("tr[data-date]") : null;
      if (!tr) return;
      ZK.DayModal.open(App, tr.getAttribute("data-date"), function () { App.renderChrome(); App.renderView(); });
    });

    var tfoot = D.el("tfoot");
    tfoot.innerHTML = "<tr>" +
      '<td class="c-total" colspan="4">' + D.esc(I.t("common.total")) + (sum.future ? " · " + D.esc(I.t("report.toDate")) : "") + "</td>" +
      cell("c-brk num", labels["c-brk"], App.fmt(sum.breaks)) +
      cell("c-act num", labels["c-act"], App.fmt(sum.actual)) +
      cell("c-tgt num", labels["c-tgt"], App.fmt(sum.target)) +
      cell("c-bal num" + tone(sum.balance), labels["c-bal"], App.fmtSigned(sum.balance)) +
      '<td class="c-note"></td></tr>';
    table.appendChild(tfoot);

    // Ohne einen einzigen erfassten Tag wäre die Tabelle nur eine Liste
    // von „nicht erfasst“ — dann lieber ein klarer Leerzustand.
    var anyRecorded = rows.some(function (x) { return x.r.recorded; });
    if (!anyRecorded) {
      sheet.appendChild(D.el("div.empty", { html: '<div class="rings"><i></i><i></i></div><p>' + D.esc(I.t("common.empty")) + "</p>" }));
    } else if (grouped && groups.length > 1) {
      var all = groups.every(function (g) { return openState.months[g.key]; });
      var expand = D.el("button.btn.ghost.sm.no-print.report-expand", { type: "button", text: I.t(all ? "report.collapseAll" : "report.expandAll") });
      expand.addEventListener("click", function () {
        var openAll = !groups.every(function (g) { return openState.months[g.key]; });
        groups.forEach(function (g) { toggleMonth(g.key, openAll ? true : g.key === groups[groups.length - 1].key); });
        expand.textContent = I.t(openAll ? "report.collapseAll" : "report.expandAll");
      });
      sheet.appendChild(expand);
      // Vor dem Drucken alles aufklappen — Papier hat keinen Knopf.
      flushPending = function () {
        if (!tbody.isConnected) return;
        groups.forEach(function (g) { toggleMonth(g.key, true); });
        expand.textContent = I.t("report.collapseAll");
      };
    }
    wrap.appendChild(table);
    if (anyRecorded) sheet.appendChild(wrap);

    /* Zusammenfassung */
    sheet.appendChild(summaryBox(App, range.days, built, today, s, endDate));

    /* Unterschriften */
    var sign = D.el("div.report-sign");
    [I.t("report.signEmployee"), I.t("report.signSupervisor")].forEach(function (who) {
      var box = D.el("div.report-sign-box");
      box.appendChild(D.el("div.report-sign-line", { text: I.t("report.signDate") }));
      box.appendChild(D.el("div.report-sign-line", { text: who }));
      sign.appendChild(box);
    });
    sheet.appendChild(sign);

    if (ZK.Ext) ZK.Ext.render("reports.top", host, { App: App, from: state.from, to: state.to, kind: kind, sheet: sheet });
    host.appendChild(sheet);
  }

  /* -------------------------------------------------------------------- */
  /* Bausteine                                                             */
  /* -------------------------------------------------------------------- */

  function monthRowHtml(g, open, ctx) {
    var App = ctx.App, L = ctx.labels;
    var y = +g.key.slice(0, 4), m = +g.key.slice(5, 7) - 1;
    // Ein Monat nur mit Geplantem hat noch keine Summen — Striche statt Nullen.
    var planned = g.rows.every(function (x) { return x.planned; });
    var dash = '<span class="muted">–</span>';
    return '<tr class="month-row' + (open ? " is-open" : "") + '" data-month="' + g.key + '">' +
      '<td class="c-month" colspan="4"><button type="button" class="month-toggle" aria-expanded="' + (open ? "true" : "false") + '">' +
        D.icon("right") + "<span>" + D.esc(I.monthName(m) + " " + y) + "</span>" +
        '<small>' + D.esc(I.tn("common.nDays", g.rows.length) + (planned ? " · " + I.t("report.planned") : "")) + "</small></button></td>" +
      cell("c-brk num", L["c-brk"], planned ? dash : D.esc(App.fmt(g.breaks))) +
      cell("c-act num", L["c-act"], planned ? dash : D.esc(App.fmt(g.actual))) +
      cell("c-tgt num", L["c-tgt"], planned ? dash : D.esc(App.fmt(g.target))) +
      cell("c-bal num" + (planned ? "" : tone(g.balance)), L["c-bal"], planned ? dash : D.esc(App.fmtSigned(g.balance))) +
      '<td class="c-note"></td></tr>';
  }

  function accountAt(App, iso) {
    return ZK.Insight
      ? ZK.Insight.cached(App, "acc|" + iso, function () { return App.accountBalance(iso); })
      : App.accountBalance(iso);
  }

  function allDataRange(App, today) {
    var keys = ZK.Insight
      ? ZK.Insight.cached(App, "keys", function () { return Object.keys(App.store.allDays()).sort(); })
      : Object.keys(App.store.allDays()).sort();
    if (!keys.length) return { from: T.startOfMonth(today), to: today };
    var last = keys[keys.length - 1];
    return { from: keys[0] < today ? keys[0] : T.startOfMonth(today), to: last > today ? last : today };
  }

  function tone(v) { return v > 0 ? " tone-plus" : v < 0 ? " tone-minus" : ""; }

  /** Zelle mit Spaltennamen — auf dem Handy wird daraus eine Karte mit Beschriftung. */
  function cell(cls, label, html) {
    return '<td class="' + cls + '" data-label="' + D.esc(label) + '">' + html + "</td>";
  }

  function typeHtml(r, planned) {
    var label;
    if ((r.type === "work" || (r.type === "free" && r.net > 0)) && !planned) {
      if (!r.recorded) return '<span class="rtag warn">' + D.esc(I.t("report.notRecorded")) + "</span>";
      // Arbeitstag: der Ort sagt mehr als ein Strich
      // Unbekannter Ort (fremde Sicherung): lieber „Arbeit“ als ein roher Schlüssel
      label = r.location && r.location !== "office" && ZK.Rules.LOCATIONS.indexOf(r.location) >= 0 ? I.t("loc." + r.location) : I.t("type.work");
      return '<span class="rwork">' + D.esc(label) + "</span>";
    }
    label = r.type === "holiday" && r.holiday ? r.holiday.name : I.t("type." + r.type);
    if (r.absenceFactor !== undefined && r.absenceFactor > 0 && r.absenceFactor < 1 && r.typeMeta && r.typeMeta.credits) {
      label += " " + (r.absenceFactor === 0.5 ? "½" : Math.round(r.absenceFactor * 100) + " %");
    }
    var color = (r.typeMeta && r.typeMeta.color) || "var(--ink-3)";
    return '<span class="rtag" style="color:' + color + ";border-color:color-mix(in srgb, " + color + ' 40%, transparent)">' + D.esc(label) + "</span>" +
      (planned ? ' <span class="rplanned">' + D.esc(I.t("report.planned")) + "</span>" : "");
  }

  function rowHtml(x, ctx) {
    var r = x.r, App = ctx.App, L = ctx.labels;
    var cls = [];
    if (r.weekday === 0 || r.weekday === 6) cls.push("is-weekend");
    if (r.date === ctx.today) cls.push("is-today");
    if (x.planned) cls.push("is-planned");
    if (r.incomplete) cls.push("is-open");
    var dash = '<span class="muted">–</span>';

    var outHtml;
    if (r.incomplete) outHtml = '<span class="rflag minus">' + D.esc(I.t("report.missingEnd")) + "</span>";
    else if (r.running) outHtml = '<span class="rflag info">' + D.esc(I.t("report.running")) + "</span>";
    else if (r.end) {
      var off = r.endTl !== null && r.endTl !== undefined ? T.dayOffsetOf(r.endTl) : 0;
      outHtml = D.esc(r.end) + (off > 0 ? '<sup class="rnext">+' + off + "</sup>" : "");
    } else outHtml = dash;

    var actual = (r.net || 0) + (r.credited || 0);
    var shown = r.recorded && !x.planned;
    var html = '<tr data-date="' + r.date + '" data-m="' + r.date.slice(0, 7) + '"' + (cls.length ? ' class="' + cls.join(" ") + '"' : "") + ">" +
      '<td class="c-day"><b>' + D.esc(I.weekdayName(r.weekday, "short")) + "</b> " +
        D.esc(I.formatDate(r.date, { day: "2-digit", month: "2-digit" })) + "</td>" +
      '<td class="c-type">' + typeHtml(r, x.planned) + "</td>" +
      cell("c-in num", L["c-in"], r.start ? D.esc(r.start) : dash) +
      cell("c-out num", L["c-out"], outHtml) +
      cell("c-brk num", L["c-brk"], r.effectiveBreak ? D.esc(App.fmt(r.effectiveBreak)) : dash) +
      cell("c-act num", L["c-act"], shown && !r.incomplete ? "<b>" + D.esc(App.fmt(actual)) + "</b>" : dash) +
      cell("c-tgt num", L["c-tgt"], r.target && !x.planned ? D.esc(App.fmt(r.target)) : dash) +
      cell("c-bal num" + (shown && !r.incomplete ? tone(r.balance) : "") + (r.running ? " is-provisional" : ""), L["c-bal"],
        shown && !r.incomplete ? D.esc(App.fmtSigned(r.balance)) : dash) +
      '<td class="c-note">' + D.esc(r.note || "") + "</td>" +
      "</tr>";
    return html;
  }

  function summaryBox(App, days, built, today, s, endDate) {
    var box = D.el("div.report-summary");
    box.appendChild(D.el("h3", { text: I.t("report.summary") }));
    var grid = D.el("div.report-summary-grid");

    /* Tage nach Art (bis heute) + geplante Abwesenheiten */
    var calc = ZK.Insight && ZK.Insight.calc;
    var past = built.rows.filter(function (x) { return !x.planned; }).map(function (x) { return x.r; });
    var counts = calc ? calc.typeCounts(past) : {};
    var col1 = section(I.t("report.daysByType"));
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    keys.forEach(function (k) { col1.list.appendChild(line(I.t("type." + k), I.tn("common.nDays", counts[k]))); });
    var plannedRows = built.rows.filter(function (x) { return x.planned; });
    if (plannedRows.length) {
      var planned = calc ? calc.typeCounts(plannedRows.map(function (x) { return x.r; })) : {};
      Object.keys(planned).forEach(function (k) {
        col1.list.appendChild(line(I.t("type." + k) + " · " + I.t("report.planned"), I.tn("common.nDays", planned[k])));
      });
    }
    if (!keys.length && !plannedRows.length) col1.list.appendChild(line("–", ""));
    grid.appendChild(col1.node);

    /* Ferien des Jahres, in dem der Zeitraum endet */
    var year = T.yearOf(endDate);
    if (calc) {
      var yearDays = ZK.Insight.cached(App, "year|" + year, function () {
        return App.range(T.startOfWeek(year + "-01-01", 1), year + "-12-31");
      }).days;
      var q = calc.quotaOf(yearDays, year, today, s);
      var col2 = section(I.t("report.vacationYear", { year: year }));
      col2.list.appendChild(line(I.t("report.vacEntitlement"), I.tn("common.nDays", q.vacationEntitlement)));
      col2.list.appendChild(line(I.t("report.vacTaken"), I.tn("common.nDays", q.vacationTaken)));
      col2.list.appendChild(line(I.t("report.vacPlanned"), I.tn("common.nDays", q.vacationPlanned)));
      col2.list.appendChild(line(I.t("report.vacLeft"), I.tn("common.nDays", q.vacationLeft), true));
      grid.appendChild(col2.node);
    }

    /* Absenzen & Arbeitszeit im Zeitraum */
    var col3 = section(I.t("report.absences"));
    var sick = past.reduce(function (a, r) {
      return a + ((r.type === "sick" || r.type === "accident") ? (r.absenceFactor === undefined ? 1 : r.absenceFactor) : 0);
    }, 0);
    col3.list.appendChild(line(I.t("stats.sickAccident"), I.tn("common.nDays", Math.round(sick * 100) / 100)));
    col3.list.appendChild(line(I.t("report.gapDays"), I.tn("common.nDays", built.sum.gaps)));
    var ot = overtimeLaw(days, today, s.maxWeeklyMinutes);
    if (ot !== null) {
      col3.list.appendChild(line(I.t("report.overtimeLaw", { h: Math.round(s.maxWeeklyMinutes / 60) }), App.fmt(ot), ot > 0));
    }
    grid.appendChild(col3.node);

    box.appendChild(grid);
    return box;

    function section(title) {
      var node = D.el("div.report-summary-col");
      node.appendChild(D.el("h4", { text: title }));
      var list = D.el("dl");
      node.appendChild(list);
      return { node: node, list: list };
    }
    function line(label, value, strong) {
      var row = D.el("div" + (strong ? ".strong" : ""));
      row.appendChild(D.el("dt", { text: label }));
      row.appendChild(D.el("dd.mono", { text: value }));
      return row;
    }
  }

  /* Zwischenablage gesperrt (kein HTTPS, iOS, Rechte): Text zum Markieren zeigen. */
  function showText(txt) {
    D.toast(I.t("report.copyFailed"), { tone: "warn" });
    var ta = D.el("textarea.input.report-text", { readonly: true, rows: 14, "aria-label": I.t("report.copyTitle") });
    ta.value = txt;
    D.modal({ title: I.t("report.copyTitle"), body: ta, size: "wide" });
    setTimeout(function () { try { ta.focus(); ta.select(); } catch (e) { /* egal */ } }, 60);
  }

  function sumBox(host, title, value, tone2) {
    var node = D.el("div.kpi" + (tone2 ? ".accent-" + tone2 : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone2 ? " tone-" + tone2 : "") + '">' + D.esc(value) + "</div>";
    host.appendChild(node);
  }

  function dateField(label, value, onChange) {
    var wrap = D.el("div.field");
    var id = "report-" + label.replace(/\W+/g, "").toLowerCase() + "-" + Math.round(Math.random() * 1e6);
    wrap.appendChild(D.el("label", { text: label, for: id }));
    var input = D.el("input.input", { type: "date", value: value, id: id });
    input.addEventListener("change", function () { if (input.value) onChange(input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function button(label, iconName, variant, onClick) {
    var btn = D.el("button.btn" + (variant ? "." + variant : ""), {
      type: "button",
      html: D.icon(iconName) + "<span>" + D.esc(label) + "</span>"
    });
    btn.addEventListener("click", onClick);
    return btn;
  }
})(typeof self !== "undefined" ? self : this);
