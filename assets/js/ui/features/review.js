/* ==========================================================================
   ZEITKONTO — Zusatz „Jahresrückblick“ und „Momente“
   --------------------------------------------------------------------------
   Rückblick: ein Story-Dialog mit bis zu neun Karten — Stunden, Rhythmus,
   Serie, Lieblingstag, stärkster Monat, Arbeitsort, Ferien & Brücken,
   Zeitkonto. Blättern per Tippen (links zurück, sonst weiter), Wischen,
   Pfeiltasten oder Knöpfen; automatisch weiter nur auf Wunsch. Jede Karte
   lässt sich als Bild teilen (selbst gezeichnet, ohne Bibliothek), der
   ganze Rückblick als Text kopieren — nur Zahlen, keine Notizen, keine
   Namen, keine Krankheitstage.

   Momente: höchstens eine kurze Zeile auf „Heute“ bei besonderen Anlässen.
   Wegklicken gilt für den Anlass, und für den Rest des Tages bleibt es
   still. Ausschalten in den Einstellungen (settings.moments).

   Alle Zahlen kommen aus ZK.Review (core/review.js) und damit aus der
   Engine — dieselben Definitionen wie in der Statistik.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n, RV = ZK.Review;
  if (!ZK.Ext || !RV || !D || !I || !T) return;

  I.add({
    de: {
      "rv.yourYear": "Dein Jahr",
      "rv.dialog": "Jahresrückblick {year}",
      "rv.year": "Jahr",
      "rv.prev": "Zurück",
      "rv.next": "Weiter",
      "rv.autoplay": "Automatisch weiterblättern",
      "rv.shareImage": "Als Bild teilen",
      "rv.shareShort": "Bild teilen",
      "rv.copyText": "Als Text kopieren",
      "rv.copyShort": "Text",
      "rv.copied": "Rückblick als Text kopiert",
      "rv.copyFailed": "Kopieren nicht möglich",
      "rv.saved": "Bild gespeichert",
      "rv.shareFailed": "Bild konnte nicht erstellt werden",
      "rv.hint": "Tippen, wischen oder Pfeiltasten",
      "rv.slide": "Karte",
      "rv.slideOf": "{i} von {n}",
      "rv.k.intro": "Jahresrückblick",
      "rv.k.hours": "Stunden",
      "rv.k.rhythm": "Rhythmus",
      "rv.k.streak": "Serie",
      "rv.k.weekday": "Lieblingstag",
      "rv.k.month": "Stärkster Monat",
      "rv.k.place": "Arbeitsort",
      "rv.k.vacation": "Ferien & Brücken",
      "rv.k.balance": "Zeitkonto",
      "rv.intro.lead": "Dein Arbeitsjahr in Bildern: Stunden, Rhythmus, längste Serie, beste Brücke.",
      "rv.intro.days": "{n} erfasste Tage",
      "rv.intro.days.one": "1 erfasster Tag",
      "rv.intro.empty": "Für {year} ist noch nichts erfasst.",
      "rv.hours.unit": "Stunden",
      "rv.hours.lead": "netto gearbeitet an {n} Tagen",
      "rv.hours.lead.one": "netto gearbeitet an 1 Tag",
      "rv.hours.avg": "Ø pro Tag",
      "rv.hours.lugano": "Als Zugfahrt ab Luzern: {n}-mal nach Lugano – je knapp zwei Stunden.",
      "rv.hours.lugano.one": "Als Zugfahrt ab Luzern: einmal nach Lugano – knapp zwei Stunden.",
      "rv.rhythm.lead": "dein typischer Tag (Ø Beginn und Feierabend)",
      "rv.rhythm.earliest": "Frühester Start",
      "rv.rhythm.latest": "Spätester Feierabend",
      "rv.rhythm.longest": "Längster Tag",
      "rv.rhythm.early": "{n}-mal vor 7 Uhr gestartet – ein echter Morgenmensch.",
      "rv.rhythm.late": "{n}-mal nach 19 Uhr Feierabend – die Nachteulen lassen grüssen.",
      "rv.rhythm.steady": "Nie vor 7, nie nach 19 Uhr – schön im Takt.",
      "rv.streak.unit": "Arbeitstage in Folge",
      "rv.streak.unit.one": "Arbeitstag",
      "rv.streak.lead": "lückenlos erfasst, {from} bis {to}",
      "rv.streak.weeks": "Das sind rund {n} Arbeitswochen ohne Lücke.",
      "rv.streak.note": "Freie Tage und Feiertage unterbrechen keine Serie.",
      "rv.weekday.lead": "Da gibst du am meisten: Ø {v} netto.",
      "rv.weekday.short": "Am kürzesten: {day} mit Ø {v}.",
      "rv.month.lead": "{v} gearbeitet · Saldo {b}",
      "rv.month.avg": "Im Schnitt {v} pro gearbeiteten Monat.",
      "rv.place.unit": "im Homeoffice",
      "rv.place.lead": "{n} von {m} Arbeitstagen",
      "rv.place.saved": "{n} Arbeitswege gespart.",
      "rv.place.saved.one": "1 Arbeitsweg gespart.",
      "rv.place.onsite": "Treu vor Ort: {n} Tage im Betrieb.",
      "rv.vac.unit": "Ferientage bezogen",
      "rv.vac.unit.one": "Ferientag bezogen",
      "rv.vac.lead": "von {total} Tagen Anspruch",
      "rv.vac.leadPlanned": "von {total} Tagen Anspruch · {planned} geplant",
      "rv.vac.bridge": "Beste Brücke",
      "rv.vac.block": "Bester Ferienblock",
      "rv.vac.ratio": "{r} freie Tage pro Ferientag – gut geplant.",
      "rv.bal.leadPartial": "abgerechnet, Stand {date}",
      "rv.bal.leadYear": "abgerechnet am 31. Dezember",
      "rv.bal.start": "Jahresbeginn",
      "rv.bal.delta": "Dieses Jahr",
      "rv.bal.plus": "Das sind rund {n} freie Tage auf Vorrat.",
      "rv.bal.minus": "Rund {n} Tage bis ±0 – kein Grund zur Eile.",
      "rv.bal.even": "Punktlandung – fast genau auf null.",
      "rv.entry.title": "Dein Jahr {year}",
      "rv.entry.text": "Dein Arbeitsjahr in Bildern: Stunden, Rhythmus, längste Serie, beste Brücke. Zum Schmunzeln und Teilen.",
      "rv.entry.open": "Ansehen",
      "rv.cmd": "Jahresrückblick {year}",
      "rv.cmdSub": "Dein Arbeitsjahr in Bildern",
      "rv.text.head": "Mein Arbeitsjahr {year} ({asOf})",
      "rv.text.hours": "{h} Stunden netto an {n} Tagen (Ø {avg})",
      "rv.text.rhythm": "Typischer Tag {span} · längster Tag {long}",
      "rv.text.streak": "Längste Serie: {n} Arbeitstage in Folge",
      "rv.text.weekday": "Lieblingstag: {day} (Ø {v})",
      "rv.text.month": "Stärkster Monat: {month} ({v})",
      "rv.text.place": "Homeoffice: {p}",
      "rv.text.vacation": "Ferien: {n} Tage bezogen",
      "rv.text.balance": "Zeitkonto: {v}",
      "rv.text.foot": "Erstellt mit Zeitkonto",
      "rv.m.vacation": "Noch {n} Arbeitstage bis zu den Ferien",
      "rv.m.vacation.one": "Noch 1 Arbeitstag bis zu den Ferien",
      "rv.m.vacationLast": "Letzter Arbeitstag vor den Ferien – schöne Ferien!",
      "rv.m.weekend": "Langes Wochenende in Sicht: {n} freie Tage ab {day}",
      "rv.m.weekendHoliday": "Langes Wochenende in Sicht: {n} freie Tage ab {day} ({name})",
      "rv.m.bridge": "Brückentag in Sicht: Mit 1 Ferientag am {date} werden es {n} freie Tage",
      "rv.m.bridgeHoliday": "Brückentag in Sicht: Mit 1 Ferientag am {date} werden es {n} freie Tage ({name})",
      "rv.m.month": "Neuer Monat – {month} endete mit {v}",
      "rv.m.record": "Neuer Rekord: {n} Arbeitstage in Folge erfasst",
      "rv.m.hide": "Ausblenden",
      "rv.set.title": "Momente",
      "rv.set.show": "Momente anzeigen",
      "rv.set.hint": "Höchstens eine kurze Zeile auf „Heute“: Ferien-Countdown, langes Wochenende, neuer Monat, persönlicher Rekord.",
      "rv.set.review": "Jahresrückblick ansehen"
    },
    en: {
      "rv.yourYear": "Your year",
      "rv.dialog": "Year in review {year}",
      "rv.year": "Year",
      "rv.prev": "Previous",
      "rv.next": "Next",
      "rv.autoplay": "Advance automatically",
      "rv.shareImage": "Share as image",
      "rv.shareShort": "Share image",
      "rv.copyText": "Copy as text",
      "rv.copyShort": "Text",
      "rv.copied": "Review copied as text",
      "rv.copyFailed": "Couldn’t copy",
      "rv.saved": "Image saved",
      "rv.shareFailed": "Couldn’t create the image",
      "rv.hint": "Tap, swipe or use the arrow keys",
      "rv.slide": "Card",
      "rv.slideOf": "{i} of {n}",
      "rv.k.intro": "Year in review",
      "rv.k.hours": "Hours",
      "rv.k.rhythm": "Rhythm",
      "rv.k.streak": "Streak",
      "rv.k.weekday": "Favourite day",
      "rv.k.month": "Busiest month",
      "rv.k.place": "Workplace",
      "rv.k.vacation": "Vacation & bridges",
      "rv.k.balance": "Time account",
      "rv.intro.lead": "Your working year in pictures: hours, rhythm, longest streak, best bridge.",
      "rv.intro.days": "{n} days recorded",
      "rv.intro.days.one": "1 day recorded",
      "rv.intro.empty": "Nothing recorded for {year} yet.",
      "rv.hours.unit": "hours",
      "rv.hours.lead": "worked net on {n} days",
      "rv.hours.lead.one": "worked net on 1 day",
      "rv.hours.avg": "Avg. per day",
      "rv.hours.lugano": "By train from Lucerne: {n} trips to Lugano, just under two hours each.",
      "rv.hours.lugano.one": "By train from Lucerne: one trip to Lugano, just under two hours.",
      "rv.rhythm.lead": "your typical day (average start and finish)",
      "rv.rhythm.earliest": "Earliest start",
      "rv.rhythm.latest": "Latest finish",
      "rv.rhythm.longest": "Longest day",
      "rv.rhythm.early": "Started before 7 a.m. {n} times – a true early bird.",
      "rv.rhythm.late": "Finished after 7 p.m. {n} times – the night owls say hi.",
      "rv.rhythm.steady": "Never before 7, never after 7 p.m. – nicely in rhythm.",
      "rv.streak.unit": "working days in a row",
      "rv.streak.unit.one": "working day",
      "rv.streak.lead": "recorded without a gap, {from} to {to}",
      "rv.streak.weeks": "That’s about {n} working weeks without a gap.",
      "rv.streak.note": "Days off and public holidays don’t break a streak.",
      "rv.weekday.lead": "Your strongest day: {v} net on average.",
      "rv.weekday.short": "Shortest: {day}, {v} on average.",
      "rv.month.lead": "{v} worked · balance {b}",
      "rv.month.avg": "On average {v} per working month.",
      "rv.place.unit": "from home",
      "rv.place.lead": "{n} of {m} working days",
      "rv.place.saved": "{n} commutes saved.",
      "rv.place.saved.one": "1 commute saved.",
      "rv.place.onsite": "Always on site: {n} days.",
      "rv.vac.unit": "vacation days taken",
      "rv.vac.unit.one": "vacation day taken",
      "rv.vac.lead": "of {total} days entitlement",
      "rv.vac.leadPlanned": "of {total} days entitlement · {planned} planned",
      "rv.vac.bridge": "Best bridge",
      "rv.vac.block": "Best vacation block",
      "rv.vac.ratio": "{r} days off per vacation day – well planned.",
      "rv.bal.leadPartial": "settled, as of {date}",
      "rv.bal.leadYear": "settled on 31 December",
      "rv.bal.start": "Start of year",
      "rv.bal.delta": "This year",
      "rv.bal.plus": "That’s about {n} days off in the bank.",
      "rv.bal.minus": "About {n} days to get back to ±0 – no rush.",
      "rv.bal.even": "Spot on – almost exactly zero.",
      "rv.entry.title": "Your year {year}",
      "rv.entry.text": "Your working year in pictures: hours, rhythm, longest streak, best bridge. To smile at and share.",
      "rv.entry.open": "View",
      "rv.cmd": "Year in review {year}",
      "rv.cmdSub": "Your working year in pictures",
      "rv.text.head": "My working year {year} ({asOf})",
      "rv.text.hours": "{h} hours net on {n} days (avg. {avg})",
      "rv.text.rhythm": "Typical day {span} · longest day {long}",
      "rv.text.streak": "Longest streak: {n} working days in a row",
      "rv.text.weekday": "Favourite day: {day} (avg. {v})",
      "rv.text.month": "Busiest month: {month} ({v})",
      "rv.text.place": "Working from home: {p}",
      "rv.text.vacation": "Vacation: {n} days taken",
      "rv.text.balance": "Time account: {v}",
      "rv.text.foot": "Made with Zeitkonto",
      "rv.m.vacation": "{n} more working days until your vacation",
      "rv.m.vacation.one": "1 more working day until your vacation",
      "rv.m.vacationLast": "Last working day before your vacation – enjoy!",
      "rv.m.weekend": "Long weekend ahead: {n} days off from {day}",
      "rv.m.weekendHoliday": "Long weekend ahead: {n} days off from {day} ({name})",
      "rv.m.bridge": "Bridge day ahead: 1 vacation day on {date} makes {n} days off",
      "rv.m.bridgeHoliday": "Bridge day ahead: 1 vacation day on {date} makes {n} days off ({name})",
      "rv.m.month": "New month – {month} ended at {v}",
      "rv.m.record": "New record: {n} working days in a row recorded",
      "rv.m.hide": "Hide",
      "rv.set.title": "Moments",
      "rv.set.show": "Show moments",
      "rv.set.hint": "At most one short line on “Today”: vacation countdown, long weekend, new month, personal record.",
      "rv.set.review": "View year in review"
    },
    fr: {
      "rv.yourYear": "Votre année",
      "rv.dialog": "Bilan de l’année {year}",
      "rv.year": "Année",
      "rv.prev": "Précédent",
      "rv.next": "Suivant",
      "rv.autoplay": "Défilement automatique",
      "rv.shareImage": "Partager en image",
      "rv.shareShort": "Partager",
      "rv.copyText": "Copier en texte",
      "rv.copyShort": "Texte",
      "rv.copied": "Bilan copié en texte",
      "rv.copyFailed": "Impossible de copier",
      "rv.saved": "Image enregistrée",
      "rv.shareFailed": "Impossible de créer l’image",
      "rv.hint": "Touchez, balayez ou utilisez les flèches",
      "rv.slide": "Carte",
      "rv.slideOf": "{i} sur {n}",
      "rv.k.intro": "Bilan annuel",
      "rv.k.hours": "Heures",
      "rv.k.rhythm": "Rythme",
      "rv.k.streak": "Série",
      "rv.k.weekday": "Jour préféré",
      "rv.k.month": "Mois le plus chargé",
      "rv.k.place": "Lieu de travail",
      "rv.k.vacation": "Vacances & ponts",
      "rv.k.balance": "Compte temps",
      "rv.intro.lead": "Votre année de travail en images : heures, rythme, plus longue série, meilleur pont.",
      "rv.intro.days": "{n} jours saisis",
      "rv.intro.days.one": "1 jour saisi",
      "rv.intro.empty": "Rien n’est encore saisi pour {year}.",
      "rv.hours.unit": "heures",
      "rv.hours.lead": "de travail net sur {n} jours",
      "rv.hours.lead.one": "de travail net sur 1 jour",
      "rv.hours.avg": "Ø par jour",
      "rv.hours.lugano": "En train depuis Lucerne : {n} fois Lugano, un peu moins de deux heures par trajet.",
      "rv.hours.lugano.one": "En train depuis Lucerne : une fois Lugano, un peu moins de deux heures.",
      "rv.rhythm.lead": "votre journée type (début et fin moyens)",
      "rv.rhythm.earliest": "Début le plus tôt",
      "rv.rhythm.latest": "Fin la plus tardive",
      "rv.rhythm.longest": "Journée la plus longue",
      "rv.rhythm.early": "{n} débuts avant 7 h – l’aube vous connaît bien.",
      "rv.rhythm.late": "{n} fins après 19 h – les oiseaux de nuit vous saluent.",
      "rv.rhythm.steady": "Jamais avant 7 h, jamais après 19 h – bien en rythme.",
      "rv.streak.unit": "jours de travail d’affilée",
      "rv.streak.unit.one": "jour de travail",
      "rv.streak.lead": "saisis sans interruption, du {from} au {to}",
      "rv.streak.weeks": "Soit environ {n} semaines de travail sans trou.",
      "rv.streak.note": "Les jours libres et fériés n’interrompent pas une série.",
      "rv.weekday.lead": "Votre jour le plus intense : {v} net en moyenne.",
      "rv.weekday.short": "Le plus court : {day}, {v} en moyenne.",
      "rv.month.lead": "{v} travaillées · solde {b}",
      "rv.month.avg": "En moyenne {v} par mois travaillé.",
      "rv.place.unit": "en télétravail",
      "rv.place.lead": "{n} jours sur {m} jours travaillés",
      "rv.place.saved": "{n} trajets domicile-travail économisés.",
      "rv.place.saved.one": "1 trajet domicile-travail économisé.",
      "rv.place.onsite": "Fidèle au poste : {n} jours sur site.",
      "rv.vac.unit": "jours de vacances pris",
      "rv.vac.unit.one": "jour de vacances pris",
      "rv.vac.lead": "sur {total} jours de droit",
      "rv.vac.leadPlanned": "sur {total} jours de droit · {planned} prévus",
      "rv.vac.bridge": "Meilleur pont",
      "rv.vac.block": "Meilleur bloc de vacances",
      "rv.vac.ratio": "{r} jours libres par jour de vacances – bien joué.",
      "rv.bal.leadPartial": "décompté, état au {date}",
      "rv.bal.leadYear": "décompté au 31 décembre",
      "rv.bal.start": "Début d’année",
      "rv.bal.delta": "Cette année",
      "rv.bal.plus": "Soit environ {n} jours de congé en réserve.",
      "rv.bal.minus": "Environ {n} jours jusqu’à ±0 – rien ne presse.",
      "rv.bal.even": "Atterrissage parfait – presque pile à zéro.",
      "rv.entry.title": "Votre année {year}",
      "rv.entry.text": "Votre année de travail en images : heures, rythme, plus longue série, meilleur pont. De quoi sourire et partager.",
      "rv.entry.open": "Voir",
      "rv.cmd": "Bilan de l’année {year}",
      "rv.cmdSub": "Votre année de travail en images",
      "rv.text.head": "Mon année de travail {year} ({asOf})",
      "rv.text.hours": "{h} heures nettes sur {n} jours (Ø {avg})",
      "rv.text.rhythm": "Journée type {span} · journée la plus longue {long}",
      "rv.text.streak": "Plus longue série : {n} jours de travail d’affilée",
      "rv.text.weekday": "Jour préféré : {day} (Ø {v})",
      "rv.text.month": "Mois le plus chargé : {month} ({v})",
      "rv.text.place": "Télétravail : {p}",
      "rv.text.vacation": "Vacances : {n} jours pris",
      "rv.text.balance": "Compte temps : {v}",
      "rv.text.foot": "Créé avec Zeitkonto",
      "rv.m.vacation": "Encore {n} jours de travail avant les vacances",
      "rv.m.vacation.one": "Encore 1 jour de travail avant les vacances",
      "rv.m.vacationLast": "Dernier jour de travail avant les vacances – bonnes vacances !",
      "rv.m.weekend": "Long week-end en vue : {n} jours libres dès {day}",
      "rv.m.weekendHoliday": "Long week-end en vue : {n} jours libres dès {day} ({name})",
      "rv.m.bridge": "Pont en vue : avec 1 jour de vacances le {date}, vous avez {n} jours libres",
      "rv.m.bridgeHoliday": "Pont en vue : avec 1 jour de vacances le {date}, vous avez {n} jours libres ({name})",
      "rv.m.month": "Nouveau mois – {month} s’est terminé à {v}",
      "rv.m.record": "Nouveau record : {n} jours de travail saisis d’affilée",
      "rv.m.hide": "Masquer",
      "rv.set.title": "Moments",
      "rv.set.show": "Afficher les moments",
      "rv.set.hint": "Au plus une courte ligne sur « Aujourd’hui » : compte à rebours des vacances, long week-end, nouveau mois, record personnel.",
      "rv.set.review": "Voir le bilan de l’année"
    },
    it: {
      "rv.yourYear": "Il tuo anno",
      "rv.dialog": "Riepilogo dell’anno {year}",
      "rv.year": "Anno",
      "rv.prev": "Indietro",
      "rv.next": "Avanti",
      "rv.autoplay": "Avanzamento automatico",
      "rv.shareImage": "Condividi come immagine",
      "rv.shareShort": "Condividi",
      "rv.copyText": "Copia come testo",
      "rv.copyShort": "Testo",
      "rv.copied": "Riepilogo copiato come testo",
      "rv.copyFailed": "Copia non riuscita",
      "rv.saved": "Immagine salvata",
      "rv.shareFailed": "Impossibile creare l’immagine",
      "rv.hint": "Tocca, scorri o usa le frecce",
      "rv.slide": "Scheda",
      "rv.slideOf": "{i} di {n}",
      "rv.k.intro": "Riepilogo annuale",
      "rv.k.hours": "Ore",
      "rv.k.rhythm": "Ritmo",
      "rv.k.streak": "Serie",
      "rv.k.weekday": "Giorno preferito",
      "rv.k.month": "Mese più intenso",
      "rv.k.place": "Luogo di lavoro",
      "rv.k.vacation": "Vacanze & ponti",
      "rv.k.balance": "Conto orario",
      "rv.intro.lead": "Il tuo anno di lavoro in immagini: ore, ritmo, serie più lunga, ponte migliore.",
      "rv.intro.days": "{n} giorni registrati",
      "rv.intro.days.one": "1 giorno registrato",
      "rv.intro.empty": "Per il {year} non c’è ancora nulla di registrato.",
      "rv.hours.unit": "ore",
      "rv.hours.lead": "di lavoro netto in {n} giorni",
      "rv.hours.lead.one": "di lavoro netto in 1 giorno",
      "rv.hours.avg": "Ø al giorno",
      "rv.hours.lugano": "In treno da Lucerna: {n} volte fino a Lugano, poco meno di due ore a tratta.",
      "rv.hours.lugano.one": "In treno da Lucerna: una volta fino a Lugano, poco meno di due ore.",
      "rv.rhythm.lead": "la tua giornata tipo (inizio e fine medi)",
      "rv.rhythm.earliest": "Inizio più presto",
      "rv.rhythm.latest": "Fine più tarda",
      "rv.rhythm.longest": "Giornata più lunga",
      "rv.rhythm.early": "{n} volte al lavoro prima delle 7: l’alba ti conosce bene.",
      "rv.rhythm.late": "{n} volte finito dopo le 19: i gufi ti salutano.",
      "rv.rhythm.steady": "Mai prima delle 7, mai dopo le 19: ritmo perfetto.",
      "rv.streak.unit": "giorni lavorativi di fila",
      "rv.streak.unit.one": "giorno lavorativo",
      "rv.streak.lead": "registrati senza interruzioni, dal {from} al {to}",
      "rv.streak.weeks": "Circa {n} settimane lavorative senza buchi.",
      "rv.streak.note": "Giorni liberi e festivi non interrompono la serie.",
      "rv.weekday.lead": "Il tuo giorno più intenso: in media {v} netti.",
      "rv.weekday.short": "Il più corto: {day}, in media {v}.",
      "rv.month.lead": "{v} lavorate · saldo {b}",
      "rv.month.avg": "In media {v} per mese lavorato.",
      "rv.place.unit": "in telelavoro",
      "rv.place.lead": "{n} giorni su {m} lavorati",
      "rv.place.saved": "{n} tragitti casa-lavoro risparmiati.",
      "rv.place.saved.one": "1 tragitto casa-lavoro risparmiato.",
      "rv.place.onsite": "Sempre presente: {n} giorni in sede.",
      "rv.vac.unit": "giorni di vacanza presi",
      "rv.vac.unit.one": "giorno di vacanza preso",
      "rv.vac.lead": "su {total} giorni di diritto",
      "rv.vac.leadPlanned": "su {total} giorni di diritto · {planned} pianificati",
      "rv.vac.bridge": "Ponte migliore",
      "rv.vac.block": "Blocco di vacanze migliore",
      "rv.vac.ratio": "{r} giorni liberi per giorno di vacanza: ben pianificato.",
      "rv.bal.leadPartial": "conteggiato, stato al {date}",
      "rv.bal.leadYear": "conteggiato al 31 dicembre",
      "rv.bal.start": "Inizio anno",
      "rv.bal.delta": "Quest’anno",
      "rv.bal.plus": "Sono circa {n} giorni liberi in riserva.",
      "rv.bal.minus": "Circa {n} giorni per tornare a ±0: nessuna fretta.",
      "rv.bal.even": "Atterraggio perfetto: quasi esattamente a zero.",
      "rv.entry.title": "Il tuo anno {year}",
      "rv.entry.text": "Il tuo anno di lavoro in immagini: ore, ritmo, serie più lunga, ponte migliore. Da sorridere e condividere.",
      "rv.entry.open": "Guarda",
      "rv.cmd": "Riepilogo dell’anno {year}",
      "rv.cmdSub": "Il tuo anno di lavoro in immagini",
      "rv.text.head": "Il mio anno di lavoro {year} ({asOf})",
      "rv.text.hours": "{h} ore nette in {n} giorni (Ø {avg})",
      "rv.text.rhythm": "Giornata tipo {span} · giornata più lunga {long}",
      "rv.text.streak": "Serie più lunga: {n} giorni lavorativi di fila",
      "rv.text.weekday": "Giorno preferito: {day} (Ø {v})",
      "rv.text.month": "Mese più intenso: {month} ({v})",
      "rv.text.place": "Telelavoro: {p}",
      "rv.text.vacation": "Vacanze: {n} giorni presi",
      "rv.text.balance": "Conto orario: {v}",
      "rv.text.foot": "Creato con Zeitkonto",
      "rv.m.vacation": "Ancora {n} giorni lavorativi alle vacanze",
      "rv.m.vacation.one": "Ancora 1 giorno lavorativo alle vacanze",
      "rv.m.vacationLast": "Ultimo giorno di lavoro prima delle vacanze: buone vacanze!",
      "rv.m.weekend": "Lungo weekend in vista: {n} giorni liberi da {day}",
      "rv.m.weekendHoliday": "Lungo weekend in vista: {n} giorni liberi da {day} ({name})",
      "rv.m.bridge": "Ponte in vista: con 1 giorno di vacanza il {date} hai {n} giorni liberi",
      "rv.m.bridgeHoliday": "Ponte in vista: con 1 giorno di vacanza il {date} hai {n} giorni liberi ({name})",
      "rv.m.month": "Nuovo mese: {month} si è chiuso a {v}",
      "rv.m.record": "Nuovo record: {n} giorni lavorativi registrati di fila",
      "rv.m.hide": "Nascondi",
      "rv.set.title": "Momenti",
      "rv.set.show": "Mostra i momenti",
      "rv.set.hint": "Al massimo una breve riga in «Oggi»: conto alla rovescia per le vacanze, lungo weekend, nuovo mese, record personale.",
      "rv.set.review": "Vedi il riepilogo dell’anno"
    }
  });

  /* Automatisch weiter: lang genug, um eine Karte in Ruhe zu lesen. */
  var AUTO_MS = 6500;
  var PAUSE_ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  var RINGS = '<i></i><i></i><i></i><i></i>';

  /* -------------------------------------------------------------------- */
  /* Zwischenspeicher je Datenstand und Minute                             */
  /* -------------------------------------------------------------------- */
  var memo = { key: "", data: {} };
  function cached(App, name, fn) {
    var rev = App.dataRevision ? App.dataRevision() : "";
    var key = rev + "|" + T.todayISO() + "|" + Math.floor(Date.now() / 60000);
    if (memo.key !== key) memo = { key: key, data: {} };
    if (!Object.prototype.hasOwnProperty.call(memo.data, name)) memo.data[name] = fn();
    return memo.data[name];
  }
  function yearsOf(App) {
    return cached(App, "years", function () { return RV.yearsWithData(App.store.allDays(), App.settings()); });
  }
  function statsOf(App, year) {
    return cached(App, "y" + year, function () { return RV.yearStats(App.store.allDays(), App.settings(), year); });
  }
  function daysIn(App, year) {
    var hit = yearsOf(App).filter(function (y) { return y.year === year; })[0];
    return hit ? hit.days : 0;
  }

  /**
   * Welches Jahr die Statistik anbietet: das laufende, sobald es genug
   * Tage hat (ab 1. Dezember hervorgehoben); im Januar und Februar, solange
   * das neue Jahr noch dünn ist, das vergangene.
   */
  function entryYear(App) {
    var today = T.todayISO();
    var y = T.yearOf(today);
    if (daysIn(App, y) >= RV.MIN_DAYS) return { year: y, hot: today >= y + "-12-01" };
    if (today < y + "-03-01" && daysIn(App, y - 1) >= RV.MIN_DAYS) return { year: y - 1, hot: true };
    return null;
  }

  function defaultYear(App) {
    var e = entryYear(App);
    if (e) return e.year;
    var ys = yearsOf(App);
    return ys.length ? ys[0].year : T.yearOf(T.todayISO());
  }

  /* -------------------------------------------------------------------- */
  /* Formatierung                                                          */
  /* -------------------------------------------------------------------- */
  var nfCache = {};
  function num(v, digits) {
    var key = I.getLang() + "|" + (digits || 0);
    try {
      if (!nfCache[key]) nfCache[key] = new Intl.NumberFormat(I.locale(), { maximumFractionDigits: digits || 0 });
      return nfCache[key].format(v);
    } catch (e) { return String(v); }
  }
  /** Uhrzeit auf der Zeitachse: 30:00 → „06:00 (+1)“ — wie in der Statistik. */
  function clock(minutes) {
    if (minutes === null || minutes === undefined) return "–";
    var off = T.dayOffsetOf(minutes);
    return T.formatHHMM(minutes) + (off > 0 ? " (+" + off + ")" : "");
  }
  function capFirst(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function dayLabel(iso) { return I.formatDate(iso, { weekday: "short", day: "numeric", month: "short" }); }
  function dayMonth(iso) { return I.formatDate(iso, { day: "numeric", month: "long" }); }
  function pct(v) { return num(Math.round(v * 100)) + " %"; }
  function holidayName(App, iso) {
    if (!iso || !App.holiday) return "";
    var h = App.holiday(iso);
    return h ? ((h.names && h.names[I.getLang()]) || h.name || "") : "";
  }
  function periodLabel(st) {
    return st.partial ? I.t("stats.asOf", { date: dayMonth(st.until) }) : dayMonth(st.from) + " – " + dayMonth(st.to);
  }

  /* -------------------------------------------------------------------- */
  /* Kartenmodell — eine Quelle für Bildschirm, Bild und Text              */
  /* -------------------------------------------------------------------- */
  /*
     { id, tone, kicker, big, unit, lead, rows: [{label, value, sub}],
       box: {title, line, sub}, chart: {type: "bars"|"split", items},
       fun, count: {to, format}, text }
  */
  function buildCards(App, st) {
    var cards = [];
    var s = App.settings();

    cards.push({
      id: "intro", cover: true, kicker: I.t("rv.k.intro"), big: String(st.year),
      lead: st.empty ? I.t("rv.intro.empty", { year: st.year }) : I.t("rv.intro.lead"),
      meta: st.empty ? "" : I.tn("rv.intro.days", st.recordedDays, { n: num(st.recordedDays) }) + " · " + periodLabel(st),
      hint: I.t("rv.hint"),
      text: I.t("rv.text.head", { year: st.year, asOf: periodLabel(st) })
    });
    if (st.empty) return finish(cards);

    /* ---- Stunden ---- */
    if (st.workedDays > 0) {
      var hours = Math.round(st.totalNet / 60);
      cards.push({
        id: "hours", kicker: I.t("rv.k.hours"),
        big: num(hours), unit: I.t("rv.hours.unit"),
        count: { to: hours, format: function (v) { return num(Math.round(v)); } },
        lead: I.tn("rv.hours.lead", st.workedDays, { n: num(st.workedDays) }),
        rows: [{ label: I.t("rv.hours.avg"), value: App.fmt(st.avgNet) }],
        fun: st.compare.lugano >= 1 ? I.tn("rv.hours.lugano", st.compare.lugano, { n: num(st.compare.lugano) }) : "",
        text: I.t("rv.text.hours", { h: num(hours), n: num(st.workedDays), avg: App.fmt(st.avgNet) })
      });
    }

    /* ---- Rhythmus ---- */
    if (st.avgStart !== null && st.avgStart !== undefined) {
      var span = T.formatHHMM(st.avgStart) + (st.avgEnd !== null && st.avgEnd !== undefined ? "–" + clock(st.avgEnd) : "");
      var rows = [];
      if (st.earliest) rows.push({ label: I.t("rv.rhythm.earliest"), value: T.formatHHMM(st.earliest.minutes), sub: dayLabel(st.earliest.date) });
      if (st.latest) rows.push({ label: I.t("rv.rhythm.latest"), value: clock(st.latest.minutes), sub: dayLabel(st.latest.date) });
      if (st.longest) rows.push({ label: I.t("rv.rhythm.longest"), value: App.fmt(st.longest.minutes), sub: dayLabel(st.longest.date) });
      var enough = Math.max(3, Math.ceil(st.workedDays / 10));
      var fun = "";
      if (st.earlyStarts >= enough) fun = I.t("rv.rhythm.early", { n: num(st.earlyStarts) });
      else if (st.lateEnds >= enough) fun = I.t("rv.rhythm.late", { n: num(st.lateEnds) });
      else if (!st.earlyStarts && !st.lateEnds && st.workedDays >= 5) fun = I.t("rv.rhythm.steady");
      cards.push({
        id: "rhythm", kicker: I.t("rv.k.rhythm"), big: span,
        lead: I.t("rv.rhythm.lead"), rows: rows, fun: fun,
        text: I.t("rv.text.rhythm", { span: span, long: st.longest ? App.fmt(st.longest.minutes) : "–" })
      });
    }

    /* ---- Serie ---- */
    if (st.streak && st.streak.days >= 2) {
      var weeks = Math.floor(st.streak.days / 5);
      cards.push({
        id: "streak", kicker: I.t("rv.k.streak"),
        big: num(st.streak.days), unit: I.tn("rv.streak.unit", st.streak.days),
        count: { to: st.streak.days, format: function (v) { return num(Math.round(v)); } },
        lead: I.t("rv.streak.lead", { from: dayMonth(st.streak.from), to: dayMonth(st.streak.to) }),
        note: I.t("rv.streak.note"),
        fun: weeks >= 2 ? I.t("rv.streak.weeks", { n: num(weeks) }) : "",
        text: I.t("rv.text.streak", { n: num(st.streak.days) })
      });
    }

    /* ---- Lieblingstag ---- */
    if (st.favoriteWeekday) {
      var fav = st.favoriteWeekday;
      var order = s.firstDayOfWeek === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
      var favName = capFirst(I.weekdayName(fav.weekday, "long"));
      cards.push({
        id: "weekday", kicker: I.t("rv.k.weekday"), big: favName,
        lead: I.t("rv.weekday.lead", { v: App.fmt(fav.avg) }),
        chart: {
          type: "bars",
          items: order.filter(function (wd) { return st.weekdays[wd].count > 0; }).map(function (wd) {
            var w = st.weekdays[wd];
            return { label: I.weekdayName(wd, "short"), value: w.avg, hi: wd === fav.weekday, title: App.fmt(w.avg) };
          })
        },
        fun: st.shortestWeekday ? I.t("rv.weekday.short", {
          day: I.weekdayName(st.shortestWeekday.weekday, "long"), v: App.fmt(st.shortestWeekday.avg)
        }) : "",
        text: I.t("rv.text.weekday", { day: favName, v: App.fmt(fav.avg) })
      });
    }

    /* ---- Stärkster Monat ---- */
    if (st.busiestMonth) {
      var bm = st.busiestMonth;
      /* Schnitt nur über abgeschlossene Monate — der laufende ist erst angebrochen */
      var worked = st.months.filter(function (m) { return m.net > 0 && monthDone(st, m.month); });
      var avgMonth = worked.length ? Math.round(worked.reduce(function (a, m) { return a + m.net; }, 0) / worked.length) : 0;
      var monthName = capFirst(I.monthName(bm.month, "long"));
      cards.push({
        id: "month", kicker: I.t("rv.k.month"), big: monthName,
        lead: I.t("rv.month.lead", { v: App.fmt(bm.net), b: App.fmtSigned(bm.balance) }),
        chart: {
          type: "bars",
          items: st.months.map(function (m) {
            return { label: I.monthName(m.month, "narrow"), value: m.net, hi: m.month === bm.month, muted: m.future, title: App.fmt(m.net) };
          })
        },
        fun: worked.length >= 2 ? I.t("rv.month.avg", { v: App.fmt(avgMonth) }) : "",
        text: I.t("rv.text.month", { month: monthName, v: App.fmt(bm.net) })
      });
    }

    /* ---- Arbeitsort ---- Nur wenn es überhaupt Unterschiede gibt. */
    var loc = st.locations;
    if (st.workedDays > 0 && (loc.home || loc.field || loc.travel)) {
      cards.push({
        id: "place", kicker: I.t("rv.k.place"),
        big: pct(st.homeShare), unit: I.t("rv.place.unit"),
        count: { to: Math.round(st.homeShare * 100), format: function (v) { return num(Math.round(v)) + " %"; } },
        lead: I.t("rv.place.lead", { n: num(loc.home), m: num(st.workedDays) }),
        chart: {
          type: "split",
          items: ["office", "home", "field", "travel"].filter(function (k) { return loc[k] > 0; }).map(function (k) {
            return { key: k, label: I.t("loc." + k), value: loc[k] };
          })
        },
        fun: loc.home > 0 ? I.tn("rv.place.saved", loc.home, { n: num(loc.home) }) : I.t("rv.place.onsite", { n: num(loc.office) }),
        text: I.t("rv.text.place", { p: pct(st.homeShare) })
      });
    }

    /* ---- Ferien & Brücken ---- */
    if (st.vacationTaken > 0) {
      var vac = num(st.vacationTaken, 2);
      var b = st.bridge;
      var card = {
        id: "vacation", kicker: I.t("rv.k.vacation"),
        big: vac, unit: I.tn("rv.vac.unit", st.vacationTaken),
        lead: st.partial && st.vacationPlanned > 0
          ? I.t("rv.vac.leadPlanned", { total: num(st.vacationEntitlement, 2), planned: num(st.vacationPlanned, 2) })
          : I.t("rv.vac.lead", { total: num(st.vacationEntitlement, 2) }),
        text: I.t("rv.text.vacation", { n: vac })
      };
      if (b) {
        var names = b.holidays.map(function (iso) { return holidayName(App, iso); }).filter(Boolean);
        var uniq = names.filter(function (n, i) { return names.indexOf(n) === i; });
        card.box = {
          title: I.t(b.holidays.length ? "rv.vac.bridge" : "rv.vac.block"),
          line: I.tn("tools.bridgeHeadline", b.vacation, { v: num(b.vacation), t: num(b.days) }),
          sub: dayMonth(b.from) + " – " + dayMonth(b.to) + (uniq.length ? " · " + uniq.slice(0, 2).join(", ") : "")
        };
        if (b.ratio >= 2) card.fun = I.t("rv.vac.ratio", { r: num(b.ratio, 1) });
        card.text += " · " + card.box.title + ": " + card.box.line;
      }
      cards.push(card);
    }

    /* ---- Zeitkonto ---- */
    var bal = st.balanceEnd;
    var balFun;
    if (st.balanceDays < 0.5) balFun = I.t("rv.bal.even");
    else balFun = I.t(bal > 0 ? "rv.bal.plus" : "rv.bal.minus", { n: num(st.balanceDays, 1) });
    cards.push({
      id: "balance", kicker: I.t("rv.k.balance"),
      big: App.fmtSigned(bal),
      lead: st.partial ? I.t("rv.bal.leadPartial", { date: dayMonth(st.until) }) : I.t("rv.bal.leadYear"),
      rows: [
        { label: I.t("rv.bal.start"), value: App.fmtSigned(st.balanceStart) },
        { label: I.t("rv.bal.delta"), value: App.fmtSigned(st.balanceDelta) }
      ],
      fun: balFun,
      text: I.t("rv.text.balance", { v: App.fmtSigned(bal) })
    });

    return finish(cards);
  }

  /* Töne abwechselnd (tief, taupe, papier), die letzte Karte wieder tief. */
  function finish(cards) {
    var tones = ["a", "b", "c"];
    cards.forEach(function (c, i) { c.tone = tones[i % 3]; });
    if (cards.length > 1) {
      cards[cards.length - 1].tone = "a";
      if (cards[cards.length - 2].tone === "a") cards[cards.length - 2].tone = "c";
    }
    return cards;
  }

  function monthDone(st, m) {
    return T.endOfMonth(st.year + "-" + (m < 9 ? "0" : "") + (m + 1) + "-01") <= st.until &&
      !(st.partial && T.monthKey(st.until) === st.year + "-" + (m < 9 ? "0" : "") + (m + 1));
  }

  /** Ganzer Rückblick als Text — nur Zahlen. */
  function summaryText(cards) {
    var lines = [cards[0].text];
    cards.slice(1).forEach(function (c) { if (c.text) lines.push("• " + c.text); });
    lines.push("— " + I.t("rv.text.foot"));
    return lines.join("\n");
  }

  /* -------------------------------------------------------------------- */
  /* Karte zeichnen (Bildschirm)                                           */
  /* -------------------------------------------------------------------- */
  function cardNode(card, i, n, st) {
    var node = D.el("article.rv-card.tone-" + card.tone + (card.cover ? ".is-cover" : ""), {
      "data-card": card.id,
      "aria-roledescription": I.t("rv.slide"),
      "aria-label": I.t("rv.slideOf", { i: i + 1, n: n }) + ": " + card.kicker
    });
    node.appendChild(D.el("div.rv-rings.rv-rings-deco", { "aria-hidden": "true", html: RINGS }));
    node.appendChild(D.el("div.rv-kicker", { text: card.kicker }));

    var main = D.el("div.rv-main");
    if (card.cover) main.appendChild(D.el("div.rv-rings.rv-rings-hero", { "aria-hidden": "true", html: RINGS }));
    /* Die grosse Zahl zählt beim Erscheinen hoch — für Screenreader steht
       der Endwert daneben, damit die Live-Region keine Zwischenwerte vorliest. */
    main.appendChild(D.el("div.rv-big", { text: card.big, "aria-hidden": card.count ? "true" : null }));
    if (card.count) main.appendChild(D.el("span.rv-sr", { text: card.big }));
    if (card.unit) main.appendChild(D.el("div.rv-unit", { text: card.unit }));
    if (card.lead) main.appendChild(D.el("p.rv-lead", { text: card.lead }));
    if (card.meta) main.appendChild(D.el("p.rv-meta", { text: card.meta }));
    node.appendChild(main);

    if (card.chart) node.appendChild(chartNode(card.chart));
    if (card.box) {
      var box = D.el("div.rv-box");
      box.appendChild(D.el("span.rv-box-title", { text: card.box.title }));
      box.appendChild(D.el("strong", { text: card.box.line }));
      if (card.box.sub) box.appendChild(D.el("span.rv-box-sub", { text: card.box.sub }));
      node.appendChild(box);
    }
    if (card.rows && card.rows.length) {
      var dl = D.el("dl.rv-rows");
      card.rows.forEach(function (r) {
        var row = D.el("div");
        row.appendChild(D.el("dt", { text: r.label }));
        var dd = D.el("dd");
        dd.appendChild(D.el("b", { text: r.value }));
        if (r.sub) dd.appendChild(D.el("span", { text: r.sub }));
        row.appendChild(dd);
        dl.appendChild(row);
      });
      node.appendChild(dl);
    }
    if (card.fun) node.appendChild(D.el("p.rv-fun", { text: card.fun }));
    if (card.note) node.appendChild(D.el("p.rv-note", { text: card.note }));
    if (card.hint) node.appendChild(D.el("p.rv-hint", { text: card.hint }));

    var foot = D.el("div.rv-foot", { "aria-hidden": "true" });
    foot.innerHTML = '<span class="rv-mark"><span class="rv-rings rv-rings-mini">' + RINGS + "</span><b>ZEIT</b><span>KONTO</span></span>" +
      "<span>" + D.esc(String(st.year)) + "</span>";
    node.appendChild(foot);
    return node;
  }

  /* Die grosse Zahl bzw. das grosse Wort auf die Kartenbreite einpassen —
     Wochentage und Monatsnamen sind in jeder Sprache verschieden lang. */
  function fitBig(node) {
    var big = node && D.qs(".rv-big", node);
    if (!big || !big.parentNode) return;
    big.style.fontSize = "";
    if (!big.clientWidth) return;
    var size = parseFloat(root.getComputedStyle(big).fontSize) || 0;
    for (var guard = 0; guard < 24 && big.scrollWidth > big.clientWidth + 1 && size > 22; guard++) {
      size *= 0.93;
      big.style.fontSize = size.toFixed(1) + "px";
    }
  }

  function chartNode(chart) {
    var max = 0;
    chart.items.forEach(function (it) { if (it.value > max) max = it.value; });
    if (chart.type === "split") {
      var total = chart.items.reduce(function (a, it) { return a + it.value; }, 0) || 1;
      var wrap = D.el("div.rv-split");
      var bar = D.el("div.rv-split-bar", { "aria-hidden": "true" });
      var legend = D.el("ul.rv-legend");
      chart.items.forEach(function (it, k) {
        bar.appendChild(D.el("i.k" + k, { style: { width: (it.value / total * 100).toFixed(2) + "%" } }));
        var li = D.el("li");
        li.appendChild(D.el("i.k" + k, { "aria-hidden": "true" }));
        li.appendChild(D.el("span", { text: it.label }));
        li.appendChild(D.el("b", { text: num(it.value) }));
        legend.appendChild(li);
      });
      wrap.appendChild(bar);
      wrap.appendChild(legend);
      return wrap;
    }
    var bars = D.el("div.rv-bars", { "aria-hidden": "true", style: { "--n": chart.items.length } });
    chart.items.forEach(function (it) {
      var col = D.el("div.rv-bar" + (it.hi ? ".hi" : "") + (it.muted ? ".muted" : ""));
      var track = D.el("span.rv-bar-track");
      track.appendChild(D.el("i", { style: { height: (max > 0 ? Math.max(it.value > 0 ? 4 : 0, it.value / max * 100) : 0).toFixed(1) + "%" } }));
      col.appendChild(track);
      col.appendChild(D.el("span.rv-bar-label", { text: it.label }));
      bars.appendChild(col);
    });
    return bars;
  }

  /* -------------------------------------------------------------------- */
  /* Karte als Bild (Canvas, ohne Bibliothek)                              */
  /* -------------------------------------------------------------------- */
  /* Farben kommen aus den Tönen der Karte (views.css, --rv-*): dieselbe
     Quelle wie am Bildschirm, hell wie dunkel. */
  var FALLBACK = { bg1: "#3F3A35", bg2: "#2A2622", ink: "#FBFAF9", soft: "#DCD6D0", accent: "#C4BBB2", ring: "#6D655E", ringFill: "#857C74" };
  function colorsOf(el) {
    var out = {};
    var cs = el && root.getComputedStyle ? root.getComputedStyle(el) : null;
    Object.keys(FALLBACK).forEach(function (k) {
      var name = "--rv-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); });
      var v = cs ? cs.getPropertyValue(name).trim() : "";
      out[k] = v || FALLBACK[k];
    });
    return out;
  }
  function fontOf() {
    var f = root.getComputedStyle ? root.getComputedStyle(document.body).fontFamily : "";
    return f || "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  }

  function wrap(g, text, maxWidth) {
    var words = String(text || "").split(/\s+/);
    var lines = [];
    var line = "";
    words.forEach(function (w) {
      var probe = line ? line + " " + w : w;
      if (line && g.measureText(probe).width > maxWidth) { lines.push(line); line = w; }
      else line = probe;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawRings(g, x, y, r, lw, col, fill) {
    var gap = r * 0.42;
    for (var k = 0; k < 4; k++) {
      var cx = x + r + (k % 2) * (2 * r + gap);
      var cy = y + r + Math.floor(k / 2) * (2 * r + gap);
      g.beginPath();
      g.arc(cx, cy, r - lw / 2, 0, Math.PI * 2);
      if (k === 3) { g.fillStyle = fill; g.fill(); }
      g.lineWidth = lw;
      g.strokeStyle = k === 3 ? fill : col;
      g.stroke();
    }
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function alpha(color, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
    if (m) {
      var v = parseInt(m[1], 16);
      return "rgba(" + (v >> 16) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
    }
    var r = /^rgba?\(([^)]+)\)$/.exec(String(color).trim());
    if (r) {
      var p = r[1].split(/[ ,/]+/).filter(Boolean);
      return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
    }
    return color;
  }

  /**
   * Zeichnet eine Karte auf 1080 × 1350 (4:5 — passt in Chats und Feeds).
   * opts: { colors, font, year, index, total }
   */
  function renderCanvas(card, opts) {
    opts = opts || {};
    var W = 1080, H = 1350, P = 96;
    var col = opts.colors || FALLBACK;
    var fam = opts.font || fontOf();
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var g = canvas.getContext("2d");
    if (!g) return null;
    function font(weight, size) { g.font = weight + " " + Math.round(size) + "px " + fam; }
    function spacing(px) { if ("letterSpacing" in g) g.letterSpacing = px + "px"; }

    /* Grund + Zierring (wie der grosse Ring im „Heute“-Kopf) */
    var grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, col.bg1);
    grad.addColorStop(1, col.bg2);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.beginPath();
    g.arc(W + 40, H + 10, 380, 0, Math.PI * 2);
    g.lineWidth = 90;
    g.strokeStyle = alpha(col.ring, 0.45);
    g.stroke();

    /* Kopf: Stichwort links, vier Ringe rechts */
    drawRings(g, W - P - 150, P - 12, 34, 13, col.ring, col.ringFill);
    font(800, 32);
    spacing(5);
    g.fillStyle = col.soft;
    g.textBaseline = "alphabetic";
    g.fillText(String(card.kicker || "").toUpperCase(), P, P + 30);
    spacing(0);

    /* Inhalt: Blöcke messen, bei Bedarf gemeinsam verkleinern */
    var top = P + 110, bottom = H - P - 90, width = W - 2 * P;
    function blocks(k) {
      var list = [];
      // Vier Ringe: Kantenlänge 4.42 × Radius (zwei Durchmesser + Abstand)
      if (card.cover) list.push({ h: 4.42 * 52 * k + 20 * k, draw: function (y) { drawRings(g, P, y, 52 * k, 18 * k, col.ring, col.ringFill); } });
      var bigSize = (card.cover ? 250 : 230) * k;
      font(900, bigSize);
      spacing(-bigSize * 0.035);
      while (g.measureText(String(card.big)).width > width && bigSize > 60) { bigSize -= 6; font(900, bigSize); }
      spacing(0);
      list.push({ h: bigSize * 0.92, draw: function (y) {
        font(900, bigSize); spacing(-bigSize * 0.035); g.fillStyle = col.ink;
        g.fillText(String(card.big), P - bigSize * 0.03, y + bigSize * 0.8); spacing(0);
      } });
      if (card.unit) {
        font(750, 50 * k);
        var ul = wrap(g, card.unit, width);
        list.push({ h: ul.length * 62 * k + 6, draw: function (y) {
          font(750, 50 * k); g.fillStyle = col.ink;
          ul.forEach(function (l, i) { g.fillText(l, P, y + 50 * k + i * 62 * k); });
        } });
      }
      [["lead", 40, 560, "soft"], ["meta", 34, 650, "soft"]].forEach(function (spec) {
        var text = card[spec[0]];
        if (!text) return;
        font(spec[2], spec[1] * k);
        var ls = wrap(g, text, width);
        list.push({ h: ls.length * spec[1] * 1.32 * k + 12 * k, draw: function (y) {
          font(spec[2], spec[1] * k); g.fillStyle = col[spec[3]];
          ls.forEach(function (l, i) { g.fillText(l, P, y + spec[1] * k * 1.05 + i * spec[1] * 1.32 * k); });
        } });
      });
      if (card.chart && card.chart.type === "bars") list.push({ h: 270 * k, draw: function (y) { drawBars(card.chart.items, y + 20 * k, 250 * k, k); } });
      if (card.chart && card.chart.type === "split") list.push({ h: (110 + Math.ceil(card.chart.items.length / 2) * 52) * k, draw: function (y) { drawSplit(card.chart.items, y + 24 * k, k); } });
      if (card.box) {
        font(800, 44 * k);
        var bl = wrap(g, card.box.line, width - 64 * k);
        var bh = (64 + 36 + bl.length * 54 + (card.box.sub ? 46 : 0)) * k;
        list.push({ h: bh + 24 * k, draw: function (y) {
          y += 20 * k;
          roundRect(g, P, y, width, bh, 30 * k);
          g.fillStyle = alpha(col.ink, 0.1);
          g.fill();
          font(800, 28 * k); spacing(3); g.fillStyle = col.soft;
          g.fillText(String(card.box.title).toUpperCase(), P + 32 * k, y + 58 * k); spacing(0);
          font(800, 44 * k); g.fillStyle = col.ink;
          bl.forEach(function (l, i) { g.fillText(l, P + 32 * k, y + (58 + 58 + i * 54) * k); });
          if (card.box.sub) { font(560, 32 * k); g.fillStyle = col.soft; g.fillText(card.box.sub, P + 32 * k, y + (58 + 58 + bl.length * 54 + 4) * k); }
        } });
      }
      if (card.rows && card.rows.length) {
        var rh = 92 * k;
        list.push({ h: card.rows.length * rh + 16 * k, draw: function (y) {
          card.rows.forEach(function (r, i) {
            var ry = y + 16 * k + i * rh;
            g.fillStyle = alpha(col.ink, 0.16);
            g.fillRect(P, ry, width, 2);
            font(600, 32 * k); g.fillStyle = col.soft; g.textAlign = "left";
            g.fillText(r.label, P, ry + 54 * k);
            font(850, 42 * k); g.fillStyle = col.ink; g.textAlign = "right";
            g.fillText(r.value, W - P, ry + (r.sub ? 46 : 56) * k);
            if (r.sub) { font(560, 27 * k); g.fillStyle = col.soft; g.fillText(r.sub, W - P, ry + 80 * k); }
            g.textAlign = "left";
          });
        } });
      }
      if (card.fun) {
        font(700, 38 * k);
        var fl = wrap(g, card.fun, width);
        list.push({ h: fl.length * 50 * k + 30 * k, draw: function (y) {
          font(700, 38 * k); g.fillStyle = col.accent;
          fl.forEach(function (l, i) { g.fillText(l, P, y + 30 * k + 38 * k + i * 50 * k); });
        } });
      }
      return list;
    }
    var k = 1, list, total;
    for (var guard = 0; guard < 12; guard++) {
      list = blocks(k);
      total = list.reduce(function (a, b) { return a + b.h + 22 * k; }, 0);
      if (total <= bottom - top || k < 0.62) break;
      k *= 0.93;
    }
    var y = top + Math.max(0, (bottom - top - total) * 0.42);
    list.forEach(function (b) { b.draw(y); y += b.h + 22 * k; });

    /* Fuss: Wortmarke und Jahr */
    drawRings(g, P, H - P - 30, 13, 5, col.ring, col.ringFill);
    font(900, 30);
    spacing(4);
    g.fillStyle = col.ink;
    g.fillText("ZEIT", P + 80, H - P);
    var zw = g.measureText("ZEIT").width;
    g.fillStyle = col.soft;
    g.fillText("KONTO", P + 80 + zw + 8, H - P);
    g.textAlign = "right";
    font(800, 30);
    g.fillText(String(opts.year || ""), W - P, H - P);
    g.textAlign = "left";
    spacing(0);
    return canvas;

    function drawBars(items, y0, h, kk) {
      var n = items.length || 1;
      var gap = n > 8 ? 14 * kk : 26 * kk;
      var bw = (width - gap * (n - 1)) / n;
      var max = 0;
      items.forEach(function (it) { if (it.value > max) max = it.value; });
      var barH = h - 52 * kk;
      items.forEach(function (it, i) {
        var x = P + i * (bw + gap);
        var vh = max > 0 ? Math.max(it.value > 0 ? 6 : 0, it.value / max * barH) : 0;
        roundRect(g, x, y0, bw, barH, Math.min(14, bw / 3));
        g.fillStyle = alpha(col.ink, 0.08);
        g.fill();
        if (vh > 0) {
          roundRect(g, x, y0 + barH - vh, bw, vh, Math.min(14, bw / 3));
          g.fillStyle = it.hi ? col.ink : alpha(col.ink, it.muted ? 0.15 : 0.38);
          g.fill();
        }
        font(it.hi ? 850 : 600, 28 * kk);
        g.fillStyle = it.hi ? col.ink : col.soft;
        g.textAlign = "center";
        g.fillText(it.label, x + bw / 2, y0 + h - 8 * kk);
        g.textAlign = "left";
      });
    }

    function drawSplit(items, y0, kk) {
      var total = items.reduce(function (a, it) { return a + it.value; }, 0) || 1;
      var shades = [0.32, 1, 0.62, 0.18];
      var x = P;
      roundRect(g, P, y0, width, 44 * kk, 22 * kk);
      g.save();
      g.clip();
      items.forEach(function (it, i) {
        var w = it.value / total * width;
        g.fillStyle = alpha(col.ink, shades[i % 4]);
        g.fillRect(x, y0, w, 44 * kk);
        x += w;
      });
      g.restore();
      items.forEach(function (it, i) {
        var lx = P + (i % 2) * (width / 2);
        var ly = y0 + 44 * kk + 56 * kk + Math.floor(i / 2) * 52 * kk;
        g.beginPath();
        g.arc(lx + 12 * kk, ly - 12 * kk, 12 * kk, 0, Math.PI * 2);
        g.fillStyle = alpha(col.ink, shades[i % 4]);
        g.fill();
        font(600, 32 * kk);
        g.fillStyle = col.soft;
        g.fillText(it.label + " · " + num(it.value), lx + 36 * kk, ly);
      });
    }
  }

  function shareCard(App, card, st, el) {
    var canvas = null;
    try {
      canvas = renderCanvas(card, { colors: colorsOf(el), font: fontOf(), year: st.year });
    } catch (e) { canvas = null; }
    if (!canvas || !canvas.toBlob) { D.toast(I.t("rv.shareFailed"), { tone: "minus" }); return; }
    canvas.toBlob(function (blob) {
      if (!blob) { D.toast(I.t("rv.shareFailed"), { tone: "minus" }); return; }
      var name = "zeitkonto-" + st.year + "-" + card.id + ".png";
      var file = null;
      try { file = new File([blob], name, { type: "image/png" }); } catch (e) { file = null; }
      var nav = root.navigator;
      if (file && nav && nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        nav.share({ files: [file], title: I.t("rv.dialog", { year: st.year }) }).catch(function (err) {
          if (err && err.name === "AbortError") return;     // abgebrochen: nichts tun
          D.download(name, blob);
          D.toast(I.t("rv.saved"), { icon: "download" });
        });
        return;
      }
      D.download(name, blob);
      D.toast(I.t("rv.saved"), { icon: "download" });
    }, "image/png");
  }

  /* -------------------------------------------------------------------- */
  /* Story-Dialog                                                          */
  /* -------------------------------------------------------------------- */
  function reducedMotion() {
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function open(App, year) {
    year = year || defaultYear(App);
    var state = { year: year, st: null, cards: [], index: 0, playing: false, timer: null };

    var stage = D.el("div.rv-stage", { "aria-live": "polite" });
    var progress = D.el("div.rv-progress", { "aria-hidden": "true" });

    var prevBtn = D.el("button.btn.icon.rv-prev", { type: "button", "aria-label": I.t("rv.prev"), html: D.icon("left") });
    var nextBtn = D.el("button.btn.icon.rv-next", { type: "button", "aria-label": I.t("rv.next"), html: D.icon("right") });
    var nav = D.el("div.left.rv-navbtns");
    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    var copyBtn = D.el("button.btn.rv-copy", {
      type: "button", "aria-label": I.t("rv.copyText"),
      html: D.icon("copy") + '<span class="long">' + D.esc(I.t("rv.copyText")) + '</span><span class="short">' + D.esc(I.t("rv.copyShort")) + "</span>"
    });
    var shareBtn = D.el("button.btn.primary.rv-share", {
      type: "button",
      html: D.icon("upload") + '<span class="long">' + D.esc(I.t("rv.shareImage")) + '</span><span class="short">' + D.esc(I.t("rv.shareShort")) + "</span>"
    });

    var m = D.modal({
      title: I.t("rv.yourYear"),
      sub: " ",
      body: stage,
      footer: [nav, copyBtn, shareBtn],
      focus: nextBtn,
      onClose: cleanup
    });
    m.scrim.classList.add("rv-scrim");
    m.box.classList.add("rv-modal");
    m.box.insertBefore(progress, m.box.firstChild);
    var head = D.qs(".modal-head", m.box);
    var sub = D.qs(".modal-head .sub", m.box);
    var closeBtn = D.qs(".modal-head .close", m.box);

    /* Jahr wählen (nur wenn es mehrere gibt) + automatisch weiter */
    var tools = D.el("div.rv-tools");
    var ys = yearsOf(App);
    if (ys.length > 1) {
      var sel = D.el("select.select.rv-yearsel", { "aria-label": I.t("rv.year") });
      ys.forEach(function (y) { sel.appendChild(D.el("option", { value: String(y.year), text: String(y.year), selected: y.year === year })); });
      sel.addEventListener("change", function () { setYear(+sel.value); });
      tools.appendChild(sel);
    } else {
      tools.appendChild(D.el("span.rv-yearlabel", { text: String(year) }));
    }
    var playBtn = D.el("button.btn.ghost.icon.sm.rv-play", { type: "button", "aria-label": I.t("rv.autoplay"), "data-tip": I.t("rv.autoplay"), "aria-pressed": "false", html: D.icon("play") });
    tools.appendChild(playBtn);
    head.insertBefore(tools, closeBtn);

    function setYear(y) {
      state.year = y;
      state.st = statsOf(App, y);
      state.cards = buildCards(App, state.st);
      m.scrim.removeAttribute("aria-labelledby");
      m.scrim.setAttribute("aria-label", I.t("rv.dialog", { year: y }));
      show(0, 0);
    }

    function drawProgress() {
      D.clear(progress);
      state.cards.forEach(function (c, i) {
        var seg = D.el("i" + (i < state.index ? ".done" : i === state.index ? ".now" : ""));
        seg.appendChild(D.el("b"));
        progress.appendChild(seg);
      });
      progress.classList.toggle("playing", state.playing);
      progress.style.setProperty("--rv-ms", AUTO_MS + "ms");
    }

    function show(i, dir) {
      var last = state.cards.length - 1;
      i = Math.max(0, Math.min(last, i));
      state.index = i;
      var card = state.cards[i];
      var node = cardNode(card, i, state.cards.length, state.st);
      if (dir && !reducedMotion()) node.classList.add(dir > 0 ? "from-next" : "from-prev");
      D.clear(stage);
      stage.appendChild(node);
      fitBig(node);
      if (card.count && !reducedMotion()) {
        var big = D.qs(".rv-big", node);
        D.animateValue(big, 0, card.count.to, card.count.format, 560);
      }
      sub.textContent = I.t("rv.slideOf", { i: i + 1, n: state.cards.length });
      /* aria-disabled statt disabled: der Fokus bleibt auf dem Knopf */
      prevBtn.setAttribute("aria-disabled", i === 0 ? "true" : "false");
      nextBtn.setAttribute("aria-disabled", i === last ? "true" : "false");
      drawProgress();
      schedule();
    }

    function go(delta) {
      var next = state.index + delta;
      if (next < 0 || next >= state.cards.length) return;
      show(next, delta);
    }

    function schedule() {
      clearTimeout(state.timer);
      if (!state.playing) return;
      state.timer = setTimeout(function () {
        if (state.index < state.cards.length - 1) go(1);
        else setPlaying(false);
      }, AUTO_MS);
    }
    function setPlaying(on) {
      state.playing = !!on;
      playBtn.setAttribute("aria-pressed", on ? "true" : "false");
      playBtn.innerHTML = on ? PAUSE_ICON : D.icon("play");
      drawProgress();
      schedule();
    }
    playBtn.addEventListener("click", function () {
      if (!state.playing && state.index >= state.cards.length - 1) show(0, 0);
      setPlaying(!state.playing);
    });

    prevBtn.addEventListener("click", function () { go(-1); });
    nextBtn.addEventListener("click", function () { go(1); });
    copyBtn.addEventListener("click", function () {
      D.copyText(summaryText(state.cards)).then(function () {
        D.toast(I.t("rv.copied"), { icon: "copy" });
      }, function () {
        D.toast(I.t("rv.copyFailed"), { tone: "minus" });
      });
    });
    shareBtn.addEventListener("click", function () {
      shareCard(App, state.cards[state.index], state.st, stage.firstChild);
    });

    /* Tippen: linkes Drittel zurück, sonst weiter. Wischen: waagrecht. */
    var sx = null, sy = 0, swiped = false;
    stage.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      sx = e.clientX; sy = e.clientY; swiped = false;
    });
    stage.addEventListener("pointerup", function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = true; go(dx < 0 ? 1 : -1); }
    });
    stage.addEventListener("pointercancel", function () { sx = null; });
    stage.addEventListener("click", function (e) {
      if (swiped) { swiped = false; return; }
      var r = stage.getBoundingClientRect();
      go(e.clientX - r.left < r.width / 3 ? -1 : 1);
    });

    /* Tastatur — auch wenn der Fokus gerade auf keinem Element im Dialog
       liegt. Nur der oberste Dialog reagiert. */
    function onKey(e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      var all = D.qsa(".modal-scrim");
      if (all[all.length - 1] !== m.scrim) return;
      var t = e.target;
      if (t && (t.tagName === "SELECT" || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") { e.preventDefault(); show(0, -1); }
      else if (e.key === "End") { e.preventDefault(); show(state.cards.length - 1, 1); }
    }
    function onVisibility() { if (document.hidden && state.playing) setPlaying(false); }
    var onResize = D.debounce(function () { fitBig(stage.firstChild); }, 120);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    root.addEventListener("resize", onResize);

    function cleanup() {
      clearTimeout(state.timer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      root.removeEventListener("resize", onResize);
    }

    setYear(year);
    return { close: m.close, show: show, state: state, modal: m };
  }

  /* -------------------------------------------------------------------- */
  /* Momente                                                               */
  /* -------------------------------------------------------------------- */
  var MOMENT_ICONS = { vacation: "plane", weekend: "sun", bridge: "calendarDays", month: "calendar", record: "flame" };

  function momentText(App, m) {
    var v = m.vars || {};
    if (m.kind === "vacation") return v.n === 0 ? I.t("rv.m.vacationLast") : I.tn("rv.m.vacation", v.n);
    if (m.kind === "weekend") {
      var wname = holidayName(App, v.holiday);
      return I.t(wname ? "rv.m.weekendHoliday" : "rv.m.weekend", { n: v.days, day: I.weekdayName(T.weekdayOf(v.start), "long"), name: wname });
    }
    if (m.kind === "bridge") {
      var bname = holidayName(App, v.holiday);
      return I.t(bname ? "rv.m.bridgeHoliday" : "rv.m.bridge", {
        date: I.formatDate(v.date, { weekday: "short", day: "numeric", month: "long" }), n: v.days, name: bname
      });
    }
    if (m.kind === "month") return I.t("rv.m.month", { month: I.monthName(+v.month.slice(5, 7) - 1, "long"), v: App.fmtSigned(v.balance) });
    if (m.kind === "record") return I.t("rv.m.record", { n: v.days });
    return "";
  }

  function momentsOn(App) {
    var cfg = App.settings().moments;
    return !cfg || cfg.enabled !== false;
  }

  function currentMoment(App) {
    return cached(App, "moment", function () {
      return RV.moment({ records: App.store.allDays(), settings: App.settings() });
    });
  }

  ZK.Ext.register("today.cards", {
    id: "review.moments",
    order: 1,
    when: function (ctx) { return ctx.iso === T.todayISO() && momentsOn(ctx.App); },
    render: function (host, ctx) {
      var node = null, shownKey = null;
      function sync(App, iso) {
        // Nach Mitternacht gehört der Moment nicht mehr zum angezeigten Tag
        var m = momentsOn(App) && (iso || ctx.iso) === T.todayISO() ? currentMoment(App) : null;
        var text = m ? momentText(App, m) : "";
        if (!m || !text) {
          if (node && node.parentNode) node.parentNode.removeChild(node);
          node = null; shownKey = null;
          host.hidden = !host.children.length;
          return;
        }
        if (node && shownKey === m.key + "|" + text) return;
        if (!node) {
          node = D.el("div.rv-moment");
          host.insertBefore(node, host.firstChild);
          host.hidden = false;
        }
        shownKey = m.key + "|" + text;
        node.dataset.kind = m.kind;
        node.innerHTML = '<span class="rv-moment-ic">' + D.icon(MOMENT_ICONS[m.kind] || "star") + "</span>" +
          '<span class="rv-moment-text">' + D.esc(text) + "</span>";
        var x = D.el("button.btn.ghost.icon.sm.rv-moment-x", { type: "button", "aria-label": I.t("rv.m.hide"), "data-tip": I.t("rv.m.hide"), html: D.icon("x") });
        x.addEventListener("click", function () {
          var cfg = App.settings().moments;
          // Buchhaltung, kein Rückgängig-Schritt: Ctrl+Z soll Erfasstes zurücknehmen
          App.store.updateSettings({ moments: RV.dismiss(cfg, m.key, T.todayISO()) }, { undo: false });
          var next = node && node.nextElementSibling;
          sync(App, T.todayISO());
          // Fokus nicht ins Leere fallen lassen
          if (next && next.focus) { try { next.focus({ preventScroll: true }); } catch (e) { /* Kür */ } }
        });
        node.appendChild(x);
      }
      sync(ctx.App, ctx.iso);
      return { update: function (c) { sync(c.App, c.iso); } };
    }
  });

  /* -------------------------------------------------------------------- */
  /* Einstieg in der Statistik                                             */
  /* -------------------------------------------------------------------- */
  ZK.Ext.register("stats.bottom", {
    id: "review.entry",
    order: 50,
    when: function (ctx) { return !!entryYear(ctx.App); },
    render: function (host, ctx) {
      var App = ctx.App;
      var e = entryYear(App);
      var node = D.el("section.card.rv-entry" + (e.hot ? ".is-hot" : ""));
      node.appendChild(D.el("div.rv-rings.rv-rings-entry", { "aria-hidden": "true", html: RINGS }));
      var text = D.el("div.rv-entry-text");
      text.appendChild(D.el("h2", { text: I.t("rv.entry.title", { year: e.year }) }));
      text.appendChild(D.el("p", { text: I.t("rv.entry.text") }));
      if (e.hot) {
        var st = statsOf(App, e.year);
        var chips = D.el("div.rv-entry-chips");
        if (st.workedDays) chips.appendChild(D.el("span", { text: num(Math.round(st.totalNet / 60)) + " h" }));
        if (st.streak) chips.appendChild(D.el("span", { text: I.t("rv.k.streak") + " " + num(st.streak.days) }));
        chips.appendChild(D.el("span", { text: App.fmtSigned(st.balanceEnd) }));
        text.appendChild(chips);
      }
      node.appendChild(text);
      var btn = D.el("button.btn" + (e.hot ? ".rv-entry-hot-btn" : ""), { type: "button", html: D.icon("play") + "<span>" + D.esc(I.t("rv.entry.open")) + "</span>" });
      btn.addEventListener("click", function () { open(App, e.year); });
      node.appendChild(btn);
      host.appendChild(node);
    }
  });

  /* -------------------------------------------------------------------- */
  /* Befehlspalette                                                        */
  /* -------------------------------------------------------------------- */
  var KEYWORDS = ["ruckblick", "rueckblick", "jahresruckblick", "jahr", "review", "year", "wrapped", "bilan", "annee", "riepilogo", "anno"];

  function norm(s) {
    s = String(s || "").toLowerCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s;
  }

  /** Passt die Eingabe zum Rückblick? → { year | null } oder null. */
  function matchQuery(query) {
    var words = norm(query).split(/[\s,.;:]+/).filter(Boolean);
    var hit = false, year = null;
    words.forEach(function (w) {
      if (/^(19|20)\d\d$/.test(w)) { year = +w; return; }
      if (w.length < 3) return;
      KEYWORDS.forEach(function (k) { if (k.indexOf(w) === 0 || w.indexOf(k) === 0) hit = true; });
    });
    return hit ? { year: year } : null;
  }

  ZK.Ext.register("palette.commands", {
    id: "review.palette",
    collect: function (query, ctx) {
      var q = matchQuery(query);
      if (!q) return [];
      var App = ctx.App;
      var ys = yearsOf(App);
      if (!ys.length) return [];
      var year = q.year && ys.some(function (y) { return y.year === q.year; }) ? q.year : defaultYear(App);
      return [{
        group: I.t("cmd.group.actions"),
        icon: "star",
        label: I.t("rv.cmd", { year: year }),
        sub: I.t("rv.cmdSub"),
        run: function () { open(App, year); }
      }];
    }
  });

  /* -------------------------------------------------------------------- */
  /* Einstellungen: Momente an/aus                                         */
  /* -------------------------------------------------------------------- */
  var uid = 0;
  ZK.Ext.register("settings.sections", {
    id: "review.settings",
    order: 50,
    render: function (host, ctx) {
      var App = ctx.App;
      var sec = ctx.section(I.t("rv.set.title"));
      sec.node.classList.add("rv-set");
      var id = "rv-set-" + (++uid);
      var row = D.el("div.setting-row.is-switch");
      var info = D.el("div.info");
      info.appendChild(D.el("b", { id: id, text: I.t("rv.set.show") }));
      info.appendChild(D.el("span", { id: id + "-h", text: I.t("rv.set.hint") }));
      row.appendChild(info);
      var ctl = D.el("div.ctl");
      var label = D.el("label.switch");
      var input = D.el("input", { type: "checkbox", checked: momentsOn(App), "aria-labelledby": id, "aria-describedby": id + "-h" });
      input.addEventListener("change", function () {
        var cfg = App.settings().moments || {};
        App.store.updateSettings({ moments: { enabled: input.checked, dismissed: cfg.dismissed || {} } });
      });
      label.appendChild(input);
      label.appendChild(D.el("span.track"));
      ctl.appendChild(label);
      row.appendChild(ctl);
      row.addEventListener("click", function (e) {
        if (e.target.closest("label, button, a, input")) return;
        input.click();
      });
      sec.body.appendChild(row);
      if (yearsOf(App).length) {
        var btn = D.el("button.btn.block.mt-3", { type: "button", html: D.icon("star") + "<span>" + D.esc(I.t("rv.set.review")) + "</span>" });
        btn.addEventListener("click", function () { open(App); });
        sec.body.appendChild(btn);
      }
      host.appendChild(sec.node);
    }
  });

  ZK.ReviewUI = {
    open: open,
    buildCards: buildCards,
    summaryText: summaryText,
    renderCanvas: renderCanvas,
    colorsOf: colorsOf,
    momentText: momentText,
    matchQuery: matchQuery,
    entryYear: entryYear
  };
})(typeof self !== "undefined" ? self : this);
