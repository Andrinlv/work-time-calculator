/* ==========================================================================
   ZEITKONTO — Pausen-Timer und Signale
   --------------------------------------------------------------------------
   „Pause mit Ansage“: Läuft eine Pause, zeigt „Heute“ eine kleine Karte mit
   Countdown und den Dauern 15 · 30 · 45 · 60 min. Vorgewählt ist die
   Pflichtpause, die heute noch fehlt. Ist die Zeit um, meldet sich Zeitkonto
   dezent: Gong (nur wenn eingeschaltet), Vibration, eine Meldung mit „Pause
   beenden“ und „+5 min“ — und eine Systembenachrichtigung, wenn das Fenster
   gerade nicht vorne ist.

   1. ZK.BreakTimer — Logik ohne DOM (läuft auch in Node): Dauern, fehlende
      Pflichtpause, Plan und Verlängerung, Countdown-Text, welcher Weg eine
      Systembenachrichtigung trägt, was sie sagt und was ihre Knöpfe tun.
   2. Oberfläche: EIN Timer auf Modulebene — er überlebt Neuzeichnen und
      Ansichtswechsel, endet mit der Pause (egal auf welchem Weg) und wird
      nach dem Neuladen aus dem Beginn der offenen Pause wiederhergestellt.
      Dazu die Karte in „Heute“, die Karte „Signale“ in den Einstellungen,
      Befehle in der Palette und der Gong. App.notify (app.js) schickt die
      Systembenachrichtigungen.
   ========================================================================== */

