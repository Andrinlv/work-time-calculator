/* ==========================================================================
   ZEITKONTO — Frag dein Zeitkonto (Befehlspalette)
   --------------------------------------------------------------------------
   „Wann kann ich gehen?“, „Wie viele Ferientage habe ich noch?“, „Wie lange
   gestern?“ — die Antwort steht als oberste Zeile in der Palette, Enter
   springt in die Ansicht, aus der die Zahl stammt.

   Verstehen und Rechnen liegen in core/ask.js (ohne DOM, getestet). Hier:
     · Texte in vier Sprachen
     · der Datenzugang aus ZK.App (buildApi) — dieselben Funktionen, mit
       denen die Ansichten rechnen
     · Palettenzeilen (answer: true → zweizeilig und zuoberst; fill → die
       Beispielfrage wird eingesetzt statt ausgeführt)
     · wohin Enter springt (navigate)
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var T = ZK.Time, I = ZK.I18n;

  I.add({
    de: {
      "cmd.placeholder": "Befehl, Datum oder Frage …",
      "ask.group": "Antwort",
      "ask.groupAsk": "Frag dein Zeitkonto",
      "ask.tryLabel": "Frag einfach",
      "ask.leave.at": "{time} — inkl. {brk} Pause, noch {rest}",
      "ask.leave.atNoBreak": "{time} — noch {rest}",
      "ask.leave.shifted": "{time} — jetzt gilt {req} Pause, noch {rest}",
      "ask.leave.sub": "Gekommen {start} · bisher {net} netto · Soll {target}",
      "ask.leave.subBreak": "Pause seit {since} — der Feierabend rückt mit",
      "ask.leave.overnight": "Nachtschicht seit {start}",
      "ask.leave.reached": "Du kannst gehen — Soll seit {time} erreicht",
      "ask.leave.reachedNoTime": "Du kannst gehen — heute gibt es kein Soll",
      "ask.leave.reachedSub": "{over} über dem Soll · gekommen {start}",
      "ask.leave.whatif": "Wenn du jetzt kommst: {time}",
      "ask.leave.whatifSub": "inkl. {brk} Pause · Soll {target}",
      "ask.leave.whatifSubNoBreak": "Soll {target}",
      "ask.leave.gone": "Heute schon gegangen: {time}",
      "ask.leave.goneSub": "Saldo heute {bal} · {net} netto",
      "ask.leave.planned": "Gehen eingetragen: {time}",
      "ask.leave.plannedSub": "Saldo dann {bal}",
      "ask.leave.absence": "Heute: {type} — nichts zu stempeln",
      "ask.leave.absenceSub": "{v} gutgeschrieben",
      "ask.leave.free": "Heute ist frei — kein Soll",
      "ask.target.day": "{time} für {target} heute",
      "ask.target.dayWhatif": "Wenn du jetzt kommst: {time} für {target} heute",
      "ask.target.inclBreak": "inkl. {brk} Pause",
      "ask.target.since": "gekommen {start}",
      "ask.target.overMax": "{v} netto — über dem Tagesmaximum",
      "ask.target.reached": "{target} schon erreicht — seit {time}",
      "ask.target.reachedSub": "Saldo heute bisher {bal}",
      "ask.target.unreachable": "{target} heute nicht erreichbar",
      "ask.target.unreachableDay": "Dafür reicht ein Arbeitstag nicht",
      "ask.target.unreachableSub": "Mehr als {max} Arbeit nötig — im Planer auf mehrere Tage verteilen",
      "ask.target.noDay": "Zeitkonto {target}: heute ist kein offener Arbeitstag",
      "ask.target.accountNow": "Zeitkonto jetzt {v} · im Planer weiterrechnen",
      "ask.target.reachedAcc": "Zeitkonto {target} schon erreicht",
      "ask.target.accountSub": "Konto bis gestern {base} · heute {delta} · im Planer öffnen",
      "ask.target.account": "{time} für Zeitkonto {target}",
      "ask.target.accountAt8": "Bei Start 08:00: {time} für Zeitkonto {target}",
      "ask.day.running": "{net} netto bisher — noch {rest}",
      "ask.day.runningOver": "{net} netto bisher — {over} über dem Soll",
      "ask.day.subRunning": "{date} · seit {from} · Pause {brk} · läuft",
      "ask.day.incomplete": "Gehen fehlt — gekommen {from}",
      "ask.day.incompleteSub": "{date} · zählt erst mit der Gehen-Zeit",
      "ask.day.workedCredit": "{net} netto + {credit} {type} · Saldo {bal}",
      "ask.day.worked": "{net} netto · Saldo {bal}",
      "ask.day.subTimes": "{date} · {from}–{to} · Pause {brk}",
      "ask.day.futureType": "Geplant: {type}",
      "ask.day.future": "Noch nichts erfasst · Soll {target}",
      "ask.day.free": "Frei — kein Soll",
      "ask.day.holiday": "Feiertag: {name}",
      "ask.day.comp": "{type} · Saldo {bal}",
      "ask.day.absence": "{type} · {credit} gutgeschrieben",
      "ask.day.notYet": "Noch nicht eingestempelt",
      "ask.day.gap": "Nichts erfasst",
      "ask.day.gapSub": "{date} · Soll {target}",
      "ask.period.week": "Saldo KW {n}: {bal}",
      "ask.period.month": "Saldo {month}: {bal}",
      "ask.period.year": "Saldo {year}: {bal}",
      "ask.period.sub": "Ist {actual} · Soll {target}",
      "ask.period.subToDate": "Ist {actual} · Soll bis heute {target}",
      "ask.period.live": "heute läuft {v}",
      "ask.period.gaps": "{n} Lücken",
      "ask.period.gaps.one": "1 Lücke",
      "ask.period.account": "Zeitkonto {v}",
      "ask.account.label": "Zeitkonto {v}",
      "ask.account.subLive": "abgerechnet bis gestern · heute läuft {v}",
      "ask.account.subLiveShift": "abgerechnet · Nachtschicht läuft {v}",
      "ask.account.subSettled": "abgerechnet bis heute",
      "ask.account.comp": "reicht für {n} freie Tage à {h}",
      "ask.account.comp.one": "reicht für 1 freien Tag à {h}",
      "ask.vac.left": "{n} Ferientage übrig",
      "ask.vac.left.one": "1 Ferientag übrig",
      "ask.vac.over": "{n} Ferientage überzogen",
      "ask.vac.over.one": "1 Ferientag überzogen",
      "ask.vac.taken": "{n} Ferientage bezogen",
      "ask.vac.taken.one": "1 Ferientag bezogen",
      "ask.vac.planned": "{n} Ferientage geplant",
      "ask.vac.planned.one": "1 Ferientag geplant",
      "ask.vac.next": "nächste: {range}",
      "ask.vac.none": "nichts mehr geplant",
      "ask.vac.leftShort": "{n} übrig",
      "ask.vac.leftShort.one": "1 übrig",
      "ask.hol.off": "Feiertage sind ausgeschaltet",
      "ask.hol.offSub": "In den Einstellungen unter Feiertage einschalten",
      "ask.hol.none": "Keine Feiertage im nächsten Jahr",
      "ask.hol.label": "{name} · {date}",
      "ask.hol.in": "in {n} Tagen",
      "ask.hol.in.one": "morgen",
      "ask.hol.weekend": "fällt auf {wd}",
      "ask.hol.nextFree": "nächster an einem Werktag: {name}, {date}",
      "ask.bridge.none": "Keine Brückentage mehr in {year}",
      "ask.bridge.free": "{range}: {t} Tage frei ohne Ferientag",
      "ask.bridge.label": "{range}: {t} Tage frei mit {n} Ferientagen",
      "ask.bridge.label.one": "{range}: {t} Tage frei mit 1 Ferientag",
      "ask.bridge.dates": "Ferien: {dates}",
      "ask.brk.none": "Heute ist keine Pause nötig",
      "ask.brk.done": "{v} Pause — erledigt",
      "ask.brk.todo": "Noch {v} Pause nötig",
      "ask.brk.subTaken": "{taken} gemacht · bis Feierabend {want}",
      "ask.brk.next": "ab {over} Arbeit: {req}",
      "ask.brk.ended": "{taken} Pause gemacht — {req} nötig",
      "ask.brk.auto": "{v} automatisch abgezogen",
      "ask.brk.full": "Für einen vollen Tag: {v} Pause",
      "ask.ot.law": "{v} Überzeit {year}",
      "ask.ot.lawNone": "Keine Überzeit {year}",
      "ask.ot.days": "{n} Tage im Plus",
      "ask.ot.days.one": "1 Tag im Plus",
      "ask.ot.sub": "über {h} h pro Woche · {days} · Jahressaldo {bal}",
      "ask.ot.plus": "{days} ({year})",
      "ask.ot.plusSub": "zusammen {sum} · Jahressaldo {bal}",
      "ask.ot.cap": "Jahreskontingent {cap}",
      "ask.wk.rest": "Noch {v} bis zum Wochensoll",
      "ask.wk.done": "Wochensoll erreicht — {v} darüber",
      "ask.wk.sub": "KW {n} · Ist {actual} von {target}",
      "ask.wk.days": "{n} Arbeitstage offen",
      "ask.wk.days.one": "1 Arbeitstag offen",
      "ask.last.before": "Zuletzt vor {h}: {date} um {time}",
      "ask.last.after": "Zuletzt nach {h}: {date} bis {time}",
      "ask.last.never": "Noch nie vor {h} gekommen",
      "ask.last.neverAfter": "Noch nie nach {h} gegangen",
      "ask.last.neverSub": "in den erfassten Tagen",
      "ask.last.today": "heute",
      "ask.last.ago": "vor {n} Tagen",
      "ask.last.ago.one": "gestern",
      "ask.last.count": "{n}× in {year}",
      "ask.last.count.one": "1× in {year}",
      "ask.ex.leave": "Wann kann ich gehen?",
      "ask.ex.vacation": "Wie viele Ferientage habe ich noch?",
      "ask.ex.day": "Wie lange gestern?",
      "ask.ex.week": "Saldo diese Woche?",
      "ask.ex.holiday": "Nächster Feiertag?",
      "ask.ex.target": "Bis wann für ±0?",
      "ask.ex.break": "Wie viel Pause brauche ich?",
      "ask.ex.last": "Wann zuletzt vor 7?",
      "ask.exs.leave": "Feierabend mit Pause und Rest",
      "ask.exs.vacation": "Ferien übrig, bezogen, geplant",
      "ask.exs.day": "Netto und Saldo eines Tages",
      "ask.exs.week": "Woche, Monat, Jahr oder Zeitkonto",
      "ask.exs.holiday": "Feiertage und lange Wochenenden",
      "ask.exs.target": "Gehen-Zeit für einen Zielsaldo",
      "ask.exs.break": "Pausenrecht für heute",
      "ask.exs.last": "Wann du zuletzt früh da warst"
    },
    en: {
      "cmd.placeholder": "Command, date or question …",
      "ask.group": "Answer",
      "ask.groupAsk": "Ask your time account",
      "ask.tryLabel": "Just ask",
      "ask.leave.at": "{time} — incl. {brk} break, {rest} to go",
      "ask.leave.atNoBreak": "{time} — {rest} to go",
      "ask.leave.shifted": "{time} — a {req} break now applies, {rest} to go",
      "ask.leave.sub": "In since {start} · {net} net so far · target {target}",
      "ask.leave.subBreak": "On break since {since} — your leave time moves with it",
      "ask.leave.overnight": "Night shift since {start}",
      "ask.leave.reached": "You can leave — target reached at {time}",
      "ask.leave.reachedNoTime": "You can leave — no target today",
      "ask.leave.reachedSub": "{over} over target · in since {start}",
      "ask.leave.whatif": "If you clock in now: {time}",
      "ask.leave.whatifSub": "incl. {brk} break · target {target}",
      "ask.leave.whatifSubNoBreak": "target {target}",
      "ask.leave.gone": "Already clocked out today: {time}",
      "ask.leave.goneSub": "Today's balance {bal} · {net} net",
      "ask.leave.planned": "Clock-out entered: {time}",
      "ask.leave.plannedSub": "Balance then {bal}",
      "ask.leave.absence": "Today: {type} — nothing to clock",
      "ask.leave.absenceSub": "{v} credited",
      "ask.leave.free": "Today is a day off — no target",
      "ask.target.day": "{time} for {target} today",
      "ask.target.dayWhatif": "If you clock in now: {time} for {target} today",
      "ask.target.inclBreak": "incl. {brk} break",
      "ask.target.since": "in since {start}",
      "ask.target.overMax": "{v} net — above the daily maximum",
      "ask.target.reached": "{target} already reached — since {time}",
      "ask.target.reachedSub": "Today's balance so far {bal}",
      "ask.target.unreachable": "{target} can't be reached today",
      "ask.target.unreachableDay": "One working day isn't enough for that",
      "ask.target.unreachableSub": "Needs more than {max} of work — spread it over several days in the planner",
      "ask.target.noDay": "Balance {target}: today is not an open working day",
      "ask.target.accountNow": "Balance now {v} · continue in the planner",
      "ask.target.reachedAcc": "Balance of {target} already reached",
      "ask.target.accountSub": "Balance until yesterday {base} · today {delta} · open in the planner",
      "ask.target.account": "{time} for a balance of {target}",
      "ask.target.accountAt8": "Starting at 08:00: {time} for a balance of {target}",
      "ask.day.running": "{net} net so far — {rest} to go",
      "ask.day.runningOver": "{net} net so far — {over} over target",
      "ask.day.subRunning": "{date} · since {from} · break {brk} · running",
      "ask.day.incomplete": "Clock-out missing — in at {from}",
      "ask.day.incompleteSub": "{date} · counts once the clock-out is entered",
      "ask.day.workedCredit": "{net} net + {credit} {type} · balance {bal}",
      "ask.day.worked": "{net} net · balance {bal}",
      "ask.day.subTimes": "{date} · {from}–{to} · break {brk}",
      "ask.day.futureType": "Planned: {type}",
      "ask.day.future": "Nothing recorded yet · target {target}",
      "ask.day.free": "Day off — no target",
      "ask.day.holiday": "Public holiday: {name}",
      "ask.day.comp": "{type} · balance {bal}",
      "ask.day.absence": "{type} · {credit} credited",
      "ask.day.notYet": "Not clocked in yet",
      "ask.day.gap": "Nothing recorded",
      "ask.day.gapSub": "{date} · target {target}",
      "ask.period.week": "Balance week {n}: {bal}",
      "ask.period.month": "Balance {month}: {bal}",
      "ask.period.year": "Balance {year}: {bal}",
      "ask.period.sub": "Actual {actual} · target {target}",
      "ask.period.subToDate": "Actual {actual} · target to date {target}",
      "ask.period.live": "today running {v}",
      "ask.period.gaps": "{n} gaps",
      "ask.period.gaps.one": "1 gap",
      "ask.period.account": "Time account {v}",
      "ask.account.label": "Time account {v}",
      "ask.account.subLive": "settled until yesterday · today running {v}",
      "ask.account.subLiveShift": "settled · night shift running {v}",
      "ask.account.subSettled": "settled until today",
      "ask.account.comp": "worth {n} days off of {h}",
      "ask.account.comp.one": "worth 1 day off of {h}",
      "ask.vac.left": "{n} vacation days left",
      "ask.vac.left.one": "1 vacation day left",
      "ask.vac.over": "{n} vacation days overdrawn",
      "ask.vac.over.one": "1 vacation day overdrawn",
      "ask.vac.taken": "{n} vacation days taken",
      "ask.vac.taken.one": "1 vacation day taken",
      "ask.vac.planned": "{n} vacation days planned",
      "ask.vac.planned.one": "1 vacation day planned",
      "ask.vac.next": "next: {range}",
      "ask.vac.none": "nothing else planned",
      "ask.vac.leftShort": "{n} left",
      "ask.vac.leftShort.one": "1 left",
      "ask.hol.off": "Public holidays are turned off",
      "ask.hol.offSub": "Turn them on in Settings under public holidays",
      "ask.hol.none": "No public holidays in the next year",
      "ask.hol.label": "{name} · {date}",
      "ask.hol.in": "in {n} days",
      "ask.hol.in.one": "tomorrow",
      "ask.hol.weekend": "falls on a {wd}",
      "ask.hol.nextFree": "next on a workday: {name}, {date}",
      "ask.bridge.none": "No bridge days left in {year}",
      "ask.bridge.free": "{range}: {t} days off, no vacation needed",
      "ask.bridge.label": "{range}: {t} days off for {n} vacation days",
      "ask.bridge.label.one": "{range}: {t} days off for 1 vacation day",
      "ask.bridge.dates": "vacation: {dates}",
      "ask.brk.none": "No break needed today",
      "ask.brk.done": "{v} break — done",
      "ask.brk.todo": "{v} more break needed",
      "ask.brk.subTaken": "{taken} taken · {want} by leave time",
      "ask.brk.next": "from {over} of work: {req}",
      "ask.brk.ended": "{taken} break taken — {req} required",
      "ask.brk.auto": "{v} deducted automatically",
      "ask.brk.full": "For a full day: {v} break",
      "ask.ot.law": "{v} excess hours in {year}",
      "ask.ot.lawNone": "No excess hours in {year}",
      "ask.ot.days": "{n} days in credit",
      "ask.ot.days.one": "1 day in credit",
      "ask.ot.sub": "over {h} h per week · {days} · year balance {bal}",
      "ask.ot.plus": "{days} ({year})",
      "ask.ot.plusSub": "together {sum} · year balance {bal}",
      "ask.ot.cap": "yearly limit {cap}",
      "ask.wk.rest": "{v} left to the weekly target",
      "ask.wk.done": "Weekly target reached — {v} over",
      "ask.wk.sub": "Week {n} · {actual} of {target}",
      "ask.wk.days": "{n} workdays to go",
      "ask.wk.days.one": "1 workday to go",
      "ask.last.before": "Last before {h}: {date} at {time}",
      "ask.last.after": "Last after {h}: {date} until {time}",
      "ask.last.never": "Never clocked in before {h}",
      "ask.last.neverAfter": "Never clocked out after {h}",
      "ask.last.neverSub": "in your recorded days",
      "ask.last.today": "today",
      "ask.last.ago": "{n} days ago",
      "ask.last.ago.one": "yesterday",
      "ask.last.count": "{n}× in {year}",
      "ask.last.count.one": "1× in {year}",
      "ask.ex.leave": "When can I leave?",
      "ask.ex.vacation": "How many vacation days are left?",
      "ask.ex.day": "How long yesterday?",
      "ask.ex.week": "Balance this week?",
      "ask.ex.holiday": "Next public holiday?",
      "ask.ex.target": "Until when for ±0?",
      "ask.ex.break": "How much break do I need?",
      "ask.ex.last": "Last time before 7?",
      "ask.exs.leave": "Leave time with break and time left",
      "ask.exs.vacation": "Vacation left, taken, planned",
      "ask.exs.day": "Net time and balance of a day",
      "ask.exs.week": "Week, month, year or time account",
      "ask.exs.holiday": "Public holidays and long weekends",
      "ask.exs.target": "Leave time for a target balance",
      "ask.exs.break": "Break rules for today",
      "ask.exs.last": "When you last started early"
    },
    fr: {
      "cmd.placeholder": "Commande, date ou question …",
      "ask.group": "Réponse",
      "ask.groupAsk": "Interrogez votre compte temps",
      "ask.tryLabel": "Posez une question",
      "ask.leave.at": "{time} — pause de {brk} comprise, encore {rest}",
      "ask.leave.atNoBreak": "{time} — encore {rest}",
      "ask.leave.shifted": "{time} — {req} de pause s'appliquent désormais, encore {rest}",
      "ask.leave.sub": "Arrivée {start} · {net} net jusqu'ici · dû {target}",
      "ask.leave.subBreak": "En pause depuis {since} — l'heure de départ se décale",
      "ask.leave.overnight": "Service de nuit depuis {start}",
      "ask.leave.reached": "Vous pouvez partir — objectif atteint à {time}",
      "ask.leave.reachedNoTime": "Vous pouvez partir — rien de dû aujourd'hui",
      "ask.leave.reachedSub": "{over} au-delà de l'objectif · arrivée {start}",
      "ask.leave.whatif": "Si vous arrivez maintenant : {time}",
      "ask.leave.whatifSub": "pause de {brk} comprise · dû {target}",
      "ask.leave.whatifSubNoBreak": "dû {target}",
      "ask.leave.gone": "Départ déjà pointé aujourd'hui : {time}",
      "ask.leave.goneSub": "Solde du jour {bal} · {net} net",
      "ask.leave.planned": "Départ saisi : {time}",
      "ask.leave.plannedSub": "Solde alors {bal}",
      "ask.leave.absence": "Aujourd'hui : {type} — rien à pointer",
      "ask.leave.absenceSub": "{v} crédité",
      "ask.leave.free": "Aujourd'hui est libre — rien de dû",
      "ask.target.day": "{time} pour {target} aujourd'hui",
      "ask.target.dayWhatif": "Si vous arrivez maintenant : {time} pour {target} aujourd'hui",
      "ask.target.inclBreak": "pause de {brk} comprise",
      "ask.target.since": "arrivée {start}",
      "ask.target.overMax": "{v} net — au-delà du maximum journalier",
      "ask.target.reached": "{target} déjà atteint — depuis {time}",
      "ask.target.reachedSub": "Solde du jour jusqu'ici {bal}",
      "ask.target.unreachable": "{target} impossible à atteindre aujourd'hui",
      "ask.target.unreachableDay": "Une journée de travail n'y suffit pas",
      "ask.target.unreachableSub": "Plus de {max} de travail nécessaires — répartir sur plusieurs jours dans le planificateur",
      "ask.target.noDay": "Solde de {target} : aujourd'hui n'est pas un jour ouvré ouvert",
      "ask.target.accountNow": "Solde actuel {v} · continuer dans le planificateur",
      "ask.target.reachedAcc": "Solde de {target} déjà atteint",
      "ask.target.accountSub": "Solde jusqu'à hier {base} · aujourd'hui {delta} · ouvrir le planificateur",
      "ask.target.account": "{time} pour un solde de {target}",
      "ask.target.accountAt8": "En commençant à 08:00 : {time} pour un solde de {target}",
      "ask.day.running": "{net} net jusqu'ici — encore {rest}",
      "ask.day.runningOver": "{net} net jusqu'ici — {over} au-delà de l'objectif",
      "ask.day.subRunning": "{date} · depuis {from} · pause {brk} · en cours",
      "ask.day.incomplete": "Départ manquant — arrivée {from}",
      "ask.day.incompleteSub": "{date} · compte dès que le départ est saisi",
      "ask.day.workedCredit": "{net} net + {credit} {type} · solde {bal}",
      "ask.day.worked": "{net} net · solde {bal}",
      "ask.day.subTimes": "{date} · {from}–{to} · pause {brk}",
      "ask.day.futureType": "Prévu : {type}",
      "ask.day.future": "Rien de saisi pour l'instant · dû {target}",
      "ask.day.free": "Libre — rien de dû",
      "ask.day.holiday": "Jour férié : {name}",
      "ask.day.comp": "{type} · solde {bal}",
      "ask.day.absence": "{type} · {credit} crédité",
      "ask.day.notYet": "Arrivée pas encore pointée",
      "ask.day.gap": "Rien de saisi",
      "ask.day.gapSub": "{date} · dû {target}",
      "ask.period.week": "Solde semaine {n} : {bal}",
      "ask.period.month": "Solde {month} : {bal}",
      "ask.period.year": "Solde {year} : {bal}",
      "ask.period.sub": "Effectif {actual} · dû {target}",
      "ask.period.subToDate": "Effectif {actual} · dû à ce jour {target}",
      "ask.period.live": "aujourd'hui en cours {v}",
      "ask.period.gaps": "{n} lacunes",
      "ask.period.gaps.one": "1 lacune",
      "ask.period.account": "Compte temps {v}",
      "ask.account.label": "Compte temps {v}",
      "ask.account.subLive": "réglé jusqu'à hier · aujourd'hui en cours {v}",
      "ask.account.subLiveShift": "réglé · service de nuit en cours {v}",
      "ask.account.subSettled": "réglé jusqu'à aujourd'hui",
      "ask.account.comp": "soit {n} jours de congé de {h}",
      "ask.account.comp.one": "soit 1 jour de congé de {h}",
      "ask.vac.left": "{n} jours de vacances restants",
      "ask.vac.left.one": "1 jour de vacances restant",
      "ask.vac.over": "{n} jours de vacances en trop",
      "ask.vac.over.one": "1 jour de vacances en trop",
      "ask.vac.taken": "{n} jours de vacances pris",
      "ask.vac.taken.one": "1 jour de vacances pris",
      "ask.vac.planned": "{n} jours de vacances prévus",
      "ask.vac.planned.one": "1 jour de vacances prévu",
      "ask.vac.next": "prochaines : {range}",
      "ask.vac.none": "rien d'autre de prévu",
      "ask.vac.leftShort": "{n} restants",
      "ask.vac.leftShort.one": "1 restant",
      "ask.hol.off": "Les jours fériés sont désactivés",
      "ask.hol.offSub": "À activer dans les réglages, sous Jours fériés",
      "ask.hol.none": "Aucun jour férié dans l'année à venir",
      "ask.hol.label": "{name} · {date}",
      "ask.hol.in": "dans {n} jours",
      "ask.hol.in.one": "demain",
      "ask.hol.weekend": "tombe un {wd}",
      "ask.hol.nextFree": "prochain en semaine : {name}, {date}",
      "ask.bridge.none": "Plus de ponts en {year}",
      "ask.bridge.free": "{range} : {t} jours libres sans vacances",
      "ask.bridge.label": "{range} : {t} jours libres pour {n} jours de vacances",
      "ask.bridge.label.one": "{range} : {t} jours libres pour 1 jour de vacances",
      "ask.bridge.dates": "vacances : {dates}",
      "ask.brk.none": "Aucune pause requise aujourd'hui",
      "ask.brk.done": "{v} de pause — fait",
      "ask.brk.todo": "Encore {v} de pause à prendre",
      "ask.brk.subTaken": "{taken} prise · {want} d'ici le départ",
      "ask.brk.next": "dès {over} de travail : {req}",
      "ask.brk.ended": "{taken} de pause prise — {req} requise",
      "ask.brk.auto": "{v} déduit automatiquement",
      "ask.brk.full": "Pour une journée complète : {v} de pause",
      "ask.ot.law": "{v} de travail supplémentaire en {year}",
      "ask.ot.lawNone": "Aucun travail supplémentaire en {year}",
      "ask.ot.days": "{n} jours en positif",
      "ask.ot.days.one": "1 jour en positif",
      "ask.ot.sub": "au-delà de {h} h par semaine · {days} · solde annuel {bal}",
      "ask.ot.plus": "{days} ({year})",
      "ask.ot.plusSub": "au total {sum} · solde annuel {bal}",
      "ask.ot.cap": "contingent annuel {cap}",
      "ask.wk.rest": "Encore {v} avant le dû hebdomadaire",
      "ask.wk.done": "Dû hebdomadaire atteint — {v} de plus",
      "ask.wk.sub": "Semaine {n} · {actual} sur {target}",
      "ask.wk.days": "{n} jours ouvrés restants",
      "ask.wk.days.one": "1 jour ouvré restant",
      "ask.last.before": "Dernière fois avant {h} : {date} à {time}",
      "ask.last.after": "Dernière fois après {h} : {date} jusqu'à {time}",
      "ask.last.never": "Aucune arrivée avant {h}",
      "ask.last.neverAfter": "Aucun départ après {h}",
      "ask.last.neverSub": "dans les jours saisis",
      "ask.last.today": "aujourd'hui",
      "ask.last.ago": "il y a {n} jours",
      "ask.last.ago.one": "hier",
      "ask.last.count": "{n} fois en {year}",
      "ask.last.count.one": "1 fois en {year}",
      "ask.ex.leave": "Quand puis-je partir ?",
      "ask.ex.vacation": "Combien de jours de vacances me reste-t-il ?",
      "ask.ex.day": "Combien d'heures hier ?",
      "ask.ex.week": "Solde de la semaine ?",
      "ask.ex.holiday": "Prochain jour férié ?",
      "ask.ex.target": "Jusqu'à quand pour ±0 ?",
      "ask.ex.break": "Combien de pause dois-je faire ?",
      "ask.ex.last": "Dernière fois avant 7 h ?",
      "ask.exs.leave": "Heure de départ avec pause et reste",
      "ask.exs.vacation": "Vacances restantes, prises, prévues",
      "ask.exs.day": "Net et solde d'une journée",
      "ask.exs.week": "Semaine, mois, année ou compte temps",
      "ask.exs.holiday": "Jours fériés et longs week-ends",
      "ask.exs.target": "Heure de départ pour un solde visé",
      "ask.exs.break": "Règles de pause pour aujourd'hui",
      "ask.exs.last": "Votre dernière arrivée matinale"
    },
    it: {
      "cmd.placeholder": "Comando, data o domanda …",
      "ask.group": "Risposta",
      "ask.groupAsk": "Chiedi al tuo conto orario",
      "ask.tryLabel": "Chiedi pure",
      "ask.leave.at": "{time} — pausa di {brk} inclusa, mancano {rest}",
      "ask.leave.atNoBreak": "{time} — mancano {rest}",
      "ask.leave.shifted": "{time} — ora vale una pausa di {req}, mancano {rest}",
      "ask.leave.sub": "Entrata {start} · finora {net} netti · dovute {target}",
      "ask.leave.subBreak": "In pausa dalle {since} — l'uscita slitta",
      "ask.leave.overnight": "Turno di notte dalle {start}",
      "ask.leave.reached": "Puoi uscire — obiettivo raggiunto alle {time}",
      "ask.leave.reachedNoTime": "Puoi uscire — oggi nessuna ora dovuta",
      "ask.leave.reachedSub": "{over} oltre l'obiettivo · entrata {start}",
      "ask.leave.whatif": "Se entri adesso: {time}",
      "ask.leave.whatifSub": "pausa di {brk} inclusa · dovute {target}",
      "ask.leave.whatifSubNoBreak": "dovute {target}",
      "ask.leave.gone": "Uscita già timbrata oggi: {time}",
      "ask.leave.goneSub": "Saldo di oggi {bal} · {net} netti",
      "ask.leave.planned": "Uscita inserita: {time}",
      "ask.leave.plannedSub": "Saldo allora {bal}",
      "ask.leave.absence": "Oggi: {type} — niente da timbrare",
      "ask.leave.absenceSub": "{v} accreditate",
      "ask.leave.free": "Oggi è libero — nessuna ora dovuta",
      "ask.target.day": "{time} per {target} oggi",
      "ask.target.dayWhatif": "Se entri adesso: {time} per {target} oggi",
      "ask.target.inclBreak": "pausa di {brk} inclusa",
      "ask.target.since": "entrata {start}",
      "ask.target.overMax": "{v} netti — oltre il massimo giornaliero",
      "ask.target.reached": "{target} già raggiunto — dalle {time}",
      "ask.target.reachedSub": "Saldo di oggi finora {bal}",
      "ask.target.unreachable": "{target} non raggiungibile oggi",
      "ask.target.unreachableDay": "Una giornata di lavoro non basta",
      "ask.target.unreachableSub": "Servono più di {max} di lavoro — distribuiscile su più giorni nel pianificatore",
      "ask.target.noDay": "Saldo {target}: oggi non è una giornata lavorativa aperta",
      "ask.target.accountNow": "Saldo attuale {v} · continua nel pianificatore",
      "ask.target.reachedAcc": "Saldo di {target} già raggiunto",
      "ask.target.accountSub": "Saldo fino a ieri {base} · oggi {delta} · apri nel pianificatore",
      "ask.target.account": "{time} per un saldo di {target}",
      "ask.target.accountAt8": "Iniziando alle 08:00: {time} per un saldo di {target}",
      "ask.day.running": "{net} netti finora — mancano {rest}",
      "ask.day.runningOver": "{net} netti finora — {over} oltre l'obiettivo",
      "ask.day.subRunning": "{date} · dalle {from} · pausa {brk} · in corso",
      "ask.day.incomplete": "Uscita mancante — entrata {from}",
      "ask.day.incompleteSub": "{date} · conta solo con l'uscita",
      "ask.day.workedCredit": "{net} netti + {credit} {type} · saldo {bal}",
      "ask.day.worked": "{net} netti · saldo {bal}",
      "ask.day.subTimes": "{date} · {from}–{to} · pausa {brk}",
      "ask.day.futureType": "Pianificato: {type}",
      "ask.day.future": "Ancora niente registrato · dovute {target}",
      "ask.day.free": "Libero — nessuna ora dovuta",
      "ask.day.holiday": "Giorno festivo: {name}",
      "ask.day.comp": "{type} · saldo {bal}",
      "ask.day.absence": "{type} · {credit} accreditate",
      "ask.day.notYet": "Entrata non ancora timbrata",
      "ask.day.gap": "Niente registrato",
      "ask.day.gapSub": "{date} · dovute {target}",
      "ask.period.week": "Saldo settimana {n}: {bal}",
      "ask.period.month": "Saldo {month}: {bal}",
      "ask.period.year": "Saldo {year}: {bal}",
      "ask.period.sub": "Effettive {actual} · dovute {target}",
      "ask.period.subToDate": "Effettive {actual} · dovute a oggi {target}",
      "ask.period.live": "oggi in corso {v}",
      "ask.period.gaps": "{n} lacune",
      "ask.period.gaps.one": "1 lacuna",
      "ask.period.account": "Conto orario {v}",
      "ask.account.label": "Conto orario {v}",
      "ask.account.subLive": "chiuso fino a ieri · oggi in corso {v}",
      "ask.account.subLiveShift": "chiuso · turno di notte in corso {v}",
      "ask.account.subSettled": "chiuso fino a oggi",
      "ask.account.comp": "pari a {n} giorni liberi da {h}",
      "ask.account.comp.one": "pari a 1 giorno libero da {h}",
      "ask.vac.left": "{n} giorni di ferie rimasti",
      "ask.vac.left.one": "1 giorno di ferie rimasto",
      "ask.vac.over": "{n} giorni di ferie in eccesso",
      "ask.vac.over.one": "1 giorno di ferie in eccesso",
      "ask.vac.taken": "{n} giorni di ferie goduti",
      "ask.vac.taken.one": "1 giorno di ferie goduto",
      "ask.vac.planned": "{n} giorni di ferie pianificati",
      "ask.vac.planned.one": "1 giorno di ferie pianificato",
      "ask.vac.next": "prossime: {range}",
      "ask.vac.none": "nient'altro pianificato",
      "ask.vac.leftShort": "{n} rimasti",
      "ask.vac.leftShort.one": "1 rimasto",
      "ask.hol.off": "I giorni festivi sono disattivati",
      "ask.hol.offSub": "Attivali nelle impostazioni, sotto Giorni festivi",
      "ask.hol.none": "Nessun giorno festivo nel prossimo anno",
      "ask.hol.label": "{name} · {date}",
      "ask.hol.in": "tra {n} giorni",
      "ask.hol.in.one": "domani",
      "ask.hol.weekend": "cade di {wd}",
      "ask.hol.nextFree": "il prossimo in un giorno feriale: {name}, {date}",
      "ask.bridge.none": "Nessun ponte rimasto nel {year}",
      "ask.bridge.free": "{range}: {t} giorni liberi senza ferie",
      "ask.bridge.label": "{range}: {t} giorni liberi con {n} giorni di ferie",
      "ask.bridge.label.one": "{range}: {t} giorni liberi con 1 giorno di ferie",
      "ask.bridge.dates": "ferie: {dates}",
      "ask.brk.none": "Oggi nessuna pausa richiesta",
      "ask.brk.done": "{v} di pausa — fatto",
      "ask.brk.todo": "Ancora {v} di pausa da fare",
      "ask.brk.subTaken": "{taken} fatta · {want} entro l'uscita",
      "ask.brk.next": "da {over} di lavoro: {req}",
      "ask.brk.ended": "{taken} di pausa fatta — {req} richiesta",
      "ask.brk.auto": "{v} detratta automaticamente",
      "ask.brk.full": "Per una giornata intera: {v} di pausa",
      "ask.ot.law": "{v} di lavoro straordinario nel {year}",
      "ask.ot.lawNone": "Nessun lavoro straordinario nel {year}",
      "ask.ot.days": "{n} giorni in positivo",
      "ask.ot.days.one": "1 giorno in positivo",
      "ask.ot.sub": "oltre {h} h a settimana · {days} · saldo annuale {bal}",
      "ask.ot.plus": "{days} ({year})",
      "ask.ot.plusSub": "in totale {sum} · saldo annuale {bal}",
      "ask.ot.cap": "contingente annuo {cap}",
      "ask.wk.rest": "Mancano {v} alle ore settimanali",
      "ask.wk.done": "Ore settimanali raggiunte — {v} in più",
      "ask.wk.sub": "Settimana {n} · {actual} su {target}",
      "ask.wk.days": "{n} giorni lavorativi rimasti",
      "ask.wk.days.one": "1 giorno lavorativo rimasto",
      "ask.last.before": "Ultima volta prima delle {h}: {date} alle {time}",
      "ask.last.after": "Ultima volta dopo le {h}: {date} fino alle {time}",
      "ask.last.never": "Nessuna entrata prima delle {h}",
      "ask.last.neverAfter": "Nessuna uscita dopo le {h}",
      "ask.last.neverSub": "nei giorni registrati",
      "ask.last.today": "oggi",
      "ask.last.ago": "{n} giorni fa",
      "ask.last.ago.one": "ieri",
      "ask.last.count": "{n} volte nel {year}",
      "ask.last.count.one": "1 volta nel {year}",
      "ask.ex.leave": "A che ora posso uscire?",
      "ask.ex.vacation": "Quanti giorni di ferie mi restano?",
      "ask.ex.day": "Quanto ho lavorato ieri?",
      "ask.ex.week": "Saldo della settimana?",
      "ask.ex.holiday": "Prossimo giorno festivo?",
      "ask.ex.target": "Fino a quando per ±0?",
      "ask.ex.break": "Quanta pausa devo fare?",
      "ask.ex.last": "Ultima volta prima delle 7?",
      "ask.exs.leave": "Uscita con pausa e ore mancanti",
      "ask.exs.vacation": "Ferie rimaste, godute, pianificate",
      "ask.exs.day": "Netto e saldo di un giorno",
      "ask.exs.week": "Settimana, mese, anno o conto orario",
      "ask.exs.holiday": "Giorni festivi e weekend lunghi",
      "ask.exs.target": "Uscita per un saldo desiderato",
      "ask.exs.break": "Regole sulle pause per oggi",
      "ask.exs.last": "La tua ultima entrata mattiniera"
    }
  });

  /* Datumsformate der Antworten (I.formatDate-Optionen) */
  var DATE_STYLES = {
    long: { weekday: "short", day: "numeric", month: "long" },
    "short": { weekday: "short", day: "numeric", month: "short" },
    dm: { day: "numeric", month: "short" }
  };

  /** Datenzugang für core/ask.js — dieselben Funktionen, mit denen die Ansichten rechnen. */
  function buildApi(App) {
    var s = App.settings();
    var today = T.todayISO();
    var CW = ZK.CalWeek;
    var reports = ZK.Views && ZK.Views.reports && ZK.Views.reports.calc;
    var start, startKnown = false;
    return {
      today: today,
      now: new Date(),
      lang: I.getLang(),
      settings: function () { return s; },
      records: function () { return App.store.allDays(); },
      record: function (iso) { return App.record(iso); },
      day: function (iso) { return App.day(iso); },
      range: function (from, to) { return App.range(from, to); },
      accountBalance: function (upto) { return App.accountBalance(upto); },
      /* Abgeschlossene Monate mit ihrem eingefrorenen Saldo — wie Kalender und Kopfzeile */
      periodBalance: ZK.Closing ? function (from, to, live) {
        return ZK.Closing.periodBalance(App.store.allDays(), s, from, to, live);
      } : null,
      settledBalance: function () { return App.settledBalance(); },
      activeDate: function () { return App.activeStampDate ? App.activeStampDate() : today; },
      holiday: function (iso) { return App.holiday(iso); },
      todayState: ZK.TodayState,
      /* Kalender und Woche summieren mit Erfassungsbeginn — genau so hier */
      summarize: CW && CW.summarize ? function (days) {
        if (!startKnown) {
          start = CW.trackingStart(App.store.allDays(), s, App.store.getMeta ? App.store.getMeta() : null);
          startKnown = true;
        }
        return CW.summarize(days, { today: today, start: start, hasRecord: App.hasRecord });
      } : null,
      /* Überzeit wie in den Erkenntnissen der Statistik: ganze ISO-Wochen ab
         dem Montag vor dem 1.1., gemessen am Höchstmass der Einstellungen */
      overtimeYear: ZK.Insights && ZK.Insights.overtimeYear ? function (year) {
        var X = ZK.Insights;
        var days = App.range(T.startOfWeek(year + "-01-01", 1), year + "-12-31").days;
        return X.overtimeYear(days, year, { maxWeekly: s.maxWeeklyMinutes || X.DEFAULT_MAX_WEEKLY, today: today });
      } : null,
      overtimeLaw: reports && reports.overtimeLaw ? reports.overtimeLaw : null,
      t: I.t,
      tn: I.tn,
      fmt: App.fmt,
      fmtSigned: App.fmtSigned,
      num: CW && CW.fmtNum ? CW.fmtNum : function (v) { return String(v); },
      date: function (iso, style) { return I.formatDate(iso, DATE_STYLES[style] || DATE_STYLES.long); },
      weekday: I.weekdayName,
      month: I.monthName
    };
  }

  /* Stempel- und Pausenbefehle der Palette. Tippt jemand deren Namen
     („pause“, „gehen stempeln“), gehört Enter weiterhin dem Befehl —
     die Antwort rückt dann ans Ende statt nach oben. */
  var ACTION_KEYS = ["day.stampIn", "day.stampOut", "day.startBreak", "day.endBreak", "day.resume",
    "day.copyPrevious", "day.clearDay"];

  function clashesWithAction(query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return false;
    return ACTION_KEYS.some(function (k) {
      var label = I.t(k);
      return label !== k && label.toLowerCase().indexOf(q) >= 0;
    });
  }

  /** Antworten aus core/ask.js → Zeilen der Befehlspalette. */
  function toCommands(answers, query, App) {
    var late = clashesWithAction(query);
    return answers.map(function (a) {
      var help = a.intent === "help";
      return {
        group: I.t(help ? "ask.groupAsk" : "ask.group"),
        icon: a.icon || "info",
        label: a.label,
        sub: a.sub || "",
        tone: a.tone || "",
        answer: true,
        late: late,
        fill: typeof a.fill === "string" ? a.fill : undefined,
        run: function () { navigate(App, a.nav); }
      };
    });
  }

  /** Vorschlagszeile in der leeren Palette (ganz unten, „?“ öffnet die Beispiele). */
  function hintRow() {
    var topics = ["leave", "vacation", "day", "holiday"];
    return {
      group: I.t("ask.groupAsk"),
      icon: "search",
      label: I.t("ask.tryLabel"),
      sub: topics.map(function (k) { return I.t("ask.ex." + k); }).join(" · "),
      answer: true,
      late: true,
      fill: "?",
      run: function () { /* setzt nur „?“ ein */ }
    };
  }

  /* ---- Wohin Enter springt ----------------------------------------- */
  function navigate(App, nav) {
    if (!nav || !App) return;
    var CW = ZK.CalWeek;
    switch (nav.view) {
      case "today":
        App.setDate(nav.date || T.todayISO(), { view: "today" });
        break;
      case "week":
        App.weekAnchor = nav.date || T.todayISO();
        App.go("week");
        if (CW && CW.writeViewHash) CW.writeViewHash(App, "week", App.weekAnchor);
        break;
      case "calendar":
        App.calendarMonth = nav.month || T.monthKey(T.todayISO());
        App.go("calendar");
        if (CW && CW.writeViewHash) {
          CW.writeViewHash(App, "calendar", T.monthKey(App.date) === App.calendarMonth ? App.date : App.calendarMonth + "-01");
        }
        break;
      case "tools":
        App.go("tools");
        if (nav.planner) presetPlanner(nav.planner);
        else if (nav.section === "bridges") reveal(document.querySelector(".bridge-list"));
        break;
      default:
        App.go(nav.view);
    }
  }

  /* Gleitzeit-Planer mit Ziel und Stichtag vorbelegen — über seine Felder,
     damit er genau so rechnet, als hätte man es selbst eingetippt. */
  function presetPlanner(p) {
    var until = document.getElementById("plUntil");
    var target = document.getElementById("plTarget");
    if (!until || !target) return;
    until.value = p.until;
    target.value = p.target;
    target.dispatchEvent(new Event("change", { bubbles: true }));
    reveal(target.closest ? target.closest(".card") : target);
  }

  function reveal(node) {
    if (!node) return;
    setTimeout(function () {
      var header = document.getElementById("header");
      var offset = (header ? header.getBoundingClientRect().height : 0) + 12;
      var top = node.getBoundingClientRect().top + (window.pageYOffset || 0) - offset;
      try { window.scrollTo({ top: Math.max(0, top), behavior: "smooth" }); }
      catch (e) { window.scrollTo(0, Math.max(0, top)); }
    }, 60);
  }

  /* ---- Palette ------------------------------------------------------ */
  /* Je Frage, Datenstand, Minute und Sprache einmal rechnen — die Palette
     fragt bei jedem Tastendruck, auch wenn sich die Frage nicht ändert. */
  var memo = { key: null, value: [] };

  function collect(query, ctx) {
    var App = ctx && ctx.App;
    if (!App || !ZK.Ask) return [];
    var q = String(query || "");
    if (!q.trim()) return [hintRow()];
    var now = new Date();
    var key = [q, App.dataRevision ? App.dataRevision() : "", T.todayISO(now), now.getHours(), now.getMinutes(),
      I.getLang(), App.settings().durationStyle].join("|");
    if (memo.key === key) return memo.value;
    var intents = ZK.Ask.parse(q, { today: T.todayISO(now) });
    var value = [];
    if (intents.length) {
      var api = buildApi(App);
      var answers = [];
      intents.forEach(function (it) { answers = answers.concat(ZK.Ask.answer(it, api)); });
      value = toCommands(answers, q, App);
    }
    memo = { key: key, value: value };
    return value;
  }

  if (ZK.Ext) ZK.Ext.register("palette.commands", { id: "ask", order: -10, collect: collect });

  ZK.AskUI = {
    buildApi: buildApi,
    toCommands: toCommands,
    navigate: navigate,
    clashesWithAction: clashesWithAction,
    hintRow: hintRow,
    collect: collect
  };
})(typeof self !== "undefined" ? self : this);
