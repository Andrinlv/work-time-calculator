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
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.ZK = root.ZK || {}; root.ZK.Store = factory(); }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var KEY = "zeitkonto:v1";
  var BACKUP_KEY = "zeitkonto:backup";
  var SCHEMA = 3;

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

  function detectBackend() {
    try {
      var ls = (typeof localStorage !== "undefined") ? localStorage : null;
      if (!ls) return memoryBackend();
      var probe = "zeitkonto:probe";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return memoryBackend();
    }
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
    var from = state.version || 1;
    // Daten einer neueren App-Version nie auf ein älteres Schema zurückstufen
    if (from > SCHEMA) return state;
    for (var v = from + 1; v <= SCHEMA; v++) {
      if (MIGRATIONS[v]) state = MIGRATIONS[v](state);
      state.version = v;
    }
    state.version = SCHEMA;
    return state;
  }

  function isQuotaError(e) {
    var s = String((e && (e.name || "")) + " " + (e && e.message || e));
    return /quota|exceeded|NS_ERROR_DOM_QUOTA_REACHED/i.test(s) || (e && (e.code === 22 || e.code === 1014));
  }

  /* ------------------------------------------------------------------ */
  /* Store                                                               */
  /* ------------------------------------------------------------------ */
  function createStore(options) {
    options = options || {};
    var backend = options.backend || detectBackend();
    var defaults = options.defaultSettings || function () { return {}; };

    var state = null;
    var listeners = [];
    var undoStack = [];
    var redoStack = [];
    var saveTimer = null;
    var dirty = false;
    var lastError = null;
    var lastRaw = null;          // zuletzt gelesener/geschriebener Rohstand
    var pending = freshPending();
    var newerSchema = false;

    /** Was dieses Fenster seit dem letzten Speichern selbst verändert hat. */
    function freshPending() {
      return { days: {}, settings: {}, meta: {}, achievements: false, full: false };
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
      if (!parsed || typeof parsed !== "object") throw new Error("bad shape");
      if ((parsed.version || 1) > SCHEMA) newerSchema = true;
      return migrate(normalize(parsed));
    }

    function normalize(parsed) {
      var s = blank();
      s.version = parsed.version || 1;
      s.settings = Object.assign(defaults(), parsed.settings || {});
      s.days = parsed.days && typeof parsed.days === "object" ? parsed.days : {};
      s.achievements = Object.assign({ earned: {}, xp: 0, bestStreak: 0, seen: {} }, parsed.achievements || {});
      s.meta = Object.assign(s.meta, parsed.meta || {});
      // Tageseinträge säubern
      Object.keys(s.days).forEach(function (iso) {
        var d = s.days[iso];
        if (!d || typeof d !== "object" || !isValidDateKey(iso)) { delete s.days[iso]; return; }
        d.date = iso;
        d.breaks = Array.isArray(d.breaks) ? d.breaks : [];
        d.start = typeof d.start === "string" ? d.start : "";
        d.end = typeof d.end === "string" ? d.end : "";
        d.note = typeof d.note === "string" ? d.note : "";
      });
      return s;
    }

    function persist(immediate) {
      dirty = true;
      if (saveTimer) clearTimeout(saveTimer);
      if (immediate) return flush();
      saveTimer = setTimeout(flush, 220);
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
        try {
          backend.setItem(KEY, raw);
        } catch (e) {
          // Platz schaffen: zuerst die ältere Sicherung opfern, nie die Daten
          if (!isQuotaError(e)) throw e;
          try { backend.removeItem(BACKUP_KEY + ":prev"); backend.removeItem(BACKUP_KEY + ":corrupt"); } catch (e2) { /* egal */ }
          backend.setItem(KEY, raw);
        }
        lastRaw = raw;
        dirty = false;
        pending = freshPending();
        lastError = null;
        if (external) emit(external);
        return true;
      } catch (e) {
        lastError = e;
        emit({ type: "error", error: e, quota: isQuotaError(e) });
        return false;
      }
    }

    /* ---- Mehrere Fenster -------------------------------------------- */

    /** Vergleichsform eines Tages: Standardfelder ergänzt, Schlüssel sortiert. */
    function dayJSON(d) {
      if (!d) return "";
      return stable(Object.assign({ breaks: [], start: "", end: "", note: "" }, d));
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
      var changedDays = [];
      var keys = {};
      Object.keys(mine.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(ext.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (iso) {
        if (pending.days[iso]) {
          if (mine.days[iso]) ext.days[iso] = mine.days[iso];
          else delete ext.days[iso];
        } else if (dayJSON(mine.days[iso]) !== dayJSON(ext.days[iso])) {
          changedDays.push(iso);
        }
      });
      var settingsChanged = false;
      Object.keys(ext.settings).forEach(function (k) {
        if (pending.settings[k]) return;
        if (stable(ext.settings[k]) !== stable(mine.settings[k])) settingsChanged = true;
      });
      Object.keys(pending.settings).forEach(function (k) { ext.settings[k] = mine.settings[k]; });
      Object.keys(pending.meta).forEach(function (k) { ext.meta[k] = mine.meta[k]; });
      ext.achievements = mergeAchievements(ext.achievements, mine.achievements);
      if (!newerSchema) ext.version = SCHEMA;
      state = ext;
      lastRaw = raw;
      rebaseHistory(changedDays, settingsChanged);
      if (!changedDays.length && !settingsChanged) return null;
      return { type: "external", days: changedDays, settings: settingsChanged, newer: newerSchema };
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
     */
    function rebaseHistory(changedDays, settingsChanged) {
      if (!changedDays.length && !settingsChanged) return;
      [undoStack, redoStack].forEach(function (stack) {
        stack.forEach(function (entry) {
          try {
            var snap = JSON.parse(entry.snap);
            changedDays.forEach(function (iso) {
              if (state.days[iso]) snap.days[iso] = state.days[iso];
              else delete snap.days[iso];
            });
            if (settingsChanged) snap.settings = state.settings;
            entry.snap = JSON.stringify(snap);
          } catch (e) { /* Eintrag bleibt wie er ist */ }
        });
      });
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
      if (evt) emit(evt);
      return !!evt;
    }

    if (options.listen !== false && typeof window !== "undefined" && window.addEventListener && !backend.volatile) {
      window.addEventListener("storage", function (e) {
        if (e.key === KEY) syncExternal(e.newValue);
      });
    }

    function emit(evt) {
      listeners.forEach(function (fn) {
        try { fn(evt || { type: "change" }, state); } catch (e) { /* Listener isolieren */ }
      });
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    /* ---- Tage ------------------------------------------------------ */

    function getDay(iso) { return state.days[iso] || null; }

    function getDayOrEmpty(iso) {
      return state.days[iso] || { date: iso, type: null, start: "", end: "", breaks: [], location: "office", note: "", absenceFactor: 1, targetOverride: null };
    }

    function setDay(iso, patch, opts) {
      opts = opts || {};
      pushUndo(opts.label || "day");
      var current = state.days[iso] || { date: iso, breaks: [] };
      var next = Object.assign({}, current, patch, { date: iso, updatedAt: new Date().toISOString() });
      state.days[iso] = next;
      pending.days[iso] = true;
      persist(opts.immediate);
      emit({ type: "day", date: iso });
      return next;
    }

    function deleteDay(iso, opts) {
      if (!state.days[iso]) return false;
      pushUndo((opts && opts.label) || "delete");
      delete state.days[iso];
      pending.days[iso] = true;
      persist();
      emit({ type: "day", date: iso, deleted: true });
      return true;
    }

    function setDays(map, opts) {
      pushUndo((opts && opts.label) || "bulk");
      Object.keys(map).forEach(function (iso) {
        pending.days[iso] = true;
        if (map[iso] === null) delete state.days[iso];
        else state.days[iso] = Object.assign({}, state.days[iso] || { date: iso, breaks: [] }, map[iso], { date: iso, updatedAt: new Date().toISOString() });
      });
      persist();
      emit({ type: "bulk", count: Object.keys(map).length });
    }

    function allDays() { return state.days; }

    function dayCount() { return Object.keys(state.days).length; }

    /* ---- Einstellungen --------------------------------------------- */

    function getSettings() { return state.settings; }

    function updateSettings(patch, opts) {
      pushUndo("settings");
      Object.assign(state.settings, patch);
      Object.keys(patch || {}).forEach(function (k) { pending.settings[k] = true; });
      persist(opts && opts.immediate);
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

    function snapshot() {
      return JSON.stringify({ days: state.days, settings: state.settings });
    }

    function pushUndo(label) {
      try {
        undoStack.push({ label: label, snap: snapshot(), at: Date.now() });
        if (undoStack.length > 40) undoStack.shift();
        redoStack.length = 0;
      } catch (e) { /* Snapshot ist optional */ }
    }

    function applySnapshot(snap) {
      var parsed = JSON.parse(snap);
      // Nur was sich wirklich unterscheidet, gilt als eigene Änderung
      var keys = {};
      Object.keys(state.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(parsed.days).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (iso) {
        if (dayJSON(state.days[iso]) !== dayJSON(parsed.days[iso])) pending.days[iso] = true;
      });
      Object.keys(parsed.settings || {}).forEach(function (k) {
        if (stable(parsed.settings[k]) !== stable(state.settings[k])) pending.settings[k] = true;
      });
      state.days = parsed.days;
      state.settings = parsed.settings;
      persist(true);
      emit({ type: "restore" });
    }

    function undo() {
      if (!undoStack.length) return false;
      var entry = undoStack.pop();
      redoStack.push({ label: entry.label, snap: snapshot() });
      applySnapshot(entry.snap);
      return entry.label;
    }

    function redo() {
      if (!redoStack.length) return false;
      var entry = redoStack.pop();
      undoStack.push({ label: entry.label, snap: snapshot() });
      applySnapshot(entry.snap);
      return entry.label;
    }

    function canUndo() { return undoStack.length > 0; }
    function canRedo() { return redoStack.length > 0; }

    /* ---- Import / Export -------------------------------------------- */

    function exportState() {
      return {
        app: "Zeitkonto",
        schema: SCHEMA,
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        days: state.days,
        achievements: state.achievements,
        meta: { createdAt: state.meta.createdAt }
      };
    }

    /**
     * @param {Object} data  geparster Export
     * @param {String} mode  "replace" | "merge" | "merge-keep"
     */
    function importState(data, mode) {
      if (!data || typeof data !== "object") throw new Error("Ungültige Datei");
      var incomingDays = data.days || (data.state && data.state.days);
      if (!incomingDays || typeof incomingDays !== "object") throw new Error("Keine Tagesdaten gefunden");

      pushUndo("import");
      var added = 0, updated = 0, skipped = 0;

      if (mode === "replace") {
        state.days = {};
        if (data.settings) state.settings = Object.assign(defaults(), data.settings);
        pending.full = true;
      }

      Object.keys(incomingDays).forEach(function (iso) {
        if (!isValidDateKey(iso)) { skipped++; return; }
        var incoming = incomingDays[iso];
        if (!incoming || typeof incoming !== "object") { skipped++; return; }
        incoming.date = iso;
        if (!state.days[iso]) { state.days[iso] = incoming; pending.days[iso] = true; added++; return; }
        if (mode === "merge-keep") { skipped++; return; }
        state.days[iso] = Object.assign({}, state.days[iso], incoming);
        pending.days[iso] = true;
        updated++;
      });

      if (mode === "merge" && data.settings) {
        state.settings = Object.assign(state.settings, data.settings);
        Object.keys(data.settings).forEach(function (k) { pending.settings[k] = true; });
      }
      if (data.achievements && mode !== "merge-keep") {
        state.achievements = Object.assign(state.achievements, data.achievements);
      }

      state = migrate(state);
      persist(true);
      emit({ type: "import" });
      return { added: added, updated: updated, skipped: skipped };
    }

    function reset(keepSettings) {
      pushUndo("reset");
      var keep = keepSettings ? state.settings : null;
      state = blank();
      if (keep) state.settings = keep;
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
     */
    function makeBackup() {
      if (!state || !dayCount()) return false;
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

    function usageBytes() {
      try { return (backend.getItem(KEY) || "").length; } catch (e) { return 0; }
    }

    function diagnostics() {
      return {
        schema: SCHEMA,
        days: dayCount(),
        bytes: usageBytes(),
        volatile: !!backend.volatile,
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
      isNewerSchema: function () { return newerSchema; },
      diagnostics: diagnostics
    };
  }

  return {
    createStore: createStore,
    memoryBackend: memoryBackend,
    isValidDateKey: isValidDateKey,
    SCHEMA: SCHEMA,
    KEY: KEY
  };
});