/* ==========================================================================
   1 · LOGIK
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../core/time.js"), require("../../core/rules.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.BreakTimer = factory(root.ZK.Time, root.ZK.Rules);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R) {
  "use strict";

  var DURATIONS = [15, 30, 45, 60];

  /* „+5 min“ an der Pause, „+15 min“ an der Feierabend-Erinnerung */
  var SNOOZE = { "break": 5, leave: 15 };

  /* Gleiches Tag ersetzt eine ältere Benachrichtigung derselben Art */
  var TAGS = { "break": "zeitkonto-pause", leave: "zeitkonto-feierabend", breakDue: "zeitkonto-pflichtpause" };

  var STRINGS = {
    de: {
      "bt.title": "Pausen-Timer",
      "bt.left": "Pause noch",
      "bt.overTitle": "Pause ist um",
      "bt.plan": "{v} ab {time} · Ende {end}",
      "bt.planOver": "{v} ab {time} · geplant bis {end}",
      "bt.missing": "Pflichtpause fehlt noch {v}",
      "bt.durations": "Pausendauer",
      "bt.minutes": "{n} min",
      "bt.plus": "+{n} min",
      "bt.overSub": "{v} Pause seit {time}",
      "bt.extended": "Pause verlängert bis {time}",
      "bt.leaveSoon": "In {v} ist dein Soll erreicht.",
      "bt.snoozed": "Erinnerung in {n} min",
      "bt.dueTitle": "Pause bald fällig",
      "bt.skip.noBreak": "Die Pause ist schon beendet.",
      "bt.skip.notRunning": "Gerade läuft keine Arbeitszeit.",
      "bt.skip.onBreak": "Die Pause läuft schon.",
      "bt.skip.stale": "Diese Meldung gilt nicht mehr.",
      "bt.signals": "Signale",
      "bt.timerHint": "Countdown in der Pause und eine Meldung, wenn sie um ist.",
      "bt.sound": "Ton",
      "bt.soundHint": "Sanfter Gong, wenn die Pause um ist oder der Feierabend naht.",
      "bt.notif": "Systembenachrichtigungen",
      "bt.notif.granted": "Erlaubt",
      "bt.notif.denied": "Im Browser blockiert",
      "bt.notif.default": "Noch nicht erlaubt",
      "bt.notif.unsupported": "In diesem Browser nicht verfügbar",
      "bt.allow": "Erlauben",
      "bt.test": "Signal testen",
      "bt.testTitle": "So meldet sich Zeitkonto",
      "bt.testBody": "Diese Meldung kommt, wenn deine Pause um ist.",
      "bt.honestTitle": "Nur solange Zeitkonto offen ist",
      "bt.honest": "Erinnerungen kommen, solange die App offen ist – auch in einem Hintergrund-Tab. Ist sie geschlossen, bleibt es still: Es gibt keinen Push-Server, alles bleibt auf diesem Gerät.",
      "bt.honestIos": "iPhone und iPad: nur für die App auf dem Home-Bildschirm und mit erlaubten Benachrichtigungen.",
      "bt.cmdStart": "Pause mit Timer: {n} min",
      "bt.cmdSet": "Pausen-Timer auf {n} min",
      "bt.cmdSub": "Zeitkonto meldet sich, wenn sie um ist"
    },
    en: {
      "bt.title": "Break timer",
      "bt.left": "Break ends in",
      "bt.overTitle": "Break is over",
      "bt.plan": "{v} from {time} · ends {end}",
      "bt.planOver": "{v} from {time} · due at {end}",
      "bt.missing": "Statutory break: {v} still missing",
      "bt.durations": "Break length",
      "bt.minutes": "{n} min",
      "bt.plus": "+{n} min",
      "bt.overSub": "{v} break since {time}",
      "bt.extended": "Break extended to {time}",
      "bt.leaveSoon": "You reach your target in {v}.",
      "bt.snoozed": "Reminder in {n} min",
      "bt.dueTitle": "Break due soon",
      "bt.skip.noBreak": "The break has already ended.",
      "bt.skip.notRunning": "No work time is running right now.",
      "bt.skip.onBreak": "You are already on a break.",
      "bt.skip.stale": "This notification is out of date.",
      "bt.signals": "Alerts",
      "bt.timerHint": "Countdown during a break and an alert when it is over.",
      "bt.sound": "Sound",
      "bt.soundHint": "A soft chime when your break is over or it is almost time to leave.",
      "bt.notif": "System notifications",
      "bt.notif.granted": "Allowed",
      "bt.notif.denied": "Blocked in the browser",
      "bt.notif.default": "Not allowed yet",
      "bt.notif.unsupported": "Not available in this browser",
      "bt.allow": "Allow",
      "bt.test": "Test alert",
      "bt.testTitle": "This is how Zeitkonto alerts you",
      "bt.testBody": "You get this alert when your break is over.",
      "bt.honestTitle": "Only while Zeitkonto is open",
      "bt.honest": "Reminders arrive while the app is open – in a background tab, too. Once it is closed, it stays quiet: there is no push server, everything stays on this device.",
      "bt.honestIos": "iPhone and iPad: only for the app on the home screen, with notifications allowed.",
      "bt.cmdStart": "Break with timer: {n} min",
      "bt.cmdSet": "Set break timer to {n} min",
      "bt.cmdSub": "Zeitkonto lets you know when it is over"
    },
    fr: {
      "bt.title": "Minuteur de pause",
      "bt.left": "Fin de pause dans",
      "bt.overTitle": "La pause est terminée",
      "bt.plan": "{v} dès {time} · fin {end}",
      "bt.planOver": "{v} dès {time} · fin prévue {end}",
      "bt.missing": "Pause légale : il manque encore {v}",
      "bt.durations": "Durée de la pause",
      "bt.minutes": "{n} min",
      "bt.plus": "+{n} min",
      "bt.overSub": "{v} de pause depuis {time}",
      "bt.extended": "Pause prolongée jusqu'à {time}",
      "bt.leaveSoon": "Votre objectif est atteint dans {v}.",
      "bt.snoozed": "Rappel dans {n} min",
      "bt.dueTitle": "Pause bientôt obligatoire",
      "bt.skip.noBreak": "La pause est déjà terminée.",
      "bt.skip.notRunning": "Aucun temps de travail en cours.",
      "bt.skip.onBreak": "La pause est déjà en cours.",
      "bt.skip.stale": "Cette notification n'est plus d'actualité.",
      "bt.signals": "Signaux",
      "bt.timerHint": "Compte à rebours pendant la pause et un signal à la fin.",
      "bt.sound": "Son",
      "bt.soundHint": "Un léger carillon à la fin de la pause ou peu avant le départ.",
      "bt.notif": "Notifications système",
      "bt.notif.granted": "Autorisées",
      "bt.notif.denied": "Bloquées par le navigateur",
      "bt.notif.default": "Pas encore autorisées",
      "bt.notif.unsupported": "Non disponibles dans ce navigateur",
      "bt.allow": "Autoriser",
      "bt.test": "Tester le signal",
      "bt.testTitle": "Voici comment Zeitkonto vous prévient",
      "bt.testBody": "Ce message arrive à la fin de votre pause.",
      "bt.honestTitle": "Seulement si Zeitkonto est ouvert",
      "bt.honest": "Les rappels arrivent tant que l'app est ouverte, même dans un onglet en arrière-plan. Fermée, elle reste muette : il n'y a pas de serveur push, tout reste sur cet appareil.",
      "bt.honestIos": "iPhone et iPad : uniquement pour l'app sur l'écran d'accueil, avec les notifications autorisées.",
      "bt.cmdStart": "Pause avec minuteur : {n} min",
      "bt.cmdSet": "Minuteur de pause sur {n} min",
      "bt.cmdSub": "Zeitkonto vous prévient à la fin"
    },
    it: {
      "bt.title": "Timer pausa",
      "bt.left": "Pausa ancora",
      "bt.overTitle": "La pausa è finita",
      "bt.plan": "{v} dalle {time} · fine {end}",
      "bt.planOver": "{v} dalle {time} · fine prevista {end}",
      "bt.missing": "Pausa obbligatoria: mancano ancora {v}",
      "bt.durations": "Durata della pausa",
      "bt.minutes": "{n} min",
      "bt.plus": "+{n} min",
      "bt.overSub": "{v} di pausa dalle {time}",
      "bt.extended": "Pausa prolungata fino alle {time}",
      "bt.leaveSoon": "Raggiungi il tuo obiettivo tra {v}.",
      "bt.snoozed": "Promemoria tra {n} min",
      "bt.dueTitle": "Pausa presto obbligatoria",
      "bt.skip.noBreak": "La pausa è già terminata.",
      "bt.skip.notRunning": "Nessun tempo di lavoro in corso.",
      "bt.skip.onBreak": "La pausa è già in corso.",
      "bt.skip.stale": "Questa notifica non è più attuale.",
      "bt.signals": "Segnali",
      "bt.timerHint": "Conto alla rovescia durante la pausa e un avviso alla fine.",
      "bt.sound": "Suono",
      "bt.soundHint": "Un leggero rintocco a fine pausa o poco prima dell'uscita.",
      "bt.notif": "Notifiche di sistema",
      "bt.notif.granted": "Consentite",
      "bt.notif.denied": "Bloccate dal browser",
      "bt.notif.default": "Non ancora consentite",
      "bt.notif.unsupported": "Non disponibili in questo browser",
      "bt.allow": "Consenti",
      "bt.test": "Prova il segnale",
      "bt.testTitle": "Così ti avvisa Zeitkonto",
      "bt.testBody": "Questo avviso arriva quando la pausa è finita.",
      "bt.honestTitle": "Solo con Zeitkonto aperto",
      "bt.honest": "I promemoria arrivano finché l'app è aperta, anche in una scheda in secondo piano. Chiusa, resta in silenzio: non c'è un server push, tutto resta su questo dispositivo.",
      "bt.honestIos": "iPhone e iPad: solo per l'app nella schermata Home e con le notifiche consentite.",
      "bt.cmdStart": "Pausa con timer: {n} min",
      "bt.cmdSet": "Timer pausa a {n} min",
      "bt.cmdSub": "Zeitkonto ti avvisa alla fine"
    }
  };

  function whole(n) { n = Math.round(+n); return isFinite(n) ? n : 0; }

  /**
   * Pflichtpause, die heute noch fehlt — OHNE die laufende Pause, sonst
   * schrumpfte die Voreinstellung mit jeder Pausenminute.
   * inp: { need (Netto-Soll), worked (Arbeitszeit bisher), legalBreak (alle
   *        Pausen inkl. laufender), openMinutes, ruleset, customTiers }
   * Die Staffeln gelten für die Arbeitszeit: die des ganzen Tages (Soll) oder,
   * wer schon länger gearbeitet hat, die bisherige.
   */
  function missingBreak(inp) {
    inp = inp || {};
    var work = Math.max(whole(inp.need), whole(inp.worked));
    var required = R.requiredBreak(work, inp.ruleset, inp.customTiers);
    var before = Math.max(0, whole(inp.legalBreak) - whole(inp.openMinutes));
    return Math.max(0, required - before);
  }

  /** Voreinstellung: kleinste Dauer, die die fehlende Pflichtpause deckt; ohne Pflicht die kürzeste. */
  function defaultMinutes(missing) {
    for (var i = 0; i < DURATIONS.length; i++) {
      if (DURATIONS[i] >= (missing || 0)) return DURATIONS[i];
    }
    return DURATIONS[DURATIONS.length - 1];
  }

  /** Schlüssel einer laufenden Pause: Tag und Zeile. Eine neue Pause beginnt einen neuen Plan. */
  function keyOf(iso, ob) {
    return iso + "|" + (ob && (ob.ref || ob.start) || "");
  }

  /**
   * Plan für die laufende Pause: { key, minutes, extra, fired, chosen }.
   * Ein gespeicherter Plan gilt nur für dieselbe Pause. Solange niemand
   * eine Dauer gewählt hat, folgt sie der fehlenden Pflichtpause.
   */
  function planFor(saved, key, missing) {
    var def = defaultMinutes(missing);
    if (!saved || typeof saved !== "object" || saved.key !== key) {
      return { key: key, minutes: def, extra: 0, fired: false, chosen: false };
    }
    var chosen = !!saved.chosen && DURATIONS.indexOf(+saved.minutes) >= 0;
    return {
      key: key,
      minutes: chosen ? +saved.minutes : def,
      extra: Math.min(24 * 60, Math.max(0, whole(saved.extra))),
      fired: !!saved.fired,
      chosen: chosen
    };
  }

  /** Andere Dauer gewählt: Verlängerungen verfallen, der Timer läuft neu. */
  function choose(plan, minutes) {
    if (DURATIONS.indexOf(minutes) < 0) return plan;
    return { key: plan.key, minutes: minutes, extra: 0, fired: false, chosen: true };
  }

  /**
   * „+5 min“: ab dem geplanten Ende — oder ab jetzt, wenn die Pause schon
   * überzogen ist. Sonst brächte ein später Klick nur Sekunden.
   */
  function extend(plan, add, elapsedMin) {
    var base = Math.max(plan.minutes + plan.extra, Math.round(elapsedMin || 0));
    return {
      key: plan.key, minutes: plan.minutes,
      extra: base + whole(add) - plan.minutes,
      fired: false, chosen: plan.chosen
    };
  }

  function totalMinutes(plan) { return plan.minutes + plan.extra; }

  /** Ende auf der Zeitachse des Tages (Minuten, nach Mitternacht > 1440). */
  function endTl(ob, plan) { return ob.startTl + totalMinutes(plan); }

  /** Sekunden bis zum Ende; negativ = überzogen. nowSecTl: Sekunden auf der Zeitachse. */
  function secondsLeft(ob, plan, nowSecTl) {
    return endTl(ob, plan) * 60 - nowSecTl;
  }

  /** Anteil der Pause, der vorbei ist (0…1) — für den Ring. */
  function progress(ob, plan, nowSecTl) {
    var total = totalMinutes(plan) * 60;
    if (!(total > 0)) return 1;
    var p = (nowSecTl - ob.startTl * 60) / total;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  /** Countdown „12:30“ bzw. „1:02:05“; aufgerundet, damit „0:00“ erst am Ende steht. */
  function formatLeft(sec) {
    var s = Math.max(0, Math.ceil(isFinite(sec) ? sec : 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ":" + T.pad2(m) : String(m)) + ":" + T.pad2(s % 60);
  }

  /** Überzogen „+2:10“. */
  function formatOver(sec) {
    var s = Math.max(0, Math.floor(isFinite(sec) ? -sec : 0));
    return "+" + formatLeft(s);
  }

  /**
   * Welcher Weg trägt eine Systembenachrichtigung?
   * env: { api (Notification vorhanden), permission, sw (ein Serviceworker
   *        steuert die Seite), mobile } → "sw" | "page" | "none"
   * Chrome auf Android kennt new Notification() nicht („Illegal
   * constructor“) — dort geht es nur über den Serviceworker.
   */
  function channel(env) {
    if (!env || !env.api || env.permission !== "granted") return "none";
    if (env.sw) return "sw";
    return env.mobile ? "none" : "page";
  }

  /**
   * Inhalt einer Benachrichtigung.
   *   kind: "break" | "leave" | "breakDue"
   *   info: { iso, now (ms), minutes, start, leave, inMin, req }
   *   fx:   { t(key, vars), dur(min) }
   * → { tag, title, body, actions: [{ action, title }], data: { kind, date, at } }
   * data.at lässt den Serviceworker veraltete Meldungen erkennen.
   */
  function notice(kind, info, fx) {
    info = info || {};
    var t = fx.t;
    var data = { kind: kind, date: info.iso || "", at: info.now || 0 };
    if (kind === "break") {
      return {
        tag: TAGS["break"], title: t("bt.overTitle"),
        body: t("bt.overSub", { v: fx.dur(info.minutes || 0), time: info.start || "" }),
        actions: [
          { action: "end-break", title: t("day.endBreak") },
          { action: "snooze", title: t("bt.plus", { n: SNOOZE["break"] }) }
        ],
        data: data
      };
    }
    if (kind === "leave") {
      return {
        tag: TAGS.leave, title: t("day.recommendedLeave") + " " + (info.leave || ""),
        body: info.inMin > 0 ? t("bt.leaveSoon", { v: fx.dur(info.inMin) }) : t("toast.goalReached"),
        actions: [
          { action: "stamp-out", title: t("day.stampOut") },
          { action: "snooze", title: t("bt.plus", { n: SNOOZE.leave }) }
        ],
        data: data
      };
    }
    return {
      tag: TAGS.breakDue, title: t("bt.dueTitle"),
      body: t("toast.breakDue", { v: fx.dur(Math.max(1, info.inMin || 0)), req: fx.dur(info.req || 0) }),
      actions: [{ action: "start-break", title: t("day.startBreak") }],
      data: data
    };
  }

  /* Wie lange ein Knopf in einer Benachrichtigung stempeln darf. Ohne
     Push-Server bleibt eine Meldung in der Leiste, auch wenn die App, die
     sie gezeigt hat, längst ersetzt ist (Tab verworfen, Update). */
  var NOTICE_FRESH_MS = 6 * 60 * 60 * 1000;

  /** Meldung zu alt — oder angeblich aus der Zukunft (Uhr verstellt)? at, now: ms */
  function outdated(at, now) {
    if (!(at > 0) || !(now > 0)) return false;
    return now - at > NOTICE_FRESH_MS || at - now > 60000;
  }

  /**
   * Zeitpunkt (ms) der jüngsten Stempelzeit eines Tages — Kommen, Gehen,
   * Pausen, auf der Zeitachse des Tages (Nachtschicht: nach Mitternacht
   * am Folgetag). 0 ohne Kommen. Liegt er nach einer Meldung, ist seither
   * gestempelt worden: Die Meldung beschreibt einen alten Stand.
   */
  function stampedAt(iso, rec) {
    var base = T.fromISO(iso);
    var anchor = rec ? T.parseHHMM(rec.start) : null;
    if (!base || anchor === null) return 0;
    var last = anchor;
    var times = [rec.end];
    (rec.breaks || []).forEach(function (b) { if (b) times.push(b.start, b.end); });
    times.forEach(function (v) {
      var m = T.parseHHMM(v);
      if (m !== null) last = Math.max(last, T.onTimeline(m, anchor));
    });
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, last).getTime();
  }

  /**
   * Was ein Knopf in einer Benachrichtigung auslöst — erst nachdem geprüft
   * ist, ob er noch passt. Gilt für das offene Fenster wie für den Link
   * #/notify/…, den sw.js ohne offenes Fenster öffnet.
   *   info:  { kind, date, at } aus der Benachrichtigung (at: gezeigt um, ms);
   *          link: true für #/notify/… — der muss Tag und Zeitpunkt tragen
   *   state: { date (aktiver Stempeltag), running, onBreak,
   *            now (ms), changedAt (ms, jüngste Stempelzeit — stampedAt) }
   * → { stamp: "out"|"break" } | { snooze: min, kind } | { skip: Grund } | { open: true }
   */
  function route(action, info, state) {
    info = info || {};
    state = state || {};
    if (action === "snooze") {
      var kind = info.kind === "break" ? "break" : "leave";
      if (kind === "break" && !state.onBreak) return { skip: "noBreak" };
      if (!state.running) return { skip: "notRunning" };
      return { snooze: SNOOZE[kind], kind: kind };
    }
    var stamp = { "stamp-out": "out", "end-break": "break", "start-break": "break" }[action];
    if (!stamp) return { open: true };
    if (info.link && !(info.date && info.at > 0)) return { skip: "stale" };
    if (info.date && state.date && info.date !== state.date) return { skip: "stale" };
    if (!state.running) return { skip: "notRunning" };
    if (action === "end-break" && !state.onBreak) return { skip: "noBreak" };
    if (action === "start-break" && state.onBreak) return { skip: "onBreak" };
    if (outdated(info.at, state.now)) return { skip: "stale" };
    // Seither gestempelt (Pause genommen, neue Pause …): der Knopf meint einen alten Stand
    if (info.at > 0 && state.changedAt > info.at) return { skip: "stale" };
    return { stamp: stamp };
  }

  /**
   * Gehört eine noch sichtbare Benachrichtigung weg, weil ihr Anlass vorbei
   * ist? Fremde Tags (z. B. die Probe) bleiben.
   *   data:  { kind, date, at } der Meldung
   *   state: wie bei route, dazu breakDue (Pflichtpause steht noch aus)
   */
  function staleNotice(tag, data, state) {
    data = data || {};
    state = state || {};
    var known = tag === TAGS.leave || tag === TAGS["break"] || tag === TAGS.breakDue;
    if (!known) return false;
    if (data.date && state.date && data.date !== state.date) return true;
    if (outdated(data.at, state.now)) return true;
    if (data.at > 0 && state.changedAt > data.at) return true;
    if (!state.running) return true;
    if (tag === TAGS["break"]) return !state.onBreak;
    if (tag === TAGS.breakDue) return !!state.onBreak || !state.breakDue;
    return false;
  }

  /* Suchwörter der Palette, unabhängig von der eingestellten Sprache */
  var WORDS = ["pause", "pausa", "break", "timer", "minuteur", "countdown", "kaffee", "coffee", "cafe", "znueni", "zvieri"];

  function fold(text) {
    var s = String(text || "").toLowerCase();
    if (typeof s.normalize === "function") s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s;
  }

  /**
   * Palette: passt die Suche zum Pausen-Timer? → { strength: "strong"|"weak",
   * durations: [...], exact } oder null. Eine Zahl („pause 30“) wählt die
   * Dauer (exact).
   */
  function matches(query) {
    var tokens = fold(query).split(/[^a-z0-9]+/).filter(Boolean);
    var strength = null, wanted = [];
    tokens.forEach(function (tok) {
      if (/^\d+$/.test(tok)) {
        if (DURATIONS.indexOf(+tok) >= 0) wanted.push(+tok);
        return;
      }
      if (tok.length < 2) return;
      WORDS.forEach(function (w) {
        // „pau“ trifft „pause“, „pausentimer“ trifft „pause“
        if (w.indexOf(tok) !== 0 && tok.indexOf(w) !== 0) return;
        if (tok.length >= 3) strength = "strong";
        else if (!strength) strength = "weak";
      });
    });
    if (!strength) return null;
    return { strength: strength, durations: wanted.length ? wanted : DURATIONS.slice(), exact: wanted.length > 0 };
  }

  return {
    STRINGS: STRINGS,
    DURATIONS: DURATIONS,
    SNOOZE: SNOOZE,
    TAGS: TAGS,
    missingBreak: missingBreak,
    defaultMinutes: defaultMinutes,
    keyOf: keyOf,
    planFor: planFor,
    choose: choose,
    extend: extend,
    totalMinutes: totalMinutes,
    endTl: endTl,
    secondsLeft: secondsLeft,
    progress: progress,
    formatLeft: formatLeft,
    formatOver: formatOver,
    channel: channel,
    notice: notice,
    NOTICE_FRESH_MS: NOTICE_FRESH_MS,
    stampedAt: stampedAt,
    route: route,
    staleNotice: staleNotice,
    matches: matches
  };
});

