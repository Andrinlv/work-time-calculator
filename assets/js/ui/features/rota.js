/* ==========================================================================
   ZEITKONTO — Schichtplan (Oberfläche)
   --------------------------------------------------------------------------
   Den Früh/Spät/Nacht-Rhythmus einmal eingeben — danach kennt Zeitkonto
   jede geplante Schicht:
     · Einstellungen  Karte „Schichtplan“: Vorlagen, Rhythmus-Raster,
                      Vorschau der nächsten vier Wochen, Konflikte
     · Kalender       Kürzel der geplanten Schicht an heutigen und künftigen
                      Tagen, Hinweis auf zu kurze Ruhezeiten im Monat
     · Woche          geplante Schicht als gestrichelter Balken
     · Heute          „Geplant: Frühschicht 06:00–14:30 · Übernehmen“; nach
                      dem Einstempeln das Schichtende neben dem Feierabend
     · Palette        „plan 23.10. nacht“, „plan morgen frei“
   Einen einzelnen Tag ändert man in einem kleinen Dialog — aus der Vorschau,
   aus dem Konflikthinweis im Kalender oder über die Palette. Die Kalender-
   zelle selbst bleibt EIN Knopf (Tag öffnen); ein zweiter Knopf darin wäre
   auf dem Handy kaum zu treffen und für Bildschirmleser verschachtelt.

   1. ZK.RotaUI — Logik ohne DOM (läuft auch in Node): Texte, Palettenbefehl
      lesen, was die Karte in „Heute“ zeigt.
   2. Oberfläche.
   ========================================================================== */

