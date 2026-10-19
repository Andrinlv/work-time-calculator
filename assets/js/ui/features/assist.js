/* ==========================================================================
   ZEITKONTO — Lückenhilfe (Oberfläche)
   --------------------------------------------------------------------------
   „Vergessen zu stempeln? Zeitkonto merkt es und schlägt deine üblichen
   Zeiten vor. Ein Tipp, und der Tag stimmt.“

     today.cards       ruhige Karte mit höchstens zwei Hinweisen
     calendar.top      „Wie üblich ausfüllen“ für den gezeigten Monat
     palette.commands  „lücken“, „vergessen“, „gaps“, „oubli“, „dimenticato“
     settings.sections Schalter und die eigenen üblichen Zeiten

   Die Logik steckt in core/assist.js (ZK.Assist, getestet). Hier wird nur
   gezeichnet, gespeichert und mit „Rückgängig“ gemeldet.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var I = ZK.I18n;

  if (I && I.add) {
    I.add({
      de: {
        "assist.name": "Lückenhilfe",
        "assist.dismiss": "Für heute ausblenden",
        "assist.dismissed": "Für heute ausgeblendet",
        "assist.restore": "Wieder zeigen",
        "assist.more": "+{n} weitere Hinweise",
        "assist.more.one": "+1 weiterer Hinweis",
        "assist.basis.weekday": "Basis: {n} × {wd}",
        "assist.basis.recent": "Basis: letzte {n} Arbeitstage",
        "assist.basis.recent.one": "Basis: letzter Arbeitstag",
        "assist.basis.template": "Basis: Vorlage «{name}»",
        "assist.basis.default": "Basis: Standardzeiten",
        "assist.basisTip": "Median deiner zuletzt erfassten Arbeitstage. Danach lässt sich alles anpassen.",
        "assist.stale": "Hat sich inzwischen erledigt",
        "assist.in.title": "Kommen vergessen?",
        "assist.in.sub": "Üblich um {time}",
        "assist.in.subLunch": "Üblich um {time}, Mittag {from}–{to}",
        "assist.in.apply": "{time} eintragen",
        "assist.in.now": "Jetzt kommen",
        "assist.in.fullTitle": "Heute noch nichts erfasst",
        "assist.in.fullSub": "Üblich {from}–{to}",
        "assist.in.fullApply": "{from}–{to} eintragen",
        "assist.in.done": "Kommen um {time} eingetragen",
        "assist.in.fullDone": "Heute {from}–{to} eingetragen",
        "assist.break.title": "Pause noch offen seit {time}?",
        "assist.break.sub": "Seit {v} in der Pause",
        "assist.break.apply": "Um {time} beenden",
        "assist.break.now": "Jetzt beenden",
        "assist.break.done": "Pause um {time} beendet",
        "assist.leave.title": "Gehen vergessen?",
        "assist.leave.sub": "Da seit {time} · {v} anwesend",
        "assist.leave.apply": "Um {time} gehen",
        "assist.leave.keep": "Läuft noch",
        "assist.leave.kept": "Alles klar — der Tag läuft weiter",
        "assist.leave.done": "Gehen um {time} eingetragen",
        "assist.end.title": "Gehen fehlt am {date}",
        "assist.end.sub": "Kommen {time} — ohne Gehen zählt der Tag nicht",
        "assist.end.apply": "Üblich {time} eintragen",
        "assist.end.open": "Tag öffnen",
        "assist.end.done": "Gehen am {date} um {time} eingetragen",
        "assist.withBreak": "inkl. Pause {from}–{to}",
        "assist.gaps.title": "{n} Tage ohne Erfassung",
        "assist.gaps.title.one": "1 Tag ohne Erfassung",
        "assist.gaps.apply": "Wie üblich ausfüllen",
        "assist.gaps.done": "{n} Tage wie üblich ausgefüllt",
        "assist.gaps.done.one": "1 Tag wie üblich ausgefüllt",
        "assist.gap.title": "Kein Eintrag an diesem Tag",
        "assist.gap.sub": "Üblich {from}–{to}",
        "assist.gap.apply": "{from}–{to} eintragen",
        "assist.gap.done": "{date}: {from}–{to} eingetragen",
        "assist.preview.title": "Wie üblich ausfüllen",
        "assist.preview.lede": "Die Lückenhilfe trägt deine üblichen Zeiten ein. Erfasstes bleibt, wie es ist — und alles lässt sich danach anpassen.",
        "assist.preview.day": "Ganzer Tag",
        "assist.preview.end": "Gehen ergänzen",
        "assist.preview.break": "Pause {from}–{to}",
        "assist.preview.noBreak": "ohne Pause",
        "assist.preview.ok": "{n} Tage ausfüllen",
        "assist.preview.ok.one": "1 Tag ausfüllen",
        "assist.preview.none": "Nichts ausgewählt",
        "assist.cal.fix": "Wie üblich ausfüllen",
        "assist.cal.title": "{n} Tage lassen sich wie üblich ausfüllen",
        "assist.cal.title.one": "1 Tag lässt sich wie üblich ausfüllen",
        "assist.cal.sub": "Die Lückenhilfe schlägt deine üblichen Zeiten vor — mit Vorschau.",
        "assist.cmd.none": "Lückenhilfe: alles erfasst",
        "assist.cmd.noneSub": "Keine vergessenen Stempel in den letzten 31 Tagen",
        "assist.cmd.enable": "Lückenhilfe einschalten",
        "assist.set.switch": "Vergessene Stempel erkennen",
        "assist.set.hint": "Merkt fehlendes Kommen und Gehen, offene Pausen und Tage ohne Eintrag und schlägt deine üblichen Zeiten vor. Eingetragen wird nur auf Tipp.",
        "assist.set.typical": "Deine üblichen Zeiten",
        "assist.set.lunch": "Mittag {from}–{to}",
        "assist.set.noLunch": "ohne Mittag",
        "assist.set.hidden": "Heute {n} Hinweise ausgeblendet",
        "assist.set.hidden.one": "Heute 1 Hinweis ausgeblendet"
      },
      en: {
        "assist.name": "Gap helper",
        "assist.dismiss": "Hide for today",
        "assist.dismissed": "Hidden for today",
        "assist.restore": "Show again",
        "assist.more": "+{n} more hints",
        "assist.more.one": "+1 more hint",
        "assist.basis.weekday": "Based on {n} × {wd}",
        "assist.basis.recent": "Based on the last {n} workdays",
        "assist.basis.recent.one": "Based on the last workday",
        "assist.basis.template": "Based on template “{name}”",
        "assist.basis.default": "Based on standard hours",
        "assist.basisTip": "Median of your most recently recorded workdays. You can adjust everything afterwards.",
        "assist.stale": "Already taken care of",
        "assist.in.title": "Forgot to clock in?",
        "assist.in.sub": "Usually at {time}",
        "assist.in.subLunch": "Usually at {time}, lunch {from}–{to}",
        "assist.in.apply": "Enter {time}",
        "assist.in.now": "Clock in now",
        "assist.in.fullTitle": "Nothing recorded today yet",
        "assist.in.fullSub": "Usually {from}–{to}",
        "assist.in.fullApply": "Enter {from}–{to}",
        "assist.in.done": "Clock-in set to {time}",
        "assist.in.fullDone": "Today recorded as {from}–{to}",
        "assist.break.title": "Break still open since {time}?",
        "assist.break.sub": "On break for {v}",
        "assist.break.apply": "End at {time}",
        "assist.break.now": "End now",
        "assist.break.done": "Break ended at {time}",
        "assist.leave.title": "Forgot to clock out?",
        "assist.leave.sub": "In since {time} · {v} present",
        "assist.leave.apply": "Leave at {time}",
        "assist.leave.keep": "Still working",
        "assist.leave.kept": "Got it — the day keeps running",
        "assist.leave.done": "Clock-out set to {time}",
        "assist.end.title": "Clock-out missing on {date}",
        "assist.end.sub": "In at {time} — without a clock-out the day doesn't count",
        "assist.end.apply": "Enter usual {time}",
        "assist.end.open": "Open day",
        "assist.end.done": "Clock-out on {date} set to {time}",
        "assist.withBreak": "incl. break {from}–{to}",
        "assist.gaps.title": "{n} days not recorded",
        "assist.gaps.title.one": "1 day not recorded",
        "assist.gaps.apply": "Fill in as usual",
        "assist.gaps.done": "{n} days filled in as usual",
        "assist.gaps.done.one": "1 day filled in as usual",
        "assist.gap.title": "No entry on this day",
        "assist.gap.sub": "Usually {from}–{to}",
        "assist.gap.apply": "Enter {from}–{to}",
        "assist.gap.done": "{date}: {from}–{to} recorded",
        "assist.preview.title": "Fill in as usual",
        "assist.preview.lede": "The gap helper enters your usual times. Anything already recorded stays as it is — and you can adjust everything afterwards.",
        "assist.preview.day": "Whole day",
        "assist.preview.end": "Add clock-out",
        "assist.preview.break": "Break {from}–{to}",
        "assist.preview.noBreak": "no break",
        "assist.preview.ok": "Fill in {n} days",
        "assist.preview.ok.one": "Fill in 1 day",
        "assist.preview.none": "Nothing selected",
        "assist.cal.fix": "Fill in as usual",
        "assist.cal.title": "{n} days can be filled in as usual",
        "assist.cal.title.one": "1 day can be filled in as usual",
        "assist.cal.sub": "The gap helper suggests your usual times — with a preview.",
        "assist.cmd.none": "Gap helper: all recorded",
        "assist.cmd.noneSub": "No forgotten stamps in the last 31 days",
        "assist.cmd.enable": "Turn on gap helper",
        "assist.set.switch": "Spot forgotten stamps",
        "assist.set.hint": "Notices missing clock-ins and clock-outs, open breaks and days without an entry, and suggests your usual times. Nothing is entered until you tap.",
        "assist.set.typical": "Your usual times",
        "assist.set.lunch": "Lunch {from}–{to}",
        "assist.set.noLunch": "no lunch",
        "assist.set.hidden": "{n} hints hidden today",
        "assist.set.hidden.one": "1 hint hidden today"
      },
      fr: {
        "assist.name": "Aide aux oublis",
        "assist.dismiss": "Masquer pour aujourd'hui",
        "assist.dismissed": "Masqué pour aujourd'hui",
        "assist.restore": "Afficher à nouveau",
        "assist.more": "+{n} autres indications",
        "assist.more.one": "+1 autre indication",
        "assist.basis.weekday": "Base : {n} × {wd}",
        "assist.basis.recent": "Base : {n} derniers jours de travail",
        "assist.basis.recent.one": "Base : dernier jour de travail",
        "assist.basis.template": "Base : modèle « {name} »",
        "assist.basis.default": "Base : horaires standard",
        "assist.basisTip": "Médiane de vos derniers jours de travail saisis. Tout reste modifiable ensuite.",
        "assist.stale": "Déjà réglé entre-temps",
        "assist.in.title": "Arrivée oubliée ?",
        "assist.in.sub": "D'habitude à {time}",
        "assist.in.subLunch": "D'habitude à {time}, midi {from}–{to}",
        "assist.in.apply": "Saisir {time}",
        "assist.in.now": "Arriver maintenant",
        "assist.in.fullTitle": "Rien de saisi aujourd'hui",
        "assist.in.fullSub": "D'habitude {from}–{to}",
        "assist.in.fullApply": "Saisir {from}–{to}",
        "assist.in.done": "Arrivée saisie à {time}",
        "assist.in.fullDone": "Aujourd'hui saisi : {from}–{to}",
        "assist.break.title": "Pause encore ouverte depuis {time} ?",
        "assist.break.sub": "En pause depuis {v}",
        "assist.break.apply": "Terminer à {time}",
        "assist.break.now": "Terminer maintenant",
        "assist.break.done": "Pause terminée à {time}",
        "assist.leave.title": "Départ oublié ?",
        "assist.leave.sub": "Là depuis {time} · {v} de présence",
        "assist.leave.apply": "Partir à {time}",
        "assist.leave.keep": "Toujours au travail",
        "assist.leave.kept": "D'accord — la journée continue",
        "assist.leave.done": "Départ saisi à {time}",
        "assist.end.title": "Départ manquant le {date}",
        "assist.end.sub": "Arrivée {time} — sans départ, la journée ne compte pas",
        "assist.end.apply": "Saisir {time} habituel",
        "assist.end.open": "Ouvrir le jour",
        "assist.end.done": "Départ du {date} saisi à {time}",
        "assist.withBreak": "pause {from}–{to} incluse",
        "assist.gaps.title": "{n} jours sans saisie",
        "assist.gaps.title.one": "1 jour sans saisie",
        "assist.gaps.apply": "Remplir comme d'habitude",
        "assist.gaps.done": "{n} jours remplis comme d'habitude",
        "assist.gaps.done.one": "1 jour rempli comme d'habitude",
        "assist.gap.title": "Aucune saisie ce jour-là",
        "assist.gap.sub": "D'habitude {from}–{to}",
        "assist.gap.apply": "Saisir {from}–{to}",
        "assist.gap.done": "{date} : {from}–{to} saisi",
        "assist.preview.title": "Remplir comme d'habitude",
        "assist.preview.lede": "L'aide aux oublis saisit vos horaires habituels. Ce qui est déjà saisi reste tel quel — et tout reste modifiable ensuite.",
        "assist.preview.day": "Journée entière",
        "assist.preview.end": "Ajouter le départ",
        "assist.preview.break": "Pause {from}–{to}",
        "assist.preview.noBreak": "sans pause",
        "assist.preview.ok": "Remplir {n} jours",
        "assist.preview.ok.one": "Remplir 1 jour",
        "assist.preview.none": "Aucune sélection",
        "assist.cal.fix": "Remplir comme d'habitude",
        "assist.cal.title": "{n} jours peuvent être remplis comme d'habitude",
        "assist.cal.title.one": "1 jour peut être rempli comme d'habitude",
        "assist.cal.sub": "L'aide aux oublis propose vos horaires habituels — avec aperçu.",
        "assist.cmd.none": "Aide aux oublis : tout est saisi",
        "assist.cmd.noneSub": "Aucun pointage oublié ces 31 derniers jours",
        "assist.cmd.enable": "Activer l'aide aux oublis",
        "assist.set.switch": "Repérer les pointages oubliés",
        "assist.set.hint": "Remarque les arrivées et départs manquants, les pauses restées ouvertes et les jours sans saisie, et propose vos horaires habituels. Rien n'est saisi sans votre accord.",
        "assist.set.typical": "Vos horaires habituels",
        "assist.set.lunch": "Midi {from}–{to}",
        "assist.set.noLunch": "sans pause de midi",
        "assist.set.hidden": "{n} indications masquées aujourd'hui",
        "assist.set.hidden.one": "1 indication masquée aujourd'hui"
      },
      it: {
        "assist.name": "Aiuto dimenticanze",
        "assist.dismiss": "Nascondi per oggi",
        "assist.dismissed": "Nascosto per oggi",
        "assist.restore": "Mostra di nuovo",
        "assist.more": "+{n} altri avvisi",
        "assist.more.one": "+1 altro avviso",
        "assist.basis.weekday": "Base: {n} × {wd}",
        "assist.basis.recent": "Base: ultimi {n} giorni lavorativi",
        "assist.basis.recent.one": "Base: ultimo giorno lavorativo",
        "assist.basis.template": "Base: modello «{name}»",
        "assist.basis.default": "Base: orari standard",
        "assist.basisTip": "Mediana dei tuoi ultimi giorni lavorativi registrati. Dopo puoi modificare tutto.",
        "assist.stale": "Già sistemato nel frattempo",
        "assist.in.title": "Entrata dimenticata?",
        "assist.in.sub": "Di solito alle {time}",
        "assist.in.subLunch": "Di solito alle {time}, pranzo {from}–{to}",
        "assist.in.apply": "Inserisci {time}",
        "assist.in.now": "Entra ora",
        "assist.in.fullTitle": "Oggi ancora nulla registrato",
        "assist.in.fullSub": "Di solito {from}–{to}",
        "assist.in.fullApply": "Inserisci {from}–{to}",
        "assist.in.done": "Entrata inserita alle {time}",
        "assist.in.fullDone": "Oggi registrato: {from}–{to}",
        "assist.break.title": "Pausa ancora aperta dalle {time}?",
        "assist.break.sub": "In pausa da {v}",
        "assist.break.apply": "Termina alle {time}",
        "assist.break.now": "Termina ora",
        "assist.break.done": "Pausa terminata alle {time}",
        "assist.leave.title": "Uscita dimenticata?",
        "assist.leave.sub": "Presente dalle {time} · {v} di presenza",
        "assist.leave.apply": "Esci alle {time}",
        "assist.leave.keep": "Sto ancora lavorando",
        "assist.leave.kept": "D'accordo — la giornata continua",
        "assist.leave.done": "Uscita inserita alle {time}",
        "assist.end.title": "Manca l'uscita il {date}",
        "assist.end.sub": "Entrata {time} — senza uscita la giornata non conta",
        "assist.end.apply": "Inserisci {time} abituale",
        "assist.end.open": "Apri giorno",
        "assist.end.done": "Uscita del {date} inserita alle {time}",
        "assist.withBreak": "pausa {from}–{to} inclusa",
        "assist.gaps.title": "{n} giorni senza registrazione",
        "assist.gaps.title.one": "1 giorno senza registrazione",
        "assist.gaps.apply": "Compila come al solito",
        "assist.gaps.done": "{n} giorni compilati come al solito",
        "assist.gaps.done.one": "1 giorno compilato come al solito",
        "assist.gap.title": "Nessuna registrazione in questo giorno",
        "assist.gap.sub": "Di solito {from}–{to}",
        "assist.gap.apply": "Inserisci {from}–{to}",
        "assist.gap.done": "{date}: {from}–{to} registrato",
        "assist.preview.title": "Compila come al solito",
        "assist.preview.lede": "L'aiuto dimenticanze inserisce i tuoi orari abituali. Ciò che è già registrato resta com'è — e dopo puoi modificare tutto.",
        "assist.preview.day": "Giorno intero",
        "assist.preview.end": "Aggiungi uscita",
        "assist.preview.break": "Pausa {from}–{to}",
        "assist.preview.noBreak": "senza pausa",
        "assist.preview.ok": "Compila {n} giorni",
        "assist.preview.ok.one": "Compila 1 giorno",
        "assist.preview.none": "Nessuna selezione",
        "assist.cal.fix": "Compila come al solito",
        "assist.cal.title": "{n} giorni si possono compilare come al solito",
        "assist.cal.title.one": "1 giorno si può compilare come al solito",
        "assist.cal.sub": "L'aiuto dimenticanze propone i tuoi orari abituali — con anteprima.",
        "assist.cmd.none": "Aiuto dimenticanze: tutto registrato",
        "assist.cmd.noneSub": "Nessuna timbratura dimenticata negli ultimi 31 giorni",
        "assist.cmd.enable": "Attiva l'aiuto dimenticanze",
        "assist.set.switch": "Riconoscere timbrature dimenticate",
        "assist.set.hint": "Nota entrate e uscite mancanti, pause rimaste aperte e giorni senza registrazione e propone i tuoi orari abituali. Si inserisce solo con un tocco.",
        "assist.set.typical": "I tuoi orari abituali",
        "assist.set.lunch": "Pranzo {from}–{to}",
        "assist.set.noLunch": "senza pranzo",
        "assist.set.hidden": "Oggi {n} avvisi nascosti",
        "assist.set.hidden.one": "Oggi 1 avviso nascosto"
      }
    });
  }

  if (typeof document === "undefined" || !ZK.Ext || !ZK.Assist) return;   // Tests: nur die Texte
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, A = ZK.Assist;

  var MAX_CARDS = 2;
  var ICON = { "in": "play", "break": "coffee", leave: "stop", end: "clock", gaps: "calendar", gap: "calendar" };
  /* Live-Hinweise (heute) ruhig in Info-Blau, vergangene Tage in Warnfarbe */
  var TONE = { "in": "info", "break": "info", leave: "info", end: "warn", gaps: "warn", gap: "warn" };
  var KEYWORDS = ["lucke", "luecke", "lucken", "luecken", "luckenhilfe", "vergessen", "nachtragen",
    "gap", "gaps", "missing", "forgot", "forgotten", "oubli", "oublie", "oublies", "lacune", "manquant",
    "dimenticat", "dimenticanz", "lacuna", "mancante"];

  /* ==================================================================== */
  /* Daten                                                                 */
  /* ==================================================================== */

  /* Die Vorbild-Tage ändern sich nur mit den Daten; die Vorschläge zudem
     mit der Minute (laufender Tag). Beides wird darum zwischengespeichert. */
  var cache = { samplesKey: null, samples: null, listKey: null, list: null };

  function trackingStart(App) {
    var s = App.settings();
    var meta = App.store.getMeta ? App.store.getMeta() : null;
    var CW = ZK.CalWeek;
    return CW && CW.trackingStart ? CW.trackingStart(App.store.allDays(), s, meta) : A.trackingStartOf(App.store.allDays(), s, meta);
  }

  function baseOpts(App, now) {
    var today = T.todayISO(now);
    var skey = App.dataRevision() + "|" + today;
    if (cache.samplesKey !== skey) {
      cache.samplesKey = skey;
      cache.samples = A.collectSamples(App.store.allDays(), App.settings(), { before: today, now: now });
    }
    return {
      now: now,
      active: App.activeStampDate(),
      trackingStart: trackingStart(App),
      samples: cache.samples,
      breakLabel: I.t("day.lunch"),
      /* Abgeschlossene Monate nehmen nichts mehr an — dort nichts vorschlagen */
      isLocked: function (iso) { return !!(App.store.isLocked && App.store.isLocked(iso)); }
    };
  }

  /**
   * Vorschläge für die Ansicht eines Tages: für heute bzw. den laufenden Tag
   * alles, für einen früheren Tag nur, was diesen Tag betrifft.
   * opts.all: auch ausgeblendete (Befehlspalette, erneutes Prüfen).
   */
  function suggestionsFor(App, iso, opts) {
    var now = new Date();
    var today = T.todayISO(now);
    var all = !!(opts && opts.all);
    var key = App.dataRevision() + "|" + (iso || "") + "|" + today + "|" + T.nowMinutes(now) + "|" + (all ? 1 : 0);
    if (cache.listKey === key) return cache.list;
    var s = App.settings();
    var list = [];
    if (A.isEnabled(s)) {
      var o = baseOpts(App, now);
      o.includeDismissed = all;
      if (!iso || iso === today || iso === o.active) list = A.detect(App.store.allDays(), s, o);
      else if (iso < today) list = A.detectDay(App.store.allDays(), s, iso, o);
    }
    cache.listKey = key;
    cache.list = list;
    return list;
  }

  /** Den Vorschlag frisch rechnen — die Karte kann eine Minute alt sein. */
  function fresh(App, sug) {
    var pastDay = sug.code === "end" || sug.code === "gap";
    var list = suggestionsFor(App, pastDay ? sug.date : null, { all: true });
    for (var i = 0; i < list.length; i++) if (list[i].key === sug.key) return list[i];
    return null;
  }

  /* ==================================================================== */
  /* Texte                                                                 */
  /* ==================================================================== */

  function dateShort(iso) {
    return I.formatDate(iso, { weekday: "short", day: "numeric", month: "numeric" });
  }

  function basisOf(typ) {
    if (!typ) return "";
    if (typ.source === "weekday") return I.t("assist.basis.weekday", { n: typ.n, wd: I.weekdayName(typ.weekday, "short") });
    if (typ.source === "recent") return I.tn("assist.basis.recent", typ.n);
    if ((typ.source === "template" || typ.source === "plan") && typ.template) {
      var name = typ.template.nameKey ? I.t(typ.template.nameKey) : typ.template.name;
      if (typ.template.nameKey && name === typ.template.nameKey) name = typ.template.name;
      // Schichtplan (features/rota.js): „Laut Plan: Frühschicht“
      if (typ.source === "plan") return I.t("rota.byPlan", { name: name || "" });
      return I.t("assist.basis.template", { name: name || "" });
    }
    return I.t("assist.basis.default");
  }

  function breakText(breaks) {
    var list = (breaks || []).filter(function (b) { return b.start && b.end; });
    if (!list.length) return I.t("assist.preview.noBreak");
    return list.map(function (b) { return I.t("assist.preview.break", { from: b.start, to: b.end }); }).join(" · ");
  }

  /** Titel, Unterzeile und Knöpfe eines Hinweises. */
  function texts(App, sug) {
    var o = { title: "", sub: "", basis: basisOf(sug.typical), primary: null, secondary: null };
    if (sug.code === "in") {
      if (sug.fullDay) {
        o.title = I.t("assist.in.fullTitle");
        o.sub = I.t("assist.in.fullSub", { from: sug.start, to: sug.end }) + " · " + breakText(sug.patch && sug.patch.breaks);
        o.primary = { act: "apply", label: I.t("assist.in.fullApply", { from: sug.start, to: sug.end }) };
      } else {
        o.title = I.t("assist.in.title");
        o.sub = sug.lunch ? I.t("assist.in.subLunch", { time: sug.start, from: sug.lunch.start, to: sug.lunch.end })
          : I.t("assist.in.sub", { time: sug.start });
        // Geplante Schicht: ihre Pause ist nicht unbedingt ein Mittag (Früh 09:00, Nacht 02:00)
        if (sug.lunch && sug.typical && sug.typical.source === "plan") {
          o.sub = I.t("assist.in.sub", { time: sug.start }) + " · " + I.t("assist.preview.break", { from: sug.lunch.start, to: sug.lunch.end });
        }
        o.primary = { act: "apply", label: I.t("assist.in.apply", { time: sug.start }) };
      }
      o.secondary = { act: "now", label: I.t("assist.in.now") };
    } else if (sug.code === "break") {
      o.title = I.t("assist.break.title", { time: sug.since });
      o.sub = I.t("assist.break.sub", { v: App.fmt(sug.minutes) });
      o.primary = { act: "apply", label: I.t("assist.break.apply", { time: sug.end }) };
      o.secondary = { act: "now", label: I.t("assist.break.now") };
    } else if (sug.code === "leave") {
      o.title = I.t("assist.leave.title");
      o.sub = I.t("assist.leave.sub", { time: sug.start, v: App.fmt(sug.presence) });
      o.primary = { act: "apply", label: I.t("assist.leave.apply", { time: sug.end }) };
      o.secondary = { act: "keep", label: I.t("assist.leave.keep") };
    } else if (sug.code === "end") {
      o.title = I.t("assist.end.title", { date: dateShort(sug.date) });
      o.sub = I.t("assist.end.sub", { time: sug.start });
      o.primary = { act: "apply", label: I.t("assist.end.apply", { time: sug.end }) };
      o.secondary = { act: "open", label: I.t("assist.end.open") };
    } else if (sug.code === "gaps") {
      var shown = sug.dates.slice(0, 4).map(dateShort);
      o.title = I.tn("assist.gaps.title", sug.dates.length);
      o.sub = shown.join(" · ") + (sug.dates.length > 4 ? " …" : "");
      o.basis = "";
      o.primary = { act: "preview", label: I.t("assist.gaps.apply") };
    } else if (sug.code === "gap") {
      o.title = I.t("assist.gap.title");
      o.sub = I.t("assist.gap.sub", { from: sug.start, to: sug.end }) + " · " + breakText(sug.patch && sug.patch.breaks);
      o.primary = { act: "apply", label: I.t("assist.gap.apply", { from: sug.start, to: sug.end }) };
    }
    if (sug.addedBreak && sug.patch && sug.patch.breaks) {
      var added = sug.patch.breaks[sug.patch.breaks.length - 1];
      if (added && added.start && added.end) o.sub += " · " + I.t("assist.withBreak", { from: added.start, to: added.end });
    }
    return o;
  }

  /* ==================================================================== */
  /* Aktionen                                                              */
  /* ==================================================================== */

  function undoAction(App) {
    return { label: I.t("common.undo"), onClick: function () { App.undo(); } };
  }

  /** Angefangene Notiz in „Heute“ zuerst sichern — sonst träfe „Rückgängig“ den Text. */
  function flushToday() {
    if (ZK.Views && ZK.Views.today && ZK.Views.today.flush) ZK.Views.today.flush();
  }

  function act(App, sug, kind, done) {
    if (kind === "dismiss" || kind === "keep") return dismiss(App, sug, kind === "keep", done);
    if (kind === "now") {
      App.stamp(sug.code === "break" ? "break" : "in");
      return;
    }
    if (kind === "open") {
      if (ZK.DayModal) ZK.DayModal.open(App, sug.date, function () { App.renderChrome(); App.renderView(); }, { focusEnd: true });
      else App.setDate(sug.date, { view: "today" });
      return;
    }
    if (kind === "preview" || sug.code === "gaps") {
      openPreview(App, sug.dates || [sug.date]);
      return;
    }
    var f = fresh(App, sug);
    if (!f || !f.patch) {
      D.toast(I.t("assist.stale"), { tone: "warn" });
      App.renderView();
      return;
    }
    flushToday();
    App.saveDay(f.date, f.patch, { label: "assist" });
    var res = App.day(f.date);
    var title, sub;
    if (f.code === "in") {
      title = f.fullDay ? I.t("assist.in.fullDone", { from: f.start, to: f.end }) : I.t("assist.in.done", { time: f.start });
    } else if (f.code === "break") {
      title = I.t("assist.break.done", { time: f.end });
    } else if (f.code === "leave") {
      title = I.t("assist.leave.done", { time: f.end });
    } else if (f.code === "end") {
      title = I.t("assist.end.done", { date: dateShort(f.date), time: f.end });
    } else {
      title = I.t("assist.gap.done", { date: dateShort(f.date), from: f.start, to: f.end });
    }
    if (res.complete) sub = I.t("day.net") + " " + App.fmt(res.net) + " · " + I.t("day.balance") + " " + App.fmtSigned(res.balance);
    D.toast(title, { icon: "check", sub: sub, action: undoAction(App) });
  }

  /** Für heute ausblenden — kein Rückgängig-Schritt, damit „Rückgängig“
      im letzten Toast weiter den eingetragenen Tag trifft. */
  function dismiss(App, sug, kept, done) {
    var today = T.todayISO();
    var s = App.settings();
    App.store.updateSettings({ assistDismissed: A.dismiss(s.assistDismissed, today, sug.key) }, { undo: false });
    if (done) done();
    D.toast(kept ? I.t("assist.leave.kept") : I.t("assist.dismissed"), {
      icon: kept ? "play" : "check",
      action: {
        label: I.t("assist.restore"),
        onClick: function () {
          App.store.updateSettings({ assistDismissed: A.undismiss(App.settings().assistDismissed, T.todayISO(), sug.key) }, { undo: false });
          App.renderView();
        }
      }
    });
  }

  /* ---- Vorschau „Wie üblich ausfüllen“ -------------------------------- */
  function openPreview(App, dates) {
    var o = baseOpts(App, new Date());
    var plan = A.planFill(App.store.allDays(), App.settings(), dates, o)
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!plan.length) {
      D.toast(I.t("assist.stale"), { tone: "warn" });
      App.renderView();
      return;
    }
    var chosen = {};
    plan.forEach(function (p) { chosen[p.date] = true; });

    var body = D.el("div.assist-preview");
    body.appendChild(D.el("p.assist-lede", { text: I.t("assist.preview.lede") }));
    var list = D.el("div.assist-plan", { role: "list" });
    plan.forEach(function (p) {
      var row = D.el("div.assist-plan-row", { role: "listitem" });
      var sw = D.el("label.switch");
      var input = D.el("input", { type: "checkbox", checked: true, "aria-label": I.formatDate(p.date, { weekday: "long", day: "numeric", month: "long" }) });
      input.addEventListener("change", function () {
        chosen[p.date] = input.checked;
        row.classList.toggle("is-off", !input.checked);
        refresh();
      });
      sw.appendChild(input);
      sw.appendChild(D.el("span.track"));
      row.appendChild(sw);
      var info = D.el("div.ap-info");
      var top = D.el("div.ap-top");
      top.appendChild(D.el("b.ap-date", { text: dateShort(p.date) }));
      top.appendChild(D.el("span.tag.ap-kind" + (p.kind === "end" ? ".warn" : ""), { text: I.t(p.kind === "end" ? "assist.preview.end" : "assist.preview.day") }));
      info.appendChild(top);
      info.appendChild(D.el("div.ap-times", { text: p.start + "–" + p.end + " · " + breakText(p.breaks) }));
      row.appendChild(info);
      row.appendChild(D.el("span.ap-net.mono", { text: App.fmt(p.net), "aria-label": I.t("day.net") + " " + App.fmt(p.net) }));
      list.appendChild(row);
    });
    body.appendChild(list);

    var cancel = D.el("button.btn", { type: "button", text: I.t("common.cancel") });
    var ok = D.el("button.btn.primary", { type: "button" });
    var m = D.modal({ title: I.t("assist.preview.title"), body: body, footer: [cancel, ok], focus: ok });
    cancel.addEventListener("click", function () { m.close(); });

    function selected() { return plan.filter(function (p) { return chosen[p.date]; }); }
    function refresh() {
      var n = selected().length;
      ok.innerHTML = D.icon("check") + "<span>" + D.esc(n ? I.tn("assist.preview.ok", n) : I.t("assist.preview.none")) + "</span>";
      ok.disabled = !n;
    }
    refresh();

    ok.addEventListener("click", function () {
      var pick = selected().map(function (p) { return p.date; });
      if (!pick.length) return;
      /* Frisch rechnen: in der Zwischenzeit Erfasstes bleibt unangetastet */
      var again = A.planFill(App.store.allDays(), App.settings(), pick, baseOpts(App, new Date()));
      var map = {};
      again.forEach(function (p) { map[p.date] = p.patch; });
      m.close();
      if (!again.length) { D.toast(I.t("assist.stale"), { tone: "warn" }); App.renderView(); return; }
      flushToday();
      // Gezählt wird, was der Speicher angenommen hat
      var written = App.store.setDays(map, { label: "assist" }).written;
      App.afterChange();
      if (written) D.toast(I.tn("assist.gaps.done", written), { tone: "plus", icon: "check", action: undoAction(App) });
    });
  }

  /* ==================================================================== */
  /* Karte in „Heute“                                                      */
  /* ==================================================================== */

  function itemNode(App, sug, onAct, viewIso) {
    var t = texts(App, sug);
    /* Den Tag öffnen, der ohnehin offen ist? Dann bleibt nur die Hauptaktion */
    if (t.secondary && t.secondary.act === "open" && sug.date === viewIso) t.secondary = null;
    var row = D.el("div.assist-item.is-" + (TONE[sug.code] || "info"), { "data-key": sug.key, "data-code": sug.code });
    row.appendChild(D.el("span.assist-ic", { html: D.icon(ICON[sug.code] || "info") }));
    var main = D.el("div.assist-main");
    var txt = D.el("div.assist-txt");
    txt.appendChild(D.el("b.assist-title", { text: t.title }));
    var sub = D.el("span.assist-sub", { text: t.sub });
    if (t.basis) {
      sub.appendChild(document.createTextNode(" · "));
      sub.appendChild(D.el("span.assist-basis", { text: t.basis, "data-tip": sug.typical && sug.typical.source === "plan" ? null : I.t("assist.basisTip") }));
    }
    txt.appendChild(sub);
    main.appendChild(txt);
    var acts = D.el("div.assist-acts");
    [t.primary, t.secondary].forEach(function (a, i) {
      if (!a) return;
      var btn = D.el("button.btn.sm" + (i === 0 ? ".primary" : ""), { type: "button", "data-act": a.act, text: a.label });
      btn.addEventListener("click", function () { onAct(sug, a.act); });
      acts.appendChild(btn);
    });
    main.appendChild(acts);
    row.appendChild(main);
    var x = D.el("button.btn.ghost.icon.sm.assist-x", {
      type: "button", "data-act": "dismiss", "aria-label": I.t("assist.dismiss") + ": " + t.title,
      "data-tip": I.t("assist.dismiss"), html: D.icon("x")
    });
    x.addEventListener("click", function () { onAct(sug, "dismiss"); });
    row.appendChild(x);
    return row;
  }

  ZK.Ext.register("today.cards", {
    id: "assist",
    order: 10,
    when: function (ctx) { return A.isEnabled(ctx.App.settings()); },
    render: function (host, ctx) {
      var card = D.el("section.card.assist-card", { hidden: true, "aria-label": I.t("assist.name") });
      var head = D.el("div.card-head");
      head.appendChild(D.el("h2", { text: I.t("assist.name") }));
      var more = D.el("span.assist-more", { hidden: true });
      head.appendChild(more);
      card.appendChild(head);
      var listNode = D.el("div.assist-list");
      card.appendChild(listNode);
      host.appendChild(card);

      var last = ctx;
      var signature = null;

      function onAct(sug, kind) {
        act(last.App, sug, kind, function () { draw(last, true); });
      }

      function draw(c, keepFocus) {
        last = c || last;
        var App = last.App;
        var all = suggestionsFor(App, last.iso || App.date);
        var shown = all.slice(0, MAX_CARDS);
        var sig = JSON.stringify(shown.map(function (x) {
          var t = texts(App, x);
          return [x.key, t.title, t.sub, t.basis, t.primary && t.primary.label, t.secondary && t.secondary.label];
        })) + "|" + all.length + "|" + I.getLang();
        if (sig === signature) return;
        signature = sig;

        /* Fokus in der Karte merken, damit ein Neuzeichnen ihn nicht verliert */
        var focused = document.activeElement && card.contains(document.activeElement) ? document.activeElement : null;
        var fItem = focused ? focused.closest(".assist-item") : null;
        var fKey = fItem ? fItem.getAttribute("data-key") : null;
        var fAct = focused ? focused.getAttribute("data-act") : null;

        D.clear(listNode);
        shown.forEach(function (sug) { listNode.appendChild(itemNode(App, sug, onAct, last.iso || App.date)); });
        var rest = all.length - shown.length;
        more.hidden = rest <= 0;
        more.textContent = rest > 0 ? I.tn("assist.more", rest) : "";
        card.hidden = !shown.length;
        /* Der Stapel in „Heute“ blendet sich aus, wenn niemand etwas zeigt */
        if (shown.length) host.hidden = false;
        else host.hidden = !Array.prototype.some.call(host.children, function (n) { return !n.hidden; });

        if (focused || keepFocus) {
          var target = null;
          if (fKey) target = listNode.querySelector('.assist-item[data-key="' + fKey + '"] [data-act="' + fAct + '"]');
          if (!target) target = listNode.querySelector(".assist-item .btn.primary");
          if (target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
        }
      }

      draw(ctx);
      return { update: function (c) { draw(c); } };
    }
  });

  /* ==================================================================== */
  /* Kalender: „Wie üblich ausfüllen“ für den gezeigten Monat              */
  /* ==================================================================== */

  ZK.Ext.register("calendar.top", {
    id: "assist",
    order: 10,
    when: function (ctx) { return A.isEnabled(ctx.App.settings()); },
    render: function (host, ctx) {
      var App = ctx.App;
      var now = new Date();
      var today = T.todayISO(now);
      if (!ctx.from || ctx.from >= today) return null;
      var o = baseOpts(App, now);
      var found = A.scan(App.store.allDays(), App.settings(), {
        from: ctx.from, to: ctx.to, now: now, active: o.active, trackingStart: o.trackingStart, isLocked: o.isLocked
      });
      var dates = found.incomplete.concat(found.gaps);
      if (!dates.length) return null;
      var plan = A.planFill(App.store.allDays(), App.settings(), dates, o);
      if (!plan.length) return null;
      var picked = plan.map(function (p) { return p.date; });

      var btn = D.el("button.assist-calfix", {
        type: "button",
        html: D.icon("zap") + "<span>" + D.esc(I.t("assist.cal.fix")) + "</span>",
        "aria-label": I.t("assist.cal.fix") + " — " + I.tn("assist.cal.title", plan.length),
        "data-tip": I.tn("assist.cal.title", plan.length)
      });
      btn.addEventListener("click", function () { openPreview(App, picked); });

      /* Gibt es schon den Hinweis des Kalenders, gehört der Knopf dorthin —
         sonst steht eine eigene, ruhige Zeile über dem Raster. */
      var notices = host.querySelectorAll(".cal-notice .cal-fix-list");
      var list = notices.length ? notices[notices.length - 1] : null;
      if (list) {
        list.appendChild(btn);
        return null;
      }
      var note = D.el("div.notice.info.mb-4.assist-calnote");
      note.innerHTML = D.icon("zap");
      var txt = D.el("div");
      txt.appendChild(D.el("strong", { text: I.tn("assist.cal.title", plan.length) }));
      txt.appendChild(D.el("div.sub", { text: I.t("assist.cal.sub") }));
      var row = D.el("div.cal-fix-list");
      row.appendChild(btn);
      txt.appendChild(row);
      note.appendChild(txt);
      host.appendChild(note);
      return null;
    }
  });

  /* ==================================================================== */
  /* Befehlspalette                                                        */
  /* ==================================================================== */

  function norm(s) {
    s = String(s || "").toLowerCase().trim();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* alte Browser */ }
    return s;
  }

  /** 0 = passt nicht · 1 = angefangenes Stichwort („verg“) · 2 = ganzes Stichwort */
  function matches(query) {
    var q = norm(query);
    if (q.length < 3) return 0;
    var hit = 0;
    KEYWORDS.forEach(function (k) {
      if (q.indexOf(k) >= 0) hit = 2;
      else if (!hit && k.indexOf(q) === 0) hit = 1;
    });
    return hit;
  }

  ZK.Ext.register("palette.commands", {
    id: "assist",
    collect: function (query, ctx) {
      var hit = matches(query);
      if (!hit) return [];
      /* Ein angefangenes Wort rangiert hinter den echten Befehlen */
      var late = hit < 2;
      var App = ctx.App;
      var group = I.t("assist.name");
      if (!A.isEnabled(App.settings())) {
        return [{
          group: group, icon: "settings", label: I.t("assist.cmd.enable"), late: late,
          run: function () { App.store.updateSettings({ assist: true }); App.renderView(); }
        }];
      }
      var list = suggestionsFor(App, null, { all: true });
      if (!list.length) {
        return [{ group: group, icon: "check", label: I.t("assist.cmd.none"), sub: I.t("assist.cmd.noneSub"), late: late, run: function () { App.go("calendar"); } }];
      }
      return list.map(function (sug) {
        var t = texts(App, sug);
        return {
          group: group,
          icon: ICON[sug.code] || "info",
          label: t.title,
          sub: t.primary ? t.primary.label : "",
          late: late,
          run: function () { act(App, sug, t.primary ? t.primary.act : "apply"); }
        };
      });
    }
  });

  /* ==================================================================== */
  /* Einstellungen                                                         */
  /* ==================================================================== */

  var uid = 0;
  function switchRow(title, hint, checked, onChange) {
    var id = "assist-l-" + (++uid);
    var row = D.el("div.setting-row.is-switch");
    var info = D.el("div.info");
    info.appendChild(D.el("b", { id: id, text: title }));
    info.appendChild(D.el("span", { id: id + "-h", text: hint }));
    row.appendChild(info);
    var ctl = D.el("div.ctl");
    var label = D.el("label.switch");
    var input = D.el("input", { type: "checkbox", checked: checked, "aria-labelledby": id, "aria-describedby": id + "-h" });
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

  function typicalTable(App) {
    var s = App.settings();
    var now = new Date();
    var samples = baseOpts(App, now).samples;
    var wrap = D.el("div.assist-typ");
    wrap.appendChild(D.el("div.section-title", { text: I.t("assist.set.typical") }));
    var first = s.firstDayOfWeek === 0 ? 0 : 1;
    for (var k = 0; k < 7; k++) {
      var wd = (first + k) % 7;
      if (!(R.baseTargetFor(null, s, wd) > 0)) continue;
      var typ = A.typicalFromSamples(samples, wd, s);
      var row = D.el("div.assist-typ-row");
      row.appendChild(D.el("b.at-day", { text: I.weekdayName(wd, "short") }));
      row.appendChild(D.el("span.at-span.mono", { text: typ.text.start + "–" + typ.text.end }));
      row.appendChild(D.el("span.at-lunch", {
        text: typ.lunch ? I.t("assist.set.lunch", { from: typ.text.lunchStart, to: typ.text.lunchEnd }) : I.t("assist.set.noLunch")
      }));
      row.appendChild(D.el("span.at-basis", { text: basisOf(typ) }));
      wrap.appendChild(row);
    }
    return wrap;
  }

  ZK.Ext.register("settings.sections", {
    id: "assist",
    order: 10,
    render: function (grid, ctx) {
      var App = ctx.App;
      var sec = ctx.section(I.t("assist.name"), "zap");
      sec.node.classList.add("assist-set");
      var extra = D.el("div.assist-set-extra");
      sec.body.appendChild(switchRow(I.t("assist.set.switch"), I.t("assist.set.hint"), A.isEnabled(App.settings()), function (on) {
        App.store.updateSettings({ assist: on });
        extra.hidden = !on;
      }));
      extra.hidden = !A.isEnabled(App.settings());
      extra.appendChild(typicalTable(App));

      var today = T.todayISO();
      var hidden = (App.settings().assistDismissed || {})[today];
      if (Array.isArray(hidden) && hidden.length) {
        var line = D.el("div.assist-hidden");
        line.appendChild(D.el("span", { text: I.tn("assist.set.hidden", hidden.length) }));
        var restore = D.el("button.btn.sm", { type: "button", text: I.t("assist.restore") });
        restore.addEventListener("click", function () {
          App.store.updateSettings({ assistDismissed: A.undismiss(App.settings().assistDismissed, T.todayISO()) }, { undo: false });
          line.parentNode.removeChild(line);
        });
        line.appendChild(restore);
        extra.appendChild(line);
      }
      sec.body.appendChild(extra);
      grid.appendChild(sec.node);
    }
  });

  /* Für Tests und andere Module */
  ZK.AssistUI = { suggestionsFor: suggestionsFor, texts: texts, matches: matches, openPreview: openPreview };
})(typeof self !== "undefined" ? self : this);
