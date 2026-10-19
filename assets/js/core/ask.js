/* ==========================================================================
   ZEITKONTO — Frag dein Zeitkonto
   --------------------------------------------------------------------------
   Versteht kurze Fragen in der Befehlspalette — Deutsch, Schweizerdeutsch,
   Englisch, Französisch, Italienisch, mit Tippfehlern, ohne Umlaute, mit
   oder ohne Fragezeichen — und beantwortet sie mit denselben Zahlen, die
   die Ansichten zeigen.

     parse(text, { today })   → bis zu zwei Deutungen [{ intent, score, … }]
                                (leer, wenn nichts passt — dann schweigt die
                                Palette). Synchron, weit unter 5 ms.
     answer(deutung, api)     → [{ intent, icon, label, sub, tone, nav, data }]
     ask(text, api)           → parse + answer in einem

   Die Daten kommen über `api` herein (in der App: App.day, App.range,
   App.accountBalance, App.settledBalance …, siehe ui/features/ask.js). So
   rechnen die Tests mit der echten Engine — und eine Antwort kann nie eine
   andere Zahl nennen als die Ansicht, in die Enter danach springt.

   Kein DOM, kein Date() ohne api.now: alles hier ist reine Logik.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"), require("./rules.js"), require("./holidays.js"),
      require("./engine.js"), require("./planner.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Ask = factory(root.ZK.Time, root.ZK.Rules, root.ZK.Holidays, root.ZK.Engine, root.ZK.Planner);
  }
})(typeof self !== "undefined" ? self : globalThis, function (T, R, H, E, P) {
  "use strict";

  /* ==================================================================== */
  /* 1 · NORMALISIEREN                                                     */
  /* ==================================================================== */

  /* Gross/klein, Akzente und Umlaute fallen weg; „ae/oe/ue“ wird wie der
     Umlaut gelesen. Wortschatz und Eingabe laufen durch dieselbe Faltung —
     „Übrig“, „uebrig“ und „ubrig“ sind danach dasselbe Wort. */
  function fold(s) {
    s = String(s === null || s === undefined ? "" : s).toLowerCase().replace(/ß/g, "ss");
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s.replace(/[’`´ʼ‘]/g, "'").replace(/[−–—]/g, "-")
      .replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
  }

  /* Mehrwortige Begriffe vor dem Zerlegen zu einem Wort (bereits gefaltet) */
  var PHRASES = [
    [/\bweek-end/g, "weekend"], [/\bavant-hier\b/g, "avanthier"], [/\bapres-demain\b/g, "apresdemain"],
    [/\baujourd'hui\b/g, "aujourdhui"], [/\bl'altro ?ieri\b/g, "altroieri"], [/\baltro ieri\b/g, "altroieri"],
    [/\bfine settimana\b/g, "finesettimana"], [/\blast time\b/g, "lasttime"], [/\bjour ferie/g, "jourferie"],
    [/\bheures? sup\b/g, "heuressup"], [/\b(public|bank) holidays?\b/g, "publicholiday"],
    [/\bnach hause\b/g, "heim"], [/\bday before yesterday\b/g, "vorgestern"],
    [/\bday after tomorrow\b/g, "ubermorgen"], [/\bwhat can you\b/g, "whatcanyou"],
    [/\bwas kannst du\b/g, "waskannstdu"], [/\bwas chasch\b/g, "waskannstdu"],
    [/\bque (peux|sais)-?(tu|vous)\b/g, "quepeuxtu"], [/\bcosa (sai|puoi) fare\b/g, "cosasaifare"],
    [/\bbanca (delle )?ore\b/g, "bancaore"]
  ];

  /* ==================================================================== */
  /* 2 · WORTSCHATZ                                                        */
  /* ==================================================================== */

  /* Konzept → Wörter. Ein Wort darf mehrere Konzepte tragen („ferientage“
     = Ferien + Tage). Schweizerdeutsch steht gleich mit drin. */
  var WORDS = {
    WHEN: "wann wenn when quand quando",
    WHENTIME: "ora heure uhr",          // „a che ora“, „à quelle heure“, „um wieviel Uhr“
    CAN: "kann kan chan cha chani chasch darf can could puis peux peut pourrais posso puo",
    LEAVE: "gehen geh gehe geht gah goh go ga gaa hei heim heimgehen heigah heigoh heigo feierabend firabig fiirabig " +
      "feierabig schluss fertig home finish off partir pars rentrer quitter depart sortir andare vado " +
      "andarmene uscire esco uscita staccare stacco casa",
    LEAVE_EN: "leave",
    ARRIVE: "kommen komme gekommen cho choo kam came come arrive arrived arriver arrivee arrivo entrato entrata " +
      "arrivato arrivata eingestempelt started begonnen angefangen commence",
    BALANCE: "saldo stand bilanz balance solde bilancio",
    ACCOUNT: "konto kontostand zeitkonto gleitzeit gleitzeitsaldo glz account flextime flexitime flexi compte conto bancaore",
    PLUSMINUS: "plus minus",
    WORKED: "gearbeitet garbeitet gschaffet gschafft geschafft schaffe schaffen arbeit worked work working " +
      "travaille travail lavorato lavoro netto net nette",
    HOWLONG: "lange lang long wielang wielange tempo duree",
    HOWMANY: "viel viele vill vil wieviel wieviele wievill much many combien quanti quante quanto quanta",
    DAYS: "tage tag tagen day days jours jour giorni giorno",
    HOURS: "stunden stunde std stund hours hour heures ore",
    WEEK: "woche wochen wuche week weeks semaine semaines settimana settimane kw weekly",
    MONTH: "monat monats monet month mois mese",
    YEAR: "jahr jahres johr year annee anno",
    THIS: "diese dieser diesen dieses disi dise this current cette cet questa questo quest aktuelle aktuellen laufende",
    LAST: "letzte letzten letzter letztes letscht letschte vergangene vergangenen vorige vorigen last previous " +
      "derniere dernier passee passe scorsa scorso ultima ultimo",
    NEXT: "nachste nachsten nachster nachstes nochscht nochschte nochschti nachscht nachschte nachschti kommende " +
      "kommenden next upcoming coming prochain prochaine prochains prochaines prossimo prossima prossimi prossime",
    LEFT: "noch no ubrig ubrige verbleibend verbleibende rest restlich restliche offen left remaining remain " +
      "reste restant restants restantes restent rimasti rimaste rimangono rimanenti restano ancora manca mancano",
    TAKEN: "bezogen genommen gnoh gnoo gebraucht verbraucht taken used took pris prises utilise utilises " +
      "goduto goduti godute presi prese usati fatti",
    PLANNED: "geplant geplante eingetragen eingeplant gebucht planned booked scheduled prevu prevus prevues " +
      "planifie planifies planifiees pianificato pianificati pianificate previsti prenotati",
    VACATION: "ferien ferientag ferientage ferientagen urlaub urlaubstag urlaubstage vacation vacations pto " +
      "vacances conge conges vacanza vacanze annual",
    FERIE: "ferie",
    HOLIDAY_EN: "holiday holidays",
    HOLIDAY: "feiertag feiertage feiertagen fiirtig firtig fiirtag fiirtage feries jourferie publicholiday festivo festivi",
    BRIDGE: "brucke brucken bruckentag bruckentage bridge bridges pont ponts ponte ponti",
    WEEKEND: "wochenende wuchenend weekend weekends finesettimana",
    LONG: "lang lange langes langen long longue prolonge lungo",
    BREAK: "pause pausen pausa pausenzeit mittag mittagspause zmittag break breaks lunch",
    NEED: "brauche brauch bruuch bruche brauchen muss muess mues musst need needed must required require " +
      "pflicht gesetzlich legal faut dois doit obligatoire requise devo deve serve servono necessaria necessario obbligatoria",
    OVERTIME: "uberstunden uberzeit uberziit mehrstunden mehrzeit overtime supplementaires heuressup straordinari " +
      "straordinario straordinarie",
    TARGET: "soll sollzeit target objectif obiettivo dovute",
    FOR: "fur for pour per auf",
    UNTIL: "bis until till jusqu fino",
    EARLY: "fruh fruher early earlier tot presto",
    LATE: "spat spater late later tard tardi",
    LASTTIME: "zuletzt zletscht lasttime",
    TIMEWORD: "mal mol time fois volta",
    HELP: "hilfe help aide aiuto beispiele beispiel examples example exemples exemple esempi esempio " +
      "whatcanyou waskannstdu quepeuxtu cosasaifare",
    ZERO: "null zero nul",
    DAYBAL: "tagessaldo"
  };

  /* Zusammengesetzte Wörter: ein Wort, mehrere Konzepte */
  var COMPOUNDS = {
    monatssaldo: "MONTH BALANCE", wochensaldo: "WEEK BALANCE", jahressaldo: "YEAR BALANCE",
    tagessaldo: "DAYBAL BALANCE", wochensoll: "WEEK TARGET", resturlaub: "VACATION LEFT",
    pflichtpause: "BREAK NEED", ferientage: "VACATION DAYS", ferientagen: "VACATION DAYS",
    urlaubstage: "VACATION DAYS", jahresuberzeit: "OVERTIME YEAR"
  };

  /* Relative Tage (zusätzlich zu P.RELATIVE_DAYS, gefaltet) */
  var RELATIVE = {
    heute: 0, hut: 0, hute: 0, today: 0, aujourdhui: 0, auj: 0, oggi: 0,
    gestern: -1, geschter: -1, gester: -1, gestert: -1, yesterday: -1, hier: -1, ieri: -1,
    vorgestern: -2, vorgeschter: -2, avanthier: -2, altroieri: -2,
    morgen: 1, morn: 1, tomorrow: 1, demain: 1, domani: 1,
    ubermorgen: 2, ubermorn: 2, apresdemain: 2, dopodomani: 2
  };

  /* Wochentage, Index 0 = Sonntag (wie T.weekdayOf) */
  var WEEKDAYS = [
    "sonntag sunntig sunday dimanche domenica",
    "montag mantig monday lundi lunedi",
    "dienstag zischtig tuesday mardi martedi",
    "mittwoch mittwuch wednesday mercredi mercoledi",
    "donnerstag donnschtig thursday jeudi giovedi",
    "freitag fritig friday vendredi venerdi",
    "samstag samschtig saturday samedi sabato"
  ];

  var MONTHS = [
    "januar janner january janvier gennaio jan",
    "februar february fevrier febbraio feb",
    "marz march mars marzo",
    "april avril aprile",
    "mai may maggio",
    "juni june juin giugno",
    "juli july juillet luglio",
    "august aout agosto",
    "september septembre settembre sept",
    "oktober october octobre ottobre okt",
    "november novembre",
    "dezember december decembre dicembre dez"
  ];

  /* Füllwörter: zählen nicht als Inhalt und werden nie unscharf gelesen */
  var STOP = ("ich i du er es wir mir mich mein meine meinen meiner dein habe hab hani han hast hat haben bin bi " +
    "isch ist sind war bisch der die das dem den des ein eine einen einem einer im in an am um zu und oder " +
    "da dann denn wie was wo wer so s de d z the a an is are am do does did have has i me my mine of to on at in " +
    "it what how which je j me moi mon ma mes le la les l de du des un une est c ce qu que qui il elle " +
    "suis ai as y en au aux dans avec io mi ho ha hai di del della delle dell lo gli che e un una il al " +
    "nel nella sono sei fare faire machen make get hab").split(" ");

  var CONCEPT = Object.create(null);     // Wort → [Konzepte]
  var WEEKDAY_OF = Object.create(null);  // Wort → 0…6
  var MONTH_OF = Object.create(null);    // Wort → 0…11
  var BY_LEN = [];                       // Länge → [Wörter] (für unscharfe Suche)
  var STOPSET = Object.create(null);

  function addWord(word, concepts) {
    var w = fold(word);
    if (!w) return;
    if (!CONCEPT[w]) {
      CONCEPT[w] = [];
      (BY_LEN[w.length] = BY_LEN[w.length] || []).push(w);
    }
    concepts.forEach(function (c) { if (CONCEPT[w].indexOf(c) < 0) CONCEPT[w].push(c); });
  }

  Object.keys(WORDS).forEach(function (c) {
    WORDS[c].split(/\s+/).forEach(function (w) { addWord(w, [c]); });
  });
  Object.keys(COMPOUNDS).forEach(function (w) { addWord(w, COMPOUNDS[w].split(" ")); });
  Object.keys(RELATIVE).forEach(function (w) { addWord(w, ["REL"]); });
  WEEKDAYS.forEach(function (list, i) {
    list.split(" ").forEach(function (w) { WEEKDAY_OF[fold(w)] = i; addWord(w, ["WEEKDAY"]); });
  });
  MONTHS.forEach(function (list, i) {
    list.split(" ").forEach(function (w) { MONTH_OF[fold(w)] = i; addWord(w, ["MONTHNAME"]); });
  });
  STOP.forEach(function (w) { STOPSET[fold(w)] = true; });

  /* ---- Unscharfe Suche: Damerau-Levenshtein mit Abbruch ----------- */
  function distance(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[lb];
  }

  /** Bestes Wort im Wortschatz für einen Tippfehler — oder null. */
  function fuzzy(tok) {
    var L = tok.length;
    if (L < 4) return null;
    var max = L >= 8 ? 2 : 1;
    var best = null, bestD = max + 1;
    for (var len = L - max; len <= L + max; len++) {
      var list = BY_LEN[len];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var w = list[k];
        if (w.length < 4) continue;
        /* Der Anfang muss stimmen (oder zwei Buchstaben sind vertauscht) —
           sonst wird „drucken“ zu „brücken“ */
        if (w.charAt(0) !== tok.charAt(0) && !(w.charAt(0) === tok.charAt(1) && w.charAt(1) === tok.charAt(0))) continue;
        var d = distance(tok, w, Math.min(max, bestD));
        if (d < bestD) { bestD = d; best = w; }
      }
    }
    return bestD <= max ? best : null;
  }

  /** Wörter, die mit einem angefangenen Wort beginnen (nur das zuletzt getippte). */
  function prefixed(tok) {
    if (tok.length < 3) return [];
    var out = [];
    for (var len = tok.length + 1; len < BY_LEN.length; len++) {
      var list = BY_LEN[len];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) if (list[k].indexOf(tok) === 0) out.push(list[k]);
    }
    return out;
  }

  /* ==================================================================== */
  /* 3 · LESEN                                                             */
  /* ==================================================================== */

  var UNIT_HOURS = /^(h|std|stunde|stunden|heure|heures|ore|hour|hours)$/;
  var UNIT_MIN = /^(m|min|mins|minute|minuten|minutes|minuti)$/;

  /** „+1h“, „-0:30“, „±0“, „+1.5“, „+1h30“, „+45min“ → Minuten mit Vorzeichen, sonst null. */
  function readTarget(tok) {
    var m = /^([+\-±]|\+-)(\d{1,2})(?:([:.])(\d{1,2}))?([a-z]*)(\d{2})?$/.exec(tok);
    if (!m) return null;
    var sign = m[1] === "-" ? -1 : 1;
    var a = +m[2], unit = m[5] || "", minutes;
    if (m[6] && unit === "h") minutes = a * 60 + (+m[6]);                 // +1h30
    else if (m[6]) return null;
    else if (m[3] === ":") minutes = a * 60 + (+m[4]);                    // +1:30
    else if (m[3] === ".") minutes = Math.round(parseFloat(a + "." + m[4]) * 60);   // +1.5
    else if (UNIT_MIN.test(unit)) minutes = a;
    else if (!unit || UNIT_HOURS.test(unit)) minutes = a * 60;
    else return null;
    if (m[3] === ":" && +m[4] > 59) return null;
    if (m[1] === "±" || m[1] === "+-") return minutes === 0 ? 0 : minutes;
    return minutes === 0 ? 0 : sign * minutes;
  }

  /** „12.10.“, „12.10“, „12/10“, „2026-10-12“, „12.10.2026“ → ISO */
  function readDate(tok, today) {
    if (!/^\d/.test(tok)) return null;
    if (!/^(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./](?:\d{2}|\d{4})?)?)$/.test(tok)) return null;
    return P.parseDateToken(tok, today);
  }

  /* „vor 7“, „before 7am“, „avant 7h“, „prima delle 7:30“, „nach 18 uhr“, „after 6pm“ */
  var HOUR_RE = /(^|\s)(vor|before|avant|prima|nach|after|apres|dopo)(?:\s+(?:de|der|den|dem|delle|della|dell'|di|le|la|les|the|l'))?\s+(\d{1,2})(?:[:.h](\d{2}))?(am|pm|h|uhr|i)?(?=\s|$)(?!\s+(?:tag|tage|tagen|days?|jours?|giorni|wochen|weeks?|semaines?|settimane|monat|monaten|months?|mois|mesi))/;

  /**
   * Zerlegt eine Frage in Merkmale: Konzepte (c), Tagesbezug, Monat, Jahr,
   * Zielsaldo, Uhrzeit-Grenze. Wirft nie — Unlesbares fällt einfach weg.
   */
  function analyze(text, opts) {
    opts = opts || {};
    var today = opts.today || T.todayISO();
    var raw = String(text === null || text === undefined ? "" : text);
    var f = {
      raw: raw, c: {}, date: null, month: null, year: null, target: null, hour: null,
      help: false, accentHoliday: false, content: 0, tokens: []
    };
    if (/^\s*\?+\s*$/.test(raw)) { f.help = true; return f; }
    if (/f[ée]ri[ée]s?\b/i.test(raw) && /[éÉ]/.test(raw)) f.accentHoliday = true;

    var s = fold(raw);
    var typing = !/\s$/.test(raw);
    s = s.replace(/[?!¿¡;"«»„“”()[\]{}]/g, " ").replace(/(\d),(\d)/g, "$1.$2");
    PHRASES.forEach(function (p) { s = s.replace(p[0], p[1]); });
    s = s.replace(/([+\-±])\s+(?=\d)/g, "$1")
      .replace(/(\d)\s+(h|uhr|std|stunden?|min|mins|minuten?|minutes?|minuti|heures?|ore|hours?|am|pm)(?=\s|$)/g, "$1$2")
      .replace(/\s+/g, " ").trim();

    var hm = HOUR_RE.exec(s);
    if (hm) {
      var hh = +hm[3], mm = hm[4] ? +hm[4] : 0;
      if (hm[5] === "pm" && hh < 12) hh += 12;
      if (hh <= 24 && mm < 60) {
        var after = /^(nach|after|apres|dopo)$/.test(hm[2]);
        f.hour = { dir: after ? "after" : "before", minutes: hh * 60 + mm };
        s = (s.slice(0, hm.index) + hm[1] + s.slice(hm.index + hm[0].length)).trim();
      }
    }

    var parts = s ? s.split(" ") : [];
    var tokens = [];
    parts.forEach(function (p) {
      if (!p) return;
      // Ziel und Datum bleiben ganz — nur Wörter zerfallen an Bindestrich und Apostroph
      if ((/^[+\-±]/.test(p) && /\d/.test(p)) || /^\d/.test(p)) { tokens.push(p); return; }
      p.split(/[-/']/).forEach(function (q) {
        q = q.replace(/[^a-z0-9.:]/g, "").replace(/^[.:]+|[.:]+$/g, "");
        if (q.length >= 2 || /^\d$/.test(q)) tokens.push(q);
      });
    });
    f.tokens = tokens;

    var c = f.c;
    var lastIdx = tokens.length - 1;
    var dayOnly = null;
    tokens.forEach(function (tok, idx) {
      // Zielsaldo
      var tg = /^[+\-±]/.test(tok) ? readTarget(tok) : null;
      if (tg !== null) { f.target = tg; f.content++; return; }
      if (/^\d/.test(tok)) {
        var iso = readDate(tok, today);
        if (iso) { if (!f.date) f.date = iso; f.content++; return; }
        if (/^(19|20)\d\d$/.test(tok)) { f.year = +tok; f.content++; return; }
        if (/^\d{1,2}\.$/.test(tok) && +tok.slice(0, -1) >= 1 && +tok.slice(0, -1) <= 31) { dayOnly = +tok.slice(0, -1); f.content++; return; }
        if (tok === "0") { c.ZERONUM = 1; return; }
        return;
      }
      var words = CONCEPT[tok] ? [tok] : null;
      if (!words && !STOPSET[tok]) {
        var fz = fuzzy(tok);
        if (fz) words = [fz];
        else if (idx === lastIdx && typing) {
          var pre = prefixed(tok);
          if (pre.length && pre.length <= 6) words = pre;
        }
      }
      if (!words) return;
      f.content++;
      words.forEach(function (w) {
        CONCEPT[w].forEach(function (k) {
          c[k] = 1;
          if (k === "REL" && RELATIVE[w] === 0) c.TODAY = 1;
          if (k === "REL" && f.date === null) f.date = T.addDays(today, RELATIVE[w]);
          if (k === "WEEKDAY" && f.weekdayIdx === undefined) f.weekdayIdx = WEEKDAY_OF[w];
          if (k === "MONTHNAME" && f.month === null) f.month = MONTH_OF[w];
        });
      });
    });

    /* Wochentag: der letzte (oder heutige) — „nächsten Montag“ der kommende */
    if (f.weekdayIdx !== undefined && f.date === null) {
      var wd = T.weekdayOf(today);
      var back = (wd - f.weekdayIdx + 7) % 7;
      if (c.NEXT) f.date = T.addDays(today, ((f.weekdayIdx - wd + 7) % 7) || 7);
      else if (c.LAST && back === 0) f.date = T.addDays(today, -7);
      else f.date = T.addDays(today, -back);
    }
    /* „am 12.“ — der 12. dieses Monats, sonst des Vormonats */
    if (dayOnly !== null && f.date === null) {
      var y = T.yearOf(today), m0 = +today.slice(5, 7);
      var cand = y + "-" + T.pad2(m0) + "-" + T.pad2(dayOnly);
      if (!T.isValidISO(cand) || cand > today) {
        var prevM = T.addMonths(today.slice(0, 8) + "01", -1);
        cand = prevM.slice(0, 8) + T.pad2(dayOnly);
      }
      if (T.isValidISO(cand)) f.date = cand;
    }
    if (c.ZERONUM && (c.FOR || c.UNTIL) && f.target === null) f.target = 0;
    if (c.ZERO && (c.FOR || c.UNTIL || c.WHEN) && f.target === null) f.target = 0;
    if (c.LAST && c.TIMEWORD) c.LASTTIME = 1;
    /* „Uhr“ allein ist keine Frage (Mini-Uhr), „wann“ allein schon */
    if (c.WHEN) f.whenWord = true;
    if (c.WHENTIME) c.WHEN = 1;
    if (c.HELP) f.help = true;
    return f;
  }

  /* ==================================================================== */
  /* 4 · DEUTEN                                                            */
  /* ==================================================================== */

  var MIN_SCORE = 55;
  var AMBIGUITY = 6;    // die zweite Deutung erscheint nur, wenn sie fast gleich gut passt

  /** Merkmale → bewertete Deutungen (beste zuerst, höchstens zwei). */
  function rank(f, today) {
    var c = f.c, out = [];
    function add(intent, score, extra) {
      var o = { intent: intent, score: score };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      out.push(o);
    }
    if (f.help) return [{ intent: "help", score: 100 }];

    var dayRef = f.date;
    if (!dayRef && c.DAYBAL) dayRef = today;
    var otherDay = !!dayRef && dayRef !== today;

    /* Zuletzt vor/nach einer Uhrzeit */
    if (f.hour) {
      var lastish = c.LASTTIME || c.LAST || c.WHEN || c.ARRIVE || c.LEAVE;
      add("last", lastish ? 92 : 60, { dir: f.hour.dir, minutes: f.hour.minutes });
    } else if (c.LASTTIME && (c.EARLY || c.LATE)) {
      add("last", 88, { dir: c.LATE ? "after" : "before", minutes: c.LATE ? 18 * 60 : 7 * 60 });
    }

    /* Gehen für einen Zielsaldo: Tagessaldo oder Zeitkonto? */
    if (f.target !== null && (c.WHEN || c.LEAVE || c.LEAVE_EN || c.FOR || c.UNTIL || c.BALANCE || c.ACCOUNT)) {
      var dayOnlyMode = c.TODAY || c.DAYBAL || (c.DAYS && !c.ACCOUNT) || dayRef === today;
      // Ein Tagessaldo von über zehn Stunden ist keine ernsthafte Lesart
      var hugeTarget = Math.abs(f.target) > 10 * 60;
      if ((c.ACCOUNT || hugeTarget) && !dayOnlyMode) add("target", 90, { mode: "account", minutes: f.target });
      else if (dayOnlyMode) add("target", 90, { mode: "day", minutes: f.target });
      else if (c.BALANCE) {
        add("target", 90, { mode: "account", minutes: f.target });
        add("target", 86, { mode: "day", minutes: f.target });
      } else {
        add("target", 90, { mode: "day", minutes: f.target });
        add("target", 89, { mode: "account", minutes: f.target });
      }
    }

    /* Brückentage / lange Wochenenden */
    if (c.BRIDGE || (c.WEEKEND && c.LONG)) add("bridge", 82);

    /* Ferien oder Feiertag? „ferie“ (it/ch: Ferien, fr: férié) und „holiday“
       (en-GB: beides) entscheidet der Rest der Frage. */
    var vacCtx = c.LEFT || c.HOWMANY || c.TAKEN || c.PLANNED || c.DAYS;
    var vac = c.VACATION || (c.FERIE && !f.accentHoliday) || (c.HOLIDAY_EN && vacCtx && !c.NEXT) ||
      (c.LEAVE_EN && (vacCtx || c.VACATION));
    var holStrong = c.HOLIDAY || f.accentHoliday || (c.HOLIDAY_EN && !vacCtx);
    var holWeak = !holStrong && c.FERIE && (c.NEXT || c.WHEN) && !c.VACATION;
    if (vac) {
      var mode = c.TAKEN ? "taken" : (c.PLANNED || c.NEXT) ? "planned" : "left";
      add("vacation", 76 + (vacCtx ? 4 : 0), { mode: mode, year: f.year });
    } else if (c.HOLIDAY_EN && !c.NEXT && !c.WHEN) {
      add("vacation", 72, { mode: "left", year: f.year });    // „holidays“ allein: beides zeigen
    }
    if ((holStrong || holWeak) && !c.BRIDGE) add("holiday", (holStrong ? 74 : 70) + (c.NEXT || c.WHEN ? 4 : 0));

    /* Pause heute */
    if (c.BREAK && !otherDay) {
      add("break", 70 + (c.NEED ? 6 : 0) + (c.TODAY ? 2 : 0) + (c.HOWMANY || c.HOWLONG ? 2 : 0));
    }

    /* Überzeit */
    if (c.OVERTIME) add("overtime", 80, { year: f.year });

    /* Bis zum Wochensoll */
    if (c.WEEK && !c.LAST && (c.TARGET || (c.LEFT && (c.HOURS || c.HOWMANY || c.HOWLONG || c.NEED)))) add("weekRest", 84);

    /* Woche, Monat, Jahr */
    var period = f.month !== null ? "month" : c.YEAR ? "year" : c.MONTH ? "month" : c.WEEK ? "week" :
      (f.year && !vac && !c.OVERTIME ? "year" : null);
    if (period && !c.OVERTIME && !vac) {
      add("period", 66 + (c.BALANCE || c.ACCOUNT ? 10 : 0) + (c.HOWMANY || c.HOWLONG || c.WORKED || c.HOURS ? 4 : 0),
        { period: period, last: !!c.LAST, month: f.month, year: f.year });
    }

    /* Zeitkonto */
    if ((c.BALANCE || c.ACCOUNT || (c.PLUSMINUS && (c.HOWMANY || c.HOWLONG))) && !period && f.target === null && !dayRef) {
      add("account", c.ACCOUNT ? 80 : 76);
    }

    /* Feierabend */
    var leaveSignal = c.LEAVE || (c.LEAVE_EN && !vacCtx && !c.VACATION);
    if (!otherDay && f.target === null && !f.hour) {
      if (leaveSignal) add("leave", 78 + (c.WHEN || c.CAN ? 4 : 0));
      else if (c.WHEN && c.CAN) add("leave", 74);
      else if (f.whenWord && f.content === 1) add("leave", 56);
    }

    /* Ein bestimmter Tag. Für heute haben Feierabend und Pause Vorrang —
       „Pause heute“ fragt nach der Pause, nicht nach dem ganzen Tag. */
    if (dayRef && !f.hour && f.target === null && !(dayRef === today && c.BREAK)) {
      add("day", 64 + (c.HOWLONG || c.HOWMANY || c.WORKED || c.HOURS || c.BALANCE || c.DAYBAL ? 10 : 0) +
        (otherDay && (c.WHEN || c.ARRIVE || c.LEAVE || c.LEAVE_EN || c.BREAK) ? 6 : 0), { date: dayRef });
    }

    out.sort(function (a, b) { return b.score - a.score; });
    var first = out[0];
    if (!first || first.score < MIN_SCORE) return [];
    var picked = [first];
    for (var i = 1; i < out.length && picked.length < 2; i++) {
      var x = out[i];
      if (x.score < MIN_SCORE || x.score < first.score - AMBIGUITY) break;
      if (x.intent === first.intent && x.mode === first.mode) continue;
      picked.push(x);
    }
    return picked;
  }

  /* Ein Merkmalsatz pro Text — die Palette fragt bei jedem Tastendruck */
  var parseCache = { key: null, value: null };

  /**
   * @param {String} text
   * @param {Object} [opts] { today }
   * @returns {Array} [{ intent, score, … }] — leer, wenn nichts passt
   */
  function parse(text, opts) {
    var today = (opts && opts.today) || T.todayISO();
    var key = today + "|" + text;
    if (parseCache.key === key) return parseCache.value.slice();
    var raw = String(text === null || text === undefined ? "" : text);
    var value = [];
    if (raw.trim() && raw.length <= 160 && !looksLikeEntry(raw, today)) value = rank(analyze(raw, { today: today }), today);
    parseCache = { key: key, value: value };
    return value.slice();
  }

  /* „gestern 7:45-16:30“ oder „morgen ferien“ ist ein Eintrag, keine Frage —
     das beantwortet die Schnellerfassung. Ein blosses Stichwort („ferien“)
     bleibt eine Frage. */
  function looksLikeEntry(raw, today) {
    if (!P || !P.analyzeQuickEntry) return false;
    var qa = P.analyzeQuickEntry(raw, today);
    return !!(qa.ok && (qa.start !== null || (qa.type && qa.dateKind !== "default")));
  }

  /* ==================================================================== */
  /* 5 · ANTWORTEN                                                         */
  /* ==================================================================== */

  /*
     api (alles, was eine Antwort braucht — in der App aus ZK.App gebaut):
       today, now                    ISO-Datum und Date
       settings()                    Einstellungen
       records()                     alle Tage { iso: Datensatz }
       record(iso), day(iso)         Datensatz / Engine-Ergebnis (App.day)
       range(from, to)               App.range
       accountBalance(upto)          App.accountBalance → { minutes }
       periodBalance(from, to, live) optional: Saldo eines Zeitraums mit
                                     abgeschlossenen Monaten eingefroren
                                     (ZK.Closing.periodBalance), sonst live
       settledBalance()              App.settledBalance → { minutes, live, … }
       activeDate()                  App.activeStampDate
       holiday(iso)                  App.holiday
       todayState                    ZK.TodayState (Feierabend wie in „Heute“)
       summarize(days)               optional: ZK.CalWeek.summarize (Kalender/Woche)
       overtimeYear(year)            optional: ZK.Insights.overtimeYear (Statistik)
       overtimeLaw(days, today, max) optional: Überzeit wie im Rapport
       t, tn, fmt, fmtSigned, num, date(iso, style), weekday(i, style), month(i, style), lang
  */

  /* Dauern und Daten brechen nie mitten im Wert um („2 h 18 / min“) */
  function nb(v) { return String(v).replace(/ /g, "\u00a0"); }

  function ctxOf(api) {
    var s = api.settings();
    return {
      api: api, s: s, today: api.today, now: api.now || new Date(),
      t: api.t, tn: api.tn,
      fmt: function (m) { return nb(api.fmt(m)); },
      fmtS: function (m) { return nb(api.fmtSigned(m)); },
      num: api.num || function (v) { return String(v); },
      date: function (iso, style) { return nb(api.date ? api.date(iso, style) : iso); }
    };
  }

  function toneOf(v) { return v > 0 ? "plus" : v < 0 ? "minus" : ""; }

  /** Saldo eines Zeitraums wie Kalender und Statistik — abgeschlossene Monate eingefroren. */
  function periodBal(x, from, to, live) {
    return x.api.periodBalance ? x.api.periodBalance(from, to, live) : live;
  }

  /** Uhrzeit auf der Zeitachse des Tages, nach Mitternacht mit „+1 Tag“. */
  function clockText(x, tl) {
    var off = T.dayOffsetOf(tl);
    return T.formatHHMM(tl) + (off > 0 ? " (" + x.t(off > 1 ? "day.nextDays" : "day.nextDay", { n: off }) + ")" : "");
  }

  function join(parts) {
    return parts.filter(function (p) { return p !== null && p !== undefined && p !== ""; }).join(" · ");
  }

  function firstDayOf(x) { return x.s.firstDayOfWeek === 0 ? 0 : 1; }

  /** Summen eines Zeitraums wie in Kalender und Woche (ZK.CalWeek.summarize). */
  function summarize(x, days) {
    if (x.api.summarize) return x.api.summarize(days);
    var o = { settled: 0, provisional: 0, runningDays: 0, net: 0, credited: 0, target: 0, targetToDate: 0, gaps: [], incomplete: [] };
    days.forEach(function (r) {
      o.target += r.target || 0;
      if (r.date <= x.today) o.targetToDate += r.target || 0;
      if (r.running || r.provisional) { o.runningDays++; o.provisional += r.balance || 0; }
      else if (r.incomplete) o.incomplete.push(r.date);
      else if (r.recorded) o.settled += r.balance || 0;
      else if (r.target > 0 && r.date < x.today) o.gaps.push(r.date);
      o.net += r.net || 0;
      o.credited += r.credited || 0;
    });
    return o;
  }

  /* Was wäre, wenn jetzt gestempelt würde? — wie whatIf() in „Heute“ */
  function whatIf(x, iso) {
    var nowMin = T.nowMinutes(x.now);
    var draft = Object.assign({}, x.api.record(iso), { start: T.formatHHMM(nowMin), end: "" });
    return E.computeDay(draft, { settings: x.s, holiday: x.api.holiday(iso), isToday: true, now: x.now });
  }

  /** Zustand des laufenden Tages wie in der Ansicht „Heute“ */
  function todayModel(x) {
    var S = x.api.todayState;
    var iso = x.api.activeDate ? x.api.activeDate() : x.today;
    var res = x.api.day(iso);
    var rec = x.api.record(iso);
    var nowTl = S.nowOnTimeline(res, T.nowMinutes(x.now));
    var ob = S.openBreak(res, rec, nowTl);
    var canStamp = S.stampable(res);
    var ph = S.phase(res, { isToday: iso === x.today, canStamp: canStamp, openBreak: ob, nowTl: nowTl });
    return { S: S, iso: iso, res: res, rec: rec, nowTl: nowTl, ob: ob, ph: ph, lv: S.leave(res, nowTl), need: S.neededNet(res) };
  }

  function typeName(x, res) {
    var name = x.t("type." + res.type);
    if (res.typeMeta && res.typeMeta.credits && res.absenceFactor < 1) name += " " + Math.round(res.absenceFactor * 100) + " %";
    return name;
  }

  function holidayName(x, h) {
    if (!h) return "";
    return (h.names && h.names[x.api.lang]) || h.name || "";
  }

  /* ---- Feierabend ------------------------------------------------- */
  function answerLeave(x) {
    var m = todayModel(x), res = m.res, a = { intent: "leave", icon: "clock", nav: { view: "today", date: m.iso }, data: { phase: m.ph } };
    var startSub = res.overnight ? x.t("ask.leave.overnight", { start: res.start }) : null;
    switch (m.ph) {
      case "running":
      case "break":
        var time = m.lv.leaveTl === null ? "--:--" : clockText(x, m.lv.leaveTl);
        var brk = m.S.recommendedBreak(res) || 0;
        a.label = m.lv.shifted
          ? x.t("ask.leave.shifted", { time: time, req: x.fmt(res.requiredBreak), rest: x.fmt(res.remaining) })
          : x.t(brk > 0 ? "ask.leave.at" : "ask.leave.atNoBreak", { time: time, brk: x.fmt(brk), rest: x.fmt(res.remaining) });
        a.sub = join([startSub, m.ph === "break" ? x.t("ask.leave.subBreak", { since: m.ob.start })
          : x.t("ask.leave.sub", { start: res.start, net: x.fmt(res.net), target: x.fmt(m.need) })]);
        a.data.leaveTl = m.lv.leaveTl;
        a.data.remaining = res.remaining;
        a.data.brk = brk;
        break;
      case "overtime":
        a.icon = "check";
        a.tone = "plus";
        a.label = m.need > 0 && m.lv.reachedTl !== null
          ? x.t("ask.leave.reached", { time: T.formatHHMM(m.lv.reachedTl) }) : x.t("ask.leave.reachedNoTime");
        a.sub = join([startSub, x.t("ask.leave.reachedSub", { over: x.fmtS(m.lv.over), start: res.start })]);
        a.data.over = m.lv.over;
        break;
      case "whatif":
        var w = whatIf(x, m.iso);
        var wb = m.S.recommendedBreak(w) || 0;
        a.label = x.t("ask.leave.whatif", { time: w.recommendedLeaveTl === null ? "--:--" : clockText(x, w.recommendedLeaveTl) });
        a.sub = x.t(wb > 0 ? "ask.leave.whatifSub" : "ask.leave.whatifSubNoBreak", { brk: x.fmt(wb), target: x.fmt(m.need) });
        a.data.leaveTl = w.recommendedLeaveTl;
        break;
      case "ended":
        a.label = x.t("ask.leave.gone", { time: clockText(x, res.endTl) });
        a.sub = x.t("ask.leave.goneSub", { bal: x.fmtS(res.balance), net: x.fmt(res.net) });
        a.tone = toneOf(res.balance);
        break;
      case "planned":
        a.label = x.t("ask.leave.planned", { time: clockText(x, res.endTl) });
        a.sub = x.t("ask.leave.plannedSub", { bal: x.fmtS(res.balance) });
        break;
      case "absence":
      case "comp":
        a.icon = "umbrella";
        a.label = x.t("ask.leave.absence", { type: typeName(x, res) });
        a.sub = res.credited > 0 ? x.t("ask.leave.absenceSub", { v: x.fmt(res.credited) }) : x.date(m.iso, "long");
        break;
      case "free":
        a.icon = "moon";
        a.label = x.t("ask.leave.free");
        a.sub = x.date(m.iso, "long");
        break;
      default:
        return answerDay(x, m.iso);
    }
    return a;
  }

  /* ---- Gehen für einen Zielsaldo ---------------------------------- */

  /** Saldo des Tages, wenn um `tl` gestempelt würde (offene Pause endet jetzt). */
  function balanceIfLeaving(x, iso, rec, tl, nowMin) {
    var r = Object.assign({}, rec);
    var nowStr = T.formatHHMM(nowMin);
    r.breaks = (rec.breaks || []).map(function (b) {
      var o = Object.assign({}, b);
      if (T.parseHHMM(o.start) !== null && !String(o.end || "").trim()) o.end = nowStr;
      return o;
    });
    r.end = T.formatHHMM(tl);
    return E.computeDay(r, { settings: x.s, holiday: x.api.holiday(iso), isToday: iso === x.today, now: x.now });
  }

  /** Kleinste Gehen-Zeit in [lo, hi] mit Tagessaldo ≥ want (Netto wächst monoton). */
  function searchLeave(x, iso, rec, startTl, lo, hi, want, nowMin) {
    var hit = balanceIfLeaving(x, iso, rec, hi, nowMin);
    if (hit.balance < want) return null;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (balanceIfLeaving(x, iso, rec, mid, nowMin).balance >= want) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  var MAX_DAY = 20 * 60;   // länger rechnet niemand einen Feierabend aus

  function answerTarget(x, it) {
    var m = todayModel(x), res = m.res;
    var target = it.minutes || 0;
    var targetText = x.fmtS(target);
    var a = { intent: "target", icon: "zap", data: { mode: it.mode, target: target } };
    if (it.mode === "account") return answerTargetAccount(x, m, target, targetText, a);

    a.nav = { view: "today", date: m.iso };
    if (!m.S.stampable(res)) {
      a.label = x.t("ask.leave.absence", { type: typeName(x, res) });
      a.sub = x.date(m.iso, "long");
      return a;
    }
    if (res.complete) {
      a.label = x.t("ask.leave.gone", { time: clockText(x, res.endTl) });
      a.sub = x.t("ask.leave.goneSub", { bal: x.fmtS(res.balance), net: x.fmt(res.net) });
      a.tone = toneOf(res.balance);
      return a;
    }
    var nowMin = T.nowMinutes(x.now);
    var rec = Object.assign({}, m.rec);
    var whatif = res.startTod === null;
    if (whatif) { rec.start = T.formatHHMM(nowMin); rec.end = ""; }
    var startTod = T.parseHHMM(rec.start);
    var nowTl = whatif ? startTod : m.nowTl;
    var leaveTl;
    /* ±0 ist genau der Feierabend aus „Heute“ */
    if (target === 0 && (m.ph === "running" || m.ph === "break") && m.lv.leaveTl !== null) leaveTl = m.lv.leaveTl;
    else if (target === 0 && whatif) leaveTl = whatIf(x, m.iso).recommendedLeaveTl;
    else leaveTl = searchLeave(x, m.iso, rec, startTod, Math.max(startTod, nowTl), startTod + MAX_DAY, target, nowMin);

    a.data.whatif = whatif;
    if (leaveTl !== null && leaveTl !== undefined && leaveTl <= nowTl && !whatif) {
      var since = searchLeave(x, m.iso, rec, startTod, startTod, nowTl, target, nowMin);
      a.icon = "check";
      a.tone = "plus";
      a.label = x.t("ask.target.reached", { target: targetText, time: T.formatHHMM(since === null ? nowTl : since) });
      a.sub = x.t("ask.target.reachedSub", { bal: x.fmtS(res.balance) });
      a.data.reachedTl = since;
      return a;
    }
    if (leaveTl === null || leaveTl === undefined) {
      a.icon = "alert";
      a.tone = "minus";
      a.label = x.t("ask.target.unreachable", { target: targetText });
      a.sub = x.t("ask.target.unreachableDay");
      return a;
    }
    var at = balanceIfLeaving(x, m.iso, rec, leaveTl, nowMin);
    a.label = x.t(whatif ? "ask.target.dayWhatif" : "ask.target.day", { time: clockText(x, leaveTl), target: targetText });
    a.sub = join([
      at.effectiveBreak > 0 ? x.t("ask.target.inclBreak", { brk: x.fmt(at.effectiveBreak) }) : null,
      whatif ? null : x.t("ask.target.since", { start: res.start }),
      at.net > (x.s.maxDailyMinutes || 600) ? x.t("ask.target.overMax", { v: x.fmt(at.net) }) : null
    ]);
    if (at.net > (x.s.maxDailyMinutes || 600)) a.tone = "minus";
    a.data.leaveTl = leaveTl;
    a.data.balanceThen = at.balance;
    return a;
  }

  /* Zeitkonto als Ziel — gerechnet wie im Gleitzeit-Planer der Werkzeuge
     (bis heute), damit die Zahl dort beim Öffnen genau so dasteht. */
  function answerTargetAccount(x, m, target, targetText, a) {
    var s = x.s, today = x.today, res = x.api.day(today);
    a.nav = { view: "tools", planner: { until: today, target: T.formatSigned(target, "clock") } };
    var todayOpen = res.target > 0 && res.credited === 0 && !res.complete &&
      res.typeMeta.stampable !== false && res.type !== "holiday";
    var base = todayOpen ? x.api.accountBalance(T.addDays(today, -1)).minutes : x.api.accountBalance().minutes;
    var days = todayOpen ? [{ date: today, target: res.target, min: res.net, today: true }] : [];
    var plan = P.distributeBalance(base, target, days, { maxNet: s.maxDailyMinutes || 600 });
    a.data.base = base;
    if (plan.reason === "no-days") {
      a.label = x.t("ask.target.noDay", { target: targetText });
      a.sub = x.t("ask.target.accountNow", { v: x.fmtS(base) });
      a.tone = toneOf(base - target) === "plus" ? "plus" : "";
      return a;
    }
    if (!plan.feasible) {
      if (plan.reason === "too-much-plus") {
        a.icon = "check";
        a.tone = "plus";
        a.label = x.t("ask.target.reachedAcc", { target: targetText });
        a.sub = x.t("ask.target.accountSub", { base: x.fmtS(base), delta: x.fmtS(res.net - res.target) });
      } else {
        a.icon = "alert";
        a.tone = "minus";
        a.label = x.t("ask.target.unreachable", { target: targetText });
        a.sub = x.t("ask.target.unreachableSub", { max: x.fmt(plan.maxNet) });
      }
      return a;
    }
    var first = plan.days[0];
    var useToday = res.startTod !== null;
    var lunch = s.defaultLunch || { start: "12:00", end: "12:30" };
    var lunchLen = T.intervalMinutes(T.parseHHMM(lunch.start), T.parseHHMM(lunch.end), T.parseHHMM(lunch.start)) || 30;
    var leave = P.leaveTimeForBalance({
      start: useToday ? res.start : "08:00",
      target: first.target,
      wantBalance: first.deltaPerDay,
      breakMinutes: useToday ? Math.max(res.breakTotal, 0) : lunchLen,
      breakRuleset: s.breakRuleset,
      customBreakTiers: s.customBreakTiers,
      autoDeductBreak: s.autoDeductBreak,
      roundStep: s.roundStep,
      roundMode: s.roundMode
    });
    a.data.leaveTl = leave ? leave.minutes : null;
    a.data.deltaToday = first.deltaPerDay;
    a.label = x.t(useToday ? "ask.target.account" : "ask.target.accountAt8", {
      time: leave ? clockText(x, leave.minutes) : "--:--", target: targetText
    });
    a.sub = join([
      x.t("ask.target.accountSub", { base: x.fmtS(base), delta: x.fmtS(first.deltaPerDay) }),
      plan.strained ? x.t("tools.strained") : null
    ]);
    if (plan.strained) a.tone = "minus";
    return a;
  }

  /* ---- Ein Tag ---------------------------------------------------- */
  function answerDay(x, iso) {
    var res = x.api.day(iso);
    var a = { intent: "day", icon: "calendar", nav: { view: "today", date: iso }, data: { date: iso, net: res.net, balance: res.balance } };
    var when = x.date(iso, "long");
    var credit = res.credited > 0 && res.net > 0;
    if (res.running || res.provisional) {
      var S = x.api.todayState;
      var need = S ? S.neededNet(res) : Math.max(0, res.target - res.credited);
      a.icon = "clock";
      a.label = res.remaining > 0
        ? x.t("ask.day.running", { net: x.fmt(res.net), rest: x.fmt(res.remaining) })
        : x.t("ask.day.runningOver", { net: x.fmt(res.net), over: x.fmtS(Math.max(0, res.net - need)) });
      a.sub = x.t("ask.day.subRunning", { date: when, from: res.start, brk: x.fmt(res.breakTotal) });
    } else if (res.incomplete) {
      a.icon = "alert";
      a.tone = "minus";
      a.label = x.t("ask.day.incomplete", { from: res.start });
      a.sub = x.t("ask.day.incompleteSub", { date: when });
    } else if (res.complete) {
      a.icon = "clock";
      a.tone = toneOf(res.balance);
      a.label = credit
        ? x.t("ask.day.workedCredit", { net: x.fmt(res.net), credit: x.fmt(res.credited), type: typeName(x, res), bal: x.fmtS(res.balance) })
        : x.t("ask.day.worked", { net: x.fmt(res.net), bal: x.fmtS(res.balance) });
      a.sub = x.t("ask.day.subTimes", { date: when, from: res.start, to: clockText(x, res.endTl), brk: x.fmt(res.effectiveBreak) });
    } else if (iso > x.today) {
      a.label = res.recorded && res.type !== "work"
        ? x.t("ask.day.futureType", { type: typeName(x, res) })
        : (res.target > 0 ? x.t("ask.day.future", { target: x.fmt(res.target) }) : x.t("ask.day.free"));
      a.sub = when;
    } else if (res.type === "holiday") {
      a.icon = "star";
      a.label = x.t("ask.day.holiday", { name: holidayName(x, res.holiday) || x.t("type.holiday") });
      a.sub = when;
    } else if (res.type === "comp") {
      a.icon = "swap";
      a.tone = toneOf(res.balance);
      a.label = x.t("ask.day.comp", { type: typeName(x, res), bal: x.fmtS(res.balance) });
      a.sub = when;
    } else if (res.credited > 0) {
      a.icon = "umbrella";
      a.label = x.t("ask.day.absence", { type: typeName(x, res), credit: x.fmt(res.credited) });
      a.sub = when;
    } else if (res.target > 0 && !res.recorded) {
      a.icon = "alert";
      a.label = x.t(iso === x.today ? "ask.day.notYet" : "ask.day.gap");
      a.sub = x.t("ask.day.gapSub", { date: when, target: x.fmt(res.target) });
    } else {
      a.icon = "moon";
      a.label = x.t("ask.day.free");
      a.sub = when;
    }
    return a;
  }

  /* ---- Woche, Monat, Jahr ----------------------------------------- */
  function answerPeriod(x, it) {
    var today = x.today, from, end, to, ref, label, nav;
    var a = { intent: "period", icon: "chart", data: { period: it.period } };
    if (it.period === "week") {
      var fd = firstDayOf(x);
      from = T.startOfWeek(it.last ? T.addDays(today, -7) : today, fd);
      end = to = T.addDays(from, 6);
      ref = T.addDays(from, fd === 0 ? 1 : 0);
      a.icon = "week";
      nav = { view: "week", date: ref };
    } else if (it.period === "month") {
      var y = it.year || T.yearOf(today), mk;
      if (it.month !== null && it.month !== undefined) {
        mk = y + "-" + T.pad2(it.month + 1);
        if (!it.year && mk > T.monthKey(today)) mk = (y - 1) + "-" + T.pad2(it.month + 1);
      } else {
        mk = T.monthKey(it.last ? T.addMonths(T.startOfMonth(today), -1) : today);
      }
      from = mk + "-01";
      end = to = T.endOfMonth(from);
      a.icon = "calendarDays";
      nav = { view: "calendar", month: mk };
    } else {
      // Wie die Statistik: ein Jahr endet heute — Zukunft hat keinen Saldo
      var yy = it.year || (T.yearOf(today) - (it.last ? 1 : 0));
      from = yy + "-01-01";
      end = to = yy + "-12-31";
      if (to > today) to = today < from ? from : today;
      nav = { view: "stats" };
    }
    var days = x.api.range(from, to).days;
    var sum = summarize(x, days);
    // Monat und Jahr wie Kalender und Statistik (abgeschlossene Monate eingefroren), die Woche wie die Wochenansicht
    var bal = it.period === "week" ? sum.settled : periodBal(x, from, to, sum.settled);
    if (it.period === "week") label = x.t("ask.period.week", { n: T.isoWeek(ref), bal: x.fmtS(bal) });
    else if (it.period === "month") {
      var d = T.fromISO(from);
      label = x.t("ask.period.month", { month: x.api.month(d.getMonth(), "long") + " " + d.getFullYear(), bal: x.fmtS(bal) });
    } else label = x.t("ask.period.year", { year: from.slice(0, 4), bal: x.fmtS(bal) });

    var actual = sum.net + sum.credited;
    // Laufender Monat/Jahr: Soll bis heute (wie im Kalender); die Woche zeigt ihr ganzes Soll
    var current = from <= today && today <= end;
    var targetShown = it.period === "week" || !current ? sum.target : sum.targetToDate;
    var parts = [
      x.t(it.period !== "week" && current ? "ask.period.subToDate" : "ask.period.sub", { actual: x.fmt(actual), target: x.fmt(targetShown) }),
      sum.runningDays ? x.t("ask.period.live", { v: x.fmtS(sum.provisional) }) : null,
      sum.gaps && sum.gaps.length ? x.tn("ask.period.gaps", sum.gaps.length) : null
    ];
    if (it.period === "year") {
      var acc = x.api.accountBalance(to).minutes;
      parts.push(x.t("ask.period.account", { v: x.fmtS(acc) }));
      a.data.account = acc;
    }
    a.label = label;
    a.sub = join(parts);
    a.tone = toneOf(bal);
    a.nav = nav;
    a.data.from = from;
    a.data.to = to;
    a.data.balance = bal;
    a.data.provisional = sum.provisional;
    a.data.actual = actual;
    a.data.target = targetShown;
    return a;
  }

  /* ---- Zeitkonto -------------------------------------------------- */
  function answerAccount(x) {
    var bal = x.api.settledBalance();
    var a = { intent: "account", icon: "chart", nav: { view: "stats" }, tone: toneOf(bal.minutes), data: { minutes: bal.minutes, live: bal.live } };
    a.label = x.t("ask.account.label", { v: x.fmtS(bal.minutes) });
    var dayTarget = R.baseTargetFor(x.today, x.s, 2) || 504;
    var comp = P.compensationDays(bal.minutes, dayTarget);
    a.sub = join([
      bal.live !== null && bal.live !== undefined
        ? x.t(bal.overnight ? "ask.account.subLiveShift" : "ask.account.subLive", { v: x.fmtS(bal.live) })
        : x.t("ask.account.subSettled"),
      comp.days > 0 ? x.tn("ask.account.comp", comp.days, { h: x.fmt(comp.dayTarget) }) : null
    ]);
    a.data.compDays = comp.days;
    return a;
  }

  /* ---- Ferien ----------------------------------------------------- */
  function answerVacation(x, it) {
    var year = it.year || T.yearOf(x.today);
    var q = E.quotaUsage(x.api.records(), year, x.s, x.now);
    var a = { intent: "vacation", icon: "umbrella", nav: { view: "stats" }, data: { year: year, quota: q, mode: it.mode } };
    var n = x.num;
    var overview = year + " · " + x.t("cal.vacationSub", {
      taken: n(q.vacationTaken), planned: n(q.vacationPlanned || 0), total: n(q.vacationEntitlement)
    });
    if (it.mode === "taken") {
      a.label = x.tn("ask.vac.taken", q.vacationTaken, { n: n(q.vacationTaken) });
      a.sub = overview;
    } else if (it.mode === "planned") {
      var next = nextVacation(x);
      a.label = x.tn("ask.vac.planned", q.vacationPlanned || 0, { n: n(q.vacationPlanned || 0) });
      a.sub = join([next ? x.t("ask.vac.next", { range: rangeText(x, next.from, next.to) }) : x.t("ask.vac.none"),
        x.tn("ask.vac.leftShort", q.vacationLeft, { n: n(q.vacationLeft) })]);
      if (next) a.nav = { view: "calendar", month: T.monthKey(next.from) };
      a.data.next = next;
    } else if (q.vacationLeft >= 0) {
      a.label = x.tn("ask.vac.left", q.vacationLeft, { n: n(q.vacationLeft) });
      a.sub = overview;
    } else {
      a.tone = "minus";
      a.label = x.tn("ask.vac.over", -q.vacationLeft, { n: n(-q.vacationLeft) });
      a.sub = overview;
    }
    return a;
  }

  /** Nächster geplanter Ferienblock ab morgen (Wochenenden/Feiertage dazwischen gehören dazu). */
  function nextVacation(x) {
    var recs = x.api.records(), today = x.today;
    var keys = Object.keys(recs).filter(function (iso) {
      return iso > today && recs[iso] && recs[iso].type === "vacation";
    }).sort();
    if (!keys.length) return null;
    var from = keys[0], to = from, cur = from;
    for (var k = 0; k < 40; k++) {
      cur = T.addDays(cur, 1);
      var r = recs[cur];
      if (r && r.type === "vacation") { to = cur; continue; }
      var res = x.api.day(cur);
      if (res.target > 0 && res.type !== "holiday") break;
    }
    return { from: from, to: to };
  }

  function rangeText(x, from, to) {
    if (from === to) return x.date(from, "dm");
    return x.date(from, "dm") + " – " + x.date(to, "dm");
  }

  /* ---- Feiertage und lange Wochenenden ---------------------------- */
  function holidaysOn(x) {
    return x.s.autoHolidays !== false && x.s.holidayRegion && x.s.holidayRegion !== "none";
  }

  function isWorkday(x, iso) { return R.baseTargetFor(iso, x.s, T.weekdayOf(iso)) > 0; }

  function answerHoliday(x) {
    var a = { intent: "holiday", icon: "star", data: {} };
    if (!holidaysOn(x)) {
      a.label = x.t("ask.hol.off");
      a.sub = x.t("ask.hol.offSub");
      a.nav = { view: "settings" };
      return a;
    }
    var list = H.between(T.addDays(x.today, 1), T.addDays(x.today, 400), x.s.holidayRegion);
    if (!list.length) {
      a.label = x.t("ask.hol.none");
      a.nav = { view: "calendar", month: T.monthKey(x.today) };
      return a;
    }
    var h = list[0];
    var name = holidayName(x, h.holiday);
    var days = T.diffDays(x.today, h.date);
    a.label = x.t("ask.hol.label", { name: name, date: x.date(h.date, "long") });
    var parts = [x.tn("ask.hol.in", days)];
    if (!isWorkday(x, h.date)) {
      parts.push(x.t("ask.hol.weekend", { wd: x.api.weekday(T.weekdayOf(h.date), "long") }));
      var nextWork = list.filter(function (o) { return isWorkday(x, o.date); })[0];
      if (nextWork) parts.push(x.t("ask.hol.nextFree", { name: holidayName(x, nextWork.holiday), date: x.date(nextWork.date, "short") }));
    }
    a.sub = join(parts);
    a.nav = { view: "calendar", month: T.monthKey(h.date) };
    a.data = { date: h.date, inDays: days };
    return a;
  }

  /** Brückentage eines Jahres — genau wie die Karte in den Werkzeugen. */
  function bridgesOfYear(x, y) {
    var map = {};
    if (holidaysOn(x)) [y - 1, y, y + 1].forEach(function (yy) { Object.assign(map, H.forYear(yy, x.s.holidayRegion)); });
    var from = (y - 1) + "-12-01";
    var tomorrow = T.addDays(x.today, 1);
    if (from < tomorrow) from = tomorrow;
    return {
      map: map,
      list: P.bridgeDays({
        from: from,
        to: (y + 1) + "-01-10",
        isHoliday: function (iso) { return !!map[iso]; },
        isWorkday: function (iso) { return isWorkday(x, iso); }
      }).filter(function (b) { return T.yearOf(b.from) === y; })
    };
  }

  /** Erstes langes Wochenende ohne Ferientag (Feiertag am Wochenrand). */
  function naturalLongWeekend(x, map) {
    var start = null, len = 0, hasHoliday = false, names = [];
    for (var k = 1; k <= 400; k++) {
      var iso = T.addDays(x.today, k);
      var work = isWorkday(x, iso);
      var free = !work || !!map[iso];
      if (free) {
        if (start === null) { start = iso; len = 0; hasHoliday = false; names = []; }
        len++;
        if (work && map[iso]) { hasHoliday = true; names.push(holidayName(x, map[iso])); }
      } else {
        if (start !== null && len >= 3 && hasHoliday) return { from: start, to: T.addDays(start, len - 1), totalDays: len, names: names };
        start = null;
      }
    }
    return null;
  }

  function answerBridge(x) {
    var a = { intent: "bridge", icon: "plane", data: {} };
    if (!holidaysOn(x)) return answerHoliday(x);
    var y = T.yearOf(x.today);
    var thisYear = bridgesOfYear(x, y), nextYear = bridgesOfYear(x, y + 1);
    var map = Object.assign({}, thisYear.map, nextYear.map);
    var bridge = thisYear.list[0] || nextYear.list[0] || null;
    var natural = naturalLongWeekend(x, map);
    if (!bridge && !natural) {
      a.label = x.t("ask.bridge.none", { year: y });
      a.nav = { view: "tools", section: "bridges" };
      return a;
    }
    var useNatural = natural && (!bridge || natural.from <= bridge.from);
    if (useNatural) {
      a.label = x.t("ask.bridge.free", { range: rangeText(x, natural.from, natural.to), t: natural.totalDays });
      a.sub = natural.names.join(", ");
      a.nav = { view: "calendar", month: T.monthKey(natural.from) };
      a.data = { kind: "natural", from: natural.from, to: natural.to, totalDays: natural.totalDays };
      return a;
    }
    var names = bridge.holidays.map(function (iso) { return holidayName(x, map[iso]); }).filter(Boolean).join(", ");
    var recs = x.api.records();
    var booked = bridge.dates.every(function (iso) { return recs[iso] && recs[iso].type === "vacation"; });
    a.label = x.tn("ask.bridge.label", bridge.vacationDays, { range: rangeText(x, bridge.from, bridge.to), t: bridge.totalDays, n: bridge.vacationDays });
    a.sub = join([names, x.t("ask.bridge.dates", { dates: bridge.dates.map(function (d) { return x.date(d, "dm"); }).join(", ") }),
      booked ? x.t("tools.bridgeBooked") : null]);
    a.nav = { view: "tools", section: "bridges" };
    a.data = { kind: "bridge", from: bridge.from, to: bridge.to, totalDays: bridge.totalDays, vacationDays: bridge.vacationDays };
    return a;
  }

  /* ---- Pause ------------------------------------------------------ */
  function tiersOf(s) {
    var raw = s.breakRuleset === "custom" ? (s.customBreakTiers || [])
      : ((R.BREAK_RULESETS[s.breakRuleset] || R.BREAK_RULESETS.ch).tiers);
    return raw.filter(function (t) { return t && isFinite(t.over) && isFinite(t.require) && +t.require > 0; })
      .map(function (t) { return { over: +t.over, require: +t.require }; })
      .sort(function (p, q) { return p.over - q.over; });
  }

  function tierText(x, tiers) {
    return tiers.map(function (t) { return x.t("ask.brk.next", { over: x.fmt(t.over), req: x.fmt(t.require) }); }).join(" · ");
  }

  function answerBreak(x) {
    var m = todayModel(x), res = m.res, s = x.s;
    var a = { intent: "break", icon: "coffee", nav: { view: "today", date: m.iso }, data: {} };
    var tiers = tiersOf(s);
    var legal = typeof res.legalBreak === "number" ? res.legalBreak : (res.breakTotal || 0);
    if (res.running) {
      var recB = m.S.recommendedBreak(res) || 0;
      var want = Math.max(res.requiredBreak || 0, recB);
      a.data = { want: want, taken: legal };
      if (want <= 0) a.label = x.t("ask.brk.none");
      else if (legal >= want) { a.label = x.t("ask.brk.done", { v: x.fmt(want) }); a.tone = "plus"; }
      else a.label = x.t("ask.brk.todo", { v: x.fmt(want - legal) });
      // Nächste Stufe, die mehr verlangt, als schon gemacht ist
      var work = typeof res.workingTime === "number" ? res.workingTime : res.net;
      var next = tiers.filter(function (t) { return t.over >= work && t.require > legal; })[0] || null;
      a.sub = join([want > 0 ? x.t("ask.brk.subTaken", { taken: x.fmt(legal), want: x.fmt(want) }) : null,
        next ? x.t("ask.brk.next", { over: x.fmt(next.over), req: x.fmt(next.require) }) : null]);
      return a;
    }
    if (res.complete) {
      var ok = legal + (res.autoDeducted || 0) >= (res.requiredBreak || 0);
      a.label = x.t("ask.brk.ended", { taken: x.fmt(legal), req: x.fmt(res.requiredBreak || 0) });
      a.sub = res.autoDeducted ? x.t("ask.brk.auto", { v: x.fmt(res.autoDeducted) }) : x.date(m.iso, "long");
      a.tone = ok && !res.autoDeducted ? "plus" : "";
      a.data = { taken: legal, required: res.requiredBreak };
      return a;
    }
    /* Noch nicht gestempelt: für einen vollen Tag, wie „Wenn du jetzt kommst“ */
    var full;
    if (m.need > 0 && m.S.stampable(res)) full = m.S.recommendedBreak(whatIf(x, m.iso)) || 0;
    else full = Math.round(R.presenceForNet(R.baseTargetFor(x.today, s, 2) || 504, s, {}).deducted);
    a.label = x.t("ask.brk.full", { v: x.fmt(full) });
    a.sub = tierText(x, tiers);
    a.data = { full: full };
    return a;
  }

  /* ---- Überzeit / Plus-Tage --------------------------------------- */
  function answerOvertime(x, it) {
    var y = it.year || T.yearOf(x.today);
    var from = y + "-01-01", to = y + "-12-31";
    if (to > x.today) to = x.today;
    var a = { intent: "overtime", icon: "flame", nav: { view: "stats" }, data: { year: y } };
    if (from > x.today) { a.label = x.t("ask.ot.lawNone", { year: y }); return a; }
    var range = x.api.range(from, to);
    var plusDays = 0, plusSum = 0;
    range.days.forEach(function (r) {
      if (r.running || r.incomplete || r.provisional) return;
      if (r.balance > 0) { plusDays++; plusSum += r.balance; }
    });
    /* Überzeit wie in den Erkenntnissen der Statistik (mit Jahreskontingent),
       sonst wie im Rapport — erst ohne beides zählen die Plus-Tage */
    var ot = x.api.overtimeYear ? x.api.overtimeYear(y) : null;
    var maxWeekly = ot ? ot.maxWeekly : x.s.maxWeeklyMinutes;
    var law = ot ? ot.total
      : (x.api.overtimeLaw && maxWeekly ? x.api.overtimeLaw(range.days, x.today, maxWeekly) : null);
    var daysText = x.tn("ask.ot.days", plusDays);
    a.data.plusDays = plusDays;
    a.data.plusSum = plusSum;
    a.data.law = law;
    var yearBal = periodBal(x, from, to, range.totals.balance);
    a.data.balance = yearBal;
    if (law !== null && law !== undefined) {
      a.label = law > 0 ? x.t("ask.ot.law", { v: x.fmt(law), year: y }) : x.t("ask.ot.lawNone", { year: y });
      a.sub = join([x.t("ask.ot.sub", { h: x.num(Math.round(maxWeekly / 6) / 10), days: daysText, bal: x.fmtS(yearBal) }),
        ot && ot.cap ? x.t("ask.ot.cap", { cap: x.fmt(ot.cap) }) : null]);
      a.tone = ot && ot.over ? "minus" : "";
      if (ot) a.data.cap = ot.cap;
    } else {
      a.label = x.t("ask.ot.plus", { days: daysText, year: y });
      a.sub = x.t("ask.ot.plusSub", { sum: x.fmtS(plusSum), bal: x.fmtS(yearBal) });
      a.tone = plusDays ? "plus" : "";
    }
    return a;
  }

  /* ---- Bis zum Wochensoll ----------------------------------------- */
  function answerWeekRest(x) {
    var fd = firstDayOf(x);
    var from = T.startOfWeek(x.today, fd), to = T.addDays(from, 6);
    var ref = T.addDays(from, fd === 0 ? 1 : 0);
    var days = x.api.range(from, to).days;
    var sum = summarize(x, days);
    var actual = sum.net + sum.credited, rest = sum.target - actual;
    var open = days.filter(function (r) {
      return r.target > 0 && (r.date > x.today ? !r.recorded : (r.date === x.today && (r.running || r.provisional || !r.recorded)));
    }).length;
    var a = { intent: "weekRest", icon: "week", nav: { view: "week", date: ref }, data: { actual: actual, target: sum.target, rest: rest, openDays: open } };
    if (rest > 0) a.label = x.t("ask.wk.rest", { v: x.fmt(rest) });
    else { a.label = x.t("ask.wk.done", { v: x.fmt(-rest) }); a.tone = "plus"; }
    a.sub = join([x.t("ask.wk.sub", { n: T.isoWeek(ref), actual: x.fmt(actual), target: x.fmt(sum.target) }),
      rest > 0 && open ? x.tn("ask.wk.days", open) : null]);
    return a;
  }

  /* ---- Wann zuletzt vor/nach … ------------------------------------ */
  function answerLast(x, it) {
    var recs = x.api.records(), today = x.today, year = T.yearOf(today);
    var limit = it.minutes, before = it.dir !== "after";
    var keys = Object.keys(recs).filter(function (iso) { return iso <= today; }).sort().reverse();
    var found = null, foundTime = null, count = 0;
    keys.forEach(function (iso) {
      var r = recs[iso];
      if (!r) return;
      var st = T.parseHHMM(r.start);
      if (st === null) return;
      var hit = false, tl = null;
      if (before) { hit = st < limit; tl = st; }
      else {
        var en = T.parseHHMM(r.end);
        if (en === null) return;
        tl = T.onTimeline(en, st);
        hit = tl > limit;
      }
      if (!hit) return;
      if (!found) { found = iso; foundTime = tl; }
      if (T.yearOf(iso) === year) count++;
    });
    var limitText = T.formatHHMM(limit);
    var a = { intent: "last", icon: before ? "sun" : "moon", data: { date: found, count: count, dir: it.dir, minutes: limit } };
    if (!found) {
      a.label = x.t(before ? "ask.last.never" : "ask.last.neverAfter", { h: limitText });
      a.sub = x.t("ask.last.neverSub");
      a.nav = { view: "stats" };
      return a;
    }
    var ago = T.diffDays(found, today);
    a.label = x.t(before ? "ask.last.before" : "ask.last.after", { h: limitText, date: x.date(found, "long"), time: clockText(x, foundTime) });
    a.sub = join([ago === 0 ? x.t("ask.last.today") : x.tn("ask.last.ago", ago), x.tn("ask.last.count", count, { year: year })]);
    a.nav = { view: "today", date: found };
    return a;
  }

  /* ---- Hilfe ------------------------------------------------------ */
  var HELP_TOPICS = ["leave", "vacation", "day", "week", "holiday", "target", "break", "last"];

  function answerHelp(x) {
    return HELP_TOPICS.map(function (k) {
      return { intent: "help", topic: k, icon: "search", label: x.t("ask.ex." + k), sub: x.t("ask.exs." + k), fill: x.t("ask.ex." + k) };
    });
  }

  var BUILDERS = {
    leave: answerLeave, target: answerTarget, period: answerPeriod, account: answerAccount,
    vacation: answerVacation, holiday: answerHoliday, bridge: answerBridge, "break": answerBreak,
    overtime: answerOvertime, weekRest: answerWeekRest, last: answerLast, help: answerHelp,
    day: function (x, it) { return answerDay(x, it.date); }
  };

  /**
   * @param {Object} it   eine Deutung aus parse()
   * @param {Object} api  Datenzugang (siehe oben)
   * @returns {Array} Antworten (Hilfe liefert mehrere)
   */
  function answer(it, api) {
    var fn = BUILDERS[it && it.intent];
    if (!fn) return [];
    var r = fn(ctxOf(api), it);
    return Array.isArray(r) ? r : (r ? [r] : []);
  }

  /** Frage → Antworten (höchstens zwei Deutungen, Hilfe bis zu acht Beispiele). */
  function ask(text, api) {
    var out = [];
    parse(text, { today: api.today }).forEach(function (it) { out = out.concat(answer(it, api)); });
    return out;
  }

  return {
    fold: fold,
    analyze: analyze,
    parse: parse,
    answer: answer,
    ask: ask,
    HELP_TOPICS: HELP_TOPICS,
    _distance: distance
  };
});
