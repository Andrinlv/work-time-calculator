/* ==========================================================================
   ZEITKONTO — Schichtplan
   --------------------------------------------------------------------------
   Reine Logik ohne DOM (läuft auch in Node): Welche Schicht ist an einem Tag
   geplant, wo reicht die Ruhezeit zwischen zwei geplanten Schichten nicht,
   und wie viele Stunden kommen pro Woche zusammen?

   Gespeichert wird zweierlei:
     settings.rota = { enabled, anchor: "YYYY-MM-DD", cycle: [Vorlagen-id | null …],
                       name, skipHolidays }
                     Der Rhythmus (1–42 Tage) wiederholt sich ab `anchor` (Tag 1)
                     endlos, auch rückwärts. null = frei.
     settings["rota:override:YYYY-MM-DD"] = Vorlagen-id | "free"
                     Abweichung für genau diesen Tag (Schicht getauscht,
                     Einsatz am Samstag …). Je Tag ein eigener Schlüssel:
                     Einstellungen werden über Fenster hinweg je Schlüssel
                     zusammengeführt — planen zwei Fenster verschiedene Tage
                     um, bleiben so beide stehen. Ein Plan ist keine
                     Erfassung, darum liegt er nicht bei den Tagen (dort
                     zählte er als erfasster Tag und dehnte „Alle“ in den
                     Berichten bis zum geplanten Datum). Abweichungen, die
                     mehr als 60 Tage zurückliegen, räumt das nächste
                     Speichern weg.
     Bis Version 1.3 lag die Abweichung als `plan` im Tagesdatensatz; solche
     Datensätze zieht migrateRecords() um und dayPlan() liest sie bis dahin.

   Der Plan ändert das Soll NICHT, das kommt weiter aus dem Arbeitsmodell.
   Er zeigt, was ansteht, füllt Tage mit einem Tipp aus und warnt früh.

   Uhrzeiten bleiben Wanduhr (wie auf dem Dienstplan); Dauern und Ruhezeiten
   zählen echte Minuten. In der Nacht der Zeitumstellung dauert eine
   Nachtschicht eine Stunde mehr oder weniger — die Ruhezeit ebenso.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time.js"));
  } else {
    root.ZK = root.ZK || {};
    root.ZK.Rota = factory(root.ZK.Time);
  }
})(typeof self !== "undefined" ? self : this, function (T) {
  "use strict";

  var MAX_CYCLE = 42;
  var FREE = "free";
  var DEFAULT_REST_HOURS = 11;
  var OVERRIDE_PREFIX = "rota:override:";
  var KEEP_OVERRIDES = 60;       // so viele Tage zurück bleiben Abweichungen stehen

  function week(id) { return [id, id, id, id, id, null, null]; }

  /* Mitgelieferte Rhythmen — sie verweisen auf die Ids der mitgelieferten
     Schichtvorlagen (rules.js). Tag 1 ist jeweils ein Montag. */
  var PRESETS = [
    { key: "early-late", ids: ["early", "late"], cycle: week("early").concat(week("late")) },
    { key: "three-shift", ids: ["early", "late", "night"], cycle: week("early").concat(week("late"), week("night")) },
    { key: "office", ids: ["office"], cycle: week("office") }
  ];

  /* ==================================================================== */
  /* Einstellungen lesen                                                   */
  /* ==================================================================== */

  function cleanId(id) {
    if (id === null || id === undefined || id === FREE) return null;
    var s = String(id).trim();
    return s ? s : null;
  }

  /** Gespeicherten Rhythmus lesen — fehlende oder kaputte Teile werden neutral. */
  function normalize(rota) {
    var r = rota && typeof rota === "object" ? rota : {};
    return {
      enabled: r.enabled === true,
      anchor: T.isValidISO(r.anchor) ? r.anchor : null,
      cycle: Array.isArray(r.cycle) ? r.cycle.slice(0, MAX_CYCLE).map(cleanId) : [],
      name: typeof r.name === "string" ? r.name.trim().slice(0, 60) : "",
      skipHolidays: r.skipHolidays !== false
    };
  }

  /** Läuft der Schichtplan? Ausgeschaltet zählen auch die Abweichungen nicht. */
  function isActive(rota) {
    var n = normalize(rota);
    return n.enabled && !!n.anchor && n.cycle.length > 0;
  }

  /** Position von `iso` im Rhythmus (0 = Tag 1) — auch vor dem Anker. */
  function cycleIndex(rota, iso) {
    var n = normalize(rota);
    if (!n.anchor || !n.cycle.length) return null;
    var d = T.diffDays(n.anchor, iso);
    if (d === null) return null;
    var len = n.cycle.length;
    return ((d % len) + len) % len;
  }

  function findTemplate(templates, id) {
    if (!id) return null;
    var list = templates || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  /* ==================================================================== */
  /* Zeiten einer Schicht                                                  */
  /* ==================================================================== */

  /**
   * Wanduhr einer Vorlage, ab Mitternacht ihres Tages gezählt: Ende und
   * Pause nach Mitternacht liegen über 1440. Eine Pause ausserhalb der
   * Schicht zählt nicht (wie in den Einstellungen). null = Zeiten unlesbar.
   * → { start, end, breakStart, breakEnd, paid }
   */
  function shiftTimes(tpl) {
    if (!tpl) return null;
    var s = T.parseHHMM(tpl.start), e = T.parseHHMM(tpl.end);
    if (s === null || e === null || s === e % T.DAY) return null;
    var end = T.onTimeline(e % T.DAY, s);
    var out = { start: s, end: end, breakStart: null, breakEnd: null, paid: !!tpl.breakPaid };
    var bs = T.parseHHMM(tpl.breakStart), be = T.parseHHMM(tpl.breakEnd);
    if (bs !== null && be !== null) {
      var b0 = T.onTimeline(bs % T.DAY, s), b1 = T.onTimeline(be % T.DAY, s);
      if (b1 > b0 && b1 <= end) { out.breakStart = b0; out.breakEnd = b1; }
    }
    return out;
  }

  /** Echte Minuten (seit 1970) eines Wanduhr-Zeitpunkts auf der Achse von `iso`. */
  function realMinutes(iso, tl) {
    var d = T.fromISO(iso);
    if (!d) return null;
    return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, tl).getTime() / 60000);
  }

  /**
   * Die Schicht `tpl` am Tag `iso` auf der echten Zeitachse.
   * → { start, end (Wanduhr), startAbs, endAbs (echte Minuten), span, breakMinutes, paid, net, overnight }
   *   net = Arbeitszeit wie in den Einstellungen: bezahlte Pause zählt mit.
   */
  function interval(iso, tpl) {
    var st = shiftTimes(tpl);
    if (!st || !T.isValidISO(iso)) return null;
    var a = realMinutes(iso, st.start), b = realMinutes(iso, st.end);
    var brk = st.breakStart === null ? 0
      : Math.max(0, realMinutes(iso, st.breakEnd) - realMinutes(iso, st.breakStart));
    var span = b - a;
    return {
      start: st.start,
      end: st.end,
      startAbs: a,
      endAbs: b,
      span: span,
      breakMinutes: brk,
      paid: st.paid,
      net: span - (st.paid ? 0 : brk),
      overnight: st.end >= T.DAY
    };
  }

  /* ==================================================================== */
  /* Plan eines Tages                                                      */
  /* ==================================================================== */

  /** Abwesend laut Datensatz (Ferien, krank, frei …)? Halbe Tage nicht. */
  function isAbsence(rec) {
    if (!rec || !rec.type || rec.type === "work") return false;
    var f = typeof rec.absenceFactor === "number" ? rec.absenceFactor : 1;
    return f >= 1;
  }

  function cleanPlan(value) {
    return value === FREE ? FREE : cleanId(value);
  }

  /**
   * Was ist an `iso` geplant?
   *   ctx: { rota, templates, override (Abweichung aus den Einstellungen, s. overrideOf),
   *          record (Tagesdatensatz oder null), holiday (wahr an Feiertagen) }
   * → { date, id, tpl, source, free, missing, off, index }
   *   source   "override" (Abweichung für den Tag) | "cycle" (Rhythmus) | null (kein Plan)
   *   free     laut Plan frei
   *   missing  geplante Vorlage gibt es nicht mehr
   *   off      geplant, fällt aber aus: "absence" (Ferien, krank …) | "holiday"
   *            (Feiertag, nur beim Rhythmus und wenn so eingestellt)
   */
  function dayPlan(iso, ctx) {
    ctx = ctx || {};
    var out = { date: iso, id: null, tpl: null, source: null, free: false, missing: false, off: null, index: null };
    var n = normalize(ctx.rota);
    if (!n.enabled || !n.anchor || !n.cycle.length) return out;
    out.index = cycleIndex(n, iso);
    var rec = ctx.record || null;
    // Noch nicht umgezogene Abweichung im Datensatz (bis 1.3) gilt, bis es eine neue gibt
    var override = cleanPlan(ctx.override) || (rec ? cleanPlan(rec.plan) : null);
    var id;
    if (override) {
      out.source = "override";
      id = override === FREE ? null : override;
    } else {
      out.source = "cycle";
      id = n.cycle[out.index];
    }
    if (!id) { out.free = true; return out; }
    out.id = id;
    var tpl = findTemplate(ctx.templates, id);
    if (!tpl || !shiftTimes(tpl)) { out.missing = true; return out; }
    out.tpl = tpl;
    if (isAbsence(rec)) out.off = "absence";
    else if (out.source === "cycle" && ctx.holiday && n.skipHolidays) out.off = "holiday";
    return out;
  }

  /** Wird an diesem Tag laut Plan gearbeitet? */
  function hasShift(entry) {
    return !!(entry && entry.tpl && !entry.off);
  }

  /** Was der Rhythmus allein an `iso` vorsieht (ohne Abweichung) → id | null. */
  function cycleId(rota, iso) {
    var n = normalize(rota);
    var i = cycleIndex(n, iso);
    return i === null ? null : n.cycle[i];
  }

  /**
   * Plan für einen Zeitraum, beide Grenzen inklusive.
   *   ctx: { rota, templates, override(iso), record(iso), holiday(iso) }
   * → [dayPlan + { iv: interval | null }]
   */
  function plan(from, to, ctx) {
    ctx = ctx || {};
    var days = T.rangeDays(from, to);
    if (days.length > 800) days = days.slice(0, 800);
    return days.map(function (iso) {
      var e = dayPlan(iso, {
        rota: ctx.rota,
        templates: ctx.templates,
        override: ctx.override ? ctx.override(iso) : null,
        record: ctx.record ? ctx.record(iso) : null,
        holiday: ctx.holiday ? ctx.holiday(iso) : null
      });
      e.iv = hasShift(e) ? interval(iso, e.tpl) : null;
      return e;
    });
  }

  /** dayPlan direkt aus den Einstellungen: Rhythmus, Vorlagen und Abweichung des Tages. */
  function dayPlanOf(settings, iso, record, holiday) {
    var s = settings || {};
    return dayPlan(iso, {
      rota: s.rota,
      templates: s.shiftTemplates || [],
      override: overrideOf(s, iso),
      record: record || null,
      holiday: holiday || null
    });
  }

  /* ==================================================================== */
  /* Prüfungen                                                             */
  /* ==================================================================== */

  /**
   * Zu kurze Ruhezeit zwischen zwei aufeinanderfolgenden geplanten Schichten
   * (ArG: 11 Stunden). Freie Tage dazwischen zählen als Ruhe.
   *   minRestHours wie in den Einstellungen; 0/leer = 11 (wie die Engine)
   * → [{ from, to, rest (echte Minuten, negativ = Überschneidung), need, fromId, toId, overlap }]
   */
  function restConflicts(entries, minRestHours) {
    var hours = typeof minRestHours === "number" && isFinite(minRestHours) && minRestHours > 0
      ? minRestHours : DEFAULT_REST_HOURS;
    var need = Math.round(hours * 60);
    var shifts = (entries || []).filter(function (e) { return e && e.iv; })
      .sort(function (a, b) { return a.iv.startAbs - b.iv.startAbs; });
    var out = [];
    for (var i = 1; i < shifts.length; i++) {
      var prev = shifts[i - 1], cur = shifts[i];
      var rest = cur.iv.startAbs - prev.iv.endAbs;
      if (rest < need) {
        out.push({ from: prev.date, to: cur.date, rest: rest, need: need, fromId: prev.id, toId: cur.id, overlap: rest < 0 });
      }
    }
    return out;
  }

  /**
   * Geplante Arbeitszeit je Kalenderwoche (Montag bis Sonntag, wie das ArG);
   * eine Schicht zählt zur Woche ihres Beginns.
   * → [{ start (Montag), end (Sonntag), net, shifts, days (Tage im Plan), over }]
   *   over = Minuten über maxWeeklyMinutes (0 ohne Grenze)
   */
  function weeklyLoad(entries, maxWeeklyMinutes) {
    var weeks = {}, order = [];
    (entries || []).forEach(function (e) {
      if (!e || !T.isValidISO(e.date)) return;
      var mon = T.startOfWeek(e.date, 1);
      var w = weeks[mon];
      if (!w) {
        w = weeks[mon] = { start: mon, end: T.addDays(mon, 6), net: 0, shifts: 0, days: 0, over: 0 };
        order.push(mon);
      }
      w.days++;
      if (e.iv) { w.net += e.iv.net; w.shifts++; }
    });
    var max = maxWeeklyMinutes > 0 ? maxWeeklyMinutes : 0;
    return order.sort().map(function (k) {
      var w = weeks[k];
      w.over = max ? Math.max(0, w.net - max) : 0;
      return w;
    });
  }

  /* ==================================================================== */
  /* Rhythmus bearbeiten                                                   */
  /* ==================================================================== */

  function preset(key) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].key === key) {
        return { key: PRESETS[i].key, ids: PRESETS[i].ids.slice(), cycle: PRESETS[i].cycle.slice() };
      }
    }
    return null;
  }

  /** Welcher mitgelieferte Rhythmus ist das? → key | null */
  function matchPreset(cycle) {
    var c = (cycle || []).map(cleanId).join(",");
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].cycle.join(",") === c) return PRESETS[i].key;
    }
    return null;
  }

  /**
   * Fehlende Vorlagen für einen Rhythmus aus den mitgelieferten ergänzen
   * (z. B. die Nachtschicht wurde gelöscht). Vorhandene bleiben unangetastet.
   * → { templates, added: [ids] }
   */
  function ensureTemplates(templates, ids, defaults) {
    var list = (templates || []).slice();
    var added = [];
    (ids || []).forEach(function (id) {
      if (findTemplate(list, id)) return;
      var def = findTemplate(defaults, id);
      if (!def) return;
      list.push(Object.assign({}, def));
      added.push(id);
    });
    return { templates: list, added: added };
  }

  /** Länge ändern: hinten frei auffüllen oder abschneiden (1–42 Tage). */
  function resize(cycle, length) {
    var len = Math.max(1, Math.min(MAX_CYCLE, Math.round(length) || 1));
    var out = (cycle || []).slice(0, len).map(cleanId);
    while (out.length < len) out.push(null);
    return out;
  }

  /** Antippen einer Rasterzelle: frei → erste Vorlage → … → letzte → frei. */
  function nextInCycle(id, templates) {
    var ids = (templates || []).filter(function (t) { return t && t.id; }).map(function (t) { return t.id; });
    if (!id) return ids.length ? ids[0] : null;
    var i = ids.indexOf(id);
    return i < 0 || i === ids.length - 1 ? null : ids[i + 1];
  }

  /**
   * Rhythmus aus ganzen Wochen: je Woche die häufigste Vorlage.
   * → [{ index, main }] oder null (Länge kein Vielfaches von 7)
   */
  function weeks(cycle) {
    var c = (cycle || []).map(cleanId);
    if (!c.length || c.length % 7) return null;
    var out = [];
    for (var w = 0; w < c.length / 7; w++) {
      var count = {}, best = null;
      c.slice(w * 7, w * 7 + 7).forEach(function (id) {
        if (!id) return;
        count[id] = (count[id] || 0) + 1;
        if (!best || count[id] > count[best]) best = id;
      });
      out.push({ index: w, main: best });
    }
    return out;
  }

  /** In welcher Rhythmuswoche liegt die Woche von `iso`? Nur bei ganzen Wochen ab Wochenbeginn. */
  function weekOf(rota, iso, firstDay) {
    var n = normalize(rota);
    if (!n.anchor || !n.cycle.length || n.cycle.length % 7) return null;
    var fd = firstDay === 0 ? 0 : 1;
    if (T.weekdayOf(n.anchor) !== fd) return null;
    var i = cycleIndex(n, T.startOfWeek(iso, fd));
    return i === null ? null : Math.floor(i / 7);
  }

  /** Anker so legen, dass die Woche von `iso` Rhythmuswoche `k` (0 = erste) ist. */
  function anchorForWeek(iso, k, firstDay) {
    return T.addDays(T.startOfWeek(iso, firstDay === 0 ? 0 : 1), -7 * (k || 0));
  }

  /* ==================================================================== */
  /* Anzeige                                                               */
  /* ==================================================================== */

  var LETTERS = /[^0-9A-Za-zÀ-ÖØ-öø-ɏ]+/g;

  /**
   * Kurzzeichen je Vorlage für Kalender und Raster. Die mitgelieferten
   * Vorlagen bekommen ihr übersetztes Zeichen (fixed: { early: "F", … }),
   * eigene den ersten Buchstaben des Namens — bei Gleichstand zwei, dann
   * eine Ziffer. Gross-/Kleinschreibung gilt nicht als Unterschied.
   * → { id: code }
   */
  function codes(templates, nameOf, fixed) {
    var out = {}, used = {};
    var list = (templates || []).filter(function (t) { return t && t.id; });
    fixed = fixed || {};
    function take(id, code) {
      var k = String(code).toUpperCase();
      if (!code || used[k]) return false;
      used[k] = true;
      out[id] = code;
      return true;
    }
    list.forEach(function (t) { if (fixed[t.id]) take(t.id, fixed[t.id]); });
    list.forEach(function (t) {
      if (out[t.id]) return;
      var name = String((nameOf ? nameOf(t) : t.name) || t.name || t.id || "");
      var letters = name.replace(LETTERS, "");
      var words = name.split(LETTERS).filter(Boolean);
      var first = letters.charAt(0).toUpperCase() || "?";
      var cands = [first];
      if (letters.length > 1) cands.push(first + letters.charAt(1).toLowerCase());
      if (words.length > 1) cands.push(first + words[1].charAt(0).toUpperCase());
      for (var k = 2; k < 100; k++) cands.push(first + k);
      for (var i = 0; i < cands.length; i++) { if (take(t.id, cands[i])) break; }
    });
    return out;
  }

  var PLAIN_KEYS = { date: 1, plan: 1, updatedAt: 1, createdAt: 1 };

  /**
   * Trägt der Datensatz ausser der Planung (bis 1.3) nichts? Dann darf er
   * beim Umziehen der Abweichung ganz weg — sonst bliebe ein leerer Tag liegen.
   */
  function onlyPlan(rec) {
    if (!rec) return false;
    return Object.keys(rec).every(function (k) {
      if (PLAIN_KEYS[k]) return true;
      var v = rec[k];
      if (v === null || v === undefined || v === "" || v === false) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (k === "location") return v === "office";
      if (k === "absenceFactor") return v === 1;
      return false;
    });
  }

  /**
   * Abweichung für einen Tag festlegen. Entspricht das Ziel dem Rhythmus,
   * braucht es keine Abweichung (→ null). An einem Feiertag, an dem der
   * Rhythmus pausiert, ist „laut Rhythmus“ frei — wer dann eine Schicht
   * wählt, braucht die Abweichung.
   *   target: Vorlagen-id | "free" | null (zurück zum Rhythmus)
   *   holiday: wahr, wenn `iso` ein Feiertag ist
   * → Wert der Abweichung (null = keine)
   */
  function overrideFor(rota, iso, target, holiday) {
    var t = cleanPlan(target);
    if (!t) return null;
    var base = holiday && normalize(rota).skipHolidays ? null : cycleId(rota, iso);
    if (t === FREE ? !base : t === base) return null;
    return t;
  }

  /* ==================================================================== */
  /* Abweichungen in den Einstellungen                                     */
  /* ==================================================================== */

  function overrideKey(iso) { return OVERRIDE_PREFIX + iso; }

  /** Datum eines Abweichungs-Schlüssels → iso | null */
  function overrideDate(key) {
    if (typeof key !== "string" || key.indexOf(OVERRIDE_PREFIX) !== 0) return null;
    var iso = key.slice(OVERRIDE_PREFIX.length);
    return T.isValidISO(iso) ? iso : null;
  }

  /** Abweichung für `iso` → Vorlagen-id | "free" | null */
  function overrideOf(settings, iso) {
    return settings ? cleanPlan(settings[OVERRIDE_PREFIX + iso]) : null;
  }

  /** Alle Abweichungen → { iso: Vorlagen-id | "free" } */
  function overridesIn(settings) {
    var out = {};
    Object.keys(settings || {}).forEach(function (k) {
      var iso = overrideDate(k);
      var v = iso ? cleanPlan(settings[k]) : null;
      if (v) out[iso] = v;
    });
    return out;
  }

  /**
   * Einstellungs-Patch für eine Abweichung (value null = zurück zum
   * Rhythmus). Räumt dabei Abweichungen weg, die mehr als 60 Tage vor
   * `today` liegen — sie zeigt keine Ansicht mehr. undefined entfernt
   * einen Schlüssel (Speichern, Zusammenführen und Rückgängig kennen das).
   */
  function overridePatch(settings, iso, value, today) {
    var patch = {};
    var oldest = T.isValidISO(today) ? T.addDays(today, -KEEP_OVERRIDES) : null;
    Object.keys(settings || {}).forEach(function (k) {
      var d = overrideDate(k);
      if (d && oldest && d < oldest && settings[k] !== undefined) patch[k] = undefined;
    });
    var v = cleanPlan(value);
    if (v) patch[overrideKey(iso)] = v;
    else if (settings && settings[overrideKey(iso)] !== undefined) patch[overrideKey(iso)] = undefined;
    return patch;
  }

  /**
   * Abweichungen aus Tagesdatensätzen (bis 1.3: rec.plan) in die
   * Einstellungen umziehen. Ein Datensatz, der nur die Planung trug, fällt
   * weg; einer mit echtem Inhalt verliert nur das Feld `plan`.
   *   opts: { today (ältere als 60 Tage ziehen nicht mehr um),
   *           locked(iso) → wahr = Tag gesperrt (abgeschlossener Monat bleibt unberührt) }
   * Eine schon gesetzte Abweichung in den Einstellungen geht vor.
   * → { settings: Patch, days: { iso: null (löschen) | { plan: undefined } }, count }
   */
  function migrateRecords(days, settings, opts) {
    opts = opts || {};
    var oldest = T.isValidISO(opts.today) ? T.addDays(opts.today, -KEEP_OVERRIDES) : null;
    var out = { settings: {}, days: {}, count: 0 };
    Object.keys(days || {}).forEach(function (iso) {
      var rec = days[iso];
      if (!rec || rec.plan === undefined || !T.isValidISO(iso)) return;
      if (opts.locked && opts.locked(iso)) return;
      var value = cleanPlan(rec.plan);
      if (value && (!oldest || iso >= oldest) && !overrideOf(settings, iso)) out.settings[overrideKey(iso)] = value;
      out.days[iso] = onlyPlan(rec) ? null : { plan: undefined };
      out.count++;
    });
    return out;
  }

  return {
    MAX_CYCLE: MAX_CYCLE,
    FREE: FREE,
    DEFAULT_REST_HOURS: DEFAULT_REST_HOURS,
    OVERRIDE_PREFIX: OVERRIDE_PREFIX,
    KEEP_OVERRIDES: KEEP_OVERRIDES,
    PRESETS: PRESETS,
    normalize: normalize,
    isActive: isActive,
    cycleIndex: cycleIndex,
    cycleId: cycleId,
    findTemplate: findTemplate,
    shiftTimes: shiftTimes,
    realMinutes: realMinutes,
    interval: interval,
    isAbsence: isAbsence,
    dayPlan: dayPlan,
    dayPlanOf: dayPlanOf,
    hasShift: hasShift,
    plan: plan,
    restConflicts: restConflicts,
    weeklyLoad: weeklyLoad,
    preset: preset,
    matchPreset: matchPreset,
    ensureTemplates: ensureTemplates,
    resize: resize,
    nextInCycle: nextInCycle,
    weeks: weeks,
    weekOf: weekOf,
    anchorForWeek: anchorForWeek,
    codes: codes,
    onlyPlan: onlyPlan,
    overrideFor: overrideFor,
    overrideKey: overrideKey,
    overrideDate: overrideDate,
    overrideOf: overrideOf,
    overridesIn: overridesIn,
    overridePatch: overridePatch,
    migrateRecords: migrateRecords
  };
});
