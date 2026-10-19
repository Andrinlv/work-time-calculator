/* ==========================================================================
   ZEITKONTO — Erkenntnisse (Statistik)
   --------------------------------------------------------------------------
   Ein Abschnitt nach den Kennzahlen, vier Karten:
     Rhythmus        24-Stunden-Uhr (Kommen, Mittag, Gehen) + Aussagen
     Saldo-Prognose  Monats- und Jahresende beim heutigen Tempo, Korridor
     Überzeit (ArG)  Wochen über dem Höchstmass gegen das Jahreskontingent
     Zuschläge       Nacht, Sonntag, Feiertag und Anteil Homeoffice
   Dazu eine Einstellungskarte (Korridor, Homeoffice-Grenze).

   Gerechnet wird in ZK.Insights (core/insights.js, getestet). Hier wird
   nur gezeichnet. Jede Grafik ist EIN Tabulator-Stopp mit Zusammenfassung;
   Pfeiltasten wandern durch die Marken, Maus und Touch über [data-tip].
   Jede Karte sagt ehrlich, wenn die Daten nicht reichen.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n, X = ZK.Insights;
  if (!ZK.Ext || !X || !I) return;

  I.add({
    de: {
      "ins.title": "Erkenntnisse",
      "ins.lede": "Nur was genug Tage belegen — die Stichprobe steht jeweils dabei.",
      "ins.rhythm": "Rhythmus",
      "ins.forecast": "Saldo-Prognose",
      "ins.overtime": "Überzeit nach ArG",
      "ins.premium": "Zuschlagszeiten & Arbeitsort",
      "ins.arrive": "Kommen",
      "ins.lunch": "Mittag",
      "ins.leave": "Gehen",
      "ins.avg": "Ø {t}",
      "ins.clockAria": "24-Stunden-Uhr: wann du kommst, Mittag machst und gehst. Pfeiltasten wandern durch die Zeiten.",
      "ins.nightZone": "Nachtzeit 23–06 Uhr (ArG)",
      "ins.nightsOut": "{n} Nachtschichten stehen auf der Uhr, zählen aber nicht zum Durchschnitt.",
      "ins.nightsOut.one": "1 Nachtschicht steht auf der Uhr, zählt aber nicht zum Durchschnitt.",
      "ins.noTimes": "Im Zeitraum gibt es noch keine gestempelten Tage.",
      "ins.noFacts": "Für belastbare Aussagen fehlen noch Tage. Es braucht mindestens 4 Tage je Vergleichsgruppe und einen klaren Unterschied.",
      "ins.method": "Verglichen werden nur normale Arbeitstage. Ein Unterschied erscheint ab 10 min und deutlich über der üblichen Streuung.",
      "ins.n": "n = {n}",
      "ins.nTip": "Anzahl Tage, auf denen die Aussage beruht",
      "ins.wd.0": "sonntags",
      "ins.wd.1": "montags",
      "ins.wd.2": "dienstags",
      "ins.wd.3": "mittwochs",
      "ins.wd.4": "donnerstags",
      "ins.wd.5": "freitags",
      "ins.wd.6": "samstags",
      "ins.f.weekday.arrive": "Du startest {a} im Schnitt {d} früher als {b}.",
      "ins.f.weekday.leave": "Du gehst {a} im Schnitt {d} früher als {b}.",
      "ins.f.trend.arrive.later": "Seit {month} kommst du im Schnitt {d} später.",
      "ins.f.trend.arrive.earlier": "Seit {month} kommst du im Schnitt {d} früher.",
      "ins.f.trend.leave.later": "Seit {month} gehst du im Schnitt {d} später.",
      "ins.f.trend.leave.earlier": "Seit {month} gehst du im Schnitt {d} früher.",
      "ins.f.home.longer": "An Homeoffice-Tagen arbeitest du im Schnitt {d} länger.",
      "ins.f.home.shorter": "An Homeoffice-Tagen arbeitest du im Schnitt {d} kürzer.",
      "ins.f.longest": "Deine längsten Tage sind {a}: Ø {v}, {d} mehr als an den übrigen Tagen.",
      "ins.f.lunch": "Die Hälfte deiner Mittagspausen beginnt zwischen {from} und {to}.",
      "ins.fc.meta": "bis {date}",
      "ins.fc.endOf": "Ende {x}",
      "ins.fc.days": "{n} Arbeitstage",
      "ins.fc.days.one": "1 Arbeitstag",
      "ins.fc.pace": "Annahme: Ø {avg} pro Arbeitstag wie in den letzten {n} Arbeitstagen.",
      "ins.fc.basis": "Geplante Absenzen und Feiertage zählen nicht als Arbeitstage.",
      "ins.fc.capped": "Die Kappung des Zeitkontos ist eingerechnet.",
      "ins.fc.noData": "Für eine Prognose braucht es mindestens {need} abgerechnete Arbeitstage — bisher sind es {n}.",
      "ins.fc.now": "Heute",
      "ins.fc.band": "Korridor",
      "ins.fc.tipPast": "{date} · Saldo {v}",
      "ins.fc.tipProj": "{date} · Prognose {v}",
      "ins.fc.aria": "Saldo der letzten acht Wochen und Prognose bis {date}. Heute {now}, {month}: {m}, {year}: {y}.",
      "ins.fc.nowAbove": "Dein Saldo liegt schon über deinem Wohlfühl-Korridor (bis {limit}). Vielleicht ein guter Moment für einen freien Tag?",
      "ins.fc.nowBelow": "Dein Saldo liegt unter deinem Wohlfühl-Korridor (ab {limit}). Ein paar etwas längere Tage bringen dich zurück.",
      "ins.fc.willAbove": "Bei diesem Tempo verlässt du den Korridor bis zum {date} nach oben ({v}).",
      "ins.fc.willBelow": "Bei diesem Tempo fällst du bis zum {date} unter den Korridor ({v}).",
      "ins.fc.fixLess": "Rund {d} weniger pro Arbeitstag hält dich drin.",
      "ins.fc.fixMore": "Rund {d} mehr pro Arbeitstag hält dich drin.",
      "ins.fc.inside": "Bis Ende {year} bleibst du in deinem Wohlfühl-Korridor ({min} … {max}).",
      "ins.ot.label": "Überzeit {year}",
      "ins.ot.weeks": "{n} Wochen über {max}",
      "ins.ot.weeks.one": "1 Woche über {max}",
      "ins.ot.none": "Keine Woche über {max}",
      "ins.ot.ofCap": "{v} von {cap} im Jahr",
      "ins.ot.left": "noch {v}",
      "ins.ot.warn": "Mehr als 80 % der jährlich erlaubten Überzeit sind aufgebraucht.",
      "ins.ot.over": "Die gesetzliche Jahresgrenze von {cap} Überzeit ist überschritten.",
      "ins.ot.note": "Überzeit ist Arbeitszeit über {max} pro Woche (ArG Art. 12/13) — getrennt vom Gleitzeitsaldo. Die Höchstarbeitszeit stellst du unter Arbeitsschutz ein.",
      "ins.ot.empty": "Für {year} sind noch keine Arbeitswochen erfasst.",
      "ins.ot.aria": "Arbeitszeit pro Woche {year}, Linie bei {max}. {weeks}. Pfeiltasten wandern durch die Wochen.",
      "ins.ot.tip": "KW{n} · {v}",
      "ins.ot.tipOver": "Überzeit {v}",
      "ins.ot.legWeek": "Arbeitszeit pro Woche",
      "ins.ot.legOver": "Überzeit",
      "ins.ot.legMax": "Höchstarbeitszeit",
      "ins.ot.prev": "{year}: {v} Überzeit",
      "ins.pr.night": "Nacht 23–06 Uhr",
      "ins.pr.sunday": "Sonntag",
      "ins.pr.holiday": "Feiertag",
      "ins.pr.note": "Sonn- und Feiertage nach ArG von 23 Uhr am Vortag bis 23 Uhr. Nachtstunden können zugleich Sonntagsstunden sein.",
      "ins.loc.title": "Arbeitsort",
      "ins.loc.share": "{p} % Homeoffice",
      "ins.loc.of": "{n} von {total} Arbeitstagen",
      "ins.loc.of.one": "1 von {total} Arbeitstagen",
      "ins.loc.limit": "Grenze {p} %",
      "ins.loc.over": "Über deiner Homeoffice-Grenze von {p} %.",
      "ins.loc.rest": "Übrige Orte",
      "ins.loc.empty": "Im Zeitraum gibt es noch keine Arbeitstage.",
      "ins.loc.aria": "Arbeitsort: {p} % Homeoffice, {n} von {total} Arbeitstagen.",
      "ins.loc.aria.one": "Arbeitsort: {p} % Homeoffice, 1 von {total} Arbeitstagen.",
      "ins.set.title": "Erkenntnisse",
      "ins.set.bandOn": "Wohlfühl-Korridor",
      "ins.set.bandOnHint": "Die Saldo-Prognose meldet sich, wenn sie die Spanne verlässt.",
      "ins.set.band": "Spanne",
      "ins.set.bandHint": "Untergrenze und Obergrenze, z. B. −5:00 und +20:00.",
      "ins.set.bandErr": "Die Untergrenze muss unter der Obergrenze liegen.",
      "ins.set.bandMin": "Untergrenze",
      "ins.set.bandMax": "Obergrenze",
      "ins.set.home": "Homeoffice-Grenze",
      "ins.set.homeHint": "Höchstanteil laut Vereinbarung. Leer = keine Grenze.",
      "ins.set.foot": "Die Höchstarbeitszeit für die Überzeit (45 h oder 50 h) stellst du unter Arbeitsschutz ein.",
      "ins.shiftsNoAvg": "Die Schichten wechseln: Ein Durchschnitt von Kommen und Gehen wäre irreführend, die Uhr zeigt die Verteilung."
    },
    en: {
      "ins.title": "Insights",
      "ins.lede": "Only what enough days back up — the sample size is always shown.",
      "ins.rhythm": "Rhythm",
      "ins.forecast": "Balance forecast",
      "ins.overtime": "Overtime under the Labour Act",
      "ins.premium": "Premium hours & work location",
      "ins.arrive": "Arrive",
      "ins.lunch": "Lunch",
      "ins.leave": "Leave",
      "ins.avg": "avg {t}",
      "ins.clockAria": "24-hour clock: when you arrive, take lunch and leave. Arrow keys move through the times.",
      "ins.nightZone": "Night time 11 pm–6 am (Labour Act)",
      "ins.nightsOut": "{n} night shifts appear on the clock but are left out of the average.",
      "ins.nightsOut.one": "1 night shift appears on the clock but is left out of the average.",
      "ins.noTimes": "No clocked days in this period yet.",
      "ins.noFacts": "Not enough days yet for reliable statements. It takes at least 4 days per group and a clear difference.",
      "ins.method": "Only regular working days are compared. A difference appears from 10 min and well above the usual spread.",
      "ins.n": "n = {n}",
      "ins.nTip": "Number of days the statement is based on",
      "ins.wd.0": "on Sundays",
      "ins.wd.1": "on Mondays",
      "ins.wd.2": "on Tuesdays",
      "ins.wd.3": "on Wednesdays",
      "ins.wd.4": "on Thursdays",
      "ins.wd.5": "on Fridays",
      "ins.wd.6": "on Saturdays",
      "ins.f.weekday.arrive": "On average you start {d} earlier {a} than {b}.",
      "ins.f.weekday.leave": "On average you leave {d} earlier {a} than {b}.",
      "ins.f.trend.arrive.later": "Since {month} you arrive {d} later on average.",
      "ins.f.trend.arrive.earlier": "Since {month} you arrive {d} earlier on average.",
      "ins.f.trend.leave.later": "Since {month} you leave {d} later on average.",
      "ins.f.trend.leave.earlier": "Since {month} you leave {d} earlier on average.",
      "ins.f.home.longer": "On home-office days you work {d} longer on average.",
      "ins.f.home.shorter": "On home-office days you work {d} less on average.",
      "ins.f.longest": "Your longest days are {a}: avg {v}, {d} more than other days.",
      "ins.f.lunch": "Half of your lunch breaks start between {from} and {to}.",
      "ins.fc.meta": "until {date}",
      "ins.fc.endOf": "End of {x}",
      "ins.fc.days": "{n} working days",
      "ins.fc.days.one": "1 working day",
      "ins.fc.pace": "Assumes {avg} per working day on average, as over the last {n} working days.",
      "ins.fc.basis": "Planned absences and public holidays don't count as working days.",
      "ins.fc.capped": "The account cap is taken into account.",
      "ins.fc.noData": "A forecast needs at least {need} settled working days — so far there are {n}.",
      "ins.fc.now": "Today",
      "ins.fc.band": "Range",
      "ins.fc.tipPast": "{date} · balance {v}",
      "ins.fc.tipProj": "{date} · forecast {v}",
      "ins.fc.aria": "Balance over the last eight weeks and forecast until {date}. Today {now}, {month}: {m}, {year}: {y}.",
      "ins.fc.nowAbove": "Your balance is already above your comfort range (up to {limit}). Maybe a good moment for a day off?",
      "ins.fc.nowBelow": "Your balance is below your comfort range (from {limit}). A few slightly longer days will bring you back.",
      "ins.fc.willAbove": "At this pace you'll rise above your range by {date} ({v}).",
      "ins.fc.willBelow": "At this pace you'll drop below your range by {date} ({v}).",
      "ins.fc.fixLess": "About {d} less per working day keeps you inside.",
      "ins.fc.fixMore": "About {d} more per working day keeps you inside.",
      "ins.fc.inside": "Until the end of {year} you stay within your comfort range ({min} … {max}).",
      "ins.ot.label": "Overtime {year}",
      "ins.ot.weeks": "{n} weeks above {max}",
      "ins.ot.weeks.one": "1 week above {max}",
      "ins.ot.none": "No week above {max}",
      "ins.ot.ofCap": "{v} of {cap} per year",
      "ins.ot.left": "{v} left",
      "ins.ot.warn": "More than 80% of the yearly overtime allowance is used up.",
      "ins.ot.over": "The legal yearly limit of {cap} overtime has been exceeded.",
      "ins.ot.note": "Overtime is working time above {max} per week (Labour Act art. 12/13) — separate from your flexitime balance. Set the maximum under Health & safety.",
      "ins.ot.empty": "No working weeks recorded for {year} yet.",
      "ins.ot.aria": "Working time per week {year}, line at {max}. {weeks}. Arrow keys move through the weeks.",
      "ins.ot.tip": "W{n} · {v}",
      "ins.ot.tipOver": "overtime {v}",
      "ins.ot.legWeek": "Working time per week",
      "ins.ot.legOver": "Overtime",
      "ins.ot.legMax": "Weekly maximum",
      "ins.ot.prev": "{year}: {v} overtime",
      "ins.pr.night": "Night 11 pm–6 am",
      "ins.pr.sunday": "Sunday",
      "ins.pr.holiday": "Public holiday",
      "ins.pr.note": "Sundays and public holidays per Labour Act run from 11 pm the day before until 11 pm. Night hours can also be Sunday hours.",
      "ins.loc.title": "Work location",
      "ins.loc.share": "{p}% home office",
      "ins.loc.of": "{n} of {total} working days",
      "ins.loc.of.one": "1 of {total} working days",
      "ins.loc.limit": "Limit {p}%",
      "ins.loc.over": "Above your home-office limit of {p}%.",
      "ins.loc.rest": "Other locations",
      "ins.loc.empty": "No working days in this period yet.",
      "ins.loc.aria": "Work location: {p}% home office, {n} of {total} working days.",
      "ins.loc.aria.one": "Work location: {p}% home office, 1 of {total} working days.",
      "ins.set.title": "Insights",
      "ins.set.bandOn": "Comfort range",
      "ins.set.bandOnHint": "The balance forecast lets you know when it leaves the range.",
      "ins.set.band": "Range",
      "ins.set.bandHint": "Lower and upper limit, e.g. −5:00 and +20:00.",
      "ins.set.bandErr": "The lower limit must be below the upper limit.",
      "ins.set.bandMin": "Lower limit",
      "ins.set.bandMax": "Upper limit",
      "ins.set.home": "Home-office limit",
      "ins.set.homeHint": "Maximum share as agreed. Empty = no limit.",
      "ins.set.foot": "Set the weekly maximum for overtime (45 h or 50 h) under Health & safety.",
      "ins.shiftsNoAvg": "Your shifts rotate: an average arrival or departure would mislead, so the clock shows the distribution."
    },
    fr: {
      "ins.title": "Observations",
      "ins.lede": "Seulement ce que suffisamment de jours confirment — l’échantillon est toujours indiqué.",
      "ins.rhythm": "Rythme",
      "ins.forecast": "Prévision du solde",
      "ins.overtime": "Travail supplémentaire (LTr)",
      "ins.premium": "Heures majorées & lieu de travail",
      "ins.arrive": "Arrivée",
      "ins.lunch": "Midi",
      "ins.leave": "Départ",
      "ins.avg": "moy. {t}",
      "ins.clockAria": "Horloge de 24 heures : quand vous arrivez, faites la pause de midi et partez. Les flèches parcourent les heures.",
      "ins.nightZone": "Travail de nuit 23 h–6 h (LTr)",
      "ins.nightsOut": "{n} services de nuit figurent sur l’horloge, mais pas dans la moyenne.",
      "ins.nightsOut.one": "1 service de nuit figure sur l’horloge, mais pas dans la moyenne.",
      "ins.noTimes": "Aucun jour pointé dans la période pour l’instant.",
      "ins.noFacts": "Pas encore assez de jours pour des constats fiables. Il faut au moins 4 jours par groupe et une différence nette.",
      "ins.method": "Seuls les jours de travail normaux sont comparés. Une différence apparaît dès 10 min et nettement au-delà de la dispersion habituelle.",
      "ins.n": "n = {n}",
      "ins.nTip": "Nombre de jours sur lesquels repose le constat",
      "ins.wd.0": "le dimanche",
      "ins.wd.1": "le lundi",
      "ins.wd.2": "le mardi",
      "ins.wd.3": "le mercredi",
      "ins.wd.4": "le jeudi",
      "ins.wd.5": "le vendredi",
      "ins.wd.6": "le samedi",
      "ins.f.weekday.arrive": "En moyenne, vous commencez {d} plus tôt {a} que {b}.",
      "ins.f.weekday.leave": "En moyenne, vous partez {d} plus tôt {a} que {b}.",
      "ins.f.trend.arrive.later": "Depuis {month}, vous arrivez en moyenne {d} plus tard.",
      "ins.f.trend.arrive.earlier": "Depuis {month}, vous arrivez en moyenne {d} plus tôt.",
      "ins.f.trend.leave.later": "Depuis {month}, vous partez en moyenne {d} plus tard.",
      "ins.f.trend.leave.earlier": "Depuis {month}, vous partez en moyenne {d} plus tôt.",
      "ins.f.home.longer": "En télétravail, vous travaillez en moyenne {d} de plus par jour.",
      "ins.f.home.shorter": "En télétravail, vous travaillez en moyenne {d} de moins par jour.",
      "ins.f.longest": "Vos journées les plus longues sont {a} : en moyenne {v}, {d} de plus que les autres jours.",
      "ins.f.lunch": "La moitié de vos pauses de midi commencent entre {from} et {to}.",
      "ins.fc.meta": "jusqu’au {date}",
      "ins.fc.endOf": "Fin {x}",
      "ins.fc.days": "{n} jours ouvrés",
      "ins.fc.days.one": "1 jour ouvré",
      "ins.fc.pace": "Hypothèse : {avg} par jour ouvré en moyenne, comme sur les {n} derniers jours ouvrés.",
      "ins.fc.basis": "Les absences prévues et les jours fériés ne comptent pas comme jours ouvrés.",
      "ins.fc.capped": "Le plafond du compte est pris en compte.",
      "ins.fc.noData": "Une prévision demande au moins {need} jours ouvrés décomptés — il y en a {n} pour l’instant.",
      "ins.fc.now": "Aujourd’hui",
      "ins.fc.band": "Plage",
      "ins.fc.tipPast": "{date} · solde {v}",
      "ins.fc.tipProj": "{date} · prévision {v}",
      "ins.fc.aria": "Solde des huit dernières semaines et prévision jusqu’au {date}. Aujourd’hui {now}, {month} : {m}, {year} : {y}.",
      "ins.fc.nowAbove": "Votre solde dépasse déjà votre plage de confort (jusqu’à {limit}). Peut-être le bon moment pour un jour de congé ?",
      "ins.fc.nowBelow": "Votre solde est sous votre plage de confort (dès {limit}). Quelques journées un peu plus longues vous y ramèneront.",
      "ins.fc.willAbove": "À ce rythme, vous dépasserez votre plage d’ici au {date} ({v}).",
      "ins.fc.willBelow": "À ce rythme, vous passerez sous votre plage d’ici au {date} ({v}).",
      "ins.fc.fixLess": "Environ {d} de moins par jour ouvré vous y maintient.",
      "ins.fc.fixMore": "Environ {d} de plus par jour ouvré vous y maintient.",
      "ins.fc.inside": "Jusqu’à fin {year}, vous restez dans votre plage de confort ({min} … {max}).",
      "ins.ot.label": "Travail suppl. {year}",
      "ins.ot.weeks": "{n} semaines au-delà de {max}",
      "ins.ot.weeks.one": "1 semaine au-delà de {max}",
      "ins.ot.none": "Aucune semaine au-delà de {max}",
      "ins.ot.ofCap": "{v} sur {cap} par an",
      "ins.ot.left": "reste {v}",
      "ins.ot.warn": "Plus de 80 % du travail supplémentaire annuel autorisé est utilisé.",
      "ins.ot.over": "La limite légale annuelle de {cap} de travail supplémentaire est dépassée.",
      "ins.ot.note": "Le travail supplémentaire est le temps de travail au-delà de {max} par semaine (LTr art. 12/13) — distinct du solde d’horaire variable. La durée maximale se règle sous Protection des travailleurs.",
      "ins.ot.empty": "Aucune semaine de travail saisie pour {year}.",
      "ins.ot.aria": "Temps de travail par semaine {year}, ligne à {max}. {weeks}. Les flèches parcourent les semaines.",
      "ins.ot.tip": "S{n} · {v}",
      "ins.ot.tipOver": "travail suppl. {v}",
      "ins.ot.legWeek": "Temps de travail par semaine",
      "ins.ot.legOver": "Travail supplémentaire",
      "ins.ot.legMax": "Durée maximale",
      "ins.ot.prev": "{year} : {v} de travail suppl.",
      "ins.pr.night": "Nuit 23 h–6 h",
      "ins.pr.sunday": "Dimanche",
      "ins.pr.holiday": "Jour férié",
      "ins.pr.note": "Dimanches et jours fériés selon la LTr, de 23 h la veille à 23 h. Les heures de nuit peuvent aussi être des heures du dimanche.",
      "ins.loc.title": "Lieu de travail",
      "ins.loc.share": "{p} % de télétravail",
      "ins.loc.of": "{n} jours ouvrés sur {total}",
      "ins.loc.of.one": "1 jour ouvré sur {total}",
      "ins.loc.limit": "Limite {p} %",
      "ins.loc.over": "Au-delà de votre limite de télétravail de {p} %.",
      "ins.loc.rest": "Autres lieux",
      "ins.loc.empty": "Aucun jour de travail dans la période pour l’instant.",
      "ins.loc.aria": "Lieu de travail : {p} % de télétravail, {n} jours ouvrés sur {total}.",
      "ins.loc.aria.one": "Lieu de travail : {p} % de télétravail, 1 jour ouvré sur {total}.",
      "ins.set.title": "Observations",
      "ins.set.bandOn": "Plage de confort",
      "ins.set.bandOnHint": "La prévision du solde vous avertit lorsqu’elle quitte la plage.",
      "ins.set.band": "Plage",
      "ins.set.bandHint": "Limite inférieure et supérieure, p. ex. −5:00 et +20:00.",
      "ins.set.bandErr": "La limite inférieure doit être sous la limite supérieure.",
      "ins.set.bandMin": "Limite inférieure",
      "ins.set.bandMax": "Limite supérieure",
      "ins.set.home": "Limite de télétravail",
      "ins.set.homeHint": "Part maximale convenue. Vide = aucune limite.",
      "ins.set.foot": "La durée maximale pour le travail supplémentaire (45 h ou 50 h) se règle sous Protection des travailleurs.",
      "ins.shiftsNoAvg": "Vos horaires alternent : une moyenne d’arrivée ou de départ induirait en erreur, l’horloge montre la répartition."
    },
    it: {
      "ins.title": "Osservazioni",
      "ins.lede": "Solo ciò che abbastanza giorni confermano — il campione è sempre indicato.",
      "ins.rhythm": "Ritmo",
      "ins.forecast": "Previsione del saldo",
      "ins.overtime": "Lavoro straordinario (LL)",
      "ins.premium": "Ore con supplemento & luogo di lavoro",
      "ins.arrive": "Entrata",
      "ins.lunch": "Pranzo",
      "ins.leave": "Uscita",
      "ins.avg": "media {t}",
      "ins.clockAria": "Orologio di 24 ore: quando entri, fai pausa pranzo ed esci. Le frecce scorrono gli orari.",
      "ins.nightZone": "Lavoro notturno 23–6 (LL)",
      "ins.nightsOut": "{n} turni di notte sono sull’orologio, ma non nella media.",
      "ins.nightsOut.one": "1 turno di notte è sull’orologio, ma non nella media.",
      "ins.noTimes": "Nel periodo non ci sono ancora giorni timbrati.",
      "ins.noFacts": "Mancano ancora giorni per osservazioni affidabili. Servono almeno 4 giorni per gruppo e una differenza chiara.",
      "ins.method": "Si confrontano solo i giorni lavorativi normali. Una differenza appare da 10 min e ben oltre la dispersione abituale.",
      "ins.n": "n = {n}",
      "ins.nTip": "Numero di giorni su cui si basa l’osservazione",
      "ins.wd.0": "la domenica",
      "ins.wd.1": "il lunedì",
      "ins.wd.2": "il martedì",
      "ins.wd.3": "il mercoledì",
      "ins.wd.4": "il giovedì",
      "ins.wd.5": "il venerdì",
      "ins.wd.6": "il sabato",
      "ins.f.weekday.arrive": "In media inizi {d} prima {a} che {b}.",
      "ins.f.weekday.leave": "In media esci {d} prima {a} che {b}.",
      "ins.f.trend.arrive.later": "Da {month} entri in media {d} più tardi.",
      "ins.f.trend.arrive.earlier": "Da {month} entri in media {d} prima.",
      "ins.f.trend.leave.later": "Da {month} esci in media {d} più tardi.",
      "ins.f.trend.leave.earlier": "Da {month} esci in media {d} prima.",
      "ins.f.home.longer": "Nei giorni di telelavoro lavori in media {d} in più.",
      "ins.f.home.shorter": "Nei giorni di telelavoro lavori in media {d} in meno.",
      "ins.f.longest": "Le tue giornate più lunghe sono {a}: in media {v}, {d} in più degli altri giorni.",
      "ins.f.lunch": "Metà delle tue pause pranzo inizia tra le {from} e le {to}.",
      "ins.fc.meta": "fino al {date}",
      "ins.fc.endOf": "Fine {x}",
      "ins.fc.days": "{n} giorni lavorativi",
      "ins.fc.days.one": "1 giorno lavorativo",
      "ins.fc.pace": "Ipotesi: {avg} per giorno lavorativo in media, come negli ultimi {n} giorni lavorativi.",
      "ins.fc.basis": "Assenze pianificate e giorni festivi non contano come giorni lavorativi.",
      "ins.fc.capped": "Il limite del conto è considerato.",
      "ins.fc.noData": "Per una previsione servono almeno {need} giorni lavorativi conteggiati — finora sono {n}.",
      "ins.fc.now": "Oggi",
      "ins.fc.band": "Fascia",
      "ins.fc.tipPast": "{date} · saldo {v}",
      "ins.fc.tipProj": "{date} · previsione {v}",
      "ins.fc.aria": "Saldo delle ultime otto settimane e previsione fino al {date}. Oggi {now}, {month}: {m}, {year}: {y}.",
      "ins.fc.nowAbove": "Il tuo saldo è già sopra la tua fascia di benessere (fino a {limit}). Forse è il momento giusto per un giorno libero?",
      "ins.fc.nowBelow": "Il tuo saldo è sotto la tua fascia di benessere (da {limit}). Qualche giornata un po’ più lunga ti riporta dentro.",
      "ins.fc.willAbove": "A questo ritmo superi la fascia entro il {date} ({v}).",
      "ins.fc.willBelow": "A questo ritmo scendi sotto la fascia entro il {date} ({v}).",
      "ins.fc.fixLess": "Circa {d} in meno per giorno lavorativo ti tiene dentro.",
      "ins.fc.fixMore": "Circa {d} in più per giorno lavorativo ti tiene dentro.",
      "ins.fc.inside": "Fino a fine {year} resti nella tua fascia di benessere ({min} … {max}).",
      "ins.ot.label": "Straordinario {year}",
      "ins.ot.weeks": "{n} settimane oltre {max}",
      "ins.ot.weeks.one": "1 settimana oltre {max}",
      "ins.ot.none": "Nessuna settimana oltre {max}",
      "ins.ot.ofCap": "{v} di {cap} all’anno",
      "ins.ot.left": "restano {v}",
      "ins.ot.warn": "Oltre l’80 % del lavoro straordinario annuo consentito è esaurito.",
      "ins.ot.over": "Il limite legale annuo di {cap} di lavoro straordinario è superato.",
      "ins.ot.note": "Il lavoro straordinario è il tempo di lavoro oltre {max} a settimana (LL art. 12/13) — separato dal saldo dell’orario flessibile. La durata massima si imposta in Protezione dei lavoratori.",
      "ins.ot.empty": "Per il {year} non ci sono ancora settimane lavorative registrate.",
      "ins.ot.aria": "Tempo di lavoro per settimana {year}, linea a {max}. {weeks}. Le frecce scorrono le settimane.",
      "ins.ot.tip": "S{n} · {v}",
      "ins.ot.tipOver": "straordinario {v}",
      "ins.ot.legWeek": "Tempo di lavoro per settimana",
      "ins.ot.legOver": "Straordinario",
      "ins.ot.legMax": "Durata massima",
      "ins.ot.prev": "{year}: {v} di straordinario",
      "ins.pr.night": "Notte 23–6",
      "ins.pr.sunday": "Domenica",
      "ins.pr.holiday": "Giorno festivo",
      "ins.pr.note": "Domeniche e giorni festivi secondo la LL, dalle 23 del giorno prima alle 23. Le ore notturne possono essere anche ore domenicali.",
      "ins.loc.title": "Luogo di lavoro",
      "ins.loc.share": "{p} % di telelavoro",
      "ins.loc.of": "{n} di {total} giorni lavorativi",
      "ins.loc.of.one": "1 di {total} giorni lavorativi",
      "ins.loc.limit": "Limite {p} %",
      "ins.loc.over": "Oltre il tuo limite di telelavoro del {p} %.",
      "ins.loc.rest": "Altri luoghi",
      "ins.loc.empty": "Nel periodo non ci sono ancora giorni lavorativi.",
      "ins.loc.aria": "Luogo di lavoro: {p} % di telelavoro, {n} di {total} giorni lavorativi.",
      "ins.loc.aria.one": "Luogo di lavoro: {p} % di telelavoro, 1 di {total} giorni lavorativi.",
      "ins.set.title": "Osservazioni",
      "ins.set.bandOn": "Fascia di benessere",
      "ins.set.bandOnHint": "La previsione del saldo ti avvisa quando esce dalla fascia.",
      "ins.set.band": "Fascia",
      "ins.set.bandHint": "Limite inferiore e superiore, p. es. −5:00 e +20:00.",
      "ins.set.bandErr": "Il limite inferiore deve essere sotto quello superiore.",
      "ins.set.bandMin": "Limite inferiore",
      "ins.set.bandMax": "Limite superiore",
      "ins.set.home": "Limite di telelavoro",
      "ins.set.homeHint": "Quota massima concordata. Vuoto = nessun limite.",
      "ins.set.foot": "La durata massima per lo straordinario (45 h o 50 h) si imposta in Protezione dei lavoratori.",
      "ins.shiftsNoAvg": "I tuoi turni cambiano: una media di entrata e uscita sarebbe fuorviante, l’orologio mostra la distribuzione."
    }
  });

  var NS = "http://www.w3.org/2000/svg";
  var DAY = 1440;
  var SERIES = [
    // Gleiche Farben wie die Stempeltasten: Kommen grün, Gehen rostrot.
    // Unterschieden wird zusätzlich über die Lage auf der Uhr und die
    // Legende — Farbe trägt die Zuordnung nie allein.
    { key: "arrive", color: "var(--chart-plus)", icon: "play" },
    { key: "lunch", color: "var(--chart-mark)", icon: "coffee" },
    { key: "leave", color: "var(--chart-minus)", icon: "stop" }
  ];
  var FACT_ICON = { weekday: "calendar", trend: "pulse", home: "home", longest: "chart", lunch: "coffee" };

  /* -------------------------------------------------------------------- */
  /* Texte (rein, für die Tests exportiert)                                */
  /* -------------------------------------------------------------------- */

  function monthOf(iso, today) {
    var label = I.monthName(+iso.slice(5, 7) - 1, "long");
    return iso.slice(0, 4) === String(today).slice(0, 4) ? label : label + " " + iso.slice(0, 4);
  }

  /**
   * Satz zu einer Aussage aus ZK.Insights.rhythm().facts.
   * @param {Function} fmt  Dauer → Text (App.fmt)
   */
  function factText(f, fmt, today) {
    if (f.id === "weekday") {
      return I.t("ins.f.weekday." + f.series, { a: I.t("ins.wd." + f.early), b: I.t("ins.wd." + f.late), d: fmt(f.minutes) });
    }
    if (f.id === "trend") {
      return I.t("ins.f.trend." + f.series + (f.minutes > 0 ? ".later" : ".earlier"),
        { month: monthOf(f.since, today), d: fmt(Math.abs(f.minutes)) });
    }
    if (f.id === "home") return I.t(f.minutes > 0 ? "ins.f.home.longer" : "ins.f.home.shorter", { d: fmt(Math.abs(f.minutes)) });
    if (f.id === "longest") return I.t("ins.f.longest", { a: I.t("ins.wd." + f.weekday), v: fmt(f.avg), d: fmt(f.minutes) });
    if (f.id === "lunch") return I.t("ins.f.lunch", { from: T.formatHHMM(f.from), to: T.formatHHMM(f.to) });
    return "";
  }

  function nText(f) { return I.t("ins.n", { n: f.n.join(" / ") }); }

  /** Hinweis zum Korridor (oder ""), zwei Sätze: wohin, und was hilft. */
  function hintText(h, fmt, fmtSigned) {
    if (!h) return "";
    if (h.at === "now") return I.t(h.side === "above" ? "ins.fc.nowAbove" : "ins.fc.nowBelow", { limit: fmtSigned(h.limit) });
    var text = I.t(h.side === "above" ? "ins.fc.willAbove" : "ins.fc.willBelow", {
      date: I.formatDate(h.date, { day: "numeric", month: "long" }), v: fmtSigned(h.value)
    });
    if (h.perDay) text += " " + I.t(h.side === "above" ? "ins.fc.fixLess" : "ins.fc.fixMore", { d: fmt(h.perDay) });
    return text;
  }

  function numText(n) {
    try { return new Intl.NumberFormat(I.getLang() + "-CH", { maximumFractionDigits: 2 }).format(n); }
    catch (e) { return String(n); }
  }

  ZK.InsightsUI = { factText: factText, nText: nText, hintText: hintText, monthOf: monthOf };

  /* -------------------------------------------------------------------- */
  /* Bausteine                                                             */
  /* -------------------------------------------------------------------- */

  function svgEl(name, attrs) {
    var node = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function svgText(x, y, value, cls, extra) {
    var node = svgEl("text", Object.assign({ x: x, y: y, class: cls || "axis-txt" }, extra || {}));
    node.textContent = value;
    return node;
  }

  function cached(App, key, fn) {
    return ZK.Insight && ZK.Insight.cached ? ZK.Insight.cached(App, key, fn) : fn();
  }

  function card(title, meta) {
    var node = D.el("section.card.ins-card");
    var head = D.el("div.card-head");
    head.appendChild(D.el("h3", { text: title }));
    if (meta) {
      var act = D.el("div.actions");
      act.appendChild(D.el("span.tag", { text: meta }));
      head.appendChild(act);
    }
    node.appendChild(head);
    var body = D.el("div.ins-body");
    node.appendChild(body);
    return { node: node, body: body };
  }

  function empty(text) {
    return D.el("p.ins-empty", { text: text });
  }

  /* Eine gemeinsame Live-Region: Tastatur-Wechsel werden vorgelesen. */
  var live = null;
  function announce(text) {
    if (!live) {
      live = D.el("div.sr-only", { "aria-live": "polite", "aria-atomic": "true" });
      document.body.appendChild(live);
    }
    live.textContent = text || "";
  }

  /**
   * Ein Diagramm = ein Tabulator-Stopp. Pfeiltasten wandern durch die
   * Marken (Elemente mit data-tip), der Tooltip steht an der Marke.
   */
  function keyNav(host, marks, start) {
    var idx = -1;
    function set(i) {
      if (idx >= 0 && marks[idx]) marks[idx].classList.remove("is-active");
      idx = i;
      var m = marks[i];
      if (!m) return;
      m.classList.add("is-active");
      if (D.showTip) D.showTip(m);
      announce(m.getAttribute("data-tip"));
    }
    function clear() {
      if (idx >= 0 && marks[idx]) marks[idx].classList.remove("is-active");
      idx = -1;
    }
    host.addEventListener("keydown", function (e) {
      if (!marks.length) return;
      var k = e.key, next;
      if (k === "ArrowRight" || k === "ArrowDown") next = idx < 0 ? (start || 0) : Math.min(marks.length - 1, idx + 1);
      else if (k === "ArrowLeft" || k === "ArrowUp") next = idx < 0 ? (start || 0) : Math.max(0, idx - 1);
      else if (k === "Home") next = 0;
      else if (k === "End") next = marks.length - 1;
      else if (k === "Escape") { clear(); if (D.hideTip) D.hideTip(); return; }
      else return;
      e.preventDefault();
      set(next);
    });
    host.addEventListener("blur", function () { clear(); if (D.hideTip) D.hideTip(); });
  }

  /* -------------------------------------------------------------------- */
  /* 1 · Rhythmus-Uhr                                                      */
  /* -------------------------------------------------------------------- */

  /* Winkel: 0 = Mitternacht oben, im Uhrzeigersinn */
  function pt(c, r, a) { return [c + r * Math.sin(a), c - r * Math.cos(a)]; }
  function f1(v) { return v.toFixed(1); }
  function sector(c, r1, r2, a0, a1) {
    var large = a1 - a0 > Math.PI ? 1 : 0;
    var p1 = pt(c, r1, a0), p2 = pt(c, r2, a0), p3 = pt(c, r2, a1), p4 = pt(c, r1, a1);
    return "M" + f1(p1[0]) + " " + f1(p1[1]) + "L" + f1(p2[0]) + " " + f1(p2[1]) +
      "A" + f1(r2) + " " + f1(r2) + " 0 " + large + " 1 " + f1(p3[0]) + " " + f1(p3[1]) +
      "L" + f1(p4[0]) + " " + f1(p4[1]) +
      "A" + f1(r1) + " " + f1(r1) + " 0 " + large + " 0 " + f1(p1[0]) + " " + f1(p1[1]) + "Z";
  }
  function angleOf(minutes) { return (minutes / DAY) * Math.PI * 2; }

  function clockChart(rh, App) {
    var S = 236, C = S / 2, R0 = 58, L = 52;
    var bins = rh.bins, nb = bins.arrive.length, binMin = rh.binMinutes;
    var summary = SERIES.filter(function (s) { return rh.avg[s.key] !== null; }).map(function (s) {
      return I.t("ins." + s.key) + " " + I.t("ins.avg", { t: T.formatHHMM(rh.avg[s.key]) }) + " (" + I.tn("common.nDays", rh.n[s.key]) + ")";
    }).join(", ");
    var svg = svgEl("svg", {
      viewBox: "0 0 " + S + " " + S, class: "chart ins-clock-svg", role: "img", tabindex: "0",
      "aria-label": I.t("ins.clockAria") + (summary ? " " + summary + "." : "")
    });

    /* Nachtzeit 23–06 als stilles Segment im Zifferblatt */
    svg.appendChild(svgEl("path", {
      d: sector(C, 0, R0, angleOf(23 * 60), angleOf(30 * 60)),
      class: "ins-night", "data-tip": I.t("ins.nightZone")
    }));

    /* Zifferblatt: Grundkreis, Stundenstriche, 0 · 6 · 12 · 18 */
    svg.appendChild(svgEl("circle", { cx: C, cy: C, r: R0, class: "ins-dial" }));
    for (var h = 0; h < 24; h++) {
      var a = angleOf(h * 60);
      var inner = pt(C, R0 - (h % 6 ? 3 : 6), a), outer = pt(C, R0, a);
      svg.appendChild(svgEl("line", { x1: f1(inner[0]), y1: f1(inner[1]), x2: f1(outer[0]), y2: f1(outer[1]), class: "ins-tick" }));
    }
    [0, 6, 12, 18].forEach(function (hh) {
      var p = pt(C, R0 - 15, angleOf(hh * 60));
      svg.appendChild(svgText(f1(p[0]), f1(p[1] + 3.5), String(hh), "axis-txt", { "text-anchor": "middle" }));
    });

    /* Balken: je Klasse gestapelt (Kommen, Mittag, Gehen), 2 px Luft */
    var maxTotal = 1;
    for (var i = 0; i < nb; i++) {
      maxTotal = Math.max(maxTotal, bins.arrive[i] + bins.lunch[i] + bins.leave[i]);
    }
    var gapA = 2 / R0;
    var hits = [];
    for (var b = 0; b < nb; b++) {
      var total = bins.arrive[b] + bins.lunch[b] + bins.leave[b];
      if (!total) continue;
      var a0 = angleOf(b * binMin) + gapA / 2, a1 = angleOf((b + 1) * binMin) - gapA / 2;
      var r = R0 + 2;
      var parts = [];
      SERIES.forEach(function (s) {
        var c = bins[s.key][b];
        if (!c) return;
        var len = Math.max(2.5, (c / maxTotal) * L);
        var seg = svgEl("path", { d: sector(C, r, r + len, a0, a1), class: "ins-bin" });
        seg.style.fill = s.color;
        svg.appendChild(seg);
        r += len + 1.5;
        parts.push(I.t("ins." + s.key) + " " + I.tn("common.nDays", c));
      });
      var hit = svgEl("path", {
        d: sector(C, R0 - 2, R0 + L + 6, angleOf(b * binMin), angleOf((b + 1) * binMin)),
        class: "ins-hit",
        "data-tip": T.formatHHMM(b * binMin) + "–" + T.formatHHMM((b + 1) * binMin) + " · " + parts.join(" · ")
      });
      svg.appendChild(hit);
      hits.push(hit);
    }

    /* Mittelwerte als Punkte auf dem Grundkreis (Ring in Flächenfarbe) */
    SERIES.forEach(function (s) {
      var v = rh.avg[s.key];
      if (v === null) return;
      var p = pt(C, R0, angleOf(v));
      var dot = svgEl("circle", {
        cx: f1(p[0]), cy: f1(p[1]), r: 4.5, class: "ins-mean",
        "data-tip": I.t("ins." + s.key) + " " + I.t("ins.avg", { t: T.formatHHMM(v) })
      });
      dot.style.fill = s.color;
      svg.appendChild(dot);
    });

    // Tastatur beginnt bei der ersten Klasse ab 06:00 — der Tag, nicht die Nacht
    var start = 0;
    for (var k = 0; k < hits.length; k++) {
      if (+hits[k].getAttribute("data-tip").slice(0, 2) >= 6) { start = k; break; }
    }
    keyNav(svg, hits, start);
    return svg;
  }

  function rhythmCard(ctx, App) {
    var period = ctx.period;
    var today = T.todayISO();
    var rh = cached(App, "ins|rh|" + period.from + "|" + period.until, function () { return X.rhythm(ctx.days); });
    var c = card(I.t("ins.rhythm"));
    if (!rh.n.arrive) {
      c.body.appendChild(empty(I.t("ins.noTimes")));
      return c.node;
    }
    var row = D.el("div.ins-rhythm");
    var clock = D.el("div.ins-clock");
    clock.appendChild(clockChart(rh, App));

    var legend = D.el("ul.ins-legend");
    SERIES.forEach(function (s) {
      var li = D.el("li");
      var sw = D.el("i.ins-sw");
      sw.style.background = s.color;
      li.appendChild(sw);
      li.appendChild(D.el("span.ins-leg-name", { text: I.t("ins." + s.key) }));
      li.appendChild(D.el("b.mono", { text: rh.avg[s.key] === null ? "–" : T.formatHHMM(rh.avg[s.key]) }));
      li.appendChild(D.el("span.ins-leg-n", { text: I.tn("common.nDays", rh.n[s.key]) }));
      legend.appendChild(li);
    });
    clock.appendChild(legend);
    row.appendChild(clock);

    var right = D.el("div.ins-facts-wrap");
    if (rh.facts.length) {
      var list = D.el("ul.ins-facts");
      rh.facts.forEach(function (f) {
        var li = D.el("li.ins-fact");
        li.appendChild(D.el("span.ins-fact-ic", { html: D.icon(FACT_ICON[f.id] || "info") }));
        var txt = D.el("div");
        txt.appendChild(D.el("p", { text: factText(f, App.fmt, today) }));
        txt.appendChild(D.el("span.ins-n.mono", { text: nText(f), "data-tip": I.t("ins.nTip") }));
        li.appendChild(txt);
        list.appendChild(li);
      });
      right.appendChild(list);
      right.appendChild(D.el("p.chart-note", { text: I.t("ins.method") }));
    } else {
      right.appendChild(empty(I.t("ins.noFacts")));
    }
    if (rh.shifts) right.appendChild(D.el("p.chart-note", { text: I.t("ins.shiftsNoAvg") }));
    else if (rh.nights) right.appendChild(D.el("p.chart-note", { text: I.tn("ins.nightsOut", rh.nights) }));
    row.appendChild(right);
    c.body.appendChild(row);
    return c.node;
  }

  /* -------------------------------------------------------------------- */
  /* 2 · Saldo-Prognose                                                    */
  /* -------------------------------------------------------------------- */

  function projectionOf(App) {
    var today = T.todayISO();
    return cached(App, "ins|proj|" + today, function () {
      var yearEnd = T.yearOf(today) + "-12-31";
      var recent = cached(App, "ins|recent|" + today, function () { return App.range(T.addDays(today, -90), today).days; });
      var future = cached(App, "ins|future|" + today, function () { return App.range(today, yearEnd).days; });
      return X.projection({
        balance: App.accountBalance(today).minutes,
        recent: recent, future: future, today: today, settings: App.settings()
      });
    });
  }

  function tile(label, value, text, sub) {
    var node = D.el("div.ins-tile");
    node.appendChild(D.el("div.k-title", { text: label }));
    node.appendChild(D.el("div.ins-tile-val.mono" + (value > 0 ? ".tone-plus" : value < 0 ? ".tone-minus" : ""), { text: text }));
    if (sub) node.appendChild(D.el("div.k-sub", { text: sub }));
    return node;
  }

  function sparkline(host, p, App, width) {
    var W = Math.max(240, width || 320), H = 118;
    var pad = { l: 6, r: 58, t: 16, b: 20 };
    var pts = p.history.map(function (x) { return { date: x.date, value: x.value }; })
      .concat(p.path.map(function (x) { return { date: x.date, value: x.value, projected: true }; }));
    var today = T.todayISO();
    var from = pts[0].date, to = pts[pts.length - 1].date;
    var span = Math.max(1, T.diffDays(from, to));
    var vals = pts.map(function (x) { return x.value; }).concat([0]);
    if (p.band) vals.push(p.band.min, p.band.max);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var padV = Math.max(30, (hi - lo) * 0.1);
    lo -= padV; hi += padV;
    var bw = W - pad.l - pad.r, bh = H - pad.t - pad.b;
    function sx(iso) { return pad.l + (T.diffDays(from, iso) / span) * bw; }
    function sy(v) { return pad.t + bh - ((v - lo) / (hi - lo)) * bh; }
    var fmtS = App.fmtSigned;

    var monthLabel = monthOf(p.monthEnd.date, today);
    var sameEnd = p.monthEnd.date === p.yearEnd.date;
    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H, width: W, height: H, class: "chart ins-spark", role: "img", tabindex: "0",
      "aria-label": I.t("ins.fc.aria", {
        date: I.formatDate(p.yearEnd.date, { day: "numeric", month: "long", year: "numeric" }),
        now: fmtS(p.balance), month: monthLabel, m: fmtS(p.monthEnd.value), year: p.yearEnd.date.slice(0, 4), y: fmtS(p.yearEnd.value)
      })
    });

    /* Wohlfühl-Korridor: ruhige Fläche mit feinen Kanten */
    if (p.band) {
      var yTop = sy(p.band.max), yBot = sy(p.band.min);
      svg.appendChild(svgEl("rect", { x: pad.l, y: f1(yTop), width: f1(bw), height: f1(Math.max(1, yBot - yTop)), class: "ins-band" }));
      svg.appendChild(svgEl("line", { x1: pad.l, x2: pad.l + bw, y1: f1(yTop), y2: f1(yTop), class: "ins-band-edge" }));
      svg.appendChild(svgEl("line", { x1: pad.l, x2: pad.l + bw, y1: f1(yBot), y2: f1(yBot), class: "ins-band-edge" }));
      // Grenzen rechts beschriften — ausser dort, wo der Jahresend-Wert steht
      var yEnd = sy(p.yearEnd.value);
      var yEndLbl = yEnd - 9 < pad.t ? yEnd + 14 : yEnd - 7;
      [[yTop, p.band.max], [yBot, p.band.min]].forEach(function (b) {
        if (Math.abs(b[0] + 3.5 - yEndLbl) < 12 || Math.abs(b[0] - yEnd) < 8) return;
        svg.appendChild(svgText(pad.l + bw + 6, f1(b[0] + 3.5), fmtS(b[1]), "axis-txt"));
      });
    }
    var zy = sy(0);
    svg.appendChild(svgEl("line", { x1: pad.l, x2: pad.l + bw, y1: f1(zy), y2: f1(zy), class: "zero-line" }));

    /* Verlauf durchgezogen, Prognose gestrichelt */
    function line(list, cls) {
      if (list.length < 2) return;
      var d = list.map(function (x, i) { return (i ? "L" : "M") + f1(sx(x.date)) + " " + f1(sy(x.value)); }).join("");
      svg.appendChild(svgEl("path", { d: d, class: "line-path " + cls }));
    }
    line(p.history, "ins-hist");
    line([p.history[p.history.length - 1]].concat(p.path), "ins-proj");

    var tx = sx(today);
    svg.appendChild(svgEl("line", { x1: f1(tx), x2: f1(tx), y1: pad.t, y2: pad.t + bh, class: "today-line" }));

    /* Achse unten: Heute, Monatsende, Jahresende — ohne Überlappung */
    var marks = [{ x: tx, label: I.t("ins.fc.now"), anchor: tx < pad.l + 30 ? "start" : "middle" }];
    if (!sameEnd) marks.push({ x: sx(p.monthEnd.date), label: I.formatDate(p.monthEnd.date, { day: "2-digit", month: "2-digit" }), anchor: "middle" });
    marks.push({ x: sx(p.yearEnd.date), label: I.formatDate(p.yearEnd.date, { day: "2-digit", month: "2-digit" }), anchor: "end" });
    var placed = [];
    marks.forEach(function (m) {
      if (placed.some(function (x) { return Math.abs(x - m.x) < 46; })) return;
      placed.push(m.x);
      svg.appendChild(svgText(f1(m.x), H - 5, m.label, "axis-txt", { "text-anchor": m.anchor }));
    });

    /* Treffer: je Tag eine unsichtbare Spalte mit Tooltip */
    var hover = svgEl("circle", { r: 4, class: "ins-hover", opacity: 0 });
    var hits = [];
    var startIdx = 0;
    var step = bw / span;
    pts.forEach(function (x, i) {
      if (i && x.date === pts[i - 1].date) return;
      if (x.date === today) startIdx = hits.length;
      var dd = I.formatDate(x.date, { weekday: "short", day: "numeric", month: "short" });
      var hit = svgEl("rect", {
        x: f1(sx(x.date) - step / 2), y: pad.t, width: f1(Math.max(1, step)), height: f1(bh), class: "ins-hit",
        "data-tip": I.t(x.projected ? "ins.fc.tipProj" : "ins.fc.tipPast", { date: dd, v: fmtS(x.value) }),
        "data-x": f1(sx(x.date)), "data-y": f1(sy(x.value))
      });
      svg.appendChild(hit);
      hits.push(hit);
    });
    svg.appendChild(hover);
    function moveHover(el) {
      if (!el || !el.getAttribute("data-x")) { hover.setAttribute("opacity", 0); return; }
      hover.setAttribute("cx", el.getAttribute("data-x"));
      hover.setAttribute("cy", el.getAttribute("data-y"));
      hover.setAttribute("opacity", 1);
    }
    svg.addEventListener("pointerover", function (e) { moveHover(e.target.closest ? e.target.closest(".ins-hit") : null); });
    svg.addEventListener("pointerleave", function () { moveHover(null); });

    /* Punkte: heute gefüllt, Monats-/Jahresende hohl (Prognose) mit Wert */
    function dot(iso, v, hollow, label) {
      var x = sx(iso), y = sy(v);
      var c = svgEl("circle", { cx: f1(x), cy: f1(y), r: 4.5, class: hollow ? "ins-dot is-hollow" : "ins-dot" });
      svg.appendChild(c);
      if (label) {
        var below = y - 9 < pad.t;
        svg.appendChild(svgText(f1(x + 8), f1(below ? y + 14 : y - 7), label, "val-txt"));
      }
    }
    dot(today, p.balance, false, "");
    if (!sameEnd && sx(p.yearEnd.date) - sx(p.monthEnd.date) > 64) dot(p.monthEnd.date, p.monthEnd.value, true, fmtS(p.monthEnd.value));
    else if (!sameEnd) dot(p.monthEnd.date, p.monthEnd.value, true, "");
    dot(p.yearEnd.date, p.yearEnd.value, true, fmtS(p.yearEnd.value));

    // Tastatur beginnt bei heute; der Punkt wandert mit
    keyNav(svg, hits, startIdx);
    svg.addEventListener("keyup", function () { moveHover(svg.querySelector(".ins-hit.is-active")); });
    svg.addEventListener("blur", function () { moveHover(null); });

    host.appendChild(svg);
  }

  function forecastCard(ctx, App, width) {
    var today = T.todayISO();
    var p = projectionOf(App);
    var c = card(I.t("ins.forecast"), I.t("ins.fc.meta", { date: I.formatDate(T.yearOf(today) + "-12-31", { day: "2-digit", month: "2-digit" }) }));
    if (!p.ok) {
      c.body.appendChild(empty(I.t("ins.fc.noData", { need: p.need, n: p.n })));
      return c.node;
    }
    var tiles = D.el("div.ins-tiles");
    if (p.monthEnd.date !== p.yearEnd.date) {
      tiles.appendChild(tile(I.t("ins.fc.endOf", { x: monthOf(p.monthEnd.date, today) }), p.monthEnd.value,
        App.fmtSigned(p.monthEnd.value), I.tn("ins.fc.days", p.monthEnd.days, { n: numText(p.monthEnd.days) })));
    }
    tiles.appendChild(tile(I.t("ins.fc.endOf", { x: p.yearEnd.date.slice(0, 4) }), p.yearEnd.value,
      App.fmtSigned(p.yearEnd.value), I.tn("ins.fc.days", p.yearEnd.days, { n: numText(p.yearEnd.days) })));
    c.body.appendChild(tiles);
    c.body.appendChild(D.el("p.ins-pace", { text: I.t("ins.fc.pace", { avg: App.fmtSigned(p.avg), n: p.n }) }));

    var chart = D.el("div.ins-chart");
    c.body.appendChild(chart);
    sparkline(chart, p, App, width);
    var leg = [
      { label: I.t("set.account"), color: "var(--chart-mark)" },
      { label: I.t("ins.forecast"), color: "var(--chart-mark)", dashed: true }
    ];
    if (p.band) leg.push({ label: I.t("ins.fc.band") + " " + App.fmtSigned(p.band.min) + " … " + App.fmtSigned(p.band.max), color: "var(--chart-plus)", soft: true });
    ZK.Charts.legend(chart, leg);

    if (p.hint) {
      var n = D.el("div.notice.ins-hint" + (p.hint.side === "above" ? ".info" : ".warn"));
      n.innerHTML = D.icon(p.hint.side === "above" ? "umbrella" : "pulse") + "<div></div>";
      n.lastChild.textContent = hintText(p.hint, App.fmt, App.fmtSigned);
      c.body.appendChild(n);
    } else if (p.band) {
      var ok = D.el("p.ins-ok");
      ok.innerHTML = D.icon("check") + "<span></span>";
      ok.lastChild.textContent = I.t("ins.fc.inside", { year: p.yearEnd.date.slice(0, 4), min: App.fmtSigned(p.band.min), max: App.fmtSigned(p.band.max) });
      c.body.appendChild(ok);
    }
    c.body.appendChild(D.el("p.chart-note", { text: I.t("ins.fc.basis") + (p.capped ? " " + I.t("ins.fc.capped") : "") }));
    return c.node;
  }

  /* -------------------------------------------------------------------- */
  /* 3 · Überzeit nach ArG                                                 */
  /* -------------------------------------------------------------------- */

  /* Dieselbe Definition wie die Jahresübersicht der Statistik — so teilen
     sich beide den Zwischenspeicher und das Jahr wird nur einmal gerechnet. */
  function yearDays(App, year) {
    return cached(App, "year|" + year, function () {
      return App.range(T.startOfWeek(year + "-01-01", 1), year + "-12-31");
    }).days;
  }

  function weeksChart(host, ot, App, width) {
    var W = Math.max(240, width || 320), H = 92;
    var pad = { l: 4, r: 40, t: 10, b: 16 };
    var bw = W - pad.l - pad.r, bh = H - pad.t - pad.b;
    var weeks = ot.weeks;
    var maxW = 0;
    weeks.forEach(function (w) { maxW = Math.max(maxW, w.worked); });
    var top = Math.max(ot.maxWeekly * 1.15, maxW * 1.04);
    function sy(v) { return pad.t + bh - (v / top) * bh; }
    var maxTxt = App.fmt(ot.maxWeekly);
    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H, width: W, height: H, class: "chart ins-weeks", role: "img", tabindex: "0",
      "aria-label": I.t("ins.ot.aria", {
        year: ot.year, max: maxTxt,
        weeks: ot.weeksOver ? I.tn("ins.ot.weeks", ot.weeksOver, { max: maxTxt }) : I.t("ins.ot.none", { max: maxTxt })
      })
    });
    var slot = bw / Math.max(weeks.length, 1);
    var barW = Math.max(2, Math.min(10, slot - 2));
    var limitY = sy(ot.maxWeekly);
    var hits = [];
    var today = T.todayISO();
    weeks.forEach(function (w, i) {
      var x = pad.l + slot * i + (slot - barW) / 2;
      var partial = T.addDays(w.monday, 6) > today;
      if (w.worked > 0) {
        var base = Math.min(w.worked, ot.maxWeekly);
        var y0 = sy(base);
        var r = svgEl("rect", {
          x: f1(x), y: f1(y0), width: f1(barW), height: f1(Math.max(1.5, pad.t + bh - y0)),
          rx: Math.min(2, barW / 2), class: "ins-wk" + (partial ? " is-partial" : "")
        });
        svg.appendChild(r);
        if (w.excess > 0) {
          // Auch eine kleine Überschreitung bleibt sichtbar (Wert im Tooltip)
          var y1 = Math.min(sy(w.worked), limitY - 4);
          var ex = svgEl("rect", {
            x: f1(x), y: f1(y1), width: f1(barW), height: f1(limitY - 1 - y1),
            rx: Math.min(2, barW / 2), class: "ins-wk-over"
          });
          svg.appendChild(ex);
        }
      }
      var tip = I.t("ins.ot.tip", { n: T.isoWeek(w.monday), v: App.fmt(w.worked) }) +
        (w.excess > 0 ? " · " + I.t("ins.ot.tipOver", { v: App.fmt(w.excess) }) : "");
      var hit = svgEl("rect", { x: f1(pad.l + slot * i), y: pad.t, width: f1(Math.max(1, slot)), height: f1(bh), class: "ins-hit", "data-tip": tip });
      svg.appendChild(hit);
      hits.push(hit);
    });
    svg.appendChild(svgEl("line", { x1: pad.l, x2: pad.l + bw, y1: f1(limitY), y2: f1(limitY), class: "ins-limit" }));
    svg.appendChild(svgText(pad.l + bw + 6, f1(limitY + 3.5), maxTxt, "axis-txt"));
    svg.appendChild(svgEl("line", { x1: pad.l, x2: pad.l + bw, y1: pad.t + bh, y2: pad.t + bh, class: "axis-line" }));
    if (weeks.length) {
      svg.appendChild(svgText(pad.l, H - 3, I.t("stats.kwShort", { n: T.isoWeek(weeks[0].monday) }), "axis-txt"));
      if (weeks.length > 4) {
        svg.appendChild(svgText(f1(pad.l + slot * (weeks.length - 0.5)), H - 3,
          I.t("stats.kwShort", { n: T.isoWeek(weeks[weeks.length - 1].monday) }), "axis-txt", { "text-anchor": "middle" }));
      }
    }
    var startIdx = hits.length - 1;
    for (var k = 0; k < weeks.length; k++) if (weeks[k].excess > 0) { startIdx = k; break; }
    keyNav(svg, hits, startIdx);
    host.appendChild(svg);
  }

  function overtimeCard(ctx, App, width) {
    var s = App.settings();
    var maxWeekly = s.maxWeeklyMinutes || X.DEFAULT_MAX_WEEKLY;
    var year = T.yearOf(ctx.period.until);
    var today = T.todayISO();
    var ot = cached(App, "ins|ot|" + year + "|" + maxWeekly, function () {
      return X.overtimeYear(yearDays(App, year), year, { maxWeekly: maxWeekly, today: today });
    });
    var c = card(I.t("ins.overtime"), String(year));
    var maxTxt = App.fmt(maxWeekly);
    var worked = ot.weeks.some(function (w) { return w.worked > 0; });
    if (!worked) {
      c.body.appendChild(empty(I.t("ins.ot.empty", { year: year })));
    } else {
      var head = D.el("div.ins-ot-head");
      var fig = D.el("div");
      fig.appendChild(D.el("div.k-title", { text: I.t("ins.ot.label", { year: year }) }));
      fig.appendChild(D.el("div.ins-tile-val.mono", { text: App.fmt(ot.total) }));
      fig.appendChild(D.el("div.k-sub", {
        text: ot.weeksOver ? I.tn("ins.ot.weeks", ot.weeksOver, { max: maxTxt }) : I.t("ins.ot.none", { max: maxTxt })
      }));
      head.appendChild(fig);
      c.body.appendChild(head);

      /* Kontingent: Füllung auf einer helleren Spur derselben Rampe */
      var pct = Math.min(100, ot.used * 100);
      var meter = D.el("div.ins-meter" + (ot.warn ? ".is-warn" : ""), {
        role: "img", "aria-label": I.t("ins.ot.ofCap", { v: App.fmt(ot.total), cap: App.fmt(ot.cap) })
      });
      var fill = D.el("i");
      fill.style.width = (ot.total > 0 ? Math.max(1.5, pct) : 0) + "%";
      meter.appendChild(fill);
      c.body.appendChild(meter);
      var lbl = D.el("div.ins-meter-lbl");
      lbl.appendChild(D.el("span", { text: I.t("ins.ot.ofCap", { v: App.fmt(ot.total), cap: App.fmt(ot.cap) }) }));
      lbl.appendChild(D.el("span.mono", { text: I.t("ins.ot.left", { v: App.fmt(ot.remaining) }) }));
      c.body.appendChild(lbl);

      if (ot.warn) {
        var n = D.el("div.notice.warn.ins-hint");
        n.innerHTML = D.icon("alert") + "<div></div>";
        n.lastChild.textContent = ot.over ? I.t("ins.ot.over", { cap: App.fmt(ot.cap) }) : I.t("ins.ot.warn");
        c.body.appendChild(n);
      }

      var chart = D.el("div.ins-chart");
      c.body.appendChild(chart);
      weeksChart(chart, ot, App, width);
      ZK.Charts.legend(chart, [
        { label: I.t("ins.ot.legWeek"), color: "var(--chart-mark-2)" },
        { label: I.t("ins.ot.legOver"), color: "var(--chart-minus)" },
        { label: I.t("ins.ot.legMax") + " " + maxTxt, color: "var(--ink-3)", dashed: true }
      ]);
    }

    /* Frühere Jahre im Zeitraum (z. B. „Alle“): je eine Zeile */
    var firstYear = T.yearOf(ctx.period.from);
    if (firstYear < year) {
      var prev = D.el("ul.ins-prev");
      for (var y = year - 1; y >= firstYear; y--) {
        var o = cached(App, "ins|ot|" + y + "|" + maxWeekly, (function (yy) {
          return function () { return X.overtimeYear(yearDays(App, yy), yy, { maxWeekly: maxWeekly, today: today }); };
        })(y));
        prev.appendChild(D.el("li", {
          text: I.t("ins.ot.prev", { year: y, v: App.fmt(o.total) }) + " · " +
            (o.weeksOver ? I.tn("ins.ot.weeks", o.weeksOver, { max: maxTxt }) : I.t("ins.ot.none", { max: maxTxt }))
        }));
      }
      c.body.appendChild(prev);
    }
    c.body.appendChild(D.el("p.chart-note", { text: I.t("ins.ot.note", { max: maxTxt }) }));
    return c.node;
  }

  /* -------------------------------------------------------------------- */
  /* 4 · Zuschlagszeiten & Arbeitsort                                      */
  /* -------------------------------------------------------------------- */

  function premiumCard(ctx, App) {
    var period = ctx.period;
    var today = T.todayISO();
    var s = App.settings();
    var pr = cached(App, "ins|pr|" + period.from + "|" + period.until, function () {
      return X.premiums(ctx.days, { today: today, holidayOf: function (iso) { return App.holiday(iso); } });
    });
    var loc = cached(App, "ins|loc|" + period.from + "|" + period.until + "|" + s.homeOfficeMaxPercent, function () {
      return X.locations(ctx.days, { today: today, limit: s.homeOfficeMaxPercent });
    });
    var c = card(I.t("ins.premium"));

    var rows = D.el("div.ins-prem");
    [["night", "moon"], ["sunday", "sun"], ["holiday", "star"]].forEach(function (k) {
      var row = D.el("div.ins-prem-row" + (pr[k[0]] ? "" : ".is-zero"));
      var name = D.el("span.ins-prem-name", { html: D.icon(k[1]) });
      name.appendChild(document.createTextNode(I.t("ins.pr." + k[0])));
      row.appendChild(name);
      var val = D.el("div.ins-prem-val");
      val.appendChild(D.el("b.mono", { text: pr[k[0]] ? App.fmt(pr[k[0]]) : "–" }));
      if (pr[k[0] + "Days"]) val.appendChild(D.el("span", { text: I.tn("common.nDays", pr[k[0] + "Days"]) }));
      row.appendChild(val);
      rows.appendChild(row);
    });
    c.body.appendChild(rows);
    c.body.appendChild(D.el("p.chart-note", { text: I.t("ins.pr.note") }));

    /* Arbeitsort: Homeoffice hervorgehoben, der Rest ruhig */
    var locBox = D.el("div.ins-loc");
    locBox.appendChild(D.el("h4", { text: I.t("ins.loc.title") }));
    if (!loc.total) {
      locBox.appendChild(empty(I.t("ins.loc.empty")));
    } else {
      var p = Math.round(loc.share * 100);
      var top = D.el("div.ins-loc-top");
      top.appendChild(D.el("b", { text: I.t("ins.loc.share", { p: p }) }));
      top.appendChild(D.el("span", { text: I.tn("ins.loc.of", loc.counts.home, { total: loc.total }) }));
      locBox.appendChild(top);
      var summary = I.tn("ins.loc.aria", loc.counts.home, { p: p, total: loc.total }) +
        (loc.limit !== null ? " " + I.t("ins.loc.limit", { p: loc.limit }) + "." : "");
      var bar = D.el("div.ins-loc-bar" + (loc.limit !== null ? ".has-limit" : ""), {
        role: "img", tabindex: "0", "aria-label": summary, "data-tip": summary
      });
      var rest = loc.total - loc.counts.home;
      if (loc.counts.home) bar.appendChild(D.el("i.is-home", { style: { flexGrow: loc.counts.home } }));
      if (rest) bar.appendChild(D.el("i.is-rest", { style: { flexGrow: rest } }));
      if (loc.limit !== null) {
        var mk = D.el("span.ins-loc-limit", { "aria-hidden": "true" });
        mk.style.left = loc.limit + "%";
        mk.appendChild(D.el("em", { text: I.t("ins.loc.limit", { p: loc.limit }) }));
        bar.appendChild(mk);
      }
      locBox.appendChild(bar);
      var parts = ["office", "field", "travel"].filter(function (k) { return loc.counts[k]; }).map(function (k) {
        return I.t("loc." + k) + " " + loc.counts[k];
      });
      ZK.Charts.legend(locBox, [
        { label: I.t("loc.home") + " " + loc.counts.home, color: "var(--chart-mark)" },
        { label: (parts.length === 1 ? parts[0] : I.t("ins.loc.rest") + (parts.length ? " (" + parts.join(", ") + ")" : "")), color: "var(--chart-mark-2)" }
      ]);
      if (loc.over) {
        var n = D.el("div.notice.warn.ins-hint");
        n.innerHTML = D.icon("home") + "<div></div>";
        n.lastChild.textContent = I.t("ins.loc.over", { p: loc.limit });
        locBox.appendChild(n);
      }
    }
    c.body.appendChild(locBox);
    return c.node;
  }

  /* -------------------------------------------------------------------- */
  /* Abschnitt                                                             */
  /* -------------------------------------------------------------------- */

  function render(host, ctx) {
    var App = ctx.App;
    var sec = D.el("section.ins.mb-4", { "aria-labelledby": "insTitle" });
    var head = D.el("div.ins-head");
    head.appendChild(D.el("h2#insTitle", { text: I.t("ins.title") }));
    head.appendChild(D.el("p", { text: I.t("ins.lede") }));
    sec.appendChild(head);
    var grid = D.el("div.ins-grid");
    sec.appendChild(grid);
    host.appendChild(sec);

    // Breite einmal lesen: alle Karten im Raster sind gleich breit.
    var probe = D.el("div.ins-card.card");
    grid.appendChild(probe);
    var inner = Math.max(240, probe.clientWidth - 2 * parseFloat(getComputedStyle(probe).paddingLeft || 0));
    grid.removeChild(probe);

    grid.appendChild(rhythmCard(ctx, App));
    grid.appendChild(forecastCard(ctx, App, inner));
    grid.appendChild(overtimeCard(ctx, App, inner));
    grid.appendChild(premiumCard(ctx, App));
  }

  ZK.Ext.register("stats.top", { id: "insights", order: 10, render: render });

  /* -------------------------------------------------------------------- */
  /* Einstellungen                                                         */
  /* -------------------------------------------------------------------- */

  var uid = 0;
  function settingRow(title, hint, kind) {
    var id = "ins-set-" + (++uid);
    var row = D.el("div.setting-row.is-" + kind);
    var info = D.el("div.info");
    info.appendChild(D.el("b", { id: id, text: title }));
    if (hint) info.appendChild(D.el("span", { id: id + "-h", text: hint }));
    row.appendChild(info);
    var ctl = D.el("div.ctl");
    row.appendChild(ctl);
    return { row: row, info: info, ctl: ctl, labelId: id, hintId: hint ? id + "-h" : null };
  }

  function flash(node) {
    node.classList.remove("flash");
    void node.offsetWidth;
    node.classList.add("flash");
    setTimeout(function () { node.classList.remove("flash"); }, 1400);
  }

  /* Saldo-Grenzen: „-5:00“, „+20:00“, „20h“ — eine blosse Zahl sind hier
     immer Stunden (ein Korridor von 60 meint 60 h, nicht 60 min). */
  function readSigned(raw) {
    var v = String(raw || "").trim().replace(/−/g, "-").replace(/^\+/, "");
    if (!v) return null;
    if (/^-?\d+([.,]\d+)?$/.test(v)) return Math.round(parseFloat(v.replace(",", ".")) * 60);
    var m = T.parseDuration(v);
    return m === null || !isFinite(m) ? null : m;
  }

  function renderSettings(host, ctx) {
    var App = ctx.App;
    var sec = ctx.section(I.t("ins.set.title"));
    var s = App.settings();
    var band = X.comfortBand(s) || X.comfortBand({ comfortBand: Object.assign({}, s.comfortBand || {}, { enabled: true }) });
    var on = X.comfortBand(s) !== null;

    function save(patch) {
      var cur = Object.assign({ min: band.min, max: band.max, enabled: on }, patch);
      band = { min: cur.min, max: cur.max };
      on = cur.enabled;
      App.store.updateSettings({ comfortBand: { min: cur.min, max: cur.max, enabled: cur.enabled } });
    }

    /* Schalter */
    var sw = settingRow(I.t("ins.set.bandOn"), I.t("ins.set.bandOnHint"), "switch");
    var label = D.el("label.switch");
    var input = D.el("input", { type: "checkbox", checked: on, "aria-labelledby": sw.labelId, "aria-describedby": sw.hintId });
    label.appendChild(input);
    label.appendChild(D.el("span.track"));
    sw.ctl.appendChild(label);
    sw.row.addEventListener("click", function (e) {
      if (e.target.closest("label, button, a, input")) return;
      input.click();
    });
    sec.body.appendChild(sw.row);

    /* Spanne: zwei Felder wie die Standard-Mittagspause */
    var rg = settingRow(I.t("ins.set.band"), I.t("ins.set.bandHint"), "value");
    rg.row.classList.add("is-range");
    rg.ctl.classList.add("time-range");
    var minIn = D.el("input.input.mono.num", { type: "text", inputmode: "text", autocomplete: "off", value: App.fmtSigned(band.min), "aria-label": I.t("ins.set.bandMin"), "aria-describedby": rg.hintId });
    var maxIn = D.el("input.input.mono.num", { type: "text", inputmode: "text", autocomplete: "off", value: App.fmtSigned(band.max), "aria-label": I.t("ins.set.bandMax"), "aria-describedby": rg.hintId });
    var err = D.el("div.row-error", { role: "status" });
    function commit(which) {
      var a = readSigned(minIn.value), b = readSigned(maxIn.value);
      var LIM = 500 * 60;
      if (a !== null) a = Math.max(-LIM, Math.min(LIM, a));
      if (b !== null) b = Math.max(-LIM, Math.min(LIM, b));
      if (a === null || b === null || !(a < b)) {
        err.textContent = a !== null && b !== null ? I.t("ins.set.bandErr") : "";
        flash(which);
        if (a === null) minIn.value = App.fmtSigned(band.min);
        if (b === null) maxIn.value = App.fmtSigned(band.max);
        return;
      }
      err.textContent = "";
      if (a !== band.min || b !== band.max) save({ min: a, max: b });
      minIn.value = App.fmtSigned(band.min);
      maxIn.value = App.fmtSigned(band.max);
    }
    minIn.addEventListener("change", function () { commit(minIn); });
    maxIn.addEventListener("change", function () { commit(maxIn); });
    rg.ctl.appendChild(minIn);
    rg.ctl.appendChild(D.el("span.range-dash", { text: "…", "aria-hidden": "true" }));
    rg.ctl.appendChild(maxIn);
    rg.info.appendChild(err);
    sec.body.appendChild(rg.row);
    function sync() {
      rg.row.classList.toggle("is-off", !on);
      minIn.disabled = !on;
      maxIn.disabled = !on;
    }
    input.addEventListener("change", function () { save({ enabled: input.checked }); sync(); });
    sync();

    /* Homeoffice-Grenze in Prozent, leer = keine */
    var ho = settingRow(I.t("ins.set.home"), I.t("ins.set.homeHint"), "value");
    var wrap = D.el("div.input-wrap");
    var cur = X.homeLimit(s.homeOfficeMaxPercent);
    var hoIn = D.el("input.input.mono.num", {
      type: "text", inputmode: "numeric", autocomplete: "off", value: cur === null ? "" : String(cur),
      "aria-labelledby": ho.labelId, "aria-describedby": ho.hintId, placeholder: "–"
    });
    hoIn.addEventListener("change", function () {
      var raw = String(hoIn.value).trim().replace("%", "");
      if (!raw) {
        App.store.updateSettings({ homeOfficeMaxPercent: null });
        return;
      }
      var n = +raw.replace(",", ".");
      var v = isFinite(n) ? X.homeLimit(Math.max(1, Math.min(100, n))) : null;
      if (v === null) { hoIn.value = cur === null ? "" : String(cur); flash(wrap); return; }
      if (v !== n) flash(wrap);
      cur = v;
      hoIn.value = String(v);
      App.store.updateSettings({ homeOfficeMaxPercent: v });
    });
    wrap.appendChild(hoIn);
    wrap.appendChild(D.el("span.suffix", { text: "%", "aria-hidden": "true" }));
    ho.ctl.appendChild(wrap);
    sec.body.appendChild(ho.row);

    sec.body.appendChild(D.el("p.card-foot", { text: I.t("ins.set.foot") }));
    host.appendChild(sec.node);
  }

  ZK.Ext.register("settings.sections", { id: "insights", order: 10, render: renderSettings });
})(typeof self !== "undefined" ? self : this);
