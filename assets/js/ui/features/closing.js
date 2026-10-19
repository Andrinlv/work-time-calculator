/* ==========================================================================
   ZEITKONTO — Monatsabschluss und Lohnmeldung (Oberfläche)
   --------------------------------------------------------------------------
   Sobald der Monatscheck sauber ist, schliesst ein Tipp den Monat ab: der
   Saldo ist eingefroren, der Rapport trägt „abgeschlossen“, und spätere
   Änderungen können ihn nicht mehr still verschieben. Die Logik steckt in
   ZK.Closing (core/closing.js); die Sperre selbst setzt der Store durch —
   hier wird nur gezeigt, erklärt und gemeldet.

   Erweiterungspunkte:
     reports.actions   „Monat abschliessen“ · „Abgeschlossen am …“ · „Wieder
                       öffnen“ · „Lohnmeldung (CSV)“
     reports.top       Hinweis über dem Blatt, Abschlusszeile im Blatt (druckt mit)
     calendar.top      Hinweis + eingefrorener Monatssaldo mit Schloss
     calendar.cell     dezentes Schloss in jeder Zelle eines abgeschlossenen Monats
     stats.top         abgeschlossene Monate im Zeitraum mit eingefrorenem Saldo
     today.cards       „Tag gesperrt“ mit „Monat öffnen“
     settings.sections Karte „Lohnarten“ (Codes für die Lohnmeldung)
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n, C = ZK.Closing;
  if (!D || !I || !C || !ZK.Ext) return;

  I.add({
    de: {
      "closing.close": "Monat abschliessen",
      "closing.closedOn": "Abgeschlossen am {date}",
      "closing.reopen": "Wieder öffnen",
      "closing.openMonth": "Monat öffnen",
      "closing.payroll": "Lohnmeldung (CSV)",
      "closing.checkOpen": "Monatscheck: {n} offene Punkte",
      "closing.checkOpen.one": "Monatscheck: 1 offener Punkt",
      "closing.confirmTitle": "{month} abschliessen?",
      "closing.confirmText": "Der Saldo wird eingefroren und zählt so ins Zeitkonto. Danach lassen sich die Tage dieses Monats nicht mehr ändern — weder hier noch per Import, Kalenderabgleich oder Rückgängig. Wieder öffnen geht jederzeit.",
      "closing.sumMonth": "Monatssaldo",
      "closing.sumAccount": "Zeitkonto per {date}",
      "closing.checkClean": "Monatscheck ohne Befund",
      "closing.checkCleanSub": "Alle Arbeitstage erfasst, keine offenen Stempelungen.",
      "closing.checkIssues": "Der Monatscheck meldet noch {n} offene Punkte",
      "closing.checkIssues.one": "Der Monatscheck meldet noch 1 offenen Punkt",
      "closing.ack": "Geprüft — trotzdem abschliessen",
      "closing.running": "Ein Tag dieses Monats läuft noch. Zuerst ausstempeln, dann abschliessen.",
      "closing.done": "{month} abgeschlossen",
      "closing.doneSub": "Saldo eingefroren: {v}",
      "closing.reopenTitle": "{month} wieder öffnen?",
      "closing.reopenText": "Die Tage werden wieder bearbeitbar, und der Saldo wird wieder aus den Tagen gerechnet — Änderungen an Tagen oder Einstellungen können ihn dann verschieben. Eine bereits gemeldete Lohnmeldung stimmt danach womöglich nicht mehr.",
      "closing.reopened": "{month} ist wieder offen",
      "closing.locked": "{month} ist abgeschlossen — Änderung nicht gespeichert",
      "closing.lockedMany": "{months} sind abgeschlossen — Änderungen nicht gespeichert",
      "closing.lockedDays": "{n} Tage betroffen",
      "closing.lockedDays.one": "1 Tag betroffen",
      "closing.frozenLine": "Abgeschlossen am {date} · Saldo eingefroren {v}",
      "closing.notice": "{month} ist abgeschlossen",
      "closing.noticeSub": "Die Tage sind gesperrt. Der Saldo von {v} ist eingefroren und zählt so ins Zeitkonto.",
      "closing.diff": "Neu gerechnet mit den heutigen Einstellungen ergäben die Tage {live}. Massgebend bleibt der eingefrorene Saldo von {v}.",
      "closing.stale": "Die Tagesdaten weichen vom Stand beim Abschluss ab (z. B. nach einem Import). Massgebend bleibt der eingefrorene Saldo.",
      "closing.frozen": "eingefroren",
      "closing.frozenSince": "Eingefroren am {date}",
      "closing.cell": "abgeschlossen",
      "closing.todayTitle": "Tag gesperrt — {month} ist abgeschlossen",
      "closing.todaySub": "Änderungen an diesem Tag werden nicht gespeichert. Der Monatssaldo ist eingefroren.",
      "closing.statsTitle": "Abgeschlossene Monate",
      "closing.statsSub": "Sie zählen mit dem Saldo, der beim Abschluss galt.",
      "closing.codes": "Lohnarten",
      "closing.codesHint": "Codes für die Lohnmeldung, wie sie die Lohnbuchhaltung erwartet. Leer = wird nicht gemeldet. Nacht, Sonntag und Überzeit sind in den Normalstunden enthalten.",
      "closing.employeeId": "Personalnummer",
      "closing.employeeIdHint": "Erscheint in jeder Zeile der Lohnmeldung.",
      "closing.codeFor": "Code für {name}",
      "closing.exported": "Lohnmeldung exportiert",
      "closing.file": "lohnmeldung",
      "closing.wage.normal": "Normalstunden",
      "closing.wage.flex": "Überstunden/Gleitzeit",
      "closing.wage.overtime": "Überzeit (ArG)",
      "closing.wage.night": "Nachtarbeit (23–06)",
      "closing.wage.sunday": "Sonntags-/Feiertagsarbeit",
      "closing.wage.holiday": "Feiertage (Gutschrift)",
      "closing.wage.vacation": "Ferien",
      "closing.wage.sick": "Krankheit",
      "closing.wage.accident": "Unfall",
      "closing.wage.military": "Militär/Zivildienst",
      "closing.csv.employeeId": "Personalnummer",
      "closing.csv.employee": "Name",
      "closing.csv.period": "Periode",
      "closing.csv.code": "Lohnart",
      "closing.csv.label": "Bezeichnung",
      "closing.csv.hours": "Stunden",
      "closing.csv.minutes": "Minuten",
      "closing.csv.days": "Tage"
    },
    en: {
      "closing.close": "Close month",
      "closing.closedOn": "Closed on {date}",
      "closing.reopen": "Reopen",
      "closing.openMonth": "Open month",
      "closing.payroll": "Payroll report (CSV)",
      "closing.checkOpen": "Month check: {n} open points",
      "closing.checkOpen.one": "Month check: 1 open point",
      "closing.confirmTitle": "Close {month}?",
      "closing.confirmText": "The balance is frozen and counts towards the account as it is. Afterwards the days of this month can no longer be changed — not here, not by import, calendar sync or undo. You can reopen it at any time.",
      "closing.sumMonth": "Month balance",
      "closing.sumAccount": "Account on {date}",
      "closing.checkClean": "Month check found nothing",
      "closing.checkCleanSub": "All working days recorded, no open clock-ins.",
      "closing.checkIssues": "The month check still reports {n} open points",
      "closing.checkIssues.one": "The month check still reports 1 open point",
      "closing.ack": "Reviewed — close anyway",
      "closing.running": "A day of this month is still running. Clock out first, then close.",
      "closing.done": "{month} closed",
      "closing.doneSub": "Balance frozen: {v}",
      "closing.reopenTitle": "Reopen {month}?",
      "closing.reopenText": "The days become editable again and the balance is calculated from the days again — changes to days or settings can then shift it. A payroll report already submitted may no longer match.",
      "closing.reopened": "{month} is open again",
      "closing.locked": "{month} is closed — change not saved",
      "closing.lockedMany": "{months} are closed — changes not saved",
      "closing.lockedDays": "{n} days affected",
      "closing.lockedDays.one": "1 day affected",
      "closing.frozenLine": "Closed on {date} · balance frozen at {v}",
      "closing.notice": "{month} is closed",
      "closing.noticeSub": "The days are locked. The balance of {v} is frozen and counts towards the account as it is.",
      "closing.diff": "Recalculated with today's settings, the days would give {live}. The frozen balance of {v} still applies.",
      "closing.stale": "The day entries differ from the state at closing (e.g. after an import). The frozen balance still applies.",
      "closing.frozen": "frozen",
      "closing.frozenSince": "Frozen on {date}",
      "closing.cell": "closed",
      "closing.todayTitle": "Day locked — {month} is closed",
      "closing.todaySub": "Changes to this day are not saved. The month balance is frozen.",
      "closing.statsTitle": "Closed months",
      "closing.statsSub": "They count with the balance that applied at closing.",
      "closing.codes": "Wage types",
      "closing.codesHint": "Codes for the payroll report, as payroll expects them. Empty = not reported. Night, Sunday and excess time are included in regular hours.",
      "closing.employeeId": "Employee number",
      "closing.employeeIdHint": "Appears on every line of the payroll report.",
      "closing.codeFor": "Code for {name}",
      "closing.exported": "Payroll report exported",
      "closing.file": "payroll",
      "closing.wage.normal": "Regular hours",
      "closing.wage.flex": "Overtime/flexitime",
      "closing.wage.overtime": "Excess time (Labour Act)",
      "closing.wage.night": "Night work (23–06)",
      "closing.wage.sunday": "Sunday/holiday work",
      "closing.wage.holiday": "Public holidays (paid)",
      "closing.wage.vacation": "Vacation",
      "closing.wage.sick": "Illness",
      "closing.wage.accident": "Accident",
      "closing.wage.military": "Military/civil service",
      "closing.csv.employeeId": "Employee no.",
      "closing.csv.employee": "Name",
      "closing.csv.period": "Period",
      "closing.csv.code": "Wage type",
      "closing.csv.label": "Description",
      "closing.csv.hours": "Hours",
      "closing.csv.minutes": "Minutes",
      "closing.csv.days": "Days"
    },
    fr: {
      "closing.close": "Clôturer le mois",
      "closing.closedOn": "Clôturé le {date}",
      "closing.reopen": "Rouvrir",
      "closing.openMonth": "Rouvrir le mois",
      "closing.payroll": "Annonce salaires (CSV)",
      "closing.checkOpen": "Contrôle du mois : {n} points ouverts",
      "closing.checkOpen.one": "Contrôle du mois : 1 point ouvert",
      "closing.confirmTitle": "Clôturer {month} ?",
      "closing.confirmText": "Le solde est figé et compte tel quel dans le compte. Ensuite, les jours de ce mois ne peuvent plus être modifiés — ni ici, ni par import, synchronisation du calendrier ou annulation. La réouverture reste possible à tout moment.",
      "closing.sumMonth": "Solde du mois",
      "closing.sumAccount": "Compte au {date}",
      "closing.checkClean": "Contrôle du mois sans remarque",
      "closing.checkCleanSub": "Tous les jours de travail saisis, aucun pointage ouvert.",
      "closing.checkIssues": "Le contrôle du mois signale encore {n} points ouverts",
      "closing.checkIssues.one": "Le contrôle du mois signale encore 1 point ouvert",
      "closing.ack": "Vérifié — clôturer quand même",
      "closing.running": "Un jour de ce mois est encore en cours. Pointez d'abord la sortie, puis clôturez.",
      "closing.done": "{month} clôturé",
      "closing.doneSub": "Solde figé : {v}",
      "closing.reopenTitle": "Rouvrir {month} ?",
      "closing.reopenText": "Les jours redeviennent modifiables et le solde est de nouveau calculé à partir des jours — des modifications des jours ou des réglages peuvent alors le déplacer. Une annonce des salaires déjà transmise risque de ne plus correspondre.",
      "closing.reopened": "{month} est de nouveau ouvert",
      "closing.locked": "{month} est clôturé — modification non enregistrée",
      "closing.lockedMany": "{months} sont clôturés — modifications non enregistrées",
      "closing.lockedDays": "{n} jours concernés",
      "closing.lockedDays.one": "1 jour concerné",
      "closing.frozenLine": "Clôturé le {date} · solde figé à {v}",
      "closing.notice": "{month} est clôturé",
      "closing.noticeSub": "Les jours sont verrouillés. Le solde de {v} est figé et compte tel quel dans le compte.",
      "closing.diff": "Recalculés avec les réglages actuels, les jours donneraient {live}. Le solde figé de {v} reste déterminant.",
      "closing.stale": "Les saisies diffèrent de l'état à la clôture (p. ex. après un import). Le solde figé reste déterminant.",
      "closing.frozen": "figé",
      "closing.frozenSince": "Figé le {date}",
      "closing.cell": "clôturé",
      "closing.todayTitle": "Jour verrouillé — {month} est clôturé",
      "closing.todaySub": "Les modifications de ce jour ne sont pas enregistrées. Le solde du mois est figé.",
      "closing.statsTitle": "Mois clôturés",
      "closing.statsSub": "Ils comptent avec le solde valable à la clôture.",
      "closing.codes": "Types de salaire",
      "closing.codesHint": "Codes pour l'annonce des salaires, tels que la comptabilité salariale les attend. Vide = non annoncé. Nuit, dimanche et travail supplémentaire sont compris dans les heures normales.",
      "closing.employeeId": "Numéro de personnel",
      "closing.employeeIdHint": "Figure sur chaque ligne de l'annonce des salaires.",
      "closing.codeFor": "Code pour {name}",
      "closing.exported": "Annonce des salaires exportée",
      "closing.file": "annonce-salaires",
      "closing.wage.normal": "Heures normales",
      "closing.wage.flex": "Heures supplémentaires/horaire mobile",
      "closing.wage.overtime": "Travail supplémentaire (LTr)",
      "closing.wage.night": "Travail de nuit (23–06)",
      "closing.wage.sunday": "Travail du dimanche/jours fériés",
      "closing.wage.holiday": "Jours fériés (payés)",
      "closing.wage.vacation": "Vacances",
      "closing.wage.sick": "Maladie",
      "closing.wage.accident": "Accident",
      "closing.wage.military": "Service militaire/civil",
      "closing.csv.employeeId": "N° de personnel",
      "closing.csv.employee": "Nom",
      "closing.csv.period": "Période",
      "closing.csv.code": "Type de salaire",
      "closing.csv.label": "Désignation",
      "closing.csv.hours": "Heures",
      "closing.csv.minutes": "Minutes",
      "closing.csv.days": "Jours"
    },
    it: {
      "closing.close": "Chiudi il mese",
      "closing.closedOn": "Chiuso il {date}",
      "closing.reopen": "Riapri",
      "closing.openMonth": "Riapri il mese",
      "closing.payroll": "Notifica salari (CSV)",
      "closing.checkOpen": "Controllo mensile: {n} punti aperti",
      "closing.checkOpen.one": "Controllo mensile: 1 punto aperto",
      "closing.confirmTitle": "Chiudere {month}?",
      "closing.confirmText": "Il saldo viene congelato e conta così nel conto. Dopo, i giorni di questo mese non si possono più modificare — né qui, né tramite importazione, sincronizzazione del calendario o annullamento. Riaprire è possibile in qualsiasi momento.",
      "closing.sumMonth": "Saldo del mese",
      "closing.sumAccount": "Conto al {date}",
      "closing.checkClean": "Controllo mensile senza rilievi",
      "closing.checkCleanSub": "Tutti i giorni lavorativi registrati, nessuna timbratura aperta.",
      "closing.checkIssues": "Il controllo mensile segnala ancora {n} punti aperti",
      "closing.checkIssues.one": "Il controllo mensile segnala ancora 1 punto aperto",
      "closing.ack": "Verificato — chiudi comunque",
      "closing.running": "Un giorno di questo mese è ancora in corso. Prima timbrare l'uscita, poi chiudere.",
      "closing.done": "{month} chiuso",
      "closing.doneSub": "Saldo congelato: {v}",
      "closing.reopenTitle": "Riaprire {month}?",
      "closing.reopenText": "I giorni tornano modificabili e il saldo viene di nuovo calcolato dai giorni — modifiche ai giorni o alle impostazioni possono quindi spostarlo. Una notifica salari già inviata potrebbe non corrispondere più.",
      "closing.reopened": "{month} è di nuovo aperto",
      "closing.locked": "{month} è chiuso — modifica non salvata",
      "closing.lockedMany": "{months} sono chiusi — modifiche non salvate",
      "closing.lockedDays": "{n} giorni interessati",
      "closing.lockedDays.one": "1 giorno interessato",
      "closing.frozenLine": "Chiuso il {date} · saldo congelato a {v}",
      "closing.notice": "{month} è chiuso",
      "closing.noticeSub": "I giorni sono bloccati. Il saldo di {v} è congelato e conta così nel conto.",
      "closing.diff": "Ricalcolati con le impostazioni attuali, i giorni darebbero {live}. Resta determinante il saldo congelato di {v}.",
      "closing.stale": "I dati dei giorni differiscono dallo stato alla chiusura (p. es. dopo un'importazione). Resta determinante il saldo congelato.",
      "closing.frozen": "congelato",
      "closing.frozenSince": "Congelato il {date}",
      "closing.cell": "chiuso",
      "closing.todayTitle": "Giorno bloccato — {month} è chiuso",
      "closing.todaySub": "Le modifiche a questo giorno non vengono salvate. Il saldo del mese è congelato.",
      "closing.statsTitle": "Mesi chiusi",
      "closing.statsSub": "Contano con il saldo valido alla chiusura.",
      "closing.codes": "Tipi di salario",
      "closing.codesHint": "Codici per la notifica salari, come li attende la contabilità salariale. Vuoto = non notificato. Notte, domenica e lavoro straordinario sono compresi nelle ore normali.",
      "closing.employeeId": "Numero del personale",
      "closing.employeeIdHint": "Compare in ogni riga della notifica salari.",
      "closing.codeFor": "Codice per {name}",
      "closing.exported": "Notifica salari esportata",
      "closing.file": "notifica-salari",
      "closing.wage.normal": "Ore normali",
      "closing.wage.flex": "Ore supplementari/orario flessibile",
      "closing.wage.overtime": "Lavoro straordinario (LL)",
      "closing.wage.night": "Lavoro notturno (23–06)",
      "closing.wage.sunday": "Lavoro domenicale/festivo",
      "closing.wage.holiday": "Giorni festivi (pagati)",
      "closing.wage.vacation": "Vacanze",
      "closing.wage.sick": "Malattia",
      "closing.wage.accident": "Infortunio",
      "closing.wage.military": "Servizio militare/civile",
      "closing.csv.employeeId": "N. del personale",
      "closing.csv.employee": "Nome",
      "closing.csv.period": "Periodo",
      "closing.csv.code": "Tipo di salario",
      "closing.csv.label": "Descrizione",
      "closing.csv.hours": "Ore",
      "closing.csv.minutes": "Minuti",
      "closing.csv.days": "Giorni"
    }
  });

  /* ==================================================================== */
  /* Hilfen                                                                */
  /* ==================================================================== */

  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  /** „September“ — mit Jahr, wenn es nicht das laufende ist. */
  function monthLabel(month, withYear) {
    var y = +month.slice(0, 4), m = +month.slice(5, 7) - 1;
    var name = I.monthName(m);
    if (withYear || y !== T.yearOf(T.todayISO())) name += " " + y;
    return cap(name);
  }

  /** Lokales Datum des Abschlusses (at ist UTC). */
  function closedDate(snap) {
    var d = new Date(snap.at);
    return isNaN(d.getTime()) ? String(snap.at).slice(0, 10) : T.toISO(d);
  }

  function shortDate(iso) { return I.formatDate(iso, { day: "2-digit", month: "2-digit" }); }
  function longDate(iso) { return I.formatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" }); }

  function snapOf(App, month) { return month ? C.get(App.settings(), month) : null; }

  /* Vergleich eingefroren ↔ neu gerechnet, je Datenstand einmal */
  var liveMemo = { rev: null, values: {} };
  function liveBalance(App, month) {
    var rev = App.dataRevision ? App.dataRevision() : null;
    if (liveMemo.rev !== rev) liveMemo = { rev: rev, values: {} };
    if (!Object.prototype.hasOwnProperty.call(liveMemo.values, month)) {
      liveMemo.values[month] = C.liveMonthBalance(App.store.allDays(), App.settings(), month);
    }
    return liveMemo.values[month];
  }

  /** Was beim Monat auffällt: neu gerechnet anders, Daten verändert. */
  function drift(App, month, snap) {
    var live = liveBalance(App, month);
    return {
      live: live,
      differs: live !== snap.balance,
      stale: C.isStale(snap, App.store.allDays(), month)
    };
  }

  function monthRange(App, month) {
    var first = month + "-01";
    return App.range(first, T.endOfMonth(first));
  }

  /** Monatscheck wie in „Werkzeuge“ — plus laufende Tage. */
  function monthCheck(App, month) {
    var range = monthRange(App, month);
    var since = C.auditSince(App.store.allDays(), App.settings());
    return { range: range, check: C.check(range.days, T.todayISO(), since || T.todayISO()) };
  }

  function iconButton(label, iconName, cls, onClick) {
    var btn = D.el("button.btn" + (cls || ""), { type: "button", html: D.icon(iconName) + "<span>" + D.esc(label) + "</span>" });
    btn.addEventListener("click", onClick);
    return btn;
  }

  /* ==================================================================== */
  /* Abschliessen, wieder öffnen, Lohnmeldung                              */
  /* ==================================================================== */

  function openClose(App, month) {
    var data = monthCheck(App, month);
    var chk = data.check;
    var records = App.store.allDays();
    var s = App.settings();
    var preview = C.buildSnapshot(records, s, month, { now: new Date() });
    var last = T.endOfMonth(month + "-01");

    var body = D.el("div.closing-dialog");
    body.appendChild(D.el("p.closing-text", { text: I.t("closing.confirmText") }));

    var sums = D.el("div.closing-sums");
    [
      [I.t("closing.sumMonth"), App.fmtSigned(preview.balance), preview.balance],
      [I.t("closing.sumAccount", { date: shortDate(last) }), App.fmtSigned(preview.account), preview.account],
      [I.t("cal.monthActual"), App.fmt(preview.net + preview.credited), 0],
      [I.t("cal.monthTarget"), App.fmt(preview.target), 0]
    ].forEach(function (x) {
      var box = D.el("div.closing-sum");
      box.appendChild(D.el("span.k", { text: x[0] }));
      box.appendChild(D.el("b.v.mono" + (x[2] > 0 ? ".tone-plus" : x[2] < 0 ? ".tone-minus" : ""), { text: x[1] }));
      sums.appendChild(box);
    });
    body.appendChild(sums);

    var ackInput = null;
    if (chk.running) {
      body.appendChild(D.el("div.notice.minus", { html: D.icon("alert") + "<div>" + D.esc(I.t("closing.running")) + "</div>" }));
    } else if (chk.clean) {
      body.appendChild(D.el("div.notice.plus", {
        html: D.icon("check") + "<div><strong>" + D.esc(I.t("closing.checkClean")) + "</strong><div class='sub'>" +
          D.esc(I.t("closing.checkCleanSub")) + "</div></div>"
      }));
    } else {
      var issues = D.el("div.notice.warn.closing-issues");
      var list = chk.audit.issues.map(function (g) {
        var dates = g.dates.slice(0, 5).map(function (x) { return shortDate(x.date); }).join(", ") + (g.count > 5 ? " …" : "");
        return "<li><b>" + D.esc(I.t("audit." + g.code)) + "</b> · " + D.esc(dates) + "</li>";
      }).join("");
      issues.innerHTML = D.icon("alert") + "<div><strong>" + D.esc(I.tn("closing.checkIssues", chk.total)) + "</strong><ul>" + list + "</ul></div>";
      body.appendChild(issues);
      var ack = D.el("label.switch.closing-ack");
      ackInput = D.el("input", { type: "checkbox" });
      ack.appendChild(ackInput);
      ack.appendChild(D.el("span.track"));
      ack.appendChild(D.el("span.lbl", { text: I.t("closing.ack") }));
      body.appendChild(ack);
    }

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var ok = iconButton(I.t("closing.close"), "lock", ".primary", function () {
      if (ok.disabled) return;
      m.close();
      commitClose(App, month, chk.total);
    });
    function sync() { ok.disabled = !!chk.running || (ackInput ? !ackInput.checked : false); }
    if (ackInput) ackInput.addEventListener("change", sync);
    sync();
    cancel.addEventListener("click", function () { m.close(); });
    var m = D.modal({
      title: I.t("closing.confirmTitle", { month: monthLabel(month, true) }),
      body: body,
      footer: [cancel, ok],
      size: "slim",
      focus: ackInput || (chk.running ? cancel : ok)
    });
    return m;
  }

  function commitClose(App, month, issues) {
    // Erst jetzt einfrieren — der Stand im Dialog kann inzwischen älter sein
    var snap = C.buildSnapshot(App.store.allDays(), App.settings(), month, { now: new Date(), issues: issues || 0 });
    var patch = {};
    patch[C.keyOf(month)] = snap;
    App.store.updateSettings(patch, { immediate: true, coalesce: false });
    App.afterChange();
    D.toast(I.t("closing.done", { month: monthLabel(month) }), {
      tone: "plus", icon: "lock",
      sub: I.t("closing.doneSub", { v: App.fmtSigned(snap.balance) }),
      action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
    });
  }

  function reopen(App, month) {
    if (!snapOf(App, month)) return Promise.resolve(false);
    return D.confirmDialog({
      title: I.t("closing.reopenTitle", { month: monthLabel(month, true) }),
      message: I.t("closing.reopenText"),
      okLabel: I.t("closing.reopen"),
      cancelLabel: I.t("common.cancel"),
      danger: true
    }).then(function (yes) {
      if (!yes) return false;
      var patch = {};
      patch[C.keyOf(month)] = undefined;
      App.store.updateSettings(patch, { immediate: true, coalesce: false });
      App.afterChange();
      D.toast(I.t("closing.reopened", { month: monthLabel(month) }), {
        icon: "info",
        action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
      });
      return true;
    });
  }

  function payrollCSV(App, month) {
    var s = App.settings();
    var snap = snapOf(App, month);
    if (!snap) return "";
    var labels = {}, headers = {};
    C.WAGE_TYPES.forEach(function (k) { labels[k] = I.t("closing.wage." + k); });
    ["employeeId", "employee", "period", "code", "label", "hours", "minutes", "days"].forEach(function (k) {
      headers[k] = I.t("closing.csv." + k);
    });
    return C.payrollCSV(C.payrollRows(snap, C.codesOf(s)),
      { employeeId: s.payrollEmployeeId || "", employee: s.employeeName || "", period: month },
      { labels: labels, headers: headers });
  }

  function exportPayroll(App, month) {
    var csv = payrollCSV(App, month);
    if (!csv) return;
    D.download("zeitkonto_" + I.t("closing.file") + "_" + month + ".csv", csv, "text/csv");
    D.toast(I.t("closing.exported"), { icon: "download", sub: monthLabel(month, true) });
  }

  /* ---- Gesperrte Änderung (Ereignis vom Store) ----------------------- */

  function onLocked(App, evt) {
    var dates = (evt && evt.dates) || [];
    if (!dates.length) return;
    var months = [];
    dates.forEach(function (iso) { var mk = C.monthOf(iso); if (months.indexOf(mk) < 0) months.push(mk); });
    var names = months.map(function (mk) { return monthLabel(mk); });
    var title = months.length === 1 ? I.t("closing.locked", { month: names[0] }) : I.t("closing.lockedMany", { months: names.join(", ") });
    /* Hat der Vorgang gar nichts gespeichert, wäre seine Erfolgsmeldung
       („Tag gelöscht“, „Kopiert“ …) falsch: sie folgt im selben Durchlauf
       und wird durch die Sperrmeldung ersetzt. */
    var before = D.qsa(".toasts .toast");
    setTimeout(function () {
      if (!evt.partial) {
        D.qsa(".toasts .toast").forEach(function (t) {
          if (before.indexOf(t) >= 0 || t._sticky) return;
          if (t._dismiss) t._dismiss(true);
          else if (t.parentNode) t.parentNode.removeChild(t);
        });
      }
      D.toast(title, {
        tone: "warn", icon: "lock", duration: 8000,
        sub: dates.length === 1 ? I.formatDate(dates[0], { weekday: "short", day: "2-digit", month: "2-digit" }) : I.tn("closing.lockedDays", dates.length),
        action: { label: I.t("closing.openMonth"), onClick: function () { reopen(App, months[0]); } }
      });
    }, 0);
    refreshSoon(App);
  }

  /* Felder zeigen womöglich noch die abgelehnte Eingabe: neu zeichnen —
     aber nicht, während jemand in einem Textfeld tippt. */
  var refreshTimer = null;
  function refreshSoon(App) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      var a = document.activeElement;
      var typing = a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && /^(text|search|number|time|date)$/i.test(a.type || "text"))) && !a.readOnly;
      if (!typing) { App.renderChrome(); App.renderView(); return; }
      a.addEventListener("blur", function again() {
        a.removeEventListener("blur", again);
        setTimeout(function () { App.renderChrome(); App.renderView(); }, 0);
      });
    }, 0);
  }

  /* ==================================================================== */
  /* Erweiterungen                                                         */
  /* ==================================================================== */

  /* ---- Berichte: Knöpfe im Kopf -------------------------------------- */
  ZK.Ext.register("reports.actions", {
    id: "closing",
    order: 30,
    when: function (ctx) {
      var month = C.wholeMonth(ctx.from, ctx.to);
      return !!month && C.isPastMonth(month, T.todayISO());
    },
    render: function (host, ctx) {
      var App = ctx.App;
      var month = C.wholeMonth(ctx.from, ctx.to);
      var snap = snapOf(App, month);
      if (snap) {
        host.appendChild(D.el("span.tag.closing-badge", {
          html: D.icon("lock") + "<span>" + D.esc(I.t("closing.closedOn", { date: shortDate(closedDate(snap)) })) + "</span>",
          title: longDate(closedDate(snap))
        }));
        host.appendChild(iconButton(I.t("closing.reopen"), "refresh", ".ghost.sm", function () { reopen(App, month); }));
        host.appendChild(iconButton(I.t("closing.payroll"), "download", ".sm", function () { exportPayroll(App, month); }));
        return;
      }
      var data = monthCheck(App, month);
      if (!data.range.totals.recordedDays) return;   // nichts erfasst — nichts abzuschliessen
      var btn = iconButton(I.t("closing.close"), "lock", ".sm.closing-btn", function () { openClose(App, month); });
      if (!data.check.clean) {
        btn.classList.add("has-issues");
        var count = data.check.running ? 1 : data.check.total;
        var tip = data.check.running ? I.t("closing.running") : I.tn("closing.checkOpen", count);
        btn.setAttribute("data-tip", tip);
        btn.appendChild(D.el("i.closing-dot", { "aria-hidden": "true" }));
        btn.setAttribute("aria-label", I.t("closing.close") + " · " + tip);
      }
      host.appendChild(btn);
    }
  });

  /* ---- Berichte: Hinweis und Abschlusszeile im Blatt ------------------ */
  ZK.Ext.register("reports.top", {
    id: "closing",
    order: 30,
    when: function (ctx) { return !!snapOf(ctx.App, C.wholeMonth(ctx.from, ctx.to)); },
    render: function (host, ctx) {
      var App = ctx.App;
      var month = C.wholeMonth(ctx.from, ctx.to);
      var snap = snapOf(App, month);
      var d = drift(App, month, snap);

      host.appendChild(D.el("div.notice.info.mb-4.no-print.closing-notice", {
        html: D.icon("lock") + "<div><strong>" + D.esc(I.t("closing.notice", { month: monthLabel(month, true) })) + "</strong>" +
          "<div class='sub'>" + D.esc(I.t("closing.noticeSub", { v: App.fmtSigned(snap.balance) })) + "</div></div>"
      }));

      // Im Blatt — druckt mit
      var sheet = ctx.sheet;
      if (!sheet) return;
      var meta = sheet.querySelector(".report-head .meta");
      var line = D.el("div.report-closed", {
        html: D.icon("lock") + "<span>" + D.esc(I.t("closing.frozenLine", { date: longDate(closedDate(snap)), v: App.fmtSigned(snap.balance) })) + "</span>"
      });
      if (meta) meta.appendChild(line);
      else sheet.insertBefore(line, sheet.firstChild);

      var notes = [];
      if (d.differs) notes.push(I.t("closing.diff", { live: App.fmtSigned(d.live), v: App.fmtSigned(snap.balance) }));
      if (d.stale) notes.push(I.t("closing.stale"));
      if (!notes.length) return;
      var box = sheet.querySelector(".report-notes");
      if (!box) {
        box = D.el("div.report-notes.mb-5");
        var sums = sheet.querySelector(".report-sums");
        if (sums && sums.nextSibling) sheet.insertBefore(box, sums.nextSibling);
        else sheet.appendChild(box);
      }
      box.appendChild(D.el("div.notice.info.closing-drift", { html: D.icon("lock") + "<div>" + D.esc(notes.join(" ")) + "</div>" }));
    }
  });

  /* ---- Kalender: Hinweis und eingefrorener Monatssaldo ---------------- */
  ZK.Ext.register("calendar.top", {
    id: "closing",
    order: 5,
    when: function (ctx) { return !!snapOf(ctx.App, ctx.month); },
    render: function (host, ctx) {
      var App = ctx.App;
      var snap = snapOf(App, ctx.month);
      var d = drift(App, ctx.month, snap);
      var v = App.fmtSigned(snap.balance);

      /* Monatssaldo aus der Momentaufnahme — mit Schloss, damit er sich vom
         neu gerechneten Wert unterscheiden darf */
      var kpi = host.querySelector(".cal-kpis .kpi");
      if (kpi) {
        var title = kpi.querySelector(".k-title");
        var val = kpi.querySelector(".k-val");
        var sub = kpi.querySelector(".k-sub");
        if (title && !title.querySelector(".closing-lock")) {
          title.appendChild(D.el("span.closing-lock", { html: D.icon("lock"), "aria-hidden": "true" }));
        }
        if (val) {
          val.textContent = v;
          val.classList.remove("tone-plus", "tone-minus");
          if (snap.balance) val.classList.add(snap.balance > 0 ? "tone-plus" : "tone-minus");
        }
        kpi.classList.remove("accent-plus", "accent-minus");
        if (snap.balance) kpi.classList.add(snap.balance > 0 ? "accent-plus" : "accent-minus");
        if (sub) sub.textContent = I.t("closing.frozenSince", { date: shortDate(closedDate(snap)) });
      }

      var note = D.el("div.notice.info.mb-4.closing-notice");
      var text = I.t("closing.noticeSub", { v: v });
      if (d.differs) text += " " + I.t("closing.diff", { live: App.fmtSigned(d.live), v: v });
      if (d.stale) text += " " + I.t("closing.stale");
      note.innerHTML = D.icon("lock") + "<div class='closing-notice-text'><strong>" +
        D.esc(I.t("closing.notice", { month: monthLabel(ctx.month, true) })) +
        "</strong><div class='sub'>" + D.esc(text) + "</div></div>";
      var btn = iconButton(I.t("closing.reopen"), "refresh", ".ghost.sm.closing-reopen", function () { reopen(App, ctx.month); });
      note.appendChild(btn);
      host.appendChild(note);
    }
  });

  /* ---- Kalender: Schloss in den Zellen -------------------------------- */
  ZK.Ext.register("calendar.cell", {
    id: "closing",
    decorate: function (el, ctx) {
      if (!C.isLocked(ctx.App.settings(), ctx.iso)) return;
      el.classList.add("is-closed");
      var top = el.querySelector(".d");
      var dn = top && top.querySelector(".dn");
      if (dn && !top.querySelector(".closed-lock")) {
        var lock = D.el("span.closed-lock", { "aria-hidden": "true", html: D.icon("lock") });
        dn.parentNode.insertBefore(lock, dn.nextSibling);
      }
      var label = el.getAttribute("aria-label");
      if (label) el.setAttribute("aria-label", label + ", " + I.t("closing.cell"));
    }
  });

  /* ---- Statistik: abgeschlossene Monate im Zeitraum ------------------- */
  function closedIn(App, from, to) {
    return C.list(App.settings()).filter(function (c) {
      var first = c.month + "-01";
      return first <= to && T.endOfMonth(first) >= from;
    });
  }

  ZK.Ext.register("stats.top", {
    id: "closing",
    order: 5,
    when: function (ctx) { return !!(ctx.period && closedIn(ctx.App, ctx.period.from, ctx.period.until || ctx.period.to).length); },
    render: function (host, ctx) {
      var App = ctx.App;
      var list = closedIn(App, ctx.period.from, ctx.period.until || ctx.period.to);
      var strip = D.el("section.closing-strip.mb-5", { "aria-label": I.t("closing.statsTitle") });
      var head = D.el("div.closing-strip-head");
      head.innerHTML = D.icon("lock") + "<div><b>" + D.esc(I.t("closing.statsTitle")) + "</b><span>" + D.esc(I.t("closing.statsSub")) + "</span></div>";
      strip.appendChild(head);
      var chips = D.el("div.closing-chips");
      list.forEach(function (c) {
        var b = c.snap.balance;
        var chip = D.el("span.closing-chip", {
          title: I.t("closing.closedOn", { date: longDate(closedDate(c.snap)) }),
          html: "<span>" + D.esc(monthLabel(c.month)) + "</span><b class='mono" + (b > 0 ? " tone-plus" : b < 0 ? " tone-minus" : "") + "'>" + D.esc(App.fmtSigned(b)) + "</b>"
        });
        chips.appendChild(chip);
      });
      strip.appendChild(chips);
      host.appendChild(strip);
    }
  });

  /* ---- Heute: Tag gesperrt -------------------------------------------- */
  ZK.Ext.register("today.cards", {
    id: "closing",
    order: 0,
    when: function (ctx) { return C.isLocked(ctx.App.settings(), ctx.iso); },
    render: function (host, ctx) {
      var App = ctx.App;
      var month = C.monthOf(ctx.iso);
      var card = D.el("section.notice.info.closing-today");
      card.innerHTML = D.icon("lock") + "<div class='closing-notice-text'><strong>" + D.esc(I.t("closing.todayTitle", { month: monthLabel(month) })) + "</strong>" +
        "<div class='sub'>" + D.esc(I.t("closing.todaySub")) + "</div></div>";
      card.appendChild(iconButton(I.t("closing.openMonth"), "refresh", ".sm.closing-reopen", function () { reopen(App, month); }));
      host.appendChild(card);
    }
  });

  /* ---- Einstellungen: Lohnarten --------------------------------------- */
  ZK.Ext.register("settings.sections", {
    id: "closing",
    order: 30,
    render: function (host, ctx) {
      var App = ctx.App;
      var sec = ctx.section(I.t("closing.codes"));
      sec.node.classList.add("closing-codes-card");
      sec.body.appendChild(D.el("p.closing-codes-hint", { text: I.t("closing.codesHint") }));

      var idRow = D.el("div.setting-row.is-value");
      var info = D.el("div.info");
      info.appendChild(D.el("b", { id: "closing-empid-l", text: I.t("closing.employeeId") }));
      info.appendChild(D.el("span", { id: "closing-empid-h", text: I.t("closing.employeeIdHint") }));
      idRow.appendChild(info);
      var ctl = D.el("div.ctl");
      var idInput = D.el("input.input.mono", {
        type: "text", autocomplete: "off", maxlength: "40", value: App.settings().payrollEmployeeId || "",
        "aria-labelledby": "closing-empid-l", "aria-describedby": "closing-empid-h"
      });
      idInput.addEventListener("change", function () {
        var v = idInput.value.trim();
        idInput.value = v;
        if (v !== (App.settings().payrollEmployeeId || "")) App.store.updateSettings({ payrollEmployeeId: v });
      });
      ctl.appendChild(idInput);
      idRow.appendChild(ctl);
      sec.body.appendChild(idRow);

      var grid = D.el("div.wage-codes");
      C.WAGE_TYPES.forEach(function (k) {
        var name = I.t("closing.wage." + k);
        var row = D.el("label.wage-code");
        row.appendChild(D.el("span.wc-name", { text: name }));
        var input = D.el("input.input.mono.wc-input", {
          type: "text", autocomplete: "off", maxlength: "20", spellcheck: "false",
          value: C.codesOf(App.settings())[k], placeholder: "—", "aria-label": I.t("closing.codeFor", { name: name })
        });
        input.addEventListener("change", function () {
          var v = input.value.trim();
          input.value = v;
          var codes = C.codesOf(App.settings());
          if (codes[k] === v) return;
          codes[k] = v;
          App.store.updateSettings({ payrollCodes: codes });
        });
        row.appendChild(input);
        grid.appendChild(row);
      });
      sec.body.appendChild(grid);
      host.appendChild(sec.node);
    }
  });

  ZK.ClosingUI = {
    onLocked: onLocked,
    openClose: openClose,
    reopen: reopen,
    exportPayroll: exportPayroll,
    payrollCSV: payrollCSV,
    monthLabel: monthLabel
  };
})(typeof self !== "undefined" ? self : this);