/* ==========================================================================
   1 · LOGIK
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../core/time.js"), require("../../core/rota.js"), require("../../core/planner.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.RotaUI = factory(root.ZK.Time, root.ZK.Rota, root.ZK.Planner);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, Rota, P) {
  "use strict";

  var STRINGS = {
    de: {
      "rota.title": "Schichtplan",
      "rota.hint": "Gib deinen Rhythmus einmal ein: Zeitkonto zeigt jede geplante Schicht, füllt sie mit einem Tipp aus und warnt früh vor zu kurzen Ruhezeiten. Das Soll bleibt beim Arbeitsmodell.",
      "rota.enable": "Schichtplan verwenden",
      "rota.enableHint": "Geplante Schichten in Kalender, Woche und Heute",
      "rota.presets": "Vorlage",
      "rota.preset.early-late": "2 Wochen Früh/Spät",
      "rota.preset.three-shift": "3-Schicht, 21 Tage",
      "rota.preset.office": "Büro Mo–Fr",
      "rota.presetAdded": "Schichtvorlagen ergänzt: {names}",
      "rota.anchor": "Tag 1 des Rhythmus",
      "rota.anchorHint": "Ab hier beginnt der Rhythmus jeweils von vorn",
      "rota.thisWeek": "Diese Woche",
      "rota.thisWeekHint": "Welche Woche des Rhythmus gerade läuft",
      "rota.weekN": "Woche {n}",
      "rota.weekShort": "W{n}",
      "rota.cycle": "Rhythmus",
      "rota.cycleHint": "Tippe auf einen Tag, um die Schicht zu wechseln: {list}.",
      "rota.length": "{n} Tage",
      "rota.length.one": "1 Tag",
      "rota.shorter": "Einen Tag kürzer",
      "rota.longer": "Einen Tag länger",
      "rota.custom": "Eigener Rhythmus",
      "rota.cellLabel": "Tag {n}, {weekday}: {shift}",
      "rota.free": "Frei",
      "rota.skipHolidays": "An Feiertagen frei",
      "rota.skipHolidaysHint": "Aus: Der Rhythmus läuft auch an Feiertagen weiter",
      "rota.preview": "Nächste 4 Wochen",
      "rota.previewHint": "Tippe auf einen Tag, um nur diesen zu ändern.",
      "rota.override": "Abweichend vom Rhythmus",
      "rota.noConflicts": "Keine Konflikte in den nächsten 8 Wochen.",
      "rota.issues": "{n} Konflikte im Schichtplan",
      "rota.issues.one": "1 Konflikt im Schichtplan",
      "rota.restNeed": "Zwischen zwei Schichten braucht es mindestens {v} Ruhe (ArG).",
      "rota.restShort": "{date}: nur {v} Ruhe",
      "rota.overlap": "{date}: Schichten überschneiden sich",
      "rota.weekOver": "{week}: {v} geplant",
      "rota.weekMax": "Höchstarbeitszeit {v} pro Woche",
      "rota.conflictTip": "Ruhezeit zu kurz",
      "rota.plannedShift": "Geplant: {name}",
      "rota.byPlan": "Laut Plan: {name}",
      "rota.apply": "Übernehmen",
      "rota.applyHint": "Kommen, Gehen und Pause wie geplant eintragen",
      "rota.breakInfo": "Pause {time}",
      "rota.breakPaidInfo": "bezahlte Pause {time}",
      "rota.netInfo": "{v} Arbeitszeit",
      "rota.endPlan": "Schichtende laut Plan",
      "rota.endLater": "{v} nach deinem Feierabend um {time}",
      "rota.endEarlier": "{v} vor deinem Feierabend um {time}",
      "rota.restBefore": "Nur {v} Ruhe nach der vorherigen Schicht",
      "rota.restAfter": "Nur {v} Ruhe bis zur nächsten Schicht",
      "rota.overlapNote": "Überschneidet sich mit einer anderen Schicht",
      "rota.dayTitle": "Plan für {date}",
      "rota.dayHint": "Gilt nur für diesen Tag — der Rhythmus bleibt, wie er ist.",
      "rota.byCycle": "Laut Rhythmus",
      "rota.changed": "Plan für {date} geändert",
      "rota.restored": "{date} wieder laut Rhythmus",
      "rota.cmd.open": "Schichtplan bearbeiten",
      "rota.cmd.set": "{date} → {name}",
      "rota.cmd.current": "aktuell geplant",
      "rota.cmd.past": "Vergangene Tage lassen sich nicht mehr planen",
      "rota.cmd.off": "Noch nicht eingerichtet",
      "rota.code.office": "B",
      "rota.code.early": "F",
      "rota.code.late": "S",
      "rota.code.night": "N"
    },
    en: {
      "rota.title": "Shift roster",
      "rota.hint": "Enter your rotation once: Zeitkonto shows every planned shift, fills it in with one tap and warns early about short rest periods. Your target hours still come from the work model.",
      "rota.enable": "Use shift roster",
      "rota.enableHint": "Planned shifts in calendar, week and today",
      "rota.presets": "Template",
      "rota.preset.early-late": "2 weeks early/late",
      "rota.preset.three-shift": "3 shifts, 21 days",
      "rota.preset.office": "Office Mon–Fri",
      "rota.presetAdded": "Shift templates added: {names}",
      "rota.anchor": "Day 1 of the rotation",
      "rota.anchorHint": "The rotation starts over from this day",
      "rota.thisWeek": "This week",
      "rota.thisWeekHint": "Which week of the rotation is running now",
      "rota.weekN": "Week {n}",
      "rota.weekShort": "W{n}",
      "rota.cycle": "Rotation",
      "rota.cycleHint": "Tap a day to change its shift: {list}.",
      "rota.length": "{n} days",
      "rota.length.one": "1 day",
      "rota.shorter": "One day shorter",
      "rota.longer": "One day longer",
      "rota.custom": "Custom rotation",
      "rota.cellLabel": "Day {n}, {weekday}: {shift}",
      "rota.free": "Off",
      "rota.skipHolidays": "Off on public holidays",
      "rota.skipHolidaysHint": "Switched off: the rotation also runs on public holidays",
      "rota.preview": "Next 4 weeks",
      "rota.previewHint": "Tap a day to change just that one.",
      "rota.override": "Differs from the rotation",
      "rota.noConflicts": "No conflicts in the next 8 weeks.",
      "rota.issues": "{n} roster conflicts",
      "rota.issues.one": "1 roster conflict",
      "rota.restNeed": "At least {v} of rest is required between two shifts (Swiss law).",
      "rota.restShort": "{date}: only {v} rest",
      "rota.overlap": "{date}: shifts overlap",
      "rota.weekOver": "{week}: {v} planned",
      "rota.weekMax": "Maximum {v} per week",
      "rota.conflictTip": "Rest period too short",
      "rota.plannedShift": "Planned: {name}",
      "rota.byPlan": "Per roster: {name}",
      "rota.apply": "Apply",
      "rota.applyHint": "Fill in clock-in, clock-out and break as planned",
      "rota.breakInfo": "Break {time}",
      "rota.breakPaidInfo": "paid break {time}",
      "rota.netInfo": "{v} working time",
      "rota.endPlan": "Shift ends per roster",
      "rota.endLater": "{v} after your leave time of {time}",
      "rota.endEarlier": "{v} before your leave time of {time}",
      "rota.restBefore": "Only {v} of rest after the previous shift",
      "rota.restAfter": "Only {v} of rest before the next shift",
      "rota.overlapNote": "Overlaps another shift",
      "rota.dayTitle": "Roster for {date}",
      "rota.dayHint": "Applies to this day only — the rotation stays as it is.",
      "rota.byCycle": "As per rotation",
      "rota.changed": "Roster for {date} changed",
      "rota.restored": "{date} back to the rotation",
      "rota.cmd.open": "Edit shift roster",
      "rota.cmd.set": "{date} → {name}",
      "rota.cmd.current": "currently planned",
      "rota.cmd.past": "Past days can no longer be planned",
      "rota.cmd.off": "Not set up yet",
      "rota.code.office": "O",
      "rota.code.early": "E",
      "rota.code.late": "L",
      "rota.code.night": "N"
    },
    fr: {
      "rota.title": "Planning des équipes",
      "rota.hint": "Saisissez votre rotation une seule fois : Zeitkonto affiche chaque équipe prévue, la reprend d'un geste et signale tôt les repos trop courts. Le temps dû reste celui du modèle de travail.",
      "rota.enable": "Utiliser le planning",
      "rota.enableHint": "Équipes prévues dans le calendrier, la semaine et aujourd'hui",
      "rota.presets": "Modèle",
      "rota.preset.early-late": "2 semaines matin/soir",
      "rota.preset.three-shift": "3 équipes, 21 jours",
      "rota.preset.office": "Bureau lun–ven",
      "rota.presetAdded": "Modèles d'équipe ajoutés : {names}",
      "rota.anchor": "Jour 1 de la rotation",
      "rota.anchorHint": "La rotation recommence à partir de ce jour",
      "rota.thisWeek": "Cette semaine",
      "rota.thisWeekHint": "Quelle semaine de la rotation est en cours",
      "rota.weekN": "Semaine {n}",
      "rota.weekShort": "S{n}",
      "rota.cycle": "Rotation",
      "rota.cycleHint": "Touchez un jour pour changer d'équipe : {list}.",
      "rota.length": "{n} jours",
      "rota.length.one": "1 jour",
      "rota.shorter": "Un jour de moins",
      "rota.longer": "Un jour de plus",
      "rota.custom": "Rotation personnalisée",
      "rota.cellLabel": "Jour {n}, {weekday} : {shift}",
      "rota.free": "Libre",
      "rota.skipHolidays": "Libre les jours fériés",
      "rota.skipHolidaysHint": "Désactivé : la rotation continue les jours fériés",
      "rota.preview": "4 prochaines semaines",
      "rota.previewHint": "Touchez un jour pour ne modifier que celui-ci.",
      "rota.override": "Diffère de la rotation",
      "rota.noConflicts": "Aucun conflit dans les 8 prochaines semaines.",
      "rota.issues": "{n} conflits dans le planning",
      "rota.issues.one": "1 conflit dans le planning",
      "rota.restNeed": "Il faut au moins {v} de repos entre deux équipes (LTr).",
      "rota.restShort": "{date} : seulement {v} de repos",
      "rota.overlap": "{date} : les équipes se chevauchent",
      "rota.weekOver": "{week} : {v} prévues",
      "rota.weekMax": "Maximum {v} par semaine",
      "rota.conflictTip": "Repos trop court",
      "rota.plannedShift": "Prévu : {name}",
      "rota.byPlan": "Selon le planning : {name}",
      "rota.apply": "Reprendre",
      "rota.applyHint": "Saisir arrivée, départ et pause comme prévu",
      "rota.breakInfo": "Pause {time}",
      "rota.breakPaidInfo": "pause payée {time}",
      "rota.netInfo": "{v} de travail",
      "rota.endPlan": "Fin d'équipe prévue",
      "rota.endLater": "{v} après votre heure de départ ({time})",
      "rota.endEarlier": "{v} avant votre heure de départ ({time})",
      "rota.restBefore": "Seulement {v} de repos après l'équipe précédente",
      "rota.restAfter": "Seulement {v} de repos avant l'équipe suivante",
      "rota.overlapNote": "Chevauche une autre équipe",
      "rota.dayTitle": "Planning du {date}",
      "rota.dayHint": "Vaut pour ce jour seulement — la rotation ne change pas.",
      "rota.byCycle": "Selon la rotation",
      "rota.changed": "Planning du {date} modifié",
      "rota.restored": "{date} : retour à la rotation",
      "rota.cmd.open": "Modifier le planning",
      "rota.cmd.set": "{date} → {name}",
      "rota.cmd.current": "prévu actuellement",
      "rota.cmd.past": "Les jours passés ne peuvent plus être planifiés",
      "rota.cmd.off": "Pas encore configuré",
      "rota.code.office": "B",
      "rota.code.early": "M",
      "rota.code.late": "S",
      "rota.code.night": "N"
    },
    it: {
      "rota.title": "Piano turni",
      "rota.hint": "Inserisci la tua rotazione una sola volta: Zeitkonto mostra ogni turno previsto, lo compila con un tocco e avvisa per tempo se il riposo è troppo breve. L'orario dovuto resta quello del modello di lavoro.",
      "rota.enable": "Usa il piano turni",
      "rota.enableHint": "Turni previsti in calendario, settimana e oggi",
      "rota.presets": "Modello",
      "rota.preset.early-late": "2 settimane mattina/sera",
      "rota.preset.three-shift": "3 turni, 21 giorni",
      "rota.preset.office": "Ufficio lun–ven",
      "rota.presetAdded": "Modelli di turno aggiunti: {names}",
      "rota.anchor": "Giorno 1 della rotazione",
      "rota.anchorHint": "Da questo giorno la rotazione ricomincia",
      "rota.thisWeek": "Questa settimana",
      "rota.thisWeekHint": "Quale settimana della rotazione è in corso",
      "rota.weekN": "Settimana {n}",
      "rota.weekShort": "S{n}",
      "rota.cycle": "Rotazione",
      "rota.cycleHint": "Tocca un giorno per cambiare turno: {list}.",
      "rota.length": "{n} giorni",
      "rota.length.one": "1 giorno",
      "rota.shorter": "Un giorno in meno",
      "rota.longer": "Un giorno in più",
      "rota.custom": "Rotazione personalizzata",
      "rota.cellLabel": "Giorno {n}, {weekday}: {shift}",
      "rota.free": "Libero",
      "rota.skipHolidays": "Libero nei giorni festivi",
      "rota.skipHolidaysHint": "Disattivato: la rotazione continua anche nei festivi",
      "rota.preview": "Prossime 4 settimane",
      "rota.previewHint": "Tocca un giorno per modificare solo quello.",
      "rota.override": "Diverso dalla rotazione",
      "rota.noConflicts": "Nessun conflitto nelle prossime 8 settimane.",
      "rota.issues": "{n} conflitti nel piano turni",
      "rota.issues.one": "1 conflitto nel piano turni",
      "rota.restNeed": "Tra due turni servono almeno {v} di riposo (LL).",
      "rota.restShort": "{date}: solo {v} di riposo",
      "rota.overlap": "{date}: i turni si sovrappongono",
      "rota.weekOver": "{week}: {v} previste",
      "rota.weekMax": "Massimo {v} a settimana",
      "rota.conflictTip": "Riposo troppo breve",
      "rota.plannedShift": "Previsto: {name}",
      "rota.byPlan": "Secondo il piano: {name}",
      "rota.apply": "Applica",
      "rota.applyHint": "Inserisci entrata, uscita e pausa come previsto",
      "rota.breakInfo": "Pausa {time}",
      "rota.breakPaidInfo": "pausa pagata {time}",
      "rota.netInfo": "{v} di lavoro",
      "rota.endPlan": "Fine turno prevista",
      "rota.endLater": "{v} dopo la tua ora di uscita ({time})",
      "rota.endEarlier": "{v} prima della tua ora di uscita ({time})",
      "rota.restBefore": "Solo {v} di riposo dopo il turno precedente",
      "rota.restAfter": "Solo {v} di riposo prima del turno successivo",
      "rota.overlapNote": "Si sovrappone a un altro turno",
      "rota.dayTitle": "Piano per {date}",
      "rota.dayHint": "Vale solo per questo giorno — la rotazione resta invariata.",
      "rota.byCycle": "Secondo la rotazione",
      "rota.changed": "Piano per {date} modificato",
      "rota.restored": "{date}: di nuovo secondo la rotazione",
      "rota.cmd.open": "Modifica il piano turni",
      "rota.cmd.set": "{date} → {name}",
      "rota.cmd.current": "attualmente previsto",
      "rota.cmd.past": "I giorni passati non si possono più pianificare",
      "rota.cmd.off": "Non ancora configurato",
      "rota.code.office": "U",
      "rota.code.early": "M",
      "rota.code.late": "S",
      "rota.code.night": "N"
    }
  };

  /* ==================================================================== */
  /* Palettenbefehl                                                        */
  /* ==================================================================== */

  function fold(text) {
    var s = String(text || "").toLowerCase();
    if (typeof s.normalize === "function") s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s.replace(/[’`´]/g, "'");
  }

  /* Einleitende Wörter — unabhängig von der eingestellten Sprache */
  var LEAD = ["plan", "schicht", "dienst", "rota", "roster", "shift", "equipe", "horaire", "turno", "turni"];
  var FREE_WORDS = ["frei", "free", "off", "libre", "conge", "libero", "riposo"];
  var RESET_WORDS = ["rhythmus", "rhythm", "rythme", "ritmo", "rotation", "rotazione", "reset", "auto",
    "standard", "normal", "zuruck", "zurueck", "default"];
  /* Wörter für die mitgelieferten Vorlagen, zusätzlich zu den übersetzten Namen */
  var SYNONYMS = {
    office: ["buro", "buero", "office", "bureau", "ufficio"],
    early: ["fruh", "frueh", "early", "morning", "matin", "matinee", "mattina", "mattino"],
    late: ["spat", "spaet", "late", "evening", "soir", "soiree", "sera", "serale", "pomeriggio"],
    night: ["nacht", "night", "nuit", "notte", "notturno"]
  };
  var WEEKDAYS = [
    ["sonntag", "sunday", "dimanche", "domenica"],
    ["montag", "monday", "lundi", "lunedi"],
    ["dienstag", "tuesday", "mardi", "martedi"],
    ["mittwoch", "wednesday", "mercredi", "mercoledi"],
    ["donnerstag", "thursday", "jeudi", "giovedi"],
    ["freitag", "friday", "vendredi", "venerdi"],
    ["samstag", "saturday", "samedi", "sabato"]
  ];
  var WEEKDAY_SHORT = ["so", "mo", "di", "mi", "do", "fr", "sa"];

  function prefixOf(tok, words, min) {
    if (tok.length < (min || 3)) return false;
    for (var i = 0; i < words.length; i++) if (words[i].indexOf(tok) === 0) return true;
    return false;
  }

  /** Lead-Wort? → "full" (ganz getippt), "partial" (Anfang, ab drei Buchstaben) oder null */
  function leadOf(tok) {
    for (var i = 0; i < LEAD.length; i++) {
      if (tok.indexOf(LEAD[i]) === 0) return "full";
    }
    return prefixOf(tok, LEAD, 3) ? "partial" : null;
  }

  function relativeDays() {
    var out = {};
    var rel = (P && P.RELATIVE_DAYS) || {};
    Object.keys(rel).forEach(function (k) { out[fold(k)] = rel[k]; });
    return out;
  }

  /** Datum aus einem Wort: „23.10.“, „23.10.2026“, ISO, „morgen“, „freitag“. */
  function dateOf(tok, raw, today) {
    var rel = relativeDays();
    if (Object.prototype.hasOwnProperty.call(rel, tok)) return T.addDays(today, rel[tok]);
    for (var d = 0; d < 7; d++) {
      if (WEEKDAY_SHORT[d] === tok || prefixOf(tok, WEEKDAYS[d], 3)) {
        return T.addDays(today, (d - T.weekdayOf(today) + 7) % 7);
      }
    }
    var iso = P && P.parseDateToken ? P.parseDateToken(raw, today) : (T.isValidISO(raw) ? raw : null);
    if (!iso) return null;
    // Ohne Jahr gemeint: der nächste solche Tag — im Dezember ist „5.1.“ der Januar danach
    var withYear = /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(raw);
    if (!withYear && iso < today) iso = T.addMonths(iso, 12);
    return iso;
  }

  function targetOf(tok, opts) {
    if (FREE_WORDS.indexOf(tok) >= 0 || prefixOf(tok, FREE_WORDS, 3)) return Rota.FREE;
    if (RESET_WORDS.indexOf(tok) >= 0 || prefixOf(tok, RESET_WORDS, 4)) return "reset";
    var words = opts.words || {};
    var order = opts.order || Object.keys(words);
    var exact = null, partial = null;
    order.forEach(function (id) {
      var list = words[id] || [];
      if (exact) return;
      if (list.indexOf(tok) >= 0) { exact = id; return; }
      if (partial) return;
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        if ((tok.length >= 2 && w.indexOf(tok) === 0) || (w.length >= 4 && tok.indexOf(w) === 0)) { partial = id; return; }
      }
    });
    return exact || partial;
  }

  /**
   * Palettenbefehl lesen: „plan 23.10. nacht“, „schicht morgen frei“,
   * „plan fr spät“, „plan 2.11. rhythmus“.
   *   opts: { today, words: { id: [gefaltete Wörter] }, order: [ids] }
   * → null (kein Planbefehl) | { lead: "full"|"partial", date, target, rest: [unbekannte Wörter] }
   *   target: Vorlagen-id | "free" | "reset" | null
   */
  function parseCommand(query, opts) {
    opts = opts || {};
    var raws = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!raws.length) return null;
    var lead = leadOf(fold(raws[0]));
    if (!lead) return null;
    var today = opts.today || T.todayISO();
    var out = { lead: lead, date: null, target: null, rest: [] };
    for (var i = 1; i < raws.length; i++) {
      var tok = fold(raws[i]).replace(/[,;]+$/, "");
      if (!tok) continue;
      if (!out.date) {
        var d = dateOf(tok, raws[i].replace(/[,;]+$/, ""), today);
        if (d) { out.date = d; continue; }
      }
      if (!out.target) {
        var tg = targetOf(tok, opts);
        if (tg) { out.target = tg; continue; }
      }
      out.rest.push(raws[i]);
    }
    return out;
  }

  /** Suchwörter je Vorlage: Name, Kürzel, übersetzte Namen und gängige Wörter. */
  function wordsFor(templates, nameOf, codes, translations) {
    var out = {};
    (templates || []).forEach(function (t) {
      if (!t || !t.id) return;
      var list = [];
      /* Ganze Namen genügen: „nacht“ trifft „nachtschicht“ als Anfang. Einzelne
         Wörter wie „Équipe“ oder „Turno“ stünden in jeder Vorlage. */
      function add(w) {
        w = fold(w).trim();
        if (w && list.indexOf(w) < 0) list.push(w);
      }
      add(nameOf ? nameOf(t) : t.name);
      add(t.name);
      if (codes && codes[t.id]) add(codes[t.id]);
      (translations && translations[t.id] || []).forEach(add);
      (SYNONYMS[t.id] || []).forEach(add);
      out[t.id] = list;
    });
    return out;
  }

  /* ==================================================================== */
  /* Karte in „Heute“                                                      */
  /* ==================================================================== */

  /**
   * Was die Schichtplan-Karte in „Heute“ zeigt.
   *   inp: { entry (Rota.dayPlan), rec, phase, leave (ZK.TodayState.leave), tolerance }
   * → null (nichts zeigen)
   *   | { mode: "prefill" }                       noch nichts erfasst: „Übernehmen“
   *   | { mode: "running", endTl, leaveTl, diff } nach dem Einstempeln: Schichtende
   *     laut Plan neben dem Feierabend, nur wenn beide um mehr als `tolerance`
   *     Minuten (Standard 5) auseinanderliegen. diff > 0: Plan endet später.
   */
  function todayModel(inp) {
    var e = inp && inp.entry;
    if (!Rota.hasShift(e)) return null;
    var rec = inp.rec || {};
    var hasStart = !!String(rec.start || "").trim();
    var hasEnd = !!String(rec.end || "").trim();
    var typed = !!rec.type && rec.type !== "work";
    if (!hasStart && !hasEnd && !typed && !(rec.breaks && rec.breaks.length)) return { mode: "prefill" };
    var ph = inp.phase;
    if (!hasStart || (ph !== "running" && ph !== "break" && ph !== "overtime")) return null;
    var st = Rota.shiftTimes(e.tpl);
    var lv = inp.leave || {};
    var leaveTl = typeof lv.leaveTl === "number" ? lv.leaveTl : (typeof lv.reachedTl === "number" ? lv.reachedTl : null);
    if (leaveTl === null) return null;
    var diff = st.end - leaveTl;
    var tol = typeof inp.tolerance === "number" ? inp.tolerance : 5;
    if (Math.abs(diff) <= tol) return null;
    return { mode: "running", endTl: st.end, leaveTl: leaveTl, diff: diff };
  }

  /** Ruhezeit-Konflikte, die den Tag `iso` betreffen → { before, after } (je Konflikt oder null). */
  function conflictsFor(conflicts, iso) {
    var out = { before: null, after: null };
    (conflicts || []).forEach(function (c) {
      if (c.to === iso && !out.before) out.before = c;
      if (c.from === iso && !out.after) out.after = c;
    });
    return out;
  }

  return {
    STRINGS: STRINGS,
    fold: fold,
    parseCommand: parseCommand,
    wordsFor: wordsFor,
    todayModel: todayModel,
    conflictsFor: conflictsFor
  };
});

/* ==========================================================================
   2 · OBERFLÄCHE
   ========================================================================== */
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;   // in Node nur die Logik oben
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, I = ZK.I18n, R = ZK.Rules, Rota = ZK.Rota, RU = ZK.RotaUI;
  if (!ZK.Ext || !Rota || !RU) return;

  I.add(RU.STRINGS);

  var DEFAULT_IDS = ["office", "early", "late", "night"];

  /* ---- Zugriff ------------------------------------------------------ */
  function settingsOf(App) { return App.settings(); }
  function rotaOf(App) { return Rota.normalize(settingsOf(App).rota); }
  function isOn(App) { return Rota.isActive(settingsOf(App).rota); }
  function templatesOf(App) { return settingsOf(App).shiftTemplates || []; }
  function firstDayOf(App) { return settingsOf(App).firstDayOfWeek === 0 ? 0 : 1; }
  function revOf(App) { return App.dataRevision ? App.dataRevision() : String(Date.now()); }

  function shiftName(tpl) {
    if (!tpl) return "";
    var L = ZK.Views && ZK.Views.settings && ZK.Views.settings.labels;
    if (L && L.shiftName) return L.shiftName(tpl);
    return tpl.nameKey && I.t(tpl.nameKey) !== tpl.nameKey ? I.t(tpl.nameKey) : String(tpl.name || "");
  }
  function timesOf(tpl) { return tpl.start + "–" + tpl.end; }
  function shortDate(iso) { return I.formatDate(iso, { weekday: "short", day: "numeric", month: "numeric" }); }
  function longDate(iso) { return I.formatDate(iso, { weekday: "long", day: "numeric", month: "long" }); }

  /* Kürzel je Vorlage, je Sprache und Vorlagenstand nur einmal gebildet */
  var codeMemo = { key: null, map: {} };
  function codesOf(App) {
    var tpls = templatesOf(App);
    var key = I.getLang() + "|" + JSON.stringify(tpls);
    if (codeMemo.key !== key) {
      var fixed = {};
      DEFAULT_IDS.forEach(function (id) { fixed[id] = I.t("rota.code." + id); });
      codeMemo = { key: key, map: Rota.codes(tpls, shiftName, fixed) };
    }
    return codeMemo.map;
  }
  function codeOf(App, id) { return id ? (codesOf(App)[id] || "?") : "–"; }

  /* ---- Plan für einen Zeitraum, je Datenstand nur einmal gerechnet ----- */
  var windows = [];
  function windowPlan(App, from, to) {
    var key = revOf(App) + "|" + from + "|" + to + "|" + T.todayISO();
    for (var i = 0; i < windows.length; i++) if (windows[i].key === key) return windows[i].value;
    var s = settingsOf(App);
    var entries = Rota.plan(from, to, {
      rota: s.rota,
      templates: s.shiftTemplates || [],
      record: function (iso) { return App.store.getDay(iso); },
      holiday: function (iso) { return App.holiday(iso); }
    });
    var byIso = {}, conflictDays = {};
    entries.forEach(function (e) { byIso[e.date] = e; });
    var conflicts = Rota.restConflicts(entries, s.minRestHours);
    conflicts.forEach(function (c) {
      (conflictDays[c.from] = conflictDays[c.from] || []).push(c);
      (conflictDays[c.to] = conflictDays[c.to] || []).push(c);
    });
    var value = {
      entries: entries,
      byIso: byIso,
      conflicts: conflicts,
      conflictDays: conflictDays,
      weeks: Rota.weeklyLoad(entries, s.maxWeeklyMinutes),
      need: conflicts.length ? conflicts[0].need : Math.round((s.minRestHours || Rota.DEFAULT_REST_HOURS) * 60)
    };
    windows.unshift({ key: key, value: value });
    if (windows.length > 6) windows.length = 6;
    return value;
  }

  /** Fenster um den angezeigten Kalendermonat (ganze Wochen, einen Tag Rand für die Ruhezeit). */
  function monthWindow(App) {
    var first = (App.calendarMonth || T.monthKey(App.date || T.todayISO())) + "-01";
    if (!T.isValidISO(first)) first = T.startOfMonth(T.todayISO());
    return windowPlan(App, T.addDays(T.startOfWeek(first, 1), -8), T.addDays(T.startOfWeek(T.endOfMonth(first), 1), 14));
  }

  function weekWindow(App, iso) {
    var start = T.startOfWeek(iso, firstDayOf(App));
    return windowPlan(App, T.addDays(start, -1), T.addDays(start, 7));
  }

  /* ---- Einen Tag planen ----------------------------------------------- */

  /**
   * Abweichung speichern (target: Vorlagen-id | "free" | null = laut Rhythmus).
   * Ein Tag, der nur die Planung trug, verschwindet beim Zurücksetzen ganz.
   */
  function setPlan(App, iso, target) {
    var value = Rota.overrideFor(settingsOf(App).rota, iso, target === "reset" ? null : target, App.holiday(iso));
    var rec = App.store.getDay(iso);
    var current = rec && rec.plan ? rec.plan : null;
    if (value === current) return false;
    if (value === null) {
      if (Rota.onlyPlan(rec)) App.clearDay(iso);
      else App.saveDay(iso, { plan: null }, { label: "plan" });
    } else {
      App.saveDay(iso, { plan: value }, { label: "plan" });
    }
    var e = Rota.dayPlan(iso, { rota: settingsOf(App).rota, templates: templatesOf(App), record: App.store.getDay(iso), holiday: App.holiday(iso) });
    D.toast(I.t(value === null ? "rota.restored" : "rota.changed", { date: shortDate(iso) }), {
      sub: planText(e),
      icon: "calendar",
      action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
    });
    return true;
  }

  /** „Spätschicht 14:00–22:30“ oder „Frei“ */
  function planText(e) {
    if (e && e.tpl) return shiftName(e.tpl) + " " + timesOf(e.tpl);
    return I.t("rota.free");
  }

  /** Dialog: Plan für einen einzelnen Tag. */
  function openDay(App, iso) {
    if (iso < T.todayISO()) return;
    var s = settingsOf(App);
    var rota = Rota.normalize(s.rota);
    var tpls = s.shiftTemplates || [];
    var rec = App.store.getDay(iso);
    var current = rec && rec.plan ? rec.plan : null;
    var baseId = Rota.cycleId(rota, iso);
    var baseTpl = Rota.findTemplate(tpls, baseId);

    var body = D.el("div.rota-pick");
    body.appendChild(D.el("p.rota-pick-hint", { text: I.t("rota.dayHint") }));
    var list = D.el("div.rota-opts", { role: "group", "aria-label": I.t("rota.dayTitle", { date: longDate(iso) }) });
    body.appendChild(list);
    var m;

    function option(target, code, title, sub, pressed) {
      var btn = D.el("button.rota-opt", { type: "button", "aria-pressed": pressed ? "true" : "false" });
      btn.appendChild(D.el("span.rota-code" + (code === "–" ? ".is-free" : ""), { text: code, "aria-hidden": "true" }));
      var txt = D.el("span.ro-text");
      txt.appendChild(D.el("b", { text: title }));
      if (sub) txt.appendChild(D.el("small", { text: sub }));
      btn.appendChild(txt);
      btn.insertAdjacentHTML("beforeend", D.icon("check"));
      btn.addEventListener("click", function () {
        m.close();
        setPlan(App, iso, target);
      });
      list.appendChild(btn);
    }

    /* Am Feiertag pausiert der Rhythmus (wenn so eingestellt) — dann sagt
       „Laut Rhythmus“ auch „frei“, mit dem Namen des Feiertags */
    var holiday = baseTpl && rota.skipHolidays ? App.holiday(iso) : null;
    var holidayName = holiday ? ((holiday.names && holiday.names[I.getLang()]) || holiday.name || "") : "";
    option(null, codeOf(App, baseTpl && !holiday ? baseId : null), I.t("rota.byCycle"),
      holiday ? I.t("rota.free") + (holidayName ? " · " + holidayName : "")
        : baseTpl ? shiftName(baseTpl) + " · " + timesOf(baseTpl) : I.t("rota.free"), !current);
    tpls.forEach(function (tpl) {
      if (!Rota.shiftTimes(tpl)) return;
      option(tpl.id, codeOf(App, tpl.id), shiftName(tpl), timesOf(tpl), current === tpl.id);
    });
    option(Rota.FREE, "–", I.t("rota.free"), "", current === Rota.FREE);

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    m = D.modal({
      title: I.t("rota.dayTitle", { date: longDate(iso) }),
      body: body,
      size: "slim",
      footer: [cancel],
      focus: ".rota-opt[aria-pressed='true']"
    });
    m.box.classList.add("rota-modal");
    cancel.addEventListener("click", function () { m.close(); });
  }

  function openSettings(App) {
    App.go("settings");
    setTimeout(function () {
      var card = document.getElementById("rota-card");
      if (!card) return;
      try { card.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { card.scrollIntoView(); }
      var sw = card.querySelector("input[type='checkbox']");
      if (sw) { try { sw.focus({ preventScroll: true }); } catch (e2) { /* Fokus ist Kür */ } }
    }, 80);
  }

  /** Text zu einem Ruhezeit-Konflikt, am Tag der zweiten Schicht. */
  function conflictText(App, c) {
    return c.overlap
      ? I.t("rota.overlap", { date: shortDate(c.to) })
      : I.t("rota.restShort", { date: shortDate(c.to), v: App.fmt(c.rest) });
  }

  /** Konflikte für eine Liste: Ruhezeiten (ab heute) und Wochen über der Höchstarbeitszeit. */
  function issuesIn(App, win, from, to) {
    var today = T.todayISO();
    var rests = win.conflicts.filter(function (c) { return c.to >= today && c.to >= from && c.to <= to; });
    var weeks = win.weeks.filter(function (w) {
      return w.over > 0 && w.days === 7 && w.end >= today && w.end >= from && w.start <= to;
    });
    return { rests: rests, weeks: weeks, count: rests.length + weeks.length };
  }

  function issueButtons(App, issues, host) {
    var max = settingsOf(App).maxWeeklyMinutes;
    issues.rests.forEach(function (c) {
      var b = D.el("button.rota-issue", {
        type: "button",
        "data-key": "rota-issue-" + c.to,
        html: D.icon("alert") + "<span>" + D.esc(conflictText(App, c)) + "</span>"
      });
      b.addEventListener("click", function () { openDay(App, c.to); });
      host.appendChild(b);
    });
    issues.weeks.forEach(function (w) {
      var label = I.t("rota.weekOver", { week: I.t("week.kw", { n: T.isoWeek(w.start) }), v: App.fmt(w.net) });
      var b = D.el("button.rota-issue", {
        type: "button",
        "data-key": "rota-over-" + w.start,
        "data-tip": I.t("rota.weekMax", { v: App.fmt(max) }),
        html: D.icon("clock") + "<span>" + D.esc(label) + "</span>"
      });
      b.addEventListener("click", function () {
        App.weekAnchor = w.start;
        App.go("week");
      });
      host.appendChild(b);
    });
  }

  /* ==================================================================== */
  /* Einstellungen                                                         */
  /* ==================================================================== */

  var uid = 0;

  function switchRow(title, hint, checked, onChange) {
    var id = "rota-l-" + (++uid);
    var row = D.el("div.setting-row.is-switch");
    var info = D.el("div.info");
    info.appendChild(D.el("b", { id: id, text: title }));
    if (hint) info.appendChild(D.el("span", { id: id + "-h", text: hint }));
    row.appendChild(info);
    var ctl = D.el("div.ctl");
    var label = D.el("label.switch");
    var input = D.el("input", { type: "checkbox", checked: checked, "aria-labelledby": id, "aria-describedby": hint ? id + "-h" : null });
    input.addEventListener("change", function () { onChange(input.checked); });
    label.appendChild(input);
    label.appendChild(D.el("span.track"));
    ctl.appendChild(label);
    row.appendChild(ctl);
    row.addEventListener("click", function (e) {
      if (e.target.closest("label, button, a, input")) return;
      input.click();
    });
    return row;
  }

  function valueRow(title, hint, control) {
    var id = "rota-l-" + (++uid);
    var row = D.el("div.setting-row.is-value");
    var info = D.el("div.info");
    info.appendChild(D.el("b", { id: id, text: title }));
    if (hint) info.appendChild(D.el("span", { text: hint }));
    row.appendChild(info);
    var ctl = D.el("div.ctl");
    control.setAttribute("aria-labelledby", id);
    ctl.appendChild(control);
    row.appendChild(ctl);
    return row;
  }

  function presetLabel(key) { return I.t("rota.preset." + key); }

  function rotaName(rota) {
    var key = Rota.matchPreset(rota.cycle);
    if (key) return presetLabel(key);
    return rota.name || I.t("rota.custom");
  }

  function settingsCard(host, ctx) {
    var App = ctx.App;
    var box = ctx.section(I.t("rota.title"));
    box.node.classList.add("rota-card");
    box.node.id = "rota-card";
    var body = box.body;
    host.appendChild(box.node);
    draw();
    return null;

    function save(next, extra) {
      var rota = Rota.normalize(next);
      var patch = { rota: { enabled: rota.enabled, anchor: rota.anchor, cycle: rota.cycle, name: rota.name, skipHolidays: rota.skipHolidays } };
      Object.keys(extra || {}).forEach(function (k) { patch[k] = extra[k]; });
      App.store.updateSettings(patch);
    }

    function refocus(key) {
      if (!key) return;
      var n = body.querySelector('[data-key="' + key + '"]');
      if (n) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } }
    }

    function applyPreset(key, current) {
      var p = Rota.preset(key);
      var s = settingsOf(App);
      var ens = Rota.ensureTemplates(s.shiftTemplates || [], p.ids, R.defaultSettings().shiftTemplates);
      var anchor = Rota.anchorForWeek(T.todayISO(), 0, 1);
      save({ enabled: true, anchor: anchor, cycle: p.cycle, name: presetLabel(key), skipHolidays: current.skipHolidays },
        ens.added.length ? { shiftTemplates: ens.templates } : null);
      if (ens.added.length) {
        D.toast(I.t("rota.presetAdded", {
          names: ens.added.map(function (id) { return shiftName(Rota.findTemplate(ens.templates, id)); }).join(", ")
        }), { icon: "zap" });
      }
    }

    function draw(focusKey) {
      D.clear(body);
      var s = settingsOf(App);
      var rota = Rota.normalize(s.rota);
      var tpls = s.shiftTemplates || [];
      var today = T.todayISO();

      body.appendChild(D.el("p.card-hint", { text: I.t("rota.hint") }));
      body.appendChild(switchRow(I.t("rota.enable"), I.t("rota.enableHint"), rota.enabled, function (on) {
        var next = Object.assign({}, rota, { enabled: on });
        if (on && (!next.cycle.length || !next.anchor)) applyPreset("early-late", next);
        else save(next);
        draw();
        var sw = body.querySelector(".setting-row input[type='checkbox']");
        if (sw) sw.focus();
      }));
      if (!rota.enabled) return;
      if (!rota.anchor) rota.anchor = Rota.anchorForWeek(today, 0, 1);
      if (!rota.cycle.length) rota.cycle = [null];

      /* ---- Vorlagen ---- */
      var presets = D.el("div.rota-block");
      presets.appendChild(D.el("div.section-title", { text: I.t("rota.presets") }));
      var chips = D.el("div.chipset.rota-presets", { role: "group", "aria-label": I.t("rota.presets") });
      var matched = Rota.matchPreset(rota.cycle);
      Rota.PRESETS.forEach(function (p) {
        var chip = D.el("button.chip", {
          type: "button", "data-key": "rota-preset-" + p.key,
          "aria-pressed": matched === p.key ? "true" : "false",
          text: presetLabel(p.key)
        });
        chip.addEventListener("click", function () { applyPreset(p.key, rota); draw("rota-preset-" + p.key); });
        chips.appendChild(chip);
      });
      presets.appendChild(chips);
      body.appendChild(presets);

      /* ---- Tag 1 ---- */
      var anchorInput = D.el("input.input", { type: "date", value: rota.anchor, "data-key": "rota-anchor" });
      anchorInput.addEventListener("change", function () {
        if (!T.isValidISO(anchorInput.value)) { anchorInput.value = rota.anchor; return; }
        save(Object.assign({}, rota, { anchor: anchorInput.value }));
        draw("rota-anchor");
      });
      body.appendChild(valueRow(I.t("rota.anchor"), I.t("rota.anchorHint"), anchorInput));

      /* ---- Diese Woche (nur bei ganzen Wochen ab Montag) ---- */
      var weekList = Rota.weeks(rota.cycle);
      var nowWeek = Rota.weekOf(rota, today, 1);
      if (weekList && weekList.length > 1 && nowWeek !== null) {
        var wrow = D.el("div.rota-block");
        var wid = "rota-l-" + (++uid);
        wrow.appendChild(D.el("div.section-title", { id: wid, text: I.t("rota.thisWeek") }));
        var wchips = D.el("div.chipset.rota-weeks", { role: "group", "aria-labelledby": wid });
        weekList.forEach(function (w) {
          var tpl = Rota.findTemplate(tpls, w.main);
          var chip = D.el("button.chip", {
            type: "button", "data-key": "rota-week-" + w.index,
            "aria-pressed": w.index === nowWeek ? "true" : "false",
            "aria-label": I.t("rota.weekN", { n: w.index + 1 }) + (tpl ? ": " + shiftName(tpl) : "")
          });
          chip.appendChild(D.el("span", { text: I.t("rota.weekN", { n: w.index + 1 }) }));
          chip.appendChild(D.el("span.rota-code" + (tpl ? "" : ".is-free"), { text: codeOf(App, tpl ? w.main : null), "aria-hidden": "true" }));
          chip.addEventListener("click", function () {
            save(Object.assign({}, rota, { anchor: Rota.anchorForWeek(today, w.index, 1) }));
            draw("rota-week-" + w.index);
          });
          wchips.appendChild(chip);
        });
        wrow.appendChild(wchips);
        wrow.appendChild(D.el("p.rota-note", { text: I.t("rota.thisWeekHint") }));
        body.appendChild(wrow);
      }

      /* ---- Rhythmus-Raster ---- */
      var block = D.el("div.rota-block");
      var head = D.el("div.rota-cycle-head");
      head.appendChild(D.el("div.section-title", { text: I.t("rota.cycle") + " · " + rotaName(rota) }));
      var lenBox = D.el("div.rota-len");
      var minus = D.el("button.btn.icon.sm", { type: "button", "data-key": "rota-shorter", "aria-label": I.t("rota.shorter"), "data-tip": I.t("rota.shorter"), html: D.icon("minus"), disabled: rota.cycle.length <= 1 });
      var plus = D.el("button.btn.icon.sm", { type: "button", "data-key": "rota-longer", "aria-label": I.t("rota.longer"), "data-tip": I.t("rota.longer"), html: D.icon("plus"), disabled: rota.cycle.length >= Rota.MAX_CYCLE });
      var lenText = D.el("span.rota-len-v", { text: I.tn("rota.length", rota.cycle.length), "aria-live": "polite" });
      minus.addEventListener("click", function () {
        save(Object.assign({}, rota, { cycle: Rota.resize(rota.cycle, rota.cycle.length - 1), name: "" }));
        draw(rota.cycle.length - 1 <= 1 ? "rota-longer" : "rota-shorter");
      });
      plus.addEventListener("click", function () {
        save(Object.assign({}, rota, { cycle: Rota.resize(rota.cycle, rota.cycle.length + 1), name: "" }));
        draw(rota.cycle.length + 1 >= Rota.MAX_CYCLE ? "rota-shorter" : "rota-longer");
      });
      lenBox.appendChild(minus);
      lenBox.appendChild(lenText);
      lenBox.appendChild(plus);
      head.appendChild(lenBox);
      block.appendChild(head);

      var grid = D.el("div.rota-grid", { role: "group", "aria-label": I.t("rota.cycle") });
      var startWd = T.weekdayOf(rota.anchor);
      grid.appendChild(D.el("span.rg-corner", { "aria-hidden": "true" }));
      for (var c = 0; c < 7; c++) {
        grid.appendChild(D.el("span.rg-dow", { text: I.weekdayName((startWd + c) % 7, "short"), "aria-hidden": "true" }));
      }
      var rows = Math.ceil(rota.cycle.length / 7);
      for (var r = 0; r < rows; r++) {
        grid.appendChild(D.el("span.rg-week", { text: I.t("rota.weekShort", { n: r + 1 }), "aria-hidden": "true" }));
        for (var k = 0; k < 7; k++) {
          var i = r * 7 + k;
          if (i >= rota.cycle.length) { grid.appendChild(D.el("span.rg-empty", { "aria-hidden": "true" })); continue; }
          grid.appendChild(cycleCell(rota, tpls, i, startWd));
        }
      }
      block.appendChild(grid);
      var order = tpls.filter(function (t) { return Rota.shiftTimes(t); }).map(function (t) { return codeOf(App, t.id); });
      order.push(I.t("rota.free").toLowerCase());
      block.appendChild(D.el("p.rota-note", { text: I.t("rota.cycleHint", { list: order.join(" → ") }) }));
      body.appendChild(block);

      body.appendChild(switchRow(I.t("rota.skipHolidays"), I.t("rota.skipHolidaysHint"), rota.skipHolidays, function (on) {
        save(Object.assign({}, rota, { skipHolidays: on }));
        draw();
      }));

      /* ---- Vorschau ---- */
      var fd = firstDayOf(App);
      var from = T.startOfWeek(today, fd);
      var win = windowPlan(App, T.addDays(from, -1), T.addDays(today, 63));
      var prev = D.el("div.rota-block");
      prev.appendChild(D.el("div.section-title", { text: I.t("rota.preview") }));
      var pg = D.el("div.rota-preview");
      for (var d = 0; d < 7; d++) pg.appendChild(D.el("span.rg-dow", { text: I.weekdayName((fd + d) % 7, "short"), "aria-hidden": "true" }));
      for (var n = 0; n < 28; n++) pg.appendChild(previewCell(win, T.addDays(from, n), today));
      prev.appendChild(pg);
      prev.appendChild(D.el("p.rota-note", { text: I.t("rota.previewHint") }));
      body.appendChild(prev);

      /* ---- Konflikte ---- */
      var issues = issuesIn(App, win, today, T.addDays(today, 55));
      if (!issues.count) {
        body.appendChild(D.el("p.rota-ok", { html: D.icon("check") + "<span>" + D.esc(I.t("rota.noConflicts")) + "</span>" }));
      } else {
        var note = D.el("div.notice.warn.rota-notice");
        note.innerHTML = D.icon("alert");
        var txt = D.el("div");
        txt.appendChild(D.el("strong", { text: I.tn("rota.issues", issues.count) }));
        if (issues.rests.length) txt.appendChild(D.el("div.sub", { text: I.t("rota.restNeed", { v: App.fmt(win.need) }) }));
        var listHost = D.el("div.rota-issues");
        issueButtons(App, issues, listHost);
        txt.appendChild(listHost);
        note.appendChild(txt);
        body.appendChild(note);
      }

      refocus(focusKey);
    }

    function cycleCell(rota, tpls, i, startWd) {
      var id = rota.cycle[i];
      var tpl = Rota.findTemplate(tpls, id);
      var weekday = I.weekdayName((startWd + i) % 7, "long");
      var cell = D.el("button.rg-cell" + (tpl ? "" : ".is-free"), {
        type: "button",
        "data-key": "rota-cell-" + i,
        text: tpl ? codeOf(App, id) : "–",
        "aria-label": I.t("rota.cellLabel", { n: i + 1, weekday: weekday, shift: tpl ? shiftName(tpl) : I.t("rota.free") }),
        "data-tip": tpl ? shiftName(tpl) + " " + timesOf(tpl) : I.t("rota.free")
      });
      cell.addEventListener("click", function () {
        var cur = Rota.normalize(settingsOf(App).rota);
        var next = cur.cycle.slice();
        var usable = tpls.filter(function (t) { return Rota.shiftTimes(t); });
        next[i] = Rota.nextInCycle(Rota.findTemplate(usable, next[i]) ? next[i] : null, usable);
        save(Object.assign({}, cur, { cycle: next, name: "" }));
        draw("rota-cell-" + i);
      });
      return cell;
    }

    function previewCell(win, iso, today) {
      var e = win.byIso[iso];
      var on = Rota.hasShift(e);
      var past = iso < today;
      var conflict = on && win.conflictDays[iso] && win.conflictDays[iso].some(function (c) { return c.to === iso; });
      var cls = ["rota-day"];
      if (past) cls.push("is-past");
      if (iso === today) cls.push("is-today");
      if (!on) cls.push("is-free");
      if (e && e.source === "override") cls.push("is-override");
      if (conflict) cls.push("is-conflict");
      var dayNum = T.fromISO(iso).getDate();
      var label = longDate(iso) + ": " + (on ? planText(e) : I.t("rota.free")) +
        (e && e.source === "override" ? " (" + I.t("rota.override") + ")" : "") +
        (conflict ? ", " + I.t("rota.conflictTip") : "");
      var node = past
        ? D.el("span", { class: cls.join(" "), "aria-label": label, role: "img" })
        : D.el("button", { type: "button", class: cls.join(" "), "aria-label": label, "data-key": "rota-day-" + iso });
      node.appendChild(D.el("span.dn", { text: dayNum === 1 ? dayNum + "." + (T.fromISO(iso).getMonth() + 1) + "." : String(dayNum), "aria-hidden": "true" }));
      node.appendChild(D.el("span.rota-code" + (on ? "" : ".is-free"), { text: on ? codeOf(App, e.id) : "–", "aria-hidden": "true" }));
      if (!past) node.addEventListener("click", function () { openDay(App, iso); });
      return node;
    }
  }

  ZK.Ext.register("settings.sections", { id: "rota", order: 20, render: settingsCard });

  /* ==================================================================== */
  /* Kalender                                                              */
  /* ==================================================================== */

  ZK.Ext.register("calendar.cell", {
    id: "rota",
    decorate: function (el, ctx) {
      var App = ctx.App;
      if (!isOn(App) || ctx.iso < T.todayISO()) return;
      var win = monthWindow(App);
      var e = win.byIso[ctx.iso];
      if (!Rota.hasShift(e)) return;
      var conflict = (win.conflictDays[ctx.iso] || []).some(function (c) { return c.to === ctx.iso; });
      var name = shiftName(e.tpl) + " " + timesOf(e.tpl);
      var tip = I.t("rota.plannedShift", { name: name }) +
        (e.source === "override" ? " · " + I.t("rota.override") : "") +
        (conflict ? " · " + I.t("rota.conflictTip") : "");
      var badge = D.el("span.rota-badge" + (e.source === "override" ? ".is-override" : "") + (conflict ? ".is-conflict" : ""), {
        text: codeOf(App, e.id), "data-tip": tip, "aria-hidden": "true"
      });
      var dn = el.querySelector(".d .dn");
      if (dn && dn.parentNode) dn.parentNode.insertBefore(badge, dn.nextSibling);
      else el.appendChild(badge);
      if (!el.querySelector(".times")) el.appendChild(D.el("span.rota-times", { text: timesOf(e.tpl), "aria-hidden": "true" }));
      var aria = el.getAttribute("aria-label");
      el.setAttribute("aria-label", (aria ? aria + ", " : "") + tip);
    }
  });

  /**
   * Legende der Kürzel — unter dem Raster in der Legende des Kalenders, wo
   * man nach Bedeutungen sucht (auf dem Handy gibt es keine Tooltips).
   * Nur die Vorlagen, die im Monat ab heute tatsächlich geplant sind.
   */
  function calendarLegend(App, host, win, from, to) {
    var today = T.todayISO();
    var used = [], override = false, conflict = false;
    win.entries.forEach(function (e) {
      if (e.date < today || e.date < from || e.date > to || !Rota.hasShift(e)) return;
      if (used.indexOf(e.id) < 0) used.push(e.id);
      if (e.source === "override") override = true;
      if ((win.conflictDays[e.date] || []).some(function (c) { return c.to === e.date; })) conflict = true;
    });
    if (!used.length) return;
    var group = D.el("div.lg-group.rota-lg");
    templatesOf(App).forEach(function (tpl) {
      if (used.indexOf(tpl.id) < 0) return;
      group.appendChild(D.el("span", { html: '<b class="rota-code">' + D.esc(codeOf(App, tpl.id)) + "</b>" + D.esc(shiftName(tpl)) }));
    });
    var sample = D.esc(codeOf(App, used[0]));
    if (override) group.appendChild(D.el("span", { html: '<b class="rota-code is-override">' + sample + "</b>" + D.esc(I.t("rota.override")) }));
    if (conflict) group.appendChild(D.el("span", { html: '<b class="rota-code is-conflict">' + sample + "</b>" + D.esc(I.t("rota.conflictTip")) }));
    /* Die Legende entsteht erst nach diesem Slot — gleich danach anhängen */
    Promise.resolve().then(function () {
      var legend = host.querySelector(".cal-legend");
      if (legend && !legend.querySelector(".rota-lg")) legend.appendChild(group);
    });
  }

  ZK.Ext.register("calendar.top", {
    id: "rota",
    when: function (ctx) { return isOn(ctx.App); },
    render: function (host, ctx) {
      var App = ctx.App;
      if (ctx.to < T.todayISO()) return null;
      var win = monthWindow(App);
      calendarLegend(App, host, win, ctx.from, ctx.to);
      var issues = issuesIn(App, win, ctx.from, ctx.to);
      if (!issues.count) return null;
      var note = D.el("div.notice.warn.mb-4.rota-notice.rota-cal-notice");
      note.innerHTML = D.icon("alert");
      var txt = D.el("div");
      txt.appendChild(D.el("strong", { text: I.tn("rota.issues", issues.count) }));
      if (issues.rests.length) txt.appendChild(D.el("div.sub", { text: I.t("rota.restNeed", { v: App.fmt(win.need) }) }));
      var list = D.el("div.rota-issues");
      issueButtons(App, issues, list);
      txt.appendChild(list);
      note.appendChild(txt);
      host.appendChild(note);
      return null;
    }
  });

  /* ==================================================================== */
  /* Woche                                                                 */
  /* ==================================================================== */

  /* Der Zeitmassstab der Woche soll geplante Schichten ganz zeigen
     (Nachtschicht bis 06:00 am Folgetag). */
  ZK.Ext.register("week.span", {
    id: "rota",
    collect: function (days, ctx) {
      var App = ctx.App;
      if (!isOn(App) || !days || !days.length) return null;
      var win = weekWindow(App, days[0].date);
      var out = [];
      days.forEach(function (r) {
        var e = win.byIso[r.date];
        if (!Rota.hasShift(e)) return;
        var st = Rota.shiftTimes(e.tpl);
        out.push({ from: st.start, to: st.end });
      });
      return out;
    }
  });

  ZK.Ext.register("week.row", {
    id: "rota",
    decorate: function (el, ctx) {
      var App = ctx.App;
      if (!isOn(App)) return;
      var win = weekWindow(App, ctx.iso);
      var e = win.byIso[ctx.iso];
      if (!Rota.hasShift(e)) return;
      var conflict = (win.conflictDays[ctx.iso] || []).some(function (c) { return c.to === ctx.iso; });
      var code = codeOf(App, e.id);
      var tip = I.t("rota.plannedShift", { name: shiftName(e.tpl) + " " + timesOf(e.tpl) }) +
        (e.source === "override" ? " · " + I.t("rota.override") : "") +
        (conflict ? " · " + I.t("rota.conflictTip") : "");
      var track = el.querySelector(".track");
      var sc = ctx.scale;
      if (track && sc && sc.span > 0) {
        var st = Rota.shiftTimes(e.tpl);
        var left = Math.max(0, (st.start - sc.from) / sc.span * 100);
        var right = Math.min(100, (st.end - sc.from) / sc.span * 100);
        if (right > left) {
          var ghost = D.el("div.rota-ghost" + (conflict ? ".is-conflict" : "") + (e.source === "override" ? ".is-override" : ""), {
            style: { left: left + "%", width: (right - left) + "%" },
            "data-tip": tip
          });
          /* Mit erfassten Zeiten nur der Rahmen — Plan und Ist im Vergleich,
             ohne dass Text unter den Balken hervorschaut */
          var stamped = ctx.res && ctx.res.startTl !== null && ctx.res.startTl !== undefined;
          if (!stamped) {
            ghost.appendChild(D.el("span.rg-code", { text: code }));
            ghost.appendChild(D.el("span.rg-time", { text: timesOf(e.tpl) }));
          }
          track.insertBefore(ghost, track.firstChild);
        }
      }
      var aria = el.getAttribute("aria-label");
      el.setAttribute("aria-label", (aria ? aria + ", " : "") + tip);
    }
  });

  /* ==================================================================== */
  /* Heute                                                                 */
  /* ==================================================================== */

  ZK.Ext.register("today.cards", {
    id: "rota",
    order: 8,       // gleich unter dem Feierabend; nach dem Pausen-Timer, vor der Lückenhilfe
    when: function (ctx) { return isOn(ctx.App); },
    render: function (host, ctx) {
      var App = ctx.App, iso = ctx.iso;
      var card = D.el("section.card.rota-today", { hidden: true, "aria-label": I.t("rota.title") });
      var badge = D.el("span.rt-badge", { "aria-hidden": "true" });
      var main = D.el("div.rt-main");
      var eyebrow = D.el("div.rt-eyebrow");
      var value = D.el("div.rt-value.mono");
      var sub = D.el("div.rt-sub");
      var warn = D.el("div.rt-warn", { hidden: true });
      main.appendChild(eyebrow);
      main.appendChild(value);
      main.appendChild(sub);
      main.appendChild(warn);
      var apply = D.el("button.btn.rt-apply", {
        type: "button", "data-key": "rota-apply",
        html: D.icon("zap") + "<span>" + D.esc(I.t("rota.apply")) + "</span>"
      });
      /* Nur diesen Tag anders planen (Tausch, frei) — derselbe Dialog wie in den Einstellungen */
      var edit = D.el("button.btn.icon.rt-edit", {
        type: "button", "data-key": "rota-edit",
        "aria-label": I.t("rota.dayTitle", { date: longDate(iso) }),
        "data-tip": I.t("rota.dayTitle", { date: shortDate(iso) }),
        html: D.icon("calendar")
      });
      edit.addEventListener("click", function () { openDay(App, iso); });
      var actions = D.el("div.rt-actions");
      actions.appendChild(apply);
      actions.appendChild(edit);
      var entry = null;
      apply.addEventListener("click", function () {
        if (entry && entry.tpl) applyShift(App, iso, entry.tpl);
      });
      card.appendChild(badge);
      card.appendChild(main);
      card.appendChild(actions);
      host.appendChild(card);

      function setText(node, text) { if (node.textContent !== text) node.textContent = text; }

      /* Der Stapel in „Heute“ gehört allen Erweiterungen: zeigt diese Karte
         etwas, ist er sichtbar; sonst nur ausblenden, wenn auch keine andere
         Karte etwas zeigt (gleiche Abmachung wie Lückenhilfe und Zeitschieber). */
      function syncHost() {
        if (!card.hidden) { host.hidden = false; return; }
        for (var i = 0; i < host.children.length; i++) if (!host.children[i].hidden) return;
        host.hidden = true;
      }

      function update(c) {
        c = c || {};
        var rec = c.rec || App.record(iso);
        var win = windowPlan(App, T.addDays(iso, -2), T.addDays(iso, 2));
        entry = win.byIso[iso];
        var m = RU.todayModel({ entry: entry, rec: rec, phase: c.phase, leave: c.leave });
        card.hidden = !m;
        syncHost();
        if (!m) return;
        var tpl = entry.tpl;
        var past = iso < T.todayISO();
        setText(badge, codeOf(App, entry.id));
        card.classList.toggle("is-running", m.mode === "running");
        apply.hidden = m.mode !== "prefill";
        edit.hidden = m.mode !== "prefill" || past;
        actions.hidden = apply.hidden && edit.hidden;
        apply.setAttribute("data-tip", I.t("rota.applyHint"));
        if (m.mode === "prefill") {
          setText(eyebrow, I.t(past ? "rota.byPlan" : "rota.plannedShift", { name: shiftName(tpl) }));
          setText(value, timesOf(tpl));
          var iv = Rota.interval(iso, tpl);
          var parts = [];
          if (tpl.breakStart && tpl.breakEnd && iv && iv.breakMinutes) {
            parts.push(I.t(tpl.breakPaid ? "rota.breakPaidInfo" : "rota.breakInfo", { time: tpl.breakStart + "–" + tpl.breakEnd }));
          }
          if (iv) parts.push(I.t("rota.netInfo", { v: App.fmt(iv.net) }));
          setText(sub, parts.join(" · "));
        } else {
          setText(eyebrow, I.t("rota.endPlan") + " · " + shiftName(tpl));
          setText(value, T.formatHHMM(m.endTl));
          setText(sub, I.t(m.diff > 0 ? "rota.endLater" : "rota.endEarlier", {
            v: App.fmt(Math.abs(m.diff)), time: T.formatHHMM(m.leaveTl)
          }));
        }
        /* Ruhezeit zum Vortag bzw. zur nächsten Schicht */
        var cf = RU.conflictsFor(win.conflicts, iso);
        var bad = m.mode === "prefill" ? (cf.before || cf.after) : cf.after;
        warn.hidden = !bad;
        if (bad) {
          var text = bad.overlap ? I.t("rota.overlapNote")
            : I.t(bad === cf.before ? "rota.restBefore" : "rota.restAfter", { v: App.fmt(bad.rest) });
          if (warn.textContent !== text) warn.innerHTML = D.icon("alert") + "<span>" + D.esc(text) + "</span>";
        }
      }

      update({ rec: App.record(iso) });
      return { update: update };
    }
  });

  /** Vorlage eintragen — genau wie die Schichtknöpfe in „Heute“ (inkl. bezahlter Pause). */
  function applyShift(App, iso, tpl) {
    if (ZK.Views.today && ZK.Views.today.flush) ZK.Views.today.flush();
    var breaks = [];
    if (tpl.breakStart && tpl.breakEnd) {
      breaks.push({
        id: "sh" + Date.now().toString(36),
        label: I.t("day.break"),
        start: tpl.breakStart,
        end: tpl.breakEnd,
        paid: !!tpl.breakPaid
      });
    }
    App.saveDay(iso, { start: tpl.start, end: tpl.end, breaks: breaks, type: null });
    D.toast(shiftName(tpl), {
      sub: tpl.start + " – " + tpl.end,
      icon: "zap",
      action: { label: I.t("common.undo"), onClick: function () { App.undo(); } }
    });
  }

  /* ==================================================================== */
  /* Befehlspalette                                                        */
  /* ==================================================================== */

  function translationsFor(tpls) {
    var out = {};
    tpls.forEach(function (t) {
      var key = t.nameKey || (DEFAULT_IDS.indexOf(t.id) >= 0 ? "shift." + t.id : null);
      if (!key) return;
      out[t.id] = I.LANGS.map(function (l) { return (I.DICT[l] && I.DICT[l][key]) || ""; })
        .concat(I.LANGS.map(function (l) { return (I.DICT[l] && I.DICT[l]["rota.code." + t.id]) || ""; }));
    });
    return out;
  }

  /* Vor den Antworten von „Frag dein Zeitkonto“: wer „plan …“ tippt, will
     planen — Treffer gibt es ohnehin nur mit einem einleitenden Planwort. */
  ZK.Ext.register("palette.commands", {
    id: "rota",
    order: -20,
    collect: function (query, ctx) {
      var App = ctx.App;
      var tpls = templatesOf(App).filter(function (t) { return Rota.shiftTimes(t); });
      var cmd = RU.parseCommand(query, {
        today: T.todayISO(),
        words: RU.wordsFor(tpls, shiftName, codesOf(App), translationsFor(tpls)),
        order: tpls.map(function (t) { return t.id; })
      });
      if (!cmd) return null;
      var group = I.t("rota.title");
      var late = cmd.lead !== "full";
      var openCmd = {
        group: group, icon: "calendar", late: late,
        label: I.t("rota.cmd.open"),
        sub: isOn(App) ? rotaName(rotaOf(App)) : I.t("rota.cmd.off"),
        run: function () { openSettings(App); }
      };
      if (!isOn(App) || !cmd.date) return [openCmd];
      var iso = cmd.date;
      var date = shortDate(iso);
      if (iso < T.todayISO()) {
        return [{ group: group, icon: "alert", warn: true, late: late, label: date, sub: I.t("rota.cmd.past"),
          run: function () { D.toast(I.t("rota.cmd.past"), { tone: "warn", icon: "info" }); } }];
      }
      var rota = rotaOf(App);
      var rec = App.store.getDay(iso);
      var e = Rota.dayPlan(iso, { rota: rota, templates: tpls, record: rec, holiday: App.holiday(iso) });
      var currentId = Rota.hasShift(e) ? e.id : (e.free || e.off ? Rota.FREE : null);
      /* Ganz ausgeschrieben („plan 23.10. nacht“) ist es keine Auswahl mehr,
         sondern DIE Antwort auf die Eingabe: zweizeilig und zuoberst, Enter führt sie aus */
      var exact = !!cmd.target && !late;
      function item(target, name, sub) {
        var cur = target === "reset" ? false : target === currentId;
        return {
          answer: exact,
          group: group, icon: target === Rota.FREE ? "coffee" : target === "reset" ? "refresh" : "zap", late: late,
          label: I.t("rota.cmd.set", { date: date, name: name }),
          sub: sub + (cur ? (sub ? " · " : "") + I.t("rota.cmd.current") : ""),
          run: function () { setPlan(App, iso, target); }
        };
      }
      var out = [];
      var targets = cmd.target ? [cmd.target] : tpls.map(function (t) { return t.id; }).concat([Rota.FREE]);
      if (!cmd.target && rec && rec.plan) targets.push("reset");
      targets.forEach(function (tg) {
        if (tg === Rota.FREE) { out.push(item(tg, I.t("rota.free"), "")); return; }
        if (tg === "reset") {
          var base = Rota.findTemplate(tpls, Rota.cycleId(rota, iso));
          out.push(item(tg, I.t("rota.byCycle"), base ? shiftName(base) + " " + timesOf(base) : I.t("rota.free")));
          return;
        }
        var tpl = Rota.findTemplate(tpls, tg);
        if (tpl) out.push(item(tg, shiftName(tpl), timesOf(tpl)));
      });
      return out;
    }
  });

  RU.openDay = openDay;
  RU.setPlan = setPlan;
  RU.openSettings = openSettings;
})(typeof self !== "undefined" ? self : this);
