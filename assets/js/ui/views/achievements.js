/* ==========================================================================
   ZEITKONTO — Ansicht „Erfolge“
   --------------------------------------------------------------------------
   Stufe, Serien und Abzeichen. Oben steht, was als Nächstes erreichbar ist
   — mit einem konkreten Schritt statt nur einem Fortschrittsbalken.
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, I = ZK.I18n;

  I.add({
    de: {
      "ach.next": "Als Nächstes",
      "ach.allDone": "Alle Abzeichen freigeschaltet — stark!",
      "ach.since": "seit {date}",
      "ach.earlyLate": "Früh / spät",
      "ach.levelAria": "Stufe {n}: {p} % auf dem Weg zu Stufe {next}",
      "ach.hint.days": "Noch {n} Tage erfassen",
      "ach.hint.days.one": "Noch 1 Tag erfassen",
      "ach.hint.streak": "Noch {n} Arbeitstage am Stück erfassen",
      "ach.hint.streak.one": "Noch 1 Arbeitstag am Stück erfassen",
      "ach.hint.perfect": "Noch {n} perfekte Wochen: jeden Arbeitstag erfassen, Wochensaldo nicht im Minus",
      "ach.hint.perfect.one": "Noch 1 perfekte Woche: jeden Arbeitstag erfassen, Wochensaldo nicht im Minus",
      "ach.hint.fullMonth": "Einen Monat ohne Lücke erfassen",
      "ach.hint.zenMonth": "Einen lückenlosen Monat mit Saldo innerhalb ±1 h abschliessen",
      "ach.hint.early": "Noch {n}× vor 07:00 beginnen",
      "ach.hint.late": "Noch {n}× nach 19:00 Feierabend machen",
      "ach.hint.breaks": "Noch {n} Tage mit vollständig erfasster Pause",
      "ach.hint.breaks.one": "Noch 1 Tag mit vollständig erfasster Pause",
      "ach.hint.punctual": "Noch {n}× innert ±15 min zur empfohlenen Zeit gehen",
      "ach.hint.home": "Noch {n} Homeoffice-Tage",
      "ach.hint.home.one": "Noch 1 Homeoffice-Tag",
      "ach.hint.vacation": "Noch {n} Ferientage eintragen",
      "ach.hint.vacation.one": "Noch 1 Ferientag eintragen",
      "ach.hint.hours": "Noch {n} Stunden erfassen",
      "ach.hint.hours.one": "Noch 1 Stunde erfassen",
      "ach.hint.notes": "Noch {n} Tage mit Notiz",
      "ach.hint.notes.one": "Noch 1 Tag mit Notiz",
      "ach.hint.months": "In {n} weiteren Monaten erfassen",
      "ach.hint.months.one": "In 1 weiteren Monat erfassen",
      "ach.hint.export": "Einmal eine Sicherung exportieren ({where})",
      "ach.hint.balanced": "Gesamtsaldo auf ±30 min bringen (ab 20 erfassten Tagen)"
    },
    en: {
      "ach.next": "Up next",
      "ach.allDone": "All badges unlocked — impressive!",
      "ach.since": "since {date}",
      "ach.earlyLate": "Early / late",
      "ach.levelAria": "Level {n}: {p}% of the way to level {next}",
      "ach.hint.days": "Record {n} more days",
      "ach.hint.days.one": "Record 1 more day",
      "ach.hint.streak": "Record {n} more working days in a row",
      "ach.hint.streak.one": "Record 1 more working day in a row",
      "ach.hint.perfect": "{n} more perfect weeks: record every working day, week not in debit",
      "ach.hint.perfect.one": "1 more perfect week: record every working day, week not in debit",
      "ach.hint.fullMonth": "Record a whole month without gaps",
      "ach.hint.zenMonth": "Close a gap-free month within ±1 h",
      "ach.hint.early": "Start before 07:00 {n} more times",
      "ach.hint.early.one": "Start before 07:00 once more",
      "ach.hint.late": "Finish after 19:00 {n} more times",
      "ach.hint.late.one": "Finish after 19:00 once more",
      "ach.hint.breaks": "{n} more days with the full break recorded",
      "ach.hint.breaks.one": "1 more day with the full break recorded",
      "ach.hint.punctual": "Leave within ±15 min of the suggested time {n} more times",
      "ach.hint.punctual.one": "Leave within ±15 min of the suggested time once more",
      "ach.hint.home": "{n} more home office days",
      "ach.hint.home.one": "1 more home office day",
      "ach.hint.vacation": "Enter {n} more vacation days",
      "ach.hint.vacation.one": "Enter 1 more vacation day",
      "ach.hint.hours": "Record {n} more hours",
      "ach.hint.hours.one": "Record 1 more hour",
      "ach.hint.notes": "{n} more days with a note",
      "ach.hint.notes.one": "1 more day with a note",
      "ach.hint.months": "Record in {n} more months",
      "ach.hint.months.one": "Record in 1 more month",
      "ach.hint.export": "Export a backup once ({where})",
      "ach.hint.balanced": "Bring the total balance within ±30 min (from 20 recorded days)"
    },
    fr: {
      "ach.next": "Prochaines étapes",
      "ach.allDone": "Tous les badges débloqués — bravo !",
      "ach.since": "depuis le {date}",
      "ach.earlyLate": "Tôt / tard",
      "ach.levelAria": "Niveau {n} : {p} % du chemin vers le niveau {next}",
      "ach.hint.days": "Encore {n} jours à saisir",
      "ach.hint.days.one": "Encore 1 jour à saisir",
      "ach.hint.streak": "Encore {n} jours ouvrés d’affilée à saisir",
      "ach.hint.streak.one": "Encore 1 jour ouvré d’affilée à saisir",
      "ach.hint.perfect": "Encore {n} semaines parfaites : saisir chaque jour ouvré, solde hebdo non négatif",
      "ach.hint.perfect.one": "Encore 1 semaine parfaite : saisir chaque jour ouvré, solde hebdo non négatif",
      "ach.hint.fullMonth": "Saisir un mois entier sans lacune",
      "ach.hint.zenMonth": "Boucler un mois complet avec un solde à ±1 h",
      "ach.hint.early": "Commencer avant 07:00 encore {n} fois",
      "ach.hint.early.one": "Commencer avant 07:00 encore 1 fois",
      "ach.hint.late": "Finir après 19:00 encore {n} fois",
      "ach.hint.late.one": "Finir après 19:00 encore 1 fois",
      "ach.hint.breaks": "Encore {n} jours avec la pause complète saisie",
      "ach.hint.breaks.one": "Encore 1 jour avec la pause complète saisie",
      "ach.hint.punctual": "Partir à ±15 min de l’heure conseillée encore {n} fois",
      "ach.hint.punctual.one": "Partir à ±15 min de l’heure conseillée encore 1 fois",
      "ach.hint.home": "Encore {n} jours de télétravail",
      "ach.hint.home.one": "Encore 1 jour de télétravail",
      "ach.hint.vacation": "Saisir encore {n} jours de vacances",
      "ach.hint.vacation.one": "Saisir encore 1 jour de vacances",
      "ach.hint.hours": "Encore {n} heures à saisir",
      "ach.hint.hours.one": "Encore 1 heure à saisir",
      "ach.hint.notes": "Encore {n} jours avec une note",
      "ach.hint.notes.one": "Encore 1 jour avec une note",
      "ach.hint.months": "Saisir dans {n} mois de plus",
      "ach.hint.months.one": "Saisir dans 1 mois de plus",
      "ach.hint.export": "Exporter une sauvegarde ({where})",
      "ach.hint.balanced": "Ramener le solde total à ±30 min (dès 20 jours saisis)"
    },
    it: {
      "ach.next": "Prossimi traguardi",
      "ach.allDone": "Tutti i distintivi sbloccati — complimenti!",
      "ach.since": "dal {date}",
      "ach.earlyLate": "Presto / tardi",
      "ach.levelAria": "Livello {n}: {p}% verso il livello {next}",
      "ach.hint.days": "Registra ancora {n} giorni",
      "ach.hint.days.one": "Registra ancora 1 giorno",
      "ach.hint.streak": "Registra ancora {n} giorni lavorativi di fila",
      "ach.hint.streak.one": "Registra ancora 1 giorno lavorativo di fila",
      "ach.hint.perfect": "Ancora {n} settimane perfette: registra ogni giorno lavorativo, saldo settimanale non negativo",
      "ach.hint.perfect.one": "Ancora 1 settimana perfetta: registra ogni giorno lavorativo, saldo settimanale non negativo",
      "ach.hint.fullMonth": "Registra un mese intero senza lacune",
      "ach.hint.zenMonth": "Chiudi un mese completo con saldo entro ±1 h",
      "ach.hint.early": "Inizia prima delle 07:00 ancora {n} volte",
      "ach.hint.early.one": "Inizia prima delle 07:00 ancora 1 volta",
      "ach.hint.late": "Finisci dopo le 19:00 ancora {n} volte",
      "ach.hint.late.one": "Finisci dopo le 19:00 ancora 1 volta",
      "ach.hint.breaks": "Ancora {n} giorni con la pausa completa registrata",
      "ach.hint.breaks.one": "Ancora 1 giorno con la pausa completa registrata",
      "ach.hint.punctual": "Esci entro ±15 min dall’ora consigliata ancora {n} volte",
      "ach.hint.punctual.one": "Esci entro ±15 min dall’ora consigliata ancora 1 volta",
      "ach.hint.home": "Ancora {n} giorni di telelavoro",
      "ach.hint.home.one": "Ancora 1 giorno di telelavoro",
      "ach.hint.vacation": "Inserisci ancora {n} giorni di vacanza",
      "ach.hint.vacation.one": "Inserisci ancora 1 giorno di vacanza",
      "ach.hint.hours": "Registra ancora {n} ore",
      "ach.hint.hours.one": "Registra ancora 1 ora",
      "ach.hint.notes": "Ancora {n} giorni con una nota",
      "ach.hint.notes.one": "Ancora 1 giorno con una nota",
      "ach.hint.months": "Registra in altri {n} mesi",
      "ach.hint.months.one": "Registra in 1 altro mese",
      "ach.hint.export": "Esporta un backup ({where})",
      "ach.hint.balanced": "Porta il saldo totale entro ±30 min (da 20 giorni registrati)"
    }
  });

  /* Welcher konkrete Schritt fehlt noch? Schlüssel + Anzahl je Abzeichen. */
  var HINTS = {
    first: "days", week1: "days", days30: "days", days100: "days", days250: "days",
    streak5: "streak", streak20: "streak", streak60: "streak",
    perfectWeek: "perfect", perfect10: "perfect",
    fullMonth: "fullMonth", zenMonth: "zenMonth",
    earlyBird: "early", nightOwl: "late", breakPro: "breaks", punctual: "punctual",
    homeOffice: "home", vacation: "vacation",
    marathon: "hours", millennium: "hours",
    chronicler: "notes", halfYear: "months", archivist: "export", balanced: "balanced"
  };

  function hintFor(b, stats) {
    var kind = HINTS[b.id];
    if (!kind) return "";
    var left = Math.max(1, Math.ceil(b.goal - b.value));
    if (kind === "streak") left = Math.max(1, b.goal - (stats.currentStreak || 0));
    if (kind === "fullMonth" || kind === "zenMonth" || kind === "balanced") return I.t("ach.hint." + kind);
    if (kind === "export") return I.t("ach.hint.export", { where: I.t("nav.reports") + " → " + I.t("report.exportJson") });
    return I.tn("ach.hint." + kind, left);
  }

  /** Die drei Abzeichen, die am nächsten liegen. */
  function closest(badges, count) {
    return badges.filter(function (b) { return !b.earned; })
      .sort(function (a, b) {
        if (b.progress !== a.progress) return b.progress - a.progress;
        return (a.goal - a.value) - (b.goal - b.value);
      })
      .slice(0, count || 3);
  }

  /* 🏛 🗓 ⛰ haben ohne Variantenwähler Text-Darstellung und erscheinen als
     schwarze Strichzeichen. U+FE0F erzwingt das farbige Emoji. */
  function colorEmoji(e) {
    e = String(e || "");
    return e.indexOf("️") >= 0 ? e : e + "️";
  }

  (ZK.Views = ZK.Views || {}).achievements = { render: render, calc: { hintFor: hintFor, closest: closest, colorEmoji: colorEmoji } };

  function render(host, App) {
    var result = App.buildAchievements();
    // Neuere App liefert die Kennzahlen gleich mit — kein zweiter Durchlauf.
    var stats = result.stats || ZK.Achievements.buildStats(App.store.allDays(), App.settings());
    var lvl = result.level;
    var dd = { day: "2-digit", month: "2-digit", year: "numeric" };

    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("ach.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("ach.lede") }));
    head.appendChild(left);
    var earnedCount = result.badges.filter(function (b) { return b.earned; }).length;
    head.appendChild(D.el("span.tag.solid", { text: earnedCount + " / " + result.badges.length }));
    host.appendChild(head);

    /* ---- Stufe & Serien ---- */
    var top = D.el("div.ach-top.mb-5.stagger");

    var levelCard = D.el("section.card");
    var levelInner = D.el("div.level-card");
    var pct = Math.round(lvl.progress * 100);
    var badge = D.el("div.level-badge", {
      role: "img",
      "aria-label": I.t("ach.levelAria", { n: lvl.level, p: pct, next: lvl.level + 1 })
    });
    // Eigene Eigenschaften (--p) gehen nur über setProperty, nicht über style.x = …
    badge.style.setProperty("--p", pct + "%");
    badge.appendChild(D.el("span", { text: String(lvl.level) }));
    levelInner.appendChild(badge);
    var levelText = D.el("div");
    levelText.innerHTML =
      '<div class="level-kicker">' + D.esc(I.t("ach.level", { n: lvl.level })) + "</div>" +
      '<div class="level-xp">' + lvl.xp + " XP</div>" +
      '<div class="level-next">' + D.esc(I.t("ach.xpToNext", { n: lvl.toNext, next: lvl.level + 1 })) + "</div>";
    levelInner.appendChild(levelText);
    levelCard.appendChild(levelInner);
    top.appendChild(levelCard);

    var streakCard = D.el("section.card");
    streakCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("ach.currentStreak")) + "</h2>" }));
    var flame = D.el("div.streak-flame");
    flame.innerHTML = '<span class="emoji-big">' + colorEmoji(stats.currentStreak > 0 ? "🔥" : "🌱") + "</span>" +
      "<span>" + D.esc(I.tn("ach.dayStreak", stats.currentStreak)) + "</span>";
    streakCard.appendChild(flame);
    streakCard.appendChild(D.el("p.muted.ach-best", {
      text: I.t("ach.bestStreak") + ": " + I.tn("ach.dayStreak", stats.bestStreak)
    }));
    top.appendChild(streakCard);

    var factCard = D.el("section.card");
    factCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("common.total")) + "</h2>" }));
    var facts = D.el("dl.ach-facts");
    [
      [I.t("stats.recordedDays"), String(stats.recordedDays)],
      [I.t("common.hours"), Math.round(stats.totalNet / 60) + " h"],
      [I.t("ach.bestStreak"), I.tn("ach.dayStreak", stats.bestStreak)],
      [I.t("ach.earlyLate"), stats.earlyBirds + " / " + stats.nightOwls]
    ].forEach(function (f) {
      var row = D.el("div");
      row.appendChild(D.el("dt", { text: f[0] }));
      row.appendChild(D.el("dd.mono", { text: f[1] }));
      facts.appendChild(row);
    });
    factCard.appendChild(facts);
    top.appendChild(factCard);

    host.appendChild(top);

    /* ---- Als Nächstes ---- */
    var nextCard = D.el("section.card.mb-4.ach-next");
    nextCard.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("ach.next")) + "</h2>" }));
    var upcoming = closest(result.badges, 3);
    if (!upcoming.length) {
      nextCard.appendChild(D.el("p.muted", { text: I.t("ach.allDone") }));
    } else {
      var list = D.el("div.ach-next-list");
      upcoming.forEach(function (b) {
        var meta = I.badge(b.id);
        var item = D.el("div.ach-next-item");
        item.appendChild(D.el("span.emoji", { text: colorEmoji(b.emoji), "aria-hidden": "true" }));
        var body = D.el("div.ach-next-body");
        var line = D.el("div.ach-next-line");
        line.appendChild(D.el("b", { text: meta.name }));
        line.appendChild(D.el("span.mono", { text: fmtNum(b.value) + " / " + b.goal }));
        body.appendChild(line);
        var bar = D.el("div.bar.thin");
        var fill = D.el("i");
        fill.style.width = Math.round(b.progress * 100) + "%";
        bar.appendChild(fill);
        body.appendChild(bar);
        body.appendChild(D.el("div.ach-hint", { text: hintFor(b, stats) + " · +" + b.xp + " XP" }));
        item.appendChild(body);
        list.appendChild(item);
      });
      nextCard.appendChild(list);
    }
    host.appendChild(nextCard);

    /* ---- Abzeichen ---- */
    var card = D.el("section.card");
    card.appendChild(D.el("div.card-head", { html: "<h2>" + D.esc(I.t("ach.title")) + "</h2>" }));
    var grid = D.el("div.badge-grid");

    result.badges.forEach(function (b) {
      var meta = I.badge(b.id);
      var node = D.el("div.badge" + (b.earned ? ".earned" : ""));
      node.appendChild(D.el("span.emoji", { text: colorEmoji(b.emoji), "aria-hidden": "true" }));
      node.appendChild(D.el("span.bname", { text: meta.name }));
      node.appendChild(D.el("span.bdesc", { text: meta.desc }));
      if (!b.earned) {
        var bar = D.el("div.bar.thin.bprog");
        var fill = D.el("i");
        fill.style.width = Math.round(b.progress * 100) + "%";
        bar.appendChild(fill);
        node.appendChild(bar);
        node.appendChild(D.el("span.bdesc.mono", {
          text: I.t("ach.progressOf", { a: fmtNum(b.value), b: b.goal })
        }));
        node.setAttribute("aria-label", meta.name + " — " + I.t("ach.locked") + ", " + fmtNum(b.value) + " / " + b.goal);
      } else {
        // Datum direkt auf der Karte statt in einem Tooltip, der am Kartenrand abgeschnitten wird
        node.appendChild(D.el("span.tag.plus", { text: "+" + b.xp + " XP" }));
        if (b.earnedAt) node.appendChild(D.el("span.bsince", { text: I.t("ach.since", { date: I.formatDate(b.earnedAt, dd) }) }));
      }
      grid.appendChild(node);
    });

    card.appendChild(grid);
    host.appendChild(card);
  }

  function fmtNum(v) { return String(Math.round(v * 10) / 10); }
})(typeof self !== "undefined" ? self : this);