/* ==========================================================================
   2 · OBERFLÄCHE
   ========================================================================== */
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;   // in Node nur die Logik oben
  var ZK = root.ZK = root.ZK || {};
  var BT = ZK.BreakTimer, D = ZK.Dom, T = ZK.Time, I = ZK.I18n, S = ZK.TodayState;
  if (!BT || !D || !T || !I || !S || !ZK.Ext) return;

  I.add(BT.STRINGS);

  /* Gewählte Dauer und „schon gemeldet“ je Pause — nur für dieses Gerät.
     Ohne Speicher (privates Fenster) gilt einfach die Voreinstellung. */
  var STORE_KEY = "zeitkonto:breaktimer";

  function load() {
    try { return JSON.parse(root.localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; }
  }
  function save(plan) {
    try { root.localStorage.setItem(STORE_KEY, JSON.stringify(plan)); } catch (e) { /* ohne Speicher weiter */ }
  }

  /* ---- Zustand auf Modulebene: genau EIN Timer ----------------------- */
  var st = {
    App: null,
    cur: null,          // { iso, res, ob, key, plan, missing }
    timer: null,
    dismissToast: null,
    card: null,         // die zuletzt gezeichnete Karte: { node, paint }
    subscribed: false,
    syncSoon: null
  };

  function dur(min) { return T.formatDuration(min, "hm"); }
  function fx() { return { t: I.t, dur: dur }; }
  function nowTlOf(res) { return S.nowOnTimeline(res, T.nowMinutesFloat()); }

  function focused() {
    if (document.visibilityState && document.visibilityState !== "visible") return false;
    try { return typeof document.hasFocus !== "function" || document.hasFocus(); } catch (e) { return true; }
  }

  /** Läuft gerade eine Pause, für die der Timer gilt? → Zustand oder null. */
  function compute(App) {
    var s = App.settings();
    if (s.breakTimer === false) return null;
    var iso = App.activeStampDate();
    var res = App.day(iso);
    if (!res.running) return null;
    var nowTl = nowTlOf(res);
    var ob = S.openBreak(res, App.record(iso), Math.floor(nowTl));
    if (!ob) return null;
    var legal = typeof res.legalBreak === "number" ? res.legalBreak : (res.breakTotal || 0) + (res.paidBreakTotal || 0);
    var missing = BT.missingBreak({
      need: S.neededNet(res),
      worked: res.workingTime,
      legalBreak: legal,
      openMinutes: ob.minutes,
      ruleset: s.breakRuleset,
      customTiers: s.customBreakTiers
    });
    var key = BT.keyOf(iso, ob);
    return { iso: iso, res: res, ob: ob, key: key, missing: missing, plan: BT.planFor(load(), key, missing) };
  }

  /**
   * Gleicht den Timer mit den Daten ab. Wird nach jeder Änderung gerufen
   * (App.scheduleReminder, Store, anderes Fenster, Rückkehr in den Tab)
   * und ist beliebig oft harmlos.
   */
  function sync(App) {
    if (App) st.App = App;
    App = st.App;
    if (!App) return null;
    listen(App);
    clearTimeout(st.timer);
    st.timer = null;

    var c = null;
    try { c = compute(App); } catch (e) { c = null; }
    if (!c) {
      if (st.cur) finish();
      st.cur = null;
      paint();
      return null;
    }
    if (st.cur && st.cur.key !== c.key) finish();   // eine neue Pause: Meldung der alten weg
    var saved = load();
    if (!saved || JSON.stringify(saved) !== JSON.stringify(c.plan)) save(c.plan);
    st.cur = c;

    if (!c.plan.fired) {
      var left = BT.secondsLeft(c.ob, c.plan, nowTlOf(c.res) * 60);
      if (left <= 0) fire();
      else st.timer = setTimeout(onTimer, Math.min(left * 1000 + 40, 2147483000));
    }
    paint();
    return c;
  }

  function onTimer() {
    st.timer = null;
    // Neu rechnen statt dem alten Stand zu trauen: vielleicht ist die Pause
    // inzwischen anders erfasst oder ein anderes Fenster hat gemeldet.
    sync();
  }

  /** Die Pause ist vorbei (beendet, Gehen gestempelt, Timer aus): alles still. */
  function finish() {
    if (st.dismissToast) { try { st.dismissToast(); } catch (e) { /* schon weg */ } }
    st.dismissToast = null;
    if (st.App && st.App.closeNotice) st.App.closeNotice(BT.TAGS["break"]);
  }

  /** Zeit ist um: einmal melden — Gong, Vibration, Meldung, Systembenachrichtigung. */
  function fire() {
    var c = st.cur;
    if (!c) return;
    var saved = load();
    if (saved && saved.key === c.key && saved.fired) { c.plan = BT.planFor(saved, c.key, c.missing); return; }
    c.plan.fired = true;
    save(c.plan);

    var App = st.App;
    if (App.settings().soundEnabled) chime();
    vibrate();
    showToast(c);
    if (!focused() && App.notify) {
      App.notify(BT.notice("break", {
        iso: c.iso, now: Date.now(), minutes: BT.totalMinutes(c.plan), start: c.ob.start
      }, fx()));
    }
  }

  function showToast(c) {
    if (st.dismissToast) { try { st.dismissToast(); } catch (e) { /* egal */ } }
    var App = st.App;
    var title = I.t("bt.overTitle");
    st.dismissToast = D.toast(title, {
      sub: I.t("bt.overSub", { v: App.fmt(BT.totalMinutes(c.plan)), time: c.ob.start }),
      tone: "warn", icon: "coffee", sticky: true,
      action: { label: I.t("day.endBreak"), onClick: function () { App.stamp("break"); } },
      onDismiss: function () { st.dismissToast = null; }
    });
    /* Zweiter Knopf „+5 min“: D.toast kennt nur einen, also hier ergänzen */
    var host = D.qs(".toasts");
    var node = host && host.lastElementChild;
    if (!node || node._title !== title) return;
    node.classList.add("bt-toast");
    var more = D.el("button.act", { type: "button", text: I.t("bt.plus", { n: BT.SNOOZE["break"] }) });
    more.addEventListener("click", function () { snoozeBreak(BT.SNOOZE["break"]); });
    var first = node.querySelector(".act:not(.close)");
    if (first && first.nextSibling) node.insertBefore(more, first.nextSibling);
    else node.appendChild(more);
  }

  /** Andere Dauer gewählt (Chip, Palette). */
  function setMinutes(minutes) {
    if (!st.cur) return;
    var next = BT.choose(st.cur.plan, minutes);
    if (next === st.cur.plan) return;
    if (st.dismissToast) { try { st.dismissToast(); } catch (e) { /* egal */ } st.dismissToast = null; }
    if (st.App && st.App.closeNotice) st.App.closeNotice(BT.TAGS["break"]);
    save(next);
    sync();
  }

  /** „+5 min“ — aus der Karte, der Meldung oder der Systembenachrichtigung. */
  function snoozeBreak(minutes) {
    var c = st.cur || sync();
    if (!c) return false;
    var elapsed = (nowTlOf(c.res) - c.ob.startTl);
    var next = BT.extend(c.plan, minutes || BT.SNOOZE["break"], elapsed);
    if (st.dismissToast) { try { st.dismissToast(); } catch (e) { /* egal */ } st.dismissToast = null; }
    if (st.App && st.App.closeNotice) st.App.closeNotice(BT.TAGS["break"]);
    save(next);
    sync();
    D.toast(I.t("bt.extended", { time: T.formatHHMM(BT.endTl(c.ob, next)) }), { icon: "coffee" });
    return true;
  }

  /* Store, andere Fenster und die Rückkehr in den Tab gleichen ebenfalls ab */
  function listen(App) {
    if (st.subscribed || !App.store || !App.store.subscribe) return;
    st.subscribed = true;
    App.store.subscribe(function (evt) {
      if (evt && (evt.type === "error" || evt.type === "achievements")) return;
      clearTimeout(st.syncSoon);
      st.syncSoon = setTimeout(function () { sync(); }, 0);
    });
  }
  root.addEventListener("storage", function (e) { if (e.key === STORE_KEY && st.App) sync(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && st.App) sync();
  });

  /* ---- Gong und Vibration ------------------------------------------- */
  var audio = null;

  /**
   * Zwei weiche Glockentöne (E5 → C5), synthetisiert — keine Datei. Ein
   * Grundton mit zwei leisen Obertönen und langem Ausklingen; leise genug
   * fürs Grossraumbüro. Browser erlauben Ton erst nach einer Berührung der
   * Seite — die gab es spätestens beim Stempeln der Pause.
   */
  function chime() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      if (!audio) audio = new AC();
      if (audio.state === "suspended" && audio.resume) {
        var resumed = audio.resume();
        if (resumed && resumed.catch) resumed.catch(function () { /* dann eben ohne Ton */ });
      }
      var t0 = audio.currentTime + 0.04;
      var master = audio.createGain();
      master.gain.value = 0.16;
      master.connect(audio.destination);
      [[659.25, 0], [523.25, 0.34]].forEach(function (note) {
        [[1, 1, 1.9], [2, 0.16, 1.1], [3, 0.05, 0.7]].forEach(function (p) {
          var osc = audio.createOscillator();
          var gain = audio.createGain();
          var at = t0 + note[1];
          osc.type = "sine";
          osc.frequency.value = note[0] * p[0];
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(p[1], at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + p[2]);
          osc.connect(gain);
          gain.connect(master);
          osc.start(at);
          osc.stop(at + p[2] + 0.05);
        });
      });
      return true;
    } catch (e) { return false; }
  }

  /* Mit eingeschaltetem Ton den Audio-Kontext bei der ersten Berührung
     anlegen: so darf er später ohne Klick klingen, und der Browser meldet
     keinen blockierten Autostart. */
  function unlockAudio() {
    if (audio || !st.App || !st.App.settings().soundEnabled) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try { audio = new AC(); } catch (e) { audio = null; }
  }
  document.addEventListener("pointerdown", unlockAudio, true);
  document.addEventListener("keydown", unlockAudio, true);

  function vibrate() {
    var nav = root.navigator;
    if (!nav || typeof nav.vibrate !== "function") return;
    // Ohne vorherige Berührung blockiert der Browser (und meckert in der Konsole)
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
    try { nav.vibrate([160, 90, 160]); } catch (e) { /* egal */ }
  }

  /* ---- Karte in „Heute“ ---------------------------------------------- */
  var RING_R = 19;
  var RING_C = 2 * Math.PI * RING_R;
  var uid = 0;

  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function setAttr(node, name, value) { if (node.getAttribute(name) !== value) node.setAttribute(name, value); }

  /* Zwei Fassungen eines Textes im selben Feld (views.css: .bt-alt) — das
     Feld ist so hoch wie die längere. Ist die Pause um, wechselt der Text,
     ohne dass die Karte ihre Höhe ändert (schmale Handys, lange Sprachen). */
  function altText(node) {
    var a = D.el("span"), b = D.el("span", { "aria-hidden": "true" });
    node.classList.add("bt-alt");
    node.appendChild(a);
    node.appendChild(b);
    return function (first, second, showSecond) {
      setText(a, first);
      setText(b, second);
      setAttr(a, "aria-hidden", showSecond ? "true" : "false");
      setAttr(b, "aria-hidden", showSecond ? "false" : "true");
    };
  }

  function renderCard(host, ctx) {
    var App = ctx.App;
    var c = sync(App);
    if (!c || c.iso !== ctx.iso) return null;

    var id = "bt-" + (++uid);
    var node = D.el("section.card.bt-card", { "aria-labelledby": id + "-l" });
    var ring = D.el("div.bt-ring", {
      html: '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="bt-track" cx="22" cy="22" r="' + RING_R + '"/>' +
        '<circle class="bt-arc" cx="22" cy="22" r="' + RING_R + '" stroke-dasharray="' + RING_C.toFixed(2) + '"/></svg>' + D.icon("coffee")
    });
    var arc = ring.querySelector(".bt-arc");

    var main = D.el("div.bt-main");
    var label = D.el("div.bt-label", { id: id + "-l" });
    var value = D.el("div.bt-value.mono", { role: "timer", "aria-live": "off" });
    var sub = D.el("div.bt-sub", { "aria-live": "polite" });
    var missing = D.el("div.bt-missing", { hidden: true });
    main.appendChild(label);
    main.appendChild(value);
    main.appendChild(sub);
    main.appendChild(missing);
    var paintLabel = altText(label);
    var paintSub = altText(sub);
    /* Die fehlende Pflichtpause schwindet mit der Pause — meist genau dann
       auf null, wenn die Zeit um ist. Ihre Zeile bleibt deshalb reserviert,
       solange die Karte steht, sonst rückt alles darunter nach oben. */
    var missingShown = false;

    var side = D.el("div.bt-side");
    var chips = D.el("div.segmented.bt-chips", { role: "group", "aria-label": I.t("bt.durations") });
    BT.DURATIONS.forEach(function (m) {
      var b = D.el("button", { type: "button", "data-min": String(m), text: I.t("bt.minutes", { n: m }) });
      b.addEventListener("click", function () { setMinutes(m); });
      chips.appendChild(b);
    });
    /* Ist die Zeit um, tritt „+5 min“ an die Stelle der Chips — im selben
       Feld, die Karte behält ihre Höhe (views.css). „Pause beenden“ steht
       schon gross in der Stempelleiste darüber. */
    var acts = D.el("div.bt-acts");
    var moreBtn = D.el("button.btn.sm", { type: "button", html: D.icon("plus") + "<span>" + D.esc(I.t("bt.minutes", { n: BT.SNOOZE["break"] })) + "</span>" });
    moreBtn.addEventListener("click", function () { snoozeBreak(BT.SNOOZE["break"]); });
    acts.appendChild(moreBtn);
    side.appendChild(chips);
    side.appendChild(acts);

    node.appendChild(ring);
    node.appendChild(main);
    node.appendChild(side);
    host.appendChild(node);

    function paintCard() {
      var cur = st.cur;
      if (!cur || !document.contains(node)) return;
      var nowSec = nowTlOf(cur.res) * 60;
      var left = BT.secondsLeft(cur.ob, cur.plan, nowSec);
      // Sicherheitsnetz: ein gedrosselter Hintergrund-Timer meldet sich spät
      if (left <= 0 && !cur.plan.fired) { fire(); cur = st.cur; }
      var over = left <= 0;
      var total = BT.totalMinutes(cur.plan);
      var end = T.formatHHMM(BT.endTl(cur.ob, cur.plan));

      node.classList.toggle("is-over", over);
      paintLabel(I.t("bt.left"), I.t("bt.overTitle"), over);
      setText(value, over ? BT.formatOver(left) : BT.formatLeft(left));
      var vars = { v: App.fmt(total), time: cur.ob.start, end: end };
      paintSub(I.t("bt.plan", vars), I.t("bt.planOver", vars), over);
      var miss = Math.max(0, cur.missing - Math.floor(nowSec / 60 - cur.ob.startTl));
      if (miss > 0) { missingShown = true; setText(missing, I.t("bt.missing", { v: App.fmt(miss) })); }
      missing.hidden = !missingShown;
      missing.classList.toggle("is-done", !(miss > 0));
      setAttr(missing, "aria-hidden", miss > 0 ? "false" : "true");
      // Höchstens einmal je Sekunde und nur, wenn sich etwas ändert (überzogen: voller Ring)
      setAttr(arc, "stroke-dashoffset", (RING_C * (1 - BT.progress(cur.ob, cur.plan, nowSec))).toFixed(1));
      D.qsa("button", chips).forEach(function (b) {
        setAttr(b, "aria-pressed", +b.getAttribute("data-min") === cur.plan.minutes && !cur.plan.extra ? "true" : "false");
      });
    }

    st.card = { node: node, paint: paintCard };
    paintCard();
    App.onTick(paintCard);
    return { update: function () { paintCard(); } };
  }

  function paint() {
    if (st.card) { try { st.card.paint(); } catch (e) { /* Karte isolieren */ } }
  }

  ZK.Ext.register("today.cards", {
    id: "breaktimer",
    order: 5,      // zeitkritisch: vor Lückenhilfe und Zeitschieber
    when: function (ctx) {
      var App = ctx.App;
      if (ctx.iso !== App.activeStampDate()) return false;
      var c = compute(App);
      return !!c && c.iso === ctx.iso;
    },
    render: renderCard
  });

  /* ---- Einstellungen: „Signale“ -------------------------------------- */
  function switchRow(title, hint, checked, onChange) {
    var id = "bt-s-" + (++uid);
    var row = D.el("div.setting-row.is-switch");
    var info = D.el("div.info");
    info.appendChild(D.el("b", { id: id, text: title }));
    if (hint) info.appendChild(D.el("span", { id: id + "-h", text: hint }));
    row.appendChild(info);
    var ctl = D.el("div.ctl");
    var lab = D.el("label.switch");
    var input = D.el("input", { type: "checkbox", checked: checked, "aria-labelledby": id });
    if (hint) input.setAttribute("aria-describedby", id + "-h");
    input.addEventListener("change", function () { onChange(input.checked, input); });
    lab.appendChild(input);
    lab.appendChild(D.el("span.track"));
    ctl.appendChild(lab);
    row.appendChild(ctl);
    row.addEventListener("click", function (e) {
      if (e.target.closest("label, button, a, input")) return;
      input.click();
    });
    return row;
  }

  function permission() {
    if (typeof root.Notification === "undefined") return "unsupported";
    return root.Notification.permission || "default";
  }

  function renderSettings(host, ctx) {
    var App = ctx.App;
    var s = App.settings();
    var sec = ctx.section(I.t("bt.signals"), "bell");

    sec.body.appendChild(switchRow(I.t("bt.title"), I.t("bt.timerHint"), s.breakTimer !== false, function (on) {
      App.store.updateSettings({ breakTimer: on });
      sync(App);
    }));
    sec.body.appendChild(switchRow(I.t("bt.sound"), I.t("bt.soundHint"), !!s.soundEnabled, function (on) {
      App.store.updateSettings({ soundEnabled: on });
      if (on) chime();   // Probehören — der Klick erlaubt den Ton
    }));

    /* Stand der Systembenachrichtigungen, mit „Erlauben“, solange gefragt werden darf */
    var id = "bt-s-" + (++uid);
    var row = D.el("div.setting-row.bt-perm");
    var info = D.el("div.info");
    info.appendChild(D.el("b", { id: id, text: I.t("bt.notif") }));
    var state = D.el("span", { id: id + "-h" });
    info.appendChild(state);
    row.appendChild(info);
    var ctl = D.el("div.ctl");
    var allow = D.el("button.btn.sm", { type: "button", text: I.t("bt.allow"), "aria-describedby": id });
    allow.addEventListener("click", function () {
      allow.disabled = true;
      Promise.resolve(App.requestNotifications()).then(function (p) {
        allow.disabled = false;
        paintPermission();
        if (p !== "granted") D.toast(I.t("set.notifDenied"), { tone: "warn" });
      });
    });
    ctl.appendChild(allow);
    row.appendChild(ctl);
    sec.body.appendChild(row);

    function paintPermission() {
      var p = permission();
      setText(state, I.t("bt.notif." + (/^(granted|denied|default)$/.test(p) ? p : "unsupported")));
      state.className = p === "granted" ? "bt-ok" : (p === "denied" ? "bt-no" : "");
      allow.hidden = p !== "default";
    }
    paintPermission();

    var note = D.el("div.notice.info.bt-honest");
    note.innerHTML = D.icon("info") + "<div><strong>" + D.esc(I.t("bt.honestTitle")) + "</strong>" +
      "<div class='sub'>" + D.esc(I.t("bt.honest")) + "</div>" +
      "<div class='sub bt-ios'>" + D.esc(I.t("bt.honestIos")) + "</div></div>";
    sec.body.appendChild(note);

    var test = D.el("button.btn.block.bt-test", { type: "button", html: D.icon("bell") + "<span>" + D.esc(I.t("bt.test")) + "</span>" });
    test.addEventListener("click", function () { testSignal(App); });
    sec.body.appendChild(test);

    host.appendChild(sec.node);
  }

  /** Probe: Gong (auch bei ausgeschaltetem Ton — man will ihn ja hören), Vibration, Meldung, Benachrichtigung. */
  function testSignal(App) {
    chime();
    vibrate();
    D.toast(I.t("bt.testTitle"), { sub: I.t("bt.testBody"), icon: "bell" });
    if (App.notify) {
      App.notify({
        tag: "zeitkonto-test", title: I.t("bt.testTitle"), body: I.t("bt.testBody"),
        actions: [], data: { kind: "test", date: "", at: Date.now() }
      });
    }
  }

  ZK.Ext.register("settings.sections", { id: "breaktimer", order: 30, render: renderSettings });

  /* ---- Befehlspalette ------------------------------------------------- */
  ZK.Ext.register("palette.commands", {
    id: "breaktimer",
    collect: function (query, ctx) {
      var App = ctx.App;
      var hit = BT.matches(query);
      if (!hit || App.settings().breakTimer === false) return null;
      var iso = App.activeStampDate();
      var res = App.day(iso);
      if (!res.running) return null;
      var onBreak = !!compute(App);
      return hit.durations.map(function (m) {
        return {
          group: I.t("cmd.group.actions"),
          icon: "coffee",
          label: I.t(onBreak ? "bt.cmdSet" : "bt.cmdStart", { n: m }),
          sub: I.t("bt.cmdSub"),
          // Ohne Zahl reihen sich die vier Dauern hinter „Pause starten“ ein
          late: hit.strength !== "strong" || !hit.exact,
          run: function () {
            if (!onBreak) App.stamp("break");
            sync(App);
            setMinutes(m);
          }
        };
      });
    }
  });

  BT.sync = sync;
  BT.snoozeBreak = snoozeBreak;
  BT.setMinutes = setMinutes;
  BT.chime = chime;
  BT.state = function () { return st.cur ? { key: st.cur.key, plan: Object.assign({}, st.cur.plan), timer: !!st.timer } : null; };
})(typeof self !== "undefined" ? self : this);
