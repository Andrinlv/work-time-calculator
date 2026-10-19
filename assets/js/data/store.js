/* ==========================================================================
   ZEITKONTO — Datenhaltung
   --------------------------------------------------------------------------
   Alle Daten bleiben auf dem Gerät (localStorage). Kein Server, kein Konto,
   kein Tracking. Schema-Versionierung + Migrationen sorgen dafür, dass
   ältere Datenstände beim Update nicht verloren gehen.

   Mehrere Fenster: Jeder Tab hält den ganzen Zustand im Speicher. Damit
   zwei offene Fenster (z. B. installierte App + Browser-Tab) sich nicht
   gegenseitig überschreiben, merkt sich der Store, welche Tage und
   Einstellungen er selbst geändert hat. Hat inzwischen ein anderes
   Fenster gespeichert, wird dessen Stand übernommen und nur die eigenen
   Änderungen kommen obendrauf.

   Vorwärtskompatibel: Felder und Bereiche, die erst eine neuere Version
   kennt, werden unverändert mitgeführt, und die Schema-Nummer wird nie
   zurückgestuft. Ein veralteter Tab löscht so nichts, was er nicht kennt.

   Sperre (Monatsabschluss): Die App kann eine Prüffunktion setzen
   (setGuard). Änderungen an gesperrten Tagen werden übersprungen und als
   Ereignis { type: "locked", dates } gemeldet — die Oberfläche sagt dann,
   warum nichts gespeichert wurde. Ganze Stände (Import „ersetzen“,
   Zurücksetzen und deren Rückgängig) gehen bewusst an der Sperre vorbei.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ZK = root.ZK || {}; root.ZK.Store = factory(); }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var KEY = "zeitkonto:v1";
  var BACKUP_KEY = "zeitkonto:backup";
  var SCHEMA = 3;
  var UNDO_LIMIT = 100;
  var COALESCE_MS = 1500;     // schnelle Folgeänderungen = ein Rückgängig-Schritt
  var ERROR_REPEAT_MS = 30000; // dieselbe Speicherwarnung höchstens alle 30 s

  /* Bereiche, die diese Version selbst verwaltet. Alles andere auf oberster
     Ebene stammt von einer neueren Version und wird nur durchgereicht. */
  var KNOWN_PARTS = { version: 1, settings: 1, days: 1, achievements: 1, meta: 1 };
  /* Hülle einer Export-Datei — gehört nicht in den gespeicherten Zustand. */
  var EXPORT_ENVELOPE = { app: 1, schema: 1, exportedAt: 1, state: 1 };

  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

  /**
   * Prüft einen Tagesschlüssel auf ein echtes Kalenderdatum.
   * Die Form allein genügt nicht — "2026-13-45" sieht richtig aus, ist es
   * aber nicht, und ein solcher Schlüssel würde die Auswertungen verwirren.
   */
  function isValidDateKey(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    var date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /**
   * Säubert einen Tageseintrag so weit, dass die Berechnung nicht stolpern
   * kann. Unbekannte Felder (neuere Version) bleiben erhalten.
   *
   * strict = true (Import): ein Feld mit falschem Typ macht den ganzen Tag
   * unbrauchbar → null, damit nichts still verfälscht übernommen wird.
   * strict = false (Laden): reparieren — der Tag ist ja schon gespeichert.
   */
  function cleanDay(d, iso, strict) {
    if (!isPlainObject(d)) return null;
    var out = d;
    var bad = false;
    out.date = iso;
    // Beim Import fehlende Felder nicht ergänzen: beim Zusammenführen
    // gilt „was in der Datei steht, gewinnt; was fehlt, bleibt“.
    ["start", "end", "note"].forEach(function (k) {
      var v = out[k];
      if (v === undefined) { if (!strict) out[k] = ""; return; }
      if (v === null) { out[k] = ""; return; }
      if (typeof v !== "string") { bad = true; out[k] = ""; }
    });
    if (out.breaks === null || (out.breaks === undefined && !strict)) out.breaks = [];
    if (out.breaks !== undefined) {
      if (!Array.isArray(out.breaks)) { bad = true; out.breaks = []; }
      out.breaks = out.breaks.filter(function (b) {
        var ok = isPlainObject(b) &&
          (b.start === undefined || b.start === null || typeof b.start === "string") &&
          (b.end === undefined || b.end === null || typeof b.end === "string");
        if (!ok) bad = true;
        return ok;
      });
    }
    if (out.type !== undefined && out.type !== null && typeof out.type !== "string") { bad = true; out.type = null; }
    if (out.location !== undefined && out.location !== null && typeof out.location !== "string") { bad = true; delete out.location; }
    if (out.absenceFactor !== undefined && out.absenceFactor !== null && !isNum(out.absenceFactor)) { bad = true; delete out.absenceFactor; }
    if (out.targetOverride !== undefined && out.targetOverride !== null && !isNum(out.targetOverride)) { bad = true; out.targetOverride = null; }
    return strict && bad ? null : out;
  }

  /* ------------------------------------------------------------------ */
  /* Speicher-Backend                                                    */
  /* ------------------------------------------------------------------ */
  function memoryBackend() {
    var mem = Object.create(null);
    return {
      getItem: function (k) { return k in mem ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      volatile: true
    };
  }

  function isQuotaError(e) {
    var s = String((e && (e.name || "")) + " " + (e && e.message || e));
    return /quota|exceeded|NS_ERROR_DOM_QUOTA_REACHED/i.test(s) || !!(e && (e.code === 22 || e.code === 1014));
  }

  /**
   * localStorage, sobald es sich lesen lässt. Ein voller Speicher ist KEIN
   * Grund für den flüchtigen Arbeitsspeicher: Auf github.io teilen sich alle
   * Projektseiten eines Kontos dieselben 5 MB — ist das Kontingent fremd
   * belegt, scheitert schon die Schreibprobe, die eigenen Daten sind aber
   * vollständig lesbar. Nur wenn der Zugriff selbst verboten ist
   * (SecurityError, Speicher fehlt), bleibt der Arbeitsspeicher.
   */
  function detectBackend() {
    var ls = null;
    try { ls = (typeof localStorage !== "undefined") ? localStorage : null; } catch (e) { ls = null; }
    if (!ls) return { backend: memoryBackend(), full: false };
    try { ls.getItem(KEY); } catch (e) { return { backend: memoryBackend(), full: false }; }
    try {
      ls.setItem("zeitkonto:probe", "1");
      ls.removeItem("zeitkonto:probe");
    } catch (e) {
      if (!isQuotaError(e)) return { backend: memoryBackend(), full: false };
      return { backend: ls, full: true };
    }
    return { backend: ls, full: false };
  }

  /* ------------------------------------------------------------------ */
  /* Migrationen                                                         */
  /* ------------------------------------------------------------------ */
  var MIGRATIONS = {
    /* 1 -> 2: Pausen bekommen stabile IDs und ein `paid`-Flag. */
    2: function (state) {
      Object.keys(state.days || {}).forEach(function (iso) {
        var d = state.days[iso];
        (d.breaks || []).forEach(function (b, i) {
          if (!b.id) b.id = "b" + i + "_" + iso;
          if (b.paid === undefined) b.paid = false;
        });
      });
      return state;
    },
    /* 2 -> 3: Abwesenheitsfaktor (Halbtage) + Standort je Tag. */
    3: function (state) {
      Object.keys(state.days || {}).forEach(function (iso) {
        var d = state.days[iso];
        if (d.absenceFactor === undefined) d.absenceFactor = 1;
        if (!d.location) d.location = "office";
      });
      return state;
    }
  };

  function migrate(state) {
    var from = +state.version || 1;
    // Daten einer neueren App-Version nie auf ein älteres Schema zurückstufen
    if (from > SCHEMA) return state;
    for (var v = from + 1; v <= SCHEMA; v++) {
      if (MIGRATIONS[v]) state = MIGRATIONS[v](state);
      state.version = v;
    }
    state.version = SCHEMA;
    return state;
  }

  /* ------------------------------------------------------------------ */
  /* Store                                                               */
  /* ------------------------------------------------------------------ */
  function createStore(options) {
    options = options || {};
    var detected = options.backend ? { backend: options.backend, full: false } : detectBackend();
    var backend = detected.backend;
    var defaults = options.defaultSettings || function () { return {}; };
    var clock = options.clock || function () { return Date.now(); };

    var state = null;
    var listeners = [];
    var undoStack = [];
    var redoStack = [];
    var lastPushed = null;       // jüngster Rückgängig-Schritt (nur der darf wachsen)
    var saveTimer = null;
    var dirty = false;
    var lastError = null;
    var lastErrorEmit = 0;
    var full = detected.full;    // Speicher voll (Schreibprobe oder letztes Speichern gescheitert)
    var lastRaw = null;          // zuletzt gelesener/geschriebener Rohstand
    var pending = freshPending();
    var newerSchema = false;
    var revision = 0;
    var guard = null;            // (iso, settings) → true = Tag gesperrt
    var guardPrefix = null;      // Einstellungen, die zu den Tagen gehören (z. B. "closing:")

    /** Was dieses Fenster seit dem letzten Speichern selbst verändert hat. */
    function freshPending() {
      return { days: {}, settings: {}, meta: {}, parts: {}, achievements: false, full: false };
    }

    function blank() {
      return {
        version: SCHEMA,
        settings: defaults(),
        days: {},
        achievements: { earned: {}, xp: 0, bestStreak: 0, seen: {} },
        meta: {
          createdAt: new Date().toISOString(),
          lastOpenedAt: new Date().toISOString(),
          onboarded: false,
          device: (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent.slice(0, 90) : ""
        }
      };
    }

    function load() {
      var raw = null;
      try { raw = backend.getItem(KEY); } catch (e) { lastError = e; }
      lastRaw = raw;
      pending = freshPending();
      undoStack.length = 0;
      redoStack.length = 0;
      lastPushed = null;
      if (!raw) { state = blank(); return state; }
      try {
        state = parseRaw(raw);
      } catch (e) {
        lastError = e;
        // Defekte Daten nicht verwerfen: als Backup sichern, dann neu starten.
        try { backend.setItem(BACKUP_KEY + ":corrupt", raw); } catch (e2) { /* ignorieren */ }
        state = blank();
        state.meta.recoveredFromCorruption = true;
      }
      state.meta = state.meta || {};
      state.meta.lastOpenedAt = new Date().toISOString();
      return state;
    }

    function parseRaw(raw) {
      var parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) throw new Error("bad shape");
      if ((+parsed.version || 1) > SCHEMA) newerSchema = true;
      return migrate(normalize(parsed));
    }

    function normalize(parsed) {
      var s = blank();
      // Unbekannte Bereiche einer neueren Version unverändert mitführen
      Object.keys(parsed).forEach(function (k) {
        if (!has(KNOWN_PARTS, k)) s[k] = parsed[k];
      });
      s.version = +parsed.version || 1;
      s.settings = Object.assign(defaults(), isPlainObject(parsed.settings) ? parsed.settings : {});
      s.days = isPlainObject(parsed.days) ? parsed.days : {};
      s.achievements = Object.assign({ earned: {}, xp: 0, bestStreak: 0, seen: {} }, isPlainObject(parsed.achievements) ? parsed.achievements : {});
      s.meta = Object.assign(s.meta, isPlainObject(parsed.meta) ? parsed.meta : {});
      // Tageseinträge säubern
      Object.keys(s.days).forEach(function (iso) {
        if (!isValidDateKey(iso) || !cleanDay(s.days[iso], iso, false)) delete s.days[iso];
      });
      return s;
    }

    function persist(immediate) {
      dirty = true;
      if (saveTimer) clearTimeout(saveTimer);
      if (immediate) return flush();
      saveTimer = setTimeout(flush, 220);
    }

    /** Schreibt den Hauptstand; bei vollem Speicher werden zuerst Sicherungen geopfert, nie die Daten. */
    function writeMain(raw) {
      try { backend.setItem(KEY, raw); return; } catch (e) { if (!isQuotaError(e)) throw e; }
      try { backend.removeItem(BACKUP_KEY + ":prev"); backend.removeItem(BACKUP_KEY + ":corrupt"); } catch (e2) { /* egal */ }
      try { backend.setItem(KEY, raw); return; } catch (e) { if (!isQuotaError(e)) throw e; }
      // Letzte Stufe: die Startsicherung ist ein älterer Stand derselben Daten
      var backup = null;
      try { backup = backend.getItem(BACKUP_KEY); } catch (e3) { backup = null; }
      if (!backup) { backend.setItem(KEY, raw); return; }
      try { backend.removeItem(BACKUP_KEY); } catch (e4) { /* egal */ }
      try {
        backend.setItem(KEY, raw);
      } catch (e) {
        // Hat nichts genützt — dann wenigstens die Sicherung zurücklegen
        try { backend.setItem(BACKUP_KEY, backup); } catch (e5) { /* nichts mehr zu machen */ }
        throw e;
      }
    }

    function flush() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (!dirty || !state) return true;
      var external = null;
      try {
        // Hat ein anderes Fenster seit unserem letzten Lesen gespeichert?
        var current = null;
        try { current = backend.getItem(KEY); } catch (e) { current = null; }
        if (current && current !== lastRaw && !pending.full) external = absorb(current);
        var raw = JSON.stringify(state);
        writeMain(raw);
        lastRaw = raw;
        dirty = false;
        pending = freshPending();
        lastError = null;
        lastErrorEmit = 0;
        full = false;
        if (external) emitExternal(external);
        return true;
      } catch (e) {
        lastError = e;
        if (external) emitExternal(external);   // fremder Stand ist übernommen, auch wenn Schreiben scheiterte
        var quota = isQuotaError(e);
        if (quota) full = true;
        // Nicht bei jedem Tastendruck erneut warnen
        var now = clock();
        if (!lastErrorEmit || now - lastErrorEmit >= ERROR_REPEAT_MS) {
          lastErrorEmit = now;
          emit({ type: "error", error: e, quota: quota });
        }
        return false;
      }
    }

    /* ---- Mehrere Fenster -------------------------------------------- */

    /** Vergleichsform eines Tages: Standardfelder ergänzt, Schlüssel sortiert. */
    function dayJSON(d, ignoreStamp) {
      if (!d) return "";
      var v = Object.assign({ breaks: [], start: "", end: "", note: "" }, d);
      if (ignoreStamp) delete v.updatedAt;
      return stable(v);
    }

    function stable(v) {
      if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
      if (v && typeof v === "object") {
        return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
          .map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
      }
      return JSON.stringify(v);
    }

    /**
     * Übernimmt einen fremden Rohstand und legt die eigenen, noch nicht
     * gespeicherten Änderungen obendrauf. Liefert ein Ereignis, falls der
     * fremde Stand etwas Sichtbares geändert hat.
     */
    function absorb(raw) {
      var ext;
      try { ext = parseRaw(raw); } catch (e) { return null; }   // Kaputtes überschreiben wir lieber nicht ungefragt
      var mine = state;
      // Einstellungen zuerst: ob ein Tag gesperrt ist, entscheidet der zusammengeführte Stand
      var changedSettings = [];
      Object.keys(ext.settings).forEach(function (k) {
        if (pending.settings[k]) return;
        if (stable(ext.settings[k]) !== stable(mine.settings[k])) changedSettings.push(k);
      });
      Object.keys(pending.settings).forEach(function (k) {
        if (mine.settings[k] === undefined) delete ext.settings[k];
        else ext.settings[k] = mine.settings[k];
      });
      var changedDays = [];
      var lockedMine = [];
      var keys = {};
      Object.keys(mine.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(ext.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (iso) {
        var differs = dayJSON(mine.days[iso]) !== dayJSON(ext.days[iso]);
        /* Ein anderes Fenster hat den Monat inzwischen abgeschlossen: die
           eigene, noch nicht gespeicherte Änderung darf ihn nicht still
           verschieben — der abgeschlossene Stand gilt. Hat dieses Fenster
           selbst abgeschlossen, ist sein Stand der abgeschlossene. */
        if (pending.days[iso] && differs && isLocked(iso, ext.settings) && !isLocked(iso, mine.settings)) {
          lockedMine.push(iso);
          changedDays.push(iso);
        } else if (pending.days[iso]) {
          if (mine.days[iso]) ext.days[iso] = mine.days[iso];
          else delete ext.days[iso];
        } else if (differs) {
          changedDays.push(iso);
        }
      });
      Object.keys(pending.meta).forEach(function (k) { ext.meta[k] = mine.meta[k]; });
      Object.keys(pending.parts).forEach(function (k) {
        if (mine[k] === undefined) delete ext[k];
        else ext[k] = mine[k];
      });
      ext.achievements = mergeAchievements(ext.achievements, mine.achievements);
      if (!newerSchema) ext.version = SCHEMA;
      state = ext;
      lastRaw = raw;
      rebaseHistory(changedDays, changedSettings);
      if (!changedDays.length && !changedSettings.length) return null;
      return { type: "external", days: changedDays, settings: changedSettings.length > 0, settingKeys: changedSettings, newer: newerSchema, locked: lockedMine };
    }

    /** Fremden Stand melden — und eigene Änderungen, die die Sperre verworfen hat. */
    function emitExternal(evt) {
      emit(evt);
      if (evt.locked && evt.locked.length) emitLocked(evt.locked, true);
    }

    /** Abzeichen gehen beim Zusammenführen nie verloren. */
    function mergeAchievements(a, b) {
      a = a || {}; b = b || {};
      return Object.assign({}, a, b, {
        earned: Object.assign({}, a.earned || {}, b.earned || {}),
        seen: Object.assign({}, a.seen || {}, b.seen || {}),
        xp: Math.max(a.xp || 0, b.xp || 0),
        bestStreak: Math.max(a.bestStreak || 0, b.bestStreak || 0)
      });
    }

    /**
     * Rückgängig-Stände an fremde Änderungen anpassen — sonst würde ein
     * „Rückgängig“ hier auch die Eingaben aus dem anderen Fenster löschen.
     * Ein Schritt kennt nur die Tage und Einstellungen, die er selbst
     * verändert hat; nur dort wird der „Vorher“-Wert nachgeführt.
     */
    function rebaseHistory(changedDays, changedSettings) {
      if (!changedDays.length && !changedSettings.length) return;
      [undoStack, redoStack].forEach(function (stack) {
        stack.forEach(function (entry) {
          changedDays.forEach(function (iso) {
            if (has(entry.days, iso)) entry.days[iso] = dayRaw(iso);
          });
          changedSettings.forEach(function (k) {
            if (has(entry.settings, k)) entry.settings[k] = settingRaw(k);
          });
        });
      });
      lastPushed = null;   // nach fremden Änderungen beginnt ein neuer Schritt
    }

    /**
     * Ein anderes Fenster hat gespeichert (storage-Ereignis). Ohne eigene
     * offene Änderungen übernehmen wir dessen Stand sofort; sonst führt
     * flush() beide zusammen.
     */
    function syncExternal(raw) {
      if (!state || raw === null || raw === undefined || raw === lastRaw) return false;
      if (dirty) { flush(); return true; }
      var evt = absorb(raw);
      if (evt) emitExternal(evt);
      return !!evt;
    }

    if (options.listen !== false && typeof window !== "undefined" && window.addEventListener && !backend.volatile) {
      window.addEventListener("storage", function (e) {
        if (e.key === KEY) syncExternal(e.newValue);
      });
    }

    function emit(evt) {
      evt = evt || { type: "change" };
      if (evt.type !== "error" && evt.type !== "locked") revision++;
      listeners.forEach(function (fn) {
        try { fn(evt, state); } catch (e) { /* Listener isolieren */ }
      });
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    /* ---- Sperre ---------------------------------------------------- */

    /**
     * @param {Function} fn    (iso, settings) → true, wenn der Tag gesperrt ist
     * @param {Object} [opts]  { prefix: Einstellungsschlüssel, die zu den Tagen
     *                         gehören — „Alles löschen“ entfernt sie mit }
     */
    function setGuard(fn, opts) {
      guard = typeof fn === "function" ? fn : null;
      guardPrefix = opts && opts.prefix ? String(opts.prefix) : null;
    }

    function isLocked(iso, settings) {
      if (!guard) return false;
      try { return !!guard(iso, settings || state.settings); } catch (e) { return false; }
    }

    /** partial: derselbe Vorgang hat anderes sehr wohl gespeichert */
    function emitLocked(dates, partial) {
      if (dates && dates.length) emit({ type: "locked", dates: dates.slice().sort(), partial: !!partial });
    }

    /* Felder, die ein leerer Tag ohnehin hat — sie zu „speichern“ ist keine Änderung */
    var EMPTY_FIELDS = { start: "", end: "", note: "", type: null, targetOverride: null, location: "office", absenceFactor: 1 };

    /** Würde die Änderung am gesperrten Tag gar nichts bewirken? Dann still übergehen. */
    function wouldNotChange(iso, patch) {
      var cur = state.days[iso];
      if (patch === null) return !cur;
      if (cur) return dayJSON(cur, true) === dayJSON(Object.assign({}, cur, patch, { date: iso }), true);
      return Object.keys(patch || {}).every(function (k) {
        var v = patch[k];
        if (v === undefined || v === null || v === "" || k === "date" || k === "updatedAt") return true;
        if (Array.isArray(v)) return v.length === 0;
        return has(EMPTY_FIELDS, k) && EMPTY_FIELDS[k] === v;
      });
    }

    /* ---- Tage ------------------------------------------------------ */

    function getDay(iso) { return state.days[iso] || null; }

    function getDayOrEmpty(iso) {
      return state.days[iso] || { date: iso, type: null, start: "", end: "", breaks: [], location: "office", note: "", absenceFactor: 1, targetOverride: null };
    }

    function setDay(iso, patch, opts) {
      opts = opts || {};
      var current = state.days[iso] || { date: iso, breaks: [] };
      var next = Object.assign({}, current, patch, { date: iso, updatedAt: new Date().toISOString() });
      // Nichts geändert (z. B. Feld verlassen ohne Eingabe): kein Rückgängig-
      // Schritt und keine Markierung — sonst überstimmt dieses Fenster beim
      // Zusammenführen grundlos die Eingabe eines anderen.
      if (state.days[iso] && dayJSON(current, true) === dayJSON(next, true)) return current;
      if (isLocked(iso)) {
        if (!wouldNotChange(iso, patch)) emitLocked([iso]);
        return state.days[iso] || null;
      }
      var label = opts.label || "day";
      var entry = beginUndo(label, opts.undo === false ? false : label + "|" + iso + "|" + Object.keys(patch || {}).sort().join(","));
      if (entry) trackDay(entry, iso);
      state.days[iso] = next;
      pending.days[iso] = true;
      persist(opts.immediate);
      emit({ type: "day", date: iso });
      return next;
    }

    function deleteDay(iso, opts) {
      if (!state.days[iso]) return false;
      if (isLocked(iso)) { emitLocked([iso]); return false; }
      var entry = beginUndo((opts && opts.label) || "delete", opts && opts.undo === false ? false : null);
      if (entry) trackDay(entry, iso);
      delete state.days[iso];
      pending.days[iso] = true;
      persist();
      emit({ type: "day", date: iso, deleted: true });
      return true;
    }

    /** → { written, locked: [iso] } */
    function setDays(map, opts) {
      var locked = [];
      var keys = Object.keys(map).filter(function (iso) {
        if (!isLocked(iso)) return true;
        if (!wouldNotChange(iso, map[iso])) locked.push(iso);
        return false;
      });
      if (keys.length) {
        var entry = beginUndo((opts && opts.label) || "bulk", opts && opts.undo === false ? false : null);
        keys.forEach(function (iso) {
          if (entry) trackDay(entry, iso);
          pending.days[iso] = true;
          if (map[iso] === null) delete state.days[iso];
          else state.days[iso] = Object.assign({}, state.days[iso] || { date: iso, breaks: [] }, map[iso], { date: iso, updatedAt: new Date().toISOString() });
        });
        persist();
        emit({ type: "bulk", count: keys.length });
      }
      emitLocked(locked, keys.length > 0);
      return { written: keys.length, locked: locked };
    }

    function allDays() { return state.days; }

    function dayCount() { return Object.keys(state.days).length; }

    /* ---- Einstellungen --------------------------------------------- */

    function getSettings() { return state.settings; }

    /**
     * Reine Buchhaltung (letzter Export, letzter Kalenderabgleich) ist kein
     * eigener Rückgängig-Schritt — sonst nimmt „Rückgängig“ nach einem
     * Abgleich nur dessen Zeitstempel zurück statt der übernommenen Tage.
     */
    function isBookkeeping(patch) {
      var keys = Object.keys(patch || {});
      if (!keys.length) return true;
      return keys.every(function (k) {
        if (k === "lastExportAt") return true;
        if (k === "outlook" && isPlainObject(patch.outlook) && isPlainObject(state.settings.outlook)) {
          var a = Object.assign({}, state.settings.outlook, { lastSyncAt: null });
          var b = Object.assign({}, patch.outlook, { lastSyncAt: null });
          return stable(a) === stable(b);
        }
        return false;
      });
    }

    function updateSettings(patch, opts) {
      opts = opts || {};
      patch = patch || {};
      var quiet = opts.undo === false || isBookkeeping(patch);
      var keys = Object.keys(patch).sort();
      // coalesce: false — eigener Schritt auch bei schneller Folge (Abschliessen, dann Wiederöffnen)
      var entry = quiet ? null : beginUndo("settings", opts.coalesce === false ? null : "settings|" + keys.join(","));
      keys.forEach(function (k) {
        if (entry) trackSetting(entry, k);
        pending.settings[k] = true;
      });
      Object.assign(state.settings, patch);
      persist(opts.immediate);
      emit({ type: "settings", patch: patch });
      return state.settings;
    }

    /* ---- Erfolge ---------------------------------------------------- */

    function getAchievements() { return state.achievements; }

    function saveAchievements(next) {
      state.achievements = next;
      pending.achievements = true;
      persist();
      emit({ type: "achievements" });
    }

    /* ---- Meta ------------------------------------------------------- */

    function getMeta() { return state.meta; }
    function updateMeta(patch) {
      Object.assign(state.meta, patch);
      Object.keys(patch || {}).forEach(function (k) { pending.meta[k] = true; });
      persist();
    }

    /* ---- Rückgängig ------------------------------------------------- */
    /*
       Ein Schritt merkt sich nur, was er verändert: den Vorher-Stand der
       betroffenen Tage und Einstellungen (als JSON, damit spätere Änderungen
       an denselben Objekten ihn nicht verfälschen) und — bei Import und
       Zurücksetzen — ganze Bereiche wie Erfolge und Meta-Daten. Ein
       Tastendruck kostet so einige hundert Bytes statt einer Kopie aller
       Daten. Schnelle Folgeänderungen am selben Feld (Tippen in einem
       Zeitfeld) wachsen in den jüngsten Schritt hinein, statt je einen
       eigenen anzulegen.

       Eintrag: { label, key, at, days: {iso: json|ABSENT},
                  settings: {key: json|ABSENT}, parts: {name: json|ABSENT},
                  whole: true bei Import „ersetzen“ und Zurücksetzen }

       Gesperrte Tage (abgeschlossener Monat) setzt ein Schritt nicht zurück
       — ausser er stellt einen ganzen Stand wieder her (whole). Bestünde ein
       Schritt nur aus gesperrten Tagen, bleibt er liegen: nach dem
       Wiederöffnen des Monats lässt er sich noch zurücknehmen.
    */
    var ABSENT = "";   // „gab es vorher nicht“ — gültiges JSON ist nie leer

    function rawOf(v) { return v === undefined ? ABSENT : JSON.stringify(v); }
    function dayRaw(iso) { return state.days[iso] ? JSON.stringify(state.days[iso]) : ABSENT; }
    function settingRaw(k) { return rawOf(state.settings[k]); }

    /**
     * Beginnt einen Schritt oder setzt den jüngsten fort.
     * key: Zusammenfassungs-Schlüssel (null = nie zusammenfassen,
     *      false = gar kein Schritt).
     */
    function beginUndo(label, key) {
      if (key === false) return null;
      var now = clock();
      redoStack.length = 0;
      var top = undoStack[undoStack.length - 1];
      if (key && top && top === lastPushed && top.key === key && now - top.at < COALESCE_MS) {
        top.at = now;
        return top;
      }
      var entry = { label: label, key: key || null, at: now, days: {}, settings: {}, parts: null };
      undoStack.push(entry);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      lastPushed = entry;
      return entry;
    }

    function trackDay(entry, iso) {
      if (!has(entry.days, iso)) entry.days[iso] = dayRaw(iso);
    }

    function trackSetting(entry, k) {
      if (!has(entry.settings, k)) entry.settings[k] = settingRaw(k);
    }

    function trackPart(entry, name) {
      entry.parts = entry.parts || {};
      if (!has(entry.parts, name)) entry.parts[name] = rawOf(state[name]);
    }

    /** Setzt die Vorher-Werte eines Schritts ein; liefert den Gegen-Schritt
        und die Tage, die die Sperre ausgelassen hat. */
    function applyEntry(entry) {
      var inverse = { label: entry.label, key: null, at: clock(), days: {}, settings: {}, parts: null, whole: !!entry.whole };
      var locked = [];
      // Einstellungen zuerst: gesperrt ist, was NACH dem Schritt abgeschlossen ist
      Object.keys(entry.settings).forEach(function (k) {
        var cur = settingRaw(k);
        var want = entry.settings[k];
        inverse.settings[k] = cur;
        if (cur === want) return;
        if (want === ABSENT) delete state.settings[k];
        else state.settings[k] = JSON.parse(want);
        pending.settings[k] = true;
      });
      Object.keys(entry.days).forEach(function (iso) {
        var cur = dayRaw(iso);
        var want = entry.days[iso];
        if (cur !== want && !entry.whole && isLocked(iso)) { locked.push(iso); return; }
        inverse.days[iso] = cur;
        if (cur === want) return;
        if (want === ABSENT) delete state.days[iso];
        else state.days[iso] = JSON.parse(want);
        pending.days[iso] = true;
      });
      if (entry.parts) {
        inverse.parts = {};
        Object.keys(entry.parts).forEach(function (name) {
          var cur = rawOf(state[name]);
          var want = entry.parts[name];
          inverse.parts[name] = cur;
          if (cur === want) return;
          var prev = state[name];
          if (want === ABSENT) delete state[name];
          else state[name] = JSON.parse(want);
          if (name === "achievements") pending.achievements = true;
          else if (name === "meta") {
            Object.keys(Object.assign({}, prev || {}, state.meta || {})).forEach(function (k) { pending.meta[k] = true; });
            state.meta = state.meta || {};
          }
          else if (name !== "version") pending.parts[name] = true;
        });
      }
      return { inverse: inverse, locked: locked };
    }

    /**
     * Gesperrte Tage, falls ein Schritt NUR aus ihnen bestünde — dann wird
     * er gar nicht angewendet. Sonst null.
     */
    function lockedOnly(entry) {
      if (entry.whole) return null;
      var changesOther = Object.keys(entry.settings).some(function (k) { return settingRaw(k) !== entry.settings[k]; }) ||
        Object.keys(entry.parts || {}).some(function (n) { return rawOf(state[n]) !== entry.parts[n]; });
      if (changesOther) return null;
      var locked = [];
      var free = false;
      Object.keys(entry.days).forEach(function (iso) {
        if (dayRaw(iso) === entry.days[iso]) return;
        if (isLocked(iso)) locked.push(iso);
        else free = true;
      });
      return locked.length && !free ? locked : null;
    }

    /** Rückgängig oder Wiederherstellen; false = nichts getan (leer oder gesperrt). */
    function step(from, to) {
      if (!from.length) return false;
      var entry = from[from.length - 1];
      var blocked = lockedOnly(entry);
      if (blocked) { emitLocked(blocked); return false; }
      from.pop();
      var applied = applyEntry(entry);
      to.push(applied.inverse);
      lastPushed = null;
      persist(true);
      emit({ type: "restore" });
      emitLocked(applied.locked, true);
      return entry.label;
    }

    function undo() { return step(undoStack, redoStack); }
    function redo() { return step(redoStack, undoStack); }

    function canUndo() { return undoStack.length > 0; }
    function canRedo() { return redoStack.length > 0; }

    /* ---- Import / Export -------------------------------------------- */

    function exportState() {
      var out = {
        app: "Zeitkonto",
        schema: Math.max(+state.version || SCHEMA, SCHEMA),
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        days: state.days,
        achievements: state.achievements,
        meta: { createdAt: state.meta.createdAt }
      };
      // Bereiche einer neueren Version gehören zur vollständigen Sicherung
      Object.keys(state).forEach(function (k) {
        if (!has(KNOWN_PARTS, k) && !has(EXPORT_ENVELOPE, k)) out[k] = state[k];
      });
      return out;
    }

    function importError(code, message) {
      var e = new Error(message);
      e.code = code;
      return e;
    }

    /** Einstellungen aus einer Datei: nur Werte, deren Typ zur App passt. */
    function cleanSettings(incoming) {
      var base = defaults();
      var out = {};
      Object.keys(incoming).forEach(function (k) {
        var v = incoming[k];
        var ref = base[k];
        if (v === undefined) return;
        if (ref !== null && ref !== undefined && v !== null) {
          if (typeof ref === "number" && !isNum(v)) return;
          if (typeof ref === "boolean" && typeof v !== "boolean") return;
          if (typeof ref === "string" && typeof v !== "string") return;
          if (typeof ref === "object" && (typeof v !== "object" || Array.isArray(ref) !== Array.isArray(v))) return;
        }
        out[k] = v;
      });
      return out;
    }

    function cleanAchievements(a) {
      return {
        earned: isPlainObject(a.earned) ? a.earned : {},
        seen: isPlainObject(a.seen) ? a.seen : {},
        xp: isNum(a.xp) ? a.xp : 0,
        bestStreak: isNum(a.bestStreak) ? a.bestStreak : 0
      };
    }

    /**
     * Liest eine Sicherung ein. Die Datei wird zuerst vollständig geprüft
     * und auf den aktuellen Stand migriert — erst dann wird etwas geändert.
     * Unbrauchbare Tage werden übersprungen und gezählt, statt die
     * Berechnung später zum Absturz zu bringen.
     *
     * @param {Object} data  geparster Export (oder roher Speicherstand)
     * @param {String} mode  "replace" | "merge" | "merge-keep"
     * @returns {{added, updated, skipped, invalid, newer}}
     */
    function importState(data, mode) {
      if (!isPlainObject(data)) throw importError("invalid", "Ungültige Datei");
      var src = isPlainObject(data.state) && !data.days ? data.state : data;
      var incomingDays = src.days;
      if (!isPlainObject(incomingDays)) throw importError("no-days", "Keine Tagesdaten gefunden");

      // 1. Prüfen und migrieren — auf Kopien, die Datei bleibt unberührt
      var version = +(data.schema || src.version || data.version) || 1;
      var days = {};
      var invalid = 0, badKeys = 0, total = 0;
      Object.keys(incomingDays).forEach(function (iso) {
        total++;
        if (!isValidDateKey(iso)) { badKeys++; return; }
        var copy;
        try { copy = JSON.parse(JSON.stringify(incomingDays[iso])); } catch (e) { copy = null; }
        var clean = cleanDay(copy, iso, true);
        if (!clean) { invalid++; return; }
        days[iso] = clean;
      });
      if (total > 0 && !Object.keys(days).length) {
        throw importError("no-valid-days", "Keine gültigen Tagesdaten gefunden");
      }
      days = migrate({ version: version, days: days }).days;
      var settings = isPlainObject(src.settings) ? cleanSettings(JSON.parse(JSON.stringify(src.settings))) : null;
      var achievements = isPlainObject(src.achievements) ? cleanAchievements(JSON.parse(JSON.stringify(src.achievements))) : null;
      var extras = {};
      Object.keys(src).forEach(function (k) {
        if (!has(KNOWN_PARTS, k) && !has(EXPORT_ENVELOPE, k)) extras[k] = src[k];
      });

      // 2. Anwenden — als ein einziger Rückgängig-Schritt
      var entry = beginUndo("import", null);
      var added = 0, updated = 0, skipped = invalid + badKeys;
      var locked = [];

      if (mode === "replace") {
        entry.whole = true;   // ein ganzer Stand — auch abgeschlossene Monate
        Object.keys(state.days).forEach(function (iso) { trackDay(entry, iso); });
        Object.keys(days).forEach(function (iso) { trackDay(entry, iso); });
        state.days = {};
        if (settings) {
          var next = Object.assign(defaults(), settings);
          Object.keys(Object.assign({}, state.settings, next)).forEach(function (k) { trackSetting(entry, k); });
          state.settings = next;
        }
        pending.full = true;
      }

      Object.keys(days).forEach(function (iso) {
        var incoming = days[iso];
        // Zusammenführen lässt abgeschlossene Monate unangetastet
        if (mode !== "replace" && isLocked(iso) && !(mode === "merge-keep" && state.days[iso])) {
          if (!wouldNotChange(iso, incoming)) locked.push(iso);
          skipped++;
          return;
        }
        trackDay(entry, iso);
        if (!state.days[iso]) {
          state.days[iso] = Object.assign({ date: iso, start: "", end: "", note: "", breaks: [] }, incoming);
          pending.days[iso] = true;
          added++;
          return;
        }
        if (mode === "merge-keep") { skipped++; return; }
        state.days[iso] = Object.assign({}, state.days[iso], incoming);
        pending.days[iso] = true;
        updated++;
      });

      if (mode === "merge" && settings) {
        Object.keys(settings).forEach(function (k) { trackSetting(entry, k); pending.settings[k] = true; });
        Object.assign(state.settings, settings);
      }
      if (achievements && mode !== "merge-keep") {
        trackPart(entry, "achievements");
        state.achievements = mergeAchievements(state.achievements, achievements);
        pending.achievements = true;
      }
      Object.keys(extras).forEach(function (k) {
        if (mode !== "replace" && state[k] !== undefined) return;
        trackPart(entry, k);
        state[k] = extras[k];
        pending.parts[k] = true;
      });

      persist(true);
      emit({ type: "import" });
      emitLocked(locked, added + updated > 0 || !!settings || !!achievements);
      return { added: added, updated: updated, skipped: skipped, invalid: invalid, newer: version > SCHEMA, locked: locked.length };
    }

    /** Alles löschen — vollständig umkehrbar (Tage, Einstellungen, Erfolge, Meta). */
    function reset(keepSettings) {
      var entry = beginUndo("reset", null);
      entry.whole = true;
      var fresh = blank();
      Object.keys(state.days).forEach(function (iso) { trackDay(entry, iso); });
      if (keepSettings) {
        fresh.settings = state.settings;
        // Abschlüsse gehören zu den Tagen: ohne Tage gäbe es nichts mehr, was sie einfrieren
        if (guardPrefix) {
          Object.keys(fresh.settings).forEach(function (k) {
            if (k.indexOf(guardPrefix) !== 0) return;
            trackSetting(entry, k);
            delete fresh.settings[k];
          });
        }
      }
      else Object.keys(Object.assign({}, state.settings, fresh.settings)).forEach(function (k) { trackSetting(entry, k); });
      Object.keys(Object.assign({}, state, fresh)).forEach(function (k) {
        if (k !== "days" && k !== "settings") trackPart(entry, k);
      });
      state = fresh;
      pending.full = true;
      persist(true);
      emit({ type: "reset" });
    }

    /* ---- Sicherung -------------------------------------------------- */

    /**
     * Automatische Sicherung beim Start. Ein leerer Stand überschreibt nie
     * eine gefüllte Sicherung (sonst wäre sie nach einem Datenschaden oder
     * einem versehentlichen Zurücksetzen genau dann weg, wenn man sie braucht).
     * Die Sicherung vom Vortag bleibt als zweite Stufe erhalten.
     * Ist der Speicher voll, unterbleibt sie — der Platz gehört den Daten.
     */
    function makeBackup() {
      if (!state || !dayCount() || full) return false;
      try {
        var prev = readBackup();
        var now = new Date();
        var today = now.getFullYear() + "-" + now.getMonth() + "-" + now.getDate();
        if (prev && prev.at) {
          var p = new Date(prev.at);
          var prevDay = p.getFullYear() + "-" + p.getMonth() + "-" + p.getDate();
          if (prevDay !== today) {
            try { backend.setItem(BACKUP_KEY + ":prev", JSON.stringify(prev)); } catch (e) { /* zweite Stufe ist optional */ }
          }
        }
        backend.setItem(BACKUP_KEY, JSON.stringify({ at: now.toISOString(), days: dayCount(), data: exportState() }));
        return true;
      } catch (e) { return false; }
    }

    /** @param {String} which  "" (letzte) | "prev" (Vortag) */
    function readBackup(which) {
      try {
        var raw = backend.getItem(which === "prev" ? BACKUP_KEY + ":prev" : BACKUP_KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        if (parsed && parsed.data && parsed.days === undefined) parsed.days = Object.keys(parsed.data.days || {}).length;
        return parsed;
      } catch (e) { return null; }
    }

    /** Rohdaten, die beim Laden nicht lesbar waren (zum Herunterladen). */
    function readCorrupt() {
      try { return backend.getItem(BACKUP_KEY + ":corrupt"); } catch (e) { return null; }
    }

    /* ---- Diagnose --------------------------------------------------- */

    /** Grösse des gespeicherten Stands — aus dem Gedächtnis statt bei jedem Aufruf neu gelesen. */
    function usageBytes() { return lastRaw ? lastRaw.length : 0; }

    function diagnostics() {
      return {
        schema: SCHEMA,
        days: dayCount(),
        bytes: usageBytes(),
        volatile: !!backend.volatile,
        full: full,
        newerSchema: newerSchema,
        lastError: lastError ? String(lastError.message || lastError) : null,
        undoDepth: undoStack.length
      };
    }

    return {
      SCHEMA: SCHEMA,
      load: load,
      flush: flush,
      subscribe: subscribe,
      get state() { return state; },
      getDay: getDay,
      getDayOrEmpty: getDayOrEmpty,
      setDay: setDay,
      setDays: setDays,
      deleteDay: deleteDay,
      allDays: allDays,
      dayCount: dayCount,
      getSettings: getSettings,
      updateSettings: updateSettings,
      getAchievements: getAchievements,
      saveAchievements: saveAchievements,
      getMeta: getMeta,
      updateMeta: updateMeta,
      undo: undo,
      redo: redo,
      canUndo: canUndo,
      canRedo: canRedo,
      exportState: exportState,
      importState: importState,
      reset: reset,
      makeBackup: makeBackup,
      readBackup: readBackup,
      readCorrupt: readCorrupt,
      syncExternal: syncExternal,
      setGuard: setGuard,
      isLocked: function (iso) { return isLocked(iso); },
      isNewerSchema: function () { return newerSchema; },
      isFull: function () { return full; },
      /** Zähler, der bei jeder Datenänderung steigt — Schlüssel für Zwischenspeicher. */
      rev: function () { return revision; },
      diagnostics: diagnostics
    };
  }

  return {
    createStore: createStore,
    memoryBackend: memoryBackend,
    detectBackend: detectBackend,
    isValidDateKey: isValidDateKey,
    cleanDay: cleanDay,
    SCHEMA: SCHEMA,
    KEY: KEY
  };
});
