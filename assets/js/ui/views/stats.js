/* ==========================================================================
   ZEITKONTO — Ansicht „Statistik“
   --------------------------------------------------------------------------
   Jede Grafik beantwortet genau eine Frage. Kein Diagramm hat zwei Skalen,
   Plus und Minus tragen immer Vorzeichen, Lage und Schraffur zusätzlich zur
   Farbe.

   Alle Kennzahlen eines Zeitraums enden bei HEUTE: Zukunft hat weder Ist
   noch Saldo, und ein Verlauf, der flach ins Monatsende läuft, erzählt
   etwas, das noch nicht passiert ist. Geplante Abwesenheiten erscheinen
   nur dort, wo sie hingehören (Kontingente, Jahresübersicht).
   ========================================================================== */
(function (root) {
  "use strict";
  var ZK = root.ZK = root.ZK || {};
  var D = ZK.Dom, T = ZK.Time, R = ZK.Rules, I = ZK.I18n;

  I.add({
    de: {
      "stats.pMonth": "Monat",
      "stats.pQuarter": "90 Tage",
      "stats.pYear": "Jahr",
      "stats.pAll": "Alle",
      "stats.asOf": "Stand {date}",
      "stats.nWorked": "{n} gearbeitete Tage",
      "stats.nWorked.one": "1 gearbeiteter Tag",
      "stats.earliest": "früheste {t}",
      "stats.latest": "späteste {t}",
      "stats.nMinus": "{n} Tage im Minus",
      "stats.nMinus.one": "1 Tag im Minus",
      "stats.autoDeducted": "+{v} automatisch abgezogen",
      "stats.nGaps": "{n} nicht erfasste Arbeitstage",
      "stats.nGaps.one": "1 nicht erfasster Arbeitstag",
      "stats.longestOn": "am {date}",
      "stats.accountPlus": "Zeitkonto im Plus",
      "stats.accountMinus": "Zeitkonto im Minus",
      "stats.start": "Beginn",
      "stats.trendStart": "Beginn {v}",
      "stats.today": "Heute",
      "stats.monthlyHours": "Stunden pro Monat",
      "stats.kwShort": "KW{n}",
      "stats.actual": "Ist inkl. Absenzen",
      "stats.targetMark": "Soll (anteilig)",
      "stats.partialWeek": "Teilwoche",
      "stats.partialMonth": "Teilmonat",
      "stats.partial": "angeschnitten",
      "stats.targetOf": "Soll {v}",
      "stats.balanceOf": "Saldo {v}",
      "stats.until": "bis {date}",
      "stats.nightHidden": "{n} Nachtschichten nicht dargestellt (Ende am Folgetag).",
      "stats.nightHidden.one": "1 Nachtschicht nicht dargestellt (Ende am Folgetag).",
      "stats.compliantOf": "{a} von {n} Tagen regelkonform",
      "stats.compliantOf.one": "{a} von 1 Tag regelkonform",
      "stats.noBreakDuty": "Im Zeitraum gab es keinen Tag mit Pausenpflicht.",
      "stats.autoTotal": "Automatisch abgezogen: {v}",
      "stats.heatZero": "±0 / Abwesenheit",
      "stats.heatGap": "Lücke",
      "stats.heatOpen": "Gehen fehlt",
      "stats.heatNothing": "nichts erfasst",
      "stats.heatFree": "frei",
      "stats.heatPlanned": "geplant",
      "stats.heatRunning": "läuft",
      "stats.heatAria": "Jahresübersicht {year}. Pfeiltasten wechseln den Tag, Eingabe öffnet ihn.",
      "stats.netOf": "{v} netto",
      "stats.sickAccident": "Krankheit/Unfall",
      "stats.vacation": "Ferien",
      "stats.holidays": "Feiertage",
      "stats.other": "Übrige Absenzen",
      "stats.provisional": "Zwischenstand inkl. heute {v}",
      "stats.vacTaken": "bezogen",
      "stats.vacPlanned": "geplant",
      "stats.vacLeft": "{n} offen",
      "stats.vacLine": "{taken} bezogen · {planned} geplant · {left} offen",
      "stats.vacLineNoPlan": "{taken} bezogen · {left} offen",
      "stats.holidayAhead": "{n} folgen noch",
      "stats.periodDays": "{from} – {to}",
      "stats.avgNoNights": "Ø ohne {n} Nachtschichten",
      "stats.avgNoNights.one": "Ø ohne 1 Nachtschicht",
      "stats.avgShifts": "Schichten wechseln – kein Ø"
    },
    en: {
      "stats.pMonth": "Month",
      "stats.pQuarter": "90 days",
      "stats.pYear": "Year",
      "stats.pAll": "All",
      "stats.asOf": "As of {date}",
      "stats.nWorked": "{n} days worked",
      "stats.nWorked.one": "1 day worked",
      "stats.earliest": "earliest {t}",
      "stats.latest": "latest {t}",
      "stats.nMinus": "{n} days in debit",
      "stats.nMinus.one": "1 day in debit",
      "stats.autoDeducted": "+{v} deducted automatically",
      "stats.nGaps": "{n} working days not recorded",
      "stats.nGaps.one": "1 working day not recorded",
      "stats.longestOn": "on {date}",
      "stats.accountPlus": "Account in credit",
      "stats.accountMinus": "Account in debit",
      "stats.start": "Start",
      "stats.trendStart": "Start {v}",
      "stats.today": "Today",
      "stats.monthlyHours": "Hours per month",
      "stats.kwShort": "W{n}",
      "stats.actual": "Actual incl. absences",
      "stats.targetMark": "Target (pro rata)",
      "stats.partialWeek": "Partial week",
      "stats.partialMonth": "Partial month",
      "stats.partial": "partial",
      "stats.targetOf": "Target {v}",
      "stats.balanceOf": "Balance {v}",
      "stats.until": "until {date}",
      "stats.nightHidden": "{n} night shifts not shown (ending the next day).",
      "stats.nightHidden.one": "1 night shift not shown (ending the next day).",
      "stats.compliantOf": "{a} of {n} days compliant",
      "stats.compliantOf.one": "{a} of 1 day compliant",
      "stats.noBreakDuty": "No day in this period required a break.",
      "stats.autoTotal": "Deducted automatically: {v}",
      "stats.heatZero": "±0 / absence",
      "stats.heatGap": "Gap",
      "stats.heatOpen": "Clock-out missing",
      "stats.heatNothing": "nothing recorded",
      "stats.heatFree": "day off",
      "stats.heatPlanned": "planned",
      "stats.heatRunning": "running",
      "stats.heatAria": "Year overview {year}. Arrow keys change the day, Enter opens it.",
      "stats.netOf": "{v} net",
      "stats.sickAccident": "Illness/accident",
      "stats.vacation": "Vacation",
      "stats.holidays": "Public holidays",
      "stats.other": "Other absences",
      "stats.provisional": "Provisional incl. today {v}",
      "stats.vacTaken": "taken",
      "stats.vacPlanned": "planned",
      "stats.vacLeft": "{n} left",
      "stats.vacLine": "{taken} taken · {planned} planned · {left} left",
      "stats.vacLineNoPlan": "{taken} taken · {left} left",
      "stats.holidayAhead": "{n} still to come",
      "stats.periodDays": "{from} – {to}",
      "stats.avgNoNights": "avg. excl. {n} night shifts",
      "stats.avgNoNights.one": "avg. excl. 1 night shift",
      "stats.avgShifts": "rotating shifts – no avg."
    },
    fr: {
      "stats.pMonth": "Mois",
      "stats.pQuarter": "90 jours",
      "stats.pYear": "Année",
      "stats.pAll": "Tout",
      "stats.asOf": "État au {date}",
      "stats.nWorked": "{n} jours travaillés",
      "stats.nWorked.one": "1 jour travaillé",
      "stats.earliest": "au plus tôt {t}",
      "stats.latest": "au plus tard {t}",
      "stats.nMinus": "{n} jours en moins",
      "stats.nMinus.one": "1 jour en moins",
      "stats.autoDeducted": "+{v} déduit automatiquement",
      "stats.nGaps": "{n} jours ouvrés non saisis",
      "stats.nGaps.one": "1 jour ouvré non saisi",
      "stats.longestOn": "le {date}",
      "stats.accountPlus": "Compte en positif",
      "stats.accountMinus": "Compte en négatif",
      "stats.start": "Début",
      "stats.trendStart": "Début {v}",
      "stats.today": "Aujourd’hui",
      "stats.monthlyHours": "Heures par mois",
      "stats.kwShort": "S{n}",
      "stats.actual": "Effectif, absences incluses",
      "stats.targetMark": "Dû (au prorata)",
      "stats.partialWeek": "Semaine partielle",
      "stats.partialMonth": "Mois partiel",
      "stats.partial": "partiel",
      "stats.targetOf": "Dû {v}",
      "stats.balanceOf": "Solde {v}",
      "stats.until": "jusqu’au {date}",
      "stats.nightHidden": "{n} services de nuit non affichés (fin le lendemain).",
      "stats.nightHidden.one": "1 service de nuit non affiché (fin le lendemain).",
      "stats.compliantOf": "{a} jours conformes sur {n}",
      "stats.compliantOf.one": "{a} jour conforme sur 1",
      "stats.noBreakDuty": "Aucun jour de la période n’exigeait de pause.",
      "stats.autoTotal": "Déduit automatiquement : {v}",
      "stats.heatZero": "±0 / absence",
      "stats.heatGap": "Lacune",
      "stats.heatOpen": "Départ manquant",
      "stats.heatNothing": "rien de saisi",
      "stats.heatFree": "libre",
      "stats.heatPlanned": "prévu",
      "stats.heatRunning": "en cours",
      "stats.heatAria": "Vue annuelle {year}. Les flèches changent de jour, Entrée l’ouvre.",
      "stats.netOf": "{v} net",
      "stats.sickAccident": "Maladie/accident",
      "stats.vacation": "Vacances",
      "stats.holidays": "Jours fériés",
      "stats.other": "Autres absences",
      "stats.provisional": "Provisoire, aujourd’hui inclus {v}",
      "stats.vacTaken": "pris",
      "stats.vacPlanned": "prévus",
      "stats.vacLeft": "{n} restants",
      "stats.vacLine": "{taken} pris · {planned} prévus · {left} restants",
      "stats.vacLineNoPlan": "{taken} pris · {left} restants",
      "stats.holidayAhead": "encore {n} à venir",
      "stats.periodDays": "{from} – {to}",
      "stats.avgNoNights": "moy. sans {n} services de nuit",
      "stats.avgNoNights.one": "moy. sans 1 service de nuit",
      "stats.avgShifts": "horaires alternés – pas de moy."
    },
    it: {
      "stats.pMonth": "Mese",
      "stats.pQuarter": "90 giorni",
      "stats.pYear": "Anno",
      "stats.pAll": "Tutto",
      "stats.asOf": "Situazione al {date}",
      "stats.nWorked": "{n} giorni lavorati",
      "stats.nWorked.one": "1 giorno lavorato",
      "stats.earliest": "il più presto {t}",
      "stats.latest": "il più tardi {t}",
      "stats.nMinus": "{n} giorni in negativo",
      "stats.nMinus.one": "1 giorno in negativo",
      "stats.autoDeducted": "+{v} dedotti automaticamente",
      "stats.nGaps": "{n} giorni lavorativi non registrati",
      "stats.nGaps.one": "1 giorno lavorativo non registrato",
      "stats.longestOn": "il {date}",
      "stats.accountPlus": "Conto in positivo",
      "stats.accountMinus": "Conto in negativo",
      "stats.start": "Inizio",
      "stats.trendStart": "Inizio {v}",
      "stats.today": "Oggi",
      "stats.monthlyHours": "Ore al mese",
      "stats.kwShort": "S{n}",
      "stats.actual": "Effettivo, assenze incluse",
      "stats.targetMark": "Dovuto (pro rata)",
      "stats.partialWeek": "Settimana parziale",
      "stats.partialMonth": "Mese parziale",
      "stats.partial": "parziale",
      "stats.targetOf": "Dovuto {v}",
      "stats.balanceOf": "Saldo {v}",
      "stats.until": "fino al {date}",
      "stats.nightHidden": "{n} turni di notte non mostrati (fine il giorno dopo).",
      "stats.nightHidden.one": "1 turno di notte non mostrato (fine il giorno dopo).",
      "stats.compliantOf": "{a} giorni conformi su {n}",
      "stats.compliantOf.one": "{a} giorno conforme su 1",
      "stats.noBreakDuty": "Nel periodo nessun giorno richiedeva una pausa.",
      "stats.autoTotal": "Dedotto automaticamente: {v}",
      "stats.heatZero": "±0 / assenza",
      "stats.heatGap": "Lacuna",
      "stats.heatOpen": "Uscita mancante",
      "stats.heatNothing": "niente registrato",
      "stats.heatFree": "libero",
      "stats.heatPlanned": "pianificato",
      "stats.heatRunning": "in corso",
      "stats.heatAria": "Panoramica annuale {year}. Le frecce cambiano giorno, Invio lo apre.",
      "stats.netOf": "{v} netto",
      "stats.sickAccident": "Malattia/infortunio",
      "stats.vacation": "Vacanze",
      "stats.holidays": "Giorni festivi",
      "stats.other": "Altre assenze",
      "stats.provisional": "Provvisorio, oggi incluso {v}",
      "stats.vacTaken": "godute",
      "stats.vacPlanned": "pianificate",
      "stats.vacLeft": "{n} rimanenti",
      "stats.vacLine": "{taken} godute · {planned} pianificate · {left} rimanenti",
      "stats.vacLineNoPlan": "{taken} godute · {left} rimanenti",
      "stats.holidayAhead": "ancora {n} in arrivo",
      "stats.periodDays": "{from} – {to}",
      "stats.avgNoNights": "media senza {n} turni di notte",
      "stats.avgNoNights.one": "media senza 1 turno di notte",
      "stats.avgShifts": "turni alterni – nessuna media"
    }
  });

  /* -------------------------------------------------------------------- */
  /* Reine Rechenhilfen (ohne DOM) — auch für die Node-Tests              */
  /* -------------------------------------------------------------------- */

  /**
   * Zeitraum einer Auswahl. `until` ist das letzte Datum mit Daten (höchstens
   * heute); `to` das Achsenende (Monats-/Jahresende), damit „Heute“ als
   * Marke im Verlauf stehen kann.
   * bucket: Säulen nach Woche oder Monat · grain: Verlauf nach Tag oder Woche
   */
  function resolvePeriod(mode, keys, today) {
    var p;
    if (mode === "quarter") {
      p = { from: T.addDays(today, -89), to: today, grain: "day", bucket: "week" };
    } else if (mode === "year") {
      p = { from: T.yearOf(today) + "-01-01", to: T.yearOf(today) + "-12-31", grain: "week", bucket: "month" };
    } else if (mode === "all") {
      var first = keys && keys.length ? keys[0] : today;
      if (first > today) first = today;
      var long = T.diffDays(first, today) > 120;
      p = { from: first, to: today, grain: long ? "week" : "day", bucket: long ? "month" : "week" };
    } else {
      mode = "month";
      p = { from: T.startOfMonth(today), to: T.endOfMonth(today), grain: "day", bucket: "week" };
    }
    p.mode = mode;
    p.until = p.to < today ? p.to : today;
    return p;
  }

  /**
   * Säulen „Stunden pro Woche/Monat“. Jede Säule trägt ihr eigenes Soll:
   * nur die Tage, die wirklich im Zeitraum (und nicht in der Zukunft)
   * liegen — eine angeschnittene Woche wird nicht am vollen Wochensoll
   * gemessen. `deltas` (ZK.Closing.dayDeltas): abgeschlossene Monate mit
   * ihrem eingefrorenen Saldo, wie im Kalender.
   */
  function groupBars(days, bucket, deltas) {
    var map = {}, order = [];
    days.forEach(function (r) {
      var key = bucket === "month" ? T.monthKey(r.date) : T.startOfWeek(r.date, 1);
      var b = map[key];
      if (!b) {
        b = map[key] = { key: key, from: r.date, to: r.date, value: 0, ref: 0, balance: 0, count: 0 };
        order.push(key);
      }
      b.to = r.date;
      b.count++;
      b.value += (r.net || 0) + (r.credited || 0);
      b.ref += r.target || 0;
      b.balance += (r.balance || 0) + ((deltas && deltas[r.date]) || 0);
    });
    return order.map(function (k) {
      var b = map[k];
      var full = bucket === "month" ? T.daysInMonth(+k.slice(0, 4), +k.slice(5, 7) - 1) : 7;
      b.partial = b.count < full;
      return b;
    });
  }

  /**
   * Kontostand-Verlauf: Startpunkt (Stand vor dem Zeitraum) + ein Punkt pro
   * Tag oder pro Woche bis `until`. `slots` ist die Länge der ganzen Achse.
   * Ein laufender Tag ist noch nicht abgerechnet (wie im Konto): er bewegt
   * die Linie nicht, sein Zwischenstand steht als `provisional` am Punkt.
   * `deltas` (ZK.Closing.dayDeltas): Tage abgeschlossener Monate zählen
   * eingefroren — die Linie endet so beim Zeitkonto der Kennzahl.
   */
  function trendSeries(days, before, period, deltas) {
    var points = [{ date: period.from, start: true, value: before }];
    var running = before;
    var weekKey = null;
    days.forEach(function (r) {
      var open = !!(r.provisional || r.running);
      if (!open) running += (r.balance || 0) + ((deltas && deltas[r.date]) || 0);
      var pt;
      if (period.grain === "week") {
        var wk = T.startOfWeek(r.date, 1);
        if (wk !== weekKey) {
          weekKey = wk;
          pt = { date: r.date, week: wk, value: running };
          points.push(pt);
        } else {
          pt = points[points.length - 1];
          pt.date = r.date;
          pt.value = running;
        }
      } else {
        pt = { date: r.date, value: running };
        points.push(pt);
      }
      if (open) pt.provisional = running + (r.balance || 0);
    });
    var slots;
    if (period.grain === "week") {
      slots = 1 + Math.floor(T.diffDays(T.startOfWeek(period.from, 1), T.startOfWeek(period.to, 1)) / 7) + 1;
    } else {
      slots = 1 + T.diffDays(period.from, period.to) + 1;
    }
    return { points: points, slots: Math.max(points.length, slots) };
  }

  /** Art einer Heatmap-Zelle — eine Definition für Farbe, Legende und Tooltip.
      since: Erfassungsbeginn — davor ist ein leerer Arbeitstag keine Lücke
      (Engine.isGap, wie Kalender und Kennzahlen); ohne Angabe ohne Grenze. */
  function heatKind(r, today, since) {
    if (r.provisional || r.running) return "running";
    if (r.date > today) return r.recorded ? "planned" : "future";
    if (r.incomplete) return "open";
    if (r.recorded) return r.balance ? "value" : "zero";
    if (ZK.Engine.isGap(r, today, since)) return "gap";
    return "off";
  }

  /**
   * Kontingente eines Jahres aus berechneten Tagen (inkl. automatischer
   * Feiertage) — dieselbe Quelle wie „Tagesarten“ und dieselben Regeln wie
   * Engine.quotaUsage: nur Arbeitstage ohne Feiertag kosten Kontingent,
   * jeder Feiertag auf einem Arbeitstag zählt. Zusätzlich getrennt nach
   * bisher (bis heute) und noch kommend.
   */
  function quotaOf(days, year, today, settings) {
    var s = settings || {};
    var q = { vacationTaken: 0, vacationPlanned: 0, sick: 0, comp: 0, holiday: 0, holidayAhead: 0, other: 0 };
    days.forEach(function (r) {
      if (T.yearOf(r.date) !== year) return;
      var past = r.date <= today;
      if (r.type === "holiday" || r.holiday) {
        if (r.baseTarget > 0) { if (past) q.holiday += 1; else q.holidayAhead += 1; }
        return;
      }
      if (!(r.baseTarget > 0)) return;
      var f = r.absenceFactor === undefined || r.absenceFactor === null ? 1 : r.absenceFactor;
      if (r.type === "vacation") { if (past) q.vacationTaken += f; else q.vacationPlanned += f; }
      else if (r.type === "sick" || r.type === "accident") q.sick += f;
      else if (r.type === "comp") q.comp += f;
      else if (r.type === "military" || r.type === "unpaid" || r.type === "training") q.other += f;
    });
    Object.keys(q).forEach(function (k) { q[k] = Math.round(q[k] * 100) / 100; });
    q.vacationEntitlement = (s.vacationDaysPerYear || 0) + (s.vacationCarryDays || 0);
    q.vacationLeft = Math.round((q.vacationEntitlement - q.vacationTaken - q.vacationPlanned) * 100) / 100;
    return q;
  }

  /** Tagesarten im Zeitraum. Ein Samstagseinsatz ist Arbeit, nicht „frei“. */
  function typeCounts(days) {
    var out = {};
    days.forEach(function (r) {
      if (!r.recorded) return;
      var k = r.type === "free" && r.net > 0 ? "work" : r.type;
      var f = r.absenceFactor === undefined || r.absenceFactor === null ? 1 : r.absenceFactor;
      out[k] = (out[k] || 0) + (k === "work" ? 1 : f);
    });
    Object.keys(out).forEach(function (k) { out[k] = Math.round(out[k] * 100) / 100; });
    return out;
  }

  /** Uhrzeit auf der Zeitachse des Tages: 30:00 → „06:00 (+1)“. */
  function clock(minutes) {
    if (minutes === null || minutes === undefined) return "–";
    var off = T.dayOffsetOf(minutes);
    return T.formatHHMM(minutes) + (off > 0 ? " (+" + off + ")" : "");
  }

  /** Ein Durchlauf über die Tage für alle Kennzahlen, die die Engine nicht liefert. */
  function summarize(days, hasRecord) {
    var o = { recorded: 0, worked: 0, plus: 0, minus: 0, longest: 0, longestDate: null };
    days.forEach(function (r) {
      if (r.recorded && (!hasRecord || hasRecord(r.date))) o.recorded++;
      if (r.net > 0) {
        o.worked++;
        if (r.net > o.longest) { o.longest = r.net; o.longestDate = r.date; }
      }
      // laufende und unvollständige Tage sind noch nicht entschieden
      if (r.running || r.incomplete || r.provisional) return;
      if (r.balance > 0) o.plus++;
      if (r.balance < 0) o.minus++;
    });
    return o;
  }

  var calc = {
    resolvePeriod: resolvePeriod,
    groupBars: groupBars,
    trendSeries: trendSeries,
    heatKind: heatKind,
    quotaOf: quotaOf,
    typeCounts: typeCounts,
    clock: clock,
    summarize: summarize
  };

  (ZK.Views = ZK.Views || {}).stats = { render: render, calc: calc };

  var periodState = "month";

  /* -------------------------------------------------------------------- */
  /* Zwischenspeicher je Datenstand                                        */
  /* Ein Wechsel des Zeitraums, ein Fenster-Resize oder das Design-        */
  /* Umschalten zeichnet neu, ohne dass sich Daten geändert hätten —       */
  /* dann rechnen wir nichts doppelt. Jede Speicherung im Store,            */
  /* ein neuer Tag oder eine neue Minute (laufender Tag) macht ihn leer.   */
  /* -------------------------------------------------------------------- */
  var rev = 0;
  var watched = null;
  var memo = { key: "", data: {} };

  function cached(App, name, fn) {
    if (watched !== App.store && App.store && App.store.subscribe) {
      watched = App.store;
      App.store.subscribe(function (evt) { if (!evt || evt.type !== "achievements") rev++; });
    }
    var key = rev + "|" + T.todayISO() + "|" + Math.floor(Date.now() / 60000);
    if (memo.key !== key) memo = { key: key, data: {} };
    if (!Object.prototype.hasOwnProperty.call(memo.data, name)) memo.data[name] = fn();
    return memo.data[name];
  }

  /** Erfassungsbeginn (Engine.trackingStart) — ab hier zählen fehlende
      Arbeitstage als Lücke, wie in Kalender, Woche und Monatscheck. */
  function trackingStart(App) {
    return cached(App, "tstart", function () {
      return ZK.Engine.trackingStart(App.store.allDays(), App.settings(), App.store.getMeta ? App.store.getMeta() : null);
    });
  }

  /** Zeitraum mit Lücken ab Erfassungsbeginn — derselbe Eintrag im Zwischenspeicher für Statistik und Berichte. */
  function rangeOf(App, from, to) {
    return cached(App, "range|" + from + "|" + to, function () {
      return App.range(from, to, { since: trackingStart(App) });
    });
  }

  // Gemeinsam mit „Berichte“ (gleicher Zwischenspeicher, gleiche Definitionen)
  ZK.Insight = { cached: cached, calc: calc, trackingStart: trackingStart, range: rangeOf };

  /* -------------------------------------------------------------------- */
  function render(host, App) {
    var s = App.settings();
    var today = T.todayISO();
    var keys = cached(App, "keys", function () { return Object.keys(App.store.allDays()).sort(); });

    var period = resolvePeriod(periodState, keys, today);
    var dd = { day: "2-digit", month: "2-digit" };

    /* ---- Kopf ---- */
    var head = D.el("div.view-head");
    var left = D.el("div");
    left.appendChild(D.el("h1", { text: I.t("stats.title") }));
    left.appendChild(D.el("p.lede", { text: I.t("stats.lede") }));
    head.appendChild(left);

    var seg = D.el("div.segmented", { role: "group", "aria-label": I.t("stats.period") });
    [
      ["month", I.t("stats.pMonth")],
      ["quarter", I.t("stats.pQuarter")],
      ["year", I.t("stats.pYear")],
      ["all", I.t("stats.pAll")]
    ].forEach(function (opt) {
      var btn = D.el("button", { type: "button", text: opt[1], "aria-pressed": period.mode === opt[0] ? "true" : "false" });
      btn.addEventListener("click", function () { periodState = opt[0]; App.renderView(); });
      seg.appendChild(btn);
    });
    head.appendChild(seg);
    host.appendChild(head);

    if (!keys.length) {
      host.appendChild(emptyCard(I.t("stats.needData")));
      return;
    }

    var range = rangeOf(App, period.from, period.until);
    var days = range.days;
    var totals = range.totals;
    var sum = summarize(days, function (iso) { return App.hasRecord(iso); });
    var account = cached(App, "acc|" + period.until, function () { return App.accountBalance(period.until); });

    /* ---- Kennzahlen ---- */
    var kpis = D.el("div.stats-kpis.mb-5.stagger");
    kpi(kpis, I.t("set.account"), App.fmtSigned(account.minutes),
      I.t("stats.asOf", { date: I.formatDate(period.until, dd) }),
      account.minutes > 0 ? "plus" : account.minutes < 0 ? "minus" : "");
    kpi(kpis, I.t("stats.avgNet"), sum.worked ? App.fmt(totals.avgNet) : "–",
      sum.worked ? I.tn("stats.nWorked", sum.worked) : "");
    /* Ø Beginn/Feierabend wie Erkenntnisse und Rückblick (Engine.clockAverages):
       Nachtschichten zählen nicht und werden genannt; bei wechselnden
       Schichten gibt es keinen Mittelwert. */
    var clockNote = totals.shiftWork ? I.t("stats.avgShifts")
      : totals.nightShifts ? I.tn("stats.avgNoNights", totals.nightShifts) : "";
    kpi(kpis, I.t("stats.avgStart"), totals.avgStart === null || totals.avgStart === undefined ? "–" : T.formatHHMM(totals.avgStart),
      clockSub(totals.shiftWork || totals.earliestStart === null || totals.earliestStart === undefined ? "" : I.t("stats.earliest", { t: T.formatHHMM(totals.earliestStart) }), clockNote));
    kpi(kpis, I.t("stats.avgEnd"), totals.avgEnd === null || totals.avgEnd === undefined ? "–" : clock(totals.avgEnd),
      clockSub(totals.shiftWork || totals.latestEnd === null || totals.latestEnd === undefined ? "" : I.t("stats.latest", { t: clock(totals.latestEnd) }), clockNote));
    kpi(kpis, I.t("stats.longestDay"), sum.longest ? App.fmt(sum.longest) : "–",
      sum.longestDate ? I.t("stats.longestOn", { date: I.formatDate(sum.longestDate, dd) }) : "");
    kpi(kpis, I.t("stats.overtimeDays"), String(sum.plus), I.tn("stats.nMinus", sum.minus));
    kpi(kpis, I.t("day.breakTotal"), totals.breakTotal ? App.fmt(totals.breakTotal) : "–",
      totals.autoDeducted ? I.t("stats.autoDeducted", { v: App.fmt(totals.autoDeducted) }) : (sum.worked ? I.t("warn.allGood") : ""));
    kpi(kpis, I.t("stats.recordedDays"), String(sum.recorded),
      totals.gapDays ? I.tn("stats.nGaps", totals.gapDays) : I.t("stats.noGaps"),
      totals.gapDays ? "warn" : "");
    host.appendChild(kpis);
    if (ZK.Ext) ZK.Ext.render("stats.top", host, { App: App, period: period, days: days, totals: totals });

    /* ================================================================ */
    /* 1 · Saldo-Verlauf                                                 */
    /* ================================================================ */
    var before = cached(App, "acc|" + T.addDays(period.from, -1), function () {
      return App.accountBalance(T.addDays(period.from, -1));
    }).minutes;
    /* Abgeschlossene Monate zählen eingefroren (wie Kopfzeile und Kennzahl) */
    var deltas = ZK.Closing ? cached(App, "frz|" + period.from + "|" + period.until, function () {
      return ZK.Closing.dayDeltas(App.store.allDays(), App.settings(), period.from, period.until);
    }) : null;
    var trend = trendSeries(days, before, period, deltas);
    var trendCard = card(I.t("stats.balanceTrend"), I.t("stats.trendStart", { v: App.fmtSigned(before) }));
    var trendHost = D.el("div");
    trendCard.body.appendChild(trendHost);
    host.appendChild(trendCard.node);
    // Die Breite einmal lesen statt pro Diagramm ein Layout zu erzwingen —
    // alle Verlaufs- und Säulendiagramme liegen in gleich breiten Karten.
    var fullWidth = trendHost.clientWidth;

    var trendPoints = trend.points.map(function (p) {
      var pt = trendPoint(p);
      // Laufender Tag: Linie bleibt beim abgerechneten Stand, der Tooltip
      // nennt den Zwischenstand.
      if (p.provisional !== undefined) {
        pt.sub = (pt.sub ? pt.sub + " · " : "") + I.t("stats.provisional", { v: App.fmtSigned(p.provisional) });
      }
      return pt;
    });
    function trendPoint(p) {
      if (p.start) {
        return {
          label: I.formatDate(p.date, dd), value: p.value,
          title: I.t("stats.start") + " · " + I.formatDate(p.date, { day: "numeric", month: "long", year: "numeric" })
        };
      }
      if (p.week) {
        var kw = T.isoWeek(p.week);
        return {
          label: I.formatDate(p.date, dd), value: p.value,
          title: I.t("week.kw", { n: kw }) + " · " + T.isoWeekYear(p.week),
          sub: I.t("stats.until", { date: I.formatDate(p.date, dd) })
        };
      }
      return {
        label: I.formatDate(p.date, dd), value: p.value,
        title: I.formatDate(p.date, { weekday: "short", day: "numeric", month: "long" })
      };
    }
    if (!sum.recorded && !before) {
      ZK.Charts.emptyState(trendHost, I.t("stats.needData"));
    } else {
      ZK.Charts.balanceArea(trendHost, trendPoints, {
        height: 240,
        width: fullWidth,
        slots: trend.slots,
        endLabel: period.to > period.until ? I.formatDate(period.to, dd) : "",
        markerLabel: I.t("stats.today"),
        valueLabel: I.t("set.account"),
        ariaLabel: I.t("stats.balanceTrend"),
        plusLabel: I.t("stats.accountPlus"),
        minusLabel: I.t("stats.accountMinus"),
        emptyText: I.t("stats.needData")
      });
    }

    /* ================================================================ */
    /* 2 · Stunden pro Woche / pro Monat                                 */
    /* ================================================================ */
    var monthly = period.bucket === "month";
    var groups = groupBars(days, period.bucket, deltas);
    var multiYear = monthly && groups.length && groups[0].key.slice(0, 4) !== groups[groups.length - 1].key.slice(0, 4);
    /* Wochensoll des Modells am Anfang und am Ende — wechselt es im
       Zeitraum, zeigt die Unterzeile beide Werte. */
    var wtFrom = R.weeklyTargetMinutes(s, period.from), wtTo = R.weeklyTargetMinutes(s, period.until);
    var weekCard = card(I.t(monthly ? "stats.monthlyHours" : "stats.weeklyHours"),
      monthly ? "" : I.t("week.target") + " " + (wtFrom === wtTo ? App.fmt(wtTo) : App.fmt(wtFrom) + " → " + App.fmt(wtTo)));
    var weekHost = D.el("div");
    weekCard.body.appendChild(weekHost);
    host.appendChild(weekCard.node);

    var barItems = groups.map(function (g, i) {
      var label, title;
      if (monthly) {
        var m = +g.key.slice(5, 7) - 1;
        label = I.monthName(m, "short");
        title = I.monthName(m, "long") + " " + g.key.slice(0, 4);
      } else {
        var kw = T.isoWeek(g.key);
        label = I.t("stats.kwShort", { n: kw });
        title = I.t("week.kw", { n: kw }) + " · " + I.t("stats.periodDays", { from: I.formatDate(g.from, dd), to: I.formatDate(g.to, dd) });
      }
      var item = {
        label: label,
        title: title,
        value: g.value,
        ref: g.ref,
        partial: g.partial,
        sub: I.t("stats.targetOf", { v: App.fmt(g.ref) }) + " · " + I.t("stats.balanceOf", { v: App.fmtSigned(g.balance) }) +
          (g.partial ? " · " + I.t(monthly ? "stats.partialMonth" : "stats.partialWeek") : "")
      };
      // Mehrere Jahre: nur der Januar trägt die Jahreszahl, sonst wird es eng.
      if (multiYear) item.axis = (m === 0 || i === 0) ? g.key.slice(0, 4) : "";
      return item;
    });
    ZK.Charts.bars(weekHost, barItems, {
      height: 220,
      width: fullWidth,
      ariaLabel: I.t(monthly ? "stats.monthlyHours" : "stats.weeklyHours"),
      labelWidth: monthly ? 34 : 42,
      valueFormat: function (v) { return App.fmt(v); },
      tickFormat: function (v) { return Math.round(v / 60) + " h"; },
      emptyText: I.t("stats.needData")
    });
    if (barItems.some(function (b) { return b.value > 0; })) {
      var leg = [
        { label: I.t("stats.actual"), color: "var(--chart-mark)" },
        { label: I.t("stats.targetMark"), color: "var(--chart-plus)", dashed: true }
      ];
      if (barItems.some(function (b) { return b.partial; })) {
        leg.push({ label: I.t(monthly ? "stats.partialMonth" : "stats.partialWeek"), color: "var(--chart-mark)", soft: true });
      }
      ZK.Charts.legend(weekHost, leg);
    }

    /* ================================================================ */
    /* 3 · Durchschnitt nach Wochentag                                   */
    /* ================================================================ */
    var dowCard = card(I.t("stats.dayOfWeek"));
    var dowHost = D.el("div");
    dowCard.body.appendChild(dowHost);
    host.appendChild(dowCard.node);

    var dow = [[], [], [], [], [], [], []];
    days.forEach(function (r) { if (r.net > 0) dow[r.weekday].push(r); });
    var order = s.firstDayOfWeek === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
    ZK.Charts.bars(dowHost, order.map(function (wd) {
      var list = dow[wd];
      var avg = list.length ? Math.round(list.reduce(function (a, r) { return a + r.net; }, 0) / list.length) : 0;
      return { label: I.weekdayName(wd, "short"), title: I.weekdayName(wd, "long"), value: avg, sub: I.tn("common.nDays", list.length) };
    }), {
      height: 200,
      width: fullWidth,
      ariaLabel: I.t("stats.dayOfWeek"),
      labelWidth: 24,
      valueFormat: function (v) { return App.fmt(v); },
      tickFormat: function (v) { return T.formatDuration(v, "clock"); },
      emptyText: I.t("stats.needData")
    });

    /* ================================================================ */
    /* 4 · Ankunft & Feierabend                                          */
    /*     Nachtschichten (Ende am Folgetag) würden die Achse über         */
    /*     Mitternacht ziehen und den Tagesrhythmus unlesbar machen —      */
    /*     sie bleiben draussen und werden genannt.                        */
    /* ================================================================ */
    var arrivalCard = card(I.t("stats.arrival"), I.t("common.average"));
    var arrivalHost = D.el("div");
    arrivalCard.body.appendChild(arrivalHost);
    host.appendChild(arrivalCard.node);

    var nightShifts = 0;
    var arr = [[], [], [], [], [], [], []];
    days.forEach(function (r) {
      if (!r.complete || r.net <= 0) return;
      if (r.endTl > T.DAY) { nightShifts++; return; }
      arr[r.weekday].push(r);
    });
    ZK.Charts.rangeBars(arrivalHost, order.map(function (wd) {
      var list = arr[wd];
      var label = I.weekdayName(wd, "short");
      if (!list.length) return { label: label, from: null, to: null };
      var avgStart = Math.round(list.reduce(function (a, r) { return a + r.startTod; }, 0) / list.length);
      var avgEnd = Math.round(list.reduce(function (a, r) { return a + r.endTl; }, 0) / list.length);
      return {
        label: label, title: I.weekdayName(wd, "long"),
        from: avgStart, to: Math.max(avgStart + 30, avgEnd),
        sub: I.tn("common.nDays", list.length)
      };
    }), { height: 210, width: fullWidth, ariaLabel: I.t("stats.arrival"), emptyText: I.t("stats.needData") });
    if (nightShifts) {
      arrivalCard.body.appendChild(D.el("p.chart-note", { text: I.tn("stats.nightHidden", nightShifts) }));
    }

    /* ================================================================ */
    /* 5 · Pausen-Disziplin + Tagesarten                                 */
    /* ================================================================ */
    var pair = D.el("div.grid-2.mb-4");

    var breakCard = card(I.t("stats.breakCompliance"));
    var withBreakDuty = days.filter(function (r) { return r.requiredBreak > 0; });
    var compliant = withBreakDuty.filter(function (r) { return r.breakTotal >= r.requiredBreak; }).length;

    if (!withBreakDuty.length) {
      // Ohne einen einzigen pflichtigen Tag gibt es nichts zu bewerten —
      // ein grüner Ring mit „100 %“ wäre eine Behauptung ohne Grundlage.
      breakCard.body.appendChild(D.el("div.stat-ring-row", {
        html: '<div class="stat-ring-val muted">–</div><p class="stat-ring-sub">' + D.esc(I.t("stats.noBreakDuty")) + "</p>"
      }));
    } else {
      var ratio = compliant / withBreakDuty.length;
      var ringRow = D.el("div.stat-ring");
      var ringHost = D.el("div.stat-ring-host");
      ringRow.appendChild(ringHost);
      var ringText = D.el("div");
      ringText.innerHTML =
        '<div class="stat-ring-val">' + Math.round(ratio * 100) + "%</div>" +
        '<div class="stat-ring-sub">' +
        D.esc(I.tn("stats.compliantOf", withBreakDuty.length, { a: compliant })) + "<br>" +
        D.esc(I.t("stats.autoTotal", { v: App.fmt(totals.autoDeducted).replace(/ /g, "\u00a0") })) + "</div>";
      ringRow.appendChild(ringText);
      breakCard.body.appendChild(ringRow);
      ZK.Charts.ring(ringHost, {
        size: 128, stroke: 13, value: ratio,
        color: ratio >= 0.9 ? "var(--chart-plus)" : ratio >= 0.6 ? "var(--chart-mark)" : "var(--chart-minus)",
        ariaLabel: Math.round(ratio * 100) + "% · " + I.tn("stats.compliantOf", withBreakDuty.length, { a: compliant })
      });
    }
    pair.appendChild(breakCard.node);

    var typeCard = card(I.t("stats.distribution"));
    var typeHost = D.el("div");
    typeCard.body.appendChild(typeHost);
    pair.appendChild(typeCard.node);
    host.appendChild(pair);

    var counts = typeCounts(days);
    ZK.Charts.rankedBars(typeHost, Object.keys(counts).map(function (k) {
      return { label: I.t("type." + k), value: counts[k], color: R.dayType(k).color };
    }), {
      valueFormat: function (v) { return I.tn("common.nDays", v); },
      emptyText: I.t("stats.needData")
    });

    /* ================================================================ */
    /* 6 · Jahresübersicht                                               */
    /* ================================================================ */
    var year = T.yearOf(period.until);
    var heatFrom = T.startOfWeek(year + "-01-01", 1);
    var yearRange = cached(App, "year|" + year, function () { return App.range(heatFrom, year + "-12-31", { since: trackingStart(App) }); });
    var heatCard = card(I.t("stats.heatmap"), String(year));
    var heatHost = D.el("div");
    heatCard.body.appendChild(heatHost);
    host.appendChild(heatCard.node);

    var heat = buildHeatCells(App, yearRange.days, year, today, trackingStart(App));
    ZK.Charts.heatmap(heatHost, heat.cells, {
      dayLabels: [1, 2, 3, 4, 5, 6, 0].map(function (wd, i) { return i % 2 === 0 && i < 6 ? I.weekdayName(wd, "short") : ""; }),
      initialIndex: heat.todayIndex,
      ariaLabel: I.t("stats.heatAria", { year: year }),
      legend: [
        { label: I.t("stats.accountMinus"), color: "var(--chart-minus)", hatch: true },
        { label: I.t("stats.heatZero"), color: "var(--heat-zero)" },
        { label: I.t("stats.accountPlus"), color: "var(--chart-plus)" },
        { label: I.t("stats.heatGap"), color: "var(--warn)", outline: true }
      ],
      onSelect: function (cell) {
        if (cell.date) ZK.DayModal.open(App, cell.date, function () { App.renderChrome(); App.renderView(); });
      }
    });

    /* ================================================================ */
    /* 7 · Kontingente & Lücken                                          */
    /* ================================================================ */
    var bottom = D.el("div.grid-2.mt-4");

    var quota = quotaOf(yearRange.days, year, today, s);
    var quotaCard = card(I.t("stats.quota"), String(year));
    var quotaBody = D.el("div.quota");
    quotaBody.appendChild(vacationRow(quota));
    quotaBody.appendChild(countRow(I.t("stats.sickAccident"), quota.sick, "var(--type-sick)"));
    quotaBody.appendChild(countRow(I.t("stats.compDays"), quota.comp, "var(--type-comp)"));
    quotaBody.appendChild(countRow(I.t("stats.holidays"), quota.holiday, "var(--type-holiday)",
      quota.holidayAhead ? I.t("stats.holidayAhead", { n: quota.holidayAhead }) : ""));
    if (quota.other) quotaBody.appendChild(countRow(I.t("stats.other"), quota.other, "var(--type-military)"));
    quotaCard.body.appendChild(quotaBody);
    bottom.appendChild(quotaCard.node);

    var gapCard = card(I.t("stats.gaps"), String(totals.gapDays));
    if (!totals.gapDays) {
      var ok = D.el("div.notice.plus");
      ok.innerHTML = D.icon("check") + "<div><strong>" + D.esc(I.t("stats.noGaps")) + "</strong></div>";
      gapCard.body.appendChild(ok);
    } else {
      gapCard.body.appendChild(D.el("p.muted", { text: I.t("stats.gapsHint"), style: { fontSize: "12px", marginBottom: "10px" } }));
      var list = D.el("div.chipset");
      totals.gaps.slice(0, 40).forEach(function (iso) {
        var chip = D.el("button.chip", { type: "button", text: I.formatDate(iso, { day: "2-digit", month: "2-digit", year: "2-digit" }) });
        chip.addEventListener("click", function () {
          ZK.DayModal.open(App, iso, function () { App.renderChrome(); App.renderView(); });
        });
        list.appendChild(chip);
      });
      gapCard.body.appendChild(list);
      if (totals.gaps.length > 40) {
        gapCard.body.appendChild(D.el("p.muted", { text: "+ " + (totals.gaps.length - 40), style: { fontSize: "12px", marginTop: "8px" } }));
      }
    }
    bottom.appendChild(gapCard.node);
    host.appendChild(bottom);
    if (ZK.Ext) ZK.Ext.render("stats.bottom", host, { App: App, period: period, days: days, totals: totals });
  }

  /* -------------------------------------------------------------------- */
  /* Bausteine                                                             */
  /* -------------------------------------------------------------------- */

  function vacationRow(q) {
    var row = D.el("div.quota-row");
    var total = q.vacationEntitlement;
    var head = D.el("div.quota-head");
    head.appendChild(D.el("span", { text: I.t("stats.vacation") }));
    head.appendChild(D.el("span.mono", { text: fmtDays(q.vacationTaken + q.vacationPlanned) + " / " + fmtDays(total) }));
    row.appendChild(head);
    var bar = D.el("div.bar.quota-bar");
    var taken = D.el("i");
    taken.style.width = pct(q.vacationTaken, total) + "%";
    taken.style.background = "var(--type-vacation)";
    bar.appendChild(taken);
    if (q.vacationPlanned) {
      var planned = D.el("i.planned");
      planned.style.width = pct(q.vacationPlanned, total) + "%";
      bar.appendChild(planned);
    }
    row.appendChild(bar);
    row.appendChild(D.el("div.quota-sub", {
      text: q.vacationPlanned
        ? I.t("stats.vacLine", { taken: fmtDays(q.vacationTaken), planned: fmtDays(q.vacationPlanned), left: fmtDays(q.vacationLeft) })
        : I.t("stats.vacLineNoPlan", { taken: fmtDays(q.vacationTaken), left: fmtDays(q.vacationLeft) })
    }));
    return row;
  }

  /* Ohne Kontingent kein Balken: eine Länge ohne Bezug wäre erfunden. */
  function countRow(label, value, color, sub) {
    var row = D.el("div.quota-row.count");
    var head = D.el("div.quota-head");
    var name = D.el("span");
    var dot = D.el("i.quota-dot");
    dot.style.background = color;
    name.appendChild(dot);
    name.appendChild(document.createTextNode(label));
    head.appendChild(name);
    head.appendChild(D.el("span.mono", { text: I.tn("common.nDays", value) }));
    row.appendChild(head);
    if (sub) row.appendChild(D.el("div.quota-sub", { text: sub }));
    return row;
  }

  function clockSub(a, b) { return a && b ? a + " · " + b : (a || b); }

  function pct(v, total) { return total > 0 ? Math.max(0, Math.min(100, (v / total) * 100)) : 0; }
  function fmtDays(v) { return String(Math.round(v * 100) / 100); }

  function buildHeatCells(App, days, year, today, since) {
    var jan1 = year + "-01-01";
    var cells = [];
    var todayIndex = -1;
    var long = { weekday: "short", day: "numeric", month: "short" };
    days.forEach(function (r) {
      if (r.date < jan1) { cells.push({ blank: true }); return; }
      if (r.date === today) todayIndex = cells.length;
      var kind = heatKind(r, today, since);
      var typeName = r.type && r.type !== "work" && r.type !== "free"
        ? (r.type === "holiday" && r.holiday ? r.holiday.name : I.t("type." + r.type)) : "";
      var state = "", sub = "";
      if (kind === "value" || kind === "zero") {
        sub = (r.net ? I.t("stats.netOf", { v: App.fmt(r.net) }) : "") +
          (typeName ? (r.net ? " · " : "") + typeName : "");
        if (kind === "zero") state = "±0:00";
      } else if (kind === "running") {
        state = I.t("stats.heatRunning") + " · " + App.fmtSigned(r.balance);
        sub = r.net ? I.t("stats.netOf", { v: App.fmt(r.net) }) : "";
      } else if (kind === "open") {
        state = I.t("stats.heatOpen");
      } else if (kind === "gap") {
        state = I.t("stats.heatGap") + " · " + I.t("stats.heatNothing");
      } else if (kind === "planned") {
        state = I.t("stats.heatPlanned");
        sub = typeName;
      } else if (kind === "off") {
        state = typeName || I.t("stats.heatFree");
      } else {
        state = typeName;
      }
      var day = +r.date.slice(8, 10);
      cells.push({
        date: r.date,
        kind: kind,
        value: r.balance,
        today: r.date === today,
        label: I.formatDate(r.date, long),
        state: state,
        sub: sub,
        monthStart: day === 1 ? I.monthName(+r.date.slice(5, 7) - 1, "short") : ""
      });
    });
    if (todayIndex < 0) todayIndex = cells.length - 1;
    return { cells: cells, todayIndex: todayIndex };
  }

  function card(title, meta) {
    var node = D.el("section.card.mb-4");
    var head = D.el("div.card-head");
    head.innerHTML = "<h2>" + D.esc(title) + "</h2>";
    if (meta) head.appendChild(D.el("div.actions", { html: '<span class="tag">' + D.esc(meta) + "</span>" }));
    node.appendChild(head);
    var body = D.el("div");
    node.appendChild(body);
    return { node: node, body: body };
  }

  function kpi(host, title, value, sub, tone) {
    var node = D.el("div.kpi" + (tone ? ".accent-" + tone : ""));
    node.innerHTML = '<div class="k-title">' + D.esc(title) + "</div>" +
      '<div class="k-val mono' + (tone === "plus" ? " tone-plus" : tone === "minus" ? " tone-minus" : "") + '">' + D.esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + D.esc(sub) + "</div>" : "");
    host.appendChild(node);
  }

  function emptyCard(message) {
    var node = D.el("section.card");
    var box = D.el("div.empty");
    box.innerHTML = '<div class="rings"><i></i><i></i></div><h3>' + D.esc(message) + "</h3>";
    node.appendChild(box);
    return node;
  }
})(typeof self !== "undefined" ? self : this);
